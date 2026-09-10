const { chromium } = require('@playwright/test')
const fs = require('fs')
const http = require('http')
const path = require('path')
const root = path.resolve(__dirname, '..')
const bytes = fs.readFileSync(path.join(root, 'videos/ejemplos/hacerlo_sin_audio.mp4'))
const server = http.createServer((req,res) => {
  if (req.url === '/clip.mp4') { res.setHeader('Content-Type','video/mp4'); res.end(bytes) }
  else { res.setHeader('Content-Type','text/html'); res.end('<body style="margin:0;background:#111;color:white"><video muted src="/clip.mp4" preload="auto"></video><canvas></canvas></body>') }
})
;(async () => {
  await new Promise(r => server.listen(0,'127.0.0.1',r))
  const browser = await chromium.launch({headless:true})
  try {
    const page = await browser.newPage({viewport:{width:1200,height:1000}})
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const meta = await page.evaluate(async () => {
      const v=document.querySelector('video')
      if(v.readyState<2) await new Promise(r=>v.addEventListener('loadeddata',r,{once:true}))
      const meta={duration:v.duration,width:v.videoWidth,height:v.videoHeight}
      const c=document.querySelector('canvas'), g=c.getContext('2d')
      const w=400,h=Math.round(w*v.videoHeight/v.videoWidth)
      c.width=w*3;c.height=(h+32)*2
      g.fillStyle='#111';g.fillRect(0,0,c.width,c.height)
      for(let i=0;i<6;i++) {
        const t=Math.max(.01,Math.min(v.duration-.05,v.duration*i/5))
        await new Promise(r=>{v.addEventListener('seeked',r,{once:true});v.currentTime=t})
        const x=(i%3)*w,y=Math.floor(i/3)*(h+32)
        g.drawImage(v,x,y,w,h);g.fillStyle='white';g.font='18px sans-serif';g.fillText(t.toFixed(2)+' s',x+12,y+h+23)
      }
      v.style.display='none'
      return meta
    })
    await page.locator('canvas').screenshot({path:path.join(root,'test-results/visual-reference/video-frames.png')})
    console.log(JSON.stringify(meta))
  } finally {await browser.close(); await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1})

const {chromium}=require('@playwright/test')
;(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:720}})
 await page.setContent('<body style="margin:0"><video width="1280" height="720" muted preload="auto" src="http://localhost:3001/assets/sensei.mp4"></video></body>')
 await page.locator('video').evaluate(v=>v.readyState>=2?Promise.resolve():new Promise(r=>v.addEventListener('loadeddata',r,{once:true})))
 await page.locator('video').screenshot({path:'proposal/assets/sensei-poster.jpg',type:'jpeg',quality:90})
 console.log('Poster extracted from supplied video.')
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1})

// Local review server for the complete compiled app. No administrative proxy.
const http=require('http'),fs=require('fs'),path=require('path')
const root=path.resolve(__dirname,'../frontend/build')
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.wav':'audio/wav','.mp3':'audio/mpeg','.ico':'image/x-icon','.woff2':'font/woff2','.pdf':'application/pdf'}
http.createServer((req,res)=>{
  let pathname
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
  let file=path.resolve(root,'.'+pathname)
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  if(file===root)file=path.join(root,'index.html')
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
    if(path.extname(pathname)){res.writeHead(404);res.end('No encontrado');return}
    file=path.join(root,'index.html')
  }
  if(!fs.existsSync(file)){res.writeHead(503);res.end('Compilando ciberDojo. Recarga en unos momentos.');return}
  const size=fs.statSync(file).size
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream')
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Accept-Ranges','bytes')
  const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  let start=0,end=size-1,status=200
  if(range){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),size-1):size-1
    if(start>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`});res.end();return}
    status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`)
  }
  res.writeHead(status,{'Content-Length':end-start+1})
  if(req.method==='HEAD'){res.end();return}
  const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res)
}).listen(3001,'127.0.0.1',()=>console.log('ciberDojo completo: http://localhost:3001'))

const http = require('http')
const fs = require('fs')
const path = require('path')
const root = __dirname
const bank = path.join(root, '../Banco de preguntas/optimizado/banco_700_preguntas_300_casos.json')
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.mp4':'video/mp4' }
http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost')
  let file = url.pathname === '/bank.json' ? bank : path.resolve(root, '.' + decodeURIComponent(url.pathname))
  if (file !== bank && file !== root && !file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return}
  if (file === root) file = path.join(root,'index.html')
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end('No encontrado');return}
  const size = fs.statSync(file).size
  res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream')
  res.setHeader('Cache-Control','no-cache')
  res.setHeader('Accept-Ranges','bytes')
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  if (range) {
    const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),size-1):size-1
    if(start>=size || end<start){res.writeHead(416);res.end();return}
    res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1})
    fs.createReadStream(file,{start,end}).pipe(res)
  } else {res.setHeader('Content-Length',size);fs.createReadStream(file).pipe(res)}
}).listen(3001,'127.0.0.1',()=>console.log('Propuesta ciberDojo: http://localhost:3001'))

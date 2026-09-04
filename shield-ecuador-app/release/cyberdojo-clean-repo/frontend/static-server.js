const fs = require('fs')
const http = require('http')
const path = require('path')

const root = path.resolve(__dirname, 'build')
const port = Number(process.env.PORT || 3000)

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    })
    res.end(data)
  })
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  let filePath = path.join(root, urlPath)

  if (!filePath.startsWith(root)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (error, stat) => {
    if (!error && stat.isDirectory()) {
      sendFile(res, path.join(filePath, 'index.html'))
      return
    }

    if (!error && stat.isFile()) {
      sendFile(res, filePath)
      return
    }

    sendFile(res, path.join(root, 'index.html'))
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Cyber Dojo static server on http://localhost:${port}`)
})

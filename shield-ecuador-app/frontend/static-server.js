const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

const root = path.resolve(__dirname, 'build')
const port = Number(process.env.PORT || 3000)
const ADMIN_UPSTREAM_HOST = process.env.ADMIN_UPSTREAM_HOST || 'cyberdojo-admin-61855290194.us-central1.run.app'

function proxyToAdmin(req, res, targetPath) {
  const queryIndex = (req.url || '').indexOf('?')
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : ''

  const proxyReq = https.request({
    hostname: ADMIN_UPSTREAM_HOST,
    path: targetPath + query,
    method: req.method,
    headers: { ...req.headers, host: ADMIN_UPSTREAM_HOST },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Admin upstream unavailable')
  })

  req.pipe(proxyReq)
}

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

  if (urlPath === '/admin') {
    const query = (req.url || '').includes('?') ? '?' + req.url.split('?')[1] : ''
    res.writeHead(301, { Location: '/admin/' + query })
    res.end()
    return
  }

  if (urlPath.startsWith('/admin/')) {
    proxyToAdmin(req, res, urlPath.replace(/^\/admin/, '') || '/')
    return
  }

  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    proxyToAdmin(req, res, urlPath)
    return
  }

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

const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const zlib = require('zlib')

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
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}


// Baseline security headers for everything this server serves itself (the
// /admin and /api proxies keep whatever their upstream sends).
// script-src has no 'unsafe-inline': the CRA build ships no inline scripts.
// style-src keeps 'unsafe-inline' because framer-motion/React set style attributes.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
}

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt'])
const compressedCache = new Map()

function cacheControlFor(filePath) {
  const rel = path.relative(root, filePath).split(path.sep).join('/')
  if (rel.endsWith('.html')) return 'no-cache'
  if (rel.startsWith('static/')) return 'public, max-age=31536000, immutable' // content-hashed by CRA
  return 'public, max-age=86400'
}

function pickEncoding(req) {
  const accept = String(req.headers['accept-encoding'] || '')
  if (/\bbr\b/.test(accept)) return 'br'
  if (/\bgzip\b/.test(accept)) return 'gzip'
  return null
}

// iOS Safari refuses to play <video>/<audio> without a real HTTP Range
// response (206 + Content-Range) to its probe request — unlike Chrome/Android,
// which will play from a full 200 response.
function sendFile(req, res, filePath) {
  fs.stat(filePath, (statError, stat) => {
    if (statError) {
      res.writeHead(404, SECURITY_HEADERS)
      res.end('Not found')
      return
    }

    const contentType = contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    const range = req.headers.range
    const match = range && /^bytes=(\d*)-(\d*)$/.exec(range)

    if (match) {
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Number(match[2]) : stat.size - 1

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
        res.writeHead(416, { ...SECURITY_HEADERS, 'Content-Range': `bytes */${stat.size}` })
        res.end()
        return
      }

      res.writeHead(206, {
        ...SECURITY_HEADERS,
        'Cache-Control': cacheControlFor(filePath),
        'Content-Type': contentType,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      })
      fs.createReadStream(filePath, { start, end }).pipe(res)
      return
    }

    const encoding = COMPRESSIBLE.has(path.extname(filePath).toLowerCase()) ? pickEncoding(req) : null
    if (encoding) {
      const key = `${filePath}|${encoding}|${stat.mtimeMs}`
      let body = compressedCache.get(key)
      if (!body) {
        const raw = fs.readFileSync(filePath)
        body = encoding === 'br'
          ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } })
          : zlib.gzipSync(raw, { level: 9 })
        compressedCache.set(key, body)
      }
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Cache-Control': cacheControlFor(filePath),
        'Content-Type': contentType,
        'Content-Encoding': encoding,
        'Content-Length': body.length,
        'Vary': 'Accept-Encoding',
      })
      res.end(body)
      return
    }

    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Cache-Control': cacheControlFor(filePath),
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    })
    fs.createReadStream(filePath).pipe(res)
  })
}

const server = http.createServer((req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  } catch {
    // A malformed %-escape used to throw here and take the whole process down.
    res.writeHead(400, SECURITY_HEADERS)
    res.end('Bad request')
    return
  }

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

  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403, SECURITY_HEADERS)
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (error, stat) => {
    if (!error && stat.isDirectory()) {
      sendFile(req, res, path.join(filePath, 'index.html'))
      return
    }

    if (!error && stat.isFile()) {
      sendFile(req, res, filePath)
      return
    }

    sendFile(req, res, path.join(root, 'index.html'))
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Cyber Dojo static server on http://localhost:${port}`)
})

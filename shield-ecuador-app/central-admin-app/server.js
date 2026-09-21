const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createTpotService, getConfigFromEnv } = require('./tpotService');

const root = __dirname;
const port = Number(process.env.PORT || 3100);
const adminUser = process.env.CENTRAL_ADMIN_USER || '';
const adminPassword = process.env.CENTRAL_ADMIN_PASSWORD || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const tpotService = createTpotService(getConfigFromEnv(process.env));
const rateBuckets = new Map();
const TPOT_RATE_LIMIT_PER_MIN = Number(process.env.TPOT_RATE_LIMIT_PER_MIN) || 80;

// Only these files are public assets of the console. The static handler used to serve anything under this
// directory (server.js, tpotService.js, package.json, *.log …) to any authenticated request.
const STATIC_FILES = new Set(['index.html', 'app.js', 'styles.css', 'cyber-sensei.gif']);
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_FAILED_AUTH = 10; // per client and 10 minutes
const failedAuth = new Map();

// script-src has no 'unsafe-inline': inline event handlers were replaced by data-act delegation (a real XSS sink).
// puter.js is allowed because the news agent loads it on demand; its API calls need connect-src.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://js.puter.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.puter.com wss://*.puter.com https://puter.com",
  "frame-src 'self' https://*.puter.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const LOGGED_OUT_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><title>Sesion cerrada - Ciber Dojo</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#080f1e; color:#EEF2F7; font-family:'Rajdhani',sans-serif; text-align:center; }
  .torii { font-size:48px; color:#C62828; }
  h1 { font-size:28px; margin:8px 0; }
  p { color:#8AA0BB; max-width:420px; margin:0 auto 22px; }
  a { display:inline-block; padding:12px 22px; border:1px solid #00B4D8; color:#00B4D8; text-decoration:none; border-radius:4px; letter-spacing:.08em; }
</style></head>
<body>
  <div>
    <div class="torii">&#9163;</div>
    <h1>Sesion cerrada</h1>
    <p>Cierra esta pestana o ventana del navegador para completar el cierre de sesion. Si vuelves a entrar, el navegador pedira usuario y contrasena de nuevo.</p>
    <a href="/">Volver a iniciar sesion</a>
  </div>
</body></html>`;

const server = http.createServer((req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

  if ((req.url || '/').split('?')[0] === '/logged-out') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(LOGGED_OUT_HTML);
    return;
  }

  if (!adminUser || !adminPassword) {
    res.writeHead(503, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end('Central Admin authentication credentials are not configured on this server.');
    return;
  }

  const client = req.socket.remoteAddress || 'unknown';
  if (!isAuthorized(req)) {
    // Basic auth had no brake: unlimited password guesses. Throttle wrong credentials per client address. A request
    // with no Authorization header is only the browser asking for the challenge, so it is never counted (otherwise
    // ordinary browsing would use up the budget and lock the real administrator out of the challenge itself).
    const now = Date.now();
    const entry = failedAuth.get(client);
    const fresh = entry && now < entry.resetAt ? entry : { count: 0, resetAt: now + 10 * 60 * 1000 };
    if (req.headers.authorization) fresh.count += 1;
    failedAuth.set(client, fresh);
    if (req.headers.authorization && fresh.count > MAX_FAILED_AUTH) {
      res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '600', 'Cache-Control': 'no-store' });
      res.end('Too many failed attempts');
      return;
    }
    res.writeHead(401, {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Ciber Dojo Central Admin"',
      'Cache-Control': 'no-store',
    });
    res.end('Authentication required');
    return;
  }

  if (
    (req.url || '').startsWith('/api/rest/v1/') ||
    (req.url || '').startsWith('/api/auth/v1/') ||
    (req.url || '').startsWith('/api/storage/v1/') ||
    (req.url || '').startsWith('/api/functions/v1/')
  ) {
    proxySupabase(req, res);
    return;
  }

  if ((req.url || '').startsWith('/api/admin/tpot')) {
    handleTpotApi(req, res);
    return;
  }

  if ((req.url || '').startsWith('/api/whoami')) {
    sendJson(res, 200, { actor: adminUser || 'central-admin' });
    return;
  }

  let rawPath;
  try {
    rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    // A malformed escape such as /%E0%A4%A (or a stray %) used to throw here and take the whole process down.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }
  const requestedPath = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  if (!STATIC_FILES.has(requestedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const filePath = path.join(root, requestedPath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Central Admin listening on http://0.0.0.0:${port}`);
});

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;

  const encoded = header.slice('Basic '.length);
  let decoded = '';
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return false;

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const userBuf = Buffer.from(user);
  const adminUserBuf = Buffer.from(adminUser);
  const passBuf = Buffer.from(password);
  const adminPassBuf = Buffer.from(adminPassword);

  const userMatch = userBuf.length === adminUserBuf.length &&
    crypto.timingSafeEqual(userBuf, adminUserBuf);
  const passMatch = passBuf.length === adminPassBuf.length &&
    crypto.timingSafeEqual(passBuf, adminPassBuf);

  return userMatch && passMatch;
}

async function proxySupabase(req, res) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Admin backend is not configured' }));
    return;
  }

  const originalUrl = req.url || '';
  const targetPath = originalUrl.replace(/^\/api/, '');
  const targetUrl = `${supabaseUrl}${targetPath}`;
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
    res.end(JSON.stringify({ error: 'Request body too large' }));
    return;
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        'Content-Type': req.headers['content-type'] || 'application/json',
        Prefer: req.headers.prefer || '',
      },
      body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
    });

    const responseBody = Buffer.from(await response.arrayBuffer());
    const headers = {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    };
    const contentRange = response.headers.get('content-range'); // PostgREST exact counts (Prefer: count=exact)
    if (contentRange) headers['Content-Range'] = contentRange;
    res.writeHead(response.status, headers);
    res.end(responseBody);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Supabase proxy failed' }));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Keep draining (without storing) so the client can still receive the 413 instead of a reset connection.
        if (!rejected) { rejected = true; chunks.length = 0; reject(new Error('Body too large')); }
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Without TPOT_* endpoints the service answers with built-in DEMO events. The console must be able to say so.
const tpotDemo = !process.env.TPOT_ELASTIC_URL && !process.env.TPOT_API_BASE_URL;

async function handleTpotApi(req, res) {
  res.setHeader('X-Tpot-Data-Mode', tpotDemo ? 'demo' : 'live');
  if (!rateLimit(req)) {
    sendJson(res, 429, { error: 'Too many requests' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathName = url.pathname.replace(/^\/api\/admin\/tpot/, '') || '/';
  const actor = adminUser || 'central-admin';

  try {
    if (req.method === 'GET' && pathName === '/health') return sendJson(res, 200, await tpotService.getHealth());
    if (req.method === 'GET' && pathName === '/summary') return sendJson(res, 200, await tpotService.getSummary(Object.fromEntries(url.searchParams), actor));
    if (req.method === 'GET' && pathName === '/logs') return sendJson(res, 200, await tpotService.getLogs(Object.fromEntries(url.searchParams), actor));
    if (req.method === 'GET' && pathName === '/reports') return sendJson(res, 200, await tpotService.getReport(Object.fromEntries(url.searchParams), actor));
    if (req.method === 'GET' && pathName === '/iocs') return sendJson(res, 200, await tpotService.getIocs(Object.fromEntries(url.searchParams), actor));
    if (req.method === 'GET' && pathName === '/audit-log') return sendJson(res, 200, { audit: await tpotService.getAuditLog(), jobs: await tpotService.getAiAnalysisJobs() });
    if (req.method === 'GET' && pathName === '/settings') return sendJson(res, 200, await tpotService.getSettings());
    if (req.method === 'PUT' && pathName === '/settings') return sendJson(res, 200, await tpotService.updateSettings(await readJson(req), actor));
    if (req.method === 'POST' && pathName === '/ai-analysis') {
      const body = await readJson(req);
      return sendJson(res, 202, await tpotService.createAiAnalysisJob(body.filters || {}, body.options || {}, actor));
    }

    const jobMatch = pathName.match(/^\/ai-analysis\/([^/]+)(?:\/(audit|approve|reject))?$/);
    if (jobMatch && req.method === 'GET' && !jobMatch[2]) {
      const job = await tpotService.getAiAnalysisJob(jobMatch[1]);
      return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'Job not found' });
    }
    // audit / approve / reject answer null for an unknown id: that is a 404, not "200 null"
    const found = (result) => (result ? sendJson(res, 200, result) : sendJson(res, 404, { error: 'Job not found' }));
    if (jobMatch && req.method === 'POST' && jobMatch[2] === 'audit') return found(await tpotService.auditAiAnalysis(jobMatch[1], actor));
    if (jobMatch && req.method === 'POST' && jobMatch[2] === 'approve') return found(await tpotService.approveAiAnalysis(jobMatch[1], actor));
    if (jobMatch && req.method === 'POST' && jobMatch[2] === 'reject') {
      const body = await readJson(req);
      return found(await tpotService.rejectAiAnalysis(jobMatch[1], String(body.reason || 'Rechazado').slice(0, 500), actor));
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    // Business-rule refusals (409) carry a message meant for the administrator; everything else stays generic.
    if (error && error.status === 409) return sendJson(res, 409, { error: error.message });
    sendJson(res, 500, { error: 'T-Pot integration request failed' });
  }
}

function rateLimit(req) {
  const key = `${req.socket.remoteAddress || 'unknown'}:${(req.url || '').split('?')[0]}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + 60000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60000;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= TPOT_RATE_LIMIT_PER_MIN;
}

async function readJson(req) {
  const body = await readBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return {};
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createTpotService, getConfigFromEnv } = require('./tpotService');

const root = __dirname;
const port = Number(process.env.PORT || 3100);
const adminUser = process.env.CENTRAL_ADMIN_USER || '';
const adminPassword = process.env.CENTRAL_ADMIN_PASSWORD || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const tpotService = createTpotService(getConfigFromEnv(process.env));
const rateBuckets = new Map();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (adminUser && adminPassword && !isAuthorized(req)) {
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
    (req.url || '').startsWith('/api/storage/v1/')
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

  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = safePath === '/' || safePath === '\\' ? 'index.html' : safePath.replace(/^[/\\]+/, '');
  const filePath = path.join(root, requestedPath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

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
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return false;

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return user === adminUser && password === adminPassword;
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
  const body = await readBody(req);

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
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(responseBody);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Supabase proxy failed' }));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleTpotApi(req, res) {
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
    if (jobMatch && req.method === 'POST' && jobMatch[2] === 'audit') return sendJson(res, 200, await tpotService.auditAiAnalysis(jobMatch[1], actor));
    if (jobMatch && req.method === 'POST' && jobMatch[2] === 'approve') return sendJson(res, 200, await tpotService.approveAiAnalysis(jobMatch[1], actor));
    if (jobMatch && req.method === 'POST' && jobMatch[2] === 'reject') {
      const body = await readJson(req);
      return sendJson(res, 200, await tpotService.rejectAiAnalysis(jobMatch[1], body.reason || 'Rechazado', actor));
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch {
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
  return bucket.count <= 80;
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

'use strict';
// Enrutador HTTP mínimo (sin dependencias)
const fs = require('fs');
const path = require('path');
const { AppError } = require('./util');

const routes = [];
function add(method, pattern, ...handlers) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handlers });
}
const router = {
  get: (p, ...h) => add('GET', p, ...h),
  post: (p, ...h) => add('POST', p, ...h),
  put: (p, ...h) => add('PUT', p, ...h),
  del: (p, ...h) => add('DELETE', p, ...h),
};

function send(res, status, data, headers = {}) {
  const isStr = typeof data === 'string' || Buffer.isBuffer(data);
  res.writeHead(status, {
    'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isStr ? data : JSON.stringify(data));
}

function readBody(req, limit = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new AppError(413, 'Archivo demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new AppError(400, 'JSON inválido')); }
    });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

function serveStatic(req, res, root) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) return send(res, 403, 'Prohibido');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA: cualquier ruta desconocida devuelve index.html
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return fs.createReadStream(path.join(root, 'index.html')).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

async function handle(req, res, publicDir) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
    return serveStatic(req, res, publicDir);
  }
  const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
  if (!route) return send(res, 404, { error: 'Ruta no encontrada' });
  const m = url.pathname.match(route.re);
  req.params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  req.query = Object.fromEntries(url.searchParams);
  try {
    req.body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};
    let result;
    for (const h of route.handlers) {
      result = await h(req, res);
      if (res.writableEnded) return;
    }
    if (result && result.__raw) return send(res, 200, result.body, result.headers);
    send(res, 200, result === undefined ? { ok: true } : result);
  } catch (err) {
    if (err instanceof AppError) return send(res, err.status, { error: err.message });
    console.error(new Date().toISOString(), req.method, url.pathname, err);
    send(res, 500, { error: 'Error interno. Intente nuevamente.' });
  }
}

module.exports = { router, handle, send };

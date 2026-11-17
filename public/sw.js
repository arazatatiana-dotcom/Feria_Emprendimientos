/*
 * Service worker mínimo: permite instalar la app en el celular.
 * No guarda copias de la app (así nunca se queda con una versión vieja) ni toca las llamadas /api.
 * Solo, si se abre la app sin internet, muestra una página amable en vez del error del navegador.
 */
'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión · Feria</title><style>body{font-family:system-ui,sans-serif;background:#f6f4ef;color:#1d2721;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}
.c{background:#fff;border-radius:18px;padding:28px 22px;max-width:360px;box-shadow:0 4px 14px rgba(0,0,0,.08)}h1{font-size:22px;margin:10px 0 6px}p{font-size:17px;line-height:1.45;color:#4f5b54}
button{margin-top:14px;width:100%;min-height:52px;border:0;border-radius:12px;background:#1f5f3f;color:#fff;font-size:17px;font-weight:600}</style></head>
<body><div class="c"><div style="font-size:48px">📶</div><h1>Sin conexión</h1><p>Tu celular no tiene internet en este momento. Revisa el Wi-Fi o los datos y vuelve a intentar.</p>
<button onclick="location.reload()">Intentar de nuevo</button></div></body></html>`;

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // archivos y /api: los maneja el navegador normalmente
  e.respondWith(fetch(e.request).catch(() => new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

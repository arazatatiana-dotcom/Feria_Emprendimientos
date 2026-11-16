/*
 * Modo demostración para GitHub Pages (o cualquier hosting estático).
 *
 * Ejecuta en el navegador el MISMO código del servidor (src/*.js) con SQLite en WebAssembly
 * (sql.js). Las llamadas a /api/... de la interfaz se responden aquí, sin servidor.
 * Los datos se guardan solo en este navegador (localStorage); no se comparten entre equipos
 * y no se envían correos. Sirve para mostrar el sistema, NO para el evento real.
 *
 * Se activa en *.github.io o agregando ?demo a la dirección. En el servidor real no hace nada.
 */
'use strict';
(function () {
  const params = new URLSearchParams(location.search);
  const DEMO = location.hostname.endsWith('.github.io') || params.has('demo');
  if (!DEMO) return;

  const STORE_KEY = 'feria_demo_db_v1';
  const BASE = new URL('../../', document.currentScript.src).href; // raíz del repositorio (public/demo/ → ../../)
  const CDN = {
    sqljs: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/',
    pako: 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  };
  const FILES = ['src/config.js', 'src/util.js', 'src/db.js', 'src/http.js', 'src/mailer.js', 'src/xlsx.js',
    'src/ventas.js', 'src/api.js', 'scripts/demo.js', 'db/schema.sqlite.sql'];

  // ================= SHA-256 / HMAC (síncrono, para reemplazar crypto de Node) =================
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb,
    0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f,
    0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(bytes) {
    const len = bytes.length, total = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(total); m.set(bytes); m[len] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(len / 0x20000000)); dv.setUint32(total - 4, (len << 3) >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < total; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rot(W[i - 15], 7) ^ rot(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rot(W[i - 2], 17) ^ rot(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32), odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
    return out;
  }
  function hmac256(key, msg) {
    let k = key.length > 64 ? sha256(key) : key;
    const kp = new Uint8Array(64); kp.set(k);
    const ip = kp.map(b => b ^ 0x36), op = kp.map(b => b ^ 0x5c);
    const inner = new Uint8Array(64 + msg.length); inner.set(ip); inner.set(msg, 64);
    const ih = sha256(inner);
    const outer = new Uint8Array(96); outer.set(op); outer.set(ih, 64);
    return sha256(outer);
  }

  // ================= Buffer mínimo (lo que usa el código del servidor) =================
  const enc = new TextEncoder(), dec = new TextDecoder();
  class Buf extends Uint8Array {
    static from(v, encoding) {
      if (typeof v === 'string') {
        if (encoding === 'hex') { const b = new Buf(v.length >> 1); for (let i = 0; i < b.length; i++) b[i] = parseInt(v.substr(i * 2, 2), 16); return b; }
        if (encoding === 'base64' || encoding === 'base64url') {
          let s = v.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''); while (s.length % 4) s += '=';
          const bin = atob(s); const b = new Buf(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b;
        }
        const u = enc.encode(v); const b = new Buf(u.length); b.set(u); return b;
      }
      const src = v instanceof ArrayBuffer ? new Uint8Array(v) : v;
      const b = new Buf(src.length); b.set(src); return b;
    }
    static isBuffer(x) { return x instanceof Buf; }
    static concat(list) {
      const b = new Buf(list.reduce((a, x) => a + x.length, 0)); let o = 0;
      for (const x of list) { b.set(x, o); o += x.length; } return b;
    }
    toString(encoding = 'utf8', start = 0, end = this.length) {
      const s = this.subarray(start, end);
      if (encoding === 'hex') return Array.from(s, x => x.toString(16).padStart(2, '0')).join('');
      if (encoding === 'base64' || encoding === 'base64url') {
        let bin = ''; for (let i = 0; i < s.length; i += 0x8000) bin += String.fromCharCode.apply(null, s.subarray(i, i + 0x8000));
        const b64 = btoa(bin);
        return encoding === 'base64' ? b64 : b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
      return dec.decode(s);
    }
    readUInt16LE(i) { return this[i] | (this[i + 1] << 8); }
    readUInt32LE(i) { return (this[i] | (this[i + 1] << 8) | (this[i + 2] << 16)) + this[i + 3] * 0x1000000; }
  }
  const toBytes = (x) => typeof x === 'string' ? enc.encode(x) : x;

  // ================= Módulos de Node simulados =================
  const SRC = {};
  let SQL = null;
  const persist = { inTx: false, timer: null, db: null };
  function saveSoon() {
    clearTimeout(persist.timer);
    persist.timer = setTimeout(() => {
      if (!persist.db) return;
      if (persist.inTx) return saveSoon();
      try { localStorage.setItem(STORE_KEY, Buf.from(persist.db.export()).toString('base64')); } catch (e) { console.warn('demo: no se pudo guardar', e); }
    }, 250);
  }
  function loadSaved() {
    try { const s = localStorage.getItem(STORE_KEY); return s ? Buf.from(s, 'base64') : null; } catch (_) { return null; }
  }

  // node:sqlite (DatabaseSync) sobre sql.js
  function makeSqliteShim(initialBytes, { autosave }) {
    class DatabaseSync {
      constructor() {
        this.db = new SQL.Database(initialBytes || undefined);
        if (autosave) persist.db = this.db;
      }
      exec(sql) {
        if (/^\s*BEGIN/i.test(sql)) persist.inTx = true;
        this.db.exec(sql);
        if (/^\s*(COMMIT|ROLLBACK)/i.test(sql)) persist.inTx = false;
        if (autosave) saveSoon();
      }
      prepare(sql) {
        const db = this.db;
        const conv = (p = {}) => Object.fromEntries(Object.entries(p).map(([k, v]) => ['@' + k, v]));
        return {
          all(p) {
            const st = db.prepare(sql); st.bind(conv(p));
            const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out;
          },
          run(p) {
            db.run(sql, conv(p));
            const changes = db.getRowsModified();
            const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
            if (autosave) saveSoon();
            return { changes, lastInsertRowid };
          },
        };
      }
      close() { if (this.onClose) this.onClose(this.db); }
    }
    return { DatabaseSync };
  }

  const pathShim = {
    join: (...a) => normalize(a.join('/')),
    dirname: (p) => p.split('/').slice(0, -1).join('/'),
    extname: (p) => (p.match(/\.[^./]*$/) || [''])[0],
    normalize: (p) => normalize(p),
  };
  function normalize(p) {
    const out = [];
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') out.pop(); else out.push(seg);
    }
    return out.join('/');
  }
  const fsShim = {
    existsSync: () => false,
    mkdirSync: () => {},
    unlinkSync: () => {},
    readFileSync: (p) => { const k = normalize(p); if (k in SRC) return SRC[k]; throw new Error('Archivo no disponible en la demo: ' + p); },
    stat: (p, cb) => cb(new Error('no disponible')),
  };
  const cryptoShim = {
    randomBytes: (n) => { const b = new Buf(n); crypto.getRandomValues(b); return b; },
    randomInt: (min, max) => { const r = new Uint32Array(1); crypto.getRandomValues(r); return min + (r[0] % (max - min)); },
    // En la demo, scrypt se reemplaza por SHA-256 con sal (rápido; los datos son ficticios)
    scryptSync: (plain, salt) => Buf.from(sha256(toBytes(String(salt) + ':' + String(plain)))),
    createHmac: (_alg, key) => {
      let data = '';
      return { update(s) { data += s; return this; }, digest(encoding) { return Buf.from(hmac256(toBytes(String(key)), toBytes(data))).toString(encoding); } };
    },
    timingSafeEqual: (a, b) => { if (a.length !== b.length) throw new RangeError('distinto largo'); let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; },
  };
  const zlibShim = { inflateRawSync: (data) => Buf.from(window.pako.inflateRaw(data)) };
  const processShim = { env: { DB_DRIVER: 'sqlite', APP_SECRET: 'demo-github-pages-sin-secretos-reales' } };

  // ================= Cargador CommonJS =================
  function makeRegistry(builtins) {
    const cache = {};
    function load(p) {
      if (cache[p]) return cache[p].exports;
      if (!(p in SRC)) throw new Error('Módulo no disponible en la demo: ' + p);
      const module = { exports: {} }; cache[p] = module;
      const dir = pathShim.dirname(p);
      const req = (r) => {
        if (r in builtins) return builtins[r];
        if (r.startsWith('.')) { let q = normalize(dir + '/' + r); if (!q.endsWith('.js')) q += '.js'; return load(q); }
        throw new Error(`Cannot find module '${r}'`);
      };
      // eslint-disable-next-line no-new-func
      new Function('require', 'module', 'exports', '__dirname', '__filename', 'process', 'Buffer', SRC[p] + '\n//# sourceURL=' + BASE + p)(
        req, module, module.exports, dir, p, processShim, Buf);
      return module.exports;
    }
    return load;
  }
  const baseBuiltins = (sqlite) => ({ fs: fsShim, path: pathShim, crypto: cryptoShim, zlib: zlibShim, 'node:sqlite': sqlite });

  // ================= Arranque =================
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });

  async function seed() {
    // Ejecuta scripts/demo.js tal cual, en un registro aparte, y devuelve la base resultante
    return new Promise((resolve, reject) => {
      const sqlite = makeSqliteShim(null, { autosave: false });
      const Orig = sqlite.DatabaseSync;
      sqlite.DatabaseSync = class extends Orig { constructor(f) { super(f); this.onClose = (db) => resolve(db.export()); } };
      const load = makeRegistry(baseBuiltins(sqlite));
      try { load('scripts/demo.js'); } catch (e) { reject(e); }
      setTimeout(() => reject(new Error('Los datos de demostración tardaron demasiado')), 20000);
    });
  }

  let backend = null;
  const ready = (async () => {
    await Promise.all([
      loadScript(CDN.sqljs + 'sql-wasm.js'),
      loadScript(CDN.pako),
      ...FILES.map(async (f) => {
        const r = await fetch(BASE + f, { cache: 'no-cache' });
        if (!r.ok) throw new Error('No se pudo cargar ' + f);
        SRC[f] = await r.text();
      }),
    ]);
    SQL = await window.initSqlJs({ locateFile: (f) => CDN.sqljs + f });
    let bytes = loadSaved();
    if (!bytes) { bytes = await seed(); }
    const load = makeRegistry(baseBuiltins(makeSqliteShim(bytes, { autosave: true })));
    const DB = load('src/db.js');
    await DB.init();
    const http = load('src/http.js');
    load('src/api.js');
    const V = load('src/ventas.js');
    saveSoon();
    // Tareas automáticas (vencimientos), como en server.js
    const tick = () => V.tareasProgramadas().catch((e) => console.error('tareas', e));
    setInterval(tick, 30e3); setTimeout(tick, 2e3);
    backend = { http };
  })();
  ready.catch((e) => { console.error(e); showBanner('No se pudo iniciar la demostración: ' + e.message, true); });

  function dispatch(method, url, headers, bodyText) {
    return new Promise((resolve) => {
      const listeners = {};
      const emit = (ev, arg) => (listeners[ev] || []).forEach(cb => cb(arg));
      const req = { method, url, headers, on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return req; }, destroy() {} };
      const res = {
        writableEnded: false, status: 200, headers: {},
        writeHead(s, h) { this.status = s; this.headers = h || {}; },
        end(data) { this.writableEnded = true; resolve(new Response(data === undefined ? '' : data, { status: this.status, headers: this.headers })); },
      };
      backend.http.handle(req, res, '');
      setTimeout(() => { if (bodyText) emit('data', Buf.from(bodyText)); emit('end'); }, 0);
    });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    try { await ready; } catch (e) { return new Response(JSON.stringify({ error: 'Demo no disponible: ' + e.message }), { status: 503 }); }
    const headers = {};
    Object.entries(init.headers || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
    return dispatch((init.method || 'GET').toUpperCase(), url, headers, typeof init.body === 'string' ? init.body : '');
  };

  // ================= Aviso visible =================
  function showBanner(html, error) {
    const put = () => {
      let b = document.getElementById('demo-banner');
      if (!b) {
        b = document.createElement('div'); b.id = 'demo-banner';
        b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:8px 12px;font:13px/1.4 system-ui,sans-serif;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.15)';
        document.body.appendChild(b);
        document.body.style.paddingBottom = '64px';
      }
      b.style.background = error ? '#7f1d1d' : '#fef3c7'; b.style.color = error ? '#fff' : '#78350f';
      b.innerHTML = html;
      const r = b.querySelector('#demo-reset');
      if (r) r.onclick = () => {
        if (!confirm('¿Borrar los datos de esta demostración y empezar de nuevo?')) return;
        try { localStorage.removeItem(STORE_KEY); localStorage.removeItem('feria_token'); } catch (_) { /* sin almacenamiento */ }
        location.hash = ''; location.reload();
      };
      const x = b.querySelector('#demo-hide');
      if (x) x.onclick = () => { b.remove(); document.body.style.paddingBottom = ''; };
    };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
  showBanner(`<strong>Demostración</strong>: los datos se guardan solo en este navegador y no se envían correos.
    Usuarios (clave <code>demo123</code>, PIN <code>2580</code>): super admin <code>0000000000</code> ·
    emprendedora <code>0102030405</code> · comprador <code>1700000000</code>.
    <button id="demo-reset" style="margin-left:6px;cursor:pointer">Reiniciar demo</button>
    <button id="demo-hide" aria-label="Ocultar aviso" style="margin-left:4px;cursor:pointer">×</button>`);
})();

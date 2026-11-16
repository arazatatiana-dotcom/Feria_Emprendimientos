/* Feria de Emprendedores — interfaz web (sin dependencias) */
'use strict';
(function () {
  // ================= Utilidades =================
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const c2 = (n) => Math.round(Number(n || 0) * 100);
  const m2 = (c) => Math.round(c) / 100;
  const fmt = (n) => '$' + Number(n || 0).toFixed(2);
  const fdate = (iso, opts) => iso ? new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', ...opts }) : '';
  const ftime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' }) : '';
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const FORMA = { saldo: 'Saldo', efectivo: 'Efectivo', transferencia: 'Transferencia' };

  const I = {
    cart: '<path d="M6 7h15l-1.5 9h-12z"/><path d="M6 7 5 3H2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    store: '<path d="M4 9h16l-1-5H5zM4 9v11h16V9"/><path d="M9 20v-6h6v6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
    truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="m3 3 18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    wifiOff: '<path d="m2 2 20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.4-2.6M22 8.8A15 15 0 0 0 12 5c-.7 0-1.4 0-2 .1M12 20h.01"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  };
  // Forma de pago → icono, y categoría → emoji (para reconocerlas de un vistazo)
  const FORMA_IC = { saldo: 'wallet', efectivo: 'cash', transferencia: 'phone' };
  const CAT_EMOJI = [[/comida|almuerzo|snack|plato/i, '🍲'], [/postre|dulce|reposter|pan/i, '🧁'], [/bebida|jugo|caf[eé]|t[eé]\b/i, '🥤'],
    [/artesan/i, '🧶'], [/ropa|accesorio|moda|bisuter/i, '👕'], [/belleza|cuidado|cosm/i, '🧴'], [/hogar|deco/i, '🏠'],
    [/planta|jard|flor/i, '🌱'], [/libro|papeler/i, '📚'], [/tecno|electr/i, '💻'], [/mascota/i, '🐾'], [/juguet|niñ/i, '🧸']];
  const catEmoji = (c) => (CAT_EMOJI.find(([r]) => r.test(c || '')) || [null, '🛍️'])[1];
  const icon = (n, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, err ? 4500 : 2600);
  }

  // ================= API =================
  const S = { token: localStorage.getItem('feria_token'), me: null, tab: null, cache: {} };
  async function api(method, path, body) {
    let r;
    try {
      r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (_) {
      // Wi-Fi caído: las ventas llevan una clave única, así que reintentar no las duplica
      throw new Error('Sin conexión con el servidor. Revisa el Wi-Fi e intenta de nuevo.');
    }
    let j = null;
    try { j = await r.json(); } catch (_) { /* vacío */ }
    if (r.status === 401 && path !== '/api/login') { logout(); throw new Error(j?.error || 'Sesión expirada'); }
    if (!r.ok) throw new Error(j?.error || 'Error de conexión');
    return j;
  }
  async function guard(btn, fn) {
    if (btn && btn.disabled) return;
    const html = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try { return await fn(); }
    catch (e) { toast(e.message, true); }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
  }
  async function download(path, filename, btn) {
    await guard(btn, async () => {
      const r = await fetch(path, { headers: { Authorization: 'Bearer ' + S.token } });
      if (!r.ok) throw new Error('No se pudo descargar');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  // ================= Modal =================
  function modal(title, body, { wide } = {}) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-bg" data-close><div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="max-width:720px"' : ''}>
      <div class="mh"><h2>${title}</h2><button class="x" data-close aria-label="Cerrar">×</button></div><div id="mbody">${body}</div></div></div>`;
    root.querySelector('.modal-bg').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeModal(); });
    return $('#mbody');
  }
  const closeModal = () => { $('#modal-root').innerHTML = ''; };
  function ask(title, html, okLabel = 'Aceptar', danger) {
    return new Promise((res) => {
      const b = modal(title, `${html}<div class="btns" style="margin-top:16px"><button class="btn grow" id="q-no">Cancelar</button><button class="btn grow ${danger ? 'danger solid' : 'primary'}" id="q-ok">${okLabel}</button></div>`);
      $('#q-no', b).onclick = () => { closeModal(); res(null); };
      $('#q-ok', b).onclick = () => { const vals = {}; b.querySelectorAll('[name]').forEach(i => { vals[i.name] = i.type === 'checkbox' ? i.checked : i.value; }); res(vals); };
      const f = b.querySelector('input,textarea'); if (f) setTimeout(() => f.focus(), 50);
    });
  }

  // ================= Sesión =================
  function saveToken(t) { if (t) { S.token = t; localStorage.setItem('feria_token', t); } }
  function logout() { S.token = null; S.me = null; localStorage.removeItem('feria_token'); closeModal(); renderLogin(); }
  async function loadMe() { S.me = await api('GET', '/api/me'); return S.me; }

  // Campo de contraseña con botón para mostrarla (en el celular es fácil equivocarse al escribir)
  const pwField = (name, ac, min) => `<div class="pw"><input class="input" name="${name}" type="password" autocomplete="${ac}" ${min ? `minlength="${min}"` : ''} required>
    <button type="button" class="pw-eye" aria-label="Mostrar contraseña" title="Mostrar contraseña">${icon('eye', 20)}</button></div>`;
  function bindPwToggles(root) {
    root.querySelectorAll('.pw-eye').forEach(b => { b.onclick = () => {
      const inp = b.previousElementSibling, ver = inp.type === 'password';
      inp.type = ver ? 'text' : 'password';
      b.innerHTML = icon(ver ? 'eyeOff' : 'eye', 20);
      b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    }; });
  }

  // Aviso fijo cuando el equipo pierde el Wi-Fi: la gente sabe por qué no funciona y que no perdió nada
  function netBar() {
    let b = $('#net');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'net'; b.className = 'net-bar'; b.setAttribute('role', 'status');
      b.innerHTML = `${icon('wifiOff', 18)}<span>Sin conexión. No se perdió nada: espera a que vuelva el Wi-Fi y vuelve a intentar.</span>`;
      document.body.appendChild(b);
    }
  }
  window.addEventListener('offline', netBar);
  window.addEventListener('online', () => { netBar(); toast('Conexión restablecida'); });

  function renderLogin() {
    document.title = 'Ingresar · Feria de Emprendedores';
    $('#app').innerHTML = `<div class="login"><form class="card stack" id="f-login" autocomplete="on">
      <img src="icon.svg" class="logo" alt="">
      <div><h1>Feria de Emprendedores</h1><p class="muted small" style="margin:4px 0 0">Ingresa con tu cédula y contraseña</p></div>
      <label class="field"><span>Cédula</span><div class="input-ic">${icon('user', 18)}<input class="input" name="cedula" inputmode="numeric" autocomplete="username" placeholder="Tu número de cédula" required></div></label>
      <label class="field"><span>Contraseña</span>${pwField('clave', 'current-password')}</label>
      <button class="btn primary block lg" type="submit">Ingresar</button>
      <p class="tiny muted center" style="margin:6px 0 0">¿Olvidaste tu contraseña? Acércate a la <strong>mesa de ayuda</strong> del evento.<br>Es la misma cédula con la que te registraron.</p>
    </form></div>`;
    bindPwToggles($('#f-login'));
    $('#f-login').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      guard(f.querySelector('button'), async () => {
        const r = await api('POST', '/api/login', { cedula: f.cedula.value.trim(), clave: f.clave.value });
        S.token = r.token; localStorage.setItem('feria_token', r.token);
        await start();
      });
    };
  }

  function renderForceChange() {
    $('#app').innerHTML = `<div class="login"><form class="card stack" id="f-pw">
      <div><h2>Crea tu contraseña</h2><p class="muted small" style="margin:6px 0 0">Hola ${esc(S.me.nombres)}. Por seguridad, cambia la contraseña temporal antes de continuar.</p></div>
      <label class="field"><span>Contraseña actual (la temporal que recibiste)</span>${pwField('actual', 'current-password')}</label>
      <label class="field"><span>Nueva contraseña (mínimo 6 caracteres)</span>${pwField('nueva', 'new-password', 6)}</label>
      <label class="field"><span>Repite la nueva contraseña</span>${pwField('rep', 'new-password', 6)}</label>
      <p class="tiny muted" style="margin:0">Elige una que recuerdes y que no uses en otros lugares.</p>
      <button class="btn primary block lg">Guardar y continuar</button>
      <button class="btn ghost block" type="button" id="b-out">Salir</button></form></div>`;
    $('#b-out').onclick = logout;
    bindPwToggles($('#f-pw'));
    $('#f-pw').onsubmit = (e) => {
      e.preventDefault(); const f = e.target;
      if (f.nueva.value !== f.rep.value) return toast('Las contraseñas no coinciden', true);
      guard(f.querySelector('button'), async () => {
        const r = await api('POST', '/api/me/clave', { actual: f.actual.value, nueva: f.nueva.value });
        saveToken(r.token); toast('Contraseña actualizada'); await start();
      });
    };
  }

  // ================= Shell / navegación =================
  function tabs() {
    const me = S.me, t = [];
    const isAdmin = ['admin', 'superadmin'].includes(me.rol);
    if (me.emprendimiento) t.push(['vender', 'Vender', 'cart'], ['ventas', 'Ventas', 'receipt'], ['productos', 'Productos', 'box']);
    if (isAdmin) t.push(['panel', 'Panel', 'chart'], ['aventas', 'Ventas', 'list'], ['reportes', 'Reportes', 'file']);
    if (me.rol === 'superadmin') t.push(['usuarios', 'Usuarios', 'users'], ['ajustes', 'Ajustes', 'gear']);
    if (me.es_comprador) t.push(['inicio', me.emprendimiento || isAdmin ? 'Compras' : 'Inicio', 'home'], ['catalogo', 'Catálogo', 'store']);
    if (t.length < 5) t.push(['cuenta', 'Mi cuenta', 'user']);
    return t;
  }
  // Roles de la persona que inició sesión (puede tener varios: p. ej. emprendedor y comprador)
  function rolesDe(me) {
    const r = [];
    if (me.rol === 'superadmin') r.push(['super', 'Super admin']);
    if (me.rol === 'admin') r.push(['admin', 'Administrador']);
    if (me.emprendimiento) r.push(['emp', 'Emprendedor']);
    if (me.es_comprador) r.push(['comp', 'Comprador']);
    return r;
  }
  const roleTags = (me) => rolesDe(me).map(([k, l]) => `<span class="role-tag r-${k}">${l}</span>`).join('');
  function renderShell() {
    const me = S.me;
    const nombre = `${me.nombres} ${me.apellidos}`.trim();
    document.title = me.evento.nombre;
    const sub = me.emprendimiento ? `${nombre} · ${me.emprendimiento.nombre_comercial}` : nombre;
    $('#app').innerHTML = `<header class="topbar"><div class="grow" style="min-width:0"><div class="title">${esc(me.evento.nombre)}</div>
        <div class="who"><span class="sub">${esc(sub)}</span>${roleTags(me)}</div></div>
      <button class="avatar help-btn" id="b-help" title="¿Cómo funciona?" aria-label="Ayuda: cómo funciona">${icon('help', 22)}</button>
      <button class="avatar" id="b-me" title="Mi cuenta · ${esc(rolesDe(me).map(r => r[1]).join(', '))}">${esc(initials(nombre))}</button></header>
      <div class="shell"><nav class="nav" id="nav"></nav><main id="main"></main></div>`;
    $('#b-me').onclick = () => go('cuenta');
    $('#b-help').onclick = showHelp;
    renderNav();
    // La primera vez que alguien entra, se le muestra la ayuda de su rol (una sola vez por equipo)
    try {
      const k = 'feria_ayuda_' + rolesDe(me).map(r => r[0]).join('_');
      if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); setTimeout(showHelp, 400); }
    } catch (_) { /* sin almacenamiento: no pasa nada */ }
  }
  function renderNav() {
    $('#nav').innerHTML = tabs().map(([k, l, ic]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${icon(ic)}<span>${l}</span>${k === 'inicio' && S.me.por_confirmar ? `<span class="badge b-dot">${S.me.por_confirmar}</span>` : ''}</button>`).join('');
    $('#nav').querySelectorAll('button').forEach(b => { b.onclick = () => go(b.dataset.tab); });
  }
  function go(tab) {
    S.tab = tab; history.replaceState(null, '', '#' + tab);
    renderNav(); window.scrollTo(0, 0);
    const main = $('#main');
    main.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
    (VIEWS[tab] || VIEWS.cuenta)(main).catch(e => { main.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; });
  }

  async function start() {
    if (!S.token) return renderLogin();
    try { await loadMe(); } catch (e) { return; }
    if (S.me.debe_cambiar) return renderForceChange();
    renderShell();
    const available = tabs().map(t => t[0]).concat('cuenta');
    const fromHash = location.hash.slice(1);
    go(available.includes(fromHash) ? fromHash : tabs()[0][0]);
  }

  // Refresco periódico (confirmaciones pendientes, panel en vivo)
  setInterval(async () => {
    if (!S.me || document.hidden || $('#modal-root').innerHTML) return;
    try {
      if (S.me.es_comprador) {
        const prev = S.me.por_confirmar, prevCompra = S.me.ultima_compra_saldo;
        await loadMe(); renderNav();
        const nuevaCompra = S.me.ultima_compra_saldo > prevCompra;
        if (nuevaCompra) avisoCompra(S.me.ultima_compra_saldo);
        if (S.tab === 'inicio' && (prev !== S.me.por_confirmar || nuevaCompra)) go('inicio');
        else if (S.me.por_confirmar > prev) toast('Tienes una compra por confirmar');
      }
      if (S.tab === 'panel') VIEWS.panel($('#main'), true);
    } catch (_) { /* sin conexión momentánea */ }
  }, 15000);

  // ================= Ayuda "¿Cómo funciona?" según el rol =================
  // Pasos simples y los problemas que más pueden pasar en la feria, con qué hacer en cada caso.
  function showHelp() {
    const me = S.me, roles = rolesDe(me).map(r => r[0]);
    const pasos = (titulo, emoji, lista) => `<div class="help-sec"><h3>${emoji} ${titulo}</h3><ol class="how">${lista.map((t, i) => `<li><span>${i + 1}</span><div>${t}</div></li>`).join('')}</ol></div>`;
    const faq = (lista) => `<div class="help-sec"><h3>🛟 Si algo pasa</h3>${lista.map(([q, a]) => `<details class="faq"><summary>${q}</summary><div>${a}</div></details>`).join('')}</div>`;
    const secs = [];
    const comunes = [];
    if (roles.includes('comp')) {
      secs.push(pasos('Comprar con tu saldo', '🛍️', [
        'Mira el <strong>Catálogo</strong> para ver qué vende cada emprendimiento. Puedes buscar o filtrar por categoría.',
        'En el puesto, dile al vendedor qué vas a llevar.',
        'Cuando vayas a pagar, ve a <strong>Inicio</strong> y toca <strong>Generar código</strong>.',
        '<strong>Escribe tú mismo</strong> el código en el equipo del vendedor. No lo digas en voz alta ni lo muestres a otros.',
        'Te aparece el aviso <em>"¿Fuiste tú?"</em> y te llega el comprobante al correo.',
      ]));
      comunes.push(
        ['⏰ El código venció', 'No pasa nada: toca <strong>Generar otro código</strong>. Cada código dura pocos minutos y solo sirve una vez.'],
        ['💸 No me alcanza el saldo', 'Paga una parte con saldo y el resto en efectivo o transferencia. El vendedor puede combinar las formas de pago.'],
        ['🚨 Me cobraron algo que no compré', 'Abre la compra en <strong>Inicio → Mis compras</strong> y toca <strong>No reconozco esta compra</strong>. Un administrador la revisa y, si corresponde, te devuelve el saldo. Si usas PIN, cámbialo en <strong>Mi cuenta</strong>.'],
        ['⏳ Me llegó una compra "por confirmar"', 'Aparece arriba en <strong>Inicio</strong>. Si es tuya, toca <strong>Sí, confirmar</strong>. Si no la haces a tiempo, se anula sola y no se te cobra.'],
      );
    }
    if (roles.includes('emp')) {
      secs.push(pasos('Vender', '🧾', [
        'En <strong>Productos</strong>, elige tu categoría y agrega lo que vendes con su precio y cuántos tienes.',
        'En <strong>Vender</strong>, busca al comprador por cédula, nombre o apellido.',
        'Toca <strong>+</strong> en cada producto que lleva.',
        'Elige cómo paga. Si usa <strong>saldo</strong>, gira el equipo y pídele que <strong>escriba él</strong> su código de pago.',
        'Toca <strong>Registrar venta</strong>. El comprobante le llega al comprador.',
      ]));
      comunes.push(
        ['📡 Se cortó el Wi-Fi al registrar', 'Espera a que vuelva la señal y toca <strong>Registrar venta</strong> otra vez. <strong>La venta no se duplica</strong>: si ya se había guardado, verás la misma.'],
        ['🔢 "Código incorrecto, vencido o ya usado"', 'Pídele al comprador que genere un código nuevo en su celular y lo escriba otra vez. Tras 5 intentos fallidos se bloquea 10 minutos.'],
        ['📦 Se acabó el stock', 'Marca <strong>Entrega posterior</strong> en el producto: se vende igual y lo entregas después. Luego, en <strong>Ventas</strong>, márcalo como entregado.'],
        ['✏️ Me equivoqué en una venta', 'Ve a <strong>Ventas</strong>, ábrela y toca <strong>Modificar</strong> o <strong>Anular</strong> (con el motivo). Todo queda registrado.'],
        ['📵 El comprador no tiene celular', 'Puede pagar en efectivo o transferencia. Para usar saldo, que pase por la mesa de ayuda.'],
      );
    }
    if (roles.includes('admin') || roles.includes('super')) {
      secs.push(pasos('Administrar', '📊', [
        '<strong>Panel</strong>: ventas en vivo, se actualiza cada 15 segundos. Si aparece un aviso rojo de compras reportadas, revísalo primero.',
        '<strong>Ventas</strong>: busca y filtra todas las transacciones. El filtro <strong>Reportadas</strong> muestra las compras que un comprador no reconoce.',
        'En una compra reportada, habla con el emprendedor y decide: <strong>Anular por reporte</strong> (devuelve el saldo) o <strong>Descartar</strong>.',
        '<strong>Reportes</strong>: cuentas por cobrar por empleado y liquidación a emprendedores, para descargar en Excel.',
      ]));
      if (roles.includes('super')) {
        secs.push(pasos('Super administrador', '🛠️', [
          '<strong>Ajustes</strong>: importa los Excel de emprendedores y compradores, envía los accesos y define las categorías.',
          'En Ajustes puedes <strong>desactivar el PIN</strong> para que solo se pague con código del celular o aprobación en la app.',
          '<strong>Usuarios</strong>: busca a cualquier persona para cambiar su rol, saldo o generarle una nueva contraseña o PIN.',
        ]));
      }
      comunes.push(
        ['🔑 Alguien olvidó su contraseña', 'Super admin: <strong>Usuarios</strong> → busca a la persona → <strong>Nueva contraseña</strong>. Entrégasela; al entrar deberá cambiarla.'],
        ['🚨 Un comprador reporta una compra', 'Ábrela desde el aviso del Panel. Confirma con el emprendedor si entregó el producto antes de anular.'],
      );
    }
    comunes.push(['📶 La app dice "Sin conexión"', 'Es el Wi-Fi del lugar. Tus datos no se pierden: espera unos segundos y vuelve a intentar.']);
    const b = modal('¿Cómo funciona?', `<div class="stack">
      <div class="row wrap" style="gap:6px">${roleTags(me)}</div>
      ${secs.join('')}${faq(comunes)}
      <div class="alert info small">${icon('shield', 16)} <strong>Seguridad:</strong> nunca compartas tu contraseña ni tu PIN. El personal de la feria nunca te los va a pedir.</div>
      <button class="btn primary block lg" id="h-ok">Entendido</button></div>`, { wide: true });
    $('#h-ok', b).onclick = closeModal;
  }

  // Aviso inmediato al comprador cada vez que se cobra algo con su saldo: si no fue él, lo reporta en el momento
  async function avisoCompra(id) {
    S.payCode = null;
    try {
      const v = await api('GET', '/api/ventas/' + id);
      if ($('#modal-root').innerHTML) return toast(`Se cobró ${fmt(v.total_saldo)} de tu saldo en ${v.nombre_comercial}`);
      const b = modal('Compra con tu saldo', `<div class="stack"><p style="margin:0">Se registró una compra en <strong>${esc(v.nombre_comercial)}</strong> por <strong>${fmt(v.total_saldo)}</strong> de tu saldo.</p>
        <p class="small muted" style="margin:0">${v.detalle.map(d => `${d.cantidad}× ${esc(d.descripcion)}`).join(', ')}</p>
        <div class="btns"><button class="btn primary grow" id="ac-ok">Sí, fui yo</button><button class="btn danger grow" id="ac-no">No fui yo</button></div></div>`);
      $('#ac-ok', b).onclick = closeModal;
      $('#ac-no', b).onclick = () => { closeModal(); openVenta(id, () => S.tab === 'inicio' && go('inicio')); };
    } catch (_) { /* sin conexión: queda el correo */ }
  }

  // ================= Elementos comunes =================
  // Estado vacío con icono, título y una indicación de qué hacer
  const emptyState = (ic, titulo, texto, extra = '') => `<div class="empty-state"><div class="ic">${icon(ic, 30)}</div>
    <div class="t">${titulo}</div>${texto ? `<div class="s">${texto}</div>` : ''}${extra}</div>`;
  function estadoBadges(v) {
    const b = [];
    if (v.estado === 'anulada') b.push('<span class="badge b-bad">Anulada</span>');
    else if (v.estado === 'por_confirmar') b.push('<span class="badge b-warn">Por confirmar</span>');
    else b.push('<span class="badge b-ok">Confirmada</span>');
    if (v.estado !== 'anulada' && v.estado_entrega === 'pendiente') b.push('<span class="badge b-info">Entrega pendiente</span>');
    if (v.reporte_estado === 'pendiente') b.push('<span class="badge b-bad">Reportada</span>');
    return b.join(' ');
  }
  function ventaItem(v, who) {
    const titulo = who === 'comprador' ? v.nombre_comercial : who === 'admin' ? `${v.nombre_comercial} → ${v.comprador_nombre}` : v.comprador_nombre;
    const items = v.detalle.map(d => `${d.cantidad}× ${d.descripcion}`).join(', ');
    return `<button class="item" data-venta="${v.id}"><div class="grow"><div class="t">${esc(titulo)}</div>
      <div class="s">N.º ${v.id} · ${fdate(v.creado)} · ${esc(items)}</div><div style="margin-top:5px">${estadoBadges(v)}</div></div>
      <div class="amt" style="${v.estado === 'anulada' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${fmt(v.total)}</div></button>`;
  }
  function bindVentaItems(root, after) {
    root.querySelectorAll('[data-venta]').forEach(el => { el.onclick = () => openVenta(Number(el.dataset.venta), after); });
  }

  // ---------- Detalle de venta ----------
  async function openVenta(id, after) {
    const b = modal(`Venta N.º ${id}`, '<div class="empty"><span class="spinner"></span></div>');
    let v;
    try { v = await api('GET', '/api/ventas/' + id); } catch (e) { b.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; return; }
    const me = S.me;
    const esVend = v.emprendedor_usuario_id === me.id, esComp = v.comprador_id === me.id, esSuper = me.rol === 'superadmin';
    const acc = [];
    if (esComp && v.estado === 'por_confirmar') acc.push('<button class="btn primary grow" data-a="conf">Confirmar compra</button><button class="btn danger grow" data-a="rech">Rechazar</button>');
    if (esVend && v.estado === 'por_confirmar') acc.push(`<button class="btn primary grow" data-a="pin">Confirmar con ${authLabel().toLowerCase()}</button>`);
    const esAdmin = ['admin', 'superadmin'].includes(me.rol);
    if (esComp && v.estado === 'confirmada' && Number(v.total_saldo) > 0 && !v.reporte_estado) acc.push('<button class="btn danger grow" data-a="rep">No reconozco esta compra</button>');
    if (esAdmin && v.reporte_estado === 'pendiente') acc.push('<button class="btn danger grow" data-a="rep-anul">Anular por reporte</button><button class="btn grow" data-a="rep-desc">Descartar reporte</button>');
    if (esVend && v.estado === 'confirmada' && v.estado_entrega === 'pendiente') acc.push('<button class="btn primary grow" data-a="ent">Marcar entregado</button>');
    if (esVend && v.estado !== 'anulada') acc.push('<button class="btn grow" data-a="edit">Modificar</button>');
    if ((esVend || esSuper) && v.estado !== 'anulada') acc.push('<button class="btn danger grow" data-a="anul">Anular</button>');
    if ((esVend || esComp || ['admin', 'superadmin'].includes(me.rol)) && v.estado !== 'por_confirmar') acc.push('<button class="btn grow" data-a="mail">Enviar por correo</button>');
    const ACC = { creada: 'Registrada', modificada: 'Modificada', confirmada: 'Confirmada por el comprador', anulada: 'Anulada', anulada_automatica: 'Anulada automáticamente', entregada: 'Entregada',
      reportada: 'Reportada por el comprador', reporte_resuelto: 'Reporte revisado' };
    const MEDIO = { pin: 'con PIN', codigo: 'con código de pago', app: 'desde la app del comprador' };
    b.innerHTML = `<div class="stack">
      <div>${estadoBadges(v)}</div>
      ${v.reporte_estado === 'pendiente' ? `<div class="alert bad"><strong>Reportada por el comprador:</strong> ${esc(v.reporte)}<div class="tiny" style="margin-top:4px">${esAdmin ? 'Revisa con el emprendedor antes de decidir.' : 'Un administrador la está revisando.'}</div></div>` : ''}
      ${v.reporte_estado === 'resuelto' ? '<div class="alert info small">El reporte del comprador ya fue revisado (ver historial).</div>' : ''}
      ${v.estado === 'confirmada' && MEDIO[v.confirmada_por] ? `<div class="tiny muted">Pago con saldo autorizado ${MEDIO[v.confirmada_por]}.</div>` : ''}
      ${v.estado === 'por_confirmar' ? `<div class="alert warn">Esperando que el comprador confirme el pago con saldo (vence a las ${ftime(v.expira_confirmacion)}).</div>` : ''}
      ${v.estado === 'anulada' ? `<div class="alert bad">Motivo: ${esc(v.motivo_anulacion)}</div>` : ''}
      ${v.estado !== 'anulada' && v.fecha_limite_entrega && v.estado_entrega === 'pendiente' ? `<div class="alert info">Entregar a más tardar el ${fdate(v.fecha_limite_entrega, { weekday: 'short' })}. Si no se entrega, se anula automáticamente.</div>` : ''}
      <div class="card flat"><div class="spread"><div><div class="muted tiny">Emprendimiento</div><strong>${esc(v.nombre_comercial)}</strong></div><div class="right"><div class="muted tiny">Comprador</div><strong>${esc(v.comprador_nombre)}</strong><div class="tiny muted">${esc(v.comprador_cedula)}</div></div></div></div>
      <div class="card flat"><table class="lines">${v.detalle.map(d => `<tr><td>${d.cantidad} × ${esc(d.descripcion)}${d.entrega_posterior ? ' <span class="badge b-info">posterior</span>' : ''}<div class="tiny muted">${fmt(d.precio_unit)} c/u</div></td><td class="right num">${fmt(d.subtotal)}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="right num">${fmt(v.total)}</td></tr>
        ${v.pagos.map(p => `<tr><td class="muted"><span class="pay-ic sm f-${p.forma}">${icon(FORMA_IC[p.forma], 14)}</span> ${FORMA[p.forma]}${p.forma === 'saldo' ? ' <span class="tiny">(cuenta por cobrar)</span>' : ''}</td><td class="right num muted">${fmt(p.monto)}</td></tr>`).join('')}</table></div>
      ${acc.length ? `<div class="btns">${acc.join('')}</div>` : ''}
      <div><h3 style="margin-bottom:10px">Historial</h3><ul class="timeline">${(v.historial || []).map(h => `<li><strong>${ACC[h.accion] || h.accion}</strong> · ${fdate(h.fecha)}${h.usuario ? ` · ${esc(h.usuario)}` : ''}
        ${h.detalle && h.detalle.motivo ? `<div class="muted">Motivo: ${esc(h.detalle.motivo)}</div>` : ''}
        ${h.detalle && h.detalle.antes ? `<div class="muted tiny">Antes: ${esc(h.detalle.antes.items.join('; '))} | ${esc(h.detalle.antes.pagos.join(', '))}</div><div class="muted tiny">Después: ${esc(h.detalle.despues.items.join('; '))} | ${esc(h.detalle.despues.pagos.join(', '))}</div>` : ''}</li>`).join('')}</ul></div></div>`;
    const done = (msg) => { toast(msg); closeModal(); loadMe().then(renderNav).catch(() => {}); if (after) after(); };
    b.querySelectorAll('[data-a]').forEach(btn => {
      btn.onclick = async () => {
        const a = btn.dataset.a;
        if (a === 'conf') return guard(btn, async () => { await api('POST', `/api/ventas/${id}/confirmar`, {}); done('Compra confirmada'); });
        if (a === 'rech') return guard(btn, async () => { await api('POST', `/api/ventas/${id}/rechazar`, {}); done('Compra rechazada'); });
        if (a === 'ent') return guard(btn, async () => { await api('POST', `/api/ventas/${id}/entregar`, {}); done('Marcada como entregada'); });
        if (a === 'mail') return guard(btn, async () => { const r = await api('POST', `/api/ventas/${id}/reenviar`, {}); toast('Comprobante enviado a ' + r.para); });
        if (a === 'edit') { closeModal(); return editVenta(v); }
        if (a === 'pin') {
          const r = await ask(authLabel() + ' del comprador', `<p class="muted small">Pide a ${esc(v.comprador_nombre)} que escriba ${S.me.evento.pago_con_pin ? 'el código de pago de su celular (6 dígitos) o su PIN (4 dígitos)' : 'el código de pago de su celular (6 dígitos)'}, sin decirlo en voz alta.</p><input class="input pin" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off">`, 'Confirmar');
          if (!r) return openVenta(id, after);
          return guard($('#q-ok'), async () => { await api('POST', `/api/ventas/${id}/confirmar`, { pin: r.pin }); done('Venta confirmada'); });
        }
        if (a === 'rep') {
          const r = await ask('No reconozco esta compra', `<p class="small">Si no hiciste esta compra o no recibiste el producto, cuéntanos. Un administrador la revisará con el emprendedor y, si corresponde, se anulará y se devolverá tu saldo.</p>
            <p class="small"><strong>Cambia tu PIN</strong> en Mi cuenta si crees que alguien lo conoce, y usa el código de pago para tus próximas compras.</p>
            <label class="field"><span>¿Qué pasó?</span><textarea class="input" name="motivo" rows="3" required></textarea></label>`, 'Enviar reporte', true);
          if (!r) return openVenta(id, after);
          return guard($('#q-ok'), async () => { await api('POST', `/api/ventas/${id}/reportar`, { motivo: r.motivo }); done('Reporte enviado. Te avisaremos por correo.'); });
        }
        if (a === 'rep-anul' || a === 'rep-desc') {
          const anula = a === 'rep-anul';
          const r = await ask(anula ? 'Anular por reporte' : 'Descartar reporte', `<p class="small">${anula ? 'Se anulará la venta, se devolverá el saldo al comprador y el stock al emprendedor.' : 'La venta se mantiene. El comprador recibirá un correo con tu nota.'}</p>
            <label class="field"><span>Nota (se envía al comprador)</span><textarea class="input" name="nota" rows="2"></textarea></label>`, anula ? 'Anular venta' : 'Descartar', anula);
          if (!r) return openVenta(id, after);
          return guard($('#q-ok'), async () => { await api('POST', `/api/admin/ventas/${id}/reporte`, { accion: anula ? 'anular' : 'descartar', nota: r.nota }); done(anula ? 'Venta anulada' : 'Reporte descartado'); });
        }
        if (a === 'anul') {
          const r = await ask('Anular venta', `<p class="small">Se devolverá el stock${Number(v.total_saldo) > 0 ? ' y el saldo del comprador' : ''}. Esta acción queda registrada.</p><label class="field"><span>Motivo</span><textarea class="input" name="motivo" rows="2" required></textarea></label>`, 'Anular venta', true);
          if (!r) return openVenta(id, after);
          return guard($('#q-ok'), async () => { await api('POST', `/api/ventas/${id}/anular`, { motivo: r.motivo }); done('Venta anulada'); });
        }
      };
    });
  }

  // ================= Vistas =================
  const VIEWS = {};

  // ---------- Vender (crear / modificar) ----------
  // idem: clave única de esta venta. Si se reenvía (doble toque, Wi-Fi que se corta), el servidor devuelve la misma venta.
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  function newSale() { return { comprador: null, cart: {}, pagos: { saldo: '', efectivo: '', transferencia: '' }, touched: false, auth: 'pin', pin: '', editId: null, orig: {}, motivo: '', idem: uid() }; }
  const authLabel = () => S.me.evento.pago_con_pin ? 'PIN o código' : 'Código de pago';
  S.sale = newSale();

  function editVenta(v) {
    const s = newSale();
    s.editId = v.id;
    s.comprador = { id: v.comprador_id, nombre: v.comprador_nombre, cedula: v.comprador_cedula, saldo_disponible: null, saldo_previo: Number(v.total_saldo) };
    v.detalle.forEach(d => {
      s.cart[d.producto_id] = { cant: d.cantidad, later: !!d.entrega_posterior };
      if (!d.entrega_posterior) s.orig[d.producto_id] = (s.orig[d.producto_id] || 0) + d.cantidad;
    });
    v.pagos.forEach(p => { s.pagos[p.forma] = Number(p.monto).toFixed(2); });
    s.touched = true;
    S.sale = s;
    go('vender');
  }

  VIEWS.vender = async (main) => {
    const s = S.sale;
    const prods = await api('GET', '/api/productos');
    S.cache.prods = prods;
    if (s.editId && s.comprador.saldo_disponible === null) {
      const r = await api('GET', '/api/compradores?q=' + encodeURIComponent(s.comprador.cedula));
      const c = r.find(x => x.id === s.comprador.id);
      s.comprador.saldo_disponible = c ? c.saldo_disponible : 0;
      s.comprador.tiene_pin = c ? c.tiene_pin : false;
    }
    renderVender(main);
  };

  function saleTotals() {
    const s = S.sale, prods = S.cache.prods || [];
    let total = 0;
    for (const [pid, l] of Object.entries(s.cart)) {
      const p = prods.find(x => x.id === Number(pid));
      if (p) total += c2(p.precio) * l.cant;
    }
    const paid = c2(s.pagos.saldo) + c2(s.pagos.efectivo) + c2(s.pagos.transferencia);
    const saldoMax = s.comprador ? c2(s.comprador.saldo_disponible) + c2(s.comprador.saldo_previo || 0) : 0;
    return { total, paid, saldo: c2(s.pagos.saldo), saldoMax };
  }
  function autoPay() {
    const s = S.sale;
    if (s.touched || !s.comprador) return;
    const { total, saldoMax } = saleTotals();
    const sal = Math.min(total, saldoMax);
    s.pagos = { saldo: sal ? m2(sal).toFixed(2) : '', efectivo: total - sal ? m2(total - sal).toFixed(2) : '', transferencia: '' };
  }

  function renderVender(main) {
    const s = S.sale, prods = (S.cache.prods || []).filter(p => p.activo || s.cart[p.id]);
    const c = s.comprador;
    autoPay();
    const avail = (p) => p.stock + (s.orig[p.id] || 0);
    main.innerHTML = `
      ${s.editId ? `<div class="alert info spread" style="margin-bottom:12px"><span>Modificando la venta <strong>N.º ${s.editId}</strong></span><button class="btn sm" id="b-cancel-edit">Cancelar</button></div>` : ''}
      <div class="card">
        <div class="steps-h"><span class="n">1</span>¿Quién compra?</div>
        ${c ? `<div class="buyer"><div class="ini">${esc(initials(c.nombre))}</div><div class="grow"><div style="font-weight:600">${esc(c.nombre)}</div><div class="small muted">${esc(c.cedula)}</div></div>
          <div class="right"><div class="tiny muted">Saldo disponible</div><div style="font-weight:700;font-size:18px" class="num">${fmt(m2(c2(c.saldo_disponible) + c2(c.saldo_previo || 0)))}</div></div></div>
          ${s.editId ? '' : '<button class="btn sm ghost" id="b-chg" style="margin-top:6px">Cambiar comprador</button>'}`
        : `<div class="input-ic">${icon('search', 18)}<input class="input" id="q-comp" placeholder="Escribe la cédula, nombre o apellido" autocomplete="off" inputmode="search"></div><div id="r-comp" style="margin-top:8px"></div>`}
      </div>
      <div class="card">
        <div class="steps-h"><span class="n">2</span>¿Qué lleva?</div>
        ${prods.length > 8 ? '<input class="input" id="q-prod" placeholder="Buscar producto" style="margin-bottom:8px">' : ''}
        ${!prods.length ? emptyState('box', 'Aún no tienes productos', 'Primero agrega lo que vas a vender, con su precio y cuántos tienes.', '<a class="btn primary" href="#productos" id="go-prod" style="margin-top:10px">+ Agregar productos</a>') : ''}
        <div id="prod-list">${prods.map(p => {
          const l = s.cart[p.id]; const a = avail(p);
          return `<div class="prod" data-name="${esc(p.nombre.toLowerCase())}"><div><div class="n">${esc(p.nombre)}</div><div class="p">${fmt(p.precio)} · ${a > 0 ? `${a} disponibles` : '<span style="color:var(--warn)">sin stock hoy</span>'}</div></div>
            <div class="stepper"><button data-dec="${p.id}" aria-label="Quitar">−</button><span>${l ? l.cant : 0}</span><button data-inc="${p.id}" aria-label="Agregar">+</button></div>
            ${l ? `<label class="check later"><input type="checkbox" data-later="${p.id}" ${l.later ? 'checked' : ''} ${a <= 0 && !l.later ? 'disabled' : ''}> Entrega posterior (no descuenta stock de hoy)</label>` : ''}</div>`;
        }).join('')}</div>
      </div>
      <div class="card" id="pay-card">
        <div class="steps-h"><span class="n">3</span>¿Cómo paga?</div>
        ${['saldo', 'efectivo', 'transferencia'].map(f => `<div class="pay"><label for="p-${f}"><span class="pay-ic f-${f}">${icon(FORMA_IC[f], 18)}</span><span>${FORMA[f]}${f === 'saldo' ? '<span class="tiny muted" style="display:block;font-weight:400">cuenta por cobrar</span>' : ''}</span></label>
          <input class="input money" id="p-${f}" data-pay="${f}" inputmode="decimal" placeholder="0.00" value="${esc(s.pagos[f])}" ${f === 'saldo' && (!c || !c.saldo_disponible && !c.saldo_previo) ? 'disabled' : ''}></div>`).join('')}
        <div class="tiny muted" style="margin:2px 0 6px">Puedes combinar: por ejemplo, parte con saldo y el resto en efectivo.</div>
        <div class="btns" style="margin:6px 0 4px">${['saldo', 'efectivo', 'transferencia'].map(f => `<button class="btn sm" data-fill="${f}">${icon(FORMA_IC[f], 16)} Todo ${FORMA[f].toLowerCase()}</button>`).join('')}</div>
        <div class="spread" style="margin-top:8px"><span class="muted">Falta por asignar</span><span class="remain" id="remain"></span></div>
        <div id="auth-box"></div>
        ${s.editId ? `<label class="field" style="margin-top:10px"><span>Motivo de la modificación</span><input class="input" id="motivo" value="${esc(s.motivo)}" placeholder="Opcional"></label>` : ''}
      </div>
      <div class="totalbar"><div><div class="tiny" style="opacity:.75">Total</div><div class="big" id="t-total">$0.00</div></div>
        <button class="btn primary lg" id="b-save">${s.editId ? 'Guardar cambios' : 'Registrar venta'}</button></div>`;

    // Comprador
    const q = $('#q-comp', main);
    if (q) {
      const search = debounce(async () => {
        const v = q.value.trim(), box = $('#r-comp');
        if (v.length < 3) { box.innerHTML = '<div class="tiny muted">Escribe al menos 3 letras o números para buscar</div>'; return; }
        try {
          const rs = await api('GET', '/api/compradores?q=' + encodeURIComponent(v));
          if (q.value.trim() !== v) return;
          box.innerHTML = rs.length ? `<div class="list">${rs.map((r, i) => `<button class="item" data-i="${i}"><div class="grow"><div class="t">${esc(r.nombre)}</div><div class="s">${esc(r.cedula)}</div></div><div class="amt">${fmt(r.saldo_disponible)}</div></button>`).join('')}</div>` : '<div class="alert warn small">No encontramos a nadie con eso. Revisa la cédula o prueba con el apellido. Si no está registrado, puede pagar igual en efectivo o transferencia desde la mesa de ayuda.</div>';
          box.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { s.comprador = rs[Number(b.dataset.i)]; s.touched = false; renderVender(main); }; });
        } catch (e) { toast(e.message, true); }
      });
      q.oninput = search;
      setTimeout(() => q.focus(), 30);
    }
    const chg = $('#b-chg', main); if (chg) chg.onclick = () => { s.comprador = null; s.touched = false; s.pagos = { saldo: '', efectivo: '', transferencia: '' }; renderVender(main); };
    const ce = $('#b-cancel-edit', main); if (ce) ce.onclick = () => { S.sale = newSale(); go('ventas'); };
    const gp = $('#go-prod', main); if (gp) gp.onclick = (e) => { e.preventDefault(); go('productos'); };
    const qp = $('#q-prod', main);
    if (qp) qp.oninput = () => { const t = qp.value.toLowerCase(); main.querySelectorAll('.prod').forEach(el => { el.style.display = el.dataset.name.includes(t) ? '' : 'none'; }); };

    // Productos
    main.querySelectorAll('[data-inc]').forEach(b => { b.onclick = () => {
      const p = prods.find(x => x.id === Number(b.dataset.inc)); const l = s.cart[p.id] || { cant: 0, later: false };
      l.cant++;
      if (!l.later && l.cant > avail(p)) { if (l.cant === 1) l.later = true; else { toast(`Solo hay ${avail(p)} disponibles. Marca "entrega posterior" para vender más.`, true); l.cant--; } }
      s.cart[p.id] = l; s.touched = s.editId ? s.touched : false; renderVender(main); keepPos(b);
    }; });
    main.querySelectorAll('[data-dec]').forEach(b => { b.onclick = () => {
      const l = s.cart[b.dataset.dec]; if (!l) return;
      l.cant--; if (l.cant <= 0) delete s.cart[b.dataset.dec];
      s.touched = s.editId ? s.touched : false; renderVender(main);
    }; });
    main.querySelectorAll('[data-later]').forEach(b => { b.onchange = () => {
      const p = prods.find(x => x.id === Number(b.dataset.later)); const l = s.cart[p.id];
      if (!b.checked && l.cant > avail(p)) { b.checked = true; return toast(`Solo hay ${avail(p)} disponibles hoy`, true); }
      l.later = b.checked; renderVender(main);
    }; });
    // Pagos
    main.querySelectorAll('[data-pay]').forEach(inp => { inp.oninput = () => { s.pagos[inp.dataset.pay] = inp.value.replace(',', '.'); s.touched = true; updateTotals(); }; });
    main.querySelectorAll('[data-fill]').forEach(b => { b.onclick = () => {
      const { total, saldoMax } = saleTotals(); const f = b.dataset.fill;
      if (f === 'saldo' && total > saldoMax) {
        s.pagos = { saldo: m2(saldoMax).toFixed(2), efectivo: m2(total - saldoMax).toFixed(2), transferencia: '' };
        toast('El saldo no alcanza: el resto quedó en efectivo');
      } else s.pagos = { saldo: '', efectivo: '', transferencia: '', [f]: m2(total).toFixed(2) };
      s.touched = true; ['saldo', 'efectivo', 'transferencia'].forEach(k => { $('#p-' + k).value = s.pagos[k]; }); updateTotals();
    }; });
    const mo = $('#motivo', main); if (mo) mo.oninput = () => { s.motivo = mo.value; };
    $('#b-save', main).onclick = (e) => saveSale(e.currentTarget);
    updateTotals();
  }
  function keepPos(btn) { /* el re-render mantiene la posición del scroll de la ventana */ }

  function updateTotals() {
    const s = S.sale;
    const { total, paid, saldo, saldoMax } = saleTotals();
    $('#t-total').textContent = fmt(m2(total));
    const r = $('#remain'), diff = total - paid;
    r.textContent = diff === 0 ? '✓ Cuadra' : (diff > 0 ? fmt(m2(diff)) : `Sobra ${fmt(m2(-diff))}`);
    r.className = 'remain ' + (diff === 0 && total > 0 ? 'ok' : 'bad');
    const box = $('#auth-box');
    const needAuth = saldo > 0 && (!s.editId || saldo > c2(s.comprador?.saldo_previo || 0));
    if (saldo > saldoMax) { box.dataset.state = ''; box.innerHTML = `<div class="alert bad" style="margin-top:10px">El saldo disponible es ${fmt(m2(saldoMax))}</div>`; return; }
    if (!needAuth) { box.dataset.state = ''; box.innerHTML = ''; return; }
    if (box.dataset.state === 'auth-' + s.auth) return;
    box.dataset.state = 'auth-' + s.auth;
    box.innerHTML = `<hr class="sep"><div style="font-weight:600;margin-bottom:6px">Autorización del comprador</div>
      <div class="chips" style="margin-bottom:10px"><button class="chip ${s.auth === 'pin' ? 'on' : ''}" data-auth="pin">${authLabel()} aquí</button><button class="chip ${s.auth === 'app' ? 'on' : ''}" data-auth="app">Aprobar en su celular</button></div>
      ${s.auth === 'pin' ? `<input class="input pin" id="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="${S.me.evento.pago_con_pin ? '••••' : '••••••'}" value="${esc(s.pin)}">
        <div class="tiny muted center" style="margin-top:6px">${S.me.evento.pago_con_pin
          ? 'El comprador escribe su <strong>código de pago</strong> (6 dígitos, desde su celular) o su PIN (4 dígitos). Recomendado: el código, porque solo sirve una vez.'
          : 'El comprador escribe el <strong>código de pago</strong> de 6 dígitos que genera en su celular (Inicio → Pagar con código).'}
          Pídele que lo escriba él mismo, sin decirlo en voz alta.</div>`
      : `<div class="alert info small">La venta quedará <strong>por confirmar</strong>. El comprador debe aprobarla en la app (Mis compras) en los próximos ${S.me.evento.minutos_confirmacion} minutos; si no, se anula sola.</div>`}`;
    box.querySelectorAll('[data-auth]').forEach(b => { b.onclick = () => { s.auth = b.dataset.auth; box.dataset.state = ''; updateTotals(); }; });
    const pin = $('#pin'); if (pin) pin.oninput = () => { s.pin = pin.value.replace(/\D/g, '').slice(0, 6); pin.value = s.pin; };
  }

  async function saveSale(btn) {
    const s = S.sale;
    const { total, paid, saldo, saldoMax } = saleTotals();
    if (!s.comprador) return toast('Selecciona el comprador', true);
    if (!total) return toast('Agrega al menos un producto', true);
    if (paid !== total) return toast('Las formas de pago no cuadran con el total', true);
    if (saldo > saldoMax) return toast('Saldo insuficiente', true);
    const needAuth = saldo > 0 && (!s.editId || saldo > c2(s.comprador.saldo_previo || 0));
    const largos = S.me.evento.pago_con_pin ? [4, 6] : [6];
    if (needAuth && s.auth === 'pin' && !largos.includes(s.pin.length)) {
      return toast(S.me.evento.pago_con_pin ? 'Ingresa el código de 6 dígitos o el PIN de 4, o elige "Aprobar en su celular"' : 'Ingresa el código de pago de 6 dígitos o elige "Aprobar en su celular"', true);
    }
    const body = {
      comprador_id: s.comprador.id,
      items: Object.entries(s.cart).map(([pid, l]) => ({ producto_id: Number(pid), cantidad: l.cant, entrega_posterior: l.later })),
      pagos: ['saldo', 'efectivo', 'transferencia'].map(f => ({ forma: f, monto: m2(c2(s.pagos[f])) })).filter(p => p.monto > 0),
      pin: needAuth && s.auth === 'pin' ? s.pin : undefined, motivo: s.motivo || undefined,
      idem: s.editId ? undefined : s.idem,
    };
    await guard(btn, async () => {
      const v = s.editId ? await api('PUT', '/api/ventas/' + s.editId, body) : await api('POST', '/api/ventas', body);
      S.sale = newSale();
      S.cache.prods = null;
      const b = modal(s.editId ? 'Venta modificada' : 'Venta registrada', `<div class="success"><div class="ic">${icon('check', 34)}</div>
        <h2>${fmt(v.total)}</h2><p class="muted" style="margin:4px 0 12px">N.º ${v.id} · ${esc(v.comprador_nombre)}</p>
        ${v.estado === 'por_confirmar' ? '<div class="alert warn">Pendiente: el comprador debe confirmarla en su celular.</div>' : ''}
        ${v.estado_entrega === 'pendiente' ? `<div class="alert info" style="margin-top:8px">Entrega pendiente${v.fecha_limite_entrega ? ' hasta ' + fdate(v.fecha_limite_entrega, { weekday: 'short' }) : ''}.</div>` : ''}
        ${v.estado === 'confirmada' ? `<p class="small muted">${S.me.correo_activo ? 'Se envió el comprobante al correo del comprador.' : ''}</p>` : ''}
        <button class="btn primary block lg" id="b-new" style="margin-top:12px">Nueva venta</button></div>`);
      $('#b-new', b).onclick = () => { closeModal(); go('vender'); };
      go(s.editId ? 'ventas' : 'vender');
    });
  }

  // ---------- Mis ventas (emprendedor) ----------
  VIEWS.ventas = async (main) => {
    const r = await api('GET', '/api/mis-ventas');
    const f = S.cache.vfiltro || 'todas';
    const filt = { todas: () => true, por_confirmar: v => v.estado === 'por_confirmar', pendiente: v => v.estado === 'confirmada' && v.estado_entrega === 'pendiente', anulada: v => v.estado === 'anulada' };
    const R = r.resumen;
    main.innerHTML = `<div class="kpis">
        <div class="kpi"><div class="l">Total vendido</div><div class="v">${fmt(R.total)}</div><div class="d">${R.ventas} ${R.ventas === 1 ? 'venta confirmada' : 'ventas confirmadas'}</div></div>
        <div class="kpi"><div class="l">Saldo (cuentas por cobrar)</div><div class="v">${fmt(R.saldo)}</div><div class="d">Lo paga la empresa</div></div>
        <div class="kpi"><div class="l">Efectivo</div><div class="v">${fmt(R.efectivo)}</div></div>
        <div class="kpi"><div class="l">Transferencia</div><div class="v">${fmt(R.transferencia)}</div></div></div>
      <div class="section-title"><div class="chips" id="vf">
        ${[['todas', 'Todas'], ['por_confirmar', `Por confirmar (${R.por_confirmar})`], ['pendiente', `Por entregar (${R.pendientes_entrega})`], ['anulada', 'Anuladas']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div></div>
      <input class="input" id="vq" placeholder="Buscar por comprador o N.º" style="margin-bottom:10px">
      <div class="list" id="vl"></div>`;
    const paint = () => {
      const t = $('#vq').value.trim().toLowerCase();
      const rows = r.ventas.filter(filt[f]).filter(v => !t || String(v.id) === t || v.comprador_nombre.toLowerCase().includes(t) || v.comprador_cedula.includes(t));
      $('#vl').innerHTML = rows.length ? rows.map(v => ventaItem(v, 'vendedor')).join('')
        : emptyState('receipt', t || f !== 'todas' ? 'No hay ventas con ese filtro' : 'Aún no tienes ventas', t || f !== 'todas' ? 'Prueba con "Todas" o borra la búsqueda.' : 'Cuando registres una venta en la pestaña Vender, aparecerá aquí.');
      bindVentaItems($('#vl'), () => go('ventas'));
    };
    $('#vq').oninput = paint;
    main.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => { S.cache.vfiltro = b.dataset.f; go('ventas'); }; });
    paint();
  };

  // ---------- Productos ----------
  VIEWS.productos = async (main) => {
    const prods = await api('GET', '/api/productos');
    const catAct = S.me.emprendimiento.categoria || '';
    main.innerHTML = `<div class="card ${catAct ? '' : 'flat'}" style="${catAct ? '' : 'border:2px solid var(--accent)'}">
        <label class="field"><span>Categoría de tu emprendimiento en el catálogo</span>
        <select class="input" id="mi-cat"><option value="">— Elige una categoría —</option>${S.me.categorias.map(c => `<option ${c === catAct ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        ${catAct ? '' : '<div class="tiny" style="margin-top:6px;color:var(--warn)">Mientras no elijas, apareces en "Otros". Elige la que mejor describa lo que vendes para que los compradores te encuentren.</div>'}</div>
      <div class="section-title"><h2>Mis productos</h2><button class="btn primary sm" id="b-add">+ Agregar</button></div>
      <div class="list">${prods.length ? prods.map(p => `<button class="item" data-p="${p.id}"><div class="grow"><div class="t">${esc(p.nombre)} ${p.activo ? '' : '<span class="badge b-mute">Oculto</span>'}</div>
        <div class="s">${p.descripcion ? esc(p.descripcion) : ''}</div></div><div class="right"><div class="amt">${fmt(p.precio)}</div>
        <div class="tiny"><span class="badge ${p.stock > 0 ? 'b-ok' : 'b-warn'}">Stock ${p.stock}</span></div></div></button>`).join('') : emptyState('box', 'Agrega lo que vas a vender', 'Toca "+ Agregar" e ingresa nombre, precio y cuántos tienes. Puedes cambiarlo cuando quieras.')}</div>
      <p class="tiny muted" style="margin-top:12px">El stock es lo disponible el día del evento. Los pedidos con entrega posterior no lo descuentan.</p>`;
    $('#mi-cat').onchange = async (e) => {
      try { await api('PUT', '/api/mi-emprendimiento', { categoria: e.target.value }); await loadMe(); toast('Categoría guardada'); go('productos'); }
      catch (err) { toast(err.message, true); }
    };
    $('#b-add').onclick = () => prodForm();
    main.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => prodForm(prods.find(p => p.id === Number(b.dataset.p))); });
  };
  function prodForm(p) {
    const b = modal(p ? 'Editar producto' : 'Nuevo producto', `<form class="stack" id="pf">
      <label class="field"><span>Nombre</span><input class="input" name="nombre" required maxlength="150" value="${esc(p?.nombre)}"></label>
      <label class="field"><span>Descripción (opcional)</span><input class="input" name="descripcion" maxlength="500" value="${esc(p?.descripcion)}"></label>
      <div class="grid2"><label class="field"><span>Precio ($)</span><input class="input money" name="precio" inputmode="decimal" required value="${p ? Number(p.precio).toFixed(2) : ''}"></label>
      <label class="field"><span>Stock disponible</span><input class="input money" name="stock" inputmode="numeric" required value="${p ? p.stock : ''}"></label></div>
      <label class="check"><input type="checkbox" name="activo" ${!p || p.activo ? 'checked' : ''}> Visible y a la venta</label>
      <button class="btn primary block lg">Guardar</button></form>`);
    $('#pf', b).onsubmit = (e) => {
      e.preventDefault(); const f = e.target;
      const body = { nombre: f.nombre.value, descripcion: f.descripcion.value, precio: Number(f.precio.value.replace(',', '.')), stock: Number(f.stock.value), activo: f.activo.checked };
      guard(f.querySelector('button'), async () => {
        if (p) await api('PUT', '/api/productos/' + p.id, body); else await api('POST', '/api/productos', body);
        closeModal(); toast('Producto guardado'); go('productos');
      });
    };
  }

  // ---------- Inicio comprador ----------
  VIEWS.inicio = async (main) => {
    await loadMe(); renderNav();
    const compras = await api('GET', '/api/mis-compras');
    const s = S.me.saldo;
    const pend = compras.filter(v => v.estado === 'por_confirmar');
    // Orden pensado para la feria: primero lo urgente (compras esperando tu OK), luego el saldo y el botón para pagar
    main.innerHTML = `
      ${pend.length ? `<div class="section-title" style="margin-top:4px"><h2>${icon('clock', 20)} Esperan tu confirmación</h2></div>${pend.map(v => `<div class="card pend-card">
          <div class="spread"><div><strong>${esc(v.nombre_comercial)}</strong><div class="small muted">N.º ${v.id} · vence a las ${ftime(v.expira_confirmacion)}</div></div><div style="font-size:22px;font-weight:700" class="num">${fmt(v.total)}</div></div>
          <div class="small" style="margin:8px 0">${v.detalle.map(d => `${d.cantidad}× ${esc(d.descripcion)}`).join(', ')}</div>
          <div class="small muted">${v.pagos.map(p => `${FORMA[p.forma]}: ${fmt(p.monto)}`).join(' · ')}</div>
          <div class="tiny muted" style="margin-top:6px">Si no la confirmas a tiempo, se anula sola y no se te cobra.</div>
          <div class="btns" style="margin-top:12px"><button class="btn primary grow lg" data-ok="${v.id}">${icon('check', 18)} Sí, confirmar</button><button class="btn danger grow lg" data-no="${v.id}">No es mía</button></div></div>`).join('')}` : ''}
      <div class="balance" style="${pend.length ? 'margin-top:14px' : ''}"><div class="row" style="gap:8px"><span class="bal-ic">${icon('wallet', 20)}</span><div class="lbl">Tu saldo para compras</div></div>
        <div class="big">${fmt(s.disponible)}</div>
        <div class="bal-bar" aria-hidden="true"><i style="width:${s.asignado ? Math.min(100, s.usado / s.asignado * 100) : 0}%"></i></div>
        <div class="meta"><span>Te asignaron ${fmt(s.asignado)}</span><span>Ya usaste ${fmt(s.usado)}</span></div></div>
      ${s.disponible > 0 ? `<div class="card paycode" style="margin-top:12px" id="paycode">
        <div class="pc-h">${icon('shield', 22)}<div><div style="font-weight:700;font-size:16px">Pagar con tu saldo</div><div class="tiny muted">Seguro: el código sirve una sola vez</div></div></div>
        <ol class="how">
          <li><span>1</span><div>En el puesto, dile al vendedor qué vas a llevar.</div></li>
          <li><span>2</span><div>Cuando vayas a pagar, toca <strong>Generar código</strong>.</div></li>
          <li><span>3</span><div><strong>Escribe tú</strong> el código en el equipo del vendedor. No lo digas en voz alta.</div></li>
        </ol>
        <div id="pc-box"></div>
        <button class="btn primary block lg" id="b-code">${icon('shield', 20)} Generar código</button>
        <div class="tiny muted center" style="margin-top:8px">Vence en ${S.me.evento.minutos_codigo_pago} minutos. Si se vence, genera otro: no pasa nada.</div></div>`
      : `<div class="card center" style="margin-top:12px"><div style="font-size:28px">🎉</div><strong>Ya usaste todo tu saldo</strong>
        <p class="small muted" style="margin:4px 0 0">Puedes seguir comprando: paga en efectivo o por transferencia directamente en el puesto.</p></div>`}
      ${S.me.pin_temporal && S.me.evento.pago_con_pin ? `<div class="alert warn" style="margin-top:12px">${icon('alert', 16)} Te recomendamos cambiar el PIN que recibiste por correo. <a href="#cuenta" id="go-c">Cambiar PIN</a></div>` : ''}
      <div class="section-title"><h2>${icon('receipt', 20)} Mis compras</h2></div>
      <div class="list" id="cl">${compras.filter(v => v.estado !== 'por_confirmar').map(v => ventaItem(v, 'comprador')).join('')
        || emptyState('bag', 'Aún no tienes compras', 'Mira el catálogo para ver qué ofrece cada emprendimiento.', '<button class="btn" id="go-cat" style="margin-top:10px">' + icon('store', 18) + ' Ver catálogo</button>')}</div>`;
    const gc = $('#go-c'); if (gc) gc.onclick = (e) => { e.preventDefault(); go('cuenta'); };
    const gk = $('#go-cat'); if (gk) gk.onclick = () => go('catalogo');
    const bc = $('#b-code');
    if (bc) bc.onclick = () => guard(bc, async () => {
      const r = await api('POST', '/api/me/codigo-pago', {});
      showPayCode(r);
    });
    if (S.payCode && new Date(S.payCode.expira) > new Date()) showPayCode(S.payCode);
    main.querySelectorAll('[data-ok]').forEach(b => { b.onclick = () => guard(b, async () => { await api('POST', `/api/ventas/${b.dataset.ok}/confirmar`, {}); toast('Compra confirmada'); go('inicio'); }); });
    main.querySelectorAll('[data-no]').forEach(b => { b.onclick = async () => {
      if (!(await ask('Rechazar compra', '<p>La venta se anulará y tu saldo quedará libre.</p>', 'Rechazar', true))) return;
      closeModal(); guard(b, async () => { await api('POST', `/api/ventas/${b.dataset.no}/rechazar`, {}); toast('Compra rechazada'); go('inicio'); });
    }; });
    bindVentaItems($('#cl'), () => go('inicio'));
  };

  // Muestra el código de pago con una barra de tiempo; al vencer, se borra de la pantalla
  function showPayCode(r) {
    S.payCode = r;
    const box = $('#pc-box'), btn = $('#b-code');
    if (!box) return;
    const total = new Date(r.expira) - Date.now();
    clearInterval(showPayCode._t);
    const tick = () => {
      const left = new Date(r.expira) - Date.now();
      if (!box.isConnected) return clearInterval(showPayCode._t);
      if (left <= 0) {
        clearInterval(showPayCode._t); S.payCode = null;
        box.innerHTML = '<div class="alert warn small">El código venció. Genera uno nuevo cuando vayas a pagar.</div>';
        if (btn) btn.innerHTML = icon('shield', 20) + ' Generar código';
        return;
      }
      const m = Math.floor(left / 60000), sgs = Math.floor(left / 1000) % 60;
      box.innerHTML = `<div class="code" aria-label="Código de pago">${esc(r.codigo.replace(/(\d{3})(\d{3})/, '$1 $2'))}</div>
        <div class="bar"><i style="width:${Math.max(0, left / total * 100)}%"></i></div>
        <div class="tiny muted">${icon('clock', 13)} Vence en ${m}:${String(sgs).padStart(2, '0')} · Escríbelo tú, no lo digas en voz alta</div>`;
    };
    tick(); showPayCode._t = setInterval(tick, 1000);
    if (btn) btn.innerHTML = icon('shield', 20) + ' Generar otro código';
  }

  // ---------- Catálogo ----------
  // Orden justo: cada comprador ve los emprendimientos en un orden aleatorio distinto, fijo durante el día
  // (no salta al refrescar). Así ningún emprendimiento queda siempre arriba ni siempre al final.
  function seededShuffle(arr, seedText) {
    let h = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function highlight(text, q) {
    if (!q) return esc(text);
    const i = norm(text).indexOf(q);
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  VIEWS.catalogo = async (main) => {
    const data = await api('GET', '/api/catalogo');
    const hoy = new Date().toISOString().slice(0, 10);
    const emps = seededShuffle(data.emprendimientos, `${S.me.id}|${hoy}`);
    const C = S.cache.cat || (S.cache.cat = { q: '', cat: '', open: new Set() });
    const porCat = (c) => emps.filter(e => e.categoria === c);
    const cats = data.categorias.filter(c => porCat(c).length);
    const nProd = emps.reduce((a, e) => a + e.productos.length, 0);
    main.innerHTML = `<div class="cat-tools">
        <div class="input-ic">${icon('search', 18)}<input class="input" id="cq" placeholder="Buscar producto o emprendimiento" value="${esc(C.q)}" autocomplete="off" inputmode="search"></div>
        <div class="chips" style="margin-top:10px" id="cc">
          <button class="chip ${C.cat ? '' : 'on'}" data-c="">Todas<span class="n">${emps.length}</span></button>
          ${cats.map(c => `<button class="chip ${C.cat === c ? 'on' : ''}" data-c="${esc(c)}">${catEmoji(c)} ${esc(c)}<span class="n">${porCat(c).length}</span></button>`).join('')}
        </div></div>
      <div class="tiny muted" style="margin:0 2px 4px">${emps.length} emprendimientos · ${nProd} productos · el orden es aleatorio para que todos tengan la misma visibilidad</div>
      <div id="cat"></div>`;

    const empCard = (e, q) => {
      const nameHit = q && norm(e.nombre_comercial).includes(q);
      const prods = q && !nameHit ? e.productos.filter(p => norm(p.nombre).includes(q) || norm(p.descripcion).includes(q)) : e.productos;
      if (q && !prods.length) return '';
      const open = !!q || C.open.has(e.id);
      // Primero lo disponible hoy; lo que está bajo pedido, al final
      const orden = prods.slice().sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.nombre.localeCompare(b.nombre, 'es'));
      const precios = e.productos.map(p => p.precio);
      const rango = precios.length ? (Math.min(...precios) === Math.max(...precios) ? fmt(precios[0]) : `${fmt(Math.min(...precios))} – ${fmt(Math.max(...precios))}`) : '';
      return `<div class="emp ${open ? 'open' : ''}" data-emp="${e.id}">
        <button type="button" aria-expanded="${open}"><div class="ini">${esc(initials(e.nombre_comercial))}</div>
          <div><div class="t">${highlight(e.nombre_comercial, q)}</div><div class="s">${C.cat || q ? esc(e.categoria) + ' · ' : ''}${e.productos.length} ${e.productos.length === 1 ? 'producto' : 'productos'} · ${rango}</div></div>
          <svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></button>
        ${open ? `<div class="prods">${orden.map(p => `<div class="item ${p.stock > 0 ? '' : 'out'}"><div class="grow"><div class="t">${highlight(p.nombre, q)}</div>
          <div class="s">${p.descripcion ? highlight(p.descripcion, q) + ' · ' : ''}${p.stock > 0 ? `${p.stock} disponibles` : 'Sin stock hoy · bajo pedido'}</div></div><div class="amt">${fmt(p.precio)}</div></div>`).join('')}</div>` : ''}
      </div>`;
    };

    const paint = () => {
      const q = norm(C.q.trim());
      let html = '';
      if (q) {
        // Búsqueda: todos los emprendimientos que coinciden, en el mismo orden aleatorio
        const res = emps.filter(e => !C.cat || e.categoria === C.cat).map(e => empCard(e, q)).filter(Boolean);
        html = res.length ? `<div class="cat-h"><h2>Resultados</h2><span>${res.length} ${res.length === 1 ? 'emprendimiento' : 'emprendimientos'}</span></div>${res.join('')}`
          : emptyState('search', 'No encontramos eso', 'Prueba con otra palabra, por ejemplo "café" o "pulsera", o quita el filtro de categoría.');
      } else {
        html = (C.cat ? [C.cat] : cats).map(c => `<div class="cat-h"><h2><span aria-hidden="true">${catEmoji(c)}</span> ${esc(c)}</h2><span>${porCat(c).length} ${porCat(c).length === 1 ? 'emprendimiento' : 'emprendimientos'}</span></div>${porCat(c).map(e => empCard(e, '')).join('')}`).join('')
          || emptyState('bag', 'Aún no hay productos', 'Los emprendedores están cargando su catálogo. Vuelve a mirar en un rato.');
      }
      $('#cat').innerHTML = html;
      $('#cat').querySelectorAll('[data-emp] > button').forEach(b => { b.onclick = () => {
        if (C.q.trim()) return;
        const id = Number(b.parentElement.dataset.emp);
        if (C.open.has(id)) C.open.delete(id); else C.open.add(id);
        paint();
      }; });
    };
    $('#cq').oninput = debounce(() => { C.q = $('#cq').value; paint(); }, 200);
    $('#cc').querySelectorAll('[data-c]').forEach(b => { b.onclick = () => {
      C.cat = b.dataset.c;
      $('#cc').querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b));
      paint(); window.scrollTo(0, 0);
    }; });
    paint();
  };

  // ---------- Mi cuenta ----------
  VIEWS.cuenta = async (main) => {
    const me = S.me;
    main.innerHTML = `<div class="card"><div class="row"><div class="buyer" style="background:none;padding:0"><div class="ini">${esc(initials(me.nombres + ' ' + me.apellidos))}</div></div>
        <div><div style="font-weight:700">${esc(me.nombres)} ${esc(me.apellidos)}</div><div class="small muted">${esc(me.cedula)}${me.email ? ' · ' + esc(me.email) : ''}</div>
        <div class="row wrap" style="gap:6px;margin-top:6px">${roleTags(me)}</div></div></div></div>
      <div class="card"><h3 style="margin-bottom:12px">Cambiar contraseña</h3><form class="stack" id="fc">
        <label class="field"><span>Contraseña actual</span><input class="input" type="password" name="actual" required autocomplete="current-password"></label>
        <label class="field"><span>Nueva contraseña</span><input class="input" type="password" name="nueva" minlength="6" required autocomplete="new-password"></label>
        <button class="btn primary">Cambiar contraseña</button></form></div>
      ${me.es_comprador ? `<div class="card"><h3 style="margin-bottom:4px">PIN de compras</h3><p class="small muted" style="margin:0 0 12px">Lo escribes en el equipo del vendedor para pagar con tu saldo. No lo compartas.</p><form class="stack" id="fp">
        <label class="field"><span>Nuevo PIN (4 dígitos)</span><input class="input pin" name="pin" type="password" inputmode="numeric" maxlength="4" required autocomplete="off"></label>
        <label class="field"><span>Tu contraseña</span><input class="input" type="password" name="clave" required autocomplete="current-password"></label>
        <button class="btn primary">Guardar PIN</button></form></div>` : ''}
      <button class="btn danger block" id="b-logout" style="margin-top:16px">Cerrar sesión</button>`;
    $('#b-logout').onclick = logout;
    $('#fc').onsubmit = (e) => { e.preventDefault(); const f = e.target; guard(f.querySelector('button'), async () => { const r = await api('POST', '/api/me/clave', { actual: f.actual.value, nueva: f.nueva.value }); saveToken(r.token); f.reset(); toast('Contraseña actualizada'); }); };
    const fp = $('#fp');
    if (fp) fp.onsubmit = (e) => { e.preventDefault(); const f = e.target; guard(f.querySelector('button'), async () => { await api('POST', '/api/me/pin', { pin: f.pin.value, clave: f.clave.value }); f.reset(); await loadMe(); toast('PIN actualizado'); }); };
  };

  // ---------- Panel (administración) ----------
  VIEWS.panel = async (main, silent) => {
    const r = await api('GET', '/api/admin/resumen');
    if (silent && S.tab !== 'panel') return;
    const T = r.totales, E = T.estados || {};
    const pct = Number(r.saldos.asignado) ? Math.round(Number(r.saldos.usado) / Number(r.saldos.asignado) * 100) : 0;
    const totalF = Number(T.saldo) + Number(T.efectivo) + Number(T.transferencia);
    const max = Math.max(1, ...r.por_emprendimiento.map(e => e.total));
    main.innerHTML = `<div class="spread" style="margin-bottom:12px"><h2>En vivo</h2><span class="tiny muted">Actualizado ${ftime(r.generado)} · cada 15 s</span></div>
      ${r.reportes_pendientes ? `<div class="alert bad spread" style="margin-bottom:12px"><span><strong>${r.reportes_pendientes}</strong> ${r.reportes_pendientes === 1 ? 'compra reportada' : 'compras reportadas'} por compradores que no las reconocen.</span><button class="btn sm" id="b-rep">Revisar</button></div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="l">Total vendido</div><div class="v">${fmt(T.total)}</div><div class="d">${T.ventas} ${T.ventas === 1 ? 'venta confirmada' : 'ventas confirmadas'}</div></div>
        <div class="kpi"><div class="l">Compradores atendidos</div><div class="v">${T.compradores}</div><div class="d">de ${r.saldos.compradores} empleados</div></div>
        <div class="kpi"><div class="l">Saldo consumido</div><div class="v">${pct}%</div><div class="d">${fmt(r.saldos.usado)} de ${fmt(r.saldos.asignado)}</div></div>
        <div class="kpi"><div class="l">Pendientes</div><div class="v">${(E.por_confirmar || 0) + Number(T.pendientes_entrega || 0)}</div><div class="d">${E.por_confirmar || 0} por confirmar · ${T.pendientes_entrega || 0} por entregar · ${E.anulada || 0} anuladas</div></div>
      </div>
      <div class="card" style="margin-top:12px"><h3 style="margin-bottom:10px">Formas de pago</h3>
        <div class="split" role="img" aria-label="Distribución por forma de pago">${totalF ? ['saldo', 'efectivo', 'transferencia'].map(f => Number(T[f]) ? `<div class="c-${f}" style="flex:${Number(T[f])}" title="${FORMA[f]}: ${fmt(T[f])}"></div>` : '').join('') : '<div style="flex:1;background:var(--surface-2)"></div>'}</div>
        <div class="legend">${['saldo', 'efectivo', 'transferencia'].map(f => `<span><i class="c-${f}"></i>${FORMA[f]} <strong class="num" style="color:var(--ink)">${fmt(T[f])}</strong>${totalF ? ` <span class="muted">(${Math.round(Number(T[f]) / totalF * 100)}%)</span>` : ''}</span>`).join('')}</div></div>
      <div class="card"><h3 style="margin-bottom:12px">Ventas por emprendimiento</h3><div class="bars">${r.por_emprendimiento.map(e => `<div class="bar" title="${esc(e.nombre_comercial)} · ${e.ventas} ventas · saldo ${fmt(e.saldo)} · efectivo ${fmt(e.efectivo)} · transferencia ${fmt(e.transferencia)}">
          <span class="name">${esc(e.nombre_comercial)}</span><div class="track"><div class="fill" style="width:${e.total / max * 100}%"></div></div><span class="val">${fmt(e.total)}</span></div>`).join('') || '<div class="muted">Sin emprendimientos</div>'}</div></div>
      <div class="section-title"><h2>Últimas transacciones</h2><button class="btn sm" id="b-all">Ver todas</button></div>
      <div class="list" id="ul">${r.ultimas.map(v => ventaItem(v, 'admin')).join('') || '<div class="empty">Aún no hay ventas</div>'}</div>`;
    $('#b-all').onclick = () => go('aventas');
    const br = $('#b-rep'); if (br) br.onclick = () => { S.cache.af = { q: '', emp: '', estado: 'reportada' }; go('aventas'); };
    bindVentaItems($('#ul'), () => go('panel'));
  };

  // ---------- Ventas (administración) ----------
  VIEWS.aventas = async (main) => {
    const emps = S.cache.emps || (S.cache.emps = await api('GET', '/api/admin/emprendimientos'));
    const F = S.cache.af || (S.cache.af = { q: '', emp: '', estado: '' });
    main.innerHTML = `<div class="stack"><input class="input" id="aq" placeholder="Cédula, comprador o N.º de venta" value="${esc(F.q)}">
      <select class="input" id="ae"><option value="">Todos los emprendimientos</option>${emps.map(e => `<option value="${e.id}" ${String(F.emp) === String(e.id) ? 'selected' : ''}>${esc(e.nombre_comercial)}</option>`).join('')}</select>
      <div class="chips">${[['', 'Todas'], ['confirmada', 'Confirmadas'], ['por_confirmar', 'Por confirmar'], ['pendiente', 'Por entregar'], ['reportada', 'Reportadas'], ['anulada', 'Anuladas']].map(([k, l]) => `<button class="chip ${F.estado === k ? 'on' : ''}" data-e="${k}">${l}</button>`).join('')}</div></div>
      <div class="spread" style="margin:14px 2px 8px"><span class="small muted" id="acount"></span><button class="btn sm" id="ax">Exportar CSV</button></div><div class="list" id="al"></div>`;
    const load = async () => {
      const p = new URLSearchParams();
      if (F.q) p.set('q', F.q); if (F.emp) p.set('emprendimiento_id', F.emp);
      if (F.estado === 'pendiente') { p.set('estado', 'confirmada'); p.set('entrega', 'pendiente'); }
      else if (F.estado === 'reportada') p.set('reporte', 'pendiente');
      else if (F.estado) p.set('estado', F.estado);
      const rows = await api('GET', '/api/admin/ventas?' + p);
      const tot = rows.filter(v => v.estado === 'confirmada').reduce((a, v) => a + c2(v.total), 0);
      $('#acount').textContent = `${rows.length}${rows.length >= 400 ? '+' : ''} ventas · confirmadas ${fmt(m2(tot))}`;
      $('#al').innerHTML = rows.map(v => ventaItem(v, 'admin')).join('') || '<div class="empty">Sin resultados</div>';
      bindVentaItems($('#al'), load);
    };
    $('#aq').oninput = debounce(() => { F.q = $('#aq').value.trim(); load(); }, 350);
    $('#ae').onchange = () => { F.emp = $('#ae').value; load(); };
    main.querySelectorAll('[data-e]').forEach(b => { b.onclick = () => { F.estado = b.dataset.e; main.querySelectorAll('[data-e]').forEach(x => x.classList.toggle('on', x === b)); load(); }; });
    $('#ax').onclick = (e) => download('/api/admin/export/ventas', 'ventas.csv', e.currentTarget);
    await load();
  };

  // ---------- Reportes ----------
  VIEWS.reportes = async (main) => {
    const tab = S.cache.rep || 'cxc';
    main.innerHTML = `<div class="chips" style="margin-bottom:14px">${[['cxc', 'Cuentas por cobrar'], ['liq', 'Liquidación a emprendedores'], ['exp', 'Exportar']].map(([k, l]) => `<button class="chip ${tab === k ? 'on' : ''}" data-r="${k}">${l}</button>`).join('')}</div><div id="rep"><div class="empty"><span class="spinner"></span></div></div>`;
    main.querySelectorAll('[data-r]').forEach(b => { b.onclick = () => { S.cache.rep = b.dataset.r; go('reportes'); }; });
    const box = $('#rep');
    if (tab === 'cxc') {
      const rows = await api('GET', '/api/admin/cxc');
      const tot = rows.reduce((a, r) => a + c2(r.por_cobrar), 0);
      box.innerHTML = `<div class="spread" style="margin-bottom:10px"><p class="small muted" style="margin:0">Compras pagadas con saldo, por empleado (para descuento por rol).</p><button class="btn sm" id="dx">Descargar</button></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Cédula</th><th>Empleado</th><th class="n">Compras</th><th class="n">Por cobrar</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${esc(r.cedula)}</td><td>${esc(r.apellidos)} ${esc(r.nombres)}</td><td class="n">${r.compras}</td><td class="n">${fmt(r.por_cobrar)}</td></tr>`).join('') || '<tr><td colspan="4" class="center muted">Sin registros</td></tr>'}</tbody>
        <tfoot><tr><td colspan="3">Total (${rows.length} empleados)</td><td class="n">${fmt(m2(tot))}</td></tr></tfoot></table></div>`;
      $('#dx').onclick = (e) => download('/api/admin/export/cxc', 'cuentas_por_cobrar.csv', e.currentTarget);
    } else if (tab === 'liq') {
      const rows = await api('GET', '/api/admin/liquidacion');
      const s = (k) => fmt(m2(rows.reduce((a, r) => a + c2(r[k]), 0)));
      box.innerHTML = `<div class="spread" style="margin-bottom:10px"><p class="small muted" style="margin:0">La columna Saldo es lo que la empresa debe pagar a cada emprendedor.</p><button class="btn sm" id="dx">Descargar</button></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Emprendimiento</th><th class="n">Ventas</th><th class="n">Saldo</th><th class="n">Efectivo</th><th class="n">Transf.</th><th class="n">Total</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${esc(r.nombre_comercial)}<div class="tiny muted">${esc(r.emprendedor)}</div></td><td class="n">${r.ventas}</td><td class="n"><strong>${fmt(r.saldo)}</strong></td><td class="n">${fmt(r.efectivo)}</td><td class="n">${fmt(r.transferencia)}</td><td class="n">${fmt(r.total)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="n">${rows.reduce((a, r) => a + r.ventas, 0)}</td><td class="n">${s('saldo')}</td><td class="n">${s('efectivo')}</td><td class="n">${s('transferencia')}</td><td class="n">${s('total')}</td></tr></tfoot></table></div>`;
      $('#dx').onclick = (e) => download('/api/admin/export/liquidacion', 'liquidacion_emprendedores.csv', e.currentTarget);
    } else {
      box.innerHTML = `<div class="list">${[['ventas', 'Ventas (una fila por venta)'], ['detalle', 'Detalle de productos vendidos'], ['cxc', 'Cuentas por cobrar por empleado'], ['liquidacion', 'Liquidación a emprendedores']].map(([k, l]) => `<button class="item" data-x="${k}"><div class="grow"><div class="t">${l}</div><div class="s">CSV compatible con Excel</div></div>${icon('file', 20)}</button>`).join('')}</div>`;
      box.querySelectorAll('[data-x]').forEach(b => { b.onclick = () => download('/api/admin/export/' + b.dataset.x, b.dataset.x + '.csv', b); });
    }
  };

  // ---------- Usuarios (super administrador) ----------
  VIEWS.usuarios = async (main) => {
    const F = S.cache.uf || (S.cache.uf = { q: '', tipo: '' });
    main.innerHTML = `<div class="section-title"><h2>Usuarios</h2><button class="btn primary sm" id="b-nu">+ Nuevo</button></div>
      <input class="input" id="uq" placeholder="Cédula, nombre o emprendimiento" value="${esc(F.q)}">
      <div class="chips" style="margin:10px 0">${[['', 'Todos'], ['compradores', 'Compradores'], ['emprendedores', 'Emprendedores'], ['admins', 'Administradores']].map(([k, l]) => `<button class="chip ${F.tipo === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="small muted" id="ucount" style="margin-bottom:8px"></div><div class="list" id="ul"></div>`;
    let rows = [];
    const load = async () => {
      const r = await api('GET', `/api/super/usuarios?q=${encodeURIComponent(F.q)}&tipo=${F.tipo}`);
      rows = r.usuarios;
      $('#ucount').textContent = `${r.total} usuarios${r.total > rows.length ? ` (mostrando ${rows.length}; refina la búsqueda)` : ''}`;
      $('#ul').innerHTML = rows.map((u, i) => `<button class="item" data-u="${i}"><div class="grow"><div class="t">${esc(u.apellidos)} ${esc(u.nombres)} ${u.activo ? '' : '<span class="badge b-bad">Inactivo</span>'}</div>
        <div class="s">${esc(u.cedula)}${u.nombre_comercial ? ' · ' + esc(u.nombre_comercial) : ''}</div>
        <div style="margin-top:4px">${u.rol !== 'usuario' ? `<span class="badge b-info">${u.rol === 'superadmin' ? 'Super admin' : 'Admin'}</span> ` : ''}${u.nombre_comercial ? '<span class="badge b-ok">Emprendedor</span> ' : ''}${u.clave_pendiente ? '<span class="badge b-warn">Clave temporal</span>' : ''}</div></div>
        ${u.es_comprador ? `<div class="right"><div class="amt">${fmt(m2(c2(u.saldo_asignado) - c2(u.saldo_usado)))}</div><div class="tiny muted">de ${fmt(u.saldo_asignado)}</div></div>` : ''}</button>`).join('') || '<div class="empty">Sin resultados</div>';
      $('#ul').querySelectorAll('[data-u]').forEach(b => { b.onclick = () => userForm(rows[Number(b.dataset.u)], load); });
    };
    $('#uq').oninput = debounce(() => { F.q = $('#uq').value.trim(); load(); }, 350);
    main.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { F.tipo = b.dataset.t; main.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); load(); }; });
    $('#b-nu').onclick = () => newUserForm(load);
    await load();
  };
  function userForm(u, reload) {
    const b = modal('Editar usuario', `<form class="stack" id="uf">
      <div class="small muted">Cédula: <strong>${esc(u.cedula)}</strong></div>
      <div class="grid2"><label class="field"><span>Nombres</span><input class="input" name="nombres" value="${esc(u.nombres)}" required></label>
      <label class="field"><span>Apellidos</span><input class="input" name="apellidos" value="${esc(u.apellidos)}"></label></div>
      <label class="field"><span>Correo</span><input class="input" name="email" type="email" value="${esc(u.email)}"></label>
      <div class="grid2"><label class="field"><span>Rol</span><select class="input" name="rol">${[['usuario', 'Usuario'], ['admin', 'Administrador'], ['superadmin', 'Super administrador']].map(([k, l]) => `<option value="${k}" ${u.rol === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Nombre comercial</span><input class="input" name="nombre_comercial" value="${esc(u.nombre_comercial)}" placeholder="Solo emprendedores"></label></div>
      <label class="field"><span>Categoría del emprendimiento</span><select class="input" name="categoria"><option value="">— Sin categoría (Otros) —</option>${S.me.categorias.map(c => `<option ${c === u.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="es_comprador" ${u.es_comprador ? 'checked' : ''}> Es comprador (tiene saldo)</label>
      <div class="grid2"><label class="field"><span>Fecha de ingreso</span><input class="input" name="fecha_ingreso" type="date" value="${esc(u.fecha_ingreso)}"></label>
      <label class="field"><span>Saldo asignado</span><input class="input money" name="saldo_asignado" inputmode="decimal" value="${Number(u.saldo_asignado).toFixed(2)}"></label></div>
      <div class="tiny muted">Ya consumido: ${fmt(u.saldo_usado)}</div>
      <label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}> Usuario activo</label>
      <button class="btn primary block">Guardar</button></form>
      <hr class="sep"><h3 style="margin-bottom:8px">Accesos</h3><div class="btns"><button class="btn sm" data-rs="clave">Nueva contraseña</button>${u.es_comprador ? '<button class="btn sm" data-rs="pin">Nuevo PIN</button>' : ''}</div>
      <label class="check small"><input type="checkbox" id="rs-mail" ${u.email ? '' : 'disabled'}> Enviar también por correo</label><div id="rs-out"></div>`);
    $('#uf', b).onsubmit = (e) => {
      e.preventDefault(); const f = e.target;
      const body = { nombres: f.nombres.value, apellidos: f.apellidos.value, email: f.email.value, rol: f.rol.value, nombre_comercial: f.nombre_comercial.value, categoria: f.categoria.value,
        es_comprador: f.es_comprador.checked, fecha_ingreso: f.fecha_ingreso.value, saldo_asignado: Number(f.saldo_asignado.value.replace(',', '.')), activo: f.activo.checked };
      guard(f.querySelector('button'), async () => { await api('PUT', '/api/super/usuarios/' + u.id, body); closeModal(); toast('Usuario actualizado'); reload(); });
    };
    b.querySelectorAll('[data-rs]').forEach(btn => { btn.onclick = () => guard(btn, async () => {
      const r = await api('POST', `/api/super/usuarios/${u.id}/reset`, { [btn.dataset.rs]: true, enviar: $('#rs-mail').checked });
      $('#rs-out').innerHTML = `<div class="alert ok" style="margin-top:10px">${r.clave_temporal ? `Contraseña temporal:<div class="cred">${esc(r.clave_temporal)}</div>` : ''}${r.pin ? `PIN:<div class="cred">${esc(r.pin)}</div>` : ''}${r.enviado ? '<div class="tiny" style="margin-top:6px">También se envió por correo.</div>' : ''}</div>`;
    }); });
  }
  function newUserForm(reload) {
    const b = modal('Nuevo usuario', `<form class="stack" id="nf"><label class="field"><span>Cédula</span><input class="input" name="cedula" inputmode="numeric" required></label>
      <div class="grid2"><label class="field"><span>Nombres</span><input class="input" name="nombres" required></label><label class="field"><span>Apellidos</span><input class="input" name="apellidos"></label></div>
      <label class="field"><span>Correo</span><input class="input" name="email" type="email"></label>
      <label class="field"><span>Rol</span><select class="input" name="rol"><option value="admin">Administrador</option><option value="superadmin">Super administrador</option><option value="usuario">Usuario</option></select></label>
      <p class="tiny muted" style="margin:0">Para compradores y emprendedores lo habitual es importar el Excel desde Ajustes.</p>
      <button class="btn primary block">Crear</button></form>`);
    $('#nf', b).onsubmit = (e) => {
      e.preventDefault(); const f = e.target;
      guard(f.querySelector('button'), async () => {
        const r = await api('POST', '/api/super/usuarios', { cedula: f.cedula.value, nombres: f.nombres.value, apellidos: f.apellidos.value, email: f.email.value, rol: f.rol.value });
        b.innerHTML = `<div class="alert ok">Usuario creado. Contraseña temporal:<div class="cred">${esc(r.clave_temporal)}</div><div class="tiny" style="margin-top:6px">Entrégala al usuario; deberá cambiarla al ingresar.</div></div>`;
        reload();
      });
    };
  }

  // ---------- Ajustes (super administrador) ----------
  VIEWS.ajustes = async (main) => {
    const [cfg, mail] = await Promise.all([api('GET', '/api/super/config'), api('GET', '/api/super/correos')]);
    const fileBox = (k, title, help, extra = '') => `<div class="card"><h3>${title}</h3><p class="small muted" style="margin:4px 0 10px">${help}</p>
      <input type="file" id="f-${k}" accept=".xlsx,.csv" class="input" style="padding:8px">${extra}
      <button class="btn primary block" data-imp="${k}" style="margin-top:10px">Importar</button><div id="o-${k}"></div></div>`;
    main.innerHTML = `<div class="section-title"><h2>Importar datos</h2><a class="btn sm" href="plantillas/plantilla_emprendedores.xlsx" download>Plantilla emprendedores</a></div>
      ${fileBox('emprendedores', 'Emprendedores', 'Columnas: Cédula, Nombres, Apellidos, Nombre comercial, Contraseña, Email y, opcional, Categoría (una de las categorías configuradas abajo). Si la cédula ya existe, se actualiza.')}
      ${fileBox('compradores', 'Compradores', 'Columnas: Cédula, Nombres, Apellidos, Fecha de ingreso, Saldo, Email. A los nuevos se les genera contraseña temporal y PIN.', `<label class="check small"><input type="checkbox" id="recalc"> Ignorar la columna Saldo y calcularlo con la regla configurada</label>`)}
      <p class="tiny muted"><a href="plantillas/plantilla_compradores.xlsx" download>Descargar plantilla de compradores</a></p>
      <div class="section-title"><h2>Accesos de compradores</h2></div>
      <div class="card stack"><p class="small" style="margin:0">Envía a cada usuario su contraseña temporal y su PIN. Para quienes no tienen correo, descarga el listado e imprímelo.</p>
        <div class="btns"><button class="btn primary" id="b-send">Enviar accesos por correo</button><button class="btn" id="b-cred">Descargar credenciales (CSV)</button></div>
        <div class="alert warn small">El archivo de credenciales contiene contraseñas y PIN: compártelo solo con quien entregará los accesos.</div>
        <p class="small" style="margin:0">Cuando todos hayan recibido sus accesos, borra las copias legibles de las contraseñas y PIN temporales. Los usuarios podrán seguir ingresando con lo que recibieron.</p>
        <div class="btns"><button class="btn danger" id="b-clean">Borrar credenciales temporales</button></div></div>
      <div class="section-title"><h2>Reglas del evento</h2></div>
      <form class="card stack" id="cf">
        <label class="field"><span>Nombre del evento</span><input class="input" name="nombre_evento" value="${esc(cfg.nombre_evento)}"></label>
        <div class="grid2"><label class="field"><span>Fecha del evento</span><input class="input" type="date" name="fecha_evento" value="${esc(cfg.fecha_evento)}"></label>
        <label class="field"><span>Hora</span><input class="input" type="time" name="hora_evento" value="${esc(cfg.hora_evento)}"></label></div>
        <div class="grid3"><label class="field"><span>Saldo base ($)</span><input class="input money" name="saldo_base" value="${esc(cfg.saldo_base)}"></label>
        <label class="field"><span>Adicional por antigüedad ($)</span><input class="input money" name="saldo_antiguedad" value="${esc(cfg.saldo_antiguedad)}"></label>
        <label class="field"><span>Más de … días</span><input class="input money" name="dias_antiguedad" value="${esc(cfg.dias_antiguedad)}"></label></div>
        <div class="grid2"><label class="field"><span>Plazo de entrega con saldo (horas)</span><input class="input money" name="horas_entrega_cxc" value="${esc(cfg.horas_entrega_cxc)}"></label>
        <label class="field"><span>Minutos para confirmar en la app</span><input class="input money" name="minutos_confirmacion" value="${esc(cfg.minutos_confirmacion)}"></label></div>
        <label class="field"><span>Categorías del catálogo (en este orden, separadas por coma)</span><textarea class="input" name="categorias" rows="2">${esc(cfg.categorias)}</textarea></label>
        <div class="grid2"><label class="field"><span>Pago con PIN de 4 dígitos</span><select class="input" name="pago_con_pin">
            <option value="1" ${cfg.pago_con_pin !== '0' ? 'selected' : ''}>Permitido (PIN o código)</option>
            <option value="0" ${cfg.pago_con_pin === '0' ? 'selected' : ''}>Desactivado (solo código o app)</option></select></label>
          <label class="field"><span>Duración del código de pago (min)</span><input class="input money" name="minutos_codigo_pago" value="${esc(cfg.minutos_codigo_pago)}"></label></div>
        <p class="tiny muted" style="margin:0">El código de pago lo genera el comprador en su celular y sirve una sola vez. Si desactivas el PIN, nadie puede pagar con un PIN escuchado; quien no tenga celular puede pagar en efectivo o pedir ayuda en la mesa de soporte.</p>
        <div class="btns"><button class="btn primary grow">Guardar reglas</button><button class="btn grow" type="button" id="b-recalc">Recalcular saldos de todos</button></div></form>
      <div class="section-title"><h2>Correos</h2><button class="btn sm" id="b-retry">Reintentar fallidos</button></div>
      <div class="card">${mail.smtp ? '' : '<div class="alert warn small" style="margin-bottom:10px">El servidor de correo (SMTP) no está configurado: los correos quedan en cola y se enviarán cuando se configure.</div>'}
        <div class="row wrap">${Object.entries(mail.estados).map(([k, n]) => `<span class="badge ${k === 'enviado' ? 'b-ok' : k === 'error' ? 'b-bad' : 'b-warn'}">${k}: ${n}</span>`).join(' ') || '<span class="muted small">Sin correos</span>'}</div>
        ${mail.ultimos.length ? `<div class="table-wrap" style="box-shadow:none;margin-top:10px;max-height:280px"><table class="t"><thead><tr><th>Para</th><th>Asunto</th><th>Estado</th></tr></thead><tbody>${mail.ultimos.map(m => `<tr><td>${esc(m.para)}</td><td>${esc(m.asunto)}</td><td title="${esc(m.error)}">${esc(m.estado)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;

    main.querySelectorAll('[data-imp]').forEach(btn => { btn.onclick = () => {
      const k = btn.dataset.imp, file = $('#f-' + k).files[0];
      if (!file) return toast('Selecciona el archivo', true);
      guard(btn, async () => {
        const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(file); });
        const r = await api('POST', '/api/super/importar/' + k, { filename: file.name, data, recalcular: k === 'compradores' && $('#recalc').checked });
        $('#o-' + k).innerHTML = `<div class="alert ${r.errores.length ? 'warn' : 'ok'}" style="margin-top:10px">${r.total} filas: ${r.creados} creados, ${r.actualizados} actualizados, ${r.errores.length} con error.
          ${r.errores.length ? `<ul style="margin:6px 0 0;padding-left:18px">${r.errores.slice(0, 50).map(e => `<li>Fila ${e.fila}: ${esc(e.error)}</li>`).join('')}</ul>` : ''}</div>`;
        S.cache.emps = null;
      });
    }; });
    $('#b-send').onclick = async (e) => {
      const btn = e.currentTarget;
      if (!(await ask('Enviar accesos', '<p>Se enviará un correo a cada usuario que aún tenga contraseña temporal o PIN sin cambiar.</p>', 'Enviar'))) return;
      closeModal();
      guard(btn, async () => { const r = await api('POST', '/api/super/enviar-accesos', {}); toast(`${r.encolados} correos en cola · ${r.sin_correo} sin correo${r.smtp ? '' : ' · SMTP sin configurar'}`); });
    };
    $('#b-cred').onclick = (e) => download('/api/admin/export/credenciales', 'credenciales.csv', e.currentTarget);
    $('#b-clean').onclick = async (e) => {
      const btn = e.currentTarget;
      if (!(await ask('Borrar credenciales temporales', '<p>Ya no se podrán reenviar ni descargar las contraseñas y PIN temporales. Para quien los pierda, use <strong>Resetear</strong> en Usuarios.</p>', 'Borrar'))) return;
      closeModal();
      guard(btn, async () => { const r = await api('POST', '/api/super/limpiar-temporales', {}); toast(`${r.limpiados} usuarios sin credenciales temporales guardadas`); });
    };
    $('#cf').onsubmit = (e) => {
      e.preventDefault(); const f = e.target; const body = {};
      f.querySelectorAll('[name]').forEach(i => { body[i.name] = i.value; });
      guard(f.querySelector('button'), async () => { await api('PUT', '/api/super/config', body); await loadMe(); toast('Reglas guardadas'); });
    };
    $('#b-recalc').onclick = async (e) => {
      const btn = e.currentTarget;
      if (!(await ask('Recalcular saldos', '<p>Se reemplazará el saldo asignado de todos los compradores usando la regla actual (base + adicional por antigüedad a la fecha del evento). Guarda primero las reglas si las cambiaste.</p>', 'Recalcular'))) return;
      closeModal();
      guard(btn, async () => { const r = await api('POST', '/api/super/recalcular-saldos', {}); toast(`${r.actualizados} saldos recalculados${r.avisos.length ? ` · ${r.avisos.length} avisos` : ''}`); });
    };
    $('#b-retry').onclick = (e) => guard(e.currentTarget, async () => { await api('POST', '/api/super/correos/reintentar', {}); toast('Reintentando envíos'); });
  };

  netBar();
  start();
})();

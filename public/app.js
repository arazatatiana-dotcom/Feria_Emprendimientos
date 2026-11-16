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
  };
  const icon = (n, size = 22) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'on' + (err ? ' err' : '');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, err ? 4500 : 2600);
  }

  // ================= API =================
  const S = { token: localStorage.getItem('feria_token'), me: null, tab: null, cache: {} };
  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
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

  function renderLogin() {
    document.title = 'Ingresar · Feria de Emprendedores';
    $('#app').innerHTML = `<div class="login"><form class="card stack" id="f-login" autocomplete="on">
      <img src="icon.svg" class="logo" alt="">
      <div><h1>Feria de Emprendedores</h1><p class="muted small" style="margin:4px 0 0">Ingresa con tu cédula y contraseña</p></div>
      <label class="field"><span>Cédula</span><input class="input" name="cedula" inputmode="numeric" autocomplete="username" required></label>
      <label class="field"><span>Contraseña</span><input class="input" name="clave" type="password" autocomplete="current-password" required></label>
      <button class="btn primary block lg" type="submit">Ingresar</button>
      <p class="tiny muted center" style="margin:6px 0 0">¿Olvidaste tu contraseña? Acércate a la mesa de ayuda del evento.</p>
    </form></div>`;
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
      <label class="field"><span>Contraseña actual (temporal)</span><input class="input" name="actual" type="password" required autocomplete="current-password"></label>
      <label class="field"><span>Nueva contraseña (mínimo 6 caracteres)</span><input class="input" name="nueva" type="password" minlength="6" required autocomplete="new-password"></label>
      <label class="field"><span>Repite la nueva contraseña</span><input class="input" name="rep" type="password" minlength="6" required autocomplete="new-password"></label>
      <button class="btn primary block lg">Guardar y continuar</button>
      <button class="btn ghost block" type="button" id="b-out">Salir</button></form></div>`;
    $('#b-out').onclick = logout;
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
  function renderShell() {
    const me = S.me;
    const sub = me.emprendimiento ? me.emprendimiento.nombre_comercial : ({ superadmin: 'Super administrador', admin: 'Administrador' }[me.rol] || `${me.nombres} ${me.apellidos}`);
    $('#app').innerHTML = `<header class="topbar"><div><div class="title">${esc(me.evento.nombre)}</div><div class="sub">${esc(sub)}</div></div>
      <button class="avatar" id="b-me" title="Mi cuenta">${esc(initials(me.nombres + ' ' + me.apellidos))}</button></header>
      <div class="shell"><nav class="nav" id="nav"></nav><main id="main"></main></div>`;
    $('#b-me').onclick = () => go('cuenta');
    renderNav();
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
        const prev = S.me.por_confirmar;
        await loadMe(); renderNav();
        if (S.tab === 'inicio' && prev !== S.me.por_confirmar) go('inicio');
        else if (S.me.por_confirmar > prev) toast('Tienes una compra por confirmar');
      }
      if (S.tab === 'panel') VIEWS.panel($('#main'), true);
    } catch (_) { /* sin conexión momentánea */ }
  }, 15000);

  // ================= Elementos comunes =================
  function estadoBadges(v) {
    const b = [];
    if (v.estado === 'anulada') b.push('<span class="badge b-bad">Anulada</span>');
    else if (v.estado === 'por_confirmar') b.push('<span class="badge b-warn">Por confirmar</span>');
    else b.push('<span class="badge b-ok">Confirmada</span>');
    if (v.estado !== 'anulada' && v.estado_entrega === 'pendiente') b.push('<span class="badge b-info">Entrega pendiente</span>');
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
    if (esVend && v.estado === 'por_confirmar') acc.push('<button class="btn primary grow" data-a="pin">Confirmar con PIN</button>');
    if (esVend && v.estado === 'confirmada' && v.estado_entrega === 'pendiente') acc.push('<button class="btn primary grow" data-a="ent">Marcar entregado</button>');
    if (esVend && v.estado !== 'anulada') acc.push('<button class="btn grow" data-a="edit">Modificar</button>');
    if ((esVend || esSuper) && v.estado !== 'anulada') acc.push('<button class="btn danger grow" data-a="anul">Anular</button>');
    if ((esVend || esComp || ['admin', 'superadmin'].includes(me.rol)) && v.estado !== 'por_confirmar') acc.push('<button class="btn grow" data-a="mail">Enviar por correo</button>');
    const ACC = { creada: 'Registrada', modificada: 'Modificada', confirmada: 'Confirmada por el comprador', anulada: 'Anulada', anulada_automatica: 'Anulada automáticamente', entregada: 'Entregada' };
    b.innerHTML = `<div class="stack">
      <div>${estadoBadges(v)}</div>
      ${v.estado === 'por_confirmar' ? `<div class="alert warn">Esperando que el comprador confirme el pago con saldo (vence a las ${ftime(v.expira_confirmacion)}).</div>` : ''}
      ${v.estado === 'anulada' ? `<div class="alert bad">Motivo: ${esc(v.motivo_anulacion)}</div>` : ''}
      ${v.estado !== 'anulada' && v.fecha_limite_entrega && v.estado_entrega === 'pendiente' ? `<div class="alert info">Entregar a más tardar el ${fdate(v.fecha_limite_entrega, { weekday: 'short' })}. Si no se entrega, se anula automáticamente.</div>` : ''}
      <div class="card flat"><div class="spread"><div><div class="muted tiny">Emprendimiento</div><strong>${esc(v.nombre_comercial)}</strong></div><div class="right"><div class="muted tiny">Comprador</div><strong>${esc(v.comprador_nombre)}</strong><div class="tiny muted">${esc(v.comprador_cedula)}</div></div></div></div>
      <div class="card flat"><table class="lines">${v.detalle.map(d => `<tr><td>${d.cantidad} × ${esc(d.descripcion)}${d.entrega_posterior ? ' <span class="badge b-info">posterior</span>' : ''}<div class="tiny muted">${fmt(d.precio_unit)} c/u</div></td><td class="right num">${fmt(d.subtotal)}</td></tr>`).join('')}
        <tr class="tot"><td>Total</td><td class="right num">${fmt(v.total)}</td></tr>
        ${v.pagos.map(p => `<tr><td class="muted">${FORMA[p.forma]}${p.forma === 'saldo' ? ' <span class="tiny">(cuenta por cobrar)</span>' : ''}</td><td class="right num muted">${fmt(p.monto)}</td></tr>`).join('')}</table></div>
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
          const r = await ask('PIN del comprador', `<p class="muted small">Pide a ${esc(v.comprador_nombre)} que escriba su PIN.</p><input class="input pin" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off">`, 'Confirmar');
          if (!r) return openVenta(id, after);
          return guard($('#q-ok'), async () => { await api('POST', `/api/ventas/${id}/confirmar`, { pin: r.pin }); done('Venta confirmada'); });
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
  function newSale() { return { comprador: null, cart: {}, pagos: { saldo: '', efectivo: '', transferencia: '' }, touched: false, auth: 'pin', pin: '', editId: null, orig: {}, motivo: '' }; }
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
        <div class="steps-h"><span class="n">1</span>Comprador</div>
        ${c ? `<div class="buyer"><div class="ini">${esc(initials(c.nombre))}</div><div class="grow"><div style="font-weight:600">${esc(c.nombre)}</div><div class="small muted">${esc(c.cedula)}</div></div>
          <div class="right"><div class="tiny muted">Saldo disponible</div><div style="font-weight:700;font-size:18px" class="num">${fmt(m2(c2(c.saldo_disponible) + c2(c.saldo_previo || 0)))}</div></div></div>
          ${s.editId ? '' : '<button class="btn sm ghost" id="b-chg" style="margin-top:6px">Cambiar comprador</button>'}`
        : `<input class="input" id="q-comp" placeholder="Cédula, nombre o apellido" autocomplete="off" inputmode="search"><div id="r-comp" style="margin-top:8px"></div>`}
      </div>
      <div class="card">
        <div class="steps-h"><span class="n">2</span>Productos</div>
        ${prods.length > 8 ? '<input class="input" id="q-prod" placeholder="Buscar producto" style="margin-bottom:8px">' : ''}
        ${!prods.length ? '<div class="empty">Aún no tienes productos. <a href="#productos" id="go-prod">Agrégalos aquí</a>.</div>' : ''}
        <div id="prod-list">${prods.map(p => {
          const l = s.cart[p.id]; const a = avail(p);
          return `<div class="prod" data-name="${esc(p.nombre.toLowerCase())}"><div><div class="n">${esc(p.nombre)}</div><div class="p">${fmt(p.precio)} · ${a > 0 ? `${a} disponibles` : '<span style="color:var(--warn)">sin stock hoy</span>'}</div></div>
            <div class="stepper"><button data-dec="${p.id}" aria-label="Quitar">−</button><span>${l ? l.cant : 0}</span><button data-inc="${p.id}" aria-label="Agregar">+</button></div>
            ${l ? `<label class="check later"><input type="checkbox" data-later="${p.id}" ${l.later ? 'checked' : ''} ${a <= 0 && !l.later ? 'disabled' : ''}> Entrega posterior (no descuenta stock de hoy)</label>` : ''}</div>`;
        }).join('')}</div>
      </div>
      <div class="card" id="pay-card">
        <div class="steps-h"><span class="n">3</span>Forma de pago</div>
        ${['saldo', 'efectivo', 'transferencia'].map(f => `<div class="pay"><label for="p-${f}">${FORMA[f]}${f === 'saldo' ? ' <span class="tiny muted">(cuenta por cobrar)</span>' : ''}</label>
          <input class="input money" id="p-${f}" data-pay="${f}" inputmode="decimal" placeholder="0.00" value="${esc(s.pagos[f])}" ${f === 'saldo' && (!c || !c.saldo_disponible && !c.saldo_previo) ? 'disabled' : ''}></div>`).join('')}
        <div class="btns" style="margin:6px 0 4px"><button class="btn sm" data-fill="saldo">Todo saldo</button><button class="btn sm" data-fill="efectivo">Todo efectivo</button><button class="btn sm" data-fill="transferencia">Todo transferencia</button></div>
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
        if (v.length < 3) { box.innerHTML = '<div class="tiny muted">Escribe al menos 3 caracteres</div>'; return; }
        try {
          const rs = await api('GET', '/api/compradores?q=' + encodeURIComponent(v));
          if (q.value.trim() !== v) return;
          box.innerHTML = rs.length ? `<div class="list">${rs.map((r, i) => `<button class="item" data-i="${i}"><div class="grow"><div class="t">${esc(r.nombre)}</div><div class="s">${esc(r.cedula)}</div></div><div class="amt">${fmt(r.saldo_disponible)}</div></button>`).join('')}</div>` : '<div class="muted small">Sin resultados</div>';
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
      <div class="chips" style="margin-bottom:10px"><button class="chip ${s.auth === 'pin' ? 'on' : ''}" data-auth="pin">PIN aquí</button><button class="chip ${s.auth === 'app' ? 'on' : ''}" data-auth="app">Aprobar en su celular</button></div>
      ${s.auth === 'pin' ? `<input class="input pin" id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" value="${esc(s.pin)}"><div class="tiny muted center" style="margin-top:6px">El comprador escribe su PIN de 4 dígitos</div>`
      : `<div class="alert info small">La venta quedará <strong>por confirmar</strong>. El comprador debe aprobarla en la app (Mis compras) en los próximos ${S.me.evento.minutos_confirmacion} minutos; si no, se anula sola.</div>`}`;
    box.querySelectorAll('[data-auth]').forEach(b => { b.onclick = () => { s.auth = b.dataset.auth; box.dataset.state = ''; updateTotals(); }; });
    const pin = $('#pin'); if (pin) pin.oninput = () => { s.pin = pin.value.replace(/\D/g, '').slice(0, 4); pin.value = s.pin; };
  }

  async function saveSale(btn) {
    const s = S.sale;
    const { total, paid, saldo, saldoMax } = saleTotals();
    if (!s.comprador) return toast('Selecciona el comprador', true);
    if (!total) return toast('Agrega al menos un producto', true);
    if (paid !== total) return toast('Las formas de pago no cuadran con el total', true);
    if (saldo > saldoMax) return toast('Saldo insuficiente', true);
    const needAuth = saldo > 0 && (!s.editId || saldo > c2(s.comprador.saldo_previo || 0));
    if (needAuth && s.auth === 'pin' && s.pin.length !== 4) return toast('Ingresa el PIN de 4 dígitos o elige "Aprobar en su celular"', true);
    const body = {
      comprador_id: s.comprador.id,
      items: Object.entries(s.cart).map(([pid, l]) => ({ producto_id: Number(pid), cantidad: l.cant, entrega_posterior: l.later })),
      pagos: ['saldo', 'efectivo', 'transferencia'].map(f => ({ forma: f, monto: m2(c2(s.pagos[f])) })).filter(p => p.monto > 0),
      pin: needAuth && s.auth === 'pin' ? s.pin : undefined, motivo: s.motivo || undefined,
    };
    await guard(btn, async () => {
      const v = s.editId ? await api('PUT', '/api/ventas/' + s.editId, body) : await api('POST', '/api/ventas', body);
      S.sale = newSale();
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
      $('#vl').innerHTML = rows.length ? rows.map(v => ventaItem(v, 'vendedor')).join('') : '<div class="empty">No hay ventas</div>';
      bindVentaItems($('#vl'), () => go('ventas'));
    };
    $('#vq').oninput = paint;
    main.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => { S.cache.vfiltro = b.dataset.f; go('ventas'); }; });
    paint();
  };

  // ---------- Productos ----------
  VIEWS.productos = async (main) => {
    const prods = await api('GET', '/api/productos');
    main.innerHTML = `<div class="section-title"><h2>Mis productos</h2><button class="btn primary sm" id="b-add">+ Agregar</button></div>
      <div class="list">${prods.length ? prods.map(p => `<button class="item" data-p="${p.id}"><div class="grow"><div class="t">${esc(p.nombre)} ${p.activo ? '' : '<span class="badge b-mute">Oculto</span>'}</div>
        <div class="s">${p.descripcion ? esc(p.descripcion) : ''}</div></div><div class="right"><div class="amt">${fmt(p.precio)}</div>
        <div class="tiny"><span class="badge ${p.stock > 0 ? 'b-ok' : 'b-warn'}">Stock ${p.stock}</span></div></div></button>`).join('') : '<div class="empty">Agrega los productos que venderás en la feria.</div>'}</div>
      <p class="tiny muted" style="margin-top:12px">El stock es lo disponible el día del evento. Los pedidos con entrega posterior no lo descuentan.</p>`;
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
    main.innerHTML = `<div class="balance"><div class="lbl">Saldo disponible para compras</div><div class="big">${fmt(s.disponible)}</div>
        <div class="meta"><span>Asignado ${fmt(s.asignado)}</span><span>Usado ${fmt(s.usado)}</span></div></div>
      ${S.me.pin_temporal ? '<div class="alert warn" style="margin-top:12px">Te recomendamos cambiar el PIN que recibiste por correo. <a href="#cuenta" id="go-c">Cambiar PIN</a></div>' : ''}
      ${pend.length ? `<div class="section-title"><h2>Por confirmar</h2></div>${pend.map(v => `<div class="card" style="border:2px solid var(--accent)">
          <div class="spread"><div><strong>${esc(v.nombre_comercial)}</strong><div class="small muted">N.º ${v.id} · ${ftime(v.creado)} · vence ${ftime(v.expira_confirmacion)}</div></div><div style="font-size:20px;font-weight:700" class="num">${fmt(v.total)}</div></div>
          <div class="small" style="margin:8px 0">${v.detalle.map(d => `${d.cantidad}× ${esc(d.descripcion)}`).join(', ')}</div>
          <div class="small muted">${v.pagos.map(p => `${FORMA[p.forma]}: ${fmt(p.monto)}`).join(' · ')}</div>
          <div class="btns" style="margin-top:12px"><button class="btn primary grow" data-ok="${v.id}">Confirmar</button><button class="btn danger grow" data-no="${v.id}">Rechazar</button></div></div>`).join('')}` : ''}
      <div class="section-title"><h2>Mis compras</h2></div>
      <div class="list" id="cl">${compras.filter(v => v.estado !== 'por_confirmar').map(v => ventaItem(v, 'comprador')).join('') || '<div class="empty">Aún no tienes compras</div>'}</div>`;
    const gc = $('#go-c'); if (gc) gc.onclick = (e) => { e.preventDefault(); go('cuenta'); };
    main.querySelectorAll('[data-ok]').forEach(b => { b.onclick = () => guard(b, async () => { await api('POST', `/api/ventas/${b.dataset.ok}/confirmar`, {}); toast('Compra confirmada'); go('inicio'); }); });
    main.querySelectorAll('[data-no]').forEach(b => { b.onclick = async () => {
      if (!(await ask('Rechazar compra', '<p>La venta se anulará y tu saldo quedará libre.</p>', 'Rechazar', true))) return;
      closeModal(); guard(b, async () => { await api('POST', `/api/ventas/${b.dataset.no}/rechazar`, {}); toast('Compra rechazada'); go('inicio'); });
    }; });
    bindVentaItems($('#cl'), () => go('inicio'));
  };

  // ---------- Catálogo ----------
  VIEWS.catalogo = async (main) => {
    const prods = await api('GET', '/api/catalogo');
    const emps = [...new Map(prods.map(p => [p.emprendimiento_id, p.nombre_comercial])).entries()];
    main.innerHTML = `<input class="input" id="cq" placeholder="Buscar producto o emprendimiento" style="margin-bottom:12px"><div id="cat"></div>`;
    const paint = () => {
      const t = $('#cq').value.trim().toLowerCase();
      $('#cat').innerHTML = emps.map(([id, name]) => {
        const ps = prods.filter(p => p.emprendimiento_id === id && (!t || p.nombre.toLowerCase().includes(t) || name.toLowerCase().includes(t)));
        if (!ps.length) return '';
        return `<div class="section-title"><h3>${esc(name)}</h3></div><div class="list">${ps.map(p => `<div class="item" style="cursor:default"><div class="grow"><div class="t">${esc(p.nombre)}</div>
          <div class="s">${p.descripcion ? esc(p.descripcion) + ' · ' : ''}${p.stock > 0 ? `${p.stock} disponibles` : 'Bajo pedido'}</div></div><div class="amt">${fmt(p.precio)}</div></div>`).join('')}</div>`;
      }).join('') || '<div class="empty">No hay productos todavía</div>';
    };
    $('#cq').oninput = paint; paint();
  };

  // ---------- Mi cuenta ----------
  VIEWS.cuenta = async (main) => {
    const me = S.me;
    main.innerHTML = `<div class="card"><div class="row"><div class="buyer" style="background:none;padding:0"><div class="ini">${esc(initials(me.nombres + ' ' + me.apellidos))}</div></div>
        <div><div style="font-weight:700">${esc(me.nombres)} ${esc(me.apellidos)}</div><div class="small muted">${esc(me.cedula)}${me.email ? ' · ' + esc(me.email) : ''}</div></div></div></div>
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
    bindVentaItems($('#ul'), () => go('panel'));
  };

  // ---------- Ventas (administración) ----------
  VIEWS.aventas = async (main) => {
    const emps = S.cache.emps || (S.cache.emps = await api('GET', '/api/admin/emprendimientos'));
    const F = S.cache.af || (S.cache.af = { q: '', emp: '', estado: '' });
    main.innerHTML = `<div class="stack"><input class="input" id="aq" placeholder="Cédula, comprador o N.º de venta" value="${esc(F.q)}">
      <select class="input" id="ae"><option value="">Todos los emprendimientos</option>${emps.map(e => `<option value="${e.id}" ${String(F.emp) === String(e.id) ? 'selected' : ''}>${esc(e.nombre_comercial)}</option>`).join('')}</select>
      <div class="chips">${[['', 'Todas'], ['confirmada', 'Confirmadas'], ['por_confirmar', 'Por confirmar'], ['pendiente', 'Por entregar'], ['anulada', 'Anuladas']].map(([k, l]) => `<button class="chip ${F.estado === k ? 'on' : ''}" data-e="${k}">${l}</button>`).join('')}</div></div>
      <div class="spread" style="margin:14px 2px 8px"><span class="small muted" id="acount"></span><button class="btn sm" id="ax">Exportar CSV</button></div><div class="list" id="al"></div>`;
    const load = async () => {
      const p = new URLSearchParams();
      if (F.q) p.set('q', F.q); if (F.emp) p.set('emprendimiento_id', F.emp);
      if (F.estado === 'pendiente') { p.set('estado', 'confirmada'); p.set('entrega', 'pendiente'); } else if (F.estado) p.set('estado', F.estado);
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
      const body = { nombres: f.nombres.value, apellidos: f.apellidos.value, email: f.email.value, rol: f.rol.value, nombre_comercial: f.nombre_comercial.value,
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
      ${fileBox('emprendedores', 'Emprendedores', 'Columnas: Cédula, Nombres, Apellidos, Nombre comercial, Contraseña, Email. Si la cédula ya existe, se actualiza.')}
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

  start();
})();

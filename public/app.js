/* Póker entre Amigos — cliente. Sin dependencias salvo socket.io. */
import { sounds } from './sound.js';

const $app = document.getElementById('app');
const state = { user: null, mailConfigured: false };

// ------------------------------------------------------------------ utilidades
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dtFmt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const tFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtDate = (iso) => (iso ? dtFmt.format(new Date(iso)) : '—');
const fmtTime = (iso) => (iso ? tFmt.format(new Date(iso)) : '—');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);
const initial = (name) => esc(String(name || '?').slice(0, 1).toUpperCase());

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Revisá tu conexión.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* vacío */ }
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5000 : 3200);
}

function modal(html, onMount) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  root.appendChild(back);
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  onMount && onMount(back.querySelector('.modal'), close);
  const f = back.querySelector('input, button.primary, button');
  f && f.focus();
  return close;
}

function confirmDialog(title, text, okLabel = 'Confirmar', danger = true) {
  return new Promise((resolve) => {
    modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="row"><button class="btn ghost" data-close>Cancelar</button>
      <button class="btn ${danger ? 'red' : 'primary'}" id="ok">${esc(okLabel)}</button></div>`, (m, close) => {
      m.querySelector('#ok').addEventListener('click', () => { close(); resolve(true); });
      m.parentElement.addEventListener('click', (e) => { if (e.target === m.parentElement || e.target.hasAttribute('data-close')) resolve(false); });
      m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => resolve(false)));
    });
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles', 'ok'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copiado al portapapeles', 'ok'); } catch { toast('No se pudo copiar. Copialo manualmente.', 'err'); }
    ta.remove();
  }
}

const inviteLink = (code) => `${location.origin}/m/${code}`;

const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAME = { s: 'picas', h: 'corazones', d: 'diamantes', c: 'tréboles' };
const RANK_TXT = (r) => (r === 'T' ? '10' : r);
function cardHtml(c, extra = '') {
  if (!c) return `<div class="card back ${extra}" aria-label="carta oculta"></div>`;
  const red = c[1] === 'h' || c[1] === 'd';
  return `<div class="card ${red ? 'red' : ''} ${extra}" aria-label="${RANK_TXT(c[0])} de ${SUIT_NAME[c[1]]}"><span class="r">${RANK_TXT(c[0])}</span><span class="s">${SUIT[c[1]]}</span></div>`;
}
function miniCards(cards) {
  return `<span class="minicards">${(cards || []).map((c) => `<span class="minicard ${c[1] === 'h' || c[1] === 'd' ? 'red' : ''}">${RANK_TXT(c[0])}${SUIT[c[1]]}</span>`).join('')}</span>`;
}

// ------------------------------------------------------------------ router
let cleanup = null;
function navigate(path, replace = false) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  route();
}
window.addEventListener('popstate', () => route());
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); navigate(a.getAttribute('href')); }
});

async function route() {
  if (cleanup) { const c = cleanup; cleanup = null; c(); }
  document.getElementById('modal-root').innerHTML = '';
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  if (path === '/restablecer') return renderReset(params.get('token'));
  if (!state.user) {
    if (path.startsWith('/m/') || path.startsWith('/historial')) sessionStorage.setItem('afterLogin', path);
    return renderAuth();
  }
  const after = sessionStorage.getItem('afterLogin');
  if (after) { sessionStorage.removeItem('afterLogin'); if (after !== path) return navigate(after, true); }

  let m;
  if (path === '/' || path === '/mesas') return renderLobby();
  if (path === '/crear') return renderCreate();
  if (path === '/historial') return renderHistory();
  if ((m = path.match(/^\/historial\/([\w-]+)$/))) return renderSession(m[1]);
  if (path === '/reglas') return renderRules();
  if ((m = path.match(/^\/m\/([A-Za-z0-9]{4,12})$/))) return renderJoin(m[1].toUpperCase());
  navigate('/', true);
}

// ------------------------------------------------------------------ chrome
function shell(active, inner) {
  const u = state.user;
  $app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="/" data-link>♠ Póker <span>entre Amigos</span></a>
    <nav class="tabs" aria-label="Secciones">
      <a class="tab ${active === 'lobby' ? 'active' : ''}" href="/" data-link>Mesas</a>
      <a class="tab ${active === 'history' ? 'active' : ''}" href="/historial" data-link>Historial de partidas</a>
      <a class="tab ${active === 'rules' ? 'active' : ''}" href="/reglas" data-link>Reglas</a>
    </nav>
    <div class="userchip">
      <span class="uname">${esc(u.username)}</span><span class="code-pill" title="Tu código de jugador">${esc(u.code)}</span>
      <button class="icon-btn" id="sound-toggle" title="Sonido" aria-label="Activar o desactivar sonido">${sounds.enabled ? '🔊' : '🔇'}</button>
      <button class="btn small ghost" id="logout">Salir</button>
    </div>
  </header>
  <main class="page">${inner}</main>`;
  bindShell();
}

function bindShell() {
  const st = document.getElementById('sound-toggle');
  st && st.addEventListener('click', () => {
    sounds.setEnabled(!sounds.enabled);
    st.textContent = sounds.enabled ? '🔊' : '🔇';
    if (sounds.enabled) sounds.play('check');
    toast(sounds.enabled ? 'Sonido activado' : 'Sonido desactivado');
  });
  const lo = document.getElementById('logout');
  lo && lo.addEventListener('click', async () => {
    await api('POST', '/api/auth/logout', {}).catch(() => {});
    state.user = null;
    navigate('/');
  });
}

// ------------------------------------------------------------------ autenticación
function renderAuth(mode = 'login') {
  const pending = sessionStorage.getItem('afterLogin');
  $app.innerHTML = `
  <div class="auth-wrap"><div class="auth-box">
    <div class="auth-hero">
      <div class="suits">♠<span class="r">♥</span>♣<span class="r">♦</span></div>
      <h1>Póker entre Amigos</h1>
      <p class="muted">Texas Hold'em en tiempo real con tus amigos.</p>
      ${pending && pending.startsWith('/m/') ? '<p class="form-ok">Te invitaron a una mesa. Iniciá sesión o creá una cuenta y te llevamos directo.</p>' : ''}
    </div>
    <div class="card-panel">
      <div class="seg" role="tablist">
        <button id="tab-login" class="${mode === 'login' ? 'active' : ''}" role="tab">Iniciar sesión</button>
        <button id="tab-register" class="${mode === 'register' ? 'active' : ''}" role="tab">Crear cuenta</button>
      </div>
      <div id="auth-form"></div>
    </div>
    <p class="disclaimer">Se juega solo con fichas virtuales gratuitas: no tienen valor monetario, no se compran, no se canjean y no hay premios.</p>
  </div></div>`;
  document.getElementById('tab-login').addEventListener('click', () => renderAuth('login'));
  document.getElementById('tab-register').addEventListener('click', () => renderAuth('register'));
  const box = document.getElementById('auth-form');
  if (mode === 'login') {
    box.innerHTML = `
      <form id="f" novalidate>
        <label for="login">Usuario o correo</label>
        <input id="login" name="login" type="text" autocomplete="username" required>
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <div id="err"></div>
        <button class="btn primary block" style="margin-top:1em">Entrar</button>
      </form>
      <p class="small" style="text-align:center;margin-top:1em"><a href="#" id="forgot">¿Olvidaste tu contraseña?</a></p>`;
    document.getElementById('forgot').addEventListener('click', (e) => { e.preventDefault(); renderForgot(); });
  } else {
    box.innerHTML = `
      <form id="f" novalidate>
        <label for="username">Nombre de usuario</label>
        <input id="username" name="username" type="text" autocomplete="username" maxlength="20" required>
        <div class="hint">Entre 3 y 20 caracteres. Es el nombre que verán tus amigos.</div>
        <label for="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autocomplete="email" required>
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
        <div class="hint">Mínimo 8 caracteres.</div>
        <div id="err"></div>
        <button class="btn primary block" style="margin-top:1em">Crear cuenta</button>
      </form>`;
  }
  const f = document.getElementById('f');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('POST', mode === 'login' ? '/api/auth/login' : '/api/auth/register', data);
      state.user = r.user;
      if (mode === 'register') toast(`¡Bienvenido/a! Tu código de jugador es ${r.user.code}`, 'ok');
      route();
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      btn.disabled = false;
    }
  });
}

function renderForgot() {
  const box = document.getElementById('auth-form');
  box.innerHTML = `
    <h2>Recuperar contraseña</h2>
    <p class="muted small">Escribí el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p>
    <form id="f" novalidate>
      <label for="email">Correo electrónico</label>
      <input id="email" name="email" type="email" autocomplete="email" required>
      <div id="err"></div>
      <button class="btn primary block" style="margin-top:1em">Enviar enlace</button>
    </form>
    <p class="small" style="text-align:center;margin-top:1em"><a href="#" id="back">Volver a iniciar sesión</a></p>`;
  document.getElementById('back').addEventListener('click', (e) => { e.preventDefault(); renderAuth('login'); });
  const f = document.getElementById('f');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/auth/forgot', Object.fromEntries(new FormData(f)));
      document.getElementById('err').innerHTML = `<div class="form-ok">${esc(r.message)}</div>`;
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  });
}

function renderReset(token) {
  $app.innerHTML = `
  <div class="auth-wrap"><div class="auth-box"><div class="card-panel">
    <h2>Elegí una contraseña nueva</h2>
    <form id="f" novalidate>
      <label for="password">Contraseña nueva</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
      <label for="password2">Repetila</label>
      <input id="password2" name="password2" type="password" autocomplete="new-password" required>
      <div id="err"></div>
      <button class="btn primary block" style="margin-top:1em">Guardar contraseña</button>
    </form>
  </div></div></div>`;
  const f = document.getElementById('f');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const err = document.getElementById('err');
    if (d.password !== d.password2) { err.innerHTML = '<div class="form-error">Las contraseñas no coinciden</div>'; return; }
    try {
      const r = await api('POST', '/api/auth/reset', { token, password: d.password });
      state.user = null;
      toast(r.message, 'ok');
      navigate('/', true);
    } catch (e2) { err.innerHTML = `<div class="form-error">${esc(e2.message)}</div>`; }
  });
}

// ------------------------------------------------------------------ lobby
async function renderLobby() {
  const u = state.user;
  shell('lobby', `
    <section class="card-panel hello">
      <div class="avatar">${initial(u.username)}</div>
      <div style="flex:1;min-width:180px">
        <h1 style="margin:0">Hola, ${esc(u.username)}</h1>
        <div class="muted">Tu código de jugador: <span class="code-pill">${esc(u.code)}</span></div>
      </div>
      <div class="row">
        <a class="btn primary" href="/crear" data-link>＋ Crear mesa</a>
        <button class="btn" id="join-btn">Unirse a una mesa</button>
      </div>
    </section>
    <h2 style="margin-top:1.4em">Tus mesas</h2>
    <div id="tables"><p class="muted">Cargando…</p></div>`);
  document.getElementById('join-btn').addEventListener('click', openJoinModal);
  try {
    const { tables } = await api('GET', '/api/tables');
    const box = document.getElementById('tables');
    if (!box) return;
    if (!tables.length) {
      box.innerHTML = `<div class="card-panel empty">
        <div class="big">🃏</div>
        <h3>Todavía no tenés mesas</h3>
        <p class="muted">Creá una mesa e invitá a tus amigos con el enlace, o unite con el código que te pasaron.</p>
        <div class="row" style="justify-content:center"><a class="btn primary" href="/crear" data-link>Crear una mesa</a></div>
      </div>`;
      return;
    }
    box.innerHTML = `<div class="table-list">${tables.map((t) => `
      <article class="table-item">
        <div class="row"><h3>${esc(t.name)}</h3><span class="spacer"></span>
          ${t.status === 'closed' ? '<span class="badge closed">Cerrada</span>' : t.gameStarted ? '<span class="badge live">En juego</span>' : '<span class="badge">Esperando</span>'}
        </div>
        <div class="muted small">Código <span class="mono">${esc(t.code)}</span> · creada por ${t.isOwner ? 'vos' : esc(t.ownerName)}</div>
        <div class="small">Ciegas ${fmt(t.smallBlind)}/${fmt(t.bigBlind)} · Entrada ${fmt(t.startingStack)} · ${t.seated}/${t.maxPlayers} sentados</div>
        <div class="row" style="margin-top:.3em">
          ${t.status === 'open' ? `<a class="btn small primary" href="/m/${esc(t.code)}" data-link>${t.mySeat ? 'Volver a la mesa' : 'Entrar'}</a>
          <button class="btn small" data-copy="${esc(t.code)}">Copiar invitación</button>` : '<span class="muted small">Consultá sus sesiones en el historial.</span>'}
        </div>
      </article>`).join('')}</div>`;
    box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(inviteLink(b.dataset.copy))));
  } catch (e) {
    const box = document.getElementById('tables');
    if (box) box.innerHTML = `<div class="form-error">${esc(e.message)}</div>`;
  }
}

function openJoinModal() {
  modal(`<h2>Unirse a una mesa</h2>
    <form id="jf"><label for="jcode">Código o enlace de invitación</label>
    <input id="jcode" type="text" placeholder="Ej.: K7P2QM o ${esc(location.origin)}/m/K7P2QM" autocomplete="off" autocapitalize="characters">
    <div id="jerr"></div>
    <div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Continuar</button></div></form>`,
  (m, close) => {
    m.querySelector('#jf').addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = m.querySelector('#jcode').value.trim();
      const code = (raw.match(/([A-Za-z0-9]{4,12})\/?$/) || [])[1];
      if (!code) { m.querySelector('#jerr').innerHTML = '<div class="form-error">Ingresá un código válido</div>'; return; }
      close();
      navigate(`/m/${code.toUpperCase()}`);
    });
  });
}

// ------------------------------------------------------------------ crear mesa
function renderCreate() {
  shell('lobby', `
    <section class="card-panel" style="max-width:640px;margin:0 auto">
      <h1>Crear mesa</h1>
      <p class="muted small">Texas Hold'em No Limit con small blind y big blind obligatorias. Solo fichas virtuales gratuitas.</p>
      <form id="cf" novalidate>
        <label for="name">Nombre de la mesa</label>
        <input id="name" name="name" type="text" maxlength="40" value="Mesa de ${esc(state.user.username)}" required>
        <div class="grid2">
          <div><label for="maxPlayers">Cantidad de jugadores</label>
            <select id="maxPlayers" name="maxPlayers">${[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option ${n === 6 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div><label for="turnSeconds">Tiempo máximo por turno (segundos)</label>
            <input id="turnSeconds" name="turnSeconds" type="number" min="10" max="300" value="30" inputmode="numeric"></div>
          <div><label for="smallBlind">Small blind</label>
            <input id="smallBlind" name="smallBlind" type="number" min="1" value="5" inputmode="numeric"></div>
          <div><label for="bigBlind">Big blind</label>
            <input id="bigBlind" name="bigBlind" type="number" min="1" value="10" inputmode="numeric">
            <div class="hint">Sugerencia: el doble de la small blind.</div></div>
          <div><label for="startingStack">Entrada inicial (fichas)</label>
            <input id="startingStack" name="startingStack" type="number" min="1" value="1000" inputmode="numeric">
            <div class="hint" id="stack-hint"></div></div>
          <div><label for="maxBuyin">Importe máximo por jugador al entrar</label>
            <input id="maxBuyin" name="maxBuyin" type="number" min="1" value="2000" inputmode="numeric">
            <div class="hint">También es el tope de fichas al recargar.</div></div>
        </div>
        <label class="check"><input type="checkbox" name="allowRebuy" id="allowRebuy" checked> Permitir recargas de fichas (solo entre manos)</label>
        <div id="err"></div>
        <div class="row" style="margin-top:1em"><a class="btn ghost" href="/" data-link>Cancelar</a><span class="spacer"></span><button class="btn primary">Crear mesa</button></div>
      </form>
    </section>`);
  const f = document.getElementById('cf');
  const sb = f.smallBlind; const bb = f.bigBlind; const st = f.startingStack; const mx = f.maxBuyin;
  let bbTouched = false; let mxTouched = false;
  bb.addEventListener('input', () => { bbTouched = true; hint(); });
  mx.addEventListener('input', () => { mxTouched = true; });
  sb.addEventListener('input', () => { if (!bbTouched && Number(sb.value) > 0) bb.value = Number(sb.value) * 2; hint(); });
  st.addEventListener('input', () => { if (!mxTouched && Number(st.value) > 0) mx.value = Number(st.value) * 2; hint(); });
  function hint() {
    const b = Number(bb.value) || 0;
    document.getElementById('stack-hint').textContent = b ? `Equivale a ${Math.floor((Number(st.value) || 0) / b)} big blinds (mínimo 10).` : '';
  }
  hint();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('err');
    const d = {
      name: f.name.value, maxPlayers: Number(f.maxPlayers.value), turnSeconds: Number(f.turnSeconds.value),
      smallBlind: Number(sb.value), bigBlind: Number(bb.value), startingStack: Number(st.value),
      maxBuyin: Number(mx.value), allowRebuy: f.allowRebuy.checked,
    };
    const problems = [];
    if (!d.name.trim()) problems.push('Poné un nombre para la mesa.');
    if (d.bigBlind < d.smallBlind) problems.push('La big blind no puede ser menor que la small blind.');
    if (d.startingStack < d.bigBlind * 10) problems.push(`La entrada inicial debe ser al menos ${fmt(d.bigBlind * 10)} (10 big blinds).`);
    if (d.maxBuyin < d.startingStack) problems.push('El máximo de entrada no puede ser menor que la entrada inicial.');
    if (problems.length) { err.innerHTML = `<div class="form-error">${problems.map(esc).join('<br>')}</div>`; return; }
    try {
      const { table } = await api('POST', '/api/tables', d);
      showInvite(table);
    } catch (e2) { err.innerHTML = `<div class="form-error">${esc(e2.message)}</div>`; }
  });
}

function showInvite(table) {
  const link = inviteLink(table.code);
  shell('lobby', `
    <section class="card-panel invite-box" style="max-width:640px;margin:0 auto">
      <h1>¡Mesa creada!</h1>
      <p>Compartí el enlace con tus amigos. Solo quienes lo tengan pueden entrar.</p>
      <label>Código de la mesa</label>
      <div class="copy-row"><input type="text" readonly value="${esc(table.code)}" class="mono"><button class="btn" id="cc">Copiar código</button></div>
      <label>Enlace de invitación</label>
      <div class="copy-row"><input type="text" readonly value="${esc(link)}"><button class="btn" id="cl">Copiar enlace</button></div>
      ${navigator.share ? '<button class="btn" id="share">Compartir…</button>' : ''}
      <div class="row" style="margin-top:1em"><a class="btn ghost" href="/" data-link>Volver al lobby</a><span class="spacer"></span>
        <a class="btn primary" href="/m/${esc(table.code)}" data-link>Ir a la mesa</a></div>
    </section>`);
  document.getElementById('cc').addEventListener('click', () => copyText(table.code));
  document.getElementById('cl').addEventListener('click', () => copyText(link));
  const sh = document.getElementById('share');
  sh && sh.addEventListener('click', () => navigator.share({ title: `Mesa ${table.name}`, text: `¡Sumate a mi mesa de póker "${table.name}"!`, url: link }).catch(() => {}));
}

// ------------------------------------------------------------------ unirse (vista previa)
async function renderJoin(code) {
  shell('lobby', '<p class="muted">Cargando mesa…</p>');
  let data;
  try { data = await api('GET', `/api/tables/${code}`); } catch (e) {
    shell('lobby', `<div class="card-panel empty"><div class="big">🔍</div><h2>${esc(e.message)}</h2>
      <p class="muted">Revisá el código o pedile a quien te invitó un enlace nuevo.</p>
      <a class="btn primary" href="/" data-link>Volver al lobby</a></div>`);
    return;
  }
  const t = data.table;
  if (data.seated) return renderTable(code);
  if (t.status !== 'open') {
    shell('lobby', `<div class="card-panel empty"><div class="big">🔒</div><h2>La mesa “${esc(t.name)}” está cerrada</h2>
      <p class="muted">Podés consultar las sesiones en las que jugaste desde el historial.</p><a class="btn primary" href="/historial" data-link>Ver historial</a></div>`);
    return;
  }
  const full = t.freeSeats === 0;
  shell('lobby', `
    <section class="card-panel" style="max-width:640px;margin:0 auto">
      <h1>${esc(t.name)}</h1>
      <p class="muted">Mesa de ${esc(t.ownerName)} · código <span class="mono">${esc(t.code)}</span></p>
      <dl class="info-list">
        <dt>Jugadores dentro</dt><dd>${t.players.length ? t.players.map((p) => `${esc(p.username)} <span class="muted small">(${fmt(p.stack)})</span>`).join(', ') : 'Nadie todavía'}</dd>
        <dt>Asientos disponibles</dt><dd>${t.freeSeats} de ${t.maxPlayers}</dd>
        <dt>Entrada inicial</dt><dd>${fmt(t.startingStack)} fichas</dd>
        <dt>Ciegas</dt><dd>Small ${fmt(t.smallBlind)} · Big ${fmt(t.bigBlind)}</dd>
        <dt>Tiempo por turno</dt><dd>${t.turnSeconds} s</dd>
        <dt>Partida</dt><dd>${t.gameStarted ? (t.handInProgress ? 'Ya comenzó (hay una mano en curso: vas a recibir cartas en la siguiente)' : 'Ya comenzó') : 'Todavía no comenzó'}</dd>
        <dt>Recargas</dt><dd>${t.allowRebuy ? 'Permitidas entre manos' : 'No permitidas'}</dd>
      </dl>
      ${full ? '<div class="form-error">La mesa está completa. Podés entrar a mirar y sentarte cuando se libere un lugar.</div>' : `
      <form id="sf" novalidate>
        <label for="amount">¿Con cuántas fichas querés entrar?</label>
        <input id="amount" type="number" inputmode="numeric" min="${t.minBuyin}" max="${t.maxBuyin}" value="${t.startingStack}">
        <div class="hint">Mínimo ${fmt(t.minBuyin)} · máximo ${fmt(t.maxBuyin)} fichas virtuales.</div>
        <div id="err"></div>
        <div class="row" style="margin-top:1em"><a class="btn ghost" href="/" data-link>Cancelar</a><span class="spacer"></span>
          <button class="btn primary">Entrar a la mesa</button></div>
      </form>`}
      ${full ? `<div class="row" style="margin-top:1em"><button class="btn primary" id="watch">Mirar la mesa</button></div>` : ''}
    </section>`);
  const w = document.getElementById('watch');
  w && w.addEventListener('click', () => renderTable(code));
  const f = document.getElementById('sf');
  f && f.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = Number(f.amount.value);
    if (!Number.isInteger(amount) || amount < t.minBuyin || amount > t.maxBuyin) {
      document.getElementById('err').innerHTML = `<div class="form-error">Ingresá un número entero entre ${fmt(t.minBuyin)} y ${fmt(t.maxBuyin)}.</div>`;
      return;
    }
    renderTable(code, { sitAmount: amount });
  });
}

// ------------------------------------------------------------------ mesa
function renderTable(code, opts = {}) {
  $app.innerHTML = `
  <div class="table-page">
    <div class="table-top">
      <button class="btn small ghost" id="to-lobby" title="Volver al lobby">← Lobby</button>
      <div class="title" id="t-title">Mesa ${esc(code)}</div>
      <span class="conn warn" id="conn">Conectando…</span>
      <button class="icon-btn" id="t-invite" title="Copiar invitación">🔗</button>
      <button class="icon-btn wide-only" id="t-rules" title="Reglas y combinaciones">?</button>
      <button class="icon-btn wide-only" id="t-sound" title="Sonido">${sounds.enabled ? '🔊' : '🔇'}</button>
      <button class="icon-btn" id="t-menu" title="Más opciones">⋯</button>
    </div>
    <div class="table-stage"><div class="table-area" id="area"><div class="felt"></div></div></div>
    <div class="action-panel" id="panel"></div>
  </div>`;

  const socket = window.io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
  let st = null;
  let clockOffset = 0;
  let pendingSit = opts.sitAmount ? { amount: opts.sitAmount, requestId: uid() } : null;
  let sending = false;
  let actionKey = '';
  let lastTurnSeat = null;
  let timerInt = null;
  let closedByOwner = false;
  const conn = document.getElementById('conn');
  const setConn = (cls, txt) => { conn.className = `conn ${cls}`; conn.textContent = txt; };

  const call = (ev, payload) => new Promise((resolve) => {
    if (!socket.connected) { resolve({ ok: false, error: 'Sin conexión con el servidor. Reintentando…' }); return; }
    socket.timeout(8000).emit(ev, payload, (err, res) => resolve(err ? { ok: false, error: 'El servidor no respondió a tiempo' } : res));
  });

  async function join() {
    const r = await call('table:join', { code });
    if (!r.ok) {
      toast(r.error, 'err');
      if (/No existe/.test(r.error)) navigate('/', true);
      return;
    }
    applyState(r.state);
    if (pendingSit && r.state.mySeat == null) {
      const s = await call('table:sit', pendingSit);
      if (!s.ok) toast(s.error, 'err'); else { toast('¡Te sentaste! Marcá “Estoy listo” cuando quieras jugar.', 'ok'); sounds.play('chips'); }
    }
    pendingSit = null;
  }

  socket.on('connect', () => { setConn('ok', 'Conectado'); join(); });
  socket.on('disconnect', () => setConn('warn', 'Reconectando…'));
  socket.io.on('reconnect_attempt', () => setConn('warn', 'Reconectando…'));
  socket.io.on('reconnect_failed', () => setConn('bad', 'Sin conexión'));
  socket.on('connect_error', (e) => {
    if (e && e.message === 'no-auth') { state.user = null; sessionStorage.setItem('afterLogin', `/m/${code}`); navigate('/'); return; }
    setConn('bad', 'Sin conexión — reintentando');
  });
  socket.on('table:state', applyState);
  socket.on('table:closed', (m) => { closedByOwner = true; toast(m.message, 'err'); });
  socket.on('table:event', (ev) => {
    if (ev.kind === 'deal') sounds.play('deal');
    else if (ev.kind === 'action') sounds.play(ev.type === 'fold' ? 'fold' : ev.type === 'check' ? 'check' : 'chips');
    else if (ev.kind === 'win') sounds.play('win');
    else if (ev.kind === 'standup' && st && ev.reason === 'disconnect') toast(`${ev.username} perdió la conexión y dejó la mesa`);
  });

  function applyState(s) {
    requestAnimationFrame(fitArea);
    if (!s) return;
    st = s;
    clockOffset = s.serverTime - Date.now();
    document.getElementById('t-title').textContent = `${s.table.name} · ${fmt(s.table.smallBlind)}/${fmt(s.table.bigBlind)}`;
    const myTurn = s.hand && s.mySeat != null && s.hand.turnSeat === s.mySeat;
    if (myTurn && lastTurnSeat !== s.mySeat) { sounds.play('turn'); if (navigator.vibrate) navigator.vibrate(120); }
    lastTurnSeat = s.hand ? s.hand.turnSeat : null;
    drawTable();
    drawPanel();
  }

  // ---------- dibujo de la mesa
  function seatPos(seatIdx, n, mySeat) {
    const anchor = mySeat == null ? 0 : mySeat;
    const k = ((seatIdx - anchor) % n + n) % n;
    const ang = Math.PI / 2 + (k * 2 * Math.PI) / n;
    const narrow = window.matchMedia('(max-width: 700px)').matches;
    const rx = narrow ? 40 : 44; const ry = narrow ? 42 : 41;
    return { x: 50 + rx * Math.cos(ang), y: 50 + ry * Math.sin(ang), ang };
  }

  function lastActionText(a) {
    if (!a) return '';
    switch (a.type) {
      case 'fold': return 'Se retiró';
      case 'check': return 'Pasó';
      case 'call': return `Igualó ${fmt(a.amount)}`;
      case 'bet': return `Apostó ${fmt(a.amount)}`;
      case 'raise': return `Subió a ${fmt(a.amount)}`;
      case 'allin': return `All-in ${fmt(a.amount)}`;
      case 'sb': return `Small blind ${fmt(a.amount)}`;
      case 'bb': return `Big blind ${fmt(a.amount)}`;
      default: return '';
    }
  }

  function fitArea() {
    const area = document.getElementById('area');
    const stage = area && area.parentElement;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    let w = Math.max(200, r.width - 16);
    let h = Math.max(200, r.height - 16);
    // La mesa ocupa todo el espacio, pero sin deformarse demasiado.
    if (w / h > 1.9) w = h * 1.9;
    if (w / h < 0.62) h = w / 0.62;
    if (w > 1100) { h = h * (1100 / w); w = 1100; }
    area.style.width = `${w}px`;
    area.style.height = `${h}px`;
  }

  function drawTable() {
    const area = document.getElementById('area');
    if (!area || !st) return;
    const n = st.table.maxPlayers;
    const h = st.hand;
    const lr = st.lastResult;
    const winSeats = new Set(lr && !h ? lr.winners.map((w) => w.seat) : []);
    const bestCards = new Set();
    if (lr && !h) for (const s of lr.showdown) if (winSeats.has(s.seat)) (s.bestCards || []).forEach((c) => bestCards.add(c));
    let html = '<div class="felt"></div>';

    // centro: tablero, botes y estado
    const board = h ? h.board : lr ? lr.board : [];
    let center = '<div class="board">';
    for (let i = 0; i < 5; i++) center += board[i] ? cardHtml(board[i], bestCards.size && !bestCards.has(board[i]) ? 'dim' : bestCards.has(board[i]) ? 'win' : '') : '<div class="slot"></div>';
    center += '</div>';
    if (h) {
      const side = h.pots.length > 1 ? h.pots.map((p, i) => `<span class="pot">${i === 0 ? 'Principal' : `Secundario ${i}`}: ${fmt(p.amount)}</span>`).join('') : '';
      center += `<div class="pots"><span class="pot"><span class="chip-ico">●</span> Bote: ${fmt(h.totalPot)}</span></div>`;
      if (side) center += `<div class="pots">${side}</div>`;
      center += `<div class="status-line">Mano #${h.number}<span class="street-lbl"> · ${({ preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' })[h.street]}</span></div>`;
    } else if (lr) {
      const parts = lr.winners.map((w) => `${esc(w.username)} gana ${fmt(w.amount)}${w.handName ? ` con ${esc(w.handName)}` : ''}`);
      center += `<div class="result-banner">🏆 ${parts.join(' · ')}</div>`;
      if (lr.pots.length > 1) center += `<div class="pots">${lr.pots.map((p, i) => `<span class="pot">${i === 0 ? 'Principal' : `Secundario ${i}`}: ${fmt(p.amount)} → ${p.winners.map((w) => esc(w.username)).join(', ')}</span>`).join('')}</div>`;
      center += `<div class="status-line">${st.gameStarted ? 'La próxima mano empieza en unos segundos…' : ''}</div>`;
    } else {
      const seated = st.seats.filter(Boolean).length;
      const ready = st.seats.filter((s) => s && s.ready).length;
      center += `<div class="status-line">${st.gameStarted ? 'Esperando que haya al menos dos jugadores con fichas…'
        : `Esperando para empezar · ${seated} sentados · ${ready} listos`}</div>`;
    }
    html += `<div class="center">${center}</div>`;

    // asientos
    const dealer = st.dealerSeat;
    const now = Date.now() + clockOffset;
    for (let i = 0; i < n; i++) {
      const p = seatPos(i, n, st.mySeat);
      const s = st.seats[i];
      if (!s) {
        const canSit = st.mySeat == null && st.table.status === 'open';
        html += `<div class="empty-seat" style="left:${p.x}%;top:${p.y}%">${canSit ? `<button class="btn small" data-sit="${i}">Sentarse</button>` : '<span class="lbl">Libre</span>'}</div>`;
        continue;
      }
      const isTurn = h && h.turnSeat === i;
      const me = i === st.mySeat;
      const cls = ['seat', isTurn ? 'turn' : '', me ? 'me' : '', s.folded ? 'folded' : ''].join(' ');
      let cards = '';
      if (s.cards && !me) cards = `<div class="hole">${s.cards.map((c) => cardHtml(c, bestCards.has(c) ? 'win' : '')).join('')}</div>`;
      else if (s.hasCards && !me) cards = `<div class="hole">${cardHtml(null)}${cardHtml(null)}</div>`;
      let marks = '';
      if (dealer === i) marks += '<span class="mk d" title="Dealer">D</span>';
      if (h && h.sbSeat === i) marks += '<span class="mk sb" title="Small blind">SB</span>';
      if (h && h.bbSeat === i) marks += '<span class="mk bb" title="Big blind">BB</span>';
      let sub = lastActionText(s.lastAction);
      let subCls = '';
      if (s.waiting) sub = 'Espera la próxima mano';
      else if (!h && winSeats.has(i)) { const w = lr.winners.find((x) => x.seat === i); sub = `Ganó ${fmt(w.amount)}`; subCls = 'hl'; }
      else if (!h && !st.gameStarted) sub = s.ready ? '✓ Listo' : 'No está listo';
      else if (!h && s.stack === 0) sub = 'Sin fichas';
      if (s.leaving) sub = 'Se va al terminar la mano';
      let timer = '';
      if (isTurn && h.deadline) {
        const total = st.table.turnSeconds * 1000;
        const left = Math.max(0, h.deadline - now);
        timer = `<div class="timer ${left < 5000 ? 'low' : ''}" data-deadline="${h.deadline}" data-total="${total}"><i style="width:${(left / total) * 100}%"></i></div><div class="timer-num" data-deadline-num="${h.deadline}">${Math.ceil(left / 1000)} s</div>`;
      }
      html += `<div class="${cls}" style="left:${p.x}%;top:${p.y}%">
        ${cards}
        <div class="seat-box">
          <div class="markers">${marks}</div>
          <div class="name" title="${esc(s.username)} · ${esc(s.code)}">${esc(s.username)}${me ? ' (vos)' : ''}</div>
          <div class="stack">${fmt(s.stack)}</div>
          <div class="last ${subCls}">${esc(sub)}</div>
          ${!s.connected ? '<div class="offline">⚠ desconectado</div>' : ''}
          ${s.pendingRebuy ? `<div class="offline" style="color:#b6f0cd">+${fmt(s.pendingRebuy)} al terminar la mano</div>` : ''}
          ${timer}
        </div>
      </div>`;
      if (s.bet > 0) {
        const bx = 50 + (p.x - 50) * 0.58; const by = 50 + (p.y - 50) * 0.55;
        html += `<div class="bet" style="left:${bx}%;top:${by}%">${fmt(s.bet)}</div>`;
      }
    }
    area.innerHTML = html;
    area.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => sitModal(Number(b.dataset.sit))));
  }

  function tickTimers() {
    const now = Date.now() + clockOffset;
    document.querySelectorAll('.timer[data-deadline]').forEach((el) => {
      const left = Math.max(0, Number(el.dataset.deadline) - now);
      const total = Number(el.dataset.total);
      el.firstElementChild.style.width = `${(left / total) * 100}%`;
      el.classList.toggle('low', left < 5000);
    });
    document.querySelectorAll('[data-deadline-num]').forEach((el) => {
      el.textContent = `${Math.ceil(Math.max(0, Number(el.dataset.deadlineNum) - now) / 1000)} s`;
    });
  }
  timerInt = setInterval(tickTimers, 250);

  // ---------- panel inferior
  function drawPanel() {
    const panel = document.getElementById('panel');
    if (!panel || !st) return;
    const h = st.hand;
    const me = st.mySeat != null ? st.seats[st.mySeat] : null;
    const L = h && me && h.turnSeat === st.mySeat ? h.legal : null;
    const key = JSON.stringify([st.mySeat, h && h.number, h && h.turnId, !!L, me && me.cards, me && me.stack, me && me.ready,
      st.gameStarted, st.canStart, me && me.pendingRebuy, st.table.status, h && h.turnSeat, me && me.leaving, me && me.folded]);
    if (key === actionKey) return;
    actionKey = key;

    if (st.table.status !== 'open') {
      panel.innerHTML = '<div class="row"><b>La mesa está cerrada.</b><span class="spacer"></span><a class="btn primary" href="/historial" data-link>Ver historial</a></div>';
      return;
    }
    if (!me) {
      const free = st.seats.some((s) => !s);
      panel.innerHTML = `<div class="row"><span class="muted">Estás mirando la mesa.</span><span class="spacer"></span>
        ${free ? '<button class="btn primary" id="p-sit">Sentarme</button>' : '<span class="muted">La mesa está completa.</span>'}</div>`;
      const b = document.getElementById('p-sit');
      b && b.addEventListener('click', () => sitModal(null));
      return;
    }

    const myCards = me.cards ? me.cards.map((c) => cardHtml(c)).join('') : '';
    let info = `<div class="big">${fmt(me.stack)} fichas</div>`;
    if (h && me.waiting) info += '<div class="muted small">Vas a recibir cartas en la próxima mano.</div>';
    else if (h && me.folded) info += '<div class="muted small">Te retiraste de esta mano.</div>';
    else if (h && !L) {
      const ts = st.seats[h.turnSeat];
      info += `<div class="muted small">Turno de ${esc(ts ? ts.username : '—')}…</div>`;
    }
    let html = `<div class="my-row"><div class="my-cards">${myCards}</div><div class="my-info">${info}</div>
      <div class="row">${extraButtons(me)}</div></div>`;

    if (L) {
      const aggressive = L.canBet || L.canRaise;
      html += `<div class="facts">${L.toCall > 0 ? `Para igualar: <b>${fmt(L.callAmount)}</b>${L.callAmount < L.toCall ? ' (all-in)' : ''}` : 'No hay apuesta para igualar'}
        ${aggressive ? ` · ${L.canBet ? 'Apuesta mínima' : 'Subida mínima a'}: <b>${fmt(L.minTo)}</b> · Máximo: <b>${fmt(L.maxTo)}</b>` : ''}</div>`;
      if (aggressive && L.maxTo > L.minTo) {
        const pot = h.totalPot;
        const potRaise = Math.min(L.maxTo, Math.max(L.minTo, L.currentBet + L.toCall + pot));
        const half = Math.min(L.maxTo, Math.max(L.minTo, L.currentBet + Math.floor((pot + L.toCall) / 2)));
        html += `<div class="sizer"><input type="range" id="amt-range" min="${L.minTo}" max="${L.maxTo}" step="1" value="${L.minTo}" aria-label="Importe">
          <input type="number" id="amt" inputmode="numeric" min="${L.minTo}" max="${L.maxTo}" value="${L.minTo}" aria-label="Importe exacto"></div>
          <div class="quick"><button class="btn" data-q="${L.minTo}">Mínimo</button><button class="btn" data-q="${half}">½ bote</button><button class="btn" data-q="${potRaise}">Bote</button></div>`;
      }
      html += '<div class="actions">';
      html += '<button class="btn red" data-act="fold">Retirarse</button>';
      if (L.canCheck) html += '<button class="btn" data-act="check">Pasar</button>';
      if (L.canCall) html += `<button class="btn blue" data-act="call">${L.callAmount >= L.stack ? 'Igualar all-in' : 'Igualar'} ${fmt(L.callAmount)}</button>`;
      if (aggressive && L.maxTo > L.minTo) html += `<button class="btn green" data-act="${L.canBet ? 'bet' : 'raise'}" id="agg-btn">${L.canBet ? 'Apostar' : 'Subir a'} ${fmt(L.minTo)}</button>`;
      if (L.canAllIn && !(L.canCall && L.callAmount >= L.stack)) html += `<button class="btn primary" data-act="allin">All-in ${fmt(L.stack + L.bet)}</button>`;
      html += '</div>';
    } else if (!st.gameStarted) {
      html += `<div class="actions">
        <button class="btn ${me.ready ? '' : 'green'}" id="p-ready">${me.ready ? 'Ya no estoy listo' : 'Estoy listo'}</button>
        ${st.canStart ? '<button class="btn primary" id="p-start">Iniciar partida</button>' : ''}
      </div>
      <div class="facts">${st.isOwner ? 'Podés iniciar la partida cuando haya al menos dos jugadores listos.' : `Esperando que ${esc(st.table.ownerName)} inicie la partida.`}
        Invitá amigos con el botón 🔗.</div>`;
    }
    panel.innerHTML = html;
    bindPanel(L);
  }

  function extraButtons(me) {
    let b = '';
    if (st.table.allowRebuy && me.stack + me.pendingRebuy < st.table.maxBuyin) b += '<button class="btn small" id="p-rebuy">Recargar</button>';
    b += '<button class="btn small red" id="p-leave">Abandonar</button>';
    return b;
  }

  function bindPanel(L) {
    const q = (id) => document.getElementById(id);
    q('p-ready') && q('p-ready').addEventListener('click', async () => {
      const me = st.seats[st.mySeat];
      const r = await call('table:ready', { ready: !me.ready });
      if (!r.ok) toast(r.error, 'err');
    });
    q('p-start') && q('p-start').addEventListener('click', async () => {
      const r = await call('table:start');
      if (!r.ok) toast(r.error, 'err');
    });
    q('p-rebuy') && q('p-rebuy').addEventListener('click', rebuyModal);
    q('p-leave') && q('p-leave').addEventListener('click', leaveTable);

    const range = q('amt-range'); const num = q('amt'); const agg = q('agg-btn');
    const setAmt = (v) => {
      v = Math.round(Number(v));
      if (!Number.isFinite(v)) return;
      if (range) range.value = v;
      if (num && Number(num.value) !== v) num.value = v;
      if (agg) {
        const c = Math.min(Math.max(v, L.minTo), L.maxTo);
        agg.textContent = `${L.canBet ? 'Apostar' : 'Subir a'} ${fmt(c)}${c === L.maxTo ? ' (all-in)' : ''}`;
      }
    };
    range && range.addEventListener('input', () => setAmt(range.value));
    num && num.addEventListener('input', () => { if (num.value !== '') setAmt(num.value); });
    document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => setAmt(b.dataset.q)));
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      if (sending) return;
      const type = b.dataset.act;
      const payload = { type, turnId: st.hand.turnId, actionId: uid() };
      if (type === 'bet' || type === 'raise') {
        const v = Math.round(Number(num ? num.value : L.minTo));
        if (!Number.isInteger(v) || v < L.minTo || v > L.maxTo) { toast(`Elegí un importe entre ${fmt(L.minTo)} y ${fmt(L.maxTo)}`, 'err'); return; }
        payload.amount = v;
        if (v === L.maxTo) { payload.type = 'allin'; delete payload.amount; }
      }
      sending = true;
      document.querySelectorAll('[data-act]').forEach((x) => { x.disabled = true; });
      const r = await call('table:action', payload);
      sending = false;
      if (!r.ok) { toast(r.error, 'err'); actionKey = ''; drawPanel(); }
    }));
  }

  function sitModal(seat) {
    const t = st.table;
    modal(`<h2>Sentarse a la mesa</h2>
      <form id="smf"><label for="sm-amt">¿Con cuántas fichas querés entrar?</label>
      <input id="sm-amt" type="number" inputmode="numeric" min="${t.minBuyin}" max="${t.maxBuyin}" value="${t.startingStack}">
      <div class="hint">Mínimo ${fmt(t.minBuyin)} · máximo ${fmt(t.maxBuyin)}. ${st.hand ? 'Hay una mano en curso: vas a jugar desde la siguiente.' : ''}</div>
      <div id="sm-err"></div>
      <div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Sentarme</button></div></form>`,
    (m, close) => {
      const requestId = uid();
      m.querySelector('#smf').addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = Number(m.querySelector('#sm-amt').value);
        const r = await call('table:sit', { amount, seat, requestId });
        if (!r.ok) { m.querySelector('#sm-err').innerHTML = `<div class="form-error">${esc(r.error)}</div>`; return; }
        close(); sounds.play('chips');
      });
    });
  }

  function rebuyModal() {
    const t = st.table;
    const me = st.seats[st.mySeat];
    const room = t.maxBuyin - me.stack - me.pendingRebuy;
    modal(`<h2>Recargar fichas</h2>
      <p class="muted small">Las recargas se aplican entre manos. Tope por jugador: ${fmt(t.maxBuyin)} fichas.</p>
      <form id="rf"><label for="r-amt">¿Cuántas fichas querés agregar?</label>
      <input id="r-amt" type="number" inputmode="numeric" min="1" max="${room}" value="${Math.min(room, t.startingStack)}">
      <div class="hint">Podés agregar hasta ${fmt(room)}.</div><div id="r-err"></div>
      <div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Recargar</button></div></form>`,
    (m, close) => {
      const requestId = uid();
      m.querySelector('#rf').addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await call('table:rebuy', { amount: Number(m.querySelector('#r-amt').value), requestId });
        if (!r.ok) { m.querySelector('#r-err').innerHTML = `<div class="form-error">${esc(r.error)}</div>`; return; }
        close();
        toast(st.hand ? 'Recarga solicitada: se aplica al terminar la mano' : 'Recarga aplicada', 'ok');
      });
    });
  }

  async function leaveTable() {
    const inHand = st.hand && st.seats[st.mySeat] && st.seats[st.mySeat].hasCards;
    const ok = await confirmDialog('¿Abandonar la mesa?',
      `${inHand ? 'Estás jugando una mano: si te vas, te retirás de ella. ' : ''}Te vas a levantar con ${fmt(st.seats[st.mySeat].stack)} fichas, que quedan registradas en el historial.`,
      'Abandonar la mesa');
    if (!ok) return;
    const r = await call('table:leave');
    if (!r.ok) { toast(r.error, 'err'); return; }
    toast('Dejaste la mesa', 'ok');
    navigate('/');
  }

  document.getElementById('to-lobby').addEventListener('click', async () => {
    if (st && st.mySeat != null && !closedByOwner) {
      const ok = await confirmDialog('¿Volver al lobby?',
        'Vas a seguir sentado con tus fichas. Si estás en una mano y se vence tu turno, se pasará o te retirará automáticamente. Si no volvés en unos minutos se libera tu asiento.',
        'Ir al lobby', false);
      if (!ok) return;
    }
    navigate('/');
  });
  document.getElementById('t-invite').addEventListener('click', () => copyText(inviteLink(code)));
  document.getElementById('t-rules').addEventListener('click', () => modal(`${rulesHtml()}<div class="row"><button class="btn primary" data-close>Cerrar</button></div>`));
  document.getElementById('t-sound').addEventListener('click', (e) => {
    sounds.setEnabled(!sounds.enabled);
    e.currentTarget.textContent = sounds.enabled ? '🔊' : '🔇';
  });
  document.getElementById('t-menu').addEventListener('click', () => {
    const me = st && st.mySeat != null;
    modal(`<h2>Opciones de la mesa</h2>
      <div class="stack">
        <div class="invite-box"><label>Enlace de invitación</label>
          <div class="copy-row"><input type="text" readonly value="${esc(inviteLink(code))}"><button class="btn" id="m-copy">Copiar</button></div>
          <div class="muted small">Código: <span class="mono">${esc(code)}</span></div></div>
        ${st ? `<dl class="info-list small"><dt>Ciegas</dt><dd>${fmt(st.table.smallBlind)} / ${fmt(st.table.bigBlind)}</dd>
          <dt>Entrada</dt><dd>${fmt(st.table.startingStack)} (máx. ${fmt(st.table.maxBuyin)})</dd>
          <dt>Turno</dt><dd>${st.table.turnSeconds} s</dd><dt>Recargas</dt><dd>${st.table.allowRebuy ? 'Sí, entre manos' : 'No'}</dd>
          <dt>Creador</dt><dd>${esc(st.table.ownerName)}</dd></dl>` : ''}
        <div class="row"><button class="btn" id="m-rules">Reglas y combinaciones</button>
          <button class="btn" id="m-sound">${sounds.enabled ? '🔇 Silenciar' : '🔊 Activar sonido'}</button></div>
        ${me ? '<button class="btn red" id="m-leave">Abandonar la mesa</button>' : ''}
        ${st && st.isOwner && st.table.status === 'open' ? '<button class="btn" id="m-close">Cerrar la mesa para todos</button>' : ''}
        <button class="btn ghost" data-close>Cerrar</button>
      </div>`, (m, close) => {
      m.querySelector('#m-copy').addEventListener('click', () => copyText(inviteLink(code)));
      m.querySelector('#m-rules').addEventListener('click', () => { close(); document.getElementById('t-rules').click(); });
      m.querySelector('#m-sound').addEventListener('click', () => {
        close();
        sounds.setEnabled(!sounds.enabled);
        document.getElementById('t-sound').textContent = sounds.enabled ? '🔊' : '🔇';
        toast(sounds.enabled ? 'Sonido activado' : 'Sonido desactivado');
      });
      const lv = m.querySelector('#m-leave');
      lv && lv.addEventListener('click', () => { close(); leaveTable(); });
      const cl = m.querySelector('#m-close');
      cl && cl.addEventListener('click', async () => {
        close();
        const ok = await confirmDialog('¿Cerrar la mesa?', 'La sesión termina para todos. Las fichas que queden en la mesa se registran como “restantes” en el historial.', 'Cerrar mesa');
        if (!ok) return;
        const r = await call('table:close');
        if (!r.ok) toast(r.error, 'err');
      });
    });
  });

  const onResize = () => { fitArea(); drawTable(); };
  fitArea();
  window.addEventListener('resize', onResize);
  const beforeUnload = (e) => { if (st && st.hand && st.mySeat != null && st.seats[st.mySeat] && st.seats[st.mySeat].hasCards) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  cleanup = () => {
    clearInterval(timerInt);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('beforeunload', beforeUnload);
    socket.emit('table:exit');
    socket.close();
  };
}

// ------------------------------------------------------------------ historial
async function renderHistory() {
  shell('history', `<h1>Historial de partidas</h1><p class="muted small">Horarios en tu zona horaria (${esc(tz)}).</p><div id="hl"><p class="muted">Cargando…</p></div>`);
  try {
    const { sessions } = await api('GET', '/api/history');
    const box = document.getElementById('hl');
    if (!box) return;
    if (!sessions.length) {
      box.innerHTML = `<div class="card-panel empty"><div class="big">📜</div><h3>Todavía no jugaste ninguna sesión</h3>
        <p class="muted">Cuando te sientes en una mesa, la sesión aparecerá acá con todos los movimientos de fichas.</p>
        <a class="btn primary" href="/crear" data-link>Crear una mesa</a></div>`;
      return;
    }
    box.innerHTML = `<div class="tablewrap"><table class="data"><thead><tr>
      <th>Mesa</th><th>Sesión</th><th>Inicio</th><th>Cierre</th><th class="num">Manos</th><th class="num">Jugadores</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => `<tr><td><b>${esc(s.tableName)}</b><div class="muted small mono">${esc(s.tableCode)}</div></td>
        <td class="mono small">${esc(s.id.slice(0, 8))}</td>
        <td>${fmtDate(s.startedAt)}</td><td>${s.endedAt ? fmtDate(s.endedAt) : '<span class="badge live">En curso</span>'}</td>
        <td class="num">${s.hands}</td><td class="num">${s.players}</td>
        <td><a class="btn small" href="/historial/${esc(s.id)}" data-link>Ver detalle</a></td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (e) {
    const box = document.getElementById('hl');
    if (box) box.innerHTML = `<div class="form-error">${esc(e.message)}</div>`;
  }
}

async function renderSession(id) {
  shell('history', '<p class="muted">Cargando…</p>');
  let s;
  try { ({ session: s } = await api('GET', `/api/history/${id}`)); } catch (e) {
    shell('history', `<div class="card-panel empty"><h2>${esc(e.message)}</h2><a class="btn" href="/historial" data-link>Volver</a></div>`);
    return;
  }
  const totals = s.players.reduce((a, p) => ({ loaded: a.loaded + p.totalLoaded, w: a.w + p.withdrawn, r: a.r + p.remaining, b: a.b + p.balance }), { loaded: 0, w: 0, r: 0, b: 0 });
  const live = !s.endedAt;
  shell('history', `
    <p><a href="/historial" data-link>← Historial de partidas</a></p>
    <h1>${esc(s.tableName)}</h1>
    <div class="card-panel"><dl class="info-list">
      <dt>Identificador de sesión</dt><dd class="mono small">${esc(s.id)}</dd>
      <dt>Fecha y hora de inicio</dt><dd>${fmtDate(s.startedAt)}</dd>
      <dt>Hora de cierre</dt><dd>${s.endedAt ? fmtDate(s.endedAt) : 'Sesión en curso'}</dd>
      <dt>Ciegas</dt><dd>${fmt(s.smallBlind)} / ${fmt(s.bigBlind)}</dd>
      <dt>Zona horaria</dt><dd>${esc(tz)}</dd>
    </dl></div>
    <h2 style="margin-top:1.2em">Fichas por jugador</h2>
    ${live ? '<p class="muted small">La sesión sigue abierta: las fichas restantes son las de la última mano terminada.</p>' : ''}
    <div class="tablewrap"><table class="data"><thead><tr>
      <th>Jugador</th><th>Código</th><th class="num">Fichas iniciales</th><th>Recargas (hora)</th><th class="num">Total cargado</th>
      <th class="num">Retiradas</th><th class="num">Restantes</th><th class="num">Balance neto</th></tr></thead><tbody>
      ${s.players.map((p) => `<tr>
        <td><b>${esc(p.username)}</b>${p.seated ? ' <span class="badge live">en la mesa</span>' : ''}</td>
        <td class="mono">${esc(p.code)}</td>
        <td class="num">${fmt(p.initial)}<div class="muted small">${fmtTime(p.initialAt)}</div></td>
        <td>${p.reloads.length ? p.reloads.map((r) => `<div>${fmt(r.amount)} <span class="muted small">· ${fmtTime(r.at)}${r.kind === 'reentry' ? ' · reingreso' : ''}</span></div>`).join('') : '<span class="muted">—</span>'}</td>
        <td class="num">${fmt(p.totalLoaded)}</td>
        <td class="num">${fmt(p.withdrawn)}</td>
        <td class="num">${fmt(p.remaining)}</td>
        <td class="num ${p.balance > 0 ? 'pos' : p.balance < 0 ? 'neg' : ''}"><b>${signed(p.balance)}</b></td></tr>`).join('')}
      <tr><td colspan="4"><b>Total</b></td><td class="num">${fmt(totals.loaded)}</td><td class="num">${fmt(totals.w)}</td><td class="num">${fmt(totals.r)}</td><td class="num"><b>${signed(totals.b)}</b></td></tr>
      </tbody></table></div>
    <p class="muted small">Balance = fichas retiradas + fichas restantes − total de fichas cargadas. Son fichas virtuales sin valor monetario.</p>
    <h2 style="margin-top:1.2em">Manos jugadas (${s.hands.length})</h2>
    <div class="card-panel">${s.hands.length ? s.hands.slice().reverse().map((h) => `
      <div class="hand-row"><div><b>Mano #${h.number}</b> <span class="muted small">· ${fmtTime(h.startedAt)}${h.endedAt ? ` – ${fmtTime(h.endedAt)}` : ' · en curso'}</span></div>
      ${h.voided ? '<div class="muted small">Mano anulada (reinicio del servidor). Las fichas volvieron a sus dueños.</div>' : `
      <div class="small">${h.winners.map((w) => `🏆 ${esc(w.username)} +${fmt(w.amount)}${w.handName ? ` con ${esc(w.handName)}` : ''}`).join(' · ') || '—'}</div>
      ${h.board.length ? `<div class="small">Mesa: ${miniCards(h.board)}</div>` : ''}
      ${h.showdown.length ? `<div class="small muted">Showdown: ${h.showdown.map((x) => `${esc(x.username)} ${miniCards(x.cards)} (${esc(x.handName)})`).join(' · ')}</div>` : ''}`}
      </div>`).join('') : '<p class="muted">No se jugaron manos en esta sesión.</p>'}</div>`);
}

// ------------------------------------------------------------------ reglas
function rulesHtml() {
  const ex = (cs) => miniCards(cs);
  return `<h2>Cómo se juega</h2>
  <p>Cada jugador recibe <b>dos cartas privadas</b>. Se reparten hasta <b>cinco cartas comunitarias</b> (flop: 3, turn: 1, river: 1). Gana quien forme la <b>mejor combinación de cinco cartas</b> usando cualquier mezcla de sus dos cartas y las comunitarias, o quien quede solo cuando los demás se retiran.</p>
  <ul>
    <li><b>Ciegas:</b> antes de repartir, los dos jugadores a la izquierda del botón (D) ponen la small blind y la big blind. Con dos jugadores, el botón pone la small blind y habla primero antes del flop.</li>
    <li><b>Rondas:</b> preflop, flop, turn y river. En cada una podés <b>pasar</b> (si no hay apuesta), <b>igualar</b>, <b>apostar/subir</b> o <b>retirarte</b>.</li>
    <li><b>No Limit:</b> podés apostar todas tus fichas (all-in). La subida mínima es igual a la última subida (o a la big blind).</li>
    <li><b>All-in y botes secundarios:</b> si alguien va all-in por menos, solo puede ganar lo que igualó; el resto se juega en un bote secundario.</li>
    <li><b>Empates:</b> el bote se reparte. El palo nunca desempata.</li>
  </ul>
  <h3>Combinaciones (de mayor a menor)</h3>
  <div class="rank-list">
    <div class="rank-item"><span class="n">1</span><div><b>Escalera real</b> ${ex(['As', 'Ks', 'Qs', 'Js', 'Ts'])}<div class="muted small">A-K-Q-J-10 del mismo palo.</div></div></div>
    <div class="rank-item"><span class="n">2</span><div><b>Escalera de color</b> ${ex(['9h', '8h', '7h', '6h', '5h'])}<div class="muted small">Cinco seguidas del mismo palo.</div></div></div>
    <div class="rank-item"><span class="n">3</span><div><b>Póker</b> ${ex(['Qs', 'Qh', 'Qd', 'Qc', '7s'])}<div class="muted small">Cuatro cartas del mismo valor.</div></div></div>
    <div class="rank-item"><span class="n">4</span><div><b>Full</b> ${ex(['Kh', 'Kd', 'Kc', '4s', '4h'])}<div class="muted small">Un trío y una pareja.</div></div></div>
    <div class="rank-item"><span class="n">5</span><div><b>Color</b> ${ex(['Ad', 'Jd', '8d', '6d', '2d'])}<div class="muted small">Cinco del mismo palo.</div></div></div>
    <div class="rank-item"><span class="n">6</span><div><b>Escalera</b> ${ex(['Tc', '9d', '8s', '7h', '6c'])}<div class="muted small">Cinco seguidas. El As puede ser bajo: A-2-3-4-5.</div></div></div>
    <div class="rank-item"><span class="n">7</span><div><b>Trío</b> ${ex(['7s', '7h', '7d', 'Kc', '2s'])}</div></div>
    <div class="rank-item"><span class="n">8</span><div><b>Doble pareja</b> ${ex(['Js', 'Jd', '5c', '5h', 'As'])}</div></div>
    <div class="rank-item"><span class="n">9</span><div><b>Pareja</b> ${ex(['Ts', 'Th', 'Ad', '8c', '3s'])}</div></div>
    <div class="rank-item"><span class="n">10</span><div><b>Carta alta</b> ${ex(['Ah', 'Qd', '9s', '6c', '3h'])}</div></div>
  </div>
  <p class="muted small" style="margin-top:1em">Si se te vence el tiempo, el sistema pasa por vos si es posible; si no, te retira de la mano. Las fichas son virtuales y gratuitas: no tienen valor monetario.</p>`;
}

function renderRules() {
  shell('rules', `<div class="card-panel">${rulesHtml()}</div>`);
}

// ------------------------------------------------------------------ inicio
(async function boot() {
  try {
    const r = await api('GET', '/api/me');
    state.user = r.user;
    state.mailConfigured = r.mailConfigured;
  } catch { state.user = null; }
  route();
}());

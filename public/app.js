/* wakapoker — cliente. Sin dependencias salvo socket.io. */
import { sounds } from './sound.js';
import { avatarSvg, handsHtml, LABELS, ORDER, labelOf, DEALER } from './avatar.js';

const $app = document.getElementById('app');
const state = { user: null, avatarOptions: null };

// ------------------------------------------------------------------ utilidades
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('es-AR');
// Todas las cantidades del juego se muestran en Bs.
const fmt = (n) => `Bs\u00a0${num(n)}`;
const blindsText = (t) => (!t ? '' : t.bigBlind ? `SB ${fmt(t.smallBlind)} / BB ${fmt(t.bigBlind)}` : t.smallBlind ? `Solo SB ${fmt(t.smallBlind)}` : 'Sin ciegas');
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
  const box = document.getElementById('toasts');
  while (box.children.length >= 2) box.firstElementChild.remove();
  box.appendChild(el);
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

async function loadMe() {
  try {
    const r = await api('GET', '/api/me');
    state.user = r.user;
    state.avatarOptions = r.avatarOptions || state.avatarOptions;
  } catch { /* sin conexión */ }
}

async function route() {
  if (cleanup) { const c = cleanup; cleanup = null; c(); }
  document.getElementById('modal-root').innerHTML = '';
  const path = location.pathname;

  if (!state.user) {
    if (path.startsWith('/m/') || path.startsWith('/historial')) sessionStorage.setItem('afterLogin', path);
    return renderAuth();
  }
  if (!state.user.avatar) await loadMe();
  if (!state.user) return renderAuth();
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
    <a class="brand" href="/" data-link>♠ waka<span>poker</span></a>
    <nav class="tabs" aria-label="Secciones">
      <a class="tab ${active === 'lobby' ? 'active' : ''}" href="/" data-link>Mesas</a>
      <a class="tab ${active === 'history' ? 'active' : ''}" href="/historial" data-link>Historial de partidas</a>
      <a class="tab ${active === 'rules' ? 'active' : ''}" href="/reglas" data-link>Reglas</a>
    </nav>
    <div class="userchip">
      <span class="uname">${esc(u.username)}</span><span class="code-pill" title="Tu código de jugador">${esc(u.code)}</span>
      <button class="icon-btn" id="sound-toggle" title="Sonido" aria-label="Activar o desactivar sonido">${sounds.enabled ? '🔊' : '🔇'}</button>
      <button class="btn small ghost" id="logout">Cambiar nombre</button>
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
function renderAuth() {
  const pending = sessionStorage.getItem('afterLogin');
  const invited = !!(pending && pending.startsWith('/m/'));
  $app.innerHTML = `
  <div class="auth-wrap"><div class="auth-box">
    <div class="auth-hero">
      <div class="suits">♠<span class="r">♥</span>♣<span class="r">♦</span></div>
      <h1>wakapoker</h1>
      <p class="muted">Texas Hold'em en tiempo real con tus amigos.</p>
      ${invited ? '<p class="form-ok">Te invitaron a una mesa. Escribí tu nombre y te llevamos directo.</p>' : ''}
    </div>
    <div class="card-panel">
      <form id="f" novalidate>
        <label for="username">¿Cómo te llamás?</label>
        <input id="username" name="username" type="text" autocomplete="nickname" autocapitalize="words" maxlength="20" placeholder="Tu nombre en la mesa" required>
        <div class="hint">Solo tu nombre, sin contraseña. Entre 3 y 20 caracteres.</div>
        <div id="err"></div>
        <button class="btn primary block" style="margin-top:1em">Entrar</button>
      </form>
      <p class="muted small" style="text-align:center;margin-top:1em">Si ya jugaste antes, escribí el mismo nombre.</p>
    </div>
    <p class="disclaimer">La app no maneja dinero: solo lleva la cuenta de cada partida y muestra quién le paga a quién.</p>
  </div></div>`;
  const f = document.getElementById('f');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('err');
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const r = await api('POST', '/api/auth/name', { username: f.username.value });
      state.user = r.user;
      route();
    } catch (e2) {
      err.innerHTML = `<div class="form-error">${esc(e2.message)}</div>`;
      btn.disabled = false;
    }
  });
}

/** Muestra el código de recuperación y espera a que el usuario confirme que lo guardó. */
function showRecoveryCode(code, intro = '') {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      ${intro ? `<p>${esc(intro)}</p>` : ''}
      <h2>Tu código de recuperación</h2>
      <p class="muted small">Como no usamos correo, este código es la <b>única forma de recuperar tu cuenta</b> si olvidás la contraseña. Guardalo en un lugar seguro (por ejemplo, sacale una captura). No se lo des a nadie: no lo vas a volver a ver.</p>
      <div class="recovery-code mono">${esc(code)}</div>
      <div class="row" style="justify-content:flex-start"><button class="btn" id="rc-copy">Copiar código</button></div>
      <label class="check"><input type="checkbox" id="rc-ok"> Ya lo guardé</label>
      <div class="row"><button class="btn primary" id="rc-done" disabled>Continuar</button></div>
    </div>`;
    root.appendChild(back);
    const ok = back.querySelector('#rc-ok');
    const done = back.querySelector('#rc-done');
    back.querySelector('#rc-copy').addEventListener('click', () => copyText(code));
    ok.addEventListener('change', () => { done.disabled = !ok.checked; });
    done.addEventListener('click', () => { back.remove(); resolve(); });
  });
}

function renderForgot() {
  const box = document.getElementById('auth-form');
  box.innerHTML = `
    <h2>Recuperar la cuenta</h2>
    <p class="muted small">Ingresá tu usuario y el código de recuperación que te mostramos al crear la cuenta.</p>
    <form id="f" novalidate>
      <label for="username">Nombre de usuario</label>
      <input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" required>
      <label for="recoveryCode">Código de recuperación</label>
      <input id="recoveryCode" name="recoveryCode" type="text" class="mono" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX" required>
      <label for="password">Contraseña nueva</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
      <label for="password2">Repetí la contraseña nueva</label>
      <input id="password2" name="password2" type="password" autocomplete="new-password" required>
      <div id="err"></div>
      <button class="btn primary block" style="margin-top:1em">Cambiar contraseña</button>
    </form>
    <p class="small" style="text-align:center;margin-top:1em"><a href="#" id="back">Volver a iniciar sesión</a></p>
    <p class="muted small" style="text-align:center">Si perdiste el código y la contraseña, no hay forma de recuperar la cuenta: creá una nueva.</p>`;
  document.getElementById('back').addEventListener('click', (e) => { e.preventDefault(); renderAuth('login'); });
  const f = document.getElementById('f');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const err = document.getElementById('err');
    if (d.password !== d.password2) { err.innerHTML = '<div class="form-error">Las contraseñas no coinciden</div>'; return; }
    delete d.password2;
    try {
      const r = await api('POST', '/api/auth/recover', d);
      state.user = r.user;
      await showRecoveryCode(r.recoveryCode, 'Listo, cambiaste tu contraseña. El código anterior ya no sirve: este es tu código nuevo.');
      route();
    } catch (e2) {
      err.innerHTML = `<div class="form-error">${esc(e2.message)}</div>`;
    }
  });
}

// ------------------------------------------------------------------ personaje
/** Editor de personaje: guarda solo al cambiar algo. */
function avatarEditor(container, { onSaved } = {}) {
  const opts = state.avatarOptions;
  let av = { ...(state.user.avatar || {}) };
  let timer = null;
  function render() {
    const row = (key) => {
      const isColor = key === 'skin' || key === 'hairColor' || key === 'shirt';
      const items = opts[key].map((v) => isColor
        ? `<button type="button" class="swatch ${av[key] === v ? 'active' : ''}" data-k="${key}" data-v="${esc(v)}" style="background:${esc(v)}" aria-label="${esc(LABELS[key])}"></button>`
        : `<button type="button" class="chip ${av[key] === v ? 'active' : ''}" data-k="${key}" data-v="${esc(v)}">${esc(labelOf(v))}</button>`).join('');
      return `<div class="av-row"><div class="av-label">${esc(LABELS[key])}</div><div class="av-opts">${items}</div></div>`;
    };
    container.innerHTML = `<div class="av-editor">
      <div class="av-preview">${avatarSvg(av)}${handsHtml(av, '<span class="mini-back"></span><span class="mini-back"></span>')}</div>
      <div class="av-fields">${ORDER.filter((k) => opts[k] && !(k === 'shirt' && av.body && av.body !== 'con polera')).map(row).join('')}</div>
      <div class="av-status muted small" aria-live="polite"></div>
    </div>`;
    container.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      av = { ...av, [b.dataset.k]: b.dataset.v };
      render();
      clearTimeout(timer);
      timer = setTimeout(save, 350);
    }));
  }
  async function save() {
    const status = container.querySelector('.av-status');
    try {
      const r = await api('POST', '/api/avatar', av);
      state.user = { ...state.user, avatar: r.avatar, avatarSet: true };
      if (status) status.textContent = 'Guardado ✓';
      onSaved && onSaved(r.avatar);
    } catch (e) { if (status) status.textContent = e.message; }
  }
  render();
}

function openAvatarModal(onSaved) {
  modal(`<h2>Tu personaje</h2><p class="muted small">Así te van a ver en la mesa.</p><div id="av-box"></div>
    <div class="row"><button class="btn primary" data-close>Listo</button></div>`, (m) => avatarEditor(m.querySelector('#av-box'), { onSaved }));
}

// ------------------------------------------------------------------ lobby
async function renderLobby() {
  const u = state.user;
  shell('lobby', `
    <section class="card-panel hello">
      <button class="avatar-big" id="my-avatar" title="Personalizar personaje" aria-label="Personalizar personaje">${avatarSvg(u.avatar)}</button>
      <div style="flex:1;min-width:180px">
        <h1 style="margin:0">Hola, ${esc(u.username)}</h1>
        <div class="muted">Tu código de jugador: <span class="code-pill">${esc(u.code)}</span></div>
      </div>
      <div class="row">
        <a class="btn primary" href="/crear" data-link>＋ Crear mesa</a>
        <button class="btn" id="join-btn">Unirse a una mesa</button>
        <button class="btn" id="avatar-btn">🎭 Mi personaje</button>
      </div>
    </section>
    <h2 style="margin-top:1.4em">Tus mesas</h2>
    <div id="tables"><p class="muted">Cargando…</p></div>`);
  document.getElementById('join-btn').addEventListener('click', openJoinModal);
  const reAvatar = () => { const b = document.getElementById('my-avatar'); if (b) b.innerHTML = avatarSvg(state.user.avatar); };
  document.getElementById('avatar-btn').addEventListener('click', () => openAvatarModal(reAvatar));
  document.getElementById('my-avatar').addEventListener('click', () => openAvatarModal(reAvatar));
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
        <div class="small">Ciegas ${blindsText(t)} · Entrada ${fmt(t.startingStack)} · ${t.seated}/${t.maxPlayers} sentados</div>
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
      <p class="muted small">Texas Hold'em No Limit. Las cantidades se cuentan en Bs.</p>
      <form id="cf" novalidate>
        <label for="name">Nombre de la mesa</label>
        <input id="name" name="name" type="text" maxlength="40" value="Mesa de ${esc(state.user.username)}" required>
        <label>¿Cómo se juega?</label>
        <div class="seg yesno" role="radiogroup" aria-label="¿Cómo se juega?">
          <button type="button" data-blinds="both" role="radio" aria-checked="false">Con SB y BB</button>
          <button type="button" data-blinds="sb" role="radio" aria-checked="false">Solo SB</button>
        </div>
        <div class="grid2 hidden" id="blinds-fields">
          <div><label for="smallBlind">¿De cuánto la small blind?</label>
            <input id="smallBlind" name="smallBlind" type="number" min="1" value="1" inputmode="numeric">
            <div class="hint" id="sb-hint"></div></div>
          <div id="bb-field"><label for="bigBlind">¿De cuánto la big blind?</label>
            <input id="bigBlind" name="bigBlind" type="number" min="1" value="2" inputmode="numeric">
            <div class="hint">Sugerencia: el doble de la small blind.</div></div>
        </div>
        <div class="grid2">
          <div><label for="maxPlayers">Cantidad de jugadores</label>
            <select id="maxPlayers" name="maxPlayers">${[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option ${n === 6 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <div><label for="turnSeconds">Tiempo máximo por turno (segundos)</label>
            <input id="turnSeconds" name="turnSeconds" type="number" min="10" max="300" value="30" inputmode="numeric"></div>
          <div><label for="startingStack">Entrada inicial (Bs)</label>
            <input id="startingStack" name="startingStack" type="number" min="1" value="30" inputmode="numeric">
            <div class="hint" id="stack-hint"></div></div>
          <div><label for="maxBuyin">Importe máximo por jugador al entrar</label>
            <input id="maxBuyin" name="maxBuyin" type="number" min="1" value="200" inputmode="numeric">
            <div class="hint">También es el tope de Bs al recargar.</div></div>
        </div>
        <label class="check"><input type="checkbox" name="allowRebuy" id="allowRebuy" checked> Permitir recargas de Bs (solo entre manos)</label>
        <label>¿Pagar Bs 1 al que gane con la mano 7 y 2?</label>
        <div class="seg yesno" role="radiogroup" aria-label="Bono 7 y 2">
          <button type="button" data-b72="1" role="radio" aria-checked="false">Sí</button>
          <button type="button" data-b72="0" role="radio" aria-checked="false">No</button>
        </div>
        <div class="hint">Si alguien gana una mano teniendo 7 y 2, cada uno de los demás jugadores le paga Bs 1 automáticamente.</div>
        <div id="err"></div>
        <div class="row" style="margin-top:1em"><a class="btn ghost" href="/" data-link>Cancelar</a><span class="spacer"></span><button class="btn primary">Crear mesa</button></div>
      </form>
    </section>`);
  const f = document.getElementById('cf');
  const sb = f.smallBlind; const bb = f.bigBlind; const st = f.startingStack; const mx = f.maxBuyin;
  let bbTouched = false; let mxTouched = false;
  let b72 = null;
  f.querySelectorAll('[data-b72]').forEach((b) => b.addEventListener('click', () => {
    b72 = b.dataset.b72 === '1';
    document.getElementById('err').innerHTML = '';
    f.querySelectorAll('[data-b72]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
  }));
  let mode = null; // 'both' | 'sb'
  f.querySelectorAll('[data-blinds]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.blinds;
    document.getElementById('err').innerHTML = '';
    f.querySelectorAll('[data-blinds]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    document.getElementById('blinds-fields').classList.remove('hidden');
    document.getElementById('bb-field').classList.toggle('hidden', mode !== 'both');
    document.getElementById('sb-hint').textContent = mode === 'sb' ? 'La pone siempre el jugador a la izquierda del dealer. No hay big blind.' : '';
    hint();
  }));
  bb.addEventListener('input', () => { bbTouched = true; hint(); });
  mx.addEventListener('input', () => { mxTouched = true; });
  sb.addEventListener('input', () => { if (!bbTouched && Number(sb.value) > 0) bb.value = Number(sb.value) * 2; hint(); });
  st.addEventListener('input', () => { if (!mxTouched && Number(st.value) > 0) mx.value = Number(st.value) * 2; hint(); });
  function hint() {
    const b = mode === 'both' ? Number(bb.value) || 0 : mode === 'sb' ? Number(sb.value) || 0 : 0;
    const what = mode === 'both' ? 'big blinds' : 'small blinds';
    document.getElementById('stack-hint').textContent = b ? `Equivale a ${Math.floor((Number(st.value) || 0) / b)} ${what} (mínimo 10).` : '';
  }
  hint();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('err');
    const d = {
      name: f.name.value, maxPlayers: Number(f.maxPlayers.value), turnSeconds: Number(f.turnSeconds.value),
      blindMode: mode, smallBlind: Number(sb.value), bigBlind: mode === 'both' ? Number(bb.value) : 0, startingStack: Number(st.value),
      maxBuyin: Number(mx.value), allowRebuy: f.allowRebuy.checked, bonus72: !!b72,
    };
    const problems = [];
    if (!d.name.trim()) problems.push('Poné un nombre para la mesa.');
    if (!mode) problems.push('Elegí si se juega con SB y BB o solo con SB.');
    if (b72 === null) problems.push('Elegí si se paga Bs 1 al que gane con 7 y 2.');
    if (mode && !(d.smallBlind >= 1)) problems.push('La small blind debe ser al menos 1.');
    if (mode === 'both' && d.bigBlind < d.smallBlind) problems.push('La big blind no puede ser menor que la small blind.');
    if (mode === 'both' && d.startingStack < d.bigBlind * 10) problems.push(`La entrada inicial debe ser al menos ${fmt(d.bigBlind * 10)} (10 big blinds).`);
    if (mode === 'sb' && d.startingStack < d.smallBlind * 10) problems.push(`La entrada inicial debe ser al menos ${fmt(d.smallBlind * 10)} (10 small blinds).`);
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
        <dt>Entrada inicial</dt><dd>${fmt(t.startingStack)}</dd>
        <dt>Ciegas</dt><dd>${blindsText(t)}</dd>
        <dt>Tiempo por turno</dt><dd>${t.turnSeconds} s</dd>
        <dt>Partida</dt><dd>${t.gameStarted ? (t.handInProgress ? 'Ya comenzó (hay una mano en curso: vas a recibir cartas en la siguiente)' : 'Ya comenzó') : 'Todavía no comenzó'}</dd>
        <dt>Recargas</dt><dd>${t.allowRebuy ? 'Permitidas entre manos' : 'No permitidas'}</dd>
        <dt>Bono 7 y 2</dt><dd>${t.bonus72 ? 'Sí: Bs 1 de cada jugador al que gane con 7 y 2' : 'No'}</dd>
      </dl>
      ${full ? '<div class="form-error">La mesa está completa. Podés entrar a mirar y sentarte cuando se libere un lugar.</div>' : `
      <h2 style="margin-top:1.2em">${state.user.avatarSet ? 'Tu personaje' : 'Antes de entrar, armá tu personaje'}</h2>
      <div id="join-avatar"></div>
      <form id="sf" novalidate>
        <label for="amount">¿Con cuántos Bs querés entrar?</label>
        <input id="amount" type="number" inputmode="numeric" min="${t.minBuyin}" max="${t.maxBuyin}" value="${t.startingStack}">
        <div class="hint">Mínimo ${fmt(t.minBuyin)} · máximo ${fmt(t.maxBuyin)} (virtuales).</div>
        <div id="err"></div>
        <div class="row" style="margin-top:1em"><a class="btn ghost" href="/" data-link>Cancelar</a><span class="spacer"></span>
          <button class="btn primary">Entrar a la mesa</button></div>
      </form>`}
      ${full ? `<div class="row" style="margin-top:1em"><button class="btn primary" id="watch">Mirar la mesa</button></div>` : ''}
    </section>`);
  const ja = document.getElementById('join-avatar');
  if (ja) avatarEditor(ja);
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
      <button class="icon-btn chat-btn" id="t-chat" title="Chat" aria-label="Abrir chat">💬<span class="badge-n hidden" id="chat-badge">0</span></button>
      <button class="icon-btn" id="t-accounts" title="Cuentas: quién le paga a quién" aria-label="Ver cuentas">💰</button>
      <button class="icon-btn" id="t-invite" title="Copiar invitación">🔗</button>
      <button class="icon-btn wide-only" id="t-rules" title="Reglas y combinaciones">?</button>
      <button class="icon-btn wide-only" id="t-sound" title="Sonido">${sounds.enabled ? '🔊' : '🔇'}</button>
      <button class="icon-btn" id="t-menu" title="Más opciones">⋯</button>
    </div>
    <div class="table-stage"><div class="table-area" id="area"><div class="felt"></div></div></div>
    <div class="action-panel" id="panel"></div>
    <aside class="chat-drawer hidden" id="chat" aria-label="Chat de la mesa">
      <div class="chat-head"><b>Chat de la mesa</b><span class="spacer"></span><button class="icon-btn" id="chat-close" aria-label="Cerrar chat">✕</button></div>
      <div class="chat-list" id="chat-list"><p class="muted small chat-empty">Todavía no hay mensajes. ¡Saludá a la mesa!</p></div>
      <div class="chat-quick" id="chat-quick"></div>
      <form class="chat-form" id="chat-form"><input type="text" id="chat-input" maxlength="200" placeholder="Escribí un mensaje…" autocomplete="off" aria-label="Mensaje">
        <button class="btn primary">Enviar</button></form>
    </aside>
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
  const pendingAnims = new Map(); // asiento -> tipo de acción recién hecha
  let lastHandNo = null;
  let lastBoardLen = 0;
  let lastResultAt = null;
  const DEALER_POS = { x: 50, y: 23 };
  let chatOpen = false;
  let unread = 0;
  const chatIds = new Set();
  const bubbles = new Map(); // seat -> { text, until }
  let bubbleTimer = null;
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
    if (r.quickChat) renderQuick(r.quickChat);
    (r.chat || []).forEach((m) => addChat(m, true));
    if (pendingSit && r.state.mySeat == null) {
      const s = await call('table:sit', pendingSit);
      if (!s.ok) toast(s.error, 'err'); else { toast('¡Te sentaste! Marcá “Estoy listo” cuando quieras jugar.', 'ok'); sounds.play('chips'); }
    }
    pendingSit = null;
  }

  socket.on('connect', () => { setConn('ok', 'Conectado'); join(); });
  // Safari en iPhone corta la conexión cuando la app queda en segundo plano: al volver, reconectar.
  const onVisible = () => { if (document.visibilityState === 'visible' && !socket.connected) socket.connect(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  socket.on('disconnect', () => setConn('warn', 'Reconectando…'));
  socket.io.on('reconnect_attempt', () => setConn('warn', 'Reconectando…'));
  socket.io.on('reconnect_failed', () => setConn('bad', 'Sin conexión'));
  socket.on('connect_error', (e) => {
    if (e && e.message === 'no-auth') { state.user = null; sessionStorage.setItem('afterLogin', `/m/${code}`); navigate('/'); return; }
    setConn('bad', 'Sin conexión — reintentando');
  });
  socket.on('table:state', applyState);
  socket.on('table:chat', (m) => addChat(m, false));
  socket.on('table:accounts', saveLocalAccounts);
  socket.on('table:closed', (m) => {
    closedByOwner = true;
    if (m.accounts) saveLocalAccounts(m.accounts);
    toast(m.message, 'err');
    if (m.accounts) modal(`${accountsHtml(m.accounts, 'Cuentas finales')}<div class="row"><a class="btn" href="/historial" data-link data-close>Ver historial</a><button class="btn primary" data-close>Cerrar</button></div>`);
  });
  socket.on('table:event', (ev) => {
    if (ev.kind === 'deal') sounds.play('deal');
    else if (ev.kind === 'action') {
      pendingAnims.set(ev.seat, ev.type);
      sounds.play(ev.type === 'fold' ? 'fold' : ev.type === 'check' ? 'check' : 'chips');
    }
    else if (ev.kind === 'win') sounds.play('win');
    else if (ev.kind === 'show') { sounds.play('deal'); if (st && ev.seat !== st.mySeat) toast(`${ev.username} mostró sus cartas`); }
    else if (ev.kind === 'standup' && st && ev.reason === 'disconnect') toast(`${ev.username} perdió la conexión y dejó la mesa`);
  });

  function applyState(s) {
    requestAnimationFrame(fitArea);
    if (!s) return;
    st = s;
    clockOffset = s.serverTime - Date.now();
    document.getElementById('t-title').textContent = `${s.table.name} · ${blindsText(s.table)}`;
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
    const narrow = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
    const rx = narrow ? 39 : 44; const ry = narrow ? 44 : 38;
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

  /** Texto del resultado: ganador normal o "Empate entre A y B, A gana 4 y B 4". */
  function resultText(lr) {
    const tiedSeats = new Set();
    for (const pot of lr.pots) if (pot.winners.length > 1) pot.winners.forEach((w) => tiedSeats.add(w.seat));
    const join = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`);
    const normal = (w) => `${esc(w.username)} gana ${fmt(w.amount)}${w.handName ? ` con ${esc(w.handName)}` : ''}`;
    if (!tiedSeats.size) return `🏆 ${lr.winners.map(normal).join(' · ')}`;
    const tied = lr.winners.filter((w) => tiedSeats.has(w.seat));
    const others = lr.winners.filter((w) => !tiedSeats.has(w.seat));
    const hand = tied[0] && tied[0].handName ? ` <span class="tie-hand">(${esc(tied[0].handName)})</span>` : '';
    let txt = `🤝 Empate entre ${join(tied.map((w) => esc(w.username)))}, ${join(tied.map((w, i) => `${esc(w.username)} ${i === 0 ? 'gana ' : ''}${fmt(w.amount)}`))}${hand}`;
    if (others.length) txt += ` · 🏆 ${others.map(normal).join(' · ')}`;
    return txt;
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
    if (w > 1400) { h = h * (1400 / w); w = 1400; }
    area.style.width = `${w}px`;
    area.style.height = `${h}px`;
  }

  /** Hace volar un elemento (carta o ficha) de un punto a otro de la mesa (en %). */
  function fly(area, from, to, cls, delay = 0, dur = 450) {
    const el = document.createElement('div');
    el.className = `flyer ${cls}`;
    el.style.left = `${from.x}%`;
    el.style.top = `${from.y}%`;
    el.style.transitionDuration = `${dur}ms`;
    el.style.opacity = '0';
    area.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.left = `${to.x}%`;
      el.style.top = `${to.y}%`;
      el.classList.add('go');
    }, delay + 20);
    setTimeout(() => el.remove(), delay + dur + 250);
  }

  function drawTable() {
    const area = document.getElementById('area');
    if (!area || !st) return;
    const n0 = st.table.maxPlayers;
    const hand0 = st.hand;
    const newHand = !!(hand0 && hand0.number !== lastHandNo);
    const boardNow = hand0 ? hand0.board.length : (st.lastResult ? st.lastResult.board.length : 0);
    const boardFrom = newHand ? 0 : (hand0 && boardNow > lastBoardLen ? lastBoardLen : boardNow);
    const dealing = newHand || boardFrom < boardNow;
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
    for (let i = 0; i < 5; i++) {
      if (!board[i]) { center += '<div class="slot"></div>'; continue; }
      const myCore = h && h.myHand ? h.myHand.core : [];
      const extra = bestCards.size && !bestCards.has(board[i]) ? 'dim' : bestCards.has(board[i]) ? 'win' : myCore.includes(board[i]) ? 'core' : '';
      const anim = i >= boardFrom ? ` flip-in" style="animation-delay:${(i - boardFrom) * 160}ms` : '';
      center += cardHtml(board[i], extra + anim);
    }
    center += '</div>';
    if (h) {
      const side = h.pots.length > 1 ? h.pots.map((p, i) => `<span class="pot">${i === 0 ? 'Principal' : `Secundario ${i}`}: ${fmt(p.amount)}</span>`).join('') : '';
      center += `<div class="pots"><span class="pot"><span class="chip-ico">●</span> Bote: ${fmt(h.totalPot)}</span></div>`;
      if (side) center += `<div class="pots">${side}</div>`;
      center += `<div class="status-line">Mano #${h.number}<span class="street-lbl"> · ${({ preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' })[h.street]}</span></div>`;
    } else if (lr) {
      center += `<div class="result-banner">${resultText(lr)}</div>`;
      if (lr.bonus72 && lr.bonus72.length) center += lr.bonus72.map((b) => `<div class="bonus-banner">🎉 ${esc(b.username)} se lleva ${fmt(b.amount)} por ganar con 7 y 2</div>`).join('');
      if (lr.shown && lr.shown.length) center += `<div class="status-line">👁 ${lr.shown.map((x) => `${esc(x.username)} mostró ${miniCards(x.cards)}`).join(' · ')}</div>`;
      if (lr.pots.length > 1) center += `<div class="pots">${lr.pots.map((p, i) => `<span class="pot">${i === 0 ? 'Principal' : `Secundario ${i}`}: ${fmt(p.amount)} → ${p.winners.map((w) => esc(w.username)).join(', ')}</span>`).join('')}</div>`;
      center += `<div class="status-line">${st.gameStarted ? 'La próxima mano empieza en unos segundos…' : ''}</div>`;
    } else {
      const seated = st.seats.filter(Boolean).length;
      const ready = st.seats.filter((s) => s && s.ready).length;
      center += `<div class="status-line">${st.gameStarted ? 'Esperando que haya al menos dos jugadores con Bs…'
        : `Esperando para empezar · ${seated} sentados · ${ready} listos`}</div>`;
    }
    html += `<div class="center">${center}</div>`;
    html += `<div class="dealer-fig" style="left:${DEALER_POS.x}%;top:${DEALER_POS.y}%" aria-label="Crupier">
      ${avatarSvg(DEALER)}${handsHtml(DEALER, '', dealing ? 'dealing' : '')}<div class="dealer-tag">Crupier</div></div>`;

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
      let inner = '';
      if (s.cards && (!me || !h || s.hasCards)) inner = s.cards.map((c) => cardHtml(c, bestCards.has(c) ? 'win' : '')).join('');
      else if (s.hasCards) inner = `${cardHtml(null)}${cardHtml(null)}`;
      const anim = pendingAnims.get(i);
      const animCls = anim === 'check' ? 'knock' : (anim === 'bet' || anim === 'raise' || anim === 'call' || anim === 'allin') ? 'push' : '';
      const dealOrder = newHand && h ? h.dealOrder.indexOf(i) : -1;
      if (dealOrder >= 0 && inner) inner = `<div class="deal-in" style="animation-delay:${(dealOrder + h.dealOrder.length) * 90 + 380}ms">${inner}</div>`;
      const figure = `<div class="figure">${avatarSvg(s.avatar, { title: s.username })}${handsHtml(s.avatar, inner, animCls)}</div>`;
      let marks = '';
      if (dealer === i) marks += '<span class="mk d" title="Dealer">D</span>';
      if (h && h.sbSeat === i) marks += '<span class="mk sb" title="Small blind">SB</span>';
      if (h && h.bbSeat === i) marks += '<span class="mk bb" title="Big blind">BB</span>';
      let sub = lastActionText(s.lastAction);
      let subCls = '';
      if (s.waiting) sub = 'Espera la próxima mano';
      else if (!h && winSeats.has(i)) { const w = lr.winners.find((x) => x.seat === i); sub = `Ganó ${fmt(w.amount)}`; subCls = 'hl'; }
      else if (!h && !st.gameStarted) sub = s.ready ? '✓ Listo' : 'No está listo';
      else if (!h && s.stack === 0) sub = 'Sin Bs';
      if (s.leaving) sub = 'Se va al terminar la mano';
      let timer = '';
      if (isTurn && h.deadline) {
        const total = st.table.turnSeconds * 1000;
        const left = Math.max(0, h.deadline - now);
        timer = `<div class="timer ${left < 5000 ? 'low' : ''}" data-deadline="${h.deadline}" data-total="${total}"><i style="width:${(left / total) * 100}%"></i></div><div class="timer-num" data-deadline-num="${h.deadline}">${Math.ceil(left / 1000)} s</div>`;
      }
      const bub = bubbles.get(i);
      const bubble = bub && bub.until > Date.now() ? `<div class="bubble">${esc(bub.text)}</div>` : '';
      html += `<div class="${cls}" style="left:${p.x}%;top:${p.y}%">
        ${bubble}
        ${figure}
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

    // reparto: el crupier tira dos cartas a cada jugador
    if (newHand && h) {
      h.dealOrder.forEach((seat, k) => {
        const p = seatPos(seat, n0, st.mySeat);
        for (let r = 0; r < 2; r++) fly(area, DEALER_POS, { x: p.x, y: p.y - 4 }, 'fly-card', (r * h.dealOrder.length + k) * 90, 380);
      });
    }
    // fichas a la mesa al apostar; cartas al centro al retirarse
    for (const [seat, type] of pendingAnims) {
      const p = seatPos(seat, n0, st.mySeat);
      if (type === 'fold') {
        fly(area, p, { x: 50, y: 42 }, 'fly-card', 0, 420);
        fly(area, p, { x: 51, y: 43 }, 'fly-card', 60, 420);
      } else if (type !== 'check') {
        const to = { x: 50 + (p.x - 50) * 0.58, y: 50 + (p.y - 50) * 0.55 };
        for (let c = 0; c < 3; c++) fly(area, p, to, 'fly-chip', c * 70, 380);
      }
    }
    pendingAnims.clear();
    // el bote va al ganador
    if (lr && !h && lr.at !== lastResultAt) {
      for (const w of lr.winners) {
        const p = seatPos(w.seat, n0, st.mySeat);
        for (let c = 0; c < 5; c++) fly(area, { x: 50, y: 52 }, p, 'fly-chip', 250 + c * 80, 520);
      }
    }
    lastResultAt = lr ? lr.at : lastResultAt;
    if (hand0) { lastHandNo = hand0.number; lastBoardLen = boardNow; }
  }

  // ---------- chat
  function renderQuick(list) {
    const box = document.getElementById('chat-quick');
    if (!box) return;
    box.innerHTML = list.map((t, i) => `<button type="button" class="btn small" data-quick="${i}">${esc(t)}</button>`).join('');
    box.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => sendChat({ quick: Number(b.dataset.quick) })));
  }

  async function sendChat(payload) {
    const r = await call('table:chat', payload);
    if (!r.ok) { toast(r.error, 'err'); return false; }
    return true;
  }

  function addChat(m, fromHistory) {
    if (chatIds.has(m.id)) return;
    chatIds.add(m.id);
    const list = document.getElementById('chat-list');
    if (!list) return;
    const empty = list.querySelector('.chat-empty');
    if (empty) empty.remove();
    const mine = state.user && m.userId === state.user.id;
    const el = document.createElement('div');
    el.className = `chat-msg ${mine ? 'mine' : ''} ${m.quick ? 'quick' : ''}`;
    el.innerHTML = `<span class="who">${esc(m.username)}</span> <span class="when">${fmtTime(new Date(m.at).toISOString()).slice(0, 5)}</span><div class="txt">${esc(m.text)}</div>`;
    list.appendChild(el);
    while (list.children.length > 80) list.firstElementChild.remove();
    list.scrollTop = list.scrollHeight;
    if (fromHistory) return;
    if (m.seat != null) {
      bubbles.set(m.seat, { text: m.text, until: Date.now() + 4500 });
      drawTable();
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => drawTable(), 4600);
    }
    if (!mine) {
      sounds.play('chat');
      if (!chatOpen) { unread++; updateBadge(); }
    }
  }

  function updateBadge() {
    const b = document.getElementById('chat-badge');
    if (!b) return;
    b.textContent = unread > 9 ? '9+' : String(unread);
    b.classList.toggle('hidden', unread === 0);
  }

  function setChatOpen(open) {
    chatOpen = open;
    document.getElementById('chat').classList.toggle('hidden', !open);
    if (open) {
      unread = 0; updateBadge();
      const list = document.getElementById('chat-list');
      list.scrollTop = list.scrollHeight;
      if (!window.matchMedia('(max-width: 700px)').matches) document.getElementById('chat-input').focus();
    }
  }
  document.getElementById('t-chat').addEventListener('click', () => setChatOpen(!chatOpen));
  document.getElementById('chat-close').addEventListener('click', () => setChatOpen(false));
  document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('chat-input');
    const text = inp.value.trim();
    if (!text) return;
    if (await sendChat({ text })) inp.value = '';
  });

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
  // Mantiene despierto el servidor gratuito mientras alguien está en la mesa.
  const keepAlive = setInterval(() => { fetch('/healthz', { cache: 'no-store' }).catch(() => {}); }, 4 * 60 * 1000);

  // ---------- panel inferior
  function drawPanel() {
    const panel = document.getElementById('panel');
    if (!panel || !st) return;
    const h = st.hand;
    const me = st.mySeat != null ? st.seats[st.mySeat] : null;
    const L = h && me && h.turnSeat === st.mySeat ? h.legal : null;
    const key = JSON.stringify([st.mySeat, h && h.number, h && h.turnId, !!L, me && me.cards, me && me.stack, me && me.ready,
      st.gameStarted, st.canStart, me && me.pendingRebuy, st.table.status, h && h.turnSeat, me && me.leaving, me && me.folded, st.canShowCards,
      h && h.myHand && h.myHand.name, h && h.board.length]);
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

    const core = h && h.myHand ? h.myHand.core : [];
    const myCards = me.cards ? me.cards.map((c) => cardHtml(c, core.includes(c) ? 'core' : '')).join('') : '';
    let info = `<div class="big">${fmt(me.stack)}</div>`;
    if (h && h.myHand) info += `<div class="my-hand-pill" aria-live="polite">🃏 Tenés: <b>${esc(h.myHand.name)}</b></div>`;
    if (h && me.waiting) info += '<div class="muted small">Vas a recibir cartas en la próxima mano.</div>';
    else if (h && me.folded) info += '<div class="muted small">Te retiraste de esta mano.</div>';
    else if (h && !L) {
      const ts = st.seats[h.turnSeat];
      info += `<div class="muted small">Turno de ${esc(ts ? ts.username : '—')}…</div>`;
    }
    if (st.canShowCards) info += '<button class="btn small blue show-btn" id="p-show">👁 Mostrar mis cartas</button>';
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
    panel.classList.toggle('my-turn', !!L);
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
    q('p-show') && q('p-show').addEventListener('click', async () => {
      const r = await call('table:show');
      if (!r.ok) toast(r.error, 'err');
    });
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
      <form id="smf"><label for="sm-amt">¿Con cuántos Bs querés entrar?</label>
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
    modal(`<h2>Recargar Bs</h2>
      <p class="muted small">Las recargas se aplican entre manos. Tope por jugador: ${fmt(t.maxBuyin)}.</p>
      <form id="rf"><label for="r-amt">¿Cuántos Bs querés agregar?</label>
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

  async function showAccounts() {
    const r = await call('table:accounts');
    if (!r.ok) { toast(r.error, 'err'); return; }
    if (!r.accounts) { toast('Todavía no hay movimientos en esta mesa'); return; }
    saveLocalAccounts(r.accounts);
    modal(`${accountsHtml(r.accounts, 'Cuentas de la partida')}<div class="row"><button class="btn primary" data-close>Cerrar</button></div>`);
  }
  document.getElementById('t-accounts').addEventListener('click', showAccounts);

  async function leaveTable() {
    const inHand = st.hand && st.seats[st.mySeat] && st.seats[st.mySeat].hasCards;
    const ok = await confirmDialog('¿Abandonar la mesa?',
      `${inHand ? 'Estás jugando una mano: si te vas, te retirás de ella. ' : ''}Te vas a levantar con ${fmt(st.seats[st.mySeat].stack)}, que quedan registrados en el historial.`,
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
        'Vas a seguir sentado con tus Bs. Si estás en una mano y se vence tu turno, se pasará o te retirará automáticamente. Si no volvés en unos minutos se libera tu asiento.',
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
        ${st ? `<dl class="info-list small"><dt>Ciegas</dt><dd>${blindsText(st.table)}</dd>
          <dt>Entrada</dt><dd>${fmt(st.table.startingStack)} (máx. ${fmt(st.table.maxBuyin)})</dd>
          <dt>Turno</dt><dd>${st.table.turnSeconds} s</dd><dt>Recargas</dt><dd>${st.table.allowRebuy ? 'Sí, entre manos' : 'No'}</dd>
          <dt>Bono 7 y 2</dt><dd>${st.table.bonus72 ? 'Sí (Bs 1 de cada uno)' : 'No'}</dd>
          <dt>Creador</dt><dd>${esc(st.table.ownerName)}</dd></dl>` : ''}
        <div class="row"><button class="btn" id="m-rules">Reglas y combinaciones</button>
          <button class="btn" id="m-sound">${sounds.enabled ? '🔇 Silenciar' : '🔊 Activar sonido'}</button></div>
        ${me && st.table.allowRebuy ? '<button class="btn" id="m-rebuy">Recargar Bs</button>' : ''}
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
      const rb = m.querySelector('#m-rebuy');
      rb && rb.addEventListener('click', () => { close(); rebuyModal(); });
      const lv = m.querySelector('#m-leave');
      lv && lv.addEventListener('click', () => { close(); leaveTable(); });
      const cl = m.querySelector('#m-close');
      cl && cl.addEventListener('click', async () => {
        close();
        const ok = await confirmDialog('¿Cerrar la mesa?', 'La sesión termina para todos. Los Bs que queden en la mesa se registran como “restantes” en el historial.', 'Cerrar mesa');
        if (!ok) return;
        const r = await call('table:close');
        if (!r.ok) toast(r.error, 'err');
      });
    });
  });

  const onResize = () => { fitArea(); pendingAnims.clear(); drawTable(); };
  fitArea();
  window.addEventListener('resize', onResize);
  const beforeUnload = (e) => { if (st && st.hand && st.mySeat != null && st.seats[st.mySeat] && st.seats[st.mySeat].hasCards) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  cleanup = () => {
    clearInterval(timerInt);
    clearInterval(keepAlive);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
    clearTimeout(bubbleTimer);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('beforeunload', beforeUnload);
    socket.emit('table:exit');
    socket.close();
  };
}

// ------------------------------------------------------------------ historial local
// Copia de las cuentas de cada partida en este dispositivo: si el servidor gratuito
// se reinicia y pierde sus datos, el registro sigue estando acá.
const LOCAL_KEY = 'pk_historial';
function localHistory() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') || {}; } catch { return {}; }
}
function saveLocalAccounts(acc) {
  if (!acc || !acc.sessionId) return;
  try {
    const all = localHistory();
    const prev = all[acc.sessionId];
    if (prev && prev.endedAt && !acc.endedAt) return; // no pisar una cuenta final con una parcial
    all[acc.sessionId] = { ...acc, savedAt: new Date().toISOString() };
    const keys = Object.keys(all).sort((a, b) => String(all[b].startedAt).localeCompare(String(all[a].startedAt)));
    for (const k of keys.slice(200)) delete all[k];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  } catch { /* almacenamiento lleno o bloqueado */ }
}

// ------------------------------------------------------------------ cuentas
/** "Entró con 30 → +20 → +50 → +10" */
function loadsText(p) {
  return [`Entró con ${fmt(p.initial)}`, ...p.reloads.map((r) => `+${fmt(r.amount)}`)].join(' → ');
}

function paymentsHtml(payments) {
  if (!payments || !payments.length) return '<p class="muted">Nadie le debe nada a nadie.</p>';
  return `<div class="pay-list">${payments.map((x) => `<div class="pay"><b>${esc(x.from)}</b> le paga a <b>${esc(x.to)}</b><span class="amt">${fmt(x.amount)}</span></div>`).join('')}</div>`;
}

function accountsHtml(acc, title) {
  const ended = !!acc.endedAt;
  return `<h2>${esc(title)}</h2>
    <p class="muted small">${ended ? 'Partida terminada.' : 'Partida en curso: los saldos son los de la última mano terminada.'}</p>
    <h3>Quién le paga a quién</h3>
    ${paymentsHtml(acc.payments)}
    <h3 style="margin-top:1em">Detalle por jugador</h3>
    <div class="acc-cards">${acc.players.map((p) => `<div class="acc-card">
      <div class="acc-head"><b>${esc(p.username)}</b><span class="muted small mono">${esc(p.code)}</span><span class="spacer"></span>
        <b class="${p.balance > 0 ? 'pos' : p.balance < 0 ? 'neg' : ''}">${signed(p.balance)} ${p.balance > 0 ? 'arriba' : p.balance < 0 ? 'abajo' : ''}</b></div>
      <div class="loads">${esc(loadsText(p))}</div>
      <div class="muted small">Cargó ${p.reloadCount} ${p.reloadCount === 1 ? 'vez' : 'veces'} · Total cargado ${fmt(p.totalLoaded)} · Quedó con ${fmt(p.finalAmount)}</div>
    </div>`).join('')}</div>`;
}

// ------------------------------------------------------------------ historial
async function renderHistory() {
  shell('history', `<h1>Historial de partidas</h1><p class="muted small">Horarios en tu zona horaria (${esc(tz)}).</p><div id="hl"><p class="muted">Cargando…</p></div>`);
  let sessions = [];
  try { ({ sessions } = await api('GET', '/api/history')); } catch { sessions = []; }
  try {
    const local = localHistory();
    const seen = new Set(sessions.map((x) => x.id));
    for (const a of Object.values(local)) {
      if (seen.has(a.sessionId)) continue;
      sessions.push({ id: a.sessionId, tableName: a.tableName || 'Mesa', tableCode: a.tableCode || '', startedAt: a.startedAt, endedAt: a.endedAt, hands: a.hands ?? '—', players: a.players.length, local: true });
    }
    sessions.sort((x, y) => String(y.startedAt).localeCompare(String(x.startedAt)));
    const box = document.getElementById('hl');
    if (!box) return;
    if (!sessions.length) {
      box.innerHTML = `<div class="card-panel empty"><div class="big">📜</div><h3>Todavía no jugaste ninguna sesión</h3>
        <p class="muted">Cuando te sientes en una mesa, la sesión aparecerá acá con todos los movimientos de Bs.</p>
        <a class="btn primary" href="/crear" data-link>Crear una mesa</a></div>`;
      return;
    }
    box.innerHTML = `<div class="tablewrap"><table class="data"><thead><tr>
      <th>Mesa</th><th>Sesión</th><th>Inicio</th><th>Cierre</th><th class="num">Manos</th><th class="num">Jugadores</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => `<tr><td><b>${esc(s.tableName)}</b><div class="muted small mono">${esc(s.tableCode)}</div></td>
        <td class="mono small">${esc(s.id.slice(0, 8))}${s.local ? '<div class="muted small">guardada en este dispositivo</div>' : ''}</td>
        <td>${fmtDate(s.startedAt)}</td><td>${s.endedAt ? fmtDate(s.endedAt) : s.local ? '<span class="muted small">sin cierre registrado</span>' : '<span class="badge live">En curso</span>'}</td>
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
    const local = localHistory()[id];
    if (local) {
      shell('history', `<p><a href="/historial" data-link>← Historial de partidas</a></p>
        <h1>${esc(local.tableName || 'Mesa')}</h1>
        <div class="card-panel"><dl class="info-list">
          <dt>Inicio</dt><dd>${fmtDate(local.startedAt)}</dd>
          <dt>Cierre</dt><dd>${local.endedAt ? fmtDate(local.endedAt) : 'Sin cierre registrado'}</dd>
          <dt>Guardada</dt><dd>${fmtDate(local.savedAt)} en este dispositivo</dd>
        </dl></div>
        <div class="card-panel" style="margin-top:1em">${accountsHtml(local, 'Cuentas')}</div>`);
      return;
    }
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
      <dt>Ciegas</dt><dd>${blindsText(s)}</dd>
      <dt>Zona horaria</dt><dd>${esc(tz)}</dd>
    </dl></div>
    <h2 style="margin-top:1.2em">Jugadores, cargas y con cuánto quedaron</h2>
    ${live ? '<p class="muted small">La sesión sigue abierta: los Bs restantes son los de la última mano terminada.</p>' : ''}
    <div class="tablewrap"><table class="data"><thead><tr>
      <th>Jugador</th><th>Código</th><th class="num">Entró con</th><th>Cargas (hora)</th><th class="num">Veces que cargó</th><th class="num">Total cargado</th>
      <th class="num">Retiradas</th><th class="num">Restantes</th><th class="num">Quedó con</th><th class="num">Balance neto</th></tr></thead><tbody>
      ${s.players.map((p) => `<tr>
        <td><b>${esc(p.username)}</b>${p.seated ? ' <span class="badge live">en la mesa</span>' : ''}</td>
        <td class="mono">${esc(p.code)}</td>
        <td class="num">${fmt(p.initial)}<div class="muted small">${fmtTime(p.initialAt)}</div></td>
        <td>${p.reloads.length ? p.reloads.map((r) => `<div>+${fmt(r.amount)} <span class="muted small">· ${fmtTime(r.at)}${r.kind === 'reentry' ? ' · reingreso' : ''}</span></div>`).join('') : '<span class="muted">—</span>'}
          <div class="muted small loads">${esc(loadsText(p))}</div></td>
        <td class="num">${p.reloadCount}</td>
        <td class="num">${fmt(p.totalLoaded)}</td>
        <td class="num">${fmt(p.withdrawn)}</td>
        <td class="num">${fmt(p.remaining)}</td>
        <td class="num"><b>${fmt(p.finalAmount)}</b></td>
        <td class="num ${p.balance > 0 ? 'pos' : p.balance < 0 ? 'neg' : ''}"><b>${signed(p.balance)}</b></td></tr>`).join('')}
      <tr><td colspan="5"><b>Total</b></td><td class="num">${fmt(totals.loaded)}</td><td class="num">${fmt(totals.w)}</td><td class="num">${fmt(totals.r)}</td><td class="num">${fmt(totals.w + totals.r)}</td><td class="num"><b>${signed(totals.b)}</b></td></tr>
      </tbody></table></div>
    <h2 style="margin-top:1.2em">Quién le paga a quién</h2>
    ${live ? '<p class="muted small">La partida sigue abierta: esto es lo que habría que pagar si terminara ahora.</p>' : ''}
    <div class="card-panel">${paymentsHtml(s.payments)}</div>
    <p class="muted small">Balance = Bs retirados + Bs restantes − total de Bs cargados.</p>
    <h2 style="margin-top:1.2em">Manos jugadas (${s.hands.length})</h2>
    <div class="card-panel">${s.hands.length ? s.hands.slice().reverse().map((h) => `
      <div class="hand-row"><div><b>Mano #${h.number}</b> <span class="muted small">· ${fmtTime(h.startedAt)}${h.endedAt ? ` – ${fmtTime(h.endedAt)}` : ' · en curso'}</span></div>
      ${h.voided ? '<div class="muted small">Mano anulada (reinicio del servidor). Los Bs volvieron a sus dueños.</div>' : `
      <div class="small">${h.winners.map((w) => `🏆 ${esc(w.username)} +${fmt(w.amount)}${w.handName ? ` con ${esc(w.handName)}` : ''}`).join(' · ') || '—'}</div>
      ${h.bonus72 && h.bonus72.length ? `<div class="small">${h.bonus72.map((b) => `🎉 ${esc(b.username)} se llevó ${fmt(b.amount)} por ganar con 7 y 2`).join(' · ')}</div>` : ''}
      ${h.board.length ? `<div class="small">Mesa: ${miniCards(h.board)}</div>` : ''}
      ${h.shown && h.shown.length ? `<div class="small muted">Mostró voluntariamente: ${h.shown.map((x) => `${esc(x.username)} ${miniCards(x.cards)}`).join(' · ')}</div>` : ''}
      ${h.showdown.length ? `<div class="small muted">Showdown: ${h.showdown.map((x) => `${esc(x.username)} ${miniCards(x.cards)} (${esc(x.handName)})`).join(' · ')}</div>` : ''}`}
      </div>`).join('') : '<p class="muted">No se jugaron manos en esta sesión.</p>'}</div>`);
}

// ------------------------------------------------------------------ reglas
function rulesHtml() {
  const ex = (cs) => miniCards(cs);
  return `<h2>Cómo se juega</h2>
  <p>Cada jugador recibe <b>dos cartas privadas</b>. Se reparten hasta <b>cinco cartas comunitarias</b> (flop: 3, turn: 1, river: 1). Gana quien forme la <b>mejor combinación de cinco cartas</b> usando cualquier mezcla de sus dos cartas y las comunitarias, o quien quede solo cuando los demás se retiran.</p>
  <ul>
    <li><b>Solo SB:</b> si la mesa se juega así, el jugador a la izquierda del dealer pone la small blind y no hay big blind; al final de la ronda tiene la opción de pasar o subir.</li>
    <li><b>Ciegas (SB y BB):</b> antes de repartir, los dos jugadores a la izquierda del botón (D) ponen la small blind y la big blind. Con dos jugadores, el botón pone la small blind y habla primero antes del flop.</li>
    <li><b>Rondas:</b> preflop, flop, turn y river. En cada una podés <b>pasar</b> (si no hay apuesta), <b>igualar</b>, <b>apostar/subir</b> o <b>retirarte</b>.</li>
    <li><b>No Limit:</b> podés apostar todos tus Bs (all-in). La subida mínima es igual a la última subida (o a la big blind).</li>
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
  <p class="muted small" style="margin-top:1em">Si se te vence el tiempo, el sistema pasa por vos si es posible; si no, te retira de la mano. Los Bs son virtuales y gratuitos: no tienen valor monetario.</p>`;
}

function renderRules() {
  shell('rules', `<div class="card-panel">${rulesHtml()}</div>`);
}

// ------------------------------------------------------------------ inicio
(async function boot() {
  try {
    const r = await api('GET', '/api/me');
    state.user = r.user;
    state.avatarOptions = r.avatarOptions;
  } catch { state.user = null; }
  route();
}());

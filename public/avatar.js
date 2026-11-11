/* Personajes dibujados en SVG: cara, granos, pelo, sombrero, gafas, barba, torso, cadena y reloj. */

export const LABELS = {
  skin: 'Color de piel',
  acne: 'Granos en la cara',
  hair: 'Pelo',
  hairColor: 'Color de pelo',
  hat: 'Sombrero',
  glasses: 'Gafas',
  beard: 'Barba',
  body: 'Polera',
  shirt: 'Color de polera',
  chain: 'Cadena',
  watch: 'Reloj',
};

export const ORDER = ['skin', 'acne', 'hair', 'hairColor', 'hat', 'glasses', 'beard', 'body', 'shirt', 'chain', 'watch'];

export const VALUE_LABELS = {
  lana: 'Gorro de lana', 'lana negra': 'Gorro de lana negro', sol: 'De sol clásicas', 'sol aviador': 'De sol aviador',
  'sol deportivas': 'De sol deportivas', 'sin polera con granos': 'Sin polera, con granos en pecho y espalda',
  dólar: 'Con dólar', doble: 'Doble (oro y plata)', diamantes: 'De diamantes', arcoíris: 'Arcoíris', multicolor: 'Multicolor',
};
export const labelOf = (v) => VALUE_LABELS[v] || String(v).charAt(0).toUpperCase() + String(v).slice(1);

export const DEALER = {
  skin: '#d9a77c', hair: 'corto', hairColor: '#1f1a17', hat: 'ninguno', glasses: 'ninguna', beard: 'ninguna', shirt: '#ffffff', dealer: true,
};

const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
const col = (c, fb) => (SAFE_COLOR.test(String(c)) ? c : fb);

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = ch(n >> 16); const g = ch((n >> 8) & 255); const b = ch(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const dots = (pts, r, fill, extra = '') => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"${extra}/>`).join('');

/** Devuelve el SVG (texto) del personaje. Todos los valores se validan: no se inserta texto libre. */
export function avatarSvg(a = {}, { title = '' } = {}) {
  const skin = col(a.skin, '#e0b08a');
  const skinD = shade(skin, 0.85);
  const hairC = col(a.hairColor, '#2b2118');
  const shirt = col(a.shirt, '#2f6fb0');
  const bare = !a.dealer && (a.body === 'sin polera' || a.body === 'sin polera con granos');
  const parts = [];

  // capucha y pelo largo: van detrás de la cabeza
  if (a.hat === 'capucha negra') parts.push('<path d="M17 62 Q12 2 50 3 Q88 2 83 62 L88 86 L12 86 Z" fill="#202228" stroke="#3b3e47" stroke-width="1.5"/>');
  if (a.hair === 'largo' && a.hat !== 'capucha negra') parts.push(`<path d="M23 44 Q22 13 50 13 Q78 13 77 44 L80 80 Q70 76 66 64 L34 64 Q30 76 20 80 Z" fill="${hairC}"/>`);

  // torso: polera, uniforme del crupier o sin polera
  if (a.dealer) {
    parts.push('<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="#ffffff"/>');
    parts.push('<path d="M14 100 Q16 80 38 77 L50 100 Z" fill="#1d1d1f"/><path d="M86 100 Q84 80 62 77 L50 100 Z" fill="#1d1d1f"/>');
  } else if (bare) {
    parts.push(`<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="${skin}"/>`);
    parts.push(`<path d="M30 88 Q40 94 49 89 M51 89 Q60 94 70 88 M50 82 L50 100" stroke="${skinD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
    if (a.body === 'sin polera con granos') {
      // pecho, hombros y espalda (lo que asoma por los hombros)
      parts.push(dots([[24, 90], [29, 84], [34, 95], [40, 86], [44, 96], [57, 95], [61, 86], [66, 94], [72, 85], [77, 91], [20, 97], [81, 97], [37, 80], [64, 80]], 1.7, '#c62828'));
      parts.push(dots([[29, 84], [44, 96], [66, 94], [77, 91]], 0.6, '#ffd9d9'));
    }
  } else {
    parts.push(`<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="${shirt}"/>`);
  }
  parts.push(`<rect x="43" y="66" width="14" height="13" rx="4" fill="${skinD}"/>`);
  if (a.dealer) parts.push('<path d="M42 80 L50 84 L42 88 Z M58 80 L50 84 L58 88 Z" fill="#c0392b"/><circle cx="50" cy="84" r="2.2" fill="#8e2a20"/>');

  // cadenas
  if (!a.dealer) {
    const U = 'M39 70 Q41 81 50 82 Q59 81 61 70';
    const gold = '#f2c230'; const goldD = '#b8860b';
    switch (a.chain) {
      case 'cruz de oro':
        parts.push(`<path d="${U}" stroke="${gold}" stroke-width="2" fill="none" stroke-dasharray="2.2 1.2"/>`);
        parts.push(`<path d="M48.8 80.5 h2.4 v2.6 h2.6 v2.3 h-2.6 v4.4 h-2.4 v-4.4 h-2.6 v-2.3 h2.6 Z" fill="${gold}" stroke="${goldD}" stroke-width=".6"/>`);
        break;
      case 'diamantes':
        parts.push(`<path d="${U}" stroke="#bfe9ff" stroke-width="4" fill="none"/><path d="${U}" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-dasharray="1.4 1.4"/>`);
        parts.push('<path d="M50 80.5 l3.6 3.6 l-3.6 4.6 l-3.6 -4.6 Z" fill="#e9f8ff" stroke="#7fd1f5" stroke-width=".8"/><path d="M48.2 84.1 h3.6" stroke="#7fd1f5" stroke-width=".6"/>');
        break;
      case 'oro gruesa':
        parts.push(`<path d="${U}" stroke="${goldD}" stroke-width="5" fill="none"/><path d="${U}" stroke="${gold}" stroke-width="3.4" fill="none" stroke-dasharray="3 1.4"/>`);
        break;
      case 'plata':
        parts.push(`<path d="${U}" stroke="#d7dbe0" stroke-width="2" fill="none" stroke-dasharray="2.2 1.2"/>`);
        break;
      case 'dólar':
        parts.push(`<path d="${U}" stroke="${gold}" stroke-width="2.4" fill="none" stroke-dasharray="2.4 1.2"/>`);
        parts.push(`<circle cx="50" cy="85" r="4.6" fill="${gold}" stroke="${goldD}" stroke-width=".8"/><path d="M51.8 83.2 Q50 82 48.5 83.2 Q47.8 84.6 50 85 Q52.2 85.4 51.5 86.8 Q50 88 48.2 86.8 M50 81.8 V88.4" stroke="#7a5a00" stroke-width="1" fill="none" stroke-linecap="round"/>`);
        break;
      case 'doble':
        parts.push(`<path d="M41 70 Q43 78 50 79 Q57 78 59 70" stroke="#d7dbe0" stroke-width="1.8" fill="none" stroke-dasharray="2 1.1"/>`);
        parts.push(`<path d="M38 71 Q40 85 50 86 Q60 85 62 71" stroke="${gold}" stroke-width="2.6" fill="none" stroke-dasharray="2.6 1.2"/>`);
        break;
      default: break;
    }
  }

  // orejas y cabeza
  parts.push(`<ellipse cx="26" cy="49" rx="4.5" ry="6.5" fill="${skinD}"/><ellipse cx="74" cy="49" rx="4.5" ry="6.5" fill="${skinD}"/>`);
  parts.push(`<ellipse cx="50" cy="46" rx="24" ry="27" fill="${skin}"/>`);

  // granos en la cara
  if (a.acne === 'granos rojos') {
    parts.push(dots([[33, 55], [37, 60], [66, 56], [62, 61], [45, 33], [57, 35]], 1.4, '#d9534f', ' opacity=".85"'));
  } else if (a.acne === 'granos muy rojos') {
    parts.push(dots([[32, 54], [36, 59], [31, 61], [39, 64], [67, 55], [63, 60], [68, 62], [60, 65], [43, 32], [50, 30], [57, 33], [47, 36], [54, 68]], 1.9, '#c81e1e'));
    parts.push(dots([[36, 59], [63, 60], [50, 30], [39, 64], [60, 65]], 0.7, '#fff3c4'));
  }

  // pelo (encima)
  if (a.hat !== 'capucha negra') {
    switch (a.hair) {
      case 'corto': parts.push(`<path d="M26 42 Q25 17 50 17 Q75 17 74 42 Q70 28 50 28 Q31 28 26 42 Z" fill="${hairC}"/>`); break;
      case 'largo': parts.push(`<path d="M26 44 Q25 16 50 16 Q75 16 74 44 Q66 26 50 27 Q34 26 26 44 Z" fill="${hairC}"/>`); break;
      case 'rulos': {
        const c = [[30, 30], [38, 22], [48, 19], [58, 21], [67, 27], [72, 36], [27, 39]];
        parts.push(c.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${hairC}"/>`).join(''));
        break;
      }
      case 'rapado': parts.push(`<path d="M27 40 Q26 19 50 19 Q74 19 73 40 Q66 27 50 27 Q34 27 27 40 Z" fill="${hairC}" opacity=".55"/>`); break;
      case 'cresta': parts.push(`<path d="M44 26 Q46 6 50 4 Q54 6 56 26 Z" fill="${hairC}"/>`); break;
      default: break; // pelado
    }
  }

  // cejas, ojos, nariz, boca
  parts.push(`<path d="M36 40 Q41 37 46 40 M54 40 Q59 37 64 40" stroke="${a.hair === 'pelado' ? shade(skin, 0.6) : hairC}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  parts.push('<circle cx="41" cy="47" r="3" fill="#1b1b1b"/><circle cx="59" cy="47" r="3" fill="#1b1b1b"/><circle cx="42" cy="46" r="1" fill="#fff"/><circle cx="60" cy="46" r="1" fill="#fff"/>');
  parts.push(`<path d="M50 50 Q47 57 50 58 Q52 58 53 57" stroke="${shade(skin, 0.7)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
  parts.push('<path d="M42 63 Q50 69 58 63" stroke="#7a2f2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>');

  // barba
  switch (a.beard) {
    case 'bigote': parts.push(`<path d="M40 61 Q45 57 50 60 Q55 57 60 61 Q55 63 50 62 Q45 63 40 61 Z" fill="${hairC}"/>`); break;
    case 'barba': parts.push(`<path d="M27 50 Q28 74 50 75 Q72 74 73 50 Q70 64 60 66 Q50 71 40 66 Q30 64 27 50 Z" fill="${hairC}"/><path d="M41 61 Q50 57 59 61 Q50 63 41 61 Z" fill="${hairC}"/>`); break;
    case 'candado': parts.push(`<path d="M44 66 Q50 76 56 66 Q50 69 44 66 Z" fill="${hairC}"/><path d="M42 61 Q50 57 58 61 Q50 63 42 61 Z" fill="${hairC}"/>`); break;
    default: break;
  }

  // gafas
  switch (a.glasses) {
    case 'redondas': parts.push('<g fill="none" stroke="#222" stroke-width="2"><circle cx="41" cy="47" r="7"/><circle cx="59" cy="47" r="7"/><path d="M48 47 L52 47 M34 46 L27 44 M66 46 L73 44"/></g>'); break;
    case 'cuadradas': parts.push('<g fill="none" stroke="#222" stroke-width="2"><rect x="33" y="41" width="15" height="11" rx="2"/><rect x="52" y="41" width="15" height="11" rx="2"/><path d="M48 46 L52 46 M33 45 L27 43 M67 45 L73 43"/></g>'); break;
    case 'sol': parts.push('<g><rect x="32" y="41" width="16" height="11" rx="4" fill="#111"/><rect x="52" y="41" width="16" height="11" rx="4" fill="#111"/><path d="M48 45 L52 45 M32 44 L27 42 M68 44 L73 42" stroke="#111" stroke-width="2"/><path d="M35 44 L40 43" stroke="#777" stroke-width="1.5"/></g>'); break;
    case 'sol aviador':
      parts.push('<g stroke="#d4a017" stroke-width="1.4"><path d="M32 42 Q40 39 48 42 Q49 52 41 55 Q33 53 32 42 Z" fill="#2a3b2c"/><path d="M52 42 Q60 39 68 42 Q67 53 59 55 Q51 52 52 42 Z" fill="#2a3b2c"/><path d="M48 43 Q50 41 52 43 M32 43 L27 42 M68 43 L73 42" fill="none"/></g>');
      parts.push('<path d="M35 44 L39 43 M55 44 L59 43" stroke="#9fc5a4" stroke-width="1.2" stroke-linecap="round"/>');
      break;
    case 'sol deportivas':
      parts.push('<path d="M28 43 Q50 37 72 43 Q72 51 62 53 Q54 54 50 49 Q46 54 38 53 Q28 51 28 43 Z" fill="#ff6a00" stroke="#111" stroke-width="1.6"/>');
      parts.push('<path d="M31 44 Q50 39 69 44" stroke="#ffd08a" stroke-width="1.4" fill="none" opacity=".8"/><path d="M28 44 L25 43 M72 44 L75 43" stroke="#111" stroke-width="2.4"/>');
      break;
    default: break;
  }

  // sombreros
  switch (a.hat) {
    case 'gorra': parts.push('<path d="M25 33 Q26 12 50 12 Q74 12 75 33 Z" fill="#c0392b"/><path d="M48 31 Q70 28 88 34 Q72 38 50 36 Z" fill="#962d22"/><circle cx="50" cy="13" r="2.4" fill="#962d22"/>'); break;
    case 'gorra negra': parts.push('<path d="M25 33 Q26 12 50 12 Q74 12 75 33 Z" fill="#1b1c20"/><path d="M48 31 Q70 28 88 34 Q72 38 50 36 Z" fill="#0c0c0e"/><circle cx="50" cy="13" r="2.4" fill="#0c0c0e"/><path d="M44 22 h12" stroke="#3a3c44" stroke-width="2" stroke-linecap="round"/>'); break;
    case 'vaquero': parts.push('<ellipse cx="50" cy="28" rx="40" ry="7" fill="#8b5a2b"/><path d="M30 28 Q30 6 50 8 Q70 6 70 28 Z" fill="#a0692f"/><path d="M31 23 L69 23" stroke="#5a3a1a" stroke-width="3"/>'); break;
    case 'vaquero negro': parts.push('<ellipse cx="50" cy="28" rx="40" ry="7" fill="#131316"/><path d="M30 28 Q30 6 50 8 Q70 6 70 28 Z" fill="#1f2025"/><path d="M31 23 L69 23" stroke="#8a8f99" stroke-width="2.4"/>'); break;
    case 'fedora negro': parts.push('<ellipse cx="50" cy="27" rx="33" ry="5.5" fill="#101013"/><path d="M31 27 Q30 9 42 10 Q50 14 58 10 Q70 9 69 27 Z" fill="#1c1d22"/><path d="M31.5 22 L68.5 22" stroke="#555a66" stroke-width="3.4"/>'); break;
    case 'lana': parts.push('<path d="M24 34 Q25 10 50 10 Q75 10 76 34 Z" fill="#2e86c1"/><rect x="23" y="29" width="54" height="8" rx="4" fill="#1b5e8a"/><circle cx="50" cy="8" r="6" fill="#f2f2f2"/>'); break;
    case 'lana negra': parts.push('<path d="M24 34 Q25 10 50 10 Q75 10 76 34 Z" fill="#1b1c20"/><rect x="23" y="29" width="54" height="8" rx="4" fill="#0c0c0e"/><path d="M30 33 v-3 M38 33 v-3 M46 33 v-3 M54 33 v-3 M62 33 v-3 M70 33 v-3" stroke="#2c2e35" stroke-width="1.6"/>'); break;
    case 'galera': parts.push('<ellipse cx="50" cy="26" rx="31" ry="5" fill="#111"/><rect x="34" y="0" width="32" height="26" rx="3" fill="#1d1d1f"/><rect x="34" y="18" width="32" height="5" fill="#8e2a20"/>'); break;
    case 'boina': parts.push('<ellipse cx="46" cy="22" rx="28" ry="10" fill="#2c3e50"/><circle cx="48" cy="12" r="2.5" fill="#2c3e50"/>'); break;
    case 'capucha negra': parts.push('<path d="M23 48 Q20 11 50 10 Q80 11 77 48 Q73 25 50 24 Q27 25 23 48 Z" fill="#202228" stroke="#3b3e47" stroke-width="1.5"/><path d="M44 78 v8 M56 78 v8" stroke="#e8e8e8" stroke-width="1.4" stroke-linecap="round"/>'); break;
    default: break;
  }

  const t = title ? `<title>${String(title).replace(/[<>&"]/g, '')}</title>` : '';
  return `<svg class="avatar-svg" viewBox="0 0 100 100" role="img" aria-label="Personaje" xmlns="http://www.w3.org/2000/svg">${t}${parts.join('')}</svg>`;
}

const WATCH_CLASS = { AP: 'ap', 'Rolex de oro': 'rolex', arcoíris: 'arco', multicolor: 'multi', diamantes: 'diam' };

/** Manos del personaje (con o sin cartas en medio). El reloj va en la muñeca izquierda. */
export function handsHtml(a = {}, inner = '', cls = '') {
  const skin = col(a.skin, '#e0b08a');
  const w = WATCH_CLASS[a.watch];
  const watch = w ? `<i class="watch w-${w}"></i>` : '';
  const h = (extra) => `<span class="hand" style="background:${skin}">${extra}</span>`;
  return `<div class="hands ${cls}">${h(watch)}<div class="hand-cards">${inner}</div>${h('')}</div>`;
}

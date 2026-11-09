/* Personajes dibujados en SVG: cara, pelo, sombrero, gafas, barba y camisa. */

export const LABELS = {
  skin: 'Color de piel',
  hair: 'Pelo',
  hairColor: 'Color de pelo',
  hat: 'Sombrero',
  glasses: 'Gafas',
  beard: 'Barba',
  shirt: 'Camisa',
};

export const VALUE_LABELS = {
  corto: 'Corto', largo: 'Largo', rulos: 'Rulos', rapado: 'Rapado', pelado: 'Pelado', cresta: 'Cresta',
  ninguno: 'Ninguno', gorra: 'Gorra', vaquero: 'Vaquero', lana: 'Gorro de lana', galera: 'Galera', boina: 'Boina',
  ninguna: 'Ninguna', redondas: 'Redondas', sol: 'De sol', cuadradas: 'Cuadradas',
  bigote: 'Bigote', barba: 'Barba', candado: 'Candado',
};

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

/** Devuelve el SVG (texto) del personaje. Todos los valores se validan: no se inserta texto libre. */
export function avatarSvg(a = {}, { title = '' } = {}) {
  const skin = col(a.skin, '#e0b08a');
  const skinD = shade(skin, 0.85);
  const hairC = col(a.hairColor, '#2b2118');
  const shirt = col(a.shirt, '#2f6fb0');
  const parts = [];

  // pelo largo: va detrás de la cabeza
  if (a.hair === 'largo') parts.push(`<path d="M23 44 Q22 13 50 13 Q78 13 77 44 L80 80 Q70 76 66 64 L34 64 Q30 76 20 80 Z" fill="${hairC}"/>`);

  // camisa, cuello
  if (a.dealer) {
    parts.push('<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="#ffffff"/>');
    parts.push('<path d="M14 100 Q16 80 38 77 L50 100 Z" fill="#1d1d1f"/><path d="M86 100 Q84 80 62 77 L50 100 Z" fill="#1d1d1f"/>');
  } else {
    parts.push(`<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="${shirt}"/>`);
  }
  parts.push(`<rect x="43" y="66" width="14" height="13" rx="4" fill="${skinD}"/>`);
  if (a.dealer) parts.push('<path d="M42 80 L50 84 L42 88 Z M58 80 L50 84 L58 88 Z" fill="#c0392b"/><circle cx="50" cy="84" r="2.2" fill="#8e2a20"/>');

  // orejas y cabeza
  parts.push(`<ellipse cx="26" cy="49" rx="4.5" ry="6.5" fill="${skinD}"/><ellipse cx="74" cy="49" rx="4.5" ry="6.5" fill="${skinD}"/>`);
  parts.push(`<ellipse cx="50" cy="46" rx="24" ry="27" fill="${skin}"/>`);

  // pelo (encima)
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
    default: break;
  }

  // sombreros
  switch (a.hat) {
    case 'gorra': parts.push('<path d="M25 33 Q26 12 50 12 Q74 12 75 33 Z" fill="#c0392b"/><path d="M48 31 Q70 28 88 34 Q72 38 50 36 Z" fill="#962d22"/><circle cx="50" cy="13" r="2.4" fill="#962d22"/>'); break;
    case 'vaquero': parts.push('<ellipse cx="50" cy="28" rx="40" ry="7" fill="#8b5a2b"/><path d="M30 28 Q30 6 50 8 Q70 6 70 28 Z" fill="#a0692f"/><path d="M31 23 L69 23" stroke="#5a3a1a" stroke-width="3"/>'); break;
    case 'lana': parts.push('<path d="M24 34 Q25 10 50 10 Q75 10 76 34 Z" fill="#2e86c1"/><rect x="23" y="29" width="54" height="8" rx="4" fill="#1b5e8a"/><circle cx="50" cy="8" r="6" fill="#f2f2f2"/>'); break;
    case 'galera': parts.push('<ellipse cx="50" cy="26" rx="31" ry="5" fill="#111"/><rect x="34" y="0" width="32" height="26" rx="3" fill="#1d1d1f"/><rect x="34" y="18" width="32" height="5" fill="#8e2a20"/>'); break;
    case 'boina': parts.push('<ellipse cx="46" cy="22" rx="28" ry="10" fill="#2c3e50"/><circle cx="48" cy="12" r="2.5" fill="#2c3e50"/>'); break;
    default: break;
  }

  const t = title ? `<title>${String(title).replace(/[<>&"]/g, '')}</title>` : '';
  return `<svg class="avatar-svg" viewBox="0 0 100 100" role="img" aria-label="Personaje" xmlns="http://www.w3.org/2000/svg">${t}${parts.join('')}</svg>`;
}

/** Manos del personaje (con o sin cartas en medio). */
export function handsHtml(a = {}, inner = '', cls = '') {
  const skin = col(a.skin, '#e0b08a');
  const h = `<span class="hand" style="background:${skin}"></span>`;
  return `<div class="hands ${cls}">${h}<div class="hand-cards">${inner}</div>${h}</div>`;
}

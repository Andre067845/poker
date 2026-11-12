/* Personajes dibujados en SVG: tipo de cara, ojeras, granos, boca y dientes, pelo, sombrero, gafas,
   barba, torso, cadena, audífonos y reloj. */

export const LABELS = {
  skin: 'Color de piel',
  face: 'Tipo de cara',
  head: 'Tamaño de cabeza',
  eyeBags: 'Ojeras',
  acne: 'Granos en la cara',
  mouth: 'Boca y dientes',
  hair: 'Pelo',
  hairColor: 'Color de pelo',
  hat: 'Sombrero',
  glasses: 'Gafas',
  ears: 'Audífonos',
  beard: 'Barba',
  body: 'Polera',
  shirt: 'Color de polera',
  chain: 'Cadena',
  watch: 'Reloj',
};

export const ORDER = ['skin', 'face', 'head', 'eyeBags', 'acne', 'mouth', 'hair', 'hairColor', 'hat', 'glasses', 'ears',
  'beard', 'body', 'shirt', 'chain', 'watch'];

export const VALUE_LABELS = {
  lana: 'Gorro de lana', 'lana negra': 'Gorro de lana negro', sol: 'De sol clásicas', 'sol aviador': 'De sol aviador',
  'sol deportivas': 'De sol deportivas', 'sin polera con granos': 'Sin polera, con granos en pecho y espalda',
  dólar: 'Con dólar', doble: 'Doble (oro y plata)', diamantes: 'De diamantes', arcoíris: 'Arcoíris', multicolor: 'Multicolor',
  'brackets con comida': 'Brackets con comida', 'dientes de castor': 'Dientes de castor',
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

/** Boca abierta sonriendo con dientes del color indicado. */
function smile(tooth, line, extra = '') {
  return '<path d="M39.5 60.5 Q50 74 60.5 60.5 Z" fill="#4a1414"/>'
    + '<path d="M44 68 Q50 72 56 68 Q50 70.5 44 68 Z" fill="#c2545a"/>'
    + `<path d="M40.6 61 Q50 63.6 59.4 61 L57.6 65 Q50 68 42.4 65 Z" fill="${tooth}" stroke="${line}" stroke-width=".5"/>`
    + `<path d="M44 62.2 V66 M47 62.8 V67 M50 63 V67.3 M53 62.8 V67 M56 62.2 V66" stroke="${line}" stroke-width=".55"/>${extra}`;
}

function mouthSvg(kind, lip) {
  switch (kind) {
    case 'sonrisa': return smile('#ffffff', '#c9c9c9');
    case 'carillas de diamantes':
      return smile('#e6faff', '#63c6ee',
        '<path d="M45.5 63.2 l.9 1.3 l-.9 1.3 l-.9 -1.3 Z M51.5 63.6 l.9 1.3 l-.9 1.3 l-.9 -1.3 Z M55 63 l.8 1.1 l-.8 1.1 l-.8 -1.1 Z" fill="#ffffff"/>'
        + '<path d="M42.5 59.5 l.5 1.6 l1.6 .5 l-1.6 .5 l-.5 1.6 l-.5 -1.6 l-1.6 -.5 l1.6 -.5 Z M58 58.5 l.4 1.3 l1.3 .4 l-1.3 .4 l-.4 1.3 l-.4 -1.3 l-1.3 -.4 l1.3 -.4 Z" fill="#ffffff"/>');
    case 'carillas de oro':
      return smile('#f4c430', '#9a6f00', '<path d="M42.6 62 Q50 64.2 57.4 62" stroke="#fff3b0" stroke-width=".8" fill="none" opacity=".9"/>');
    case 'dientes amarillos': return smile('#e3c93a', '#9c8413', '<path d="M45.4 64.5 h1.2 M52.4 65 h1.2" stroke="#b79a1c" stroke-width="1"/>');
    case 'dientes negros':
      return smile('#2b211a', '#0e0a07', '<rect x="47.2" y="62.8" width="2.6" height="4.2" fill="#4a1414"/><rect x="53.2" y="62.6" width="2.6" height="4" fill="#4a1414"/>');
    case 'brackets con comida':
      return smile('#ffffff', '#c9c9c9',
        '<path d="M41.6 63.6 Q50 66.4 58.4 63.6" stroke="#8a929c" stroke-width=".8" fill="none"/>'
        + [42.6, 45.5, 48.5, 51.5, 54.5, 57.4].map((x, i) => `<rect x="${x - 0.9}" y="${63.1 + (i === 0 || i === 5 ? 0 : 0.9) - 0.1}" width="1.8" height="1.6" rx=".3" fill="#b9c0c9" stroke="#6d747d" stroke-width=".3"/>`).join('')
        + '<path d="M46.4 65.3 l1.5 .5 l-.4 1.2 l-1.3 -.5 Z M52.6 65.6 l1.6 -.3 l.2 1.2 l-1.5 .3 Z" fill="#3f9b3a"/><circle cx="49.9" cy="65.9" r=".8" fill="#e08a1e"/>');
    case 'dientes de castor':
      return `<path d="M42 63 Q50 69 58 63" stroke="${lip}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
        + '<path d="M46.3 64.6 h3.5 v9.4 q-1.75 1.4 -3.5 0 Z M50.2 64.6 h3.5 v9.4 q-1.75 1.4 -3.5 0 Z" fill="#fffdf2" stroke="#b9b39c" stroke-width=".6"/>';
    default:
      return `<path d="M42 63 Q50 69 58 63" stroke="${lip}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  }
}

/** Devuelve el SVG (texto) del personaje. Todos los valores se validan: no se inserta texto libre. */
export function avatarSvg(a = {}, { title = '' } = {}) {
  const skin = col(a.skin, '#e0b08a');
  const skinD = shade(skin, 0.85);
  const hairC = col(a.hairColor, '#2b2118');
  const shirt = col(a.shirt, '#2f6fb0');
  const bare = !a.dealer && (a.body === 'sin polera' || a.body === 'sin polera con granos');
  const face = a.dealer ? 'adulto' : (a.face || 'adulto');
  const kid = face === 'niño' || face === 'niña';
  const old = face === 'abuelo' || face === 'abuela';
  const fem = face === 'niña' || face === 'señora' || face === 'abuela';
  const hood = a.hat === 'capucha negra';
  const back = []; // detrás del cuerpo (pelo largo, capucha)
  const body = []; // torso, cuello, cadenas
  const head = []; // cabeza y todo lo que lleva encima

  if (hood) back.push('<path d="M17 62 Q12 2 50 3 Q88 2 83 62 L88 86 L12 86 Z" fill="#202228" stroke="#3b3e47" stroke-width="1.5"/>');
  if (a.hair === 'largo' && !hood) back.push(`<path d="M23 44 Q22 13 50 13 Q78 13 77 44 L80 80 Q70 76 66 64 L34 64 Q30 76 20 80 Z" fill="${hairC}"/>`);
  if (face === 'niña' && !hood && a.hair !== 'pelado' && a.hair !== 'rapado') {
    // dos colitas
    back.push(`<ellipse cx="20" cy="50" rx="6" ry="11" fill="${hairC}"/><ellipse cx="80" cy="50" rx="6" ry="11" fill="${hairC}"/>`);
  }

  // torso: polera, uniforme del crupier o sin polera
  if (a.dealer) {
    body.push('<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="#ffffff"/>');
    body.push('<path d="M14 100 Q16 80 38 77 L50 100 Z" fill="#1d1d1f"/><path d="M86 100 Q84 80 62 77 L50 100 Z" fill="#1d1d1f"/>');
  } else if (bare) {
    body.push(`<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="${skin}"/>`);
    body.push(`<path d="M30 88 Q40 94 49 89 M51 89 Q60 94 70 88 M50 82 L50 100" stroke="${skinD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
    if (a.body === 'sin polera con granos') {
      body.push(dots([[24, 90], [29, 84], [34, 95], [40, 86], [44, 96], [57, 95], [61, 86], [66, 94], [72, 85], [77, 91], [20, 97], [81, 97], [37, 80], [64, 80]], 1.7, '#c62828'));
      body.push(dots([[29, 84], [44, 96], [66, 94], [77, 91]], 0.6, '#ffd9d9'));
    }
  } else {
    body.push(`<path d="M14 100 Q16 78 50 76 Q84 78 86 100 Z" fill="${shirt}"/>`);
  }
  body.push(`<rect x="43" y="66" width="14" height="13" rx="4" fill="${skinD}"/>`);
  if (a.dealer) body.push('<path d="M42 80 L50 84 L42 88 Z M58 80 L50 84 L58 88 Z" fill="#c0392b"/><circle cx="50" cy="84" r="2.2" fill="#8e2a20"/>');

  // cadenas
  if (!a.dealer) {
    const U = 'M39 70 Q41 81 50 82 Q59 81 61 70';
    const gold = '#f2c230'; const goldD = '#b8860b';
    switch (a.chain) {
      case 'cruz de oro':
        body.push(`<path d="${U}" stroke="${gold}" stroke-width="2" fill="none" stroke-dasharray="2.2 1.2"/>`);
        body.push(`<path d="M48.8 80.5 h2.4 v2.6 h2.6 v2.3 h-2.6 v4.4 h-2.4 v-4.4 h-2.6 v-2.3 h2.6 Z" fill="${gold}" stroke="${goldD}" stroke-width=".6"/>`);
        break;
      case 'diamantes':
        body.push(`<path d="${U}" stroke="#bfe9ff" stroke-width="4" fill="none"/><path d="${U}" stroke="#ffffff" stroke-width="2.2" fill="none" stroke-dasharray="1.4 1.4"/>`);
        body.push('<path d="M50 80.5 l3.6 3.6 l-3.6 4.6 l-3.6 -4.6 Z" fill="#e9f8ff" stroke="#7fd1f5" stroke-width=".8"/><path d="M48.2 84.1 h3.6" stroke="#7fd1f5" stroke-width=".6"/>');
        break;
      case 'oro gruesa':
        body.push(`<path d="${U}" stroke="${goldD}" stroke-width="5" fill="none"/><path d="${U}" stroke="${gold}" stroke-width="3.4" fill="none" stroke-dasharray="3 1.4"/>`);
        break;
      case 'plata':
        body.push(`<path d="${U}" stroke="#d7dbe0" stroke-width="2" fill="none" stroke-dasharray="2.2 1.2"/>`);
        break;
      case 'dólar':
        body.push(`<path d="${U}" stroke="${gold}" stroke-width="2.4" fill="none" stroke-dasharray="2.4 1.2"/>`);
        body.push(`<circle cx="50" cy="85" r="4.6" fill="${gold}" stroke="${goldD}" stroke-width=".8"/><path d="M51.8 83.2 Q50 82 48.5 83.2 Q47.8 84.6 50 85 Q52.2 85.4 51.5 86.8 Q50 88 48.2 86.8 M50 81.8 V88.4" stroke="#7a5a00" stroke-width="1" fill="none" stroke-linecap="round"/>`);
        break;
      case 'doble':
        body.push('<path d="M41 70 Q43 78 50 79 Q57 78 59 70" stroke="#d7dbe0" stroke-width="1.8" fill="none" stroke-dasharray="2 1.1"/>');
        body.push(`<path d="M38 71 Q40 85 50 86 Q60 85 62 71" stroke="${gold}" stroke-width="2.6" fill="none" stroke-dasharray="2.6 1.2"/>`);
        break;
      default: break;
    }
  }

  // orejas y cabeza
  head.push(`<ellipse cx="26" cy="49" rx="4.5" ry="6.5" fill="${skinD}"/><ellipse cx="74" cy="49" rx="4.5" ry="6.5" fill="${skinD}"/>`);
  head.push(kid
    ? `<ellipse cx="50" cy="47" rx="25" ry="25.5" fill="${skin}"/>`
    : `<ellipse cx="50" cy="46" rx="24" ry="27" fill="${skin}"/>`);

  // rasgos según el tipo de cara
  const wr = shade(skin, 0.7);
  if (old) {
    head.push(`<path d="M38 30 Q50 27 62 30 M40 34 Q50 31.5 60 34 M34 44 l-3 -1.6 M34 46.5 l-3.4 .4 M66 44 l3 -1.6 M66 46.5 l3.4 .4 M37 56 Q35 61 38 66 M63 56 Q65 61 62 66 M44 71 Q50 73 56 71" stroke="${wr}" stroke-width="1" fill="none" stroke-linecap="round" opacity=".9"/>`);
  }
  if (kid || face === 'joven') {
    head.push(`<circle cx="34.5" cy="57" r="${kid ? 4.4 : 3.6}" fill="#ff7a8a" opacity="${kid ? 0.45 : 0.25}"/><circle cx="65.5" cy="57" r="${kid ? 4.4 : 3.6}" fill="#ff7a8a" opacity="${kid ? 0.45 : 0.25}"/>`);
  }
  if (kid) head.push(dots([[44, 54.5], [47, 56], [53, 56], [56, 54.5]], 0.7, shade(skin, 0.62)));
  if (face === 'señora' || face === 'abuela') {
    head.push('<ellipse cx="41" cy="44.6" rx="5.4" ry="2.6" fill="#7b4fa3" opacity=".35"/><ellipse cx="59" cy="44.6" rx="5.4" ry="2.6" fill="#7b4fa3" opacity=".35"/>');
    const pearl = face === 'abuela' ? '#fdfdfd' : '#f2c230';
    head.push(`<circle cx="25.5" cy="57.5" r="2.3" fill="${pearl}" stroke="#9a8a5a" stroke-width=".4"/><circle cx="74.5" cy="57.5" r="2.3" fill="${pearl}" stroke="#9a8a5a" stroke-width=".4"/>`);
  }

  // ojeras
  if (a.eyeBags === 'ojeras') {
    const bag = shade(skin, 0.55);
    head.push(`<path d="M35.5 51 Q41 57.5 46.5 51 Q41 54 35.5 51 Z M53.5 51 Q59 57.5 64.5 51 Q59 54 53.5 51 Z" fill="${bag}" opacity=".75"/>`);
    head.push(`<path d="M36.5 54.6 Q41 58 45.5 54.6 M54.5 54.6 Q59 58 63.5 54.6" stroke="${bag}" stroke-width=".8" fill="none" opacity=".7"/>`);
  }

  // granos en la cara
  if (a.acne === 'granos rojos') {
    head.push(dots([[33, 55], [37, 60], [66, 56], [62, 61], [45, 33], [57, 35]], 1.4, '#d9534f', ' opacity=".85"'));
  } else if (a.acne === 'granos muy rojos') {
    head.push(dots([[32, 54], [36, 59], [31, 61], [39, 64], [67, 55], [63, 60], [68, 62], [60, 65], [43, 32], [50, 30], [57, 33], [47, 36], [54, 68]], 1.9, '#c81e1e'));
    head.push(dots([[36, 59], [63, 60], [50, 30], [39, 64], [60, 65]], 0.7, '#fff3c4'));
  }

  // pelo (encima)
  if (!hood) {
    switch (a.hair) {
      case 'corto': head.push(`<path d="M26 42 Q25 17 50 17 Q75 17 74 42 Q70 28 50 28 Q31 28 26 42 Z" fill="${hairC}"/>`); break;
      case 'largo': head.push(`<path d="M26 44 Q25 16 50 16 Q75 16 74 44 Q66 26 50 27 Q34 26 26 44 Z" fill="${hairC}"/>`); break;
      case 'rulos': {
        const c = [[30, 30], [38, 22], [48, 19], [58, 21], [67, 27], [72, 36], [27, 39]];
        head.push(c.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${hairC}"/>`).join(''));
        break;
      }
      case 'rapado': head.push(`<path d="M27 40 Q26 19 50 19 Q74 19 73 40 Q66 27 50 27 Q34 27 27 40 Z" fill="${hairC}" opacity=".55"/>`); break;
      case 'cresta': head.push(`<path d="M44 26 Q46 6 50 4 Q54 6 56 26 Z" fill="${hairC}"/>`); break;
      default: break; // pelado
    }
    if (face === 'niña' && a.hat === 'ninguno') head.push('<path d="M64 20 l7 -5 v10 Z M64 20 l-7 -5 v10 Z" fill="#ff5fa2"/><circle cx="64" cy="20" r="2" fill="#d63a80"/>');
    if (face === 'abuela' && a.hat === 'ninguno' && a.hair !== 'pelado') head.push(`<circle cx="50" cy="13" r="7" fill="${hairC}"/>`);
  }

  // cejas, ojos, nariz
  const browC = old ? '#e9e9e9' : (a.hair === 'pelado' ? shade(skin, 0.6) : hairC);
  head.push(`<path d="M36 40 Q41 ${old ? 36 : 37} 46 40 M54 40 Q59 ${old ? 36 : 37} 64 40" stroke="${browC}" stroke-width="${old ? 3.2 : kid ? 1.8 : 2.2}" fill="none" stroke-linecap="round"/>`);
  const er = kid ? 3.9 : 3;
  head.push(`<circle cx="41" cy="47" r="${er}" fill="#1b1b1b"/><circle cx="59" cy="47" r="${er}" fill="#1b1b1b"/><circle cx="42.1" cy="45.9" r="${kid ? 1.5 : 1}" fill="#fff"/><circle cx="60.1" cy="45.9" r="${kid ? 1.5 : 1}" fill="#fff"/>`);
  if (fem) head.push('<path d="M37.2 45.2 l-2.6 -1.8 M38 43.8 l-1.8 -2.4 M62.8 45.2 l2.6 -1.8 M62 43.8 l1.8 -2.4" stroke="#1b1b1b" stroke-width="1.1" stroke-linecap="round"/>');
  if (old) head.push(`<path d="M36.5 51.5 Q41 54.5 45.5 51.5 M54.5 51.5 Q59 54.5 63.5 51.5" stroke="${wr}" stroke-width=".9" fill="none"/>`);
  head.push(kid
    ? `<path d="M48.6 55.5 Q50 57.2 51.4 55.5" stroke="${shade(skin, 0.7)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    : `<path d="M50 50 Q47 57 50 58 Q52 58 53 57" stroke="${shade(skin, 0.7)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);

  // boca y dientes
  const lip = face === 'señora' ? '#c2185b' : face === 'abuela' ? '#b5546e' : '#7a2f2a';
  head.push(mouthSvg(a.dealer ? 'boca cerrada' : a.mouth, lip));

  // barba
  switch (a.beard) {
    case 'bigote': head.push(`<path d="M40 61 Q45 57 50 60 Q55 57 60 61 Q55 63 50 62 Q45 63 40 61 Z" fill="${hairC}"/>`); break;
    case 'barba': head.push(`<path d="M27 50 Q28 74 50 75 Q72 74 73 50 Q70 64 61 67 Q62 74 50 75 Q38 74 39 67 Q30 64 27 50 Z" fill="${hairC}"/><path d="M40 60.4 Q50 56.6 60 60.4 Q50 61.6 40 60.4 Z" fill="${hairC}"/>`); break;
    case 'candado': head.push(`<path d="M43 71 Q50 78 57 71 Q50 73.5 43 71 Z" fill="${hairC}"/><path d="M41 60.4 Q50 56.6 59 60.4 Q50 61.6 41 60.4 Z" fill="${hairC}"/>`); break;
    default: break;
  }

  // gafas
  switch (a.glasses) {
    case 'redondas': head.push('<g fill="none" stroke="#222" stroke-width="2"><circle cx="41" cy="47" r="7"/><circle cx="59" cy="47" r="7"/><path d="M48 47 L52 47 M34 46 L27 44 M66 46 L73 44"/></g>'); break;
    case 'cuadradas': head.push('<g fill="none" stroke="#222" stroke-width="2"><rect x="33" y="41" width="15" height="11" rx="2"/><rect x="52" y="41" width="15" height="11" rx="2"/><path d="M48 46 L52 46 M33 45 L27 43 M67 45 L73 43"/></g>'); break;
    case 'sol': head.push('<g><rect x="32" y="41" width="16" height="11" rx="4" fill="#111"/><rect x="52" y="41" width="16" height="11" rx="4" fill="#111"/><path d="M48 45 L52 45 M32 44 L27 42 M68 44 L73 42" stroke="#111" stroke-width="2"/><path d="M35 44 L40 43" stroke="#777" stroke-width="1.5"/></g>'); break;
    case 'sol aviador':
      head.push('<g stroke="#d4a017" stroke-width="1.4"><path d="M32 42 Q40 39 48 42 Q49 52 41 55 Q33 53 32 42 Z" fill="#2a3b2c"/><path d="M52 42 Q60 39 68 42 Q67 53 59 55 Q51 52 52 42 Z" fill="#2a3b2c"/><path d="M48 43 Q50 41 52 43 M32 43 L27 42 M68 43 L73 42" fill="none"/></g>');
      head.push('<path d="M35 44 L39 43 M55 44 L59 43" stroke="#9fc5a4" stroke-width="1.2" stroke-linecap="round"/>');
      break;
    case 'sol deportivas':
      head.push('<path d="M28 43 Q50 37 72 43 Q72 51 62 53 Q54 54 50 49 Q46 54 38 53 Q28 51 28 43 Z" fill="#ff6a00" stroke="#111" stroke-width="1.6"/>');
      head.push('<path d="M31 44 Q50 39 69 44" stroke="#ffd08a" stroke-width="1.4" fill="none" opacity=".8"/><path d="M28 44 L25 43 M72 44 L75 43" stroke="#111" stroke-width="2.4"/>');
      break;
    default: break;
  }

  // sombreros
  switch (a.hat) {
    case 'gorra': head.push('<path d="M25 33 Q26 12 50 12 Q74 12 75 33 Z" fill="#c0392b"/><path d="M48 31 Q70 28 88 34 Q72 38 50 36 Z" fill="#962d22"/><circle cx="50" cy="13" r="2.4" fill="#962d22"/>'); break;
    case 'gorra negra': head.push('<path d="M25 33 Q26 12 50 12 Q74 12 75 33 Z" fill="#1b1c20"/><path d="M48 31 Q70 28 88 34 Q72 38 50 36 Z" fill="#0c0c0e"/><circle cx="50" cy="13" r="2.4" fill="#0c0c0e"/><path d="M44 22 h12" stroke="#3a3c44" stroke-width="2" stroke-linecap="round"/>'); break;
    case 'vaquero': head.push('<ellipse cx="50" cy="28" rx="40" ry="7" fill="#8b5a2b"/><path d="M30 28 Q30 6 50 8 Q70 6 70 28 Z" fill="#a0692f"/><path d="M31 23 L69 23" stroke="#5a3a1a" stroke-width="3"/>'); break;
    case 'vaquero negro': head.push('<ellipse cx="50" cy="28" rx="40" ry="7" fill="#131316"/><path d="M30 28 Q30 6 50 8 Q70 6 70 28 Z" fill="#1f2025"/><path d="M31 23 L69 23" stroke="#8a8f99" stroke-width="2.4"/>'); break;
    case 'fedora negro': head.push('<ellipse cx="50" cy="27" rx="33" ry="5.5" fill="#101013"/><path d="M31 27 Q30 9 42 10 Q50 14 58 10 Q70 9 69 27 Z" fill="#1c1d22"/><path d="M31.5 22 L68.5 22" stroke="#555a66" stroke-width="3.4"/>'); break;
    case 'lana': head.push('<path d="M24 34 Q25 10 50 10 Q75 10 76 34 Z" fill="#2e86c1"/><rect x="23" y="29" width="54" height="8" rx="4" fill="#1b5e8a"/><circle cx="50" cy="8" r="6" fill="#f2f2f2"/>'); break;
    case 'lana negra': head.push('<path d="M24 34 Q25 10 50 10 Q75 10 76 34 Z" fill="#1b1c20"/><rect x="23" y="29" width="54" height="8" rx="4" fill="#0c0c0e"/><path d="M30 33 v-3 M38 33 v-3 M46 33 v-3 M54 33 v-3 M62 33 v-3 M70 33 v-3" stroke="#2c2e35" stroke-width="1.6"/>'); break;
    case 'galera': head.push('<ellipse cx="50" cy="26" rx="31" ry="5" fill="#111"/><rect x="34" y="0" width="32" height="26" rx="3" fill="#1d1d1f"/><rect x="34" y="18" width="32" height="5" fill="#8e2a20"/>'); break;
    case 'boina': head.push('<ellipse cx="46" cy="22" rx="28" ry="10" fill="#2c3e50"/><circle cx="48" cy="12" r="2.5" fill="#2c3e50"/>'); break;
    case 'capucha negra': head.push('<path d="M23 48 Q20 11 50 10 Q80 11 77 48 Q73 25 50 24 Q27 25 23 48 Z" fill="#202228" stroke="#3b3e47" stroke-width="1.5"/><path d="M44 78 v8 M56 78 v8" stroke="#e8e8e8" stroke-width="1.4" stroke-linecap="round"/>'); break;
    default: break;
  }

  // audífonos (encima de todo)
  if (!a.dealer) {
    switch (a.ears) {
      case 'AirPods':
        head.push('<g fill="#ffffff" stroke="#b9bec6" stroke-width=".5"><rect x="24.6" y="51" width="2.6" height="10.5" rx="1.3"/><circle cx="26" cy="50.5" r="3"/><rect x="72.8" y="51" width="2.6" height="10.5" rx="1.3"/><circle cx="74" cy="50.5" r="3"/></g>');
        head.push('<circle cx="26.6" cy="50.2" r=".9" fill="#444"/><circle cx="73.4" cy="50.2" r=".9" fill="#444"/>');
        break;
      case 'audífonos con cable':
        head.push('<path d="M26 53 Q22 72 44 86 M74 53 Q78 72 56 86 M44 86 Q50 90 56 86 M50 88.4 V100" stroke="#f1f1f1" stroke-width="1.3" fill="none" stroke-linecap="round"/>');
        head.push('<circle cx="26" cy="51" r="3" fill="#fafafa" stroke="#9aa0a8" stroke-width=".6"/><circle cx="74" cy="51" r="3" fill="#fafafa" stroke="#9aa0a8" stroke-width=".6"/><rect x="48.4" y="86.6" width="3.2" height="4.4" rx="1" fill="#dcdcdc" stroke="#9aa0a8" stroke-width=".4"/>');
        break;
      case 'audífonos de casco':
        head.push('<path d="M23 46 Q20 8 50 8 Q80 8 77 46" stroke="#1c1d22" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M27 30 Q30 13 50 12.5 Q70 13 73 30" stroke="#44474f" stroke-width="1.2" fill="none"/>');
        head.push('<g stroke="#0b0b0d" stroke-width=".8"><rect x="17" y="39" width="11" height="22" rx="5" fill="#d0312d"/><rect x="72" y="39" width="11" height="22" rx="5" fill="#d0312d"/></g><rect x="19.4" y="43" width="4" height="14" rx="2" fill="#7c1512"/><rect x="76.6" y="43" width="4" height="14" rx="2" fill="#7c1512"/>');
        break;
      default: break;
    }
  }

  const big = !a.dealer && a.head === 'cabezona';
  const tf = big ? ' transform="translate(50 72) scale(1.3) translate(-50 -72)"' : '';
  const t = title ? `<title>${String(title).replace(/[<>&"]/g, '')}</title>` : '';
  return `<svg class="avatar-svg${big ? ' big-head' : ''}" viewBox="0 0 100 100" role="img" aria-label="Personaje" xmlns="http://www.w3.org/2000/svg">${t}<g${tf}>${back.join('')}</g>${body.join('')}<g${tf}>${head.join('')}</g></svg>`;
}

// ------------------------------------------------------------------ relojes
// Se ve la caja del reloj y solo un tramo corto de correa. Dibujos inspirados en diseños conocidos:
// bisel octogonal con tornillos y esfera cuadriculada; oro con bisel estriado, día y fecha;
// cronógrafo con bisel de gemas arcoíris; caja curva de colores; y uno cubierto de diamantes.
const CX = 20; const CY = 20;
const pt = (r, deg) => [CX + r * Math.cos((deg - 90) * Math.PI / 180), CY + r * Math.sin((deg - 90) * Math.PI / 180)];
const f2 = (n) => n.toFixed(2);
const around = (n, r, fn, off = 0) => Array.from({ length: n }, (_, i) => { const d = (360 / n) * i + off; const [x, y] = pt(r, d); return fn(x, y, d, i); }).join('');

const DEFS = `<defs>
  <linearGradient id="wSteel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".35" stop-color="#aab2bc"/><stop offset=".6" stop-color="#e9edf1"/><stop offset="1" stop-color="#7d858f"/></linearGradient>
  <linearGradient id="wSteelB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b939d"/><stop offset=".5" stop-color="#eef1f4"/><stop offset="1" stop-color="#8b939d"/></linearGradient>
  <linearGradient id="wGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".35" stop-color="#d9a520"/><stop offset=".6" stop-color="#f7dc7a"/><stop offset="1" stop-color="#8c6200"/></linearGradient>
  <linearGradient id="wGoldB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a87900"/><stop offset=".5" stop-color="#f9e08a"/><stop offset="1" stop-color="#a87900"/></linearGradient>
  <linearGradient id="wRose" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe3cf"/><stop offset=".4" stop-color="#d1906a"/><stop offset=".65" stop-color="#f3c3a3"/><stop offset="1" stop-color="#94583a"/></linearGradient>
  <linearGradient id="wRoseB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a1643f"/><stop offset=".5" stop-color="#f6cdb0"/><stop offset="1" stop-color="#a1643f"/></linearGradient>
  <linearGradient id="wIce" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bfe6fa"/><stop offset="1" stop-color="#8cc6e6"/></linearGradient>
  <radialGradient id="wBlue" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#3d6fc4"/><stop offset="1" stop-color="#0d2553"/></radialGradient>
  <radialGradient id="wChamp" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff3c9"/><stop offset="1" stop-color="#d9b25a"/></radialGradient>
  <radialGradient id="wBlack" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#3a3a3a"/><stop offset="1" stop-color="#050505"/></radialGradient>
</defs>`;

// tramo corto de correa a cada lado de la caja (se corta en el borde)
const stubs = (fill, line, detail) => `<rect x="-1" y="11" width="13" height="18" fill="${fill}" stroke="${line}" stroke-width=".5"/><rect x="28" y="11" width="13" height="18" fill="${fill}" stroke="${line}" stroke-width=".5"/>${detail}`;
const glare = '<path d="M9.5 16.5 A11.5 11.5 0 0 1 22 8.6" stroke="#ffffff" stroke-width="1.6" fill="none" opacity=".35" stroke-linecap="round"/><path d="M27 30.6 A11.5 11.5 0 0 0 31.2 24" stroke="#ffffff" stroke-width=".8" fill="none" opacity=".2" stroke-linecap="round"/>';
const crown = (fill, line) => `<rect x="33.2" y="18" width="3.4" height="4" rx=".9" fill="${fill}" stroke="${line}" stroke-width=".4"/><path d="M34.3 18.3 V21.7 M35.4 18.3 V21.7" stroke="${line}" stroke-width=".3"/>`;
const handsW = (c, lume, sec = '#d33') => {
  const [hx, hy] = pt(5.4, 305); const [mx, my] = pt(8.6, 60); const [sx, sy] = pt(9.4, 200); const [tx, ty] = pt(2.4, 20);
  return `<path d="M${CX} ${CY} L${f2(hx)} ${f2(hy)}" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/><path d="M${CX} ${CY} L${f2(mx)} ${f2(my)}" stroke="${c}" stroke-width="1.25" stroke-linecap="round"/>`
    + `<path d="M${CX} ${CY} L${f2(hx)} ${f2(hy)}" stroke="${lume}" stroke-width=".6" stroke-linecap="round" opacity=".9"/><path d="M${CX} ${CY} L${f2(mx)} ${f2(my)}" stroke="${lume}" stroke-width=".45" stroke-linecap="round" opacity=".9"/>`
    + `<path d="M${f2(tx)} ${f2(ty)} L${f2(sx)} ${f2(sy)}" stroke="${sec}" stroke-width=".4" stroke-linecap="round"/><circle cx="${CX}" cy="${CY}" r="1.1" fill="${c}"/><circle cx="${CX}" cy="${CY}" r=".45" fill="${sec}"/>`;
};
const batons = (r1, r2, fill, skip = []) => around(12, 0, (x, y, d, i) => {
  if (skip.includes(i)) return '';
  const [a, b] = pt(r1, d); const [c, e] = pt(r2, d);
  return `<path d="M${f2(a)} ${f2(b)} L${f2(c)} ${f2(e)}" stroke="${fill}" stroke-width="${i % 3 === 0 ? 1.3 : 0.9}" stroke-linecap="round"/>`;
});
const minuteTrack = (r, c) => around(60, r, (x, y) => `<circle cx="${f2(x)}" cy="${f2(y)}" r=".16" fill="${c}"/>`);

function watchSvg(kind) {
  let g = '';
  if (kind === 'AP') {
    const oct = (r) => Array.from({ length: 8 }, (_, i) => pt(r, 22.5 + i * 45).map(f2).join(',')).join(' ');
    g = stubs('url(#wSteelB)', '#6f7781', '<path d="M3 11 V29 M7 11 V29 M33 11 V29 M37 11 V29" stroke="#737b85" stroke-width=".5"/><rect x="-1" y="16.4" width="13" height="7.2" fill="#f4f6f8" opacity=".55"/><rect x="28" y="16.4" width="13" height="7.2" fill="#f4f6f8" opacity=".55"/>')
      + crown('url(#wSteel)', '#6f7781')
      + `<polygon points="${oct(16.6)}" fill="url(#wSteel)" stroke="#5f666f" stroke-width=".5"/>`
      + `<polygon points="${oct(15.4)}" fill="none" stroke="#ffffff" stroke-width=".35" opacity=".7"/>`
      + around(8, 13.6, (x, y, d) => `<g transform="rotate(${d} ${f2(x)} ${f2(y)})"><polygon points="${f2(x - 1.05)},${f2(y)} ${f2(x - 0.52)},${f2(y - 0.9)} ${f2(x + 0.52)},${f2(y - 0.9)} ${f2(x + 1.05)},${f2(y)} ${f2(x + 0.52)},${f2(y + 0.9)} ${f2(x - 0.52)},${f2(y + 0.9)}" fill="#f7f8fa" stroke="#5f666f" stroke-width=".3"/><path d="M${f2(x - 0.7)} ${f2(y)} H${f2(x + 0.7)}" stroke="#5f666f" stroke-width=".3"/></g>`)
      + `<circle cx="${CX}" cy="${CY}" r="11" fill="url(#wBlue)" stroke="#0b1c3e" stroke-width=".6"/>`
      + [-8, -6, -4, -2, 0, 2, 4, 6, 8].map((d) => `<path d="M${CX + d} ${f2(CY - Math.sqrt(121 - d * d))} V${f2(CY + Math.sqrt(121 - d * d))} M${f2(CX - Math.sqrt(121 - d * d))} ${CY + d} H${f2(CX + Math.sqrt(121 - d * d))}" stroke="#5f8bd6" stroke-width=".3" opacity=".7"/>`).join('')
      + minuteTrack(10.3, '#dfe6f2')
      + batons(7.6, 9.6, '#f4f6f8', [3])
      + '<rect x="26.4" y="18.7" width="3.2" height="2.6" rx=".3" fill="#f7f8fa" stroke="#0b1c3e" stroke-width=".3"/><path d="M27.3 19.4 h1.4 M27.3 20.5 h1.4" stroke="#222" stroke-width=".4"/>'
      + handsW('#f4f6f8', '#bfe0ff');
  } else if (kind === 'Rolex de oro') {
    g = stubs('url(#wGoldB)', '#8a6200', '<path d="M2.6 11 V29 M6.6 11 V29 M33.4 11 V29 M37.4 11 V29" stroke="#8a6200" stroke-width=".5"/><rect x="-1" y="15.6" width="13" height="8.8" fill="#fff3b0" opacity=".5"/><rect x="28" y="15.6" width="13" height="8.8" fill="#fff3b0" opacity=".5"/>')
      + crown('url(#wGold)', '#8a6200')
      + `<circle cx="${CX}" cy="${CY}" r="16.4" fill="url(#wGold)" stroke="#7a5600" stroke-width=".5"/>`
      + around(48, 14.5, (x, y, d, i) => { const [a, b] = pt(12.7, d); const [c, e] = pt(16.1, d); return `<path d="M${f2(a)} ${f2(b)} L${f2(c)} ${f2(e)}" stroke="${i % 2 ? '#8a6200' : '#fff3b0'}" stroke-width=".85"/>`; })
      + `<circle cx="${CX}" cy="${CY}" r="12.5" fill="none" stroke="#7a5600" stroke-width=".4"/>`
      + `<circle cx="${CX}" cy="${CY}" r="12.2" fill="url(#wChamp)"/>`
      + minuteTrack(11.4, '#6b4a00')
      + batons(8.6, 10.6, '#7a5600', [0, 3])
      + '<path d="M15.2 11.4 Q20 9.2 24.8 11.4 L24.2 13.6 Q20 11.8 15.8 13.6 Z" fill="#fffdf2" stroke="#7a5600" stroke-width=".3"/><path d="M17.4 12 h5.2" stroke="#333" stroke-width=".45"/>'
      + '<path d="M18.3 15.6 l.6 -1.3 l.55 .9 l.55 -1.5 l.55 1.5 l.55 -.9 l.6 1.3 Z" fill="#7a5600"/>'
      + '<rect x="26.3" y="18.5" width="3.6" height="3" rx=".4" fill="#fffdf2" stroke="#7a5600" stroke-width=".35"/><path d="M27.3 19.3 h1.6 M27.3 20.6 h1.6" stroke="#222" stroke-width=".45"/><ellipse cx="28.1" cy="20" rx="2.7" ry="2.3" fill="#ffffff" opacity=".22" stroke="#ffffff" stroke-width=".3"/>'
      + handsW('#6b4a00', '#fff3b0', '#6b4a00');
  } else if (kind === 'arcoíris') {
    const sub = (x, y, deg) => { const r = 2.7; const hx = x + (r - 0.7) * Math.cos(deg * Math.PI / 180); const hy = y + (r - 0.7) * Math.sin(deg * Math.PI / 180); return `<circle cx="${x}" cy="${y}" r="${r}" fill="#1b1b1b" stroke="url(#wRose)" stroke-width=".55"/><path d="M${x} ${y} L${f2(hx)} ${f2(hy)}" stroke="#f3c3a3" stroke-width=".4" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r=".4" fill="#f3c3a3"/>`; };
    g = stubs('url(#wRoseB)', '#8a5233', '<path d="M4 11 V29 M8 11 V29 M32 11 V29 M36 11 V29" stroke="#8a5233" stroke-width=".5"/><rect x="-1" y="15.6" width="13" height="8.8" fill="#ffe3cf" opacity=".5"/><rect x="28" y="15.6" width="13" height="8.8" fill="#ffe3cf" opacity=".5"/>')
      + crown('url(#wRose)', '#8a5233')
      + '<rect x="31.4" y="11.6" width="3" height="2.6" rx=".6" fill="url(#wRose)" stroke="#8a5233" stroke-width=".35" transform="rotate(32 32.9 12.9)"/><rect x="31.4" y="25.8" width="3" height="2.6" rx=".6" fill="url(#wRose)" stroke="#8a5233" stroke-width=".35" transform="rotate(-32 32.9 27.1)"/>'
      + `<circle cx="${CX}" cy="${CY}" r="16.4" fill="url(#wRose)" stroke="#7d4a2e" stroke-width=".5"/>`
      + around(36, 14.4, (x, y, d, i) => `<rect x="${f2(x - 1.05)}" y="${f2(y - 1.55)}" width="2.1" height="3.1" rx=".35" fill="hsl(${i * 10},95%,54%)" stroke="#ffffff" stroke-width=".22" transform="rotate(${d} ${f2(x)} ${f2(y)})"/><path d="M${f2(x - 0.5)} ${f2(y - 1)} L${f2(x + 0.3)} ${f2(y - 0.2)}" stroke="#ffffff" stroke-width=".25" opacity=".7" transform="rotate(${d} ${f2(x)} ${f2(y)})"/>`)
      + `<circle cx="${CX}" cy="${CY}" r="12.4" fill="url(#wBlack)" stroke="#7d4a2e" stroke-width=".5"/>`
      + minuteTrack(11.6, '#f3c3a3')
      + around(12, 10.2, (x, y, d, i) => `<rect x="${f2(x - 0.5)}" y="${f2(y - 0.9)}" width="1" height="1.8" rx=".25" fill="hsl(${i * 30},95%,58%)" transform="rotate(${d} ${f2(x)} ${f2(y)})"/>`)
      + sub(14.4, 20, 200) + sub(25.6, 20, -40) + sub(20, 25.6, 100)
      + handsW('#f3c3a3', '#ffffff', '#ff5a36');
  } else if (kind === 'multicolor') {
    const cols = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de', '#ff2d92'];
    const band = [0, 1, 2, 3].map((i) => `<rect x="${-1 + i * 3.25}" y="11" width="3.25" height="18" fill="${cols[i]}"/><rect x="${28 + i * 3.25}" y="11" width="3.25" height="18" fill="${cols[7 - i]}"/>`).join('');
    const body = 'M8.2 5.4 Q20 1.6 31.8 5.4 Q35.6 20 31.8 34.6 Q20 38.4 8.2 34.6 Q4.4 20 8.2 5.4 Z';
    const dial = 'M10.6 7.8 Q20 4.8 29.4 7.8 Q32.4 20 29.4 32.2 Q20 35.2 10.6 32.2 Q7.6 20 10.6 7.8 Z';
    g = `${band}<path d="M-1 11 H12 V29 H-1 Z M28 11 H41 V29 H28 Z" fill="none" stroke="#222" stroke-width=".4"/><rect x="-1" y="11" width="42" height="4" fill="#ffffff" opacity=".18"/>`
      + crown('#f2f2f2', '#555')
      + `<path d="${body}" fill="#fbfbfb" stroke="#3a3a3a" stroke-width=".6"/><path d="M9.6 6.6 Q20 3.2 30.4 6.6" stroke="#ffffff" stroke-width="1" fill="none"/><path d="M9.6 33.4 Q20 36.8 30.4 33.4" stroke="#c9c9c9" stroke-width=".8" fill="none"/>`
      + [[9.6, 7.4], [30.4, 7.4], [9.6, 32.6], [30.4, 32.6], [6.6, 20], [33.4, 20]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".95" fill="url(#wSteel)" stroke="#555" stroke-width=".3"/><path d="M${x - 0.6} ${y} H${x + 0.6} M${x} ${y - 0.6} V${y + 0.6}" stroke="#555" stroke-width=".25"/>`).join('')
      + `<path d="${dial}" fill="url(#wBlack)" stroke="#222" stroke-width=".4"/>`
      + '<path d="M12 12 L28 28 M28 12 L12 28 M20 8 V32" stroke="#4a4a4a" stroke-width=".6"/><circle cx="20" cy="20" r="5.2" fill="none" stroke="#5a5a5a" stroke-width=".7"/><circle cx="14.6" cy="26" r="2.4" fill="none" stroke="#ffcc00" stroke-width=".6"/><circle cx="25.4" cy="14" r="2.4" fill="none" stroke="#00c7be" stroke-width=".6"/>'
      + around(12, 9.6, (x, y, d, i) => `<rect x="${f2(x - 0.55)}" y="${f2(y - 1)}" width="1.1" height="2" rx=".3" fill="${cols[i % 8]}" transform="rotate(${d} ${f2(x)} ${f2(y)})"/>`)
      + handsW('#ffffff', '#ffcc00', '#ff3b30');
  } else if (kind === 'diamantes') {
    let pave = '';
    for (let x = 0.4; x < 12; x += 1.9) for (let y = 12.2; y < 29; y += 1.9) pave += `<path d="M${f2(x)} ${f2(y - 0.75)} l.75 .75 l-.75 .75 l-.75 -.75 Z M${f2(x + 29)} ${f2(y - 0.75)} l.75 .75 l-.75 .75 l-.75 -.75 Z" fill="#ffffff" stroke="#8fcdea" stroke-width=".18"/>`;
    const gem = (x, y, r) => `<path d="M${f2(x)} ${f2(y - r)} L${f2(x + r)} ${f2(y)} L${f2(x)} ${f2(y + r)} L${f2(x - r)} ${f2(y)} Z" fill="#ffffff" stroke="#7cc4ea" stroke-width=".2"/><path d="M${f2(x - r * 0.5)} ${f2(y)} H${f2(x + r * 0.5)}" stroke="#bfe6fa" stroke-width=".18"/>`;
    g = stubs('url(#wIce)', '#7cc4ea', pave)
      + crown('url(#wIce)', '#7cc4ea')
      + `<circle cx="${CX}" cy="${CY}" r="16.4" fill="url(#wIce)" stroke="#6bb5dc" stroke-width=".5"/>`
      + around(30, 15, (x, y) => gem(x, y, 1.05)) + around(26, 12.9, (x, y) => gem(x, y, 0.95), 7)
      + `<circle cx="${CX}" cy="${CY}" r="11.6" fill="#e9f8ff" stroke="#6bb5dc" stroke-width=".45"/>`
      + around(22, 10.2, (x, y) => gem(x, y, 0.8)) + around(16, 7.9, (x, y) => gem(x, y, 0.75), 11) + around(11, 5.6, (x, y) => gem(x, y, 0.7)) + around(6, 3.2, (x, y) => gem(x, y, 0.65), 15)
      + around(12, 10.2, (x, y, d, i) => (i % 3 === 0 ? `<rect x="${f2(x - 0.6)}" y="${f2(y - 1.3)}" width="1.2" height="2.6" rx=".2" fill="#1f6fa8" transform="rotate(${d} ${f2(x)} ${f2(y)})"/>` : ''))
      + handsW('#1f5f8f', '#ffffff', '#1f5f8f');
  } else {
    return '';
  }
  return `<svg class="watch-svg" viewBox="0 0 40 40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${DEFS}${g}${glare}</svg>`;
}

/** Manos del personaje (con o sin cartas en medio). El reloj va en la muñeca izquierda. */
export function handsHtml(a = {}, inner = '', cls = '') {
  const skin = col(a.skin, '#e0b08a');
  const h = (extra) => `<span class="hand" style="background:${skin}">${extra}</span>`;
  return `<div class="hands ${cls}">${h(a.dealer ? '' : watchSvg(a.watch))}<div class="hand-cards">${inner}</div>${h('')}</div>`;
}

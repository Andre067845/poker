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
// Dibujos inspirados en diseños conocidos: bisel octogonal con tornillos y esfera cuadriculada,
// reloj de oro con bisel estriado y brazalete de eslabones, bisel de gemas arcoíris con tres subesferas, etc.
const ring = (n, r, fn) => Array.from({ length: n }, (_, i) => {
  const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
  return fn(22 + r * Math.cos(ang), 15 + r * Math.sin(ang), i);
}).join('');
const handsOfWatch = (c) => `<path d="M22 15 L22 9.4 M22 15 L26 16.6" stroke="${c}" stroke-width="1" stroke-linecap="round"/><circle cx="22" cy="15" r=".9" fill="${c}"/>`;
const strap = (fill, line, links) => `<rect x="0" y="8.5" width="44" height="13" rx="2" fill="${fill}" stroke="${line}" stroke-width=".5"/>${links}`;

function watchSvg(kind) {
  let g = '';
  if (kind === 'AP') {
    const links = [3, 7, 11, 33, 37, 41].map((x) => `<path d="M${x} 8.5 V21.5" stroke="#8f96a0" stroke-width=".7"/>`).join('') + '<path d="M0 12.5 H11 M0 17.5 H11 M33 12.5 H44 M33 17.5 H44" stroke="#eef1f4" stroke-width=".5"/>';
    const oct = (r) => Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return `${(22 + r * Math.cos(a)).toFixed(2)},${(15 + r * Math.sin(a)).toFixed(2)}`; }).join(' ');
    g = strap('#b9c0c9', '#7c838d', links)
      + `<polygon points="${oct(13.2)}" fill="#dfe3e8" stroke="#7c838d" stroke-width=".6"/><polygon points="${oct(11.2)}" fill="#c5cbd3" stroke="#8f96a0" stroke-width=".4"/>`
      + Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return `<circle cx="${(22 + 12.1 * Math.cos(a)).toFixed(2)}" cy="${(15 + 12.1 * Math.sin(a)).toFixed(2)}" r=".95" fill="#f4f6f8" stroke="#6b7078" stroke-width=".35"/>`; }).join('')
      + '<circle cx="22" cy="15" r="8.6" fill="#1d3f7c"/>'
      + [-6, -3, 0, 3, 6].map((d) => `<path d="M${22 + d} 7.2 V22.8 M14 ${15 + d} H30" stroke="#3460a8" stroke-width=".45"/>`).join('')
      + '<circle cx="22" cy="15" r="8.6" fill="none" stroke="#0f2449" stroke-width=".6"/>'
      + ring(12, 7.2, (x, y) => `<rect x="${(x - 0.45).toFixed(2)}" y="${(y - 0.45).toFixed(2)}" width=".9" height=".9" fill="#f4f6f8"/>`)
      + handsOfWatch('#ffffff');
  } else if (kind === 'Rolex de oro') {
    const links = [2.5, 6, 9.5, 34.5, 38, 41.5].map((x) => `<path d="M${x} 8.5 V21.5" stroke="#9a6f00" stroke-width=".6"/>`).join('')
      + '<path d="M0 12.2 H11 M0 17.8 H11 M33 12.2 H44 M33 17.8 H44" stroke="#fff0a8" stroke-width=".7"/><rect x="0" y="12.9" width="11" height="4.2" fill="#f7d560" opacity=".7"/><rect x="33" y="12.9" width="11" height="4.2" fill="#f7d560" opacity=".7"/>';
    g = strap('#e0ad2b', '#9a6f00', links)
      + '<rect x="33.6" y="13.4" width="2.6" height="3.2" rx=".8" fill="#e0ad2b" stroke="#9a6f00" stroke-width=".4"/>'
      + '<circle cx="22" cy="15" r="13" fill="#e9b93a" stroke="#9a6f00" stroke-width=".6"/>'
      + '<circle cx="22" cy="15" r="11.3" fill="none" stroke="#b07f08" stroke-width="2.8" stroke-dasharray=".8 .7"/>'
      + '<circle cx="22" cy="15" r="9.3" fill="#f6e2a3" stroke="#9a6f00" stroke-width=".5"/>'
      + ring(12, 7.6, (x, y, i) => (i === 3 ? '' : `<rect x="${(x - 0.5).toFixed(2)}" y="${(y - 0.5).toFixed(2)}" width="1" height="1" rx=".2" fill="#8a6200"/>`))
      + '<rect x="27.2" y="13.6" width="3.4" height="2.8" rx=".5" fill="#ffffff" stroke="#8a6200" stroke-width=".4"/><path d="M28.2 14.4 h1.4 M28.2 15.5 h1.4" stroke="#333" stroke-width=".45"/>'
      + '<path d="M19.6 11.6 l.8 -1.2 l.8 1 l.8 -1.4 l.8 1.4 l.8 -1 l.8 1.2 Z" fill="#8a6200"/>'
      + handsOfWatch('#5a4200');
  } else if (kind === 'arcoíris') {
    const links = [3, 7, 11, 33, 37, 41].map((x) => `<path d="M${x} 8.5 V21.5" stroke="#a8683f" stroke-width=".6"/>`).join('') + '<rect x="0" y="12.6" width="11" height="4.8" fill="#f3c2a0" opacity=".65"/><rect x="33" y="12.6" width="11" height="4.8" fill="#f3c2a0" opacity=".65"/>';
    g = strap('#dc9f78', '#a8683f', links)
      + '<circle cx="22" cy="15" r="13" fill="#dc9f78" stroke="#a8683f" stroke-width=".6"/>'
      + ring(24, 11.2, (x, y, i) => `<rect x="${(x - 1.15).toFixed(2)}" y="${(y - 1.15).toFixed(2)}" width="2.3" height="2.3" rx=".4" fill="hsl(${i * 15},95%,55%)" stroke="#ffffff" stroke-width=".25" transform="rotate(${i * 15} ${x.toFixed(2)} ${y.toFixed(2)})"/>`)
      + '<circle cx="22" cy="15" r="9" fill="#141414" stroke="#a8683f" stroke-width=".5"/>'
      + '<g fill="#232323" stroke="#dc9f78" stroke-width=".5"><circle cx="17.6" cy="15" r="2.3"/><circle cx="26.4" cy="15" r="2.3"/><circle cx="22" cy="19.4" r="2.3"/></g>'
      + ring(12, 7.6, (x, y, i) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".5" fill="hsl(${i * 30},95%,60%)"/>`)
      + handsOfWatch('#f3c2a0');
  } else if (kind === 'multicolor') {
    const cols = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de', '#ff2d92'];
    const seg = [0, 1, 2, 3].map((i) => `<rect x="${i * 2.8}" y="8.5" width="2.8" height="13" fill="${cols[i]}"/><rect x="${32.8 + i * 2.8}" y="8.5" width="2.8" height="13" fill="${cols[i + 4]}"/>`).join('');
    g = `<rect x="0" y="8.5" width="44" height="13" rx="2" fill="#fff"/>${seg}`
      + '<path d="M11.5 4 Q22 0.5 32.5 4 Q35.5 15 32.5 26 Q22 29.5 11.5 26 Q8.5 15 11.5 4 Z" fill="#ffffff" stroke="#222" stroke-width=".7"/>'
      + '<path d="M13.6 6 Q22 3.2 30.4 6 Q32.8 15 30.4 24 Q22 26.8 13.6 24 Q11.2 15 13.6 6 Z" fill="#101820"/>'
      + ring(12, 7.4, (x, y, i) => `<rect x="${(x - 0.6).toFixed(2)}" y="${(y - 0.6).toFixed(2)}" width="1.2" height="1.2" rx=".3" fill="${cols[i % 8]}"/>`)
      + [[12.6, 5], [31.4, 5], [12.6, 25], [31.4, 25]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".8" fill="#c9ced6" stroke="#555" stroke-width=".3"/>`).join('')
      + '<path d="M22 15 L22 9.6" stroke="#ffcc00" stroke-width="1.1" stroke-linecap="round"/><path d="M22 15 L26.2 16.8" stroke="#ff3b30" stroke-width="1.1" stroke-linecap="round"/><circle cx="22" cy="15" r="1" fill="#00c7be"/>';
  } else if (kind === 'diamantes') {
    let pave = '';
    for (let x = 1.2; x < 44; x += 2.2) for (let y = 9.8; y < 21.5; y += 2.2) pave += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".75" fill="#ffffff" stroke="#9fd8f5" stroke-width=".25"/>`;
    g = strap('#d8eefb', '#8cc6e6', pave)
      + '<circle cx="22" cy="15" r="13" fill="#eaf7ff" stroke="#8cc6e6" stroke-width=".6"/>'
      + ring(28, 11.3, (x, y) => `<path d="M${x.toFixed(2)} ${(y - 1.1).toFixed(2)} l1.1 1.1 l-1.1 1.1 l-1.1 -1.1 Z" fill="#ffffff" stroke="#7cc4ea" stroke-width=".25"/>`)
      + '<circle cx="22" cy="15" r="9.2" fill="#cfeeff" stroke="#8cc6e6" stroke-width=".5"/>'
      + ring(18, 6.6, (x, y) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".8" fill="#ffffff" stroke="#9fd8f5" stroke-width=".25"/>`)
      + ring(9, 3.4, (x, y) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".7" fill="#ffffff" stroke="#9fd8f5" stroke-width=".25"/>`)
      + handsOfWatch('#2b6f96');
  } else {
    return '';
  }
  return `<svg class="watch-svg" viewBox="-1 0 46 30" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}

/** Manos del personaje (con o sin cartas en medio). El reloj va en la muñeca izquierda. */
export function handsHtml(a = {}, inner = '', cls = '') {
  const skin = col(a.skin, '#e0b08a');
  const h = (extra) => `<span class="hand" style="background:${skin}">${extra}</span>`;
  return `<div class="hands ${cls}">${h(a.dealer ? '' : watchSvg(a.watch))}<div class="hand-cards">${inner}</div>${h('')}</div>`;
}

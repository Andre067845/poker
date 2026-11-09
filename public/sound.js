/* Sonidos sintetizados con Web Audio (sin archivos). Se pueden desactivar. */
let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem('sound') !== 'off'; } catch { /* sin almacenamiento */ }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, start, dur, type = 'sine', gain = 0.15) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const LIB = {
  deal: () => { tone(900, 0, 0.05, 'triangle', 0.08); tone(1100, 0.07, 0.05, 'triangle', 0.08); },
  check: () => { tone(220, 0, 0.08, 'square', 0.06); tone(220, 0.1, 0.08, 'square', 0.06); },
  chips: () => { tone(1500, 0, 0.04, 'triangle', 0.08); tone(1800, 0.04, 0.05, 'triangle', 0.07); tone(1300, 0.09, 0.05, 'triangle', 0.06); },
  fold: () => { tone(300, 0, 0.12, 'sine', 0.06); },
  turn: () => { tone(660, 0, 0.12, 'sine', 0.14); tone(880, 0.14, 0.18, 'sine', 0.14); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle', 0.1)); },
};

export const sounds = {
  get enabled() { return enabled; },
  setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem('sound', enabled ? 'on' : 'off'); } catch { /* nada */ }
  },
  play(name) {
    if (!enabled || !LIB[name]) return;
    try { LIB[name](); } catch { /* el navegador puede bloquear audio hasta que haya interacción */ }
  },
};

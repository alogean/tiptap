'use strict';

// Dessin procédural de chaque élément. Chaque fonction reçoit :
//   c : contexte 2D, déjà translaté sur le point d'ancrage de l'élément
//       (bas-centre pour ce qui est posé au sol, centre pour le reste),
//       orienté vers la droite ;
//   s : unité de taille en pixels ;
//   p : p(partie, couleurParDéfaut, nuance, fixe) → couleur de la partie,
//       qui suit la couleur choisie par le joueur (ou « multicolore ») ;
//   o : { t (horloge locale), env, item, g, glow, glowC }.

const TAU = Math.PI * 2;
const MULTI = ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4dd25a', '#2ec4f1', '#5a7dff', '#b05cff', '#ff6ec7'];

// ---------- Couleurs ----------
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
const shadeCache = new Map();
function shade(col, amt) {
  if (!amt) return col;
  const k = col + amt;
  let v = shadeCache.get(k);
  if (!v) {
    v = amt < 0 ? mix(col, '#000000', -amt) : mix(col, '#ffffff', amt);
    shadeCache.set(k, v);
  }
  return v;
}
function makePaint(g) {
  return function p(i, base, amt = 0, fixed = false) {
    let col;
    if (g.color === 'multi') col = MULTI[(i + g.seed) % MULTI.length];
    else if (!fixed && g.color) col = g.color;
    else col = base;
    return amt ? shade(col, amt) : col;
  };
}

// ---------- Primitives ----------
function circ(c, x, y, r, f) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); c.fillStyle = f; c.fill(); }
function ell(c, x, y, rx, ry, f, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU); c.fillStyle = f; c.fill(); }
function rect(c, x, y, w, h, f) { c.fillStyle = f; c.fillRect(x, y, w, h); }
function rrect(c, x, y, w, h, r, f) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r);
  else c.rect(x, y, w, h);
  c.fillStyle = f; c.fill();
}
function poly(c, pts, f) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fillStyle = f; c.fill();
}
function ln(c, pts, w, col) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.stroke();
}
function starPath(c, ro, ri, n = 5) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / n;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
}

// Fenêtre : bleu clair le jour, jaune et lumineuse la nuit.
function win(c, x, y, w, h, o) {
  const n = o.env.nightT;
  rrect(c, x, y, w, h, w * 0.12, mix('#bfe3ff', '#ffd76a', n));
  if (n > 0.05) o.glow(x, y, w, h);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.fillRect(x + w / 2 - w * 0.04, y, w * 0.08, h);
  c.fillRect(x, y + h / 2 - h * 0.04, w, h * 0.08);
}
function glass(o) { return mix('#bfe3ff', '#8fb3d9', o.env.nightT); }

function wheel(c, x, y, r, ang) {
  circ(c, x, y, r, '#2b2b2b');
  circ(c, x, y, r * 0.55, '#c3c9d0');
  c.save(); c.translate(x, y); c.rotate(ang);
  for (let k = 0; k < 4; k++) { c.rotate(TAU / 4); rect(c, -r * 0.07, 0, r * 0.14, r * 0.52, '#7d858d'); }
  c.restore();
  circ(c, x, y, r * 0.16, '#555');
}

function snowCap(c, o, caps, s) {
  const k = o.env.snowT;
  if (k < 0.05) return;
  c.save(); c.globalAlpha *= Math.min(1, k * 1.3);
  for (const [x, y, rx] of caps) ell(c, x * s, y * s, rx * s, rx * 0.45 * s, '#ffffff');
  c.restore();
}

function eyes(c, x1, x2, y, r) { circ(c, x1, y, r, '#2a2a2a'); circ(c, x2, y, r, '#2a2a2a'); }
function smile(c, x, y, r, w, col = '#2a2a2a') {
  c.beginPath(); c.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
  c.lineWidth = w; c.lineCap = 'round'; c.strokeStyle = col; c.stroke();
}

// ---------- Éléments ----------
const DRAW = {
  arbre(c, s, p, o) {
    rrect(c, -0.09 * s, -0.62 * s, 0.18 * s, 0.62 * s, 0.05 * s, p(9, '#8b5a2b', 0, true));
    const leaves = [[0, -0.95, 0.36], [-0.27, -0.72, 0.27], [0.27, -0.72, 0.27], [-0.15, -1.15, 0.24], [0.17, -1.13, 0.24]];
    leaves.forEach(([x, y, r], i) => circ(c, x * s, y * s, r * s, p(i, '#3fa34d', i % 2 ? -0.1 : 0.04)));
    circ(c, -0.12 * s, -1.05 * s, 0.09 * s, 'rgba(255,255,255,0.18)');
    snowCap(c, o, [[0, -1.3, 0.28], [-0.3, -0.92, 0.18], [0.3, -0.92, 0.18]], s);
  },

  sapin(c, s, p, o) {
    rrect(c, -0.07 * s, -0.25 * s, 0.14 * s, 0.25 * s, 0.03 * s, p(9, '#7a4a24', 0, true));
    const tiers = [[-0.2, 0.48, 0.55], [-0.55, 0.4, 0.5], [-0.88, 0.3, 0.45]];
    tiers.forEach(([y, hw, h], i) => poly(c, [-hw * s, y * s, 0, (y - h) * s, hw * s, y * s], p(i, '#2e7d4f', i * 0.06)));
    snowCap(c, o, [[0, -1.24, 0.12], [0, -0.92, 0.2], [0, -0.6, 0.24]], s);
  },

  fleur(c, s, p) {
    ln(c, [0, 0, 0.03 * s, -0.35 * s, 0, -0.7 * s], 0.06 * s, '#3c9a3c');
    ell(c, 0.12 * s, -0.3 * s, 0.12 * s, 0.05 * s, '#4cb04c', -0.5);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      circ(c, Math.cos(a) * 0.15 * s, -0.72 * s + Math.sin(a) * 0.15 * s, 0.12 * s, p(i, '#ff6fa8', i % 2 ? 0 : -0.08));
    }
    circ(c, 0, -0.72 * s, 0.1 * s, p(7, '#ffd23f', 0, true));
  },

  montagne(c, s, p, o) {
    const m = p(0, '#7d86a8');
    poly(c, [-1.2 * s, 0, 0, -1.4 * s, 1.2 * s, 0], m);
    poly(c, [0, -1.4 * s, 1.2 * s, 0, 0.25 * s, 0], p(0, '#7d86a8', -0.15));
    poly(c, [-0.36 * s, -0.98 * s, 0, -1.4 * s, 0.36 * s, -0.98 * s, 0.18 * s, -0.9 * s, 0.05 * s, -1.02 * s, -0.12 * s, -0.88 * s], '#ffffff');
    if (o.env.snowT > 0.05) {
      c.save(); c.globalAlpha *= o.env.snowT * 0.7;
      poly(c, [-1.2 * s, 0, 0, -1.4 * s, 1.2 * s, 0], '#f4f8ff');
      c.restore();
    }
  },

  nuage(c, s, p, o) {
    const base = mix('#ffffff', '#8d95a5', o.env.darkT);
    ell(c, 0, 0.12 * s, 0.6 * s, 0.2 * s, p(0, base));
    circ(c, -0.32 * s, 0, 0.26 * s, p(1, base));
    circ(c, 0.32 * s, 0.02 * s, 0.24 * s, p(2, base));
    circ(c, 0.02 * s, -0.12 * s, 0.36 * s, p(3, base));
    ell(c, -0.08 * s, -0.22 * s, 0.14 * s, 0.08 * s, 'rgba(255,255,255,0.35)');
  },

  soleil(c, s, p, o) {
    const halo = c.createRadialGradient(0, 0, 0.4 * s, 0, 0, 1.1 * s);
    halo.addColorStop(0, 'rgba(255,230,120,0.45)');
    halo.addColorStop(1, 'rgba(255,230,120,0)');
    circ(c, 0, 0, 1.1 * s, halo);
    c.save(); c.rotate(o.t * 0.4);
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      poly(c, [-0.1 * s, -0.58 * s, 0, -0.88 * s, 0.1 * s, -0.58 * s], p(i % 2 + 1, '#ffb300'));
    }
    c.restore();
    circ(c, 0, 0, 0.55 * s, p(0, '#ffd23f'));
    eyes(c, -0.18 * s, 0.18 * s, -0.1 * s, 0.06 * s);
    smile(c, 0, 0.02 * s, 0.24 * s, 0.05 * s, '#7a4a00');
    circ(c, -0.32 * s, 0.1 * s, 0.07 * s, 'rgba(255,120,120,0.35)');
    circ(c, 0.32 * s, 0.1 * s, 0.07 * s, 'rgba(255,120,120,0.35)');
  },

  lune(c, s, p, o) {
    if (o.env.nightT > 0.05) o.glowC(0, 0, 0.55 * s);
    c.save();
    c.beginPath(); c.rect(-s, -s, 2 * s, 2 * s); c.arc(0.3 * s, -0.16 * s, 0.44 * s, 0, TAU); c.clip('evenodd');
    circ(c, 0, 0, 0.5 * s, p(0, '#f6efc0'));
    circ(c, -0.25 * s, 0.22 * s, 0.07 * s, p(0, '#f6efc0', -0.08));
    circ(c, -0.33 * s, -0.12 * s, 0.05 * s, p(0, '#f6efc0', -0.08));
    c.beginPath(); c.arc(-0.2 * s, 0.02 * s, 0.06 * s, 0.1 * Math.PI, 0.9 * Math.PI);
    c.lineWidth = 0.03 * s; c.lineCap = 'round'; c.strokeStyle = '#8a7d40'; c.stroke();
    c.restore();
  },

  etoile(c, s, p, o) {
    const k = 0.82 + 0.18 * Math.sin(o.t * 3);
    if (o.env.nightT > 0.05) o.glowC(0, 0, 0.35 * s * k);
    c.save(); c.scale(k, k);
    starPath(c, 0.5 * s, 0.22 * s);
    c.fillStyle = p(0, '#ffe66d'); c.fill();
    c.lineWidth = 0.04 * s; c.lineJoin = 'round'; c.strokeStyle = p(0, '#ffe66d', -0.2); c.stroke();
    eyes(c, -0.08 * s, 0.08 * s, -0.02 * s, 0.03 * s);
    c.restore();
  },

  arcenciel(c, s, p, o) {
    const g = o.g;
    let cols = ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4dd25a', '#2ec4f1', '#5a7dff', '#b05cff'];
    if (g.color && g.color !== 'multi') cols = [-0.3, -0.2, -0.1, 0, 0.12, 0.24, 0.36].map(a => shade(g.color, a));
    const bw = s * 0.055;
    c.save(); c.globalAlpha *= 0.82;
    cols.forEach((col, i) => {
      c.beginPath(); c.arc(0, 0, s - i * bw, Math.PI, TAU);
      c.strokeStyle = col; c.lineWidth = bw + 1; c.stroke();
    });
    c.restore();
  },

  maison(c, s, p, o) {
    for (let k = 0; k < 3; k++) {
      const ph = (o.t * 0.4 + k / 3) % 1;
      circ(c, (0.29 + ph * 0.18) * s, (-1.2 - ph * 0.55) * s, (0.06 + ph * 0.09) * s, `rgba(225,225,225,${0.6 * (1 - ph)})`);
    }
    rect(c, 0.22 * s, -1.15 * s, 0.14 * s, 0.32 * s, p(3, '#a63d3a'));
    rect(c, -0.5 * s, -0.76 * s, s, 0.76 * s, p(0, '#f4d6a0'));
    poly(c, [-0.64 * s, -0.72 * s, 0, -1.28 * s, 0.64 * s, -0.72 * s], p(1, '#d9534f'));
    rrect(c, -0.12 * s, -0.44 * s, 0.24 * s, 0.44 * s, 0.05 * s, p(2, '#8b5a2b'));
    circ(c, 0.07 * s, -0.22 * s, 0.025 * s, '#ffd23f');
    win(c, -0.4 * s, -0.62 * s, 0.2 * s, 0.18 * s, o);
    win(c, 0.2 * s, -0.62 * s, 0.2 * s, 0.18 * s, o);
    win(c, -0.08 * s, -1.0 * s, 0.16 * s, 0.14 * s, o);
    snowCap(c, o, [[0, -1.2, 0.2], [-0.35, -0.9, 0.22], [0.35, -0.9, 0.22]], s);
  },

  chateau(c, s, p, o) {
    const m = p(0, '#c9c3d6');
    for (const sx of [-1, 1]) {
      const x = sx * 0.75 * s;
      rect(c, x - 0.18 * s, -1.3 * s, 0.36 * s, 1.3 * s, p(1, '#bdb6cc'));
      poly(c, [x - 0.24 * s, -1.3 * s, x, -1.75 * s, x + 0.24 * s, -1.3 * s], p(2, '#5b6ee1'));
      ln(c, [x, -1.75 * s, x, -2.02 * s], 0.025 * s, '#555');
      const wave = Math.sin(o.t * 5 + sx) * 0.04 * s;
      poly(c, [x, -2.02 * s, x + 0.24 * s, -1.97 * s + wave, x, -1.9 * s], p(3, '#e74c3c'));
      win(c, x - 0.07 * s, -1.08 * s, 0.14 * s, 0.2 * s, o);
    }
    rect(c, -0.6 * s, -0.95 * s, 1.2 * s, 0.95 * s, m);
    for (let i = 0; i < 6; i++) rect(c, -0.6 * s + i * 0.216 * s, -1.08 * s, 0.12 * s, 0.14 * s, m);
    c.beginPath();
    c.moveTo(-0.18 * s, 0); c.lineTo(-0.18 * s, -0.32 * s); c.arc(0, -0.32 * s, 0.18 * s, Math.PI, 0); c.lineTo(0.18 * s, 0);
    c.closePath(); c.fillStyle = '#5a3a22'; c.fill();
    win(c, -0.45 * s, -0.75 * s, 0.15 * s, 0.2 * s, o);
    win(c, 0.3 * s, -0.75 * s, 0.15 * s, 0.2 * s, o);
  },

  moulin(c, s, p, o) {
    poly(c, [-0.32 * s, 0, 0.32 * s, 0, 0.2 * s, -1.05 * s, -0.2 * s, -1.05 * s], p(0, '#efe0c0'));
    poly(c, [-0.27 * s, -1.03 * s, 0, -1.38 * s, 0.27 * s, -1.03 * s], p(1, '#b5523b'));
    rrect(c, -0.1 * s, -0.32 * s, 0.2 * s, 0.32 * s, 0.08 * s, '#7a4a24');
    win(c, -0.08 * s, -0.75 * s, 0.16 * s, 0.16 * s, o);
    c.save(); c.translate(0, -1.08 * s); c.rotate(o.t * 1.2);
    for (let k = 0; k < 4; k++) {
      c.rotate(TAU / 4);
      ln(c, [0, 0, 0, -0.88 * s], 0.045 * s, '#6b4a2b');
      rect(c, 0.03 * s, -0.86 * s, 0.2 * s, 0.62 * s, p(2 + k, '#ffffff'));
      c.strokeStyle = 'rgba(107,74,43,0.5)'; c.lineWidth = 0.015 * s;
      c.strokeRect(0.03 * s, -0.86 * s, 0.2 * s, 0.62 * s);
    }
    c.restore();
    circ(c, 0, -1.08 * s, 0.07 * s, '#6b4a2b');
  },

  phare(c, s, p, o) {
    const n = o.env.nightT;
    const w = Math.cos(o.t * 1.5), L = 2.6 * s * w;
    c.save(); c.translate(0, -1.49 * s);
    poly(c, [0, -0.05 * s, L, -0.4 * s, L, 0.35 * s, 0, 0.05 * s], `rgba(255,240,150,${(0.12 + 0.45 * n) * Math.abs(w)})`);
    c.restore();
    c.save();
    c.beginPath(); c.moveTo(-0.28 * s, 0); c.lineTo(0.28 * s, 0); c.lineTo(0.17 * s, -1.32 * s); c.lineTo(-0.17 * s, -1.32 * s); c.closePath();
    c.clip();
    rect(c, -0.4 * s, -1.4 * s, 0.8 * s, 1.4 * s, p(1, '#ffffff'));
    for (let k = 0; k < 3; k++) rect(c, -0.4 * s, (-0.45 - k * 0.42) * s, 0.8 * s, 0.2 * s, p(0, '#e63946'));
    c.restore();
    rrect(c, -0.08 * s, -0.25 * s, 0.16 * s, 0.25 * s, 0.06 * s, '#5a3a22');
    rect(c, -0.26 * s, -1.38 * s, 0.52 * s, 0.07 * s, '#333');
    rect(c, -0.14 * s, -1.62 * s, 0.28 * s, 0.25 * s, mix('#fff6c2', '#ffe066', n));
    o.glowC(0, -1.49 * s, 0.22 * s);
    poly(c, [-0.21 * s, -1.61 * s, 0, -1.84 * s, 0.21 * s, -1.61 * s], p(2, '#b0262f'));
  },

  tente(c, s, p) {
    poly(c, [-0.58 * s, 0, 0, -0.82 * s, 0.58 * s, 0], p(0, '#ff8c42'));
    poly(c, [0, -0.82 * s, 0.58 * s, 0, 0.2 * s, 0], p(0, '#ff8c42', -0.12));
    poly(c, [-0.17 * s, 0, 0, -0.5 * s, 0.17 * s, 0], '#5a3a22');
    ln(c, [0, -0.82 * s, 0, -1.0 * s], 0.025 * s, '#555');
    poly(c, [0, -1.0 * s, 0.2 * s, -0.95 * s, 0, -0.89 * s], p(1, '#ffe14d', 0, true));
  },

  ballon(c, s, p) {
    c.beginPath(); c.moveTo(0, 0.5 * s); c.quadraticCurveTo(0.14 * s, 0.82 * s, -0.02 * s, 1.12 * s);
    c.lineWidth = 0.02 * s; c.strokeStyle = '#666'; c.stroke();
    ell(c, 0, 0, 0.38 * s, 0.48 * s, p(0, '#ff4d6d'));
    poly(c, [-0.06 * s, 0.54 * s, 0, 0.46 * s, 0.06 * s, 0.54 * s], p(0, '#ff4d6d', -0.2));
    ell(c, -0.14 * s, -0.18 * s, 0.08 * s, 0.15 * s, 'rgba(255,255,255,0.45)', -0.4);
  },

  lapin(c, s, p) {
    const m = p(0, '#ece6e0'), dk = p(0, '#ece6e0', -0.12);
    ell(c, -0.15 * s, -0.06 * s, 0.16 * s, 0.07 * s, dk);
    ell(c, -0.02 * s, -0.3 * s, 0.33 * s, 0.26 * s, m);
    circ(c, -0.36 * s, -0.36 * s, 0.1 * s, p(9, '#ffffff', 0.5));
    ell(c, 0.2 * s, -0.86 * s, 0.065 * s, 0.22 * s, m, -0.2);
    ell(c, 0.33 * s, -0.84 * s, 0.065 * s, 0.22 * s, m, 0.25);
    ell(c, 0.2 * s, -0.86 * s, 0.03 * s, 0.15 * s, '#ffb3c6', -0.2);
    ell(c, 0.33 * s, -0.84 * s, 0.03 * s, 0.15 * s, '#ffb3c6', 0.25);
    circ(c, 0.27 * s, -0.55 * s, 0.2 * s, m);
    circ(c, 0.35 * s, -0.6 * s, 0.035 * s, '#222');
    circ(c, 0.46 * s, -0.53 * s, 0.032 * s, '#ff8fab');
    circ(c, 0.33 * s, -0.47 * s, 0.045 * s, 'rgba(255,140,170,0.35)');
    ell(c, 0.15 * s, -0.05 * s, 0.12 * s, 0.06 * s, dk);
  },

  oiseau(c, s, p, o) {
    const m = p(0, '#4aa3ff');
    poly(c, [-0.28 * s, -0.02 * s, -0.56 * s, -0.16 * s, -0.5 * s, 0.1 * s], p(2, '#4aa3ff', -0.15));
    ell(c, 0, 0, 0.32 * s, 0.22 * s, m);
    ell(c, 0.05 * s, 0.08 * s, 0.2 * s, 0.12 * s, p(3, '#4aa3ff', 0.45));
    circ(c, 0.27 * s, -0.12 * s, 0.16 * s, p(1, '#4aa3ff'));
    poly(c, [0.4 * s, -0.16 * s, 0.57 * s, -0.1 * s, 0.4 * s, -0.05 * s], '#ff9f1c');
    circ(c, 0.31 * s, -0.16 * s, 0.035 * s, '#222');
    const f = Math.sin(o.t * 12);
    c.save(); c.translate(-0.05 * s, -0.05 * s); c.scale(1, f || 0.01);
    ell(c, 0, -0.18 * s, 0.2 * s, 0.18 * s, p(4, '#4aa3ff', -0.15));
    c.restore();
  },

  chat(c, s, p, o) {
    const m = p(0, '#f39c39'), dk = p(0, '#f39c39', -0.2);
    const w = Math.sin(o.t * 8) * 0.05 * s;
    [[-0.25, w], [-0.1, -w], [0.15, w], [0.28, -w]].forEach(([x, d]) => rrect(c, x * s + d, -0.22 * s, 0.08 * s, 0.22 * s, 0.03 * s, dk));
    c.beginPath(); c.moveTo(-0.32 * s, -0.32 * s);
    c.quadraticCurveTo(-0.62 * s, -0.4 * s + Math.sin(o.t * 3) * 0.05 * s, -0.5 * s, -0.75 * s);
    c.lineWidth = 0.08 * s; c.lineCap = 'round'; c.strokeStyle = m; c.stroke();
    ell(c, 0, -0.32 * s, 0.36 * s, 0.18 * s, m);
    for (const x of [-0.15, 0, 0.15]) ell(c, x * s, -0.42 * s, 0.03 * s, 0.07 * s, dk);
    circ(c, 0.36 * s, -0.5 * s, 0.19 * s, m);
    poly(c, [0.21 * s, -0.6 * s, 0.24 * s, -0.83 * s, 0.36 * s, -0.68 * s], m);
    poly(c, [0.38 * s, -0.68 * s, 0.5 * s, -0.83 * s, 0.53 * s, -0.59 * s], m);
    poly(c, [0.25 * s, -0.64 * s, 0.26 * s, -0.75 * s, 0.32 * s, -0.67 * s], '#ffb3c6');
    ell(c, 0.31 * s, -0.53 * s, 0.03 * s, 0.05 * s, '#2a7a2a');
    ell(c, 0.44 * s, -0.53 * s, 0.03 * s, 0.05 * s, '#2a7a2a');
    circ(c, 0.39 * s, -0.45 * s, 0.025 * s, '#ff8fab');
    c.lineWidth = 0.012 * s; c.strokeStyle = '#555';
    c.beginPath();
    c.moveTo(0.42 * s, -0.44 * s); c.lineTo(0.62 * s, -0.48 * s);
    c.moveTo(0.42 * s, -0.43 * s); c.lineTo(0.62 * s, -0.4 * s);
    c.stroke();
  },

  chien(c, s, p, o) {
    const m = p(0, '#b07a4a'), dk = p(0, '#b07a4a', -0.22);
    const w = Math.sin(o.t * 8) * 0.05 * s;
    [[-0.28, w], [-0.12, -w], [0.17, w], [0.3, -w]].forEach(([x, d]) => rrect(c, x * s + d, -0.26 * s, 0.09 * s, 0.26 * s, 0.03 * s, dk));
    c.save(); c.translate(-0.34 * s, -0.42 * s); c.rotate(-0.7 + Math.sin(o.t * 14) * 0.4);
    rrect(c, -0.035 * s, -0.3 * s, 0.07 * s, 0.3 * s, 0.035 * s, m);
    c.restore();
    ell(c, 0, -0.38 * s, 0.38 * s, 0.19 * s, m);
    ell(c, -0.1 * s, -0.45 * s, 0.13 * s, 0.08 * s, p(1, '#b07a4a', 0.3));
    circ(c, 0.38 * s, -0.62 * s, 0.2 * s, m);
    ell(c, 0.56 * s, -0.56 * s, 0.13 * s, 0.08 * s, p(1, '#b07a4a', 0.3));
    circ(c, 0.67 * s, -0.6 * s, 0.045 * s, '#222');
    ell(c, 0.6 * s, -0.46 * s, 0.035 * s, 0.05 * s, '#ff6f91');
    ell(c, 0.27 * s, -0.6 * s, 0.07 * s, 0.16 * s, dk, 0.3);
    circ(c, 0.43 * s, -0.68 * s, 0.03 * s, '#222');
    rect(c, 0.24 * s, -0.48 * s, 0.2 * s, 0.05 * s, p(5, '#e63946', 0, true));
  },

  poisson(c, s, p, o) {
    const m = p(0, '#ff8c1a');
    const wag = Math.sin(o.t * 8) * 0.12 * s;
    poly(c, [-0.35 * s, 0, -0.66 * s, -0.25 * s + wag, -0.66 * s, 0.25 * s + wag], p(1, '#ff8c1a', -0.12));
    poly(c, [-0.05 * s, -0.24 * s, 0.12 * s, -0.4 * s, 0.2 * s, -0.22 * s], p(2, '#ff8c1a', -0.12));
    ell(c, 0, 0, 0.42 * s, 0.27 * s, m);
    ell(c, -0.12 * s, 0, 0.045 * s, 0.22 * s, 'rgba(255,255,255,0.55)');
    ell(c, 0.05 * s, 0, 0.04 * s, 0.24 * s, 'rgba(255,255,255,0.55)');
    circ(c, 0.22 * s, -0.06 * s, 0.07 * s, '#fff');
    circ(c, 0.24 * s, -0.06 * s, 0.035 * s, '#222');
    const ph = (o.t * 0.6) % 1;
    c.beginPath(); c.arc(0.5 * s, -ph * 0.9 * s, 0.04 * s * (0.6 + ph), 0, TAU);
    c.lineWidth = 0.015 * s; c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - ph)})`; c.stroke();
  },

  baleine(c, s, p, o) {
    const m = p(0, '#4a6fa5');
    const cyc = (o.t * 0.35) % 1;
    if (cyc < 0.45) {
      const k = cyc / 0.45;
      ln(c, [0.3 * s, -0.4 * s, 0.3 * s, (-0.42 - k * 0.45) * s], 0.05 * s, 'rgba(200,235,255,0.85)');
      for (let j = 0; j < 5; j++) {
        const a = -Math.PI / 2 + (j - 2) * 0.4;
        circ(c, 0.3 * s + Math.cos(a) * k * 0.4 * s, -0.85 * s + Math.sin(a) * k * 0.25 * s + k * k * 0.3 * s, 0.05 * s * (1 - k * 0.5), 'rgba(200,235,255,0.9)');
      }
    }
    c.save(); c.translate(-0.85 * s, -0.08 * s); c.rotate(Math.sin(o.t * 2) * 0.2);
    poly(c, [0.05 * s, 0, -0.35 * s, -0.42 * s, -0.15 * s, -0.04 * s, -0.4 * s, 0.22 * s], m);
    c.restore();
    c.save();
    c.beginPath(); c.ellipse(0, 0, 0.95 * s, 0.42 * s, 0, 0, TAU); c.fillStyle = m; c.fill(); c.clip();
    ell(c, 0.15 * s, 0.32 * s, 0.95 * s, 0.24 * s, p(1, '#a9c6e8', 0, true));
    c.restore();
    circ(c, 0.58 * s, -0.06 * s, 0.05 * s, '#222');
    smile(c, 0.62 * s, 0.02 * s, 0.14 * s, 0.025 * s);
    ell(c, 0.1 * s, 0.2 * s, 0.22 * s, 0.08 * s, p(0, '#4a6fa5', -0.2), 0.5);
  },

  dinosaure(c, s, p, o) {
    const m = p(0, '#6cc070'), dk = p(0, '#6cc070', -0.18);
    const sw = Math.sin(o.t * 5) * 0.06 * s;
    rrect(c, -0.42 * s + sw, -0.5 * s, 0.16 * s, 0.5 * s, 0.05 * s, dk);
    rrect(c, 0.18 * s - sw, -0.5 * s, 0.16 * s, 0.5 * s, 0.05 * s, dk);
    c.beginPath(); c.moveTo(-0.45 * s, -0.78 * s); c.quadraticCurveTo(-0.95 * s, -0.75 * s, -1.15 * s, -0.35 * s);
    c.quadraticCurveTo(-0.8 * s, -0.5 * s, -0.45 * s, -0.45 * s); c.closePath(); c.fillStyle = m; c.fill();
    ell(c, -0.05 * s, -0.68 * s, 0.58 * s, 0.33 * s, m);
    rrect(c, -0.28 * s - sw, -0.5 * s, 0.16 * s, 0.5 * s, 0.05 * s, m);
    rrect(c, 0.32 * s + sw, -0.5 * s, 0.16 * s, 0.5 * s, 0.05 * s, m);
    c.beginPath(); c.moveTo(0.3 * s, -0.8 * s); c.quadraticCurveTo(0.58 * s, -1.15 * s, 0.56 * s, -1.52 * s);
    c.lineWidth = 0.22 * s; c.lineCap = 'round'; c.strokeStyle = m; c.stroke();
    ell(c, 0.68 * s, -1.57 * s, 0.2 * s, 0.12 * s, m);
    circ(c, 0.73 * s, -1.61 * s, 0.03 * s, '#222');
    smile(c, 0.74 * s, -1.6 * s, 0.08 * s, 0.02 * s);
    [[-0.3, -0.85, 0.08], [0, -0.92, 0.06], [0.2, -0.78, 0.07], [-0.5, -0.66, 0.05]].forEach(([x, y, r], i) =>
      circ(c, x * s, y * s, r * s, p(i + 1, '#6cc070', -0.15)));
  },

  papillon(c, s, p, o) {
    const f = 0.25 + 0.75 * Math.abs(Math.sin(o.t * 9));
    c.save(); c.scale(f, 1);
    ell(c, -0.22 * s, -0.12 * s, 0.22 * s, 0.2 * s, p(0, '#c86bfa'), 0.3);
    ell(c, 0.22 * s, -0.12 * s, 0.22 * s, 0.2 * s, p(1, '#c86bfa'), -0.3);
    ell(c, -0.17 * s, 0.14 * s, 0.15 * s, 0.13 * s, p(2, '#ffcc00'));
    ell(c, 0.17 * s, 0.14 * s, 0.15 * s, 0.13 * s, p(3, '#ffcc00'));
    circ(c, -0.24 * s, -0.14 * s, 0.06 * s, 'rgba(255,255,255,0.7)');
    circ(c, 0.24 * s, -0.14 * s, 0.06 * s, 'rgba(255,255,255,0.7)');
    c.restore();
    ell(c, 0, 0, 0.05 * s, 0.22 * s, '#3a2a4a');
    ln(c, [-0.02 * s, -0.2 * s, -0.12 * s, -0.38 * s], 0.015 * s, '#3a2a4a');
    ln(c, [0.02 * s, -0.2 * s, 0.12 * s, -0.38 * s], 0.015 * s, '#3a2a4a');
  },

  grenouille(c, s, p) {
    const m = p(0, '#5cc75c'), dk = p(0, '#5cc75c', -0.2);
    ell(c, -0.25 * s, -0.12 * s, 0.2 * s, 0.1 * s, dk);
    ell(c, 0.25 * s, -0.12 * s, 0.2 * s, 0.1 * s, dk);
    ell(c, 0, -0.28 * s, 0.36 * s, 0.26 * s, m);
    ell(c, 0, -0.2 * s, 0.24 * s, 0.15 * s, p(1, '#5cc75c', 0.4));
    for (const x of [-0.16, 0.16]) {
      circ(c, x * s, -0.52 * s, 0.11 * s, m);
      circ(c, x * s, -0.53 * s, 0.075 * s, '#fff');
      circ(c, x * s, -0.53 * s, 0.04 * s, '#222');
    }
    smile(c, 0, -0.38 * s, 0.14 * s, 0.025 * s, '#2a5a2a');
    ell(c, -0.14 * s, -0.03 * s, 0.1 * s, 0.04 * s, dk);
    ell(c, 0.14 * s, -0.03 * s, 0.1 * s, 0.04 * s, dk);
  },

  voiture(c, s, p, o) {
    const m = p(0, '#e63946');
    poly(c, [-0.38 * s, -0.48 * s, -0.22 * s, -0.82 * s, 0.22 * s, -0.82 * s, 0.42 * s, -0.48 * s], p(1, '#e63946', -0.05));
    poly(c, [-0.3 * s, -0.5 * s, -0.18 * s, -0.76 * s, -0.02 * s, -0.76 * s, -0.02 * s, -0.5 * s], glass(o));
    poly(c, [0.04 * s, -0.5 * s, 0.04 * s, -0.76 * s, 0.19 * s, -0.76 * s, 0.33 * s, -0.5 * s], glass(o));
    rrect(c, -0.62 * s, -0.52 * s, 1.24 * s, 0.36 * s, 0.12 * s, m);
    circ(c, 0.57 * s, -0.4 * s, 0.055 * s, '#fff4b0');
    o.glowC(0.57 * s, -0.4 * s, 0.07 * s);
    rect(c, -0.62 * s, -0.44 * s, 0.05 * s, 0.08 * s, '#b00020');
    const r = 0.16 * s, a = o.item.dist / r;
    wheel(c, -0.36 * s, -0.16 * s, r, a);
    wheel(c, 0.36 * s, -0.16 * s, r, a);
  },

  camion(c, s, p, o) {
    rrect(c, -0.78 * s, -1.0 * s, 1.12 * s, 0.82 * s, 0.05 * s, p(1, '#f1f1f1'));
    rect(c, -0.78 * s, -0.4 * s, 1.12 * s, 0.06 * s, p(2, '#3a86ff', 0, false));
    rrect(c, 0.36 * s, -0.75 * s, 0.42 * s, 0.57 * s, 0.08 * s, p(0, '#3a86ff'));
    poly(c, [0.48 * s, -0.7 * s, 0.68 * s, -0.7 * s, 0.74 * s, -0.48 * s, 0.48 * s, -0.48 * s], glass(o));
    circ(c, 0.75 * s, -0.3 * s, 0.05 * s, '#fff4b0');
    o.glowC(0.75 * s, -0.3 * s, 0.06 * s);
    rect(c, -0.8 * s, -0.2 * s, 1.6 * s, 0.06 * s, '#444');
    const r = 0.15 * s, a = o.item.dist / r;
    wheel(c, -0.55 * s, -0.15 * s, r, a);
    wheel(c, -0.2 * s, -0.15 * s, r, a);
    wheel(c, 0.55 * s, -0.15 * s, r, a);
  },

  velo(c, s, p, o) {
    const r = 0.24 * s, a = o.item.dist / r;
    for (const x of [-0.33, 0.33]) {
      c.save(); c.translate(x * s, -0.24 * s); c.rotate(a);
      c.strokeStyle = '#999'; c.lineWidth = 0.012 * s; c.beginPath();
      for (let k = 0; k < 6; k++) { const q = k / 6 * Math.PI; c.moveTo(Math.cos(q) * r, Math.sin(q) * r); c.lineTo(-Math.cos(q) * r, -Math.sin(q) * r); }
      c.stroke(); c.restore();
      c.beginPath(); c.arc(x * s, -0.24 * s, r, 0, TAU); c.lineWidth = 0.05 * s; c.strokeStyle = '#333'; c.stroke();
    }
    const fr = p(0, '#ff006e');
    ln(c, [-0.33 * s, -0.24 * s, -0.05 * s, -0.24 * s, 0.2 * s, -0.56 * s, -0.15 * s, -0.56 * s, -0.05 * s, -0.24 * s], 0.05 * s, fr);
    ln(c, [0.33 * s, -0.24 * s, 0.2 * s, -0.56 * s, 0.18 * s, -0.7 * s, 0.27 * s, -0.72 * s], 0.045 * s, fr);
    ln(c, [-0.33 * s, -0.24 * s, -0.15 * s, -0.56 * s, -0.18 * s, -0.66 * s], 0.04 * s, fr);
    rrect(c, -0.27 * s, -0.7 * s, 0.18 * s, 0.05 * s, 0.02 * s, '#333');
    const ca = a * 0.8, cx = -0.05 * s, cy = -0.24 * s;
    const p1 = [cx + Math.cos(ca) * 0.1 * s, cy + Math.sin(ca) * 0.1 * s];
    const p2 = [cx - Math.cos(ca) * 0.1 * s, cy - Math.sin(ca) * 0.1 * s];
    const hip = [-0.17 * s, -0.74 * s], sh = [0.04 * s, -1.02 * s];
    const pants = p(7, '#3a86ff', 0, true);
    for (const pd of [p2, p1]) {
      const knee = [(hip[0] + pd[0]) / 2 + 0.12 * s, (hip[1] + pd[1]) / 2 - 0.02 * s];
      ln(c, [hip[0], hip[1], knee[0], knee[1], pd[0], pd[1]], 0.07 * s, pants);
    }
    ln(c, [hip[0], hip[1], sh[0], sh[1]], 0.12 * s, p(8, '#ffd23f', 0, true));
    ln(c, [sh[0], sh[1], 0.25 * s, -0.72 * s], 0.05 * s, '#f5c9a0');
    circ(c, 0.09 * s, -1.15 * s, 0.11 * s, '#f5c9a0');
    c.beginPath(); c.arc(0.09 * s, -1.17 * s, 0.12 * s, Math.PI, TAU); c.fillStyle = fr; c.fill();
  },

  train(c, s, p, o) {
    for (let k = 0; k < 4; k++) {
      const ph = (o.t * 0.8 + k / 4) % 1;
      circ(c, (1.38 - ph * 0.7) * s, (-1.0 - ph * 0.55) * s, (0.07 + ph * 0.13) * s, `rgba(235,235,235,${0.75 * (1 - ph)})`);
    }
    rect(c, -1.45 * s, -0.3 * s, 2.9 * s, 0.05 * s, '#333');
    const wagon = (x0, w, col, i) => {
      rrect(c, x0 * s, -0.66 * s, w * s, 0.48 * s, 0.06 * s, col);
      rect(c, (x0 - 0.03) * s, -0.72 * s, (w + 0.06) * s, 0.07 * s, shade(col, -0.25));
      win(c, (x0 + 0.1) * s, -0.58 * s, 0.24 * s, 0.2 * s, o);
      win(c, (x0 + w - 0.34) * s, -0.58 * s, 0.24 * s, 0.2 * s, o);
    };
    wagon(-1.45, 0.85, p(1, '#f77f00'), 1);
    wagon(-0.5, 0.85, p(2, '#2a9d8f'), 2);
    const m = p(0, '#d62828');
    rect(c, 0.45 * s, -0.98 * s, 0.4 * s, 0.8 * s, p(0, '#d62828', -0.1));
    rect(c, 0.4 * s, -1.04 * s, 0.5 * s, 0.08 * s, '#333');
    win(c, 0.52 * s, -0.88 * s, 0.24 * s, 0.22 * s, o);
    rrect(c, 0.82 * s, -0.66 * s, 0.6 * s, 0.46 * s, 0.12 * s, m);
    rect(c, 1.18 * s, -0.95 * s, 0.11 * s, 0.3 * s, '#333');
    rect(c, 1.15 * s, -0.98 * s, 0.17 * s, 0.06 * s, '#333');
    poly(c, [1.42 * s, -0.3 * s, 1.55 * s, -0.12 * s, 1.42 * s, -0.12 * s], '#555');
    circ(c, 1.42 * s, -0.52 * s, 0.05 * s, '#fff4b0');
    o.glowC(1.42 * s, -0.52 * s, 0.07 * s);
    const a = o.item.dist / (0.13 * s);
    for (const x of [-1.25, -0.8, -0.3, 0.15]) wheel(c, x * s, -0.13 * s, 0.11 * s, a);
    for (const x of [0.65, 1.05, 1.3]) wheel(c, x * s, -0.14 * s, 0.13 * s, a);
  },

  avion(c, s, p, o) {
    const m = p(0, '#ffffff'), acc = p(1, '#e63946');
    poly(c, [-0.55 * s, -0.08 * s, -0.8 * s, -0.5 * s, -0.66 * s, -0.5 * s, -0.4 * s, -0.1 * s], acc);
    poly(c, [-0.05 * s, 0, -0.32 * s, -0.36 * s, -0.2 * s, -0.36 * s, 0.15 * s, 0], p(1, '#e63946', -0.2));
    ell(c, 0, 0, 0.8 * s, 0.17 * s, m);
    rect(c, -0.6 * s, 0.03 * s, 1.2 * s, 0.04 * s, acc);
    for (let k = 0; k < 6; k++) circ(c, (-0.36 + k * 0.14) * s, -0.04 * s, 0.035 * s, glass(o));
    ell(c, 0.62 * s, -0.05 * s, 0.1 * s, 0.06 * s, '#2a3d55', 0.2);
    poly(c, [-0.1 * s, 0.04 * s, -0.36 * s, 0.42 * s, -0.2 * s, 0.42 * s, 0.22 * s, 0.04 * s], acc);
  },

  fusee(c, s, p, o) {
    const fl = 0.75 + 0.25 * Math.sin(o.t * 40);
    poly(c, [-0.13 * s, 0.42 * s, 0, (0.45 + 0.5 * fl) * s, 0.13 * s, 0.42 * s], '#ff9f1c');
    poly(c, [-0.07 * s, 0.42 * s, 0, (0.45 + 0.28 * fl) * s, 0.07 * s, 0.42 * s], '#ffe14d');
    const acc = p(1, '#e63946');
    poly(c, [-0.17 * s, 0.1 * s, -0.36 * s, 0.5 * s, -0.15 * s, 0.42 * s], acc);
    poly(c, [0.17 * s, 0.1 * s, 0.36 * s, 0.5 * s, 0.15 * s, 0.42 * s], acc);
    c.save();
    c.beginPath(); c.moveTo(0, -0.62 * s); c.quadraticCurveTo(0.32 * s, -0.3 * s, 0.18 * s, 0.45 * s);
    c.lineTo(-0.18 * s, 0.45 * s); c.quadraticCurveTo(-0.32 * s, -0.3 * s, 0, -0.62 * s); c.closePath();
    c.fillStyle = p(0, '#f1f1f1'); c.fill(); c.clip();
    rect(c, -0.4 * s, -0.7 * s, 0.8 * s, 0.33 * s, acc);
    rect(c, 0.06 * s, -0.4 * s, 0.3 * s, 0.9 * s, 'rgba(0,0,0,0.08)');
    c.restore();
    circ(c, 0, -0.08 * s, 0.11 * s, '#5c6b7a');
    circ(c, 0, -0.08 * s, 0.08 * s, glass(o));
  },

  bateau(c, s, p, o) {
    c.rotate(Math.sin(o.t * 2) * 0.06);
    ln(c, [0, -0.15 * s, 0, -1.12 * s], 0.04 * s, '#6b4a2b');
    poly(c, [0.03 * s, -1.08 * s, 0.52 * s, -0.24 * s, 0.03 * s, -0.24 * s], p(1, '#ffffff'));
    poly(c, [-0.03 * s, -0.95 * s, -0.4 * s, -0.24 * s, -0.03 * s, -0.24 * s], p(2, '#ffffff', -0.08));
    poly(c, [0, -1.12 * s, 0.2 * s, -1.06 * s, 0, -1.0 * s], p(3, '#ffd23f', 0, true));
    poly(c, [-0.62 * s, -0.18 * s, 0.62 * s, -0.18 * s, 0.45 * s, 0.12 * s, -0.45 * s, 0.12 * s], p(0, '#c0392b'));
    rect(c, -0.56 * s, -0.12 * s, 1.12 * s, 0.04 * s, 'rgba(255,255,255,0.7)');
    for (const x of [-0.3, 0, 0.3]) circ(c, x * s, -0.02 * s, 0.035 * s, glass(o));
  },

  montgolfiere(c, s, p) {
    ln(c, [-0.3 * s, 0.32 * s, -0.13 * s, 0.62 * s], 0.015 * s, '#6b4a2b');
    ln(c, [0.3 * s, 0.32 * s, 0.13 * s, 0.62 * s], 0.015 * s, '#6b4a2b');
    rrect(c, -0.14 * s, 0.6 * s, 0.28 * s, 0.2 * s, 0.03 * s, '#a0682f');
    c.save();
    c.beginPath(); c.moveTo(-0.18 * s, 0.42 * s);
    c.bezierCurveTo(-0.75 * s, 0.05 * s, -0.6 * s, -0.72 * s, 0, -0.72 * s);
    c.bezierCurveTo(0.6 * s, -0.72 * s, 0.75 * s, 0.05 * s, 0.18 * s, 0.42 * s);
    c.closePath(); c.clip();
    const base = ['#ff595e', '#ffca3a', '#8ac926'];
    for (let k = 0; k < 5; k++) rect(c, (-0.6 + k * 0.24) * s, -0.8 * s, 0.25 * s, 1.3 * s, p(k % 3, base[k % 3], k % 2 ? -0.15 : 0));
    ell(c, -0.2 * s, -0.4 * s, 0.1 * s, 0.2 * s, 'rgba(255,255,255,0.25)', 0.3);
    c.restore();
    rect(c, -0.19 * s, 0.38 * s, 0.38 * s, 0.07 * s, '#7a4a24');
  },
};

// Propriétés de chaque élément :
//  zone   : où il apparaît ; size : taille de base ; box : encombrement
//  [largeur, hauteur] en unités s ; anchor : bottom|center ;
//  speed  : vitesse de déplacement (fraction de largeur d'écran / s) ;
//  many   : nombre d'exemplaires ajoutés par « beaucoup ».
const TYPES = {
  arbre:        { zone: 'ground', size: 1.4, box: [1, 1.4],     anchor: 'bottom', sway: true, many: 5 },
  sapin:        { zone: 'ground', size: 1.3, box: [1, 1.35],    anchor: 'bottom', sway: true, many: 5 },
  fleur:        { zone: 'ground', size: 0.8, box: [0.6, 0.9],   anchor: 'bottom', sway: true, many: 8 },
  montagne:     { zone: 'back',   size: 2.6, box: [2.4, 1.4],   anchor: 'bottom', many: 3 },
  nuage:        { zone: 'sky',    size: 1.2, box: [1.3, 0.8],   anchor: 'center', speed: 0.012, windy: true, many: 5 },
  soleil:       { zone: 'fixed',  size: 1.1, box: [1.8, 1.8],   anchor: 'center', unique: true, at: [0.82, 0.17] },
  lune:         { zone: 'fixed',  size: 1.1, box: [1.1, 1.1],   anchor: 'center', unique: true, at: [0.16, 0.16] },
  etoile:       { zone: 'stars',  size: 0.55, box: [1, 1],      anchor: 'center', many: 10 },
  arcenciel:    { zone: 'back',   size: 5,   box: [2.1, 1.05],  anchor: 'bottom', unique: true, at: [0.5, 0.62] },
  maison:       { zone: 'ground', size: 1.1, box: [1.3, 1.8],   anchor: 'bottom', many: 4 },
  chateau:      { zone: 'ground', size: 1.2, box: [1.9, 2.05],  anchor: 'bottom', many: 2 },
  moulin:       { zone: 'ground', size: 1.1, box: [1.9, 2],     anchor: 'bottom', many: 3 },
  phare:        { zone: 'ground', size: 1.2, box: [1, 1.85],    anchor: 'bottom', many: 2 },
  tente:        { zone: 'ground', size: 0.9, box: [1.2, 0.95],  anchor: 'bottom', many: 4 },
  ballon:       { zone: 'sky',    size: 0.7, box: [0.8, 1.65],  anchor: 'center', speed: 0.008, bob: [1.5, 0.1], windy: true, many: 8 },
  lapin:        { zone: 'ground', size: 0.7, box: [1, 1.1],     anchor: 'bottom', speed: 0.04, hop: true, many: 5 },
  oiseau:       { zone: 'sky',    size: 0.55, box: [1.1, 0.8],  anchor: 'center', speed: 0.07, bob: [3, 0.1], many: 6 },
  chat:         { zone: 'ground', size: 0.75, box: [1.2, 0.9],  anchor: 'bottom', speed: 0.035, many: 4 },
  chien:        { zone: 'ground', size: 0.8, box: [1.3, 0.9],   anchor: 'bottom', speed: 0.05, many: 4 },
  poisson:      { zone: 'water',  size: 0.55, box: [1.3, 0.8],  anchor: 'center', speed: 0.04, bob: [2, 0.08], aquatic: true, many: 6 },
  baleine:      { zone: 'water',  size: 1.0, box: [2.2, 1.3],   anchor: 'center', speed: 0.015, bob: [1, 0.05], aquatic: true, many: 2 },
  dinosaure:    { zone: 'ground', size: 1.1, box: [2.3, 1.7],   anchor: 'bottom', speed: 0.02, many: 3 },
  papillon:     { zone: 'skyLow', size: 0.5, box: [1, 0.9],     anchor: 'center', speed: 0.03, bob: [4, 0.3], many: 6 },
  grenouille:   { zone: 'ground', size: 0.6, box: [0.9, 0.7],   anchor: 'bottom', speed: 0.03, hop: true, many: 5 },
  voiture:      { zone: 'ground', size: 0.8, box: [1.3, 0.85],  anchor: 'bottom', speed: 0.12, many: 4 },
  camion:       { zone: 'ground', size: 0.9, box: [1.6, 1.05],  anchor: 'bottom', speed: 0.08, many: 3 },
  velo:         { zone: 'ground', size: 0.8, box: [1.1, 1.3],   anchor: 'bottom', speed: 0.07, many: 4 },
  train:        { zone: 'rail',   size: 0.8, box: [3.1, 1.6],   anchor: 'bottom', speed: 0.1, many: 1 },
  avion:        { zone: 'sky',    size: 0.9, box: [1.7, 1],     anchor: 'center', speed: 0.1, many: 3 },
  fusee:        { zone: 'sky',    size: 0.8, box: [0.8, 1.7],   anchor: 'center', speed: 0.06, vertical: true, many: 3 },
  bateau:       { zone: 'surface',size: 0.9, box: [1.3, 1.25],  anchor: 'bottom', speed: 0.02, aquatic: true, many: 3 },
  montgolfiere: { zone: 'sky',    size: 1.0, box: [1.2, 1.6],   anchor: 'center', speed: 0.012, bob: [1, 0.06], windy: true, many: 3 },
};
for (const k in TYPES) TYPES[k].draw = DRAW[k];

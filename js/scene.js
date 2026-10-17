'use strict';

const Scene = (() => {
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, DPR = 1, U = 1;

  const HORIZON = 0.6;
  const WATER_TOP = 0.8;
  const ZONES = {
    ground:  [0.64, 0.79],
    rail:    [0.74, 0.78],
    back:    [0.6, 0.63],
    sky:     [0.1, 0.42],
    skyLow:  [0.4, 0.56],
    stars:   [0.04, 0.3],
    water:   [0.86, 0.95],
    surface: [0.815, 0.83],
  };
  const MAX_ITEMS = 160;

  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const approach = (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);
  const easeOutBack = t => { const k = 1.7; t -= 1; return 1 + t * t * ((k + 1) * t + k); };

  const state = {
    groups: [],
    target: null,
    nextId: 1,
    env: null,
    drops: [],
    flakes: [],
    stars: Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.55, r: rand(0.6, 1.8), ph: rand(0, TAU) })),
    stormClouds: Array.from({ length: 8 }, (_, i) => ({ x: i / 8 + rand(-0.03, 0.03), y: rand(0.02, 0.12), r: rand(0.9, 1.4) })),
    bolt: null,
    time: 0,
  };
  const hooks = { onThunder: null };
  const NO_COLOR = { color: null, seed: 0 };

  function freshEnv() {
    return {
      night: false, nightT: 0,
      weather: 'clear', darkT: 0,
      wind: false, windT: 0,
      snowT: 0,
      water: false, waterT: 0,
      helium: false, heliumT: 0,
      tint: null, tintCur: '#000000', tintT: 0,
      flashT: 0, nextFlash: 1.5,
    };
  }
  state.env = freshEnv();

  // ---------- Dimensions ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    U = Math.min(W, H) * 0.1;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Création ----------
  function depthOf(def, y) {
    if (def.zone === 'ground' || def.zone === 'rail') return 0.75 + (y - 0.64) / 0.15 * 0.45;
    return 1;
  }

  // Choisit un emplacement libre dans la zone : on tire quelques candidats et
  // on garde celui qui est le plus loin des éléments déjà présents.
  function pickSpot(def) {
    if (def.at) return { x: def.at[0], y: def.at[1] };
    const [y0, y1] = ZONES[def.zone];
    const others = [];
    for (const g of state.groups) if (g.def.zone === def.zone) for (const it of g.items) others.push(it);
    let best = null, bestD = -1;
    for (let i = 0; i < 12; i++) {
      const cand = { x: rand(0.06, 0.94), y: rand(y0, y1) };
      let d = 9;
      for (const it of others) d = Math.min(d, Math.hypot(cand.x - it.x, (cand.y - it.y) * 3));
      if (d > bestD) { bestD = d; best = cand; }
    }
    return best;
  }

  function makeItem(def, spot) {
    const { x, y } = spot || pickSpot(def);
    return {
      x, y,
      dir: def.speed ? (Math.random() < 0.5 ? -1 : 1) : 1,
      phase: rand(0, 10),
      dist: 0,
      flyY: rand(0.14, 0.45),
      hY: rand(0.06, 0.45),
      born: state.time,
    };
  }

  function totalItems() { return state.groups.reduce((n, g) => n + g.items.length, 0); }
  function trim() {
    while (totalItems() > MAX_ITEMS && state.groups.length > 1) {
      const g = state.groups[0];
      g.items.shift();
      if (!g.items.length) state.groups.shift();
    }
  }

  function addGroup(type) {
    const def = TYPES[type];
    if (def.unique) {
      const existing = state.groups.find(g => g.type === type);
      if (existing) {
        existing.items.forEach(it => (it.born = state.time));
        state.target = existing;
        return existing;
      }
    }
    if (def.aquatic) state.env.water = true;
    const g = {
      id: state.nextId++, type, def,
      color: null, seed: Math.floor(Math.random() * MULTI.length),
      scale: 1, targetScale: 1,
      speedMul: 1, action: null, flying: false, flyT: 0,
      lt: rand(0, 10),
      items: [],
    };
    g.items.push(makeItem(def));
    state.groups.push(g);
    state.target = g;
    trim();
    return g;
  }

  // ---------- Modificateurs de la cible active ----------
  function hasTarget() { return !!state.target && state.groups.includes(state.target); }

  function applyColor(col) {
    if (hasTarget()) {
      state.target.color = col;
      if (col === 'multi') state.target.seed = Math.floor(Math.random() * MULTI.length);
      return 'target';
    }
    // Pas d'objet : la couleur teinte le ciel.
    const e = state.env;
    e.tint = col === 'multi' ? MULTI[Math.floor(Math.random() * MULTI.length)] : col;
    if (e.tintT === 0) e.tintCur = e.tint;
    return 'sky';
  }

  function applySize(op) {
    if (!hasTarget()) return false;
    const g = state.target;
    const t = g.targetScale;
    if (op === 'petit') g.targetScale = Math.max(0.25, t * 0.65);
    else if (op === 'mini') g.targetScale = t > 0.4 ? 0.4 : Math.max(0.2, t * 0.7);
    else if (op === 'grand') g.targetScale = Math.min(3.5, t * 1.5);
    else if (op === 'geant') g.targetScale = t < 2.6 ? 2.6 : Math.min(3.5, t * 1.3);
    return true;
  }

  function multiply() {
    if (!hasTarget()) return false;
    const g = state.target;
    if (g.def.unique) { g.items.forEach(it => (it.born = state.time)); return true; }
    const n = Math.min(g.def.many || 4, 30 - g.items.length);
    for (let i = 0; i < n; i++) g.items.push(makeItem(g.def));
    trim();
    return true;
  }

  function setSpeed(op) {
    if (!hasTarget()) return false;
    const g = state.target;
    if (op === 'vite') g.speedMul = g.speedMul === 0 ? 1.5 : Math.min(6, g.speedMul * 2);
    else if (op === 'lentement') g.speedMul = g.speedMul === 0 ? 0.35 : Math.max(0.1, g.speedMul * 0.4);
    else if (op === 'stop') g.speedMul = 0;
    return true;
  }

  function setAction(op) {
    if (!hasTarget()) return false;
    const g = state.target;
    if (g.speedMul === 0) g.speedMul = 1;
    if (op === 'vole') g.flying = true;
    else g.action = op;
    return true;
  }

  // ---------- Environnement ----------
  function setEnv(op) {
    const e = state.env;
    switch (op) {
      case 'jour': e.night = false; break;
      case 'nuit': e.night = true; break;
      case 'pluie': case 'neige': case 'orage':
        e.weather = op;
        if (op === 'orage') e.nextFlash = 0.6;
        break;
      case 'vent': e.wind = !e.wind; break;
      case 'soleil': e.weather = 'clear'; e.night = false; break;
      case 'helium': e.helium = !e.helium; break;
    }
  }

  function reset() {
    state.groups = [];
    state.target = null;
    state.drops = [];
    state.flakes = [];
    state.bolt = null;
    state.env = freshEnv();
  }

  // ---------- Mise à jour ----------
  function update(dt) {
    state.time += dt;
    const e = state.env;
    e.nightT = approach(e.nightT, e.night ? 1 : 0, dt * 0.7);
    const darkTarget = { clear: 0, pluie: 0.45, neige: 0.2, orage: 0.85 }[e.weather];
    e.darkT = approach(e.darkT, darkTarget, dt * 0.6);
    e.windT = approach(e.windT, e.wind ? 1 : 0, dt * 0.8);
    e.snowT = e.weather === 'neige' ? approach(e.snowT, 1, dt * 0.06) : approach(e.snowT, 0, dt * 0.04);
    e.waterT = approach(e.waterT, e.water ? 1 : 0, dt * 0.9);
    e.heliumT = approach(e.heliumT, e.helium ? 1 : 0, dt * 0.35);
    e.tintT = approach(e.tintT, e.tint ? 1 : 0, dt * 1.2);
    if (e.tint) e.tintCur = mix(e.tintCur, e.tint, Math.min(1, dt * 3));

    for (const g of state.groups) {
      g.scale += (g.targetScale - g.scale) * Math.min(1, dt * 4);
      g.flyT = approach(g.flyT, g.flying ? 1 : 0, dt * 0.5);
      g.lt += dt * g.speedMul;
      const def = g.def;
      if (!def.speed || !g.speedMul) continue;
      const sp = def.speed * g.speedMul * (def.windy ? 1 + 4 * e.windT : 1);
      for (const it of g.items) {
        const s = U * def.size * g.scale * depthOf(def, it.y);
        if (def.vertical) {
          it.y -= sp * dt * (W / H);
          const m = (def.box[1] * s) / H;
          if (it.y < -m) it.y = HORIZON + 0.02;
        } else {
          const dx = sp * dt * it.dir;
          it.x += dx;
          it.dist += dx * W;
          const m = (def.box[0] * s) / W / 2 + 0.02;
          if (it.x > 1 + m) it.x = -m;
          else if (it.x < -m) it.x = 1 + m;
        }
      }
    }

    updateWeather(dt);
  }

  function updateWeather(dt) {
    const e = state.env;
    const raining = e.weather === 'pluie' || e.weather === 'orage';
    if (raining) {
      const rate = (e.weather === 'orage' ? 900 : 450) * (W / 1000);
      let n = rate * dt;
      while (n > 0 && state.drops.length < 1600) {
        if (n < 1 && Math.random() > n) break;
        state.drops.push({ x: rand(-0.2 * W, W * 1.1), y: rand(-40, 0), v: rand(700, 1000) * (H / 900) });
        n--;
      }
    }
    const slant = e.windT * 0.45 + 0.05;
    state.drops = state.drops.filter(d => {
      d.y += d.v * dt; d.x += d.v * slant * dt;
      return d.y < H;
    });

    if (e.weather === 'neige') {
      let n = 80 * (W / 1000) * dt;
      while (n > 0 && state.flakes.length < 600) {
        if (n < 1 && Math.random() > n) break;
        state.flakes.push({ x: rand(-0.2 * W, W), y: -10, v: rand(35, 75) * (H / 900), r: rand(1.5, 4), ph: rand(0, TAU) });
        n--;
      }
    }
    state.flakes = state.flakes.filter(f => {
      f.y += f.v * dt;
      f.x += (Math.sin(state.time * 1.5 + f.ph) * 20 + e.windT * 120) * dt;
      return f.y < H;
    });

    if (e.weather === 'orage') {
      e.nextFlash -= dt;
      if (e.nextFlash <= 0) {
        e.flashT = 1;
        e.nextFlash = rand(2.5, 6);
        state.bolt = makeBolt();
        if (hooks.onThunder) hooks.onThunder();
      }
    }
    e.flashT = Math.max(0, e.flashT - dt * 2.2);
  }

  function makeBolt() {
    const pts = [];
    let x = rand(0.15, 0.85) * W, y = 0;
    pts.push([x, y]);
    while (y < H * HORIZON * 0.95) {
      y += rand(25, 55) * (H / 900);
      x += rand(-35, 35);
      pts.push([x, y]);
    }
    return pts;
  }

  // ---------- Rendu ----------
  function skyColors() {
    const e = state.env;
    let top = mix('#6ec3ff', '#0a1433', e.nightT);
    let bot = mix('#d6f0ff', '#2a3a6e', e.nightT);
    top = mix(top, mix('#4b5566', '#141822', e.nightT), e.darkT);
    bot = mix(bot, mix('#8a94a3', '#2a303c', e.nightT), e.darkT);
    if (e.tintT > 0) {
      top = mix(top, e.tintCur, 0.5 * e.tintT);
      bot = mix(bot, e.tintCur, 0.35 * e.tintT);
    }
    return [top, bot];
  }

  function drawSky() {
    const [top, bot] = skyColors();
    const g = ctx.createLinearGradient(0, 0, 0, H * HORIZON);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const e = state.env;
    const starA = e.nightT * (1 - e.darkT);
    if (starA > 0.01) {
      for (const s of state.stars) {
        const a = starA * (0.55 + 0.45 * Math.sin(state.time * 2 + s.ph));
        circ(ctx, s.x * W, s.y * H, s.r, `rgba(255,255,240,${a})`);
      }
      if (!state.groups.some(g => g.type === 'lune')) {
        ctx.save(); ctx.globalAlpha = starA;
        ctx.translate(W * 0.16, H * 0.16);
        DRAW.lune(ctx, U * 1.0, makePaint(NO_COLOR), ctxFor(null, { dist: 0, phase: 0 }, 0));
        ctx.restore();
      }
    }
  }

  function drawStormClouds() {
    const e = state.env;
    if (e.darkT < 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, e.darkT * 1.4);
    const col = mix(mix('#9aa2b0', '#5a6170', e.darkT), '#1c2130', e.nightT * 0.7);
    for (const c of state.stormClouds) {
      let x = (c.x + state.time * 0.008 * (1 + 4 * e.windT)) % 1.2 - 0.1;
      const r = c.r * U * 1.4;
      const cx = x * W, cy = c.y * H;
      ell(ctx, cx, cy, r * 1.4, r * 0.55, col);
      circ(ctx, cx - r * 0.6, cy - r * 0.15, r * 0.55, col);
      circ(ctx, cx + r * 0.3, cy - r * 0.3, r * 0.7, col);
    }
    ctx.restore();
  }

  function drawTerrain() {
    const e = state.env;
    const t = state.time;
    const nightK = e.nightT * 0.75;
    const snowK = Math.min(1, e.snowT * 1.2);
    const colBack = mix(mix('#9ad672', '#f2f6ff', snowK), '#1d3326', nightK);
    const colFront = mix(mix('#62bb4b', '#ffffff', snowK), '#173022', nightK);

    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H * (HORIZON - 0.035) + Math.sin(x / W * 5 + 1) * H * 0.03 + Math.sin(x / W * 11) * H * 0.008);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = colBack; ctx.fill();

    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H * (HORIZON + 0.02) + Math.sin(x / W * 3.5 + 2.5) * H * 0.02);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = colFront; ctx.fill();

    // Petites touffes d'herbe pour donner de la matière au sol.
    ctx.strokeStyle = mix(mix('#4e9a3c', '#dfe7f5', snowK), '#10241a', nightK);
    ctx.lineWidth = Math.max(1, U * 0.03); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const gx = ((i * 0.6180339) % 1) * W, gy = H * (0.66 + ((i * 0.37) % 1) * 0.3);
      const sway = Math.sin(t * 2 + i) * U * 0.02 + e.windT * U * 0.08;
      ctx.moveTo(gx, gy); ctx.lineTo(gx - U * 0.06 + sway, gy - U * 0.16);
      ctx.moveTo(gx, gy); ctx.lineTo(gx + U * 0.06 + sway, gy - U * 0.14);
    }
    ctx.stroke();

    // Rails sous chaque train posé au sol.
    for (const g of state.groups) {
      if (g.type !== 'train') continue;
      const lift = Math.max(g.flyT, e.heliumT);
      if (lift > 0.95) continue;
      for (const it of g.items) {
        const y = it.y * H, d = depthOf(g.def, it.y);
        ctx.save(); ctx.globalAlpha = 1 - lift;
        ctx.fillStyle = '#7a5a3a';
        for (let x = 0; x < W; x += U * 0.35 * d) ctx.fillRect(x, y - U * 0.05 * d, U * 0.08 * d, U * 0.1 * d);
        ctx.fillStyle = '#6b6f78';
        ctx.fillRect(0, y - U * 0.04 * d, W, U * 0.025 * d);
        ctx.fillRect(0, y + U * 0.02 * d, W, U * 0.025 * d);
        ctx.restore();
      }
    }
  }

  function drawWater() {
    const e = state.env;
    if (e.waterT <= 0) return;
    const k = ease(e.waterT);
    const top = H * (WATER_TOP + (1 - WATER_TOP) * (1 - k));
    const t = state.time;
    const g = ctx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, mix(mix('#5cc3f0', '#1d3a63', e.nightT), '#5b6b80', e.darkT * 0.5));
    g.addColorStop(1, mix(mix('#2a7fc4', '#0d1d3a', e.nightT), '#3a4656', e.darkT * 0.5));
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, top + Math.sin(x / 40 + t * 2) * 3 + Math.sin(x / 90 - t) * 3);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const x = ((i * 0.381966 + t * 0.01 * (i % 3 + 1)) % 1) * W;
      const y = top + (H - top) * (0.2 + ((i * 0.53) % 1) * 0.7);
      ctx.moveTo(x, y); ctx.lineTo(x + U * 0.4, y);
    }
    ctx.stroke();
  }

  let glows = [];
  function ctxFor(g, it, t) {
    return {
      t,
      env: state.env,
      item: it,
      g: g || { color: null },
      glow(x, y, w, h) { glows.push({ m: ctx.getTransform(), x, y, w, h }); },
      glowC(x, y, r) { glows.push({ m: ctx.getTransform(), x, y, r }); },
    };
  }

  const floats = g => g.def.zone !== 'fixed' && g.def.zone !== 'back';

  function poseOf(g, it) {
    const def = g.def, e = state.env;
    let y = it.y;
    if (g.flyT > 0 && def.zone !== 'fixed') y = lerp(y, it.flyY, ease(g.flyT));
    if (e.heliumT > 0 && floats(g)) y = lerp(y, it.hY, ease(e.heliumT));
    return y;
  }

  function drawItem(g, it, y) {
    const def = g.def, e = state.env;
    const t = g.lt + it.phase;
    const pop = easeOutBack(Math.min(1, (state.time - it.born) / 0.45));
    let s = U * def.size * g.scale * depthOf(def, it.y) * Math.max(0.01, pop);
    if (g.type === 'arcenciel') s = Math.min(W * 0.4, U * def.size * 0.9) * g.scale * Math.max(0.01, pop);
    let off = 0, rot = 0;
    if (def.bob) off += Math.sin(t * def.bob[0]) * def.bob[1] * s;
    if (def.hop && g.speedMul) off -= Math.abs(Math.sin(t * 6)) * 0.2 * s;
    if (g.action === 'saute') off -= Math.abs(Math.sin(t * 5)) * 0.7 * s;
    if (g.action === 'danse') { rot += Math.sin(t * 4) * 0.28; off -= Math.abs(Math.sin(t * 8)) * 0.08 * s; }
    if (g.flyT > 0) off += Math.sin(t * 2) * 0.08 * s * g.flyT;
    if (e.heliumT > 0 && floats(g)) {
      rot += Math.sin(t * 1.3) * 0.08 * e.heliumT;
      off += Math.sin(t * 1.7) * 0.1 * s * e.heliumT;
    }
    if (def.sway) rot += Math.sin(t * 1.5) * 0.03 + e.windT * (0.12 + Math.sin(t * 4) * 0.04);

    ctx.save();
    ctx.translate(it.x * W, y * H + off);
    ctx.rotate(rot);
    if (it.dir < 0) ctx.scale(-1, 1);
    if (def.zone === 'water') ctx.globalAlpha = 0.92;
    if (g.type === 'soleil') ctx.globalAlpha = 1 - e.nightT;
    def.draw(ctx, s, makePaint(g), ctxFor(g, it, t));
    ctx.restore();
  }

  function drawShadow(g, it, y) {
    const def = g.def;
    if (def.zone !== 'ground' && def.zone !== 'rail') return;
    const lift = Math.max(0, (it.y - y) / 0.4);
    const s = U * def.size * g.scale * depthOf(def, it.y);
    const a = 0.16 * (1 - Math.min(1, lift));
    if (a <= 0.01) return;
    ell(ctx, it.x * W, it.y * H, def.box[0] * s * 0.42 * (1 - lift * 0.5), s * 0.08, `rgba(0,0,0,${a})`);
  }

  function drawGlows() {
    const e = state.env;
    if (e.nightT < 0.05 || !glows.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const gl of glows) {
      ctx.setTransform(gl.m);
      if (gl.r != null) {
        const gr = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, gl.r * 3);
        gr.addColorStop(0, `rgba(255,220,120,${0.55 * e.nightT})`);
        gr.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(gl.x - gl.r * 3, gl.y - gl.r * 3, gl.r * 6, gl.r * 6);
      } else {
        const pad = Math.max(gl.w, gl.h) * 0.8;
        const cx = gl.x + gl.w / 2, cy = gl.y + gl.h / 2;
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, pad + Math.max(gl.w, gl.h) / 2);
        gr.addColorStop(0, `rgba(255,210,100,${0.5 * e.nightT})`);
        gr.addColorStop(1, 'rgba(255,210,100,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(cx - pad - gl.w, cy - pad - gl.h, (pad + gl.w) * 2, (pad + gl.h) * 2);
      }
    }
    ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function drawPrecip() {
    const e = state.env;
    if (state.drops.length) {
      ctx.strokeStyle = e.nightT > 0.5 ? 'rgba(180,200,240,0.55)' : 'rgba(210,230,255,0.75)';
      ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      const slant = e.windT * 0.45 + 0.05;
      const len = 16 * (H / 900);
      ctx.beginPath();
      for (const d of state.drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + len * slant, d.y + len); }
      ctx.stroke();
    }
    if (state.flakes.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      for (const f of state.flakes) { ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, TAU); }
      ctx.fill();
    }
    if (e.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${e.flashT * 0.45})`;
      ctx.fillRect(0, 0, W, H);
      if (state.bolt && e.flashT > 0.4) {
        ln(ctx, state.bolt.flat(), 4, `rgba(255,250,200,${e.flashT})`);
        ln(ctx, state.bolt.flat(), 1.5, `rgba(255,255,255,${e.flashT})`);
      }
    }
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    glows = [];
    const e = state.env;
    drawSky();

    const layers = { fixed: [], back: [], main: [] };
    for (const g of state.groups) {
      for (const it of g.items) {
        const y = poseOf(g, it);
        const L = g.def.zone === 'fixed' || g.type === 'etoile' ? 'fixed' : g.def.zone === 'back' && y > 0.5 ? 'back' : 'main';
        layers[L].push({ g, it, y });
      }
    }
    for (const d of layers.fixed) drawItem(d.g, d.it, d.y);
    drawStormClouds();
    layers.back.sort((a, b) => (b.g.type === 'arcenciel') - (a.g.type === 'arcenciel'));
    for (const d of layers.back) drawItem(d.g, d.it, d.y);
    drawTerrain();
    drawWater();
    layers.main.sort((a, b) => a.y - b.y);
    for (const d of layers.main) drawShadow(d.g, d.it, d.y);
    for (const d of layers.main) drawItem(d.g, d.it, d.y);

    if (e.darkT > 0) { ctx.fillStyle = `rgba(30,35,48,${0.22 * e.darkT})`; ctx.fillRect(0, 0, W, H); }
    if (e.nightT > 0) { ctx.fillStyle = `rgba(10,15,50,${0.3 * e.nightT})`; ctx.fillRect(0, 0, W, H); }
    drawGlows();
    drawPrecip();
  }

  // ---------- Boucle ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Vignettes pour l'imagier ----------
  function thumbnail(type, size = 112) {
    const def = TYPES[type];
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const x = c.getContext('2d');
    x.scale(2, 2);
    const pad = size * 0.12;
    const avail = size - pad * 2;
    let s = Math.min(avail / def.box[0], avail / def.box[1]);
    const fake = { color: null, seed: 0 };
    const o = { t: 1.2, env: { nightT: 0, darkT: 0, snowT: 0, windT: 0 }, item: { dist: 0 }, g: fake, glow() {}, glowC() {} };
    x.save();
    if (type === 'arcenciel') { x.translate(size / 2, size * 0.78); s = avail / 2.1; }
    else if (def.anchor === 'bottom') x.translate(size / 2, size - pad);
    else x.translate(size / 2, size / 2 + (type === 'ballon' ? -size * 0.14 : 0));
    def.draw(x, s, makePaint(fake), o);
    x.restore();
    return c.toDataURL('image/png');
  }

  function toBlob(cb) { canvas.toBlob(cb, 'image/png'); }

  return {
    addGroup, applyColor, applySize, multiply, setSpeed, setAction, setEnv, reset,
    hasTarget, thumbnail, toBlob, hooks,
    get state() { return state; },
  };
})();

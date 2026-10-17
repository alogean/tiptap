'use strict';

// « Magie » : un mot inconnu est dessiné par Gemini (SVG), puis devient un
// élément comme les autres (couleurs, tailles, actions…). Les créations sont
// gardées dans le navigateur et rejoignent l'imagier.
const Magic = (() => {
  const CONFIG_KEY = 'paysage.gemini';
  const STORE_KEY = 'paysage.creations';
  const DEFAULT_MODEL = 'gemini-flash-latest';
  const MAX_CREATIONS = 80;
  const RASTER_H = 512;
  const SPEEDS = { slow: 0.02, normal: 0.045, fast: 0.1 };
  const ZONES = { ground: 'ground', sky: 'sky', water: 'water', surface: 'surface' };

  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  // ---------- Réglages ----------
  let config = store.get(CONFIG_KEY, { apiKey: '', model: DEFAULT_MODEL });
  function getConfig() { return { ...config }; }
  function setConfig(c) {
    config = { apiKey: (c.apiKey || '').trim(), model: (c.model || '').trim() || DEFAULT_MODEL };
    store.set(CONFIG_KEY, config);
  }
  const ready = () => !!config.apiKey;

  // ---------- Prompt ----------
  const SYSTEM = `Tu dessines des illustrations pour un imagier destiné à des enfants de 3 à 8 ans.
On te donne un mot en français. Réponds UNIQUEMENT avec un objet JSON :
{
  "ok": true,
  "label": "le mot en français, au singulier, orthographe correcte avec accents",
  "zone": "ground" | "sky" | "water" | "surface",
  "moves": true | false,
  "speed": "slow" | "normal" | "fast",
  "svg": "<svg ...>...</svg>"
}
Zone : "ground" pour ce qui est posé ou marche au sol, "sky" pour ce qui vole ou flotte dans le ciel,
"water" pour ce qui vit sous l'eau, "surface" pour ce qui flotte sur l'eau.
"moves" vaut true si l'objet se déplace tout seul (animal, véhicule…), false sinon.

Règles du SVG :
- Style dessin animé plat et joyeux, formes simples et rondes, couleurs vives, contours sombres légers.
- Les animaux et personnages ont un visage mignon et souriant.
- Fond transparent : aucun rectangle de fond, aucun sol, aucun ciel, aucun décor. Uniquement l'objet.
- Attribut viewBox obligatoire, cadré au plus près de l'objet.
- Si l'objet se déplace, il est vu de profil et regarde vers la DROITE.
- Pour la zone "ground" ou "surface", la base de l'objet touche le bas du viewBox.
- Éléments autorisés seulement : svg, g, path, circle, ellipse, rect, polygon, polyline, line, defs, linearGradient, radialGradient, stop.
- Pas de texte, pas d'image, pas de script, pas de lien externe, pas de filtre. 60 formes maximum.

Si le mot ne convient pas à de jeunes enfants (violence, armes, peur, contenu adulte…)
ou ne désigne rien que l'on puisse dessiner, réponds exactement : {"ok": false}`;

  async function askGemini(word) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: `Mot : ${word}` }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 16384 },
        }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = (await res.json()).error?.message || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
      if (!text) throw new Error('Réponse vide (' + (data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'inconnue') + ')');
      return parseJson(text);
    } finally {
      clearTimeout(timer);
    }
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch {}
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw new Error('Réponse illisible');
  }

  // ---------- Nettoyage du SVG ----------
  const ALLOWED = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line',
    'defs', 'lineargradient', 'radialgradient', 'stop']);

  function sanitize(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('SVG invalide');
    const walk = el => {
      for (const child of [...el.children]) {
        if (!ALLOWED.has(child.nodeName.toLowerCase())) { child.remove(); continue; }
        walk(child);
      }
      for (const attr of [...el.attributes]) {
        const n = attr.name.toLowerCase(), v = attr.value;
        const external = /url\(\s*['"]?(?!#)/i.test(v);
        if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && !v.startsWith('#')) || external) el.removeAttribute(attr.name);
      }
    };
    walk(root);
    root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(n => !isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
      const w = parseFloat(root.getAttribute('width')) || 200, h = parseFloat(root.getAttribute('height')) || 200;
      vb = [0, 0, w, h];
      root.setAttribute('viewBox', vb.join(' '));
    }
    // Taille intrinsèque explicite : nécessaire pour dessiner l'image en canvas.
    const scale = RASTER_H / vb[3];
    root.setAttribute('width', String(Math.round(vb[2] * scale)));
    root.setAttribute('height', String(RASTER_H));
    root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return { svg: new XMLSerializer().serializeToString(root), aspect: vb[2] / vb[3] };
  }

  // ---------- Intégration au jeu ----------
  function loadImage(svg) {
    const img = new Image();
    img.decoding = 'async';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img;
  }

  // Version teintée de l'image pour une couleur donnée (mise en cache).
  function tinted(entry, color) {
    if (!color) return entry.img;
    if (!entry.img.complete || !entry.img.naturalWidth) return entry.img;
    if (entry.tints.has(color)) return entry.tints.get(color);
    const c = document.createElement('canvas');
    c.width = entry.img.naturalWidth; c.height = entry.img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(entry.img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    if (color === 'multi') {
      const g = x.createLinearGradient(0, 0, c.width, c.height);
      MULTI.forEach((col, i) => g.addColorStop(i / (MULTI.length - 1), col));
      x.globalAlpha = 0.55; x.fillStyle = g;
    } else {
      x.globalAlpha = 0.6; x.fillStyle = color;
    }
    x.fillRect(0, 0, c.width, c.height);
    entry.tints.set(color, c);
    return c;
  }

  function register(rec) {
    const type = 'gen_' + rec.key;
    const zone = ZONES[rec.zone] || 'ground';
    const aspect = Math.min(4, Math.max(0.25, rec.aspect || 1));
    const base = { ground: 1.3, sky: 1.0, water: 0.8, surface: 1.1 }[zone];
    const entry = { img: loadImage(rec.svg), tints: new Map() };
    const centered = zone === 'sky' || zone === 'water';
    TYPES[type] = {
      zone,
      size: Math.min(base, 3 / aspect),
      box: [aspect, 1],
      anchor: centered ? 'center' : 'bottom',
      speed: rec.moves ? (SPEEDS[rec.speed] || SPEEDS.normal) : 0,
      bob: zone === 'sky' ? [2, 0.06] : zone === 'water' ? [2, 0.05] : undefined,
      aquatic: zone === 'water' || zone === 'surface',
      many: 4,
      generated: true,
      draw(c, s, p, o) {
        const src = tinted(entry, o.g.color);
        if (!entry.img.complete || !entry.img.naturalWidth) return;
        const w = s * aspect;
        c.drawImage(src, -w / 2, centered ? -s / 2 : -s, w, s);
      },
    };

    const word = { label: rec.label, cat: 'creations', kind: 'noun', key: rec.key, type, svgUrl: entry.img.src };
    const known = WORDS.findIndex(w => w.key === rec.key);
    if (known >= 0) WORDS.splice(known, 1, word); else WORDS.push(word);
    WORD_INDEX.set(rec.key, word);
    for (const alias of rec.aliases || []) if (!WORD_INDEX.has(alias)) WORD_INDEX.set(alias, word);
    return word;
  }

  let creations = store.get(STORE_KEY, []);
  if (!Array.isArray(creations)) creations = [];
  for (const rec of creations) { try { register(rec); } catch (e) { console.warn('Création ignorée', rec?.key, e); } }

  function persist(rec) {
    creations = creations.filter(r => r.key !== rec.key);
    creations.push(rec);
    while (creations.length > MAX_CREATIONS) creations.shift();
    // Si le stockage est plein, on oublie les plus anciennes.
    while (!store.set(STORE_KEY, creations) && creations.length > 1) creations.shift();
  }

  function forget(key) {
    creations = creations.filter(r => r.key !== key);
    store.set(STORE_KEY, creations);
    const i = WORDS.findIndex(w => w.key === key && w.cat === 'creations');
    if (i >= 0) WORDS.splice(i, 1);
    for (const [k, w] of WORD_INDEX) if (w.key === key && w.cat === 'creations') WORD_INDEX.delete(k);
  }

  // Résultats : { word } en cas de succès, { refused: true } si Gemini refuse.
  const inflight = new Map();
  function create(rawWord) {
    const typed = normalize(rawWord);
    if (inflight.has(typed)) return inflight.get(typed);
    const job = (async () => {
      const out = await askGemini(rawWord.trim());
      if (!out || out.ok === false || typeof out.svg !== 'string') return { refused: true };
      const { svg, aspect } = sanitize(out.svg);
      const label = typeof out.label === 'string' && out.label.trim() ? out.label.trim().toLowerCase().slice(0, 30) : rawWord.trim().toLowerCase();
      // Un mot de la base garde sa priorité : l'alias ne le remplace pas.
      const labelKey = normalize(label);
      const builtIn = k => WORD_INDEX.has(k) && WORD_INDEX.get(k).cat !== 'creations';
      const key = labelKey && !builtIn(labelKey) ? labelKey : typed;
      const rec = {
        key, label, svg, aspect,
        zone: out.zone, moves: !!out.moves, speed: out.speed,
        aliases: typed !== key ? [typed] : [],
      };
      const word = register(rec);
      persist(rec);
      return { word };
    })();
    inflight.set(typed, job);
    const done = () => inflight.delete(typed);
    job.then(done, done);
    return job;
  }

  return { ready, getConfig, setConfig, create, forget, DEFAULT_MODEL, get creations() { return creations.slice(); } };
})();

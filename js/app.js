'use strict';

(() => {
  const input = document.getElementById('word');
  const field = document.getElementById('field');
  const suggest = document.getElementById('suggest');
  const toast = document.getElementById('toast');
  const overlay = document.getElementById('imagier');
  const catalog = document.getElementById('catalog');
  const btnBook = document.getElementById('btn-book');
  const btnSound = document.getElementById('btn-sound');
  const btnSave = document.getElementById('btn-save');
  const btnClear = document.getElementById('btn-clear');
  const btnMagic = document.getElementById('btn-magic');
  const magicBox = document.getElementById('magic');

  const PREFIX_DELAY = 1100;
  let pending = null;

  // ---------- Vignettes ----------
  const thumbs = new Map();
  function iconFor(w) {
    if (w.kind === 'noun') {
      if (!thumbs.has(w.key)) thumbs.set(w.key, w.svgUrl || Scene.thumbnail(w.key));
      const img = document.createElement('img');
      img.src = thumbs.get(w.key); img.alt = '';
      return img;
    }
    const span = document.createElement('span');
    if (w.kind === 'color') {
      span.className = 'swatch' + (w.value === 'multi' ? ' multi' : '');
      if (w.value !== 'multi') span.style.background = w.value;
    } else {
      span.className = 'emoji';
      span.textContent = w.icon || '•';
    }
    return span;
  }

  // ---------- Application d'un mot ----------
  function apply(w) {
    switch (w.kind) {
      case 'noun':
        Scene.addGroup(w.type || w.key);
        if (w.key === 'soleil') Scene.setEnv('soleil');
        break;
      case 'color': Scene.applyColor(w.value); break;
      case 'size': Scene.applySize(w.op); break;
      case 'many': Scene.multiply(); break;
      case 'speed': Scene.setSpeed(w.op); break;
      case 'action': Scene.setAction(w.op); break;
      case 'env':
        if (w.op === 'rien') { clearAll(); break; }
        if (w.op === 'musique') { Sound.toggleMusic(); break; }
        Scene.setEnv(w.op);
        break;
    }
  }

  function commit(w) {
    clearTimeout(pending); pending = null;
    Sound.unlock();
    Sound.chime();
    Sound.speak(w.label);
    apply(w);
    showToast(w);
    input.value = '';
    refresh();
    field.classList.remove('success'); void field.offsetWidth; field.classList.add('success');
  }

  function clearAll() {
    Scene.reset();
    Sound.stopMusic();
  }

  // ---------- Saisie ----------
  // WORDS grandit avec les créations : on le relit à chaque fois.
  const startsWithAny = n => WORDS.some(w => w.key.startsWith(n));
  const hasLonger = n => WORDS.some(w => w.key.length > n.length && w.key.startsWith(n));

  function refresh() {
    const n = normalize(input.value);
    field.classList.toggle('match', !!n && WORD_INDEX.has(n));
    field.classList.toggle('unknown', !!n && !startsWithAny(n));
    renderSuggestions(n);
  }

  function renderSuggestions(n) {
    suggest.replaceChildren();
    if (!n) return;
    const list = WORDS.filter(w => w.key.startsWith(n) && w.key !== n).slice(0, 4);
    for (const w of list) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.append(iconFor(w), document.createTextNode(w.label));
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { input.value = w.label; commit(w); input.focus(); });
      suggest.append(b);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(pending); pending = null;
    refresh();
    const n = normalize(input.value);
    const w = WORD_INDEX.get(n);
    if (!w) return;
    // « chat » pourrait devenir « château » : on laisse le temps de finir.
    if (hasLonger(n)) pending = setTimeout(() => commit(w), PREFIX_DELAY);
    else commit(w);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const w = WORD_INDEX.get(normalize(input.value));
      if (w) commit(w);
      else if (normalize(input.value).length >= 2) invent(input.value);
      else if (input.value.trim()) wobble();
    } else if (e.key === ' ') {
      const n = normalize(input.value);
      const w = WORD_INDEX.get(n);
      if (w) { e.preventDefault(); commit(w); }
      else if (!n) e.preventDefault();
      // Sinon on garde l'espace : « arc en ciel » reste possible.
    } else if (e.key === 'Escape') {
      input.value = ''; clearTimeout(pending); refresh();
    }
  });

  // Champ actif en permanence : toute frappe atterrit dans le champ.
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (overlay.open && e.key === 'Escape') return;
    if (e.target === input || magicBox.open) return;
    if (e.key.length === 1 || e.key === 'Backspace') {
      if (overlay.open) closeBook();
      input.focus();
    }
  });
  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  for (const b of document.querySelectorAll('.bar button')) b.addEventListener('mousedown', e => e.preventDefault());
  document.getElementById('scene').addEventListener('pointerup', () => input.focus());

  // ---------- Mots inventés (Gemini) ----------
  let thinking = 0;
  async function invent(raw) {
    const word = raw.trim();
    if (!Magic.ready()) {
      wobble();
      showMessage('✨', 'Bouton « Magie » pour inventer des mots', 2600);
      return;
    }
    input.value = '';
    refresh();
    thinking++;
    field.classList.add('thinking');
    showMessage('🖍️', `Je dessine « ${word} »…`, 0);
    try {
      const res = await Magic.create(word);
      if (res.word) {
        thumbs.delete(res.word.key);
        commit(res.word);
      } else {
        showMessage('🙈', `Je ne sais pas dessiner « ${word} »`, 2600);
      }
    } catch (err) {
      console.warn('Gemini :', err);
      showMessage('🌧️', 'Oups, la magie n\'a pas marché', 2600);
      magicStatus.textContent = 'Dernière erreur : ' + err.message;
    } finally {
      if (--thinking === 0) field.classList.remove('thinking');
    }
  }

  // Chromium : un focus() pendant la fermeture d'un <dialog> laisse un focus
  // fantôme (le champ paraît actif mais ne reçoit plus la frappe).
  function refocus() { setTimeout(() => { input.blur(); input.focus(); }, 0); }

  // ---------- Retour visuel ----------
  function wobble() { field.classList.remove('wobble'); void field.offsetWidth; field.classList.add('wobble'); }

  let toastTimer = null;
  function popToast(nodes, ms) {
    toast.replaceChildren(...nodes);
    toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }
  function showToast(w) { popToast([iconFor(w), document.createTextNode(w.label)], 1600); }
  function showMessage(icon, text, ms) {
    const span = document.createElement('span');
    span.className = 'emoji'; span.textContent = icon;
    const t = document.createElement('small');
    t.textContent = text;
    popToast([span, t], ms);
  }

  // ---------- Imagier ----------
  const CREATIONS = { id: 'creations', label: 'Mes créations', icon: '✨' };
  function buildCatalog() {
    catalog.replaceChildren();
    for (const cat of [...CATEGORIES, CREATIONS]) {
      const words = WORDS.filter(x => x.cat === cat.id);
      if (!words.length) continue;
      const sec = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = `${cat.icon} ${cat.label}`;
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const w of words) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'card';
        if (w.cat === 'creations') {
          const del = document.createElement('span');
          del.className = 'forget'; del.title = 'Oublier ce mot'; del.textContent = '✕';
          del.addEventListener('click', e => { e.stopPropagation(); Magic.forget(w.key); thumbs.delete(w.key); buildCatalog(); });
          b.append(del);
        }
        const pic = document.createElement('span');
        pic.className = 'pic';
        pic.append(iconFor(w));
        const lab = document.createElement('span');
        lab.className = 'lab';
        lab.textContent = w.label;
        b.append(pic, lab);
        b.addEventListener('click', () => {
          closeBook();
          input.value = w.label;
          refresh();
          setTimeout(() => commit(w), 280);
        });
        grid.append(b);
      }
      sec.append(h, grid);
      catalog.append(sec);
    }
  }
  function openBook() { buildCatalog(); if (!overlay.open) overlay.showModal(); btnBook.setAttribute('aria-pressed', 'true'); }
  function closeBook() { if (overlay.open) overlay.close(); }
  overlay.addEventListener('close', () => { btnBook.setAttribute('aria-pressed', 'false'); refocus(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeBook(); });
  document.getElementById('book-close').addEventListener('click', closeBook);
  btnBook.addEventListener('click', () => (overlay.open ? closeBook() : openBook()));

  // ---------- Barre d'actions ----------
  btnSound.addEventListener('click', () => {
    Sound.unlock();
    Sound.setEnabled(!Sound.enabled);
    btnSound.setAttribute('aria-pressed', String(!Sound.enabled));
    btnSound.querySelector('.ico').textContent = Sound.enabled ? '🔊' : '🔇';
    btnSound.querySelector('.txt').textContent = Sound.enabled ? 'Son' : 'Muet';
    input.focus();
  });

  btnSave.addEventListener('click', () => {
    Sound.click();
    document.body.classList.remove('flash'); void document.body.offsetWidth; document.body.classList.add('flash');
    Scene.toBlob(blob => {
      if (!blob) return;
      // Quand le téléchargement est bloqué (page intégrée), on montre l'image
      // pour un enregistrement manuel (clic droit ou appui long).
      if (window.SAVE_AS_PREVIEW) { showSaved(blob); return; }
      const d = new Date(), z = n => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mon-paysage-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.png`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    input.focus();
  });

  const saved = document.getElementById('saved');
  function showSaved(blob) {
    const img = saved.querySelector('img');
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    saved.showModal();
  }
  saved.addEventListener('click', e => { if (e.target === saved || e.target.closest('.close')) saved.close(); });
  saved.addEventListener('close', refocus);

  // Deux appuis pour tout effacer : un clic égaré ne détruit pas le dessin.
  let clearArmed = null;
  btnClear.addEventListener('click', () => {
    if (clearArmed) {
      clearTimeout(clearArmed); clearArmed = null;
      btnClear.classList.remove('armed');
      btnClear.querySelector('.txt').textContent = 'Tout effacer';
      clearAll();
    } else {
      btnClear.classList.add('armed');
      btnClear.querySelector('.txt').textContent = 'Sûr ?';
      clearArmed = setTimeout(() => {
        clearArmed = null;
        btnClear.classList.remove('armed');
        btnClear.querySelector('.txt').textContent = 'Tout effacer';
      }, 3000);
    }
    input.focus();
  });

  // ---------- Réglages « Magie » ----------
  const magicKey = document.getElementById('magic-key');
  const magicModel = document.getElementById('magic-model');
  const magicStatus = document.getElementById('magic-status');
  function syncMagic() {
    const c = Magic.getConfig();
    magicKey.value = c.apiKey;
    magicModel.value = c.model;
    magicModel.placeholder = Magic.DEFAULT_MODEL;
    btnMagic.setAttribute('aria-pressed', String(Magic.ready()));
  }
  btnMagic.addEventListener('click', () => { syncMagic(); magicStatus.textContent = ''; magicBox.showModal(); });
  magicBox.querySelector('form').addEventListener('submit', e => {
    e.preventDefault();
    Magic.setConfig({ apiKey: magicKey.value, model: magicModel.value });
    syncMagic();
    magicBox.close();
    if (Magic.ready()) showMessage('✨', 'Magie prête : tape un mot, puis Entrée', 2600);
  });
  document.getElementById('magic-forget').addEventListener('click', () => {
    Magic.setConfig({ apiKey: '', model: magicModel.value });
    syncMagic();
    magicStatus.textContent = 'Clé effacée de ce navigateur.';
  });
  magicBox.addEventListener('click', e => { if (e.target === magicBox || e.target.closest('.close')) magicBox.close(); });
  magicBox.addEventListener('close', refocus);
  syncMagic();

  Scene.hooks.onThunder = () => Sound.thunder();

  refresh();
  input.focus();
})();

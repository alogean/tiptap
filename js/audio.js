'use strict';

// Effets sonores (Web Audio), voix (synthèse vocale) et petite mélodie.
const Sound = (() => {
  let ac = null, master = null;
  let enabled = true;
  let voice = null;

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = enabled ? 0.6 : 0;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, start, dur, type = 'sine', vol = 0.2, dest = master) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start); o.stop(start + dur + 0.05);
  }

  function chime() {
    if (!enabled || !ensure()) return;
    const t = ac.currentTime;
    tone(880, t, 0.25, 'sine', 0.18);
    tone(1318.5, t + 0.08, 0.4, 'sine', 0.16);
  }

  function click() {
    if (!enabled || !ensure()) return;
    tone(1600, ac.currentTime, 0.06, 'square', 0.05);
  }

  function thunder() {
    if (!enabled || !ensure()) return;
    const len = 2.2, t = ac.currentTime + 0.25;
    const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = ac.createBufferSource(); src.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(lp).connect(g).connect(master);
    src.start(t);
  }

  // ----- Voix -----
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => /^fr[-_]FR/i.test(v.lang)) || vs.find(v => /^fr/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  }

  function speak(text) {
    if (!enabled || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    if (voice) u.voice = voice;
    u.rate = 0.9; u.pitch = 1.15;
    speechSynthesis.speak(u);
  }

  // ----- Musique : « Frère Jacques » en boucle -----
  const N = { G4: 392, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880 };
  const TUNE = [
    ['C5', 1], ['D5', 1], ['E5', 1], ['C5', 1], ['C5', 1], ['D5', 1], ['E5', 1], ['C5', 1],
    ['E5', 1], ['F5', 1], ['G5', 2], ['E5', 1], ['F5', 1], ['G5', 2],
    ['G5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 1], ['C5', 1],
    ['G5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F5', 0.5], ['E5', 1], ['C5', 1],
    ['C5', 1], ['G4', 1], ['C5', 2], ['C5', 1], ['G4', 1], ['C5', 2],
  ];
  const BEAT = 0.42;
  let music = false, timer = null, nextTime = 0, idx = 0, musicBus = null;

  function schedule() {
    while (nextTime < ac.currentTime + 0.3) {
      const [n, d] = TUNE[idx];
      tone(N[n], nextTime, d * BEAT * 0.95, 'triangle', 0.12, musicBus);
      if (idx % 2 === 0) tone(N[n] / 4, nextTime, d * BEAT * 0.9, 'sine', 0.06, musicBus);
      nextTime += d * BEAT;
      idx = (idx + 1) % TUNE.length;
    }
  }

  function toggleMusic() {
    if (!ensure()) return false;
    music = !music;
    if (music) {
      musicBus = ac.createGain(); musicBus.gain.value = 1; musicBus.connect(master);
      nextTime = ac.currentTime + 0.1; idx = 0;
      timer = setInterval(schedule, 100);
      schedule();
    } else {
      clearInterval(timer); timer = null;
      const bus = musicBus; musicBus = null;
      bus.gain.setTargetAtTime(0, ac.currentTime, 0.05);
      setTimeout(() => bus.disconnect(), 400);
    }
    return music;
  }

  function stopMusic() { if (music) toggleMusic(); }

  function setEnabled(v) {
    enabled = v;
    if (master) master.gain.setTargetAtTime(v ? 0.6 : 0, ac.currentTime, 0.02);
    if (!v && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  return {
    chime, click, thunder, speak, toggleMusic, stopMusic, setEnabled, unlock: ensure,
    get enabled() { return enabled; },
    get music() { return music; },
  };
})();

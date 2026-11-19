/* ═══════════════════════════════════════════
   sound.js — Background sounds + keystroke audio
   ═══════════════════════════════════════════ */

const Sound = (() => {
  let ctx = null;
  let ambient = null;          // running background sound: { stop(fadeSeconds) }
  let activeAmbient = null;
  let activeKeySound = 'none';
  const buffers = {};          // url -> AudioBuffer | null (null = not available)
  const listeners = [];

  const AUDIO_FILES = {
    ambient: { rain: 'audio/rain.mp3', piano: ['audio/piano-1.mp3', 'audio/piano-2.mp3', 'audio/piano-3.mp3', 'audio/piano-4.mp3', 'audio/piano-5.mp3', 'audio/piano-6.mp3', 'audio/piano-7.mp3', 'audio/piano-8.mp3'], wind: 'audio/wind.mp3', fire: 'audio/fire.mp3' },
    keys:    { typewriter: 'audio/typewriter-key.mp3', pen: 'audio/pen-key.mp3' }
  };
  // A "sprite" file holds several short clicks side by side; one is picked at random per keystroke.
  const KEY_SPRITES = { 'audio/typewriter-keys.mp3': { slot: 0.16, count: 40 } };

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  async function loadBuffer(url) {
    if (url in buffers) return buffers[url];
    try {
      const res = await fetch(url);
      if (!res.ok) { buffers[url] = null; return null; }
      buffers[url] = await getCtx().decodeAudioData(await res.arrayBuffer());
    } catch (e) { buffers[url] = null; }
    return buffers[url];
  }

  /* ── noise helpers ── */
  function noiseBuffer(ac, seconds, brown) {
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }
  function loopNoise(ac, brown) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuffer(ac, 4, brown); s.loop = true; s.start();
    return s;
  }

  /* ═══════ Generated background sounds (used when no audio file exists) ═══════ */
  function synthAmbient(name) {
    const ac = getCtx();
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    const sources = [], timers = [];

    if (name === 'rain') {
      const n = loopNoise(ac, false); sources.push(n);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000;
      const g = ac.createGain(); g.gain.value = 0.32;
      n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
      const n2 = loopNoise(ac, true); sources.push(n2);          // softer, deeper patter
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.6;
      const g2 = ac.createGain(); g2.gain.value = 0.25;
      n2.connect(bp); bp.connect(g2); g2.connect(master);
    } else if (name === 'wind') {
      const n = loopNoise(ac, true); sources.push(n);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 0.9;
      const g = ac.createGain(); g.gain.value = 0.55;
      n.connect(bp); bp.connect(g); g.connect(master);
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.12; sources.push(lfo);   // slow gusts
      const depth = ac.createGain(); depth.gain.value = 0.35;
      lfo.connect(depth); depth.connect(g.gain);
      const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.07; sources.push(lfo2);
      const depth2 = ac.createGain(); depth2.gain.value = 180;
      lfo2.connect(depth2); depth2.connect(bp.frequency);
      lfo.start(); lfo2.start();
    } else if (name === 'fire') {
      const n = loopNoise(ac, true); sources.push(n);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const g = ac.createGain(); g.gain.value = 0.7;
      n.connect(lp); lp.connect(g); g.connect(master);
      const crack = () => {                                         // random pops and crackles
        const len = 0.01 + Math.random() * 0.04;
        const b = noiseBuffer(ac, len, false);
        const s = ac.createBufferSource(); s.buffer = b;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 3500; bp.Q.value = 1.2;
        const cg = ac.createGain(); cg.gain.setValueAtTime(0.15 + Math.random() * 0.45, ac.currentTime);
        cg.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + len);
        s.connect(bp); bp.connect(cg); cg.connect(master); s.start();
        timers.push(setTimeout(crack, 40 + Math.random() * 380));
      };
      crack();
    } else if (name === 'piano') {
      const delay = ac.createDelay(1.5); delay.delayTime.value = 0.38;
      const fb = ac.createGain(); fb.gain.value = 0.38;
      const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2400;
      const wet = ac.createGain(); wet.gain.value = 0.45;
      delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(master);
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];   // C major pentatonic
      const note = (f, vel) => {
        const t = ac.currentTime;
        const env = ac.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(vel, t + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0002, t + 4.2);
        [[1, 1], [2, 0.28], [3, 0.08]].forEach(([mult, amp]) => {
          const o = ac.createOscillator(); o.type = mult === 1 ? 'triangle' : 'sine';
          o.frequency.value = f * mult;
          const og = ac.createGain(); og.gain.value = amp;
          o.connect(og); og.connect(env); o.start(t); o.stop(t + 4.4);
        });
        env.connect(master); env.connect(delay);
      };
      const next = () => {
        const f = scale[Math.floor(Math.random() * scale.length)];
        note(f, 0.07 + Math.random() * 0.06);
        if (Math.random() < 0.3) note(scale[Math.floor(Math.random() * 5)] / 2, 0.05);   // soft low note
        timers.push(setTimeout(next, 1400 + Math.random() * 2600));
      };
      next();
    }

    master.gain.linearRampToValueAtTime(name === 'piano' ? 0.9 : 0.5, ac.currentTime + 1.5);
    return {
      stop(fade = 1) {
        timers.forEach(clearTimeout);
        try { master.gain.cancelScheduledValues(ac.currentTime); master.gain.setValueAtTime(master.gain.value, ac.currentTime); master.gain.linearRampToValueAtTime(0, ac.currentTime + fade); } catch (e) {}
        setTimeout(() => { sources.forEach(s => { try { s.stop(); } catch (e) {} }); try { master.disconnect(); } catch (e) {} }, fade * 1000 + 100);
      }
    };
  }

  function fileAmbient(buf) {
    const ac = getCtx();
    const src = ac.createBufferSource(), gain = ac.createGain();
    src.buffer = buf; src.loop = true;
    gain.gain.value = 0;
    src.connect(gain); gain.connect(ac.destination);
    src.start();
    gain.gain.linearRampToValueAtTime(0.5, ac.currentTime + 1.5);
    return {
      stop(fade = 1) {
        try { gain.gain.cancelScheduledValues(ac.currentTime); gain.gain.setValueAtTime(gain.gain.value, ac.currentTime); gain.gain.linearRampToValueAtTime(0, ac.currentTime + fade); src.stop(ac.currentTime + fade + 0.1); } catch (e) {}
      }
    };
  }

  // A playlist: tracks play one after another and start over when the last one ends.
  // Streams the files (no need to decode minutes of audio into memory).
  function playlistAmbient(urls) {
    let i = 0, stopped = false, el = null, vol = 0, fadeT = null;
    const target = 0.5;
    function ramp(to, ms, done) {
      clearInterval(fadeT);
      const from = vol, t0 = Date.now();
      fadeT = setInterval(() => {
        const k = Math.min(1, (Date.now() - t0) / ms);
        vol = from + (to - from) * k;
        if (el) el.volume = Math.max(0, Math.min(1, vol));
        if (k >= 1) { clearInterval(fadeT); if (done) done(); }
      }, 50);
    }
    function next() {
      if (stopped) return;
      el = new Audio(urls[i]);
      el.volume = Math.max(0, Math.min(1, vol));
      el.onended = () => { i = (i + 1) % urls.length; next(); };
      el.onerror = () => { i = (i + 1) % urls.length; setTimeout(next, 500); };
      el.play().catch(() => {});
    }
    next(); ramp(target, 1500);
    return {
      stop(fade = 1) {
        stopped = true;
        const e = el;
        ramp(0, fade * 1000, () => { try { e && e.pause(); } catch (x) {} });
      }
    };
  }

  /* ═══════ Background sound control ═══════ */
  function notify() { listeners.forEach(fn => { try { fn(activeAmbient); } catch (e) {} }); }
  function onAmbientChange(fn) { listeners.push(fn); }

  async function playAmbient(name) {
    if (!AUDIO_FILES.ambient[name]) return;
    stopAmbient(true);
    activeAmbient = name;
    notify();
    getCtx();
    const file = AUDIO_FILES.ambient[name];
    if (Array.isArray(file)) {
      let ok = false;
      try { ok = (await fetch(file[0], { method: 'HEAD' })).ok; } catch (e) {}
      if (activeAmbient !== name) return;
      ambient = ok ? playlistAmbient(file) : synthAmbient(name);
      return;
    }
    const buf = await loadBuffer(file);
    if (activeAmbient !== name) return;                       // changed/stopped while loading
    ambient = buf ? fileAmbient(buf) : synthAmbient(name);
  }

  function stopAmbient(silent) {
    if (ambient) { ambient.stop(1); ambient = null; }
    activeAmbient = null;
    if (!silent) notify();
  }

  function toggleAmbient(name) {
    if (activeAmbient === name) { stopAmbient(); return false; }
    playAmbient(name); return true;
  }

  /* ═══════ Keystrokes ═══════ */
  function synthKey(type) {
    try {
      const ac = getCtx(), t = ac.currentTime;
      if (type === 'typewriter') {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square'; o.frequency.value = 170 + Math.random() * 60;
        g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.08);
        const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac, 0.03, false);
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
        const ng = ac.createGain(); ng.gain.setValueAtTime(0.09, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        s.connect(hp); hp.connect(ng); ng.connect(ac.destination); s.start(t);
      } else if (type === 'pen') {                                  // pen scratching: short, papery, bright noise
        const dur = 0.05 + Math.random() * 0.05;
        const s = ac.createBufferSource(); s.buffer = noiseBuffer(ac, dur, false);
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
        bp.frequency.setValueAtTime(3000 + Math.random() * 1500, t);
        bp.frequency.linearRampToValueAtTime(5000 + Math.random() * 2000, t + dur);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
        s.connect(bp); bp.connect(g); g.connect(ac.destination); s.start(t);
      }
    } catch (e) {}
  }

  let lastKey = 0;
  function playKey() {
    if (activeKeySound === 'none') return;
    const now = Date.now();
    if (now - lastKey < 25) return;
    lastKey = now;
    const buf = buffers[AUDIO_FILES.keys[activeKeySound]];
    if (buf) {
      try {
        const ac = getCtx(), src = ac.createBufferSource(), gain = ac.createGain();
        src.buffer = buf; src.playbackRate.value = 0.94 + Math.random() * 0.14;
        gain.gain.value = 0.6;
        src.connect(gain); gain.connect(ac.destination);
        const sp = KEY_SPRITES[AUDIO_FILES.keys[activeKeySound]];
        if (sp) src.start(0, Math.floor(Math.random() * sp.count) * sp.slot, sp.slot - 0.01);
        else if (buf.duration > 0.6) {
          // A long recording (e.g. pen scratching): play a short random slice of it per keystroke
          const len = 0.16 + Math.random() * 0.08, t = ac.currentTime;
          const off = Math.random() * (buf.duration - len);
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(0.8, t + 0.02);
          gain.gain.linearRampToValueAtTime(0.0001, t + len);
          src.start(t, off, len);
        } else src.start();
      } catch (e) {}
    } else synthKey(activeKeySound);
  }

  async function setKeySound(type) {
    activeKeySound = AUDIO_FILES.keys[type] ? type : 'none';
    if (activeKeySound !== 'none') await loadBuffer(AUDIO_FILES.keys[activeKeySound]);
  }

  function getActive() { return { ambient: activeAmbient, key: activeKeySound }; }

  return { playKey, setKeySound, playAmbient, toggleAmbient, stopAmbient, onAmbientChange, getActive };
})();

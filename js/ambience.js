/* ═══════════════════════════════════════════
   ambience.js — floating "Ambience" panel + pause control
   ═══════════════════════════════════════════ */

const Ambience = (() => {
  const THEMES = ['light', 'dark', 'midnight', 'typewriter', 'horror', 'rose', 'emerald', 'enchanted'];
  const THEME_NAMES = { light:'Light', dark:'Dark', midnight:'Midnight', typewriter:'Typewriter', horror:'Horror', rose:'Rose', emerald:'Emerald Forest', enchanted:'Enchanted' };
  const SOUND_NAMES = { rain:'Rain', piano:'Soft piano', wind:'Wind', fire:'Fire' };
  const KEY_NAMES = { none:'None', typewriter:'Typewriter', pen:'Pen scratching' };

  let pending = null;       // what the user is choosing right now
  let isOpen = false;
  let pausedName = null;    // sound the user paused (so ▶ can resume it)
  const $ = id => document.getElementById(id);

  const safeTheme = t => t === 'gothic' ? 'enchanted' : THEMES.includes(t) ? t : 'light';   // 'gothic' was renamed Enchanted
  function applyTheme(name) { document.body.className = 'theme-' + safeTheme(name); }

  function renderChoices() {
    document.querySelectorAll('#theme-swatches .swatch').forEach(sw => {
      const name = [...sw.classList].find(c => c.startsWith('swatch-') && c !== 'swatch').slice(7);
      sw.dataset.theme = name;
      sw.classList.toggle('active', name === pending.theme);
    });
    document.querySelectorAll('#ambiance-btns .amb-opt').forEach(b => b.classList.toggle('active', b.dataset.sound === pending.ambient));
    document.querySelectorAll('#keystroke-btns .amb-opt').forEach(b => b.classList.toggle('active', b.dataset.key === pending.keySound));
  }

  function open() {
    const p = Storage.prefs();
    pending = { theme: safeTheme(p.theme), ambient: SOUND_NAMES[p.ambient] ? p.ambient : null, keySound: KEY_NAMES[p.keySound] ? p.keySound : 'none' };
    renderChoices();
    $('ambience-panel').classList.add('open');
    isOpen = true;
  }
  function close() { $('ambience-panel').classList.remove('open'); isOpen = false; }
  document.addEventListener('pointerdown', e => {
    if (!isOpen) return;
    if (e.target.closest('#ambience-panel, #ambience-fab')) return;
    close();
  });
  function toggle() { isOpen ? close() : open(); }

  /* apply the current choices right away and remember them */
  function apply() {
    pausedName = null;
    applyPrefs(pending);
    Storage.setPrefs({ ...pending });
  }

  function applyPrefs(p) {
    applyTheme(p.theme);
    Sound.setKeySound(p.keySound || 'none');
    if (p.ambient) Sound.playAmbient(p.ambient); else Sound.stopAmbient();
  }

  /* ── Top-centre pause control ── */
  function updatePill() {
    const pill = $('sound-pill'); if (!pill) return;
    const playing = Sound.getActive().ambient;
    const name = playing || pausedName;
    pill.classList.toggle('show', !!name);
    if (!name) return;
    $('sound-pill-name').textContent = SOUND_NAMES[name] || name;
    const btn = $('sound-pill-btn');
    btn.textContent = playing ? '❚❚' : '▶';
    btn.title = playing ? 'Pause background sound' : 'Resume background sound';
  }

  function togglePause() {
    const playing = Sound.getActive().ambient;
    if (playing) { pausedName = playing; Sound.stopAmbient(); }
    else if (pausedName) { const n = pausedName; pausedName = null; Sound.playAmbient(n); }
    updatePill();
  }

  /* ── Called after Storage.init() ── */
  function init() {
    const p = Storage.prefs();
    applyTheme(p.theme);
    Sound.setKeySound(p.keySound || 'none');
    Sound.onAmbientChange(updatePill);

    // Browsers block autoplay — resume the saved background sound on the first click/keypress
    if (p.ambient && SOUND_NAMES[p.ambient]) {
      const resume = () => {
        document.removeEventListener('pointerdown', resume, true);
        document.removeEventListener('keydown', resume, true);
        if (!pausedName && !Sound.getActive().ambient) Sound.playAmbient(p.ambient);
      };
      document.addEventListener('pointerdown', resume, true);
      document.addEventListener('keydown', resume, true);
    }

    $('theme-swatches').addEventListener('click', e => {
      const sw = e.target.closest('.swatch'); if (!sw || !pending) return;
      pending.theme = sw.dataset.theme; renderChoices(); apply();
    });
    $('ambiance-btns').addEventListener('click', e => {
      const b = e.target.closest('[data-sound]'); if (!b || !pending) return;
      pending.ambient = pending.ambient === b.dataset.sound ? null : b.dataset.sound; renderChoices(); apply();
    });
    $('keystroke-btns').addEventListener('click', e => {
      const b = e.target.closest('[data-key]'); if (!b || !pending) return;
      pending.keySound = pending.keySound === b.dataset.key ? 'none' : b.dataset.key; renderChoices(); apply();
    });
  }

  return { init, toggle, togglePause };
})();

/* ═══════════════════════════════════════════
   portrait.js — Layered character portraits

   Images live in  images/characters/<gender>/
     base.webp            bald base figure
     eyes.webp            mask: where the eyes are
     <hairstyle>/1.webp … full figure with that hairstyle, one file per outfit
     <hairstyle>/hair.webp  mask: where the hair is

   Hair and eye colours are painted on with the masks, so every
   hairstyle/outfit you add works automatically.
   ═══════════════════════════════════════════ */

const Portrait = (() => {
  const ROOT = 'images/characters';

  /* All hairstyles we know about. Only the ones that have images in the folder show up. */
  const STYLES = {
    female: ['Long Straight Hair', 'Messy Bun', 'Low Ponytail', 'Bob', 'Half-Up', 'Bangs', 'Curly', 'High Ponytail', 'Medium Length', 'Messy Braid'],
    male:   ['Messy Sideswept', 'Shoulder Length', 'Spiky', 'Tousled', 'Neat']
  };
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* colour ramps: [shadow, mid, light] */
  const HAIR = {
    brown:  { label: 'Brown',  ramp: [[30,16,10],  [88,54,32],   [168,118,78]] },
    black:  { label: 'Black',  ramp: [[8,8,10],    [34,32,38],   [96,94,106]] },
    blonde: { label: 'Blonde', ramp: [[120,90,40], [212,170,85], [250,228,160]] },
    red:    { label: 'Red',    ramp: [[60,14,8],   [160,40,20],  [232,110,64]] },
    white:  { label: 'White',  ramp: [[120,124,135], [220,222,228], [255,255,255]] }
  };
  const EYES = {
    grey:  { label: 'Grey',  ramp: null },
    brown: { label: 'Brown', ramp: [[36,20,10],  [108,64,32],  [172,122,72]] },
    hazel: { label: 'Hazel', ramp: [[56,44,16],  [130,106,48], [196,168,92]] },
    green: { label: 'Green', ramp: [[14,48,26],  [50,124,70],  [134,192,122]] },
    blue:  { label: 'Blue',  ramp: [[14,38,92],  [48,108,192], [142,192,238]] },
    black: { label: 'Black', ramp: [[4,4,6],     [20,20,24],   [58,58,66]] }
  };
  /* skin tones: the average skin colour we want (null = leave the artwork as it is) */
  const SKIN = {
    natural: { label: 'Natural', color: [226,172,144], keep: true },
    fair:    { label: 'Fair',    color: [246,216,198] },
    light:   { label: 'Light',   color: [238,196,166] },
    medium:  { label: 'Medium',  color: [214,160,120] },
    tan:     { label: 'Tan',     color: [178,122,84] }
  };
  const swatchColor = v => `rgb(${(v.color || (v.ramp || v)[1]).join(',')})`;

  /* ── image + mask loading (cached) ── */
  const imgCache = {};
  function loadImg(url) {
    if (!imgCache[url]) {
      imgCache[url] = new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('missing ' + url));
        i.src = url;
      });
      imgCache[url].catch(() => { delete imgCache[url]; });
    }
    return imgCache[url];
  }
  const exists = url => loadImg(url).then(() => true, () => false);

  const pixCache = {};
  async function pixels(url) {
    if (!pixCache[url]) {
      pixCache[url] = loadImg(url).then(img => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, c.width, c.height);
      });
    }
    return pixCache[url];
  }

  /* ── what exists on disk (images/characters/manifest.json lists every hairstyle and its outfit count) ── */
  /* Built-in copy, so the lists work even when index.html is opened straight from a folder (where fetch is blocked).
     When the site is hosted, manifest.json is read as well and wins — so adding a style only needs the folder + manifest.json. */
  const BUILTIN = {
    female: { 'long-straight-hair': 6, 'messy-bun': 6, 'low-ponytail': 6, 'bob': 6, 'half-up': 6, 'bangs': 6, 'curly': 6, 'high-ponytail': 6, 'medium-length': 6, 'messy-braid': 6 },
    male:   { 'messy-sideswept': 4, 'shoulder-length': 4, 'spiky': 4, 'tousled': 4, 'neat': 4 }
  };
  let manifest = null;
  function loadManifest() {
    if (!manifest) manifest = fetch(`${ROOT}/manifest.json`).then(r => r.ok ? r.json() : BUILTIN).then(m => (m && (m.female || m.male)) ? m : BUILTIN).catch(() => BUILTIN);
    return manifest;
  }
  async function hairstyles(gender) {
    const m = (await loadManifest())[gender] || {};
    return STYLES[gender].filter(n => m[slug(n)] > 0);
  }
  async function clothesCount(gender, style) {
    const m = (await loadManifest())[gender] || {};
    return Math.max(m[slug(style)] || 1, 1);
  }

  /* ── colour mapping ── */
  function rampAt(ramp, t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const [a, b, c] = ramp;
    const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const p = t < 0.5 ? a : b, q = t < 0.5 ? b : c;
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
  }
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function percentiles(data, mask, thresh, accept) {
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0, p = 0; i < mask.length; i += 4, p++) {
      if (mask[i] > thresh && data[i + 3] > 128 && (!accept || accept(p))) {
        hist[Math.min(255, lum(data[i], data[i + 1], data[i + 2]) | 0)]++; n++;
      }
    }
    if (!n) return [0, 255];
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.05) { lo = v; break; } }
    acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.95) { hi = v; break; } }
    if (hi - lo < 20) hi = lo + 20;
    return [lo, hi];
  }

  function tint(data, mask, ramp, accept) {
    const [lo, hi] = percentiles(data, mask, 100, accept);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const m = mask[i] / 255;
      if (m < 0.02 || (accept && !accept(p))) continue;
      const c = rampAt(ramp, (lum(data[i], data[i + 1], data[i + 2]) - lo) / (hi - lo));
      data[i]     += (c[0] - data[i])     * m;
      data[i + 1] += (c[1] - data[i + 1]) * m;
      data[i + 2] += (c[2] - data[i + 2]) * m;
    }
  }

  /* ── render a look to an 800px canvas (cached) ── */
  const renderCache = new Map();
  async function render(look) {
    const { gender, hair, clothes = 1, hairColor = 'brown', eyeColor = 'grey', skinTone = 'natural', simple = false } = look || {};
    if (!STYLES[gender]) throw new Error('no gender');
    if (simple) return renderSimple(gender);
    const useHair = hair ? hair : null;
    const key = [gender, useHair, useHair ? clothes : 0, useHair ? hairColor : '', eyeColor, skinTone].join('|');
    if (renderCache.has(key)) return renderCache.get(key);

    const g = `${ROOT}/${gender}`;
    const file = useHair ? `${g}/${slug(useHair)}/${clothes}.webp` : `${g}/base.webp`;
    const img = await loadImg(file);
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    try {
      const wantEyes = EYES[eyeColor] && EYES[eyeColor].ramp;
      const wantHair = useHair && HAIR[hairColor];
      const wantSkin = SKIN[skinTone] && !SKIN[skinTone].keep;
      if (wantEyes || wantHair || wantSkin) {
        const id = ctx.getImageData(0, 0, cv.width, cv.height);
        const d = id.data;
        if (wantHair) {
          const hm = (await pixels(`${g}/${slug(useHair)}/hair.webp`)).data;
          tint(d, hm, HAIR[hairColor].ramp);
        }
        if (wantEyes) {
          const em = (await pixels(`${g}/eyes.webp`)).data;
          const base = (await pixels(`${g}/base.webp`)).data;
          // leave eyes alone where a fringe/hair falls over them
          const clear = p => {
            const i = p * 4;
            return Math.abs(d[i] - base[i]) + Math.abs(d[i + 1] - base[i + 1]) + Math.abs(d[i + 2] - base[i + 2]) < 200;
          };
          tint(d, em, EYES[eyeColor].ramp, clear);
        }
        if (wantSkin) {
          const sm = (await pixels(`${g}/skin.webp`)).data;
          const base = (await pixels(`${g}/base.webp`)).data;
          /* extra skin this outfit reveals (V-necks, open collars) — optional per-outfit mask */
          let ex = null;
          if (useHair && clothes > 1) { try { ex = (await pixels(`${g}/${slug(useHair)}/skin-${clothes}.webp`)).data; } catch (e) { ex = null; } }
          let r = 0, gg = 0, b = 0, n = 0;
          for (let i = 0; i < sm.length; i += 4) if (sm[i] > 200) { r += base[i]; gg += base[i + 1]; b += base[i + 2]; n++; }
          if (n) {
            const t = SKIN[skinTone].color, mr = r / n, mg = gg / n, mb = b / n, kr = t[0] / mr, kg = t[1] / mg, kb = t[2] / mb;
            for (let i = 0; i < d.length; i += 4) {
              let m = sm[i] / 255;
              if ((m < 0.02 && !(ex && ex[i] > 5)) || d[i + 3] < 8) continue;
              /* full strength on bare skin, fading out where clothes / hair sit on top */
              /* bare skin keeps the base colour balance; clothes / hair on top do not */
              const dc = Math.abs((d[i] - d[i + 1]) - (base[i] - base[i + 1])) + Math.abs((d[i + 1] - d[i + 2]) - (base[i + 1] - base[i + 2]));
              const dl = Math.abs((d[i] + d[i + 1] + d[i + 2]) - (base[i] + base[i + 1] + base[i + 2])) / 3;
              m *= (dc < 22 ? 1 : dc > 50 ? 0 : (50 - dc) / 28) * (dl < 40 ? 1 : dl > 85 ? 0 : (85 - dl) / 45);
              if (ex && ex[i] / 255 > m) m = ex[i] / 255;
              if (m < 0.02) continue;
              d[i]     = Math.min(255, d[i]     + (d[i]     * kr - d[i])     * m);
              d[i + 1] = Math.min(255, d[i + 1] + (d[i + 1] * kg - d[i + 1]) * m);
              d[i + 2] = Math.min(255, d[i + 2] + (d[i + 2] * kb - d[i + 2]) * m);
            }
          }
        }
        ctx.putImageData(id, 0, 0);
      }
    } catch (e) {
      /* e.g. page opened from a file:// address — canvas pixels are blocked, show the untinted picture */
      console.warn('Portrait colouring unavailable:', e.message);
    }
    renderCache.set(key, cv);
    if (renderCache.size > 60) renderCache.delete(renderCache.keys().next().value);
    return cv;
  }

  /* ── simple silhouette avatar (no photo) ── */
  async function renderSimple(gender) {
    const col = (getComputedStyle(document.body).getPropertyValue('--accent') || '#8a8aa0').trim() || '#8a8aa0';
    const key = 'simple|' + gender + '|' + col;
    if (renderCache.has(key)) return renderCache.get(key);
    const img = await loadImg(`images/avatars/${gender}.webp`);
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = 800;
    const x = cv.getContext('2d');
    const t = document.createElement('canvas'); t.width = 560; t.height = 560;
    const tx = t.getContext('2d');
    tx.drawImage(img, 0, 0, 560, 560);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = col; tx.fillRect(0, 0, 560, 560);
    x.globalAlpha = 0.6; x.drawImage(t, 120, 60);
    renderCache.set(key, cv);
    return cv;
  }

  /* ── small static portrait for a character card (head & shoulders) ── */
  async function mount(canvas, look, w = 400, h = 340) {
    try {
      const src = await render(look);
      const sx = 0, sw = src.width;            /* full width: no zoom, so edges stay soft */
      const sh = Math.min(src.height, sw * (h / w));
      canvas.width = w * 2; canvas.height = h * 2;
      const x = canvas.getContext('2d');
      x.clearRect(0, 0, canvas.width, canvas.height);
      x.drawImage(src, sx, 0, sw, sh, 0, 0, canvas.width, canvas.height);
      canvas.classList.add('ready');
    } catch (e) { /* leave the placeholder */ }
  }

  /* ── big live preview with a soft cross-fade ── */
  const stage = { token: 0, shown: false };
  async function show(box, look) {
    const [under, top] = box.querySelectorAll('canvas');
    const token = ++stage.token;
    let src;
    try { src = await render(look); } catch (e) { return; }
    if (token !== stage.token) return;
    const paint = (c, s) => { c.width = s.width; c.height = s.height; c.getContext('2d').drawImage(s, 0, 0); };
    if (!stage.shown) {
      paint(under, src); top.style.opacity = 0; stage.shown = true;
      return;
    }
    paint(top, src);
    top.style.transition = 'none'; top.style.opacity = 0;
    void top.offsetWidth;
    top.style.transition = 'opacity .35s ease'; top.style.opacity = 1;
    setTimeout(() => {
      if (token !== stage.token) return;
      paint(under, src);
      top.style.transition = 'none'; top.style.opacity = 0;
    }, 380);
  }
  function resetStage() { stage.token++; stage.shown = false; }

  return { STYLES, HAIR, EYES, SKIN, swatchColor, hairstyles, clothesCount, render, mount, show, resetStage };
})();

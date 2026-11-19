/* ═══════════════════════════════════════════
   photos.js — "Choose your own image" for character & place cards
   The picture is cropped to a 4:3 frame, shrunk to 800×600 and stored
   in the project (state.customImages[id]) so it travels with backups.
   ═══════════════════════════════════════════ */

const Photos = (() => {
  const MAX_BYTES = 10 * 1024 * 1024;           // size of the file picked
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const OUT_W = 800, OUT_H = 600;               // 4:3
  const STAGE_W = 320, STAGE_H = 240;           // on-screen crop frame

  let input = null, job = null;                 // job = { id, kind, img, scale, min, x, y }

  const imgs = () => { const s = Storage.get(); return s.customImages || (s.customImages = {}); };
  const url = id => (Storage.get().customImages || {})[id] || null;

  /* The hover overlay placed inside a card's picture area */
  function overlay(kind, id) {
    const has = !!url(id);
    return `<div class="pic-over">
      <button type="button" class="btn btn-sm" onclick="event.stopPropagation();Photos.pick('${kind}','${id}')">Choose your own image</button>
    </div>`;
  }

  function pick(kind, id, cb) {
    if (!input) {
      input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.hidden = true;
      document.body.appendChild(input);
    }
    input.value = '';
    input.onchange = () => { const f = input.files && input.files[0]; if (f) load(kind, id, f, cb); };
    input.click();
  }

  function load(kind, id, file, cb) {
    if (!TYPES.includes(file.type)) { Toast.show('Please choose a JPG, PNG or WebP picture.', 'error'); return; }
    if (file.size > MAX_BYTES) { Toast.show('That picture is over 10 MB — please choose a smaller one.', 'error'); return; }
    const u = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(u); openCrop(kind, id, img, cb); };
    img.onerror = () => { URL.revokeObjectURL(u); Toast.show('Could not read that picture.', 'error'); };
    img.src = u;
  }

  /* ── Crop dialog: drag to position, slider to zoom ── */
  function clamp() {
    const w = job.img.width * job.scale, h = job.img.height * job.scale;
    job.x = Math.min(0, Math.max(STAGE_W - w, job.x));
    job.y = Math.min(0, Math.max(STAGE_H - h, job.y));
  }
  function paint() {
    clamp();
    const el = document.getElementById('photo-stage-img');
    el.style.width = job.img.width * job.scale + 'px';
    el.style.height = job.img.height * job.scale + 'px';
    el.style.transform = `translate(${job.x}px,${job.y}px)`;
  }
  function openCrop(kind, id, img, cb) {
    const min = Math.max(STAGE_W / img.width, STAGE_H / img.height);
    job = { kind, id, img, cb, min, scale: min, x: 0, y: 0 };
    job.x = (STAGE_W - img.width * min) / 2; job.y = (STAGE_H - img.height * min) / 2;
    const el = document.getElementById('photo-stage-img');
    el.src = img.src.startsWith('blob:') ? '' : img.src;      // set below from a data copy
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0); el.src = c.toDataURL('image/jpeg', 0.92);
    const z = document.getElementById('photo-zoom'); z.value = 0;
    paint();
    openModal_('photo');
  }
  function zoom(v) {
    if (!job) return;
    const old = job.scale; job.scale = job.min * (1 + (+v) * 2);          // up to 3×
    const cx = STAGE_W / 2, cy = STAGE_H / 2, r = job.scale / old;         // zoom around the centre
    job.x = cx - (cx - job.x) * r; job.y = cy - (cy - job.y) * r;
    paint();
  }
  function bindStage() {
    const st = document.getElementById('photo-stage'); if (!st || st._bound) return; st._bound = true;
    let drag = null;
    st.addEventListener('pointerdown', e => { if (!job) return; drag = { px: e.clientX, py: e.clientY, x: job.x, y: job.y }; st.setPointerCapture(e.pointerId); });
    st.addEventListener('pointermove', e => { if (!drag) return; job.x = drag.x + e.clientX - drag.px; job.y = drag.y + e.clientY - drag.py; paint(); });
    ['pointerup', 'pointercancel'].forEach(t => st.addEventListener(t, () => { drag = null; }));
  }

  function apply() {
    if (!job) return;
    const k = OUT_W / STAGE_W;                                   // stage → output scale
    const c = document.createElement('canvas'); c.width = OUT_W; c.height = OUT_H;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(job.img, job.x * k, job.y * k, job.img.width * job.scale * k, job.img.height * job.scale * k);
    let data = c.toDataURL('image/webp', 0.82);
    if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/jpeg', 0.85);   // older browsers
    const { kind, id, cb } = job; job = null;
    if (cb) { closeModal('photo'); cb(data); return; }      // used by the character form: it saves the picture with the character
    imgs()[id] = data;
    Storage.save(Storage.get());
    closeModal('photo');
    refresh(kind);
    App.markUnsaved();
    Toast.show('Picture saved.', 'success');
  }
  function cancel() { job = null; closeModal('photo'); }

  function reset(kind, id) {
    delete imgs()[id];
    Storage.save(Storage.get());
    refresh(kind);
    App.markUnsaved();
  }

  /* Called when a card is deleted */
  function drop(id) { const m = Storage.get().customImages; if (m && m[id]) delete m[id]; }

  function refresh(kind) { (kind === 'place' ? Places : Characters).render(); }

  document.addEventListener('DOMContentLoaded', bindStage);

  return { overlay, url, pick, zoom, apply, cancel, reset, drop };
})();

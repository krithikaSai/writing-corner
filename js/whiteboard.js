/* ═══════════════════════════════════════════
   whiteboard.js — Canvas drawing whiteboard
   Tools: pen, eraser + shapes (line, arrow, rectangle, circle, diamond, triangle, star)
   Pen & eraser thickness (circles), Shapes and Color are dropdown menus
   ═══════════════════════════════════════════ */

const Whiteboard = (() => {
  let canvas, ctx;
  let tool = 'pen';
  let color = '#cc1a1a';
  let size = 3;            // pen thickness
  let eraserSize = 20;     // eraser thickness
  let drawing = false;
  let startX, startY;
  let snapshot; // for shape preview
  let history = [];
  let inited = false;

  const PEN_SIZES = [2, 3, 5, 8, 12, 18, 26];
  const ERASER_SIZES = [8, 14, 22, 32, 46];
  const SHAPES = ['line','arrow','rect','circle','diamond','triangle','star'];
  const SHAPE_ICONS = {
    line:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L19 5"/></svg>', arrow:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19L19 5M10 5h9v9"/></svg>',
    rect:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="14" height="14" rx="2"/><g fill="currentColor" stroke="none"><circle cx="5" cy="5" r="1.9"/><circle cx="19" cy="5" r="1.9"/><circle cx="5" cy="19" r="1.9"/><circle cx="19" cy="19" r="1.9"/></g></svg>',
    circle:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>', diamond:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 9-9 9-9-9z"/></svg>',
    triangle:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/></svg>', star:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z"/></svg>'
  };

  const PALETTE = [
    '#cc1a1a','#c9a96e','#9b6bae','#4db8d8','#6ab880',
    '#e8709a','#e0a020','#e8e0d5','#ffffff','#333333'
  ];

  function init() {
    if (inited) return;
    inited = true;
    document.getElementById('wb-shape-icon').innerHTML = SHAPE_ICONS.rect;

    canvas = document.getElementById('wb-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();

    // Build menus
    document.getElementById('wb-colors').innerHTML = PALETTE.map(c =>
      `<div class="wb-color-dot${c===color?' active':''}" data-color="${c}" style="background:${c}" onclick="Whiteboard.setColor('${c}')" title="${c}"></div>`
    ).join('');
    buildDotMenu('pen', PEN_SIZES, () => size, 'Whiteboard.setSize');
    buildDotMenu('eraser', ERASER_SIZES, () => eraserSize, 'Whiteboard.setEraserSize');
    updateDotPreviews();
    updateColorChip();
    document.addEventListener('click', e => { if (!e.target.closest('.wb-dd')) closeMenus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
    window.addEventListener('resize', closeMenus);

    // Events
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);

    // Touch
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(touchToMouse(e)); }, { passive: false });
    canvas.addEventListener('touchmove', e => { e.preventDefault(); onMove(touchToMouse(e)); }, { passive: false });
    canvas.addEventListener('touchend', e => { e.preventDefault(); onUp(); }, { passive: false });

    window.addEventListener('resize', resizeCanvas);

    // Load saved
    const state = Storage.get();
    if (state.whiteboard) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = state.whiteboard;
    }
  }

  /* ── Re-draw from the active project (used when switching projects) ── */
  function reload() {
    if (!inited) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history = [];
    const wb = Storage.get().whiteboard;
    if (wb) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = wb;
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    const wrapper = canvas.parentElement;
    const toolbarH = wrapper.querySelector('.wb-toolbar')?.offsetHeight || 48;
    const w = wrapper.clientWidth;
    const h = Math.max(400, window.innerHeight - 260);
    // Save current drawing
    const dataURL = canvas.width > 0 ? canvas.toDataURL() : null;
    canvas.width = w;
    canvas.height = h;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dataURL) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = dataURL;
    }
  }

  function touchToMouse(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches[0] || e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY, offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top };
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.offsetX !== undefined ? e.offsetX : e.clientX - rect.left),
      y: (e.offsetY !== undefined ? e.offsetY : e.clientY - rect.top)
    };
  }

  function onDown(e) {
    drawing = true;
    const pos = getPos(e);
    startX = pos.x; startY = pos.y;
    snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
    }
  }

  function onMove(e) {
    if (!drawing) return;
    const pos = getPos(e);

    if (tool === 'pen') {
      ctx.lineWidth = size;
      ctx.strokeStyle = color;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }
    if (tool === 'eraser') {
      ctx.lineWidth = eraserSize;
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }

    // For shapes — restore snapshot then draw preview
    ctx.putImageData(snapshot, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color + '33'; // transparent fill
    ctx.lineWidth = size;
    ctx.beginPath();

    if (tool === 'line') {
      ctx.moveTo(startX, startY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.rect(startX, startY, pos.x - startX, pos.y - startY);
      ctx.stroke(); ctx.fill();
    } else if (tool === 'circle') {
      const rx = Math.abs(pos.x - startX) / 2;
      const ry = Math.abs(pos.y - startY) / 2;
      const cx = startX + (pos.x - startX) / 2;
      const cy = startY + (pos.y - startY) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke(); ctx.fill();
    } else if (tool === 'arrow') {
      drawArrow(startX, startY, pos.x, pos.y);
    } else if (tool === 'diamond' || tool === 'triangle' || tool === 'star') {
      polygon(tool, startX, startY, pos.x, pos.y);
      ctx.stroke(); ctx.fill();
    }
  }

  // Build the outline of a polygon shape inside the dragged box
  function polygon(kind, x1, y1, x2, y2) {
    const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
    const cx = (l + r) / 2, cy = (t + b) / 2;
    let pts = [];
    if (kind === 'diamond') pts = [[cx, t], [r, cy], [cx, b], [l, cy]];
    else if (kind === 'triangle') pts = [[cx, t], [r, b], [l, b]];
    else {                                   // 5-point star
      const R = Math.min(r - l, b - t) / 2, inner = R * 0.4;
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? R : inner, a = -Math.PI / 2 + i * Math.PI / 5;
        pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
      }
    }
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
  }

  function onUp() {
    if (!drawing) return;
    drawing = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    pushHistory();
    saveWhiteboard();
  }

  function drawArrow(x1, y1, x2, y2) {
    const headlen = 14;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 7), y2 - headlen * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 7), y2 - headlen * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ── Tool / shape / colour / size ── */
  function setTool(t) {
    tool = t;
    const isShape = SHAPES.includes(t);
    document.querySelectorAll('#wb-toolbar .wb-split').forEach(g => g.classList.toggle('active', g.dataset.tool === t));
    document.getElementById('wbt-shapes')?.classList.toggle('active', isShape);
    document.querySelectorAll('#wb-menu-shapes .wb-menu-item').forEach(i => i.classList.toggle('active', isShape && i.dataset.shape === t));
    if (canvas) canvas.style.cursor = t === 'eraser' ? 'cell' : 'crosshair';
    closeMenus();
  }

  function setShape(name) {
    document.getElementById('wb-shape-icon').innerHTML = SHAPE_ICONS[name] || SHAPE_ICONS.rect;
    setTool(name);
  }

  function updateColorChip() {
    const chip = document.getElementById('wb-color-chip');
    if (chip) chip.style.background = color;
    document.querySelectorAll('#wb-colors .wb-color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === color));
    const custom = document.getElementById('wb-custom');
    if (custom && /^#[0-9a-f]{6}$/i.test(color)) custom.value = color;
  }

  function setColor(c) {
    color = c;
    updateColorChip();
    if (PALETTE.includes(c)) closeMenus();          // picking from the grid closes the menu
  }

  /* ── Thickness menus: a row of circles, no text ── */
  function buildDotMenu(name, sizes, current, handler) {
    document.getElementById('wb-menu-' + name).innerHTML = sizes.map(n =>
      `<button type="button" class="wb-dot-opt${n === current() ? ' active' : ''}" data-size="${n}" onclick="${handler}(${n})" aria-label="Thickness ${n}">` +
      `<span class="wb-dot" style="width:${n}px;height:${n}px"></span></button>`).join('');
  }
  function updateDotPreviews() {
    const dot = (id, n) => { const el = document.getElementById(id); if (el) { const d = Math.max(4, Math.min(n, 13)); el.style.width = el.style.height = d + 'px'; } };
    dot('wb-pen-preview', size); dot('wb-eraser-preview', Math.round(eraserSize / 2.2));
    document.querySelectorAll('#wb-menu-pen .wb-dot-opt').forEach(b => b.classList.toggle('active', parseInt(b.dataset.size) === size));
    document.querySelectorAll('#wb-menu-eraser .wb-dot-opt').forEach(b => b.classList.toggle('active', parseInt(b.dataset.size) === eraserSize));
  }
  function setSize(v) { size = parseInt(v); setTool('pen'); updateDotPreviews(); }
  function setEraserSize(v) { eraserSize = parseInt(v); setTool('eraser'); updateDotPreviews(); }

  /* ── Dropdown menus ── */
  function closeMenus() { document.querySelectorAll('.wb-menu.open').forEach(m => m.classList.remove('open')); }

  function toggleMenu(name, btn) {
    const menu = document.getElementById('wb-menu-' + name);
    const wasOpen = menu.classList.contains('open');
    closeMenus();
    if (wasOpen) return;
    menu.classList.add('open');
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  }

  function undo() {
    if (history.length === 0) return;
    history.pop();
    if (history.length > 0) {
      ctx.putImageData(history[history.length - 1], 0, 0);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    saveWhiteboard();
  }

  function clear() {
    if (!confirm('Clear the whiteboard?')) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history = [];
    saveWhiteboard();
  }

  function download() {
    const a = document.createElement('a');
    a.download = 'whiteboard.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  function pushHistory() {
    if (history.length > 40) history.shift();
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  function saveWhiteboard() {
    const state = Storage.get();
    state.whiteboard = canvas.toDataURL('image/png');
    Storage.save(state);
    App.markUnsaved();
  }

  return { init, reload, setTool, setShape, setColor, setSize, setEraserSize, toggleMenu, undo, clear, download };
})();

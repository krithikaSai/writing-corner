/* ═══════════════════════════════════════════
   sparkle.js — shimmering white dust that follows the mouse
   Only in the Midnight vibe, and only on the Characters and Places tabs.
   ═══════════════════════════════════════════ */

(() => {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'sparkle-canvas';
  const ctx = canvas.getContext('2d');
  let dots = [], raf = 0, last = { x: -1, y: -1 }, dpr = 1;

  function fit() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const active = () =>
    document.body.classList.contains('theme-midnight') &&
    !!document.querySelector('#panel-characters.active, #panel-places.active');

  function star(x, y, r) {            // a 4-point twinkle
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  }

  function spawn(x, y) {
    for (let i = 0; i < 2; i++) {
      dots.push({
        x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 0.7, vy: Math.random() * 0.6 + 0.15,
        r: Math.random() * 2.6 + 1.1, life: 1, decay: Math.random() * 0.018 + 0.016,
        tw: Math.random() * 6, star: Math.random() < 0.45
      });
    }
    if (dots.length > 160) dots.splice(0, dots.length - 160);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    dots = dots.filter(d => d.life > 0);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy; d.vy += 0.012; d.life -= d.decay; d.tw += 0.35;
      const a = Math.max(0, d.life) * (0.65 + 0.35 * Math.sin(d.tw));
      ctx.shadowColor = 'rgba(190,225,255,' + a + ')'; ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
      if (d.star) star(d.x, d.y, d.r * 1.9);
      else { ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 0.6, 0, 6.3); ctx.fill(); }
    }
    raf = dots.length ? requestAnimationFrame(tick) : 0;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  document.addEventListener('mousemove', e => {
    if (!active()) return;
    if (!canvas.isConnected) { document.body.appendChild(canvas); fit(); }
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 9) return;
    last = { x: e.clientX, y: e.clientY };
    spawn(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener('resize', () => { if (canvas.isConnected) fit(); });
})();

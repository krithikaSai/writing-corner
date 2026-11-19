/* ═══════════════════════════════════════════
   multipick.js — "pick from what you've already created"

   Adds a small ▾ button inside a text field. It opens a checklist of the
   project's existing Places or Characters; ticking several fills the field
   with comma-separated names. The user can still just type anything.
   ═══════════════════════════════════════════ */

const MultiPick = (() => {
  let menu = null, current = null;

  const tokens = v => (v || '').split(',').map(s => s.trim()).filter(Boolean);
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();

  function names(kind) {
    const s = Storage.get();
    return (kind === 'places' ? s.places : s.characters).map(x => x.name).filter(Boolean);
  }

  function attach(input, kind) {
    if (!input || input.dataset.pick) return;
    input.dataset.pick = kind;
    const wrap = document.createElement('div');
    wrap.className = 'pick-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick-btn';
    btn.textContent = '▾';
    btn.title = kind === 'places' ? 'Choose from your places' : 'Choose from your characters';
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', e => { e.stopPropagation(); toggle(input, kind, btn); });
    wrap.appendChild(btn);
  }

  function close() { if (menu) { menu.remove(); menu = null; current = null; } }

  function toggle(input, kind, btn) {
    if (menu && current === input) return close();
    close();
    current = input;
    menu = document.createElement('div');
    menu.className = 'pick-menu';
    render(input, kind);
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    const w = Math.max(220, r.width);
    menu.style.minWidth = w + 'px';
    menu.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    const below = window.innerHeight - r.bottom;
    if (below < 240 && r.top > below) { menu.style.bottom = (window.innerHeight - r.top + 6) + 'px'; }
    else menu.style.top = (r.bottom + 6) + 'px';
  }

  function render(input, kind) {
    const list = names(kind);
    const have = tokens(input.value);
    if (!list.length) {
      menu.innerHTML = `<div class="pick-empty">No ${kind} yet. Add some in the ${kind === 'places' ? 'Places' : 'Characters'} section, or just type here.</div>`;
      return;
    }
    menu.innerHTML = list.map((n, i) =>
      `<label class="pick-item"><input type="checkbox" data-i="${i}" ${have.some(h => same(h, n)) ? 'checked' : ''}><span>${escHtml(n)}</span></label>`
    ).join('');
    menu.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const name = list[+cb.dataset.i];
        let t = tokens(input.value).filter(x => !same(x, name));
        if (cb.checked) t.push(name);
        input.value = t.join(', ');
        input.dispatchEvent(new Event('input', { bubbles: true }));   // keeps autosave handlers working
      });
    });
  }

  function init() {
    attach(document.getElementById('chf-chars'), 'characters');
    attach(document.getElementById('chf-setting'), 'places');
    attach(document.getElementById('ch-chars-present'), 'characters');
    attach(document.getElementById('ch-setting'), 'places');
    document.addEventListener('click', e => { if (menu && !menu.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
  }

  return { init, attach, close };
})();

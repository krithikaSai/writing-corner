/* ═══════════════════════════════════════════
   brainstorm.js — Stickies + tab management (Sticky Notes & Whiteboard)
   ═══════════════════════════════════════════ */

const Brainstorm = (() => {

  /* ── Switch tabs ── */
  function switchTab(id, el) {
    document.querySelectorAll('.brainstorm-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.brainstorm-pane').forEach(p => p.classList.remove('active'));
    if (el) el.classList.add('active');
    const pane = document.getElementById('pane-' + id);
    if (pane) pane.classList.add('active');

    // Init whiteboard when first shown
    if (id === 'whiteboard') Whiteboard.init();
  }

  /* ── Add sticky ── */
  function addSticky(color, text = '') {
    const container = document.getElementById('sticky-container');
    const div = document.createElement('div');
    div.className = `sticky sticky-${color}`;
    div.dataset.color = color;
    div.innerHTML = `<button class="sticky-close" onclick="this.parentElement.remove();Brainstorm.saveStickies()">✕</button>
<textarea class="sticky-input" placeholder="Note...">${escHtml(text)}</textarea>`;
    div.querySelector('textarea').addEventListener('input', () => { saveStickies(); App.markUnsaved(); Sound.playKey(); });
    container.appendChild(div);
    if (!text) div.querySelector('textarea').focus();
    saveStickies();
    App.markUnsaved();
  }

  /* ── Save stickies to state ── */
  function saveStickies() {
    const state = Storage.get();
    state.stickies = [];
    document.querySelectorAll('#sticky-container .sticky').forEach(s => {
      state.stickies.push({
        color: s.dataset.color || 'yellow',
        text: s.querySelector('.sticky-input')?.value || ''
      });
    });
    Storage.save(state);
  }

  /* ── Render stickies from state ── */
  function renderStickies() {
    const state = Storage.get();
    const container = document.getElementById('sticky-container');
    if (!container) return;
    container.innerHTML = '';
    (state.stickies || []).forEach(s => addSticky(s.color, s.text));
  }

  return { switchTab, addSticky, saveStickies, renderStickies };
})();

/* Global alias used by HTML onclick */
function switchBrainstormTab(id, el) { Brainstorm.switchTab(id, el); }

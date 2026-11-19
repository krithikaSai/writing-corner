/* ═══════════════════════════════════════════
   app.js — Main application controller
   Wires all modules together, handles nav,
   save/load lifecycle, and global helpers.
   ═══════════════════════════════════════════ */

/* ── Global helpers (used across modules) ── */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function countWords(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  const t = (d.textContent || d.innerText || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function openModal_(id) {
  document.getElementById('modal-' + id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById('modal-' + id)?.classList.remove('open');
}
// Close on backdrop click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');

  // Activate correct nav button
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${id}'`)) b.classList.add('active');
  });

  if (id === 'overview') Calendar.render();
}

function Toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(Toast._timer);
  Toast._timer = setTimeout(() => el.classList.remove('show'), 3000);
}
Toast.show = Toast;

/* ══════════════════════════════════════════
   APP — main controller
══════════════════════════════════════════ */
const App = (() => {
  let _unsaved = false;
  let _activityLog = [];

  /* ── Boot ── */
  async function boot() {
    await Storage.init();
    applyState();
    Ambience.init();
    MultiPick.init();
    Drive.init();
    Backup.init();
    // Wire save on beforeunload
    window.addEventListener('beforeunload', e => {
      Writing.saveDraft?.();
      if (_unsaved) {
        const msg = "You have unsaved changes. Save before leaving?";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
      }
    });
    // Auto-save every 90 seconds
    setInterval(() => { if (_unsaved) save(); }, 90000);
  }

  /* ── Apply full state to DOM ── */
  function applyState() {
    const state = Storage.get();

    // Theme (global preference, not per project)
    { const t = Storage.prefs().theme; document.body.className = 'theme-' + (t === 'gothic' ? 'enchanted' : (t || 'light')); }

    // Project info
    document.getElementById('ov-project-title').textContent = state.project?.title || 'My Novel';
    const sub = [state.project?.subtitle, state.project?.genre].filter(Boolean).join(' · ');
    document.getElementById('ov-project-sub').textContent = sub || 'Your creative sanctuary';

    // Overview text areas
    const synopsis = document.getElementById('project-synopsis');
    if (synopsis) synopsis.value = state.synopsis || '';
    const tags = document.getElementById('project-tags');
    if (tags) tags.value = state.tags || '';

    // Brainstorm
    Brainstorm.renderStickies();
    Whiteboard.reload();
    Projects.refreshChip();

    // Render all lists
    Characters.render();
    Places.render();
    Chapters.render();
    Writing.rebuildSelect();

    // Stats + calendar
    Calendar.reset();
    updateStats();
    Calendar.render();

    markSaved();
  }

  /* ── Copy anything typed on screen into state (no storage write) ── */
  function captureFields() {
    const state = Storage.get();

    // Capture live fields
    state.synopsis   = document.getElementById('project-synopsis')?.value || '';
    state.tags       = document.getElementById('project-tags')?.value || '';

    // Stickies
    state.stickies = [];
    document.querySelectorAll('#sticky-container .sticky').forEach(s => {
      state.stickies.push({
        color: s.dataset.color || 'yellow',
        text: s.querySelector('.sticky-input')?.value || ''
      });
    });

    // Current chapter draft
    Writing.saveDraft?.();
    return state;
  }

  /* ── Save everything ── */
  function save() {
    const state = captureFields();
    Storage.save(state);
    markSaved();
    updateStats();

    Toast.show('Saved ✓', 'success');
    logActivity('Saved project');
    shineSave();
  }

  /* A brief gold shine across the Save button (Light & Dark themes) */
  function shineSave() {
    const b = document.querySelector('.topbar-actions .btn-accent'); if (!b) return;
    b.classList.remove('shine'); void b.offsetWidth; b.classList.add('shine');
    setTimeout(() => b.classList.remove('shine'), 1000);
  }

  /* ── Multiple projects ── */
  function leaveProject() {
    captureFields();
    Storage.save(Storage.get());
    Writing.selectChapter(null);          // clears the editor (and saves the open draft first)
  }
  function afterSwitch() {
    applyState();
    showPanel('overview');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick')?.includes("'overview'")));
  }
  function openProject(id) {
    if (Storage.listProjects().find(p => p.id === id)?.active) return;
    leaveProject();
    Storage.switchProject(id);
    afterSwitch();
    Toast.show(`Opened “${Storage.get().project.title}”`, 'success');
  }
  function newProject(title) {
    leaveProject();
    Storage.createProject(title);
    Storage.save(Storage.get());
    afterSwitch();
    Toast.show('New project created ✓', 'success');
  }
  function removeProject(id) {
    const wasActive = Storage.listProjects().find(p => p.id === id)?.active;
    if (wasActive) Writing.selectChapter(null);
    Storage.deleteProject(id);
    if (wasActive) afterSwitch(); else updateStats();
    Toast.show('Project deleted');
  }

  /* ── Project Settings modal ── */
  function openProjectModal() {
    const state = Storage.get();
    document.getElementById('ps-title').value    = state.project?.title    || '';
    document.getElementById('ps-subtitle').value = state.project?.subtitle || '';
    document.getElementById('ps-author').value   = state.project?.author   || '';
    document.getElementById('ps-genre').value    = state.project?.genre    || '';
    openModal_('project');
  }

  function saveProjectSettings() {
    const state = Storage.get();
    state.project = {
      title:    document.getElementById('ps-title').value.trim()    || 'My Novel',
      subtitle: document.getElementById('ps-subtitle').value.trim(),
      author:   document.getElementById('ps-author').value.trim(),
      genre:    document.getElementById('ps-genre').value.trim(),
    };
    Storage.save(state);
    closeModal('project');

    document.getElementById('ov-project-title').textContent = state.project.title;
    const sub = [state.project.subtitle, state.project.genre].filter(Boolean).join(' · ');
    document.getElementById('ov-project-sub').textContent = sub || 'Your creative sanctuary';

    Projects.refreshChip();
    markUnsaved();
    Toast.show('Project settings saved!', 'success');
  }

  /* ── Stats ── */
  function updateStats() {
    const state = Storage.get();
    const totalWords = (state.chapters || []).reduce((sum, ch) => sum + countWords(ch.draft || ''), 0);

    const sw = document.getElementById('stat-words');
    const sc = document.getElementById('stat-chapters');
    const schar = document.getElementById('stat-chars');
    const sp = document.getElementById('stat-places');

    if (sw) sw.textContent = totalWords.toLocaleString();
    if (sc) sc.textContent = (state.chapters || []).length;
    if (schar) schar.textContent = (state.characters || []).length;
    if (sp) sp.textContent = (state.places || []).length;

    document.getElementById('nav-char-count').textContent  = (state.characters || []).length;
    document.getElementById('nav-place-count').textContent = (state.places || []).length;
    document.getElementById('nav-ch-count').textContent    = (state.chapters || []).length;

  }

  /* ── Unsaved indicator ── */
  function markUnsaved() {
    _unsaved = true;
    document.getElementById('unsaved-dot')?.classList.add('visible');
  }
  function markSaved() {
    _unsaved = false;
    document.getElementById('unsaved-dot')?.classList.remove('visible');
  }

  /* ── Activity log (for future overview feed) ── */
  function logActivity(msg) {
    _activityLog.unshift({ msg, time: new Date().toLocaleTimeString() });
    if (_activityLog.length > 20) _activityLog.pop();
  }

  /* ── Writing module bridge (avoid circular refs) ── */
  Writing.saveDraft = function() {
    if (!Writing._currentChapterId) return;
    const state = Storage.get();
    const ch = state.chapters.find(c => c.id === Writing._currentChapterId);
    if (!ch) return;
    const draftEl = document.getElementById('chapter-draft');
    if (draftEl) {
      const before = countWords(ch.draft || '');
      ch.draft = draftEl.innerHTML;
      Calendar.addWords(state, countWords(ch.draft) - before);
    }
    Storage.save(state);
  };

  return {
    boot, applyState, save, openProject, newProject, removeProject,
    openProjectModal, saveProjectSettings,
    updateStats,
    markUnsaved, markSaved, logActivity
  };
})();

/* ── Patch Writing module to track current chapter ── */
const _origSelect = Writing.selectChapter;
Writing.selectChapter = function(id) {
  Writing._currentChapterId = id || null;
  _origSelect.call(Writing, id);
};
Writing._currentChapterId = null;

/* ── Wire openModal for project button ── */
document.addEventListener('DOMContentLoaded', () => {
  // Project settings button
  const projBtn = document.querySelector('[onclick="openModal(\'project\')"]');
  if (projBtn) projBtn.setAttribute('onclick', 'App.openProjectModal()');

  App.boot();
});

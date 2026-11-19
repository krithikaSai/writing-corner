/* ═══════════════════════════════════════════
   projects.js — switch / create / delete novels
   ═══════════════════════════════════════════ */

const Projects = (() => {
  const $ = id => document.getElementById(id);

  function ago(iso) {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  function refreshChip() {
    const el = $('project-chip-name');
    if (el) el.textContent = Storage.get().project?.title || 'My Novel';
  }

  function render() {
    const list = Storage.listProjects();
    $('projects-list').innerHTML = list.map(p => `
      <div class="project-row${p.active ? ' active' : ''}" data-id="${p.id}" onclick="Projects.openProject('${p.id}')" title="${p.active ? 'Currently open' : 'Click to open'}">
        <div class="project-row-main">
          <div class="project-row-title">${escHtml(p.title)}</div>
          <div class="project-row-meta">${p.words.toLocaleString()} words · ${p.chapters} chapter${p.chapters === 1 ? '' : 's'}${p.updatedAt ? ' · edited ' + ago(p.updatedAt) : ''}</div>
        </div>
        <div class="project-row-actions">
          <button class="btn btn-sm" title="Rename" onclick="event.stopPropagation();Projects.rename('${p.id}')">✎</button>
          <button class="btn btn-sm btn-danger" title="Delete" onclick="event.stopPropagation();Projects.remove('${p.id}')">🗑</button>
        </div>
      </div>`).join('');
  }

  function open() { render(); openModal_('projects'); }

  function openProject(id) {
    const wasActive = Storage.listProjects().find(p => p.id === id)?.active;
    if (!wasActive) App.openProject(id);
    closeModal('projects');
  }

  /* Inline rename: the title turns into a text box (Enter = save, Esc = cancel) */
  function rename(id) {
    const row = document.querySelector(`.project-row[data-id="${id}"]`);
    if (!row) return;
    const titleEl = row.querySelector('.project-row-title');
    const current = Storage.listProjects().find(p => p.id === id)?.title || '';
    titleEl.innerHTML = '<input class="form-input project-rename-input" maxlength="80">';
    const inp = titleEl.querySelector('input');
    inp.value = current;
    inp.addEventListener('click', e => e.stopPropagation());
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      if (save && inp.value.trim() && inp.value.trim() !== current) {
        Storage.renameProject(id, inp.value);
        refreshChip();
        const t = document.getElementById('ov-project-title');
        if (t && Storage.listProjects().find(p => p.id === id)?.active) t.textContent = inp.value.trim();
        Toast.show('Renamed ✓', 'success');
      }
      render();
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
    inp.focus(); inp.select();
  }

  function create() {
    const input = $('project-new-title');
    if (!input.value.trim()) {
      Toast.show('Give your project a name first!', 'error');
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
      input.focus();
      return;
    }
    App.newProject(input.value);
    input.value = '';
    closeModal('projects');
  }

  function remove(id) {
    const p = Storage.listProjects().find(x => x.id === id);
    if (!p) return;
    const only = Storage.listProjects().length === 1;
    const msg = `Delete “${p.title}” and everything in it?\n\nThis cannot be undone` +
      (only ? ' (you\'ll be left with a fresh, empty project).' : '.') +
      '\nTip: download a backup first from ☁ Backup & Sync.';
    if (!confirm(msg)) return;
    App.removeProject(id);
    render();
  }

  return { open, render, refreshChip, openProject, rename, create, remove };
})();

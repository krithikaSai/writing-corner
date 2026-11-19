/* ═══════════════════════════════════════════
   chapters.js — Chapter CRUD + list rendering
   ═══════════════════════════════════════════ */

const Chapters = (() => {

  const STATUS_CYCLE = ['draft','complete'];
  const STATUS_LABEL = { outline:'In progress', draft:'In progress', complete:'Complete' };

  /* "Chapter I: The Letter" — clean label used in dropdowns */
  function label(ch) {
    const n = String(ch.num || '').trim();
    const numeric = /^(\d+|[IVXLCDM]+)$/i.test(n);
    const prefix = numeric ? `Chapter ${n}` : n;
    if (ch.title) return prefix ? `${prefix}: ${ch.title}` : ch.title;
    return prefix || 'Untitled chapter';
  }

  /* Create a chapter from just a name (used when there are none yet) */
  function quickCreate(name, openInWriter) {
    name = (name || '').trim();
    if (!name) { Toast.show('Type a name for the chapter first.', 'error'); return; }
    const state = Storage.get();
    const ch = {
      id: Storage.uid(), num: toRoman(state.chapters.length + 1), title: name, status: 'draft',
      summary: '', charsPresent: '', setting: '', draft: '', notes: '', plan: '', createdAt: Date.now()
    };
    state.chapters.push(ch);
    Storage.save(state);
    render();
    Writing.rebuildSelect();
    App.updateStats();
    App.markUnsaved();
    if (openInWriter) {
      const inp = document.getElementById('writing-ch-create-input'); if (inp) inp.value = '';
      Writing.goTo(ch.id);
    }
    Toast.show('Chapter created ✓', 'success');
  }

  function openModal(id = null) {
    const state = Storage.get();
    const isEdit = !!id;

    document.getElementById('ch-modal-title').textContent = isEdit ? 'Edit Chapter' : 'New Chapter';
    document.getElementById('ch-delete-btn').style.display = isEdit ? 'block' : 'none';
    document.getElementById('chf-editing-id').value = id || '';

    if (isEdit) {
      const ch = state.chapters.find(c => c.id === id);
      if (!ch) return;
      document.getElementById('chf-num').value = ch.num || '';
      document.getElementById('chf-title').value = ch.title || '';
      document.getElementById('chf-status').value = ch.status === 'complete' ? 'complete' : 'draft';
      document.getElementById('chf-summary').value = ch.summary || '';
      document.getElementById('chf-chars').value = ch.charsPresent || '';
      document.getElementById('chf-setting').value = ch.setting || '';
    } else {
      const nextNum = state.chapters.length + 1;
      document.getElementById('chf-num').value = toRoman(nextNum);
      document.getElementById('chf-title').value = '';
      document.getElementById('chf-status').value = 'draft';
      document.getElementById('chf-summary').value = '';
      document.getElementById('chf-chars').value = '';
      document.getElementById('chf-setting').value = '';
    }

    openModal_('chapter');
  }

  function save() {
    const state = Storage.get();
    const editId = document.getElementById('chf-editing-id').value;
    const isEdit = !!editId;
    const num = document.getElementById('chf-num').value.trim() || String(state.chapters.length + 1);

    const data = {
      id: isEdit ? editId : Storage.uid(),
      num,
      title: document.getElementById('chf-title').value.trim(),
      status: document.getElementById('chf-status').value,
      summary: document.getElementById('chf-summary').value.trim(),
      charsPresent: document.getElementById('chf-chars').value.trim(),
      setting: document.getElementById('chf-setting').value.trim(),
      draft: isEdit ? (state.chapters.find(c=>c.id===editId)?.draft || '') : '',
      notes: isEdit ? (state.chapters.find(c=>c.id===editId)?.notes || '') : '',
      plan:  isEdit ? (state.chapters.find(c=>c.id===editId)?.plan  || '') : '',
      createdAt: isEdit ? (state.chapters.find(c=>c.id===editId)?.createdAt || Date.now()) : Date.now()
    };

    if (isEdit) {
      const idx = state.chapters.findIndex(c => c.id === editId);
      if (idx !== -1) state.chapters[idx] = { ...state.chapters[idx], ...data };
    } else {
      state.chapters.push(data);
    }

    Storage.save(state);
    closeModal('chapter');
    render();
    Writing.rebuildSelect();
    App.updateStats();
    App.markUnsaved();
    Toast.show(`Chapter ${num} saved!`, 'success');
  }

  function del() {
    const id = document.getElementById('chf-editing-id').value;
    if (!id) return;
    const state = Storage.get();
    const ch = state.chapters.find(c => c.id === id);
    if (!confirm(`Delete chapter "${ch?.num} — ${ch?.title||'Untitled'}"?`)) return;
    state.chapters = state.chapters.filter(c => c.id !== id);
    Storage.save(state);
    closeModal('chapter');
    render();
    Writing.rebuildSelect();
    App.updateStats();
    App.markUnsaved();
    Toast.show('Chapter deleted.');
  }

  function cycleStatus(id) {
    const state = Storage.get();
    const ch = state.chapters.find(c => c.id === id);
    if (!ch) return;
    const cur = STATUS_CYCLE.indexOf(ch.status || 'outline');
    ch.status = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length];
    Storage.save(state);
    render();
    App.markUnsaved();
  }

  function render() {
    const state = Storage.get();
    const list = document.getElementById('chapter-list');
    if (!list) return;

    const wordCount = ch => countWords(ch.draft || '');

    const items = state.chapters.map(ch => {
      const wc = wordCount(ch).toLocaleString();
      const titleDisplay = ch.title ? `${ch.num} — ${ch.title}` : `Chapter ${ch.num}`;
      return `<div class="chapter-item" draggable="true" data-id="${ch.id}" title="Drag to reorder">
  <div class="chapter-num${ch.status === 'complete' ? ' done' : ''}">${escHtml(ch.num||'?')}</div>
  <div class="chapter-meta">
    <div class="chapter-title-text">${escHtml(ch.title || '(Untitled)')}</div>
    ${ch.summary ? `<div class="chapter-summary-text">${escHtml(ch.summary.slice(0,140))}${ch.summary.length>140?'…':''}</div>` : ''}
    <div class="chapter-stats">
      <span class="chapter-stat">Words: <span>${wc}</span></span>
    </div>
  </div>
  <div class="chapter-row-actions">
    <button class="btn btn-sm btn-pill" onclick="Chapters.openModal('${ch.id}')">Edit details</button>
    <button class="btn btn-sm btn-pill" onclick="Writing.goTo('${ch.id}')">Write</button>
  </div>
</div>`;
    });

    // Nothing yet → inline "create one" box; otherwise a dashed "add" row
    if (!state.chapters.length) {
      items.length = 0;
      items.push(`<div class="chapter-item ch-empty">
  <div class="ch-empty-text">No chapters in this story, create one</div>
  <div class="ch-quick-create" style="width:100%;max-width:520px;">
    <input id="chapters-create-input" class="form-input" placeholder="Type a chapter name, e.g. The Letter" onkeydown="if(event.key==='Enter')Chapters.quickCreate(this.value)">
    <button class="btn btn-accent btn-sm" onclick="Chapters.quickCreate(document.getElementById('chapters-create-input').value)">Create</button>
  </div>
</div>`);
    } else items.push(`<div class="chapter-item" style="border-style:dashed;opacity:0.6;cursor:pointer;" onclick="Chapters.openModal()">
  <div class="chapter-num" style="opacity:0.4">+</div>
  <div class="chapter-meta"><div class="chapter-title-text" style="color:var(--text3)">Add a chapter...</div></div>
</div>`);

    list.innerHTML = items.join('');
    document.getElementById('nav-ch-count').textContent = state.chapters.length;
    bindDrag(list);
  }

  /* ── Drag a chapter to a new position (chapters are renumbered to match) ── */
  let dragId = null;
  function bindDrag(list) {
    if (list._dragBound) return; list._dragBound = true;
    const rowOf = e => e.target.closest && e.target.closest('.chapter-item[data-id]');
    const clear = () => list.querySelectorAll('.drag-before,.drag-after,.dragging').forEach(r => r.classList.remove('drag-before', 'drag-after', 'dragging'));
    list.addEventListener('dragstart', e => {
      const r = rowOf(e); if (!r) return;
      dragId = r.dataset.id; r.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
    });
    list.addEventListener('dragover', e => {
      const r = rowOf(e); if (!r || !dragId) return;
      e.preventDefault();
      const b = r.getBoundingClientRect(), after = e.clientY > b.top + b.height / 2;
      list.querySelectorAll('.drag-before,.drag-after').forEach(x => x.classList.remove('drag-before', 'drag-after'));
      if (r.dataset.id !== dragId) r.classList.add(after ? 'drag-after' : 'drag-before');
    });
    list.addEventListener('drop', e => {
      const r = rowOf(e); if (!r || !dragId) return;
      e.preventDefault();
      const b = r.getBoundingClientRect();
      move(dragId, r.dataset.id, e.clientY > b.top + b.height / 2);
    });
    list.addEventListener('dragend', () => { dragId = null; clear(); });
  }
  function move(fromId, toId, after) {
    if (fromId === toId) return;
    const state = Storage.get();
    const from = state.chapters.findIndex(c => c.id === fromId);
    if (from < 0) return;
    const [ch] = state.chapters.splice(from, 1);
    let to = state.chapters.findIndex(c => c.id === toId);
    if (to < 0) { state.chapters.splice(from, 0, ch); return; }
    state.chapters.splice(after ? to + 1 : to, 0, ch);
    state.chapters.forEach((c, i) => { c.num = toRoman(i + 1); });
    Storage.save(state);
    render();
    if (window.Writing && Writing.rebuildSelect) Writing.rebuildSelect();
    App.markUnsaved();
  }

  function toRoman(n) {
    if (n < 1 || n > 39) return String(n);
    const vals = [10,9,5,4,1];
    const syms = ['X','IX','V','IV','I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
      while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
    }
    return result;
  }

  function countWords(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = (tmp.textContent || tmp.innerText || '').trim();
    return text ? text.split(/\s+/).length : 0;
  }

  return { openModal, save, delete: del, cycleStatus, render, countWords, label, quickCreate, move };
})();

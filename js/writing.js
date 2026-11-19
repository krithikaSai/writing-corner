/* ═══════════════════════════════════════════
   writing.js — Chapter writing editor
   ═══════════════════════════════════════════ */

const Writing = (() => {
  let currentChapterId = null;
  let currentTab = 'draft';
  let wordCountStart = 0;

  /* ── Build chapter select dropdown ── */
  function rebuildSelect() {
    const state = Storage.get();
    const sel = document.getElementById('writing-ch-select');
    if (!sel) return;
    const prev = currentChapterId;
    const none = state.chapters.length === 0;

    // No chapters yet → show an inline "create one" box instead of an empty dropdown
    sel.style.display = none ? 'none' : '';
    const quick = document.getElementById('writing-ch-create');
    if (quick) quick.style.display = none ? 'flex' : 'none';

    sel.innerHTML = '<option value="" disabled hidden>Select a Chapter</option>';
    state.chapters.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = Chapters.label(ch);
      sel.appendChild(opt);
    });
    if (prev && state.chapters.find(c => c.id === prev)) sel.value = prev;
    else sel.value = '';
  }

  /* ── Select a chapter to write ── */
  function selectChapter(id) {
    // Save current before switching
    if (currentChapterId) saveDraft();

    currentChapterId = id || null;
    const state = Storage.get();
    const ch = id ? state.chapters.find(c => c.id === id) : null;

    const draftEl  = document.getElementById('chapter-draft');
    const notesEl  = document.getElementById('chapter-notes');
    const planEl   = document.getElementById('ch-plan');
    const settingEl= document.getElementById('ch-setting');
    const charsEl  = document.getElementById('ch-chars-present');

    if (!ch) {
      if (draftEl) draftEl.innerHTML = '<p style="color:var(--text3);font-style:italic;">Select a chapter to start writing...</p>';
      const selEl = document.getElementById('writing-ch-select');
      if (selEl) selEl.value = '';
      if (notesEl) notesEl.innerHTML = '';
      if (planEl) planEl.value = '';
      if (settingEl) settingEl.value = '';
      if (charsEl) charsEl.value = '';
      updateWordCount(0);
      return;
    }

    if (draftEl) draftEl.innerHTML = ch.draft || '';
    if (notesEl) notesEl.innerHTML = ch.notes || '';
    if (planEl) planEl.value = ch.plan || ch.summary || '';
    if (settingEl) settingEl.value = ch.setting || '';
    if (charsEl) charsEl.value = ch.charsPresent || '';

    wordCountStart = Chapters.countWords(ch.draft || '');
    updateWordCount();
  }

  /* ── Navigate from chapters panel ── */
  function goTo(id) {
    showPanel('writing');
    const sel = document.getElementById('writing-ch-select');
    if (sel) sel.value = id;
    selectChapter(id);
  }

  /* ── Save draft on input ── */
  function onDraftInput() {
    saveDraft();
    updateWordCount();
    App.markUnsaved();
    Sound.playKey();
    Calendar.refresh();
  }

  function saveDraft() {
    if (!currentChapterId) return;
    const state = Storage.get();
    const ch = state.chapters.find(c => c.id === currentChapterId);
    if (!ch) return;
    const draftEl = document.getElementById('chapter-draft');
    if (draftEl) {
      const before = Chapters.countWords(ch.draft || '');
      ch.draft = draftEl.innerHTML;
      Calendar.addWords(state, Chapters.countWords(ch.draft) - before);
    }
    Storage.save(state);
    App.updateStats();
  }

  function savePlan() {
    if (!currentChapterId) return;
    const state = Storage.get();
    const ch = state.chapters.find(c => c.id === currentChapterId);
    if (!ch) return;
    ch.plan = document.getElementById('ch-plan').value;
    ch.setting = document.getElementById('ch-setting').value;
    ch.charsPresent = document.getElementById('ch-chars-present').value;
    Storage.save(state);
  }

  /* ── Word counter ── */
  function updateWordCount() {
    const draftEl = document.getElementById('chapter-draft');
    if (!draftEl) return;
    const wc = Chapters.countWords(draftEl.innerHTML);
    const el = document.getElementById('word-counter');
    if (el) el.textContent = wc.toLocaleString() + ' words';
    const wcSmall = document.getElementById('writing-wc');
    if (wcSmall) wcSmall.textContent = wc.toLocaleString() + ' words';
    // Update progress bar (target 3000 words / chapter as baseline)
    const bar = document.getElementById('writing-progress');
    if (bar) bar.style.width = Math.min(100, Math.round(wc / 30)) + '%';
  }

  /* ── Formatting: toolbar buttons never steal focus, so bold/italic/… also
        apply to text you type next (not just to a selection) ── */
  function format(cmd) {
    const el = document.getElementById('chapter-draft');
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    document.execCommand(cmd, false, null);
    refreshToolbar();
  }

  function refreshToolbar() {
    document.querySelectorAll('#editor-toolbar [data-cmd]').forEach(b => {
      let on = false;
      try { on = document.queryCommandState(b.dataset.cmd); } catch (e) {}
      b.classList.toggle('active', on);
    });
  }
  document.addEventListener('selectionchange', () => {
    const el = document.getElementById('chapter-draft');
    if (el && el.contains(document.getSelection()?.anchorNode)) refreshToolbar();
  });

  /* ── Statistics (like Word's Word Count box) ── */
  function textOf(html) {
    const t = document.createElement('div');
    t.innerHTML = (html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|h[1-6]|li)>/gi, '$&\n');
    return t.textContent || '';
  }
  function statsFor(htmls) {
    let words = 0, noSp = 0, withSp = 0, paras = 0, lines = 0;
    htmls.forEach(html => {
      textOf(html).split(/\n+/).forEach(p => {
        const line = p.replace(/\u00a0/g, ' ').trim();
        if (!line) return;
        paras++; withSp += line.length; noSp += line.replace(/\s/g, '').length;
        words += line.split(/\s+/).length; lines += Math.max(1, Math.ceil(line.length / 70));
      });
    });
    return { Words: words, Paragraphs: paras, 'Characters (no spaces)': noSp, 'Characters (with spaces)': withSp };
  }
  function renderStats() {
    const state = Storage.get();
    const scope = document.getElementById('stats-scope').value;
    const draftEl = document.getElementById('chapter-draft');
    const htmls = scope === 'story'
      ? state.chapters.map(c => c.id === currentChapterId && draftEl ? draftEl.innerHTML : (c.draft || ''))
      : [draftEl ? draftEl.innerHTML : ''];
    const st = statsFor(htmls);
    document.getElementById('stats-body').innerHTML = Object.entries(st).map(([k, v]) => `<tr><td>${k}</td><td>${v.toLocaleString()}</td></tr>`).join('');
  }
  function openStats() { renderStats(); openModal_('stats'); }

  /* ── Restore writing state on load ── */
  function restore() {
    rebuildSelect();
    if (currentChapterId) {
      const sel = document.getElementById('writing-ch-select');
      if (sel) sel.value = currentChapterId;
      selectChapter(currentChapterId);
    }
  }

  return { rebuildSelect, selectChapter, goTo, onDraftInput, savePlan, format, restore, updateWordCount, openStats, renderStats };
})();

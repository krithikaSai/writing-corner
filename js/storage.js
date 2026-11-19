/* ═══════════════════════════════════════════
   storage.js — Library of projects, IndexedDB persistence, JSON backup

   • One "library" holds many projects (novels) + global preferences
   • Storage.get() always returns the ACTIVE project, so every other
     module keeps working exactly as before
   • Primary store: IndexedDB (no 5 MB cap, so whiteboards are safe)
   • Fallback:      localStorage (if IndexedDB is unavailable)
   • Migrates automatically from older single-project saves
   • The public API stays synchronous: get() / save(s)
   ═══════════════════════════════════════════ */

const Storage = (() => {
  const KEY = 'writershaven_v1';        // oldest localStorage key (also fallback)
  const DB_NAME = 'writers_haven';
  const STORE = 'kv';
  const STATE_KEY = 'state';            // v1 (single project)
  const LIB_KEY = 'library';            // v2 (many projects)

  const defaultState = () => ({
    project: { title: 'My Novel', subtitle: '', author: '', genre: '' },
    createdAt: new Date().toISOString(),
    synopsis: '',
    tags: '',
    stickies: [],
    whiteboard: null,
    dailyWords: {},
    monthlyGoal: 0,
    customImages: {},
    characters: [],
    places: [],
    chapters: []
  });
  const defaultPrefs = () => ({ theme: 'light', ambient: null, keySound: 'none' });

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function newLibrary() {
    const id = uid();
    return { version: 2, activeId: id, order: [id], prefs: defaultPrefs(), projects: { [id]: defaultState() }, _updatedAt: '' };
  }

  let lib = newLibrary();
  let state = lib.projects[lib.activeId];
  let db = null;
  let idbOk = false;
  let persisted = null;          // result of navigator.storage.persist()
  let lastError = null;
  const listeners = [];          // called after every save()

  /* ── Tiny IndexedDB helpers (also used by Backup for file handles) ── */
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no indexedDB'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('idb blocked'));
    });
  }
  function idbGet(key) {
    return new Promise((resolve, reject) => {
      if (!db) return resolve(undefined);
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function idbSet(key, value) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error('no db'));
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function idbDel(key) {
    return new Promise((resolve) => {
      if (!db) return resolve();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  }

  /* ── Turn anything found on disk (old single project, or a library) into a clean library ── */
  function deepMerge(target, source) {
    const out = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        out[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        out[key] = source[key];
      }
    }
    return out;
  }

  function projectFromLegacy(p, prefs) {
    const out = deepMerge(defaultState(), p || {});
    if (p && p.theme && prefs) prefs.theme = p.theme;
    delete out.theme; delete out.supabase;
    // Free Write was removed — keep any old text as a sticky note so nothing is lost
    const txt = (out.brainstorm || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (txt) out.stickies = [{ color: 'yellow', text: 'From Free Write:\n' + txt }, ...(out.stickies || [])];
    delete out.brainstorm;
    return out;
  }

  function toLibrary(obj) {
    const L = newLibrary();
    if (obj && obj.projects && typeof obj.projects === 'object') {
      L.projects = {};
      for (const [id, p] of Object.entries(obj.projects)) L.projects[id] = projectFromLegacy(p, null);
      L.order = (obj.order || []).filter(id => L.projects[id]);
      Object.keys(L.projects).forEach(id => { if (!L.order.includes(id)) L.order.push(id); });
      if (!L.order.length) { const id = uid(); L.projects[id] = defaultState(); L.order = [id]; }
      L.activeId = L.projects[obj.activeId] ? obj.activeId : L.order[0];
      L.prefs = { ...defaultPrefs(), ...(obj.prefs || {}) };
      L._updatedAt = obj._updatedAt || '';
    } else {
      const id = L.order[0];
      L.projects = { [id]: projectFromLegacy(obj, L.prefs) };
      L._updatedAt = (obj && obj._updatedAt) || '';
    }
    return L;
  }

  function setLibrary(L) { lib = L; state = lib.projects[lib.activeId]; }

  /* ── Boot: call once and await before touching the UI ── */
  async function init() {
    let loaded = null, migrated = false;
    try {
      db = await openDB();
      idbOk = true;
      loaded = await idbGet(LIB_KEY);
      if (!loaded) {
        loaded = await idbGet(STATE_KEY);        // v1 single-project data
        if (loaded) migrated = true;
      }
    } catch (e) {
      console.warn('IndexedDB unavailable, using localStorage:', e);
      idbOk = false;
    }

    // Fall back to / migrate from the oldest localStorage copy
    if (!loaded) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { loaded = JSON.parse(raw); migrated = true; }
      } catch (e) { console.warn('Storage migrate error:', e); }
    }

    if (loaded) setLibrary(toLibrary(loaded));

    if (migrated) {
      try {
        if (idbOk) {
          await idbSet(LIB_KEY, lib);
          if (await idbGet(LIB_KEY)) { await idbDel(STATE_KEY); localStorage.removeItem(KEY); }
        } else {
          localStorage.setItem(KEY, JSON.stringify(lib));
        }
      } catch (e) { console.warn('Storage migrate write error:', e); }
    }

    // Ask the browser not to evict our data under storage pressure
    try {
      if (navigator.storage?.persist) persisted = await navigator.storage.persist();
    } catch (e) { persisted = null; }

    return state;
  }

  function get() { return state; }

  /* ── Save: sync for callers, async write underneath ── */
  let writing = false, pending = false;
  async function flush() {
    if (writing) { pending = true; return; }
    writing = true;
    try {
      do {
        pending = false;
        const snapshot = lib;
        if (idbOk) {
          await idbSet(LIB_KEY, snapshot);
        } else {
          localStorage.setItem(KEY, JSON.stringify(snapshot));
        }
        lastError = null;
      } while (pending);
    } catch (e) {
      lastError = e;
      console.warn('Storage save error:', e);
      if (typeof Toast === 'function') {
        Toast.show('Could not save in this browser — please download a backup!', 'error');
      }
    } finally {
      writing = false;
    }
  }

  function notify() { listeners.forEach(fn => { try { fn(state); } catch (e) { console.warn(e); } }); }

  function save(s) {
    if (s && s !== state) { lib.projects[lib.activeId] = state = s; }
    state._updatedAt = lib._updatedAt = new Date().toISOString();   // "last modified" — used by cloud sync
    flush();
    notify();
  }

  function onSave(fn) { listeners.push(fn); }

  /* ── Export / import ── */
  function portable() { return JSON.parse(JSON.stringify(lib)); }   // whole library
  function stamp() { return lib._updatedAt || ''; }

  function hasContent() {
    return Object.values(lib.projects).some(s =>
      (s.chapters?.length || s.characters?.length || s.places?.length || s.stickies?.length ||
       s.synopsis || s.whiteboard || (s.project?.title && s.project.title !== 'My Novel')));
  }

  function backupFilename() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `writing-corner-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(portable(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (typeof Backup !== 'undefined') Backup.markBackedUp('download');
    Toast.show('Backup downloaded!', 'success');
  }

  // Replace everything with a library/backup (cloud pulls, restore). Keeps THIS device's preferences.
  function replaceState(obj) {
    const keepPrefs = lib.prefs, keepActive = lib.activeId;
    const L = toLibrary(obj);
    L.prefs = keepPrefs;
    if (L.projects[keepActive]) L.activeId = keepActive;
    setLibrary(L);
    flush();
    return state;
  }

  function importJSON(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad');
        if (parsed.projects) {
          const n = Object.keys(parsed.projects).length;
          if (!confirm(`Restore this backup?\n\nIt contains ${n} project${n === 1 ? '' : 's'} and will REPLACE everything currently in this browser.`)) return;
          replaceState(parsed);
          Toast.show('Backup restored!', 'success');
        } else {
          // A single-novel file (older backups): add it as a new project, don't overwrite anything
          const p = projectFromLegacy(parsed, null);
          const id = uid();
          lib.projects[id] = p; lib.order.push(id);
          switchProject(id, { quiet: true });
          Toast.show('Imported as a new project!', 'success');
        }
        App.applyState();
        closeModal('export');
        closeModal('sync');
        save();
      } catch (err) {
        Toast.show('Invalid backup file.', 'error');
      }
    };
    reader.readAsText(file);
    input.value = '';
  }

  /* ── Projects ── */
  const prefs = () => lib.prefs;
  function setPrefs(patch) { Object.assign(lib.prefs, patch); lib._updatedAt = new Date().toISOString(); flush(); notify(); }

  function listProjects() {
    return lib.order.map(id => {
      const p = lib.projects[id];
      return {
        id, title: p.project?.title || 'Untitled', subtitle: p.project?.subtitle || '',
        chapters: (p.chapters || []).length, updatedAt: p._updatedAt || p.createdAt || '',
        words: (p.chapters || []).reduce((n, c) => n + (typeof countWords === 'function' ? countWords(c.draft || '') : 0), 0),
        active: id === lib.activeId
      };
    });
  }

  function switchProject(id, { quiet } = {}) {
    if (!lib.projects[id]) return false;
    lib.activeId = id;
    state = lib.projects[id];
    lib._updatedAt = new Date().toISOString();
    flush();
    if (!quiet) notify();
    return true;
  }

  function renameProject(id, title) {
    const p = lib.projects[id];
    if (!p) return;
    p.project = { ...(p.project || {}), title: (title || '').trim() || 'Untitled Novel' };
    p._updatedAt = lib._updatedAt = new Date().toISOString();
    flush(); notify();
  }

  function createProject(title) {
    const id = uid();
    const p = defaultState();
    p.project.title = (title || '').trim() || 'Untitled Novel';
    lib.projects[id] = p; lib.order.push(id);
    switchProject(id, { quiet: true });
    return id;
  }

  function deleteProject(id) {
    if (!lib.projects[id]) return;
    delete lib.projects[id];
    lib.order = lib.order.filter(x => x !== id);
    if (!lib.order.length) { const nid = uid(); lib.projects[nid] = defaultState(); lib.order = [nid]; }
    if (!lib.projects[lib.activeId]) lib.activeId = lib.order[0];
    state = lib.projects[lib.activeId];
    save();
  }

  return {
    init, get, save, onSave, exportJSON, importJSON, replaceState, portable, stamp, hasContent,
    backupFilename, uid,
    prefs, setPrefs, listProjects, createProject, switchProject, renameProject, deleteProject,
    // low-level kv for other modules (file handles etc.)
    kvGet: idbGet, kvSet: idbSet, kvDel: idbDel,
    info: () => ({ indexedDB: idbOk, persisted, error: lastError })
  };
})();

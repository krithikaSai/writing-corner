/* ═══════════════════════════════════════════
   backup.js — "Backup & Sync" controller

   Three independent safety nets, all optional for the user:
   1. Auto-backup to a file they pick once (Chrome/Edge/Opera). If that
      file lives in a Drive/Dropbox/OneDrive/iCloud folder, it also syncs.
   2. One-click Google Drive sync (see drive.js)
   3. Manual download / restore (works in every browser)
   Plus a small status chip in the top bar so users always know.
   ═══════════════════════════════════════════ */

const Backup = (() => {
  const META_KEY = 'writershaven_backup';
  const FILE_SUPPORTED = typeof window.showSaveFilePicker === 'function';
  let fileHandle = null;
  let filePerm = 'none';          // none | granted | prompt
  let fileError = '';
  let writeTimer = null;
  let nagged = false;

  /* ── tiny meta store (not part of the project data) ── */
  function readMeta() { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } }
  function writeMeta(p) { try { localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...p })); } catch (e) {} }

  function markBackedUp(via) {
    writeMeta({ at: new Date().toISOString(), via });
    renderChip(); renderModal();
  }

  function ago(iso) {
    if (!iso) return '';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  const $ = id => document.getElementById(id);

  /* ══ File autosave (File System Access API) ══ */
  async function initFile() {
    if (!FILE_SUPPORTED) return;
    try {
      fileHandle = (await Storage.kvGet('fileHandle')) || null;
      if (fileHandle) {
        const p = await fileHandle.queryPermission({ mode: 'readwrite' });
        filePerm = p === 'granted' ? 'granted' : 'prompt';
      }
    } catch (e) { fileHandle = null; filePerm = 'none'; }
  }

  async function chooseFile() {
    if (!FILE_SUPPORTED) return;
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: 'writing-corner-autosave.json',
        types: [{ description: 'Writing Corner backup', accept: { 'application/json': ['.json'] } }]
      });
      fileHandle = h; filePerm = 'granted'; fileError = '';
      await Storage.kvSet('fileHandle', h);
      await writeFile();
      Toast.show('Auto-backup is on ✓', 'success');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      fileError = e.message || 'Could not use that file';
      Toast.show('Could not set up the backup file.', 'error');
    }
    renderChip(); renderModal();
  }

  async function reconnectFile() {
    if (!fileHandle) return chooseFile();
    try {
      const p = await fileHandle.requestPermission({ mode: 'readwrite' });
      filePerm = p === 'granted' ? 'granted' : 'prompt';
      if (filePerm === 'granted') { fileError = ''; await writeFile(); Toast.show('Auto-backup reconnected ✓', 'success'); }
    } catch (e) { fileError = e.message || ''; }
    renderChip(); renderModal();
  }

  async function stopFile() {
    fileHandle = null; filePerm = 'none';
    await Storage.kvDel('fileHandle');
    renderChip(); renderModal();
  }

  async function writeFile() {
    if (!fileHandle || filePerm !== 'granted') return;
    try {
      const w = await fileHandle.createWritable();
      await w.write(JSON.stringify(Storage.portable(), null, 2));
      await w.close();
      fileError = '';
      markBackedUp('file');
    } catch (e) {
      console.warn('File backup error:', e);
      fileError = e.message || 'Write failed';
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) filePerm = 'prompt';
      renderChip(); renderModal();
    }
  }

  function scheduleFileWrite() {
    if (!fileHandle || filePerm !== 'granted') return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(writeFile, 3000);
  }

  /* ══ Status chip in the top bar ══ */
  function chipState() {
    const d = Drive.getStatus();
    const m = readMeta();
    if (d.connected && d.status === 'conflict') return { cls: 'error', text: '⚠ Sync conflict' };
    if (d.connected && d.status === 'error') return { cls: 'error', text: '⚠ Drive sync error' };
    if (d.connected && d.status === 'syncing') return { cls: 'syncing', text: '◌ Syncing…' };
    if (d.connected && d.status === 'needs-auth') return { cls: 'warn', text: '☁ Reconnect Google' };
    if (d.connected && d.lastSyncAt) return { cls: 'synced', text: '● Drive · ' + ago(d.lastSyncAt) };
    if (fileHandle && filePerm === 'prompt') return { cls: 'warn', text: '⚠ Reconnect backup file' };
    if (fileHandle && filePerm === 'granted' && m.at) return { cls: 'synced', text: '● Backed up · ' + ago(m.at) };
    if (m.at) {
      const days = (Date.now() - new Date(m.at).getTime()) / 86400000;
      return { cls: days > 7 ? 'warn' : '', text: (days > 7 ? '⚠ ' : '') + 'Last backup ' + ago(m.at) };
    }
    return { cls: 'warn', text: '⚠ Not backed up' };
  }

  function renderChip() {
    const el = $('backup-status');
    if (!el) return;
    const s = chipState();
    el.className = 'sync-status backup-chip' + (s.cls ? ' ' + s.cls : '');
    el.textContent = s.text;
  }

  /* ══ Modal ══ */
  function renderModal() {
    if (!$('sync-storage-text')) return;
    const info = Storage.info();

    // 1. This browser
    $('sync-storage-text').textContent = info.indexedDB
      ? 'Saved automatically in this browser' + (info.persisted ? ' (protected from auto-cleanup)' : '')
      : 'Saved in this browser (limited mode)';

    // 2. Google Drive
    const d = Drive.getStatus();
    const dSec = $('sync-drive-section');
    dSec.style.display = 'block';
    $('sync-drive-row').style.display = d.connected ? '' : 'none';
    if (d.configured) {
      const dot = $('sync-drive-dot'), txt = $('sync-drive-text');
      let dotCls = 'disconnected', t = 'Not connected';
      if (d.connected) {
        if (d.status === 'synced') { dotCls = 'connected'; t = 'Synced ' + ago(d.lastSyncAt); }
        else if (d.status === 'syncing') { dotCls = 'connected'; t = 'Syncing…'; }
        else if (d.status === 'conflict') { dotCls = 'error'; t = d.message || 'Conflict'; }
        else if (d.status === 'error') { dotCls = 'error'; t = d.message || 'Sync error'; }
        else if (d.status === 'needs-auth') { dotCls = 'disconnected'; t = 'Signed out — click Sync now to reconnect'; }
        else { dotCls = 'connected'; t = d.lastSyncAt ? 'Synced ' + ago(d.lastSyncAt) : 'Connected'; }
      }
      dot.className = 'status-dot ' + dotCls;
      txt.textContent = t;
      $('sync-drive-connect').style.display = d.connected ? 'none' : '';
      $('sync-drive-now').style.display = d.connected ? '' : 'none';
    }

    // 3. Auto-backup file
    const fSec = $('sync-file-section');
    if (!FILE_SUPPORTED) {
      $('sync-file-text').textContent = 'Your browser can\'t auto-save to a file (Chrome, Edge or Opera can). Use the download button below.';
      $('sync-file-dot').className = 'status-dot disconnected';
      ['sync-file-choose', 'sync-file-reconnect', 'sync-file-stop'].forEach(i => $(i).style.display = 'none');
    } else {
      let t = 'Off', cls = 'disconnected';
      if (fileHandle && filePerm === 'granted') { t = `On — saving to “${fileHandle.name}”` + (readMeta().via === 'file' ? ' · ' + ago(readMeta().at) : ''); cls = 'connected'; }
      else if (fileHandle) { t = `Paused — click Reconnect to resume “${fileHandle.name}”`; cls = 'error'; }
      if (fileError) t += ' · ' + fileError;
      $('sync-file-text').textContent = t;
      $('sync-file-dot').className = 'status-dot ' + cls;
      $('sync-file-choose').style.display = fileHandle ? 'none' : '';
      $('sync-file-reconnect').style.display = fileHandle && filePerm !== 'granted' ? '' : 'none';
      $('sync-file-stop').style.display = fileHandle ? '' : 'none';
    }

    // 4. Last backup line
    const m = readMeta();
    $('sync-last-backup').textContent = m.at
      ? `Last backup: ${ago(m.at)} (${{ file: 'backup file', drive: 'Google Drive', download: 'download' }[m.via] || 'saved'})`
      : 'No backup yet';
  }

  function openModal() {
    renderModal();
    openModal_('sync');
    if (Drive.configured()) Drive.loadGis().catch(() => {});   // preload so the sign-in click isn't blocked
  }

  /* ══ Boot ══ */
  async function init() {
    await initFile();
    Storage.onSave(scheduleFileWrite);
    Drive.onChange(() => { renderChip(); renderModal(); });
    renderChip();
    setInterval(() => { renderChip(); }, 30000);

    // Gentle one-time nudge if nothing is protecting the user's work
    setTimeout(() => {
      if (nagged) return;
      const s = Storage.get();
      const hasWork = (s.chapters?.length || 0) + (s.characters?.length || 0) + (s.places?.length || 0) > 0;
      const m = readMeta();
      const stale = !m.at || (Date.now() - new Date(m.at).getTime()) > 7 * 86400000;
      const protectedNow = (fileHandle && filePerm === 'granted') || Drive.isConnected();
      if (hasWork && stale && !protectedNow) {
        nagged = true;
        Toast.show('Tip: open ☁ Backup & Sync to keep your writing safe.');
      }
    }, 8000);
  }

  return { init, openModal, markBackedUp, chooseFile, reconnectFile, stopFile, renderChip };
})();

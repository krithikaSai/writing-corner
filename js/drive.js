/* ═══════════════════════════════════════════
   drive.js — One-click sync with the user's own Google Drive
   ═══════════════════════════════════════════ */

const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'writers-haven.json';
  const META_KEY = 'writershaven_drive';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  let tokenClient = null;
  let token = null, tokenExp = 0;
  let pendingTok = null;                 // { resolve, reject }
  let gisPromise = null;
  let busy = false;
  let pushTimer = null;
  let status = 'off';                    // off | needs-auth | syncing | synced | conflict | error
  let statusMsg = '';
  const changeHandlers = [];

  /* ── small persisted meta (kept OUT of the synced project data) ── */
  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeMeta(patch) {
    const m = { ...readMeta(), ...patch };
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {}
    return m;
  }

  const clientId = () => (window.WH_CONFIG && window.WH_CONFIG.googleClientId || '').trim();
  const configured = () => !!clientId();
  const isConnected = () => !!readMeta().connected;
  const hasToken = () => !!token && Date.now() < tokenExp - 60000;

  function setStatus(s, msg = '') {
    status = s; statusMsg = msg;
    changeHandlers.forEach(fn => { try { fn(); } catch (e) {} });
  }
  function onChange(fn) { changeHandlers.push(fn); }
  function getStatus() {
    return { status, message: statusMsg, configured: configured(), connected: isConnected(),
             lastSyncAt: readMeta().lastSyncAt || null, hasToken: hasToken() };
  }

  /* ── Google Identity Services loader ── */
  function loadGis() {
    if (!configured()) return Promise.reject(new Error('not configured'));
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in (offline?)')); };
      document.head.appendChild(s);
    }).then(() => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId(),
        scope: SCOPE,
        callback: r => {
          const p = pendingTok; pendingTok = null;
          if (!p) return;
          if (r.error) return p.reject(r);
          token = r.access_token;
          tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
          p.resolve(token);
        },
        error_callback: e => {
          const p = pendingTok; pendingTok = null;
          if (p) p.reject(e);
        }
      });
    });
    return gisPromise;
  }

  // Must be called from a click handler the first time (popup rules).
  function getToken(prompt = '') {
    if (hasToken()) return Promise.resolve(token);
    if (!tokenClient) return Promise.reject(new Error('Google sign-in is still loading'));
    return new Promise((resolve, reject) => {
      pendingTok = { resolve, reject };
      tokenClient.requestAccessToken({ prompt });
    });
  }

  /* ── Drive REST helpers ── */
  async function api(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    if (res.status === 401) { token = null; tokenExp = 0; const e = new Error('auth'); e.auth = true; throw e; }
    if (!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
    return res;
  }

  async function findFile() {
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const res = await api(`${API}/files?spaces=appDataFolder&q=${q}&pageSize=1&fields=files(id,modifiedTime,appProperties)`);
    const j = await res.json();
    return j.files && j.files[0] || null;
  }

  async function download(id) {
    const res = await api(`${API}/files/${id}?alt=media`);
    return res.json();
  }

  async function upload(id, data, updatedAt) {
    const b = 'wh' + Math.random().toString(36).slice(2);
    const meta = id
      ? { appProperties: { updatedAt: updatedAt || '' } }
      : { name: FILE_NAME, parents: ['appDataFolder'], appProperties: { updatedAt: updatedAt || '' } };
    const body =
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${b}--`;
    const url = id ? `${UPLOAD}/files/${id}?uploadType=multipart&fields=id` : `${UPLOAD}/files?uploadType=multipart&fields=id`;
    const res = await api(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
    return (await res.json()).id;
  }

  /* ── The sync brain: reconcile local ↔ Drive ── */
  async function reconcile({ interactive = false } = {}) {
    if (busy || !isConnected()) return;
    if (!hasToken()) { setStatus('needs-auth'); return; }
    busy = true;
    setStatus('syncing');
    try {
      const meta = readMeta();
      const localStamp = Storage.stamp();
      const remote = await findFile();
      const lastSynced = meta.syncedStamp || '';

      const pushNow = async () => {
        const snap = Storage.portable();
        const id = await upload(remote?.id || meta.fileId || null, snap, snap._updatedAt || '');
        writeMeta({ fileId: id, syncedStamp: snap._updatedAt || '', lastSyncAt: new Date().toISOString() });
      };
      const pullNow = async () => {
        const data = await download(remote.id);
        Storage.replaceState(data);
        writeMeta({ fileId: remote.id, syncedStamp: data._updatedAt || remote.appProperties?.updatedAt || '', lastSyncAt: new Date().toISOString() });
        App.applyState();
        Toast.show('Synced from Google Drive ☁', 'success');
      };

      if (!remote) {
        if (Storage.hasContent()) await pushNow();
        else writeMeta({ lastSyncAt: new Date().toISOString() });
      } else {
        const remoteStamp = remote.appProperties?.updatedAt || '';
        const remoteChanged = remoteStamp !== lastSynced;
        const localChanged = Storage.hasContent() && localStamp !== lastSynced;

        if (!Storage.hasContent()) {
          await pullNow();                                   // fresh device
        } else if (remoteChanged && !localChanged) {
          await pullNow();
        } else if (!remoteChanged && localChanged) {
          await pushNow();
        } else if (remoteChanged && localChanged) {
          if (remoteStamp === localStamp) {
            writeMeta({ syncedStamp: localStamp, lastSyncAt: new Date().toISOString() });   // identical
          } else if (!interactive) {
            setStatus('conflict', 'Both this device and Google Drive changed. Open Backup & Sync to choose.');
            busy = false;
            return;
          } else {
            const useCloud = confirm(
              'Both this device and Google Drive have different versions.\n\n' +
              'OK  →  use the Google Drive version (this device\'s version is downloaded first as a safety backup)\n' +
              'Cancel  →  keep this device\'s version and overwrite Google Drive');
            if (useCloud) { Storage.exportJSON(); await pullNow(); }
            else await pushNow();
          }
        } else {
          writeMeta({ lastSyncAt: new Date().toISOString() });
        }
      }
      setStatus('synced');
      if (typeof Backup !== 'undefined') Backup.markBackedUp('drive');
    } catch (e) {
      console.warn('Drive sync error:', e);
      if (e.auth) setStatus('needs-auth');
      else setStatus('error', e.message || 'Sync failed');
    } finally {
      busy = false;
    }
  }

  /* ── Public actions ── */
  async function connect() {
    if (!configured()) { Toast.show('Google sign-in isn’t set up yet.'); return; }
    try {
      await loadGis();
      await getToken('select_account'); // popup — user clicked, so this is allowed
    } catch (e) {
      if (e && (e.type === 'popup_closed' || e.error === 'access_denied')) { Toast.show('Google sign-in cancelled.'); return; }
      Toast.show(e?.message || 'Could not sign in with Google.', 'error');
      return;
    }
    writeMeta({ connected: true });
    await reconcile({ interactive: true });
  }

  async function disconnect() {
    if (!confirm('Stop syncing with Google Drive on this device?\n\nYour writing stays here. The copy in your Drive stays too (only this app can see it).')) return;
    try { if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0;
    try { localStorage.removeItem(META_KEY); } catch (e) {}
    setStatus('off');
  }

  async function syncNow() {
    if (!isConnected()) return connect();
    if (!hasToken()) {
      try { await loadGis(); await getToken(); } catch (e) { setStatus('needs-auth'); Toast.show('Please sign in again.', 'error'); return; }
    }
    await reconcile({ interactive: true });
  }

  function schedulePush() {
    if (!isConnected()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      if (!hasToken()) { setStatus('needs-auth'); return; }
      reconcile();
    }, 8000);
  }

  /* ── Boot ── */
  function init() {
    Storage.onSave(schedulePush);
    if (!configured()) return;
    if (!isConnected()) { setStatus('off'); return; }

    setStatus('needs-auth');
    // Re-authorise quietly on the user's first interaction (popup rules need a gesture)
    loadGis().then(() => {
      const once = () => {
        document.removeEventListener('pointerdown', once, true);
        if (hasToken()) return;
        getToken().then(() => reconcile()).catch(() => setStatus('needs-auth'));
      };
      document.addEventListener('pointerdown', once, true);
    }).catch(() => setStatus('needs-auth'));

    // Periodic check (picks up edits from another device)
    setInterval(() => { if (isConnected() && hasToken()) reconcile(); }, 120000);
  }

  return { init, connect, disconnect, syncNow, loadGis, onChange, getStatus, configured, isConnected };
})();

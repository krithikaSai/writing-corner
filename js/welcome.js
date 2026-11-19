/* welcome.js — first-visit landing page */
const Welcome = (() => {
  const KEY = 'wh_welcomed';
  const seen = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };
  const mark = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} };
  const el = id => document.getElementById(id);

  function init() {
    const connected = window.Drive && Drive.isConnected && Drive.isConnected();
    if (seen() || connected) return;
    el('welcome').style.display = 'flex';
    if (window.Drive && Drive.configured && Drive.configured()) Drive.loadGis().catch(() => {});   // preload so the sign-in popup isn't blocked
    if (!(window.Drive && Drive.configured && Drive.configured())) {
      el('welcome-pop-text').textContent = 'Your writing is saved privately on this device, in this browser. You can back it up any time from Backup & Sync.';
      el('welcome-go').textContent = 'Continue';
    }
  }
  function ask() { el('welcome-pop').classList.add('open'); }
  function later() { el('welcome-pop').classList.remove('open'); close(); }   // "Not now": enter the app without signing in
  function close() { mark(); const w = el('welcome'); w.classList.add('leaving'); setTimeout(() => { w.style.display = 'none'; }, 450); }
  async function go() {
    if (window.Drive && Drive.configured && Drive.configured()) {
      await Drive.connect();
      // Only enter the app once Google sign-in actually worked; if it was cancelled, stay here so they can retry or pick "Not now".
      if (!Drive.isConnected()) return;
    }
    close();
  }
  document.addEventListener('DOMContentLoaded', init);
  return { ask, later, go };
})();

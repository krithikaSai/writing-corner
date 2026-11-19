/* ═══════════════════════════════════════════
   config.js — the only file YOU (the app owner) edit

   Google Drive sync needs one public OAuth client ID.
   It is NOT a secret — it is safe to commit and host.
   Leave it empty and the Google Drive option is simply hidden;
   everything else (local storage, file autosave, export) still works.

   How to get one (≈10 min, free, no billing needed):
   see "Setting up Google Drive sync" in README.md
   ═══════════════════════════════════════════ */
window.WH_CONFIG = {
  googleClientId: ''   // e.g. '1234567890-abcdefg.apps.googleusercontent.com'
};

/* ═══════════════════════════════════════════
   characters.js — Character CRUD + rendering
   ═══════════════════════════════════════════ */

const Characters = (() => {

  /* ── Portrait builder state ── */
  let look = null;          // { gender, hair, clothes, hairColor, eyeColor }
  let clothesMax = 1;

  const $ = id => document.getElementById(id);

  function buildSwatches() {
    const mk = (boxId, table, key, handler) => {
      const box = $(boxId); box.innerHTML = '';
      Object.entries(table).forEach(([k, v]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'swatch-dot'; b.dataset.k = k; b.title = v.label;
        b.style.background = (v.ramp || v.color) ? Portrait.swatchColor(v) : 'linear-gradient(135deg,#9a9a9a,#c8c8c8)';
        b.onclick = () => handler(k);
        box.appendChild(b);
      });
    };
    mk('cf-haircolor', Portrait.HAIR, 'hairColor', pickHairColor);
    mk('cf-eyecolor', Portrait.EYES, 'eyeColor', pickEyeColor);
    mk('cf-skincolor', Portrait.SKIN, 'skinTone', pickSkin);
  }
  function markSwatches() {
    document.querySelectorAll('#cf-haircolor .swatch-dot').forEach(b => b.classList.toggle('selected', look && b.dataset.k === look.hairColor));
    document.querySelectorAll('#cf-eyecolor .swatch-dot').forEach(b => b.classList.toggle('selected', look && b.dataset.k === look.eyeColor));
    document.querySelectorAll('#cf-skincolor .swatch-dot').forEach(b => b.classList.toggle('selected', look && b.dataset.k === (look.skinTone || 'natural')));
  }

  async function fillHairOptions() {
    const sel = $('cf-hair');
    const list = look ? await Portrait.hairstyles(look.gender) : [];
    sel.innerHTML = '';
    const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Select a hairstyle'; ph.disabled = true; ph.hidden = true; sel.appendChild(ph);
    list.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    const none = document.createElement('option'); none.value = '__bald__'; none.textContent = 'None'; sel.appendChild(none);   // last: no hairstyle, keeps the portrait as it is
    sel.value = look && look.hair ? look.hair : (look && look.hairChosen ? '__bald__' : '');
  }

  /* Own photo: undefined = unchanged, a data URL = newly chosen, null = removed */
  let photoDraft;
  const ownPhoto = () => photoDraft !== undefined ? photoDraft : Photos.url($('cf-editing-id').value);
  function chooseOwnPhoto() {
    Photos.pick('character', '', data => { photoDraft = data; if (look) look.simple = false; syncPortraitUI(); });
  }

  function syncPortraitUI() {
    const wrap = $('portrait-builder');
    wrap.style.display = look ? '' : 'none';
    if (!look) return;
    const ph = ownPhoto();
    const img = $('cf-own-photo');
    img.hidden = !ph; if (ph) img.src = ph;
    $('cf-portrait').classList.toggle('has-own', !!ph);
    $('cf-simple').checked = !!look.simple && !ph;
    $('cf-controls').style.display = (look.simple || ph) ? 'none' : '';
    $('cf-clothes-row').style.display = look.hair ? '' : 'none';
    $('cf-haircolor-row').style.display = look.hair ? '' : 'none';
    $('cf-clothes-count').textContent = `${look.clothes || 1} / ${clothesMax}`;
    $('cf-clothes-prev').disabled = $('cf-clothes-next').disabled = clothesMax < 2;
    markSwatches();
  }
  function paintPortrait() { if (look) Portrait.show($('cf-portrait'), look); }

  async function pickGender(g) {
    g = (g || '').toLowerCase();
    if (!g) { look = null; syncPortraitUI(); return; }
    const keep = look || {};
    look = { gender: g, hair: null, hairChosen: false, clothes: 1, hairColor: keep.hairColor || 'brown', eyeColor: keep.eyeColor || 'grey', skinTone: keep.skinTone || 'natural', simple: !!keep.simple };
    clothesMax = 1;
    Portrait.resetStage();
    await fillHairOptions();
    syncPortraitUI(); paintPortrait();
  }
  async function pickHair(v) {
    if (!look) return;
    look.hairChosen = true;
    if (v === '__bald__') { look.hair = null; clothesMax = 1; }
    else { look.hair = v; look.clothes = 1; clothesMax = await Portrait.clothesCount(look.gender, v); }
    syncPortraitUI(); paintPortrait();
  }
  function stepClothes(d) {
    if (!look || !look.hair || clothesMax < 2) return;
    look.clothes = ((look.clothes - 1 + d + clothesMax) % clothesMax) + 1;
    syncPortraitUI(); paintPortrait();
  }
  function pickHairColor(k) { if (!look) return; look.hairColor = k; syncPortraitUI(); paintPortrait(); }
  function pickSkin(k) { if (!look) return; look.skinTone = k; syncPortraitUI(); paintPortrait(); }
  function toggleSimple(on) { if (!look) return; look.simple = !!on; if (on) photoDraft = null; syncPortraitUI(); paintPortrait(); }
  function pickEyeColor(k) { if (!look) return; look.eyeColor = k; syncPortraitUI(); paintPortrait(); }

  async function loadLook(saved, gender) {
    Portrait.resetStage();
    if (saved && saved.gender) {
      look = { hairChosen: !!saved.hair, ...saved };
    } else if (gender === 'Male' || gender === 'Female') {
      look = null; await pickGender(gender); return;
    } else look = null;
    if (look) {
      clothesMax = look.hair ? await Portrait.clothesCount(look.gender, look.hair) : 1;
      await fillHairOptions();
    }
    syncPortraitUI(); paintPortrait();
  }

  /* ── Open modal (new or edit) ── */
  function openModal(id = null) {
    const state = Storage.get();
    const isEdit = !!id;
    photoDraft = undefined;

    document.getElementById('char-modal-title').textContent = isEdit ? 'Edit Character' : 'New Character';
    document.getElementById('char-delete-btn').style.display = isEdit ? 'block' : 'none';
    document.getElementById('cf-editing-id').value = id || '';
    if (!$('cf-haircolor').children.length) buildSwatches();

    // Restore hidden fields
    ['appearance','motivation','relationship','tags','notes'].forEach(f => {
      const w = document.getElementById(`field-wrap-${f}`);
      if (w) w.style.display = '';
    });
    const setMain = v => document.querySelectorAll('input[name="cf-ismain"]').forEach(r => { r.checked = (r.value === (v ? 'yes' : 'no')); });

    if (isEdit) {
      const ch = state.characters.find(c => c.id === id);
      if (!ch) return;
      document.getElementById('cf-name').value = ch.name || '';
      document.getElementById('cf-age').value = ch.age || '';
      document.getElementById('cf-gender').value = ch.look?.gender ? (ch.look.gender === 'male' ? 'Male' : 'Female') : (ch.gender || '');
      document.getElementById('cf-role').value = ch.role || 'Supporting';
      document.getElementById('cf-appearance').value = ch.appearance || '';
      document.getElementById('cf-motivation').value = ch.motivation || '';
      document.getElementById('cf-relationship').value = ch.relationship || '';
      document.getElementById('cf-flaws').value = ch.flaws || '';
      document.getElementById('cf-likes').value = ch.likes || '';
      document.getElementById('cf-notes').value = ch.notes || '';
      setMain(!!ch.isMain);
      loadLook(ch.look || null, ch.gender);
    } else {
      ['cf-name','cf-age','cf-appearance','cf-motivation','cf-relationship','cf-flaws','cf-likes','cf-notes'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('cf-gender').value = '';
      document.getElementById('cf-role').value = 'Supporting';
      setMain(true);
      loadLook(null, '');
    }
    syncMain();

    openModal_('character');
  }

  /* ── "Is this the main character?" → only ask for a relationship when it's not ── */
  function isMainChar() {
    return document.querySelector('input[name="cf-ismain"]:checked')?.value === 'yes';
  }
  function syncMain() {
    const w = document.getElementById('field-wrap-relationship');
    if (w) w.style.display = isMainChar() ? 'none' : '';
  }

  /* ── Save ── */
  function save() {
    const name = document.getElementById('cf-name').value.trim();
    if (!name) { Toast.show('Please enter a character name.', 'error'); return; }
    if (!look && !document.getElementById('cf-gender').value) { Toast.show('Please choose a gender.', 'error'); return; }

    const state = Storage.get();
    const editId = document.getElementById('cf-editing-id').value;
    const isEdit = !!editId;

    const charData = {
      id: isEdit ? editId : Storage.uid(),
      name,
      age: document.getElementById('cf-age').value.trim(),
      gender: look ? (look.gender === 'male' ? 'Male' : 'Female') : document.getElementById('cf-gender').value,
      role: document.getElementById('cf-role').value,
      appearance: document.getElementById('cf-appearance').value.trim(),
      motivation: document.getElementById('cf-motivation').value.trim(),
      isMain: isMainChar(),
      relationship: isMainChar() ? '' : document.getElementById('cf-relationship').value.trim(),
      flaws: document.getElementById('cf-flaws').value.trim(),
      likes: document.getElementById('cf-likes').value.trim(),
      notes: document.getElementById('cf-notes').value.trim(),
      look: look ? { gender: look.gender, hair: look.hair, clothes: look.clothes, hairColor: look.hairColor, eyeColor: look.eyeColor, skinTone: look.skinTone || 'natural', simple: !!look.simple } : null,
      createdAt: isEdit ? (state.characters.find(c=>c.id===editId)?.createdAt || Date.now()) : Date.now()
    };

    if (isEdit) {
      const idx = state.characters.findIndex(c => c.id === editId);
      if (idx !== -1) state.characters[idx] = charData;
    } else {
      state.characters.push(charData);
    }

    if (photoDraft !== undefined) {
      const m = state.customImages || (state.customImages = {});
      if (photoDraft) m[charData.id] = photoDraft; else delete m[charData.id];
    }
    Storage.save(state);
    closeModal('character');
    render();
    App.updateStats();
    App.markUnsaved();
    App.logActivity(`${isEdit ? 'Updated' : 'Created'} character: ${name}`);
    Toast.show(`${name} saved!`, 'success');
  }

  /* ── Delete ── */
  function del() {
    const id = document.getElementById('cf-editing-id').value;
    if (!id) return;
    const state = Storage.get();
    const ch = state.characters.find(c => c.id === id);
    if (!confirm(`Delete "${ch?.name}"? This cannot be undone.`)) return;
    state.characters = state.characters.filter(c => c.id !== id);
    Photos.drop(id);
    Storage.save(state);
    closeModal('character');
    render();
    App.updateStats();
    App.markUnsaved();
    Toast.show('Character deleted.');
  }

  /* ── Render grid ── */
  function render() {
    const state = Storage.get();
    const grid = document.getElementById('char-grid');
    if (!grid) return;

    const cards = state.characters.map(ch => {
      const roleClass = 'badge-' + (ch.role || 'Supporting').replace(' ','_');
      const metaParts = [ch.gender, ch.age ? `Age ${ch.age}` : ''].filter(Boolean);
      const flawTags = (ch.flaws||'').split(',').map(f=>f.trim()).filter(Boolean).slice(0,4).map(f=>`<span class="char-tag">${f}</span>`).join('');
      const likesTags = (ch.likes||'').split(',').map(l=>l.trim()).filter(Boolean).slice(0,3).map(l=>`<span class="char-tag">${l}</span>`).join('');

      return `<div class="character-card">
  <div class="char-avatar-display${Photos.url(ch.id) ? ' has-photo' : ''}">
    ${Photos.url(ch.id) ? `<img class="char-photo" alt="" src="${Photos.url(ch.id)}">` : ch.look ? `<canvas class="char-portrait" data-id="${ch.id}"></canvas>` : `<div class="char-initial">${escHtml((ch.name||'?').trim().charAt(0).toUpperCase())}</div>`}
    <span class="char-role-badge badge-${ch.role||'Supporting'}">${ch.role||'Supporting'}</span>
    ${Photos.overlay('character', ch.id)}
  </div>
  <div class="char-body">
    <div class="char-name">${escHtml(ch.name)}</div>
    <div class="char-meta">${escHtml(metaParts.join(' · '))}</div>
    ${ch.appearance ? `<div class="char-field"><div class="char-field-label">Appearance</div><div class="char-field-val">${escHtml(ch.appearance.slice(0,100))}${ch.appearance.length>100?'…':''}</div></div>` : ''}
    ${ch.motivation ? `<div class="char-field"><div class="char-field-label">Motivation</div><div class="char-field-val">${escHtml(ch.motivation.slice(0,100))}${ch.motivation.length>100?'…':''}</div></div>` : ''}
    ${flawTags ? `<div class="char-field"><div class="char-field-label">Flaws</div><div class="char-tags">${flawTags}</div></div>` : ''}
    ${likesTags ? `<div class="char-field"><div class="char-field-label">Likes</div><div class="char-tags">${likesTags}</div></div>` : ''}
  </div>
  <div class="char-actions">
    <button class="btn btn-sm" onclick="Characters.openModal('${ch.id}')">Edit</button>
    ${ch.notes ? `<button class="btn btn-sm" onclick="Characters.showNotes('${ch.id}')">Notes</button>` : ''}
  </div>
</div>`;
    }).join('');

    grid.innerHTML = cards + `<div class="add-card" onclick="Characters.openModal()"><div class="add-card-icon">+</div><div class="add-card-label">Add Character</div></div>`;

    document.getElementById('nav-char-count').textContent = state.characters.length;
    grid.querySelectorAll('canvas.char-portrait').forEach(cv => {
      const ch = state.characters.find(c => c.id === cv.dataset.id);
      if (ch && ch.look) Portrait.mount(cv, ch.look);
    });
  }

  /* ── Show notes quick view ── */
  function showNotes(id) {
    const state = Storage.get();
    const ch = state.characters.find(c => c.id === id);
    if (!ch) return;
    alert(`Notes for ${ch.name}:\n\n${ch.notes}`);
  }

  return { openModal, save, delete: del, render, showNotes, syncMain, pickGender, pickHair, stepClothes, toggleSimple, chooseOwnPhoto };
})();

/* ── Remove field helper (global, used by HTML onclick) ── */
function removeField(fieldId) {
  const wrap = document.getElementById(`field-wrap-${fieldId}`);
  if (wrap) wrap.style.display = 'none';
}

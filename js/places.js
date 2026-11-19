/* ═══════════════════════════════════════════
   places.js — Places & Settings CRUD + rendering
   Type is a cascade of optional dropdowns:
   Residential Settings › Houses › Cottage
   ═══════════════════════════════════════════ */

const Places = (() => {

  const OTHER = '__other__';

  /* Object → has sub-groups, Array → final choices, null → nothing deeper */
  const TYPES = {
    'Residential Settings': {
      'Houses': ['Hut', 'Cottage', 'Bungalow', 'Farmhouse', 'Mansion', 'Cabin'],
      'Apartment': null,
      'Shared Accommodation': ['Dormitory', 'Shared Flat']
    },
    'Natural Settings': {
      'Forest': null,
      'Mountains': null,
      'Water Bodies': ['Ocean', 'Sea', 'Lake', 'River'],
      'Coastal Landscapes': ['Sandy Beach', 'Island'],
      'Open Landscapes': ['Meadow', 'Grassland', 'Countryside', 'Farmland', 'Flower Fields', 'Sandy Desert', 'Arctic Wilderness']
    },
    'Royal & Historical Settings': ['Palace', 'Throne Room', 'Royal Library', 'Palace Gardens', 'Stables', 'Hunting Grounds', 'Ancient City', 'Fort', 'Archaeological Site'],
    'Public & Social Settings': {
      'Food & Dining': ['Cafe', 'Restaurant', 'Bakery', 'Diner', 'Food Court'],
      'Hospitality': ['Hotel', 'Resort', 'Spa'],
      'Mall': null,
      'Arts & Culture': ['Museum', 'Art Gallery', 'Theatre', 'Concert Hall'],
      'Entertainment': ['Amusement Park', 'Carnival', 'Circus', 'Bowling Alley']
    },
    'Educational or Workplace Settings': {
      'Corporate': ['Corporate Office', 'Boardroom', 'Conference Room'],
      'Medical': ['Hospital', 'Clinic', 'Operating Theatre', 'Nursing Home'],
      'Law & Administration': ['Police Station', 'Courthouse', 'Prison'],
      'School': ['Classroom', 'Library', 'Laboratory', 'Faculty Quarters', 'Playground'],
      'College': ['Classroom', 'Library', 'Computer Lab', 'Faculty Quarters', 'Grounds']
    }
  };

  const kids = node => node == null ? [] : Array.isArray(node) ? node : Object.keys(node);
  const child = (node, name) => (node && !Array.isArray(node)) ? (node[name] ?? null) : null;

  let path = [];        // chosen value at each level (may contain OTHER)
  let otherText = '';   // text for whichever level chose "Other"

  /* ── One dropdown with hover fly-out menus ──
     Hover an item with ▸ to see the next layer beside it. */
  let menuEl = null;

  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener('pointerdown', outside, true);
  }
  function outside(e) {
    if (menuEl && !menuEl.contains(e.target) && !e.target.closest('.type-btn')) closeMenu();
  }

  function choose(p) {
    path = p;
    if (p[p.length - 1] !== OTHER) otherText = '';
    closeMenu();
    renderCascade();
  }

  function buildList(node, prefix) {
    const list = document.createElement('div');
    list.className = prefix.length ? 'type-sub' : 'type-list';
    [...kids(node), OTHER].forEach(n => {
      const here = [...prefix, n];
      const sub = n === OTHER ? null : child(node, n);
      const hasKids = kids(sub).length > 0;
      const row = document.createElement('div');
      row.className = 'type-row' + (path.join('|') === here.join('|') ? ' selected' : '') + (hasKids ? ' has-sub' : '');
      const label = document.createElement('span');
      label.className = 'type-row-label';
      label.textContent = n === OTHER ? 'Other' : n;
      row.appendChild(label);
      if (hasKids) {
        const arrow = document.createElement('span');
        arrow.className = 'type-row-arrow'; arrow.textContent = '▸';
        row.appendChild(arrow);
        const subList = buildList(sub, here);
        // touch screens have no hover: first row of the fly-out selects this level itself
        const self = document.createElement('div');
        self.className = 'type-row type-row-self';
        self.textContent = n + ' (this level)';
        self.onclick = e => { e.stopPropagation(); choose(here); };
        subList.insertBefore(self, subList.firstChild);
        row.appendChild(subList);
        row.addEventListener('mouseenter', () => {
          subList.classList.remove('flip');
          const r = subList.getBoundingClientRect();
          if (r.right > innerWidth - 8) subList.classList.add('flip');
          const r2 = subList.getBoundingClientRect();
          if (r2.bottom > innerHeight - 8) subList.style.top = Math.min(-5, innerHeight - 8 - r2.bottom - 5) + 'px';
        });
        row.addEventListener('click', e => {
          e.stopPropagation();
          const inner = e.target.closest('.type-sub');
          if (inner && row.contains(inner)) return;     // click was inside this row's own fly-out
          if (matchMedia('(hover: none)').matches) row.classList.toggle('open');
          else choose(here);
        });
      } else {
        row.addEventListener('click', e => { e.stopPropagation(); choose(here); });
      }
      list.appendChild(row);
    });
    return list;
  }

  function openMenu(btn) {
    if (menuEl) { closeMenu(); return; }
    menuEl = document.createElement('div');
    menuEl.className = 'pick-menu type-menu';
    const r = btn.getBoundingClientRect();
    menuEl.style.left = r.left + 'px';
    menuEl.style.width = r.width + 'px';
    menuEl.appendChild(buildList(TYPES, []));
    document.body.appendChild(menuEl);
    const h = menuEl.offsetHeight;
    if (innerHeight - r.bottom - 12 < h && r.top > h) menuEl.style.bottom = (innerHeight - r.top + 4) + 'px';
    else menuEl.style.top = (r.bottom + 4) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  }

  function renderCascade() {
    const box = document.getElementById('pf-type-cascade');
    if (!box) return;
    closeMenu();
    box.innerHTML = '';
    const isOther = path[path.length - 1] === OTHER;
    if (isOther) {
      /* "Other": the same box turns into a text field — no second box */
      const wrap = document.createElement('label');
      wrap.className = 'form-select type-other';
      const tag = document.createElement('span');
      tag.className = 'type-other-tag'; tag.textContent = 'Other';
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'type-other-input';
      inp.placeholder = '(you can add something of your own)';
      inp.value = otherText;
      const sync = () => { tag.style.display = inp.value ? 'none' : ''; };
      inp.addEventListener('input', () => { otherText = inp.value; sync(); });
      sync();
      wrap.appendChild(tag); wrap.appendChild(inp);
      box.appendChild(wrap);
      setTimeout(() => inp.focus(), 0);
    } else {
      const tp = typePath();
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'form-select type-btn' + (path.length ? '' : ' placeholder');
      btn.textContent = tp.length ? tp[tp.length - 1] : 'Select a type';
      btn.onclick = () => openMenu(btn);
      box.appendChild(btn);
    }

    if (path.length) {
      const clr = document.createElement('button');
      clr.type = 'button'; clr.className = 'type-clear'; clr.textContent = 'Clear type';
      clr.onclick = () => { path = []; otherText = ''; renderCascade(); };
      box.appendChild(clr);
    }
  }

  function typePath() {
    return path.map(p => p === OTHER ? otherText.trim() : p).filter(Boolean);
  }

  function loadType(place) {
    path = []; otherText = '';
    const saved = place ? (place.typePath || (place.type ? [place.type] : [])) : [];
    let node = TYPES;
    for (let i = 0; i < saved.length; i++) {
      if (kids(node).includes(saved[i])) { path[i] = saved[i]; node = child(node, saved[i]); }
      else { path[i] = OTHER; otherText = saved[i]; break; }
    }
    renderCascade();
  }

  /* ── Modal ── */
  function openModal(id = null) {
    const state = Storage.get();
    const isEdit = !!id;

    document.getElementById('place-modal-title').textContent = isEdit ? 'Edit Place' : 'New Place';
    document.getElementById('place-delete-btn').style.display = isEdit ? 'block' : 'none';
    document.getElementById('pf-editing-id').value = id || '';

    ['pdesc','patm','psensory','psig'].forEach(f => {
      const w = document.getElementById(`field-wrap-${f}`);
      if (w) w.style.display = '';
    });

    if (isEdit) {
      const pl = state.places.find(p => p.id === id);
      if (!pl) return;
      document.getElementById('pf-name').value = pl.name || '';
      document.getElementById('pf-desc').value = pl.desc || '';
      document.getElementById('pf-atmosphere').value = pl.atmosphere || '';
      document.getElementById('pf-sensory').value = pl.sensory || '';
      document.getElementById('pf-significance').value = pl.significance || '';
      loadType(pl);
    } else {
      ['pf-name','pf-desc','pf-atmosphere','pf-sensory','pf-significance'].forEach(i => { document.getElementById(i).value = ''; });
      loadType(null);
    }
    openModal_('place');
  }

  function save() {
    const name = document.getElementById('pf-name').value.trim();
    if (!name) { Toast.show('Please enter a place name.', 'error'); return; }

    const state = Storage.get();
    const editId = document.getElementById('pf-editing-id').value;
    const isEdit = !!editId;
    const tp = typePath();

    const data = {
      id: isEdit ? editId : Storage.uid(),
      name,
      typePath: tp,
      type: tp.join(' › '),
      desc: document.getElementById('pf-desc').value.trim(),
      atmosphere: document.getElementById('pf-atmosphere').value.trim(),
      sensory: document.getElementById('pf-sensory').value.trim(),
      significance: document.getElementById('pf-significance').value.trim(),
      createdAt: isEdit ? (state.places.find(p => p.id === editId)?.createdAt || Date.now()) : Date.now()
    };

    if (isEdit) {
      const idx = state.places.findIndex(p => p.id === editId);
      if (idx !== -1) state.places[idx] = data;
    } else {
      state.places.push(data);
    }

    Storage.save(state);
    closeModal('place');
    render();
    App.updateStats();
    App.markUnsaved();
    Toast.show(`${name} saved!`, 'success');
  }

  function del() {
    const id = document.getElementById('pf-editing-id').value;
    if (!id) return;
    const state = Storage.get();
    const pl = state.places.find(p => p.id === id);
    if (!confirm(`Delete "${pl?.name}"?`)) return;
    state.places = state.places.filter(p => p.id !== id);
    Photos.drop(id);
    Storage.save(state);
    closeModal('place');
    render();
    App.updateStats();
    App.markUnsaved();
    Toast.show('Place deleted.');
  }

  /* ── Card pictures ──
     A place's card shows images/places/<slug>.webp (or .jpg) for its type. We try the most specific type first
     (cottage), then its groups (houses → residential-settings). If nothing matches (e.g. a typed-in "Other" type), other.webp is used. */
  const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const imgCache = {};
  function tryUrl(u) {
    if (!(u in imgCache)) imgCache[u] = new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = u; });
    return imgCache[u];
  }
  async function findImage(path) {
    // most specific first; "<parent>-<type>" (e.g. college-classroom) beats plain "<type>"
    const names = [];
    for (let i = path.length - 1; i >= 0; i--) {
      if (i >= 1) names.push(`${slug(path[i - 1])}-${slug(path[i])}`);
      names.push(slug(path[i]));
    }
    for (const sl of names) {
      if (!sl) continue;
      for (const ext of ['webp', 'jpg']) { const u = `images/places/${sl}.${ext}`; if (await tryUrl(u)) return u; }
    }
    return 'other';          // nothing of its own: the themed default pin (see .place-pic-other)
  }
  function fillImages() {
    document.querySelectorAll('#place-grid .place-pic[data-path]').forEach(async img => {
      const path = JSON.parse(img.dataset.path || '[]');
      const url = img.dataset.custom || await findImage(path);
      if (url === 'other') {
        const d = document.createElement('div'); d.className = 'place-pic-other'; img.replaceWith(d);
      } else if (url) { img.src = url; img.hidden = false; }
    });
  }

  function render() {
    const state = Storage.get();
    const grid = document.getElementById('place-grid');
    if (!grid) return;

    const cards = state.places.map(pl => {
      const moodTags = (pl.atmosphere || '').split(',').map(a => a.trim()).filter(Boolean).slice(0, 4).map(a => `<span class="char-tag">${escHtml(a)}</span>`).join('');
      const tpath = pl.typePath && pl.typePath.length ? pl.typePath : (pl.type ? pl.type.split(' › ') : []);
      return `<div class="place-card">
  <div class="pic-wrap"><img class="place-pic" alt="" hidden data-path='${escHtml(JSON.stringify(tpath)).replace(/'/g, '&#39;')}' ${Photos.url(pl.id) ? `data-custom="${Photos.url(pl.id)}"` : ''}>${Photos.overlay('place', pl.id)}</div>
  <div class="place-body">
    ${pl.type ? `<div class="place-type-line">${escHtml((pl.typePath && pl.typePath.length ? pl.typePath[pl.typePath.length - 1] : pl.type.split(' › ').pop()))}</div>` : ''}
    <div class="place-name">${escHtml(pl.name)}</div>
    ${pl.desc ? `<div class="char-field"><div class="char-field-label">Description</div><div class="char-field-val" style="font-size:0.82rem">${escHtml(pl.desc.slice(0, 120))}${pl.desc.length > 120 ? '…' : ''}</div></div>` : ''}
    ${moodTags ? `<div class="char-tags" style="margin-top:6px">${moodTags}</div>` : ''}
  </div>
  <div class="place-actions">
    <button class="btn btn-sm" onclick="Places.openModal('${pl.id}')">Edit</button>
  </div>
</div>`;
    }).join('');

    grid.innerHTML = cards + `<div class="add-card" onclick="Places.openModal()"><div class="add-card-icon">+</div><div class="add-card-label">Add Place</div></div>`;

    document.getElementById('nav-place-count').textContent = state.places.length;
    fillImages();
  }

  return { openModal, save, delete: del, render };
})();

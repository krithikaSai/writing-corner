/* ═══════════════════════════════════════════
   calendar.js — Writing calendar (Overview)
   Days you wrote are filled in; hover a day to see how many words.
   Data: project.dailyWords = { 'YYYY-MM-DD': wordsWritten }
   ═══════════════════════════════════════════ */

const Calendar = (() => {
  let view = null;           // first day of the month being shown
  let tip = null;

  const pad = n => String(n).padStart(2, '0');
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['S','M','T','W','T','F','S'];

  /* Called by the editor whenever words are added (deleting never subtracts) */
  function addWords(state, delta) {
    if (!(delta > 0)) return;
    state.dailyWords = state.dailyWords || {};
    const k = key(new Date());
    state.dailyWords[k] = (state.dailyWords[k] || 0) + delta;
  }

  function level(n) { return n >= 1000 ? 4 : n >= 500 ? 3 : n >= 200 ? 2 : n > 0 ? 1 : 0; }

  function render() {
    const host = document.getElementById('writing-calendar');
    if (!host) return;
    const data = Storage.get().dailyWords || {};
    const today = new Date();
    if (!view) view = new Date(today.getFullYear(), today.getMonth(), 1);

    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();

    let cells = '';
    for (let i = 0; i < first; i++) cells += '<div class="cal-cell cal-empty"></div>';
    let monthWords = 0, monthDays = 0;
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${pad(m + 1)}-${pad(d)}`;
      const n = data[k] || 0;
      if (n) { monthWords += n; monthDays++; }
      const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate();
      const future = new Date(y, m, d) > new Date(today.getFullYear(), today.getMonth(), today.getDate());
      cells += `<div class="cal-cell cal-day cal-l${level(n)}${isToday ? ' cal-today' : ''}${future ? ' cal-future' : ''}" data-date="${MONTHS[m].slice(0, 3)} ${d}" data-words="${n}">${d}</div>`;
    }

    host.innerHTML = `
      <div class="cal-head">
        <button class="cal-nav" onclick="Calendar.shift(-1)" title="Previous month">‹</button>
        <div class="cal-month">${MONTHS[m]} ${y}</div>
        <button class="cal-nav" onclick="Calendar.shift(1)" title="Next month">›</button>
      </div>
      <div class="cal-grid">${DOW.map(d => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
      <div class="cal-foot">
        <span><strong>${monthWords.toLocaleString()}</strong> words this month</span>
        <span><strong>${monthDays}</strong> day${monthDays === 1 ? '' : 's'} written</span>
      </div>
      ${goalHtml(monthWords)}`;

    host.querySelectorAll('.cal-day').forEach(el => {
      el.addEventListener('mouseenter', () => showTip(el));
      el.addEventListener('mouseleave', hideTip);
    });
  }

  /* Monthly word goal: one number per project, compared with the month being shown */
  let editingGoal = false;
  function goalHtml(words) {
    const goal = +(Storage.get().monthlyGoal) || 0;
    if (editingGoal) return `
      <div class="cal-goal">
        <div class="cal-goal-edit">
          <label for="cal-goal-input">Words to write each month</label>
          <input id="cal-goal-input" class="form-input" type="number" min="1" step="1" value="${goal || ''}" placeholder="e.g. 20000"
                 onkeydown="if(event.key==='Enter')Calendar.saveGoal();if(event.key==='Escape')Calendar.editGoal(false)">
          <button class="btn btn-sm btn-primary" onclick="Calendar.saveGoal()">Set</button>
          <button class="btn btn-sm" onclick="Calendar.editGoal(false)">Cancel</button>
        </div>
      </div>`;
    if (!goal) return `
      <div class="cal-goal"><button class="cal-goal-link" onclick="Calendar.editGoal(true)">+ Set a monthly goal</button></div>`;
    const pct = Math.min(100, Math.round(words / goal * 100));
    return `
      <div class="cal-goal">
        <div class="cal-goal-top">
          <span><strong>${words.toLocaleString()}</strong> / ${goal.toLocaleString()} words</span>
          <span>${pct}%</span>
        </div>
        <div class="cal-goal-bar${words >= goal ? ' reached' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
        ${words >= goal ? '<div class="cal-goal-done">&#10003; Goal reached!</div>' : ''}
        <button class="cal-goal-link cal-goal-change" onclick="Calendar.editGoal(true)">Change</button>
      </div>`;
  }
  function editGoal(on) {
    editingGoal = on; render();
    if (on) { const i = document.getElementById('cal-goal-input'); if (i) { i.focus(); i.select(); } }
  }
  function saveGoal() {
    const v = Math.floor(+document.getElementById('cal-goal-input').value);
    const state = Storage.get();
    state.monthlyGoal = v > 0 ? v : 0;      // empty / 0 removes the goal
    Storage.save(state);
    if (typeof App !== 'undefined') App.markUnsaved();
    editingGoal = false; render();
  }

  function showTip(el) {
    hideTip();
    if (el.classList.contains('cal-future')) return;
    const n = +el.dataset.words;
    tip = document.createElement('div');
    tip.className = 'cal-tip';
    tip.textContent = n ? `${n.toLocaleString()} word${n === 1 ? '' : 's'} written` : 'Nothing written';
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8)) + 'px';
    tip.style.top = (r.top - tip.offsetHeight - 8) + 'px';
  }
  function hideTip() { if (tip) { tip.remove(); tip = null; } }

  function shift(n) { view = new Date(view.getFullYear(), view.getMonth() + n, 1); render(); }

  // Light refresh while typing (cheap: only when the Overview is visible)
  let t = null;
  function refresh() {
    clearTimeout(t);
    t = setTimeout(() => { if (document.getElementById('panel-overview')?.classList.contains('active')) render(); }, 400);
  }
  function reset() { view = null; }

  return { render, addWords, shift, refresh, reset, editGoal, saveGoal };
})();

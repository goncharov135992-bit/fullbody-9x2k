/* Fullbody - офлайн-дневник тренировок */

const BASE = {
  1: [
    ['Жим штанги лёжа', 'base'],
    ['Тяга штанги к поясу', 'base'],
    ['Выпады', 'base'],
    ['Подъём штанги на бицепс', 'iso'],
    ['Жим гантелей/штанги над головой', 'iso'],
    ['Разгибание трицепса в блоке', 'iso']
  ],
  2: [
    ['Жим гантелей лёжа на наклонной 45°', 'base'],
    ['Подтягивания параллельным хватом', 'base'],
    ['Присед со штангой', 'base'],
    ['Подъём гантель на бицепс', 'iso'],
    ['Разведение гантелей в стороны', 'iso'],
    ['Разгибание гантели над головой на трицепс', 'iso']
  ],
  3: [
    ['Отжимания на брусьях', 'base'],
    ['Тяга гантели к поясу', 'base'],
    ['Румынская тяга', 'base'],
    ['Бицепс с упором в колено', 'iso'],
    ['Тяга штанги к подбородку', 'iso'],
    ['Французский жим', 'iso']
  ]
};

const WEEKS = {
  1: { baseSets: 2, baseReps: '8-10',  isoSets: 2, isoReps: '12-16', reserve: '1-2' },
  2: { baseSets: 3, baseReps: '8-10',  isoSets: 2, isoReps: '12-16', reserve: '1-2' },
  3: { baseSets: 3, baseReps: '8-10',  isoSets: 2, isoReps: '12-16', reserve: '0-1' },
  4: { baseSets: 3, baseReps: '6-8',   isoSets: 2, isoReps: '10-12', reserve: '0-1' }
};

const STORE_DRAFT = 'fb_draft_';
const STORE_SESSIONS = 'fb_sessions';
const STORE_LAST = 'fb_last';
const STORE_HINT = 'fb_hint_hidden';

const $ = (sel) => document.querySelector(sel);

function pluralSets(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'подход';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'подхода';
  return 'подходов';
}

function buildProgram() {
  const program = [];
  for (let week = 1; week <= 4; week++) {
    const p = WEEKS[week];
    for (let num = 1; num <= 3; num++) {
      const exercises = BASE[num].map(([name, kind]) => {
        const sets = kind === 'base' ? p.baseSets : p.isoSets;
        const reps = kind === 'base' ? p.baseReps : p.isoReps;
        return { name, sets, reps };
      });
      program.push({
        id: `w${week}t${num}`,
        week,
        num,
        title: `Неделя ${week} · Тренировка ${num}`,
        reserve: p.reserve,
        exercises
      });
    }
  }
  return program;
}

const PROGRAM = buildProgram();

let state = {
  week: 1,
  workout: 1,
  tab: 'workout'
};

const REST_DEFAULT = 90;
let rest = { visible: false, paused: false, done: false, endsAt: 0, remaining: 0, duration: REST_DEFAULT, interval: null, hideTimer: null };
let audioCtx = null;

function loadLast() {
  try {
    const raw = localStorage.getItem(STORE_LAST);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.week >= 1 && saved.week <= 4) state.week = saved.week;
    if (saved.workout >= 1 && saved.workout <= 3) state.workout = saved.workout;
  } catch (e) {}
}

function saveLast() {
  try { localStorage.setItem(STORE_LAST, JSON.stringify({ week: state.week, workout: state.workout })); } catch (e) {}
}

function currentWorkout() {
  return PROGRAM.find(w => w.week === state.week && w.num === state.workout);
}

function draftKey(id) { return STORE_DRAFT + id; }

function loadDraft(workout) {
  try {
    const raw = localStorage.getItem(draftKey(workout.id));
    if (raw) {
      const draft = JSON.parse(raw);
      if (isValidDraft(draft, workout)) return draft;
    }
  } catch (e) {}
  return makeEmptyDraft(workout);
}

function isValidDraft(draft, workout) {
  if (!draft || !Array.isArray(draft.sets) || draft.sets.length !== workout.exercises.length) return false;
  return draft.sets.every((ex, i) => Array.isArray(ex) && ex.length === workout.exercises[i].sets);
}

function makeEmptyDraft(workout) {
  return {
    sets: workout.exercises.map(ex => Array.from({ length: ex.sets }, () => ({ w: '', r: '', done: false })))
  };
}

function saveDraft(workout, draft) {
  try { localStorage.setItem(draftKey(workout.id), JSON.stringify(draft)); } catch (e) {}
}

function clearDraft(workout) {
  try { localStorage.removeItem(draftKey(workout.id)); } catch (e) {}
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORE_SESSIONS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveSessions(sessions) {
  try { localStorage.setItem(STORE_SESSIONS, JSON.stringify(sessions)); } catch (e) {}
}

let draft = null;
let activeWorkout = null;

function init() {
  loadLast();
  activeWorkout = currentWorkout();
  draft = loadDraft(activeWorkout);
  renderWeekChips();
  renderWorkoutTabs();
  renderNote();
  renderExercises();
  renderToday();
  updateProgress();
  renderPlan();
  bindEvents();
  registerSW();
}

function renderToday() {
  const now = new Date();
  const text = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).format(now);
  $('#todayLabel').textContent = text.charAt(0).toUpperCase() + text.slice(1);
}

function renderWeekChips() {
  const box = $('#weekChips');
  $('#weekBadge').textContent = `Неделя ${state.week}`;
  box.innerHTML = '';
  for (let w = 1; w <= 4; w++) {
    const b = document.createElement('button');
    b.className = 'chip' + (w === state.week ? ' active' : '');
    b.type = 'button';
    b.textContent = `Неделя ${w}`;
    b.addEventListener('click', () => selectWeek(w));
    box.appendChild(b);
  }
}

function renderWorkoutTabs() {
  const box = $('#workoutTabs');
  box.innerHTML = '';
  for (let n = 1; n <= 3; n++) {
    const b = document.createElement('button');
    b.className = 'wtab' + (n === state.workout ? ' active' : '');
    b.type = 'button';
    b.textContent = `Тренировка ${n}`;
    b.addEventListener('click', () => selectWorkout(n));
    box.appendChild(b);
  }
}

function renderNote() {
  const box = $('#noteBox');
  box.innerHTML = `<b>Разминка:</b> 5 минут ходьбы на дорожке.<br><b>Повторения:</b> оставлять ${activeWorkout.reserve} повтора в запасе.`;
}

function renderExercises() {
  const list = $('#exerciseList');
  list.innerHTML = '';

  activeWorkout.exercises.forEach((ex, exIndex) => {
    const card = document.createElement('div');
    card.className = 'exercise';

    const head = document.createElement('div');
    head.className = 'exercise-head';
    head.innerHTML = `
      <div>
        <div class="exercise-name"></div>
        <div class="exercise-target">${ex.sets} ${pluralSets(ex.sets)}, ${ex.reps} повторений</div>
      </div>
      <div class="exercise-count" data-count="${exIndex}"></div>
    `;
    head.querySelector('.exercise-name').textContent = ex.name;
    card.appendChild(head);

    const sets = document.createElement('div');
    sets.className = 'sets';

    const labels = document.createElement('div');
    labels.className = 'set-labels';
    labels.innerHTML = '<span></span><span>кг</span><span></span><span>раз</span><span></span>';
    sets.appendChild(labels);

    for (let s = 0; s < ex.sets; s++) {
      const row = document.createElement('div');
      row.className = 'set-row' + (draft.sets[exIndex][s].done ? ' done' : '');
      row.dataset.ex = exIndex;
      row.dataset.set = s;

      const idx = document.createElement('div');
      idx.className = 'set-index';
      idx.textContent = s + 1;

      const weight = document.createElement('input');
      weight.type = 'number';
      weight.inputMode = 'decimal';
      weight.step = '0.5';
      weight.min = '0';
      weight.placeholder = '';
      weight.value = draft.sets[exIndex][s].w;
      weight.dataset.field = 'w';
      weight.setAttribute('aria-label', `${ex.name}, подход ${s + 1}, вес`);

      const x = document.createElement('div');
      x.className = 'set-x';
      x.textContent = '×';

      const reps = document.createElement('input');
      reps.type = 'number';
      reps.inputMode = 'numeric';
      reps.step = '1';
      reps.min = '0';
      reps.placeholder = '';
      reps.value = draft.sets[exIndex][s].r;
      reps.dataset.field = 'r';
      reps.setAttribute('aria-label', `${ex.name}, подход ${s + 1}, повторы`);

      const check = document.createElement('button');
      check.type = 'button';
      check.className = 'check';
      check.setAttribute('aria-label', 'Отметить подход');
      check.setAttribute('aria-pressed', draft.sets[exIndex][s].done ? 'true' : 'false');
      check.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      check.dataset.field = 'done';

      row.append(idx, weight, x, reps, check);
      sets.appendChild(row);
    }

    card.appendChild(sets);
    list.appendChild(card);
  });

  updateExerciseCounts();
}

function updateExerciseCounts() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const exIndex = Number(el.dataset.count);
    const total = activeWorkout.exercises[exIndex].sets;
    const done = draft.sets[exIndex].filter(s => s.done).length;
    el.textContent = `${done}/${total}`;
  });
}

function updateProgress() {
  let total = 0;
  let done = 0;
  activeWorkout.exercises.forEach((ex, i) => {
    total += ex.sets;
    done += draft.sets[i].filter(s => s.done).length;
  });
  const pct = total ? Math.round(done / total * 100) : 0;
  $('#progressLabel').textContent = `${done} из ${total}`;
  $('#progressPercent').textContent = `${pct}%`;
  $('#progressFill').style.width = `${pct}%`;
  $('#finishBtn').disabled = done === 0;
}

function selectWeek(w) {
  if (w === state.week) return;
  state.week = w;
  state.workout = 1;
  saveLast();
  switchWorkout();
}

function selectWorkout(n) {
  if (n === state.workout) return;
  state.workout = n;
  saveLast();
  switchWorkout();
}

function switchWorkout() {
  activeWorkout = currentWorkout();
  draft = loadDraft(activeWorkout);
  renderWeekChips();
  renderWorkoutTabs();
  renderNote();
  renderExercises();
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onListInput(event) {
  const input = event.target;
  if (!input.matches('input[data-field]')) return;
  const row = input.closest('.set-row');
  const exIndex = Number(row.dataset.ex);
  const setIndex = Number(row.dataset.set);
  const field = input.dataset.field;
  let value = input.value;
  if (field === 'w') value = value.replace(',', '.');
  draft.sets[exIndex][setIndex][field] = value;
  saveDraft(activeWorkout, draft);
}

function onListClick(event) {
  const btn = event.target.closest('.check');
  if (!btn) return;
  const row = btn.closest('.set-row');
  const exIndex = Number(row.dataset.ex);
  const setIndex = Number(row.dataset.set);
  const cell = draft.sets[exIndex][setIndex];
  cell.done = !cell.done;
  row.classList.toggle('done', cell.done);
  btn.setAttribute('aria-pressed', cell.done ? 'true' : 'false');
  saveDraft(activeWorkout, draft);
  updateProgress();
  updateExerciseCounts();
  if (cell.done) startRest(REST_DEFAULT);
}

function finishWorkout() {
  const totals = countDone();
  if (totals.done === 0) {
    showToast('Отметь хотя бы один подход');
    return;
  }

  const session = {
    id: `${activeWorkout.id}-${Date.now()}`,
    date: new Date().toISOString(),
    workoutId: activeWorkout.id,
    week: activeWorkout.week,
    num: activeWorkout.num,
    title: activeWorkout.title,
    exercises: activeWorkout.exercises.map((ex, i) => ({
      name: ex.name,
      sets: draft.sets[i].map(s => ({ w: s.w, r: s.r, done: s.done }))
    }))
  };

  const sessions = loadSessions();
  sessions.unshift(session);
  saveSessions(sessions);
  clearDraft(activeWorkout);
  draft = makeEmptyDraft(activeWorkout);
  skipRest();
  renderExercises();
  updateProgress();
  showToast('Тренировка сохранена');
  renderHistory();
  renderPlan();
}

function countDone() {
  let done = 0;
  let total = 0;
  activeWorkout.exercises.forEach((ex, i) => {
    total += ex.sets;
    done += draft.sets[i].filter(s => s.done).length;
  });
  return { done, total };
}

function sessionTonnage(session) {
  let tonnage = 0;
  session.exercises.forEach(ex => {
    ex.sets.forEach(s => {
      const w = parseFloat(String(s.w).replace(',', '.'));
      const r = parseFloat(String(s.r).replace(',', '.'));
      if (s.done && isFinite(w) && isFinite(r)) tonnage += w * r;
    });
  });
  return Math.round(tonnage);
}

function sessionDoneSets(session) {
  let n = 0;
  session.exercises.forEach(ex => ex.sets.forEach(s => { if (s.done) n++; }));
  return n;
}

function formatDate(iso) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

function renderHistory() {
  const list = $('#historyList');
  const empty = $('#historyEmpty');
  const sessions = loadSessions();
  list.innerHTML = '';
  empty.style.display = sessions.length ? 'none' : 'block';

  sessions.forEach(session => {
    const card = document.createElement('div');
    card.className = 'session';

    const done = sessionDoneSets(session);
    const tonnage = sessionTonnage(session);

    const top = document.createElement('div');
    top.className = 'session-top';
    top.innerHTML = `
      <div>
        <div class="session-title"></div>
        <div class="session-date"></div>
      </div>
      <div class="session-sum">${done} ${pluralSets(done)}${tonnage ? ` · ${tonnage} кг` : ''}</div>
    `;
    top.querySelector('.session-title').textContent = session.title;
    top.querySelector('.session-date').textContent = formatDate(session.date);
    card.appendChild(top);

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Подробно';
    details.appendChild(summary);

    const lines = document.createElement('div');
    lines.className = 'session-lines';

    session.exercises.forEach(ex => {
      const parts = ex.sets
        .filter(s => s.done || s.w || s.r)
        .map(s => `${s.w || '?'}×${s.r || '?'}`);
      const row = document.createElement('div');
      row.className = 'session-line';
      row.innerHTML = `<span></span><span></span>`;
      row.children[0].textContent = ex.name;
      row.children[1].textContent = parts.length ? parts.join(', ') : '—';
      lines.appendChild(row);
    });

    details.appendChild(lines);
    card.appendChild(details);
    list.appendChild(card);
  });
}

function totalSets(workout) {
  return workout.exercises.reduce((sum, ex) => sum + ex.sets, 0);
}

function shortDate(iso) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '');
}

function workoutState(workout) {
  const d = loadDraft(workout);
  let done = 0;
  let total = 0;
  workout.exercises.forEach((ex, i) => {
    total += ex.sets;
    done += d.sets[i].filter(s => s.done).length;
  });
  if (done > 0) return { type: 'partial', label: `${done}/${total}` };
  const sessions = loadSessions().filter(s => s.workoutId === workout.id);
  if (sessions.length) {
    const last = sessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return { type: 'done', label: shortDate(last.date) };
  }
  return { type: 'new', label: 'не начата' };
}

function renderPlan() {
  const box = $('#planList');
  if (!box) return;
  box.innerHTML = '';
  const sessions = loadSessions();
  const doneIds = new Set(sessions.map(s => s.workoutId));
  $('#planSummary').textContent = `${doneIds.size} из 12 тренировок`;

  for (let week = 1; week <= 4; week++) {
    const workouts = PROGRAM.filter(w => w.week === week);
    const weekDone = workouts.filter(w => doneIds.has(w.id)).length;
    const card = document.createElement('div');
    card.className = 'week-card';

    const top = document.createElement('div');
    top.className = 'week-top';
    top.innerHTML = `<div class="week-name">Неделя ${week}</div><div class="week-done">${weekDone} из 3</div>`;
    card.appendChild(top);

    workouts.forEach(w => {
      const st = workoutState(w);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'plan-item' + (w.week === state.week && w.num === state.workout ? ' current' : '');
      item.innerHTML = `
        <div class="plan-num">${w.num}</div>
        <div class="plan-body">
          <div class="plan-title">Тренировка ${w.num}</div>
          <div class="plan-meta">${w.exercises.length} упражнений · ${totalSets(w)} подходов</div>
        </div>
        <div class="plan-status ${st.type}">${st.label}</div>
        <div class="plan-chevron">›</div>
      `;
      item.addEventListener('click', () => {
        state.week = w.week;
        state.workout = w.num;
        saveLast();
        switchWorkout();
        switchTab('workout');
      });
      card.appendChild(item);
    });

    box.appendChild(card);
  }
}

function restRemainingMs() {
  if (!rest.visible) return 0;
  if (rest.paused) return rest.remaining;
  return Math.max(0, rest.endsAt - Date.now());
}

function formatRest(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function paintRest() {
  const bar = $('#restBar');
  if (!bar) return;
  bar.hidden = !rest.visible;
  if (!rest.visible) return;
  $('#restTime').textContent = formatRest(restRemainingMs());
  $('#restToggle').textContent = rest.done ? 'Ок' : (rest.paused ? 'Старт' : 'Пауза');
  $('#restLabel').textContent = rest.done ? 'Отдых закончен' : (rest.paused ? 'Пауза' : 'Отдых');
  bar.classList.toggle('done', rest.done);
}

function startRest(seconds) {
  ensureAudio();
  const dur = seconds || REST_DEFAULT;
  clearTimeout(rest.hideTimer);
  rest.visible = true;
  rest.done = false;
  rest.paused = false;
  rest.duration = dur;
  rest.remaining = dur * 1000;
  rest.endsAt = Date.now() + dur * 1000;
  if (rest.interval) clearInterval(rest.interval);
  rest.interval = setInterval(tickRest, 250);
  paintRest();
}

function tickRest() {
  if (!rest.visible || rest.done) return;
  if (restRemainingMs() <= 0) {
    finishRest();
    return;
  }
  paintRest();
}

function finishRest() {
  rest.done = true;
  rest.paused = false;
  rest.remaining = 0;
  if (rest.interval) {
    clearInterval(rest.interval);
    rest.interval = null;
  }
  paintRest();
  beepRest();
  if (navigator.vibrate) {
    try { navigator.vibrate([120, 80, 120]); } catch (e) {}
  }
  clearTimeout(rest.hideTimer);
  rest.hideTimer = setTimeout(() => {
    rest.visible = false;
    paintRest();
  }, 4000);
}

function toggleRest() {
  if (rest.done) {
    rest.visible = false;
    paintRest();
    return;
  }
  if (rest.paused) {
    rest.endsAt = Date.now() + rest.remaining;
    rest.paused = false;
    ensureAudio();
  } else {
    rest.remaining = Math.max(0, rest.endsAt - Date.now());
    rest.paused = true;
  }
  paintRest();
}

function addRest(seconds) {
  if (!rest.visible || rest.done) return;
  if (rest.paused) rest.remaining = Math.max(0, rest.remaining + seconds * 1000);
  else rest.endsAt += seconds * 1000;
  paintRest();
}

function skipRest() {
  rest.visible = false;
  rest.done = false;
  rest.paused = false;
  if (rest.interval) {
    clearInterval(rest.interval);
    rest.interval = null;
  }
  clearTimeout(rest.hideTimer);
  paintRest();
}

function ensureAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}

function beepRest() {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [880, 1174].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = t0 + i * 0.22;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch (e) {}
}

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const isWorkout = tab === 'workout';
  $('#workoutView').hidden = !isWorkout;
  $('#planView').hidden = tab !== 'plan';
  $('#historyView').hidden = tab !== 'history';
  $('#progressBar').style.display = isWorkout ? '' : 'none';
  document.querySelector('.bottombar').style.display = isWorkout ? '' : 'none';
  if (tab === 'plan') {
    renderPlan();
    const current = document.querySelector('.plan-item.current');
    if (current) setTimeout(() => current.scrollIntoView({ block: 'center' }), 50);
  }
  if (tab === 'history') renderHistory();
  window.scrollTo({ top: 0 });
}

function exportData() {
  const data = {
    app: 'fullbody',
    version: 1,
    exported: new Date().toISOString(),
    sessions: loadSessions()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fullbody-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      const incoming = Array.isArray(data) ? data : data.sessions;
      if (!Array.isArray(incoming)) throw new Error('bad');
      const sessions = loadSessions();
      const ids = new Set(sessions.map(s => s.id));
      let added = 0;
      incoming.forEach(s => {
        if (s && s.id && !ids.has(s.id)) {
          sessions.push(s);
          ids.add(s.id);
          added++;
        }
      });
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      saveSessions(sessions);
      renderHistory();
      showToast(`Импортировано: ${added}`);
    } catch (e) {
      showToast('Не удалось прочитать файл');
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm('Удалить все тренировки и отметки? Это действие нельзя отменить.')) return;
  try {
    Object.keys(localStorage).filter(k => k.startsWith(STORE_DRAFT)).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(STORE_SESSIONS);
    localStorage.removeItem(STORE_LAST);
  } catch (e) {}
  draft = makeEmptyDraft(activeWorkout);
  renderExercises();
  updateProgress();
  renderHistory();
  showToast('Данные сброшены');
}

function bindEvents() {
  $('#exerciseList').addEventListener('input', onListInput);
  $('#exerciseList').addEventListener('click', onListClick);
  $('#finishBtn').addEventListener('click', finishWorkout);
  $('#restBar').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-rest]');
    if (!btn) return;
    const value = btn.dataset.rest;
    if (value === 'toggle') toggleRest();
    else if (value === 'skip') skipRest();
    else addRest(Number(value));
  });
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#exportBtn').addEventListener('click', exportData);
  $('#importInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });
  $('#resetBtn').addEventListener('click', resetAll);
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

init();

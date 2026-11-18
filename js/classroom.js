// Classroom features of the student app: class lists, help request, teacher comments on blocks,
// live class commands (message, pause, closed access), exams and program history.
'use strict';

const CR = {
  roster: null, classStatus: {},
  helpSince: 0,
  notes: [], applied: [], toasted: new Set(LS.get(STORAGE + 'notesSeen', [])),
  seenMsg: LS.get(STORAGE + 'seenMsg', ''),
  exam: null, examCh: null, examOver: false,
  lastVersion: {}, lastVersionAt: {}, myClass: null,
};

// ---------- Class lists (edited by the teacher in the dashboard; js/roster.js is the default) ----------
const currentRoster = () => CR.roster || ROSTER;
async function loadRoster() {
  const [r, c] = await Promise.all([Sync.getJson('api/roster'), Sync.getJson('api/classctl')]);
  CR.rosterFailed = !r;
  if (r) CR.roster = r.roster && Object.keys(r.roster).length ? r.roster : null; // no answer: keep the last lists
  if (c) CR.classStatus = c.classes || {};
}
const classClosed = (cls) => !!(CR.classStatus[cls] && CR.classStatus[cls].closed);

// ---------- Where the student is (for the teacher) ----------
function whereText() {
  if (App.exam) return `📝 Exam · ${chTitle(App.examCh)}`;
  if (App.mode === 'challenge' && App.challenge) return `Challenge ${CHALLENGES.indexOf(App.challenge) + 1}: ${chTitle(App.challenge.id)}`;
  return 'Free programming';
}
const chTitle = (id) => { const c = CHALLENGES.find((x) => x.id === id); return c ? c.title.replace(/^\d+\.\s*/, '') : id; };
const currentSlotId = () => (App.exam ? `${App.exam.id}-${App.examCh}` : App.mode === 'challenge' && App.challenge ? App.challenge.id : 'free');

// ---------- 🙋 Help request ----------
function renderHelpButton() {
  const b = $('btnHelpMe');
  b.classList.toggle('waiting', !!CR.helpSince);
  b.textContent = CR.helpSince ? (CR.helpPos ? `🙋 Help: you are n° ${CR.helpPos} · cancel` : '🙋 Help requested · cancel') : '🙋 I need help';
  b.title = CR.helpSince ? `Your teacher has your request${CR.helpQueue && CR.helpQueue.length ? ' (waiting list: ' + CR.helpQueue.map((h) => h.name).join(', ') + ')' : ''}. Click to cancel it.` : 'Ask your teacher for help';
  renderHelpQueue();
}
// The waiting list of the class (who asked for help, in order), shown to a student who is waiting.
function renderHelpQueue() {
  const box = $('helpQueue');
  const q = CR.helpQueue || [];
  // shown for a few seconds when the student asks and each time their place changes (or on hovering the button)
  box.hidden = !CR.helpSince || !q.length || App.preview || Date.now() > (CR.helpShowUntil || 0);
  if (box.hidden) return;
  const ago = (t) => { const m = Math.max(0, Math.round((CR.helpNow - t) / 60)); return m < 1 ? 'just now' : m + ' min'; };
  // under the header, at the right of the program area: never over Run / Stop or the simulator
  const r = $('btnHelpMe').getBoundingClientRect();
  box.style.top = Math.round(r.bottom + 8) + 'px';
  box.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 336))) + 'px';
  box.innerHTML = `<h4>🙋 Waiting list for help</h4><ol>${q.map((h) => `<li class="${h.me ? 'me' : ''}">${esc(h.name || '?')}${h.me ? ' (you)' : ''} <span class="muted" style="display:inline">· ${ago(h.since)}</span></li>`).join('')}</ol>
    <span class="muted">Your teacher comes in this order. Keep trying while you wait!</span>`;
}
async function pollHelpQueue() {
  if (!CR.helpSince || !Progress.data || !Sync.online || Sync.disabled) return;
  const d = await Sync.getJson(`api/help/queue?studentId=${encodeURIComponent(Progress.data.studentId)}&className=${encodeURIComponent(Progress.data.className || '')}`);
  if (!d || !CR.helpSince) return;
  const before = JSON.stringify((CR.helpQueue || []).map((h) => h.name));
  CR.helpQueue = d.queue || [];
  CR.helpNow = d.now || Date.now() / 1000;
  if (JSON.stringify(CR.helpQueue.map((h) => h.name)) !== before) CR.helpShowUntil = Date.now() + 8000;
  const k = CR.helpQueue.findIndex((h) => h.me);
  // no longer in the list: the teacher has handled the request
  if (k < 0 && CR.helpNow - CR.helpSince > 8) { CR.helpSince = 0; CR.helpPos = 0; renderHelpButton(); toast('👩‍🏫 Your teacher has seen your request.'); return; }
  CR.helpPos = k + 1;
  renderHelpButton();
}
async function restoreHelp() {
  if (!Progress.data || CR.helpSince) return;
  const d = await Sync.getJson(`api/help/queue?studentId=${encodeURIComponent(Progress.data.studentId)}&className=${encodeURIComponent(Progress.data.className || '')}`);
  const me = d && (d.queue || []).find((h) => h.me);
  if (!me || CR.helpSince) return;
  CR.helpSince = me.since;
  renderHelpButton();
  pollHelpQueue();
}
async function toggleHelp() {
  if (!Progress.data) return;
  if (!Sync.online) { toast('Not connected to the class server: raise your hand 🙂'); return; }
  if (CR.helpSince) {
    CR.helpSince = 0;
    CR.helpPos = 0;
    renderHelpButton();
    await Sync.post('api/help', { studentId: Progress.data.studentId, on: false });
    return;
  }
  const r = await Sync.post('api/help', { studentId: Progress.data.studentId, on: true, name: Progress.data.name, className: Progress.data.className, where: whereText() });
  if (!r) { toast('Could not reach your teacher: raise your hand 🙂'); return; }
  CR.helpSince = r.since;
  CR.helpPos = 0;
  CR.helpQueue = [];
  Progress.log('help', App.mode === 'challenge' && App.challenge ? App.challenge.id : null);
  renderHelpButton();
  pollHelpQueue();
  toast('🙋 Your teacher got your request. Keep trying while you wait!');
}
Sync.onHelpDone = (t) => {
  if (CR.helpSince && t >= CR.helpSince - 1) {
    CR.helpSince = 0;
    CR.helpPos = 0;
    renderHelpButton();
    toast('👩‍🏫 Your teacher has seen your request.');
  }
};

// ---------- 💬 Teacher comments pinned to blocks ----------
Sync.onNotesRev = async () => {
  if (!Progress.data) return;
  const d = await Sync.getJson('api/notes/' + Progress.data.studentId);
  if (!d) return;
  CR.notes = d.notes || [];
  const fresh = CR.notes.filter((n) => !n.done && !CR.toasted.has(n.id));
  if (fresh.length) {
    fresh.forEach((n) => CR.toasted.add(n.id));
    LS.set(STORAGE + 'notesSeen', [...CR.toasted].slice(-200));
    toast(`💬 Your teacher left ${fresh.length > 1 ? fresh.length + ' comments' : 'a comment'} on your blocks.`, 5000);
    brick.sound.play('fx:beep');
  }
  applyNotes();
};
function applyNotes() {
  if (!ws) return;
  for (const { blockId, key } of CR.applied) { const b = ws.getBlockById(blockId); if (b) b.setWarningText(null, key); }
  CR.applied = [];
  const slot = currentSlotId();
  const here = CR.notes.filter((n) => !n.done && n.slot === slot);
  for (const n of here) {
    const b = ws.getBlockById(n.blockId);
    if (b) { b.setWarningText('👩‍🏫 ' + n.text, 'note-' + n.id); CR.applied.push({ blockId: n.blockId, key: 'note-' + n.id }); }
  }
  const others = App.exam ? [] : CR.notes.filter((n) => !n.done && n.slot !== slot); // no distraction during an exam
  const box = $('notesPanel');
  box.hidden = !here.length && !others.length;
  box.innerHTML = `<h3>💬 Comments from your teacher</h3>${here.map((n) => `<div class="note">
      <div class="note-text">${esc(n.text)}</div>
      <div class="note-actions">${ws.getBlockById(n.blockId) ? `<button class="mini" data-note-show="${esc(n.id)}">Show the block</button>` : '<span class="muted">(this block was deleted)</span>'}
      <button class="mini primary" data-note-done="${esc(n.id)}">Got it ✓</button></div></div>`).join('')}
    ${others.length ? `<div class="muted">Also ${others.length} comment${others.length > 1 ? 's' : ''} on: ${[...new Set(others.map((n) => slotLabel(n.slot)))].map(esc).join(', ')}</div>` : ''}`;
  box.querySelectorAll('[data-note-show]').forEach((b) => {
    b.onclick = () => { const n = CR.notes.find((x) => x.id === b.dataset.noteShow); const blk = n && ws.getBlockById(n.blockId); if (blk) { ws.centerOnBlock(blk.id); blk.select(); } };
  });
  box.querySelectorAll('[data-note-done]').forEach((b) => {
    b.onclick = async () => {
      const r = await Sync.post('api/notes', { studentId: Progress.data.studentId, action: 'done', noteId: b.dataset.noteDone });
      if (r) { CR.notes = r.notes; Sync.notesRev = undefined; applyNotes(); }
    };
  });
}
const slotLabel = (slot) => (slot === 'free' ? 'free programming' : chTitle(slot));

// ---------- 🎛 Live class commands: message, pause, closed access, exam ----------
Sync.onClassCtl = (ctl) => {
  if (!Progress.data) return;
  const m = ctl.message;
  if (m && m.id !== CR.seenMsg && Sync.now() / 1000 - m.at < 3 * 3600) {
    CR.seenMsg = m.id;
    LS.set(STORAGE + 'seenMsg', m.id);
    openModal(`<h2>📢 Message from your teacher</h2><p class="teacher-msg">${esc(m.text)}</p><div style="text-align:right"><button class="primary" onclick="closeModal()">OK</button></div>`);
    brick.sound.play('fx:beep');
    log('📢 Teacher: ' + m.text, 'success');
  }
  if (ctl.paused && $('pauseOverlay').hidden && App.status !== 'idle') stopProgram();
  $('pauseOverlay').hidden = !ctl.paused;
  if (ctl.closed && $('closedOverlay').hidden && App.status !== 'idle') stopProgram();
  $('closedOverlay').hidden = !ctl.closed;
  handleExam(ctl.exam || null);
};

// ---------- 📝 Exams ----------
const examLive = (e) => e && e.active && Sync.now() < e.endsAt * 1000;
function handleExam(e) {
  if (e && Progress.data.className && e.className !== Progress.data.className) e = null;
  CR.openExam = examLive(e) ? e : null;
  if (App.exam && App.exam.practice) {
    // during the blank test: a real test that starts asks for its password (the blank test stops if the student joins)
    if (examLive(e) && ((Progress.data.exams || {})[e.id] || {}).joined) startExam(e);
    else if (examLive(e) && CR.askedExam !== e.id) { CR.askedExam = e.id; askTestCode(e); }
    return;
  }
  if (examLive(e)) {
    if (App.exam && App.exam.id === e.id) App.exam = e;
    else if (((Progress.data.exams || {})[e.id] || {}).joined) startExam(e); // already opened with the password (page reloaded)
    else if (CR.askedExam !== e.id) { CR.askedExam = e.id; askTestCode(e); }
    return;
  }
  if (!App.exam) return;
  if (e && e.id === App.exam.id) { if (!CR.examOver) finishExam(); } else leaveExam();
}
// The test opens with the test password of the class (the teacher gives it at the start).
function askTestCode(e, onOk) {
  openModal(`<h2>📝 Test</h2><p>${e ? `<b>${esc(e.title)}</b> · ${e.minutes} min. ` : ''}Type the <b>test password</b> your teacher gives you.</p>
    <div class="wcode"><input id="tCode" autocomplete="off" inputmode="numeric" placeholder="password"><button class="primary" id="tCodeGo">Start the test</button></div>
    <p id="tCodeErr" class="werr"></p><div style="text-align:right"><button onclick="closeModal()">Cancel</button></div>`);
  const input = $('tCode'), go = $('tCodeGo');
  input.focus();
  const submit = async () => {
    const code = input.value.trim();
    if (!code) { input.focus(); return; }
    go.disabled = true;
    $('tCodeErr').textContent = '';
    try {
      const cls = Progress.data ? Progress.data.className : $('wClass').value.trim();
      const body = { testCode: code, className: cls };
      if (Progress.data) Object.assign(body, { studentId: Progress.data.studentId, name: Progress.data.name });
      const r = await sfetch('api/exam/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (d.finished && Progress.data) { closeModal(); examEntry(d.exam || e).done = Date.now(); joinExam(d.exam || e); return; }
      if (!r.ok) { $('tCodeErr').textContent = d.error || 'The class server does not answer. Try again.'; return; }
      closeModal();
      if (onOk) await onOk(code, d.exam);
      else joinExam(d.exam);
    } catch (err) { $('tCodeErr').textContent = 'The class server does not answer. Try again.'; } finally { go.disabled = false; }
  };
  go.onclick = submit;
  input.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
}
function joinExam(e) {
  examEntry(e).joined = Date.now();
  Progress.persist();
  if (!App.exam || App.exam.id !== e.id) startExam(e);
}
function examEntry(exam = App.exam) {
  const all = Progress.data.exams || (Progress.data.exams = {});
  return all[exam.id] || (all[exam.id] = { title: exam.title, className: exam.className, startedAt: exam.startedAt, slots: {} });
}
function examSlot(id) {
  const slots = examEntry().slots;
  return slots[id] || (slots[id] = { program: null, robot: null, best: null, bestProgram: null, checks: 0, hints: 0 });
}
function startExam(e) {
  storeWorkspace(); // the work of before (or of the blank test) is kept
  App.exam = e;
  CR.examOver = false;
  examEntry(e);
  $('examOverlay').hidden = true;
  App.mode = 'challenge';
  $('challengeBox').hidden = false;
  $('mSwitch').disabled = true;
  App.examCh = null;
  enterExamChallenge(examEntry(e).current || e.challenges[0], { skipStore: true });
  updateExamBanner();
  if (examEntry(e).done) { showExamEnd(true); return; }
  const aw = examEntry(e).away;
  if (aw && aw.since) { aw.ms += Math.max(0, Date.now() - aw.since); aw.since = 0; } // the page was closed or reloaded
  toast(e.practice ? '🧪 Blank test: 40 minutes, like the real test. Good luck!' : `📝 The exam "${e.title}" has started. Good luck!`, 5000);
  Progress.log('exam-start', null, e.id);
  Sync.push(liveState(), true);
}
function enterExamChallenge(id, { skipStore = false } = {}) {
  if (!App.exam || !App.exam.challenges.includes(id) || App.status !== 'idle') return;
  if (!skipStore) storeWorkspace();
  App.examCh = id;
  examEntry().current = id;
  selectChallenge(id);
  loadSlot(examSlot(id));
  renderExam();
  Progress.persist();
}
function renderExam() {
  const e = App.exam, ch = App.challenge, slot = examSlot(ch.id);
  const k = e.challenges.indexOf(ch.id);
  $('stepper').innerHTML = e.challenges.map((id, i) => {
    const s = examSlot(id);
    return `<button class="mc-dot open${id === ch.id ? ' current' : ''}${s.checks ? ' sent' : ''}" data-ch="${esc(id)}" title="${esc(chTitle(id))}${s.checks ? ' · submitted' : ''}">${s.checks ? '✓' : i + 1}</button>`;
  }).join('');
  $('stepper').innerHTML = ''; // the steps are in the bar under the header
  $('challengeTitle').textContent = `${e.practice ? '🧪' : '📝'} ${chTitle(ch.id)}`;
  $('challengeMeta').textContent = `${e.practice ? '🧪 Blank test' : '📝 Test'} · ${k + 1} of ${e.challenges.length} · ${chMarks(ch)} marks`;
  $('btnAllCh').hidden = true;
  $('btnHint').textContent = '💡 Need a hint?';
  $('btnSolution').hidden = true;
  $('challengeDesc').innerHTML = richDesc(ch.description);
  const hints = e.hints ? ch.hints || [] : [];
  $('hintBox').innerHTML = hints.slice(0, slot.hints).map((h, i) => `<div class="hint-card">💡 <b>Hint ${i + 1}:</b> ${esc(h)}</div>`).join('');
  $('btnHint').hidden = slot.hints >= hints.length;
  $('btnHint').textContent = `💡 Hint (${slot.hints + 1}/${hints.length})`;
  $('btnEvaluate').hidden = CR.examOver || !!ch.quiz;
  $('validateBox').innerHTML = ch.quiz ? `<div class="exam-best">💾 Your answers are saved as you click. You can come back to the quiz and change them until the end of the exam.</div>`
    : `<div class="exam-note">${slot.checks ? '✅ <b>Submitted.</b> Improved it? Test it, then submit again.' : 'Test it in the simulator. When it works, submit it.'}</div>`;
  updateButtons();
  renderStepBar();
  applyNotes();
}
function examHint() {
  const slot = examSlot(App.challenge.id);
  slot.hints = Math.min((App.challenge.hints || []).length, slot.hints + 1);
  Progress.persist();
  renderExam();
}
function onExamGrade(res) {
  const ch = App.challenge, id = ch.id, slot = examSlot(id);
  const program = ch.quiz ? { quiz: true, answers: quizAnswers() } : Blockly.serialization.workspaces.save(ws), robot = null;
  slot.checks++;
  slot.sentProgram = program;
  if (slot.best === null || res.score > slot.best) { slot.best = res.score; slot.bestProgram = program; }
  Progress.log('exam-check', id, res.score);
  Progress.persist();
  queueExamResult({ studentId: Progress.data.studentId, examId: App.exam.id, challengeId: id, score: res.score, program, robot, name: Progress.data.name, className: Progress.data.className });
  renderExam();
  // no score in the exam: straight on to the next challenge not submitted yet (the bar of steps leads back to any of them)
  const order = App.exam.challenges, k = order.indexOf(id);
  const next = order.slice(k + 1).concat(order.slice(0, k)).find((c) => !examSlot(c).checks);
  const sent = ch.quiz ? '✅ Answers saved' : '📨 Program submitted';
  if (next) {
    enterExamChallenge(next);
    toast(`${sent}. Next: ${chTitle(next)}`, 4000);
    return;
  }
  if (ch.quiz) showQuiz(slot);
  openModal(`<h2>${sent}</h2><p>🎉 Everything is submitted. You can still click a step in the bar at the top, improve a program, test it and submit it again.</p>
    <div style="text-align:right"><button class="primary" onclick="closeModal()">OK</button></div>`);
}
// Exam results wait in the saved work until the server has them (a check made while the network was down is sent later).
function queueExamResult(r) {
  if (App.exam && App.exam.practice) return; // the blank test stays in the student's work
  if (App.exam && !r.away) { const a = awayInfo(); r.away = { n: a.awayN, ms: a.awayMs }; }
  (Progress.data.examQueue = Progress.data.examQueue || []).push(r);
  Progress.persist();
  flushExamResults();
}
let examFlushing = false;
async function flushExamResults() {
  const q = Progress.data && Progress.data.examQueue;
  if (!q || !q.length || examFlushing || Sync.disabled || !Sync.online) return;
  examFlushing = true;
  try {
    while (q.length) {
      let r;
      try { r = await sfetch(q[0].finish ? 'api/exam/finish' : 'api/exam/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q[0]) }); } catch (e) { break; }
      if (r.status >= 500 || r.status === 401) break; // server trouble or class code: try again later
      q.shift(); // received, or refused for good (exam over)
      Progress.persist();
    }
  } finally { examFlushing = false; }
}
function updateExamBanner() {
  // the timer is at the right of the bar of steps (one line less on small screens)
  $('examBanner').hidden = true;
  const b = $('sbTimer');
  if (!App.exam || !b) return;
  const left = Math.max(0, App.exam.endsAt * 1000 - Sync.now()) / 1000;
  b.classList.toggle('soon', left < 120 && !CR.examOver);
  b.innerHTML = CR.examOver ? `📝 ${esc(App.exam.title)} · ⏱ finished` : `📝 <b>${esc(App.exam.title)}</b> · ⏱ <b>${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}</b> left`;
  if (!CR.examOver && left <= 0) finishExam();
}
function finishExam(handedIn = false) {
  if (!App.exam || CR.examOver) return;
  storeWorkspace();
  submitForgotten();
  setAway(false);
  if (handedIn) {
    examEntry().done = Date.now();
    queueExamResult({ finish: true, studentId: Progress.data.studentId, examId: App.exam.id, name: Progress.data.name });
  }
  CR.examOver = true;
  flushExamResults();
  Progress.log(handedIn ? 'exam-submit' : 'exam-end', null, App.exam.id);
  Progress.persist();
  Sync.push(liveState(), true);
  showExamEnd(handedIn);
}
function showExamEnd(handedIn) {
  CR.examOver = true;
  closeModal();
  if (App.exam.practice) {
    // the blank test: the student sees their result (score of each part and the grade)
    const res = { challenges: Object.fromEntries(App.exam.challenges.filter((id) => examSlot(id).checks).map((id) => [id, { score: examSlot(id).best || 0, program: examSlot(id).bestProgram }])) };
    const sheet = markSheet(App.exam.challenges, res);
    const fm = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
    const prow = App.exam.challenges.map((id) => {
      const its = sheet.items.filter((it) => it.chId === id);
      const got = its.reduce((a, it) => a + it.mark, 0), max = its.reduce((a, it) => a + it.max, 0);
      return `<tr><td>${esc(chTitle(id))}</td><td><b>${examSlot(id).checks ? `${fm(got)} / ${fm(max)}` : `— / ${fm(max)} (nothing submitted)`}</b></td></tr>`;
    }).join('');
    $('examOverlayBody').innerHTML = `<div class="ov-icon">🧪</div><h1>Blank test: your result</h1><table class="exam-res">${prow}<tr><td><b>Total</b></td><td><b>${fm(sheet.total)} / ${fm(sheet.max)} marks (${sheet.pct} %)</b></td></tr></table>
      <p class="muted">This was a practice test. In the real test, your teacher gives you the password.</p><button class="primary" id="blankHome">🏠 Back to the home page</button>`;
    $('examOverlay').hidden = false;
    $('blankHome').onclick = goHome;
    renderStepBar();
    updateExamBanner();
    return;
  }
  const rows = App.exam.challenges.map((id) => `<tr><td>${esc(chTitle(id))}</td><td><b>${examSlot(id).checks ? '✓ submitted' : '—'}</b></td></tr>`).join('');
  $('examOverlayBody').innerHTML = handedIn
    ? `<div class="ov-icon">✅</div><h1>Test submitted</h1><table class="exam-res">${rows}</table><p class="muted">Well done! Your teacher has your work. Wait quietly until the end of the test.</p>`
    : `<div class="ov-icon">⏱</div><h1>The exam is over</h1><table class="exam-res">${rows}</table><p class="muted">Your work is saved. Wait for your teacher.</p>`;
  $('examOverlay').hidden = false;
  renderStepBar();
  updateExamBanner();
}
function confirmFinishTest() {
  if (!App.exam || CR.examOver || App.status !== 'idle') return;
  storeWorkspace();
  const missing = App.exam.challenges.filter((id) => !examSlot(id).checks);
  openModal(`<h2>✅ Submit my test?</h2>
    ${missing.length ? `<p>⚠️ Not submitted yet: <b>${missing.map((id) => esc(chTitle(id))).join(', ')}</b>. Your latest work on ${missing.length > 1 ? 'them' : 'it'} is sent too.</p>` : '<p>Everything is submitted. Your latest programs are sent too.</p>'}
    <p><b>After this, you cannot change your test any more.</b></p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button onclick="closeModal()">← Go back to my test</button><button class="primary" id="ftGo">✅ Yes, submit my test</button></div>`);
  $('ftGo').onclick = () => finishExam(true);
}

// ---------- 👀 Leaving the test page (another tab, another window, the page closed) ----------
function awayInfo() {
  const a = (App.exam && examEntry().away) || { n: 0, ms: 0, since: 0 };
  return { away: !!a.since, awayN: a.n, awayMs: a.ms + (a.since ? Date.now() - a.since : 0) };
}
function setAway(away) {
  if (!App.exam || !Progress.data || App.exam.practice) return;
  const e = examEntry(), a = e.away || (e.away = { n: 0, ms: 0, since: 0 });
  if (away && (CR.examOver || a.since)) return;
  if (!away && !a.since) return;
  if (away) { a.n++; a.since = Date.now(); } else { a.ms += Date.now() - a.since; a.since = 0; }
  Progress.persist();
  Sync.push(liveState(), true);
}
document.addEventListener('visibilitychange', () => setAway(document.hidden));
window.addEventListener('blur', () => setAway(true));
window.addEventListener('focus', () => { if (!document.hidden) setAway(false); });
window.addEventListener('pagehide', () => setAway(true));
// A program (or quiz answers) the student never submitted is graded at the end, so nothing is lost
function submitForgotten() {
  for (const id of App.exam.challenges) {
    const slot = examSlot(id), ch = CHALLENGES.find((c) => c.id === id);
    if (!ch) continue;
    try {
      let res, program;
      if (ch.quiz) {
        if (!(slot.answers || []).some((a) => a !== null && a !== undefined)) continue;
        if (slot.checks && JSON.stringify(slot.answers) === JSON.stringify((slot.sentProgram || {}).answers)) continue;
        program = { quiz: true, answers: slot.answers };
        res = gradeQuiz(ch, slot.answers);
      } else {
        if (!slot.program || (slot.checks && JSON.stringify(slot.program) === JSON.stringify(slot.sentProgram))) continue;
        program = slot.program;
        res = evaluateChallenge(ch, programFromState(program));
      }
      slot.checks = (slot.checks || 0) + 1;
      if (slot.best === null || res.score > slot.best) { slot.best = res.score; slot.bestProgram = program; }
      slot.sentProgram = program;
      queueExamResult({ studentId: Progress.data.studentId, examId: App.exam.id, challengeId: id, score: res.score, program, robot: null, name: Progress.data.name, className: Progress.data.className, auto: true });
    } catch (e) { console.error(e); }
  }
}
function leaveExam() {
  if (!App.exam) return;
  if (!CR.examOver) storeWorkspace();
  App.exam = null;
  App.examCh = null;
  CR.examOver = false;
  $('examOverlay').hidden = true;
  updateExamBanner();
  closeModal();
  toast('📝 The test is closed.');
  goHome();
}
// back to the home page (blank test or test): the work is saved, the student chooses again
function goHome() {
  if (Progress.data) { if (App.exam && !CR.examOver) storeWorkspace(); Progress.persist(); Sync.push(liveState('left'), true); }
  App.exam = null;
  App.examCh = null;
  CR.examOver = false;
  $('examOverlay').hidden = true;
  closeModal();
  Progress.data = null;
  showWelcome();
}

// ---------- 🕓 Program history (the teacher sees each version) ----------
function recordVersion(kind, score) {
  if (!Progress.data || !Sync.online || isQuiz() || !ws) return;
  const slot = currentSlotId();
  const program = Blockly.serialization.workspaces.save(ws);
  const key = JSON.stringify(program);
  // a "Run" is kept only if the program changed and the last version of this program is older than 1 minute
  const last = CR.lastVersionAt[slot] || 0;
  if (kind === 'run' && (CR.lastVersion[slot] === key || Date.now() - last < 60000)) return;
  CR.lastVersion[slot] = key;
  CR.lastVersionAt[slot] = Date.now();
  Sync.post('api/history', { studentId: Progress.data.studentId, slot, kind, score: score === undefined ? null : score, program, t: new Date().toISOString() });
}

function setupClassroom() {
  $('btnHelpMe').onclick = toggleHelp;
  $('closedExit').onclick = () => { $('closedOverlay').hidden = true; exitSession(); };
  setInterval(() => { if (App.exam) updateExamBanner(); }, 1000);
  setInterval(flushExamResults, 4000);
  setInterval(pollHelpQueue, (CLASSROOM.syncPollSeconds || 3) * 1000 + 2000); // only while waiting for help
  setInterval(() => { if (CR.helpSince) renderHelpQueue(); }, 1000);
  $('btnHelpMe').addEventListener('mouseenter', () => { if (CR.helpSince) { CR.helpShowUntil = Date.now() + 4000; renderHelpQueue(); } });
  $('helpQueue').onclick = () => { CR.helpShowUntil = 0; renderHelpQueue(); };
  renderHelpButton();
}

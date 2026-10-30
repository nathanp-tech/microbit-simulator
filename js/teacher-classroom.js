// Teacher dashboard, classroom features: help queue, live class commands, exams and results,
// program history and comments in the student view, class lists, daily backups, database usage.
'use strict';

const tpost = async (url, body) => {
  const r = await tfetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'request failed');
  return d;
};
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const chName = (id) => { const c = CHALLENGES.find((x) => x.id === id); return c ? c.title : id; };

// ---------- Class lists ----------
async function loadTeacherRoster() {
  try {
    const d = await (await tfetch('api/roster')).json();
    T.roster = d.roster && Object.keys(d.roster).length ? d.roster : null;
  } catch (e) { T.roster = null; }
  refreshClasses();
}

// ---------- 🙋 Help queue ----------
let knownHelp = new Set();
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.18);
  } catch (e) { /* no sound */ }
}
function renderHelpQueue() {
  const box = $('helpQueue');
  const ids = new Set(T.help.map((h) => h.studentId));
  if ([...ids].some((id) => !knownHelp.has(id))) beep();
  knownHelp = ids;
  box.hidden = !T.help.length;
  box.innerHTML = `<div class="actions"><b>🙋 Help requests (${T.help.length})</b><span class="muted">oldest first</span></div>
    ${T.help.map((h) => `<div class="help-item"><span class="help-wait">${fmtTime(T.serverNow - h.since)}</span>
      <b>${esc(h.name)}</b> <span class="muted">${esc(h.className)}</span> · ${esc(h.where)}${h.message ? ' · “' + esc(h.message) + '”' : ''}
      <span class="spacer" style="flex:1"></span>
      <button class="mini" data-help-view="${esc(h.studentId)}">👁 View</button>
      <button class="mini primary" data-help-done="${esc(h.studentId)}">✓ Done</button></div>`).join('')}`;
}
async function helpDone(id) {
  await tpost('api/help', { studentId: id, on: false, by: 'teacher' });
  T.help = T.help.filter((h) => h.studentId !== id);
  renderHelpQueue();
  renderLive();
}

// ---------- 🎛 Class commands and exams, in each class header ----------
function classCtlHtml(c) {
  const ctl = T.classctl[c] || {};
  const ex = ctl.exam;
  let exam;
  if (ex && ex.active && T.serverNow < ex.endsAt) {
    exam = `<span class="ctl-badge exam">📝 ${esc(ex.title)} · ⏱ ${mmss(ex.endsAt - T.serverNow)}</span>
      <button class="mini" data-ctl="results" data-exam="${esc(ex.id)}">Results</button><button class="mini danger" data-ctl="stop" data-exam="${esc(ex.id)}">⏹ Stop</button>`;
  } else if (ex) {
    exam = `<span class="ctl-badge exam">📝 ${esc(ex.title)} · finished</span>
      <button class="mini" data-ctl="results" data-exam="${esc(ex.id)}">Results</button><button class="mini primary" data-ctl="endexam" data-exam="${esc(ex.id)}" title="The students go back to their normal work">✓ Back to normal</button>`;
  } else {
    exam = `<button class="mini" data-ctl="exam" data-class="${esc(c)}">📝 Start an exam</button>`;
  }
  const code = (T.classCodes || {})[c];
  return `<span class="grp-ctl">${code ? `<span class="ctl-badge code" title="Code of this class (in its link and QR code)">🔑 ${esc(code)}</span>` : ''}
    ${ctl.paused ? '<span class="ctl-badge warn">⏸ paused</span>' : ''}${ctl.closed ? '<span class="ctl-badge warn">🔒 closed</span>' : ''}
    <button class="mini" data-ctl="msg" data-class="${esc(c)}" title="Show a message on every screen of this class">📢 Message</button>
    <button class="mini${ctl.paused ? ' on' : ''}" data-ctl="pause" data-class="${esc(c)}" title="Freeze the screens to get attention">${ctl.paused ? '▶ Resume' : '⏸ Pause screens'}</button>
    <button class="mini${ctl.closed ? ' on' : ''}" data-ctl="close" data-class="${esc(c)}" title="Allow or block the access of this class">${ctl.closed ? '🔓 Open access' : '🔒 Close access'}</button>
    ${exam}</span>`;
}
async function classCommand(btn) {
  const c = btn.dataset.class, act = btn.dataset.ctl, ctl = T.classctl[c] || {};
  try {
    if (act === 'msg') return messageDialog(c);
    if (act === 'pause') await tpost('api/classctl', { classes: [c], paused: !ctl.paused });
    if (act === 'close') {
      if (!ctl.closed && !confirm(`Close the access for ${c}? Connected students see "Your class is closed" (their work is saved).`)) return;
      await tpost('api/classctl', { classes: [c], closed: !ctl.closed });
    }
    if (act === 'exam') return examDialog(c);
    if (act === 'results') return examResults(btn.dataset.exam);
    if (act === 'stop') {
      if (!confirm('Stop the exam now? The students see their final results.')) return;
      await tpost('api/exam', { action: 'stop', examId: btn.dataset.exam });
    }
    if (act === 'endexam') await tpost('api/exam', { action: 'close', examId: btn.dataset.exam });
    await refreshLive();
  } catch (e) { alert(e.message); }
}
function messageDialog(c) {
  openModal(`<h2>📢 Message to ${esc(c)}</h2><p class="muted">It appears on the screen of every connected student of this class.</p>
    <textarea id="msgText" rows="3" style="width:100%;font-size:16px" placeholder="e.g. 5 minutes left: save your work and check your solution."></textarea>
    <div class="actions" style="justify-content:flex-end"><button onclick="closeModal()">Cancel</button><button class="primary" id="msgSend">Send</button></div>`);
  setTimeout(() => $('msgText').focus(), 50);
  $('msgSend').onclick = async () => {
    const text = $('msgText').value.trim();
    if (!text) return;
    try { await tpost('api/classctl', { classes: [c], message: text }); closeModal(); } catch (e) { alert(e.message); }
  };
}

// ---------- 📝 Exams ----------
function examDialog(c) {
  const today = new Date().toLocaleDateString();
  openModal(`<h2>📝 Start an exam for ${esc(c)}</h2>
    <p class="muted">The students of ${esc(c)} are switched to the exam at once (within a few seconds). Each challenge starts from an empty program. Only their best "Check my answer" counts; the score becomes a Swiss grade.</p>
    <div class="exam-form">
      <label>Title <input id="exTitle" value="Exam ${esc(c)} · ${esc(today)}"></label>
      <label>Duration <input id="exMin" type="number" min="1" max="240" value="30" style="width:70px"> minutes</label>
      <label><input type="checkbox" id="exHints"> Hints allowed</label>
      <div><b>Challenges</b>
        <div class="exam-chs">${CATEGORIES.map((cat) => `<div class="exam-cat">${cat.icon} ${esc(cat.label)}</div>` + CHALLENGES.filter((ch) => ch.cat === cat.id).map((ch, i) => `<label><input type="checkbox" value="${esc(ch.id)}"${cat.id === 'u1' && i < 1 ? ' checked' : ''}> ${esc(ch.n + '. ' + ch.title)} <span class="muted">(${ch.quiz ? 'quiz' : esc(ch.lesson || '')})</span></label>`).join('')).join('')}</div>
      </div>
    </div>
    <div class="actions" style="justify-content:flex-end"><button onclick="closeModal()">Cancel</button><button class="primary" id="exStart">▶ Start the exam</button></div>`);
  $('exStart').onclick = async () => {
    const challenges = [...document.querySelectorAll('.exam-chs input:checked')].map((x) => x.value);
    if (!challenges.length) { alert('Choose at least one challenge.'); return; }
    try {
      await tpost('api/exam', { action: 'start', className: c, title: $('exTitle').value, minutes: Number($('exMin').value) || 30, hints: $('exHints').checked, challenges });
      closeModal();
      await refreshLive();
    } catch (e) { alert(e.message); }
  };
}
async function examsList() {
  const d = await (await tfetch('api/exams')).json();
  openModal(`<h2>📝 Exams</h2>
    ${d.exams.length ? `<table class="cls"><thead><tr><th>Exam</th><th>Class</th><th>Date</th><th>Challenges</th><th>State</th><th></th></tr></thead><tbody>
    ${d.exams.map((e) => `<tr><td><b>${esc(e.title)}</b></td><td>${esc(e.className)}</td><td>${new Date(e.startedAt * 1000).toLocaleString()}</td><td>${e.challenges.length} · ${e.minutes} min${e.hints ? ' · hints' : ''}</td>
      <td>${!e.stoppedAt && d.now < e.endsAt ? '⏱ running' : 'finished'}</td>
      <td style="white-space:nowrap"><button class="mini primary" data-exres="${esc(e.id)}">Results</button> <button class="mini danger" data-exdel="${esc(e.id)}">🗑</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">No exam yet. Start one from the header of a class in the live view (📝 Start an exam).</p>'}`);
  document.querySelectorAll('[data-exres]').forEach((b) => { b.onclick = () => examResults(b.dataset.exres); });
  document.querySelectorAll('[data-exdel]').forEach((b) => {
    b.onclick = async () => { if (confirm('Delete this exam and its results?')) { await tpost('api/exam', { action: 'delete', examId: b.dataset.exdel }); examsList(); } };
  });
}
const X = { exam: null, results: [], verified: {} };
async function examResults(id) {
  const d = await (await tfetch('api/exam/results?examId=' + encodeURIComponent(id))).json();
  if (!d.exam) { alert('Exam not found.'); return; }
  X.exam = d.exam; X.results = d.results; X.verified = {}; X.now = d.now;
  renderExamResults();
}
function examRows() {
  const e = X.exam, names = (teacherRoster()[e.className] || []).slice();
  const rows = names.map((n) => X.results.find((r) => nkey(r.name) === nkey(n) && nkey(r.className) === nkey(e.className)) || { name: n, className: e.className, challenges: {}, missing: true });
  for (const r of X.results) if (!rows.includes(r)) rows.push(r);
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((r) => {
    const scores = e.challenges.map((cid) => {
      const c = (r.challenges || {})[cid];
      const v = X.verified[(r.studentId || '') + ':' + cid];
      return c ? (v !== undefined ? v : c.score) : 0;
    });
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / e.challenges.length);
    return { r, scores, avg, grade: swissGrade(avg) };
  });
}
function renderExamResults() {
  const e = X.exam, rows = examRows();
  const running = !e.stoppedAt && X.now < e.endsAt;
  openModal(`<h2>📝 ${esc(e.title)} · ${esc(e.className)}</h2>
    <p class="muted">${new Date(e.startedAt * 1000).toLocaleString()} · ${e.minutes} min${e.hints ? ' · hints allowed' : ''} · ${running ? '⏱ still running' : 'finished'} · score = best check per challenge, grade = Swiss scale from the average.</p>
    <div class="actions"><button id="exVerify" title="Replays every saved program on the official trials (deterministic): checks that nobody changed their score">🔁 Verify by replaying the programs</button>
      <button id="exCsv">📊 CSV</button><button id="exRefresh">↻ Refresh</button><span id="exMsg" class="muted"></span></div>
    <table class="cls exam-table"><thead><tr><th>Student</th>${e.challenges.map((c) => `<th title="${esc(chName(c))}">${esc(chName(c).replace(/^\d+\.\s*/, ''))}</th>`).join('')}<th>Average</th><th>Grade</th></tr></thead><tbody>
    ${rows.map(({ r, avg, grade }) => `<tr${r.missing ? ' class="absent"' : ''}><td><b>${esc(r.name)}</b>${r.missing ? ' <span class="muted">no result</span>' : ''}</td>
      ${e.challenges.map((cid) => {
    const c = (r.challenges || {})[cid];
    if (!c) return '<td class="muted">—</td>';
    const v = X.verified[r.studentId + ':' + cid];
    const flag = v === undefined ? '' : v === c.score ? ' <span class="ok-mark" title="Verified">✓</span>' : ` <span class="warn-mark" title="The replay gives ${v} % (the student's browser said ${c.score} %)">⚠ ${v} %</span>`;
    return `<td><button class="linklike" data-exview="${esc(r.studentId)}:${esc(cid)}" title="See the program">${c.score} %</button>${flag} <span class="muted">(${c.checks}×)</span></td>`;
  }).join('')}
      <td><b>${avg} %</b></td><td><b class="grade">${r.missing ? '—' : grade.toFixed(1)}</b></td></tr>`).join('')}</tbody></table>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1200px';
  $('exRefresh').onclick = () => examResults(e.id);
  $('exCsv').onclick = () => {
    const head = ['Class', 'Student', ...e.challenges.map(chName), 'Average %', 'Grade'];
    const lines = [head].concat(rows.map(({ r, scores, avg, grade }) => [e.className, r.name, ...scores, avg, r.missing ? '' : grade]));
    const csv = '﻿' + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `exam_${slugName(e.className)}_${slugName(e.title)}.csv`;
    a.click();
  };
  $('exVerify').onclick = verifyExam;
  document.querySelectorAll('[data-exview]').forEach((b) => {
    b.onclick = () => {
      const [sid, cid] = b.dataset.exview.split(':');
      const r = X.results.find((x) => x.studentId === sid), c = r.challenges[cid];
      const work = { name: `${r.name} · ${e.title}`, className: e.className, mode: 'guided', current: cid, challenges: Object.fromEntries(CHALLENGES.map((ch) => [ch.id, ch.id === cid ? (c.program && c.program.quiz ? { status: 'validated', answers: c.program.answers } : { status: 'validated', program: c.program }) : { status: 'locked' }])), free: {}, events: [] };
      watchStudent('exam-' + sid, { slot: cid, work });
    };
  });
}
async function verifyExam() {
  const e = X.exam, todo = [];
  for (const r of X.results) for (const cid of e.challenges) if (r.challenges && r.challenges[cid] && r.challenges[cid].program) todo.push([r, cid]);
  let done = 0;
  for (const [r, cid] of todo) {
    $('exMsg').textContent = `Replaying ${++done} / ${todo.length}…`;
    const ch = CHALLENGES.find((c) => c.id === cid), c = r.challenges[cid];
    // the best program and the former bests: the replay keeps the highest score it can confirm
    let best = 0;
    for (const p of [c, ...(c.alts || [])].filter((x) => x && x.program)) {
      try {
        const res = ch.quiz ? gradeQuiz(ch, p.program.answers || []) : evaluateChallenge(ch, programFromState(p.program));
        best = Math.max(best, res ? res.score : 0);
      } catch (err) { /* this program cannot run: 0 */ }
      if (best >= c.score) break;
    }
    X.verified[r.studentId + ':' + cid] = best;
    await new Promise((res) => setTimeout(res, 0));
  }
  renderExamResults();
  const diff = todo.filter(([r, cid]) => X.verified[r.studentId + ':' + cid] !== r.challenges[cid].score).length;
  $('exMsg').textContent = diff ? `⚠ ${diff} score(s) differ from the replay: the replayed score is used.` : `✓ All ${todo.length} scores confirmed by the replay.`;
}

// ---------- Student view: history of versions and comments ----------
function setupWatchExtras() {
  W.version = null; W.hist = []; W.notes = []; W.selBlock = null;
  // A read-only workspace selects nothing: find the clicked block ourselves (each block group carries data-id).
  $('watchWs').addEventListener('pointerdown', (e) => {
    const g = e.target.closest && e.target.closest('g[data-id]');
    const blk = g && W.ws && W.ws.getBlockById(g.getAttribute('data-id'));
    if (!blk) return;
    const prev = W.selBlock && W.ws.getBlockById(W.selBlock);
    if (prev) prev.removeSelect();
    blk.addSelect();
    W.selBlock = blk.id;
    $('wNoteBtn').disabled = !!W.static || String(W.id).startsWith('exam-');
  }, true);
  $('wNoteBtn').onclick = () => { $('wNoteForm').hidden = false; $('wNoteText').focus(); };
  $('wNoteCancel').onclick = () => { $('wNoteForm').hidden = true; };
  $('wNoteSend').onclick = async () => {
    const text = $('wNoteText').value.trim();
    if (!text || !W.selBlock) return;
    try {
      const d = await tpost('api/notes', { studentId: W.id, action: 'add', slot: W.slot, blockId: W.selBlock, text });
      W.notes = d.notes;
      $('wNoteText').value = '';
      $('wNoteForm').hidden = true;
      renderWatchNotes();
    } catch (e) { alert(e.message); }
  };
  if (!W.static && !String(W.id).startsWith('exam-')) {
    tfetch('api/notes/' + W.id).then((r) => r.json()).then((d) => { W.notes = d.notes || []; renderWatchNotes(); }).catch(() => {});
  } else {
    $('wHist').hidden = true;
    document.querySelector('.w-notes').hidden = true;
  }
}
// The program shown: the live one, or a version picked in the history.
function watchProgram(entry) {
  if (W.version !== null && W.version !== undefined && W.hist[W.version]) return W.hist[W.version];
  return entry || {};
}
async function loadWatchHistory() {
  if (W.static || !W.id || String(W.id).startsWith('exam-') || !W.slot) return;
  try {
    const d = await (await tfetch(`api/history/${W.id}/${encodeURIComponent(W.slot)}`)).json();
    W.hist = d.versions || [];
  } catch (e) { W.hist = []; }
  renderWatchHistory();
}
function renderWatchHistory() {
  const box = $('wHist');
  if (!box) return;
  const live = W.version === null || W.version === undefined;
  box.innerHTML = `<span class="muted">🕓 History:</span>
    <button class="hist-chip${live ? ' on' : ''}" data-ver="live">● Now</button>
    ${W.hist.map((v, i) => `<button class="hist-chip${W.version === i ? ' on' : ''} ${v.kind === 'check' ? 'check' : 'run'}" data-ver="${i}" title="${v.kind === 'check' ? 'Check my answer' : 'Program tried'} · ${new Date(v.t).toLocaleString()}">${new Date(v.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${v.kind === 'check' ? '✅ ' + (typeof v.score === 'number' ? v.score + '%' : '') : '▶'}</button>`).reverse().join('')}
    ${W.hist.length ? '<button class="mini danger" id="wHistClear" title="Delete all the recorded versions of this student (every program)">🗑 Clear the history</button>' : '<span class="muted">no version recorded yet (a version is kept at each Run / Check)</span>'}`;
  const clr = $('wHistClear');
  if (clr) clr.onclick = async () => {
    if (!confirm('Delete all the recorded versions of this student (all their programs)? Their current programs are kept.')) return;
    try {
      await adminPost({ action: 'clear-extras', studentId: W.id, history: true });
      W.hist = []; W.version = null; W.last = '';
      renderWatchHistory(); refreshWatch();
    } catch (e) { alert(e.message); }
  };
  box.querySelectorAll('[data-ver]').forEach((b) => {
    b.onclick = () => { W.version = b.dataset.ver === 'live' ? null : Number(b.dataset.ver); W.last = ''; refreshWatch(); renderWatchHistory(); };
  });
}
function renderWatchNotes() {
  const box = $('wNotes');
  if (!box || !W.ws) return;
  const mine = (W.notes || []).filter((n) => n.slot === W.slot);
  for (const b of W.ws.getAllBlocks(false)) b.setWarningText(null, 'tnote');
  for (const n of mine) { const b = W.ws.getBlockById(n.blockId); if (b && !n.done) b.setWarningText('💬 ' + n.text, 'tnote'); }
  const others = (W.notes || []).length - mine.length;
  box.innerHTML = mine.map((n) => `<div class="note ${n.done ? 'done' : ''}"><div class="note-text">${esc(n.text)}</div>
    <div class="note-actions"><span class="muted">${new Date(n.at * 1000).toLocaleString()} · ${n.done ? '✓ read by the student' : 'not read yet'}${W.ws.getBlockById(n.blockId) ? '' : ' · block not in this version'}</span>
    <button class="mini danger" data-note-del="${esc(n.id)}">🗑</button></div></div>`).join('')
    + (mine.length ? '' : '<div class="muted">Click a block of their program, then "Comment on the selected block".</div>')
    + (others > 0 ? `<div class="muted">${others} comment(s) on their other programs.</div>` : '');
  box.querySelectorAll('[data-note-del]').forEach((b) => {
    b.onclick = async () => { const d = await tpost('api/notes', { studentId: W.id, action: 'delete', noteId: b.dataset.noteDel }); W.notes = d.notes; renderWatchNotes(); };
  });
}

// ---------- Reset the data of one or several students ----------
const RESET_PARTS = [
  ['guided', 'Challenges: progress, programs, quiz answers, times, checks (back to challenge 1)'],
  ['free', 'Free programming: program and statistics'],
  ['history', 'History of program versions'],
  ['notes', 'Comments on their blocks'],
];
// Live class ↺: clear a student completely. They are logged out and appear as "Not connected yet";
// they start again by choosing their name.
function clearStudentDialog(s) {
  openModal(`<h2>↺ Clear ${esc(studentLabel(s))}</h2>
    <p>Everything of this student is deleted: progress, programs, history of versions, comments, help request.</p>
    <p>If they are connected, they are <b>logged out</b> (within a few seconds) and come back to the welcome page. In the live view they appear as <b>○ Not connected yet</b>: they start again by choosing their name.</p>
    <p class="muted">A copy is kept 180 days (and in the daily backups). Exam results are kept.</p>
    <div class="actions" style="justify-content:flex-end"><button onclick="closeModal()">Cancel</button><button class="danger" id="clearGo">↺ Clear and log out</button></div>`);
  $('clearGo').onclick = async () => {
    $('clearGo').disabled = true;
    try {
      const res = await adminPost({ action: 'delete', studentIds: [s.studentId] });
      if (!res.ok) throw new Error(res.error || 'failed');
      T.help = T.help.filter((h) => h.studentId !== s.studentId);
      closeModal();
      await refreshLive();
    } catch (e) { alert('Could not clear: ' + e.message); $('clearGo').disabled = false; }
  };
}

// preset: the boxes checked at first (all of them when not given).
function resetStudentsDialog(ids, preset = null) {
  const names = ids.map((id) => studentLabel(byId(id) || { name: id })).join(', ');
  openModal(`<h2>↺ Reset ${ids.length > 1 ? ids.length + ' students' : esc(names)}</h2>
    ${ids.length > 1 ? `<p class="muted">${esc(names)}</p>` : ''}
    <p>What do you want to clear?</p>
    <div class="reset-parts">${RESET_PARTS.map(([k, label]) => `<label><input type="checkbox" value="${k}"${!preset || preset.includes(k) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</div>
    <p class="muted">The student keeps their name and class. A copy of the current work is kept in the daily backups (Manage). Exam results are kept. If the student is connected, their screen reloads with the cleared work.</p>
    <div class="actions" style="justify-content:flex-end"><button onclick="closeModal()">Cancel</button><button class="danger" id="resetGo">↺ Reset</button></div>`);
  $('resetGo').onclick = async () => {
    const parts = new Set([...document.querySelectorAll('.reset-parts input:checked')].map((x) => x.value));
    if (!parts.size) { alert('Choose at least one thing to clear.'); return; }
    $('resetGo').disabled = true;
    try {
      await tpost('api/backup/now', {}).catch(() => {}); // a fresh copy just before
      for (const id of ids) {
        if (parts.has('guided') || parts.has('free')) await changeWork(id, (w) => resetParts(w, parts));
        if (parts.has('history') || parts.has('notes')) await adminPost({ action: 'clear-extras', studentId: id, history: parts.has('history'), notes: parts.has('notes') });
      }
      closeModal();
      await refreshLive();
      renderManage();
      if (!$('manageArea').hidden) $('mgMsg').textContent = `✓ ${ids.length} student${ids.length > 1 ? 's' : ''} reset.`;
    } catch (e) { alert('Reset failed: ' + e.message); $('resetGo').disabled = false; }
  };
}
function resetParts(work, parts) {
  if (parts.has('guided')) {
    const challenges = {};
    CHALLENGES.forEach((c, i) => { challenges[c.id] = newChallengeEntry(i === 0 ? 'open' : 'locked'); });
    Object.assign(work, { challenges, current: CHALLENGES[0].id });
  }
  if (parts.has('free')) Object.assign(work, { free: { program: null, name: '', runs: 0, errors: {} }, freeTime: 0 });
  if (parts.has('guided') && parts.has('free')) Object.assign(work, { totalTime: 0, events: [] });
  else work.events = (work.events || []).filter((e) => !(parts.has('guided') && e.ch));
}

// ---------- Manage: class lists ----------
let rosterDraft = null, codesDraft = null;
const newCode = (used) => { let c; do { c = String(Math.floor(200000 + Math.random() * 799999)); } while (used.includes(c)); return c; };
function renderRosterEditor() {
  if (!rosterDraft) rosterDraft = JSON.parse(JSON.stringify(teacherRoster()));
  if (!codesDraft) codesDraft = { ...(T.classCodes || {}) };
  $('rosterSource').textContent = T.roster ? '' : '(default lists from js/roster.js: saving stores them online)';
  const classes = Object.keys(rosterDraft).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $('rosterEditor').innerHTML = classes.map((c) => `<div class="roster-class"><div class="actions"><b>🏫 ${esc(c)}</b><span class="muted">${rosterDraft[c].length} students</span><span class="spacer" style="flex:1"></span>
      <button class="mini danger" data-roster-del="${esc(c)}" title="Remove this class from the lists">✕</button></div>
      <div class="actions code-row">🔑 <input data-code="${esc(c)}" value="${esc(codesDraft[c] || '')}" placeholder="new" size="8" title="Code of this class: it only opens this class"><button class="mini" data-newcode="${esc(c)}" title="New random code (the old one stops working)">↻</button></div>
      <textarea data-roster="${esc(c)}" rows="${Math.min(16, Math.max(4, rosterDraft[c].length + 1))}">${esc(rosterDraft[c].join('\n'))}</textarea></div>`).join('')
    || '<p class="muted">No class yet: add one or paste your lists from Excel.</p>';
  $('rosterEditor').querySelectorAll('[data-roster]').forEach((t) => {
    t.oninput = () => { rosterDraft[t.dataset.roster] = t.value.split('\n').map((x) => x.trim()).filter(Boolean); $('rosterMsg').textContent = 'Not saved yet.'; };
  });
  $('rosterEditor').querySelectorAll('[data-code]').forEach((t) => {
    t.oninput = () => { codesDraft[t.dataset.code] = t.value.trim(); $('rosterMsg').textContent = 'Not saved yet.'; };
  });
  $('rosterEditor').querySelectorAll('[data-newcode]').forEach((b) => {
    b.onclick = () => { codesDraft[b.dataset.newcode] = newCode(Object.values(codesDraft)); renderRosterEditor(); $('rosterMsg').textContent = 'New code: not saved yet.'; };
  });
  $('rosterEditor').querySelectorAll('[data-roster-del]').forEach((b) => {
    b.onclick = () => { if (confirm(`Remove ${b.dataset.rosterDel} from the class lists? (The students' work is kept.)`)) { delete rosterDraft[b.dataset.rosterDel]; renderRosterEditor(); $('rosterMsg').textContent = 'Not saved yet.'; } };
  });
}
function setupRosterEditor() {
  $('rosterAddClass').onclick = () => {
    const c = (prompt('Name of the new class (e.g. 4C):') || '').trim();
    if (!c) return;
    if (!rosterDraft[c]) rosterDraft[c] = [];
    renderRosterEditor();
    const t = document.querySelector(`[data-roster="${CSS.escape(c)}"]`);
    if (t) t.focus();
  };
  $('rosterPasteBtn').onclick = () => { $('rosterPaste').hidden = false; $('rosterPasteText').focus(); };
  $('rosterPasteCancel').onclick = () => { $('rosterPaste').hidden = true; };
  $('rosterPasteGo').onclick = () => {
    const found = {};
    for (const line of $('rosterPasteText').value.split(/\r?\n/)) {
      const parts = line.split(/\t|;|,/).map((x) => x.trim()).filter(Boolean);
      if (parts.length >= 2) (found[parts[0]] = found[parts[0]] || []).push(parts.slice(1).join(' '));
    }
    if (!Object.keys(found).length) { alert('Nothing found: paste two columns (class, name).'); return; }
    for (const [c, names] of Object.entries(found)) {
      const cur = $('rosterPasteReplace').checked ? [] : rosterDraft[c] || [];
      rosterDraft[c] = [...new Set(cur.concat(names))];
    }
    $('rosterPaste').hidden = true;
    $('rosterPasteText').value = '';
    renderRosterEditor();
    $('rosterMsg').textContent = `${Object.values(found).flat().length} names added to ${Object.keys(found).join(', ')}. Not saved yet.`;
  };
  $('rosterSave').onclick = async () => {
    try {
      const d = await tpost('api/roster', { roster: rosterDraft });
      T.roster = d.roster;
      const codes = Object.fromEntries(Object.keys(d.roster).map((c) => [c, codesDraft[c] || d.classCodes[c]]));
      const st = await tpost('api/settings', { classCodes: codes });
      T.classCodes = st.classCodes || d.classCodes;
      if (T.publicBase) showShare(T.publicBase);
      rosterDraft = null;
      codesDraft = null;
      refreshClasses();
      renderRosterEditor();
      renderManage();
      renderLive();
      $('rosterMsg').textContent = '✓ Saved. The welcome page shows the new lists at once.';
    } catch (e) { $('rosterMsg').textContent = 'Could not save: ' + e.message; }
  };
}

// ---------- Empty the database (keeps the class lists, the names and the settings) ----------
function wipeDialog() {
  openModal(`<h2>🧹 Empty the database</h2>
    <p>Everything is deleted: students' work and progress, history, comments, exams and results, help requests, daily backups and archives.</p>
    <p><b>Kept:</b> the class lists (classes and names), the class codes and the settings. Connected students are sent back to the welcome page.</p>
    <p><button id="wipeDl">💾 First download a backup of everything</button></p>
    <p>Type <b>EMPTY</b> to confirm: <input id="wipeTxt" autocomplete="off" style="width:110px"></p>
    <div class="actions" style="justify-content:flex-end"><button onclick="closeModal()">Cancel</button><button class="danger" id="wipeGo">🧹 Empty the database</button></div>`);
  $('wipeDl').onclick = async () => downloadJson(`microbit-class-backup_${new Date().toISOString().slice(0, 10)}.json`, await (await tfetch('api/admin/backup')).json());
  $('wipeGo').onclick = async () => {
    if ($('wipeTxt').value.trim().toUpperCase() !== 'EMPTY') { alert('Type EMPTY to confirm.'); return; }
    $('wipeGo').disabled = true;
    const res = await adminPost({ action: 'wipe' });
    closeModal();
    $('mgMsg').textContent = res.ok ? `✓ Database emptied (${res.deleted} entries deleted). Class lists, codes and settings kept.` : 'Could not empty the database: ' + (res.error || '');
    T.help = [];
    await refreshLive();
    renderManage();
    renderManageExtras();
  };
}

// ---------- Manage: daily backups and database usage ----------
async function renderBackups() {
  try {
    const d = await (await tfetch('api/backups')).json();
    $('backupList').innerHTML = d.backups.length ? `<table class="cls"><tbody>${d.backups.map((b) => `<tr><td><b>${esc(b.date)}</b></td><td>${b.students} students</td><td class="muted">${(b.size / 1048576).toFixed(2)} MB</td>
      <td style="white-space:nowrap"><button class="mini" data-bk-dl="${esc(b.date)}">⬇ Download</button> <button class="mini" data-bk-restore="${esc(b.date)}">↩ Restore</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No backup yet: the first one is made today, the next ones every day.</p>';
    document.querySelectorAll('[data-bk-dl]').forEach((b) => {
      b.onclick = async () => downloadJson(`microbit-class-backup_${b.dataset.bkDl}.json`, await (await tfetch('api/admin/backup?date=' + b.dataset.bkDl)).json());
    });
    document.querySelectorAll('[data-bk-restore]').forEach((b) => {
      b.onclick = async () => {
        const bk = await (await tfetch('api/admin/backup?date=' + b.dataset.bkRestore)).json();
        if (!confirm(`Restore the ${bk.works.length} student works of ${b.dataset.bkRestore}? The current work of these students is replaced (students added since then are kept).`)) return;
        const res = await adminPost({ action: 'restore', works: bk.works });
        $('mgMsg').textContent = `✓ ${res.restored} student work(s) restored from ${b.dataset.bkRestore}.`;
        await refreshLive(); renderManage();
      };
    });
  } catch (e) { $('backupList').innerHTML = ''; }
}
async function renderDbStats() {
  try {
    const s = await (await tfetch('api/stats')).json();
    if (!s.hosted) {
      $('dbStats').innerHTML = `<p>Class server on this computer: no quota. ${s.students} students${s.dataSize ? ` · about ${(s.dataSize / 1048576).toFixed(1)} MB of data` : ''}.</p>`;
      return;
    }
    const pct = s.quota ? Math.min(100, Math.round((s.monthTotal / s.quota) * 100)) : 0;
    const dayOfMonth = new Date().getUTCDate(), daysInMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0).getDate();
    const forecast = Math.round((s.monthTotal / Math.max(1, dayOfMonth)) * daysInMonth);
    $('dbStats').innerHTML = `<div class="gauge"><div class="gauge-fg ${pct > 85 ? 'bad' : pct > 60 ? 'warn' : ''}" style="width:${pct}%"></div></div>
      <p><b>${s.monthTotal.toLocaleString()}</b> database operations this month (${s.month}) out of <b>${Number(s.quota).toLocaleString()}</b> (${pct} %) · today: ${s.today.toLocaleString()} · forecast for the month: about ${forecast.toLocaleString()}.</p>
      <p class="muted">${s.students} students${s.dataSize ? ` · data about ${(s.dataSize / 1048576).toFixed(1)} MB (free database: 256 MB)` : ''}. If the quota is reached, online saving stops until the next month: students can still download their work.
      Free quota of your Upstash plan: <input id="dbQuota" type="number" min="1000" step="1000" value="${s.quota}" style="width:110px"> <button class="mini" id="dbQuotaSave">Save</button></p>`;
    $('dbQuotaSave').onclick = async () => { await tpost('api/settings', { dbQuota: Number($('dbQuota').value) || 500000 }); renderDbStats(); };
  } catch (e) { $('dbStats').innerHTML = ''; }
}
function renderManageExtras() {
  rosterDraft = null;
  renderRosterEditor();
  renderBackups();
  renderDbStats();
}

function setupClassroomTeacher() {
  $('helpQueue').addEventListener('click', (e) => {
    const v = e.target.closest('[data-help-view]');
    if (v) watchStudent(v.dataset.helpView);
    const d = e.target.closest('[data-help-done]');
    if (d) helpDone(d.dataset.helpDone).catch((err) => alert(err.message));
  });
  $('liveRows').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ctl]');
    if (b) { e.stopPropagation(); classCommand(b); }
    const r = e.target.closest('[data-reset]');
    if (r) clearStudentDialog(T.live[Number(r.dataset.reset)]);
  });
  $('btnExams').onclick = () => examsList().catch((e) => alert(e.message));
  document.querySelector('[data-tab="manageTab"]').addEventListener('click', () => { if (!$('liveArea').hidden) renderManageExtras(); });
  $('btnWipe').onclick = wipeDialog;
  $('btnBackupNow').onclick = async () => { try { await tpost('api/backup/now', {}); renderBackups(); renderDbStats(); } catch (e) { alert(e.message); } };
  setupRosterEditor();
  loadTeacherRoster().then(() => { if (!$('liveArea').hidden) renderLive(); });
}
window.addEventListener('load', setupClassroomTeacher);

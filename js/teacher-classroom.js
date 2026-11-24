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
    exam = `<span class="ctl-badge exam">📝 ${esc(ex.title)} · ⏱ ${mmss(ex.endsAt - T.serverNow)}</span>${examCounts(c, ex)}
      <button class="mini" data-ctl="results" data-exam="${esc(ex.id)}">Results</button><button class="mini danger" data-ctl="stop" data-exam="${esc(ex.id)}">⏹ Stop</button>`;
  } else if (ex) {
    exam = `<span class="ctl-badge exam">📝 ${esc(ex.title)} · finished</span>
      <button class="mini" data-ctl="results" data-exam="${esc(ex.id)}">Results</button><button class="mini primary" data-ctl="endexam" data-exam="${esc(ex.id)}" title="The students go back to their normal work">✓ Back to normal</button>`;
  } else {
    exam = `<button class="mini" data-ctl="exam" data-class="${esc(c)}">📝 Start an exam</button>`;
  }
  const code = (T.classCodes || {})[c], tcode = (T.testCodes || {})[c];
  return `<span class="grp-ctl">${code ? `<span class="ctl-badge code" title="Code of this class (in its link and QR code)">🔑 ${esc(code)}</span>` : ''}
    ${tcode ? `<span class="ctl-badge code" title="Test password of this class: give it to the students when the test starts (Manage → Class lists to change it)">📝 Test password ${esc(tcode)}</span>` : ''}
    ${ctl.paused ? '<span class="ctl-badge warn">⏸ paused</span>' : ''}${ctl.closed ? '<span class="ctl-badge warn">🔒 closed</span>' : ''}
    <button class="mini" data-ctl="msg" data-class="${esc(c)}" title="Show a message on every screen of this class">📢 Message</button>
    <button class="mini${ctl.paused ? ' on' : ''}" data-ctl="pause" data-class="${esc(c)}" title="Freeze the screens to get attention">${ctl.paused ? '▶ Resume' : '⏸ Pause screens'}</button>
    <button class="mini${ctl.closed ? ' on' : ''}" data-ctl="close" data-class="${esc(c)}" title="Allow or block the access of this class">${ctl.closed ? '🔓 Open access' : '🔒 Close access'}</button>
    ${exam}</span>`;
}
// in the class header during a test: how many students are in it, have submitted, are away from the page
function examCounts(c, ex) {
  const snaps = (T.live || []).filter((s) => s.className === c && s.live && s.live.exam && s.live.exam.id === ex.id);
  if (!snaps.length) return '';
  const online = (s) => T.serverNow - (s.receivedAt || 0) <= ONLINE_SECONDS && s.live.status !== 'left';
  const done = snaps.filter((s) => s.live.exam.done).length;
  const away = snaps.filter((s) => !s.live.exam.done && (s.live.exam.away || !online(s))).length;
  return ` <span class="ctl-badge" title="Students in this test · submitted · not on the test page">👥 ${snaps.length} in · ✅ ${done} submitted${away ? ` · <b style="color:#c62828">🚨 ${away} away</b>` : ''}</span>`;
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
function examDialog(c, chosen = EXAMS[EXAMS.length - 1].id) {
  const tcode = (T.testCodes || {})[c] || '';
  const card = (x) => {
    const items = examItems(x.challenges), max = items.reduce((a, i) => a + i.max, 0);
    return `<label class="exam-pick${x.id === chosen ? ' on' : ''}"><input type="radio" name="exPick" value="${esc(x.id)}"${x.id === chosen ? ' checked' : ''}>
      <div><b>${esc(x.title)}</b> <span class="muted">· ${x.minutes} min · ${max} marks</span>
      <div class="muted">${x.challenges.map((id) => { const ch = CHALLENGES.find((k) => k.id === id); return ch ? `${esc(ch.title)} (${chMarks(ch)})` : esc(id); }).join(' · ')}</div>
      <div class="muted" style="font-size:12px">${esc(x.note || '')}</div></div>
      <button class="mini" data-preview="${esc(x.id)}" title="See every question and the right answers">👁 Preview</button></label>`;
  };
  openModal(`<h2>📝 Start an exam for ${esc(c)}</h2>
    <p class="muted">Students open it with the <b>📝 Test</b> card and the <b>test password ${esc(tcode)}</b>. Each part starts from an empty program; it is marked automatically and you can change the marks after (Results → ✏️ Mark question by question).</p>
    <div class="exam-picks">${EXAMS.map(card).join('')}</div>
    <div class="exam-form">
      <label>Duration <input id="exMin" type="number" min="1" max="240" value="40" style="width:70px"> minutes</label>
      <label><input type="checkbox" id="exHints"> Hints allowed</label>
    </div>
    <div class="actions" style="justify-content:flex-end"><button onclick="closeModal()">Cancel</button><button class="primary" id="exStart">▶ Start the exam</button></div>`);
  const picked = () => EXAMS.find((x) => x.id === (document.querySelector('input[name=exPick]:checked') || {}).value) || EXAMS[0];
  document.querySelectorAll('input[name=exPick]').forEach((r) => { r.onchange = () => { document.querySelectorAll('.exam-pick').forEach((l) => l.classList.toggle('on', l.contains(r) && r.checked)); $('exMin').value = picked().minutes; }; });
  document.querySelectorAll('[data-preview]').forEach((b) => { b.onclick = (ev) => { ev.preventDefault(); examPreview(b.dataset.preview, () => examDialog(c, b.dataset.preview)); }; });
  $('exStart').onclick = async () => {
    const x = picked();
    try {
      await tpost('api/exam', { action: 'start', className: c, title: `${x.title} · ${new Date().toLocaleDateString()}`, minutes: Number($('exMin').value) || x.minutes, hints: $('exHints').checked, challenges: x.challenges });
      if (tcode) openModal(`<div class="big-share"><h2>📝 ${esc(c)} · ${esc(x.title)} is open</h2><p>Click <b>📝 Test</b>, then type the test password:</p><div style="font-size:72px;font-weight:800;letter-spacing:10px;margin:10px 0">${esc(tcode)}</div><div style="text-align:right"><button class="primary" onclick="closeModal()">OK</button></div></div>`);
      else closeModal();
      await refreshLive();
    } catch (e) { alert(e.message); }
  };
}
// What the students will see: every part, its marks, the mission, the quiz questions with the right answers
const previewWs = [];
function examPreview(id, back) {
  const x = EXAMS.find((k) => k.id === id);
  if (!x) return;
  while (previewWs.length) { try { previewWs.pop().dispose(); } catch (e) { /* gone */ } }
  const items = examItems(x.challenges), max = items.reduce((a, i) => a + i.max, 0);
  const part = (cid, n) => {
    const ch = CHALLENGES.find((k) => k.id === cid);
    if (!ch) return '';
    if (!ch.quiz) return `<div class="pv-part"><h3>${n}. ${esc(ch.title)} <span class="muted">· ${chMarks(ch)} marks</span></h3><div class="review-mission">${richDesc(ch.description)}</div>
      <p class="muted">Checked automatically: ${(ch.tests || []).map((t) => `${esc(t.label)} (${t.points} %)`).join(' · ')}</p></div>`;
    return `<div class="pv-part"><h3>${n}. ${esc(ch.title)} <span class="muted">· ${chMarks(ch)} marks</span></h3>${ch.questions.map((q, i) => `<div class="mc-q"><p>${i + 1}. ${esc(q.q)} <span class="muted">[${q.marks || 1} mark${(q.marks || 1) > 1 ? 's' : ''}]</span>${q.multi ? ' <span class="q-multi">(several answers)</span>' : ''}</p>${q.code ? `<div class="q-code" data-pv="${esc(cid)}:${i}"></div>` : ''}${q.open ? `<div class="wq-opt right">✍ Typed answer · accepted: ${esc(q.model || q.accept.join(', '))}</div>` : q.options.map((o, k) => `<div class="wq-opt${quizRight(q, k) ? ' right' : ''}">${quizRight(q, k) ? '✔' : '·'} ${esc(o)}</div>`).join('')}</div>`).join('')}</div>`;
  };
  openModal(`<div class="actions"><button id="pvBack">← Back</button></div>
    <h2>👁 ${esc(x.title)} <span class="muted">· ${x.minutes} min · ${max} marks</span></h2><p class="muted">${esc(x.note || '')}</p>
    ${x.challenges.map((cid, i) => part(cid, i + 1)).join('')}`);
  $('modal').querySelector('.modal-box').style.maxWidth = '900px';
  document.querySelectorAll('[data-pv]').forEach((div) => {
    const [cid, i] = div.dataset.pv.split(':');
    const q = CHALLENGES.find((k) => k.id === cid).questions[Number(i)];
    const w = renderProgramInto(div, q.code);
    if (w) previewWs.push(w);
  });
  $('pvBack').onclick = back;
}
async function examsList() {
  const d = await (await tfetch('api/exams')).json();
  openModal(`<h2>📝 Exams</h2>
    ${d.exams.length ? `<table class="cls"><thead><tr><th>Exam</th><th>Class</th><th>Date</th><th>Challenges</th><th>State</th><th></th></tr></thead><tbody>
    ${d.exams.map((e) => `<tr><td><b>${esc(e.title)}</b></td><td>${esc(e.className)}</td><td>${new Date(e.startedAt * 1000).toLocaleString()}</td><td>${e.challenges.length} · ${e.minutes} min${e.hints ? ' · hints' : ''}</td>
      <td>${!e.stoppedAt && d.now < e.endsAt ? '⏱ running' : 'finished'}</td>
      <td style="white-space:nowrap"><button class="mini primary" data-exres="${esc(e.id)}">Results</button> <button class="mini" data-exsave="${esc(e.id)}" title="Save everything of this exam on this computer">💾</button> <button class="mini danger" data-exdel="${esc(e.id)}">🗑</button></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">No exam yet. Start one from the header of a class in the live view (📝 Start an exam).</p>'}
    <div class="actions"><label class="mini-file"><input type="file" id="exOpenFile" accept=".json" hidden><button id="exOpenBtn" title="If the database has a problem: open a backup saved on this computer">📂 Open a backup file</button></label>
      <span class="muted">A backup is saved on this computer at the end of each exam (while this dashboard is open).</span></div>`);
  document.querySelectorAll('[data-exsave]').forEach((b) => { b.onclick = () => backupExam(b.dataset.exsave); });
  $('exOpenBtn').onclick = () => $('exOpenFile').click();
  $('exOpenFile').onchange = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d.exam || !Array.isArray(d.results)) throw new Error('this is not an exam backup');
      X.exam = d.exam; X.results = d.results; X.verified = {}; X.now = d.savedAt || Date.now() / 1000; X.fromFile = f.name;
      renderExamResults();
    } catch (err) { alert('Cannot open this file: ' + err.message); }
  };
  document.querySelectorAll('[data-exres]').forEach((b) => { b.onclick = () => examResults(b.dataset.exres); });
  document.querySelectorAll('[data-exdel]').forEach((b) => {
    b.onclick = async () => { if (confirm('Delete this exam and its results?')) { await tpost('api/exam', { action: 'delete', examId: b.dataset.exdel }); examsList(); } };
  });
}
const X = { exam: null, results: [], verified: {} };
const awayCell = (r) => (!r.away || !r.away.n ? '<span class="muted">—</span>' : `<span class="away-n">⚠️ ${r.away.n}× · ${fmtTime(Math.round(r.away.ms / 1000))}</span>`);
// ---------- 💾 Backup on this computer: the exam and every result (programs, answers, marks), as one JSON file ----------
async function backupExam(id, auto = false) {
  const d = await (await tfetch('api/exam/results?examId=' + encodeURIComponent(id))).json();
  if (!d.exam) { if (!auto) alert('Exam not found.'); return false; }
  const g7 = examGrades(d.exam, d.results);
  const rows = d.results.map((r) => ({ name: r.name, ...markSheet(d.exam.challenges, r), grade: g7[r.studentId] }));
  const file = { type: 'mb-exam-backup', savedAt: Date.now() / 1000, exam: d.exam, results: d.results,
    marks: rows.map((r) => ({ name: r.name, total: r.total, max: r.max, grade: r.grade, items: r.items.map((it) => ({ key: it.key, mark: it.mark, max: it.max, changed: it.changed })) })) };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
  a.download = `exam-backup_${slugName(d.exam.className)}_${slugName(d.exam.title)}_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
// a short note at the bottom of the dashboard
function tnote(msg, ms = 8000) {
  const n = document.createElement('div');
  n.className = 'tnote';
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), ms);
}
// at the end of an exam (time over or stopped), once the late results are in: one backup, automatically
const SAVED_KEY = 'mbsim.examBackups';
async function autoBackupExams() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { /* none */ }
  for (const ctl of Object.values(T.classctl || {})) {
    const ex = ctl && ctl.exam;
    if (!ex || !ex.id || saved.includes(ex.id)) continue;
    const end = ex.stoppedAt || ex.endsAt;
    if (!(T.serverNow > end + 100)) continue; // the results of the last seconds arrive within 90 s
    saved.push(ex.id);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved.slice(-100))); } catch (e) { /* private window */ }
    if (await backupExam(ex.id, true)) tnote(`💾 Exam backup saved on this computer (Downloads): ${ex.title} · ${ex.className}`);
  }
}
async function examResults(id) {
  const d = await (await tfetch('api/exam/results?examId=' + encodeURIComponent(id))).json();
  if (!d.exam) { alert('Exam not found.'); return; }
  X.exam = d.exam; X.results = d.results; X.verified = {}; X.now = d.now; X.fromFile = null;
  renderExamResults();
}
// a result with the replayed scores (Verify) in place of the scores sent by the browsers
function verifiedResult(r) {
  const chs = {};
  for (const [cid, c] of Object.entries(r.challenges || {})) {
    const v = X.verified[(r.studentId || '') + ':' + cid];
    chs[cid] = v !== undefined ? { ...c, score: v } : c;
  }
  return { ...r, challenges: chs };
}
function examRows() {
  const e = X.exam, names = (teacherRoster()[e.className] || []).slice();
  const rows = names.map((n) => X.results.find((r) => nkey(r.name) === nkey(n) && nkey(r.className) === nkey(e.className)) || { name: n, className: e.className, challenges: {}, missing: true });
  for (const r of X.results) if (!rows.includes(r)) rows.push(r);
  const g7 = examGrades(e, X.results.map(verifiedResult));
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((r) => ({ r, sheet: markSheet(e.challenges, verifiedResult(r)), g7: r.studentId ? g7[r.studentId] : undefined }));
}
const fmtMark = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
// what the AI said about one program: its mark, the comment the student will see, the note for the teacher
function aiBox(r, key, it) {
  const a = r && r.ai && r.ai[key];
  if (!a || !it) return '';
  const stale = ((r.challenges || {})[key.split('#')[0]] || {}).at > a.at;
  return `<div class="ai-note">🤖 <b>AI: ${fmtMark(it.ai)} / ${fmtMark(it.max)}</b> <span class="muted">(${it.q === null ? 'automatic checks' : 'answer key'}: ${fmtMark(it.tests)})</span>${stale ? ' <b>⚠ the program changed after: mark it again</b>' : ''}
    <div>📝 <i>Why:</i> ${esc(a.teacherNote)}</div></div>`;
}
// the comment the student will read in their correction: the AI's suggestion, or what the teacher wrote (it wins)
function commentBox(r, key, it) {
  if (!r || !r.studentId || !it || !it.submitted) return '';
  const a = r.ai && r.ai[key], mine = r.comments && Object.prototype.hasOwnProperty.call(r.comments, key);
  const text = mine ? r.comments[key] : (a && a.feedback) || '';
  return `<div class="cmt-box"><label>💬 Comment for the student <span class="muted">(the student sees it in their correction${mine ? ' · ✎ written by you' : a ? ' · suggested by the AI: edit it freely' : ''})</span></label>
    <textarea class="cmt" data-sid="${esc(r.studentId)}" data-key="${esc(key)}" rows="2" maxlength="800" placeholder="Write a comment for the student (optional)">${esc(text)}</textarea>
    <div class="cmt-actions"><span class="cmt-ok muted"></span>${mine && a ? `<button class="mini" data-cmtreset="${esc(r.studentId)}|${esc(key)}" title="Back to the comment suggested by the AI">↺ AI suggestion</button>` : ''}</div></div>`;
}
async function saveComment(sid, key, text) {
  const r = X.results.find((x) => x.studentId === sid);
  const d = await tpost('api/exam/comment', { examId: X.exam.id, studentId: sid, key, text });
  if (r) r.comments = d.comments;
}
// the comment boxes of what is on the screen: saved when the teacher leaves the box; again() redraws (after ↺)
function bindComments(again) {
  document.querySelectorAll('textarea.cmt').forEach((t) => {
    const first = t.value;
    t.onchange = async () => {
      const ok = t.parentElement.querySelector('.cmt-ok');
      try { await saveComment(t.dataset.sid, t.dataset.key, t.value.trim()); ok.textContent = '✓ saved'; setTimeout(() => { ok.textContent = ''; }, 1500); }
      catch (err) { ok.textContent = '⚠ not saved: ' + err.message; t.value = first; }
    };
  });
  document.querySelectorAll('[data-cmtreset]').forEach((b) => {
    b.onclick = async () => { const [sid, key] = b.dataset.cmtreset.split('|'); try { await saveComment(sid, key, null); again(); } catch (err) { alert('Not saved: ' + err.message); } };
  });
}
// the text of a challenge for the AI (no pictures)
function taskText(ch) {
  const d = String(ch.description || '').replace(/\[\[btn:(\w+)\]\]/g, 'button $1').replace(/\[\[icon:(\w+)\]\]/g, '(icon $1)').replace(/\[\[text:([^\]]*)\]\]/g, '"$1"')
    .replace(/\[\[img:([^\]]*)\]\]/g, '(LED picture $1)').replace(/\[\[shake\]\]/g, 'shake').replace(/\[\[leds:(\w+)\]\]/g, '(LEDs $1)')
    .replace(/<li>/g, '\n- ').replace(/<\/?(ul|p)\b[^>]*>/g, '\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  return `${ch.title}\n${d.trim()}\nBlocks to use: ${ch.skills || ''}`;
}
// 🤖 AI marking: each program handed in (not marked yet, or changed since) → OpenAI (key on the server) → the AI mark
// 🧾 the AI log: every call of this test (saved on the server), newest first
async function aiLog(e) {
  let d;
  try { d = await (await tfetch('api/exam/ailog?examId=' + encodeURIComponent(e.id))).json(); } catch (err) { alert('The log cannot be read: ' + err.message); return; }
  const rows = (d.log || []).map((x) => `<tr class="${x.ok ? '' : 'ai-err'}"><td style="white-space:nowrap">${new Date(x.t * 1000).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
    <td>${esc(x.name || x.studentId)}</td><td>${esc(chName(String(x.part || '').split(' ')[0]))}${/typed/.test(x.part) ? ' (typed answers)' : ''}</td><td>${x.ok ? '✅' : '❌'} ${esc(x.msg)}</td><td class="muted">${(x.ms / 1000).toFixed(1)} s</td></tr>`).join('');
  openModal(`<h2>🧾 AI log · ${esc(e.title)} · ${esc(e.className)}</h2>
    <p class="muted">OpenAI key on the server: <b>${d.key ? '✅ found' : '❌ missing (Vercel → Settings → Environment Variables → OPENAI_API_KEY, then Redeploy)'}</b> · model ${esc(d.model || '')}. Each line is one call: a student's program, or all their typed answers.</p>
    ${X.aiError ? `<p class="warn-box">⚠ Last run in this window: ${esc(X.aiError)}</p>` : ''}
    <div style="overflow-x:auto"><table class="cls"><thead><tr><th>When</th><th>Student</th><th>Part</th><th>Result</th><th>Time</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">No AI call for this test yet.</td></tr>'}</tbody></table></div>
    <div class="actions"><button id="alBack">← Back to the results</button></div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1100px';
  $('alBack').onclick = renderExamResults;
}
// opts.sid: one student only (from their view, even before they hand in); opts.force: mark everything again;
// opts.say: where to write the progress; opts.after: what to show at the end (else the results)
async function aiMarkExam(opts = {}) {
  const say = opts.say || ((t) => { if ($('exMsg')) $('exMsg').textContent = t; });
  const e = X.exam, over = e.stoppedAt || X.now > e.endsAt;
  const todo = [];
  for (const r of X.results) {
    if (opts.sid && r.studentId !== opts.sid) continue;
    if (!r.studentId || !(opts.sid || r.finishedAt || over)) continue;
    for (const cid of e.challenges) {
      const ch = CHALLENGES.find((c) => c.id === cid), c = (r.challenges || {})[cid];
      if (!ch || !c || !c.program) continue;
      if (ch.quiz) {
        // the typed answers not read yet (an empty answer: 0, nothing to ask)
        const answers = c.program.answers || [];
        const qs = ch.questions.map((q, i) => i).filter((i) => ch.questions[i].open && typeof answers[i] === 'string' && answers[i].trim()
          && (opts.force || !(r.ai && r.ai[`${cid}#${i}`] && !(c.at > r.ai[`${cid}#${i}`].at))));
        if (qs.length) todo.push([r, ch, c, qs]);
        continue;
      }
      const a = r.ai && r.ai[cid];
      if (opts.force || !a || c.at > a.at) todo.push([r, ch, c]);
    }
  }
  const nAns = todo.filter((j) => j[3]).reduce((a, j) => a + j[3].length, 0), nProg = todo.filter((j) => !j[3]).length;
  const what = [nProg ? `${nProg} program${nProg > 1 ? 's' : ''}` : '', nAns ? `${nAns} typed quiz answer${nAns > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ');
  if (!todo.length) {
    const waiting = X.results.filter((r) => r.studentId && !r.finishedAt).length;
    if (opts.sid) { say('🤖 Nothing to mark: no program and no typed answer.'); return; }
    say(`🤖 Nothing to mark: every program and typed answer handed in is already marked${!over && waiting ? `. ${waiting} student${waiting > 1 ? 's have' : ' has'} not handed in yet (marked once they click "Submit my test", or when the test is over). Or open a student and click 🤖 AI marking there` : ''}.`);
    return;
  }
  if (!confirm(opts.sid ? `Mark ${what} of ${todo[0][0].name} with the AI (OpenAI gpt-4o)?\n\nThe AI mark replaces the automatic mark (the multiple-choice questions keep the answer key); the marks you changed stay. The student will see a short comment in their correction.` : `Mark ${what} with the AI (OpenAI ${'gpt-4o'})?\n\nOnly the programs of students who handed in the test${over ? ' (the test is over: everybody)' : ''}. The AI mark replaces the automatic mark (the multiple-choice questions keep the answer key); the marks you changed stay. Each student will also see a short comment in their correction.`)) return;
  let sols = {};
  try { sols = (await (await tfetch('api/solutions')).json()).solutions || {}; } catch (err) { /* the solutions of the challenges */ }
  const solText = {};
  const solOf = (ch) => {
    if (!(ch.id in solText)) {
      const p = ((sols[ch.id] || [])[0] || {}).program || ch.solution;
      try { solText[ch.id] = p ? programFromState(p).ts : ''; } catch (err) { solText[ch.id] = ''; }
    }
    return solText[ch.id];
  };
  let done = 0, failed = null;
  const errors = [];
  X.aiError = null;
  const one = async ([r, ch, c, qs]) => {
    if (qs) {
      const answers = c.program.answers || [], g = gradeQuiz(ch, answers);
      const questions = qs.map((i) => {
        const q = ch.questions[i];
        let code = '';
        try { code = q.code ? programFromState(q.code).ts : ''; } catch (err) { /* no program */ }
        return { i, q: q.q, marks: q.marks || 1, model: q.model || q.accept[0], accept: q.accept.join(', ') + (q.reject && q.reject.length ? ` (refused when it has: ${q.reject.join(', ')})` : ''), code, answer: answers[i], auto: g.criteria[i].ok ? 'right' : 'wrong' };
      });
      const d = await tpost('api/exam/ai', { examId: e.id, studentId: r.studentId, challengeId: ch.id, questions });
      Object.assign(r.ai || (r.ai = {}), d.ai);
      done++;
      say(`🤖 AI marking ${done} / ${todo.length}…`);
      return;
    }
    let code = '', checks = '';
    try {
      const prog = programFromState(c.program);
      code = prog.ts;
      const res = evaluateChallenge(ch, prog);
      checks = `Score of the checks: ${res.score} %\n` + res.criteria.map((k) => `${k.ok ? 'OK ' : k.points ? 'PART ' : 'NO '} ${k.label}${k.max ? ` (${k.points}/${k.max})` : ''}`).join('\n');
    } catch (err) { checks = 'The program cannot run: ' + err.message; }
    const d = await tpost('api/exam/ai', { examId: e.id, studentId: r.studentId, challengeId: ch.id, max: chMarks(ch), task: taskText(ch), code, solution: solOf(ch), checks });
    Object.assign(r.ai || (r.ai = {}), d.ai);
    say(`🤖 AI marking ${++done} / ${todo.length}…`);
  };
  say(`🤖 AI marking 0 / ${todo.length}…`);
  const queue = todo.slice();
  await Promise.all([0, 1, 2].map(async () => {
    while (queue.length && !failed) {
      const job = queue.shift();
      try { await one(job); } catch (err) {
        errors.push(`${job[0].name} · ${job[1].title}: ${err.message}`);
        if (errors.length >= 3 || /OPENAI_API_KEY|401|403|429|quota/i.test(err.message)) failed = err.message;  // the key, the quota: no use going on
      }
    }
  }));
  if (errors.length) X.aiError = `${errors.length} error${errors.length > 1 ? 's' : ''}${failed ? ' (stopped)' : ''}. Last: ${errors[errors.length - 1]}`;
  if (opts.after) opts.after(); else renderExamResults();
  refreshGrades(true);
  say(errors.length ? `⚠ ${done} / ${todo.length} marked. ${failed ? 'Stopped: ' + failed : 'Error: ' + errors[errors.length - 1]} (🧾 AI log in the results)`
    : opts.sid ? `✓ ${what} marked by the AI: check the 🤖 boxes below.` : `✓ ${what} marked by the AI: check them (✏️ Mark question by question), then share the corrections.`);
}
// the work of one student in one test, to open it in the student view (program and board, or the quiz answers)
function examWork(r, cid) {
  const e = X.exam, c = (r.challenges || {})[cid] || {};
  const ids = [...new Set([...CHALLENGES.map((ch) => ch.id), cid])];
  const challenges = Object.fromEntries(ids.map((id) => [id, id === cid ? (c.program && c.program.quiz ? { status: 'validated', answers: c.program.answers } : { status: 'validated', program: c.program }) : { status: 'locked' }]));
  return { name: `${r.name} · ${e.title}`, className: e.className, mode: 'guided', current: cid, challenges, free: {}, events: [] };
}
function renderExamResults() {
  const e = X.exam, rows = examRows();
  const items = examItems(e.challenges), max = items.reduce((a, i) => a + i.max, 0);
  const running = !e.stoppedAt && X.now < e.endsAt;
  const curve = { ...CURVE_DEFAULT, ...(e.curve || {}) };
  const graded = rows.filter((x) => x.g7 !== undefined);
  const hist = [1, 2, 3, 4, 5, 6, 7].map((g) => graded.filter((x) => x.g7 === g).length), hmax = Math.max(1, ...hist);
  const avgMarks = graded.length ? graded.reduce((a, x) => a + x.sheet.total, 0) / graded.length : 0;
  openModal(`<h2>📝 ${esc(e.title)} · ${esc(e.className)}</h2>
    <p class="muted">${new Date(e.startedAt * 1000).toLocaleString()} · ${e.minutes} min · ${running ? '⏱ still running' : 'finished'} · marks given automatically (🤖 purple = AI mark, ✎ = changed by you).</p>
    <div class="curve-box"><div><b>Grade out of 7: a bell curve for the class</b><div class="muted">Each total is placed against the class (class average ${fmtMark(Math.round(avgMarks * 10) / 10)} / ${fmtMark(max)} marks), then on a curve of:</div>
        <label>average grade <input type="number" id="cvMean" min="1" max="7" step="0.1" value="${curve.mean}" style="width:64px"></label>
        <label>spread <input type="number" id="cvSd" min="0" max="3" step="0.1" value="${curve.sd}" style="width:64px"></label>
        <button class="mini" id="cvReset" title="Average 4.5, spread 1.2">Default</button><span id="cvMsg" class="muted"></span></div>
      <div class="hist">${hist.map((n, i) => `<div class="hbar"><span class="hn">${n || ''}</span><div style="height:${Math.round(n / hmax * 60)}px"></div><b>${i + 1}</b></div>`).join('')}</div></div>
    <div class="actions"><button class="primary" id="exReview" title="Go through the questions one by one and change the marks">✏️ Mark question by question</button>
      <button id="exAi" title="After the test: the AI (OpenAI) reads each program handed in and gives a mark and a short comment for the student. You check and change them before sharing">🤖 AI marking</button>
      <button id="exAiLog" title="Every AI marking call of this test: what worked, and the errors">🧾 AI log</button>
      <button id="exVerify" title="Replays every saved program on the official trials (deterministic): checks that nobody changed their score">🔁 Verify by replaying</button>
      <button id="exShare" title="Mark the test first. Then: a text to copy with the link of each student's correction (no password needed)">🔗 Correction links${e.shared ? ' ✓' : ''}</button>
      <button id="exCsv">📊 CSV</button><button id="exSave" title="Save everything of this exam on this computer (JSON)">💾 Backup</button><button id="exRefresh">↻ Refresh</button><span id="exMsg" class="muted"></span></div>${X.aiError ? `<p class="warn-box" id="exAiErr">⚠ AI marking: ${esc(X.aiError)} <button class="mini" id="exAiErrLog">🧾 See the AI log</button></p>` : ''}
    ${X.fromFile ? `<p class="warn-box">📂 Opened from the backup file <b>${esc(X.fromFile)}</b>: changing a mark needs the database.</p>` : ''}
    <div style="overflow-x:auto"><table class="cls exam-table"><thead><tr><th>Student</th>${items.map((it, k) => `<th title="${esc(it.label)}"><button class="linklike" data-review="${k}">${esc(it.short)}</button><br><span class="muted">/${fmtMark(it.max)}</span></th>`).join('')}<th>Total<br><span class="muted">/${fmtMark(max)}</span></th><th>Grade<br><span class="muted">/7</span></th><th title="When the student clicked Submit my test">Handed in</th><th title="How many times the student left the test page (other tab, other window, page closed), and for how long">Left the page</th></tr></thead><tbody>
    ${rows.map(({ r, sheet, g7 }) => `<tr${r.missing ? ' class="absent"' : ''}><td><button class="linklike" data-exstudent="${esc(r.studentId || 'name:' + r.name)}" title="See the whole exam of this student"><b>${esc(r.name)}</b></button>${r.missing ? ' <span class="muted">no result</span>' : ''}</td>
      ${sheet.items.map((it) => (r.missing ? '<td class="muted">—</td>'
    : `<td><input type="number" class="cell-mark${it.changed ? ' mark-changed' : it.ai !== null ? ' ai-mark' : ''}${!it.submitted && !it.changed ? ' empty' : ''}" data-sid="${esc(r.studentId)}" data-key="${esc(it.key)}" data-max="${it.max}" min="0" max="${it.max}" step="0.5" value="${it.mark}" title="${it.changed ? `Changed by you (automatic: ${fmtMark(it.auto)})` : it.ai !== null ? `AI mark (${it.q === null ? 'automatic checks' : 'answer key'}: ${fmtMark(it.tests)}): type another one to change it` : it.submitted ? 'Automatic mark: type another one to change it' : 'Nothing submitted'}"></td>`)).join('')}
      <td>${r.missing ? '—' : `<button class="linklike" data-exstudent="${esc(r.studentId)}" title="All the answers of this student, with their marks"><b>${fmtMark(sheet.total)}</b></button>`}</td><td>${r.missing ? '—' : `<button class="linklike" data-exstudent="${esc(r.studentId)}" title="All the answers of this student, with their marks"><b class="grade">${g7 === undefined ? '—' : g7}</b></button>`}</td>
      <td>${r.finishedAt ? new Date(r.finishedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '<span class="muted">—</span>'}</td>
      <td>${awayCell(r)}</td></tr>`).join('')}</tbody></table></div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1400px';
  $('exRefresh').onclick = () => (X.fromFile ? renderExamResults() : examResults(e.id));
  $('exSave').onclick = () => backupExam(e.id);
  const setCurve = async (mean, sd) => {
    if (X.fromFile) { e.curve = { mean, sd }; return renderExamResults(); }
    try { const d = await tpost('api/exam', { action: 'curve', examId: e.id, mean, sd }); X.exam = d.exam; renderExamResults(); refreshGrades(true); } catch (err) { $('cvMsg').textContent = err.message; }
  };
  $('cvMean').onchange = $('cvSd').onchange = () => setCurve(Number($('cvMean').value), Number($('cvSd').value));
  $('cvReset').onclick = () => setCurve(CURVE_DEFAULT.mean, CURVE_DEFAULT.sd);
  $('exReview').onclick = () => renderReview(0);
  document.querySelectorAll('[data-review]').forEach((b) => { b.onclick = () => renderReview(Number(b.dataset.review)); });
  $('exCsv').onclick = () => {
    const head = ['Class', 'Student', ...items.map((it) => `${it.short} (/${it.max})`), `Total (/${max})`, 'Percent', 'Grade (/7)', 'Handed in', 'Left the page (times)', 'Away (seconds)'];
    const lines = [head].concat(rows.map(({ r, sheet, g7 }) => [e.className, r.name, ...sheet.items.map((it) => it.mark), sheet.total, sheet.pct, g7 === undefined ? '' : g7,
      r.finishedAt ? new Date(r.finishedAt * 1000).toLocaleTimeString() : '', r.away ? r.away.n : '', r.away ? Math.round(r.away.ms / 1000) : '']));
    const csv = '﻿' + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `test_${slugName(e.className)}_${slugName(e.title)}.csv`;
    a.click();
  };
  $('exVerify').onclick = verifyExam;
  $('exAiLog').onclick = () => aiLog(e);
  if ($('exAiErrLog')) $('exAiErrLog').onclick = () => aiLog(e);
  $('exAi').onclick = () => (X.fromFile ? alert('Opened from a backup file: the AI marking needs the database.') : aiMarkExam());
  $('exShare').onclick = () => (X.fromFile ? alert('Opened from a backup file: the correction links need the database.') : shareCorrections());
  document.querySelectorAll('[data-exview]').forEach((b) => {
    b.onclick = () => { const [sid, cid] = b.dataset.exview.split(':'); examViewer(sid, Math.max(0, e.challenges.indexOf(cid))); };
  });
  // a mark changed in the table: saved at once, totals, grades and the curve follow
  document.querySelectorAll('.cell-mark').forEach((inp) => {
    inp.onchange = async () => {
      let v = Number(inp.value);
      if (inp.value === '' || !isFinite(v)) { inp.value = ''; return; }
      v = Math.max(0, Math.min(Number(inp.dataset.max), halfMark(v)));
      if (X.fromFile) { alert('Opened from a backup file: changing a mark needs the database.'); return; }
      const box = $('modal').querySelector('.modal-box'), y = box.scrollTop;
      await saveMark(inp.dataset.sid, inp.dataset.key, v);
      renderExamResults();
      $('modal').querySelector('.modal-box').scrollTop = y;
    };
    inp.onkeydown = (ev) => { if (ev.key === 'Enter') inp.blur(); };
  });
  document.querySelectorAll('[data-exstudent]').forEach((b) => { b.onclick = () => examViewer(b.dataset.exstudent, 0); });
}

// The correction links: each student opens their own correction (marks, grade, right answers, a program that works).
// The grades out of 7 are those of the table now: share again after changing marks.
async function shareCorrections() {
  const e = X.exam, rows = examRows().filter(({ r }) => r.studentId && !r.missing);
  const grades = Object.fromEntries(rows.filter((x) => x.g7 !== undefined).map(({ r, g7 }) => [r.studentId, g7]));
  if (!confirm(`Open the correction of "${e.title}" (${e.className}) to the students?\n\nEach student sees only their own marks, their grade (${rows.length ? 'as in this table now' : 'none yet'}), the right answers and a program that works.\nMark the test first. If you change marks later, click this button again.`)) return;
  let d;
  try { d = await tpost('api/exam', { action: 'share', examId: e.id, grades }); } catch (err) { alert(err.message); return; }
  X.exam = d.exam;
  const base = new URL('correction.html', location.href).href;
  const links = d.links.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
  const text = `Correction of the test "${e.title}" (${e.className}): open your own link.\n\n` + links.map((l) => `${l.name}: ${base}?e=${encodeURIComponent(e.id)}&s=${encodeURIComponent(l.studentId)}&k=${l.key}`).join('\n');
  openModal(`<h2>🔗 Correction links · ${esc(e.title)} · ${esc(e.className)}</h2>
    <p class="muted">Copy this text and send it to the class (Teams, email…). Each link opens the correction of one student only: no password. ${links.length} student${links.length === 1 ? '' : 's'}.</p>
    <textarea id="shText" readonly style="width:100%;height:320px;font-family:monospace;font-size:13px">${esc(text)}</textarea>
    <div class="actions"><button id="shBack">← Back to the results</button><button id="shStop" title="The links stop working (you can open them again later)">🚫 Close the corrections</button><button class="primary" id="shCopy">📋 Copy the text</button><span id="shMsg" class="muted"></span></div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1000px';
  $('shCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(text); } catch (err) { $('shText').select(); document.execCommand('copy'); }
    $('shMsg').textContent = '✅ Copied';
  };
  $('shBack').onclick = renderExamResults;
  $('shStop').onclick = async () => {
    try { const r = await tpost('api/exam', { action: 'share', examId: e.id, on: false }); X.exam = r.exam; renderExamResults(); } catch (err) { $('shMsg').textContent = err.message; }
  };
}
// the teacher changes one mark (null = back to the automatic mark)
async function saveMark(sid, key, marks, el) {
  const r = X.results.find((x) => x.studentId === sid);
  try {
    const d = await tpost('api/exam/mark', { examId: X.exam.id, studentId: sid, key, marks, name: r && r.name });
    if (r) r.marks = d.marks;
    if (el) { el.textContent = '✓ saved'; setTimeout(() => { el.textContent = ''; }, 1500); }
    refreshGrades(true);
  } catch (err) { alert('Not saved: ' + err.message); }
}

// ---------- 👁 The exam of one student: every answer stacked, with its mark that the teacher can change ----------
const EVW = { boards: [], ws: [] };
function stopExamViewer() {
  if (EVW.raf) cancelAnimationFrame(EVW.raf);
  EVW.raf = null;
  EVW.boards = [];
  while (EVW.ws.length) { try { EVW.ws.pop().dispose(); } catch (e) { /* gone */ } }
}
function examViewer(sid, part = 0, back = renderExamResults) {
  stopWatch();
  stopExamViewer();
  // every student of the class (the class list), with or without a result
  const e = X.exam, list = examRows();
  const keyOf = (r) => r.studentId || 'name:' + r.name;
  const idx = list.findIndex(({ r }) => keyOf(r) === sid);
  if (idx < 0) return back();
  const { r, sheet, g7 } = list[idx];
  const partMarks = (id) => { const its = sheet.items.filter((it) => it.chId === id); return { got: its.reduce((a, it) => a + it.mark, 0), max: its.reduce((a, it) => a + it.max, 0), sent: its.some((it) => it.submitted), changed: its.some((it) => it.changed) }; };
  const markRow = (it) => `<div class="ev-mark"><span>${it.ai !== null && it.ai !== undefined ? '🤖 AI' : 'Automatic'}: <b>${fmtMark(it.auto)}</b> / ${fmtMark(it.max)}</span>
      <label>Mark <input type="number" class="ev-in" data-key="${esc(it.key)}" data-max="${it.max}" min="0" max="${it.max}" step="0.5" value="${it.mark}"> / ${fmtMark(it.max)}</label>
      ${it.changed ? `<button class="mini" data-evauto="${esc(it.key)}" title="Back to the automatic mark">↺ auto</button> <span class="mark-changed">✎ changed by you</span>` : ''}</div>`;
  const section = (cid, i) => {
    const ch = CHALLENGES.find((k) => k.id === cid), c = (r.challenges || {})[cid], m = partMarks(cid);
    const head = `<div class="ev-sec-head"><h3>${i + 1}. ${ch ? (ch.quiz ? '❓ ' : '') + esc(ch.title) : esc(cid)}</h3><span class="ev-sec-marks">${m.sent || m.changed ? fmtMark(m.got) : '—'} / ${fmtMark(m.max)}${m.changed ? ' ✎' : ''}</span></div>`;
    if (!ch) return `<section class="ev-sec" id="ev-${i}">${head}<p class="muted">This part is no longer in the app: it cannot be shown.</p></section>`;
    if (ch.quiz) {
      const answers = (c && c.program && c.program.answers) || [];
      return `<section class="ev-sec" id="ev-${i}">${head}${c ? '' : '<p class="muted">No answers sent.</p>'}${ch.questions.map((q, k) => {
        const it = sheet.items.find((x) => x.key === `${cid}#${k}`);
        return `<div class="ev-q"><p><b>${k + 1}. ${esc(q.q)}</b>${q.multi ? ' <span class="q-multi">(several answers)</span>' : ''}</p>${q.code ? `<div class="q-code" data-evq="${esc(cid)}:${k}"></div>` : ''}
          ${q.open ? openAnswerHtml(q, answers[k]) : q.options.map((o, j) => { const p = quizPicked(q, answers[k], j), ok = quizRight(q, j); return `<div class="wq-opt${ok ? ' right' : ''}${p ? (ok ? ' picked-ok' : ' picked-ko') : ''}">${p ? (ok ? '✔' : '✖') : ok ? '○' : '·'} ${esc(o)}</div>`; }).join('')}
          ${aiBox(r, `${cid}#${k}`, it)}${q.open ? commentBox(r, `${cid}#${k}`, it) : ''}${markRow(it)}</div>`;
      }).join('')}</section>`;
    }
    const it = sheet.items.find((x) => x.key === cid);
    return `<section class="ev-sec" id="ev-${i}">${head}<div class="ev-mission">${richDesc(ch.description)}</div>
      ${c && c.program ? `<div class="ev-grid"><div class="ev-prog" data-evp="${esc(cid)}"></div>
        <div class="ev-right"><div class="mc-boards ev-board" data-evb="${esc(cid)}" style="padding:0"></div>
          <div class="actions"><button class="mini" data-evrun="${esc(cid)}" title="Start their program again">↻ Restart</button><span class="muted">${c.checks || 1} submission${(c.checks || 1) > 1 ? 's' : ''}${c.at ? ' · last ' + new Date(c.at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
          <div class="ev-crit" data-evc="${esc(cid)}"></div></div></div>` : '<p class="ev-empty">Nothing submitted for this part.</p>'}
      ${aiBox(r, cid, it)}${commentBox(r, cid, it)}${markRow(it)}</section>`;
  };
  const nav = e.challenges.map((cid, i) => { const ch = CHALLENGES.find((k) => k.id === cid), m = partMarks(cid); return `<a href="#ev-${i}" data-evgo="${i}">${ch ? (ch.quiz ? 'Quiz' : esc(ch.title)) : esc(cid)} <b>${m.sent || m.changed ? fmtMark(m.got) : '—'}/${fmtMark(m.max)}</b></a>`; }).join('');
  openModal(`<div class="ev-top"><div class="ev-head"><button id="evBack">← ${back === renderExamResults ? 'Results' : 'Back'}</button>
      <h2>${esc(r.name)} <span class="muted">· ${esc(e.title)}</span></h2><span style="flex:1"></span>
      ${r.missing || X.fromFile ? '' : `<button id="evAi" title="The AI (OpenAI) reads this student's programs and typed answers: a mark and a short comment for each. You can change the marks">🤖 ${r.ai && Object.keys(r.ai).length ? 'AI marking again' : 'AI marking'}</button>`}
      <span class="ev-total">${fmtMark(sheet.total)} / ${fmtMark(sheet.max)} · grade <b>${g7 === undefined ? '—' : g7} / 7</b></span>
      <button id="evPrev"${idx ? '' : ' disabled'} title="Previous student (←)">‹</button>
      <select id="evPick" title="Go to a student">${list.map((x, i) => `<option value="${esc(keyOf(x.r))}"${i === idx ? ' selected' : ''}>${esc(x.r.name)}${x.r.missing ? ' · no result' : ` · ${fmtMark(x.sheet.total)}/${fmtMark(x.sheet.max)}${x.g7 !== undefined ? ' · ' + x.g7 + '/7' : ''}`}</option>`).join('')}</select>
      <button id="evNext"${idx < list.length - 1 ? '' : ' disabled'} title="Next student (→)">›</button><span class="muted">${idx + 1} / ${list.length}</span></div>
      <nav class="ev-nav">${nav}</nav><div id="evAiMsg" class="ev-ai-msg" hidden></div></div>
    <div class="ev-body">${r.missing ? `<p class="ev-none">${esc(r.name)} has no result for this exam (did not open it, or nothing was sent).</p>` : e.challenges.map(section).join('')}</div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1200px';
  const box = $('modal').querySelector('.modal-box');
  $('evBack').onclick = () => { stopExamViewer(); back(); };
  if ($('evAi')) $('evAi').onclick = () => {
    const say = (t) => { const m = $('evAiMsg'); if (m) { m.hidden = false; m.textContent = t; m.classList.toggle('bad', /^⚠/.test(t)); } };
    $('evAi').disabled = true;
    aiMarkExam({ sid: keyOf(r), force: !!(r.ai && Object.keys(r.ai).length), say, after: () => { stopExamViewer(); examViewer(sid, 0, back); } })
      .finally(() => { if ($('evAi')) $('evAi').disabled = false; });
  };
  const go = (i) => { if (list[i]) examViewer(keyOf(list[i].r), 0, back); };
  $('evPrev').onclick = () => go(idx - 1);
  $('evNext').onclick = () => go(idx + 1);
  $('evPick').onchange = () => examViewer($('evPick').value, 0, back);
  // ← / → from student to student (not while typing a mark)
  document.onkeydown = (ev) => {
    if (!document.querySelector('.ev-body') || $('modal').hidden || /INPUT|SELECT|TEXTAREA/.test((ev.target || {}).tagName || '')) return;
    if (ev.key === 'ArrowLeft') go(idx - 1);
    if (ev.key === 'ArrowRight') go(idx + 1);
  };
  document.querySelectorAll('[data-evgo]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); const t = $('ev-' + a.dataset.evgo); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
  // marks: saved at once, the page shows the new totals (same place on the page)
  const again = () => { const y = box.scrollTop; examViewer(sid, 0, back); $('modal').querySelector('.modal-box').scrollTop = y; };
  document.querySelectorAll('.ev-in').forEach((inp) => {
    inp.onchange = () => {
      let v = Number(inp.value);
      if (!isFinite(v)) return;
      v = Math.max(0, Math.min(Number(inp.dataset.max), halfMark(v)));
      saveMark(sid, inp.dataset.key, v).then(again);
    };
  });
  document.querySelectorAll('[data-evauto]').forEach((b) => { b.onclick = () => saveMark(sid, b.dataset.evauto, null).then(again); });
  bindComments(again);
  // programs of the quiz questions, programs of the student (blocks), each one running on its own micro:bit
  document.querySelectorAll('[data-evq]').forEach((div) => { const [cid, k] = div.dataset.evq.split(':'); const w = renderProgramInto(div, CHALLENGES.find((x) => x.id === cid).questions[Number(k)].code); if (w) EVW.ws.push(w); });
  document.querySelectorAll('[data-evp]').forEach((div) => {
    const cid = div.dataset.evp, ch = CHALLENGES.find((x) => x.id === cid), c = r.challenges[cid];
    const w = renderProgramInto(div, c.program, 0.75);
    if (w) EVW.ws.push(w);
    const slot = { mb: null };
    slot.view = new BoardView(document.querySelector(`[data-evb="${CSS.escape(cid)}"]`), () => slot.mb);
    const run = () => {
      try {
        const prog = programFromState(c.program);
        slot.mb = new Microbit({ seed: Math.floor(Math.random() * 1e9) });
        slot.mb.load(prog.code, { variables: JSON.parse(JSON.stringify(prog.variables)) });
        slot.view.setFeatures(prog.features);
      } catch (err) { slot.mb = null; }
    };
    run();
    document.querySelector(`[data-evrun="${CSS.escape(cid)}"]`).onclick = run;
    EVW.boards.push(slot);
    try {
      const res = evaluateChallenge(ch, programFromState(c.program));
      document.querySelector(`[data-evc="${CSS.escape(cid)}"]`).innerHTML = `<b>Automatic check: ${res.score} %</b><ul class="criteria">${res.criteria.map((k) => `<li class="${k.points === k.max ? 'ok' : k.points > 0 ? 'part' : 'ko'}"><span>${esc(k.label)}</span><span class="pts">${k.points} / ${k.max}</span></li>`).join('')}</ul>`;
    } catch (err) { /* the check could not run */ }
  });
  let last = performance.now();
  const loop = (now) => {
    if ($('modal').hidden || !document.querySelector('.ev-body')) { stopExamViewer(); return; }
    const dt = Math.min(100, now - last); last = now;
    for (const b of EVW.boards) { if (b.mb) b.mb.advance(dt, 20); b.view.update(); }
    EVW.raf = requestAnimationFrame(loop);
  };
  EVW.raf = requestAnimationFrame(loop);
  if (part) { const t = $('ev-' + part); if (t) t.scrollIntoView({ block: 'start' }); }
}
// from the live view: the grade of a student opens their exam
async function openStudentExam(examId, sid) {
  const d = await (await tfetch('api/exam/results?examId=' + encodeURIComponent(examId))).json();
  if (!d.exam) { alert('Exam not found.'); return; }
  X.exam = d.exam; X.results = d.results; X.verified = {}; X.now = d.now;
  examViewer(sid, 0, renderExamResults);
}

// ---------- ✏️ Marking: one question at a time, every student, the automatic mark that the teacher can change ----------
const reviewWs = [];
function renderReview(k) {
  const e = X.exam, items = examItems(e.challenges), it = items[k];
  if (!it) return renderExamResults();
  while (reviewWs.length) { try { reviewWs.pop().dispose(); } catch (err) { /* gone */ } }
  const ch = CHALLENGES.find((c) => c.id === it.chId), q = ch && ch.quiz ? ch.questions[it.q] : null;
  const rows = examRows().filter(({ r }) => !r.missing);
  const head = q
    ? `<p><b>${esc(q.q)}</b>${q.multi ? ' <span class="q-multi">(several answers)</span>' : ''}</p>${q.code ? '<div class="q-code" data-q="0"></div>' : ''}<p class="muted">Right answer: ${q.open ? esc(q.model || q.accept.join(', ')) + ' (typed: check the answers marked ✖, a right idea may be written differently)' : q.options.filter((o, i) => quizRight(q, i)).map(esc).join(' · ')}</p>`
    : `<div class="review-mission">${ch ? richDesc(ch.description) : esc(it.chId)}</div>`;
  const answer = (r, sheetItem) => {
    const c = (r.challenges || {})[it.chId];
    if (!c) return '<span class="muted">nothing submitted</span>';
    if (q) {
      const given = ((c.program && c.program.answers) || [])[it.q];
      if (q.open) return openAnswerHtml(q, given, false) + aiBox(r, it.key, sheetItem) + commentBox(r, it.key, sheetItem);
      const picked = q.options.map((o, i) => (quizPicked(q, given, i) ? `<div class="wq-opt ${quizRight(q, i) ? 'picked-ok' : 'picked-ko'}">${quizRight(q, i) ? '✔' : '✖'} ${esc(o)}</div>` : '')).join('');
      return picked || '<span class="muted">no answer</span>';
    }
    return `<div class="rv-prog" data-sid="${esc(r.studentId)}"></div>${aiBox(r, it.chId, sheetItem)}${commentBox(r, it.key, sheetItem)}<div class="muted">Automatic check: ${c.score} %${X.verified[r.studentId + ':' + it.chId] !== undefined ? ' (replayed)' : ''} · <button class="linklike" data-exview="${esc(r.studentId)}:${esc(it.chId)}">▶ open with the micro:bit</button></div>`;
  };
  openModal(`<div class="actions"><button id="rvBack">← Results</button><span style="flex:1"></span>
      <button id="rvPrev"${k ? '' : ' disabled'}>← Previous</button><b>${k + 1} / ${items.length}</b><button id="rvNext"${k < items.length - 1 ? '' : ' disabled'}>Next →</button></div>
    <h2>✏️ ${esc(it.label)} · <span class="muted">${fmtMark(it.max)} mark${it.max > 1 ? 's' : ''}</span></h2>${head}
    <table class="cls review-table"><thead><tr><th>Student</th><th>Answer</th><th>Automatic</th><th>Mark</th></tr></thead><tbody>
    ${rows.map(({ r, sheet }) => { const si = sheet.items[k]; return `<tr><td><b>${esc(r.name)}</b></td><td>${answer(r, si)}</td><td>${fmtMark(si.auto)} / ${fmtMark(it.max)}</td>
      <td style="white-space:nowrap"><input type="number" class="rv-mark" data-sid="${esc(r.studentId)}" min="0" max="${it.max}" step="0.5" value="${si.mark}" style="width:70px"> / ${fmtMark(it.max)}
      ${si.changed ? `<button class="mini" data-auto="${esc(r.studentId)}" title="Back to the automatic mark">↺ auto</button>` : ''}<span class="rv-ok muted"></span></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No result yet.</td></tr>'}</tbody></table>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1100px';
  if (q && q.code) reviewWs.push(renderProgramInto($('modal').querySelector('.q-code'), q.code));
  if (!q) document.querySelectorAll('.rv-prog').forEach((div) => {
    const r = X.results.find((x) => x.studentId === div.dataset.sid), c = r && (r.challenges || {})[it.chId];
    const w = c && c.program ? renderProgramInto(div, c.program, 0.6) : null;
    if (w) reviewWs.push(w);
  });
  $('rvBack').onclick = renderExamResults;
  $('rvPrev').onclick = () => renderReview(k - 1);
  $('rvNext').onclick = () => renderReview(k + 1);
  document.querySelectorAll('[data-exview]').forEach((b) => {
    b.onclick = () => { const [sid, cid] = b.dataset.exview.split(':'); const r = X.results.find((x) => x.studentId === sid); examViewer(sid, Math.max(0, e.challenges.indexOf(cid)), () => renderReview(k)); };
  });
  const save = (sid, marks, el) => saveMark(sid, it.key, marks, el);
  document.querySelectorAll('.rv-mark').forEach((inp) => {
    inp.onchange = () => {
      let v = Number(inp.value);
      if (!isFinite(v)) return;
      v = Math.max(0, Math.min(it.max, halfMark(v)));
      inp.value = v;
      save(inp.dataset.sid, v, inp.parentElement.querySelector('.rv-ok')).then(() => {
        if (!inp.parentElement.querySelector('[data-auto]')) renderReview(k);
      });
    };
  });
  document.querySelectorAll('[data-auto]').forEach((b) => { b.onclick = () => save(b.dataset.auto, null).then(() => renderReview(k)); });
  bindComments(() => renderReview(k));
}
async function verifyExam() {
  const e = X.exam, todo = [];
  for (const r of X.results) for (const cid of e.challenges) if (r.challenges && r.challenges[cid] && r.challenges[cid].program) todo.push([r, cid]);
  let done = 0;
  for (const [r, cid] of todo) {
    $('exMsg').textContent = `Replaying ${++done} / ${todo.length}…`;
    const ch = CHALLENGES.find((c) => c.id === cid), c = r.challenges[cid];
    if (!ch) { X.verified[r.studentId + ':' + cid] = c.score; continue; }  // a challenge that no longer exists: keep its score
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
let rosterDraft = null, codesDraft = null, testDraft = null;
const newCode = (used) => { let c; do { c = String(Math.floor(200000 + Math.random() * 799999)); } while (used.includes(c)); return c; };
function renderRosterEditor() {
  if (!rosterDraft) rosterDraft = JSON.parse(JSON.stringify(teacherRoster()));
  if (!codesDraft) codesDraft = { ...(T.classCodes || {}) };
  if (!testDraft) testDraft = { ...(T.testCodes || {}) };
  $('rosterSource').textContent = T.roster ? '' : '(default lists from js/roster.js: saving stores them online)';
  const classes = Object.keys(rosterDraft).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  $('rosterEditor').innerHTML = classes.map((c) => `<div class="roster-class"><div class="actions"><b>🏫 ${esc(c)}</b><span class="muted">${rosterDraft[c].length} students</span><span class="spacer" style="flex:1"></span>
      <button class="mini danger" data-roster-del="${esc(c)}" title="Remove this class from the lists">✕</button></div>
      <div class="actions code-row">🔑 <input data-code="${esc(c)}" value="${esc(codesDraft[c] || '')}" placeholder="new" size="8" title="Code of this class: it only opens this class"><button class="mini" data-newcode="${esc(c)}" title="New random code (the old one stops working)">↻</button>
        <span style="margin-left:14px">📝 Test password</span> <input data-tcode="${esc(c)}" value="${esc(testDraft[c] || '')}" placeholder="new" size="6" title="Students type it to open a test of this class"><button class="mini" data-newtcode="${esc(c)}" title="New random test password">↻</button></div>
      <textarea data-roster="${esc(c)}" rows="${Math.min(16, Math.max(4, rosterDraft[c].length + 1))}">${esc(rosterDraft[c].join('\n'))}</textarea></div>`).join('')
    || '<p class="muted">No class yet: add one or paste your lists from Excel.</p>';
  $('rosterEditor').querySelectorAll('[data-roster]').forEach((t) => {
    t.oninput = () => { rosterDraft[t.dataset.roster] = t.value.split('\n').map((x) => x.trim()).filter(Boolean); $('rosterMsg').textContent = 'Not saved yet.'; };
  });
  $('rosterEditor').querySelectorAll('[data-code]').forEach((t) => {
    t.oninput = () => { codesDraft[t.dataset.code] = t.value.trim(); $('rosterMsg').textContent = 'Not saved yet.'; };
  });
  $('rosterEditor').querySelectorAll('[data-tcode]').forEach((t) => {
    t.oninput = () => { testDraft[t.dataset.tcode] = t.value.trim(); $('rosterMsg').textContent = 'Not saved yet.'; };
  });
  $('rosterEditor').querySelectorAll('[data-newtcode]').forEach((b) => {
    b.onclick = () => { testDraft[b.dataset.newtcode] = String(Math.floor(2000 + Math.random() * 7999)); renderRosterEditor(); $('rosterMsg').textContent = 'New test password: not saved yet.'; };
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
      const tcodes = Object.fromEntries(Object.keys(d.roster).map((c) => [c, testDraft[c] || '']).filter(([, v]) => v));
      const st = await tpost('api/settings', { classCodes: codes, testCodes: tcodes });
      T.classCodes = st.classCodes || d.classCodes;
      T.testCodes = st.testCodes || T.testCodes;
      if (T.publicBase) showShare(T.publicBase);
      rosterDraft = null;
      codesDraft = null;
      testDraft = null;
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

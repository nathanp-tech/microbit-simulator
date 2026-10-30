// Teacher dashboard: live class view, remote validation, details per student, difficulty report.
'use strict';

const $ = (id) => document.getElementById(id);
// Numbers and states written by a student's browser are forced to what they should be (never shown as HTML).
const nb = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const okStatus = (st) => (['locked', 'open', 'passed', 'validated'].includes(st) ? st : 'locked');
const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const T = {
  code: localStorage.getItem('mbsim.teacherCode') || '',
  live: [], serverNow: 0, liveTimer: null, help: [], classctl: {}, roster: null,
  files: [], // full progress files (with programs)
  viewWs: null,
};

// Progress dots: one per challenge, click to see the student's code for that challenge.
const STATUS_TEXT = { locked: 'locked', open: 'in progress', passed: 'passed', validated: 'passed' };
function dotsHtml(s, ref) {
  return '<span class="dots">' + CHALLENGES.map((c, i) => {
    const e = s.challenges && s.challenges[c.id];
    const st = okStatus(e && e.status);
    const gap = i && CHALLENGES[i - 1].cat !== c.cat ? '<span class="dot-gap"></span>' : '';
    const tip = `${categoryOf(c).icon} ${c.title}: ${STATUS_TEXT[st]}${e && nb(e.bestScore) !== null ? ' · best ' + nb(e.bestScore) + ' %' : ''} · click to see the code`;
    return `${gap}<button class="dot ${st}${s.mode !== 'free' && s.current === c.id ? ' cur' : ''}" data-dot="${esc(ref)}" data-ch="${c.id}" title="${esc(tip)}"></button>`;
  }).join('') + '</span>';
}

// A browser sends news at least every 15 s (class server) or 20 s (online): 45 s without news = offline.
const ONLINE_SECONDS = 60; // online, a browser says "I am here" every 30 s
const isOnline = (s) => T.serverNow - (s.receivedAt || 0) <= ONLINE_SECONDS && !(s.live && s.live.status === 'left');
function liveStatus(s) {
  const age = T.serverNow - (s.receivedAt || 0);
  const cur = s.challenges && s.challenges[s.current];
  if (s.live && s.live.status === 'left') return { cls: 'off', text: '👋 Left' };
  if (age > ONLINE_SECONDS) return { cls: 'off', text: `⚪ Offline (${fmtTime(age)})` };
  if (s.live && s.live.exam) return { cls: 'exam', text: s.live.exam.over ? '📝 Exam finished' : `📝 Exam · ${esc(chShort(s.live.exam.challenge))}${s.live.status === 'evaluating' ? ' (checking)' : ''}` };
  const st = s.live && s.live.status;
  if (st === 'evaluating') return { cls: '', text: '✅ Checking their answer' };
  return { cls: '', text: '✏️ Programming' };
}

function rowHtml(s, i, stats, source) {
  const a = analyzeStudent(s, stats);
  const cur = s.challenges && s.challenges[s.current];
  const free = s.mode === 'free';
  const modeCell = free ? '🛠️ Free' : '🧭 Challenges';
  const status = source === 'live' ? liveStatus(s) : { cls: '', text: s.lastSavedAt ? new Date(s.lastSavedAt).toLocaleString() : '—' };
  const canValidate = source === 'live' && s.mode === 'guided' && cur && cur.status !== 'validated';
  return `<tr class="${status.cls === 'wait' ? 'waiting' : ''}">
    <td>${source === 'live' && T.help.some((h) => h.studentId === s.studentId) ? '<span class="help-badge" title="Asked for help">🙋</span>' : ''}${source === 'live' ? `<span class="pres ${isOnline(s) ? 'on' : 'off'}" title="${isOnline(s) ? 'Connected now' : 'Not connected now'}"></span>` : ''}<b>${esc(s.name)}</b>${s.className && source !== 'live' ? ` <span class="muted">${esc(s.className)}</span>` : ''}</td>
    <td>${modeCell}</td>
    <td>${dotsHtml(s, source + ':' + i)}<span class="muted">${a.validated} / ${CHALLENGES.length}</span></td>
    <td>${free ? `<button class="linklike" data-dot="${source}:${i}" data-ch="free">free programming</button>` : esc(chShort(s.current))}</td>
    <td>${free ? fmtTime(s.freeTime) : fmtTime(cur && cur.timeSpent)}</td>
    <td>${nb(free ? s.free && s.free.runs : cur && cur.runs) || 0}</td>
    <td>${!free && cur && nb(cur.bestScore) !== null ? nb(cur.bestScore) + ' %' : '—'}</td>
    <td class="st ${status.cls}">${status.text}</td>
    <td style="white-space:nowrap">${canValidate ? `<button class="mini" data-validate="${i}" title="Mark this challenge as passed and unlock the next one">Unlock next</button> ` : ''}${source === 'live' ? `<button class="mini primary" data-watch="${i}" title="See their blocks live and run their program">👁 View</button> <button class="mini" data-reset="${i}" title="Clear this student: everything is deleted, they are logged out and start again">↺</button> ` : ''}<button class="mini" data-details="${i}" data-src="${source}">Details</button></td>
  </tr>`;
}

// ---------- Live class ----------
// Requests that need the teacher code (only asked when the dashboard is opened from another computer).
const tfetch = (url, opts = {}) => fetch(url, { cache: 'no-store', ...opts, headers: { ...(opts.headers || {}), 'X-Teacher-Code': T.code } });

async function startLive() {
  try {
    const r = await tfetch('api/progress');
    if (r.status === 403 || r.status === 401) {
      $('codeRow').hidden = false;
      if (T.code) $('codeMsg').textContent = T.hosted ? 'Wrong code. It is the TEACHER_CODE you set in Vercel.' : 'Wrong code. The code is shown in the server window on the teacher\'s computer.';
      setTimeout(() => $('tcode').focus(), 50);
      return;
    }
    if (!r.ok) throw new Error('no server');
    $('loginCard').hidden = true;
    $('liveArea').hidden = false;
    showServerInfo(); // now with the teacher password: the class code is in the link
    await loadTeacherRoster(); // the class lists need the password too: load them again now
    await refreshLive();
    clearInterval(T.liveTimer);
    // every 3 s with the class server, every 5 s online (database quota)
    const loop = () => { T.liveTimer = setTimeout(async () => { await refreshLive(); loop(); }, T.hosted ? 5000 : 3000); };
    clearTimeout(T.liveTimer);
    loop();
  } catch (e) {
    $('serverInfo').innerHTML = `<p>⚠️ The live dashboard needs the class server. On this computer, run <code>python3 server.py</code> (or double-click <code>start.command</code>) and open this page from the address it shows. You can still use <b>Report from saved files</b>.</p>`;
  }
}

async function refreshLive() {
  try {
    const r = await tfetch('api/progress');
    const data = await r.json();
    T.live = (data.students || []).sort(byClassThenName);
    T.serverNow = data.now;
    T.help = (data.help || []).sort((a, b) => a.since - b.since);
    T.classctl = data.classctl || {};
    renderHelpQueue();
    renderLive();
    $('liveStatus').textContent = '● Live · updated ' + new Date().toLocaleTimeString();
    $('liveStatus').classList.add('on');
  } catch (e) {
    $('liveStatus').textContent = '⚠️ Server unreachable';
    $('liveStatus').classList.remove('on');
  }
}

// ---------- Classes (chosen by the teacher in Manage) ----------
// Classes: those of the class lists (edited in Manage) plus js/config.js.
let CLASSES = CLASSROOM.classes || [];
const teacherRoster = () => T.roster || ROSTER;
function refreshClasses() {
  CLASSES = [...new Set([...Object.keys(teacherRoster()), ...(CLASSROOM.classes || [])])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
const classRank = (c) => { const i = CLASSES.indexOf(c || ''); return i >= 0 ? i : c ? CLASSES.length : CLASSES.length + 1; };
const byClassThenName = (a, b) => classRank(a.className) - classRank(b.className) || (a.className || '').localeCompare(b.className || '') || a.name.localeCompare(b.name);
const classLabel = (c) => c || 'No class yet';
function fillClassFilter(sel, list, allLabel) {
  const cur = sel.value;
  const extra = [...new Set(list.map((s) => s.className || ''))].filter((c) => c && !CLASSES.includes(c));
  const opts = CLASSES.concat(extra.sort());
  sel.innerHTML = `<option value="">${allLabel}</option>` + opts.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')
    + (list.some((s) => !s.className) ? '<option value="-">No class yet</option>' : '');
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
}
const inClassFilter = (s, f) => !f || (f === '-' ? !s.className : (s.className || '') === f);
// Rows grouped under one header per class. items: [{ s, html }] already sorted inside each class.
function groupedHtml(items, cols, { selectable = false } = {}) {
  const groups = new Map();
  for (const it of items.slice().sort((a, b) => classRank(a.s.className) - classRank(b.s.className) || (a.s.className || '').localeCompare(b.s.className || ''))) {
    const k = it.s.className || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it.html);
  }
  return [...groups].map(([c, rows]) => `<tr class="grp"><td colspan="${cols}">${selectable ? `<input type="checkbox" class="mg-grp" data-cls="${esc(c)}" title="Select every student of ${esc(classLabel(c))}"> ` : ''}🏫 ${esc(classLabel(c))} <span class="muted">· ${rows.length} student${rows.length > 1 ? 's' : ''}</span></td></tr>${rows.join('')}`).join('');
}

// Live class: every student of the class lists (js/roster.js), one block per class, connected or not.
const nkey = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
function renderLive() {
  const stats = classStats(T.live);
  const rosterStudents = Object.entries(teacherRoster()).flatMap(([c, names]) => names.map((name) => ({ name, className: c })));
  fillClassFilter($('liveClass'), T.live.concat(rosterStudents), 'All classes');
  const f = $('liveClass').value;
  const groups = new Map();
  const group = (c) => { if (!groups.has(c)) groups.set(c, []); return groups.get(c); };
  const used = new Set();
  for (const r of rosterStudents) {
    // the most recent work of this student (class + name)
    const i = T.live.reduce((best, s, k) => (nkey(s.name) === nkey(r.name) && nkey(s.className) === nkey(r.className) && (best < 0 || (s.updatedAt || '') > (T.live[best].updatedAt || '')) ? k : best), -1);
    if (i >= 0) used.add(i);
    group(r.className).push(i >= 0 ? { s: T.live[i], i } : { s: r, i: -1 });
  }
  T.live.forEach((s, i) => { if (!used.has(i)) group(s.className || '').push({ s, i }); });
  const order = [...groups.keys()].sort((a, b) => classRank(a) - classRank(b) || a.localeCompare(b)).filter((c) => inClassFilter({ className: c }, f));
  let html = '', online = 0, total = 0, help = 0;
  order.forEach((c, gi) => {
    const rows = groups.get(c).sort((a, b) => a.s.name.localeCompare(b.s.name, undefined, { sensitivity: 'base' }));
    const on = rows.filter((r) => r.i >= 0 && isOnline(r.s)).length;
    online += on; total += rows.length;
    help += rows.filter((r) => r.i >= 0 && analyzeStudent(r.s, stats).level === 'help').length;
    html += `${gi ? '<tr class="grp-gap"><td colspan="9"></td></tr>' : ''}<tr class="grp"><td colspan="9"><div class="grp-row">🏫 ${esc(classLabel(c))} <span class="grp-count${on ? ' on' : ''}">${on} / ${rows.length} connected</span>${c ? classCtlHtml(c) : ''}</div></td></tr>`;
    html += rows.map((r) => (r.i >= 0 ? rowHtml(r.s, r.i, stats, 'live')
      : `<tr class="absent"><td><span class="pres never" title="Never connected"></span><b>${esc(r.s.name)}</b></td><td colspan="6"></td><td class="st off">○ Not connected yet</td><td></td></tr>`)).join('');
  });
  $('liveRows').innerHTML = html || '<tr><td colspan="9" class="muted">No student in this class.</td></tr>';
  $('classKpis').innerHTML = `<span class="kpi"><b>${online} / ${total}</b>connected</span><span class="kpi"><b>${help}</b>need help</span>`;
}

async function validateLive(i) {
  const s = T.live[i];
  const r = await tfetch('api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: s.studentId, challengeId: s.current }) });
  if (r.ok) {
    const btn = document.querySelector(`[data-validate="${i}"]`);
    if (btn) { btn.textContent = 'Unlocked ✓'; btn.disabled = true; }
  }
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}
// One link (and QR code) per class: it carries the code of that class, which only opens that class.
function showShare(base) {
  T.publicBase = base;
  $('shareBox').hidden = false;
  const classes = Object.keys(T.classCodes || {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sel = $('shareClass');
  const cur = sel.value && classes.includes(sel.value) ? sel.value : classes[0] || '';
  sel.innerHTML = classes.map((c) => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('');
  sel.hidden = !classes.length;
  const code = (T.classCodes || {})[cur] || '';
  const url = base + (code ? '?c=' + encodeURIComponent(code) : '');
  $('shareUrl').textContent = url;
  $('shareCode').innerHTML = code ? `Code of <b>${esc(cur)}</b>: <b>${esc(code)}</b> <span class="muted">(in the link and the QR code; it only opens ${esc(cur)}. Each class has its own code: Manage → Class lists)</span>` : '';
  $('shareQr').innerHTML = qrSvg(url);
  $('btnCopy').onclick = () => navigator.clipboard.writeText(url).then(() => { $('btnCopy').textContent = '✓ Copied'; });
  $('btnShow').onclick = () => openModal(`<div class="big-share"><h2>${esc(cur)} · Open the micro:bit Simulator</h2>${qrSvg(url)}<div class="share-url">${esc(url)}</div><p class="muted">Scan the QR code or type the link${code ? ` (class code <b>${esc(code)}</b>)` : ''}, then choose your name.</p></div>`);
}

async function showServerInfo() {
  try {
    const r = await tfetch('api/info');
    const { ips, host, port, publicUrl, hosted, classCodes } = await r.json();
    T.hosted = !!hosted;
    T.classCodes = classCodes || {};
    // the link and the QR code carry the code of the class: students who scan them get in directly
    if (publicUrl) showShare(publicUrl);
    else setTimeout(showServerInfo, 3000); // the public link takes a few seconds to open
    const urls = ips.map((ip) => `<code>http://${ip}:${port}/</code>`).concat(host ? [`<code>http://${host}:${port}/</code>`] : []).join(' or ');
    $('serverInfo').innerHTML = publicUrl ? '' : `<p>✅ Class server running. <b>No public link yet</b>: it appears here a few seconds after starting <code>start.command</code>. Same Wi-Fi only: ${urls}</p>`;
    $('serverInfo2').innerHTML = publicUrl ? '' : `Same Wi-Fi only: ${urls}`;
  } catch (e) {
    $('serverInfo').innerHTML = `<p>⚠️ The live dashboard needs the class server. On this computer, run <code>python3 server.py</code> (or double-click <code>start.command</code>) and open this page from the address it shows. You can still use <b>Report from saved files</b>.</p>`;
  }
}

// ---------- Saved files ----------
async function addFiles(list) {
  for (const f of list) {
    try {
      const d = JSON.parse(await f.text());
      if (d.type !== 'mb-progress') throw new Error('not a micro:bit Simulator work file');
      const i = T.files.findIndex((x) => x.studentId === d.studentId);
      if (i >= 0) T.files[i] = d; else T.files.push(d);
    } catch (e) {
      alert(`${f.name}: ${e.message}`);
    }
  }
  renderFiles();
}
function renderFiles() {
  const stats = classStats(T.files);
  T.files.sort(byClassThenName);
  $('fileRows').innerHTML = groupedHtml(T.files.map((s, i) => ({ s, html: rowHtml(s, i, stats, 'files') })), 9) || '<tr><td colspan="9" class="muted">No files yet.</td></tr>';
  $('filesCount').textContent = T.files.length ? `${T.files.length} student${T.files.length > 1 ? 's' : ''}` : '';
}

// ---------- Details ----------
function showDetails(s, all, isLive) {
  const stats = classStats(all);
  const a = analyzeStudent(s, stats);
  const rows = CHALLENGES.map((c) => {
    const e = s.challenges[c.id];
    if (!e) return '';
    const errs = Object.entries(e.errors || {}).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, n]) => `${esc(k)} ×${n}`).join('<br>');
    const crit = Object.entries(e.failedCriteria || {}).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, n]) => `${esc(k)} ×${n}`).join('<br>');
    const prog = e.program ? `<button class="mini" data-prog="${c.id}">Program</button>` : c.quiz && e.answers ? `<button class="mini" data-dot="id:${esc(s.studentId)}" data-ch="${c.id}">Answers</button>` : '';
    return `<tr><td>${esc(c.title)}</td><td>${{ locked: '🔒', open: '✏️ open', passed: '✅ passed', validated: '✅ passed' }[e.status]}</td><td>${fmtTime(e.timeSpent)}</td><td>${nb(e.runs) || 0}</td><td>${(Array.isArray(e.gradings) ? e.gradings : []).length}${nb(e.bestScore) !== null ? ` (best ${nb(e.bestScore)} %)` : ''}</td><td>${nb(e.hints) || 0}</td><td class="muted">${errs}</td><td class="muted">${crit}</td><td>${prog}</td></tr>`;
  }).join('');
  const events = (s.events || []).slice(-25).reverse().map((ev) => `<div><span class="muted">${new Date(ev.t).toLocaleTimeString()}</span> ${esc(ev.type)}${ev.ch ? ' · ' + esc(chShort(ev.ch)) : ''}${ev.d !== undefined ? ' · ' + esc(ev.d) : ''}</div>`).join('');
  openModal(`<h2>${esc(s.name)} ${s.className ? `<span class="muted">${esc(s.className)}</span>` : ''}</h2>
    <p><span class="lvl ${a.level}">${LEVEL_LABEL[a.level]}</span> · ${a.validated} / ${CHALLENGES.length} challenges validated · total active time ${fmtTime(s.totalTime)}</p>
    ${a.summary.length ? `<p>${esc(a.summary.join(' '))}</p>` : ''}
    ${a.perChallenge.filter((p) => p.notes.length).map((p) => `<p><b>${esc(chTitle(p.id))}</b><ul>${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></p>`).join('')}
    <table><tr><th>Challenge</th><th>Status</th><th>Time</th><th>Runs</th><th>Checks</th><th>Hints</th><th>Errors</th><th>Failed criteria</th><th></th></tr>${rows}</table>
    <div id="progView" hidden style="height:360px;border:1px solid var(--border);border-radius:8px;margin-top:10px"></div>
    ${isLive ? '<p><button class="mini" id="btnResetStudent">↺ Reset this student\'s data…</button> <button class="mini" id="btnForget">Remove this student from the live list</button></p>' : ''}
    <h3>Recent activity</h3><div style="font-size:12px;max-height:220px;overflow:auto">${events || '<span class="muted">No activity</span>'}</div>`);
  const rb = $('btnResetStudent');
  if (rb) rb.onclick = () => resetStudentsDialog([s.studentId]);
  const fb = $('btnForget');
  if (fb) fb.onclick = async () => {
    if (!confirm(`Remove ${s.name} from the live list? (their saved work is kept)`)) return;
    await tfetch('api/forget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: s.studentId }) });
    closeModal();
    refreshLive();
  };
  document.querySelectorAll('[data-prog]').forEach((b) => {
    b.onclick = () => {
      const pv = $('progView');
      pv.hidden = false;
      if (T.viewWs) T.viewWs.dispose();
      T.viewWs = Blockly.inject(pv, { readOnly: true, renderer: 'makecode', theme: MB_THEME, media: 'lib/blockly/media/', zoom: { controls: true, wheel: true, startScale: 0.7 }, move: { scrollbars: true, drag: true, wheel: true } });
      Blockly.serialization.workspaces.load(s.challenges[b.dataset.prog].program, T.viewWs);
      T.viewWs.scrollCenter();
    };
  });
}

// ---------- Report ----------
function buildReport(students, title) {
  const stats = classStats(students);
  const analyses = students.map((s) => ({ s, a: analyzeStudent(s, stats) }));
  const hardest = CHALLENGES.filter((c) => stats[c.id].worked).map((c) => {
    const st = stats[c.id];
    const topErr = Object.entries(st.errors).sort((a, b) => b[1] - a[1])[0];
    const topCrit = Object.entries(st.criteria).sort((a, b) => b[1] - a[1])[0];
    return `<tr><td>${esc(c.title)}</td><td>${st.worked}</td><td>${st.validated}</td><td>${fmtTime(st.medTime)}</td><td>${Math.round(st.medRuns)}</td><td class="muted">${topErr ? esc(topErr[0]) + ' ×' + topErr[1] : ''}</td><td class="muted">${topCrit ? esc(topCrit[0]) + ' ×' + topCrit[1] : ''}</td></tr>`;
  }).join('');
  const count = (l) => analyses.filter((x) => x.a.level === l).length;
  const order = { help: 0, some: 1, ok: 2 };
  const per = analyses.sort((x, y) => order[x.a.level] - order[y.a.level] || x.s.name.localeCompare(y.s.name)).map(({ s, a }) => `
    <div class="rep-student">
      <b>${esc(s.name)}</b> ${s.className ? `<span class="muted">${esc(s.className)}</span>` : ''} · <span class="lvl ${a.level}">${LEVEL_LABEL[a.level]}</span>
      · ${a.validated} / ${CHALLENGES.length} validated · ${s.mode === 'free' ? 'free programming' : 'now on: ' + esc(chShort(s.current))} · active time ${fmtTime(s.totalTime)}
      ${a.summary.length ? `<div>${esc(a.summary.join(' '))}</div>` : ''}
      <ul>${a.perChallenge.filter((p) => p.notes.length).map((p) => `<li><b>${esc(chShort(p.id))}:</b> ${p.notes.map(esc).join('; ')}</li>`).join('')}</ul>
    </div>`).join('');
  $('report').innerHTML = `
    <div class="actions no-print" style="justify-content:flex-end"><button class="primary" onclick="window.print()">🖨 Print / PDF</button><button onclick="document.getElementById('report').hidden=true">Close</button></div>
    <h2>Difficulty report: ${esc(title)}</h2>
    <p class="muted">Generated ${new Date().toLocaleString()} · ${students.length} students · a challenge is passed when "Check my answer" reaches the pass score (or when you unlocked the next one).</p>
    <div class="kpis"><span class="kpi"><b>${count('help')}</b>🔴 need help</span><span class="kpi"><b>${count('some')}</b>🟠 some difficulties</span><span class="kpi"><b>${count('ok')}</b>🟢 at ease</span></div>
    <h3>Challenges</h3>
    <table class="cls"><tr><th>Challenge</th><th>Worked on</th><th>Validated</th><th>Median time</th><th>Median runs</th><th>Most common error</th><th>Most failed criterion</th></tr>${hardest}</table>
    <h3>Students</h3>${per || '<p class="muted">No students.</p>'}`;
  $('report').hidden = false;
  $('report').scrollIntoView({ behavior: 'smooth' });
}

function exportCsv(students, name) {
  const stats = classStats(students);
  const head = ['Class', 'Student', 'Mode', 'Validated', 'Current challenge', 'Total active time (min)', 'Difficulty', 'Summary'];
  for (const c of CHALLENGES) head.push(`${c.title}: status`, `${c.title}: minutes`, `${c.title}: runs`, `${c.title}: best check %`, `${c.title}: hints`);
  const rows = [head];
  for (const s of students) {
    const a = analyzeStudent(s, stats);
    const row = [s.className, s.name, s.mode, a.validated, chTitle(s.current), Math.round((s.totalTime || 0) / 60), LEVEL_LABEL[a.level].slice(2), a.summary.concat(a.perChallenge.flatMap((p) => p.notes.map((n) => `${chShort(p.id)}: ${n}`))).join(' | ')];
    for (const c of CHALLENGES) {
      const e = s.challenges[c.id] || {};
      row.push(e.status || '', Math.round((e.timeSpent || 0) / 60), e.runs || 0, e.bestScore === null || e.bestScore === undefined ? '' : e.bestScore, e.hints || 0);
    }
    rows.push(row);
  }
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c === undefined || c === null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
}


// ---------- Manage: settings, students, backup, reset ----------
const adminPost = (body) => tfetch('api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const studentLabel = (s) => `${s.name}${s.className ? ' (' + s.className + ')' : ''}`;

async function loadSettingsForm() {
  try {
    const st = await (await tfetch('api/settings')).json();
    $('setPass').value = st.passScore;
    $('setReminder').value = st.saveReminderMinutes;
    $('setGuided').checked = st.allowGuided !== false;
    $('setFree').checked = st.allowFree !== false;
  } catch (e) { /* no server */ }
}
async function saveSettings() {
  if (!$('setGuided').checked && !$('setFree').checked) { $('settingsMsg').textContent = 'At least one mode must be allowed.'; return; }
  const body = { passScore: Number($('setPass').value) || 80, saveReminderMinutes: Number($('setReminder').value) || 20, allowGuided: $('setGuided').checked, allowFree: $('setFree').checked };
  const r = await tfetch('api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  $('settingsMsg').textContent = r.ok ? '✓ Saved. Students get the new settings within 30 seconds.' : 'Could not save (teacher code?).';
  if (r.ok) showServerInfo();
  if (r.ok) Object.assign(CLASSROOM, body);
}

function manageList() {
  return T.live.filter((s) => inClassFilter(s, $('mgClass').value));
}
const classOptions = (cur) => '<option value="">—</option>' + CLASSES.concat(cur && !CLASSES.includes(cur) ? [cur] : []).map((c) => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('');
function renderManage() {
  fillClassFilter($('mgClass'), T.live, 'All');
  $('mgClassTo').innerHTML = '<option value="">— class —</option>' + CLASSES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('') + '<option value="-">No class</option>';
  const list = manageList();
  const selected = new Set([...document.querySelectorAll('.mg-sel:checked')].map((c) => c.dataset.id));
  const unlockOpts = CHALLENGES.map((c, i) => `<option value="${i}">${esc(c.title)}</option>`).join('');
  $('mgRows').innerHTML = groupedHtml(list.map((s) => ({ s, html: (() => {
    const done = Object.values(s.challenges || {}).filter((c) => c.status === 'validated').length;
    const last = s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '—';
    return `<tr data-id="${esc(s.studentId)}">
      <td><input type="checkbox" class="mg-sel" data-id="${esc(s.studentId)}"${selected.has(s.studentId) ? ' checked' : ''}></td>
      <td><input type="text" class="mg-name" value="${esc(s.name)}"></td>
      <td><select class="mg-class" title="Choose the class: it is saved at once">${classOptions(s.className || '')}</select></td>
      <td>${s.mode === 'free' ? '🛠️ Free' : '🧭 Challenges'}</td>
      <td>${dotsHtml(s, 'id:' + s.studentId)} <span class="muted">${done} / ${CHALLENGES.length}</span></td>
      <td class="muted">${last}</td>
      <td style="white-space:nowrap">
        <button class="mini mg-save" hidden>Save name</button>
        <select class="mg-to" title="Unlock up to this challenge">${unlockOpts}</select><button class="mini mg-unlock">🔓</button>
        <button class="mini mg-reset" title="Reset this student's data">↺</button>
        <button class="mini mg-dl" title="Download this student's work">💾</button>
        <button class="mini danger mg-del" title="Delete this student">🗑</button>
      </td></tr>`;
  })() })), 7, { selectable: true }) || `<tr><td colspan="7" class="muted">${T.live.length ? 'No student in this class.' : 'No students yet.'}</td></tr>`;
  $('mgUnlockTo').innerHTML = unlockOpts;
  updateSelCount();
}
function updateSelCount() { $('mgSelCount').textContent = `${document.querySelectorAll('.mg-sel:checked').length} selected`; }
const selectedIds = () => [...document.querySelectorAll('.mg-sel:checked')].map((c) => c.dataset.id);
const byId = (id) => T.live.find((s) => s.studentId === id);

async function changeWork(id, fn) {
  const r = await tfetch('api/work/' + id);
  if (!r.ok) throw new Error('work not found');
  const work = await r.json();
  fn(work);
  work.events = (work.events || []).concat([{ t: new Date().toISOString(), type: 'teacher' }]);
  work.updatedAt = new Date().toISOString();
  return adminPost({ action: 'put-work', work });
}
function unlockUpTo(work, idx) {
  CHALLENGES.forEach((c, i) => {
    const e = work.challenges[c.id] || (work.challenges[c.id] = newChallengeEntry('locked'));
    if (i < idx && e.status !== 'validated') { e.status = 'validated'; e.validatedAt = new Date().toISOString(); e.validatedBy = 'teacher'; }
    if (i === idx && e.status === 'locked') e.status = 'open';
  });
  work.current = CHALLENGES[idx].id;
}
async function bulk(ids, label, fn) {
  if (!ids.length) { alert('Select students first.'); return; }
  if (!confirm(`${label}: ${ids.map((id) => studentLabel(byId(id) || { name: id })).join(', ')}?`)) return;
  for (const id of ids) {
    try { await fn(id); } catch (e) { alert(`${studentLabel(byId(id) || { name: id })}: ${e.message}`); }
  }
  await refreshLive();
  renderManage();
}
function downloadJson(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name;
  a.click();
}

function setupManage() {
  $('btnSaveSettings').onclick = saveSettings;
  $('mgClass').onchange = renderManage;
  $('liveClass').onchange = renderLive;
  $('mgClassSel').onclick = () => {
    const v = $('mgClassTo').value;
    if (!v) { alert('Choose a class first.'); return; }
    const cls = v === '-' ? '' : v;
    bulk(selectedIds(), `Put in ${cls || 'no class'}`, (sid) => changeWork(sid, (w) => { w.className = cls; }));
  };
  $('mgAll').onchange = (e) => { document.querySelectorAll('.mg-sel').forEach((c) => { c.checked = e.target.checked; }); updateSelCount(); };
  // select all the students shown, none, or a whole class (checkbox in its header)
  $('mgSelAll').onclick = () => { document.querySelectorAll('.mg-sel, .mg-grp, #mgAll').forEach((c) => { c.checked = true; }); updateSelCount(); };
  $('mgSelNone').onclick = () => { document.querySelectorAll('.mg-sel, .mg-grp, #mgAll').forEach((c) => { c.checked = false; }); updateSelCount(); };
  $('mgRows').addEventListener('change', async (e) => {
    if (e.target.classList.contains('mg-grp')) {
      document.querySelectorAll('#mgRows tr[data-id]').forEach((tr) => {
        const st = byId(tr.dataset.id);
        if (st && (st.className || '') === e.target.dataset.cls) tr.querySelector('.mg-sel').checked = e.target.checked;
      });
      updateSelCount();
    }
    if (e.target.classList.contains('mg-sel')) updateSelCount();
    if (e.target.classList.contains('mg-class')) {
      const id = e.target.closest('tr').dataset.id;
      e.target.disabled = true;
      try { await changeWork(id, (w) => { w.className = e.target.value; }); } catch (err) { alert(err.message); }
      await refreshLive(); renderManage();
    }
  });
  $('mgRows').addEventListener('input', (e) => {
    if (e.target.matches('.mg-name')) e.target.closest('tr').querySelector('.mg-save').hidden = false;
  });
  $('mgRows').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id, s = byId(id);
    if (e.target.classList.contains('mg-save')) {
      const name = tr.querySelector('.mg-name').value.trim();
      if (!name) return;
      const key = (n) => String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
      const clash = T.live.find((o) => o.studentId !== id && key(o.name) === key(name) && key(o.className) === key(s && s.className));
      if (clash) { alert(`"${name}" is already used by another student${clash.className ? ' (' + clash.className + ')' : ''}. The first name identifies each student: add an initial, e.g. "${name} M.".`); return; }
      await changeWork(id, (w) => { w.name = name; });
      await refreshLive(); renderManage();
    }
    if (e.target.classList.contains('mg-unlock')) {
      const idx = Number(tr.querySelector('.mg-to').value);
      await bulk([id], `Unlock up to "${CHALLENGES[idx].title}" for`, (sid) => changeWork(sid, (w) => unlockUpTo(w, idx)));
    }
    if (e.target.classList.contains('mg-reset')) resetStudentsDialog([id]);
    if (e.target.classList.contains('mg-del')) await bulk([id], 'Delete (a copy of their work is kept for 180 days)', (sid) => adminPost({ action: 'delete', studentIds: [sid] }));
    if (e.target.classList.contains('mg-dl')) {
      const work = await (await tfetch('api/work/' + id)).json();
      downloadJson(`${slugName(s.name)}${s.className ? '_' + slugName(s.className) : ''}_microbit-work.json`, work);
    }
  });
  $('mgUnlockSel').onclick = () => { const idx = Number($('mgUnlockTo').value); bulk(selectedIds(), `Unlock up to "${CHALLENGES[idx].title}" for`, (sid) => changeWork(sid, (w) => unlockUpTo(w, idx))); };
  $('mgResetSel').onclick = () => { const ids = selectedIds(); if (!ids.length) alert('Select students first.'); else resetStudentsDialog(ids); };
  $('mgDeleteSel').onclick = () => bulk(selectedIds(), 'Delete (a copy of their work is kept for 180 days)', async (sid) => adminPost({ action: 'delete', studentIds: [sid] }));
  $('btnBackup').onclick = async () => {
    const r = await tfetch('api/admin/backup');
    if (!r.ok) { alert('Backup needs the class server and the teacher code.'); return; }
    downloadJson(`microbit-class-backup_${new Date().toISOString().slice(0, 10)}.json`, await r.json());
  };
  $('restoreFiles').onchange = async (e) => {
    const works = [];
    for (const f of e.target.files) {
      try {
        const d = JSON.parse(await f.text());
        if (d.type === 'mb-class-backup') works.push(...d.works);
        else if (d.type === 'mb-progress') works.push(d);
      } catch (err) { alert(`${f.name}: not a valid file`); }
    }
    e.target.value = '';
    if (!works.length) return;
    if (!confirm(`Restore ${works.length} student work(s)? Existing work of the same students is replaced.`)) return;
    const res = await adminPost({ action: 'restore', works });
    $('mgMsg').textContent = `✓ ${res.restored} student work(s) restored.`;
    await refreshLive(); renderManage();
  };
  $('btnResetAll').onclick = async () => {
    const answer = prompt('This deletes ALL students and their work (a copy is kept in data/archive/).\nType RESET to confirm.');
    if (answer !== 'RESET') return;
    const res = await adminPost({ action: 'reset-all' });
    $('mgMsg').textContent = res.ok ? `✓ Everything was reset. Archive: ${res.archive}` : 'Reset failed.';
    await refreshLive(); renderManage();
  };
}


// ---------- Watch a student's session live: blocks (refreshed) + their program on a micro:bit ----------
const W = { timer: null, ws: null, mb: null, view: null, last: '', id: null, slot: null, raf: null };

// opts.slot: challenge to show first; opts.work: a saved work file (no live refresh).
async function watchStudent(id, opts = {}) {
  closeModal();
  W.id = id;
  W.last = '';
  W.slot = opts.slot || null;
  W.static = opts.work || null;
  openModal(`<div class="watch-head"><h2 id="wTitle" style="margin:0"></h2>${W.static ? '<span class="muted">saved file</span>' : '<span class="live-dot">● live</span>'}
      <label>Program <select id="wSlot"></select></label><span id="wStatus" class="muted"></span></div>
    <div id="wHist" class="hist-bar"></div>
    <div class="watch">
      <div style="position:relative"><div id="watchWs"></div><div id="watchQuiz" class="watch-quiz" hidden></div></div>
      <div class="watch-side">
        <div id="watchBoard" class="mc-boards" style="padding:0"></div>
        <div class="actions"><button id="wRun" title="Start their program again on the micro:bit">↻ Restart</button><button class="primary" id="wCheck" title="Run the automatic check on their program">✅ Check their answer</button><span id="wResult" class="muted"></span></div>
        <div id="wCriteria"></div>
        <div class="w-notes"><div class="actions"><b>💬 Comments</b><span class="spacer" style="flex:1"></span><button id="wNoteBtn" class="mini" disabled title="Click a block in their program first">💬 Comment on the selected block</button></div>
          <div id="wNoteForm" hidden><textarea id="wNoteText" rows="2" placeholder="e.g. What happens when the light level is exactly 50?"></textarea><div class="actions"><button class="mini primary" id="wNoteSend">Send to the student</button><button class="mini" id="wNoteCancel">Cancel</button></div></div>
          <div id="wNotes"></div></div>
        <div><b>Recent errors</b><div id="wErrors" class="log"></div></div>
      </div>
    </div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1300px';
  W.ws = Blockly.inject('watchWs', { readOnly: true, renderer: 'makecode', theme: MB_THEME, media: 'lib/blockly/media/', zoom: { controls: true, wheel: true, startScale: 0.75 }, move: { scrollbars: true, drag: true, wheel: true } });
  W.view = new BoardView($('watchBoard'), () => W.mb);
  $('wSlot').onchange = () => { W.slot = $('wSlot').value; W.last = ''; W.version = null; W.histKey = ''; refreshWatch(); };
  setupWatchExtras();
  $('wRun').onclick = () => startWatchedBoard();
  $('wCheck').onclick = checkWatched;
  let last = performance.now();
  const loop = (now) => {
    if (!W.view) return;
    if (W.mb) W.mb.advance(Math.min(100, now - last), 20);
    last = now;
    W.view.update();
    W.raf = requestAnimationFrame(loop);
  };
  W.raf = requestAnimationFrame(loop);
  await refreshWatch(true);
  if (!W.static) W.timer = setInterval(refreshWatch, 3000);
}

function watchSlots(work) {
  const mark = { locked: '🔒', open: '✏️', passed: '✅', validated: '✅' };
  const slots = CHALLENGES.map((c) => {
    const e = work.challenges[c.id] || { status: 'locked' };
    const cur = work.mode !== 'free' && work.current === c.id ? ' (current)' : '';
    const has = c.quiz ? e.answers : e.program;
    return [c.id, `${mark[e.status] || ''} ${c.n}. ${c.title}${c.quiz ? ' (quiz)' : ''}${cur}${has ? '' : ' (nothing yet)'}`];
  });
  slots.push(['free', `🛠️ Free programming${work.free && work.free.program ? '' : ' (no code yet)'}`]);
  return slots;
}
const watchedChallenge = () => CHALLENGES.find((c) => c.id === W.slot);

async function refreshWatch(first) {
  if (!W.id || $('modal').hidden) return stopWatch();
  let work;
  try { work = W.static || await (await tfetch('api/work/' + W.id)).json(); } catch (e) { return; }
  if (!work || !work.challenges) return;
  W.work = work;
  const snap = T.live.find((s) => s.studentId === W.id);
  $('wTitle').textContent = `${work.name}${work.className ? ' · ' + work.className : ''}`;
  $('wStatus').textContent = snap ? liveStatus(snap).text : '';
  const slots = watchSlots(work);
  if (!W.slot) W.slot = work.mode === 'free' ? 'free' : work.current;
  const sel = $('wSlot');
  const html = slots.map(([v, l]) => `<option value="${esc(v)}"${v === W.slot ? ' selected' : ''}>${esc(l)}</option>`).join('');
  if (sel.innerHTML !== html) sel.innerHTML = html;
  const entry = W.slot === 'free' ? work.free : work.challenges[W.slot];
  const ch = watchedChallenge();
  if (ch && ch.quiz) { renderWatchQuiz(ch, entry); return; }
  $('watchQuiz').hidden = true;
  $('watchWs').style.visibility = '';
  const liveKey = JSON.stringify((entry && entry.program) || null);
  if (liveKey !== W.histKey) { W.histKey = liveKey; loadWatchHistory(); } // a new version may have been recorded
  const program = watchProgram(entry).program;
  const key = (W.version !== null && W.version !== undefined ? 'v' + W.version : '') + JSON.stringify(program || null);
  if (key !== W.last) {
    W.last = key;
    const view = W.ws.getMetricsManager().getViewMetrics();
    W.ws.clear();
    if (program) { try { Blockly.serialization.workspaces.load(program, W.ws); } catch (e) { console.error(e); } }
    $('wResult').textContent = program ? '' : 'No code yet for this one.';
    $('wCriteria').innerHTML = '';
    if (first) W.ws.scrollCenter(); else W.ws.scroll(-view.left, -view.top);
    W.selBlock = null;
    $('wNoteBtn').disabled = true;
    renderWatchNotes();
    startWatchedBoard();
  }
  const errs = (work.events || []).filter((e) => e.type === 'error').slice(-8).reverse();
  $('wErrors').innerHTML = errs.map((e) => `<div class="error">${new Date(e.t).toLocaleTimeString()} · ${esc(e.d || '')}</div>`).join('') || '<span class="muted">No errors</span>';
}

// Quizzes: the answers of the student, right or wrong
function renderWatchQuiz(ch, entry) {
  $('watchWs').style.visibility = 'hidden';
  const box = $('watchQuiz');
  box.hidden = false;
  const answers = (entry && entry.answers) || [];
  const res = gradeQuiz(ch, answers);
  box.innerHTML = `<h3 style="margin-top:0">❓ ${esc(ch.title)} · ${answers.filter((a) => a !== null && a !== undefined).length} / ${ch.questions.length} answered · ${res.score} % right</h3>`
    + ch.questions.map((q, i) => `<div class="mc-q"><p>${i + 1}. ${esc(q.q)}</p>${q.options.map((o, k) => `<div class="wq-opt${k === q.answer ? ' right' : ''}${answers[i] === k ? (k === q.answer ? ' picked-ok' : ' picked-ko') : ''}">${answers[i] === k ? (k === q.answer ? '✔' : '✖') : k === q.answer ? '○' : '·'} ${esc(o)}</div>`).join('')}</div>`).join('');
  W.mb = null;
  $('wResult').textContent = entry && nb(entry.bestScore) !== null ? `Best check: ${nb(entry.bestScore)} %` : '';
  $('wCriteria').innerHTML = '';
}

// Their program, running on the micro:bit of the dashboard (click A, B, shake… like the student)
function startWatchedBoard() {
  const ch = watchedChallenge();
  if (ch && ch.quiz) return;
  const entry = watchProgram(W.slot === 'free' ? W.work.free : W.work.challenges[W.slot]);
  if (!entry || !entry.program) { W.mb = null; W.view.setFeatures({}); return; }
  try {
    const prog = programFromState(entry.program);
    W.prog = prog;
    W.mb = new Microbit({ seed: Math.floor(Math.random() * 1e9) });
    W.mb.load(prog.code, { variables: JSON.parse(JSON.stringify(prog.variables)) });
    W.view.setFeatures(prog.features);
  } catch (e) {
    W.mb = null;
    $('wResult').textContent = 'Cannot run: ' + e.message;
  }
}
function checkWatched() {
  const ch = watchedChallenge();
  const entry = watchProgram(W.slot === 'free' ? W.work.free : W.work.challenges[W.slot]);
  if (!ch || ch.quiz) { $('wResult').textContent = ch ? 'Quiz: see the answers on the left.' : 'Free programming has no check.'; return; }
  if (!entry || !entry.program) { $('wResult').textContent = 'No program yet.'; return; }
  const res = evaluateChallenge(ch, programFromState(entry.program));
  $('wResult').textContent = `Check: ${res.score} %`;
  $('wCriteria').innerHTML = '<ul class="criteria">' + res.criteria.map((k) => `<li class="${k.points === k.max ? 'ok' : k.points > 0 ? 'part' : 'ko'}"><span>${esc(k.label)}</span><span class="pts">${k.points} / ${k.max}</span></li>`).join('') + '</ul>';
}

function stopWatch() {
  clearInterval(W.timer);
  W.timer = null;
  W.id = null;
  W.static = null;
  W.version = null;
  W.hist = [];
  W.mb = null;
  if (W.raf) cancelAnimationFrame(W.raf);
  W.view = null;
  if (W.ws) { W.ws.dispose(); W.ws = null; }
}

function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
function closeModal() {
  $('modal').hidden = true;
  $('modal').querySelector('.modal-box').style.maxWidth = '';
  stopWatch();
  if (T.viewWs) { T.viewWs.dispose(); T.viewWs = null; }
}

function init() {
  document.querySelectorAll('.tabs2 button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.tabs2 button').forEach((x) => x.classList.toggle('active', x === b));
      $('liveTab').hidden = b.dataset.tab !== 'liveTab';
      $('filesTab').hidden = b.dataset.tab !== 'filesTab';
      $('manageTab').hidden = b.dataset.tab !== 'manageTab';
      if (b.dataset.tab === 'manageTab') {
        const locked = $('liveArea').hidden; // no server or no teacher code yet
        $('manageLocked').hidden = !locked;
        $('manageArea').hidden = locked;
        loadSettingsForm();
        renderManage();
      }
      $('report').hidden = true;
    };
  });
  // Click on a progress dot: open that student's code for that challenge.
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-dot]');
    if (!d) return;
    e.stopPropagation();
    const [src, ref] = d.dataset.dot.split(/:(.*)/s);
    if (src === 'files') { const w = T.files[Number(ref)]; watchStudent(w.studentId, { slot: d.dataset.ch, work: w }); }
    else watchStudent(src === 'id' ? ref : T.live[Number(ref)].studentId, { slot: d.dataset.ch });
  }, true);
  $('liveRows').addEventListener('click', (e) => {
    const v = e.target.closest('[data-validate]');
    if (v) validateLive(Number(v.dataset.validate));
    const w = e.target.closest('[data-watch]');
    if (w) watchStudent(T.live[Number(w.dataset.watch)].studentId);
    const d = e.target.closest('[data-details]');
    if (d) {
      const snap = T.live[Number(d.dataset.details)];
      tfetch('api/work/' + snap.studentId).then((r) => (r.ok ? r.json() : snap)).catch(() => snap)
        .then((full) => showDetails({ ...snap, ...full, challenges: Object.fromEntries(Object.entries(full.challenges || snap.challenges).map(([k, v]) => [k, { ...(snap.challenges[k] || {}), ...v }])) }, T.live, true));
    }
  });
  $('fileRows').addEventListener('click', (e) => {
    const d = e.target.closest('[data-details]');
    if (d) showDetails(T.files[Number(d.dataset.details)], T.files, false);
  });
  const liveSel = () => { const f = $('liveClass').value; return T.live.filter((s) => inClassFilter(s, f)); };
  const liveName = () => { const f = $('liveClass').value; return f ? (f === '-' ? 'no class' : 'class ' + f) : 'live class'; };
  $('btnReportLive').onclick = () => buildReport(liveSel(), liveName());
  $('btnCsvLive').onclick = () => exportCsv(liveSel().slice().sort(byClassThenName), `microbit-${liveName().replace(/\s+/g, '-')}-progress.csv`);
  $('btnReportFiles').onclick = () => buildReport(T.files, 'saved work files');
  $('btnCsvFiles').onclick = () => exportCsv(T.files, 'microbit-class-progress.csv');
  $('btnClearFiles').onclick = () => { T.files = []; renderFiles(); };
  $('files').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  renderFiles();
  showServerInfo();
  $('shareClass').onchange = () => showShare(T.publicBase);
  $('btnLogout').onclick = () => { localStorage.removeItem('mbsim.teacherCode'); location.href = 'index.html'; };
  $('btnCode').onclick = () => { T.code = $('tcode').value.trim(); localStorage.setItem('mbsim.teacherCode', T.code); startLive(); };
  $('tcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnCode').click(); });
  setupManage();
  startLive().then(() => {
    // development: teacher.html#watch=<name>&slot=<challenge id>
    const p = new URLSearchParams(location.hash.slice(1));
    const s = p.get('watch') && T.live.find((x) => x.name === p.get('watch'));
    if (s) watchStudent(s.studentId, { slot: p.get('slot') || undefined });
  });
}
window.addEventListener('load', init);

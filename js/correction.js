// The correction page of one student (link sent by the teacher once the test is marked: no password).
// The programs are checked again here (the same trials as the teacher's Verify); the teacher's changed marks count.
'use strict';

const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const keepWs = [];

(async () => {
  const root = document.getElementById('corr');
  const q = new URLSearchParams(location.search);
  let d;
  try {
    const r = await fetch(`api/correction?e=${encodeURIComponent(q.get('e') || '')}&s=${encodeURIComponent(q.get('s') || '')}&k=${encodeURIComponent(q.get('k') || '')}`, { cache: 'no-store' });
    d = await r.json();
    if (!r.ok) throw new Error(d.error || 'This correction cannot be opened.');
  } catch (e) {
    root.innerHTML = `<div class="corr-err"><div style="font-size:48px">🔒</div><h2>${esc(e.message)}</h2></div>`;
    return;
  }
  const exam = d.exam, res = d.result;
  const chs = exam.challenges.map((id) => CHALLENGES.find((c) => c.id === id)).filter(Boolean);
  // the scores of the programs: checked again (deterministic), like the teacher's Verify
  const checked = {}, owns = [], sols = [];
  for (const ch of chs) {
    const c = res.challenges[ch.id];
    if (!c || !c.program) { checked[ch.id] = null; continue; }
    try { checked[ch.id] = ch.quiz ? gradeQuiz(ch, c.program.answers || []) : evaluateChallenge(ch, programFromState(c.program)); } catch (e) { checked[ch.id] = null; }
  }
  const sheet = markSheet(exam.challenges, { challenges: Object.fromEntries(Object.entries(res.challenges).map(([id, c]) => [id, { ...c, score: checked[id] ? checked[id].score : c.score }])), marks: res.marks, ai: res.ai });
  const parts = chs.map((ch, k) => {
    const c = res.challenges[ch.id], program = c ? c.program : null;
    const its = sheet.items.filter((it) => it.chId === ch.id), marks = its.map((it) => it.mark);
    const solution = (d.solutions || {})[ch.id] || ch.solution || null;
    owns.push(program && !ch.quiz ? program : null);
    sols.push(solution);
    return correctionPart(ch, k, { res: checked[ch.id], program, marks, hasSolution: !ch.quiz && !!solution, solutionNote: ch.solutionNote, ownProgram: true, changed: its.some((it) => it.changed && it.mark !== it.auto), feedback: ((res.ai || {})[ch.id] || {}).feedback });
  });
  const fm = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  root.innerHTML = `<div class="corr-head"><h1>✏️ My correction · ${esc(exam.title)}</h1>
      <div class="muted">${esc(res.name)} · ${esc(exam.className)}${exam.startedAt ? ' · ' + new Date(exam.startedAt * 1000).toLocaleDateString() : ''}</div>
      <div class="corr-sum"><div>Marks<b>${fm(sheet.total)} / ${fm(sheet.max)}</b></div>${d.grade ? `<div>Grade<b>${d.grade} / 7</b></div>` : ''}</div>
      <p class="muted" style="margin:12px 0 0">For each part: your marks, what worked (✔) and what did not (✖), the right answers and a program that works.</p></div>
    <div class="corr-body fb">${parts.join('')}</div>`;
  renderCorrectionCode(root, chs, sols, owns, keepWs);
})();

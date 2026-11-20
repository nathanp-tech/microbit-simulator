// Automatic checking of a challenge: the program runs on a fresh simulated micro:bit, a test script presses the
// buttons, shakes the board, changes the light or the temperature… and looks at what the board shows.
'use strict';

const TEST_REAL_MS = 4000; // a test that takes longer than this (real time) stops: endless loop without pause

class Tester {
  constructor(prog, seed = 1) {
    this.prog = prog;
    this.mb = new Microbit({ seed });
    this.started = performance.now();
    try {
      this.mb.load(prog.code, { variables: JSON.parse(JSON.stringify(prog.variables || {})) });
    } catch (e) {
      this.loadError = e.message;
      this.mb.running = false;
    }
  }
  get t() { return this.mb.now; }
  wait(ms) {
    const end = this.mb.now + ms;
    while (this.mb.now < end) {
      if (performance.now() - this.started > TEST_REAL_MS) { this.timedOut = true; this.mb.now = end; this.mb.running = false; return this; }
      this.mb.advance(Math.min(200, end - this.mb.now), 400);
    }
    return this;
  }
  click(b, after = 0) { this.mb.buttonDown(b); this.wait(100); this.mb.buttonUp(b); return this.wait(after); }
  shake(after = 0) { this.mb.doGesture('Shake'); return this.wait(after); }
  gesture(g, after = 0) { this.mb.doGesture(g); return this.wait(after); }
  setLight(v) { this.mb.light = v; return this; }
  setTemp(v) { this.mb.temperature = v; return this; }
  setHeading(v) { this.mb.heading = v; return this; }
  setSound(v) { this.mb.setSoundLevel(v); return this; }

  // ---- what was shown ----
  log(t0 = 0, t1 = Infinity) { return this.mb.log.filter((e) => e.t >= t0 && e.t <= t1); }
  texts(t0 = 0, t1 = Infinity) { return this.log(t0, t1).filter((e) => e.kind === 'text' || e.kind === 'number').map((e) => String(typeof e.value === 'number' ? numStr(e.value) : e.value)); }
  numbers(t0 = 0, t1 = Infinity) {
    return this.log(t0, t1).flatMap((e) => (e.kind === 'number' ? [Number(e.value)] : e.kind === 'text' ? (String(e.value).match(/-?\d+(\.\d+)?/g) || []).map(Number) : []));
  }
  sawText(re, t0 = 0, t1 = Infinity) { return this.texts(t0, t1).some((s) => (re instanceof RegExp ? re.test(s) : s.toUpperCase().includes(String(re).toUpperCase()))); }
  // images shown with show leds / show icon / show arrow / show image
  images(t0 = 0, t1 = Infinity) { return this.log(t0, t1).filter((e) => ['leds', 'icon', 'arrow', 'image'].includes(e.kind)).map((e) => (e.kind === 'icon' ? patternKey(ICONS[e.value]) : e.kind === 'arrow' ? patternKey(ARROWS[e.value]) : e.value)).filter((k) => k && k.includes('1')); }
  frames(t0 = 0, t1 = Infinity) {
    const fr = this.mb.frames;
    const out = [];
    for (let i = 0; i < fr.length; i++) {
      const next = fr[i + 1] ? fr[i + 1].t : Infinity;
      if (next > t0 && fr[i].t <= t1) out.push({ t: fr[i].t, until: next, img: fr[i].img });
    }
    return out;
  }
  sawPattern(pattern, t0 = 0, t1 = Infinity) { const k = patternKey(pattern); return this.frames(t0, t1).some((f) => f.img === k); }
  firstPatternTime(pattern, t0 = 0, t1 = Infinity) { const k = patternKey(pattern); const f = this.frames(t0, t1).find((x) => x.img === k && x.t >= t0); return f ? f.t : null; }
  screen() { return this.mb.leds.map((v) => (v > 0 ? '1' : '0')).join(''); }
  litCount() { return this.mb.leds.filter((v) => v > 0).length; }
  uses(type) { return (this.prog.blockTypes || []).includes(type); }
  count(type) { return (this.prog.blockTypes || []).filter((t) => t === type).length; }
}
// Swiss grade from a percentage: 1 to 6, linear (60 % → 4), rounded to the half point
function swissGrade(pct) { return Math.round((1 + 5 * pct / 100) * 2) / 2; }
const patternKey = (p) => (p ? String(p).replace(/\s/g, '').split('').map((c) => (c === '#' ? '1' : '0')).join('') : '');
const FULL = '1'.repeat(25), EMPTY = '0'.repeat(25);

// Runs every criterion of a challenge (each one on a fresh micro:bit). Returns { score, criteria }.
function evaluateChallenge(ch, prog) {
  if (ch.quiz) return null;
  const probe = new Tester(prog);
  if (probe.loadError) {
    const c = [{ label: 'Your program cannot run: ' + probe.loadError, points: 0, max: 1, ok: false }];
    return { score: 0, criteria: c, trials: [{ score: 0, criteria: c }] };
  }
  const criteria = [];
  // Event challenges: a forever loop that shows things by itself (without the button or the shake) is not an answer
  const quiet = !ch.quietCheck || ch.quietCheck((seed = 1) => new Tester(prog, seed));
  for (const test of ch.tests) {
    // shows things without waiting for the event: 0, or a part (quietPart) when the right thing is shown all the time
    if (!quiet && !test.always && !ch.quietPart) { criteria.push({ label: test.label, points: 0, max: test.points, ok: false }); continue; }
    let points = 0, detail = '';
    try {
      const r = test.run((seed = 1) => new Tester(prog, seed), prog);
      if (typeof r === 'number') points = Math.max(0, Math.min(test.points, Math.round(r * test.points)));
      else if (r && typeof r === 'object') { points = r.ok ? test.points : Math.round((r.part || 0) * test.points); detail = r.detail || ''; }
      else points = r ? test.points : 0;
    } catch (e) {
      detail = e.message;
    }
    if (!quiet && !test.always) { points = Math.round(points * ch.quietPart); if (points) detail = (detail ? detail + ', ' : '') + 'half marks: it must wait for the button'; }
    criteria.push({ label: test.label + (detail ? ` (${detail})` : ''), points, max: test.points, ok: points === test.points });
  }
  if (ch.quietCheck) criteria.push({ label: ch.quietLabel, points: 0, max: 0, ok: quiet });
  const max = criteria.reduce((a, c) => a + c.max, 0);
  const pts = criteria.reduce((a, c) => a + c.points, 0);
  return { score: max ? Math.round(pts / max * 100) : 0, criteria, trials: [{ score: max ? Math.round(pts / max * 100) : 0, criteria }] };
}

// Program of a workspace for the checker (also used by the teacher page, with a headless workspace)
function programForCheck(ws) {
  const p = generateProgram(ws);
  const types = [];
  for (const top of runnableTops(ws)) for (const b of top.getDescendants(false)) if (b.isEnabled() && !b.isShadow()) types.push(b.type);
  p.blockTypes = types;
  return p;
}
function programFromState(state) {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state || { blocks: { blocks: [] } }, ws);
    return programForCheck(ws);
  } finally { ws.dispose(); }
}

// Quizzes: answers -> score
function gradeQuiz(ch, answers) {
  const criteria = ch.questions.map((q, i) => {
    const given = answers ? answers[i] : null;
    let pts;
    if (q.multi) {
      // tick all the right ones: +1 per right tick, −1 per wrong tick (never below 0)
      const g = Array.isArray(given) ? given : [];
      const hits = g.filter((k) => q.answer.includes(k)).length, wrong = g.length - hits;
      pts = Math.max(0, (hits - wrong) / q.answer.length);
    } else if (q.open) pts = openRight(q, given) ? 1 : 0;
    else pts = given === q.answer ? 1 : 0;
    return { label: `${i + 1}. ${q.q}`, points: Math.round(pts * 100) / 100, max: 1, ok: pts === 1, given };
  });
  const pts = criteria.reduce((a, c) => a + c.points, 0);
  const score = Math.round(pts / ch.questions.length * 100);
  return { score, criteria, trials: [{ score, criteria }] };
}

// ---------- Marks of a test ----------
// Each challenge and each quiz question has its marks (ch.marks, q.marks). The automatic marks come from the check
// (score % × marks) or from the answer, rounded to half marks. The teacher can change any mark (res.marks[key]).
const halfMark = (x) => Math.round(x * 2) / 2;
const chMarks = (ch) => (ch.quiz ? ch.questions.reduce((a, q) => a + (q.marks || 1), 0) : ch.marks || 4);
function examItems(challengeIds) {
  const items = [];
  for (const id of challengeIds) {
    const ch = CHALLENGES.find((c) => c.id === id);
    if (!ch) { items.push({ key: id, chId: id, q: null, label: id, short: id, max: 0 }); continue; }
    if (ch.quiz) ch.questions.forEach((q, i) => items.push({ key: `${id}#${i}`, chId: id, q: i, label: `Quiz ${i + 1}: ${q.q}`, short: `Q${i + 1}`, max: q.marks || 1 }));
    else items.push({ key: id, chId: id, q: null, label: ch.title, short: ch.title, max: ch.marks || 4 });
  }
  return items;
}
// res: { challenges: { id: { score, program } }, marks: { key: number } } (an exam result, or the slots of the blank test)
function markSheet(challengeIds, res) {
  const chs = (res && res.challenges) || {}, over = (res && res.marks) || {};
  const quizCache = {};
  const items = examItems(challengeIds).map((it) => {
    const c = chs[it.chId];
    let auto = 0;
    if (c && it.q === null) auto = halfMark((Number(c.score) || 0) / 100 * it.max);
    if (c && it.q !== null) {
      const ch = CHALLENGES.find((x) => x.id === it.chId);
      const answers = (c.program && c.program.answers) || [];
      const g = quizCache[it.chId] || (quizCache[it.chId] = gradeQuiz(ch, answers));
      auto = halfMark(g.criteria[it.q].points * it.max);
    }
    const has = Object.prototype.hasOwnProperty.call(over, it.key) && over[it.key] !== null;
    return { ...it, submitted: !!c, auto, mark: has ? Number(over[it.key]) : auto, changed: has };
  });
  const total = items.reduce((a, i) => a + i.mark, 0), max = items.reduce((a, i) => a + i.max, 0);
  const pct = max ? Math.round(total / max * 100) : 0;
  return { items, total, max, pct, grade: swissGrade(pct) };
}

// ---------- Grade out of 7, curved per class (a bell curve) ----------
// Each student's total is placed against the class (z = (total − class mean) / class standard deviation), then put on
// a normal curve of the chosen average and spread, rounded and kept between 1 and 7.
const CURVE_DEFAULT = { mean: 4.5, sd: 1.2 };
function curveGrades(totals, curve) {
  const c = { ...CURVE_DEFAULT, ...(curve || {}) };
  const n = totals.length;
  if (!n) return [];
  const m = totals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(totals.reduce((a, b) => a + (b - m) * (b - m), 0) / n);
  return totals.map((t) => Math.max(1, Math.min(7, Math.round(c.mean + c.sd * (sd > 0 ? (t - m) / sd : 0)))));
}
// grades of the results of one exam: { studentId: grade }
function examGrades(exam, results) {
  const done = results.filter((r) => r && Object.keys(r.challenges || {}).length + Object.keys(r.marks || {}).length > 0);
  const totals = done.map((r) => markSheet(exam.challenges, r).total);
  const g = curveGrades(totals, exam.curve);
  return Object.fromEntries(done.map((r, i) => [r.studentId, g[i]]));
}

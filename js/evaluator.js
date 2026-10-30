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
  click(b, after = 0) { this.mb.click(b); return this.wait(after); }
  shake(after = 0) { this.mb.doGesture('Shake'); return this.wait(after); }
  gesture(g, after = 0) { this.mb.doGesture(g); return this.wait(after); }
  setLight(v) { this.mb.light = v; return this; }
  setTemp(v) { this.mb.temperature = v; return this; }
  setHeading(v) { this.mb.heading = v; return this; }

  // ---- what was shown ----
  log(t0 = 0, t1 = Infinity) { return this.mb.log.filter((e) => e.t >= t0 && e.t <= t1); }
  texts(t0 = 0, t1 = Infinity) { return this.log(t0, t1).filter((e) => e.kind === 'text' || e.kind === 'number').map((e) => String(typeof e.value === 'number' ? numStr(e.value) : e.value)); }
  numbers(t0 = 0, t1 = Infinity) { return this.log(t0, t1).filter((e) => e.kind === 'number' || (e.kind === 'text' && /^-?\d+(\.\d+)?$/.test(String(e.value).trim()))).map((e) => Number(e.value)); }
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
  for (const test of ch.tests) {
    let points = 0, detail = '';
    try {
      const r = test.run((seed = 1) => new Tester(prog, seed), prog);
      if (typeof r === 'number') points = Math.max(0, Math.min(test.points, Math.round(r * test.points)));
      else if (r && typeof r === 'object') { points = r.ok ? test.points : Math.round((r.part || 0) * test.points); detail = r.detail || ''; }
      else points = r ? test.points : 0;
    } catch (e) {
      detail = e.message;
    }
    criteria.push({ label: test.label + (detail ? ` (${detail})` : ''), points, max: test.points, ok: points === test.points });
  }
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
    const ok = answers && answers[i] === q.answer;
    return { label: `${i + 1}. ${q.q}`, points: ok ? 1 : 0, max: 1, ok, given: answers ? answers[i] : null };
  });
  const pts = criteria.filter((c) => c.ok).length;
  const score = Math.round(pts / ch.questions.length * 100);
  return { score, criteria, trials: [{ score, criteria }] };
}

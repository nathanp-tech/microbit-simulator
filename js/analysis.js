// Difficulty analysis of student progress (used by the teacher dashboard and report).
'use strict';

const median = (xs) => {
  const a = xs.filter((x) => x > 0).sort((p, q) => p - q);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const fmtTime = (s) => {
  s = Math.round(s || 0);
  if (s < 60) return s + ' s';
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const chTitle = (id) => { const c = CHALLENGES.find((x) => x.id === id); return c ? c.title : id; };
const chShort = (id) => chTitle(id).replace(/^\d+\.\s*/, '');

const ERROR_ADVICE = [
  [/^Wrong sensor port/, 'uses the wrong port numbers for sensors (the block port does not match Port View)'],
  [/^Motor port without motor/, 'uses a motor port where nothing is connected'],
  [/not attached to "when program starts"/, 'forgets to attach the blocks to "when program starts"'],
  [/Infinite recursion/, 'creates My Blocks that call themselves forever'],
];
const adviceFor = (cat) => { const a = ERROR_ADVICE.find(([re]) => re.test(cat)); return a ? a[1] : `gets the error "${cat}"`; };

// Statistics of the whole class, per challenge (medians of time and runs among students who worked on it).
function classStats(students) {
  const stats = {};
  for (const c of CHALLENGES) {
    const entries = students.map((s) => s.challenges && s.challenges[c.id]).filter((e) => e && (e.timeSpent > 0 || e.runs > 0));
    stats[c.id] = {
      worked: entries.length,
      validated: entries.filter((e) => e.status === 'validated').length,
      medTime: median(entries.map((e) => e.timeSpent)),
      medRuns: median(entries.map((e) => e.runs)),
      errors: {},
      criteria: {},
    };
    for (const e of entries) {
      for (const [k, n] of Object.entries(e.errors || {})) stats[c.id].errors[k] = (stats[c.id].errors[k] || 0) + n;
      for (const [k, n] of Object.entries(e.failedCriteria || {})) stats[c.id].criteria[k] = (stats[c.id].criteria[k] || 0) + n;
    }
  }
  return stats;
}

// Returns the difficulties of one student: per challenge findings, overall level and summary.
function analyzeStudent(s, stats) {
  const perChallenge = [];
  const concepts = new Set();
  let flags = 0;
  for (const c of CHALLENGES) {
    const e = s.challenges && s.challenges[c.id];
    if (!e || (e.timeSpent === 0 && e.runs === 0 && e.status !== 'validated')) continue;
    const st = stats[c.id] || { medTime: 0, medRuns: 0 };
    const notes = [];
    if (e.timeSpent > Math.max(600, 2 * st.medTime)) notes.push(`spent a long time (${fmtTime(e.timeSpent)}, class median ${fmtTime(st.medTime)})`);
    if (e.runs > Math.max(15, 2 * st.medRuns)) notes.push(`needed many attempts (${e.runs} runs, class median ${Math.round(st.medRuns)})`);
    const failedChecks = (e.gradings || []).filter((g) => g.score < CLASSROOM.passScore).length;
    if (failedChecks >= 3) notes.push(e.status === 'open' ? `has not passed yet after ${failedChecks} solution checks` : `needed ${failedChecks} failed solution checks before passing`);
    const nHints = (c.hints || []).length;
    if (nHints && e.hints >= nHints) notes.push('used all the hints');
    for (const [cat, n] of Object.entries(e.errors || {}).sort((a, b) => b[1] - a[1])) {
      if (n >= 3) notes.push(`${adviceFor(cat)} (${n}×)`);
    }
    const crit = Object.entries(e.failedCriteria || {}).sort((a, b) => b[1] - a[1])[0];
    if (crit && crit[1] >= 3) notes.push(`often fails: "${crit[0]}" (${crit[1]}×)`);
    if (e.status === 'open' && e.timeSpent > 900 && s.current === c.id) notes.push('seems stuck on this challenge right now');
    if (notes.length) { flags += notes.length; if (notes.length >= 2) c.skills.split(',').forEach((k) => concepts.add(k.trim())); }
    perChallenge.push({ id: c.id, entry: e, notes });
  }
  const freeErrors = Object.entries((s.free && s.free.errors) || {}).filter(([, n]) => n >= 3);
  flags += freeErrors.length;
  const level = flags === 0 ? 'ok' : flags <= 3 ? 'some' : 'help';
  const validated = Object.values(s.challenges || {}).filter((e) => e.status === 'validated').length;
  const summary = [];
  if (level === 'ok') summary.push('Works at ease, no particular difficulty detected.');
  if (concepts.size) summary.push(`Difficulties with: ${[...concepts].join(', ')}.`);
  for (const [cat, n] of freeErrors) summary.push(`In free programming, ${adviceFor(cat)} (${n}×).`);
  return { level, flags, validated, perChallenge, summary, concepts: [...concepts] };
}

const LEVEL_LABEL = { ok: '🟢 At ease', some: '🟠 Some difficulties', help: '🔴 Needs help' };

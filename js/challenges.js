// The assessment of the micro:bit units (Class 5, Term 2): one challenge per key skill of the lesson plans and a
// short quiz, made to fit in one 40-minute lesson.
// Each test runs the student's program on a fresh simulated micro:bit (js/evaluator.js).
'use strict';

const CATEGORIES = [
  { id: 'u1', icon: '💡', label: 'Unit 1 · Introduction' },
  { id: 'u2', icon: '🎲', label: 'Unit 2 · Physical inputs' },
  { id: 'u3', icon: '🌡️', label: 'Unit 3 · Sensors & variables' },
  { id: 'u4', icon: '🔀', label: 'Unit 4 · Conditions' },
];
// Pictures in the missions: [[icon:Happy]] (an icon on the LEDs), [[text:3]] (a number or letters on the LEDs),
// [[leds:all]] / [[leds:none]], [[btn:A]] (a button of the board), [[shake]].
function ledPicture(rows, title) {
  const cell = (r, c) => `<rect x="${3 + c * 9}" y="${3 + r * 9}" width="6" height="6" rx="1" fill="${rows[r][c] ? '#ff2a2a' : '#3a3a3a'}"/>`;
  let cells = '';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells += cell(r, c);
  return `<svg class="d-led" viewBox="0 0 48 48" role="img" aria-label="${title}"><title>${title}</title><rect width="48" height="48" rx="6" fill="#111"/>${cells}</svg>`;
}
const patternRows = (p) => p.split(/\s+/).map((row) => row.split('').map((c) => c === '#'));
function richDesc(html) {
  return String(html || '').replace(/\[\[(\w+)(?::([^\]]*))?\]\]/g, (m, kind, arg = '') => {
    if (kind === 'icon' && ICONS[arg]) return ledPicture(patternRows(ICONS[arg]), 'icon ' + iconLabel(arg));
    if (kind === 'text') return `<span class="d-text">${arg.split('').map((ch) => ledPicture(glyph(ch), ch)).join('')}</span>`;
    if (kind === 'leds') return ledPicture([0, 1, 2, 3, 4].map(() => [0, 1, 2, 3, 4].map(() => arg === 'all')), arg === 'all' ? 'all LEDs on' : 'screen cleared');
    if (kind === 'btn') return `<span class="d-btn">${arg}</span>`;
    if (kind === 'shake') return '<span class="d-shake">〰️ shake</span>';
    return m;
  });
}
const categoryOf = (ch) => CATEGORIES.find((c) => c.id === ch.cat) || CATEGORIES[0];

// ---------- helpers for the tests ----------
const distinct = (arr) => [...new Set(arr)];
const reacted = (T, t0) => T.images(t0).concat(T.texts(t0).map((s) => 'text:' + s));
function waitForPattern(T, pattern, t0, maxMs) {
  for (let k = 0; k < maxMs / 100; k++) {
    const t = T.firstPatternTime(pattern, t0);
    if (t !== null) return t;
    T.wait(100);
  }
  return T.firstPatternTime(pattern, t0);
}
// one round of the reaction game: A, wait for the heart, then B after `reaction` ms. Returns what B showed.
function reactionRound(T, reaction) {
  const t0 = T.t;
  T.click('A');
  const th = waitForPattern(T, ICONS.Heart, t0, 12000);
  if (th === null) return { heart: null, numbers: [] };
  T.wait(Math.max(0, th + reaction - T.t));
  const t1 = T.t;
  T.click('B').wait(5000);
  return { heart: th - t0, numbers: T.numbers(t1), sad: T.sawPattern(ICONS.Sad, t1) };
}
// Nothing new on the screen for 3 s while nobody presses or shakes (after a long enough start)
const stillWithoutInput = (make) => { const T = make(5).wait(12000); const t0 = T.t; T.wait(3000); return !T.frames(t0).some((f) => f.t > t0); };
const near = (nums, target, tol) => nums.some((n) => Math.abs(n - target) <= tol);
// show icon pauses 600 ms: a program that sets start after the heart measures 600 ms less (both are right)
const nearReaction = (nums, r) => near(nums, r + 50, 200) || near(nums, r - 550, 200); // +100 ms: B counts when it is released

const CHALLENGES = [
  {
    id: 'mood', cat: 'u1', level: 1, title: 'Mood display', lesson: 'L2',
    description: '<ul class="steps"><li>Press [[btn:A]] → show icon <b>Happy</b> [[icon:Happy]]</li><li>Press [[btn:B]] → show icon <b>Sad</b> [[icon:Sad]]</li><li>Press [[btn:A+B]] → your own reaction, for example [[icon:Surprised]] [[icon:Asleep]] [[icon:Angry]]</li></ul><p class="test-it">🧪 <b>Test it:</b> click A, B, then A+B on the board.</p>',
    skills: 'on button A / B / A+B pressed, show icon',
    hints: ['Find "on button A pressed" in Input. Change A to B or A+B with the little arrow.', 'Put a "show icon" inside each button block and choose the face.'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until a button is pressed',
    tests: [
      { label: 'Button A shows the happy face', points: 30, run: (make) => { const T = make().wait(6000); const t0 = T.t; T.click('A').wait(1500); return T.sawPattern(ICONS.Happy, t0); } },
      { label: 'Button B shows the sad face', points: 30, run: (make) => { const T = make().wait(6000); const t0 = T.t; T.click('B').wait(1500); return T.sawPattern(ICONS.Sad, t0); } },
      { label: 'A+B shows another reaction', points: 30, run: (make) => {
        const T = make().wait(6000); const t0 = T.t; T.click('AB').wait(3000);
        const r = reacted(T, t0).filter((k) => k !== patternKey(ICONS.Happy) && k !== patternKey(ICONS.Sad));
        return r.length > 0;
      } },
      { label: 'The buttons work again and again', points: 10, run: (make) => {
        const T = make().wait(6000); T.click('A', 1200); T.click('B', 1200); const t0 = T.t; T.click('A').wait(1500);
        return T.sawPattern(ICONS.Happy, t0);
      } },
    ],
  },
  {
    id: 'dice', cat: 'u2', level: 1, title: 'Electronic dice', lesson: 'L3',
    description: '<ul class="steps"><li>[[shake]] → show a number from <b>1 to 6</b>, for example [[text:4]]</li><li>Use <b>show number</b> and <b>pick random</b></li></ul><p class="test-it">🧪 <b>Test it:</b> click <b>SHAKE</b> on the board, many times.</p>',
    skills: 'on shake, pick random, show number',
    hints: ['Put "show number" inside "on shake".', 'Drag "pick random 0 to 10" (Math) into show number, then change it: both ends are included!'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until you shake',
    tests: (() => {
      const rolls = (make) => { const T = make(7).wait(3000); const out = []; for (let i = 0; i < 60; i++) { const t0 = T.t; T.shake(1800); out.push(T.numbers(t0)); } return out; };
      return [
        { label: 'A number appears after every shake', points: 35, run: (make) => { const r = rolls(make); return r.filter((n) => n.length).length / r.length >= 0.95 ? 1 : r.filter((n) => n.length).length / r.length * 0.8; } },
        { label: 'The number is always between 1 and 6', points: 35, run: (make) => { const all = rolls(make).flat(); return all.length > 0 && all.every((n) => Number.isInteger(n) && n >= 1 && n <= 6); } },
        { label: 'Every face from 1 to 6 can appear', points: 30, run: (make) => { const all = new Set(rolls(make).flat()); return [1, 2, 3, 4, 5, 6].filter((n) => all.has(n)).length / 6; } },
      ];
    })(),
  },
  {
    id: 'rps', cat: 'u2', level: 2, title: 'Rock Paper Scissors', lesson: 'L4',
    description: '<ul class="steps"><li>[[shake]] → set the variable <b>choice</b> to <b>pick random 0 to 2</b></li><li><b>if / else if / else</b>:<br>0 → rock [[icon:SmallSquare]] &nbsp; 1 → paper [[icon:Square]] &nbsp; 2 → scissors [[icon:Scissors]]</li></ul><p class="test-it">🧪 <b>Test it:</b> click <b>SHAKE</b> 10 times: do all three appear?</p>',
    skills: 'variables, pick random, if / else if',
    hints: ['Variables → Make a Variable… → choice. Then "set choice to pick random 0 to 2" inside "on shake".', 'Logic → "if then else", click ⊕ to add "else if". Compare with "choice = 0" and "choice = 1".'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until you shake',
    tests: (() => {
      const shakes = (make) => { const T = make(11).wait(3000); const out = []; for (let i = 0; i < 45; i++) { const t0 = T.t; T.shake(1500); const r = reacted(T, t0); out.push(r.length ? r[r.length - 1] : null); } return out; };
      return [
        { label: 'A picture appears after every shake', points: 30, run: (make) => { const s = shakes(make); return s.filter(Boolean).length / s.length >= 0.95 ? 1 : 0.5 * s.filter(Boolean).length / s.length; } },
        { label: 'Three different pictures can appear (rock, paper, scissors)', points: 40, run: (make) => { const d = distinct(shakes(make).filter(Boolean)).length; return d === 3 ? 1 : d === 2 ? 0.4 : d > 3 ? 0.5 : 0; } },
        { label: 'Uses a variable, pick random and if / else', points: 30, always: true, run: (make, p) => ['variables_set', 'math_random', 'controls_if'].filter((t) => (p.blockTypes || []).includes(t)).length / 3 },
      ];
    })(),
  },
  {
    id: 'step-counter', cat: 'u3', level: 2, title: 'Step counter', lesson: 'L6',
    description: '<ul class="steps"><li>The variable <b>steps</b> starts at <b>0</b></li><li>[[shake]] → steps goes up by <b>1</b> and the new number is <b>shown</b>: [[text:1]] then [[text:2]] then [[text:3]]…</li><li>Press [[btn:B]] → steps goes back to <b>0</b> (the next shake shows [[text:1]])</li></ul><p class="test-it">🧪 <b>Test it:</b> click <b>SHAKE</b> 3 times (1, 2, 3), press B, then SHAKE again (1).</p>',
    skills: 'variables: set, change; on shake; buttons',
    hints: ['Variables → Make a Variable… → steps. In "on start": set steps to 0.', '"on shake": change steps by 1, then show number steps. "on button B pressed": set steps to 0.'],
    tests: (() => {
      // shakes 1.2 s apart (a number takes 750 ms to show); what was shown after each shake
      const shakes = (T, n) => { const out = []; for (let i = 0; i < n; i++) { const t0 = T.t; T.shake(1200); out.push(T.numbers(t0)); } return out; };
      const last = (nums) => (nums.length ? nums[nums.length - 1] : null);
      return [
        { label: 'Each shake adds 1 and shows the new number (1, 2, 3)', points: 35, run: (make) => { const T = make().wait(1500); return shakes(T, 3).map(last).join() === '1,2,3'; } },
        { label: 'It keeps counting (10 shakes → 10)', points: 15, run: (make) => { const T = make().wait(1500); shakes(T, 10); T.wait(4000); return T.numbers().includes(10); } },
        { label: 'B resets steps to 0 (the next shake shows 1)', points: 30, run: (make) => { const T = make().wait(1500); shakes(T, 3); T.click('B', 1500); return last(shakes(T, 1)[0]) === 1; } },
        { label: 'After B, it counts again (1, 2)', points: 20, run: (make) => { const T = make().wait(1500); shakes(T, 3); T.click('B', 1500); return shakes(T, 2).map(last).join() === '1,2'; } },
      ];
    })(),
  },
  {
    id: 'night-light', cat: 'u4', level: 2, title: 'Night light', lesson: 'L7 (A)',
    description: '<ul class="steps"><li><b>forever</b>: check the <b>light level</b></li><li><b>if</b> light level <b>&lt;</b> your threshold (dark) → <b>all 25 LEDs on</b> [[leds:all]] (show leds)</li><li><b>else</b> → <b>clear screen</b> [[leds:none]]</li><li>Choose a threshold between 20 and 200</li></ul><p class="test-it">🧪 <b>Test it:</b> drag the yellow <b>light circle</b> (top left of the board) down to dark, then up to bright.</p>',
    skills: 'if / else, comparison, light level, threshold',
    hints: ['forever → if (light level < 50) then show leds (all on) else clear screen.', 'First show the light level with show number to choose your threshold.'],
    tests: [
      { label: 'In the dark, all the LEDs switch on', points: 35, run: (make) => { const T = make().wait(500); T.setLight(10).wait(2000); return T.litCount() === 25; } },
      { label: 'In the light, the LEDs switch off', points: 35, run: (make) => { const T = make().wait(500); T.setLight(10).wait(2000); const on = T.litCount() === 25; T.setLight(230).wait(2000); return on && T.litCount() === 0; } },
      { label: 'It keeps working (dark, light, dark again)', points: 30, run: (make) => { const T = make().wait(500); T.setLight(230).wait(2000); T.setLight(10).wait(2000); T.setLight(230).wait(2000); T.setLight(5).wait(2000); return T.litCount() === 25; } },
    ],
  },
  {
    id: 'reaction', cat: 'u4', level: 3, title: 'Reaction game', lesson: 'L8',
    description: '<ul class="steps"><li>Press [[btn:A]] → set <b>ready</b> to 0, show "WAIT", pause <b>pick random 1000 to 4000</b> ms, show icon <b>Heart</b> [[icon:Heart]], set <b>start</b> to running time, set ready to 1</li><li>Press [[btn:B]] → <b>if</b> ready = 1: show number <b>running time − start</b> (for example <b>350</b> ms), <b>else</b>: show icon <b>Sad</b> [[icon:Sad]] (too early)</li></ul><p class="test-it">🧪 <b>Test it:</b> press A, wait for the heart, press B. Then press B too early.</p>',
    skills: 'running time, pause, pick random, variables, conditions',
    hints: ['A: set ready to 0, show string "WAIT", pause (pick random 1000 to 4000), show icon heart, set start to running time (ms), set ready to 1.', 'B: if ready = 1 then show number (running time (ms) − start) else show icon sad.'],
    tests: [
      { label: 'After A, a heart appears after a short wait', points: 25, run: (make) => { const T = make(3).wait(1500); const t0 = T.t; T.click('A'); const th = waitForPattern(T, ICONS.Heart, t0, 12000); return th !== null && th - t0 >= 900; } },
      { label: 'The waiting time changes every time', points: 15, run: (make) => { const d = [3, 5, 8].map((s) => { const T = make(s).wait(1500); const t0 = T.t; T.click('A'); const th = waitForPattern(T, ICONS.Heart, t0, 12000); return th === null ? null : Math.round((th - t0) / 50); }).filter((x) => x !== null); return distinct(d).length >= 2; } },
      { label: 'B after the heart shows the reaction time (not the sad face)', points: 35, run: (make) => { const T = make(3).wait(1500); const r = reactionRound(T, 1100); return r.heart !== null && nearReaction(r.numbers, 1100) && !r.sad; } },
      { label: 'B too early shows the sad icon (not a time)', points: 25, run: (make) => { const T = make(3).wait(1500); T.click('A', 300); const t1 = T.t; T.click('B').wait(1500); return T.sawPattern(ICONS.Sad, t1) && !T.numbers(t1).length; } },
    ],
  },
  {
    id: 'quiz-final', cat: 'u4', level: 2, title: 'Quiz: Units 1 to 4', lesson: 'L8', quiz: true,
    description: 'Six questions on Units 1 to 4: inputs and outputs, events, sensors, variables, if / else and time. In the exam you send your answers only once.',
    skills: 'Units 1-4',
    questions: [
      { q: 'Which one is an INPUT?', options: ['The LED screen', 'Button A', 'show icon', 'The speaker'], answer: 1 },
      { q: 'Which block runs its code when you shake the micro:bit?', options: ['on start', 'forever', 'on shake', 'show number'], answer: 2 },
      { q: 'What does the light level sensor give?', options: ['A number from 0 (dark) to 255 (bright)', 'A number from 0 to 359', 'Only ON or OFF', 'A temperature in °C'], answer: 0 },
      { q: 'steps is 4. Then "change steps by 1" runs. What is steps now?', options: ['1', '4', '5', '41'], answer: 2 },
      { q: 'if light level < 50 then show icon Heart, else clear screen. The light level is 120. What happens?', options: ['The heart is shown', 'The screen is cleared', 'The program stops', 'Both'], answer: 1 },
      { q: 'start is 5200. Now running time (ms) is 5450. What is the reaction time?', options: ['250 ms', '5450 ms', '10650 ms', '52 ms'], answer: 0 },
    ],
  },
];

CHALLENGES.forEach((c, i) => { c.n = i + 1; });

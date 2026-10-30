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
  return { heart: th - t0, numbers: T.numbers(t1) };
}
const near = (nums, target, tol) => nums.some((n) => Math.abs(n - target) <= tol);
// show icon pauses 600 ms: a program that sets start after the heart measures 600 ms less (both are right)
const nearReaction = (nums, r) => near(nums, r, 150) || near(nums, r - 600, 150);

const CHALLENGES = [
  {
    id: 'mood', cat: 'u1', level: 1, title: 'Mood display', lesson: 'L2',
    description: 'Button <b>A</b> shows a <b>happy</b> face, button <b>B</b> shows a <b>sad</b> face, and <b>A+B</b> shows a reaction of your choice (surprised, sleepy, angry…).',
    skills: 'on button A / B / A+B pressed, show icon',
    hints: ['Find "on button A pressed" in Input. Change A to B or A+B with the little arrow.', 'Put a "show icon" inside each button block and choose the face.'],
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
    description: 'Shake the micro:bit and a number from <b>1 to 6</b> appears, like a dice. Use <b>on shake</b>, <b>show number</b> and <b>pick random</b>.',
    skills: 'on shake, pick random, show number',
    hints: ['Put "show number" inside "on shake".', 'Drag "pick random 0 to 10" (Math) into show number, then change it: both ends are included!'],
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
    description: 'Shake the micro:bit to show <b>rock</b>, <b>paper</b> or <b>scissors</b> at random. Store <b>pick random 0 to 2</b> in a variable <b>choice</b>, then use <b>if / else if / else</b> to show the right icon (small square, square, scissors).',
    skills: 'variables, pick random, if / else if',
    hints: ['Variables → Make a Variable… → choice. Then "set choice to pick random 0 to 2" inside "on shake".', 'Logic → "if then else", click ⊕ to add "else if". Compare with "choice = 0" and "choice = 1".'],
    tests: (() => {
      const shakes = (make) => { const T = make(11).wait(3000); const out = []; for (let i = 0; i < 45; i++) { const t0 = T.t; T.shake(1500); const r = reacted(T, t0); out.push(r.length ? r[r.length - 1] : null); } return out; };
      return [
        { label: 'A picture appears after every shake', points: 30, run: (make) => { const s = shakes(make); return s.filter(Boolean).length / s.length >= 0.95 ? 1 : 0.5 * s.filter(Boolean).length / s.length; } },
        { label: 'Three different pictures can appear (rock, paper, scissors)', points: 40, run: (make) => { const d = distinct(shakes(make).filter(Boolean)).length; return d === 3 ? 1 : d === 2 ? 0.4 : d > 3 ? 0.5 : 0; } },
        { label: 'Uses a variable, pick random and if / else', points: 30, run: (make, p) => ['variables_set', 'math_random', 'controls_if'].filter((t) => (p.blockTypes || []).includes(t)).length / 3 },
      ];
    })(),
  },
  {
    id: 'step-counter', cat: 'u3', level: 2, title: 'Step counter', lesson: 'L6',
    description: 'Count your steps: the variable <b>steps</b> starts at 0, goes up by <b>1 at every shake</b>, button <b>A</b> shows the total and button <b>B</b> resets it to 0.',
    skills: 'variables: set, change; on shake; buttons',
    hints: ['Make a variable "steps". In "on start": set steps to 0.', '"on shake": change steps by 1. A: show number steps. B: set steps to 0.'],
    tests: [
      { label: 'At the start, A shows 0', points: 25, run: (make) => { const T = make().wait(1500); const t0 = T.t; T.click('A').wait(2000); return T.numbers(t0).includes(0); } },
      { label: 'After 3 shakes, A shows 3', points: 35, run: (make) => { const T = make().wait(1500); for (let i = 0; i < 3; i++) T.shake(500); const t0 = T.t; T.click('A').wait(2000); return T.numbers(t0).includes(3); } },
      { label: 'B resets the counter to 0', points: 25, run: (make) => { const T = make().wait(1500); for (let i = 0; i < 3; i++) T.shake(500); T.click('B', 1000); const t0 = T.t; T.click('A').wait(2000); return T.numbers(t0).includes(0); } },
      { label: 'After a reset, it counts again from 0', points: 15, run: (make) => { const T = make().wait(1500); for (let i = 0; i < 3; i++) T.shake(500); T.click('B', 1000); T.shake(500); T.shake(500); const t0 = T.t; T.click('A').wait(2000); return T.numbers(t0).includes(2); } },
    ],
  },
  {
    id: 'night-light', cat: 'u4', level: 2, title: 'Night light', lesson: 'L7 (A)',
    description: 'When the <b>light level is below your threshold</b>, switch <b>all the LEDs on</b>, otherwise switch them <b>off</b>. Use <b>forever</b>, <b>if / else</b> and a comparison <b>light level &lt; …</b> (a threshold between 20 and 200).',
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
    description: 'Press <b>A</b>: the micro:bit waits a <b>random time</b> (pick random 1000 to 4000 ms), then shows a <b>heart</b>. Press <b>B</b> as fast as you can: it shows your <b>reaction time</b> (running time − start). If you press B <b>before the heart</b>, show the <b>sad</b> icon ("too early"): use a variable <b>ready</b> (0 or 1).',
    skills: 'running time, pause, pick random, variables, conditions',
    hints: ['A: set ready to 0, show string "WAIT", pause (pick random 1000 to 4000), show icon heart, set start to running time (ms), set ready to 1.', 'B: if ready = 1 then show number (running time (ms) − start) else show icon sad.'],
    tests: [
      { label: 'After A, a heart appears after a short wait', points: 25, run: (make) => { const T = make(3).wait(1500); const t0 = T.t; T.click('A'); const th = waitForPattern(T, ICONS.Heart, t0, 12000); return th !== null && th - t0 >= 900; } },
      { label: 'The waiting time changes every time', points: 15, run: (make) => { const d = [3, 5, 8].map((s) => { const T = make(s).wait(1500); const t0 = T.t; T.click('A'); const th = waitForPattern(T, ICONS.Heart, t0, 12000); return th === null ? null : Math.round((th - t0) / 50); }).filter((x) => x !== null); return distinct(d).length >= 2; } },
      { label: 'B after the heart shows the reaction time', points: 35, run: (make) => { const T = make(3).wait(1500); const r = reactionRound(T, 1100); return r.heart !== null && nearReaction(r.numbers, 1100); } },
      { label: 'B too early shows the sad icon', points: 25, run: (make) => { const T = make(3).wait(1500); T.click('A', 300); const t1 = T.t; T.click('B').wait(1500); return T.sawPattern(ICONS.Sad, t1); } },
    ],
  },
  {
    id: 'quiz-final', cat: 'u4', level: 2, title: 'Quiz: Units 1 to 4', lesson: 'L8', quiz: true,
    description: 'Six questions on everything so far: inputs and outputs, random numbers, variables, if / else.',
    skills: 'Units 1-4',
    questions: [
      { q: 'Which one is an INPUT?', options: ['show string', 'The temperature sensor', 'The LED screen', 'The speaker'], answer: 1 },
      { q: '"pick random 1 to 6" can give…', options: ['0, 1, 2, 3, 4, 5 or 6', '1, 2, 3, 4 or 5', '1, 2, 3, 4, 5 or 6', '2, 3, 4, 5 or 6'], answer: 2 },
      { q: 'steps is 4. Then "change steps by 1" runs. What is steps now?', options: ['1', '4', '5', '41'], answer: 2 },
      { q: 'The light level is 30. Is "light level < 50" true or false?', options: ['true', 'false'], answer: 0 },
      { q: 'if temperature > 25 show "HOT" else show "OK". The temperature is 25. What is shown?', options: ['HOT', 'OK', 'nothing', 'both'], answer: 1 },
      { q: 'What is a threshold?', options: ['The limit value where the program changes what it does', 'The fastest reaction time', 'A type of variable', 'The first block of a program'], answer: 0 },
    ],
  },
];

CHALLENGES.forEach((c, i) => { c.n = i + 1; });

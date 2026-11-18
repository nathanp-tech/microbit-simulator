// The assessment of the micro:bit units (Class 5, Term 2): one challenge per key skill of the lesson plans and a
// short quiz, made to fit in one 40-minute lesson.
// Each test runs the student's program on a fresh simulated micro:bit (js/evaluator.js).
'use strict';

const CATEGORIES = [
  { id: 'blank', icon: '🧪', label: 'Blank test' },
  { id: 'test', icon: '📝', label: 'Test' },
];
// the two tests of 40 minutes: the blank test (practice, no password) and the test (password of the class)
const BLANK_TEST = ['quiz-blank', 'faces', 'dice-dots', 'light-a'];
const REAL_TEST = ['quiz-test', 'temp-b', 'rps', 'compass'];
// the exams the teacher can start (📝 Start an exam): add a new one here (its challenges must be in CHALLENGES)
const EXAMS = [
  { id: 'blank', title: 'Blank exam', challenges: BLANK_TEST, minutes: 40, note: 'The practice exam: students can also start it alone with the 🧪 Blank test card.' },
  { id: 'exam1', title: 'Exam 1', challenges: REAL_TEST, minutes: 40, note: 'The real exam.' },
];
// Pictures in the missions: [[icon:Happy]] (an icon on the LEDs), [[text:3]] (a number or letters on the LEDs),
// [[leds:all]] / [[leds:none]], [[img:#.... ..... ..#.. ..... ....#]] (any picture), [[btn:A]] (a button of the board), [[shake]].
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
    if (kind === 'img') return ledPicture(patternRows(arg), 'picture');
    if (kind === 'btn') return `<span class="d-btn">${arg}</span>`;
    if (kind === 'shake') return '<span class="d-shake">〰️ shake</span>';
    return m;
  });
}
// A program drawn with the real MakeCode blocks (read only), sized to its blocks. Quiz questions, teacher marking.
const quizWorkspaces = [];
function renderProgramInto(div, program, scale = 0.8) {
  if (!program || typeof Blockly === 'undefined') return null;
  div.innerHTML = '';
  const w = Blockly.inject(div, { readOnly: true, renderer: 'makecode', theme: MB_THEME, media: 'lib/blockly/media/', sounds: false,
    move: { scrollbars: false, drag: false, wheel: false }, zoom: { controls: false, wheel: false, startScale: scale } });
  try { Blockly.serialization.workspaces.load(program, w); } catch (e) { div.textContent = 'This program cannot be shown.'; return w; }
  const bb = w.getBlocksBoundingBox();
  if (!isFinite(bb.left) || bb.right <= bb.left) { div.style.height = '30px'; div.textContent = 'No blocks.'; return w; }
  div.style.width = Math.ceil((bb.right - bb.left) * w.scale + 20) + 'px';
  div.style.height = Math.ceil((bb.bottom - bb.top) * w.scale + 20) + 'px';
  Blockly.svgResize(w);
  w.getCanvas().setAttribute('transform', `translate(${10 - bb.left * w.scale},${10 - bb.top * w.scale}) scale(${w.scale})`);
  return w;
}
function renderQuizCode(root, questions) {
  while (quizWorkspaces.length) { try { quizWorkspaces.pop().dispose(); } catch (e) { /* already gone */ } }
  root.querySelectorAll('.q-code').forEach((div) => {
    const q = questions[Number(div.dataset.q)];
    const w = q && q.code ? renderProgramInto(div, q.code) : null;
    if (w) quizWorkspaces.push(w);
  });
}
// The answer of one question, as HTML (the student's choice or the right answer)
const quizPicked = (q, given, k) => (q.multi ? Array.isArray(given) && given.includes(k) : given === k);
const quizRight = (q, k) => (q.multi ? q.answer.includes(k) : q.answer === k);
const quizAnswered = (q, given) => (q.multi ? Array.isArray(given) && given.length > 0 : given !== undefined && given !== null);
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

// Dice faces: one LED = one dot
const DICE_FACES = ['..... ..... ..#.. ..... .....', '#.... ..... ..... ..... ....#', '#.... ..... ..#.. ..... ....#',
  '#...# ..... ..... ..... #...#', '#...# ..... ..#.. ..... #...#', '#...# ..... #...# ..... #...#'];
// Programs shown in the quizzes (MakeCode blocks, read only)
const QB = (() => {
  const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
  const txt = (t) => ({ shadow: { type: 'text', fields: { TEXT: t } } });
  const blk = (type, fields = {}, inputs = {}, extraState) => ({ type, fields, inputs, ...(extraState ? { extraState } : {}) });
  const seq = (...bs) => { for (let i = 0; i < bs.length - 1; i++) bs[i].next = { block: bs[i + 1] }; return { block: bs[0] }; };
  const prog = (...tops) => ({ blocks: { languageVersion: 0, blocks: tops.map((t, i) => ({ ...t, x: 10 + i * 280, y: 10 })) } });
  const V = (name) => ({ name });
  const getv = (name) => ({ block: blk('variables_get', { VAR: V(name) }) });
  const sensor = (type) => ({ block: blk(type) });
  const cmp = (a, op, b) => ({ block: blk('logic_compare', { OP: op }, { A: a, B: b }) });
  const ifElse = (branches, elseBody) => {
    const inputs = {};
    branches.forEach(([cond, body], i) => { inputs['IF' + i] = cond; inputs['DO' + i] = seq(...body); });
    if (elseBody) inputs.ELSE = seq(...elseBody);
    return blk('controls_if', {}, inputs, { elseIfCount: branches.length - 1, hasElse: !!elseBody });
  };
  const str = (t) => blk('basic_show_string', {}, { TEXT: txt(t) });
  return {
    wrongButton: prog(blk('input_on_button', { BUTTON: 'B' }, { HANDLER: seq(blk('basic_show_icon', { ICON: 'Heart' })) })),
    lightMeter: prog(blk('basic_forever', {}, { HANDLER: seq(blk('basic_show_number', {}, { NUMBER: sensor('input_light_level') })) })),
    shakeReset: prog(blk('input_on_gesture', { GESTURE: 'Shake' }, { HANDLER: seq(blk('variables_set', { VAR: V('count') }, { VALUE: num(0) }), blk('variables_change', { VAR: V('count') }, { VALUE: num(1) }), blk('basic_show_number', {}, { NUMBER: getv('count') })) })),
    changeBy: prog(blk('basic_on_start', {}, { HANDLER: seq(blk('variables_set', { VAR: V('score') }, { VALUE: num(3) }), blk('variables_change', { VAR: V('score') }, { VALUE: num(2) }), blk('basic_show_number', {}, { NUMBER: getv('score') })) })),
    wrongCompass: prog(blk('basic_forever', {}, { HANDLER: seq(ifElse([
      [cmp(sensor('input_compass'), 'LT', num(45)), [str('N')]],
      [cmp(sensor('input_compass'), 'LT', num(135)), [str('W')]],
      [cmp(sensor('input_compass'), 'LT', num(225)), [str('S')]],
      [cmp(sensor('input_compass'), 'LT', num(315)), [str('E')]]], [str('N')])) })),
  };
})();
// the letter of a compass heading (N 315–45, E 45–135, S 135–225, W 225–315)
function compassRound(make, heading) {
  const T = make().wait(1000); T.setHeading(heading); const t0 = T.t; T.wait(3000);
  const t = T.texts(t0).map((x) => x.trim().toUpperCase()).filter(Boolean);
  return t.length ? t[t.length - 1] : '';
}

const CHALLENGES = [
  // ---------------- 🧪 Blank test ----------------
  {
    id: 'quiz-blank', cat: 'blank', level: 2, title: 'Quiz (blank test)', lesson: 'Units 1-4', quiz: true,
    description: 'Six questions. Some show a program in blocks. Your answers are saved as you click: you can come back and change them until the end.',
    skills: 'Units 1-4',
    questions: [
      { marks: 3, q: 'Which ones are SENSORS of the micro:bit? Tick all the right ones.', multi: true, options: ['Light level', 'Temperature', 'Compass', 'Accelerometer (shake, tilt)', 'Microphone (sound level)', 'Camera', 'GPS'], answer: [0, 1, 2, 3, 4] },
      { marks: 1, q: 'Is button A an input or an output?', options: ['An input', 'An output', 'Both', 'Neither'], answer: 0 },
      { marks: 1, q: 'Is the LED screen of the micro:bit an INPUT?', options: ['No, never', 'Yes: the LEDs also measure the light level', 'Yes: it detects the buttons', 'Only when it is off'], answer: 1 },
      { marks: 2, q: 'This program should show a heart when you press A. What is wrong?', code: QB.wrongButton, options: ['It uses button B: change it to A', 'The heart icon does not exist', 'It needs a forever block', 'It needs a pause'], answer: 0 },
      { marks: 2, q: 'This program shows the light level. How can you make it show 0?', code: QB.lightMeter, options: ['Cover the LED screen with your hand (dark)', 'Shake the micro:bit', 'Press button A', 'Put the micro:bit somewhere warm'], answer: 0 },
      { marks: 2, q: 'What does this program show?', code: QB.changeBy, options: ['2', '3', '5', '32'], answer: 2 },
    ],
  },
  {
    id: 'faces', marks: 4, cat: 'blank', level: 1, title: 'Happy and sad', lesson: 'Unit 1',
    description: '<ul class="steps"><li>Press [[btn:A]] → a happy face [[icon:Happy]]</li><li>Press [[btn:B]] → a sad face [[icon:Sad]]</li></ul><p class="test-it">🧪 <b>Test it:</b> click A, then B on the board.</p>',
    skills: 'on button A / B pressed, show icon',
    hints: ['Find "on button A pressed" in Input. Change A to B with the little arrow.', 'Put a "show icon" inside each button block and choose the face.'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until a button is pressed',
    tests: [
      { label: 'Button A shows the happy face', points: 40, run: (make) => { const T = make().wait(6000); const t0 = T.t; T.click('A').wait(1500); return T.sawPattern(ICONS.Happy, t0) && !T.sawPattern(ICONS.Sad, t0); } },
      { label: 'Button B shows the sad face', points: 40, run: (make) => { const T = make().wait(6000); const t0 = T.t; T.click('B').wait(1500); return T.sawPattern(ICONS.Sad, t0) && !T.sawPattern(ICONS.Happy, t0); } },
      { label: 'The buttons work again and again', points: 20, run: (make) => {
        const T = make().wait(6000); T.click('A', 1200); T.click('B', 1200); const t0 = T.t; T.click('A').wait(1500);
        return T.sawPattern(ICONS.Happy, t0);
      } },
    ],
  },
  {
    id: 'dice-dots', marks: 6, cat: 'blank', level: 2, title: 'Dice with dots', lesson: 'Unit 2',
    description: `<ul class="steps"><li>[[shake]] → a dice face from <b>1 to 6</b> on the LED screen, with dots (one LED = one dot):<br>${DICE_FACES.map((f) => `[[img:${f}]]`).join(' ')}</li></ul><p class="test-it">🧪 <b>Test it:</b> click <b>SHAKE</b> many times: do all six faces appear?</p>`,
    skills: 'on shake, variables, pick random, if / else if, show leds',
    hints: ['Variables → Make a Variable… → roll. Then "set roll to pick random 1 to 6" inside "on shake".', 'Logic → "if then else", click ⊕ to add "else if". Compare "roll = 1", "roll = 2"… and put a "show leds" with the right dots in each part.'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until you shake',
    tests: (() => {
      // what is on the screen after each shake: the number of lit LEDs (the dots)
      const rolls = (make) => { const T = make(7).wait(3000); const out = []; for (let i = 0; i < 60; i++) { const t0 = T.t; T.shake(1500); out.push(T.images(t0).length ? T.litCount() : 0); } return out; };
      return [
        { label: 'Dots appear after every shake', points: 30, run: (make) => { const r = rolls(make); const k = r.filter((n) => n > 0).length / r.length; return k >= 0.95 ? 1 : k * 0.8; } },
        { label: 'Always 1 to 6 dots', points: 35, run: (make) => { const r = rolls(make); return r.some((n) => n > 0) && r.every((n) => n >= 1 && n <= 6); } },
        { label: 'All six faces can appear (1, 2, 3, 4, 5 and 6 dots)', points: 35, run: (make) => { const all = new Set(rolls(make)); return [1, 2, 3, 4, 5, 6].filter((n) => all.has(n)).length / 6; } },
      ];
    })(),
  },
  {
    id: 'light-a', marks: 4, cat: 'blank', level: 1, title: 'Light meter', lesson: 'Unit 3',
    description: '<ul class="steps"><li>Press [[btn:A]] → show the <b>light level</b> (from 0 = dark to 255 = bright)</li></ul><p class="test-it">🧪 <b>Test it:</b> drag the yellow <b>light circle</b> (top left of the board), then press A.</p>',
    skills: 'on button A pressed, light level, show number',
    hints: ['Put "show number" inside "on button A pressed".', 'Drag "light level" (Input) into the show number block.'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until a button is pressed',
    tests: [
      { label: 'A shows the light level (dark: 30)', points: 50, run: (make) => { const T = make().wait(1500); T.setLight(30); const t0 = T.t; T.click('A').wait(3000); return T.numbers(t0).includes(30); } },
      { label: 'A shows the light level (bright: 200)', points: 50, run: (make) => { const T = make().wait(1500); T.setLight(200); const t0 = T.t; T.click('A').wait(3000); return T.numbers(t0).includes(200); } },
    ],
  },
  // ---------------- 📝 Test ----------------
  {
    id: 'quiz-test', cat: 'test', level: 2, title: 'Quiz (test)', lesson: 'Units 1-4', quiz: true,
    description: 'Six questions. Some show a program in blocks. Your answers are saved as you click: you can come back and change them until the end.',
    skills: 'Units 1-4',
    questions: [
      { marks: 2, q: 'Which ones are OUTPUTS of the micro:bit? Tick all the right ones.', multi: true, options: ['The LED screen', 'The speaker (music)', 'Button A', 'The light sensor', 'The compass', 'The accelerometer (shake)'], answer: [0, 1] },
      { marks: 1, q: 'Is the LED screen an output?', options: ['Yes: it shows pictures, numbers and text', 'No: it is only an input', 'No: it is a sensor', 'Only with the radio'], answer: 0 },
      { marks: 2, q: 'What is a variable?', options: ['A box with a name that keeps a value; the value can change', 'A block that repeats forever', 'A sensor of the micro:bit', 'A picture on the LED screen'], answer: 0 },
      { marks: 2, q: 'This program should count the shakes. It always shows 1. Why?', code: QB.shakeReset, options: ['count is set to 0 at every shake: set it to 0 in "on start" instead', '"change count by 1" should be "by 0"', 'show number cannot show a variable', '"on shake" only works once'], answer: 0 },
      { marks: 2, q: 'This compass shows the wrong letter when you face East or West. What must you change?', code: QB.wrongCompass, options: ['Swap the letters E and W', 'Swap the letters N and S', 'Change 45 to 90', 'Use the temperature instead of the compass heading'], answer: 0 },
      { marks: 1, q: 'Is the temperature sensor an input or an output?', options: ['An input', 'An output', 'Both', 'Neither'], answer: 0 },
    ],
  },
  {
    id: 'temp-b', marks: 4, cat: 'test', level: 1, title: 'Thermometer', lesson: 'Unit 3',
    description: '<ul class="steps"><li>Press [[btn:B]] → show the <b>temperature</b> (°C)</li></ul><p class="test-it">🧪 <b>Test it:</b> drag the <b>thermometer</b> on the board, then press B.</p>',
    skills: 'on button B pressed, temperature, show number',
    hints: ['Put "show number" inside "on button B pressed".', 'Drag "temperature (°C)" (Input) into the show number block.'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until a button is pressed',
    tests: [
      { label: 'B shows the temperature (18 °C)', points: 50, run: (make) => { const T = make().wait(1500); T.setTemp(18); const t0 = T.t; T.click('B').wait(3000); return T.numbers(t0).includes(18); } },
      { label: 'B shows the temperature (31 °C)', points: 50, run: (make) => { const T = make().wait(1500); T.setTemp(31); const t0 = T.t; T.click('B').wait(3000); return T.numbers(t0).includes(31); } },
    ],
  },
  {
    id: 'rps', marks: 6, cat: 'test', level: 2, title: 'Rock Paper Scissors', lesson: 'Unit 2',
    description: '<ul class="steps"><li>[[shake]] → show <b>rock</b>, <b>paper</b> or <b>scissors</b> at random on the LED screen, for example [[icon:SmallSquare]] [[icon:Square]] [[icon:Scissors]]</li></ul><p class="test-it">🧪 <b>Test it:</b> click <b>SHAKE</b> 10 times: do all three appear?</p>',
    skills: 'variables, pick random, if / else if',
    hints: ['Variables → Make a Variable… → choice. Then "set choice to pick random 0 to 2" inside "on shake".', 'Logic → "if then else", click ⊕ to add "else if". Compare with "choice = 0" and "choice = 1".'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until you shake',
    tests: (() => {
      const shakes = (make) => { const T = make(11).wait(3000); const out = []; for (let i = 0; i < 45; i++) { const t0 = T.t; T.shake(1500); const r = reacted(T, t0); out.push(r.length ? r[r.length - 1] : null); } return out; };
      return [
        { label: 'A picture appears after every shake', points: 30, run: (make) => { const s = shakes(make); return s.filter(Boolean).length / s.length >= 0.95 ? 1 : 0.5 * s.filter(Boolean).length / s.length; } },
        { label: 'Three different pictures can appear (rock, paper, scissors)', points: 40, run: (make) => { const d = distinct(shakes(make).filter(Boolean)).length; return d === 3 ? 1 : d === 2 ? 0.4 : d > 3 ? 0.5 : 0; } },
        { label: 'Uses pick random and if / else', points: 30, always: true, run: (make, p) => ['math_random', 'controls_if'].filter((t) => (p.blockTypes || []).includes(t)).length / 2 },
      ];
    })(),
  },
  {
    id: 'compass', marks: 5, cat: 'test', level: 2, title: 'Compass', lesson: 'Unit 4',
    description: '<ul class="steps"><li>Always show where the micro:bit points: <b>N</b>, <b>E</b>, <b>S</b> or <b>W</b> [[text:N]] [[text:E]] [[text:S]] [[text:W]]</li><li>N = 0°, E = 90°, S = 180°, W = 270° (compass heading)</li></ul><p class="test-it">🧪 <b>Test it:</b> drag the yellow <b>logo</b> at the top of the board round and round: the heading changes (shown on the logo). Watch the letter.</p>',
    skills: 'forever, compass heading, if / else if, comparison',
    hints: ['forever → if (compass heading < 45) then show string "N", else if (compass heading < 135) then show string "E"…', 'Click ⊕ on the if block to add the "else if" parts. The last part (else) shows "N" again.'],
    tests: [
      { label: 'Heading 10° shows N', points: 20, run: (make) => compassRound(make, 10) === 'N' },
      { label: 'Heading 90° shows E', points: 20, run: (make) => compassRound(make, 90) === 'E' },
      { label: 'Heading 180° shows S', points: 20, run: (make) => compassRound(make, 180) === 'S' },
      { label: 'Heading 270° shows W', points: 20, run: (make) => compassRound(make, 270) === 'W' },
      { label: 'Heading 350° shows N', points: 20, run: (make) => compassRound(make, 350) === 'N' },
    ],
  },
];

CHALLENGES.forEach((c, i) => { c.n = i + 1; });

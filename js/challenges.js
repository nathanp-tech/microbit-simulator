// The assessment of the micro:bit units (Class 5, Term 2): one challenge per key skill of the lesson plans and a
// short quiz, made to fit in one 40-minute lesson.
// Each test runs the student's program on a fresh simulated micro:bit (js/evaluator.js).
'use strict';

const CATEGORIES = [
  { id: 'blank', icon: '🧪', label: 'Blank test' },
  { id: 'test', icon: '📝', label: 'Test' },
];
// the two tests of 40 minutes: the blank test (practice, no password) and the test (password of the class)
const BLANK_TEST = ['quiz-blank', 'faces', 'rps', 'sound-a'];
const REAL_TEST = ['quiz-test', 'temp-b', 'dice-dots', 'light-levels'];
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
const quizAnswered = (q, given) => (q.open ? typeof given === 'string' && given.trim() !== '' : q.multi ? Array.isArray(given) && given.length > 0 : given !== undefined && given !== null);
// Open questions (the student types the answer): right when a word of "accept" is in it (any case, accents, plural, one typo
// in a long word), unless a word of "reject" is in it too.
const openNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function nearWord(a, b) {
  if (a === b || a === b + 's' || a + 's' === b || a === b + 'es') return true;
  if (b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] <= 1;
}
function openHas(text, key) {
  const w = openNorm(text).split(' '), k = openNorm(key).split(' ');
  for (let i = 0; i + k.length <= w.length; i++) if (k.every((x, j) => nearWord(w[i + j], x))) return true;
  return false;
}
// how an open question looks in the teacher's views: the typed answer (✔ / ✖) and what is accepted
function openAnswerHtml(q, given, withKey = true) {
  const has = typeof given === 'string' && given.trim() !== '', ok = has && openRight(q, given);
  return `${has ? `<div class="wq-opt ${ok ? 'picked-ok' : 'picked-ko'}">${ok ? '✔' : '✖'} “${esc(given)}”</div>` : '<div class="wq-opt muted">no answer</div>'}${withKey ? `<div class="wq-opt right">○ Accepted: ${esc(q.model || q.accept.join(', '))}</div>` : ''}`;
}
const openRight = (q, given) => typeof given === 'string' && !(q.reject || []).some((r) => openHas(given, r)) && q.accept.some((a) => openHas(given, a));
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
    solFaces: prog(blk('input_on_button', { BUTTON: 'A' }, { HANDLER: seq(blk('basic_show_icon', { ICON: 'Happy' })) }), blk('input_on_button', { BUTTON: 'B' }, { HANDLER: seq(blk('basic_show_icon', { ICON: 'Sad' })) })),
    solRps: prog(blk('input_on_gesture', { GESTURE: 'Shake' }, { HANDLER: seq(blk('variables_set', { VAR: V('choice') }, { VALUE: { block: blk('math_random', {}, { FROM: num(0), TO: num(2) }) } }),
      ifElse([[cmp(getv('choice'), 'EQ', num(0)), [blk('basic_show_icon', { ICON: 'SmallSquare' })]], [cmp(getv('choice'), 'EQ', num(1)), [blk('basic_show_icon', { ICON: 'Square' })]]], [blk('basic_show_icon', { ICON: 'Scissors' })])) })),
    solSound: prog(blk('input_on_button', { BUTTON: 'A' }, { HANDLER: seq(blk('basic_show_number', {}, { NUMBER: sensor('input_sound_level') })) })),
    wrongButton: prog(blk('input_on_button', { BUTTON: 'B' }, { HANDLER: seq(blk('basic_show_icon', { ICON: 'Heart' })) })),
    lightMeter: prog(blk('basic_forever', {}, { HANDLER: seq(blk('basic_show_number', {}, { NUMBER: sensor('input_light_level') })) })),
    shakeReset: prog(blk('input_on_gesture', { GESTURE: 'Shake' }, { HANDLER: seq(blk('variables_set', { VAR: V('count') }, { VALUE: num(0) }), blk('variables_change', { VAR: V('count') }, { VALUE: num(1) }), blk('basic_show_number', {}, { NUMBER: getv('count') })) })),
    minusBy: prog(blk('basic_on_start', {}, { HANDLER: seq(blk('variables_set', { VAR: V('lives') }, { VALUE: num(10) }), blk('variables_change', { VAR: V('lives') }, { VALUE: num(-3) }), blk('basic_show_number', {}, { NUMBER: getv('lives') })) })),
    changeBy: prog(blk('basic_on_start', {}, { HANDLER: seq(blk('variables_set', { VAR: V('score') }, { VALUE: num(3) }), blk('variables_change', { VAR: V('score') }, { VALUE: num(2) }), blk('basic_show_number', {}, { NUMBER: getv('score') })) })),
    wrongCompass: prog(blk('basic_forever', {}, { HANDLER: seq(ifElse([[cmp(sensor('input_compass'), 'LT', num(180)), [str('W')]]], [str('E')])) })),
  };
})();
// what a "forever" program shows last once a sensor is set (compass letter, light level…)
function compassRound(make, heading) { return sensorRound(make, (T) => T.setHeading(heading)); }
function sensorRound(make, set) {
  const T = make().wait(1000); set(T); const t0 = T.t; T.wait(3000);
  const t = T.texts(t0).map((x) => x.trim().toUpperCase()).filter(Boolean);
  return t.length ? t[t.length - 1] : '';
}

const CHALLENGES = [
  // ---------------- 🧪 Blank test ----------------
  {
    id: 'quiz-blank', cat: 'blank', level: 2, title: 'Quiz (blank test)', lesson: 'Units 1-4', quiz: true,
    description: 'Six questions. Some show a program in blocks; for some you type a short answer. Your answers are saved as you go: you can come back and change them until the end.',
    skills: 'Units 1-4',
    questions: [
      { marks: 3, q: 'Which ones are OUTPUTS of the micro:bit? Tick all the right ones.', why: "Outputs show or play something: the LED screen and the speaker. Button A, the light sensor, the compass and the accelerometer are inputs (they measure or detect).", multi: true, options: ['The LED screen', 'The speaker (music)', 'Button A', 'The light sensor', 'The compass', 'The accelerometer (shake)'], answer: [0, 1] },
      { marks: 1, open: true, q: 'You want the micro:bit to show where North is. Which sensor do you use?', accept: ['compass', 'magnetometer', 'compass heading'], model: 'the compass', why: "The compass (compass heading block) measures the direction: 0° is North." },
      { marks: 1, open: true, q: 'Name one INPUT of the micro:bit (a button or a sensor).', why: "Inputs: buttons A and B, the logo, light level, temperature, compass, accelerometer (shake, tilt), microphone (sound level), pins.", accept: ['button', 'light', 'temperature', 'thermometer', 'compass', 'accelerometer', 'shake', 'tilt', 'microphone', 'sound', 'noise', 'logo', 'touch', 'pin', 'sensor', 'gesture', 'magnet', 'input'], reject: ['led', 'leds', 'screen', 'speaker', 'output'], model: 'a button, light level, temperature, compass, accelerometer (shake), microphone (sound), logo, pins' },
      { marks: 2, q: 'This program should show a heart when you press A. What is wrong?', why: "The event block says button B: choose A with the little arrow.", code: QB.wrongButton, options: ['It uses button B: change it to A', 'The heart icon does not exist', 'It needs a forever block', 'It needs a pause'], answer: 0 },
      { marks: 2, q: 'This program shows the light level. How can you make it show 0?', why: "The light sensor is in the LED screen: cover it with your hand and the light level goes down to 0.", code: QB.lightMeter, options: ['Cover the LED screen with your hand (dark)', 'Shake the micro:bit', 'Press button A', 'Put the micro:bit somewhere warm'], answer: 0 },
      { marks: 2, open: true, q: 'What number does this program show? Type the number.', code: QB.changeBy, why: "score starts at 3, then \"change score by 2\" adds 2: 3 + 2 = 5.", accept: ['5', 'five'], reject: ['32'], model: '5' },
    ],
  },
  {
    id: 'faces', marks: 4, cat: 'blank', level: 1, title: 'Happy and sad', lesson: 'Unit 1',
    solution: QB.solFaces, solutionNote: 'Two events, one for each button, each with a show icon.',
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
    id: 'rps', marks: 6, cat: 'blank', level: 2, title: 'Rock Paper Scissors', lesson: 'Unit 2',
    solution: QB.solRps, solutionNote: 'On shake: a variable gets a random number 0, 1 or 2, then if / else if / else shows a different picture for each number.',
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
    id: 'sound-a', marks: 4, cat: 'blank', level: 1, title: 'Sound meter', lesson: 'Unit 3',
    solution: QB.solSound, solutionNote: 'On button A: show number with the sound level block inside.',
    description: '<ul class="steps"><li>Press [[btn:A]] → show the <b>sound level</b> (from 0 = silent to 255 = very loud)</li></ul><p class="test-it">🧪 <b>Test it:</b> drag the <b>sound bar</b> (right of the LEDs) up or down, then press A.</p>',
    skills: 'on button A pressed, sound level, show number',
    hints: ['Put "show number" inside "on button A pressed".', 'Drag "sound level" (Input) into the show number block.'],
    quietCheck: stillWithoutInput, quietLabel: 'Nothing changes until a button is pressed',
    tests: [
      { label: 'A shows the sound level (quiet: 40)', points: 50, run: (make) => { const T = make().wait(1500); T.setSound(40); const t0 = T.t; T.click('A').wait(3000); return T.numbers(t0).includes(40); } },
      { label: 'A shows the sound level (loud: 180)', points: 50, run: (make) => { const T = make().wait(1500); T.setSound(180); const t0 = T.t; T.click('A').wait(3000); return T.numbers(t0).includes(180); } },
    ],
  },
  // ---------------- 📝 Test ----------------
  {
    id: 'quiz-test', cat: 'test', level: 2, title: 'Quiz (test)', lesson: 'Units 1-4', quiz: true,
    description: 'Six questions. Some show a program in blocks; for some you type a short answer. Your answers are saved as you go: you can come back and change them until the end.',
    skills: 'Units 1-4',
    questions: [
      { marks: 2, q: 'Which ones are SENSORS of the micro:bit? Tick all the right ones.', multi: true, options: ['Light level', 'Temperature', 'Compass', 'Accelerometer (shake, tilt)', 'Microphone (sound level)', 'Camera', 'GPS'], answer: [0, 1, 2, 3, 4] },
      { marks: 1, open: true, q: 'Name one OUTPUT of the micro:bit.', accept: ['led', 'leds', 'screen', 'display', 'speaker', 'sound', 'music', 'melody', 'tone', 'buzzer', 'pin', 'radio', 'output'], reject: ['button', 'sensor', 'compass', 'temperature', 'thermometer', 'accelerometer', 'microphone', 'light level', 'input'], model: 'the LED screen, the speaker (music), the pins, the radio' },
      { marks: 2, open: true, q: 'What number does this program show? Type the number.', code: QB.minusBy, accept: ['7', 'seven'], reject: ['13'], model: '7' },
      { marks: 2, q: 'This program should count the shakes. It always shows 1. Why?', code: QB.shakeReset, options: ['count is set to 0 at every shake: set it to 0 in "on start" instead', '"change count by 1" should be "by 0"', 'show number cannot show a variable', '"on shake" only works once'], answer: 0 },
      { marks: 2, q: 'This program should show E when the micro:bit faces East (90°) and W when it faces West (270°). It always shows the wrong letter. What must you change?', code: QB.wrongCompass, options: ['Swap the letters E and W', 'Change 180 to 360', 'Add a pause in the forever block', 'Use the temperature instead of the compass heading'], answer: 0 },
      { marks: 1, open: true, q: 'Which block runs the blocks inside it again and again, without ever stopping? Type its name.', accept: ['forever'], model: 'forever' },
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
    id: 'dice-dots', marks: 6, cat: 'test', level: 2, title: 'Dice with dots', lesson: 'Unit 2',
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
    id: 'light-levels', marks: 5, cat: 'test', level: 2, title: 'Light levels', lesson: 'Unit 3',
    description: '<ul class="steps"><li>Always show how bright it is, from <b>1</b> (dark) to <b>4</b> (very bright) [[text:1]] [[text:2]] [[text:3]] [[text:4]]</li><li>light level 0 to 63 → 1 · 64 to 127 → 2 · 128 to 191 → 3 · 192 to 255 → 4</li></ul><p class="test-it">🧪 <b>Test it:</b> drag the yellow <b>light circle</b> (top left of the board) up and down. Watch the number.</p>',
    skills: 'forever, light level, if / else if, comparison',
    hints: ['forever → if (light level < 64) then show number 1, else if (light level < 128) then show number 2…', 'Click ⊕ on the if block to add the "else if" parts. The last part (else) shows 4.'],
    tests: [
      { label: 'Light 10 shows 1', points: 20, run: (make) => sensorRound(make, (T) => T.setLight(10)) === '1' },
      { label: 'Light 90 shows 2', points: 20, run: (make) => sensorRound(make, (T) => T.setLight(90)) === '2' },
      { label: 'Light 160 shows 3', points: 20, run: (make) => sensorRound(make, (T) => T.setLight(160)) === '3' },
      { label: 'Light 240 shows 4', points: 20, run: (make) => sensorRound(make, (T) => T.setLight(240)) === '4' },
      { label: 'Light 40 shows 1', points: 20, run: (make) => sensorRound(make, (T) => T.setLight(40)) === '1' },
    ],
  },
];

CHALLENGES.forEach((c, i) => { c.n = i + 1; });

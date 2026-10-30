// The challenges of the micro:bit units (Class 5, Term 2), in the order of the lesson plans.
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
  // ---------------- Unit 1 ----------------
  {
    id: 'name-tag', cat: 'u1', level: 1, title: 'Name tag', lesson: 'L1',
    description: 'When the micro:bit starts, show <b>your name</b> with <b>show string</b>, then <b>your own picture</b> with <b>show leds</b> or <b>show icon</b>. Put the blocks inside <b>on start</b>.',
    skills: 'on start, show string, show leds / show icon',
    hints: ['Find "show string" in Basic and put it inside "on start". Click on "Hello!" and type your name.', 'Add "show leds" under it and click the squares to draw your picture.'],
    tests: [
      { label: 'Your name scrolls when the micro:bit starts', points: 40, run: (make) => make().wait(15000).texts().some((s) => /[a-z]{2,}/i.test(s) && s.trim() !== 'Hello!') },
      { label: 'A picture is shown (show leds or show icon)', points: 40, run: (make) => make().wait(15000).images().length > 0 },
      { label: 'The name comes first, then the picture', points: 20, run: (make) => {
        const T = make().wait(15000);
        const txt = T.log().find((e) => e.kind === 'text');
        const img = T.log().find((e) => ['leds', 'icon'].includes(e.kind) && txt && e.t > txt.t);
        return !!(txt && img);
      } },
    ],
  },
  {
    id: 'animation', cat: 'u1', level: 2, title: 'Small animation', lesson: 'L1 extension',
    description: 'Make an <b>animation</b>: inside <b>forever</b>, show at least <b>two different pictures</b> one after the other, with a <b>pause</b> between them.',
    skills: 'forever, show icon / show leds, pause',
    hints: ['Use the "forever" block: everything inside it repeats again and again.', 'show icon ❤ · pause 500 · show icon small ❤ makes a beating heart.'],
    tests: [
      { label: 'At least two different pictures are shown', points: 40, run: (make) => Math.min(1, distinct(make().wait(8000).images()).length / 2) },
      { label: 'The animation keeps repeating', points: 30, run: (make) => {
        const T = make().wait(12000);
        const first = T.log(0, 4000).filter((e) => ['leds', 'icon'].includes(e.kind)).map((e) => e.value);
        return first.length > 0 && T.log(6000, 12000).some((e) => first.includes(e.value));
      } },
      { label: 'Each picture stays long enough to be seen', points: 30, run: (make) => {
        const T = make().wait(8000);
        const imgs = new Set(T.images());
        const fr = T.frames(0, 8000).filter((f) => imgs.has(f.img) && f.until !== Infinity);
        return fr.length > 0 && fr.every((f) => f.until - f.t >= 150);
      } },
    ],
  },
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
    id: 'quiz-u1', cat: 'u1', level: 1, title: 'Quiz: inputs and outputs', lesson: 'Unit 1', quiz: true,
    description: 'Answer the questions about the micro:bit and MakeCode. Your teacher sees your answers.',
    skills: 'input / output, events, MakeCode',
    questions: [
      { q: 'Which part of the micro:bit is an OUTPUT?', options: ['Button A', 'The LED screen', 'The light sensor', 'Button B'], answer: 1 },
      { q: 'Which block runs only once, when the micro:bit starts?', options: ['forever', 'on start', 'on button A pressed', 'pause (ms)'], answer: 1 },
      { q: 'In Scratch, "when green flag clicked" is like which MakeCode block?', options: ['on start', 'show icon', 'clear screen', 'pause (ms)'], answer: 0 },
      { q: 'What does "pause (ms) 1000" do?', options: ['It waits 1 second', 'It waits 1000 seconds', 'It shows the number 1000', 'It repeats 1000 times'], answer: 0 },
      { q: 'How many LEDs are on the micro:bit screen?', options: ['9', '16', '25', '100'], answer: 2 },
      { q: 'You press A and B at the same time. Which block runs?', options: ['on button A pressed', 'on button B pressed', 'on button A+B pressed', 'on start'], answer: 2 },
    ],
  },
  // ---------------- Unit 2 ----------------
  {
    id: 'gestures', cat: 'u2', level: 1, title: 'Gesture detective', lesson: 'L3',
    description: 'Use <b>three different gestures</b> (shake, tilt left, logo up, screen down…). Each gesture shows a <b>different icon</b>. In the simulator, use the SHAKE button, or move the mouse over the board to tilt it.',
    skills: 'on shake and its gestures, show icon',
    hints: ['Find "on shake" in Input. Click the arrow next to "shake" to choose another gesture.', 'You need three "on …" blocks, each with its own "show icon".'],
    tests: (() => {
      const G = ['Shake', 'LogoUp', 'LogoDown', 'ScreenUp', 'ScreenDown', 'TiltLeft', 'TiltRight', 'FreeFall', 'ThreeG', 'SixG', 'EightG'];
      const results = (make) => G.map((g) => { const T = make().wait(4000); const t0 = T.t; T.gesture(g).wait(1500); const r = reacted(T, t0); return r.length ? r[r.length - 1] : null; }).filter(Boolean);
      return [
        { label: 'Three gestures make the micro:bit show something', points: 45, run: (make) => Math.min(3, results(make).length) / 3 },
        { label: 'The three pictures are all different', points: 35, run: (make) => Math.min(3, distinct(results(make)).length) / 3 },
        { label: 'Three "on gesture" blocks are used', points: 20, run: (make, prog) => Math.min(3, (prog.blockTypes || []).filter((t) => t === 'input_on_gesture').length) / 3 },
      ];
    })(),
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
    id: 'rps-score', cat: 'u2', level: 2, title: 'Keep the score', lesson: 'L4 extension',
    description: 'Add a <b>score</b> to your game: button <b>A</b> adds 1 to the score when you win, button <b>B</b> shows the score.',
    skills: 'variables: set, change, show number',
    hints: ['Make a variable "score". In "on start", set score to 0.', '"on button A pressed": change score by 1. "on button B pressed": show number score.'],
    tests: [
      { label: 'A three times, then B shows 3', points: 50, run: (make) => { const T = make().wait(3000); for (let i = 0; i < 3; i++) T.click('A', 1000); const t0 = T.t; T.click('B').wait(3000); return T.numbers(t0).includes(3); } },
      { label: 'A two more times, then B shows 5', points: 50, run: (make) => { const T = make().wait(3000); for (let i = 0; i < 3; i++) T.click('A', 1000); T.click('B', 3000); T.click('A', 1000); T.click('A', 1000); const t0 = T.t; T.click('B').wait(3000); return T.numbers(t0).includes(5); } },
    ],
  },
  {
    id: 'quiz-u2', cat: 'u2', level: 1, title: 'Quiz: movement and random', lesson: 'Unit 2', quiz: true,
    description: 'Answer the questions about gestures, random numbers and variables.',
    skills: 'gestures, pick random, variables',
    questions: [
      { q: 'Which part of the micro:bit feels shaking and tilting?', options: ['The compass', 'The accelerometer', 'The light sensor', 'The thermometer'], answer: 1 },
      { q: '"pick random 1 to 6" can give…', options: ['0, 1, 2, 3, 4, 5 or 6', '1, 2, 3, 4 or 5', '1, 2, 3, 4, 5 or 6', '2, 3, 4, 5 or 6'], answer: 2 },
      { q: 'How many different values can "pick random 0 to 2" give?', options: ['1', '2', '3', '4'], answer: 2 },
      { q: 'What is a variable?', options: ['A labelled box that stores a value', 'A light on the screen', 'A type of button', 'A sound'], answer: 0 },
      { q: 'if choice = 0 show rock, else if choice = 1 show paper, else show scissors. choice is 2: what is shown?', options: ['rock', 'paper', 'scissors', 'nothing'], answer: 2 },
      { q: 'Which gesture is it when the screen faces the floor?', options: ['screen up', 'screen down', 'logo up', 'tilt left'], answer: 1 },
    ],
  },
  // ---------------- Unit 3 ----------------
  {
    id: 'sensor-station', cat: 'u3', level: 1, title: 'Sensor station', lesson: 'L5',
    description: 'Button <b>A</b> shows the <b>temperature</b>, button <b>B</b> shows the <b>light level</b>, <b>A+B</b> shows the <b>compass heading</b>. Test it with the thermometer and the light circle of the simulator.',
    skills: 'temperature, light level, compass heading, show number',
    hints: ['"on button A pressed" → "show number" → drag "temperature (°C)" (Input) inside.', 'Do the same with "light level" for B and "compass heading" for A+B.'],
    tests: [
      { label: 'A shows the temperature', points: 34, run: (make) => { const T = make().wait(2000); T.setTemp(27); let t0 = T.t; T.click('A').wait(4000); const a = T.numbers(t0).includes(27); T.setTemp(12); t0 = T.t; T.click('A').wait(4000); return (a ? 0.5 : 0) + (T.numbers(t0).includes(12) ? 0.5 : 0); } },
      { label: 'B shows the light level', points: 33, run: (make) => { const T = make().wait(2000); T.setLight(143); let t0 = T.t; T.click('B').wait(4000); const a = T.numbers(t0).includes(143); T.setLight(36); t0 = T.t; T.click('B').wait(4000); return (a ? 0.5 : 0) + (T.numbers(t0).includes(36) ? 0.5 : 0); } },
      { label: 'A+B shows the compass heading', points: 33, run: (make) => { const T = make().wait(2000); T.setHeading(210); let t0 = T.t; T.click('AB').wait(4000); const a = T.numbers(t0).includes(210); T.setHeading(45); t0 = T.t; T.click('AB').wait(4000); return (a ? 0.5 : 0) + (T.numbers(t0).includes(45) ? 0.5 : 0); } },
    ],
  },
  {
    id: 'thermometer', cat: 'u3', level: 2, title: 'Live thermometer', lesson: 'L5 extension',
    description: 'Show the <b>temperature all the time</b>: in a <b>forever</b> loop, show the temperature, then the unit with <b>show string "C"</b>, and <b>pause 1000</b> ms. It must change when the temperature changes.',
    skills: 'forever, temperature, show number, show string',
    hints: ['Everything goes inside "forever": show number temperature, show string "C", pause 1000.'],
    tests: [
      { label: 'The temperature appears without pressing anything', points: 40, run: (make) => { const T = make(); T.setTemp(24); T.wait(7000); return T.numbers().includes(24); } },
      { label: 'It changes when the temperature changes', points: 40, run: (make) => { const T = make(); T.setTemp(24); T.wait(5000); T.setTemp(31); const t0 = T.t; T.wait(8000); return T.numbers(t0).includes(31); } },
      { label: 'The unit "C" is shown', points: 20, run: (make) => { const T = make(); T.setTemp(24); T.wait(8000); return T.sawText(/C/); } },
    ],
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
    id: 'progress-bar', cat: 'u3', level: 3, title: 'Progress bar', lesson: 'L6 extension',
    description: 'Show your steps as a <b>progress bar</b> with <b>plot bar graph of steps up to 20</b> (LED): the more you shake, the more LEDs light up.',
    skills: 'plot bar graph, variables',
    hints: ['Put "plot bar graph of steps up to 20" in "forever", or just after "change steps by 1".'],
    tests: [
      { label: 'Uses plot bar graph', points: 30, run: (make, p) => (p.blockTypes || []).includes('led_bar_graph') },
      { label: 'After 10 shakes, about half of the bar is lit', points: 35, run: (make) => { const T = make().wait(1000); for (let i = 0; i < 10; i++) T.shake(300); T.wait(1000); const n = T.litCount(); return n >= 6 && n <= 20; } },
      { label: 'More shakes light up more LEDs', points: 35, run: (make) => { const T = make().wait(1000); for (let i = 0; i < 4; i++) T.shake(300); T.wait(1000); const a = T.litCount(); for (let i = 0; i < 12; i++) T.shake(300); T.wait(1000); return T.litCount() > a && a > 0; } },
    ],
  },
  {
    id: 'quiz-u3', cat: 'u3', level: 1, title: 'Quiz: sensors and variables', lesson: 'Unit 3', quiz: true,
    description: 'Answer the questions about the sensors of the micro:bit and variables.',
    skills: 'sensors, variables',
    questions: [
      { q: 'What values can "light level" give?', options: ['0 to 255', '0 to 100', '1 to 10', '-50 to 50'], answer: 0 },
      { q: 'Why can the temperature be a few degrees higher than the room?', options: ['The sensor is broken', 'It is measured inside the chip, which warms up', 'The micro:bit uses Fahrenheit', 'The LED screen is too bright'], answer: 1 },
      { q: 'steps is 4. Then "change steps by 1" runs. What is steps now?', options: ['1', '4', '5', '41'], answer: 2 },
      { q: 'Why do we "set steps to 0" in on start?', options: ['To show 0 on the screen', 'So the counter starts from a known value', 'To stop the program', 'To make the micro:bit faster'], answer: 1 },
      { q: 'The compass heading is 90°. Which way is the micro:bit pointing?', options: ['North', 'East', 'South', 'West'], answer: 1 },
      { q: 'How does the micro:bit measure the light level?', options: ['With the LED screen', 'With button A', 'With the logo', 'With the USB cable'], answer: 0 },
    ],
  },
  // ---------------- Unit 4 ----------------
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
    id: 'hot-cold', cat: 'u4', level: 2, title: 'Hot / cold detector', lesson: 'L7 (B)',
    description: 'If the temperature is <b>above 25 °C</b> show <b>"HOT"</b>, else if it is <b>below 15 °C</b> show <b>"COLD"</b>, else show <b>"OK"</b>. Use <b>if / else if / else</b> in <b>forever</b>.',
    skills: 'if / else if / else, comparison, temperature',
    hints: ['Click ⊕ on the "if" block to get "else if" and "else".', 'if temperature > 25 → show string "HOT"; else if temperature < 15 → "COLD"; else → "OK".'],
    tests: [
      { label: 'At 32 °C it shows HOT', points: 34, run: (make) => { const T = make(); T.setTemp(32); T.wait(8000); return T.sawText('HOT') && !T.sawText('COLD'); } },
      { label: 'At 8 °C it shows COLD', points: 33, run: (make) => { const T = make(); T.setTemp(8); T.wait(8000); return T.sawText('COLD') && !T.sawText('HOT'); } },
      { label: 'At 20 °C it shows OK', points: 33, run: (make) => { const T = make(); T.setTemp(20); T.wait(8000); return T.sawText(/^\s*OK\s*$/i) && !T.sawText('HOT') && !T.sawText('COLD'); } },
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
    id: 'best-score', cat: 'u4', level: 3, title: 'Best reaction time', lesson: 'L8 extension',
    description: 'Keep your <b>best (smallest) reaction time</b> in a variable <b>best</b>, and show it with <b>A+B</b>. A slower round must not change it.',
    skills: 'variables, comparison, if',
    hints: ['In on start: set best to 10000 (a very slow time).', 'After you calculate the reaction time: if time < best then set best to time. A+B: show number best.'],
    tests: (() => {
      const showBest = (T) => { const t0 = T.t; T.click('AB').wait(5000); return T.numbers(t0); };
      return [
        { label: 'A+B shows the best time after one round', points: 34, run: (make) => { const T = make(3).wait(1500); reactionRound(T, 1300); return nearReaction(showBest(T), 1300); } },
        { label: 'A faster round becomes the new best', points: 33, run: (make) => { const T = make(3).wait(1500); reactionRound(T, 1700); reactionRound(T, 900); return nearReaction(showBest(T), 900); } },
        { label: 'A slower round does not change the best', points: 33, run: (make) => { const T = make(3).wait(1500); reactionRound(T, 900); reactionRound(T, 1900); const n = showBest(T); return nearReaction(n, 900) && !nearReaction(n, 1900); } },
      ];
    })(),
  },
  {
    id: 'quiz-final', cat: 'u4', level: 2, title: 'Mini-quiz: Units 1 to 4', lesson: 'L8', quiz: true,
    description: 'Eight questions on everything so far: inputs and outputs, events, sensors, variables, if / else. It helps your teacher see what to revise before the mini-project.',
    skills: 'Units 1-4',
    questions: [
      { q: 'Which one is an INPUT?', options: ['show string', 'The temperature sensor', 'The LED screen', 'The speaker'], answer: 1 },
      { q: 'Which block waits for the user before it runs?', options: ['on start', 'forever', 'on button A pressed', 'show number'], answer: 2 },
      { q: 'The light level is 30. Is "light level < 50" true or false?', options: ['true', 'false'], answer: 0 },
      { q: 'if temperature > 25 show "HOT" else show "OK". The temperature is 25. What is shown?', options: ['HOT', 'OK', 'nothing', 'both'], answer: 1 },
      { q: 'running time is 5200 ms and start is 4800 ms. What is the reaction time?', options: ['400 ms', '10000 ms', '4800 ms', '5200 ms'], answer: 0 },
      { q: 'Which block makes a decision?', options: ['repeat 4 times', 'if / else', 'pause', 'set score to 0'], answer: 1 },
      { q: 'What is a threshold?', options: ['The limit value where the program changes what it does', 'The fastest reaction time', 'A type of variable', 'The first block of a program'], answer: 0 },
      { q: 'score is 3. Then "set score to 0", then "change score by 2". What is score?', options: ['5', '2', '0', '3'], answer: 1 },
    ],
  },
];

CHALLENGES.forEach((c, i) => { c.n = i + 1; });

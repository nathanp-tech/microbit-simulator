// Reference solutions of the challenges (Blockly JSON), simplest first. They must score 100 % (tests/selftest.html).
// Published to api/_solutions.json (teacher only) with tests/selftest.html → "answer key".
'use strict';

const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
const txt = (s) => ({ shadow: { type: 'text', fields: { TEXT: s } } });
const ms = (n) => ({ shadow: { type: 'timePicker', fields: { MS: n } } });
const val = (b) => ({ block: b });
const blk = (type, fields = {}, inputs = {}, extraState) => ({ type, fields, inputs, ...(extraState ? { extraState } : {}) });
function seq(...bs) {
  bs = bs.filter(Boolean);
  for (let i = 0; i < bs.length - 1; i++) bs[i].next = { block: bs[i + 1] };
  return { block: bs[0] };
}
const prog = (...tops) => ({ blocks: { languageVersion: 0, blocks: tops.map((t, i) => ({ ...t, x: 20 + (i % 3) * 330, y: 20 + Math.floor(i / 3) * 260 })) } });
const V = (name) => ({ name });
const getv = (name) => val(blk('variables_get', { VAR: V(name) }));
const setv = (name, value) => blk('variables_set', { VAR: V(name) }, { VALUE: value });
const change = (name, n) => blk('variables_change', { VAR: V(name) }, { VALUE: num(n) });
const icon = (name) => blk('basic_show_icon', { ICON: name });
const shownum = (value) => blk('basic_show_number', {}, { NUMBER: value });
const showstr = (s) => blk('basic_show_string', {}, { TEXT: txt(s) });
const onStart = (...b) => blk('basic_on_start', {}, { HANDLER: seq(...b) });
const forever = (...b) => blk('basic_forever', {}, { HANDLER: seq(...b) });
const onBtn = (btn, ...b) => blk('input_on_button', { BUTTON: btn }, { HANDLER: seq(...b) });
const onGesture = (g, ...b) => blk('input_on_gesture', { GESTURE: g }, { HANDLER: seq(...b) });
const random = (a, b) => val(blk('math_random', {}, { FROM: num(a), TO: num(b) }));
const cmp = (a, op, b) => val(blk('logic_compare', { OP: op }, { A: a, B: b }));
const sensor = (type) => val(blk(type));
const ifElse = (branches, elseBody) => {
  const inputs = {};
  branches.forEach(([cond, body], i) => { inputs['IF' + i] = cond; inputs['DO' + i] = seq(...body); });
  if (elseBody) inputs.ELSE = seq(...elseBody);
  return blk('controls_if', {}, inputs, { elseIfCount: branches.length - 1, hasElse: !!elseBody });
};
const arith = (a, op, b) => val(blk('math_arithmetic', { OP: op }, { A: a, B: b }));

// the reaction game (L8), used by two challenges
const reactionA = () => onBtn('A', setv('ready', num(0)), showstr('WAIT'), blk('basic_pause', {}, { PAUSE: random(1000, 4000) }), icon('Heart'), setv('start', sensor('input_running_time')), setv('ready', num(1)));

const SOLUTIONS = {
  'name-tag': [{ title: 'Name and picture', program: prog(onStart(showstr('Ana'), blk('basic_show_leds', { LEDS: '.#.#. ##### ##### .###. ..#..' }))) }],
  animation: [{ title: 'Beating heart', program: prog(forever(icon('Heart'), blk('basic_pause', {}, { PAUSE: ms(500) }), icon('SmallHeart'), blk('basic_pause', {}, { PAUSE: ms(500) }))) }],
  mood: [{ title: 'Three buttons', program: prog(onBtn('A', icon('Happy')), onBtn('B', icon('Sad')), onBtn('AB', icon('Surprised'))) }],
  gestures: [{ title: 'Three gestures', program: prog(onGesture('Shake', icon('Heart')), onGesture('LogoUp', icon('Happy')), onGesture('ScreenDown', icon('Sad'))) }],
  dice: [{ title: 'Dice', program: prog(onGesture('Shake', shownum(random(1, 6)))) }],
  rps: [{ title: 'if / else if / else', program: prog(onGesture('Shake', setv('choice', random(0, 2)), ifElse([[cmp(getv('choice'), 'EQ', num(0)), [icon('SmallSquare')]], [cmp(getv('choice'), 'EQ', num(1)), [icon('Square')]]], [icon('Scissors')]))) }],
  'rps-score': [{ title: 'Score', program: prog(onStart(setv('score', num(0))), onBtn('A', change('score', 1)), onBtn('B', shownum(getv('score')))) }],
  'sensor-station': [{ title: 'Three sensors', program: prog(onBtn('A', shownum(sensor('input_temperature'))), onBtn('B', shownum(sensor('input_light_level'))), onBtn('AB', shownum(sensor('input_compass')))) }],
  thermometer: [{ title: 'Forever', program: prog(forever(shownum(sensor('input_temperature')), showstr('C'), blk('basic_pause', {}, { PAUSE: ms(1000) }))) }],
  'step-counter': [{ title: 'Step counter', program: prog(onStart(setv('steps', num(0))), onGesture('Shake', change('steps', 1)), onBtn('A', shownum(getv('steps'))), onBtn('B', setv('steps', num(0)))) }],
  'progress-bar': [{ title: 'Bar graph', program: prog(onStart(setv('steps', num(0))), onGesture('Shake', change('steps', 1)), onBtn('A', shownum(getv('steps'))), onBtn('B', setv('steps', num(0))), forever(blk('led_bar_graph', {}, { VALUE: getv('steps'), HIGH: num(20) }))) }],
  'night-light': [{ title: 'if / else', program: prog(forever(ifElse([[cmp(sensor('input_light_level'), 'LT', num(50)), [blk('basic_show_leds', { LEDS: '##### ##### ##### ##### #####' })]]], [blk('basic_clear_screen')]))) }],
  'hot-cold': [{ title: 'if / else if / else', program: prog(forever(ifElse([[cmp(sensor('input_temperature'), 'GT', num(25)), [showstr('HOT')]], [cmp(sensor('input_temperature'), 'LT', num(15)), [showstr('COLD')]]], [showstr('OK')]))) }],
  reaction: [{ title: 'Reaction game', program: prog(onStart(setv('ready', num(0))), reactionA(),
    onBtn('B', ifElse([[cmp(getv('ready'), 'EQ', num(1)), [setv('ready', num(0)), shownum(arith(sensor('input_running_time'), 'MINUS', getv('start')))]]], [icon('Sad')]))) },
  { title: 'start set before the heart', program: prog(onStart(setv('ready', num(0))),
    onBtn('A', setv('ready', num(0)), showstr('WAIT'), blk('basic_pause', {}, { PAUSE: random(1000, 4000) }), setv('start', sensor('input_running_time')), setv('ready', num(1)), icon('Heart')),
    onBtn('B', ifElse([[cmp(getv('ready'), 'EQ', num(1)), [setv('ready', num(0)), shownum(arith(sensor('input_running_time'), 'MINUS', getv('start')))]]], [icon('Sad')]))) }],
  'best-score': [{ title: 'Best time', program: prog(onStart(setv('ready', num(0)), setv('best', num(10000))), reactionA(),
    onBtn('B', ifElse([[cmp(getv('ready'), 'EQ', num(1)), [setv('ready', num(0)), setv('time', arith(sensor('input_running_time'), 'MINUS', getv('start'))), shownum(getv('time')),
      ifElse([[cmp(getv('time'), 'LT', getv('best')), [setv('best', getv('time'))]]])]]], [icon('Sad')])),
    onBtn('AB', shownum(getv('best')))) }],
};

// Programs that must NOT pass (a criterion must fail): [challenge, title, program, criterion index that must fail]
const WRONG = [
  ['dice', 'pick random 0 to 6', prog(onGesture('Shake', shownum(random(0, 6)))), 1],
  ['mood', 'A shows the sad face', prog(onBtn('A', icon('Sad')), onBtn('B', icon('Sad')), onBtn('AB', icon('Surprised'))), 0],
  ['rps', 'only two pictures', prog(onGesture('Shake', setv('choice', random(0, 1)), ifElse([[cmp(getv('choice'), 'EQ', num(0)), [icon('SmallSquare')]]], [icon('Square')]))), 1],
  ['step-counter', 'no reset', prog(onStart(setv('steps', num(0))), onGesture('Shake', change('steps', 1)), onBtn('A', shownum(getv('steps')))), 2],
  ['night-light', 'reversed', prog(forever(ifElse([[cmp(sensor('input_light_level'), 'GT', num(50)), [blk('basic_show_leds', { LEDS: '##### ##### ##### ##### #####' })]]], [blk('basic_clear_screen')]))), 0],
  ['hot-cold', 'no COLD', prog(forever(ifElse([[cmp(sensor('input_temperature'), 'GT', num(25)), [showstr('HOT')]]], [showstr('OK')]))), 1],
  ['reaction', 'no too-early check', prog(reactionA(), onBtn('B', shownum(arith(sensor('input_running_time'), 'MINUS', getv('start'))))), 3],
  ['sensor-station', 'buttons swapped', prog(onBtn('B', shownum(sensor('input_temperature'))), onBtn('A', shownum(sensor('input_light_level'))), onBtn('AB', shownum(sensor('input_compass')))), 0],
];

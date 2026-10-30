// Tests of the block engine (blocks → code → micro:bit runtime). Uses the helpers of solutions_src.js.
'use strict';

const runProg = (program, seed = 1) => new Tester(programFromState(program), seed);
const fnDef = (name, params, ...body) => blk('function_definition', { NAME: name }, Object.assign({ HANDLER: seq(...body) }, Object.fromEntries(params.map((p) => ['P_' + p.name, val(blk('argument_reporter', { NAME: p.name }))]))), { params });
const call = (name, params, args) => blk('function_call', {}, Object.fromEntries(params.map((p, i) => ['A_' + p.name, args[i]])), { name, params });
const callOut = (name, params, args) => val(blk('function_call_output', {}, Object.fromEntries(params.map((p, i) => ['A_' + p.name, args[i]])), { name, params }));
const arg = (n) => val(blk('argument_reporter', { NAME: n }));

const ENGINE_TESTS = [
  ['show number 7 shows the digit for 750 ms', () => {
    const T = runProg(prog(onStart(shownum(num(7)), icon('Heart'))));
    T.wait(700);
    if (T.screen() !== patternKey(FONT_PATTERN('7'))) return 'digit not on screen';
    T.wait(100);
    return T.screen() === patternKey(ICONS.Heart) || 'heart not shown after 750 ms';
  }],
  ['show string "Hi" scrolls in about 2.5 s', () => {
    const T = runProg(prog(onStart(showstr('Hi'), icon('Heart'))));
    T.wait(2400);
    if (T.screen() === patternKey(ICONS.Heart)) return 'too fast';
    T.wait(300);
    return T.screen() === patternKey(ICONS.Heart) || 'too slow';
  }],
  ['7 / 2 shows 3.5', () => runProg(prog(onStart(shownum(arith(num(7), 'DIVIDE', num(2)))))).wait(4000).numbers().includes(3.5) || 'no 3.5'],
  ['forever runs while on start pauses', () => {
    const T = runProg(prog(onStart(setv('n', num(0)), blk('basic_pause', {}, { PAUSE: ms(1000) })), forever(change('n', 1), blk('basic_pause', {}, { PAUSE: ms(100) }))));
    T.wait(1000);
    return T.mb.V.n >= 7 || 'n = ' + T.mb.V.n;
  }],
  ['A+B fires only the A+B event', () => {
    const T = runProg(prog(onStart(setv('a', num(0)), setv('ab', num(0))), onBtn('A', change('a', 1)), onBtn('AB', change('ab', 1))));
    T.wait(100);
    T.mb.buttonDown('A'); T.mb.buttonDown('B'); T.mb.buttonUp('A'); T.mb.buttonUp('B');
    T.wait(100);
    return (T.mb.V.a === 0 && T.mb.V.ab === 1) || `a=${T.mb.V.a} ab=${T.mb.V.ab}`;
  }],
  ['an event that arrives while its handler runs waits for it', () => {
    const T = runProg(prog(onStart(setv('n', num(0))), onBtn('A', change('n', 1), blk('basic_pause', {}, { PAUSE: ms(500) }))));
    T.wait(50); T.click('A'); T.click('A'); T.wait(200);
    if (T.mb.V.n !== 1) return 'second click ran at once';
    T.wait(500);
    return T.mb.V.n === 2 || 'second click lost';
  }],
  ['an endless loop without pause does not freeze the simulator', () => {
    const T = runProg(prog(onStart(blk('loops_while', {}, { COND: { shadow: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } })), forever(change('n', 1), blk('basic_pause', {}, { PAUSE: ms(100) }))));
    const t = performance.now();
    T.wait(1000);
    return (performance.now() - t < 3000 && T.mb.V.n > 3) || 'n = ' + T.mb.V.n;
  }],
  ['functions with a parameter and a return value', () => {
    const P = [{ name: 'x', type: 'number' }];
    const T = runProg(prog(fnDef('double', P, blk('function_return', {}, { VALUE: arith(arg('x'), 'MULTIPLY', num(2)) })), onStart(shownum(callOut('double', P, [num(21)])))));
    return T.wait(4000).numbers().includes(42) || 'no 42';
  }],
  ['a function called as a statement', () => {
    const P = [{ name: 'n', type: 'number' }];
    const T = runProg(prog(fnDef('add', P, change('total', 0), setv('total', arith(getv('total'), 'ADD', arg('n')))), onStart(setv('total', num(1)), call('add', P, [num(4)]), call('add', P, [num(5)]))));
    return T.wait(100).mb.V.total === 10 || 'total = ' + T.mb.V.total;
  }],
  ['radio: the second micro:bit receives the number', () => {
    const program = programFromState(prog(onStart(blk('radio_set_group', {}, { GROUP: num(7) })), onBtn('A', blk('radio_send_number', {}, { VALUE: num(42) })),
      blk('radio_on_number', {}, { P_receivedNumber: val(blk('argument_reporter', { NAME: 'receivedNumber' })), HANDLER: seq(shownum(arg('receivedNumber'))) })));
    const bus = new RadioBus();
    const a = new Microbit({ id: 0, bus }), b = new Microbit({ id: 1, bus });
    a.load(program.code); b.load(program.code);
    a.advance(100, 1e9); b.advance(100, 1e9);
    a.click('A');
    a.advance(100, 1e9); b.advance(3000, 1e9);
    return b.log.some((e) => e.kind === 'number' && e.value === 42) || 'nothing received';
  }],
  ['plot bar graph lights the bottom rows first', () => {
    const T = runProg(prog(onStart(blk('led_bar_graph', {}, { VALUE: num(5), HIGH: num(20) }))));
    T.wait(100);
    const s = T.screen();
    return (s.slice(20).includes('1') && !s.slice(0, 5).includes('1')) || s;
  }],
  ['arrays: add, length and get', () => {
    const list = val(blk('lists_create_with', {}, { ADD0: num(3), ADD1: num(5) }, { itemCount: 2 }));
    const T = runProg(prog(onStart(setv('list', list), blk('lists_push', {}, { VALUE: num(9), LIST: getv('list') }),
      shownum(val(blk('lists_length', {}, { LIST: getv('list') }))), shownum(val(blk('lists_get', {}, { LIST: getv('list'), INDEX: num(2) }))))));
    const n = T.wait(3000).numbers();
    return (n[0] === 3 && n[1] === 9) || JSON.stringify(n);
  }],
  ['text join and compare', () => {
    const j = val(blk('text_join', {}, { ADD0: txt('Hi '), ADD1: val(blk('math_number', { NUM: 5 })) }, { itemCount: 2 }));
    return runProg(prog(onStart(blk('basic_show_string', {}, { TEXT: j })))).wait(6000).texts().includes('Hi 5') || 'no "Hi 5"';
  }],
  ['game: a sprite moves and bounces', () => {
    const T = runProg(prog(onStart(setv('sprite', val(blk('game_create_sprite', {}, { X: num(0), Y: num(2) })))), forever(blk('game_move', {}, { SPRITE: getv('sprite'), N: num(1) }), blk('game_bounce', {}, { SPRITE: getv('sprite') }), blk('basic_pause', {}, { PAUSE: ms(100) }))));
    T.wait(450);
    const x1 = T.mb.sprites[0].x;
    T.wait(1000);
    return (x1 >= 3 && T.mb.sprites[0].x < 4) || `x ${x1} then ${T.mb.sprites[0].x}`;
  }],
  ['a crash shows the sad face and stops the program', () => {
    const T = runProg(prog(onStart(blk('lists_push', {}, { VALUE: num(1), LIST: getv('nolist') }))));
    T.wait(100);
    return (!!T.mb.error && T.screen() === patternKey(ICONS.Sad)) || 'error: ' + T.mb.error;
  }],
  ['loose blocks do not run', () => runProg(prog(icon('Heart'))).wait(1000).images().length === 0 || 'the loose block ran'],
  ['the JavaScript view writes MakeCode code', () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(SOLUTIONS.rps[0].program, ws);
    const ts = generateTs(ws);
    ws.dispose();
    return (/input\.onGesture\(Gesture\.Shake, function \(\) \{/.test(ts) && /randint\(0, 2\)/.test(ts) && /else if \(choice == 1\)/.test(ts)) || ts;
  }],
];
function FONT_PATTERN(ch) { return glyph(ch).map((r) => r.map((on) => (on ? '#' : '.')).join('')).join(' '); }

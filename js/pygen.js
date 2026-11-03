// Blocks → MicroPython for the real micro:bit (download). The program runs on lib/microbit/mbrt.py:
// every block stack is a generator, "yield ms" is a pause that lets the other blocks run, like in MakeCode.
'use strict';

const pq = (v) => JSON.stringify(String(v));
const PY_GESTURE = { Shake: 'shake', LogoUp: 'up', LogoDown: 'down', ScreenUp: 'face up', ScreenDown: 'face down', TiltLeft: 'left', TiltRight: 'right', FreeFall: 'freefall', ThreeG: '3g', SixG: '6g', EightG: '8g' };
const pyImage = (pattern) => `Image(${pq(String(pattern).trim().split(/\s+/).map((r) => r.split('').map((c) => (c === '#' ? '9' : '0')).join('')).join(':'))})`;
const SFX_NOTES = { giggle: 'c5:1 e g e c', happy: 'c5:1 e g c6:2', hello: 'g4:1 c5:2', mysterious: 'a3:2 e4 a#3 f4', sad: 'g4:2 e c', slide: 'c4:1 d e f g a b c5', soaring: 'c5:1 e g c6 e g', spring: 'c4:1 g c5 g4 c5', twinkle: 'c6:1 g5 c6 g5', yawn: 'g4:4 e c' };
const pyNotes = (list) => `[${list.map((n) => `(${Math.round(n.freq)}, ${n.beats})`).join(', ')}]`;

class PyGen {
  constructor() { this.n = 0; this.unsupported = new Set(); this.radio = false; this.fnNames = {}; }
  uid() { return ++this.n; }
  field(b, n) { const f = b.getField(n); return f ? f.getValue() : ''; }
  varName(b) { const f = b.getField('VAR'); const v = f && f.getVariable ? f.getVariable() : null; return v ? v.name : 'item'; }
  v(b) { return `V[${pq(this.varName(b))}]`; }
  fn(name) { if (!this.fnNames[name]) this.fnNames[name] = 'f' + (Object.keys(this.fnNames).length + 1) + '_' + String(name).replace(/\W/g, '_'); return this.fnNames[name]; }
  val(b, name, def = '0') {
    const t = b.getInputTargetBlock(name);
    return t && t.isEnabled() ? this.expr(t) : def;
  }

  // ---------- values ----------
  expr(b) {
    const V = (n, d) => this.val(b, n, d);
    const F = (n) => this.field(b, n);
    switch (b.type) {
      case 'math_number': { const n = Number(F('NUM')); return isFinite(n) ? String(n) : '0'; }
      case 'text': return pq(F('TEXT'));
      case 'logic_boolean': return F('BOOL') === 'TRUE' ? 'True' : 'False';
      case 'timePicker': case 'timePickerEvery': return String(Number(F('MS')) || 0);
      case 'music_note': return String(Number(F('NOTE')) || 0);
      case 'music_beat': return String(BEAT_VALUE[F('BEAT')] || 1);
      case 'variables_get': return this.v(b);
      case 'argument_reporter': return `A[${pq(F('NAME'))}]`;
      case 'input_button_is_pressed': return `button(${pq(F('BUTTON'))})`;
      case 'input_pin_is_pressed': return `pin_pressed(${pq(F('PIN'))})`;
      case 'input_acceleration': return `accel(${pq(F('DIM'))})`;
      case 'input_logo_is_pressed': return 'logo_pressed()';
      case 'input_light_level': return 'display.read_light_level()';
      case 'input_compass': return 'compass.heading()';
      case 'input_temperature': return 'temperature()';
      case 'input_is_gesture': return `gesture(${pq(PY_GESTURE[F('GESTURE')])})`;
      case 'input_sound_level': return 'sound_level()';
      case 'input_magnetic': return `magnetic(${pq(F('DIM'))})`;
      case 'input_rotation': return `rotation(${pq(F('KIND'))})`;
      case 'input_running_time': case 'control_millis': return 'running_time()';
      case 'input_running_time_micros': return '(running_time() * 1000)';
      case 'led_point': return `point(${V('X')}, ${V('Y')})`;
      case 'led_point_brightness': return `brightness_at(${V('X')}, ${V('Y')})`;
      case 'led_brightness': return '255';
      case 'music_volume': return 'volume()';
      case 'music_tempo': return 'tempo()';
      case 'radio_packet': return `packet(${pq(F('PROP'))})`;
      case 'logic_compare': return `cmp(${V('A')}, ${pq(F('OP'))}, ${V('B')})`;
      case 'logic_operation': return `(${V('A', 'False')} ${F('OP') === 'AND' ? 'and' : 'or'} ${V('B', 'False')})`;
      case 'logic_negate': return `(not ${V('BOOL', 'False')})`;
      case 'math_arithmetic': {
        const a = `num(${V('A')})`, c = `num(${V('B')})`;
        return { MINUS: `(${a} - ${c})`, MULTIPLY: `(${a} * ${c})`, DIVIDE: `div(${a}, ${c})` }[F('OP')] || `(${a} + ${c})`;
      }
      case 'math_remainder': return `mod(${V('A')}, ${V('B')})`;
      case 'math_minmax': return `${F('OP')}(num(${V('A')}), num(${V('B')}))`;
      case 'math_abs': return `abs(num(${V('X')}))`;
      case 'math_op': return `mathop(${pq(F('OP'))}, ${V('X')})`;
      case 'math_round': return `rnd(${pq(F('OP'))}, ${V('X')})`;
      case 'math_random': return `rand(${V('FROM')}, ${V('TO')})`;
      case 'math_map': return `mapv(${V('VALUE')}, ${V('FL')}, ${V('FH')}, ${V('TL')}, ${V('TH')})`;
      case 'math_constrain': return `constrain(${V('VALUE')}, ${V('LO')}, ${V('HI')})`;
      case 'math_random_bool': return '(random.randint(0, 1) == 1)';
      case 'lists_create_with': case 'lists_create_with_text': {
        const items = [];
        for (let i = 0; i < (b.itemCount || 0); i++) items.push(V('ADD' + i));
        return `[${items.join(', ')}]`;
      }
      case 'lists_empty': return '[]';
      case 'lists_length': return `len(lst(${V('LIST', '[]')}))`;
      case 'lists_get': return `get(${V('LIST', '[]')}, ${V('INDEX')})`;
      case 'lists_find': return `find(${V('LIST', '[]')}, ${V('VALUE')})`;
      case 'lists_pop': return `lst(${V('LIST', '[]')}).pop()`;
      case 'lists_remove_at': return `lst(${V('LIST', '[]')}).pop(int(num(${V('INDEX')})))`;
      case 'text_length': return `len(s(${V('VALUE', '""')}))`;
      case 'text_join': {
        const items = [];
        for (let i = 0; i < (b.itemCount || 0); i++) items.push(`s(${V('ADD' + i, '""')})`);
        return items.length ? `(${items.join(' + ')})` : '""';
      }
      case 'text_compare': return `((s(${V('A', '""')}) > s(${V('B', '""')})) - (s(${V('A', '""')}) < s(${V('B', '""')})))`;
      case 'text_parse': return `parse(${V('TEXT', '""')})`;
      case 'text_char_at': return `s(${V('TEXT', '""')})[int(num(${V('AT')})):int(num(${V('AT')})) + 1]`;
      case 'text_substr': return `s(${V('TEXT', '""')})[int(num(${V('FROM')})):int(num(${V('FROM')})) + int(num(${V('LEN')}))]`;
      case 'text_includes': return `(s(${V('FIND', '""')}) in s(${V('TEXT', '""')}))`;
      case 'text_convert': return `s(${V('VALUE')})`;
      case 'text_from_code': return `chr(int(num(${V('CODE')})))`;
      case 'images_create': case 'images_create_big': return pyImage(F('LEDS'));
      case 'images_arrow': return pyImage(ARROWS[F('DIR')]);
      case 'images_icon': return pyImage(ICONS[F('ICON')]);
      case 'pins_digital_read': return `${F('PIN').toLowerCase().replace('p', 'pin')}.read_digital()`;
      case 'pins_analog_read': return `${F('PIN').toLowerCase().replace('p', 'pin')}.read_analog()`;
      case 'control_device_name': return '"microbit"';
      case 'control_serial_number': return '0';
      case 'function_call_output': return `(yield from ${this.call(b)})`;
      default: this.unsupported.add(b.type); return '0';
    }
  }
  call(b) {
    const args = (b.mbParams || []).map((p) => this.val(b, 'A_' + p.name, p.type === 'text' ? '""' : p.type === 'boolean' ? 'False' : '0'));
    return `${this.fn(b.mbName)}(${args.join(', ')})`;
  }

  // ---------- statements: lists of lines ----------
  body(b, name) {
    const out = [];
    let s = b.getInputTargetBlock(name);
    while (s) {
      if (s.isEnabled()) out.push(...this.stmt(s));
      s = s.getNextBlock();
    }
    return out;
  }
  ind(lines) { return (lines.length ? lines : ['pass']).map((l) => '    ' + l); }
  stmt(b) {
    const V = (n, d) => this.val(b, n, d);
    const F = (n) => this.field(b, n);
    switch (b.type) {
      case 'basic_show_number': return [`yield from show_number(${V('NUMBER')})`];
      case 'basic_show_leds': return [`yield from show_image(${pyImage(F('LEDS'))}, 400)`];
      case 'basic_show_icon': return [`yield from show_image(${pyImage(ICONS[F('ICON')])}, 600)`];
      case 'basic_show_arrow': return [`yield from show_image(${pyImage(ARROWS[F('DIR')])}, 600)`];
      case 'basic_show_string': return [`yield from show_string(${V('TEXT', '""')})`];
      case 'basic_clear_screen': return ['display.clear()'];
      case 'basic_pause': return [`yield num(${V('PAUSE')})`];
      case 'input_calibrate': return ['compass.calibrate()'];
      case 'input_accel_range': case 'input_sound_threshold': case 'led_set_brightness': case 'led_display_mode':
      case 'radio_set_serial': case 'radio_set_band': return [];
      case 'led_plot': return [`plot(${V('X')}, ${V('Y')})`];
      case 'led_unplot': return [`unplot(${V('X')}, ${V('Y')})`];
      case 'led_toggle': return [`toggle(${V('X')}, ${V('Y')})`];
      case 'led_plot_brightness': return [`plot(${V('X')}, ${V('Y')}, ${V('B')})`];
      case 'led_bar_graph': return [`bar_graph(${V('VALUE')}, ${V('HIGH')})`];
      case 'led_enable': return [`display.on() if ${V('ON', 'False')} else display.off()`];
      case 'led_stop_animation': return ['display.clear()'];
      case 'music_play': {
        const sb = b.getInputTargetBlock('SOUND');
        const mode = pq(F('MODE'));
        if (!sb) return [];
        if (sb.type === 'music_tone_playable') return [`yield from tone(${this.val(sb, 'NOTE', '262')}, beat(${this.val(sb, 'DURATION', '1')}), ${mode})`];
        if (sb.type === 'music_melody_playable') return [`yield from melody(${pyNotes(melodyToNotes(sb.getFieldValue('MELODY')))}, ${this.val(sb, 'TEMPO', '120')}, ${mode})`];
        return [`yield from melody(${pyNotes(parseMelody(SFX_NOTES[sb.getFieldValue('SOUND')] || SFX_NOTES.hello))}, 240, ${mode})`];
      }
      case 'music_ring_tone': return [`ring(${V('NOTE')})`];
      case 'music_rest': return [`yield from rest(beat(${V('BEAT', '1')}))`];
      case 'music_set_volume': return [`set_volume(${V('VOLUME')})`];
      case 'music_stop_all': return ['stop_sounds()'];
      case 'music_change_tempo': return [`set_tempo(tempo() + num(${V('BPM')}))`];
      case 'music_set_tempo': return [`set_tempo(${V('BPM')})`];
      case 'music_start_melody': return [`yield from melody(${pyNotes(parseMelody(MELODIES[F('MELODY')] || ''))}, tempo(), ${pq(F('REPEAT'))})`];
      case 'radio_set_group': this.radio = true; return [`radio_group(${V('GROUP')})`];
      case 'radio_set_power': this.radio = true; return [`radio_power(${V('POWER')})`];
      case 'radio_send_number': this.radio = true; return [`radio_send("n" + s(num(${V('VALUE')})))`];
      case 'radio_send_string': this.radio = true; return [`radio_send("s" + s(${V('VALUE', '""')})[:19])`];
      case 'radio_send_value': this.radio = true; return [`radio_send("v" + s(${V('NAME', '""')})[:8] + "\\t" + s(num(${V('VALUE')})))`];
      case 'loops_repeat': { const i = this.uid(); return [`for _i${i} in range(int(num(${V('TIMES')}))):`, ...this.ind(['yield 0', ...this.body(b, 'HANDLER')])]; }
      case 'loops_while': return [`while ${V('COND', 'False')}:`, ...this.ind(['yield 0', ...this.body(b, 'HANDLER')])];
      case 'loops_for': { const k = this.uid(); return [`for _k${k} in range(int(num(${V('TO')})) + 1):`, ...this.ind([`${this.v(b)} = _k${k}`, 'yield 0', ...this.body(b, 'HANDLER')])]; }
      case 'loops_for_of': { const i = this.uid(); return [`for _e${i} in list(lst(${V('LIST', '[]')})):`, ...this.ind([`${this.v(b)} = _e${i}`, 'yield 0', ...this.body(b, 'HANDLER')])]; }
      case 'loops_break': return ['break'];
      case 'loops_continue': return ['continue'];
      case 'controls_if': {
        const out = [`if ${this.val(b, 'IF0', 'False')}:`, ...this.ind(this.body(b, 'DO0'))];
        for (let i = 1; i <= (b.elseifCount || 0); i++) out.push(`elif ${this.val(b, 'IF' + i, 'False')}:`, ...this.ind(this.body(b, 'DO' + i)));
        if (b.elseCount) out.push('else:', ...this.ind(this.body(b, 'ELSE')));
        return out;
      }
      case 'variables_set': return [`${this.v(b)} = ${V('VALUE')}`];
      case 'variables_change': return [`${this.v(b)} = num(${this.v(b)}) + num(${V('VALUE')})`];
      case 'lists_set': return [`put(${V('LIST', '[]')}, ${V('INDEX')}, ${V('VALUE')})`];
      case 'lists_push': return [`lst(${V('LIST', '[]')}).append(${V('VALUE')})`];
      case 'lists_insert': return [`lst(${V('LIST', '[]')}).insert(int(num(${V('INDEX')})), ${V('VALUE')})`];
      case 'lists_reverse': return [`lst(${V('LIST', '[]')}).reverse()`];
      case 'images_show': return [`yield from show_offset(${V('IMAGE', 'Image()')}, ${V('OFFSET')})`];
      case 'images_scroll': return [`yield from scroll_image(${V('IMAGE', 'Image()')}, ${V('OFFSET', '1')}, ${V('MS', '200')})`];
      case 'pins_digital_write': return [`${F('PIN').toLowerCase().replace('p', 'pin')}.write_digital(1 if num(${V('VALUE')}) else 0)`];
      case 'pins_analog_write': return [`${F('PIN').toLowerCase().replace('p', 'pin')}.write_analog(int(constrain(${V('VALUE')}, 0, 1023)))`];
      case 'pins_servo_write': return [`${F('PIN').toLowerCase().replace('p', 'pin')}.write_analog(int(26 + constrain(${V('VALUE')}, 0, 180) / 180 * 102))`];
      case 'serial_write_line': return [`print(s(${V('TEXT', '""')}))`];
      case 'serial_write_number': return [`print(s(num(${V('VALUE')})), end="")`];
      case 'serial_write_string': return [`print(s(${V('TEXT', '""')}), end="")`];
      case 'serial_write_value': return [`print(s(${V('NAME', '""')}) + ":" + s(num(${V('VALUE')})))`];
      case 'serial_write_numbers': return [`print(",".join(s(num(x)) for x in lst(${V('LIST', '[]')})))`];
      case 'control_background': { const h = 'bg' + this.uid(); return [`def ${h}():`, ...this.ind(['yield 0', ...this.body(b, 'HANDLER')]), `background(${h})`]; }
      case 'control_reset': return ['reset()'];
      case 'control_wait_micros': return ['yield 0'];
      case 'control_raise_event': return [`fire("e:" + s(num(${V('SRC')})) + ":" + s(num(${V('VAL')})))`];
      case 'function_call': return [`yield from ${this.call(b)}`];
      case 'function_return': return [`return ${V('VALUE')}`];
      default: this.unsupported.add(b.type); return [];
    }
  }

  // ---------- event blocks ----------
  hat(b) {
    const h = 'h' + this.uid();
    const F = (n) => this.field(b, n);
    const def = (params = []) => [`def ${h}(${params.join(', ')}):`, ...this.ind([...(params.length ? [`A = {${params.map((p) => `${pq(p)}: ${p}`).join(', ')}}`] : []), 'yield 0', ...this.body(b, 'HANDLER')])];
    switch (b.type) {
      case 'basic_on_start': return [...def(), `start(${h})`];
      case 'basic_forever': return [...def(), `forever(${h})`];
      case 'loops_every': return [...def(), `every(num(${this.val(b, 'MS', '500')}), ${h})`];
      case 'input_on_button': return [...def(), `on("b:${F('BUTTON')}", ${h})`];
      case 'input_on_gesture': return [...def(), `on(${pq('g:' + PY_GESTURE[F('GESTURE')])}, ${h})`];
      case 'input_on_pin': return [...def(), `on("p:${F('PIN')}:pressed", ${h})`];
      case 'input_on_pin_released': return [...def(), `on("p:${F('PIN')}:up", ${h})`];
      case 'input_on_logo': return [...def(), `on("logo:${F('EVENT')}", ${h})`];
      case 'input_on_sound': return [...def(), `on("s:${F('LEVEL')}", ${h})`];
      case 'radio_on_number': this.radio = true; return [...def(['receivedNumber']), `on("r:number", ${h})`];
      case 'radio_on_string': this.radio = true; return [...def(['receivedString']), `on("r:string", ${h})`];
      case 'radio_on_value': this.radio = true; return [...def(['name', 'value']), `on("r:value", ${h})`];
      case 'control_on_event': return [...def(), `on("e:" + s(num(${this.val(b, 'SRC')})) + ":" + s(num(${this.val(b, 'VAL')})), ${h})`];
      case 'function_definition': {
        const params = (b.mbParams || []).map((p) => p.name.replace(/\W/g, '_'));
        const names = (b.mbParams || []).map((p) => p.name);
        return [`def ${this.fn(F('NAME'))}(${params.join(', ')}):`, ...this.ind([`A = {${names.map((p, i) => `${pq(p)}: ${params[i]}`).join(', ')}}`, 'yield 0', ...this.body(b, 'HANDLER')])];
      }
      default: this.unsupported.add(b.type); return [];
    }
  }
}

// The MicroPython program of a workspace: { main, unsupported: [block texts] }
function generatePython(ws) {
  const g = new PyGen();
  const tops = runnableTops(ws);
  const fns = tops.filter((b) => b.type === 'function_definition').flatMap((b) => g.hat(b));
  const rest = tops.filter((b) => b.type !== 'function_definition').flatMap((b) => g.hat(b));
  const vars = initialVariables(ws);
  const lines = ['# Made with the micro:bit Simulator (blocks). Runs on mbrt.py.', 'from mbrt import *'];
  if (g.radio) lines.push('use_radio()');
  lines.push(`V.update({${Object.entries(vars).map(([k, v]) => `${pq(k)}: ${Array.isArray(v) ? '[]' : '0'}`).join(', ')}})`, 'A = {}', '', ...fns, ...rest, '', 'run()', '');
  const unsupported = [...g.unsupported].map((t) => blockSearchText(t) || t);
  return { main: lines.join('\n'), unsupported };
}

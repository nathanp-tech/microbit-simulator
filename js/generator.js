// Blocks → code. Two outputs: the JavaScript run by the simulator (js/runtime.js, generator functions that
// give the hand back on pause / show…) and the MakeCode-style JavaScript shown in the "JavaScript" view.
'use strict';

const q = JSON.stringify;
const BEAT_VALUE = Object.fromEntries(BEATS);
// {HANDLER} statements, %NAME value, $NAME field, @NAME field as a JS string
const TEMPLATE_RE = /\{(\w+)(\*?)\}|%([A-Z_0-9]+)|\$([A-Z_0-9]+)|@([A-Z_0-9]+)/g;

class CodeGen {
  constructor(lang) { this.lang = lang; this.ids = 0; }

  // ---------- helpers ----------
  field(b, name) { const f = b.getField(name); return f ? f.getValue() : ''; }
  varName(b, name = 'VAR') { const f = b.getField(name); const v = f && f.getVariable ? f.getVariable() : null; return v ? v.name : f ? f.getText() : 'item'; }
  varRef(b, name = 'VAR') { return `V[${q(this.varName(b, name))}]`; }
  tsVar(b, name = 'VAR') { return tsIdent(this.varName(b, name)); }
  uid() { return ++this.ids; }

  // value of an input; def: when nothing is plugged
  value(b, name, def = '0') {
    const t = b.getInputTargetBlock(name);
    if (!t || !t.isEnabled()) return def;
    return this.expr(t);
  }
  expr(b) {
    switch (b.type) {
      case 'math_number': { const n = Number(b.getFieldValue('NUM')); return isFinite(n) ? (n < 0 ? `(${n})` : String(n)) : '0'; }
      case 'text': return q(b.getFieldValue('TEXT'));
      case 'logic_boolean': return b.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false';
      case 'timePicker': case 'timePickerEvery': return String(Number(b.getFieldValue('MS')) || 0);
      case 'music_note': return String(Number(b.getFieldValue('NOTE')) || 0);
      case 'music_beat': return String(BEAT_VALUE[b.getFieldValue('BEAT')] || 1);
      default: break;
    }
    const spec = SPECS[b.type];
    if (!spec || !spec.js) return '0';
    return this.template(b, spec.js);
  }
  template(b, t) {
    if (typeof t === 'function') return t(b, this);
    // one pass: the code put in place is never read again (block ids can contain % $ @)
    return t.replace(TEMPLATE_RE, (m, st, star, v, f, jf) => (st ? this.statements(b, st) : v ? this.value(b, v, defaultFor(b, v)) : f ? String(this.field(b, f)) : q(this.field(b, jf))));
  }
  // statements of an input (or a chain starting at a block)
  statements(b, name) {
    let s = name ? b.getInputTargetBlock(name) : b;
    let out = '';
    while (s) {
      if (s.isEnabled()) out += this.stmt(s);
      s = s.getNextBlock();
    }
    return out;
  }
  stmt(b) {
    const spec = SPECS[b.type];
    if (!spec || !spec.js) return '';
    return `R.b(F, ${q(b.id)});\n` + this.template(b, spec.js) + '\n';
  }

  // ---------- special blocks ----------
  playable(b) {
    const s = b.getInputTargetBlock('SOUND');
    const mode = q(b.getFieldValue('MODE'));
    if (!s) return '';
    if (s.type === 'music_tone_playable') return `yield* R.playTone(F, ${this.value(s, 'NOTE', '262')}, R.beatMs(${this.value(s, 'DURATION', '1')}), ${mode});`;
    if (s.type === 'music_melody_playable') return `yield* R.playMelody(F, ${q(melodyToNotes(s.getFieldValue('MELODY')))}, ${this.value(s, 'TEMPO', '120')}, ${mode});`;
    if (s.type === 'music_sound_playable') return `yield* R.playSoundEffect(F, ${q(s.getFieldValue('SOUND'))}, ${mode});`;
    return '';
  }
  repeat(b) {
    const i = this.uid();
    return `for (let i${i} = 0, n${i} = R.num(${this.value(b, 'TIMES', '0')}); i${i} < n${i}; i${i}++) {\nif (R.spinCheck(F)) yield 1;\n${this.statements(b, 'HANDLER')}}`;
  }
  forRange(b) {
    const v = this.varRef(b);
    return `for (${v} = 0; ${v} <= R.num(${this.value(b, 'TO', '0')}); ${v} = R.num(${v}) + 1) {\nif (R.spinCheck(F)) yield 1;\n${this.statements(b, 'HANDLER')}}`;
  }
  forOf(b) {
    const i = this.uid();
    return `for (const e${i} of R.arr(${this.value(b, 'LIST', '[]')}).slice()) {\n${this.varRef(b)} = e${i};\nif (R.spinCheck(F)) yield 1;\n${this.statements(b, 'HANDLER')}}`;
  }
  ifBlock(b) {
    let out = `if (${this.value(b, 'IF0', 'false')}) {\n${this.statements(b, 'DO0')}}`;
    for (let i = 1; i <= (b.elseifCount || 0); i++) out += ` else if (${this.value(b, 'IF' + i, 'false')}) {\n${this.statements(b, 'DO' + i)}}`;
    if (b.elseCount) out += ` else {\n${this.statements(b, 'ELSE')}}`;
    return out;
  }
  compare(b) { return `R.cmp(${this.value(b, 'A')}, ${q(b.getFieldValue('OP'))}, ${this.value(b, 'B')})`; }
  arith(b) {
    const a = `R.num(${this.value(b, 'A')})`, c = `R.num(${this.value(b, 'B')})`;
    switch (b.getFieldValue('OP')) {
      case 'MINUS': return `(${a} - ${c})`;
      case 'MULTIPLY': return `(${a} * ${c})`;
      case 'DIVIDE': return `R.div(${a}, ${c})`;
      default: return `(${a} + ${c})`;
    }
  }
  mathOp(b) {
    const x = `R.num(${this.value(b, 'X')})`;
    const op = b.getFieldValue('OP');
    if (op === 'idiv') return `Math.trunc(${x})`;
    if (op === 'imul') return `Math.trunc(${x})`;
    if (op === 'atan2') return `Math.atan(${x})`;
    return `Math.${op}(${x})`;
  }
  listItems(b) { const out = []; for (let i = 0; i < (b.itemCount || 0); i++) out.push(this.value(b, 'ADD' + i, '0')); return out; }
  funcDef(b) {
    const params = (b.mbParams || []).map((p) => p.name);
    return `R.fn[${q(b.getFieldValue('NAME'))}] = function* (F, ...args) {\nconst A = {${params.map((p, i) => `${q(p)}: args[${i}]`).join(', ')}};\n${this.statements(b, 'HANDLER')}};`;
  }
  funcCall(b) {
    const args = (b.mbParams || []).map((p) => this.value(b, 'A_' + p.name, p.type === 'text' ? '""' : p.type === 'boolean' ? 'false' : '0'));
    return `R.call(F, ${q(b.mbName)}${args.map((a) => ', ' + a).join('')})`;
  }

  // ---------- MakeCode-style JavaScript (view only) ----------
  tsValue(b, name) {
    const t = b.getInputTargetBlock(name);
    if (!t) return defaultFor(b, name) === '""' ? '""' : defaultFor(b, name) === 'false' ? 'false' : '0';
    return this.tsExpr(t);
  }
  tsExpr(b) {
    switch (b.type) {
      case 'math_number': return String(Number(b.getFieldValue('NUM')) || 0);
      case 'text': return q(b.getFieldValue('TEXT'));
      case 'logic_boolean': return b.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false';
      case 'timePicker': case 'timePickerEvery': return String(b.getFieldValue('MS'));
      case 'music_note': return `Note.${noteLabel(b.getFieldValue('NOTE')).replace(/^(Middle|Low|High) /, (m, p) => (p === 'Middle' ? '' : '')).replace('#', 'Sharp')}${/^Low/.test(noteLabel(b.getFieldValue('NOTE'))) ? '3' : /^High/.test(noteLabel(b.getFieldValue('NOTE'))) ? '5' : ''}`;
      case 'music_beat': return `music.beat(BeatFraction.${{ '1': 'Whole', '1/2': 'Half', '1/4': 'Quarter', '1/8': 'Eighth', '1/16': 'Sixteenth', 2: 'Double', 4: 'Breve' }[b.getFieldValue('BEAT')]})`;
      default: break;
    }
    const spec = SPECS[b.type];
    if (!spec || !spec.ts) return '0';
    return this.tsTemplate(b, spec.ts);
  }
  tsTemplate(b, t) {
    if (typeof t === 'function') return t(b, this);
    return t.replace(TEMPLATE_RE, (m, st, star, v, f, jf) => (st ? (star ? this.tsStatements(b, st, 0) : this.tsStatements(b, st)) : v ? this.tsValue(b, v) : f ? tsEnum(this.field(b, f)) : q(this.field(b, jf))));
  }
  tsStatements(b, name, indent = 1) {
    let s = name ? b.getInputTargetBlock(name) : b;
    let out = '';
    while (s) {
      if (s.isEnabled()) {
        const spec = SPECS[s.type];
        if (spec && spec.ts) {
          const code = this.tsTemplate(s, spec.ts);
          const block = /[{}]\s*$/.test(code) || /^(if|for|while)\b/.test(code);
          out += code.split('\n').map((l) => '    '.repeat(indent) + l).join('\n') + (block ? '' : '') + '\n';
        }
      }
      s = s.getNextBlock();
    }
    return out;
  }
  tsPlayable(b) {
    const s = b.getInputTargetBlock('SOUND');
    const mode = { until: 'music.PlaybackMode.UntilDone', background: 'music.PlaybackMode.InBackground', loop: 'music.PlaybackMode.LoopingInBackground' }[b.getFieldValue('MODE')];
    if (!s) return '';
    if (s.type === 'music_tone_playable') return `music.play(music.tonePlayable(${this.tsValue(s, 'NOTE')}, ${this.tsValue(s, 'DURATION')}), ${mode})`;
    if (s.type === 'music_melody_playable') return `music.play(music.stringPlayable(${q(s.getFieldValue('MELODY'))}, ${this.tsValue(s, 'TEMPO')}), ${mode})`;
    return `music.play(music.builtinPlayableSoundEffect(soundExpression.${s.getFieldValue('SOUND')}), ${mode})`;
  }
  tsIf(b) {
    let out = `if (${this.tsValue(b, 'IF0')}) {\n${this.tsStatements(b, 'DO0')}}`;
    for (let i = 1; i <= (b.elseifCount || 0); i++) out += ` else if (${this.tsValue(b, 'IF' + i)}) {\n${this.tsStatements(b, 'DO' + i)}}`;
    if (b.elseCount) out += ` else {\n${this.tsStatements(b, 'ELSE')}}`;
    return out;
  }
  tsCompare(b) { return `${this.tsValue(b, 'A')} ${{ EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' }[b.getFieldValue('OP')]} ${this.tsValue(b, 'B')}`; }
  tsArith(b) { return `${this.tsValue(b, 'A')} ${{ ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/' }[b.getFieldValue('OP')]} ${this.tsValue(b, 'B')}`; }
  tsListItems(b) { const out = []; for (let i = 0; i < (b.itemCount || 0); i++) out.push(this.tsValue(b, 'ADD' + i)); return out; }
  tsFuncDef(b) { return `function ${tsIdent(b.getFieldValue('NAME'))} (${(b.mbParams || []).map((p) => `${tsIdent(p.name)}: ${p.type === 'text' ? 'string' : p.type === 'boolean' ? 'boolean' : p.type === 'array' ? 'number[]' : 'number'}`).join(', ')}) {\n${this.tsStatements(b, 'HANDLER')}}`; }
  tsFuncCall(b) { return `${tsIdent(b.mbName)}(${(b.mbParams || []).map((p) => this.tsValue(b, 'A_' + p.name)).join(', ')})`; }
}
function tsIdent(n) { return String(n).trim().replace(/\s+(\w)/g, (m, c) => c.toUpperCase()).replace(/[^\w]/g, '_') || 'x'; }
function tsEnum(v) { const s = String(v); return s === 'AB' ? 'AB' : s.charAt(0).toUpperCase() + s.slice(1); }
function defaultFor(b, name) {
  const inp = b.getInput(name);
  const check = inp && inp.connection && inp.connection.getCheck();
  if (check && check.includes('String')) return '""';
  if (check && check.includes('Boolean')) return 'false';
  if (check && check.includes('Array')) return '[]';
  return '0';
}

// Top blocks that run: event blocks (and functions). Other loose blocks are ignored, like in MakeCode.
function runnableTops(ws) {
  return ws.getTopBlocks(true).filter((b) => b.isEnabled() && HAT_TYPES.has(b.type));
}

// The program of a workspace: { code, ts, variables, features }
function generateProgram(ws) {
  const g = new CodeGen('js');
  const tops = runnableTops(ws);
  let code = 'var A = {};\n';
  for (const b of tops.filter((x) => x.type === 'function_definition')) code += g.template(b, SPECS.function_definition.js) + '\n';
  for (const b of tops.filter((x) => x.type !== 'function_definition')) code += g.template(b, SPECS[b.type].js) + '\n';
  return { code, ts: generateTs(ws), variables: initialVariables(ws), features: programFeatures(ws) };
}
function generateTs(ws) {
  const g = new CodeGen('ts');
  const tops = runnableTops(ws);
  const vars = ws.getAllVariables().map((v) => v.name);
  let out = '';
  for (const b of tops.filter((x) => x.type === 'function_definition')) out += g.tsTemplate(b, SPECS.function_definition.ts) + '\n';
  for (const b of tops.filter((x) => x.type !== 'function_definition' && x.type !== 'basic_on_start')) out += g.tsTemplate(b, SPECS[b.type].ts) + '\n';
  const decl = vars.map((v) => `let ${tsIdent(v)} = 0`).join('\n');
  const start = tops.filter((x) => x.type === 'basic_on_start').map((b) => g.tsStatements(b, 'HANDLER', 0)).join('');
  return [decl, out.trim(), start.trim()].filter(Boolean).join('\n');
}
// Variables start at 0, or [] when the program fills them with "array of", or "" with text.
function initialVariables(ws) {
  const V = {};
  for (const v of ws.getAllVariables()) V[v.name] = 0;
  for (const b of ws.getAllBlocks(false)) {
    if (b.type !== 'variables_set') continue;
    const t = b.getInputTargetBlock('VALUE');
    const name = b.getField('VAR').getVariable && b.getField('VAR').getVariable() ? b.getField('VAR').getVariable().name : null;
    if (!t || !name || V[name] !== 0) continue;
    if (/^lists_create|lists_empty/.test(t.type)) V[name] = [];
  }
  return V;
}
// What the program uses: the simulator shows the matching controls (light slider, thermometer, A+B, radio…)
function programFeatures(ws) {
  const f = { gestures: [] };
  for (const b of ws.getAllBlocks(false)) {
    if (!b.isEnabled()) continue;
    const t = b.type;
    if (t === 'input_light_level') f.light = true;
    if (t === 'input_temperature') f.temperature = true;
    if (t === 'input_compass' || t === 'input_magnetic') f.compass = true;
    if (t === 'input_acceleration' || t === 'input_rotation') f.accel = true;
    if (t === 'input_on_gesture' || t === 'input_is_gesture') { f.accel = true; f.gestures.push(b.getFieldValue('GESTURE')); }
    if ((t === 'input_on_button' || t === 'input_button_is_pressed') && b.getFieldValue('BUTTON') === 'AB') f.ab = true;
    if (/^input_.*pin|^pins_/.test(t)) f.pins = true;
    if (t === 'pins_analog_read') (f.analog = f.analog || []).push(b.getFieldValue('PIN'));
    if (/logo/.test(t)) f.logo = true;
    if (t === 'input_sound_level' || t === 'input_on_sound') f.sound = true;
    if (/^radio_/.test(t)) f.radio = true;
    if (/^serial_/.test(t) || t === 'led_bar_graph') f.serial = true;
    if (/^music_|^input_sound|^input_on_sound/.test(t)) f.music = true;
  }
  f.gestures = [...new Set(f.gestures)];
  return f;
}

// MakeCode micro:bit blocks: renderer (zelos, like pxt), block definitions, code templates and toolbox.
'use strict';

// ---------- Renderer: the pxt renderer is zelos with a monospace bold font and shapes by type ----------
class MbConstants extends Blockly.zelos.ConstantProvider {
  constructor() {
    super();
    this.FIELD_TEXT_FONTFAMILY = '"Consolas", "Monaco", "Menlo", "Ubuntu Mono", "source-code-pro", monospace';
    this.FIELD_TEXT_FONTWEIGHT = '600';
  }
  shapeFor(connection) {
    let checks = connection.getCheck();
    if (!checks && connection.targetConnection) checks = connection.targetConnection.getCheck();
    switch (connection.type) {
      case Blockly.ConnectionType.INPUT_VALUE:
      case Blockly.ConnectionType.OUTPUT_VALUE:
        return checks && checks.includes('Boolean') ? this.HEXAGONAL : this.ROUNDED;
      default:
        return this.NOTCH;
    }
  }
}
class MbRenderer extends Blockly.zelos.Renderer {
  makeConstants_() { return new MbConstants(); }
}
Blockly.blockRendering.register('makecode', MbRenderer);

const MB_THEME = Blockly.Theme.defineTheme('makecode', {
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#ecf0f1',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#000000',
    flyoutBackgroundColour: '#4b4949',
    flyoutForegroundColour: '#ffffff',
    flyoutOpacity: 1,
    scrollbarColour: '#c1c1c1',
    scrollbarOpacity: 0.6,
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.3,
  },
  fontStyle: { family: '"Consolas", "Monaco", "Menlo", "Ubuntu Mono", "source-code-pro", monospace', weight: '600', size: 12 },
  startHats: false,
});

// ---------- Categories (pxt-microbit colours and order) ----------
const CATS = {
  basic: { name: 'Basic', colour: '#1E90FF' },
  input: { name: 'Input', colour: '#D400D4' },
  music: { name: 'Music', colour: '#E63022' },
  led: { name: 'Led', label: 'LED', colour: '#5C2D91' },
  radio: { name: 'Radio', colour: '#E3008C' },
  loops: { name: 'Loops', colour: '#00AA00' },
  logic: { name: 'Logic', colour: '#00A4A6' },
  variables: { name: 'Variables', colour: '#DC143C' },
  math: { name: 'Math', colour: '#9400D3' },
  functions: { name: 'Functions', colour: '#3455DB', advanced: true },
  arrays: { name: 'Arrays', colour: '#E65722', advanced: true },
  text: { name: 'Text', colour: '#B8860B', advanced: true },
  game: { name: 'Game', colour: '#007A4B', advanced: true },
  images: { name: 'Images', colour: '#7600A8', advanced: true },
  pins: { name: 'Pins', colour: '#B22222', advanced: true },
  serial: { name: 'Serial', colour: '#002050', advanced: true },
  control: { name: 'Control', colour: '#333333', advanced: true },
};
const CAT_ORDER = ['basic', 'input', 'music', 'led', 'radio', 'loops', 'logic', 'variables', 'math', 'functions', 'arrays', 'text', 'game', 'images', 'pins', 'serial', 'control'];

// ---------- Block specs ----------
// args: N number input, S text input, B boolean input, A any input (no shadow), D dropdown, F raw field, I input with a custom shadow
const N = (name, v = 0, check = 'Number') => ({ arg: { type: 'input_value', name, check }, shadow: { type: 'math_number', fields: { NUM: v } } });
const S = (name, v = '') => ({ arg: { type: 'input_value', name, check: 'String' }, shadow: { type: 'text', fields: { TEXT: v } } });
const Bo = (name, v = 'TRUE') => ({ arg: { type: 'input_value', name, check: 'Boolean' }, shadow: v === null ? null : { type: 'logic_boolean', fields: { BOOL: v } } });
const A = (name, check = null, shadow = null) => ({ arg: { type: 'input_value', name, check }, shadow });
const D = (name, options) => ({ arg: { type: 'field_dropdown', name, options: options.map((o) => (Array.isArray(o) ? o : [o, o])) } });
const FV = (name, variable) => ({ arg: { type: 'field_variable', name, variable } });
const Fd = (arg) => ({ arg });
const I = (name, check, shadow) => ({ arg: { type: 'input_value', name, check }, shadow });

const SPECS = {};
const TOOLBOX_ITEMS = {}; // cat -> [{type} | {label} | {button}]
let curCat = null, curMore = false, curGroup = null;
function cat(c, more = false) { curCat = c; curMore = more; curGroup = null; const key = c + (more ? ':more' : ''); TOOLBOX_ITEMS[key] = TOOLBOX_ITEMS[key] || []; }
function group(label) { curGroup = label; (TOOLBOX_ITEMS[curCat + (curMore ? ':more' : '')] = TOOLBOX_ITEMS[curCat + (curMore ? ':more' : '')] || []).push({ label }); }

// kind: stmt | hat | loop | num | bool | str | any | arr | shadow
function def(type, kind, msg, args = [], o = {}) {
  const colour = o.colour || CATS[o.cat || curCat].colour;
  const json = { type, colour, tooltip: o.tooltip || '', helpUrl: '', inputsInline: o.inline !== undefined ? o.inline : true };
  json.message0 = msg;
  json.args0 = args.map((a) => a.arg);
  if (kind === 'stmt' || kind === 'loop') { json.previousStatement = null; json.nextStatement = null; }
  if (kind === 'hat' || kind === 'loop') {
    json.message1 = o.doLabel ? o.doLabel + ' %1' : '%1';
    json.args1 = [{ type: 'input_statement', name: 'HANDLER' }];
  }
  const outputs = { num: 'Number', bool: 'Boolean', str: 'String', any: null, arr: 'Array', img: 'Image', sprite: 'Sprite', shadow: o.output || null };
  if (kind in outputs) json.output = outputs[kind];
  if (o.extra) Object.assign(json, o.extra);
  Blockly.Blocks[type] = Object.assign({ init() { this.jsonInit(json); if (o.init) o.init.call(this); } }, o.mixin || {});
  const shadows = {};
  args.forEach((a) => { if (a.arg.type === 'input_value' && a.shadow) shadows[a.arg.name] = a.shadow; });
  SPECS[type] = { type, kind, cat: o.cat || curCat, js: o.js, ts: o.ts, shadows, toolbox: o.toolbox, hidden: !!o.hidden };
  if (!o.hidden && kind !== 'shadow') {
    const key = (o.cat || curCat) + (curMore ? ':more' : '');
    (TOOLBOX_ITEMS[key] = TOOLBOX_ITEMS[key] || []).push({ type, ...(o.toolbox || {}) });
  }
  return SPECS[type];
}
// extra toolbox entry for an existing block (other shadows)
function entry(type, toolbox) { const key = curCat + (curMore ? ':more' : ''); (TOOLBOX_ITEMS[key] = TOOLBOX_ITEMS[key] || []).push({ type, ...toolbox }); }

const iconOptions = () => ICON_ORDER.filter((n) => n !== 'EigthNote' || true).map((n) => [{ src: ledIconUri(ICONS[n], 24), width: 24, height: 24, alt: iconLabel(n) }, n]);
const arrowOptions = ARROW_ORDER.map((n) => [n.replace(/([a-z])([A-Z])/g, '$1 $2'), n]);
const BUTTONS = [['A', 'A'], ['B', 'B'], ['A+B', 'AB']];
const PINS = ['P0', 'P1', 'P2'];
const GESTURE_OPTS = GESTURES.map(([v, l]) => [l, v]);

// ---------- Shadow blocks (white pills and coloured editors) ----------
def('math_number', 'shadow', '%1', [Fd({ type: 'field_number', name: 'NUM', value: 0 })], { cat: 'math', output: 'Number', colour: '#ffffff' });
def('text', 'shadow', '%1', [Fd({ type: 'field_quotedtext', name: 'TEXT', text: '' })], { cat: 'text', output: 'String', colour: '#ffffff' });
def('logic_boolean', 'shadow', '%1', [D('BOOL', [['true', 'TRUE'], ['false', 'FALSE']])], { cat: 'logic', output: 'Boolean' });
def('timePicker', 'shadow', '%1', [Fd({ type: 'field_numberpresets', name: 'MS', value: 100, presets: [['100 ms', 100], ['200 ms', 200], ['500 ms', 500], ['1 second', 1000], ['2 seconds', 2000], ['5 seconds', 5000]] })], { cat: 'basic', output: 'Number', colour: '#ffffff' });
def('timePickerEvery', 'shadow', '%1', [Fd({ type: 'field_numberpresets', name: 'MS', value: 500, presets: [['100 ms', 100], ['200 ms', 200], ['500 ms', 500], ['1 second', 1000], ['1 minute', 60000], ['1 hour', 3600000]] })], { cat: 'loops', output: 'Number', colour: '#ffffff' });
def('music_note', 'shadow', '%1', [Fd({ type: 'field_note', name: 'NOTE', value: 262 })], { cat: 'music', output: 'Number', colour: '#ffffff' });
def('music_beat', 'shadow', '%1 beat', [D('BEAT', BEATS.map(([l]) => [l, l]))], { cat: 'music', output: 'Number' });
def('music_melody_playable', 'shadow', 'melody %1 at tempo %2 (bpm)', [Fd({ type: 'field_melody', name: 'MELODY', value: 'E B C5 A B G A F ' }), N('TEMPO', 120)], { cat: 'music', output: 'Playable' });
def('music_tone_playable', 'shadow', 'tone %1 for %2', [I('NOTE', 'Number', { type: 'music_note', fields: { NOTE: 262 } }), I('DURATION', 'Number', { type: 'music_beat', fields: { BEAT: '1' } })], { cat: 'music', output: 'Playable' });
def('music_sound_playable', 'shadow', 'sound %1', [D('SOUND', ['giggle', 'happy', 'hello', 'mysterious', 'sad', 'slide', 'soaring', 'spring', 'twinkle', 'yawn'])], { cat: 'music', output: 'Playable' });

// ---------- Basic ----------
cat('basic');
def('basic_show_number', 'stmt', 'show number %1', [N('NUMBER', 0)], { js: 'yield* R.showNumber(F, %NUMBER);', ts: 'basic.showNumber(%NUMBER)' });
def('basic_show_leds', 'stmt', 'show leds %1', [Fd({ type: 'field_ledmatrix', name: 'LEDS' })], { js: 'yield* R.showLeds(F, @LEDS);', ts: (b) => `basic.showLeds(\`\n${b.getFieldValue('LEDS').split(' ').map((r) => '    ' + r.split('').join(' ')).join('\n')}\n    \`)` });
def('basic_show_icon', 'stmt', 'show icon %1', [Fd({ type: 'field_icongrid', name: 'ICON', options: iconOptions(), columns: 5 })], { js: 'yield* R.showIcon(F, @ICON);', ts: 'basic.showIcon(IconNames.$ICON)' });
def('basic_show_string', 'stmt', 'show string %1', [S('TEXT', 'Hello!')], { js: 'yield* R.showString(F, %TEXT);', ts: 'basic.showString(%TEXT)' });
def('basic_clear_screen', 'stmt', 'clear screen', [], { js: 'R.clearScreen();', ts: 'basic.clearScreen()' });
def('basic_forever', 'hat', 'forever', [], { js: 'R.forever(function* (F) {\n{HANDLER}});', ts: 'basic.forever(function () {\n{HANDLER}})' });
def('basic_pause', 'stmt', 'pause (ms) %1', [I('PAUSE', 'Number', { type: 'timePicker', fields: { MS: 100 } })], { js: 'yield* R.pause(F, %PAUSE);', ts: 'basic.pause(%PAUSE)' });
def('basic_on_start', 'hat', 'on start', [], { js: 'R.onStart(function* (F) {\n{HANDLER}});', ts: '{HANDLER*}' });
def('basic_show_arrow', 'stmt', 'show arrow %1', [D('DIR', arrowOptions)], { js: 'yield* R.showArrow(F, @DIR);', ts: 'basic.showArrow(ArrowNames.$DIR)' });

// ---------- Input ----------
cat('input');
def('input_on_button', 'hat', 'on button %1 pressed', [D('BUTTON', BUTTONS)], { js: 'R.onButton(@BUTTON, function* (F) {\n{HANDLER}});', ts: 'input.onButtonPressed(Button.$BUTTON, function () {\n{HANDLER}})' });
def('input_on_gesture', 'hat', 'on %1', [D('GESTURE', GESTURE_OPTS)], { js: 'R.onGesture(@GESTURE, function* (F) {\n{HANDLER}});', ts: 'input.onGesture(Gesture.$GESTURE, function () {\n{HANDLER}})' });
def('input_on_pin', 'hat', 'on pin %1 pressed', [D('PIN', PINS)], { js: 'R.onPin(@PIN, "pressed", function* (F) {\n{HANDLER}});', ts: 'input.onPinPressed(TouchPin.$PIN, function () {\n{HANDLER}})' });
def('input_on_logo', 'hat', 'on logo %1', [D('EVENT', [['pressed', 'pressed'], ['touched', 'down'], ['released', 'up']])], { js: 'R.onLogo(@EVENT, function* (F) {\n{HANDLER}});', ts: 'input.onLogoEvent(TouchButtonEvent.Pressed, function () {\n{HANDLER}})' });
def('input_button_is_pressed', 'bool', 'button %1 is pressed', [D('BUTTON', BUTTONS)], { js: 'R.buttonIsPressed(@BUTTON)', ts: 'input.buttonIsPressed(Button.$BUTTON)' });
def('input_pin_is_pressed', 'bool', 'pin %1 is pressed', [D('PIN', PINS)], { js: 'R.pinIsPressed(@PIN)', ts: 'input.pinIsPressed(TouchPin.$PIN)' });
def('input_acceleration', 'num', 'acceleration (mg) %1', [D('DIM', ['x', 'y', 'z', 'strength'])], { js: 'R.acceleration(@DIM)', ts: 'input.acceleration(Dimension.$DIM)' });
def('input_logo_is_pressed', 'bool', 'logo is pressed', [], { js: 'R.logoIsPressed()', ts: 'input.logoIsPressed()' });
def('input_light_level', 'num', 'light level', [], { js: 'R.lightLevel()', ts: 'input.lightLevel()' });
def('input_compass', 'num', 'compass heading (°)', [], { js: 'R.compassHeading()', ts: 'input.compassHeading()' });
def('input_temperature', 'num', 'temperature (°C)', [], { js: 'R.temperatureC()', ts: 'input.temperature()' });
def('input_is_gesture', 'bool', 'is %1 gesture', [D('GESTURE', GESTURE_OPTS)], { js: 'R.isGesture(@GESTURE)', ts: 'input.isGesture(Gesture.$GESTURE)' });
def('input_sound_level', 'num', 'sound level', [], { js: 'R.soundLevelNow()', ts: 'input.soundLevel()' });
def('input_on_sound', 'hat', 'on %1 sound', [D('LEVEL', ['loud', 'quiet'])], { js: 'R.onSound(@LEVEL, function* (F) {\n{HANDLER}});', ts: 'input.onSound(DetectedSound.Loud, function () {\n{HANDLER}})' });
cat('input', true);
def('input_calibrate', 'stmt', 'calibrate compass', [], { js: '', ts: 'input.calibrateCompass()' });
def('input_magnetic', 'num', 'magnetic force (µT) %1', [D('DIM', ['x', 'y', 'z', 'strength'])], { js: 'R.magneticForce(@DIM)', ts: 'input.magneticForce(Dimension.$DIM)' });
def('input_rotation', 'num', 'rotation (°) %1', [D('KIND', ['pitch', 'roll'])], { js: 'R.rotation(@KIND)', ts: 'input.rotation(Rotation.$KIND)' });
def('input_running_time', 'num', 'running time (ms)', [], { js: 'R.runningTime()', ts: 'input.runningTime()' });
def('input_running_time_micros', 'num', 'running time (micros)', [], { js: 'R.runningTimeMicros()', ts: 'input.runningTimeMicros()' });
def('input_on_pin_released', 'hat', 'on pin %1 released', [D('PIN', PINS)], { js: 'R.onPin(@PIN, "up", function* (F) {\n{HANDLER}});', ts: 'input.onPinReleased(TouchPin.$PIN, function () {\n{HANDLER}})' });
def('input_accel_range', 'stmt', 'set accelerometer range %1', [D('RANGE', ['1g', '2g', '4g', '8g'])], { js: '', ts: 'input.setAccelerometerRange(AcceleratorRange.OneG)' });
group('micro:bit (V2)');
def('input_sound_threshold', 'stmt', 'set %1 sound threshold to %2', [D('LEVEL', ['loud', 'quiet']), N('VALUE', 128)], { js: '', ts: 'input.setSoundThreshold(SoundThreshold.Loud, %VALUE)' });

// ---------- Music ----------
cat('music');
group('Melody');
def('music_play', 'stmt', 'play %1 %2', [A('SOUND', 'Playable'), D('MODE', [['until done', 'until'], ['in background', 'background'], ['looping in background', 'loop']])], {
  toolbox: { shadows: { SOUND: { type: 'music_melody_playable', fields: { MELODY: 'E B C5 A B G A F ' }, inputs: { TEMPO: { shadow: { type: 'math_number', fields: { NUM: 120 } } } } } } },
  js: (b, g) => g.playable(b), ts: (b, g) => g.tsPlayable(b),
});
group('Tone');
entry('music_play', { shadows: { SOUND: { type: 'music_tone_playable' } } });
def('music_ring_tone', 'stmt', 'ring tone (Hz) %1', [I('NOTE', 'Number', { type: 'music_note', fields: { NOTE: 262 } })], { js: 'R.ringTone(%NOTE);', ts: 'music.ringTone(%NOTE)' });
def('music_rest', 'stmt', 'rest for %1', [I('BEAT', 'Number', { type: 'music_beat', fields: { BEAT: '1' } })], { js: 'yield* R.rest(F, R.beatMs(%BEAT));', ts: 'music.rest(%BEAT)' });
entry('music_note', { fields: { NOTE: 262 }, real: true });
group('Volume');
def('music_set_volume', 'stmt', 'set volume %1', [N('VOLUME', 127)], { js: 'R.setVolume(%VOLUME);', ts: 'music.setVolume(%VOLUME)' });
def('music_volume', 'num', 'volume', [], { js: 'R.volume', ts: 'music.volume()' });
def('music_stop_all', 'stmt', 'stop all sounds', [], { js: 'R.stopAllSounds();', ts: 'music.stopAllSounds()' });
group('Tempo');
def('music_tempo', 'num', 'tempo (bpm)', [], { js: 'R.tempo', ts: 'music.tempo()' });
def('music_change_tempo', 'stmt', 'change tempo by (bpm) %1', [N('BPM', 20)], { js: 'R.changeTempo(%BPM);', ts: 'music.changeTempoBy(%BPM)' });
def('music_set_tempo', 'stmt', 'set tempo to (bpm) %1', [N('BPM', 120)], { js: 'R.setTempo(%BPM);', ts: 'music.setTempo(%BPM)' });
group('Melody Advanced');
def('music_start_melody', 'stmt', 'start melody %1 repeating %2', [D('MELODY', MELODY_ORDER.map((m) => [MELODY_LABEL[m] || m, m])), D('REPEAT', [['once', 'until'], ['forever', 'loop'], ['once in background', 'background'], ['forever in background', 'loop']])], {
  js: (b, g) => `yield* R.playMelody(F, ${JSON.stringify(MELODIES[b.getFieldValue('MELODY')] || '')}, R.tempo, ${JSON.stringify(b.getFieldValue('REPEAT'))});`,
  ts: 'music.startMelody(music.builtInMelody(Melodies.$MELODY), MelodyOptions.Once)',
});
group('micro:bit (V2)');
entry('music_play', { shadows: { SOUND: { type: 'music_sound_playable' } } });

// ---------- LED ----------
cat('led');
def('led_plot', 'stmt', 'plot x %1 y %2', [N('X', 0), N('Y', 0)], { js: 'R.plot(%X, %Y);', ts: 'led.plot(%X, %Y)' });
def('led_toggle', 'stmt', 'toggle x %1 y %2', [N('X', 0), N('Y', 0)], { js: 'R.toggle(%X, %Y);', ts: 'led.toggle(%X, %Y)' });
def('led_unplot', 'stmt', 'unplot x %1 y %2', [N('X', 0), N('Y', 0)], { js: 'R.unplot(%X, %Y);', ts: 'led.unplot(%X, %Y)' });
def('led_point', 'bool', 'point x %1 y %2', [N('X', 0), N('Y', 0)], { js: 'R.point(%X, %Y)', ts: 'led.point(%X, %Y)' });
def('led_bar_graph', 'stmt', 'plot bar graph of %1 up to %2', [N('VALUE', 0), N('HIGH', 0)], { inline: false, js: 'R.plotBarGraph(%VALUE, %HIGH);', ts: 'led.plotBarGraph(%VALUE, %HIGH)' });
cat('led', true);
def('led_plot_brightness', 'stmt', 'plot x %1 y %2 brightness %3', [N('X', 0), N('Y', 0), N('B', 255)], { js: 'R.plotBrightness(%X, %Y, %B);', ts: 'led.plotBrightness(%X, %Y, %B)' });
def('led_point_brightness', 'num', 'point x %1 y %2 brightness', [N('X', 0), N('Y', 0)], { js: 'R.pointBrightness(%X, %Y)', ts: 'led.pointBrightness(%X, %Y)' });
def('led_brightness', 'num', 'brightness', [], { js: 'R.brightness', ts: 'led.brightness()' });
def('led_set_brightness', 'stmt', 'set brightness %1', [N('B', 255)], { js: 'R.setBrightness(%B);', ts: 'led.setBrightness(%B)' });
def('led_enable', 'stmt', 'led enable %1', [Bo('ON', 'FALSE')], { js: 'R.enable(%ON);', ts: 'led.enable(%ON)' });
def('led_stop_animation', 'stmt', 'stop animation', [], { js: 'R.stopAnimation();', ts: 'led.stopAnimation()' });
def('led_display_mode', 'stmt', 'set display mode %1', [D('MODE', [['black and white', 'bw'], ['greyscale', 'grey']])], { js: 'R.setDisplayMode(@MODE);', ts: 'led.setDisplayMode(DisplayMode.BlackAndWhite)' });

// ---------- Radio ----------
const PARAM_COLOUR = '#DC143C';
// event blocks with draggable parameters (receivedNumber…)
function paramHat(type, msg, params, js, ts) {
  const args = params.map((p) => ({ arg: { type: 'input_value', name: 'P_' + p, check: 'MbParam' } }));
  const inputs = {};
  for (const p of params) inputs['P_' + p] = { block: { type: 'argument_reporter', fields: { NAME: p } } };
  def(type, 'hat', msg, args, {
    js, ts, toolbox: { inputs },
    mixin: { mbParamSlots: params },
    init() { this.mbParams = params; },
  });
}
cat('radio');
group('Group');
def('radio_set_group', 'stmt', 'radio set group %1', [N('GROUP', 1)], { js: 'R.radioSetGroup(%GROUP);', ts: 'radio.setGroup(%GROUP)' });
group('Send');
def('radio_send_number', 'stmt', 'radio send number %1', [N('VALUE', 0)], { js: 'R.radioSendNumber(%VALUE);', ts: 'radio.sendNumber(%VALUE)' });
def('radio_send_value', 'stmt', 'radio send value %1 = %2', [S('NAME', 'name'), N('VALUE', 0)], { js: 'R.radioSendValue(%NAME, %VALUE);', ts: 'radio.sendValue(%NAME, %VALUE)' });
def('radio_send_string', 'stmt', 'radio send string %1', [S('VALUE', '')], { js: 'R.radioSendString(%VALUE);', ts: 'radio.sendString(%VALUE)' });
group('Receive');
paramHat('radio_on_number', 'on radio received %1', ['receivedNumber'], 'R.onRadio("number", function* (F, receivedNumber) {\nconst A = { receivedNumber };\n{HANDLER}});', 'radio.onReceivedNumber(function (receivedNumber) {\n{HANDLER}})');
paramHat('radio_on_value', 'on radio received %1 %2', ['name', 'value'], 'R.onRadio("value", function* (F, name, value) {\nconst A = { name, value };\n{HANDLER}});', 'radio.onReceivedValue(function (name, value) {\n{HANDLER}})');
paramHat('radio_on_string', 'on radio received %1', ['receivedString'], 'R.onRadio("string", function* (F, receivedString) {\nconst A = { receivedString };\n{HANDLER}});', 'radio.onReceivedString(function (receivedString) {\n{HANDLER}})');
def('radio_packet', 'num', 'received packet %1', [D('PROP', [['signal strength', 'signal'], ['serial number', 'serial'], ['time', 'time']])], { js: 'R.receivedPacket(@PROP)', ts: 'radio.receivedPacket(RadioPacketProperty.SignalStrength)' });
cat('radio', true);
def('radio_set_power', 'stmt', 'radio set transmit power %1', [N('POWER', 7)], { js: 'R.radioSetPower(%POWER);', ts: 'radio.setTransmitPower(%POWER)' });
def('radio_set_serial', 'stmt', 'radio set transmit serial number %1', [Bo('ON', 'TRUE')], { js: 'R.radioSetSerial(%ON);', ts: 'radio.setTransmitSerialNumber(%ON)' });
def('radio_set_band', 'stmt', 'radio set frequency band %1', [N('BAND', 0)], { js: 'R.radioSetBand(%BAND);', ts: 'radio.setFrequencyBand(%BAND)' });

// ---------- Loops ----------
cat('loops');
def('loops_repeat', 'loop', 'repeat %1 times', [N('TIMES', 4)], { doLabel: 'do', js: (b, g) => g.repeat(b), ts: 'for (let index = 0; index < %TIMES; index++) {\n{HANDLER}}' });
def('loops_while', 'loop', 'while %1', [Bo('COND', 'FALSE')], { doLabel: 'do', js: 'while (%COND) {\n{HANDLER}if (R.spinCheck(F)) yield 1;\n}', ts: 'while (%COND) {\n{HANDLER}}' });
def('loops_for', 'loop', 'for %1 from 0 to %2', [FV('VAR', 'index'), N('TO', 4)], { doLabel: 'do', js: (b, g) => g.forRange(b), ts: (b, g) => `for (let ${g.tsVar(b, 'VAR')} = 0; ${g.tsVar(b, 'VAR')} <= ${g.tsValue(b, 'TO')}; ${g.tsVar(b, 'VAR')}++) {\n${g.tsStatements(b, 'HANDLER')}}` });
def('loops_for_of', 'loop', 'for element %1 of %2', [FV('VAR', 'value'), A('LIST', 'Array')], { doLabel: 'do', toolbox: { inputs: { LIST: { block: { type: 'variables_get', fields: { VAR: { name: 'list' } } } } } }, js: (b, g) => g.forOf(b), ts: (b, g) => `for (let ${g.tsVar(b, 'VAR')} of ${g.tsValue(b, 'LIST')}) {\n${g.tsStatements(b, 'HANDLER')}}` });
def('loops_every', 'hat', 'every %1 ms', [I('MS', 'Number', { type: 'timePickerEvery', fields: { MS: 500 } })], { js: 'R.every(%MS, function* (F) {\n{HANDLER}});', ts: 'loops.everyInterval(%MS, function () {\n{HANDLER}})' });
def('loops_break', 'stmt', 'break', [], { extra: { nextStatement: undefined }, js: 'break;', ts: 'break' });
def('loops_continue', 'stmt', 'continue', [], { extra: { nextStatement: undefined }, js: 'continue;', ts: 'continue' });
Blockly.Blocks.loops_break.init = function () { this.jsonInit({ message0: 'break', previousStatement: null, colour: CATS.loops.colour }); };
Blockly.Blocks.loops_continue.init = function () { this.jsonInit({ message0: 'continue', previousStatement: null, colour: CATS.loops.colour }); };

// ---------- Logic ----------
cat('logic');
group('Conditionals');
// if / else if / else with ⊕ ⊖ like MakeCode
Blockly.Blocks.controls_if = {
  init() {
    this.setColour(CATS.logic.colour);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setInputsInline(true);
    this.elseifCount = 0;
    this.elseCount = 0;
    this.rebuild();
  },
  saveExtraState() { return this.elseifCount || this.elseCount ? { elseIfCount: this.elseifCount, hasElse: !!this.elseCount } : null; },
  loadExtraState(s) { this.elseifCount = (s && s.elseIfCount) || 0; this.elseCount = s && s.hasElse ? 1 : 0; this.rebuild(); },
  rebuild(addShadows = false) {
    // keep the connected blocks while the inputs are rebuilt
    const keep = {};
    for (const inp of this.inputList) if (inp.connection && inp.connection.targetConnection) keep[inp.name] = inp.connection.targetConnection;
    while (this.inputList.length) this.removeInput(this.inputList[0].name);
    this.appendValueInput('IF0').setCheck('Boolean').appendField('if');
    this.appendDummyInput('THEN0').appendField('then');
    this.appendStatementInput('DO0');
    for (let i = 1; i <= this.elseifCount; i++) {
      this.appendValueInput('IF' + i).setCheck('Boolean').appendField('else if');
      const d = this.appendDummyInput('THEN' + i).appendField('then');
      d.appendField(plusMinusField('-', (b) => b.removeElseIf(i)));
      this.appendStatementInput('DO' + i);
    }
    if (this.elseCount) {
      this.appendDummyInput('ELSE_LABEL').appendField('else').appendField(plusMinusField('-', (b) => { b.elseCount = 0; b.rebuild(true); }));
      this.appendStatementInput('ELSE');
    }
    this.appendDummyInput('PLUS').appendField(plusMinusField('+', (b) => { if (b.elseCount) b.elseifCount++; else b.elseCount = 1; b.rebuild(true); }));
    for (const [name, conn] of Object.entries(keep)) { const inp = this.getInput(name); if (inp && inp.connection && !conn.getSourceBlock().disposed) { try { inp.connection.connect(conn); } catch (e) { /* type changed */ } } }
    if (addShadows) {
      for (const inp of this.inputList) if (inp.connection && inp.connection.type === Blockly.ConnectionType.INPUT_VALUE && !inp.connection.targetConnection && this.workspace && !this.isInFlyout) {
        const sh = this.workspace.newBlock('logic_boolean');
        sh.setShadow(true); sh.setFieldValue('TRUE', 'BOOL'); sh.initSvg(); sh.render();
        inp.connection.connect(sh.outputConnection);
      }
    }
  },
  removeElseIf(i) {
    // move the conditions and statements of the next rows up
    const take = (name) => { const inp = this.getInput(name); const c = inp && inp.connection.targetConnection; if (c) c.disconnect(); return c; };
    const rows = [];
    for (let k = 1; k <= this.elseifCount; k++) rows.push({ cond: take('IF' + k), body: take('DO' + k) });
    const removed = rows.splice(i - 1, 1)[0];
    if (removed.cond && !removed.cond.getSourceBlock().isShadow()) removed.cond.getSourceBlock().dispose(true);
    else if (removed.cond) removed.cond.getSourceBlock().dispose();
    if (removed.body) removed.body.getSourceBlock().dispose(true);
    this.elseifCount--;
    this.rebuild(true);
    rows.forEach((r, k) => {
      if (r.cond) { const t = this.getInput('IF' + (k + 1)).connection; if (t.targetConnection) t.targetConnection.getSourceBlock().dispose(); t.connect(r.cond); }
      if (r.body) this.getInput('DO' + (k + 1)).connection.connect(r.body);
    });
  },
};
SPECS.controls_if = { type: 'controls_if', kind: 'stmt', cat: 'logic', js: (b, g) => g.ifBlock(b), ts: (b, g) => g.tsIf(b), shadows: {} };
TOOLBOX_ITEMS.logic.push({ type: 'controls_if', shadows: { IF0: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } });
TOOLBOX_ITEMS.logic.push({ type: 'controls_if', extraState: { hasElse: true }, shadows: { IF0: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } });
group('Comparison');
const CMP = [['=', 'EQ'], ['≠', 'NEQ'], ['<', 'LT'], ['≤', 'LTE'], ['>', 'GT'], ['≥', 'GTE']];
def('logic_compare', 'bool', '%1 %2 %3', [N('A', 0, null), D('OP', CMP), N('B', 0, null)], { js: (b, g) => g.compare(b), ts: (b, g) => g.tsCompare(b) });
Blockly.Blocks.logic_compare.init = function () {
  this.jsonInit({ message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A' }, { type: 'field_dropdown', name: 'OP', options: CMP }, { type: 'input_value', name: 'B' }], output: 'Boolean', inputsInline: true, colour: CATS.logic.colour });
};
entry('logic_compare', { fields: { OP: 'LT' } });
entry('logic_compare', { fields: { OP: 'EQ' }, shadows: { A: { type: 'text', fields: { TEXT: '' } }, B: { type: 'text', fields: { TEXT: '' } } } });
group('Boolean');
def('logic_operation', 'bool', '%1 %2 %3', [Bo('A', null), D('OP', [['and', 'AND'], ['or', 'OR']]), Bo('B', null)], { js: (b, g) => `(${g.value(b, 'A', 'false')} ${b.getFieldValue('OP') === 'AND' ? '&&' : '||'} ${g.value(b, 'B', 'false')})`, ts: (b, g) => `${g.tsValue(b, 'A')} ${b.getFieldValue('OP') === 'AND' ? '&&' : '||'} ${g.tsValue(b, 'B')}` });
entry('logic_operation', { fields: { OP: 'OR' } });
def('logic_negate', 'bool', 'not %1', [Bo('BOOL', null)], { js: '!(%BOOL)', ts: '!(%BOOL)' });
entry('logic_boolean', { fields: { BOOL: 'TRUE' }, real: true });
entry('logic_boolean', { fields: { BOOL: 'FALSE' }, real: true });

// ---------- Variables ----------
cat('variables');
def('variables_set', 'stmt', 'set %1 to %2', [FV('VAR', 'item'), N('VALUE', 0, null)], { hidden: true, js: (b, g) => `${g.varRef(b)} = ${g.value(b, 'VALUE', '0')};`, ts: (b, g) => `${g.tsVar(b, 'VAR')} = ${g.tsValue(b, 'VALUE')}` });
def('variables_change', 'stmt', 'change %1 by %2', [FV('VAR', 'item'), N('VALUE', 1)], { hidden: true, js: (b, g) => `${g.varRef(b)} = R.num(${g.varRef(b)}) + R.num(${g.value(b, 'VALUE', '0')});`, ts: (b, g) => `${g.tsVar(b, 'VAR')} += ${g.tsValue(b, 'VALUE')}` });
def('variables_get', 'any', '%1', [FV('VAR', 'item')], { hidden: true, js: (b, g) => g.varRef(b), ts: (b, g) => g.tsVar(b, 'VAR') });
// the red parameters of event blocks and functions (receivedNumber, name, value…)
def('argument_reporter', 'any', '%1', [Fd({ type: 'field_label_serializable', name: 'NAME', text: 'x' })], {
  hidden: true, colour: PARAM_COLOUR,
  js: (b) => `A[${JSON.stringify(b.getFieldValue('NAME'))}]`, ts: (b) => b.getFieldValue('NAME'),
  init() { if (this.setDragStrategy) this.setDragStrategy(new DuplicateOnDragStrategy(this)); },
});

// ---------- Math ----------
cat('math');
const ARITH = [['+', 'ADD'], ['-', 'MINUS'], ['×', 'MULTIPLY'], ['÷', 'DIVIDE']];
def('math_arithmetic', 'num', '%1 %2 %3', [N('A', 0), D('OP', ARITH), N('B', 0)], { js: (b, g) => g.arith(b), ts: (b, g) => g.tsArith(b) });
for (const op of ['MINUS', 'MULTIPLY', 'DIVIDE']) entry('math_arithmetic', { fields: { OP: op } });
entry('math_number', { fields: { NUM: 0 }, real: true });
def('math_remainder', 'num', 'remainder of %1 ÷ %2', [N('A', 0), N('B', 1)], { js: 'R.mod(%A, %B)', ts: '%A % %B' });
def('math_minmax', 'num', '%1 of %2 and %3', [D('OP', [['min', 'min'], ['max', 'max']]), N('A', 0), N('B', 0)], { js: 'Math.$OP(R.num(%A), R.num(%B))', ts: 'Math.$OP(%A, %B)' });
entry('math_minmax', { fields: { OP: 'max' } });
def('math_abs', 'num', 'absolute of %1', [N('X', 0)], { js: 'Math.abs(R.num(%X))', ts: 'Math.abs(%X)' });
def('math_op', 'num', '%1 %2', [D('OP', [['square root', 'sqrt'], ['sin', 'sin'], ['cos', 'cos'], ['tan', 'tan'], ['atan2', 'atan2'], ['integer ÷', 'idiv'], ['integer ×', 'imul']]), N('X', 0)], { js: (b, g) => g.mathOp(b), ts: 'Math.$OP(%X)' });
def('math_round', 'num', '%1 %2', [D('OP', [['round', 'round'], ['ceiling', 'ceil'], ['floor', 'floor'], ['truncate', 'trunc']]), N('X', 0)], { js: 'Math.$OP(R.num(%X))', ts: 'Math.$OP(%X)' });
def('math_random', 'num', 'pick random %1 to %2', [N('FROM', 0), N('TO', 10)], { js: 'R.randomRange(%FROM, %TO)', ts: 'randint(%FROM, %TO)' });
def('math_map', 'num', 'map %1 from low %2 high %3 to low %4 high %5', [N('VALUE', 0), N('FL', 0), N('FH', 1023), N('TL', 0), N('TH', 4)], { inline: true, js: 'R.map(%VALUE, %FL, %FH, %TL, %TH)', ts: 'Math.map(%VALUE, %FL, %FH, %TL, %TH)' });
def('math_constrain', 'num', 'constrain %1 between %2 and %3', [N('VALUE', 0), N('LO', 0), N('HI', 0)], { js: 'R.constrain(%VALUE, %LO, %HI)', ts: 'Math.constrain(%VALUE, %LO, %HI)' });
def('math_random_bool', 'bool', 'pick random true or false', [], { js: 'R.randomBool()', ts: 'Math.randomBoolean()' });

// ---------- Functions ----------
cat('functions');
// function definition: "function doSomething" with draggable parameters; calls follow its name and parameters
Blockly.Blocks.function_definition = {
  init() {
    this.setColour(CATS.functions.colour);
    this.mbParams = [];
    this.mbParamSlots = [];
    this.appendDummyInput('TOP').appendField('function').appendField(new Blockly.FieldTextInput('doSomething', (v) => v.replace(/[^\w ]/g, '').trim() || null), 'NAME');
    this.appendStatementInput('HANDLER');
  },
  saveExtraState() { return this.mbParams.length ? { params: this.mbParams } : null; },
  loadExtraState(s) {
    this.mbParams = (s && s.params) || [];
    this.mbParamSlots = this.mbParams.map((p) => p.name);
    this.removeInput('HANDLER');
    for (const inp of this.inputList.slice()) if (inp.name.startsWith('P_')) this.removeInput(inp.name);
    for (const p of this.mbParams) this.appendValueInput('P_' + p.name).setCheck('MbParam');
    this.appendStatementInput('HANDLER');
  },
};
SPECS.function_definition = { type: 'function_definition', kind: 'hat', cat: 'functions', js: (b, g) => g.funcDef(b), ts: (b, g) => g.tsFuncDef(b), shadows: {} };
const callMixin = {
  saveExtraState() { return { name: this.mbName, params: this.mbParams }; },
  loadExtraState(s) {
    this.mbName = s.name; this.mbParams = s.params || [];
    for (const inp of this.inputList.slice()) this.removeInput(inp.name);
    this.appendDummyInput('TOP').appendField('call').appendField(this.mbName);
    for (const p of this.mbParams) this.appendValueInput('A_' + p.name).setCheck(p.type === 'number' ? 'Number' : p.type === 'text' ? 'String' : p.type === 'boolean' ? 'Boolean' : null);
  },
};
Blockly.Blocks.function_call = Object.assign({ init() { this.setColour(CATS.functions.colour); this.setPreviousStatement(true); this.setNextStatement(true); this.setInputsInline(true); this.mbName = 'doSomething'; this.mbParams = []; this.appendDummyInput('TOP').appendField('call').appendField('doSomething'); } }, callMixin);
Blockly.Blocks.function_call_output = Object.assign({ init() { this.setColour(CATS.functions.colour); this.setOutput(true); this.setInputsInline(true); this.mbName = 'doSomething'; this.mbParams = []; this.appendDummyInput('TOP').appendField('call').appendField('doSomething'); } }, callMixin);
SPECS.function_call = { type: 'function_call', kind: 'stmt', cat: 'functions', js: (b, g) => `yield* ${g.funcCall(b)};`, ts: (b, g) => g.tsFuncCall(b), shadows: {} };
SPECS.function_call_output = { type: 'function_call_output', kind: 'any', cat: 'functions', js: (b, g) => `(yield* ${g.funcCall(b)})`, ts: (b, g) => g.tsFuncCall(b), shadows: {} };
def('function_return', 'stmt', 'return %1', [N('VALUE', 0, null)], { hidden: true, extra: { nextStatement: undefined }, js: 'return %VALUE;', ts: 'return %VALUE' });
Blockly.Blocks.function_return.init = function () { this.jsonInit({ message0: 'return %1', args0: [{ type: 'input_value', name: 'VALUE' }], previousStatement: null, colour: CATS.functions.colour, inputsInline: true }); };

// ---------- Arrays ----------
// "array of" with ⊕ ⊖
function listBlock(type, label, itemShadow, defaults) {
  Blockly.Blocks[type] = {
    init() {
      this.setColour(CATS.arrays.colour);
      this.setOutput(true, 'Array');
      this.setInputsInline(true);
      this.itemCount = defaults.length;
      this.rebuild();
    },
    saveExtraState() { return { itemCount: this.itemCount }; },
    loadExtraState(s) { this.itemCount = s.itemCount; this.rebuild(); },
    rebuild(addShadows = false) {
      const keep = {};
      for (const inp of this.inputList) if (inp.connection && inp.connection.targetConnection) keep[inp.name] = inp.connection.targetConnection;
      while (this.inputList.length) this.removeInput(this.inputList[0].name);
      this.appendDummyInput('LBL').appendField(label);
      for (let i = 0; i < this.itemCount; i++) this.appendValueInput('ADD' + i);
      const d = this.appendDummyInput('BTN');
      if (this.itemCount > 0) d.appendField(plusMinusField('-', (b) => { const c = b.getInput('ADD' + (b.itemCount - 1)).connection.targetConnection; if (c) c.getSourceBlock().dispose(); b.itemCount--; b.rebuild(true); }));
      d.appendField(plusMinusField('+', (b) => { b.itemCount++; b.rebuild(true); }));
      for (const [name, conn] of Object.entries(keep)) { const inp = this.getInput(name); if (inp) inp.connection.connect(conn); else conn.getSourceBlock().dispose(); }
      if (addShadows && this.workspace && !this.isInFlyout) {
        for (let i = 0; i < this.itemCount; i++) {
          const inp = this.getInput('ADD' + i);
          if (inp.connection.targetConnection) continue;
          const sh = this.workspace.newBlock(itemShadow.type);
          sh.setShadow(true);
          for (const [f, v] of Object.entries(itemShadow.fields)) sh.setFieldValue(v, f);
          sh.initSvg(); sh.render();
          inp.connection.connect(sh.outputConnection);
        }
      }
    },
  };
  SPECS[type] = { type, kind: 'arr', cat: 'arrays', js: (b, g) => `[${g.listItems(b).join(', ')}]`, ts: (b, g) => `[${g.tsListItems(b).join(', ')}]`, shadows: {} };
}
listBlock('lists_create_with', 'array of', { type: 'math_number', fields: { NUM: 0 } }, [1, 2]);
listBlock('lists_create_with_text', 'array of', { type: 'text', fields: { TEXT: '' } }, ['a', 'b', 'c']);
cat('arrays');
group('Create');
TOOLBOX_ITEMS.arrays.push({ type: 'variables_set', varName: 'list', inputs: { VALUE: { block: { type: 'lists_create_with', extraState: { itemCount: 2 }, inputs: { ADD0: { shadow: { type: 'math_number', fields: { NUM: 1 } } }, ADD1: { shadow: { type: 'math_number', fields: { NUM: 2 } } } } } } } });
TOOLBOX_ITEMS.arrays.push({ type: 'variables_set', varName: 'text list', inputs: { VALUE: { block: { type: 'lists_create_with_text', extraState: { itemCount: 3 }, inputs: { ADD0: { shadow: { type: 'text', fields: { TEXT: 'a' } } }, ADD1: { shadow: { type: 'text', fields: { TEXT: 'b' } } }, ADD2: { shadow: { type: 'text', fields: { TEXT: 'c' } } } } } } } });
def('lists_empty', 'arr', 'empty array', [], { js: '[]', ts: '[]' });
const LIST_IN = { inputs: { LIST: { block: { type: 'variables_get', fields: { VAR: { name: 'list' } } } } } };
group('Read');
def('lists_length', 'num', 'length of array %1', [A('LIST', 'Array')], { toolbox: LIST_IN, js: 'R.arr(%LIST).length', ts: '%LIST.length' });
def('lists_get', 'any', '%1 get value at %2', [A('LIST', 'Array'), N('INDEX', 0)], { toolbox: LIST_IN, js: 'R.arrGet(%LIST, %INDEX)', ts: '%LIST[%INDEX]' });
def('lists_find', 'num', '%1 find index of %2', [A('LIST', 'Array'), N('VALUE', 0, null)], { toolbox: LIST_IN, js: 'R.arr(%LIST).indexOf(%VALUE)', ts: '%LIST.indexOf(%VALUE)' });
group('Modify');
def('lists_set', 'stmt', '%1 set value at %2 to %3', [A('LIST', 'Array'), N('INDEX', 0), N('VALUE', 0, null)], { toolbox: LIST_IN, js: 'R.arrSet(%LIST, %INDEX, %VALUE);', ts: '%LIST[%INDEX] = %VALUE' });
def('lists_push', 'stmt', 'add value %1 to end of %2', [N('VALUE', 0, null), A('LIST', 'Array')], { toolbox: LIST_IN, js: 'R.arr(%LIST).push(%VALUE);', ts: '%LIST.push(%VALUE)' });
def('lists_pop', 'any', 'get and remove last value from %1', [A('LIST', 'Array')], { toolbox: LIST_IN, js: 'R.arr(%LIST).pop()', ts: '%LIST.pop()' });
def('lists_remove_at', 'any', 'get and remove value at %1 from %2', [N('INDEX', 0), A('LIST', 'Array')], { toolbox: LIST_IN, js: '(R.arr(%LIST).splice(R.num(%INDEX), 1)[0])', ts: '%LIST.removeAt(%INDEX)' });
def('lists_insert', 'stmt', '%1 insert at %2 value %3', [A('LIST', 'Array'), N('INDEX', 0), N('VALUE', 0, null)], { toolbox: LIST_IN, js: 'R.arr(%LIST).splice(R.num(%INDEX), 0, %VALUE);', ts: '%LIST.insertAt(%INDEX, %VALUE)' });
def('lists_reverse', 'stmt', 'reverse %1', [A('LIST', 'Array')], { toolbox: LIST_IN, js: 'R.arr(%LIST).reverse();', ts: '%LIST.reverse()' });

// ---------- Text ----------
cat('text');
entry('text', { fields: { TEXT: '' }, real: true });
def('text_length', 'num', 'length of %1', [S('VALUE', 'Hello')], { js: 'R.str(%VALUE).length', ts: '%VALUE.length' });
Blockly.Blocks.text_join = {
  init() { this.setColour(CATS.text.colour); this.setOutput(true, 'String'); this.setInputsInline(true); this.itemCount = 2; this.rebuild(); },
  saveExtraState() { return { itemCount: this.itemCount }; },
  loadExtraState(s) { this.itemCount = s.itemCount; this.rebuild(); },
  rebuild: Blockly.Blocks.lists_create_with.rebuild,
};
Blockly.Blocks.text_join.rebuild = function (addShadows = false) {
  const keep = {};
  for (const inp of this.inputList) if (inp.connection && inp.connection.targetConnection) keep[inp.name] = inp.connection.targetConnection;
  while (this.inputList.length) this.removeInput(this.inputList[0].name);
  this.appendDummyInput('LBL').appendField('join');
  for (let i = 0; i < this.itemCount; i++) this.appendValueInput('ADD' + i);
  const d = this.appendDummyInput('BTN');
  if (this.itemCount > 1) d.appendField(plusMinusField('-', (b) => { const c = b.getInput('ADD' + (b.itemCount - 1)).connection.targetConnection; if (c) c.getSourceBlock().dispose(); b.itemCount--; b.rebuild(true); }));
  d.appendField(plusMinusField('+', (b) => { b.itemCount++; b.rebuild(true); }));
  for (const [name, conn] of Object.entries(keep)) { const inp = this.getInput(name); if (inp) inp.connection.connect(conn); else conn.getSourceBlock().dispose(); }
  if (addShadows && this.workspace && !this.isInFlyout) {
    for (let i = 0; i < this.itemCount; i++) {
      const inp = this.getInput('ADD' + i);
      if (inp.connection.targetConnection) continue;
      const sh = this.workspace.newBlock('text'); sh.setShadow(true); sh.initSvg(); sh.render();
      inp.connection.connect(sh.outputConnection);
    }
  }
};
SPECS.text_join = { type: 'text_join', kind: 'str', cat: 'text', js: (b, g) => `(${['""'].concat(g.listItems(b).map((c) => `R.str(${c})`)).join(' + ')})`, ts: (b, g) => g.tsListItems(b).join(' + '), shadows: {} };
TOOLBOX_ITEMS.text.push({ type: 'text_join', extraState: { itemCount: 2 }, inputs: { ADD0: { shadow: { type: 'text', fields: { TEXT: 'Hello' } } }, ADD1: { shadow: { type: 'text', fields: { TEXT: 'World' } } } } });
def('text_compare', 'num', 'compare %1 to %2', [S('A', ''), S('B', '')], { js: 'R.compare(%A, %B)', ts: '%A.compare(%B)' });
def('text_parse', 'num', 'parse to number %1', [S('TEXT', '123')], { js: 'R.parseFloat(%TEXT)', ts: 'parseFloat(%TEXT)' });
def('text_char_at', 'str', 'char from %1 at %2', [S('TEXT', 'this'), N('AT', 0)], { js: 'R.charAt(%TEXT, %AT)', ts: '%TEXT.charAt(%AT)' });
def('text_substr', 'str', 'substring of %1 from %2 of length %3', [S('TEXT', 'this'), N('FROM', 0), N('LEN', 10)], { js: 'R.substr(%TEXT, %FROM, %LEN)', ts: '%TEXT.substr(%FROM, %LEN)' });
def('text_includes', 'bool', '%1 includes %2', [S('TEXT', 'this'), S('FIND', '')], { js: 'R.includes(%TEXT, %FIND)', ts: '%TEXT.includes(%FIND)' });
def('text_convert', 'str', 'convert %1 to text', [N('VALUE', 0, null)], { js: 'R.str(%VALUE)', ts: 'convertToText(%VALUE)' });
def('text_from_code', 'str', 'text from char code %1', [N('CODE', 0)], { js: 'String.fromCharCode(R.num(%CODE))', ts: 'String.fromCharCode(%CODE)' });

// ---------- Game ----------
cat('game');
const SPRITE_IN = { inputs: { SPRITE: { block: { type: 'variables_get', fields: { VAR: { name: 'sprite' } } } } } };
TOOLBOX_ITEMS.game.push({ type: 'variables_set', varName: 'sprite', inputs: { VALUE: { block: { type: 'game_create_sprite', inputs: { X: { shadow: { type: 'math_number', fields: { NUM: 2 } } }, Y: { shadow: { type: 'math_number', fields: { NUM: 2 } } } } } } } });
def('game_create_sprite', 'sprite', 'create sprite at x: %1 y: %2', [N('X', 2), N('Y', 2)], { hidden: true, js: 'R.createSprite(%X, %Y)', ts: 'game.createSprite(%X, %Y)' });
def('game_delete', 'stmt', 'delete %1', [A('SPRITE', 'Sprite')], { toolbox: SPRITE_IN, js: 'R.spriteDelete(%SPRITE);', ts: '%SPRITE.delete()' });
def('game_move', 'stmt', '%1 move by %2', [A('SPRITE', 'Sprite'), N('N', 1)], { toolbox: SPRITE_IN, js: 'R.spriteMove(%SPRITE, %N);', ts: '%SPRITE.move(%N)' });
def('game_turn', 'stmt', '%1 turn %2 by (°) %3', [A('SPRITE', 'Sprite'), D('DIR', ['right', 'left']), N('DEG', 45)], { toolbox: SPRITE_IN, js: 'R.spriteTurn(%SPRITE, @DIR, %DEG);', ts: '%SPRITE.turn(Direction.Right, %DEG)' });
const SPRITE_PROPS = [['x', 'x'], ['y', 'y'], ['direction', 'direction'], ['brightness', 'brightness'], ['blink', 'blink']];
def('game_change', 'stmt', '%1 change %2 by %3', [A('SPRITE', 'Sprite'), D('PROP', SPRITE_PROPS), N('V', 1)], { toolbox: SPRITE_IN, js: 'R.spriteChange(%SPRITE, @PROP, %V);', ts: '%SPRITE.change(LedSpriteProperty.$PROP, %V)' });
def('game_set', 'stmt', '%1 set %2 to %3', [A('SPRITE', 'Sprite'), D('PROP', SPRITE_PROPS), N('V', 0)], { toolbox: SPRITE_IN, js: 'R.spriteSet(%SPRITE, @PROP, %V);', ts: '%SPRITE.set(LedSpriteProperty.$PROP, %V)' });
def('game_get', 'num', '%1 %2', [A('SPRITE', 'Sprite'), D('PROP', SPRITE_PROPS)], { toolbox: SPRITE_IN, js: 'R.spriteGet(%SPRITE, @PROP)', ts: '%SPRITE.get(LedSpriteProperty.$PROP)' });
def('game_bounce', 'stmt', '%1 if on edge, bounce', [A('SPRITE', 'Sprite')], { toolbox: SPRITE_IN, js: 'R.spriteBounce(%SPRITE);', ts: '%SPRITE.ifOnEdgeBounce()' });
def('game_touching', 'bool', 'is %1 touching %2 ?', [A('SPRITE', 'Sprite'), A('OTHER', 'Sprite')], { toolbox: SPRITE_IN, js: 'R.spriteTouching(%SPRITE, %OTHER)', ts: '%SPRITE.isTouching(%OTHER)' });
def('game_touching_edge', 'bool', 'is %1 touching edge?', [A('SPRITE', 'Sprite')], { toolbox: SPRITE_IN, js: 'R.spriteTouchingEdge(%SPRITE)', ts: '%SPRITE.isTouchingEdge()' });
def('game_is_deleted', 'bool', 'is %1 deleted', [A('SPRITE', 'Sprite')], { toolbox: SPRITE_IN, js: 'R.spriteIsDeleted(%SPRITE)', ts: '%SPRITE.isDeleted()' });
def('game_add_score', 'stmt', 'change score by %1', [N('N', 1)], { js: 'R.addScore(%N);', ts: 'game.addScore(%N)' });
def('game_set_score', 'stmt', 'set score %1', [N('N', 0)], { js: 'R.setScore(%N);', ts: 'game.setScore(%N)' });
def('game_score', 'num', 'score', [], { js: 'R.score()', ts: 'game.score()' });
def('game_countdown', 'stmt', 'start countdown (ms) %1', [N('MS', 10000)], { js: 'R.startCountdown(%MS);', ts: 'game.startCountdown(%MS)' });
def('game_over', 'stmt', 'game over', [], { js: 'yield* R.gameOver(F);', ts: 'game.gameOver()' });
def('game_is_over', 'bool', 'is game over', [], { js: 'R.isGameOver()', ts: 'game.isGameOver()' });

// ---------- Images ----------
cat('images');
const IMG_IN = { inputs: { IMAGE: { block: { type: 'variables_get', fields: { VAR: { name: 'myImage' } } } } } };
def('images_show', 'stmt', 'show image %1 at offset %2', [A('IMAGE', 'Image'), N('OFFSET', 0)], { toolbox: IMG_IN, js: 'yield* R.showImage(F, %IMAGE, %OFFSET);', ts: '%IMAGE.showImage(%OFFSET)' });
def('images_scroll', 'stmt', 'scroll image %1 with offset %2 and interval (ms) %3', [A('IMAGE', 'Image'), N('OFFSET', 1), N('MS', 200)], { toolbox: IMG_IN, js: 'yield* R.scrollImg(F, %IMAGE, %OFFSET, %MS);', ts: '%IMAGE.scrollImage(%OFFSET, %MS)' });
def('images_create', 'img', 'create image %1', [Fd({ type: 'field_ledmatrix', name: 'LEDS' })], { js: 'R.image(@LEDS)', ts: (b) => `images.createImage(\`\n${b.getFieldValue('LEDS').split(' ').map((r) => '    ' + r.split('').join(' ')).join('\n')}\n    \`)` });
def('images_create_big', 'img', 'create big image %1', [Fd({ type: 'field_ledmatrix', name: 'LEDS', value: FieldLedMatrix.blank(10), cols: 10 })], { js: 'R.image(@LEDS)', ts: 'images.createBigImage(`...`)' });
def('images_arrow', 'img', 'arrow image %1', [D('DIR', arrowOptions)], { js: 'R.arrowImage(@DIR)', ts: 'images.arrowImage(ArrowNames.$DIR)' });
def('images_icon', 'img', 'icon image %1', [Fd({ type: 'field_icongrid', name: 'ICON', options: iconOptions(), columns: 5 })], { js: 'R.iconImage(@ICON)', ts: 'images.iconImage(IconNames.$ICON)' });

// ---------- Pins ----------
cat('pins');
const PINS_ALL = ['P0', 'P1', 'P2', 'P3', 'P4', 'P10'];
def('pins_digital_read', 'num', 'digital read pin %1', [D('PIN', PINS_ALL)], { js: 'R.digitalRead(@PIN)', ts: 'pins.digitalReadPin(DigitalPin.$PIN)' });
def('pins_digital_write', 'stmt', 'digital write pin %1 to %2', [D('PIN', PINS_ALL), N('VALUE', 0)], { js: 'R.digitalWrite(@PIN, %VALUE);', ts: 'pins.digitalWritePin(DigitalPin.$PIN, %VALUE)' });
def('pins_analog_read', 'num', 'analog read pin %1', [D('PIN', PINS_ALL)], { js: 'R.analogRead(@PIN)', ts: 'pins.analogReadPin(AnalogPin.$PIN)' });
def('pins_analog_write', 'stmt', 'analog write pin %1 to %2', [D('PIN', PINS_ALL), N('VALUE', 1023)], { js: 'R.analogWrite(@PIN, %VALUE);', ts: 'pins.analogWritePin(AnalogPin.$PIN, %VALUE)' });
entry('math_map', {});
def('pins_servo_write', 'stmt', 'servo write pin %1 to %2', [D('PIN', PINS_ALL), N('VALUE', 180)], { js: 'R.servoWrite(@PIN, %VALUE);', ts: 'pins.servoWritePin(AnalogPin.$PIN, %VALUE)' });

// ---------- Serial ----------
cat('serial');
def('serial_write_line', 'stmt', 'serial write line %1', [S('TEXT', '')], { js: 'R.writeLine(%TEXT);', ts: 'serial.writeLine(%TEXT)' });
def('serial_write_number', 'stmt', 'serial write number %1', [N('VALUE', 0)], { js: 'R.writeNumber(%VALUE);', ts: 'serial.writeNumber(%VALUE)' });
def('serial_write_value', 'stmt', 'serial write value %1 = %2', [S('NAME', 'x'), N('VALUE', 0)], { js: 'R.writeValue(%NAME, %VALUE);', ts: 'serial.writeValue(%NAME, %VALUE)' });
def('serial_write_string', 'stmt', 'serial write string %1', [S('TEXT', '')], { js: 'R.writeString(%TEXT);', ts: 'serial.writeString(%TEXT)' });
def('serial_write_numbers', 'stmt', 'serial write numbers %1', [A('LIST', 'Array')], { js: 'R.writeNumbers(%LIST);', ts: 'serial.writeNumbers(%LIST)' });

// ---------- Control ----------
cat('control');
def('control_millis', 'num', 'millis (ms)', [], { js: 'R.runningTime()', ts: 'control.millis()' });
def('control_background', 'stmt', 'run in background %1', [], { extra: { message1: '%1', args1: [{ type: 'input_statement', name: 'HANDLER' }] }, js: 'R.runInBackground(function* (F) {\n{HANDLER}});', ts: 'control.inBackground(function () {\n{HANDLER}})' });
Blockly.Blocks.control_background.init = function () { this.jsonInit({ message0: 'run in background', message1: '%1', args1: [{ type: 'input_statement', name: 'HANDLER' }], previousStatement: null, nextStatement: null, colour: CATS.control.colour }); };
def('control_reset', 'stmt', 'reset', [], { extra: { nextStatement: undefined }, js: 'R.resetDevice(); return;', ts: 'control.reset()' });
def('control_wait_micros', 'stmt', 'wait (µs) %1', [N('US', 4)], { js: 'yield* R.waitMicros(F, %US);', ts: 'control.waitMicros(%US)' });
def('control_raise_event', 'stmt', 'raise event|from source %1 with value %2', [N('SRC', 0), N('VAL', 0)], { js: 'yield* R.raiseEvent(F, R.num(%SRC), R.num(%VAL));', ts: 'control.raiseEvent(%SRC, %VAL)' });
def('control_on_event', 'hat', 'on event from %1 with value %2', [N('SRC', 0), N('VAL', 0)], { js: 'R.onEvent(R.num(%SRC), R.num(%VAL), function* (F) {\n{HANDLER}});', ts: 'control.onEvent(%SRC, %VAL, function () {\n{HANDLER}})' });
def('control_device_name', 'str', 'device name', [], { js: 'R.deviceName()', ts: 'control.deviceName()' });
def('control_serial_number', 'num', 'device serial number', [], { js: 'R.deviceSerial()', ts: 'control.deviceSerialNumber()' });

// Event blocks: one per event, like MakeCode (a duplicate is disabled)
const HAT_TYPES = new Set(Object.values(SPECS).filter((s) => s.kind === 'hat').map((s) => s.type).concat(['function_definition']));
function eventKey(b) {
  if (b.type === 'function_definition') return 'fn:' + b.getFieldValue('NAME');
  if (b.type === 'basic_forever' || b.type === 'loops_every') return null; // several forever loops are allowed
  const parts = [b.type];
  for (const inp of b.inputList) for (const f of inp.fieldRow) if (f.name && f.name !== 'NAME') parts.push(f.getValue());
  if (b.type === 'control_on_event') return null;
  return parts.join(':');
}

// ---------- Toolbox ----------
function shadowState(sh) {
  if (!sh) return undefined;
  const out = { type: sh.type };
  if (sh.fields) out.fields = { ...sh.fields };
  if (sh.inputs) out.inputs = sh.inputs;
  else if (SPECS[sh.type] && Object.keys(SPECS[sh.type].shadows).length) {
    out.inputs = {};
    for (const [n, s] of Object.entries(SPECS[sh.type].shadows)) out.inputs[n] = { shadow: shadowState(s) };
  }
  return out;
}
function toolboxBlock(item) {
  const spec = SPECS[item.type] || { shadows: {} };
  if (item.real) return { kind: 'block', type: item.type, fields: item.fields };
  const b = { kind: 'block', type: item.type };
  const inputs = {};
  for (const [n, sh] of Object.entries(spec.shadows || {})) inputs[n] = { shadow: shadowState(sh) };
  for (const [n, sh] of Object.entries(item.shadows || {})) inputs[n] = { shadow: shadowState(sh) };
  Object.assign(inputs, item.inputs || {});
  if (Object.keys(inputs).length) b.inputs = inputs;
  if (item.fields) b.fields = item.fields;
  if (item.extraState) b.extraState = item.extraState;
  if (item.varName) b.fields = { VAR: { name: item.varName } };
  return b;
}
function flyoutContents(key) {
  const out = [];
  for (const it of TOOLBOX_ITEMS[key] || []) {
    if (it.label) out.push({ kind: 'label', text: it.label, 'web-class': 'mbFlyoutGroup' });
    else out.push(toolboxBlock(it));
  }
  return out;
}
function buildToolbox(advanced) {
  const contents = [];
  for (const c of CAT_ORDER) {
    const C = CATS[c];
    if (C.advanced && !advanced) continue;
    const entryC = { kind: 'category', name: C.label || C.name, colour: C.colour, cssconfig: { row: 'blocklyTreeRow mbCat mbCat-' + c, icon: 'mbCatIcon mbIcon-' + c } };
    if (c === 'variables') entryC.custom = 'MB_VARIABLES';
    else if (c === 'functions') entryC.custom = 'MB_FUNCTIONS';
    else entryC.contents = [{ kind: 'label', text: C.label || C.name, 'web-class': 'mbFlyoutHeading' }, ...flyoutContents(c)];
    if (TOOLBOX_ITEMS[c + ':more']) {
      contents.push({ ...entryC, kind: 'category', expanded: false, contents: [...entryC.contents, { kind: 'category', name: 'more', colour: C.colour, cssconfig: { row: 'blocklyTreeRow mbCat mbMore mbCat-' + c, icon: 'mbCatIcon mbIcon-more' }, contents: [{ kind: 'label', text: 'more', 'web-class': 'mbFlyoutHeading' }, ...flyoutContents(c + ':more')] }] });
    } else contents.push(entryC);
  }
  return { kind: 'categoryToolbox', contents };
}

// Variables: "Make a Variable...", set, change, then the variables
function variablesFlyout(ws) {
  const vars = ws.getVariablesOfType('').map((v) => v.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const out = [{ kind: 'label', text: 'Variables', 'web-class': 'mbFlyoutHeading' }, { kind: 'button', text: 'Make a Variable...', callbackKey: 'MB_MAKE_VARIABLE', 'web-class': 'mbFlyoutButton' }];
  if (vars.length) {
    const first = vars.includes(App && App.lastVar) ? App.lastVar : vars[0];
    out.push({ kind: 'block', type: 'variables_set', fields: { VAR: { name: first } }, inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } });
    out.push({ kind: 'block', type: 'variables_change', fields: { VAR: { name: first } }, inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } });
    out.push({ kind: 'label', text: 'Your Variables', 'web-class': 'mbFlyoutGroup' });
    for (const v of vars) out.push({ kind: 'block', type: 'variables_get', fields: { VAR: { name: v } } });
  }
  return out;
}
function functionsFlyout(ws) {
  const out = [{ kind: 'label', text: 'Functions', 'web-class': 'mbFlyoutHeading' }, { kind: 'button', text: 'Make a Function...', callbackKey: 'MB_MAKE_FUNCTION', 'web-class': 'mbFlyoutButton' }];
  const defs = ws.getTopBlocks(false).filter((b) => b.type === 'function_definition');
  for (const d of defs) {
    const state = { name: d.getFieldValue('NAME'), params: d.mbParams || [] };
    const inputs = {};
    for (const p of state.params) inputs['A_' + p.name] = { shadow: p.type === 'text' ? { type: 'text', fields: { TEXT: 'abc' } } : p.type === 'boolean' ? { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } : { type: 'math_number', fields: { NUM: 1 } } };
    out.push({ kind: 'block', type: 'function_call', extraState: state, inputs });
  }
  if (defs.length) {
    out.push({ kind: 'block', type: 'function_return', inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } } });
    for (const d of defs) out.push({ kind: 'block', type: 'function_call_output', extraState: { name: d.getFieldValue('NAME'), params: d.mbParams || [] } });
  }
  return out;
}

// All the blocks of the toolbox, for the search box
function allToolboxBlocks() {
  const out = [];
  for (const [key, items] of Object.entries(TOOLBOX_ITEMS)) {
    for (const it of items) if (!it.label) out.push({ key, item: it, text: blockSearchText(it.type) });
  }
  return out;
}
function blockSearchText(type) {
  try {
    const def = Blockly.Blocks[type];
    if (!def) return type;
    const fake = { jsonInit(j) { this.msg = (j.message0 || '') + ' ' + (j.message1 || ''); }, setColour() {}, setPreviousStatement() {}, setNextStatement() {}, setInputsInline() {}, setOutput() {}, appendDummyInput() { const self = this; const o = { appendField(f) { self.msg = (self.msg || '') + ' ' + (typeof f === 'string' ? f : ''); return o; }, setCheck() { return o; } }; return o; }, appendValueInput() { return this.appendDummyInput(); }, appendStatementInput() { return this.appendDummyInput(); }, removeInput() {}, inputList: [] };
    def.init.call(Object.assign(fake, { rebuild() {}, setDragStrategy: null }));
    return String(fake.msg || '').replace(/%\d/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  } catch (e) { return type; }
}

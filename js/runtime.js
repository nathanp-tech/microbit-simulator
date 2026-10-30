// micro:bit virtual machine: runs the JavaScript generated from the blocks (js/generator.js).
// Deterministic: time is virtual (ms). Each event handler / forever loop is a "fiber" (a generator function)
// that gives the hand back on pause, show…, like the fibers of the real micro:bit.
'use strict';

class StopSignal extends Error {}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shared by the boards of one simulation (MakeCode shows a second micro:bit when the radio is used).
class RadioBus {
  constructor() { this.boards = []; }
  send(from, packet) {
    for (const b of this.boards) if (b !== from && b.radio.on && b.radio.group === from.radio.group) b.receivePacket({ ...packet });
  }
}

// MakeCode number to text: 3, 3.5, -0.25 (no "3.0")
function numStr(n) {
  if (typeof n !== 'number') return String(n);
  if (Number.isInteger(n)) return String(n);
  if (!isFinite(n)) return n > 0 ? 'Infinity' : n < 0 ? '-Infinity' : 'NaN';
  return String(Math.round(n * 1e6) / 1e6);
}
const toStr = (v) => (typeof v === 'number' ? numStr(v) : v === undefined ? 'undefined' : v === null ? 'null' : Array.isArray(v) ? v.map(toStr).join(',') : typeof v === 'object' && v.kind === 'image' ? 'Image' : String(v));

class MbImage {
  constructor(w, data) { this.kind = 'image'; this.w = w; this.data = data || new Array(w * 5).fill(0); }
  static fromPattern(p) {
    const rows = String(p).trim().split(/\s+/);
    const w = Math.max(5, ...rows.map((r) => r.length));
    const img = new MbImage(w);
    rows.slice(0, 5).forEach((r, y) => { for (let x = 0; x < r.length; x++) img.data[y * w + x] = r[x] === '#' ? 255 : 0; });
    return img;
  }
  static fromText(s) {
    const chars = String(s).split('');
    const img = new MbImage(Math.max(5, chars.length * 6));
    chars.forEach((c, i) => {
      const g = glyph(c);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (g[y][x]) img.data[y * img.w + i * 6 + x] = 255;
    });
    return img;
  }
  get(x, y) { return x >= 0 && x < this.w && y >= 0 && y < 5 ? this.data[y * this.w + x] : 0; }
  set(x, y, v) { if (x >= 0 && x < this.w && y >= 0 && y < 5) this.data[y * this.w + x] = v; }
}

const FOREVER_PAUSE = 20;
const SPIN_YIELD = 500; // loop turns without a pause before the fiber gives the hand back

class Microbit {
  constructor({ id = 0, bus = null, seed = Date.now(), onTone = null, onSerial = null, serial = 'A1B2C3D4' } = {}) {
    this.id = id;
    this.bus = bus;
    if (bus) bus.boards.push(this);
    this.onTone = onTone; // (freq, ms) for the speaker: freq 0 stops
    this.onSerial = onSerial;
    this.serialNumber = serial;
    this.rng = mulberry32(seed);
    this.reset();
  }

  // ---------- Hardware state ----------
  reset() {
    for (const f of this.fibers || []) f.done = true; // fibers of a previous run never come back
    this.now = 0;
    this.leds = new Array(25).fill(0);
    this.brightness = 255;
    this.ledEnabled = true;
    this.displayMode = 'bw';
    this.buttons = { A: false, B: false };
    this.logo = false;
    this.pinsIn = { P0: 0, P1: 0, P2: 0 }; // pressed (touched) pins
    this.analogIn = { P0: 0, P1: 0, P2: 0 }; // slider values for analog read
    this.pinsOut = {};
    this.temperature = 21;
    this.light = 128;
    this.heading = 90;
    this.soundLevel = 0;
    this.accel = { x: 0, y: 0, z: -1023 };
    this.gesture = 'ScreenUp';
    this.shakeUntil = 0;
    this.volume = 128;
    this.tempo = 120;
    this.radio = { on: false, group: 0, power: 6, band: 7, sendSerial: false, last: null };
    this.used = {}; // what the program uses (the simulator shows the matching controls)
    this.fibers = [];
    this.handlers = {};
    this.running = false;
    this.error = null; this.errorBlock = null;
    this.log = []; // what was shown: {t, kind, value}
    this.frames = [{ t: 0, img: '0'.repeat(25) }];
    this.tones = [];
    this.serialOut = [];
    this.display = { busy: null, epoch: 0 };
    this.sprites = [];
    this.game = { score: 0, over: false, countdownEnd: 0, paused: false };
    this.variables = {};
    this.lastFrameKey = '0'.repeat(25);
    this.radioQueue = [];
    this.soundTill = 0;
  }

  // ---------- Loading and running a program ----------
  load(code, { variables = {} } = {}) {
    this.reset();
    const fn = new Function('R', 'V', code); // may throw a SyntaxError
    this.V = Object.create(null);
    Object.assign(this.V, variables);
    this.running = true;
    this.mainDone = false;
    this.handlers = {};
    this.startFns = [];
    this.foreverFns = [];
    this.fn = Object.create(null);
    this.lastCode = { code, opts: { variables } };
    fn(this, this.V);
    // "on start" first, then the forever loops (they start when on start gives the hand back)
    this.spawn(function* (F, R) { for (const f of R.startFns) yield* f(F); R.mainDone = true; }, 'start');
    for (const f of this.foreverFns) this.spawn(function* (F, R) { while (true) { yield* f(F); yield FOREVER_PAUSE; } }, 'forever');
    if (this.used.radio) { this.radio.on = true; if (!this.radio.group) this.radio.group = 0; }
  }
  stop() {
    this.running = false;
    this.fibers = [];
    if (this.onTone) this.onTone(0, 0);
  }

  spawn(gen, kind, args = []) {
    const F = { gen: null, wake: this.now, until: null, block: null, spin: 0, kind, done: false, seq: Microbit.seq = (Microbit.seq || 0) + 1 };
    F.gen = gen(F, this, ...args);
    this.fibers.push(F);
    return F;
  }

  // Runs the program until virtual time now + ms. budget: real ms allowed (keeps the page responsive).
  advance(ms, budget = 40) {
    if (!this.running) { this.now += ms; return; }
    const target = this.now + ms;
    const t0 = performance.now();
    while (this.running) {
      this.deliverRadio();
      let ran = false;
      // run every fiber that is ready at this time, oldest first
      for (const F of this.fibers.slice()) {
        if (F.done || !this.running) continue;
        if (F.wake > this.now) continue;
        if (F.until) { let ok = false; try { ok = F.until(); } catch (e) { ok = true; } if (!ok) continue; F.until = null; }
        this.step(F);
        ran = true;
        if (performance.now() - t0 > budget) break;
      }
      this.fibers = this.fibers.filter((F) => !F.done);
      if (performance.now() - t0 > budget) break;
      if (ran) continue;
      // nothing ready: jump to the next wake-up
      let next = target;
      for (const F of this.fibers) if (!F.until && F.wake < next) next = F.wake;
      if (this.game.countdownEnd && !this.game.over && this.game.countdownEnd < next) next = this.game.countdownEnd;
      if (next > this.now) this.now = Math.min(next, target);
      this.checkCountdown();
      if (this.now >= target) break;
    }
    if (this.now < target && performance.now() - t0 <= budget) this.now = target;
  }

  step(F) {
    let r;
    try {
      r = F.gen.next();
    } catch (e) {
      F.done = true;
      if (e instanceof StopSignal) return;
      this.fail(e, F);
      return;
    }
    if (r.done) { F.done = true; return; }
    const v = r.value;
    if (typeof v === 'number') F.wake = this.now + Math.max(0, v);
    else if (v && v.until) { F.until = v.until; F.wake = this.now; }
    else F.wake = this.now;
  }

  fail(e, F) {
    let msg = e && e.message ? e.message : String(e);
    if (e instanceof RangeError && /call stack/i.test(msg)) msg = 'A function calls itself without end.';
    this.error = msg;
    this.errorBlock = F ? F.block : null;
    this.running = false;
    this.fibers = [];
    // the real micro:bit shows a sad face when the program crashes
    this.setImage(MbImage.fromPattern(ICONS.Sad));
    this.logShown('error', msg);
  }

  // ---------- Helpers for the generated code ----------
  b(F, id) { F.block = id; }
  spinCheck(F) { return ++F.spin % SPIN_YIELD === 0; }
  num(v) { if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; const n = Number(v); return isNaN(n) ? 0 : n; }
  str(v) { return toStr(v); }
  logShown(kind, value) {
    this.log.push({ t: this.now, kind, value });
    if (this.log.length > 2000) this.log.splice(0, 500);
  }

  // ---------- Events (registered by the generated code) ----------
  on(key, fn) { this.handlers[key] = { fn, running: 0, queue: [] }; }
  fire(key, args = []) {
    const h = this.handlers[key];
    if (!h || !this.running) return false;
    // like the micro:bit: an event that arrives while its handler is still running waits for it
    if (h.running) { if (h.queue.length < 5) h.queue.push(args); return true; }
    this.runHandler(h, args);
    return true;
  }
  runHandler(h, args) {
    h.running++;
    const self = this;
    this.spawn(function* (F) {
      try { yield* h.fn(F, ...args); } finally {
        h.running--;
        if (h.queue.length) { const next = h.queue.shift(); self.runHandler(h, next); }
      }
    }, 'event');
  }
  onStart(fn) { this.startFns.push(fn); }
  forever(fn) { this.foreverFns.push(fn); }
  onButton(btn, fn) { this.used.buttons = true; if (btn === 'AB') this.used.ab = true; this.on('btn:' + btn, fn); }
  onGesture(g, fn) { this.used.accel = true; this.used.gestures = (this.used.gestures || new Set()).add(g); this.on('gesture:' + g, fn); }
  onPin(pin, ev, fn) { this.used.pins = true; this.on(`pin:${pin}:${ev}`, fn); }
  onLogo(ev, fn) { this.used.logo = true; this.on('logo:' + ev, fn); }
  onSound(level, fn) { this.used.sound = true; this.on('sound:' + level, fn); }
  every(ms, fn) {
    const R = this;
    this.foreverFns.push(function* (F) { yield* fn(F); yield Math.max(1, R.num(ms)) - FOREVER_PAUSE; });
  }
  runInBackground(fn) { this.spawn(fn, 'background'); }
  onEvent(src, val, fn) { this.on(`ev:${src}:${val}`, fn); }
  *raiseEvent(F, src, val) { this.fire(`ev:${src}:${val}`); this.fire(`ev:${src}:0`); }

  // ---------- Inputs from the simulator (or the test scripts) ----------
  buttonDown(b) {
    if (b === 'AB') { this.buttons.A = this.buttons.B = true; return; }
    this.buttons[b] = true;
  }
  buttonUp(b) {
    if (b === 'AB') { this.buttons.A = this.buttons.B = false; this.fire('btn:AB'); return; }
    const other = b === 'A' ? 'B' : 'A';
    // A and B together: the "A+B" event, not A or B
    if (this.buttons[other]) { this.buttons[b] = false; this.abPending = true; return; }
    this.buttons[b] = false;
    if (this.abPending) { this.abPending = false; this.fire('btn:AB'); return; }
    this.fire('btn:' + b);
  }
  click(b) { this.buttonDown(b); this.buttonUp(b); }
  doGesture(g) {
    if (g === 'Shake') { this.shakeUntil = this.now + 300; this.fire('gesture:Shake'); return; }
    const acc = { LogoUp: [0, -1023, 0], LogoDown: [0, 1023, 0], ScreenUp: [0, 0, -1023], ScreenDown: [0, 0, 1023], TiltLeft: [-1023, 0, 0], TiltRight: [1023, 0, 0], FreeFall: [0, 0, 0] }[g];
    if (acc) { this.accel = { x: acc[0], y: acc[1], z: acc[2] }; this.gesture = g; } else this.shakeUntil = this.now + 300;
    this.fire('gesture:' + g);
  }
  setAccel(x, y, z) {
    this.accel = { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
    const t = 800; // like the micro:bit: about 1 g on one axis
    let g = null;
    if (x < -t) g = 'TiltLeft'; else if (x > t) g = 'TiltRight';
    else if (y < -t) g = 'LogoUp'; else if (y > t) g = 'LogoDown';
    else if (z < -t) g = 'ScreenUp'; else if (z > t) g = 'ScreenDown';
    if (g && g !== this.gesture) { this.gesture = g; this.fire('gesture:' + g); }
  }
  pinDown(p) { this.pinsIn[p] = 1; this.fire(`pin:${p}:down`); }
  pinUp(p) { this.pinsIn[p] = 0; this.fire(`pin:${p}:up`); this.fire(`pin:${p}:pressed`); }
  logoDown() { this.logo = true; this.fire('logo:down'); }
  logoUp() { this.logo = false; this.fire('logo:up'); this.fire('logo:pressed'); }
  setSoundLevel(v) {
    const was = this.soundLevel;
    this.soundLevel = v;
    if (was < 128 && v >= 128) this.fire('sound:loud');
    if (was >= 128 && v < 128) this.fire('sound:quiet');
  }

  // ---------- Basic ----------
  *showNumber(F, n, interval = 150) {
    n = this.num(n);
    this.used.display = true;
    this.logShown('number', n);
    const s = numStr(n);
    if (s.length === 1) { this.cancelAnimations(); this.setImage(MbImage.fromText(s)); yield interval * 5; return; }
    yield* this.scrollText(F, s, interval);
  }
  *showString(F, s, interval = 150) {
    s = toStr(s);
    this.used.display = true;
    this.logShown('text', s);
    if (s.length === 0) { this.cancelAnimations(); this.clear(); yield interval * 5; return; }
    if (s.length === 1) { this.cancelAnimations(); this.setImage(MbImage.fromText(s)); yield interval * 5; return; }
    yield* this.scrollText(F, s, interval);
  }
  *scrollText(F, s, interval) {
    yield* this.scrollImage(F, MbImage.fromText(s), 1, interval, true);
  }
  // Scrolls an image from the right edge until it has left the screen. Waits for the scrolls of other fibers.
  *scrollImage(F, img, step, interval, fromRight) {
    interval = Math.max(1, this.num(interval));
    step = Math.max(1, Math.round(this.num(step)) || 1);
    const epoch = this.display.epoch;
    if (this.display.busy && this.display.busy !== F) yield { until: () => !this.display.busy || this.display.epoch !== epoch };
    if (this.display.epoch !== epoch) return;
    this.display.busy = F;
    try {
      const start = fromRight ? -5 : 0;
      for (let off = start; off < img.w; off += step) {
        if (this.display.epoch !== epoch) return;
        const frame = new MbImage(5);
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) frame.set(x, y, img.get(x + off, y));
        this.setImage(frame);
        yield interval;
      }
      if (this.display.epoch === epoch) this.clear();
    } finally { if (this.display.busy === F) this.display.busy = null; }
  }
  cancelAnimations() { if (this.display.busy) { this.display.epoch++; this.display.busy = null; } }
  *showLeds(F, pattern, interval = 400) {
    this.used.display = true;
    this.cancelAnimations();
    const img = MbImage.fromPattern(pattern);
    this.logShown('leds', this.imgKey(img));
    this.setImage(img);
    yield this.num(interval);
  }
  *showIcon(F, name, interval = 600) {
    this.used.display = true;
    this.cancelAnimations();
    this.logShown('icon', name);
    this.setImage(MbImage.fromPattern(ICONS[name] || ICONS.Heart));
    yield this.num(interval);
  }
  *showArrow(F, dir, interval = 600) {
    this.used.display = true;
    this.cancelAnimations();
    const name = typeof dir === 'number' ? ARROW_ORDER[((Math.round(dir) % 8) + 8) % 8] : dir;
    this.logShown('arrow', name);
    this.setImage(MbImage.fromPattern(ARROWS[name] || ARROWS.North));
    yield this.num(interval);
  }
  clearScreen() { this.cancelAnimations(); this.clear(); this.logShown('clear', ''); }
  *pause(F, ms) { yield Math.max(0, this.num(ms)); }

  // ---------- LED ----------
  setImage(img) {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) this.leds[y * 5 + x] = img.get(x, y);
    this.frameChanged();
  }
  clear() { this.leds.fill(0); this.frameChanged(); }
  frameChanged() {
    const key = this.leds.map((v) => (v > 0 ? '1' : '0')).join('');
    if (key === this.lastFrameKey) return;
    this.lastFrameKey = key;
    this.frames.push({ t: this.now, img: key });
    if (this.frames.length > 4000) this.frames.splice(0, 1000);
  }
  imgKey(img) { let k = ''; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) k += img.get(x, y) > 0 ? '1' : '0'; return k; }
  xy(x, y) { x = Math.round(this.num(x)); y = Math.round(this.num(y)); return x >= 0 && x < 5 && y >= 0 && y < 5 ? y * 5 + x : -1; }
  plot(x, y) { this.plotBrightness(x, y, 255); }
  plotBrightness(x, y, b) {
    this.used.display = true;
    const i = this.xy(x, y);
    if (i < 0) return;
    this.leds[i] = Math.max(0, Math.min(255, Math.round(this.num(b))));
    this.frameChanged();
  }
  unplot(x, y) { const i = this.xy(x, y); if (i >= 0) { this.leds[i] = 0; this.frameChanged(); } }
  toggle(x, y) { const i = this.xy(x, y); if (i >= 0) { this.leds[i] = this.leds[i] ? 0 : 255; this.frameChanged(); } }
  point(x, y) { const i = this.xy(x, y); return i >= 0 && this.leds[i] > 0; }
  pointBrightness(x, y) { const i = this.xy(x, y); return i >= 0 ? this.leds[i] : 0; }
  plotBarGraph(value, high) {
    this.used.display = true;
    value = this.num(value); high = this.num(high);
    this.writeLine(numStr(value)); // like MakeCode, the value also goes to the serial port
    if (high <= 0) high = Math.max(Math.abs(value), this.barHigh || 0, 1);
    this.barHigh = high;
    const v = Math.abs(value * 15 / high);
    let k = 0;
    for (let y = 4; y >= 0; --y) {
      for (let x = 0; x < 3; ++x) {
        const on = k <= v && v > 0;
        this.leds[y * 5 + 2 - x] = on ? 255 : 0;
        this.leds[y * 5 + 2 + x] = on ? 255 : 0;
        k++;
      }
    }
    this.logShown('bargraph', value);
    this.frameChanged();
  }
  setBrightness(b) { this.brightness = Math.max(0, Math.min(255, Math.round(this.num(b)))); }
  enable(on) { this.ledEnabled = !!on; }
  setDisplayMode(m) { this.displayMode = m; }
  stopAnimation() { this.cancelAnimations(); }

  // ---------- Input ----------
  buttonIsPressed(b) { this.used.buttons = true; if (b === 'AB') { this.used.ab = true; return this.buttons.A && this.buttons.B; } return !!this.buttons[b]; }
  acceleration(dim) {
    this.used.accel = true;
    const a = this.accel;
    if (dim === 'strength') return Math.round(Math.hypot(a.x, a.y, a.z));
    return a[dim];
  }
  rotation(kind) {
    this.used.accel = true;
    const a = this.accel;
    return kind === 'roll' ? Math.round(Math.atan2(a.x, -a.z) * 180 / Math.PI) : Math.round(Math.atan2(a.y, -a.z) * 180 / Math.PI);
  }
  isGesture(g) {
    this.used.accel = true;
    (this.used.gestures = this.used.gestures || new Set()).add(g);
    if (g === 'Shake') return this.now < this.shakeUntil;
    return this.gesture === g;
  }
  pinIsPressed(p) { this.used.pins = true; return !!this.pinsIn[p]; }
  logoIsPressed() { this.used.logo = true; return this.logo; }
  lightLevel() { this.used.light = true; return this.light; }
  compassHeading() { this.used.compass = true; return this.heading; }
  temperatureC() { this.used.temperature = true; return this.temperature; }
  soundLevelNow() { this.used.sound = true; return this.soundLevel; }
  magneticForce(dim) { this.used.compass = true; const r = this.heading * Math.PI / 180; return dim === 'x' ? Math.round(Math.sin(r) * 30) : dim === 'y' ? Math.round(Math.cos(r) * 30) : dim === 'z' ? 0 : 30; }
  runningTime() { return Math.floor(this.now); }
  runningTimeMicros() { return Math.floor(this.now * 1000); }

  // ---------- Music ----------
  beatMs(beats) { return (60000 / this.tempo) * this.num(beats); }
  sound(freq, ms) {
    this.used.music = true;
    this.tones.push({ t: this.now, freq: Math.round(this.num(freq)), ms: Math.round(ms) });
    if (this.tones.length > 2000) this.tones.splice(0, 500);
    if (this.onTone && this.volume > 0) this.onTone(freq, ms, this.volume);
  }
  *playTone(F, freq, ms, mode = 'until') {
    freq = this.num(freq); ms = Math.max(0, this.num(ms));
    const self = this;
    if (mode === 'until') { this.sound(freq, ms); yield ms; return; }
    // in the background (or looping): a fiber of its own plays it
    this.spawn(function* () { do { self.sound(freq, ms); yield ms; } while (mode === 'loop' && self.running); }, 'music');
  }
  ringTone(freq) { this.sound(this.num(freq), -1); }
  *rest(F, ms) { if (this.onTone) this.onTone(0, 0); yield Math.max(0, this.num(ms)); }
  *playMelody(F, notes, tempo, mode = 'until') {
    const list = typeof notes === 'string' ? parseMelody(notes) : notes;
    const t = this.num(tempo) || this.tempo;
    const self = this;
    const play = function* () {
      for (const n of list) {
        const ms = (60000 / t) * n.beats;
        if (n.freq) self.sound(n.freq, ms); else if (self.onTone) self.onTone(0, 0);
        yield ms;
      }
    };
    this.used.music = true;
    this.logShown('melody', typeof notes === 'string' ? notes : '');
    if (mode === 'until') { yield* play(); return; }
    this.melodyEpoch = (this.melodyEpoch || 0) + 1;
    const ep = this.melodyEpoch;
    this.spawn(function* () { do { if (ep !== self.melodyEpoch) return; yield* play(); } while (mode === 'loop' && self.running && ep === self.melodyEpoch); }, 'music');
  }
  stopAllSounds() { this.melodyEpoch = (this.melodyEpoch || 0) + 1; this.fibers.forEach((f) => { if (f.kind === 'music') f.done = true; }); if (this.onTone) this.onTone(0, 0); }
  setVolume(v) { this.volume = Math.max(0, Math.min(255, Math.round(this.num(v)))); }
  setTempo(bpm) { this.tempo = Math.max(4, this.num(bpm)); }
  changeTempo(d) { this.tempo = Math.max(4, this.tempo + this.num(d)); }
  *playSoundEffect(F, name, mode) {
    const SFX = { giggle: 'c5:1 e g e c', happy: 'c5:1 e g c6:2', hello: 'g4:1 c5:2', mysterious: 'a3:2 e4 a#3 f4', sad: 'g4:2 e c', slide: 'c4:1 d e f g a b c5', soaring: 'c5:1 e g c6 e g', spring: 'c4:1 g c5 g4 c5', twinkle: 'c6:1 g5 c6 g5', yawn: 'g4:4 e c' };
    yield* this.playMelody(F, SFX[name] || SFX.hello, 240, mode);
  }

  // ---------- Radio ----------
  radioSetGroup(g) { this.used.radio = true; this.radio.on = true; this.radio.group = Math.round(this.num(g)) & 255; }
  radioSend(packet) {
    this.used.radio = true;
    this.radio.on = true;
    packet.serial = this.radio.sendSerial ? this.id + 1 : 0;
    packet.time = this.runningTime();
    this.logShown('radio', packet);
    if (this.bus) this.bus.send(this, packet);
  }
  radioSendNumber(n) { this.radioSend({ type: 'number', number: this.num(n) }); }
  radioSendString(s) { this.radioSend({ type: 'string', string: toStr(s).slice(0, 19) }); }
  radioSendValue(name, v) { this.radioSend({ type: 'value', name: toStr(name).slice(0, 8), number: this.num(v) }); }
  receivePacket(p) { this.radioQueue.push(p); }
  deliverRadio() {
    while (this.radioQueue.length) {
      const p = this.radioQueue.shift();
      this.radio.last = p;
      if (p.type === 'number') this.fire('radio:number', [p.number]);
      else if (p.type === 'string') this.fire('radio:string', [p.string]);
      else this.fire('radio:value', [p.name, p.number]);
    }
  }
  onRadio(type, fn) { this.used.radio = true; this.radio.on = true; this.on('radio:' + type, fn); }
  receivedPacket(prop) {
    const p = this.radio.last;
    if (!p) return 0;
    return { signal: -60, serial: p.serial || 0, time: p.time || 0 }[prop] ?? 0;
  }
  radioSetPower(p) { this.radio.power = this.num(p); }
  radioSetBand(b) { this.radio.band = this.num(b); }
  radioSetSerial(on) { this.radio.sendSerial = !!on; }

  // ---------- Pins ----------
  digitalRead(p) { this.used.pins = true; return this.pinsIn[p] ? 1 : 0; }
  digitalWrite(p, v) { this.used.pins = true; this.pinsOut[p] = this.num(v) ? 1023 : 0; }
  analogRead(p) { this.used.analog = (this.used.analog || new Set()).add(p); return Math.round(this.analogIn[p] || 0); }
  analogWrite(p, v) { this.used.pins = true; this.pinsOut[p] = Math.max(0, Math.min(1023, Math.round(this.num(v)))); }
  servoWrite(p, v) { this.used.pins = true; this.pinsOut[p] = Math.max(0, Math.min(180, this.num(v))) / 180 * 1023; }
  map(v, fl, fh, tl, th) { v = this.num(v); fl = this.num(fl); fh = this.num(fh); tl = this.num(tl); th = this.num(th); return fh === fl ? tl : ((v - fl) * (th - tl)) / (fh - fl) + tl; }

  // ---------- Serial ----------
  writeLine(s) { this.serialWrite(toStr(s) + '\n'); }
  writeString(s) { this.serialWrite(toStr(s)); }
  writeNumber(n) { this.serialWrite(numStr(this.num(n))); }
  writeValue(name, v) { this.serialWrite(`${toStr(name)}:${numStr(this.num(v))}\n`); }
  writeNumbers(list) { this.serialWrite((Array.isArray(list) ? list : []).map((x) => numStr(this.num(x))).join(',') + '\n'); }
  serialWrite(text) {
    this.used.serial = true;
    this.serialOut.push({ t: this.now, text });
    if (this.serialOut.length > 2000) this.serialOut.splice(0, 500);
    if (this.onSerial) this.onSerial(text);
  }

  // ---------- Math ----------
  randomRange(a, b) {
    a = this.num(a); b = this.num(b);
    if (a > b) [a, b] = [b, a];
    if (Number.isInteger(a) && Number.isInteger(b)) return a + Math.floor(this.rng() * (b - a + 1));
    return a + this.rng() * (b - a);
  }
  randomBool() { return this.rng() < 0.5; }
  div(a, b) { a = this.num(a); b = this.num(b); return a / b; }
  mod(a, b) { a = this.num(a); b = this.num(b); return b === 0 ? 0 : a % b; }
  idiv(a, b) { a = this.num(a); b = this.num(b); return b === 0 ? 0 : Math.trunc(a / b); }
  constrain(v, lo, hi) { v = this.num(v); lo = this.num(lo); hi = this.num(hi); return Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v)); }
  cmp(a, op, b) {
    let x = a, y = b;
    if (typeof a !== 'string' || typeof b !== 'string') { x = this.num(a); y = this.num(b); }
    switch (op) {
      case 'EQ': return x === y;
      case 'NEQ': return x !== y;
      case 'LT': return x < y;
      case 'LTE': return x <= y;
      case 'GT': return x > y;
      default: return x >= y;
    }
  }
  *call(F, name, ...args) {
    const f = this.fn[name];
    if (!f) throw new Error(`The function "${name}" does not exist.`);
    F.depth = (F.depth || 0) + 1;
    if (F.depth > 400) throw new RangeError('Maximum call stack size exceeded');
    try { return yield* f(F, ...args); } finally { F.depth--; }
  }
  eq(a, b) { return typeof a === 'number' || typeof b === 'number' ? this.num(a) === this.num(b) : a === b; }

  // ---------- Text ----------
  parseFloat(s) { const n = parseFloat(toStr(s)); return isNaN(n) ? 0 : n; }
  parseInt(s) { const n = parseInt(toStr(s), 10); return isNaN(n) ? 0 : n; }
  charAt(s, i) { return toStr(s).charAt(this.num(i)); }
  substr(s, i, n) { return toStr(s).substr(this.num(i), this.num(n)); }
  compare(a, b) { a = toStr(a); b = toStr(b); return a < b ? -1 : a > b ? 1 : 0; }
  includes(s, t) { return toStr(s).includes(toStr(t)); }
  indexOf(s, t) { return toStr(s).indexOf(toStr(t)); }

  // ---------- Arrays ----------
  arr(a, what = 'list') {
    if (!Array.isArray(a)) throw new Error(`This ${what} is not an array: use "set … to array of" first.`);
    return a;
  }
  arrGet(a, i) { a = this.arr(a); const v = a[Math.round(this.num(i))]; return v === undefined ? 0 : v; }
  arrSet(a, i, v) { a = this.arr(a); i = Math.round(this.num(i)); if (i >= 0 && i < 10000) a[i] = v; }

  // ---------- Images ----------
  image(pattern) { return MbImage.fromPattern(pattern); }
  iconImage(name) { return MbImage.fromPattern(ICONS[name] || ICONS.Heart); }
  arrowImage(dir) { return MbImage.fromPattern(ARROWS[dir] || ARROWS.North); }
  *showImage(F, img, offset = 0, interval = 0) {
    this.used.display = true;
    if (!img || img.kind !== 'image') return;
    this.cancelAnimations();
    const off = Math.round(this.num(offset));
    const frame = new MbImage(5);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) frame.set(x, y, img.get(x + off, y));
    this.logShown('image', this.imgKey(frame));
    this.setImage(frame);
    yield this.num(interval) || 400;
  }
  *scrollImg(F, img, step, interval) {
    this.used.display = true;
    if (!img || img.kind !== 'image') return;
    yield* this.scrollImage(F, img, step, interval, true);
  }

  // ---------- Game (LED sprites) ----------
  createSprite(x, y) {
    this.used.display = true;
    const s = { kind: 'sprite', x: Math.round(this.num(x)), y: Math.round(this.num(y)), dir: 90, brightness: 255, blink: 0, deleted: false };
    s.x = Math.max(0, Math.min(4, s.x)); s.y = Math.max(0, Math.min(4, s.y));
    this.sprites.push(s);
    this.drawSprites();
    return s;
  }
  sprite(s) { if (!s || s.kind !== 'sprite') throw new Error('This variable is not a sprite: use "set sprite to create sprite" first.'); return s; }
  spriteMove(s, n) {
    s = this.sprite(s);
    const d = ((s.dir % 360) + 360) % 360;
    const dx = Math.round(Math.sin(d * Math.PI / 180)), dy = -Math.round(Math.cos(d * Math.PI / 180));
    s.x = Math.max(0, Math.min(4, s.x + dx * this.num(n)));
    s.y = Math.max(0, Math.min(4, s.y + dy * this.num(n)));
    this.drawSprites();
  }
  spriteTurn(s, dir, deg) { s = this.sprite(s); s.dir += (dir === 'left' ? -1 : 1) * this.num(deg); this.drawSprites(); }
  spriteChange(s, prop, v) { s = this.sprite(s); this.spriteSet(s, prop, this.spriteGet(s, prop) + this.num(v)); }
  spriteSet(s, prop, v) {
    s = this.sprite(s);
    v = this.num(v);
    if (prop === 'x') s.x = Math.max(0, Math.min(4, Math.round(v)));
    else if (prop === 'y') s.y = Math.max(0, Math.min(4, Math.round(v)));
    else if (prop === 'direction') s.dir = v;
    else if (prop === 'brightness') s.brightness = Math.max(0, Math.min(255, v));
    else if (prop === 'blink') s.blink = v;
    this.drawSprites();
  }
  spriteGet(s, prop) { s = this.sprite(s); return { x: s.x, y: s.y, direction: s.dir, brightness: s.brightness, blink: s.blink }[prop] ?? 0; }
  spriteBounce(s) {
    s = this.sprite(s);
    if (s.x === 0 || s.x === 4 || s.y === 0 || s.y === 4) {
      const d = ((s.dir % 360) + 360) % 360;
      if ((s.x === 0 && d > 180) || (s.x === 4 && d > 0 && d < 180)) s.dir = -s.dir;
      if ((s.y === 0 && (d < 90 || d > 270)) || (s.y === 4 && d > 90 && d < 270)) s.dir = 180 - s.dir;
    }
    this.drawSprites();
  }
  spriteTouching(a, b) { a = this.sprite(a); b = this.sprite(b); return !a.deleted && !b.deleted && a !== b && a.x === b.x && a.y === b.y; }
  spriteTouchingEdge(s) { s = this.sprite(s); return s.x === 0 || s.x === 4 || s.y === 0 || s.y === 4; }
  spriteDelete(s) { s = this.sprite(s); s.deleted = true; this.sprites = this.sprites.filter((x) => x !== s); this.drawSprites(); }
  spriteIsDeleted(s) { return !!(s && s.deleted); }
  drawSprites() {
    if (this.game.over) return;
    this.leds.fill(0);
    for (const s of this.sprites) if (!s.deleted) this.leds[s.y * 5 + s.x] = s.brightness;
    this.frameChanged();
  }
  addScore(n) { this.game.score += this.num(n); this.logShown('score', this.game.score); }
  setScore(n) { this.game.score = this.num(n); this.logShown('score', this.game.score); }
  score() { return this.game.score; }
  startCountdown(ms) { this.game.countdownEnd = this.now + this.num(ms); }
  checkCountdown() {
    if (this.game.countdownEnd && !this.game.over && this.now >= this.game.countdownEnd) { this.game.countdownEnd = 0; this.gameOverNow(); }
  }
  *gameOver(F) { this.gameOverNow(); yield 0; }
  gameOverNow() {
    if (this.game.over) return;
    this.game.over = true;
    this.logShown('gameover', this.game.score);
    const self = this;
    // stop every other fiber, show GAME OVER and the score, like MakeCode
    this.fibers.forEach((f) => { f.done = true; });
    this.cancelAnimations();
    this.spawn(function* (F) {
      for (let i = 0; i < 3; i++) { self.leds.fill(255); self.frameChanged(); yield 100; self.leds.fill(0); self.frameChanged(); yield 100; }
      while (self.running) { yield* self.scrollText(F, 'GAME OVER', 150); yield* self.scrollText(F, 'SCORE ' + numStr(self.game.score), 150); }
    }, 'game');
  }
  isGameOver() { return this.game.over; }

  // ---------- Control ----------
  *waitMicros(F, us) { yield this.num(us) / 1000; }
  resetDevice() { const code = this.lastCode; const bus = this.bus; this.stop(); if (code) { this.load(code.code, code.opts); this.bus = bus; } throw new StopSignal(); }
  deviceName() { return 'zavit'; }
  deviceSerial() { return 0x1a2b3c4d + this.id; }
}

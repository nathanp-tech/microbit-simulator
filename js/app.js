// Student app: the MakeCode editor, the micro:bit simulator, the challenges and quizzes, saving and live sync.
'use strict';

const $ = (id) => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORAGE = 'mbsim.v1.';
// A new MakeCode project: "on start" and "forever"
const DEFAULT_PROGRAM = { blocks: { languageVersion: 0, blocks: [{ type: 'basic_on_start', x: 30, y: 40 }, { type: 'basic_forever', x: 260, y: 40 }] } };

let ws = null;
const App = {
  mode: 'challenge', challenge: null, status: 'idle', loading: false, exam: null, examCh: null,
  preview: false, advanced: false, reminderSnoozedUntil: 0, lastVar: null, view: 'blocks',
};
const progressMode = () => (App.mode === 'challenge' ? 'guided' : 'free');
const appModeOf = (m) => (m === 'free' ? 'sandbox' : 'challenge');
const MODE_LABEL = { guided: '🧭 Challenges', free: '🛠️ Free programming' };
const modeAllowed = (m) => App.preview || (m === 'guided' ? CLASSROOM.allowGuided !== false : CLASSROOM.allowFree !== false);

// Things the classroom code (js/classroom.js) expects
const brick = { sound: { play() { AudioOut.tone(988, 120); setTimeout(() => AudioOut.tone(1319, 160), 130); } } };
const rt = { stopAll() {} };
const sim = { config: null };
function stopProgram() { /* the simulator keeps running, like MakeCode */ }
function log(msg) { console.log(msg); }

function toast(msg, ms = 3500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
function closeModal() {
  $('modal').hidden = true;
  $('modal').querySelector('.modal-box').style.maxWidth = '';
  if (App.solWs) { App.solWs.dispose(); App.solWs = null; }
}
function download(filename, obj) {
  const blob = obj instanceof Blob ? obj : new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const chShort = (id) => { const c = CHALLENGES.find((x) => x.id === id); return c ? c.title : id; };
const isQuiz = () => App.mode === 'challenge' && App.challenge && App.challenge.quiz;

// =====================================================================
// Simulator: one micro:bit (two when the radio is used), restarted at every change of the program
// =====================================================================
const SimRun = {
  boards: [], views: [], bus: null, running: true, slow: false, muted: false, prog: null, last: 0, errorShown: null,
  serial: [], serialNums: [],
  restart() {
    if (!ws) return;
    let prog;
    try { prog = programForCheck(ws); } catch (e) { console.error(e); return; }
    this.prog = prog;
    const f = prog.features;
    const n = f.radio ? 2 : 1;
    if (this.views.length !== n) {
      this.views.forEach((v) => v.remove());
      $('boards').classList.toggle('two', n === 2);
      const accent = this.views[0] ? this.views[0].accent : undefined;
      this.views = [];
      for (let i = 0; i < n; i++) {
        const idx = i;
        this.views.push(new BoardView($('boards'), () => this.boards[idx], { accent: i ? MB_ACCENTS[(MB_ACCENTS.indexOf(accent) + 1) % MB_ACCENTS.length] : accent, onInteract: () => { Progress.lastInput = Date.now(); } }));
      }
    }
    for (const b of this.boards) b.stop();
    AudioOut.stop();
    this.bus = new RadioBus();
    this.boards = [];
    this.errorShown = null;
    showSimError(null);
    for (let i = 0; i < n; i++) {
      const mb = new Microbit({ id: i, bus: this.bus, seed: Math.floor(Math.random() * 1e9),
        onTone: i === 0 ? (freq, ms, vol) => { if (!this.muted) AudioOut.tone(freq, ms, vol); } : null,
        onSerial: i === 0 ? (text) => this.onSerial(text) : null });
      try { mb.load(prog.code, { variables: JSON.parse(JSON.stringify(prog.variables)) }); } catch (e) { mb.running = false; mb.error = e.message; console.error(e, prog.code); }
      this.boards.push(mb);
      this.views[i].setFeatures(f);
    }
    $('showData').hidden = !f.serial;
    if (!this.running) this.boards.forEach((b) => b.stop());
    updateSimButtons();
  },
  frame(dtMs) {
    if (!this.running) { this.views.forEach((v) => v.update()); return; }
    const dt = Math.min(100, dtMs) * (this.slow ? 0.2 : 1);
    for (const mb of this.boards) mb.advance(dt, 30);
    this.views.forEach((v) => v.update());
    const err = this.boards.find((b) => b.error);
    if (err && this.errorShown !== err.error) {
      this.errorShown = err.error;
      showSimError('😢 ' + err.error);
      if (err.errorBlock) { const b = ws.getBlockById(err.errorBlock); if (b) b.select(); }
      Progress.onError && Progress.data && Progress.onError(progressMode(), err.error);
    }
  },
  setRunning(on) {
    this.running = on;
    if (on) this.restart();
    else { this.boards.forEach((b) => { b.stop(); b.leds.fill(0); }); AudioOut.stop(); }
    updateSimButtons();
  },
  onSerial(text) {
    for (const ch of text.split(/(?<=\n)/)) {
      const last = this.serial.length ? this.serial[this.serial.length - 1] : null;
      if (last !== null && !last.endsWith('\n')) this.serial[this.serial.length - 1] += ch; else this.serial.push(ch);
      if (ch.endsWith('\n')) {
        const line = this.serial[this.serial.length - 1].trim();
        const m = line.match(/^(?:([^:]+):)?\s*(-?\d+(?:\.\d+)?)$/);
        if (m) this.serialNums.push({ name: m[1] || '', v: Number(m[2]) });
      }
    }
    if (this.serial.length > 500) this.serial.splice(0, 100);
    if (this.serialNums.length > 400) this.serialNums.splice(0, 100);
    if (!$('dataView').hidden) renderData();
  },
};
function showSimError(msg) { const el = $('simError'); el.hidden = !msg; el.textContent = msg || ''; }
function updateSimButtons() {
  const b = $('simPlay');
  b.title = SimRun.running ? 'Stop the simulator' : 'Start the simulator';
  b.innerHTML = SimRun.running ? '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>';
  $('simSlow').classList.toggle('on', SimRun.slow);
  $('simMute').classList.toggle('on', SimRun.muted);
  $('simMute').innerHTML = SimRun.muted ? '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
}
let restartTimer = null;
function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (!SimRun.running) return;
    SimRun.restart();
    // a "run" for the teacher: the program changed and was tried (at most every 15 s)
    if (Progress.data && !App.exam && !isQuiz() && Date.now() - (App.lastRunCount || 0) > 15000) { App.lastRunCount = Date.now(); Progress.onRun(progressMode()); }
    recordVersion('run');
  }, 350);
}

// ---------- Data viewer (serial) ----------
function renderData() {
  $('dataConsole').textContent = SimRun.serial.join('');
  $('dataConsole').scrollTop = $('dataConsole').scrollHeight;
  const c = $('dataChart');
  const dpr = window.devicePixelRatio || 1;
  c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const pts = SimRun.serialNums.slice(-200);
  if (!pts.length) return;
  const names = [...new Set(pts.map((p) => p.name))];
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const colors = ['#e30fc0', '#3454D1', '#107c10', '#ff8c00'];
  names.forEach((nm, k) => {
    const s = pts.filter((p) => p.name === nm);
    g.strokeStyle = colors[k % colors.length]; g.lineWidth = 2 * dpr; g.beginPath();
    s.forEach((p, i) => {
      const x = 10 * dpr + i / Math.max(1, s.length - 1) * (c.width - 20 * dpr);
      const y = c.height - 10 * dpr - (max === min ? 0.5 : (p.v - min) / (max - min)) * (c.height - 20 * dpr);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.stroke();
    g.fillStyle = colors[k % colors.length]; g.font = `${12 * dpr}px sans-serif`;
    g.fillText(`${nm || 'value'}: ${s[s.length - 1].v}`, 12 * dpr, (16 + 16 * k) * dpr);
  });
}

// =====================================================================
// Editor
// =====================================================================
const CAT_ICONS = {
  basic: 'M3 3h5v5H3zm6.5 0h5v5h-5zM16 3h5v5h-5zM3 9.5h5v5H3zm6.5 0h5v5h-5zm6.5 0h5v5h-5zM3 16h5v5H3zm6.5 0h5v5h-5zm6.5 0h5v5h-5z',
  input: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  music: 'M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h3v-8H5.1a7 7 0 0 1 13.8 0H16v8h3a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z',
  led: 'M7 6h10a6 6 0 0 1 0 12H7A6 6 0 0 1 7 6zm10 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  radio: 'M2 17h3v4H2zm4.5-3h3v7h-3zm4.5-3h3v10h-3zm4.5-4h3v14h-3zM20 3h3v18h-3z',
  loops: 'M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  logic: 'M10.59 9.17 5.41 4 4 5.41l5.17 5.17zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04z',
  variables: 'M3 4.5h18V7H3zm0 6.25h18v2.5H3zM3 17h18v2.5H3z',
  math: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm1 3v4h10V5zm0 7v2.5h2.5V12zm4 0v2.5h2.5V12zm4 0v2.5H17V12zM7 16v2.5h2.5V16zm4 0v2.5h2.5V16zm4 0v2.5H17V16z',
  functions: 'M15.5 3c-2.2 0-3.4 1.3-3.9 3.6L11.2 8H8.5v2h2.2l-1.4 6.6c-.3 1.3-.7 1.9-1.6 1.9-.3 0-.6 0-.9-.1l-.4 2c.4.1.9.2 1.4.2 2.3 0 3.4-1.4 3.9-3.6L13 10h3V8h-2.6l.3-1.2c.3-1.2.7-1.8 1.6-1.8.3 0 .6 0 .9.1l.4-2c-.4-.1-.8-.2-1.1-.2z',
  arrays: 'M3 4h3v3H3zm5 .5h13v2H8zM3 10.5h3v3H3zm5 .5h13v2H8zM3 17h3v3H3zm5 .5h13v2H8z',
  text: 'M4 4h16v3.5h-2.2V6.2h-4.6v11.6H15V20H9v-2.2h1.8V6.2H6.2v1.3H4z',
  game: 'M7 7h10a5 5 0 0 1 0 10c-1.6 0-2.6-.8-3.4-1.8h-3.2C9.6 16.2 8.6 17 7 17A5 5 0 0 1 7 7zm-.75 3v1.25H5v1.5h1.25V14h1.5v-1.25H9v-1.5H7.75V10zM16 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  images: 'M3 5h18v14H3zm2 2v10h14V7zm1.5 9 3.5-4.5 2.5 3 3.5-4.5 4 6z',
  pins: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6z',
  serial: 'M7 4 2 9l5 5v-3.5h9v-3H7zm10 6v3.5H8v3h9V20l5-5z',
  control: 'M12 4V1L8 5l4 4V6a6 6 0 0 1 5.65 8.03l1.5 1.5A8 8 0 0 0 12 4zm0 14a6 6 0 0 1-5.65-8.03l-1.5-1.5A8 8 0 0 0 12 20v3l4-4-4-4z',
  more: 'M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  advanced: 'M5 8l7 7 7-7-1.8-1.8L12 11.4 6.8 6.2z',
  advancedOpen: 'M5 16l7-7 7 7-1.8 1.8L12 12.6l-5.2 5.2z',
  extensions: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.3 5v3.7H7v2.6h3.7V17h2.6v-3.7H17v-2.6h-3.7V7z',
};
function installCategoryCss() {
  const svgUri = (d) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" d="${d}"/></svg>`)}")`;
  let css = '';
  const colours = { ...Object.fromEntries(Object.entries(CATS).map(([k, v]) => [k, v.colour])), advanced: '#00272B', extensions: '#7f7f7f' };
  for (const [k, col] of Object.entries(colours)) {
    css += `.mbIcon-${k}{-webkit-mask-image:${svgUri(CAT_ICONS[k])};mask-image:${svgUri(CAT_ICONS[k])};background-color:${col};}.mbCat-${k} .blocklyTreeLabel{color:${col};}\n`;
  }
  css += `.mbIcon-more{-webkit-mask-image:${svgUri(CAT_ICONS.more)};mask-image:${svgUri(CAT_ICONS.more)};}\n`;
  for (const k of Object.keys(CATS)) css += `.mbMore.mbCat-${k} .mbIcon-more{background-color:${CATS[k].colour};}\n`;
  css += `.mbAdvOpen .mbIcon-advanced{-webkit-mask-image:${svgUri(CAT_ICONS.advancedOpen)};mask-image:${svgUri(CAT_ICONS.advancedOpen)};}\n`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}
function toolboxDef() {
  const tb = buildToolbox(App.advanced);
  const at = tb.contents.findIndex((c) => c.name === 'Functions');
  const extra = [
    { kind: 'category', name: 'Extensions', colour: '#7f7f7f', custom: 'MB_EXTENSIONS', cssconfig: { row: 'blocklyTreeRow mbCat mbCat-extensions', icon: 'mbCatIcon mbIcon-extensions' } },
    { kind: 'sep' },
    { kind: 'category', name: 'Advanced', colour: '#00272B', custom: 'MB_ADVANCED', cssconfig: { row: 'blocklyTreeRow mbCat mbCat-advanced' + (App.advanced ? ' mbAdvOpen' : ''), icon: 'mbCatIcon mbIcon-advanced' } },
  ];
  tb.contents.splice(at < 0 ? tb.contents.length : at, 0, ...extra);
  return tb;
}

function setupEditor() {
  installCategoryCss();
  const tb = toolboxDef();
  // custom categories are filled by callbacks: inject them empty first
  ws = Blockly.inject('blocklyDiv', {
    toolbox: { ...tb, contents: tb.contents.map((c) => (c.custom ? { ...c, custom: undefined, contents: [] } : c)) },
    renderer: 'makecode',
    theme: MB_THEME,
    media: 'lib/blockly/media/',
    trashcan: false,
    sounds: true,
    zoom: { controls: false, wheel: true, startScale: 0.9, maxScale: 2.5, minScale: 0.2, scaleSpeed: 1.08 },
    grid: { spacing: 45, length: 7, colour: 'rgba(189,195,199,0.30)', snap: false },
    move: { scrollbars: true, drag: true, wheel: false },
  });
  ws.registerToolboxCategoryCallback('MB_VARIABLES', variablesFlyout);
  ws.registerToolboxCategoryCallback('MB_FUNCTIONS', functionsFlyout);
  ws.registerToolboxCategoryCallback('MB_EXTENSIONS', () => [{ kind: 'label', text: 'Extensions', 'web-class': 'mbFlyoutHeading' }, { kind: 'label', text: 'Extensions are not available in this simulator.', 'web-class': 'mbFlyoutGroup' }]);
  ws.registerToolboxCategoryCallback('MB_ADVANCED', () => []);
  ws.registerButtonCallback('MB_MAKE_VARIABLE', () => makeVariable());
  ws.registerButtonCallback('MB_MAKE_FUNCTION', () => makeFunction());
  ws.updateToolbox(tb);
  setupToolboxChrome();
  Blockly.dialog.setPrompt((msg, def, cb) => promptModal(msg, def, cb));
  Blockly.dialog.setConfirm((msg, cb) => cb(window.confirm(msg)));

  ws.addChangeListener((e) => {
    if (e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) { onToolboxSelect(e); return; }
    if (e.isUiEvent || App.loading) return;
    if (e.type === Blockly.Events.BLOCK_CHANGE && e.element === 'field' && e.name === 'NAME') renameFunctionCalls(e);
    if (e.type === Blockly.Events.BLOCK_CREATE || e.type === Blockly.Events.BLOCK_CHANGE) {
      const b = ws.getBlockById(e.blockId);
      if (b && (b.type === 'variables_set' || b.type === 'variables_change' || b.type === 'variables_get')) { try { App.lastVar = b.getField('VAR').getVariable().name; } catch (err) { /* ignore */ } }
    }
    scheduleTidy();
    autosave();
    scheduleRestart();
  });
}

// MakeCode rules: one block per event, loose blocks do not run (shown disabled), parameters always in place
let tidyTimer = null;
function scheduleTidy() { clearTimeout(tidyTimer); tidyTimer = setTimeout(tidyWorkspace, 60); }
function tidyWorkspace() {
  if (!ws || App.loading) return;
  if (ws.isDragging && ws.isDragging()) { scheduleTidy(); return; }
  Blockly.Events.disable();
  try {
    const seen = new Set();
    const tops = ws.getTopBlocks(true);
    for (const b of tops) {
      if (HAT_TYPES.has(b.type)) {
        const key = eventKey(b);
        const dup = key && seen.has(key);
        if (key) seen.add(key);
        b.setDisabledReason(dup, 'MB_DUPLICATE');
        b.setDisabledReason(false, 'MB_ORPHAN');
        if (dup) b.setWarningText('This event is already used by another block.', 'dup'); else b.setWarningText(null, 'dup');
      } else {
        b.setDisabledReason(true, 'MB_ORPHAN');
      }
    }
    for (const b of ws.getAllBlocks(false)) {
      if (b.isShadow() || !HAT_TYPES.has(b.type) || b.isInFlyout) continue;
      if (b.getParent()) b.setDisabledReason(false, 'MB_ORPHAN');
    }
    // inner blocks of an attached stack: enabled again
    for (const b of ws.getAllBlocks(false)) if (b.getParent() && !HAT_TYPES.has(b.type)) b.setDisabledReason(false, 'MB_ORPHAN');
    // draggable parameters: always a reporter in each slot of an event / function block
    for (const b of ws.getAllBlocks(false)) {
      if (!b.mbParamSlots || b.isInFlyout) continue;
      const names = b.type === 'function_definition' ? (b.mbParams || []).map((p) => p.name) : b.mbParamSlots;
      for (const nm of names) {
        const inp = b.getInput('P_' + nm);
        if (!inp) continue;
        const t = inp.connection.targetBlock();
        if (t && (t.type !== 'argument_reporter' || t.getFieldValue('NAME') !== nm)) { t.unplug(); t.moveBy(30, 30); }
        if (!inp.connection.targetBlock()) {
          const r = ws.newBlock('argument_reporter');
          r.setFieldValue(nm, 'NAME');
          r.initSvg(); r.render();
          inp.connection.connect(r.outputConnection);
        }
      }
    }
  } finally { Blockly.Events.enable(); }
}

function renameFunctionCalls(e) {
  const b = ws.getBlockById(e.blockId);
  if (!b || b.type !== 'function_definition') return;
  for (const c of ws.getAllBlocks(false)) {
    if ((c.type === 'function_call' || c.type === 'function_call_output') && c.mbName === e.oldValue) c.loadExtraState({ name: e.newValue, params: b.mbParams });
  }
}

function setupToolboxChrome() {
  const tbDiv = document.querySelector('.blocklyToolbox') || document.querySelector('.blocklyToolboxDiv');
  if (tbDiv && !tbDiv.querySelector('.mc-search')) {
    const s = document.createElement('div');
    s.className = 'mc-search';
    s.innerHTML = '<input id="tbSearch" placeholder="Search..." autocomplete="off" spellcheck="false"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>';
    tbDiv.insertBefore(s, tbDiv.firstChild);
    s.querySelector('input').addEventListener('input', (e) => searchBlocks(e.target.value));
    s.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; searchBlocks(''); } });
  }
}
let searchIndex = null;
function searchBlocks(q) {
  q = q.trim().toLowerCase();
  const tb = ws.getToolbox();
  const flyout = tb.getFlyout();
  if (!q) { flyout.hide(); return; }
  if (!searchIndex) searchIndex = allToolboxBlocks();
  const words = q.split(/\s+/);
  const hits = searchIndex.filter((h) => words.every((w) => h.text.includes(w) || (CATS[h.key.split(':')[0]] || {}).name.toLowerCase().includes(w))).slice(0, 30);
  tb.clearSelection();
  const contents = [{ kind: 'label', text: 'Search results', 'web-class': 'mbFlyoutHeading' }];
  if (!hits.length) contents.push({ kind: 'label', text: 'No blocks found', 'web-class': 'mbFlyoutGroup' });
  for (const h of hits) contents.push(toolboxBlock(h.item));
  flyout.show(contents);
}

function onToolboxSelect(e) {
  const tb = ws.getToolbox();
  // the event gives the name of the category
  if (e.newItem === 'Advanced') {
    App.advanced = !App.advanced;
    LS.set(STORAGE + 'advanced', App.advanced);
    setTimeout(() => { tb.clearSelection(); ws.updateToolbox(toolboxDef()); }, 0);
    return;
  }
  if (e.newItem === 'Extensions') {
    setTimeout(() => tb.clearSelection(), 0);
    openModal('<h2>Extensions</h2><p>Extensions (robots, sensors, neopixels…) are not available in this simulator. Use the blocks of the toolbox.</p><div style="text-align:right"><button class="primary" onclick="closeModal()">OK</button></div>');
    return;
  }
  setTimeout(() => syncMoreCategories(tb), 0);
  setTimeout(() => syncMoreCategories(tb), 120);
}
// the "more" sub-category is only shown under the selected category, like MakeCode
function syncMoreCategories(tb) {
  const item = tb.getSelectedItem();
  const search = $('tbSearch');
  if (item && search && search.value) search.value = '';
  for (const it of tb.getToolboxItems()) {
    if (!it.isCollapsible || !it.isCollapsible()) continue;
    const children = it.getChildToolboxItems ? it.getChildToolboxItems() : [];
    const open = !!item && (item === it || children.includes(item));
    if (it.isExpanded() !== open) it.setExpanded(open);
  }
}

// "New variable name:" like MakeCode
function promptModal(msg, def, cb) {
  openModal(`<h2>${esc(msg)}</h2><p><input id="pmIn" value="${esc(def || '')}" style="font-size:18px;padding:8px 10px;width:100%"></p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button id="pmOk" class="primary">Ok ✓</button></div>`);
  const ok = () => { const v = $('pmIn').value.trim(); closeModal(); cb(v || null); };
  $('pmOk').onclick = ok;
  $('pmIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  $('modalClose').onclick = () => { closeModal(); cb(null); $('modalClose').onclick = closeModal; };
  setTimeout(() => $('pmIn').select(), 30);
}
function makeVariable() {
  promptModal('New variable name:', '', (name) => {
    if (!name) return;
    name = name.replace(/[^\w ]/g, '').trim();
    if (!name) return;
    if (!ws.getVariable(name)) ws.createVariable(name);
    App.lastVar = name;
    ws.getToolbox().refreshSelection();
  });
}
function makeFunction() {
  const params = [];
  const draw = () => {
    $('mfParams').innerHTML = params.map((p, i) => `<span class="chip">${esc(p.name)} <span>${p.type}</span> <button class="mini" data-rm="${i}">✕</button></span>`).join(' ') || '<span class="muted">No parameters</span>';
    $('mfParams').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { params.splice(Number(b.dataset.rm), 1); draw(); }; });
  };
  openModal(`<h2>Edit Function</h2>
    <p><label class="field">Name <input id="mfName" value="doSomething"></label></p>
    <p>Add a parameter: <button class="mini" data-add="text">Text</button> <button class="mini" data-add="boolean">Boolean</button> <button class="mini" data-add="number">Number</button> <button class="mini" data-add="array">Array</button></p>
    <div id="mfParams" class="chips"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button onclick="closeModal()">Cancel</button><button class="primary" id="mfOk">Done ✓</button></div>`);
  draw();
  document.querySelectorAll('[data-add]').forEach((b) => {
    b.onclick = () => { const base = { text: 'text', boolean: 'bool', number: 'num', array: 'list' }[b.dataset.add]; let n = base, k = 2; while (params.some((p) => p.name === n)) n = base + k++; params.push({ name: n, type: b.dataset.add }); draw(); };
  });
  $('mfOk').onclick = () => {
    let name = $('mfName').value.replace(/[^\w ]/g, '').trim() || 'doSomething';
    const names = ws.getTopBlocks(false).filter((x) => x.type === 'function_definition').map((x) => x.getFieldValue('NAME'));
    let n = name, k = 2;
    while (names.includes(n)) n = name + k++;
    closeModal();
    const m = ws.getMetricsManager().getViewMetrics(true);
    const b = Blockly.serialization.blocks.append({ type: 'function_definition', x: m.left + 60, y: m.top + 60, fields: { NAME: n }, extraState: { params } }, ws);
    b.select();
    scheduleTidy();
  };
}

// ---------- Programs: one per challenge, plus the free-programming one ----------
function workSlot() {
  if (!Progress.data) return null;
  if (App.exam) return App.examCh ? examSlot(App.examCh) : null;
  return App.mode === 'challenge' ? Progress.ch() : Progress.data.free;
}
function storeWorkspace() {
  const slot = workSlot();
  if (!slot || App.loading || !ws || isQuiz()) return;
  const program = Blockly.serialization.workspaces.save(ws);
  if (JSON.stringify(program) !== JSON.stringify(slot.program)) slot.programAt = new Date().toISOString();
  slot.program = program;
  Progress.persist();
}
function loadProgram(state) {
  App.loading = true;
  Blockly.Events.disable(); // loading is not a change of the student (no restart, no save, no "run")
  try {
    ws.clear();
    Blockly.serialization.workspaces.load(state || DEFAULT_PROGRAM, ws);
  } catch (e) {
    console.error(e);
    ws.clear();
    Blockly.serialization.workspaces.load(DEFAULT_PROGRAM, ws);
  } finally {
    Blockly.Events.enable();
    App.loading = false;
  }
  ws.clearUndo();
  tidyWorkspace();
  SimRun.restart();
}
function loadSlot(slot) {
  if (isQuiz()) { showQuiz(slot); return; }
  hideQuiz();
  loadProgram(slot && slot.program);
  setTimeout(applyNotes, 0);
}
let saveTimer = null;
function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(storeWorkspace, 400); }

function saveWork() {
  if (!Progress.data) return;
  storeWorkspace();
  Progress.markSaved();
  download(Progress.fileName(), Progress.data);
  $('saveReminder').hidden = true;
  toast('💾 Your work was downloaded: ' + Progress.fileName());
}

// =====================================================================
// Session: welcome screen (class, then name)
// =====================================================================
function showWelcome() {
  $('welcome').hidden = false;
  $('wError').textContent = '';
  const saved = Progress.restoreLocal();
  const btn = $('wContinue');
  if (saved && saved.name && saved.type === 'mb-progress') {
    const done = Object.values(saved.challenges || {}).filter((c) => c.status === 'validated').length;
    btn.textContent = `↩ Continue as ${saved.name}${saved.className ? ' (' + saved.className + ')' : ''} · ${saved.mode === 'free' ? 'free programming' : done + ' / ' + CHALLENGES.length + ' challenges'}`;
    btn.hidden = false;
    btn.onclick = () => startSession(Progress.load(saved));
  } else btn.hidden = true;
  App.exam = null;
  CR.examOver = false;
  CR.helpSince = 0;
  $('examOverlay').hidden = $('pauseOverlay').hidden = $('closedOverlay').hidden = true;
  updateExamBanner();
  renderHelpButton();
  pickClass('');
  const load = () => checkClassCode().then((ok) => { if (ok) return loadRoster().then(() => { if (!$('welcome').hidden && !$('wName').value) pickClass($('wClass').value); }); });
  load();
  clearInterval(App.rosterRetry);
  App.rosterRetry = setInterval(() => {
    if ($('welcome').hidden) { clearInterval(App.rosterRetry); return; }
    if (!Object.keys(currentRoster()).length || CR.rosterFailed) load();
  }, 5000);
}
async function checkClassCode() {
  const u = new URL(location.href);
  if (u.searchParams.get('c')) {
    ClassCode.set(u.searchParams.get('c').trim());
    u.searchParams.delete('c');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }
  const info = await Sync.getJson('api/info');
  const join = info && info.studentCodeRequired && ClassCode.get() ? await Sync.getJson('api/join') : null;
  const ok = !info || !info.studentCodeRequired || !!(join && join.ok);
  CR.myClass = join && join.className;
  $('wCodeStep').hidden = !!ok;
  $('wPick').hidden = !ok;
  $('wModeTitle').hidden = $('wChoices').hidden = !ok;
  if (!ok) { $('wCode').value = ''; setTimeout(() => $('wCode').focus(), 50); }
  return ok;
}
async function submitClassCode() {
  const c = $('wCode').value.trim();
  if (!c) return;
  ClassCode.set(c);
  if ((await Sync.getJson('api/join') || {}).ok) { $('wError').textContent = ''; showWelcome(); return; }
  ClassCode.set('');
  $('wError').textContent = 'This code is not right. Each class has its own code: ask your teacher.';
  $('wCode').select();
}
let askingCode = false;
Sync.onNeedCode = () => {
  if (askingCode || !$('welcome').hidden) return;
  askingCode = true;
  openModal(`<h2>🔑 Class code</h2><p>Your teacher changed the class code. Type the new code to keep saving your work online.</p>
    <p><input id="mCode" autocomplete="off" style="font-size:18px;padding:8px 10px;width:180px"> <button class="primary" id="mCodeGo">OK</button></p><p id="mCodeErr" class="werr"></p>`);
  const go = async () => {
    ClassCode.set($('mCode').value.trim());
    if ((await Sync.getJson('api/join') || {}).ok) { askingCode = false; closeModal(); Sync.push(liveState(), true); } else $('mCodeErr').textContent = 'This code is not right.';
  };
  $('mCodeGo').onclick = go;
  $('mCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
};
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
function pickClass(cls) {
  $('wClass').value = cls;
  $('wName').value = '';
  const roster = currentRoster();
  if (!cls && Object.keys(roster).length === 1) cls = Object.keys(roster)[0];
  if (cls && (!roster[cls] || classClosed(cls))) cls = '';
  $('wClass').value = cls;
  $('wClasses').innerHTML = !Object.keys(roster).length ? `<span class="muted">${CR.rosterFailed ? 'The class server does not answer. Trying again…' : 'Loading the classes…'}</span>` : Object.keys(roster).sort(byName).map((c) => (classClosed(c)
    ? `<button class="wclass closed" disabled title="Your teacher closed this class for now">🔒 ${esc(c)}</button>`
    : `<button class="wclass${c === cls ? ' on' : ''}" data-class="${esc(c)}">${esc(c)}</button>`)).join('');
  $('wClasses').querySelectorAll('[data-class]').forEach((b) => { b.onclick = () => pickClass(b.dataset.class); });
  $('wNameStep').hidden = !cls;
  $('wNames').innerHTML = cls ? roster[cls].slice().sort(byName).map((n) => `<button class="wname" data-name="${esc(n)}">${esc(n)}</button>`).join('') : '';
  $('wNames').querySelectorAll('[data-name]').forEach((b) => { b.onclick = () => pickName(b.dataset.name); });
  $('wPick').hidden = false;
  $('wMe').hidden = true;
  $('wChoices').classList.add('wait');
  $('wModeTitle').classList.add('wait');
}
function pickName(name) {
  $('wName').value = name;
  $('wError').textContent = '';
  $('wPick').hidden = true;
  $('wMeText').innerHTML = `Hi <b>${esc(name)}</b> (${esc($('wClass').value)})! 👋`;
  $('wMe').hidden = false;
  $('wChoices').classList.remove('wait');
  $('wModeTitle').classList.remove('wait');
}

// The teacher changed this student's work, or a newer copy was saved elsewhere: reload it.
let remoteBusy = false;
async function onRemoteChange(stale = false) {
  if (remoteBusy || !Progress.data) return;
  remoteBusy = true;
  try {
    if (stale) storeWorkspace();
    const mine = stale ? JSON.parse(JSON.stringify(Progress.data)) : null;
    const work = await Sync.fetchWork(Progress.data.studentId);
    Progress.load(stale ? mergeWork(work, mine) : work);
    Progress.dirty = stale;
    startSession(Progress.data, { quiet: true });
    if (stale) {
      Sync.push(liveState(), true);
      if (Date.now() - (App.mergeToastAt || 0) > 30000) toast('🔄 Your work was also saved from another tab or computer: both versions are combined.');
      App.mergeToastAt = Date.now();
    } else toast('🔄 Your teacher updated your work.');
  } catch (e) { console.error(e); } finally { remoteBusy = false; }
}
const STATUS_RANK = { locked: 0, open: 1, passed: 2, validated: 2 };
function newerProgram(into, from) {
  if (from && from.program && String(from.programAt || '') > String(into.programAt || '')) { into.program = from.program; into.programAt = from.programAt; }
  if (from && from.answers && !into.answers) into.answers = from.answers;
}
function mergeWork(server, mine) {
  const out = server;
  for (const [id, m] of Object.entries(mine.challenges || {})) {
    const s = out.challenges[id];
    if (!s) { out.challenges[id] = m; continue; }
    const keep = (STATUS_RANK[m.status] || 0) > (STATUS_RANK[s.status] || 0) ? { ...m } : s;
    const other = keep === s ? m : s;
    if (typeof other.bestScore === 'number' && !(keep.bestScore >= other.bestScore)) keep.bestScore = other.bestScore;
    if ((other.gradings || []).length > (keep.gradings || []).length) keep.gradings = other.gradings;
    keep.hints = Math.max(keep.hints || 0, other.hints || 0);
    newerProgram(keep, other);
    out.challenges[id] = keep;
  }
  if (mine.free) newerProgram(out.free = out.free || {}, mine.free);
  for (const [eid, ex] of Object.entries(mine.exams || {})) {
    const se = (out.exams = out.exams || {})[eid];
    if (!se) { out.exams[eid] = ex; continue; }
    for (const [cid, sl] of Object.entries(ex.slots || {})) {
      const ss = (se.slots = se.slots || {})[cid];
      if (!ss || (sl.best !== null && !(ss.best >= sl.best))) se.slots[cid] = { ...(ss || {}), ...sl };
    }
  }
  out.examQueue = [...(out.examQueue || []), ...(mine.examQueue || [])];
  out.current = mine.current;
  out.mode = mine.mode;
  return out;
}
function onDeleted() {
  if (!Progress.data) return;
  Progress.clearLocal();
  Progress.data = null;
  closeModal();
  showWelcome();
  $('wError').textContent = 'Your teacher reset your work. Choose your name to start again.';
}
function applyClassSettings() {
  document.querySelector('.choice.guided').hidden = CLASSROOM.allowGuided === false;
  document.querySelector('.choice.free').hidden = CLASSROOM.allowFree === false;
  $('mSwitch').disabled = !!App.exam || ['guided', 'free'].filter(modeAllowed).length < 2;
}
function startSession(data, { quiet = false } = {}) {
  $('welcome').hidden = true;
  if (!modeAllowed(data.mode || 'guided')) data.mode = ['guided', 'free'].find(modeAllowed) || 'guided';
  $('chipName').textContent = data.name + (data.className ? ' · ' + data.className : '');
  setMode(appModeOf(data.mode), { initial: true });
  if (quiet) return;
  Sync.push(liveState(), true);
}
let choosing = false;
async function chooseMode(mode) {
  if (choosing) return;
  choosing = true;
  document.querySelectorAll('.choice').forEach((b) => { b.disabled = true; });
  try { await chooseModeNow(mode); } finally {
    choosing = false;
    document.querySelectorAll('.choice').forEach((b) => { b.disabled = false; });
  }
}
async function chooseModeNow(mode) {
  const name = $('wName').value.trim(), cls = $('wClass').value.trim();
  if (!name) { $('wError').textContent = 'Choose your class and your name first.'; return; }
  if (!Sync.online) await Sync.ping();
  if (!Sync.online && CR.roster) { $('wError').textContent = 'The class server does not answer. Wait a few seconds and click again.'; return; }
  const matches = await Sync.find(name, cls);
  if (matches === null) { $('wError').textContent = 'The class server does not answer. Wait a few seconds and click again.'; return; }
  if (!matches.length) { startSession(Progress.create(name, cls, mode)); return; }
  matches.sort((a, b) => (b.validated || 0) - (a.validated || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  try {
    const data = await Sync.fetchWork(matches[0].studentId);
    data.mode = mode;
    if (cls) data.className = cls;
    startSession(Progress.load(data));
    toast(`👋 Welcome back, ${data.name}! Your work is here.`);
  } catch (e) { $('wError').textContent = 'Cannot load your work: ' + e.message; }
}
async function openWorkFile(file) {
  try { startSession(Progress.load(JSON.parse(await file.text()))); } catch (e) { $('wError').textContent = 'Cannot open this file: ' + e.message; }
}
async function exitSession() {
  storeWorkspace();
  const online = await Sync.push(liveState('left'), true);
  const saved = online || Progress.minutesSinceSave() < 0.5;
  openModal(`<h2>Before you leave</h2>
    <p>${online ? '☁️ Your work is <b>saved online</b>. Next time, choose your class and your name to continue.' : saved ? '✅ Your work is saved.' : '⚠️ Your latest work is <b>not saved</b> yet: download it with "Save my work".'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="primary" id="exSave">💾 ${online ? 'Download a copy' : 'Save my work'}</button><button id="exLeave">${saved ? 'Leave' : 'Leave without saving'}</button><button onclick="closeModal()">Cancel</button></div>`);
  $('exSave').onclick = () => { saveWork(); $('exLeave').textContent = 'Leave'; };
  $('exLeave').onclick = () => {
    Progress.log('exit', null);
    Progress.persist();
    Sync.push(liveState('left'));
    closeModal();
    Progress.data = null;
    showWelcome();
  };
}
function switchMode() {
  if (!Progress.data || App.status !== 'idle' || App.exam) return;
  const modes = ['guided', 'free'].filter((m) => modeAllowed(m) && m !== progressMode());
  if (!modes.length) return;
  openModal(`<h2>Switch to…</h2>${modes.map((m) => `<p><button class="primary" data-switch="${m}" style="font-size:15px;padding:10px 16px">${MODE_LABEL[m]}</button></p>`).join('')}<p class="muted">Your work in every mode is kept.</p>`);
  document.querySelectorAll('[data-switch]').forEach((b) => {
    b.onclick = () => { closeModal(); Progress.data.mode = b.dataset.switch; Progress.log('mode', null, b.dataset.switch); setMode(appModeOf(b.dataset.switch)); };
  });
}

// =====================================================================
// Modes, challenges, quizzes
// =====================================================================
function setMode(mode, { initial = false } = {}) {
  if (App.status === 'evaluating') return;
  if (App.exam) { enterExamChallenge(App.examCh || App.exam.challenges[0], { skipStore: true }); return; }
  if (!initial) storeWorkspace();
  App.mode = mode;
  $('challengeBox').hidden = mode !== 'challenge';
  if (mode === 'sandbox') {
    App.challenge = null;
    hideQuiz();
    loadSlot(Progress.data.free);
    $('projectName').readOnly = false;
    $('projectName').value = Progress.data.free.name || '';
  } else enterChallenge(Progress.data.current, { skipStore: true });
  Progress.persist();
  applyClassSettings();
}
function enterChallenge(id, { skipStore = false } = {}) {
  if (App.exam) { enterExamChallenge(id); return; }
  const entry = Progress.data.challenges[id];
  if (!entry || entry.status === 'locked' || App.status !== 'idle') return;
  if (!skipStore) storeWorkspace();
  Progress.data.current = id;
  if (!entry.openedAt) { entry.openedAt = new Date().toISOString(); Progress.log('open', id); }
  selectChallenge(id);
  loadSlot(entry);
  renderGuided();
  Progress.persist();
}
function selectChallenge(id) {
  App.challenge = CHALLENGES.find((c) => c.id === id) || CHALLENGES[0];
  $('practiceResult').innerHTML = '';
  $('projectName').readOnly = true;
  $('projectName').value = App.challenge.title;
}
function renderGuided() {
  if (App.exam) { renderExam(); return; }
  const ch = App.challenge, entry = Progress.ch(ch.id);
  $('stepper').innerHTML = ''; // the list of all the challenges is behind "All challenges"
  $('challengeBox').dataset.unit = ch.cat;
  $('challengeTitle').textContent = ch.title;
  $('challengeMeta').textContent = `${categoryOf(ch).label.split(' · ')[0]} · ${ch.quiz ? 'Quiz · ' : ''}${ch.n} / ${CHALLENGES.length}`;
  $('btnAllCh').hidden = false;
  $('btnSolution').hidden = !App.preview || ch.quiz;
  $('challengeDesc').innerHTML = ch.description;
  const hints = ch.hints || [];
  $('hintBox').innerHTML = hints.slice(0, entry.hints).map((h, i) => `<div class="hint-card">💡 <b>Hint ${i + 1}:</b> ${esc(h)}</div>`).join('');
  $('btnHint').hidden = entry.hints >= hints.length || entry.status === 'validated';
  $('btnHint').textContent = entry.hints ? '💡 Another hint' : '💡 Need a hint?';
  renderValidation();
  updateButtons();
}
function renderValidation() {
  const ch = App.challenge, entry = Progress.ch(ch.id);
  const box = $('validateBox');
  // a quiz has its own button under the questions
  $('btnEvaluate').hidden = ch.quiz || entry.status === 'validated';
  if (entry.status === 'validated') {
    const next = CHALLENGES[CHALLENGES.indexOf(ch) + 1];
    box.innerHTML = `<div class="mc-done"><div class="mc-done-title">🎉 Passed${entry.bestScore !== null ? ' with ' + entry.bestScore + ' %' : ''}!</div>
      ${next ? `<button class="mc-check purple" id="btnNext">Next: ${esc(next.title)} →</button>` : '<div><b>🏆 You finished all the challenges!</b></div>'}</div>`;
    if (next) { $('btnNext').onclick = () => enterChallenge(next.id); $('btnNext').disabled = App.status !== 'idle'; }
  } else box.innerHTML = entry.gradings.length ? `<div class="mc-best">Best so far: <b>${entry.bestScore} %</b> · ${CLASSROOM.passScore} % needed</div>` : '';
}
function onValidated(id) {
  if (!Progress.validate(id, 'teacher')) return;
  toast(`🔓 Your teacher unlocked the next challenge after "${chShort(id)}"`);
  brick.sound.play();
  Sync.push(liveState());
  if (App.mode === 'challenge') renderGuided();
}
function showHint() {
  if (App.exam) { examHint(); return; }
  const n = Math.min((App.challenge.hints || []).length, Progress.ch().hints + 1);
  Progress.onHint(n);
  renderGuided();
}
function criteriaHtml(criteria) {
  return '<ul class="criteria">' + criteria.map((c) => {
    const cls = c.note ? 'ko' : c.points === c.max ? 'ok' : c.points > 0 ? 'part' : 'ko';
    return `<li class="${cls}"><span>${esc(c.label)}</span><span class="pts">${c.note ? '' : `${c.points} / ${c.max}`}</span></li>`;
  }).join('') + '</ul>';
}

// ---------- Quiz ----------
function quizAnswers() { const slot = workSlot(); return (slot && slot.answers) || []; }
function showQuiz(slot) {
  const ch = App.challenge;
  $('blocklyDiv').style.visibility = 'hidden';
  $('quizView').hidden = false;
  const answers = (slot && slot.answers) || [];
  const marks = (slot && slot.quizMarks) || null;
  $('quizView').innerHTML = `<div class="mc-quiz-card"><h2>❓ ${esc(ch.title)}</h2><p class="muted">${ch.description}</p>
    ${ch.questions.map((q, i) => `<div class="mc-q"><p>${i + 1}. ${esc(q.q)}</p>${q.options.map((o, k) => `<label class="${answers[i] === k ? 'picked' : ''}${marks && answers[i] === k ? (marks[i] ? ' right' : ' wrong') : ''}"><input type="radio" name="q${i}" value="${k}"${answers[i] === k ? ' checked' : ''}> ${esc(o)}</label>`).join('')}</div>`).join('')}
    <div style="text-align:right;margin-top:10px"><button class="mc-btn green" id="quizCheck">✅ Check my answers</button></div></div>`;
  $('quizView').querySelectorAll('input[type=radio]').forEach((r) => {
    r.onchange = () => {
      const s = workSlot();
      if (!s) return;
      s.answers = s.answers || [];
      s.answers[Number(r.name.slice(1))] = Number(r.value);
      s.quizMarks = null;
      s.programAt = new Date().toISOString();
      Progress.persist();
      showQuiz(s);
    };
  });
  $('quizCheck').onclick = evaluate;
}
function hideQuiz() { $('quizView').hidden = true; $('blocklyDiv').style.visibility = ''; }

// ---------- Check my answer ----------
async function evaluate() {
  if (App.status !== 'idle' || !App.challenge) return;
  const ch = App.challenge;
  let res;
  if (ch.quiz) {
    const answers = quizAnswers();
    if (ch.questions.some((q, i) => answers[i] === undefined || answers[i] === null)) { toast('Answer every question first.'); return; }
    res = gradeQuiz(ch, answers);
    const slot = workSlot();
    slot.quizMarks = res.criteria.map((c) => c.ok);
    Progress.persist();
    showQuiz(slot);
  } else {
    App.status = 'evaluating';
    updateButtons();
    storeWorkspace();
    await new Promise((r) => setTimeout(r, 30));
    try { res = evaluateChallenge(ch, programForCheck(ws)); } catch (e) { console.error(e); res = { score: 0, criteria: [{ label: 'Your program could not run: ' + e.message, points: 0, max: 1 }], trials: [] }; res.trials = [{ score: 0, criteria: res.criteria }]; }
    App.status = 'idle';
    updateButtons();
    $('practiceResult').innerHTML = '';
  }
  recordVersion('check', res.score);
  if (App.exam) { if (!CR.examOver) onExamGrade(res); return; }
  const wasValidated = Progress.ch().status === 'validated';
  Progress.onGrade(res);
  Sync.push(liveState(), true);
  renderGuided();
  if (!wasValidated && Progress.ch().status === 'validated') brick.sound.play();
  showCheckReport(res);
}
function showCheckReport(r) {
  const passed = r.score >= CLASSROOM.passScore;
  const next = CHALLENGES[CHALLENGES.indexOf(App.challenge) + 1];
  const quiz = App.challenge.quiz;
  openModal(`<h2>${passed ? '🎉 Well done!' : '🔧 Not yet…'}</h2>
    <div class="big-score">${r.score} %</div>
    <p>${passed ? (next ? 'The next challenge is unlocked.' : '🏆 You finished all the challenges. Congratulations!')
    : `You need at least <b>${CLASSROOM.passScore} %</b>. ${quiz ? 'The wrong answers are in red: think again and try once more.' : 'Look at the red crosses, test your program in the simulator and try again. A <b>💡 Hint</b> can help!'}`}</p>
    ${quiz ? '' : criteriaHtml(r.criteria)}
    <div style="display:flex;gap:8px;justify-content:flex-end">${passed && next ? '<button class="primary" id="btnNextModal">Next challenge →</button><button onclick="closeModal()">Stay here</button>' : '<button class="primary" onclick="closeModal()">OK</button>'}</div>`);
  if (passed && next) $('btnNextModal').onclick = () => { closeModal(); enterChallenge(next.id); };
}

// ---------- Home: all the challenges ----------
function showHome() {
  if (!Progress.data) return;
  if (App.exam) { toast('📝 You are in an exam.'); return; }
  const card = (c) => {
    const st = Progress.data.challenges[c.id].status;
    return `<button class="mc-card ${st}" data-go="${c.id}" ${st === 'locked' ? 'disabled' : ''}><div class="top">${st === 'validated' ? '✅' : st === 'locked' ? '🔒' : c.quiz ? '❓' : categoryOf(c).icon}</div>
      <div class="bot"><b>${c.n}. ${esc(c.title)}</b><span>${esc(c.lesson || '')}${c.quiz ? ' · quiz' : ''}</span></div></button>`;
  };
  openModal(`<div class="mc-gallery"><h2>🏠 My challenges</h2>
    ${CATEGORIES.map((cat) => `<h3>${cat.icon} ${esc(cat.label)}</h3><div class="mc-cards">${CHALLENGES.filter((c) => c.cat === cat.id).map(card).join('')}</div>`).join('')}
    ${modeAllowed('free') ? '<h3>🛠️ Free programming</h3><div class="mc-cards"><button class="mc-card" data-go="free"><div class="top">🛠️</div><div class="bot"><b>My project</b><span>Program anything you like</span></div></button></div>' : ''}</div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '980px';
  document.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = () => {
      closeModal();
      if (b.dataset.go === 'free') { Progress.data.mode = 'free'; setMode('sandbox'); return; }
      Progress.data.mode = 'guided';
      if (App.mode !== 'challenge') { storeWorkspace(); App.mode = 'challenge'; $('challengeBox').hidden = false; enterChallenge(b.dataset.go, { skipStore: true }); } else enterChallenge(b.dataset.go);
    };
  });
}

// ---------- JavaScript view ----------
function highlightTs(code) {
  return esc(code)
    .replace(/(&quot;.*?&quot;|`[\s\S]*?`)/g, '<span class="s">$1</span>')
    .replace(/\b(let|function|if|else|for|while|of|return|break|continue|true|false)\b/g, '<span class="k">$1</span>')
    .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="n">$1</span>');
}
function setView(view) {
  App.view = view;
  $('tabBlocks').classList.toggle('on', view === 'blocks');
  $('tabJs').classList.toggle('on', view === 'js');
  $('jsView').hidden = view !== 'js';
  if (view === 'js') $('jsCode').innerHTML = highlightTs(generateTs(ws) || '');
  if (view === 'blocks') Blockly.svgResize(ws);
}

// ---------- Live state for the teacher ----------
function liveState(status) {
  return {
    status: status || (App.status === 'idle' ? 'editing' : App.status),
    mode: progressMode(),
    challenge: App.mode === 'challenge' && App.challenge ? App.challenge.id : null,
    exam: App.exam ? { id: App.exam.id, challenge: App.examCh, over: CR.examOver } : null,
    blocks: ws ? ws.getAllBlocks(false).filter((b) => !b.isShadow()).length : 0,
  };
}
function updateButtons() {
  const busy = App.status !== 'idle';
  for (const id of ['btnEvaluate', 'btnHint']) $(id).disabled = busy;
  $('btnEvaluate').textContent = busy ? '⏳ Checking…' : '✅ Check my answer';
  $('stepper').querySelectorAll('button').forEach((b) => { b.disabled = busy; });
}
function updateSaveStatus() {
  const el = $('syncStatus');
  if (App.preview) { el.textContent = 'Preview · not saved for students'; return; }
  if (!Progress.data) { el.textContent = ''; return; }
  if (Sync.online) {
    const t = Sync.savedAt ? new Date(Sync.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    el.textContent = Progress.dirty || !Sync.savedAt ? '☁️ Saving…' : '☁️ Saved';
    el.title = `Your work is saved automatically (last save ${t}).`;
  } else {
    el.textContent = '⚠️ Not saved online';
    el.title = 'The class server cannot be reached. Download your work to keep it (⚙ → Save my work).';
  }
  el.classList.toggle('on', Sync.online);
}

// ---------- Teacher preview and login ----------
async function startPreview() {
  const code = localStorage.getItem('mbsim.teacherCode') || '';
  const info = await Sync.getJson('api/info?code=' + encodeURIComponent(code));
  if (info && !info.passwordOk && !(info.teacher && !info.needsCode)) {
    openModal(`<h2>🎓 Student view (teacher preview)</h2><p>Type the teacher password to open the student app with every challenge open.</p>
      <p><input id="pvPass" type="password" style="font-size:16px;padding:8px 10px"> <button class="primary" id="pvGo">Open</button></p><p id="pvErr" class="werr"></p>`);
    const go = async () => {
      const pw = $('pvPass').value.trim();
      const r = await Sync.getJson('api/info?code=' + encodeURIComponent(pw));
      if (!r || !r.passwordOk) { $('pvErr').textContent = 'Wrong password.'; return; }
      localStorage.setItem('mbsim.teacherCode', pw);
      closeModal();
      startPreview();
    };
    $('pvGo').onclick = go;
    $('pvPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return;
  }
  $('welcome').hidden = true;
  App.preview = true;
  Sync.disabled = true;
  Progress.key = 'mbsim.v1.preview';
  const saved = Progress.restoreLocal();
  const data = saved && saved.type === 'mb-progress' ? Progress.load(saved) : Progress.create('Teacher', '', 'guided');
  for (const c of CHALLENGES) if (data.challenges[c.id].status === 'locked') data.challenges[c.id].status = 'open';
  Progress.persist();
  document.body.classList.add('preview');
  startSession(data, { quiet: true });
  $('chipName').textContent = '👩‍🏫 Teacher preview';
  $('btnHelpMe').hidden = true;
  $('mExit').textContent = '✕ Close preview';
  $('mExit').onclick = () => { storeWorkspace(); location.href = 'teacher.html'; };
}
function teacherLogin() {
  openModal(`<h2>👩‍🏫 Teacher dashboard</h2>
    <p><label>Password <input id="tPass" type="password" style="font-size:16px;padding:8px 10px;margin-left:6px"></label> <button class="primary" id="tGo">Open</button></p>
    <p><label><input type="checkbox" id="tPreview"> Open the <b>student view</b> instead (every challenge open, for trying them out)</label></p><p id="tErr" class="werr"></p>`);
  const go = async () => {
    const code = $('tPass').value.trim();
    if (!code) return;
    try {
      const info = await (await fetch('api/info?code=' + encodeURIComponent(code), { cache: 'no-store' })).json();
      if (!info.passwordOk) { $('tErr').textContent = 'Wrong password.'; $('tPass').select(); return; }
      localStorage.setItem('mbsim.teacherCode', code);
      location.href = $('tPreview').checked ? 'index.html?preview=1' : 'teacher.html';
    } catch (e) { $('tErr').textContent = 'The class server cannot be reached.'; }
  };
  $('tGo').onclick = go;
  $('tPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  setTimeout(() => $('tPass').focus(), 50);
}
async function showSolution() {
  if (!App.preview || !App.challenge) return;
  let d = null;
  try { d = await (await fetch('api/solutions', { cache: 'no-store', headers: { 'X-Teacher-Code': localStorage.getItem('mbsim.teacherCode') || '' } })).json(); } catch (e) { /* offline */ }
  const set = d && d.solutions && d.solutions[App.challenge.id];
  if (!set || !set.length) { toast('No solution available for this challenge.'); return; }
  openModal(`<h2>🔑 Solution · ${esc(App.challenge.title)}</h2>
    <div class="sol-tabs">${set.map((s, i) => `<button class="mini${i ? '' : ' primary'}" data-sol="${i}">${i + 1}. ${esc(s.title)}</button>`).join(' ')}</div>
    <div id="solWs" style="height:380px;border:1px solid #ddd;border-radius:8px;margin-top:8px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button onclick="closeModal()">Close</button><button class="primary" id="solLoad">Load it into my program</button></div>`);
  $('modal').querySelector('.modal-box').style.maxWidth = '1000px';
  App.solWs = Blockly.inject('solWs', { readOnly: true, renderer: 'makecode', theme: MB_THEME, media: 'lib/blockly/media/', zoom: { controls: true, wheel: true, startScale: 0.75 }, move: { scrollbars: true, drag: true, wheel: true } });
  let cur = 0;
  const show = (i) => {
    cur = i;
    document.querySelectorAll('[data-sol]').forEach((b) => b.classList.toggle('primary', Number(b.dataset.sol) === i));
    App.solWs.clear();
    Blockly.serialization.workspaces.load(set[i].program, App.solWs);
    App.solWs.scrollCenter();
  };
  document.querySelectorAll('[data-sol]').forEach((b) => { b.onclick = () => show(Number(b.dataset.sol)); });
  show(0);
  $('solLoad').onclick = () => { const p = set[cur].program; closeModal(); loadProgram(p); storeWorkspace(); toast('🔑 Solution loaded.'); };
}
function showHelp() {
  openModal(`<h2>Help</h2>
    <h3>Programming</h3><ul>
      <li>Click a category (Basic, Input…) and drag blocks into the workspace. Drop a block on the categories to delete it.</li>
      <li>Only blocks inside an event (<b>on start</b>, <b>forever</b>, <b>on button A pressed</b>…) run. Loose blocks are greyed out.</li>
      <li>The simulator restarts by itself every time you change your program. Click the buttons A and B of the board, the pins, the logo; move the mouse over the board to tilt it.</li>
    </ul>
    <h3>Challenges</h3><ul>
      <li>Read the challenge, build your program and test it in the simulator.</li>
      <li>Stuck? Click <b>💡 Hint</b>.</li>
      <li>When it works, click <b>✅ Check my answer</b>. With ${CLASSROOM.passScore} % or more, the next challenge unlocks. 🏠 shows all the challenges.</li>
    </ul>
    <h3>Saving</h3><ul><li>Your work is saved automatically. ⚙ → <b>Save my work</b> downloads a copy.</li></ul>`);
}
function downloadInfo() {
  openModal(`<h2>Download</h2><p>This is a simulator: there is no micro:bit to download to, and <b>your work is saved automatically</b>.</p>
    <p>${App.mode === 'challenge' && App.challenge ? 'To get your score, click <b>✅ Check my answer</b>.' : 'Test your program in the simulator on the left.'}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button id="dlCopy">💾 Download a copy of my work</button><button class="primary" onclick="closeModal()">OK</button></div>`);
  $('dlCopy').onclick = () => { closeModal(); saveWork(); };
}

// =====================================================================
// Init
// =====================================================================
function init() {
  App.advanced = !!LS.get(STORAGE + 'advanced', false);
  setupEditor();
  SimRun.restart();
  updateSimButtons();

  // header
  $('tabBlocks').onclick = () => setView('blocks');
  $('tabJs').onclick = () => setView('js');
  $('tabMore').onclick = () => setView(App.view === 'js' ? 'blocks' : 'js');
  $('btnHome').onclick = showHome;
  $('btnHelp').onclick = showHelp;
  $('btnSettings').onclick = (e) => { e.stopPropagation(); $('settingsMenu').hidden = !$('settingsMenu').hidden; };
  document.addEventListener('click', () => { $('settingsMenu').hidden = true; });
  $('mSave').onclick = saveWork;
  $('mSwitch').onclick = switchMode;
  $('mNewProject').onclick = () => {
    if (!Progress.data || App.exam) return;
    if (App.mode === 'sandbox' && !confirm('Start a new empty project? Your current blocks will be replaced.')) return;
    storeWorkspace();
    Progress.data.mode = 'free';
    Progress.data.free.program = null;
    Progress.data.free.name = '';
    setMode('sandbox');
  };
  $('mExit').onclick = exitSession;
  // simulator toolbar
  $('simPlay').onclick = () => SimRun.setRunning(!SimRun.running);
  $('simRestart').onclick = () => { SimRun.running = true; SimRun.restart(); };
  $('simSlow').onclick = () => { SimRun.slow = !SimRun.slow; updateSimButtons(); };
  $('simMute').onclick = () => { SimRun.muted = !SimRun.muted; if (SimRun.muted) AudioOut.stop(); updateSimButtons(); };
  $('simShot').onclick = () => {
    const svg = document.querySelector('#boards svg');
    if (!svg) return;
    download('microbit-screenshot.svg', new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  };
  $('simFull').onclick = () => { const el = $('boards'); if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen(); };
  $('btnShowData').onclick = () => { $('dataView').hidden = false; renderData(); };
  $('dataBack').onclick = () => { $('dataView').hidden = true; };
  $('dataClear').onclick = () => { SimRun.serial = []; SimRun.serialNums = []; renderData(); };
  // footer
  $('btnDownload').onclick = downloadInfo;
  $('btnDownloadMore').onclick = downloadInfo;
  $('btnSaveProject').onclick = () => { if (Progress.data) { storeWorkspace(); Sync.push(liveState(), true); toast(Sync.online ? '☁️ Saved.' : '💾 Saved on this computer.'); } };
  $('projectName').addEventListener('input', () => { if (App.mode === 'sandbox' && Progress.data) { Progress.data.free.name = $('projectName').value.slice(0, 60); Progress.persist(); } });
  $('btnUndo').onclick = () => ws.undo(false);
  $('btnRedo').onclick = () => ws.undo(true);
  $('btnZoomIn').onclick = () => ws.zoomCenter(1);
  $('btnZoomOut').onclick = () => ws.zoomCenter(-1);
  // challenge card
  $('stepper').addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) enterChallenge(b.dataset.ch); });
  $('btnHint').onclick = showHint;
  $('btnEvaluate').onclick = evaluate;
  $('btnSolution').onclick = showSolution;
  $('btnAllCh').onclick = showHome;
  // welcome
  document.querySelectorAll('.choice').forEach((b) => { b.onclick = () => chooseMode(b.dataset.mode); });
  $('wChange').onclick = () => pickClass($('wClass').value);
  $('wCodeGo').onclick = submitClassCode;
  $('wOtherCode').onclick = () => { ClassCode.set(''); CR.roster = null; showWelcome(); };
  $('wCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitClassCode(); });
  $('wOpen').onclick = () => $('wFile').click();
  $('wFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openWorkFile(f); };
  $('wTeacher').onclick = teacherLogin;
  $('btnReminderSave').onclick = saveWork;
  $('btnReminderLater').onclick = () => { $('saveReminder').hidden = true; App.reminderSnoozedUntil = Date.now() + 10 * 60000; };
  $('modalClose').onclick = closeModal;
  $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

  // activity, save reminder, live sync
  for (const ev of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(ev, () => { Progress.lastInput = Date.now(); }, { capture: true, passive: true });
  setInterval(() => {
    if (!Progress.data) return;
    Progress.tick(progressMode(), false);
    if (!Sync.online && Progress.minutesSinceSave() > CLASSROOM.saveReminderMinutes && Date.now() > App.reminderSnoozedUntil) $('saveReminder').hidden = false;
    if (Sync.online) $('saveReminder').hidden = true;
    updateSaveStatus();
  }, 1000);
  window.addEventListener('beforeunload', (e) => {
    if (!Progress.data) return;
    storeWorkspace();
    if (Sync.online && !Sync.disabled) {
      Progress.data.saveRev = (Progress.data.saveRev || 0) + 1;
      try { localStorage.setItem(Progress.key, JSON.stringify(Progress.data)); } catch (err) { /* storage blocked */ }
      try { fetch('api/work', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Class-Code': ClassCode.get() }, body: JSON.stringify({ ...Progress.data, live: liveState('left') }) }); } catch (err) { /* ignore */ }
      if (Sync.savedRecently(20)) return;
    }
    if (Progress.minutesSinceSave() > 0.5) { e.preventDefault(); e.returnValue = ''; }
  });
  Sync.onValidated = (id) => onValidated(id);
  Sync.onRemoteChange = onRemoteChange;
  Sync.onDeleted = onDeleted;
  Sync.loadSettings().then(applyClassSettings);
  Sync.onSettingsChanged = () => Sync.loadSettings().then(applyClassSettings);
  Sync.onStatus = () => updateSaveStatus();
  Sync.start(() => liveState());
  setupClassroom();
  window.addEventListener('resize', () => Blockly.svgResize(ws));

  let last = performance.now();
  const frame = (now) => {
    SimRun.frame(now - last);
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).get('preview')) startPreview(); else showWelcome();
  if (location.hash.startsWith('#dev')) setTimeout(devHook, 600);
}
// Development: index.html?preview=1#dev&cat=Input&ch=dice&prog=<url-encoded JSON>&view=js
async function devHook() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('student')) {
    const [cls, name] = p.get('student').split(':');
    pickClass(cls); pickName(name);
    await chooseModeNow(p.get('mode') || 'guided');
    await new Promise((r) => setTimeout(r, 300));
  }
  if (p.get('adv')) { App.advanced = true; ws.updateToolbox(toolboxDef()); }
  if (p.get('ch') && Progress.data) { Progress.data.challenges[p.get('ch')].status = 'open'; enterChallenge(p.get('ch')); }
  if (p.get('prog')) loadProgram(JSON.parse(p.get('prog')));
  if (p.get('cat')) { const tb = ws.getToolbox(); const it = tb.getToolboxItems().find((i) => i.getName && i.getName() === p.get('cat')); if (it) tb.setSelectedItem(it); }
  if (p.get('search')) { $('tbSearch').value = p.get('search'); searchBlocks(p.get('search')); }
  if (p.get('view')) setView(p.get('view'));
  if (p.get('click')) setTimeout(() => p.get('click').split(',').forEach((b) => SimRun.boards[0] && SimRun.boards[0].click(b)), 300);
  if (p.get('pose')) setTimeout(() => SimRun.views[0].gesture(p.get('pose'), true), 400);
  if (p.get('check')) { storeWorkspace(); await evaluate(); }
  if (p.get('home')) showHome();
}
window.addEventListener('load', init);

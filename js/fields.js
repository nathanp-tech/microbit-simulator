// Special block fields of MakeCode: LED matrix (show leds), icon grid, note picker (piano), melody editor,
// number with presets (pause), text with quotes, ⊕ / ⊖ buttons, draggable parameters.
'use strict';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, parent) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

// Small LED picture (data URI) for the icon menu and the icon field.
function ledIconUri(pattern, size = 24, on = '#ffffff', off = 'rgba(0,0,0,0.25)') {
  const rows = pattern.trim().split(/\s+/);
  const c = size / 5;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
  rows.forEach((r, y) => r.split('').forEach((ch, x) => {
    s += `<rect x="${x * c + c * 0.12}" y="${y * c + c * 0.12}" width="${c * 0.76}" height="${c * 0.76}" rx="${c * 0.18}" fill="${ch === '#' ? on : off}"/>`;
  }));
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s + '</svg>');
}

// ---------- LED matrix (show leds, create image) ----------
class FieldLedMatrix extends Blockly.Field {
  static CELL = 25; static HM = 7; static VM = 5; static BOTTOM = 9;
  constructor(value, cols = 5, validator) {
    super(value || FieldLedMatrix.blank(cols), validator);
    this.cols = cols;
    this.SERIALIZABLE = true;
    this.EDITABLE = true;
  }
  static blank(cols) { return Array.from({ length: 5 }, () => '.'.repeat(cols)).join(' '); }
  static fromJson(o) { return new FieldLedMatrix(o.value, o.cols || 5); }
  doClassValidation_(v) {
    if (typeof v !== 'string') return null;
    const rows = v.trim().split(/\s+/);
    if (rows.length !== 5) return null;
    return rows.map((r) => r.padEnd(this.cols, '.').slice(0, this.cols).replace(/[^#.]/g, '.')).join(' ');
  }
  cellOn(x, y) { const rows = this.getValue().split(' '); return rows[y] && rows[y][x] === '#'; }
  initView() {
    const { CELL, HM, VM, BOTTOM } = FieldLedMatrix;
    this.size_ = new Blockly.utils.Size(this.cols * (CELL + HM) + HM, 5 * (CELL + VM) + VM * 2 + BOTTOM - 6);
    this.cells = [];
    const g = svgEl('g', { class: 'mbLedMatrix' }, this.fieldGroup_);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < this.cols; x++) {
        const r = svgEl('rect', { x: HM + x * (CELL + HM), y: VM + y * (CELL + VM), width: CELL, height: CELL, rx: 5, 'data-x': x, 'data-y': y, class: 'mbLedCell' }, g);
        this.cells.push(r);
      }
    }
    g.addEventListener('pointerdown', (e) => this.onDown(e));
    this.render_();
  }
  render_() {
    if (!this.cells) return;
    for (const r of this.cells) {
      const on = this.cellOn(Number(r.dataset.x), Number(r.dataset.y));
      r.setAttribute('fill', on ? '#ffffff' : '#000000');
      r.setAttribute('fill-opacity', on ? '1' : '0.2');
    }
  }
  updateSize_() { /* fixed size */ }
  getText_() { return ''; }
  setCell(x, y, on) {
    const rows = this.getValue().split(' ').map((r) => r.split(''));
    rows[y][x] = on ? '#' : '.';
    this.setValue(rows.map((r) => r.join('')).join(' '));
  }
  onDown(e) {
    const block = this.getSourceBlock();
    if (!block || block.isInFlyout || !block.isEditable() || e.button !== 0) return;
    const t = e.target;
    if (!t.dataset || t.dataset.x === undefined) return;
    e.stopPropagation();
    e.preventDefault();
    const x = Number(t.dataset.x), y = Number(t.dataset.y);
    const mode = !this.cellOn(x, y);
    Blockly.Events.setGroup(true);
    this.setCell(x, y, mode);
    const move = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (el && el.dataset && el.dataset.x !== undefined && this.cells.includes(el)) {
        const cx = Number(el.dataset.x), cy = Number(el.dataset.y);
        if (this.cellOn(cx, cy) !== mode) this.setCell(cx, cy, mode);
      }
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); Blockly.Events.setGroup(false); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }
  showEditor_() { /* cells are clicked directly on the block */ }
}
Blockly.fieldRegistry.register('field_ledmatrix', FieldLedMatrix);

// ---------- Icon picker (show icon): a grid of icons in the block colour ----------
class FieldIconGrid extends Blockly.FieldDropdown {
  constructor(options, columns = 5, validator) {
    super(options, validator);
    this.columns = columns;
  }
  static fromJson(o) { return new FieldIconGrid(o.options, o.columns); }
  showEditor_(e) {
    super.showEditor_(e);
    const div = Blockly.DropDownDiv.getContentDiv();
    div.classList.add('mbIconGridMenu');
    div.style.setProperty('--cols', this.columns);
  }
}
Blockly.fieldRegistry.register('field_icongrid', FieldIconGrid);

// ---------- Number with presets (pause (ms) 100 ▾, every 500 ▾ ms) ----------
class FieldNumberPresets extends Blockly.FieldNumber {
  constructor(value, presets, validator) {
    super(value, undefined, undefined, undefined, validator);
    this.presets = presets || [];
  }
  static fromJson(o) { return new FieldNumberPresets(o.value, o.presets); }
  getText_() { return String(this.getValue()) + ' ▾'; }
  getEditorText_(v) { return String(v); }
  showEditor_(e, quiet) {
    super.showEditor_(e, quiet);
    const m = document.createElement('div');
    m.className = 'mbPresetMenu';
    m.innerHTML = this.presets.map(([label, v]) => `<div class="mbPreset" data-v="${v}">${label}</div>`).join('');
    const r = this.getSvgRoot().getBoundingClientRect();
    m.style.left = r.left + 'px';
    m.style.top = (r.bottom + 6) + 'px';
    document.body.appendChild(m);
    m.addEventListener('pointerdown', (ev) => {
      const it = ev.target.closest('.mbPreset');
      if (!it) return;
      ev.preventDefault();
      this.setValue(Number(it.dataset.v));
      Blockly.WidgetDiv.hide();
    });
    this.presetMenu = m;
  }
  widgetDispose_() {
    super.widgetDispose_();
    if (this.presetMenu) { this.presetMenu.remove(); this.presetMenu = null; }
  }
}
Blockly.fieldRegistry.register('field_numberpresets', FieldNumberPresets);

// ---------- Text with quotes ----------
class FieldQuotedText extends Blockly.FieldTextInput {
  static fromJson(o) { return new FieldQuotedText(o.text); }
  getText_() { return '“' + (this.getValue() || '') + '”'; }
  getEditorText_(v) { return String(v); }
}
Blockly.fieldRegistry.register('field_quotedtext', FieldQuotedText);

// ---------- Note picker: a piano from Low C to High B ----------
const AudioOut = {
  ctx: null, osc: null, gain: null, muted: false, stopTimer: null,
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },
  // freq 0 = silence; ms -1 = until the next tone
  tone(freq, ms, volume = 128) {
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime;
    if (!this.osc) {
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'square';
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.osc.connect(this.gain).connect(this.ctx.destination);
      this.osc.start();
    }
    clearTimeout(this.stopTimer);
    if (!freq) { this.gain.gain.setValueAtTime(0, t); return; }
    this.osc.frequency.setValueAtTime(freq, t);
    this.gain.gain.setValueAtTime(0.06 * Math.min(1, volume / 128), t);
    if (ms > 0) this.stopTimer = setTimeout(() => { if (this.gain) this.gain.gain.setValueAtTime(0, this.ctx.currentTime); }, ms * 0.95);
  },
  stop() { clearTimeout(this.stopTimer); if (this.gain && this.ctx) this.gain.gain.setValueAtTime(0, this.ctx.currentTime); },
};

class FieldNote extends Blockly.FieldNumber {
  static fromJson(o) { return new FieldNote(o.value); }
  getText_() { return noteLabel(this.getValue()); }
  showEditor_() {
    const div = Blockly.DropDownDiv.getContentDiv();
    div.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'mbPiano';
    const whites = PIANO_NOTES.filter((n) => !n.name.includes('#') && !n.name.includes('b'));
    const W = 26;
    let html = `<div class="mbPianoKeys" style="width:${whites.length * W}px">`;
    whites.forEach((n, i) => { html += `<div class="mbKey white${n.freq === Number(this.getValue()) ? ' on' : ''}" data-f="${n.freq}" style="left:${i * W}px;width:${W}px" title="${noteLabel(n.freq)}"></div>`; });
    let wi = 0;
    PIANO_NOTES.forEach((n) => {
      if (!n.name.includes('#') && !n.name.includes('b')) { wi++; return; }
      html += `<div class="mbKey black${n.freq === Number(this.getValue()) ? ' on' : ''}" data-f="${n.freq}" style="left:${wi * W - 8}px" title="${noteLabel(n.freq)}"></div>`;
    });
    html += `</div><div class="mbPianoLabel">${noteLabel(this.getValue())}</div>`;
    wrap.innerHTML = html;
    div.appendChild(wrap);
    wrap.addEventListener('pointerover', (e) => { const k = e.target.closest('.mbKey'); if (k) wrap.querySelector('.mbPianoLabel').textContent = noteLabel(k.dataset.f); });
    wrap.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('.mbKey');
      if (!k) return;
      e.preventDefault();
      this.setValue(Number(k.dataset.f));
      AudioOut.tone(Number(k.dataset.f), 300);
      Blockly.DropDownDiv.hideIfOwner(this, true);
    });
    const block = this.getSourceBlock();
    const parent = block.getParent() || block;
    Blockly.DropDownDiv.setColour(parent.getColour(), parent.style.colourTertiary);
    Blockly.DropDownDiv.showPositionedByField(this);
  }
}
Blockly.fieldRegistry.register('field_note', FieldNote);

// ---------- Melody editor: 8 beats × 8 notes (C to high C) ----------
class FieldMelody extends Blockly.Field {
  constructor(value, validator) {
    super(value || 'C D E F G A B C5 ', validator);
    this.SERIALIZABLE = true;
  }
  static fromJson(o) { return new FieldMelody(o.value); }
  notes() { const n = String(this.getValue()).trim().split(/\s+/); while (n.length < 8) n.push('-'); return n.slice(0, 8); }
  doClassValidation_(v) { return typeof v === 'string' ? v : null; }
  initView() {
    this.size_ = new Blockly.utils.Size(8 * 11 + 26, 24);
    this.bg = svgEl('rect', { x: 0, y: 0, rx: 12, width: this.size_.width, height: 24, fill: '#ffffff', 'fill-opacity': 0.35 }, this.fieldGroup_);
    const t = svgEl('text', { x: 6, y: 17, class: 'blocklyText', fill: '#ffffff', 'font-size': 14 }, this.fieldGroup_);
    t.textContent = '♫';
    this.dots = [];
    for (let i = 0; i < 8; i++) this.dots.push(svgEl('rect', { x: 20 + i * 11, y: 7, width: 9, height: 10, rx: 2 }, this.fieldGroup_));
    this.render_();
  }
  render_() {
    if (!this.dots) return;
    const notes = this.notes();
    this.dots.forEach((d, i) => {
      const row = MELODY_ROWS.find((r) => r.note === notes[i]);
      d.setAttribute('fill', row ? row.color : '#ffffff');
      d.setAttribute('fill-opacity', row ? 1 : 0.5);
    });
  }
  updateSize_() {}
  getText_() { return this.notes().join(' '); }
  showEditor_() {
    const div = Blockly.DropDownDiv.getContentDiv();
    div.innerHTML = '';
    const ed = document.createElement('div');
    ed.className = 'mbMelodyEditor';
    let notes = this.notes();
    const draw = () => {
      ed.innerHTML = `<div class="mbMelodyGrid">${MELODY_ROWS.map((r) => `<div class="mbMelRow"><span class="mbMelNote">${r.note.replace('5', '')}</span>${notes.map((n, i) => `<div class="mbMelCell${n === r.note ? ' on' : ''}" data-i="${i}" data-n="${r.note}" style="${n === r.note ? 'background:' + r.color : ''}"></div>`).join('')}</div>`).join('')}</div>
        <div class="mbMelActions"><button class="mbMelPlay" title="Play">▶</button><button class="mbMelDone">Done</button></div>`;
    };
    draw();
    ed.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.mbMelCell');
      if (c) {
        e.preventDefault();
        const i = Number(c.dataset.i);
        notes[i] = notes[i] === c.dataset.n ? '-' : c.dataset.n;
        if (notes[i] !== '-') AudioOut.tone(MELODY_FREQ[notes[i]], 200);
        this.setValue(notes.join(' ') + ' ');
        draw();
        return;
      }
      if (e.target.closest('.mbMelPlay')) {
        e.preventDefault();
        notes.forEach((n, i) => setTimeout(() => { if (n !== '-') AudioOut.tone(MELODY_FREQ[n], 230); }, i * 250));
      }
      if (e.target.closest('.mbMelDone')) { e.preventDefault(); Blockly.DropDownDiv.hideIfOwner(this, true); }
    });
    div.appendChild(ed);
    Blockly.DropDownDiv.setColour('#ffffff', '#dddddd');
    Blockly.DropDownDiv.showPositionedByField(this);
  }
}
Blockly.fieldRegistry.register('field_melody', FieldMelody);
// "C D E F G A B C5" -> notes for the runtime
function melodyToNotes(v) {
  return String(v).trim().split(/\s+/).map((n) => ({ freq: n === '-' ? 0 : MELODY_FREQ[n] || 0, beats: 1 }));
}

// ---------- ⊕ / ⊖ buttons (if / else if, array of, join, plot bar graph) ----------
const PLUS_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M12 7v10M7 12h10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>');
const MINUS_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M7 12h10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>');
function plusMinusField(kind, onClick) {
  const f = new Blockly.FieldImage(kind === '+' ? PLUS_URI : MINUS_URI, 24, 24, kind === '+' ? 'add' : 'remove', (field) => {
    const b = field.getSourceBlock();
    if (!b || b.isInFlyout || !b.isEditable()) return;
    Blockly.Events.setGroup(true);
    const oldState = b.saveExtraState ? JSON.stringify(b.saveExtraState()) : null;
    onClick(b);
    const newState = b.saveExtraState ? JSON.stringify(b.saveExtraState()) : null;
    if (oldState !== newState) Blockly.Events.fire(new (Blockly.Events.get(Blockly.Events.BLOCK_CHANGE))(b, 'mutation', null, oldState, newState));
    Blockly.Events.setGroup(false);
  });
  return f;
}

// ---------- Draggable parameters (receivedNumber, name, value, function inputs) ----------
// Dragging the red parameter out of its event block leaves a copy behind, like MakeCode.
class DuplicateOnDragStrategy extends Blockly.dragging.BlockDragStrategy {
  constructor(block) { super(block); this.mbBlock = block; }
  startDrag(e) {
    const b = this.mbBlock;
    const target = b.outputConnection && b.outputConnection.targetConnection;
    const parent = target && target.getSourceBlock();
    const dup = parent && parent.mbParamSlots;
    super.startDrag(e);
    if (dup && !target.targetConnection) {
      const copy = b.workspace.newBlock(b.type);
      copy.setFieldValue(b.getFieldValue('NAME'), 'NAME');
      copy.initSvg();
      copy.render();
      target.connect(copy.outputConnection);
    }
  }
}

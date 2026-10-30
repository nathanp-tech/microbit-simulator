// The micro:bit V2 simulator board (SVG). The artwork and the widgets (light level, thermometer, compass,
// SHAKE, A+B, logo, pins) follow the MakeCode simulator (pxt-microbit, MIT licence) so students see the same board.
'use strict';

const MBV = {
  W: 500, H: 408,
  outline: 'M 498 31.9 C 498 14.3 483.7 0 466.1 0 H 31.9 C 14.3 0 0 14.3 0 31.9 v 342.2 C -1 399 21 405 23 406 c 0 0 -1 -9 8 -8 l 18 0 c 0 0 9 -1 8 8 h 7 h 50 h 7 c 0 0 -1 -9 8 -8 l 18 0 c 0 0 9 -1 8 8 h 7 h 63 h 7 c 0 0 -1 -9 8 -8 l 18 0 c 0 0 9 -1 8 8 h 7 h 64 h 7 c 0 0 -1 -9 8 -8 l 18 0 c 0 0 9 -1 8 8 h 7 h 51 h 5 c 0 0 -1 -9 8 -8 l 18 0 c 0 0 9 -1 8 8 h 0 c 9 0 23 -17 23 -31 V 31.9 z M 14.3 206.7 c -2.7 0 -4.8 -2.2 -4.8 -4.8 c 0 -2.7 2.2 -4.8 4.8 -4.8 c 2.7 0 4.8 2.2 4.8 4.8 C 19.2 204.6 17 206.7 14.3 206.7 z M 486.2 206.7 c -2.7 0 -4.8 -2.2 -4.8 -4.8 c 0 -2.72 0.2 -4.8 4.8 -4.8 c 2.7 0 4.8 2.2 4.8 4.8 C 491 204.6 488.8 206.7 486.2 206.7 z',
  display: 'M333.8,310.3H165.9c-8.3,0-15-6.7-15-15V127.5c0-8.3,6.7-15,15-15h167.8c8.3,0,15,6.7,15,15v167.8C348.8,303.6,342.1,310.3,333.8,310.3z',
  theme: [['polygon', '115,56.7 173.1,0 115,0'], ['path', 'M114.2,0H25.9C12.1,2.1,0,13.3,0,27.7v83.9L114.2,0z'], ['polygon', '173,27.9 202.5,0 173,0'], ['polygon', '54.1,242.4 54.1,274.1 22.4,274.1'], ['polygon', '446.2,164.6 446.2,132.8 477.9,132.8']],
  head: ['M 269.9 50.2 L 269.9 50.2 l -39.5 0 v 0 c -14.1 0.1 -24.6 10.7 -24.6 24.8 c 0 13.9 10.4 24.4 24.3 24.7 v 0 h 39.6 c 14.2 0 24.8 -10.6 24.8 -24.7 C 294.5 61 284 50.3 269.9 50.2 M 269.7 89.2',
    'M269.9,50.2L269.9,50.2l-39.5,0v0c-14.1,0.1-24.6,10.7-24.6,24.8c0,13.9,10.4,24.4,24.3,24.7v0h39.6c14.2,0,24.8-10.6,24.8-24.7C294.5,61,284,50.3,269.9,50.2 M269.7,89.2L269.7,89.2l-39.3,0c-7.7-0.1-14-6.4-14-14.2c0-7.8,6.4-14.2,14.2-14.2h39.1c7.8,0,14.2,6.4,14.2,14.2C283.9,82.9,277.5,89.2,269.7,89.2',
    'M230.6,69.7c-2.9,0-5.3,2.4-5.3,5.3c0,2.9,2.4,5.3,5.3,5.3c2.9,0,5.3-2.4,5.3-5.3C235.9,72.1,233.5,69.7,230.6,69.7',
    'M269.7,80.3c2.9,0,5.3-2.4,5.3-5.3c0-2.9-2.4-5.3-5.3-5.3c-2.9,0-5.3,2.4-5.3,5.3C264.4,77.9,266.8,80.3,269.7,80.3'],
  headCompass: 'm269.9,50.134647l0,0l-39.5,0l0,0c-14.1,0.1 -24.6,10.7 -24.6,24.8c0,13.9 10.4,24.4 24.3,24.7l0,0l39.6,0c14.2,0 40.36034,-22.97069 40.36034,-24.85394c0,-1.88326 -26.06034,-24.54606 -40.16034,-24.64606m-0.2,39l0,0l-39.3,0c-7.7,-0.1 -14,-6.4 -14,-14.2c0,-7.8 6.4,-14.2 14.2,-14.2l39.1,0c7.8,0 14.2,6.4 14.2,14.2c0,7.9 -6.4,14.2 -14.2,14.2l0,0l0,0z',
  mic: 'M 352.852 71 C 351.315 71 350.07 72.248 350.07 73.784 V 79.056 C 350.07 80.594 351.316 81.838 352.852 81.838 C 354.387 81.838 355.634 80.593 355.634 79.056 V 73.784 C 355.634 72.248 354.387 71 352.852 71 Z M 346.743 79.981 C 346.743 82.84 348.853 85.062 351.501 85.658 V 87.095 H 348.448 V 89.329 H 357.366 V 87.095 H 354.306 V 85.658 C 356.954 85.064 359.071 82.842 359.071 79.981 H 357.057 C 357.057 82.174 355.168 83.81 352.905 83.81 C 350.64 83.81 348.757 82.173 348.757 79.981 Z',
  pins: {
    P0: 'M 16.5 341.2 c 0 0.4 -0.1 0.9 -0.1 1.3 v 60.7 c 2.6 1.8 4.6 2.8 8.6 2.8 c 0 0 -1 -9 8 -8 l 16 0 c 0 0 9 -1 8 8 h 8 v -64.7 c 0 0 0 -0.1 0 -0.1 c 0 -13 -10.6 -23.6 -23.7 -23.6 C 27.2 317.6 16.5 328.1 16.5 341.2 z M 21.2 341.6 c 0 -10.7 8.7 -19.3 19.3 -19.3 c 10.7 0 19.3 8.7 19.3 19.3 c 0 10.7 -8.6 19.3 -19.3 19.3 C 29.9 360.9 21.2 352.2 21.2 341.6 z',
    P1: 'M139.1,317.3c-12.8,0-22.1,10.3-23.1,23.1V406h 6 c 0 0 -1 -9 8 -8 l 17 0 c 0 0 9 -1 8 8 h 7v-65.6C162.2,327.7,151.9,317.3,139.1,317.3zM139.3,360.1c-10.7,0-19.3-8.6-19.3-19.3c0-10.7,8.6-19.3,19.3-19.3c10.7,0,19.3,8.7,19.3,19.3C158.6,351.5,150,360.1,139.3,360.1z',
    P2: 'M249,317.3c-12.8,0-22.1,10.3-23.1,23.1V406h 6 c 0 0 -1 -9 8 -8 l 17 0 c 0 0 9 -1 8 8 h 7v-65.6C272.1,327.7,261.8,317.3,249,317.3z M249.4,360.1c-10.7,0-19.3-8.6-19.3-19.3c0-10.7,8.6-19.3,19.3-19.3c10.7,0,19.3,8.7,19.3,19.3C268.7,351.5,260.1,360.1,249.4,360.1z',
    V3: 'M359.9,317.3c-12.8,0-22.1,10.3-23.1,23.1V406h 7 c 0 0 -1 -9 8 -8 l 17 0 c 0 0 9 -1 8 8 h 7v-65.6C383,327.7,372.7,317.3,359.9,317.3z M360,360.1c-10.7,0-19.3-8.6-19.3-19.3c0-10.7,8.6-19.3,19.3-19.3c10.7,0,19.3,8.7,19.3,19.3C379.3,351.5,370.7,360.1,360,360.1z',
    GND: 'M 458 317.6 c -13 0 -23.6 10.6 -23.6 23.6 c 0 0 0 0.1 0 0.1 h 0 V 406 h 7 c 0 0 -1 -9 8 -8 l 17 0 c 0 0 9 -1 8 8 h 1.6 c 2 0 4 -1 5 -3 v -60.7 c 0 -0.4 0 -0.9 0 -1.3 C 481.6 328.1 471 317.6 458 317.6 z M 457.8 360.9 c -10.7 0 -19.3 -8.6 -19.3 -19.3 c 0 -10.7 8.6 -19.3 19.3 -19.3 c 10.7 0 19.3 8.7 19.3 19.3 C 477.1 352.2 468.4 360.9 457.8 360.9 z',
    P3: 'M0,357.7v19.2c0,10.8,6.2,20.2,14.4,25.2v-44.4H0z',
    P20: 'M483.6,402c8.2-5,14.4-14.4,14.4-25.1v-19.2h-14.4V402z',
  },
  smallPins: [66.7, 79.1, 91.4, 103.7, 164.3, 176.6, 188.9, 201.3, 213.6, 275.2, 287.5, 299.8, 312.1, 324.5, 385.1, 397.4, 409.7, 422],
  labels: ['M35.7,376.4c0-2.8,2.1-5.1,5.5-5.1c3.3,0,5.5,2.4,5.5,5.1v4.7c0,2.8-2.2,5.1-5.5,5.1c-3.3,0-5.5-2.4-5.5-5.1V376.4zM43.3,376.4c0-1.3-0.8-2.3-2.2-2.3c-1.3,0-2.1,1.1-2.1,2.3v4.7c0,1.2,0.8,2.3,2.1,2.3c1.3,0,2.2-1.1,2.2-2.3V376.4z',
    'M136.2,374.1c2.8,0,3.4-0.8,3.4-2.5h2.9v14.3h-3.4v-9.5h-3V374.1z',
    'M248.6,378.5c1.7-1,3-1.7,3-3.1c0-1.1-0.7-1.6-1.6-1.6c-1,0-1.8,0.6-1.8,2.1h-3.3c0-2.6,1.8-4.6,5.1-4.6c2.6,0,4.9,1.3,4.9,4.3c0,2.4-2.3,3.9-3.8,4.7c-2,1.3-2.5,1.8-2.5,2.9h6.1v2.7h-10C244.8,381.2,246.4,379.9,248.6,378.5z',
    'M352.1,381.1c0,1.6,0.9,2.5,2.2,2.5c1.2,0,1.9-0.9,1.9-1.9c0-1.2-0.6-2-2.1-2h-1.3v-2.6h1.3c1.5,0,1.9-0.7,1.9-1.8c0-1.1-0.7-1.6-1.6-1.6c-1.4,0-1.8,0.8-1.8,2.1h-3.3c0-2.4,1.5-4.6,5.1-4.6c2.6,0,5,1.3,5,4c0,1.6-1,2.8-2.1,3.2c1.3,0.5,2.3,1.6,2.3,3.5c0,2.7-2.4,4.3-5.2,4.3c-3.5,0-5.5-2.1-5.5-5.1H352.1z',
    'M368.5,385.9h-3.1l-5.1-14.3h3.5l3.1,10.1l3.1-10.1h3.6L368.5,385.9z',
    'M444.4,378.3h7.4v2.5h-1.5c-0.6,3.3-3,5.5-7.1,5.5c-4.8,0-7.5-3.5-7.5-7.5c0-3.9,2.8-7.5,7.5-7.5c3.8,0,6.4,2.3,6.6,5h-3.5c-0.2-1.1-1.4-2.2-3.1-2.2c-2.7,0-4.1,2.3-4.1,4.7c0,2.5,1.4,4.7,4.4,4.7c2,0,3.2-1.2,3.4-2.7h-2.5V378.3z',
    'M461.4,380.9v-9.3h3.3v14.3h-3.5l-5.2-9.2v9.2h-3.3v-14.3h3.5L461.4,380.9z',
    'M472.7,371.6c4.8,0,7.5,3.5,7.5,7.2s-2.7,7.2-7.5,7.2h-5.3v-14.3H472.7z M470.8,374.4v8.6h1.8c2.7,0,4.2-2.1,4.2-4.3s-1.6-4.3-4.2-4.3H470.8z'],
  btnA: 'M69.7,203.5c0,8.7-7,15.7-15.7,15.7s-15.7-7-15.7-15.7c0-8.7,7-15.7,15.7-15.7S69.7,194.9,69.7,203.5',
  btnB: 'M461.9,203.5c0,8.7-7,15.7-15.7,15.7c-8.7,0-15.7-7-15.7-15.7c0-8.7,7-15.7,15.7-15.7C454.9,187.8,461.9,194.9,461.9,203.5',
  labelA: 'M48.1,270.9l-0.6-1.7h-5.1l-0.6,1.7h-3.5l5.1-14.3h3.1l5.2,14.3H48.1z M45,260.7l-1.8,5.9h3.5L45,260.7z',
  labelB: 'M449.1,135.8h5.9c3.9,0,4.7,2.4,4.7,3.9c0,1.8-1.4,2.9-2.5,3.2c0.9,0,2.6,1.1,2.6,3.3c0,1.5-0.8,4-4.7,4h-6V135.8zM454.4,141.7c1.6,0,2-1,2-1.7c0-0.6-0.3-1.7-2-1.7h-2v3.4H454.4z M452.4,144.1v3.5h2.1c1.6,0,2-1,2-1.8c0-0.7-0.4-1.8-2-1.8H452.4z',
  colors: { display: '#111', pin: '#D4AF37', pinTouched: '#FFA500', ledOn: '#ff7f7f', ledOff: '#202020', buttonOuter: '#979797', buttonUp: '#111', buttonDown: '#FFA500', virtualOuter: '#333', virtualUp: '#fff' },
};
// Accent colours of the board (one is picked at random, like MakeCode)
const MB_ACCENTS = ['#3ADCFE', '#3AFFB3', '#FF3A54'];

let boardSeq = 0;
class BoardView {
  // getMb: () => the Microbit (runtime) shown by this board
  constructor(container, getMb, { accent, onInteract } = {}) {
    this.getMb = getMb;
    this.onInteract = onInteract || (() => {});
    this.uid = 'mb' + (++boardSeq);
    this.accent = accent || MB_ACCENTS[Math.floor(Math.random() * MB_ACCENTS.length)];
    this.features = {};
    this.build(container);
  }

  el(tag, attrs, parent = this.g) { return svgEl(tag, attrs, parent); }

  build(container) {
    const C = MBV.colors;
    this.wrap = document.createElement('div');
    this.wrap.className = 'sim-board-wrap';
    container.appendChild(this.wrap);
    this.svg = svgEl('svg', { viewBox: `0 0 ${MBV.W} ${MBV.H}`, class: 'sim', role: 'application' });
    this.wrap.appendChild(this.svg);
    const defs = svgEl('defs', {}, this.svg);
    const glow = svgEl('filter', { id: this.uid + 'glow', x: '-75%', y: '-75%', width: '300%', height: '300%' }, defs);
    svgEl('feMorphology', { operator: 'dilate', radius: 4, in: 'SourceAlpha', result: 'thicken' }, glow);
    svgEl('feGaussianBlur', { stdDeviation: 5, in: 'thicken', result: 'blurred' }, glow);
    svgEl('feFlood', { 'flood-color': 'rgb(255, 17, 77)', result: 'glowColor' }, glow);
    svgEl('feComposite', { in: 'glowColor', in2: 'blurred', operator: 'in', result: 'ledglow_colored' }, glow);
    const merge = svgEl('feMerge', {}, glow);
    svgEl('feMergeNode', { in: 'ledglow_colored' }, merge);
    svgEl('feMergeNode', { in: 'SourceGraphic' }, merge);
    const grad = (id, a, b) => {
      const lg = svgEl('linearGradient', { id: this.uid + id, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
      const s1 = svgEl('stop', { offset: '0%', 'stop-color': a }, lg); const s2 = svgEl('stop', { offset: '0%', 'stop-color': b }, lg);
      return { s1, s2, set: (pct) => { s1.setAttribute('offset', pct + '%'); s2.setAttribute('offset', pct + '%'); } };
    };
    this.g = svgEl('g', {}, this.svg);

    this.el('path', { d: MBV.outline, fill: '#111', class: 'sim-board' });
    this.el('path', { d: MBV.display, fill: C.display });
    for (const [tag, d] of MBV.theme) this.el(tag, tag === 'polygon' ? { points: d, fill: this.accent } : { d, fill: this.accent });

    // LEDs
    this.ledBacks = []; this.leds = [];
    const left = 154, top = 113, ow = 46, oh = 44;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const x = j * ow + left, y = i * oh + top;
        this.ledBacks.push(this.el('rect', { x, y, width: 10, height: 20, rx: 2, fill: C.ledOff }));
        const led = this.el('rect', { x: x - 2, y: y - 2, width: 14, height: 24, rx: 3, fill: C.ledOn, filter: `url(#${this.uid}glow)`, opacity: 0, class: 'sim-led' });
        led.style.transformOrigin = `${x + 5}px ${y + 10}px`;
        this.leds.push(led);
      }
    }

    // light level (top left), shown when the program reads it
    this.lightGrad = grad('light', 'yellow', '#555');
    this.lightG = this.el('g', { class: 'sim-widget', visibility: 'hidden' });
    this.lightCircle = this.el('circle', { cx: 50, cy: 50, r: 35, fill: `url(#${this.uid}light)`, stroke: '#fff', 'stroke-width': 3, class: 'sim-light-level-button' }, this.lightG);
    this.lightText = this.el('text', { x: 85, y: 80, class: 'sim-text' }, this.lightG);
    this.drag(this.lightCircle, (p) => { const mb = this.getMb(); if (!mb) return; mb.light = Math.max(0, Math.min(255, Math.floor((p.y - (50 - 17.5)) / 35 * 255))); });

    // radio antenna
    let ax = 380;
    const pts = [];
    for (let k = 0; k < 3; k++) { pts.push(`${ax},40 ${ax},10 ${ax += 5},10 ${ax},40 ${ax += 5},40`); }
    this.antenna = this.el('polyline', { points: pts.join(' ') + ` ${ax},10`, fill: 'none', stroke: '#555', 'stroke-width': 2, visibility: 'hidden' });

    // logo (touch on V2) and compass
    this.head = this.el('g', { class: 'sim-head' });
    this.el('ellipse', { cx: 251, cy: 75, rx: 75, ry: 35, fill: 'transparent' }, this.head);
    this.headParts = this.el('g', { class: 'sim-button-group' }, this.head);
    this.headBg = this.el('path', { d: MBV.head[0], fill: '#111' }, this.headParts);
    this.headShapes = MBV.head.slice(1).map((d) => this.el('path', { d, fill: 'gold' }, this.headParts));
    this.headText = this.el('text', { x: 160, y: 60, class: 'sim-text' });
    this.pressable(this.headParts, () => { const mb = this.getMb(); if (mb) mb.logoDown(); this.headBg.setAttribute('fill', C.buttonDown); }, () => { const mb = this.getMb(); if (mb) mb.logoUp(); this.headBg.setAttribute('fill', '#111'); });

    // microphone LED (V2)
    this.mic = this.el('path', { d: MBV.mic, fill: C.ledOff });
    this.el('circle', { cx: 336, cy: 86, r: 3, stroke: 'gold', 'stroke-width': 1, fill: 'none' });

    // thermometer (left of the LEDs) and sound level (right)
    this.tempGrad = grad('temp', C.ledOff, C.ledOn);
    this.thermo = this.el('rect', { x: 120, y: 110, width: 20, height: 160, rx: 5, fill: `url(#${this.uid}temp)`, stroke: '#aaa', 'stroke-width': 3, class: 'sim-thermometer', visibility: 'hidden' });
    this.thermoText = this.el('text', { x: 58, y: 130, class: 'sim-text', visibility: 'hidden' });
    this.drag(this.thermo, (p) => { const mb = this.getMb(); if (!mb) return; const t = Math.max(0, Math.min(1, (p.y - 110) / 160)); mb.temperature = Math.floor(50 - t * 55); });
    this.soundGrad = grad('sound', C.ledOff, C.ledOn);
    this.soundBar = this.el('rect', { x: 360, y: 110, width: 20, height: 160, rx: 5, fill: `url(#${this.uid}sound)`, stroke: '#aaa', 'stroke-width': 3, class: 'sim-thermometer', visibility: 'hidden' });
    this.soundText = this.el('text', { x: 386, y: 130, class: 'sim-text', visibility: 'hidden' });
    this.drag(this.soundBar, (p) => { const mb = this.getMb(); if (!mb) return; const t = Math.max(0, Math.min(1, (p.y - 110) / 160)); mb.setSoundLevel(Math.floor(255 - t * 255)); });

    // SHAKE (and the other gestures used by the program, under it)
    this.gestureG = this.el('g', {});

    // buttons A, B and the virtual A+B
    const outerBtn = (left, top) => {
      const g = this.el('g', { class: 'sim-button-group' });
      const r = this.el('rect', { x: left, y: top, rx: 4, width: 56.2, height: 56.2, fill: C.buttonOuter, class: 'sim-button-outer' }, g);
      for (const [dx, dy] of [[10, 10], [10, 46.2], [46.2, 46.2], [46.2, 10]]) this.el('circle', { cx: left + dx, cy: top + dy, r: 6, fill: '#704A4A', class: 'sim-button-nut' }, g);
      return { g, r };
    };
    const a = outerBtn(25.9, 176.4);
    this.btnA = this.el('path', { d: MBV.btnA, fill: C.buttonUp, class: 'sim-button' });
    const b = outerBtn(418.1, 176.4);
    this.btnB = this.el('path', { d: MBV.btnB, fill: C.buttonUp, class: 'sim-button' });
    const ab = outerBtn(417, 250);
    ab.r.setAttribute('fill', C.virtualOuter);
    this.abG = ab.g;
    this.btnAB = this.el('circle', { cx: 446, cy: 278, r: 16.5, fill: C.virtualUp, class: 'sim-button' }, ab.g);
    this.abText = this.el('text', { x: 370, y: 285, class: 'sim-text' }, ab.g);
    this.abText.textContent = 'A+B';
    this.abG.setAttribute('visibility', 'hidden');
    this.el('path', { d: MBV.labelA, fill: '#fff', class: 'sim-button-label' });
    this.el('path', { d: MBV.labelB, fill: '#fff', class: 'sim-button-label' });
    const press = (name, shape, upFill) => [
      () => { const mb = this.getMb(); if (mb) mb.buttonDown(name); shape.setAttribute('fill', C.buttonDown); },
      () => { const mb = this.getMb(); if (mb) mb.buttonUp(name); shape.setAttribute('fill', upFill); },
    ];
    this.pressable(a.g, ...press('A', this.btnA, C.buttonUp));
    this.pressable(this.btnA, ...press('A', this.btnA, C.buttonUp));
    this.pressable(b.g, ...press('B', this.btnB, C.buttonUp));
    this.pressable(this.btnB, ...press('B', this.btnB, C.buttonUp));
    this.pressable(this.abG, ...press('AB', this.btnAB, C.virtualUp));

    // edge connector
    this.pinEls = {};
    this.pinGrads = {};
    for (const [name, d] of Object.entries(MBV.pins)) {
      const gr = grad('pin' + name, C.pin, '#FF5500');
      gr.set(100);
      this.pinGrads[name] = gr;
      this.pinEls[name] = this.el('path', { d, fill: `url(#${this.uid}pin${name})`, class: 'sim-pin' + (['P0', 'P1', 'P2'].includes(name) ? ' sim-pin-touch' : '') });
    }
    for (const x of MBV.smallPins) this.el('rect', { x, y: 356.7, width: 10, height: 50, fill: C.pin, class: 'sim-pin' });
    for (const d of MBV.labels) this.el('path', { d, fill: '#fff', class: 'sim-label' });
    this.pinTexts = {};
    [['P0', 67], ['P1', 165], ['P2', 275]].forEach(([p, x]) => { this.pinTexts[p] = this.el('text', { x, y: 345, class: 'sim-text-pin' }); });
    for (const p of ['P0', 'P1', 'P2']) {
      this.pressable(this.pinEls[p], () => { const mb = this.getMb(); if (mb) mb.pinDown(p); this.pinEls[p].classList.add('touched'); }, () => { const mb = this.getMb(); if (mb) mb.pinUp(p); this.pinEls[p].classList.remove('touched'); });
    }

    // V2 badge (shown when V2 features are used)
    this.v2 = this.el('g', { visibility: 'hidden' });
    this.v2Circle = this.el('circle', { r: 21, fill: '#fff', cx: 458, cy: 290 }, this.v2);
    this.v2Text = this.el('text', { x: 443, y: 298, class: 'sim-text', fill: '#000', 'font-weight': 700 }, this.v2);
    this.v2Text.textContent = 'V2';

    // tilt with the mouse when the program uses the accelerometer
    this.svg.addEventListener('pointermove', (e) => this.tiltFromMouse(e));
    this.svg.addEventListener('pointerleave', () => this.resetTilt());
  }

  // a button-like element: down / up with pointer and keyboard
  pressable(el, down, up) {
    let isDown = false;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); isDown = true; AudioOut.ensure(); down(); this.onInteract(); });
    const release = () => { if (isDown) { isDown = false; up(); } };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
  }
  // vertical (or free) drag on a widget: f(point in board coordinates)
  drag(el, f) {
    const pt = (e) => { const r = this.svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * MBV.W, y: (e.clientY - r.top) / r.height * MBV.H }; };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      f(pt(e));
      const move = (ev) => f(pt(ev));
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      this.onInteract();
    });
  }

  tiltFromMouse(e) {
    if (!this.features.accel || this.dragging) return;
    const mb = this.getMb();
    if (!mb) return;
    const r = this.svg.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    const ax = Math.round(x * 1023), ay = Math.round(y * 1023);
    mb.setAccel(ax, ay, -Math.round(Math.sqrt(Math.max(0, 1023 * 1023 - ax * ax - ay * ay))));
  }
  resetTilt() { const mb = this.getMb(); if (mb && this.features.accel) mb.setAccel(0, 0, -1023); }

  // The controls the program needs (light, thermometer, A+B…), like MakeCode
  setFeatures(f) {
    this.features = f || {};
    const vis = (el, on) => el.setAttribute('visibility', on ? 'visible' : 'hidden');
    vis(this.lightG, f.light);
    vis(this.thermo, f.temperature); vis(this.thermoText, f.temperature);
    vis(this.soundBar, f.sound); vis(this.soundText, f.sound);
    vis(this.abG, f.ab);
    vis(this.antenna, f.radio);
    vis(this.v2, f.logo || f.sound);
    this.v2Circle.setAttribute('cx', f.ab ? 385 : 458); this.v2Circle.setAttribute('cy', f.ab ? 300 : 290);
    this.v2Text.setAttribute('x', f.ab ? 370 : 443); this.v2Text.setAttribute('y', f.ab ? 308 : 298);
    this.abText.setAttribute('visibility', f.ab && !(f.logo || f.sound) ? 'visible' : 'hidden');
    this.headShapes[0].setAttribute('d', f.compass ? MBV.headCompass : MBV.head[1]);
    this.headText.setAttribute('visibility', f.compass ? 'visible' : 'hidden');
    if (f.compass && !this.compassBound) {
      this.compassBound = true;
      this.headParts.addEventListener('pointermove', (e) => {
        if (!(e.buttons & 1) || !this.features.compass) return;
        const r = this.svg.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * MBV.W, y = (e.clientY - r.top) / r.height * MBV.H;
        const mb = this.getMb();
        if (mb) mb.heading = ((Math.floor(Math.atan2(y - 75, x - 258) * 180 / Math.PI) + 90) % 360 + 360) % 360;
      });
    }
    // SHAKE, and a button for each other gesture used by the program
    this.gestureG.innerHTML = '';
    const gestures = (f.gestures || []).slice().sort((a, b) => (a === 'Shake' ? -1 : b === 'Shake' ? 1 : 0));
    gestures.forEach((g, i) => {
      const y = 115 + i * 30;
      const grp = svgEl('g', { class: 'sim-button-group' }, this.gestureG);
      const c = svgEl('circle', { cx: 404, cy: y, r: 12, fill: MBV.colors.virtualUp, class: 'sim-shake' }, grp);
      const t = svgEl('text', { x: 420, y: y + 7, class: 'sim-text-small' }, grp);
      t.textContent = gestureLabel(g).toUpperCase();
      if (g !== 'Shake') t.setAttribute('font-size', '13px');
      this.pressable(grp, () => { c.setAttribute('fill', MBV.colors.buttonDown); const mb = this.getMb(); if (mb) mb.doGesture(g); }, () => { c.setAttribute('fill', MBV.colors.virtualUp); });
    });
  }

  // Called at every frame
  update() {
    const mb = this.getMb();
    const C = MBV.colors;
    for (let i = 0; i < 25; i++) {
      const v = mb && mb.ledEnabled ? mb.leds[i] * (mb.brightness / 255) : 0;
      const led = this.leds[i];
      const key = Math.round(v);
      if (led._v === key) continue;
      led._v = key;
      if (key > 0) {
        led.setAttribute('opacity', ((key / 255) * 155 + 100) / 255);
        led.style.transform = `scale(${key / 255 * 0.4 + 0.6})`;
      } else led.setAttribute('opacity', 0);
    }
    if (!mb) return;
    const f = this.features;
    if (f.light) { this.lightGrad.set(Math.round(mb.light * 100 / 255)); this.lightText.textContent = String(mb.light); }
    if (f.temperature) { this.tempGrad.set(Math.round(100 - (mb.temperature + 5) / 55 * 100)); this.thermoText.textContent = mb.temperature + '°C'; }
    if (f.sound) { this.soundGrad.set(Math.round(100 - mb.soundLevel / 255 * 100)); this.soundText.textContent = String(mb.soundLevel); }
    if (f.compass) { this.headParts.setAttribute('transform', `rotate(${mb.heading - 90} 258 75)`); this.headText.textContent = mb.heading + '°'; }
    else this.headParts.removeAttribute('transform');
    this.mic.setAttribute('fill', f.sound ? C.ledOn : C.ledOff);
    for (const p of ['P0', 'P1', 'P2']) {
      const out = mb.pinsOut[p];
      this.pinTexts[p].textContent = out !== undefined ? String(Math.round(out)) : f.analog && f.analog.includes(p) ? String(mb.analogIn[p]) : '';
      this.pinGrads[p].set(out !== undefined ? 100 - Math.round(out / 1023 * 100) : 100);
    }
    // tilt picture
    if (f.accel) {
      const af = 8 / 1023, x = mb.accel.x, y = -mb.accel.y;
      const s = 1 - Math.min(0.1, Math.pow(Math.max(Math.abs(x), Math.abs(y)) / 1023, 2) / 35);
      this.wrap.style.transform = `perspective(30em) rotateX(${y * af}deg) rotateY(${x * af}deg) scale(${s}, ${s})`;
    } else this.wrap.style.transform = '';
    if (f.radio) this.antenna.setAttribute('stroke', mb.log.length && mb.log[mb.log.length - 1].kind === 'radio' && mb.now - mb.log[mb.log.length - 1].t < 200 ? '#fff' : '#555');
  }

  remove() { this.wrap.remove(); }
}

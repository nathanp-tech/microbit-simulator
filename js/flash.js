// Download to a real micro:bit, like MakeCode: the blocks become MicroPython (js/pygen.js + lib/microbit/mbrt.py),
// packed in a .hex for V1 and V2 (micro:bit Foundation libraries), then sent through the USB cable (WebUSB, in
// Chrome and Edge), or saved as a file to drag onto the MICROBIT drive.
'use strict';

const Flash = {
  usb: null, libs: null, files: null, busy: false,
  supported() { return !!(navigator.usb && window.isSecureContext); },
  url(p) { return new URL(p, location.href).href; },
  loadLibs() {
    if (!this.libs) {
      this.libs = Promise.all([
        import(this.url('lib/microbit/fs/index.js')),
        import(this.url('lib/microbit/connection/usb/index.js')),
        import(this.url('lib/microbit/connection/universal-hex/index.js')),
      ]).catch((e) => { this.libs = null; throw e; });
    }
    return this.libs;
  },
  loadFiles() {
    if (!this.files) {
      const get = (p) => fetch(p, { cache: 'force-cache' }).then((r) => { if (!r.ok) throw new Error(p + ' not found'); return r.text(); });
      this.files = Promise.all([get('lib/microbit/micropython-v1.hex'), get('lib/microbit/micropython-v2.hex'), get('lib/microbit/mbrt.py')])
        .catch((e) => { this.files = null; throw e; });
    }
    return this.files;
  },
  async connection() {
    if (!this.usb) {
      const [, usbLib] = await this.loadLibs();
      this.usb = usbLib.createUSBConnection();
      this.usb.addEventListener('status', () => updateDownloadButton());
      try { await this.usb.initialize(); } catch (e) { /* older library: nothing to do */ }
    }
    return this.usb;
  },
  connected() { return !!(this.usb && ['Connected', 'Paused'].includes(this.usb.status)); },

  // The .hex of the program in the editor, or null (with a message) when a block cannot run on the micro:bit
  async buildHex() {
    const py = generatePython(ws);
    if (py.unsupported.length) {
      openModal(`<h2>😕 Cannot download yet</h2><p>These blocks only work in the simulator, not on the real micro:bit:</p>
        <ul>${py.unsupported.map((t) => `<li><b>${esc(t)}</b></li>`).join('')}</ul><p>Remove them to download your program.</p>
        <div style="text-align:right"><button class="primary" onclick="closeModal()">OK</button></div>`);
      return null;
    }
    const [[fsLib], [v1, v2, mbrt]] = await Promise.all([this.loadLibs(), this.loadFiles()]);
    const fs = new fsLib.MicropythonFsHex([{ hex: v1, boardId: fsLib.microbitBoardId.V1 }, { hex: v2, boardId: fsLib.microbitBoardId.V2 }]);
    fs.write('mbrt.py', mbrt);
    fs.write('main.py', py.main);
    return fs.getUniversalHex();
  },
  fileName() {
    const base = App.mode === 'challenge' && App.challenge ? App.challenge.title : (Progress.data && Progress.data.free.name) || 'my-program';
    return 'microbit-' + slugName(base) + '.hex';
  },

  // ---------- the Download button ----------
  async download() {
    if (this.busy) return;
    if (!this.supported()) { await this.downloadFile(true); return; }
    try {
      const usb = await this.connection();
      if (!this.connected()) { this.pairDialog(); return; }
      await this.flash(usb);
    } catch (e) { this.failed(e); }
  },
  async downloadFile(explain = false) {
    try {
      const hex = await this.buildHex();
      if (!hex) return;
      download(this.fileName(), new Blob([hex], { type: 'application/octet-stream' }));
      if (explain && !this.skipDialog()) this.dragDialog();
      else toast('💾 ' + this.fileName() + (isSafari() ? ': save it on MICROBIT (or drag it there from Downloads).' : ' downloaded: drag it onto the MICROBIT drive.'));
    } catch (e) { this.failed(e); }
  },
  async flash(usb) {
    this.busy = true;
    showFlashProgress('Preparing…', 0);
    try {
      const [, , uhLib] = await this.loadLibs();
      const hex = await this.buildHex();
      if (!hex) return;
      await usb.flash(uhLib.createUniversalHexFlashDataSource(hex), {
        partial: true,
        progress: (stage, value) => showFlashProgress(typeof value === 'number' ? 'Downloading…' : stage === 'FindingDevice' || stage === 'Connecting' ? 'Connecting…' : 'Downloading…', value),
      });
      showFlashProgress('✓ Downloaded! Your program is running on the micro:bit.', 1, true);
      Progress.log('flash', App.mode === 'challenge' && App.challenge ? App.challenge.id : null);
      Progress.persist();
    } catch (e) {
      showFlashProgress(null);
      this.failed(e);
    } finally { this.busy = false; }
  },
  failed(e) {
    console.error(e);
    const code = e && e.code;
    if (code === 'no-device-selected' || /No device selected/i.test(String(e && e.message))) return; // the student closed the browser window
    const msg = code === 'update-req' ? 'The firmware of your micro:bit is too old for WebUSB. Use "Download as file" instead.'
      : code === 'clear-connect' || code === 'timeout-error' ? 'The micro:bit stopped answering. Unplug the USB cable, plug it in again, and try again.'
        : 'Something went wrong with the micro:bit. Unplug the USB cable, plug it in again, and try again.';
    openModal(`<h2>😕 Download failed</h2><p>${esc(msg)}</p><p class="muted">${esc((e && e.message) || '')}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button id="flFile">💾 Download as file</button><button class="primary" onclick="closeModal()">OK</button></div>`);
    $('flFile').onclick = () => { closeModal(); this.downloadFile(true); };
  },

  // ---------- dialogs (like MakeCode) ----------
  pairDialog() {
    openModal(`<h2>Connect your micro:bit</h2>
      <div class="mc-pair">
        <div class="mc-pair-step"><div class="mc-pair-n">1</div><div class="mc-pair-pic">🔌</div><p>Connect the micro:bit to your computer with the <b>USB cable</b>.</p></div>
        <div class="mc-pair-step"><div class="mc-pair-n">2</div><div class="mc-pair-pic">🖱️</div><p>Click <b>Pair</b>, choose <b>BBC micro:bit CMSIS-DAP</b> in the list, then click <b>Connect</b>.</p></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:14px"><button class="link" id="pairFile">Download as file instead</button><button class="primary" id="pairGo" style="font-size:16px;padding:10px 24px">Pair</button></div>`);
    $('pairFile').onclick = () => { closeModal(); this.downloadFile(true); };
    $('pairGo').onclick = async () => {
      closeModal();
      try {
        const usb = await this.connection();
        await usb.connect(); // the browser shows its list of devices
        updateDownloadButton();
        if (this.connected()) { toast('🔌 micro:bit connected'); await this.flash(usb); }
      } catch (e) { this.failed(e); }
    };
  },
  skipDialog() { try { return localStorage.getItem('mbsim.noDragDialog') === '1'; } catch (e) { return false; } },
  dragDialog() {
    if (isSafari()) { this.safariDialog(); return; }
    openModal(`<h2>Move the .hex file to your micro:bit</h2>
      <div class="mc-pair">
        <div class="mc-pair-step"><div class="mc-pair-n">1</div><div class="mc-pair-pic">🔌</div><p>Connect the micro:bit to your computer with the USB cable. A drive called <b>MICROBIT</b> appears.</p></div>
        <div class="mc-pair-step"><div class="mc-pair-n">2</div><div class="mc-pair-pic">📄➡️💾</div><p>Find <b>${esc(this.fileName())}</b> in your <b>Downloads</b> and drag it onto the <b>MICROBIT</b> drive.</p></div>
        <div class="mc-pair-step"><div class="mc-pair-n">3</div><div class="mc-pair-pic">💡</div><p>The yellow light on the back blinks, then your program runs.</p></div>
      </div>
      <p class="muted">Tip: in Chrome or Edge, the micro:bit can be paired so that <b>Download</b> sends the program directly.</p>
      <div style="text-align:right"><button class="primary" onclick="closeModal()">Done</button></div>`);
  },
  // Safari has no WebUSB: if Safari asks where to save each download, the student saves straight onto MICROBIT
  safariDialog() {
    openModal(`<h2>Send your program to the micro:bit</h2>
      <div class="mc-pair">
        <div class="mc-pair-step"><div class="mc-pair-n">1</div><div class="mc-pair-pic">🔌</div><p>Connect the micro:bit with the USB cable. A drive called <b>MICROBIT</b> appears.</p></div>
        <div class="mc-pair-step"><div class="mc-pair-n">2</div><div class="mc-pair-pic">💾</div><p>When Safari asks where to save <b>${esc(this.fileName())}</b>, choose <b>MICROBIT</b> and click <b>Save</b>.</p></div>
        <div class="mc-pair-step"><div class="mc-pair-n">3</div><div class="mc-pair-pic">💡</div><p>The yellow light on the back blinks, then your program runs.</p></div>
      </div>
      <p class="muted">Safari did not ask? Do this once: <b>Safari → Settings… → General → File download location → Ask for each download</b>.
        Or open <b>Downloads</b> in the Finder and drag the file onto <b>MICROBIT</b>.</p>
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center"><label class="muted"><input type="checkbox" id="flNoAsk"> Don't show this again</label><button class="primary" id="flOk">Done</button></div>`);
    $('flOk').onclick = () => {
      if ($('flNoAsk').checked) { try { localStorage.setItem('mbsim.noDragDialog', '1'); } catch (e) { /* private window */ } }
      closeModal();
    };
  },
  menu(anchor) {
    const m = $('downloadMenu');
    if (!m.hidden) { m.hidden = true; return; }
    const conn = this.connected();
    m.innerHTML = `${this.supported() ? (conn ? '<button data-act="disconnect">Disconnect</button>' : '<button data-act="pair">🔌 Connect device</button>') : ''}
      <button data-act="file">💾 Download as file</button>`;
    const r = anchor.getBoundingClientRect();
    m.style.left = r.left + 'px';
    m.style.bottom = (window.innerHeight - r.top + 6) + 'px';
    m.hidden = false;
    m.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        m.hidden = true;
        if (b.dataset.act === 'file') this.downloadFile(true);
        if (b.dataset.act === 'pair') this.pairDialog();
        if (b.dataset.act === 'disconnect') { try { await this.usb.disconnect(); } catch (err) { /* already gone */ } updateDownloadButton(); toast('micro:bit disconnected'); }
      };
    });
  },
};

function isSafari() { return /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent); }
function updateDownloadButton() {
  const b = $('btnDownload');
  if (!b) return;
  b.classList.toggle('connected', Flash.connected());
  b.title = Flash.connected() ? 'Download to the connected micro:bit' : 'Download';
}
let flashHideTimer = null;
function showFlashProgress(text, value, done = false) {
  const el = $('flashProgress');
  clearTimeout(flashHideTimer);
  if (text === null) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('done', done);
  el.querySelector('.fp-text').textContent = text;
  el.querySelector('.fp-bar > div').style.width = Math.round((typeof value === 'number' ? value : 0) * 100) + '%';
  if (done) flashHideTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// Student work and progress: guided challenges, activity log, save file and live sync with the class server.
'use strict';

const PROGRESS_KEY = 'mbsim.v1.progress';
const ACTIVE_WINDOW = 120; // seconds without input after which the student counts as idle

function uid() {
  const a = new Uint8Array(8);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function newChallengeEntry(status) {
  return {
    status, // 'locked' | 'open' | 'validated'
    openedAt: null, timeSpent: 0, runs: 0, practiceRuns: 0, gradings: [], bestScore: null, lastScore: null,
    errors: {}, failedCriteria: {}, hints: 0, passedAt: null, validatedAt: null, validatedBy: null,
    program: null, answers: null,
  };
}

const Progress = {
  data: null,
  dirty: false,
  lastInput: Date.now(),

  create(name, className, mode) {
    const challenges = {};
    CHALLENGES.forEach((c, i) => { challenges[c.id] = newChallengeEntry(i === 0 ? 'open' : 'locked'); });
    this.data = {
      app: 'microbit-simulator', type: 'mb-progress', version: 1,
      studentId: uid(), name, className, mode,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSavedAt: null, adminRev: 0,
      current: CHALLENGES[0].id, totalTime: 0, freeTime: 0,
      free: { program: null, name: '', runs: 0, errors: {} },
      exams: {},
      challenges, events: [],
    };
    this.log('start', null, mode);
    this.persist();
    return this.data;
  },

  // Accepts a saved file (adds missing challenges if the app gained new ones).
  load(obj) {
    if (!obj || obj.type !== 'mb-progress' || !obj.challenges) throw new Error('this is not a micro:bit Simulator work file');
    CHALLENGES.forEach((c, i) => {
      if (!obj.challenges[c.id]) {
        const prev = i > 0 && obj.challenges[CHALLENGES[i - 1].id];
        obj.challenges[c.id] = newChallengeEntry(prev && prev.status === 'validated' ? 'open' : 'locked');
      }
    });
    if (!obj.free) obj.free = { program: null, name: '', runs: 0, errors: {} };
    if (!obj.exams) obj.exams = {};
    this.data = obj;
    // Older files: challenges that were waiting for the teacher are now passed.
    for (const c of CHALLENGES) if (obj.challenges[c.id].status === 'passed') this.validate(c.id, 'check');
    if (!CHALLENGES.some((c) => c.id === obj.current)) obj.current = CHALLENGES[0].id;
    this.data = obj;
    this.log('resume', null, obj.mode);
    this.persist();
    return obj;
  },

  // Only the essential is saved: recent activity, the last checks, the last FLL matches (programs are kept).
  trim() {
    const d = this.data;
    if (!d) return;
    if (d.events.length > 300) d.events.splice(0, d.events.length - 300);
    for (const c of Object.values(d.challenges)) if (c.gradings && c.gradings.length > 20) c.gradings.splice(0, c.gradings.length - 20);
  },
  restoreLocal() {
    try { const s = localStorage.getItem(this.key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  },
  persist() {
    if (!this.data) return;
    this.data.updatedAt = new Date().toISOString();
    this.dirty = true;
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked */ }
  },
  clearLocal() { try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ } },
  key: PROGRESS_KEY, // the teacher preview keeps its own work under another key

  ch(id) { return this.data.challenges[id || this.data.current]; },
  log(type, ch, detail) {
    const ev = { t: new Date().toISOString(), type };
    if (ch) ev.ch = ch;
    if (detail !== undefined && detail !== null) ev.d = typeof detail === 'string' ? detail.slice(0, 200) : detail;
    this.data.events.push(ev);
    if (this.data.events.length > 300) this.data.events.splice(0, this.data.events.length - 300);
  },
  count(map, key) { map[key] = (map[key] || 0) + 1; },

  // ---------- Activity hooks ----------
  onRun(mode) {
    if (mode === 'free') { this.data.free.runs++; this.log('run', null); }
    else { const c = this.ch(); c.runs++; this.log('run', this.data.current); }
    this.persist();
  },
  onError(mode, msg) {
    const key = errorCategory(msg);
    if (mode === 'free') this.count(this.data.free.errors, key);
    else this.count(this.ch().errors, key);
    this.log('error', mode === 'free' ? null : this.data.current, msg);
    this.persist();
  },
  onPractice(result) {
    const c = this.ch();
    c.practiceRuns++;
    c.lastScore = result.score;
    for (const k of result.criteria) if (k.points < k.max) this.count(c.failedCriteria, criterionKey(k.label));
    this.log('practice', this.data.current, result.score);
    this.persist();
  },
  onGrade(result) {
    const c = this.ch();
    c.gradings.push({ t: new Date().toISOString(), score: result.score });
    c.bestScore = Math.max(c.bestScore || 0, result.score);
    for (const tr of result.trials) for (const k of tr.criteria) if (k.points < k.max) this.count(c.failedCriteria, criterionKey(k.label));
    this.log('grade', this.data.current, result.score);
    if (result.score >= CLASSROOM.passScore && c.status !== 'validated') { c.passedAt = new Date().toISOString(); this.validate(this.data.current, 'check'); }
    this.persist();
  },
  onHint(n) { const c = this.ch(); c.hints = Math.max(c.hints, n); this.log('hint', this.data.current, n); this.persist(); },
  validate(id, by) {
    const c = this.ch(id);
    if (c.status === 'validated') return false;
    c.status = 'validated';
    c.validatedAt = new Date().toISOString();
    c.validatedBy = by;
    if (!c.passedAt) c.passedAt = c.validatedAt;
    const i = CHALLENGES.findIndex((x) => x.id === id);
    const next = CHALLENGES[i + 1];
    if (next && this.data.challenges[next.id].status === 'locked') this.data.challenges[next.id].status = 'open';
    this.log('validated', id, by);
    this.persist();
    return true;
  },

  // Called every second by the app.
  tick(mode, running) {
    if (!this.data) return;
    const active = document.visibilityState === 'visible' && (running || (Date.now() - this.lastInput) / 1000 < ACTIVE_WINDOW);
    if (!active) return;
    this.data.totalTime++;
    if (mode === 'free') this.data.freeTime++;
    else this.ch().timeSpent++;
    if (this.data.totalTime % 10 === 0) this.persist();
  },

  fileName() { return `${slugName(this.data.name)}${this.data.className ? '_' + slugName(this.data.className) : ''}_microbit-work.json`; },
  markSaved() { this.data.lastSavedAt = new Date().toISOString(); this.log('saved', null); this.persist(); },
  minutesSinceSave() {
    const ref = this.data.lastSavedAt || this.data.createdAt;
    return (Date.now() - new Date(ref).getTime()) / 60000;
  },

  // Snapshot for the class server: everything except the programs.
  snapshot(live) {
    const d = this.data;
    const challenges = {};
    for (const [id, c] of Object.entries(d.challenges)) {
      const { program, answers, ...rest } = c;
      challenges[id] = rest;
    }
    return { ...d, challenges, free: { runs: d.free.runs, errors: d.free.errors, name: d.free.name }, events: d.events.slice(-60), live };
  },
};

const slugName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'student';

// Groups error messages into categories that make sense in a report.
function errorCategory(msg) {
  const m = String(msg);
  if (/is not an array/.test(m)) return 'Array used before "set … to array of"';
  if (/is not a sprite/.test(m)) return 'Sprite used before "create sprite"';
  if (/function ".*" does not exist/.test(m)) return 'Call of a function that does not exist';
  if (/calls itself/.test(m)) return 'Function that calls itself without end';
  return m.replace(/^Error:\s*/, '').slice(0, 80);
}
// Removes the measured values from criteria labels so they can be counted ("Stops 3 to 12 cm from the wall").
function criterionKey(label) { return String(label).replace(/\s*\((measured|mesuré)[^)]*\)/i, '').replace(/\s*\(\d[^)]*\)\s*$/, '').trim(); }

// ---------- Class code: every request of the student app carries it (Manage → class code) ----------
const ClassCode = {
  get() { try { return localStorage.getItem('mbsim.classCode') || ''; } catch (e) { return ''; } },
  set(c) { try { if (c) localStorage.setItem('mbsim.classCode', c); else localStorage.removeItem('mbsim.classCode'); } catch (e) { /* ignore */ } },
};
function sfetch(url, opts = {}) {
  return fetch(url, { cache: 'no-store', ...opts, headers: { ...(opts.headers || {}), 'X-Class-Code': ClassCode.get() } }).then((r) => {
    if (r.status === 401 && Sync.onNeedCode) Sync.onNeedCode();
    return r;
  });
}

// ---------- Live sync with the class server (optional) ----------
const Sync = {
  online: false,
  savedAt: 0, // last successful online save (ms)
  lastPush: 0,
  onValidated: null,
  onStatus: null,
  async ping() {
    if (location.protocol === 'file:') return false;
    try {
      const r = await fetch('api/ping', { cache: 'no-store' });
      this.online = r.ok;
    } catch (e) { this.online = false; }
    if (this.onStatus) this.onStatus(this.online);
    return this.online;
  },
  // Saves the whole work (programs included) on the class server. Also tells the teacher what the student is doing.
  disabled: false, // teacher preview: nothing goes to the class server
  ver: null, // version of the teacher's decisions last seen (the server only sends them again when it changes)
  lastSync: 0, lastPresence: 0, busy: false,
  // One call every few seconds: saves the work if it changed (at most every syncPushSeconds), otherwise only says
  // "I am here" (every syncHeartbeatSeconds); gets the teacher's decisions only when they changed.
  async sync(live, { force = false } = {}) {
    if (this.disabled || !this.online || !Progress.data) return false;
    if (this.busy) { if (!force) return true; while (this.busy) await new Promise((r) => setTimeout(r, 50)); }
    const now = Date.now();
    const sendWork = force || (Progress.dirty && now - this.lastPush >= (CLASSROOM.syncPushSeconds || 4) * 1000 - 50);
    const presence = !sendWork && now - this.lastPresence >= (CLASSROOM.syncHeartbeatSeconds || 15) * 1000 - 50;
    const wasDirty = Progress.dirty;
    this.busy = true;
    if (sendWork) { Progress.trim(); Progress.dirty = false; }
    try {
      const body = { studentId: Progress.data.studentId, className: Progress.data.className || '', ver: this.ver, createdAt: Progress.data.createdAt };
      if (sendWork || presence) body.live = live;
      if (sendWork) body.work = Progress.data;
      const r = await sfetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 410) { if (this.onDeleted) this.onDeleted(); return false; }
      if (r.status === 409) {
        const d = await r.json().catch(() => ({}));
        if (this.onRemoteChange) this.onRemoteChange(!!d.stale);
        return false;
      }
      if (r.status === 401 || r.status === 403) { Progress.dirty = Progress.dirty || wasDirty; return false; }
      if (!r.ok) throw new Error('sync failed');
      const d = await r.json();
      if (sendWork) { this.lastPush = now; this.savedAt = Date.now(); }
      if (d.savedRev) {
        Progress.data.saveRev = d.savedRev; // the version the next save starts from
        try { localStorage.setItem(Progress.key, JSON.stringify(Progress.data)); } catch (e) { /* storage blocked */ }
      }
      if (sendWork || presence) this.lastPresence = now;
      if (d.now) this.serverOffset = d.now * 1000 - Date.now();
      const first = this.ver === null;
      this.ver = d.ver;
      if (d.changed) {
        this.applyStatus(d);
        if (this.onClassCtl) this.onClassCtl(d.classctl || {});
        if (!first && this.onSettingsChanged) this.onSettingsChanged();
      }
      if (this.onStatus) this.onStatus(true);
      return true;
    } catch (e) {
      Progress.dirty = Progress.dirty || wasDirty;
      this.online = false;
      if (this.onStatus) this.onStatus(false);
      return false;
    } finally { this.busy = false; }
  },
  push(live, force = false) { return this.sync(live, { force }); },
  savedRecently(sec = 30) { return this.online && Date.now() - this.savedAt < sec * 1000 && !Progress.dirty; },
  async find(name, className) {
    if (!this.online) return [];
    try {
      const r = await sfetch(`api/work/find?name=${encodeURIComponent(name)}&className=${encodeURIComponent(className || '')}`, { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      return d.matches || [];
    } catch (e) { return null; } // no answer: the caller must not think this is a new student
  },
  async fetchWork(id) {
    const r = await sfetch('api/work/' + encodeURIComponent(id));
    if (!r.ok) throw new Error('work not found');
    return r.json();
  },
  // Server time (ms): exam countdowns use the server clock, not the student's computer clock.
  serverOffset: 0,
  now() { return Date.now() + this.serverOffset; },
  applyStatus({ validated, rev, deleted, helpDone, notesRev }) {
    if (!Progress.data) return;
    if (deleted) { if (this.onDeleted) this.onDeleted(); return; }
    if (rev > (Progress.data.adminRev || 0)) { if (this.onRemoteChange) this.onRemoteChange(); return; }
    for (const id of validated || []) if (Progress.data.challenges[id] && Progress.data.challenges[id].status !== 'validated' && this.onValidated) this.onValidated(id);
    if (helpDone && this.onHelpDone) this.onHelpDone(helpDone);
    if (notesRev !== undefined && notesRev !== this.notesRev && this.onNotesRev) { this.notesRev = notesRev; this.onNotesRev(notesRev); }
  },
  notesRev: undefined,
  // Small calls for the classroom features (js/classroom.js). They fail silently offline.
  async post(url, body) {
    if (this.disabled || !this.online) return null;
    try {
      const r = await sfetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.ok ? r.json() : null;
    } catch (e) { return null; }
  },
  async getJson(url) {
    if (location.protocol === 'file:') return null;
    try { const r = await sfetch(url); return r.ok ? r.json() : null; } catch (e) { return null; }
  },
  // Class settings chosen by the teacher in the dashboard (override js/config.js).
  async loadSettings() {
    if (location.protocol === 'file:') return;
    try {
      const r = await fetch('api/settings', { cache: 'no-store' });
      if (r.ok) Object.assign(CLASSROOM, await r.json());
    } catch (e) { /* offline: keep js/config.js */ }
  },
  start(getLive) {
    this.ping();
    setInterval(() => { if (!this.online) this.ping(); }, 15000);
    setInterval(() => {
      if (Date.now() - this.lastSync < (CLASSROOM.syncPollSeconds || 3) * 1000 - 50) return;
      this.lastSync = Date.now();
      this.sync(getLive());
    }, 1000);
  },
};

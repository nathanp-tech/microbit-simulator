"""micro:bit Simulator class API: shared by server.py (class server on the teacher's computer) and api/index.py (Vercel).

All the data goes through a small key-value store that speaks a subset of the Redis commands:
- RedisStore: Upstash Redis (REST API), online on Vercel
- FileStore:  the same commands kept in memory and saved in data/db/ on the teacher's computer

Keys (prefix mb:):
  snap            hash   student id -> progress snapshot without programs (live dashboard)
  work:ID                full work of a student (programs included)
  st:ID                  what the student's browser polls: validated, rev, deleted, helpDone, notesRev
  hist:ID         hash   slot -> compressed list of program versions (history)
  notes:ID               teacher comments on the student's blocks
  help            hash   student id -> help request
  roster                 class lists {class: [names]}
  classctl        hash   class -> {message, paused, closed, exam}
  exams           hash   exam id -> exam
  examres:EXAM    hash   student id -> exam result
  corrsecret             random key that signs the correction links of the students (no password needed)
  settings               class settings (also the class codes: classCodes {class: code})
  ver                    counter increased by every teacher action: browsers re-read their status only when it changes
  seen            hash   student id -> {t, live}: presence between two saves (cheap heartbeat)
  backup:DATE            compressed daily backup (30 days), index in "backups"
  archive:NAME           copy of everything before a delete / reset (180 days)
  stats:YYYY-MM   hash   day -> number of database commands (quota gauge, online only)
"""
import base64, hashlib, hmac, json, os, random, re, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request, zlib

P = 'mb:'
ID = re.compile(r'[\w-]{4,64}')
SLOT = re.compile(r'[\w-]{1,40}')
DEFAULT_SETTINGS = {'passScore': 80, 'saveReminderMinutes': 20, 'allowGuided': True, 'allowFree': True, 'dbQuota': 500000}
# Online, browsers talk to the server less often than with the class server (database quotas).
HOSTED_SYNC = {'syncPushSeconds': 20, 'syncHeartbeatSeconds': 30, 'syncPollSeconds': 10, 'dashboardSeconds': 5}
HISTORY_MAX = 25        # program versions kept per student and per program
BACKUP_DAYS = 30
EXAM_GRACE = 90         # seconds after the end of an exam during which results are still accepted


# ---------- Stores ----------
class MemStore:
    """In-memory store understanding the Redis commands used here (also used by the local tests)."""

    def __init__(self):
        self.data, self.exp = {}, {}
        self.lock = threading.RLock()
        self.changed = set()

    def _alive(self, k):
        e = self.exp.get(k)
        if e and e < time.time():
            self.data.pop(k, None)
            self.exp.pop(k, None)
            self.changed.add(k)
        return k in self.data

    def _touch(self, k):
        self.changed.add(k)

    def run(self, cmds):
        with self.lock:
            return [self.cmd([str(x) for x in c]) for c in cmds]

    def cmd(self, c):
        op, a = c[0].upper(), c[1:]
        if op == 'GET':
            return self.data[a[0]] if self._alive(a[0]) and isinstance(self.data[a[0]], str) else None
        if op == 'SET':
            self.data[a[0]] = a[1]
            self.exp.pop(a[0], None)
            if len(a) > 3 and a[2].upper() == 'EX':
                self.exp[a[0]] = time.time() + int(a[3])
            self._touch(a[0])
            return 'OK'
        if op == 'MGET':
            return [self.data[k] if self._alive(k) and isinstance(self.data[k], str) else None for k in a]
        if op == 'DEL':
            n = 0
            for k in a:
                if self.data.pop(k, None) is not None:
                    n += 1
                    self.exp.pop(k, None)
                    self._touch(k)
            return n
        if op == 'INCR':
            v = str(int(self.data.get(a[0], '0') if self._alive(a[0]) and isinstance(self.data.get(a[0]), str) else 0) + 1)
            self.data[a[0]] = v
            self._touch(a[0])
            return int(v)
        if op == 'KEYS':
            import fnmatch
            return [k for k in list(self.data) if self._alive(k) and fnmatch.fnmatchcase(k, a[0])]
        if op == 'EXISTS':
            return sum(1 for k in a if self._alive(k))
        if op == 'EXPIRE':
            if self._alive(a[0]):
                self.exp[a[0]] = time.time() + int(a[1])
                self._touch(a[0])
                return 1
            return 0
        if op in ('HSET', 'HGET', 'HGETALL', 'HDEL', 'HINCRBY'):
            h = self.data.get(a[0]) if self._alive(a[0]) else None
            if op == 'HGET':
                return (h or {}).get(a[1])
            if op == 'HGETALL':
                return [x for kv in (h or {}).items() for x in kv]
            if op == 'HDEL':
                n = sum(1 for f in a[1:] if h and h.pop(f, None) is not None)
                if n:
                    self._touch(a[0])
                return n
            h = self.data.setdefault(a[0], {})
            self._touch(a[0])
            if op == 'HSET':
                for i in range(1, len(a), 2):
                    h[a[i]] = a[i + 1]
                return 1
            h[a[1]] = str(int(h.get(a[1], 0)) + int(a[2]))
            return int(h[a[1]])
        if op in ('RPUSH', 'LRANGE', 'LTRIM'):
            l = self.data.get(a[0]) if self._alive(a[0]) else None
            if op == 'LRANGE':
                l = l or []
                s, e = int(a[1]), int(a[2])
                e = len(l) - 1 if e == -1 else e
                return l[s if s >= 0 else max(0, len(l) + s):e + 1]
            if op == 'RPUSH':
                l = self.data.setdefault(a[0], [])
                l.extend(a[1:])
                self._touch(a[0])
                return len(l)
            if l is not None:
                s = int(a[1])
                self.data[a[0]] = l[s:] if s < 0 else l[s:int(a[2]) + 1 if a[2] != '-1' else None]
                self._touch(a[0])
            return 'OK'
        return {'error': 'unknown command ' + op}


class FileStore(MemStore):
    """MemStore saved in a folder (one file per key), written at most once per second."""

    def __init__(self, folder):
        super().__init__()
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        for name in os.listdir(folder):
            if name.endswith('.json'):
                try:
                    rec = json.load(open(os.path.join(folder, name), encoding='utf-8'))
                    k = urllib.parse.unquote(name[:-5])
                    self.data[k] = rec['v']
                    if rec.get('exp'):
                        self.exp[k] = rec['exp']
                except (OSError, ValueError, KeyError):
                    pass
        self.changed = set()
        threading.Thread(target=self._loop, daemon=True).start()

    def _path(self, k):
        return os.path.join(self.folder, urllib.parse.quote(k, safe='') + '.json')

    def flush(self):
        with self.lock:
            todo = {k: (self.data.get(k), self.exp.get(k)) for k in self.changed}
            self.changed = set()
        for k, (v, e) in todo.items():
            p = self._path(k)
            if v is None:
                if os.path.exists(p):
                    os.remove(p)
                continue
            tmp = p + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump({'v': v, 'exp': e}, f)
            os.replace(tmp, p)

    def _loop(self):
        while True:
            time.sleep(1)
            try:
                self.flush()
            except OSError:
                pass


class RedisStore:
    """Upstash Redis through its REST API. Also counts the commands (quota gauge)."""

    def __init__(self, url, token):
        self.url, self.token = url.rstrip('/'), token
        self.pending, self.flushed = 0, time.time()

    def run(self, cmds):
        cmds = [[str(x) for x in c] for c in cmds]
        # The usage counter is written at most every 30 s (it costs one command itself).
        self.pending += len(cmds)
        count = time.time() - self.flushed > 30 or self.pending > 200
        if count:
            day = time.strftime('%Y-%m-%d', time.gmtime())
            cmds.append(['HINCRBY', P + 'stats:' + day[:7], day, self.pending + 1])
            self.pending, self.flushed = 0, time.time()
        req = urllib.request.Request(self.url + '/pipeline', data=json.dumps(cmds).encode(),
                                     headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=20) as r:
            out = json.loads(r.read())
        for o in out:
            if isinstance(o, dict) and 'error' in o:
                raise RuntimeError('database error: ' + o['error'])
        res = [o.get('result') for o in out]
        return res[:-1] if count else res


def migrate_legacy(store, data_dir):
    """Imports the data of the former class server (data/progress.json, data/work/) into an empty store."""
    if store.run([['EXISTS', P + 'snap', P + 'settings']])[0]:
        return 0
    cmds, n = [], 0
    try:
        saved = json.load(open(os.path.join(data_dir, 'progress.json'), encoding='utf-8'))
    except (OSError, ValueError):
        saved = {}
    for sid, snap in (saved.get('students') or {}).items():
        cmds.append(['HSET', P + 'snap', sid, json.dumps(snap)])
    sts = {}
    for sid, v in (saved.get('validations') or {}).items():
        sts.setdefault(sid, {})['validated'] = sorted(v)
    for sid, r in (saved.get('revs') or {}).items():
        sts.setdefault(sid, {})['rev'] = r
    for sid in saved.get('tombstones') or []:
        sts[sid] = {'deleted': True}
    for sid, st in sts.items():
        cmds.append(['SET', P + 'st:' + sid, json.dumps(st)])
    work_dir = os.path.join(data_dir, 'work')
    if os.path.isdir(work_dir):
        for name in os.listdir(work_dir):
            if name.endswith('.json'):
                try:
                    cmds.append(['SET', P + 'work:' + name[:-5], open(os.path.join(work_dir, name), encoding='utf-8').read()])
                    n += 1
                except OSError:
                    pass
    try:
        cmds.append(['SET', P + 'settings', json.dumps(json.load(open(os.path.join(data_dir, 'settings.json'), encoding='utf-8')))])
    except (OSError, ValueError):
        pass
    if cmds:
        store.run(cmds)
    return n


# ---------- helpers ----------
def jload(s, default=None):
    try:
        return json.loads(s) if s else default
    except (TypeError, ValueError):
        return default


def pack(obj):
    return base64.b64encode(zlib.compress(json.dumps(obj).encode('utf-8'), 6)).decode('ascii')


def unpack(s, default=None):
    try:
        return json.loads(zlib.decompress(base64.b64decode(s)).decode('utf-8')) if s else default
    except (ValueError, zlib.error, TypeError):
        return default


def hash_dict(flat):
    flat = flat or []
    return {flat[i]: jload(flat[i + 1]) for i in range(0, len(flat), 2)}


def norm(s):
    # "Léa " == "lea": ignore accents, case and extra spaces.
    s = unicodedata.normalize('NFD', str(s or ''))
    return ' '.join(''.join(c for c in s if not unicodedata.combining(c)).split()).casefold()


# what the students may know of a test (never the grades, the shared corrections or the curve)
EXAM_PUBLIC = ('id', 'className', 'title', 'challenges', 'minutes', 'hints', 'practice', 'startedAt', 'endsAt', 'stoppedAt', 'active')


def public_exam(exam):
    return {k: exam[k] for k in EXAM_PUBLIC if k in exam} if isinstance(exam, dict) else exam


def public_ctl(ctl):
    ctl = dict(ctl or {})
    if ctl.get('exam'):
        ctl['exam'] = public_exam(ctl['exam'])
    return ctl


def exam_parts(exams):
    # the tests of a student, without the programs (the progress dots of the live view): the 6 latest, per part:
    # c = times submitted, b = best score, p = something written (a program or quiz answers)
    if not isinstance(exams, dict):
        return {}
    recent = sorted((kv for kv in exams.items() if isinstance(kv[1], dict)), key=lambda kv: kv[1].get('startedAt') or 0, reverse=True)[:6]
    return {eid: {'title': clean_text(e.get('title'), 80), 'startedAt': e.get('startedAt'), 'done': bool(e.get('done')),
                  'slots': {cid: {'c': int(sl.get('checks') or 0), 'b': sl.get('best'), 'p': bool(sl.get('program') or sl.get('answers'))}
                            for cid, sl in (e.get('slots') or {}).items() if isinstance(sl, dict)}} for eid, e in recent}


def strip_programs(data):
    snap = dict(data)
    snap['challenges'] = {k: {kk: vv for kk, vv in v.items() if kk not in ('program', 'robot', 'answers', 'quizMarks')} for k, v in (data.get('challenges') or {}).items()}
    free = dict(data.get('free') or {})
    free.pop('program', None)
    free.pop('robot', None)
    snap['free'] = free
    snap['examParts'] = exam_parts(data.get('exams'))
    snap.pop('exams', None)
    snap['events'] = (data.get('events') or [])[-60:]
    return snap


PROGRAM_KEYS = ('program', 'robot', 'bestProgram')  # Blockly JSON: shown by Blockly only, never as HTML
DEFANG = str.maketrans({'<': '‹', '>': '›', '"': '”'})


def defang(v):
    # What a student's browser sends is shown in the teacher dashboard: no HTML can get through.
    if isinstance(v, str):
        return v.translate(DEFANG)
    if isinstance(v, list):
        return [defang(x) for x in v]
    if isinstance(v, dict):
        return {defang(str(k)): (x if k in PROGRAM_KEYS else defang(x)) for k, x in v.items()}
    return v


def validated_count(s):
    return sum(1 for c in (s.get('challenges') or {}).values() if c.get('status') == 'validated')


# ---------- AI marking (OpenAI, like the bookshop app: key in the environment, Responses API, Structured Outputs) ----------
AI_MODEL = os.environ.get('OPENAI_MODEL') or 'gpt-4o'
AI_SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['mark', 'feedback', 'teacherNote'],
    'properties': {
        'mark': {'type': 'number', 'description': 'The mark, from 0 to the maximum, in half marks'},
        'feedback': {'type': 'string', 'description': 'For the student: 1 to 3 short, simple sentences'},
        'teacherNote': {'type': 'string', 'description': 'For the teacher: why this mark'},
    },
}
AI_PROMPT = '\n'.join([
    'You mark one program of a test for students aged 13-14 (beginners), written with the MakeCode blocks of the BBC micro:bit.',
    'You get: the task, the marks, a MARKING GUIDE for this task, a program that works (one way among many), the student',
    'program (MakeCode JavaScript made from their blocks; only the blocks that run are in it) and the results of automatic',
    'checks run on a micro:bit simulator.',
    '',
    'HOW TO MARK',
    '1. Follow the MARKING GUIDE: it says what each mark is for and how much the usual slips cost. Mark what the program',
    '   DOES and what it shows the student understood, not how it is written: other blocks, other order, if / else or several',
    '   ifs, a word before the number, a pause or a clear screen after, a forever that checks a button… are all fine.',
    '2. Be fair, like a kind teacher: a SMALL SLIP that a beginner fixes in a few seconds (the wrong button letter, the wrong',
    '   icon, a limit off by one, a missing show block, a wrong number in a block) costs AT MOST 1 mark when the rest is right.',
    '   Never give 0 to a program that does most of the task.',
    '3. The automatic checks really ran the program: they are reliable for what it shows, but they are ALL OR NOTHING (a',
    '   program on the wrong button gets 0 everywhere). Never copy their score: use them to see what works, then mark with',
    '   the guide.',
    '4. Marks are in half marks, from 0 to the maximum. 0 only when nothing of the task is there.',
    '5. Do not take marks away for style, extra blocks or extra things shown, unless they stop the task from working.',
    '6. feedback: the comment the TEACHER gives to the student, in simple English (level A2), 1 to 3 short sentences:',
    '   what works, then what to change (with the names of the blocks). Kind and precise. Never give the mark, never',
    '   talk about checks, tests, AI or a computer: write as the teacher.',
    '7. teacherNote: for the teacher, 1 to 3 sentences: the marks part by part (for example "A part 2/2, B part 1/2: wrong',
    '   button") and anything to check by hand.',
])


AI_QUIZ_SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['answers'],
    'properties': {'answers': {'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False, 'required': ['question', 'mark', 'feedback', 'teacherNote'],
        'properties': {
            'question': {'type': 'integer', 'description': 'The number of the question, as given'},
            'mark': {'type': 'number', 'description': 'From 0 to the marks of the question, in half marks'},
            'feedback': {'type': 'string', 'description': 'For the student: one short, simple sentence'},
            'teacherNote': {'type': 'string', 'description': 'For the teacher: why this mark'},
        }}}},
}
AI_QUIZ_PROMPT = '\n'.join([
    'You mark the TYPED answers of a quiz for students aged 13-14 (beginners) about the BBC micro:bit and its MakeCode blocks.',
    'English is often not their first language. For each question you get: the question, its marks, the expected answer,',
    'the words the answer key accepts, the program shown with the question (MakeCode JavaScript) if there is one, the',
    "student's answer and what the answer key decided (it only looks for words).",
    '',
    'RULES',
    '1. Mark the IDEA, not the words: a right answer with spelling mistakes, other words with the same meaning, a longer',
    '   sentence or a right answer in another language (say so in teacherNote) gets the marks.',
    '2. A wrong, vague or contradictory answer (two answers, one wrong) does not. Do not guess what they meant.',
    '3. When there is a program, work out yourself what it does: the expected answer is right, but check the reasoning.',
    '4. Half marks only when the question has 2 marks or more and the answer is partly right.',
    '5. feedback: the comment the TEACHER gives to the student, simple English (A2), one short sentence: why it is right,',
    '   or the right idea. No mark in it; never talk about AI, a computer or an answer key: write as the teacher.',
    '6. teacherNote: for the teacher, one sentence, especially when you disagree with the answer key.',
    '7. Give one item per question, with the question number as given.',
])


# How each challenge is marked (the AI follows it). Kept on the server: not in the students' app.
AI_GUIDES = {
    'faces': """4 marks. Button A shows a happy face: 2 marks. Button B shows a sad face: 2 marks.
- A face drawn with show leds that clearly looks happy / sad counts as the face.
- Wrong button for a part (for example the happy face on B and nothing on A, or both on A): that part 1 instead of 2.
- Faces swapped (A sad, B happy): 2 / 4 in all (both events are right, the faces are not).
- Another icon instead of the face (a heart…): that part 1.
- Only one button done: 2 / 4. A face shown by itself (on start / forever) without any button: 1 / 4.""",
    'rps': """6 marks. On shake (1). A random choice of three possibilities, kept in a variable (pick random 0 to 2, 1 to 3…) (2).
Three different pictures or words for rock, paper and scissors, one for each value, with if / else if or several ifs (2).
Every shake shows exactly one of the three (1).
- Another event (a button instead of shake): lose 1 only.
- Only two possibilities (random 0 to 1, or a value never used): lose 1 or 2.
- The number shown instead of pictures (show number choice): at most 2 / 6.
- Any pictures or words that are clearly different are fine (no need for the exact icons).""",
    'sound-a': """4 marks. On button A (1). show number (or show string) (1). The sound level block in it (2).
- Wrong button (B, A+B, shake): 3 / 4.
- Another sensor (light level, temperature…) instead of sound level: 2 / 4.
- Shown all the time in a forever, without the button: 2 / 4 (the right sensor, the wrong trigger).
- A fixed number instead of the sensor: 1 / 4.""",
    'temp-b': """4 marks. On button B (1). show number (or show string) (1). The temperature block in it (2).
- Wrong button (A, A+B, shake): 3 / 4.
- Another sensor (light level, sound level…) instead of temperature: 2 / 4.
- Shown all the time in a forever, without the button: 2 / 4.
- A fixed number instead of the sensor: 1 / 4.""",
    'dice-dots': """6 marks. On shake (1). A random number for six possibilities, in a variable (pick random 1 to 6, or 0 to 5 used the right
way) (1). Six faces drawn with dots, one LED = one dot, each with the right number of dots: half a mark per right face (3).
One face for each value, chosen with if / else if or several ifs (1).
- The dots can be anywhere: only the number of lit LEDs counts.
- Another event (a button): lose 1 only.
- A random range that misses a face or gives a value without a face (1 to 5, 0 to 6…): lose 1.
- show number instead of dots: at most 2 / 6.""",
    'light-levels': """5 marks. Runs all the time (forever, or a loop) and reads the light level (1). Shows 1, 2, 3 and 4 for the four ranges
(0-63 → 1, 64-127 → 2, 128-191 → 3, 192-255 → 4), half a mark per level (2). The conditions are in an order where every
level can be reached (1). The limits are right (63 / 64, 127 / 128, 191 / 192) (1).
- A limit off by one (< 63 instead of < 64…): lose half a mark for each, at most 1.
- With a button instead of forever: lose 1 only.
- Conditions in an order that makes levels impossible (for example "< 192" first): lose the levels that never show.
- show string "1" or "LEVEL 1" are fine.""",
    'score-ab': """3 marks. A score variable that starts at 0 (on start, or not set at all: a variable starts at 0) (0.5).
Button A adds 1 to it (1). Button B takes 1 away (1). The score is shown after each press (0.5).
- show before change (shows the old score): lose 0.5.
- set score to 1 (instead of change by 1): lose that part.
- B adds instead of taking away, or the buttons swapped: lose 1.
- The score shown all the time in a forever is fine.""",
    'max-temp': """5 marks. A variable for the highest temperature (1). Checked again and again (forever, or every time) (1). Compares the
temperature with the highest and keeps the bigger one (if temperature > highest then set highest, or max of) (2).
Button A shows the highest (1).
- Start value: the temperature, 0 or a very low number are all fine.
- Updated only when A is pressed (no forever) but with the right comparison: 3 / 5.
- set highest to temperature without comparing (it shows the temperature now): at most 2 / 5.
- Shows the temperature now instead of a highest: 1 / 5.
- Shown all the time in a forever instead of on A: lose 1.""",
}


class AIError(Exception):
    pass


def ai_mark(task, max_marks, code, solution, checks, guide=''):
    """One OpenAI call (Responses API, temperature 0, strict JSON schema). Returns {mark, feedback, teacherNote}."""
    guide = guide or 'Give marks for each part of the task that works or is nearly right.'
    user = (f'TASK ({fmt_num(max_marks)} marks)\n{task}\n\nMARKING GUIDE\n{guide}\n\nA PROGRAM THAT WORKS\n{solution or "(none)"}\n\n'
            f'STUDENT PROGRAM\n{code or "(empty: no blocks that run)"}\n\nAUTOMATIC CHECKS\n{checks or "(none)"}')
    out, model = ai_call(AI_PROMPT, user, 'microbit_mark', AI_SCHEMA)
    try:
        return {'mark': float(out['mark']), 'feedback': str(out['feedback'])[:600], 'teacherNote': str(out['teacherNote'])[:800], 'model': model}
    except (ValueError, KeyError, TypeError):
        raise AIError('The AI answer cannot be read.')


def ai_mark_quiz(qs):
    """The typed answers of one quiz in one call. Returns one {mark, feedback, teacherNote} per question, in the same order."""
    parts = []
    for q in qs:
        parts.append(f'QUESTION {q["i"] + 1} ({fmt_num(q["marks"])} mark{"s" if q["marks"] != 1 else ""})\n{q["question"]}\n'
                     + (f'Program shown:\n{q["program"]}\n' if q['program'] else '')
                     + f'Expected answer: {q["model"]}\nThe answer key accepts: {q["accept"]}\n'
                     f'Student answer: "{q["answer"]}"\nAnswer key decision: {q["auto"]}')
    out, model = ai_call(AI_QUIZ_PROMPT, '\n\n'.join(parts), 'microbit_quiz', AI_QUIZ_SCHEMA)
    by = {}
    try:
        for a in out['answers']:
            by[int(a['question'])] = a
        return [{'mark': float(by[q['i'] + 1]['mark']), 'feedback': str(by[q['i'] + 1]['feedback'])[:400],
                 'teacherNote': str(by[q['i'] + 1]['teacherNote'])[:600], 'model': model} for q in qs]
    except (ValueError, KeyError, TypeError):
        raise AIError('The AI answer cannot be read.')


def ai_call(system, user, name, schema):
    """POST /v1/responses with the key of the environment. Returns (the JSON object of the answer, the model)."""
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise AIError('OPENAI_API_KEY is missing: add it in Vercel (Settings → Environment Variables), then redeploy.')
    body = {'model': AI_MODEL, 'temperature': 0, 'input': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
            'text': {'format': {'type': 'json_schema', 'name': name, 'strict': True, 'schema': schema}}}
    base = (os.environ.get('OPENAI_BASE_URL') or 'https://api.openai.com/v1').rstrip('/')  # another address only for the tests
    req = urllib.request.Request(base + '/responses', data=json.dumps(body).encode(), method='POST',
                                 headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=50) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get('error', {}).get('message', '')
        except ValueError:
            msg = ''
        raise AIError(f'OpenAI error {e.code}: {msg[:200]}')
    except (OSError, ValueError) as e:
        raise AIError(f'OpenAI does not answer: {e}')
    text = ''.join(c.get('text', '') for o in d.get('output') or [] if o.get('type') == 'message'
                   for c in o.get('content') or [] if c.get('type') == 'output_text')
    try:
        return json.loads(text), d.get('model') or AI_MODEL
    except ValueError:
        raise AIError('The AI answer cannot be read.')


def fmt_num(x):
    return str(int(x)) if float(x).is_integer() else str(x)


def clean_text(s, n=500):
    return str(s or '').strip()[:n]


class Api:
    def __init__(self, store, teacher_code, hosted=False):
        self.store, self.teacher_code, self.hosted = store, teacher_code, hosted
        self.backup_checked = ''
        self._codes, self._tcodes, self._codes_t, self._raw_settings = {}, {}, 0, {}

    # small wrappers
    def r(self, *cmds):
        return self.store.run(list(cmds))

    def get_json(self, key, default=None):
        return jload(self.r(['GET', P + key])[0], default)

    def status(self, sid):
        return jload(self.r(['GET', P + 'st:' + sid])[0], {}) or {}

    def update_status(self, sid, **changes):
        st = self.status(sid)
        st.update(changes)
        self.r(['SET', P + 'st:' + sid, json.dumps(st)])
        return st

    def settings(self, teacher=False):
        raw = self.get_json('settings', {}) or {}
        s = {**DEFAULT_SETTINGS, **{k: v for k, v in raw.items() if k in DEFAULT_SETTINGS}}
        if teacher:
            s['classCodes'] = self.class_codes(fresh=True)
            s['testCodes'] = dict(self._tcodes)
        return {**s, **HOSTED_SYNC} if self.hosted else s

    def bump(self):
        self.r(['INCR', P + 'ver'])

    # ---------- class codes: one per class; a code only opens its own class ----------
    # (kept 60 s in memory: checking a code on every request must not cost database reads)
    def class_codes(self, fresh=False):
        if not fresh and self._codes_t and time.time() - self._codes_t < 60:
            return self._codes
        raw = self.get_json('settings', {}) or {}
        codes = {c: str(v) for c, v in (raw.get('classCodes') or {}).items() if v}
        roster = self.roster()
        changed = False
        for c in roster:
            if not codes.get(c):
                used = set(codes.values())
                code = ''.join(random.choice('23456789') for _ in range(6))
                while code in used:
                    code = ''.join(random.choice('23456789') for _ in range(6))
                codes[c] = code
                changed = True
        # the test password of each class (4 digits): the teacher gives it at the start of a test
        tcodes = {c: str(v) for c, v in (raw.get('testCodes') or {}).items() if v}
        for c in roster:
            if not tcodes.get(c):
                tcodes[c] = ''.join(random.choice('23456789') for _ in range(4))
                changed = True
        if changed or 'studentCode' in raw:
            raw['classCodes'], raw['testCodes'] = codes, tcodes
            raw.pop('studentCode', None)
            self.r(['SET', P + 'settings', json.dumps(raw)])
        self._codes, self._tcodes, self._codes_t, self._raw_settings = codes, tcodes, time.time(), raw
        return codes

    def test_codes(self):
        self.class_codes(fresh=True)
        return dict(self._tcodes)

    def grant(self, ctx, params, body=None):
        """'*' for the teacher (or the class server's own computer), the class of the code for a student, None otherwise."""
        if ctx.get('local') or self.is_teacher(ctx, params, body):
            return '*'
        given = str(ctx['headers'].get('X-Class-Code') or (params or {}).get('c') or (body or {}).get('classCode') or '').strip()
        if not given:
            return None
        for fresh in (False, True):
            if fresh and time.time() - self._codes_t < 3:
                break
            for c, code in self.class_codes(fresh).items():
                if code == given:
                    return c
        return None

    def wiped_after(self, work):
        """Work created well before the last "empty the database" (older browsers still holding it). The students
        of a wipe are also marked deleted (st:ID); one hour of margin for computers whose clock is late."""
        w, c = (self._raw_settings or {}).get('wipedAt'), work.get('createdAt')
        if not (w and c):
            return False
        try:
            def t(x):
                return time.mktime(time.strptime(str(x)[:19], '%Y-%m-%dT%H:%M:%S'))
            return t(c) < t(w) - 3600
        except ValueError:
            return False

    def snaps(self):
        return hash_dict(self.r(['HGETALL', P + 'snap'])[0])

    def all_works(self, sids):
        keys = [P + 'work:' + sid for sid in sids]
        return [w for w in (jload(x) for x in (self.r(['MGET', *keys])[0] if keys else [])) if w]

    # ---------- backups ----------
    def make_backup(self, force=False):
        day = time.strftime('%Y-%m-%d')
        if not force and self.backup_checked == day:
            return None
        self.backup_checked = day
        if not force and self.r(['EXISTS', P + 'backup:' + day])[0]:
            return None
        snaps = self.snaps()
        body = {'type': 'mb-class-backup', 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'works': self.all_works(sorted(snaps)),
                'roster': self.get_json('roster'), 'settings': self.get_json('settings')}
        packed = pack(body)
        index = [b for b in (jload(x) for x in self.r(['LRANGE', P + 'backups', 0, -1])[0] or []) if b and b.get('date') != day]
        index = (index + [{'date': day, 'students': len(body['works']), 'size': len(json.dumps(body)), 'packed': len(packed), 'at': body['exportedAt']}])[-BACKUP_DAYS:]
        self.r(['SET', P + 'backup:' + day, packed, 'EX', (BACKUP_DAYS + 1) * 86400], ['DEL', P + 'backups'],
               ['RPUSH', P + 'backups', *[json.dumps(b) for b in index]])
        return day

    def archive(self, reason, sids=None):
        snaps = self.snaps()
        if sids is not None:
            snaps = {k: v for k, v in snaps.items() if k in set(sids)}
        name = time.strftime('%Y-%m-%d_%H%M%S') + '_%03d%04d_' % (int(time.time() * 1000) % 1000, random.randrange(10000)) + reason
        self.r(['SET', P + 'archive:' + name, pack({'students': snaps, 'works': self.all_works(snaps)}), 'EX', 180 * 86400])
        return 'archive ' + name

    def next_rev(self, sid, work):
        """Save counter: a browser saving a copy older than the one on the server (an old tab, an old copy on another
        computer, an old file) is refused (409, stale) and reloads the latest work instead of erasing it."""
        stored = int(self.r(['HGET', P + 'srev', sid])[0] or 0)
        try:
            base = int(work.get('saveRev') or 0)
        except (TypeError, ValueError):
            base = 0
        if base < stored:
            return None
        work['saveRev'] = stored + 1
        return stored + 1

    def teacher_rev(self, sid, work):
        """A work written by the teacher (edit, restore) becomes the newest version: the student's browser reloads it
        and saves from there."""
        rev = int(self.r(['HGET', P + 'srev', sid])[0] or 0) + 1
        work['saveRev'] = rev
        return ['HSET', P + 'srev', sid, rev]

    def remove_cmds(self, sid):
        return [['HDEL', P + 'snap', sid], ['HDEL', P + 'srev', sid], ['HDEL', P + 'seen', sid], ['DEL', P + 'work:' + sid, P + 'hist:' + sid, P + 'notes:' + sid], ['HDEL', P + 'help', sid],
                ['SET', P + 'st:' + sid, json.dumps({'deleted': True})]]

    def roster(self):
        r = self.get_json('roster')
        if r is None:
            try:
                r = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_roster.json'), encoding='utf-8'))
            except (OSError, ValueError):
                r = {}
        return r

    # ---------- request handling ----------
    def corr_token(self, eid, sid):
        # the key of a student's correction link: only the server can make it (signed with a random secret)
        secret = self.r(['GET', P + 'corrsecret'])[0]
        if not secret:
            secret = base64.urlsafe_b64encode(os.urandom(24)).decode()
            self.r(['SET', P + 'corrsecret', secret])
        return hmac.new(secret.encode(), f'{eid}:{sid}'.encode(), hashlib.sha256).hexdigest()[:20]

    def solutions(self):
        sol = self.get_json('solutions')
        if not sol:
            try:
                sol = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_solutions.json'), encoding='utf-8'))
            except (OSError, ValueError):
                sol = {}
        return sol

    def is_teacher(self, ctx, params, body=None):
        code = str(ctx['headers'].get('X-Teacher-Code') or (params or {}).get('code') or (body or {}).get('code') or '').strip()
        return ctx.get('local') or code == self.teacher_code

    def handle(self, method, path, params, body, ctx):
        """Returns (http status, json object)."""
        try:
            if method == 'GET':
                return self.get(path, params, ctx)
            if not isinstance(body, dict):
                return 400, {'error': 'bad request'}
            return self.post(path, body, ctx)
        except (TypeError, ValueError, AttributeError) as e:
            return 400, {'error': 'bad request: ' + str(e)}
        except Exception as e:  # noqa: BLE001 - always answer in JSON
            return 500, {'error': str(e)}

    def get(self, path, params, ctx):
        teacher = self.is_teacher(ctx, params)
        if path == '/api/ping':
            return 200, {'ok': True, 'time': time.time()}
        if path == '/api/info':
            code = str(params.get('code', '')).strip()
            info = {**ctx.get('info', {}), 'hosted': self.hosted, 'needsCode': not ctx.get('local'), 'teacher': teacher,
                    'passwordOk': code == self.teacher_code, 'codeConfigured': True, 'studentCodeRequired': not ctx.get('local')}
            if teacher:
                info['classCodes'] = self.class_codes(fresh=True)
                info['testCodes'] = dict(self._tcodes)
            return 200, info
        if path == '/api/settings':
            return 200, self.settings(teacher)
        if path == '/api/correction':
            # the correction page of one student (link given by the teacher once the test is marked): no password, no class code
            eid, sid, key = str(params.get('e', '')), str(params.get('s', '')), str(params.get('k', ''))
            preview = params.get('preview') == '1' and self.is_teacher(ctx, params)  # the teacher looks at it first
            if not ID.fullmatch(eid) or not ID.fullmatch(sid) or not (preview or hmac.compare_digest(key, self.corr_token(eid, sid))):
                return 404, {'error': 'This correction link is not right. Ask your teacher.'}
            raw = self.r(['HGET', P + 'exams', eid], ['HGET', P + 'examres:' + eid, sid])
            exam, res = jload(raw[0]), jload(raw[1], {}) or {}
            if not exam or not res:
                return 404, {'error': 'This correction link is not right. Ask your teacher.'}
            shared = exam.get('shared') or ({'grades': {}} if preview else None)
            if not shared:
                return 403, {'error': 'Your teacher has not opened the correction of this test yet.'}
            sols = self.solutions()
            return 200, {'exam': {k: exam.get(k) for k in ('id', 'title', 'className', 'challenges', 'startedAt')},
                         'result': {'name': res.get('name'), 'marks': res.get('marks') or {},
                                    'challenges': {c: {'score': v.get('score'), 'program': v.get('program')} for c, v in (res.get('challenges') or {}).items() if isinstance(v, dict)},
                                    'review': {c: {'mark': v.get('mark')} for c, v in (res.get('ai') or {}).items() if isinstance(v, dict)},
                                    'comments': {k: t for k, t in {**{c: v.get('feedback') for c, v in (res.get('ai') or {}).items() if isinstance(v, dict)},
                                                                   **(res.get('comments') or {})}.items() if t}},
                         'grade': (shared.get('grades') or {}).get(sid),
                         'solutions': {c: (sols.get(c) or [{}])[0].get('program') for c in exam.get('challenges', []) if sols.get(c)}}
        g = self.grant(ctx, params)
        if path == '/api/join':
            return 200, {'ok': g is not None, 'className': g if g not in (None, '*') else None}
        # ----- students of a class (class code): they only see their own class -----
        if g is None:
            return 401, {'error': 'class code required', 'needCode': True}
        if path == '/api/roster':
            roster = self.roster()
            return 200, {'roster': roster if g == '*' else {g: roster.get(g, [])}}
        if path == '/api/classctl':
            # what the welcome page needs (closed classes, running exams)
            ctl = hash_dict(self.r(['HGETALL', P + 'classctl'])[0])
            return 200, {'classes': {c: {'closed': bool(v.get('closed')), 'paused': bool(v.get('paused')), 'exam': bool((v.get('exam') or {}).get('active'))}
                                     for c, v in ctl.items() if v and (g == '*' or c == g)}, 'now': time.time()}
        if path == '/api/help/queue':
            # The help queue of one class, in order (the student who asks sees where they are; ids are not shown).
            sid, cls = str(params.get('studentId', '')), str(params.get('className', '') if g == '*' else g)
            reqs = sorted((h for h in hash_dict(self.r(['HGETALL', P + 'help'])[0]).values() if h and (h.get('className') or '') == cls),
                          key=lambda h: h.get('since', 0))
            return 200, {'queue': [{'name': h.get('name'), 'me': h.get('studentId') == sid, 'since': h.get('since')} for h in reqs], 'now': time.time()}
        if path == '/api/names' and g != '*':
            return 403, {'error': 'teacher code required'}
        if path == '/api/work/find' or path == '/api/names':
            snaps = [s for s in self.snaps().values() if s]
            if path == '/api/work/find':
                # A student = class + first name (accents, case and spaces ignored). Old work without a class still matches.
                # liveNow: this name is open on a computer right now (a classmate must not take it over during a test)
                seen = hash_dict(self.r(['HGETALL', P + 'seen'])[0])
                def live_now(s):
                    pr = seen.get(s['studentId']) or {}
                    t, live = max((pr.get('t') or 0, pr.get('live')), (s.get('receivedAt') or 0, s.get('live')), key=lambda x: x[0])
                    return time.time() - t < 45 and (live or {}).get('status') != 'left'
                name, cls = norm(params.get('name', '')), norm(params.get('className', '') if g == '*' else g)
                found = sorted((s for s in snaps if norm(s.get('name')) == name and (not cls or norm(s.get('className')) in ('', cls))),
                               key=lambda s: s.get('updatedAt', ''), reverse=True)
                return 200, {'matches': [{'studentId': s['studentId'], 'name': s.get('name'), 'className': s.get('className'), 'mode': s.get('mode'),
                                          'updatedAt': s.get('updatedAt'), 'current': s.get('current'), 'validated': validated_count(s),
                                          'liveNow': live_now(s)} for s in found]}
            prefix = norm(params.get('prefix', ''))
            names = {}
            for s in sorted((s for s in snaps if prefix and norm(s.get('name')).startswith(prefix)), key=lambda s: s.get('updatedAt', '')):
                names[norm(s.get('name'))] = {'name': s.get('name'), 'mode': s.get('mode'), 'validated': validated_count(s)}
            return 200, {'names': sorted(names.values(), key=lambda n: norm(n['name']))[:8]}
        m = re.fullmatch(r'/api/work/([\w-]+)', path)
        if m:
            w = self.get_json('work:' + m.group(1))
            if w and g != '*':
                # classmates know each other's names: never hand out a best exam program
                # (the exam program being written stays: a student who reloads the page during an exam needs it back)
                for ex in (w.get('exams') or {}).values():
                    for slot in ((ex or {}).get('slots') or {}).values():
                        if isinstance(slot, dict):
                            slot.pop('bestProgram', None)
            return (200, w) if w else (404, {'error': 'not found'})
        m = re.fullmatch(r'/api/student/([\w-]+)', path)
        if m:
            # Polled by the student's browser: teacher decisions + class controls (message, pause, closed, exam).
            sid, cls = m.group(1), str(params.get('className', '') if g == '*' else g)
            raw = self.r(['GET', P + 'st:' + sid], ['HGET', P + 'classctl', cls or '_none'])
            st = jload(raw[0], {}) or {}
            return 200, {'validated': st.get('validated', []), 'rev': st.get('rev', 0), 'deleted': bool(st.get('deleted')),
                         'helpDone': st.get('helpDone', 0), 'notesRev': st.get('notesRev', 0), 'classctl': public_ctl(jload(raw[1], {}) or {}), 'now': time.time()}
        m = re.fullmatch(r'/api/notes/([\w-]+)', path)
        if m:
            return 200, {'notes': self.get_json('notes:' + m.group(1), []) or []}
        # ----- teacher only -----
        if not teacher:
            return 403, {'error': 'teacher code required'}
        if path == '/api/progress':
            raw = self.r(['HGETALL', P + 'snap'], ['HGETALL', P + 'help'], ['HGETALL', P + 'classctl'], ['HGETALL', P + 'seen'])
            snaps, seen = hash_dict(raw[0]), hash_dict(raw[3])
            # snapshots saved before the tests were summed up in them (examParts): once, from the saved work
            old = [sid for sid, s in snaps.items() if s and 'examParts' not in s][:40]
            if old:
                works = self.r(*[['GET', P + 'work:' + sid] for sid in old])
                fix = []
                for sid, w in zip(old, works):
                    snaps[sid]['examParts'] = exam_parts((jload(w, {}) or {}).get('exams'))
                    fix.append(['HSET', P + 'snap', sid, json.dumps(snaps[sid])])
                self.r(*fix)
            for sid, s in snaps.items():
                pr = seen.get(sid)
                if s and pr and pr.get('t', 0) > s.get('receivedAt', 0):  # presence newer than the last save
                    s['receivedAt'], s['live'] = pr['t'], pr.get('live') or s.get('live')
            out = {'students': [s for s in snaps.values() if s], 'help': [h for h in hash_dict(raw[1]).values() if h],
                   'classctl': hash_dict(raw[2]), 'now': time.time()}
            try:
                self.make_backup()  # once a day (also done by the Vercel cron job)
            except Exception:  # noqa: BLE001 - a failed backup must not break the dashboard
                pass
            return 200, out
        if path == '/api/admin/backup':
            date = params.get('date')
            if date:
                b = unpack(self.r(['GET', P + 'backup:' + date])[0])
                return (200, b) if b else (404, {'error': 'no backup for this day'})
            snaps = self.snaps()
            return 200, {'type': 'mb-class-backup', 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%S'), 'works': self.all_works(sorted(snaps)),
                         'roster': self.roster()}
        if path == '/api/solutions':
            # answer key of the challenges (teacher preview): in the database (put-solutions), else api/_solutions.json
            # (kept out of git: generated from tests/solutions_src.js)
            return 200, {'solutions': self.solutions()}
        if path == '/api/backups':
            return 200, {'backups': [b for b in (jload(x) for x in self.r(['LRANGE', P + 'backups', 0, -1])[0] or []) if b][::-1]}
        if path == '/api/stats':
            month = time.strftime('%Y-%m', time.gmtime())
            days = {k: int(v) for k, v in hash_dict(self.r(['HGETALL', P + 'stats:' + month])[0]).items()} if self.hosted else {}
            last = [b for b in (jload(x) for x in self.r(['LRANGE', P + 'backups', -1, -1])[0] or []) if b]
            return 200, {'hosted': self.hosted, 'month': month, 'monthTotal': sum(days.values()), 'days': days,
                         'today': days.get(time.strftime('%Y-%m-%d', time.gmtime()), 0), 'quota': self.settings().get('dbQuota'),
                         'dataSize': last[0]['size'] if last else None, 'students': len(self.snaps())}
        m = re.fullmatch(r'/api/history/([\w-]+)/([\w-]+)', path)
        if m:
            versions = unpack(self.r(['HGET', P + 'hist:' + m.group(1), m.group(2)])[0], []) or []
            return 200, {'versions': versions}
        if path == '/api/exams':
            exams = sorted((e for e in hash_dict(self.r(['HGETALL', P + 'exams'])[0]).values() if e), key=lambda e: e.get('startedAt', 0), reverse=True)
            return 200, {'exams': exams, 'now': time.time()}
        if path == '/api/exam/ailog':
            eid = str(params.get('examId', ''))
            log = [x for x in (jload(v) for v in self.r(['LRANGE', P + 'ailog', 0, -1])[0] or []) if x][::-1]  # newest first
            return 200, {'log': [x for x in log if not eid or x.get('examId') == eid], 'key': bool(os.environ.get('OPENAI_API_KEY')), 'model': AI_MODEL}
        if path == '/api/exam/results':
            eid = str(params.get('examId', ''))
            raw = self.r(['HGET', P + 'exams', eid], ['HGETALL', P + 'examres:' + eid])
            return 200, {'exam': jload(raw[0]), 'results': [x for x in hash_dict(raw[1]).values() if x], 'now': time.time()}
        return 404, {'error': 'not found'}

    BUMPING = ('/api/validate', '/api/forget', '/api/settings', '/api/roster', '/api/classctl', '/api/exam', '/api/admin')

    def post(self, path, data, ctx):
        code, out = self._post(path, data, ctx)
        # every teacher change that a student's browser must see increases the version counter
        if code == 200 and self.is_teacher(ctx, None, data) and (path in self.BUMPING or (path == '/api/notes' and data.get('action') in ('add', 'delete'))
                                                                 or (path == '/api/help' and data.get('by') == 'teacher')):
            self.bump()
        return code, out

    def _post(self, path, data, ctx):
        teacher = self.is_teacher(ctx, None, data)
        g = self.grant(ctx, None, data)
        if g is None:
            return 401, {'error': 'class code required', 'needCode': True}
        if path == '/api/sync':
            # The student's browser, every few seconds. Reads the status only when the teacher changed something
            # (version counter); saves the work only when it changed; otherwise just says "I am here".
            sid = str(data.get('studentId', ''))
            if not ID.fullmatch(sid):
                return 400, {'error': 'bad id'}
            work = data.get('work')
            if work is not None and not isinstance(work, dict):
                return 400, {'error': 'bad work'}
            work = defang(work)
            data['live'] = defang(data.get('live'))
            cls = g if g != '*' else str(data.get('className') or '')
            if work is not None and g != '*' and (work.get('className') or '') != g:
                return 403, {'error': 'this code is for another class'}
            sv = str(self.r(['GET', P + 'ver'])[0] or '0')
            out = {'ok': True, 'ver': sv, 'now': time.time()}
            st = None
            if str(data.get('ver') or '') != sv:
                raw = self.r(['GET', P + 'st:' + sid], ['HGET', P + 'classctl', cls or '_none'])
                st = jload(raw[0], {}) or {}
                self.class_codes(fresh=True)  # also refreshes the settings (wipedAt)
                out.update({'validated': st.get('validated', []), 'rev': st.get('rev', 0), 'deleted': bool(st.get('deleted')),
                            'helpDone': st.get('helpDone', 0), 'notesRev': st.get('notesRev', 0), 'classctl': jload(raw[1], {}) or {}, 'changed': True})
                if st.get('deleted') or self.wiped_after(data):  # data.createdAt: the database was emptied since
                    return 410, {'error': 'deleted by the teacher', 'deleted': True}
            if work is not None:
                if self.wiped_after(work):
                    return 410, {'error': 'the database was emptied', 'deleted': True}
                if st is not None and int(work.get('adminRev') or 0) < st.get('rev', 0):
                    return 409, {'error': 'changed by the teacher', 'rev': st.get('rev', 0)}
                rev = self.next_rev(sid, work)
                if rev is None:
                    return 409, {'error': 'a newer version of this work is on the server', 'stale': True}
                snap = strip_programs(work)
                snap['live'], snap['receivedAt'] = data.get('live'), time.time()
                self.r(['HSET', P + 'snap', sid, json.dumps(snap)], ['SET', P + 'work:' + sid, json.dumps(work)], ['HSET', P + 'srev', sid, rev])
                out['savedAt'], out['savedRev'] = time.time(), rev
            elif data.get('live') is not None:
                self.r(['HSET', P + 'seen', sid, json.dumps({'t': time.time(), 'live': data['live']})])
            return 200, out
        if path in ('/api/progress', '/api/work'):
            data = defang(data)
            sid = str(data.get('studentId', ''))
            if not ID.fullmatch(sid):
                return 400, {'error': 'bad id'}
            if g != '*' and (data.get('className') or '') != g:
                return 403, {'error': 'this code is for another class'}
            st = self.status(sid)
            if st.get('deleted') or self.wiped_after(data):
                return 410, {'error': 'deleted by the teacher', 'deleted': True}
            if int(data.get('adminRev') or 0) < st.get('rev', 0):
                return 409, {'error': 'changed by the teacher', 'rev': st.get('rev', 0)}
            rev = self.next_rev(sid, data)
            if rev is None:
                return 409, {'error': 'a newer version of this work is on the server', 'stale': True}
            snap = strip_programs(data)
            snap['receivedAt'] = time.time()
            cmds = [['HSET', P + 'snap', sid, json.dumps(snap)], ['HSET', P + 'srev', sid, rev]]
            if path == '/api/work':
                cmds.append(['SET', P + 'work:' + sid, json.dumps({k: v for k, v in data.items() if k != 'live'})])
            self.r(*cmds)
            return 200, {'ok': True, 'savedAt': time.time(), 'savedRev': rev, 'validated': st.get('validated', []), 'rev': st.get('rev', 0),
                         'helpDone': st.get('helpDone', 0), 'notesRev': st.get('notesRev', 0)}
        if path == '/api/help':
            # Student: on = true asks for help, false cancels. Teacher: on = false marks it as done.
            sid = str(data.get('studentId', ''))
            if not ID.fullmatch(sid):
                return 400, {'error': 'bad id'}
            if data.get('on'):
                old = jload(self.r(['HGET', P + 'help', sid])[0], {}) or {}
                req = {'studentId': sid, 'name': clean_text(data.get('name'), 60), 'className': clean_text(data.get('className') if g == '*' else g, 20),
                       'where': clean_text(data.get('where'), 120), 'message': clean_text(data.get('message'), 200), 'since': old.get('since') or time.time()}
                self.r(['HSET', P + 'help', sid, json.dumps(req)])
                return 200, {'ok': True, 'since': req['since']}
            self.r(['HDEL', P + 'help', sid])
            if teacher and data.get('by') == 'teacher':
                self.update_status(sid, helpDone=time.time())
            return 200, {'ok': True}
        if path == '/api/history':
            # A new version of a program (on "Run" or "Check my solution"), kept compressed, HISTORY_MAX per program.
            sid, slot = str(data.get('studentId', '')), str(data.get('slot', ''))
            if not ID.fullmatch(sid) or not SLOT.fullmatch(slot) or not isinstance(data.get('program'), dict):
                return 400, {'error': 'bad request'}
            if self.status(sid).get('deleted'):
                return 410, {'error': 'deleted'}
            versions = unpack(self.r(['HGET', P + 'hist:' + sid, slot])[0], []) or []
            score = data.get('score')
            v = {'t': clean_text(data.get('t'), 40) or time.strftime('%Y-%m-%dT%H:%M:%S'), 'kind': 'check' if data.get('kind') == 'check' else 'run',
                 'score': max(0, min(100, int(score))) if isinstance(score, (int, float)) else None,
                 'program': data['program'], 'robot': data.get('robot')}
            versions = (versions + [v])[-HISTORY_MAX:]
            self.r(['HSET', P + 'hist:' + sid, slot, pack(versions)])
            return 200, {'ok': True, 'count': len(versions)}
        if path == '/api/notes':
            # Teacher comments pinned to a block. Teacher: add / delete. Student: done ("Got it").
            sid, action = str(data.get('studentId', '')), data.get('action')
            if not ID.fullmatch(sid):
                return 400, {'error': 'bad id'}
            if action in ('add', 'delete') and not teacher:
                return 403, {'error': 'teacher code required'}
            notes = self.get_json('notes:' + sid, []) or []
            if action == 'add':
                notes.append({'id': '%x' % int(time.time() * 1000), 'slot': clean_text(data.get('slot'), 40), 'blockId': clean_text(data.get('blockId'), 40),
                              'text': clean_text(data.get('text'), 500), 'at': time.time(), 'done': False})
            elif action == 'delete':
                notes = [n for n in notes if n['id'] != data.get('noteId')]
            elif action == 'done':
                for n in notes:
                    if n['id'] == data.get('noteId'):
                        n['done'] = True
                        n['doneAt'] = time.time()
            else:
                return 400, {'error': 'unknown action'}
            notes = notes[-200:]
            st = self.status(sid)
            st['notesRev'] = st.get('notesRev', 0) + 1
            self.r(['SET', P + 'notes:' + sid, json.dumps(notes)], ['SET', P + 'st:' + sid, json.dumps(st)])
            return 200, {'ok': True, 'notes': notes}
        if path == '/api/exam/join':
            # A student opens the running test of their class with the test password of the class.
            cls = g if g != '*' else clean_text(data.get('className'), 20)
            ctl = jload(self.r(['HGET', P + 'classctl', cls or '_none'])[0], {}) or {}
            exam = ctl.get('exam') or {}
            if not exam.get('active') or time.time() > exam.get('endsAt', 0):
                return 404, {'error': 'There is no test open for your class right now.'}
            given = re.sub(r'\s+', '', str(data.get('testCode') or ''))
            sid = str(data.get('studentId') or '')
            if sid and not ID.fullmatch(sid):
                return 400, {'error': 'bad request'}
            res = jload(self.r(['HGET', P + 'examres:' + exam['id'], sid])[0], {}) or {} if sid else {}
            # a student already in this test (page reloaded, other computer) comes back without the password
            if g != '*' and given != self.test_codes().get(cls) and not (res.get('joined') and data.get('resume')):
                return 403, {'error': 'Wrong test password. Ask your teacher.', 'needCode': True}
            if sid:
                if res.get('finishedAt'):
                    return 403, {'error': 'You have already submitted this test.', 'finished': True}
                if not res.get('joined'):
                    res.update({'studentId': sid, 'name': clean_text(data.get('name'), 60), 'className': cls, 'joined': time.time(), 'updatedAt': time.time()})
                    res.setdefault('challenges', {})
                    self.r(['HSET', P + 'examres:' + exam['id'], sid, json.dumps(res)])
            return 200, {'ok': True, 'exam': public_exam(exam)}
        if path == '/api/exam/finish':
            # "Submit my test": the student hands in the test; they cannot open it again.
            sid, eid = str(data.get('studentId', '')), str(data.get('examId', ''))
            if not ID.fullmatch(sid) or not ID.fullmatch(eid):
                return 400, {'error': 'bad request'}
            raw = self.r(['HGET', P + 'exams', eid], ['HGET', P + 'examres:' + eid, sid])
            exam, res = jload(raw[0]), jload(raw[1], {}) or {}
            if not exam or (g != '*' and exam.get('className') != g):
                return 404, {'error': 'no such exam'}
            if g != '*' and not res.get('joined'):
                return 403, {'error': 'open the test with its password first'}
            if not res.get('finishedAt'):
                res.update({'studentId': sid, 'name': clean_text(data.get('name'), 60) or res.get('name'), 'className': exam.get('className'),
                            'finishedAt': time.time(), 'updatedAt': time.time()})
                res.setdefault('challenges', {})
            if isinstance(data.get('away'), dict):
                res['away'] = {'n': int(data['away'].get('n') or 0), 'ms': int(data['away'].get('ms') or 0)}
            self.r(['HSET', P + 'examres:' + eid, sid, json.dumps(res)])
            return 200, {'ok': True, 'finishedAt': res['finishedAt']}
        if path == '/api/exam/result':
            # A student checked a solution during an exam: keep the best score (and its program) per challenge.
            sid, eid, chid = str(data.get('studentId', '')), str(data.get('examId', '')), str(data.get('challengeId', ''))
            if not ID.fullmatch(sid) or not ID.fullmatch(eid) or not SLOT.fullmatch(chid):
                return 400, {'error': 'bad request'}
            raw = self.r(['HGET', P + 'exams', eid], ['HGET', P + 'examres:' + eid, sid])
            exam, res = jload(raw[0]), jload(raw[1], {}) or {}
            if not exam or chid not in exam.get('challenges', []) or (g != '*' and exam.get('className') != g):
                return 404, {'error': 'no such exam'}
            if time.time() > (exam.get('stoppedAt') or exam['endsAt']) + EXAM_GRACE:
                return 409, {'error': 'the exam is over'}
            if g != '*' and not res.get('joined'):
                return 403, {'error': 'open the test with its password first'}
            if res.get('finishedAt'):
                return 409, {'error': 'the test is already submitted'}
            if isinstance(data.get('away'), dict):
                res['away'] = {'n': int(data['away'].get('n') or 0), 'ms': int(data['away'].get('ms') or 0)}
            res.update({'studentId': sid, 'name': clean_text(data.get('name'), 60), 'className': exam.get('className'), 'updatedAt': time.time()})
            best = res.setdefault('challenges', {}).get(chid)
            score = max(0, min(100, int(data.get('score') or 0)))
            # a quiz: the last answers sent count (the student may come back and change them); a program: the best one
            is_quiz = isinstance(data.get('program'), dict) and bool(data['program'].get('quiz'))
            if not best or score > best.get('score', -1) or is_quiz:
                alts = ((best or {}).get('alts') or []) + ([{k: best.get(k) for k in ('score', 'program', 'robot')}] if best and best.get('program') else [])
                res['challenges'][chid] = {'score': score, 'at': time.time(), 'program': data.get('program'), 'robot': data.get('robot'), 'checks': (best or {}).get('checks', 0) + 1,
                                           'alts': alts[-4:]}
            else:
                best['checks'] = best.get('checks', 0) + 1
            self.r(['HSET', P + 'examres:' + eid, sid, json.dumps(res)])
            return 200, ({'ok': True, 'best': res['challenges'][chid]['score']} if self.is_teacher(ctx, None, data) else {'ok': True})  # a student gets no score
        # ----- teacher only -----
        if not teacher:
            return 403, {'error': 'teacher code required'}
        if path == '/api/validate':
            sid = str(data.get('studentId'))
            st = self.status(sid)
            self.update_status(sid, validated=sorted(set(st.get('validated', [])) | {str(data.get('challengeId'))}))
            return 200, {'ok': True}
        if path == '/api/forget':
            sid = str(data.get('studentId'))
            self.r(['HDEL', P + 'snap', sid])
            return 200, {'ok': True}
        if path == '/api/settings':
            cur = {**DEFAULT_SETTINGS, **(self.get_json('settings', {}) or {})}
            new = dict(cur)
            for k, dv in DEFAULT_SETTINGS.items():
                if k in data:
                    v = data[k]
                    if isinstance(dv, bool):
                        v = bool(v)
                    else:
                        v = float(v)  # ValueError → 400
                        v = int(v) if isinstance(dv, int) else v
                        if k == 'passScore' and not 0 <= v <= 100:
                            return 400, {'error': 'the pass score is a percentage (0 to 100)'}
                    new[k] = v
            if isinstance(data.get('classCodes'), dict):
                codes = {clean_text(c, 20): re.sub(r'\s+', '', str(v or ''))[:20] for c, v in data['classCodes'].items()}
                roster = self.roster()
                merged = {c: v for c, v in {**(new.get('classCodes') or {}), **codes}.items() if v and (c in roster or c in codes)}
                vals = list(merged.values())
                if len(vals) != len(set(vals)) or any(len(v) < 3 for v in vals):
                    return 400, {'error': 'each class needs its own code (at least 3 characters)'}
                new['classCodes'] = merged
            if isinstance(data.get('testCodes'), dict):
                tc = {clean_text(c, 20): re.sub(r'\s+', '', str(v or ''))[:20] for c, v in data['testCodes'].items()}
                if any(v and len(v) < 3 for v in tc.values()):
                    return 400, {'error': 'a test password has at least 3 characters'}
                new['testCodes'] = {c: v for c, v in {**(new.get('testCodes') or {}), **tc}.items() if v}
            new.pop('studentCode', None)
            self.r(['SET', P + 'settings', json.dumps(new)])
            self._codes_t = 0
            return 200, self.settings(True)
        if path == '/api/roster':
            roster = data.get('roster')
            if not isinstance(roster, dict):
                return 400, {'error': 'bad roster'}
            clean = {clean_text(c, 20): [clean_text(n, 60) for n in names if clean_text(n, 60)] for c, names in roster.items() if clean_text(c, 20) and isinstance(names, list)}
            self.r(['SET', P + 'roster', json.dumps(clean)])
            self._codes_t = 0
            return 200, {'ok': True, 'roster': clean, 'classCodes': self.class_codes(fresh=True)}
        if path == '/api/classctl':
            # Live commands for one or several classes: message, pause the screens, open / close the access.
            classes = [clean_text(c, 20) for c in (data.get('classes') or [data.get('className')]) if clean_text(c, 20)]
            raw = self.r(*[['HGET', P + 'classctl', c] for c in classes]) if classes else []
            cmds = []
            for c, cur in zip(classes, raw):
                ctl = jload(cur, {}) or {}
                if 'message' in data:
                    ctl['message'] = {'id': '%x' % int(time.time() * 1000), 'text': clean_text(data['message'], 500), 'at': time.time()} if clean_text(data['message']) else None
                for k in ('paused', 'closed'):
                    if k in data:
                        ctl[k] = bool(data[k])
                cmds.append(['HSET', P + 'classctl', c, json.dumps(ctl)])
            if cmds:
                self.r(*cmds)
            return 200, {'ok': True}
        if path == '/api/exam/mark':
            # The teacher changes the mark of one question for one student (marks: a number, or null = back to the automatic mark).
            eid, sid, key = str(data.get('examId', '')), str(data.get('studentId', '')), str(data.get('key', ''))
            if not ID.fullmatch(eid) or not ID.fullmatch(sid) or not re.fullmatch(r'[\w-]{1,40}(#\d{1,2})?', key):
                return 400, {'error': 'bad request'}
            raw = self.r(['HGET', P + 'exams', eid], ['HGET', P + 'examres:' + eid, sid])
            exam, res = jload(raw[0]), jload(raw[1], {}) or {}
            if not exam:
                return 404, {'error': 'no such exam'}
            if not res:
                res = {'studentId': sid, 'name': clean_text(data.get('name'), 60), 'className': exam.get('className'), 'challenges': {}}
            marks = res.setdefault('marks', {})
            if data.get('marks') is None:
                marks.pop(key, None)
            else:
                v = float(data['marks'])  # ValueError → 400
                if not 0 <= v <= 100:
                    return 400, {'error': 'a mark is between 0 and the marks of the question'}
                marks[key] = v
            res['markedAt'] = time.time()
            self.r(['HSET', P + 'examres:' + eid, sid, json.dumps(res)])
            return 200, {'ok': True, 'marks': marks}
        if path == '/api/exam/comment':
            # The teacher writes / edits the comment of one part for one student (text: null = back to the suggested one).
            eid, sid, key = str(data.get('examId', '')), str(data.get('studentId', '')), str(data.get('key', ''))
            if not ID.fullmatch(eid) or not ID.fullmatch(sid) or not re.fullmatch(r'[\w-]{1,40}(#\d{1,2})?', key):
                return 400, {'error': 'bad request'}
            res = jload(self.r(['HGET', P + 'examres:' + eid, sid])[0], {}) or {}
            if not res:
                return 404, {'error': 'no such result'}
            com = res.setdefault('comments', {})
            if data.get('text') is None:
                com.pop(key, None)
            else:
                com[key] = clean_text(data.get('text'), 800)
            self.r(['HSET', P + 'examres:' + eid, sid, json.dumps(res)])
            return 200, {'ok': True, 'comments': com}
        if path == '/api/exam/ai':
            # AI marking of one program of one student (after the test): the teacher's page sends the task, the student's
            # program (MakeCode JavaScript), a program that works and the automatic checks; the mark is saved as the
            # suggested mark (the teacher reviews it, and can change it, before sharing the corrections).
            eid, sid, cid = str(data.get('examId', '')), str(data.get('studentId', '')), str(data.get('challengeId', ''))
            if not ID.fullmatch(eid) or not ID.fullmatch(sid) or not SLOT.fullmatch(cid):
                return 400, {'error': 'bad request'}
            raw = self.r(['HGET', P + 'exams', eid], ['HGET', P + 'examres:' + eid, sid])
            exam, res = jload(raw[0]), jload(raw[1], {}) or {}
            if not exam or cid not in exam.get('challenges', []) or not (res.get('challenges') or {}).get(cid):
                return 404, {'error': 'no such program'}
            now, found = time.time(), {}
            part = cid + (' (typed answers)' if isinstance(data.get('questions'), list) else '')
            def ai_log(ok, msg):  # every AI call, for the 🧾 AI log of the teacher dashboard (the 300 latest)
                entry = {'t': time.time(), 'examId': eid, 'studentId': sid, 'name': res.get('name'), 'part': part, 'ok': ok, 'msg': clean_text(msg, 400), 'ms': int((time.time() - now) * 1000)}
                self.r(['RPUSH', P + 'ailog', json.dumps(entry)], ['LTRIM', P + 'ailog', -300, -1])
            try:
                if isinstance(data.get('questions'), list):
                    # the typed answers of the quiz: one call for all of them; saved per question ("quiz-test#2")
                    qs = []
                    for q in data['questions'][:20]:
                        i, mx = int(q.get('i')), float(q.get('marks') or 1)
                        if not 0 <= i < 40:
                            return 400, {'error': 'bad request'}
                        qs.append({'i': i, 'marks': mx, 'question': clean_text(q.get('q'), 400), 'model': clean_text(q.get('model'), 300),
                                   'accept': clean_text(q.get('accept'), 300), 'program': clean_text(q.get('code'), 2000), 'answer': clean_text(q.get('answer'), 200),
                                   'auto': clean_text(q.get('auto'), 40)})
                    for q, a in zip(qs, ai_mark_quiz(qs)):
                        found[f'{cid}#{q["i"]}'] = {**a, 'mark': max(0.0, min(q['marks'], round(float(a['mark']) * 2) / 2)), 'at': now}
                else:
                    mx = float(data.get('max') or 0)
                    out = ai_mark(clean_text(data.get('task'), 3000), mx, clean_text(data.get('code'), 8000),
                                  clean_text(data.get('solution'), 4000), clean_text(data.get('checks'), 3000), AI_GUIDES.get(cid, ''))
                    found[cid] = {**out, 'mark': max(0.0, min(mx, round(float(out['mark']) * 2) / 2)), 'at': now}
            except AIError as err:
                ai_log(False, str(err))
                return 503, {'error': str(err)}
            except (TypeError, ValueError) as err:
                ai_log(False, f'bad request: {err}')
                return 400, {'error': 'bad request'}
            except Exception as err:  # noqa: BLE001 - shown in the AI log, not hidden
                ai_log(False, f'server error: {type(err).__name__}: {err}')
                return 500, {'error': f'server error: {err}'}
            ai_log(True, ', '.join(f'{k}: {fmt_num(v["mark"])}' for k, v in found.items()) or 'nothing to mark')
            res = jload(self.r(['HGET', P + 'examres:' + eid, sid])[0], {}) or res  # read again: a mark may have changed meanwhile
            if isinstance(data.get('questions'), list):
                res.setdefault('ai', {}).pop(cid, None)  # a quiz is marked per question only
            res.setdefault('ai', {}).update(found)
            self.r(['HSET', P + 'examres:' + eid, sid, json.dumps(res)])
            return 200, {'ok': True, 'ai': found}
        if path == '/api/exam':
            action = data.get('action')
            if action == 'start':
                cls = clean_text(data.get('className'), 20)
                chs = [clean_text(c, 40) for c in data.get('challenges') or [] if SLOT.fullmatch(clean_text(c, 40))]
                minutes = max(1, min(240, int(data.get('minutes') or 30)))
                if not cls or not chs:
                    return 400, {'error': 'choose a class and at least one challenge'}
                now = time.time()
                exam = {'id': 'x%x' % int(now * 1000), 'className': cls, 'title': clean_text(data.get('title'), 80) or 'Exam', 'challenges': chs,
                        'minutes': minutes, 'hints': bool(data.get('hints')), 'startedAt': now, 'endsAt': now + minutes * 60, 'stoppedAt': None}
                ctl = jload(self.r(['HGET', P + 'classctl', cls])[0], {}) or {}
                ctl['exam'] = {**public_exam(exam), 'active': True}
                self.r(['HSET', P + 'exams', exam['id'], json.dumps(exam)], ['HSET', P + 'classctl', cls, json.dumps(ctl)])
                return 200, {'ok': True, 'exam': exam}
            eid = str(data.get('examId', ''))
            exam = jload(self.r(['HGET', P + 'exams', eid])[0])
            if not exam:
                return 404, {'error': 'no such exam'}
            if action == 'curve':
                # the bell curve of the grades out of 7: average grade and spread chosen by the teacher
                mean, sd = float(data.get('mean')), float(data.get('sd'))  # ValueError → 400
                if not (1 <= mean <= 7 and 0 <= sd <= 3):
                    return 400, {'error': 'average 1 to 7, spread 0 to 3'}
                exam['curve'] = {'mean': round(mean, 2), 'sd': round(sd, 2)}
                self.r(['HSET', P + 'exams', eid, json.dumps(exam)])
                return 200, {'ok': True, 'exam': exam}
            if action in ('stop', 'close'):
                if not exam.get('stoppedAt'):
                    exam['stoppedAt'] = min(time.time(), exam['endsAt'])
                ctl = jload(self.r(['HGET', P + 'classctl', exam['className']])[0], {}) or {}
                cmds = [['HSET', P + 'exams', eid, json.dumps(exam)]]
                if (ctl.get('exam') or {}).get('id') == eid:
                    # "stop": the students see the end screen; "close": back to normal work
                    ctl['exam'] = {**public_exam(exam), 'active': False} if action == 'stop' else None
                    cmds.append(['HSET', P + 'classctl', exam['className'], json.dumps(ctl)])
                self.r(*cmds)
                return 200, {'ok': True, 'exam': exam}
            if action == 'share':
                # the correction links of the students (on: false closes them again). The grades out of 7 are those the teacher sees.
                if data.get('on') is False:
                    exam['shared'] = None
                    self.r(['HSET', P + 'exams', eid, json.dumps(exam)])
                    return 200, {'ok': True, 'exam': exam}
                grades = {str(k): int(v) for k, v in (data.get('grades') or {}).items() if ID.fullmatch(str(k)) and v is not None and 1 <= int(v) <= 7}
                exam['shared'] = {'at': time.time(), 'grades': grades}
                results = [x for x in hash_dict(self.r(['HGETALL', P + 'examres:' + eid])[0]).values() if x and x.get('studentId')]
                self.r(['HSET', P + 'exams', eid, json.dumps(exam)])
                return 200, {'ok': True, 'exam': exam, 'links': [{'studentId': x['studentId'], 'name': x.get('name'), 'key': self.corr_token(eid, x['studentId'])} for x in results]}
            if action == 'delete':
                self.r(['HDEL', P + 'exams', eid], ['DEL', P + 'examres:' + eid])
                return 200, {'ok': True}
            return 400, {'error': 'unknown action'}
        if path == '/api/backup/now':
            return 200, {'ok': True, 'date': self.make_backup(force=True)}
        if path == '/api/admin':
            action = data.get('action')
            if action == 'put-work':
                # The teacher changed a student's work (rename, class, unlock, reset): new revision, the student's browser reloads it.
                work = data.get('work') or {}
                sid = str(work.get('studentId', ''))
                st = self.status(sid) if ID.fullmatch(sid) else {'deleted': True}
                if st.get('deleted'):
                    return 400, {'error': 'bad student'}
                rev = st.get('rev', 0) + 1
                work['adminRev'] = rev
                srev = self.teacher_rev(sid, work)
                old = jload(self.r(['HGET', P + 'snap', sid])[0], {}) or {}
                snap = strip_programs(work)
                snap['receivedAt'] = old.get('receivedAt', 0)
                snap['live'] = old.get('live')
                st.update({'rev': rev, 'validated': []})
                self.r(['SET', P + 'work:' + sid, json.dumps(work)], ['HSET', P + 'snap', sid, json.dumps(snap)], ['SET', P + 'st:' + sid, json.dumps(st)], srev)
                return 200, {'ok': True, 'rev': rev}
            if action == 'put-solutions':
                # the answer key, sent by the teacher (never in a public file)
                if not isinstance(data.get('solutions'), dict):
                    return 400, {'error': 'bad answer key'}
                self.r(['SET', P + 'solutions', json.dumps(data['solutions'])])
                return 200, {'ok': True, 'challenges': len(data['solutions'])}
            if action == 'clear-extras':
                # Part of "reset a student": program history, teacher comments, help request.
                sid = str(data.get('studentId', ''))
                if not ID.fullmatch(sid):
                    return 400, {'error': 'bad id'}
                cmds = []
                if data.get('history'):
                    cmds.append(['DEL', P + 'hist:' + sid])
                if data.get('notes'):
                    st = self.status(sid)
                    st['notesRev'] = st.get('notesRev', 0) + 1
                    cmds += [['DEL', P + 'notes:' + sid], ['SET', P + 'st:' + sid, json.dumps(st)]]
                cmds.append(['HDEL', P + 'help', sid])
                self.r(*cmds)
                return 200, {'ok': True}
            if action == 'delete':
                ids = [str(i) for i in data.get('studentIds') or [] if ID.fullmatch(str(i))]
                dest = self.archive('deleted', ids)
                cmds = [c for sid in ids for c in self.remove_cmds(sid)]
                if cmds:
                    self.r(*cmds)
                return 200, {'ok': True, 'archive': dest}
            if action == 'restore':
                works = [w for w in data.get('works') or [] if ID.fullmatch(str(w.get('studentId', ''))) and w.get('type') == 'mb-progress']
                sts = self.r(*[['GET', P + 'st:' + w['studentId']] for w in works]) if works else []
                cmds = []
                for work, raw in zip(works, sts):
                    sid = work['studentId']
                    st = jload(raw, {}) or {}
                    rev = max(st.get('rev', 0), int(work.get('adminRev') or 0)) + 1
                    work['adminRev'] = rev
                    cmds.append(self.teacher_rev(sid, work))
                    snap = strip_programs(work)
                    snap['receivedAt'] = 0
                    cmds += [['SET', P + 'work:' + sid, json.dumps(work)], ['HSET', P + 'snap', sid, json.dumps(snap)], ['SET', P + 'st:' + sid, json.dumps({'rev': rev})]]
                if isinstance(data.get('roster'), dict) and data.get('withRoster'):
                    cmds.append(['SET', P + 'roster', json.dumps(data['roster'])])
                for i in range(0, len(cmds), 60):
                    self.r(*cmds[i:i + 60])
                return 200, {'ok': True, 'restored': len(works)}
            if action == 'wipe':
                # Empty the database: everything goes, except the class lists (names) and the settings (class codes…).
                keys = [k for k in (self.r(['KEYS', P + '*'])[0] or []) if k not in (P + 'roster', P + 'settings')]
                gone = [k[len(P + 'work:'):] for k in keys if k.startswith(P + 'work:')] + list(self.snaps())
                for i in range(0, len(keys), 200):
                    self.r(['DEL', *keys[i:i + 200]])
                marks = [['SET', P + 'st:' + sid, json.dumps({'deleted': True})] for sid in sorted(set(gone)) if ID.fullmatch(sid)]
                for i in range(0, len(marks), 60):
                    self.r(*marks[i:i + 60])
                raw = self.get_json('settings', {}) or {}
                raw['wipedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + '.999Z'
                self.r(['SET', P + 'settings', json.dumps(raw)])
                self._codes_t = 0
                return 200, {'ok': True, 'deleted': len(keys)}
            if action == 'reset-all':
                dest = self.archive('reset')
                cmds = [c for sid in self.snaps() for c in self.remove_cmds(sid)] + [['DEL', P + 'help']]
                for i in range(0, len(cmds), 60):
                    self.r(*cmds[i:i + 60])
                return 200, {'ok': True, 'archive': dest}
            return 400, {'error': 'unknown action'}
        return 404, {'error': 'not found'}

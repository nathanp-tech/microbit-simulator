#!/usr/bin/env python3
"""API test: runs every endpoint against a running server (class server or Vercel-like test server).

    python3 tests/apitest.py http://localhost:8765 [teacher password]

Uses its own student ids (prefix "apitest-") and removes them at the end. Do not run it against the class data:
use MB_DATA_DIR (server.py) or tests/vercel_local.py.
"""
import json, sys, time, urllib.error, urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765').rstrip('/')
CODE = sys.argv[2] if len(sys.argv) > 2 else '123456'
fails = 0


CODES = {}  # class codes, read from the server below (one per class)


def call(method, path, body=None, teacher=False, code=None, klass=None, cls='Tech5ENe'):
    headers = {'Content-Type': 'application/json'}
    if teacher:
        headers['X-Teacher-Code'] = code or CODE
    else:
        headers['X-Class-Code'] = CODES.get(cls, '') if klass is None else klass
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def check(ok, label, detail=''):
    global fails
    fails += 0 if ok else 1
    print(('OK   ' if ok else 'FAIL ') + label + (f'  [{detail}]' if not ok or detail else ''))


A, B = 'apitest-a%x' % int(time.time() * 1000), 'apitest-b%x' % int(time.time() * 1000)
work = lambda sid, name, cls, rev=0, **kw: {'type': 'mb-progress', 'studentId': sid, 'name': name, 'className': cls, 'adminRev': rev,
                                            'mode': 'guided', 'challenges': {'c1': {'status': 'open', 'program': {'p': 1}}}, 'free': {}, 'events': [], **kw}

s, r = call('GET', '/api/ping'); check(s == 200, 'ping')
s, info = call('GET', '/api/info')
TRUSTED = not info.get('needsCode')  # class server opened on its own computer: no password asked
s, tinfo = call('GET', '/api/info', teacher=True)
CODES = tinfo.get('classCodes') or {}
CLASS = CODES.get('Tech5ENe', '')


def denied(status, label):
    if not TRUSTED:
        check(status in (401, 403), label)


# class code: strangers get nothing (names, work, saving)
if CLASS and not TRUSTED:
    check(info.get('studentCodeRequired') and 'classCodes' not in info, 'class codes required, not revealed to students')
    check(len(set(CODES.values())) == len(CODES) >= 2, 'one different code per class', CODES)
    s, r = call('GET', '/api/join'); check(r.get('className') == 'Tech5ENe', 'the Tech5ENe code opens Tech5ENe', r)
    s, r = call('GET', '/api/roster'); check(list(r['roster']) == ['Tech5ENe'], 'with the Tech5ENe code, only the Tech5ENe list', list(r.get('roster', {})))
    s, r = call('POST', '/api/work', {'studentId': 'apitest-x1', 'name': 'x', 'className': 'Tech5ENd', 'type': 'mb-progress'}); check(s == 403, 'the Tech5ENe code cannot save in Tech5ENd')
    for path in ('/api/roster', '/api/work/find?name=a', '/api/classctl'):
        s, r = call('GET', path, klass=''); check(s == 401, 'no code: ' + path + ' refused')
    s, r = call('GET', '/api/roster', klass='wrong'); check(s == 401, 'wrong code refused')
    s, r = call('POST', '/api/work', {'studentId': 'apitest-zzzz', 'name': 'x'}, klass=''); check(s == 401, 'no code: saving refused')
    s, r = call('GET', '/api/join'); check(r.get('ok'), 'right code accepted')
    s, r = call('GET', '/api/settings', klass=''); check('studentCode' not in r, 'public settings do not show the code')


s, r = call('POST', '/api/work', work(A, 'Adriana', 'Tech5ENe')); check(s == 200 and r.get('rev') == 0 and r.get('savedRev') == 1, 'student saves', r)
s, r = call('POST', '/api/work', work(B, 'Adriana', 'Tech5ENd'), cls='Tech5ENd'); check(s == 200, 'second student with the same name, other class')
s, r = call('GET', '/api/work/find?name=adriana&className=Tech5ENe'); check([m['studentId'] for m in r['matches']] == [A], 'find by class + name', r)
s, r = call('GET', '/api/progress'); denied(s, 'dashboard needs the password')
s, r = call('GET', '/api/progress', teacher=True, code='wrong'); denied(s, 'wrong password refused')
s, r = call('GET', '/api/progress', teacher=True); check(s == 200 and {A, B} <= {x['studentId'] for x in r['students']}, 'dashboard lists students')
check('program' not in json.dumps([x for x in r['students'] if x['studentId'] == A]), 'snapshots carry no programs')

# 1. help
s, r = call('POST', '/api/help', {'studentId': A, 'on': True, 'name': 'Adriana', 'className': 'Tech5ENe', 'where': 'Challenge 3'}); check(s == 200, 'help request')
s, r = call('GET', '/api/help/queue?studentId=' + A + '&className=Tech5ENe'); check(s == 200 and any(q.get('me') and q.get('name') == 'Adriana' for q in r.get('queue', [])) and all('studentId' not in q for q in r['queue']), 'the student sees the help waiting list (no ids)', r)
s, r = call('GET', '/api/progress', teacher=True); check(any(h['studentId'] == A for h in r['help']), 'help request in the queue')
s, r = call('POST', '/api/help', {'studentId': A, 'on': False, 'by': 'teacher'}, teacher=True); check(s == 200, 'teacher marks help done')
s, r = call('GET', '/api/student/' + A + '?className=Tech5ENe'); check(r.get('helpDone', 0) > 0, 'student sees help done', r)
s, r = call('GET', '/api/progress', teacher=True); check(not any(h['studentId'] == A for h in r['help']), 'queue emptied')

# 3. roster (the class lists in place are put back at the end)
s, r = call('GET', '/api/roster', teacher=True); saved_roster = r.get('roster') or {}
s, r = call('POST', '/api/roster', {'roster': {'4A': ['Frederik', ' Amiri '], '4C': ['Nina']}}); denied(s, 'roster change needs the password')
s, r = call('POST', '/api/roster', {'roster': {'4A': ['Frederik', ' Amiri '], '4C': ['Nina']}}, teacher=True); check(s == 200, 'roster saved')
s, r = call('GET', '/api/roster', teacher=True); check(r['roster'] == {'4A': ['Frederik', 'Amiri'], '4C': ['Nina']}, 'roster saved (cleaned)', r)

# 5. history
for i in range(30):
    call('POST', '/api/history', {'studentId': A, 'slot': 'c1', 'kind': 'run', 'program': {'v': i}})
s, r = call('GET', '/api/history/' + A + '/c1'); denied(s, 'history needs the password')
s, r = call('GET', '/api/history/' + A + '/c1', teacher=True); check(len(r['versions']) == 25 and r['versions'][-1]['program'] == {'v': 29}, 'history keeps the last 25 versions', len(r.get('versions', [])))

# 6. notes
s, r = call('POST', '/api/notes', {'studentId': A, 'action': 'add', 'slot': 'c1', 'blockId': 'blk1', 'text': 'Why 3 rotations?'}); denied(s, 'notes: student cannot add')
s, r = call('POST', '/api/notes', {'studentId': A, 'action': 'add', 'slot': 'c1', 'blockId': 'blk1', 'text': 'Why 3 rotations?'}, teacher=True); check(s == 200, 'teacher adds a note')
nid = r['notes'][-1]['id']
s, r = call('GET', '/api/student/' + A + '?className=Tech5ENe'); check(r['notesRev'] >= 1, 'student sees notesRev')
s, r = call('POST', '/api/notes', {'studentId': A, 'action': 'done', 'noteId': nid}); check(s == 200 and r['notes'][-1]['done'], 'student marks the note as read')
s, r = call('GET', '/api/notes/' + A); check(r['notes'][-1]['done'], 'note state saved')

# 7. class controls
s, r = call('POST', '/api/classctl', {'classes': ['Tech5ENe'], 'message': 'Look at the board', 'paused': True}, teacher=True); check(s == 200, 'message + pause')
s, r = call('GET', '/api/student/' + A + '?className=Tech5ENe'); c = r['classctl']; check(c.get('paused') and c['message']['text'] == 'Look at the board', 'student gets message + pause', c)
s, r = call('GET', '/api/student/' + B + '?className=Tech5ENd', cls='Tech5ENd'); check(not r['classctl'].get('paused'), 'other class not paused')
s, r = call('POST', '/api/classctl', {'classes': ['Tech5ENe'], 'paused': False, 'closed': True}, teacher=True)
s, r = call('GET', '/api/classctl'); check(r['classes']['Tech5ENe']['closed'] and not r['classes']['Tech5ENe']['paused'], 'welcome page sees the closed class', r)
call('POST', '/api/classctl', {'classes': ['Tech5ENe'], 'closed': False, 'message': ''}, teacher=True)

# 4. exam
s, r = call('POST', '/api/exam', {'action': 'start', 'className': 'Tech5ENe', 'challenges': ['c1', 'c2'], 'minutes': 20, 'hints': False, 'title': 'Test'}, teacher=True)
check(s == 200, 'exam started'); eid = r['exam']['id']
s, r = call('GET', '/api/student/' + A + '?className=Tech5ENe'); ex = r['classctl'].get('exam') or {}; check(ex.get('active') and ex.get('id') == eid, 'student sees the exam')
s, r = call('POST', '/api/exam/result', {'studentId': A, 'examId': eid, 'challengeId': 'c1', 'score': 60, 'program': {'a': 1}}); check(r.get('best') == 60, 'exam result')
s, r = call('POST', '/api/exam/result', {'studentId': A, 'examId': eid, 'challengeId': 'c1', 'score': 40, 'program': {'a': 2}}); check(r.get('best') == 60, 'best score kept')
s, r = call('POST', '/api/exam/result', {'studentId': A, 'examId': eid, 'challengeId': 'c9', 'score': 100}); check(s == 404, 'challenge outside the exam refused')
s, r = call('GET', '/api/exam/results?examId=' + eid, teacher=True)
res = r['results'][0]['challenges']['c1']; check(res['score'] == 60 and res['program'] == {'a': 1} and res['checks'] == 2, 'results: best score, its program, number of checks', res)
s, r = call('POST', '/api/exam', {'action': 'stop', 'examId': eid}, teacher=True); check(s == 200 and r['exam']['stoppedAt'], 'exam stopped')
s, r = call('GET', '/api/student/' + A + '?className=Tech5ENe'); check(r['classctl']['exam'] and not r['classctl']['exam']['active'], 'students see the end of the exam')
s, r = call('POST', '/api/exam', {'action': 'close', 'examId': eid}, teacher=True)
s, r = call('GET', '/api/student/' + A + '?className=Tech5ENe'); check(not r['classctl'].get('exam'), 'exam closed: back to normal')
s, r = call('GET', '/api/exams', teacher=True); check(any(e['id'] == eid for e in r['exams']), 'exam list')
call('POST', '/api/exam', {'action': 'delete', 'examId': eid}, teacher=True)

# validation, teacher edit, conflicts
s, r = call('POST', '/api/validate', {'studentId': A, 'challengeId': 'c2'}, teacher=True)
s, r = call('GET', '/api/student/' + A); check(r['validated'] == ['c2'], 'unlock next')
s, r = call('POST', '/api/admin', {'action': 'put-work', 'work': work(A, 'Adriana', 'Tech5ENe', saveRev=1)}, teacher=True); check(r.get('rev') == 1, 'teacher edits the work')
s, r = call('POST', '/api/work', work(A, 'Adriana', 'Tech5ENe', rev=0, saveRev=1)); check(s == 409, 'old version refused (409)')
s, w = call('GET', '/api/work/' + A); check(w.get('saveRev') == 2 and w.get('adminRev') == 1, 'the teacher\'s version is the newest one', w.get('saveRev'))
s, r = call('POST', '/api/work', work(A, 'Adriana', 'Tech5ENe', rev=1, saveRev=2)); check(s == 200 and r.get('savedRev') == 3, 'new version accepted', r)
s, r = call('POST', '/api/work', work(A, 'Adriana', 'Tech5ENe', rev=1, saveRev=2)); check(s == 409 and r.get('stale'), 'a stale copy (old tab, old file) cannot erase newer work (409)', r)

# 10. backups, 11. stats
s, r = call('POST', '/api/backup/now', {}, teacher=True); check(s == 200 and r.get('date'), 'backup now')
s, r = call('GET', '/api/backups', teacher=True); check(r['backups'] and r['backups'][0]['students'] >= 2, 'backup list', r)
s, r = call('GET', '/api/admin/backup?date=' + r['backups'][0]['date'], teacher=True); check(any(w['studentId'] == A for w in r['works']), 'download a daily backup')
s, r = call('GET', '/api/stats', teacher=True); check(s == 200 and 'monthTotal' in r, 'database stats', r)

# sync: one call, status only when the teacher changed something, presence
s, r = call('POST', '/api/sync', {'studentId': A, 'className': 'Tech5ENe', 'ver': None, 'live': {'status': 'editing'}})
check(s == 200 and r.get('changed') and 'rev' in r, 'first sync gets the status', r)
v1 = r.get('ver')
s, r = call('POST', '/api/sync', {'studentId': A, 'className': 'Tech5ENe', 'ver': v1, 'live': {'status': 'running'}})
check(s == 200 and not r.get('changed'), 'same version: nothing to read again')
s, r = call('GET', '/api/progress', teacher=True); me = [x for x in r['students'] if x['studentId'] == A][0]
check((me.get('live') or {}).get('status') == 'running', 'presence seen by the teacher', me.get('live'))
call('POST', '/api/validate', {'studentId': A, 'challengeId': 'c3'}, teacher=True)
s, r = call('POST', '/api/sync', {'studentId': A, 'className': 'Tech5ENe', 'ver': v1}); check(r.get('changed') and 'c3' in r.get('validated', []), 'teacher action: new version, status sent', r)
s, r = call('POST', '/api/sync', {'studentId': A, 'className': 'Tech5ENe', 'ver': r.get('ver'), 'work': work(A, 'Adriana', 'Tech5ENe', rev=1, saveRev=3), 'live': {'status': 'editing'}}); check(s == 200 and r.get('savedAt') and r.get('savedRev') == 4, 'sync saves the work', r)
if not TRUSTED:
    s, r = call('POST', '/api/sync', {'studentId': A, 'className': 'Tech5ENd', 'ver': None, 'work': work(A, 'Adriana', 'Tech5ENd', rev=1)}); check(s == 403, 'sync: the Tech5ENe code cannot save in Tech5ENd')

# delete
s, r = call('POST', '/api/admin', {'action': 'delete', 'studentIds': [A, B]}, teacher=True); check(s == 200, 'delete the test students')
s, r = call('POST', '/api/work', work(A, 'Adriana', 'Tech5ENe', rev=5)); check(s == 410, 'deleted student cannot come back (410)')
s, r = call('GET', '/api/history/' + A + '/c1', teacher=True); check(r['versions'] == [], 'history deleted with the student')

# empty the database (only on a test server: it deletes everything but the class lists and settings)
if '--wipe' in sys.argv:
    C = 'apitest-c%x' % int(time.time() * 1000)
    old = work(C, 'Frederik', 'Tech5ENe'); old['createdAt'] = '2020-01-01T00:00:00.000Z'
    call('POST', '/api/work', old)
    s, r = call('GET', '/api/roster', teacher=True); before = r['roster']
    s, r = call('POST', '/api/admin', {'action': 'wipe'}, teacher=True); check(s == 200 and r['deleted'] > 0, 'database emptied', r)
    s, r = call('GET', '/api/progress', teacher=True); check(r['students'] == [], 'no student left')
    s, r = call('GET', '/api/roster', teacher=True); check(r['roster'] == before, 'class lists kept')
    s, t2 = call('GET', '/api/info', teacher=True); check(t2.get('classCodes', {}).get('Tech5ENe') == CODES.get('Tech5ENe'), 'class codes kept')
    s, r = call('POST', '/api/work', old); check(s == 410, 'a browser with old work is sent back to the welcome page (410)')
    D = 'apitest-d%x' % int(time.time() * 1000)
    late = work(D, 'Frederik', 'Tech5ENe'); late['createdAt'] = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(time.time() - 600)) + '.000Z'  # clock 10 min late
    s, r = call('POST', '/api/work', late); check(s == 200, 'a new student after the wipe is accepted even with a late clock', r)
    call('POST', '/api/admin', {'action': 'delete', 'studentIds': [D]}, teacher=True)
call('POST', '/api/roster', {'roster': saved_roster}, teacher=True)

print(f'\n{"RESULT: ALL OK" if not fails else f"RESULT: {fails} FAILURE(S)"}')
sys.exit(1 if fails else 0)

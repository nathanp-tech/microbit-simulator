#!/usr/bin/env python3
"""Runs the MicroPython of every reference solution (made by js/pygen.js) on an imitation of the micro:bit,
with lib/microbit/mbrt.py, and checks what the board shows.

    python3 tests/run_python.py programs.json

programs.json: the "MicroPython of the reference solutions" block of tests/selftest.html.
"""
import json, os, random, sys, types

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


class Stop(Exception):
    pass


def make_board(script, limit):
    """script: {time ms: action} ; returns (modules, state)."""
    st = {'t': 0, 'buttons': {'A': False, 'B': False}, 'light': 128, 'temp': 21, 'heading': 90, 'gestures': [],
          'cur': 'face up', 'shown': [], 'pixels': [[0] * 5 for _ in range(5)], 'radio_out': []}
    todo = sorted(script.items())
    while todo and todo[0][0] <= 0:  # the starting state (temperature, light…)
        todo.pop(0)[1](st)

    def advance(ms):
        end = st['t'] + max(0, ms)
        while todo and todo[0][0] <= end:
            t, act = todo.pop(0)
            st['t'] = max(st['t'], t)
            act(st)
        st['t'] = end
        if st['t'] > limit:
            raise Stop()

    mb = types.ModuleType('microbit')
    mb.running_time = lambda: st['t']
    mb.sleep = lambda ms: advance(ms)

    class Image:
        def __init__(self, s='00000:00000:00000:00000:00000', rows=None):
            self.rows = rows or [[int(c) for c in r] for r in s.split(':')]

        def width(self):
            return len(self.rows[0])

        def shift_left(self, n):
            return Image(rows=[[r[x + n] if 0 <= x + n < len(r) else 0 for x in range(len(r))] for r in self.rows])

        def crop(self, x, y, w, h):
            return Image(rows=[[self.rows[yy][xx] if xx < len(self.rows[0]) else 0 for xx in range(x, x + w)] for yy in range(y, y + h)])

        def key(self):
            return ':'.join(''.join('9' if v else '0' for v in r) for r in self.rows)
    mb.Image = Image

    class Display:
        def show(self, x, *a, **k):
            if isinstance(x, Image):
                st['pixels'] = [[min(9, v) for v in r[:5]] for r in x.rows]
                st['shown'].append((st['t'], 'image', x.key()))
            else:
                st['shown'].append((st['t'], 'text', str(x)))

        def scroll(self, text, delay=150, wait=True, **k):
            st['shown'].append((st['t'], 'text', str(text)))
            st['pixels'] = [[0] * 5 for _ in range(5)]

        def clear(self):
            st['pixels'] = [[0] * 5 for _ in range(5)]

        def set_pixel(self, x, y, v):
            st['pixels'][y][x] = v

        def get_pixel(self, x, y):
            return st['pixels'][y][x]

        def read_light_level(self):
            return st['light']

        def on(self):
            pass

        def off(self):
            pass
    mb.display = Display()

    class Button:
        def __init__(self, n):
            self.n = n

        def is_pressed(self):
            return st['buttons'][self.n]
    mb.button_a, mb.button_b = Button('A'), Button('B')

    class Acc:
        def get_gestures(self):
            g, st['gestures'] = tuple(st['gestures']), []
            return g

        def current_gesture(self):
            return st['cur']

        def was_gesture(self, g):
            return False

        def get_x(self):
            return 0
        get_y = get_x

        def get_z(self):
            return -1023

        def get_values(self):
            return (0, 0, -1023)
    mb.accelerometer = Acc()

    class Compass:
        def heading(self):
            return st['heading']

        def calibrate(self):
            pass
    mb.compass = Compass()
    mb.temperature = lambda: st['temp']

    class Pin:
        def is_touched(self):
            return False

        def read_digital(self):
            return 0

        def write_digital(self, v):
            pass

        def read_analog(self):
            return 0

        def write_analog(self, v):
            pass
    mb.pin0 = mb.pin1 = mb.pin2 = mb.pin_logo = Pin()

    def reset():
        raise Stop()
    mb.reset = reset

    music = types.ModuleType('music')
    music.pitch = lambda *a, **k: None
    music.stop = lambda *a, **k: None
    radio = types.ModuleType('radio')
    radio.on = lambda: None
    radio.config = lambda **k: None
    radio.send = lambda m: st['radio_out'].append(m)
    radio.receive = lambda: None
    return {'microbit': mb, 'music': music, 'radio': radio}, st


def run(main, script, limit=20000, seed=1):
    random.seed(seed)
    mods, st = make_board(script, limit)
    for k in list(sys.modules):
        if k in ('mbrt',):
            del sys.modules[k]
    sys.modules.update(mods)
    mbrt = types.ModuleType('mbrt')
    mbrt.__dict__['print'] = lambda *a, **k: None  # the serial port
    exec(compile(open(os.path.join(ROOT, 'lib', 'microbit', 'mbrt.py')).read(), 'mbrt.py', 'exec'), mbrt.__dict__)
    sys.modules['mbrt'] = mbrt
    try:
        exec(compile(main, 'main.py', 'exec'), {'__name__': '__main__', 'print': lambda *a, **k: None})
    except Stop:
        pass
    return st


# ---- actions ----
def press(b, ms=100):
    def down(st):
        if b == 'AB':
            st['buttons'].update(A=True, B=True)
        else:
            st['buttons'][b] = True
    return down, ms, b


def script_of(*items):
    """items: (time, action) where action is 'A' / 'B' / 'AB' (click), ('shake',), ('light', v), ('temp', v)."""
    sc = {}
    for t, a in items:
        if a in ('A', 'B', 'AB'):
            keys = ['A', 'B'] if a == 'AB' else [a]
            sc[t] = (lambda keys: lambda st: [st['buttons'].__setitem__(k, True) for k in keys])(keys)
            sc[t + 100] = (lambda keys: lambda st: [st['buttons'].__setitem__(k, False) for k in keys])(keys)
        elif a[0] == 'gesture':
            sc[t] = (lambda g: lambda st: st['gestures'].append(g))(a[1])
        elif a[0] == 'light':
            sc[t] = (lambda v: lambda st: st.__setitem__('light', v))(a[1])
        elif a[0] == 'temp':
            sc[t] = (lambda v: lambda st: st.__setitem__('temp', v))(a[1])
    return sc


ICON = {  # 25 LEDs, from js/mbdata.js
    'Happy': '00000:09090:00000:90009:09990', 'Sad': '00000:09090:00000:09990:90009', 'Heart': '09090:99999:99999:09990:00900',
}
texts = lambda st, t0=0, t1=1e12: [v for t, k, v in st['shown'] if k == 'text' and t0 <= t <= t1]
images = lambda st, t0=0, t1=1e12: [v for t, k, v in st['shown'] if k == 'image' and t0 <= t <= t1]
lit = lambda st: sum(1 for r in st['pixels'] for v in r if v)


def checks(id_, main):
    out = []

    def ok(cond, label):
        out.append((bool(cond), label))
    if id_ == 'mood':
        st = run(main, script_of((1000, 'A'), (3000, 'B'), (5000, 'AB')), 7000)
        ok(ICON['Happy'] in images(st, 1000, 2900), 'A shows the happy face')
        ok(ICON['Sad'] in images(st, 3000, 4900), 'B shows the sad face')
        ok(images(st, 5000) and images(st, 5000)[-1] not in (ICON['Happy'], ICON['Sad']), 'A+B shows another picture')
        st = run(main, script_of((1000, 'A'), (1050, 'B')), 3000)  # A and B pressed together, released one by one
        ok(images(st, 1000) and images(st, 1000)[-1] not in (ICON['Happy'], ICON['Sad']), 'A and B together: the A+B event')
    elif id_ == 'dice':
        st = run(main, script_of(*[(1000 + i * 1500, ('gesture', 'shake')) for i in range(30)]), 47000)
        nums = [int(x) for x in texts(st)]
        ok(len(nums) == 30 and set(nums) <= set(range(1, 7)) and len(set(nums)) >= 5, 'a number from 1 to 6 after every shake %s' % sorted(set(nums)))
    elif id_ == 'rps':
        st = run(main, script_of(*[(1000 + i * 1500, ('gesture', 'shake')) for i in range(30)]), 47000)
        ok(len(images(st)) == 30 and len(set(images(st))) == 3, 'three pictures at random')
    elif id_ in ('step-counter', 'progress-bar'):
        st = run(main, script_of((1000, ('gesture', 'shake')), (1500, ('gesture', 'shake')), (2000, ('gesture', 'shake')), (3000, 'A'), (6000, 'B'), (7000, 'A')), 9000)
        ok(texts(st, 3000, 5900) == ['3'] and texts(st, 7000) == ['0'], 'steps: 3, then 0 after B %s' % texts(st))
        if id_ == 'progress-bar':
            ok(lit(run(main, script_of(*[(500 + i * 300, ('gesture', 'shake')) for i in range(10)]), 5000)) >= 6, 'the bar grows')
    elif id_ == 'night-light':
        st = run(main, script_of((500, ('light', 10))), 2000)
        ok(lit(st) == 25, 'dark: all the LEDs on')
        st = run(main, script_of((500, ('light', 10)), (2000, ('light', 230))), 4000)
        ok(lit(st) == 0, 'light: the LEDs off')
    elif id_ == 'hot-cold':
        for temp, word in ((32, 'HOT'), (8, 'COLD'), (20, 'OK')):
            st = run(main, script_of((0, ('temp', temp))), 6000)
            ok(word in texts(st) and len(set(texts(st))) == 1, '%d °C → %s %s' % (temp, word, set(texts(st))))
    elif id_ == 'sensor-station':
        st = run(main, script_of((0, ('temp', 27)), (1, ('light', 143)), (1000, 'A'), (4000, 'B'), (7000, 'AB')), 10000)
        ok(texts(st) == ['27', '143', '90'], 'temperature, light, compass %s' % texts(st))
    elif id_ in ('reaction', 'best-score'):
        # A, wait for the heart, B 1100 ms later
        st = run(main, script_of((1000, 'A')), 12000)
        heart = [t for t, k, v in st['shown'] if k == 'image' and v == ICON['Heart']]
        ok(heart and 1900 <= heart[0] - 1000 <= 9500, 'the heart comes after a random wait')
        if heart:
            t = heart[0] + 1100
            st = run(main, script_of((1000, 'A'), (t, 'B')), t + 5000)
            n = [int(x) for x in texts(st, t)]
            ok(n and (abs(n[0] - 1100) < 150 or abs(n[0] - 500) < 150), 'B shows the reaction time %s' % n)
        st = run(main, script_of((1000, 'A'), (1300, 'B')), 3000)
        ok(ICON['Sad'] in images(st, 1300), 'B too early: sad face')
    else:
        st = run(main, script_of((1000, 'A'), (2000, 'B'), (3000, ('gesture', 'shake'))), 8000)
        ok(st['shown'], 'runs and shows something')
    return out


def main():
    programs = json.load(open(sys.argv[1]))
    fails = 0
    for id_, sols in programs.items():
        for i, p in enumerate(sols):
            if p['unsupported']:
                print('✖ %s #%d: unsupported blocks %s' % (id_, i + 1, p['unsupported']))
                fails += 1
                continue
            try:
                res = checks(id_, p['main'])
            except Exception as e:  # noqa: BLE001
                print('✖ %s #%d crashed: %r' % (id_, i + 1, e))
                print(p['main'])
                fails += 1
                continue
            for good, label in res:
                print('%s %s #%d: %s' % ('✔' if good else '✖', id_, i + 1, label))
                fails += not good
    print('ALL OK' if not fails else '%d FAILURE(S)' % fails)
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()

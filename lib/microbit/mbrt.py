# mbrt: runs the blocks of the micro:bit Simulator on a real micro:bit (MicroPython).
# Like MakeCode: "on start", "forever" loops and event blocks run side by side; a pause (or show...) lets the
# others run. Each block stack is a generator: "yield ms" waits, the scheduler below takes turns.
from microbit import *
import random
try:
    import music
except ImportError:
    music = None

V = {}
_fib = []        # [generator, wake time]
_h = {}          # event -> [function, running, waiting args]
_pins = []
_radio = None
_st = {'A': False, 'B': False, 'ab': False, 'tempo': 120, 'vol': 128, 'pins': {}, 'logo': False, 'last': None}


def _spawn(g):
    _fib.append([g, running_time()])


def start(fn):
    _spawn(fn())


def forever(fn, ms=20):
    def loop():
        while True:
            yield from fn()
            yield ms
    _spawn(loop())


def every(ms, fn):
    forever(fn, ms)


def background(fn):
    _spawn(fn())


def on(key, fn):
    _h[key] = [fn, 0, []]
    if key[:2] == 'p:' and key[2:4] not in _pins:
        _pins.append(key[2:4])


def fire(key, *args):
    h = _h.get(key)
    if not h:
        return
    if h[1]:  # still running: the event waits, like on the micro:bit
        if len(h[2]) < 5:
            h[2].append(args)
        return
    _run(h, args)


def _run(h, args):
    h[1] += 1

    def g():
        try:
            yield from h[0](*args)
        finally:
            h[1] -= 1
            if h[2]:
                _run(h, h[2].pop(0))
    _spawn(g())


# ---------- inputs ----------
def _poll():
    for n, b in (('A', button_a), ('B', button_b)):
        down = b.is_pressed()
        if down and not _st[n]:
            _st[n] = True
        elif not down and _st[n]:
            _st[n] = False
            # A and B together: the "A+B" event, not A or B
            if _st['B' if n == 'A' else 'A']:
                _st['ab'] = True
            elif _st['ab']:
                _st['ab'] = False
                fire('b:AB')
            else:
                fire('b:' + n)
    for g in accelerometer.get_gestures():
        fire('g:' + g)
    for p in _pins:
        t = _pin(p).is_touched()
        if t != _st['pins'].get(p, False):
            _st['pins'][p] = t
            fire('p:' + p + (':down' if t else ':up'))
            if not t:
                fire('p:' + p + ':pressed')
    if 'logo:pressed' in _h or 'logo:down' in _h or 'logo:up' in _h:
        try:
            t = pin_logo.is_touched()
            if t != _st['logo']:
                _st['logo'] = t
                fire('logo:down' if t else 'logo:up')
                if not t:
                    fire('logo:pressed')
        except NameError:
            pass
    if 's:loud' in _h or 's:quiet' in _h:
        try:
            if microphone.was_event(SoundEvent.LOUD):
                fire('s:loud')
            if microphone.was_event(SoundEvent.QUIET):
                fire('s:quiet')
        except NameError:
            pass
    if _radio:
        m = _radio.receive()
        if m:
            _st['last'] = m
            k = m[0]
            if k == 'n':
                fire('r:number', _num(m[1:]))
            elif k == 's':
                fire('r:string', m[1:])
            elif k == 'v':
                i = m.find('\t')
                fire('r:value', m[1:i], _num(m[i + 1:]))


def run():
    while True:
        _poll()
        t = running_time()
        nxt = t + 10
        for f in _fib[:]:
            if f[1] <= t:
                try:
                    d = next(f[0])
                    f[1] = running_time() + (int(d) if d else 0)
                except StopIteration:
                    _fib.remove(f)
                    continue
            if f[1] < nxt:
                nxt = f[1]
        w = nxt - running_time()
        if w > 0:
            sleep(min(w, 10))


def _pin(p):
    return {'P0': pin0, 'P1': pin1, 'P2': pin2}[p]


def button(b):
    if b == 'AB':
        return button_a.is_pressed() and button_b.is_pressed()
    return (button_a if b == 'A' else button_b).is_pressed()


def pin_pressed(p):
    return _pin(p).is_touched()


def logo_pressed():
    try:
        return pin_logo.is_touched()
    except NameError:
        return False


def gesture(g):
    return accelerometer.current_gesture() == g or (g == 'shake' and accelerometer.was_gesture('shake'))


def accel(d):
    if d == 'strength':
        x, y, z = accelerometer.get_values()
        return int((x * x + y * y + z * z) ** 0.5)
    return {'x': accelerometer.get_x, 'y': accelerometer.get_y, 'z': accelerometer.get_z}[d]()


def rotation(k):
    import math
    x, y, z = accelerometer.get_values()
    return int(math.atan2(x if k == 'roll' else y, -z) * 57.29578)


def magnetic(d):
    if d == 'strength':
        return compass.get_field_strength()
    return {'x': compass.get_x, 'y': compass.get_y, 'z': compass.get_z}[d]()


def sound_level():
    try:
        return microphone.sound_level()
    except NameError:
        return 0


# ---------- values ----------
def _num(v):
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, (int, float)):
        return v
    try:
        f = float(v)
        return int(f) if f == int(f) else f
    except (ValueError, TypeError, OverflowError):
        return 0


def num(v):
    return _num(v)


def s(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, float):
        if v == v and v not in (float('inf'), float('-inf')) and v == int(v):
            return str(int(v))
        return str(round(v, 6))
    if isinstance(v, list):
        return ','.join(s(x) for x in v)
    return str(v)


def div(a, b):
    a, b = _num(a), _num(b)
    if b == 0:
        return 0
    r = a / b
    return int(r) if r == int(r) else r


def mod(a, b):
    a, b = _num(a), _num(b)
    if b == 0:
        return 0
    r = a - b * int(a / b)  # the sign of a, like MakeCode
    return int(r) if r == int(r) else r


def cmp(a, op, b):
    if not (isinstance(a, str) and isinstance(b, str)):
        a, b = _num(a), _num(b)
    if op == 'EQ':
        return a == b
    if op == 'NEQ':
        return a != b
    if op == 'LT':
        return a < b
    if op == 'LTE':
        return a <= b
    if op == 'GT':
        return a > b
    return a >= b


def rand(a, b):
    a, b = _num(a), _num(b)
    if a > b:
        a, b = b, a
    if isinstance(a, int) and isinstance(b, int):
        return random.randint(a, b)
    return a + random.random() * (b - a)


def mapv(v, fl, fh, tl, th):
    v, fl, fh, tl, th = _num(v), _num(fl), _num(fh), _num(tl), _num(th)
    return tl if fh == fl else (v - fl) * (th - tl) / (fh - fl) + tl


def constrain(v, lo, hi):
    v, lo, hi = _num(v), _num(lo), _num(hi)
    return max(min(lo, hi), min(max(lo, hi), v))


def mathop(op, x):
    import math
    x = _num(x)
    if op == 'sqrt':
        return math.sqrt(x) if x >= 0 else 0
    if op in ('idiv', 'imul'):
        return int(x)
    if op == 'atan2':
        return math.atan(x)
    return getattr(math, op)(x)


def rnd(op, x):
    import math
    x = _num(x)
    if op == 'round':
        return int(math.floor(x + 0.5))
    if op == 'ceil':
        return int(math.ceil(x))
    if op == 'floor':
        return int(math.floor(x))
    return int(x)


def lst(a):
    if not isinstance(a, list):
        raise ValueError('not an array')
    return a


def get(a, i):
    a, i = lst(a), int(_num(i))
    return a[i] if 0 <= i < len(a) else 0


def put(a, i, v):
    a, i = lst(a), int(_num(i))
    while len(a) <= i:
        a.append(0)
    a[i] = v


def find(a, v):
    try:
        return lst(a).index(v)
    except ValueError:
        return -1


def parse(t):
    return _num(s(t).strip())


# ---------- display ----------
def show_text(t, ms=150):
    if len(t) == 0:
        display.clear()
        yield ms * 5
    elif len(t) == 1:
        display.show(t)
        yield ms * 5
    else:
        display.scroll(t, delay=ms, wait=False)
        yield (len(t) * 6 + 5) * ms


def show_number(n):
    yield from show_text(s(_num(n)))


def show_string(t):
    yield from show_text(s(t))


def show_image(img, ms):
    display.show(img)
    yield ms


def show_offset(img, off):
    display.show(img.shift_left(int(_num(off))).crop(0, 0, 5, 5))
    yield 400


def scroll_image(img, step, ms):
    step = max(1, int(_num(step)))
    for o in range(-5, img.width(), step):
        display.show(img.shift_left(o).crop(0, 0, 5, 5))
        yield _num(ms)
    display.clear()


def plot(x, y, b=255):
    x, y = int(_num(x)), int(_num(y))
    if 0 <= x < 5 and 0 <= y < 5:
        display.set_pixel(x, y, max(0, min(9, (int(_num(b)) * 9 + 254) // 255)))


def unplot(x, y):
    plot(x, y, 0)


def toggle(x, y):
    plot(x, y, 0 if point(x, y) else 255)


def point(x, y):
    return brightness_at(x, y) > 0


def brightness_at(x, y):
    x, y = int(_num(x)), int(_num(y))
    return display.get_pixel(x, y) * 255 // 9 if 0 <= x < 5 and 0 <= y < 5 else 0


def bar_graph(v, high):
    v, high = _num(v), _num(high)
    print(s(v))
    if high <= 0:
        high = max(abs(v), 1)
    v = abs(v * 15 / high)
    k = 0
    for y in range(4, -1, -1):
        for x in range(3):
            b = 9 if k <= v and v > 0 else 0
            display.set_pixel(2 - x, y, b)
            display.set_pixel(2 + x, y, b)
            k += 1


# ---------- music ----------
def beat(b):
    return 60000 / _st['tempo'] * _num(b)


def tone(f, ms, mode='until'):
    f, ms = int(_num(f)), int(_num(ms))
    if mode == 'until':
        if music and _st['vol'] > 0:
            music.pitch(f, ms, wait=False)
        yield ms
        return

    def bg():
        while True:
            if music and _st['vol'] > 0:
                music.pitch(f, ms, wait=False)
            yield ms
            if mode != 'loop':
                return
    _spawn(bg())


def ring(f):
    if music and _st['vol'] > 0:
        music.pitch(int(_num(f)), -1, wait=False)


def rest(ms):
    if music:
        music.stop()
    yield _num(ms)


def melody(notes, tempo, mode='until'):
    def play():
        for f, b in notes:
            ms = int(60000 / _num(tempo) * b)
            if f and music and _st['vol'] > 0:
                music.pitch(f, ms, wait=False)
            elif music:
                music.stop()
            yield ms
    if mode == 'until':
        yield from play()
        return

    def bg():
        while True:
            yield from play()
            if mode != 'loop':
                return
    _spawn(bg())


def stop_sounds():
    if music:
        music.stop()


def set_volume(v):
    _st['vol'] = max(0, min(255, int(_num(v))))
    try:
        import microbit
        microbit.set_volume(_st['vol'])
    except (ImportError, AttributeError):
        pass


def set_tempo(b):
    _st['tempo'] = max(4, _num(b))


def tempo():
    return _st['tempo']


def volume():
    return _st['vol']


# ---------- radio ----------
def use_radio():
    global _radio
    if not _radio:
        import radio
        radio.on()
        _radio = radio
    return _radio


def radio_group(g):
    use_radio().config(group=int(_num(g)) & 255)


def radio_power(p):
    use_radio().config(power=max(0, min(7, int(_num(p)))))


def radio_send(m):
    use_radio().send(m[:250])


def packet(prop):
    return -60 if prop == 'signal' else 0

// micro:bit data: icons, arrows, 5x5 font, notes and melodies (same names as in MakeCode).
'use strict';

// Patterns: 25 characters, row by row, '#' = LED on.
const ICONS = {
  Heart: '.#.#. ##### ##### .###. ..#..',
  SmallHeart: '..... .#.#. .###. ..#.. .....',
  Yes: '..... ....# ...#. #.#.. .#...',
  No: '#...# .#.#. ..#.. .#.#. #...#',
  Happy: '..... .#.#. ..... #...# .###.',
  Sad: '..... .#.#. ..... .###. #...#',
  Confused: '..... .#.#. ..... .#.#. #.#.#',
  Angry: '#...# .#.#. ..... ##### #.#.#',
  Asleep: '..... ##.## ..... .###. .....',
  Surprised: '.#.#. ..... ..#.. .#.#. ..#..',
  Silly: '#...# ..... ##### ..#.# ..###',
  Fabulous: '##### ##.## ..... .#.#. .###.',
  Meh: '.#.#. ..... ...#. ..#.. .#...',
  TShirt: '##.## ##### .###. .###. .###.',
  Rollerskate: '...## ...## ##### ##### .#.#.',
  Duck: '.##.. ###.. .#### .###. .....',
  House: '..#.. .###. ##### .###. .#.#.',
  Tortoise: '..... .###. ##### .#.#. .....',
  Butterfly: '##.## ##### ..#.. ##### ##.##',
  StickFigure: '..#.. ##### ..#.. .#.#. #...#',
  Ghost: '##### #.#.# ##### ##### #.#.#',
  Sword: '..#.. ..#.. ..#.. .###. ..#..',
  Giraffe: '##... .#... .#... .###. .#.#.',
  Skull: '.###. #.#.# ##### .###. .###.',
  Umbrella: '.###. ##### ..#.. #.#.. .##..',
  Snake: '##... ##.## .#.#. .###. .....',
  Rabbit: '#.#.. #.#.. ####. ##.#. ####.',
  Cow: '#...# #...# ##### .###. ..#..',
  QuarterNote: '..#.. ..#.. ..#.. ###.. ###..',
  EigthNote: '..#.. ..##. ..#.# ###.. ###..',
  Pitchfork: '#.#.# #.#.# ##### ..#.. ..#..',
  Target: '..#.. .###. ##.## .###. ..#..',
  Triangle: '..... ..#.. .#.#. ##### .....',
  LeftTriangle: '#.... ##... #.#.. #..#. #####',
  Chessboard: '.#.#. #.#.# .#.#. #.#.# .#.#.',
  Diamond: '..#.. .#.#. #...# .#.#. ..#..',
  SmallDiamond: '..... ..#.. .#.#. ..#.. .....',
  Square: '##### #...# #...# #...# #####',
  SmallSquare: '..... .###. .#.#. .###. .....',
  Scissors: '##..# ##.#. ..#.. ##.#. ##..#',
};
// Names shown in the icon menu (MakeCode order)
const ICON_ORDER = Object.keys(ICONS);
const ICON_LABEL = { TShirt: 'T-shirt', StickFigure: 'stick figure', SmallHeart: 'small heart', QuarterNote: 'quarter note', EigthNote: 'eighth note', LeftTriangle: 'left triangle', SmallDiamond: 'small diamond', SmallSquare: 'small square' };
const iconLabel = (n) => ICON_LABEL[n] || n.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

const ARROWS = {
  North: '..#.. .###. #.#.# ..#.. ..#..',
  NorthEast: '..### ...## ..#.# .#... #....',
  East: '..#.. ...#. ##### ...#. ..#..',
  SouthEast: '#.... .#... ..#.# ...## ..###',
  South: '..#.. ..#.. #.#.# .###. ..#..',
  SouthWest: '....# ...#. #.#.. ##... ###..',
  West: '..#.. .#... ##### .#... ..#..',
  NorthWest: '###.. ##... #.#.. ...#. ....#',
};
const ARROW_ORDER = Object.keys(ARROWS);

const patternToArray = (p) => p.replace(/\s/g, '').split('').map((c) => (c === '#' ? 255 : 0));

// 5x5 font: each character is 5 columns wide; scrolling text uses 6 columns per character.
const FONT_SRC = `
 ..... ..... ..... ..... .....
! ..#.. ..#.. ..#.. ..... ..#..
" .#.#. .#.#. ..... ..... .....
# .#.#. ##### .#.#. ##### .#.#.
$ .###. ##... .###. ...## .###.
% ##..# #..#. ..#.. .#..# #..##
& .##.. #..#. .##.. #..#. .##.#
' ..#.. ..#.. ..... ..... .....
( ...#. ..#.. ..#.. ..#.. ...#.
) .#... ..#.. ..#.. ..#.. .#...
* ..... .#.#. ..#.. .#.#. .....
+ ..... ..#.. .###. ..#.. .....
, ..... ..... ..... ..#.. .#...
- ..... ..... .###. ..... .....
. ..... ..... ..... ..... ..#..
/ ....# ...#. ..#.. .#... #....
0 .##.. #..#. #..#. #..#. .##..
1 ..#.. .##.. ..#.. ..#.. .###.
2 ###.. ...#. .##.. #.... ####.
3 ####. ...#. ..#.. #..#. .##..
4 ..##. .#.#. #..#. ##### ...#.
5 ####. #.... ###.. ...#. ###..
6 ...#. ..#.. .###. #...# .###.
7 ##### ...#. ..#.. .#... #....
8 .###. #...# .###. #...# .###.
9 .###. #...# .###. ..#.. .#...
: ..... .#... ..... .#... .....
; ..... ..#.. ..... ..#.. .#...
< ...#. ..#.. .#... ..#.. ...#.
= ..... .###. ..... .###. .....
> .#... ..#.. ...#. ..#.. .#...
? .###. ....# ..##. ..... ..#..
@ .##.. #..#. #.#.# #..## .##..
A .##.. #..#. ####. #..#. #..#.
B ###.. #..#. ###.. #..#. ###..
C .###. #.... #.... #.... .###.
D ###.. #..#. #..#. #..#. ###..
E ####. #.... ###.. #.... ####.
F ####. #.... ###.. #.... #....
G .###. #.... #..## #...# .###.
H #..#. #..#. ####. #..#. #..#.
I ###.. .#... .#... .#... ###..
J ####. ...#. ...#. #..#. .##..
K #..#. #.#.. ##... #.#.. #..#.
L #.... #.... #.... #.... ####.
M #...# ##.## #.#.# #...# #...#
N #...# ##..# #.#.# #..## #...#
O .##.. #..#. #..#. #..#. .##..
P ###.. #..#. ###.. #.... #....
Q .##.. #..#. #..#. .##.. ...##
R ###.. #..#. ###.. #.#.. #..#.
S .###. #.... .##.. ...#. ###..
T ##### ..#.. ..#.. ..#.. ..#..
U #..#. #..#. #..#. #..#. .##..
V #...# #...# #...# .#.#. ..#..
W #...# #...# #.#.# ##.## #...#
X #..#. #..#. .##.. #..#. #..#.
Y #...# .#.#. ..#.. ..#.. ..#..
Z ####. ..#.. .#... #.... ####.
[ .###. .#... .#... .#... .###.
\\ #.... .#... ..#.. ...#. ....#
] .###. ...#. ...#. ...#. .###.
^ ..#.. .#.#. ..... ..... .....
_ ..... ..... ..... ..... #####
\` .#... ..#.. ..... ..... .....
a ..... .###. #..#. #..#. .####
b #.... #.... ###.. #..#. ###..
c ..... .###. #.... #.... .###.
d ...#. ...#. .###. #..#. .###.
e .##.. #..#. ####. #.... .###.
f ..##. .#... ###.. .#... .#...
g .###. #..#. .###. ...#. .##..
h #.... #.... ###.. #..#. #..#.
i .#... ..... .#... .#... .#...
j ...#. ..... ...#. #..#. .##..
k #.... #.#.. ##... #.#.. #..#.
l .#... .#... .#... .#... ..##.
m ..... ##.#. #.#.# #.#.# #...#
n ..... ###.. #..#. #..#. #..#.
o ..... .##.. #..#. #..#. .##..
p ..... ###.. #..#. ###.. #....
q ..... .###. #..#. .###. ...#.
r ..... .###. #.... #.... #....
s ..... ..##. .#... ..#.. ##...
t .#... ####. .#... .#... ..##.
u ..... #..#. #..#. #..#. .###.
v ..... #...# #...# .#.#. ..#..
w ..... #...# #.#.# #.#.# .#.#.
x ..... #..#. .##.. .##.. #..#.
y ..... #...# .#.#. ..#.. ##...
z ..... ####. ..#.. .#... ####.
{ ..##. ..#.. .##.. ..#.. ..##.
| ..#.. ..#.. ..#.. ..#.. ..#..
} .##.. ..#.. ..##. ..#.. .##..
~ ..... ..... .##.# #.##. .....`;
const FONT = {};
for (const line of FONT_SRC.split('\n')) {
  if (line.length < 30) continue;
  const ch = line[0] === '\\' ? '\\' : line[0];
  const rows = line.slice(line[0] === '\\' ? 3 : 2).trim().split(/\s+/);
  if (rows.length === 5) FONT[ch] = rows.map((r) => r.split('').map((c) => c === '#'));
}
FONT[' '] = [0, 1, 2, 3, 4].map(() => [false, false, false, false, false]);
const glyph = (ch) => FONT[ch] || FONT['?'];

// ---------- Music ----------
// Note names as in MakeCode (Middle C = C4 = 262 Hz)
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const noteFreq = (name, octave) => Math.round(440 * Math.pow(2, (NOTE_NAMES.indexOf(name) - 9) / 12 + (octave - 4)));
// The piano of the note picker: from Low C (C3) to High B (B5)
const PIANO_NOTES = [];
for (let o = 3; o <= 5; o++) for (const n of NOTE_NAMES) PIANO_NOTES.push({ name: n, octave: o, freq: noteFreq(n, o) });
function noteLabel(freq) {
  const n = PIANO_NOTES.find((p) => p.freq === Number(freq));
  if (!n) return String(freq);
  const pre = n.octave === 3 ? 'Low ' : n.octave === 5 ? 'High ' : 'Middle ';
  return pre + n.name;
}
const BEATS = [['1', 1], ['1/2', 0.5], ['1/4', 0.25], ['1/8', 0.125], ['1/16', 0.0625], ['2', 2], ['4', 4]];

// Built-in melodies (music.builtInMelody), as note strings: NOTE[octave][:duration in ticks of 1/4 beat]
const MELODIES = {
  dadadadum: 'r4:2 g g g eb:8 r:2 f f f d:8',
  entertainer: 'd4:1 d# e c5:2 e4:1 c5:2 e4:1 c5:3 c:1 d d# e c d e:2 b4:1 d5:2 c:4',
  prelude: 'c4:1 e g c5 e g4 c5 e c4 e g c5 e g4 c5 e c4 d a d5 f a4 d5 f c4 d a d5 f a4 d5 f',
  ode: 'e4 e f g g f e d c c d e e:6 d:2 d:8 e:4 e f g g f e d c c d e d:6 c:2 c:8',
  nyan: 'f#5:2 g# c#:1 d#:2 b4:1 d5:1 c# b4:2 b c#5 d d:1 c# b4:1 c#5:1 d# f# g# d# f# c# d b4 c#5 b4 d#5:2 f# g#:1 d# f# c# d# b4 d5 d# d c# b4 c#5 d:2 b4:1 c#5 d# f# c# d c# b4 c#5:2 b4 c#5 b4 f#:1 g# b:2 f#:1 g# b c#5 d# b4 e5 d# e f# b4:2 b f#:1 g# b f# e5 d# c# b4 f# d# e f# b:2 f#:1 g# b:2 f#:1 g# b b c#5 d# b4 f# g# f# b:2 b:1 a# b f# g# b e5 d# e f# b4:2 c#5',
  ringtone: 'c4:1 d e:2 g d:1 e f:2 a e:1 f g:2 b c5:4',
  funk: 'c2:2 c d# c:1 f:2 c:1 f:2 f# g c c g c:1 f#:2 c:1 f#:2 f d#',
  blues: 'c2:2 e g a a# a g e c2:2 e g a a# a g e f a c3 d d# d c a2 c2:2 e g a a# a g e g b d3 f f2 a c3 d# c2:2 e g e g f e d',
  birthday: 'c4:3 c:1 d:4 c:4 f e:8 c:3 c:1 d:4 c:4 g f:8 c:3 c:1 c5:4 a4 f e d a#:3 a#:1 a:4 f g f:8',
  wedding: 'c4:4 f:3 f:1 f:8 c:4 g:3 e:1 f:8 c:4 f:3 a:1 c5:4 a4:3 f:1 f:4 e:3 f:1 g:8',
  funeral: 'c3:4 c:3 c:1 c:4 d#:3 d:1 d:3 c:1 c:3 b2:1 c3:4',
  punchline: 'c4:3 g3:1 f# g g#:3 g r b c4',
  baddy: 'c3:3 r d:2 d# r c r f#:8',
  chase: 'a4:1 b c5 b4 a:2 r a:1 b c5 b4 a:2 r a:2 e5 d# e f e d# e b4:1 c5 d c b4:2 r b:1 c5 d c b4:2 r b:2 e5 d# e f e d# e',
  baDing: 'b5:1 e6:3',
  wawawawaa: 'e3:3 r:1 d#:3 r:1 d:4 r:1 c#:8',
  jumpUp: 'c5:1 d e f g',
  jumpDown: 'g5:1 f e d c',
  powerUp: 'g4:1 c5 e g:2 e:1 g:3',
  powerDown: 'g5:1 d# c g4:2 b:1 c5:3',
};
const MELODY_ORDER = Object.keys(MELODIES);
const MELODY_LABEL = { dadadadum: 'dadadum', baDing: 'ba ding', jumpUp: 'jump up', jumpDown: 'jump down', powerUp: 'power up', powerDown: 'power down' };

// Parses a melody note string into [{freq (0 = rest), beats}]
function parseMelody(src) {
  let octave = 4, ticks = 4;
  const out = [];
  for (const tok of String(src).trim().split(/\s+/)) {
    if (!tok) continue;
    const m = tok.match(/^([a-gA-GrR])([#b]?)(\d?)(?::(\d+))?$/);
    if (!m) continue;
    if (m[3]) octave = Number(m[3]);
    if (m[4]) ticks = Number(m[4]);
    let freq = 0;
    if (m[1].toLowerCase() !== 'r') {
      const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
      const semi = base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      freq = Math.round(440 * Math.pow(2, (semi - 9) / 12 + (octave - 4)));
    }
    out.push({ freq, beats: ticks / 4 });
  }
  return out;
}

// The melody editor (8 columns): the rows, from high C to low C, with their colours as in MakeCode
const MELODY_ROWS = [
  { note: 'C5', color: '#a80000' }, { note: 'B', color: '#d83b01' }, { note: 'A', color: '#ffb900' }, { note: 'G', color: '#107c10' },
  { note: 'F', color: '#008272' }, { note: 'E', color: '#0078d7' }, { note: 'D', color: '#5c2d91' }, { note: 'C', color: '#b4009e' },
];
const MELODY_FREQ = { C: 262, D: 294, E: 330, F: 349, G: 392, A: 440, B: 494, C5: 523 };

const GESTURES = [
  ['Shake', 'shake'], ['LogoUp', 'logo up'], ['LogoDown', 'logo down'], ['ScreenUp', 'screen up'], ['ScreenDown', 'screen down'],
  ['TiltLeft', 'tilt left'], ['TiltRight', 'tilt right'], ['FreeFall', 'free fall'], ['ThreeG', '3g'], ['SixG', '6g'], ['EightG', '8g'],
];
const gestureLabel = (g) => (GESTURES.find((x) => x[0] === g) || [g, g])[1];

// micro:bit board theme colours (the simulator picks one, like MakeCode)
const BOARD_THEMES = ['#6ae8ff', '#6dffb8', '#ffd25a', '#ff9de6'];

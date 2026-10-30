# micro:bit Simulator

A web app that looks and works like **MakeCode for micro:bit** (makecode.microbit.org): same editor, same blocks, same simulator. It is built for student practice and assessment: each student signs in with their class and name, works on the challenges of the lessons, and checks their answer automatically. The teacher follows every student live. Nothing needs to be installed and no internet connection is required (no download to a real micro:bit: the simulator is the board).

## In class

1. **Teacher:** on your computer, double-click `start.command`. A window opens and shows:
   - the **public link** for students, e.g. `https://xxxx.trycloudflare.com/`. It works from any network, through a free Cloudflare tunnel with no account. The first launch downloads the tunnel tool into `tools/`.
   - the **teacher password** (`prof2026`, or the `TEACHER_CODE` environment variable), only needed to open the dashboard from another computer.
   The dashboard opens with the link and a QR code per class (**📺 Show to the class** for the projector). Keep the window open during the lesson. The link changes at each launch.
2. **Students:** open the link of their class (it carries the class code), click their **class**, then their **name**, then **Challenges** (or **Free programming**).
3. **Challenges:** read the card on the left, build the program, test it in the simulator (it restarts at every change, like MakeCode), then click **✅ Check my answer**. With 80 % or more (`passScore`, Manage tab) the next challenge unlocks. 🏠 shows all the challenges.
4. **Saving:** automatic, on the class server, every few seconds ("☁️ Saved" in the header). Next time, students choose the same class and name. ⚙ → *Save my work* also downloads a copy (`Name_Class_microbit-work.json`), reopened with *Continue from my saved file*.

## Like MakeCode

- **Editor:** blue menu bar with **Blocks / JavaScript**, toolbox with the MakeCode categories, colours and icons (Basic, Input, Music, LED, Radio, Loops, Logic, Variables, Math, Extensions, Advanced → Functions, Arrays, Text, Game, Images, Pins, Serial, Control), "more" sub-categories, search box, grey block palette with group titles, bottom bar with Download, project name, undo / redo and zoom.
- **Blocks:** the MakeCode renderer (Blockly "zelos" with the pxt font and shapes), LED grid of *show leds* clicked on the block, icon grid, *pause (ms) 100 ▾*, piano note picker (*Middle C*), melody editor, ⊕ / ⊖ on *if*, *array of*, *join*, draggable red parameters (*receivedNumber*, function inputs), one event block per event (a duplicate is disabled), loose blocks greyed out and not run, a new project starts with *on start* and *forever*.
- **JavaScript:** the MakeCode JavaScript of the blocks (read only).
- **Simulator:** the V2 board of MakeCode. Buttons A, B and the virtual A+B, logo touch, pins 0 / 1 / 2, SHAKE button (and one button per other gesture used), tilt with the mouse, light level circle, thermometer, compass, sound level, a second micro:bit when the radio is used, *Show data Simulator* for the serial port, stop / restart / slow-mo / mute / screenshot / fullscreen. Same timings as MakeCode: 150 ms per column when scrolling, 400 ms after *show leds*, 600 ms after *show icon*, 20 ms between two turns of *forever*.

Not available: download to a real micro:bit, extensions, editing in JavaScript / Python, the debugger.

## The challenges (Class 5, Term 2)

| # | Unit | Challenge | Lesson | Checked automatically |
|---|---|---|---|---|
| 1 | 1 Introduction | Name tag | L1 | name scrolls at start, then a picture |
| 2 | 1 | Small animation | L1 ext. | two pictures, repeating, visible long enough |
| 3 | 1 | Mood display | L2 | A happy, B sad, A+B another reaction |
| 4 | 1 | Quiz: inputs and outputs | Unit 1 | 6 questions |
| 5 | 2 Physical inputs | Gesture detective | L3 | 3 gestures, 3 different pictures |
| 6 | 2 | Electronic dice | L3 | 60 shakes: always 1 to 6, every face |
| 7 | 2 | Rock Paper Scissors | L4 | 3 pictures at random, variable + if / else if |
| 8 | 2 | Keep the score | L4 ext. | A adds 1, B shows the score |
| 9 | 2 | Quiz: movement and random | Unit 2 | 6 questions |
| 10 | 3 Sensors & variables | Sensor station | L5 | A temperature, B light, A+B compass (two values each) |
| 11 | 3 | Live thermometer | L5 ext. | updates by itself, unit "C" |
| 12 | 3 | Step counter | L6 | 0 at start, +1 per shake, B resets |
| 13 | 3 | Progress bar | L6 ext. | plot bar graph grows with the steps |
| 14 | 3 | Quiz: sensors and variables | Unit 3 | 6 questions |
| 15 | 4 Conditions | Night light | L7 A | dark → all LEDs on, light → off, again and again |
| 16 | 4 | Hot / cold detector | L7 B | HOT above 25 °C, COLD below 15 °C, else OK |
| 17 | 4 | Reaction game | L8 | random wait, heart, reaction time, "too early" sad face |
| 18 | 4 | Best reaction time | L8 ext. | best time kept, A+B shows it |
| 19 | 4 | Mini-quiz Units 1-4 | L8 | 8 questions |

How a check works: the program runs on a fresh simulated micro:bit, in virtual time (a check takes a fraction of a second). A test script presses the buttons, shakes the board, changes the light, the temperature or the heading, then looks at what was shown (numbers, texts, icons, LED patterns). Each criterion gives points; the score is the share of points. Random numbers use fixed seeds, so a check always gives the same score. Quizzes: the wrong answers are shown in red, the right answer is not given.

Note for the reaction game: like in MakeCode, *show icon* waits 600 ms. A program that sets `start` after the heart (as in the lesson plan) measures 600 ms less and counts B as "too early" during those 600 ms; both orders are accepted by the check.

## Teacher dashboard (`teacher.html`)

The dashboard of the EV3 Simulator, adapted:
- **Live class:** every student of the class lists, connected or not; progress dots (click one to see that program); current challenge, time, tries, best check, status; class commands (message, pause screens, close access, exam); help requests queue.
- **👁 View:** the student's blocks live, the history of their versions, their program running on a micro:bit you can use (A, B, shake…), **✅ Check their answer**, comments pinned on a block. For a quiz: their answers, right or wrong.
- **📝 Exams:** title, duration, challenges (quizzes too), hints or not; best check per challenge, Swiss grade, CSV, *Verify by replaying the programs*.
- **Reports:** difficulty report (print / PDF), CSV, report from saved files.
- **⚙️ Manage:** pass score, modes, class lists (one code per class, created automatically; *Paste from Excel*), students (rename, class, unlock, reset, download, delete), backups, database usage.
- **🎓 Student view:** the student app with every challenge open and **🔑 Solution** (answer key). Nothing is saved for students.

Class lists: change them in Manage → Class lists. `api/_roster.json` is the default list of the class server on this computer.

**Never in git (the repository can be public):** `api/_roster.json` (names of the students), `api/_solutions.json` and `tests/solutions_src.js` (answer key) are in `.gitignore`. Online, the class lists and the answer key live in the database: the lists are saved from Manage → Class lists, the answer key is sent with `python3 tests/upload_solutions.py https://<your-app>.vercel.app <teacher password>`.

## Online hosting (Vercel)

Same as the EV3 Simulator: `api/index.py` stores the data in an Upstash Redis database (keys start with `mb:`, so the same database can serve both apps). Set `TEACHER_CODE` in Vercel; connect an Upstash Redis database; every `git push` redeploys.

## Tests

Run the class server with a test folder (the class data is never touched): `MB_DATA_DIR=/tmp/mbtest python3 server.py 8101 --no-browser`, then:
- `tests/selftest.html` (open `http://localhost:8101/tests/selftest.html`): every reference solution scores 100 %, an empty program 0 %, every wrong program fails its criterion, plus the tests of the block engine. It also prints the answer key: after changing `tests/solutions_src.js`, copy it into `api/_solutions.json`, then send it online with `tests/upload_solutions.py`.
- `python3 tests/apitest.py http://localhost:8101`: every API endpoint.

## Structure

```
index.html / teacher.html   student app / teacher dashboard
js/mbdata.js                icons, arrows, 5x5 font, notes, melodies, gestures
js/fields.js                LED grid, icon grid, note picker, melody editor, ⊕ / ⊖, draggable parameters
js/blocks.js                renderer, theme, every block (text, code templates) and the toolbox
js/generator.js             blocks → simulator code, and the MakeCode JavaScript view
js/runtime.js               the micro:bit (fibers in virtual time, display, sensors, music, radio, game, serial)
js/board.js                 the V2 board and its controls
js/challenges.js            the challenges, quizzes and their tests
js/evaluator.js             automatic checking
js/app.js                   student app;  js/classroom.js: help, comments, class commands, exams, history
js/progress.js              student progress, save file, live sync
js/teacher.js, teacher-classroom.js, analysis.js   dashboard
api/_core.py, api/index.py  API (class server and Vercel);  server.py: class server and public link
css/makecode.css            the MakeCode look;  css/style.css: welcome screen, dashboard
lib/                        Blockly 11, QR code (local, offline)
```

The board artwork and the simulator widgets follow the MakeCode simulator (pxt-microbit, MIT licence); the editor uses Blockly (Apache 2.0). micro:bit is a trademark of the Micro:bit Educational Foundation and MakeCode a Microsoft product; this project is independent and not affiliated with them.

# micro:bit Simulator

A web app that looks and works like **MakeCode for micro:bit** (makecode.microbit.org): same editor, same blocks, same simulator. It is built for student practice and assessment: each student signs in with their class and name, works on the challenges of the lessons, and checks their answer automatically. The teacher follows every student live. Nothing needs to be installed and no internet connection is required. Programs run in the simulator, and can also be downloaded to a real micro:bit with the USB cable.

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

Not available: extensions, editing in JavaScript / Python, the debugger.

## Download to a real micro:bit

The **Download** button works like in MakeCode:
- **Chrome or Edge (WebUSB):** the first time, *Connect your micro:bit* asks to plug in the USB cable and click **Pair** (choose *BBC micro:bit CMSIS-DAP*). Then every **Download** sends the program directly (progress bar, a few seconds). The button turns green with 🔌 while a micro:bit is connected; **…** → *Disconnect* / *Connect device*.
- **Other browsers, or "… → Download as file":** a `.hex` file is downloaded; drag it onto the **MICROBIT** drive.

How it works: the blocks are translated into **MicroPython** (`js/pygen.js`) and run on `lib/microbit/mbrt.py`, a small runtime that behaves like MakeCode (on start, forever and event blocks run side by side; a pause or *show…* lets the other blocks run; A+B, gestures, pins, logo, radio between micro:bits running this app, music). The `.hex` is built with the official MicroPython firmware (V1 1.1.1 and V2 2.1.1) and the micro:bit Foundation libraries (`microbit-fs`, `microbit-connection`), all in `lib/microbit/` (offline).

Notes:
- Made for the **micro:bit V2** (the runtime needs its memory; a V1 may show a memory error).
- A few blocks only work in the simulator (Game sprites…): Download then says which ones to remove.
- WebUSB needs a recent micro:bit firmware (DAPLink); if pairing fails, use *Download as file*.
- The radio only talks to micro:bits programmed with this app (not to MakeCode programs).

## The assessment (Class 5, Term 2)

The welcome page has two choices only:

- **🧪 Blank test**: a practice test of 40 minutes that the student starts alone (no password). Same format as the test; at the end the student sees the score of each part and a Swiss grade. Nothing is sent as an exam result (the teacher sees "🧪 Blank test" in the live view, and the programs with *View*).
- **📝 Test**: the real test, started by the teacher (📝 Start an exam: the test challenges are ticked) and opened with the test password of the class.

| | Blank test | Test | Checked automatically |
|---|---|---|---|
| 1 | Happy and sad (A happy, B sad) | Thermometer (B → temperature) | the button shows the right thing (and nothing before) |
| 2 | Rock Paper Scissors | Dice with dots (shake → 1 to 6 dots with show leds) | 45 / 60 shakes: always a face, every face can appear |
| 3 | Sound meter (A → sound level), never seen before | Light levels (forever: 1 / 2 / 3 / 4 from the light level, same logic as the compass), never seen before | sound 40 and 180 / light 10, 90, 160, 240 and the limits 63, 64, 191, 192 |
| 4 | Quiz, 6 questions (outputs: tick all; 3 typed answers) | Quiz, 10 questions (sensors: tick all; 5 typed answers) | typed answers checked with flexibility (any case, accents, plural, one typo; a wrong word refuses it), inputs and outputs, variables, pick random, if / else, pause, programs in blocks to debug |
| 5 | | Score (A +1, B −1, shown each time) | A, A, A → 1, 2, 3; then B, B → 2, 1 |
| 6 | | Highest temperature (A → the highest temperature since the start), the hard one | 21 → 21; 21 → 29 → 29; 21 → 29 → 15 → 29; 24 → 12 → 24 |

**Marks:** each part has its marks, shown to the students (challenge: `marks` in `js/challenges.js`, quiz question: `marks`); the blank test is out of 25, the test out of 40. The automatic mark is the check score × the marks (or the answer of the question), rounded to half marks; the grade is the Swiss scale from the total. Results → **✏️ Mark question by question**: one question at a time, every student's program (in blocks) or answer, the automatic mark, and a field to change it (↺ auto goes back). The live view shows each student's marks and grade for the latest exam of their class (updated when you change a mark); click it for the results.

**Grade out of 7 (bell curve per class):** each student's total is placed against the class (z = (total − class average) / standard deviation), then put on a normal curve of an average grade and a spread you choose in the results (default 4.5 and 1.2), rounded between 1 and 7; a histogram shows the grades of the class. Click a student's name, total or grade (or their grade in the live view) to see **all their answers stacked** — quiz answers, programs in blocks running on a micro:bit, the automatic check — with each mark that you can change.

**Voice alerts:** the dashboard says out loud "Georgi left the exam page" (or "closed the exam page") once each time a student leaves during an exam; the 🔊 / 🔇 button at the top turns it on or off (remembered on this computer). Browsers only speak after a first click on the page.

**Backups on this computer:** when an exam ends (time over or stopped), the open dashboard downloads one JSON file with the exam and every result (programs, answers, marks, grades). 💾 saves one at any time; *Exams & results → 📂 Open a backup file* shows the results from such a file if the database has a problem.

**Quiz:** the quiz comes first; students can come back, change their answers and send them again (the last answers count).

**Start an exam** lets you choose an exam of `EXAMS` (`js/challenges.js`: Blank exam, Exam 1…) and **👁 Preview** it: every part, its marks, the mission, the quiz questions with the right answers.

Quiz questions can show a program drawn with the real MakeCode blocks (`code:` in `js/challenges.js`) and can have several right answers (`multi: true`: +1 per right tick, −1 per wrong tick, never below 0).

The former challenges of the units (mood, dice, step counter, night light, reaction game…) are no longer in the app; their reference solutions are still in `tests/solutions_src.js`.

How a check works: the program runs on a fresh simulated micro:bit, in virtual time (a check takes a fraction of a second). A test script presses the buttons, shakes the board, changes the light, the temperature or the heading, then looks at what was shown (numbers, texts, icons, LED patterns). Each criterion gives points; the score is the share of points. Random numbers use fixed seeds, so a check always gives the same score. Quizzes: the wrong answers are shown in red, the right answer is not given.

**Test password:** each class has its own 4-digit test password (shown next to *Start an exam* on the teacher page, and in big after starting; change it in Manage → Class lists). Students open a running test with the **📝 Test** card of the welcome page (or the window that appears if they are already working) and that password; without it, the server refuses their results.

**During the test:** after each *Submit my program* the student goes straight to the next challenge not submitted yet. *✅ Submit my test* (in the bar of steps) hands in the whole test: the latest programs are sent and the test cannot be opened again. When the time is over (or the teacher stops it), the test closes and cannot be opened again either. The live view shows in red a student who is **not on the test page** (other tab, other window, page closed), with how many times and how long; the results show the hand-in time and the same count (also in the CSV).

**🤖 AI marking (OpenAI):** after the test, in the results click **🤖 AI marking**. Each program handed in (by a student who clicked *Submit my test*, or everybody once the test is over) goes to the server, which asks OpenAI (`gpt-4o`, Responses API, temperature 0, strict JSON schema, the same way as the bookshop app). The model gets the task, the marks, a program that works, the student's program (MakeCode JavaScript) and the automatic checks, and returns a mark in half marks, a short comment for the student and a note for the teacher. The **typed quiz answers** too (one call per student for all of them): the AI marks the idea, not the words (spelling, other words, another language), and works out the programs of the questions; the multiple-choice questions keep the answer key (exact), an empty answer is 0 without asking. The AI mark replaces the automatic mark (purple in the table; the checks' mark stays visible); the marks you changed always win. Check them with *✏️ Mark question by question*, then share the corrections: the student sees the comment under each program. A program marked again only if it changed. Needs the environment variable **`OPENAI_API_KEY`** on Vercel (Settings → Environment Variables, then redeploy); `OPENAI_MODEL` changes the model. The key stays on the server, only the teacher can start it. Each challenge has a **marking guide** for the AI (`AI_GUIDES` in `api/_core.py`, on the server: not in the students' app): what each mark is for and what the usual slips cost (wrong button 3 / 4, swapped faces 2 / 4, a limit off by one −½…); a slip a beginner fixes in seconds costs at most 1 mark, and the AI never copies the all-or-nothing score of the checks. **💬 Comment for the student**: under each program and typed answer, pre-filled with the AI's suggestion, editable (saved when you leave the box; ↺ goes back to the suggestion); your text wins, even if the AI marks again. The student reads it in their correction as the teacher's comment: the word AI never appears there. **👁 Student's view** (in a student's view): their correction page exactly as they will see it (marks, comments, right answers, programs), even before you share it, with a "Preview" banner; reload it after changing a mark or a comment. In a student's view (click their name in the results), **🤖 AI marking** does the same for that student only, at once (even before they hand in); clicked again, it marks everything of that student again. **🧾 AI log** (in the results): every AI call of the test (student, part, mark or error, time) and whether the server has the key; an error also stays in a red box under the buttons.

**Corrections:** in the blank test, the student sees the marks and the full correction at the end (also after a blank exam started by the teacher: *✏️ See my correction*). For the real test, mark it first, then in the results click **🔗 Correction links**: a text to copy with one link per student (no password; each link opens only that student's correction: marks, grade out of 7 as in the table, right answers, their program and a program that works). Changed marks later? Click it again. *🚫 Close the corrections* stops the links.

**Help queue:** first come, first served (oldest first, for the teacher and for the student who sees their place); asking again or reloading the page keeps the place in the queue.

In an exam: the quiz answers are sent **once** and not marked on screen (no guessing by elimination); a student cannot leave the exam with *Exit*, and a name already open on another computer cannot be taken by a classmate (it frees itself 1 minute after that computer closes). A program that shows things by itself in a *forever* loop, without the button or the shake, scores 0 on the event challenges.

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
- `python3 tests/run_python.py programs.json`: runs the MicroPython of every reference solution (the last block of `tests/selftest.html`, saved as JSON) on an imitation of the micro:bit with `mbrt.py`, and checks what the board shows.

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
js/pygen.js, js/flash.js    blocks → MicroPython, .hex and download over USB;  lib/microbit/: runtime, firmware, libraries
js/app.js                   student app;  js/classroom.js: help, comments, class commands, exams, history
js/progress.js              student progress, save file, live sync
js/teacher.js, teacher-classroom.js, analysis.js   dashboard
api/_core.py, api/index.py  API (class server and Vercel);  server.py: class server and public link
css/makecode.css            the MakeCode look;  css/style.css: welcome screen, dashboard
lib/                        Blockly 11, QR code (local, offline)
```

The board artwork and the simulator widgets follow the MakeCode simulator (pxt-microbit, MIT licence); the editor uses Blockly (Apache 2.0). micro:bit is a trademark of the Micro:bit Educational Foundation and MakeCode a Microsoft product; this project is independent and not affiliated with them.

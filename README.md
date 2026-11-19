# FOM Daily Schedule Tracker — v3.0

An offline-first, single-page operational tracker for the **FOM Daily Schedule v3.0 — Self-Study Edition**.

This is the **v2.1 interface, upgraded to the v3.0 schedule**. The visual identity, layout,
navigation, component design and interaction patterns of v2.1 are preserved; every timetable,
mode, threshold and rule now comes from `FOM_Daily_Schedule_v3.0_FINAL.md`.

- **Runtime:** static HTML + CSS + vanilla JavaScript. No frameworks, no build step, no
  network calls, no backend, no database, no paid services.
- **Storage:** browser `localStorage` only. Nothing leaves the device.
- **Notifications:** none — by design. You manage the alarms yourself.

---

## 1. Folder structure

```
fom-schedule-tracker/
├── index.html          The whole application shell + all seven views.
├── style.css           The complete design system (dark theme, no frameworks, no icon fonts).
├── schedule-data.js    READ-ONLY source of truth: every block time, mode, zone and threshold.
├── app.js              State, persistence, migration, rendering and analytics.
├── run_tests.py        The regression suite (Playwright).
├── shots.py            A helper that renders every view to PNG for visual review.
└── README.md           This file.
```

Five files make up the site that GitHub Pages serves. `run_tests.py` and `shots.py` are
development tools and are not needed to run the tracker.

### How the three front-end files divide the work

| File | Responsibility | Rule |
|------|----------------|------|
| `schedule-data.js` | The schedule itself | **Read-only.** No control in the UI can change a start time, an end time, a category or a template. To change the schedule, edit this file deliberately. |
| `app.js` | State, storage, migration, rendering, analytics | Never hard-codes a time — it always reads one from `schedule-data.js`. |
| `index.html` | Structure and accessible markup | Static shell; dynamic content is rendered by `app.js`. |

---

## 2. Running it locally

The app is pure static files, so any local web server works.

```bash
cd fom-schedule-tracker

# Option A — Python (no install needed)
python3 -m http.server 8000
# then open http://localhost:8000

# Option B — Node
npx serve .
```

Opening `index.html` directly with `file://` also works, but a local server is recommended
(some browsers restrict `localStorage` behaviour on `file://`).

### Running the tests

```bash
pip install playwright && playwright install chromium
python3 run_tests.py
```

The suite covers load and auto-detection, the timeline, the daily log, the dashboard,
analytics, the module tracker, the weekly review, settings and persistence, import/export,
the top-bar controls, the mode-specific schedules, the timezone clock, the responsive
layout, the deload weeks, and the **v2.1 → v3.0 data migration**.

Latest run: **112 checks, 0 failures, no console errors.**

---

## 3. Deploying to GitHub Pages

1. **Create the repository.** A plain repository is fine — no build step is needed.

   ```bash
   git init
   git add index.html style.css schedule-data.js app.js README.md
   git commit -m "FOM Daily Schedule Tracker v3.0"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. **Enable Pages.** In the repository: **Settings → Pages → Build and deployment →
   Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save.**

3. **Wait for the deploy**, then open
   `https://<you>.github.io/<repo>/`.

That is the whole process. There is nothing to compile, no bundler, no `npm install` and no
environment variable to set.

> **If you keep the project in a subfolder**, add a `docs/` folder (or a `.nojekyll` file)
> so Pages serves it as plain files. The simplest option: make the repository *be* the
> project folder, as above.

---

## 4. What changed from v2.1 to v3.0

### 4.1 The clock

| | v2.1 | **v3.0 — FINAL** |
|---|---|---|
| Wake-up | 07:00 (Sat / Sun 07:30) | **08:00 every day** |
| Lights-out | 23:45, fixed | **00:30 ± 10** (window 00:20–00:40), never later than 00:40 |
| Night sleep | 7 h 15 m / 7 h 45 m | **7 h 30 m every night** |
| Morning check | 07:20 | **08:18** — during "plan the day" |
| Sleepiness slots | 11:05 / 15:25 / 16:45 | **11:55 / 16:15 / 17:35** |
| Shutdown | one ritual at 20:45 | **split**: a 21:30 helper check-in **and** a 23:40–23:50 night wrap-up |
| Reading | 20 min before dinner | **25 min in bed** (00:00–00:25); 40 min Sat, 45 min Sun |
| Free evening | 40 min before dinner | **20 min before dinner** (55 min on Modified Load) + a 30-minute free evening at the weekend |
| Night routine | 5 min | **10 min** |
| Small breaks | slow morning 30 · Break 1 15 · Break 3 15 | **slow morning 25 · Break 1 10 · Break 3 10** — the only trims |
| Study blocks | FOM 90/90/90/60 · PHY 80 · CHE 80 · C+E 80 · REV 70 | **Unchanged** — 10 h 40 m on weekdays, 62 h 05 m a week |

### 4.2 The day modes

v2.1 hid the source's colour-coded names behind professional labels. **v3.0 keeps the
professional labels** — the tracker's own vocabulary — and shows the source's name beside
each one so the mapping to the document is never lost.

| Tracker (professional name) | Source name | Weekday study | Source |
|------|------|--------------:|--------|
| **Full Capacity** | Green (Full) | 10 h 40 m | §22.2 / §27.2 |
| **Modified Load** | Lite | 9 h 20 m | §27.2 |
| **Recovery Plan** | Yellow | 5 h 20 m | §22.3 |
| **Essential Plan** | Red | 45 m | §22.4 |

The top-bar dropdown, the dashboard card, the mode picker and the timeline notes all use
the professional name; the source name appears as a small tag on the mode cards, in the
mode detail and in the 60-second-check verdict ("The worst of the three is **Recovery
Plan** (Yellow)").

Each mode keeps its **own clock**, not just its own label — Modified Load has 28 blocks,
Recovery Plan 24, Essential Plan 19. The colours are unchanged from v2.1 (green / blue /
amber / red), so the visual identity is preserved.

The **Energy Dashboard** keeps three zones instead of four, exactly as §23.3 defines
them: **Green ≥ 3.50 · Yellow 2.50–3.49 · Red < 2.50**. The three source overrides are
implemented: a day averaging ≤ 2.0 forces at least Yellow; a day with three or more scores
of 2 or lower makes the next day a Recovery Plan; average sleepiness ≥ 3.5 on five or more
days raises the sleep alarm.

### 4.2a The day now crosses midnight

The v3.0 day runs **08:00 → 08:00 the next morning**, so the last three blocks —
Bedtime reading (00:00), Lights-out prep (00:25) and Sleep (00:30) — fall after
midnight. v2.1 never crossed midnight, so this case is new in v3.0.

The tracker handles it two ways:

- **Ordering.** A block's time is measured from the start of its own day, so the
  small-hours blocks stay at the end of the timeline inside the **Night** section
  (23:50 Night routine → 00:00 Bedtime reading → 00:25 Lights-out prep → 00:30 Sleep),
  instead of being filed under Morning.
- **A `+1` marker.** Any time that falls after midnight is flagged `+1` in the timeline
  time column, in the daily-log checklist and in the clock ranges — so `00:30 +1` reads
  as half past midnight, tonight, and `08:00 +1` as tomorrow morning. The Night section
  header says so as well.

The clock itself stays on the source's 24-hour times; only the day boundary is marked.

### 4.3 The timetables

All three master timelines were re-transcribed from the v3.0 source. Every one totals
**exactly 1,440 minutes** and every study total matches the source exactly:

| Template | Blocks | Study | Source |
|----------|-------:|------:|--------|
| Weekday (Mon–Fri) | 28 | 640 min (10 h 40 m) | §6.1 |
| Saturday | 20 | 310 min (5 h 10 m) | §7.1 |
| Sunday | 22 | 215 min (3 h 35 m) | §8.1 |
| Weekday · Modified Load | 28 | 560 min (9 h 20 m) | §27.2 |
| Weekday · Recovery Plan | 24 | 320 min (5 h 20 m) | §22.3 |
| Weekday · Essential Plan | 19 | 45 min | §22.4 |

The weekday now carries the blocks v2.1 did not have — **Helper check-in** (21:30),
**Night wrap-up** (23:40), **Night routine** (23:50), **Bedtime reading** (00:00) and
**Lights-out prep** (00:25) — and drops the old 20:45 shutdown and the pre-dinner reading.

### 4.4 New v3 features implemented

| Feature | Where | Source |
|---|---|---|
| The 60-second check — sleep / body / head, worst decides the mode | Daily Log → A | §22.1 |
| The helper check-in with its five steps and the one question | Daily Log → C | §4.3 |
| The night wrap-up with the "everything finished before bed" six-box check | Daily Log → D | §13.6 |
| "Still fuzzy" field, carried into Sunday's REV-W | Daily Log → D | §9.2.7, §12.5 |
| The FOM-4 analysis protocol printed in the block (Review → Identify → Correct) | Daily Log → G | §9.13 |
| Sleep & recovery panel: lights-out, wake-up, sleep, napping, workout, mode lights-out | Dashboard | §13.1, §13.7 |
| Lights-out / wake-up / mini-nap logging | Daily Log → F | §25.10 |
| The Doubt log with its own table | Daily Log → J | §25.7 |
| The alarm list | Settings | §24.9 |
| The load ladder (Full Capacity → Modified Load → Recovery Plan → Essential Plan) | Settings | §27.2 |
| The cut order and the "never cut" list | Settings | §24.1 |
| Block **type** (DEEP / DEEP-LITE / RECOVERY / FUEL / …) on the timeline | Timeline | §6–§8 |
| Deload-week detection — Weeks 4, 8, 12 … from the module calendar (30 Nov, 28 Dec, 25 Jan …) | Dashboard + Weekly Review | §22.8 |

### 4.5 What was deliberately *not* changed

- The dark theme, the palette, the typography, the sidebar, the card system, the tables,
  the charts, the toast, the print stylesheet and the responsive behaviour are v2.1's.
- The module tracker and its 22-module calendar keep their windows and their recorded
  progress. Only `A-02`'s book estimate changed (2 → 2.5 weeks), to match §26.3.
- The error codes, the proof checklist, the retrieval queue and the milestone rules are
  unchanged — v3.0 kept them.
- The app still never rings an alarm and never sends a notification.

---

## 5. How existing data is preserved and migrated

The v2.1 app stored one `shutdown` object per day. v3.0 splits that into a **21:30 helper
check-in** and a **23:40 night wrap-up**, and moves the scores, the sleepiness readings and
the tally to the top of the day record. The migration is **version-aware and automatic**.

**Nothing is ever overwritten before it has been read.** `load()` parses the stored payload,
migrates it in memory, and only then writes it back. If the migration throws, the original
payload is left untouched and the app starts with an empty day rather than losing data.

### The mapping

| v2.1 | v3.0 |
|---|---|
| `mode: 'full'` | `mode: 'green'` |
| `mode: 'modified'` | `mode: 'lite'` |
| `mode: 'recovery'` | `mode: 'yellow'` |
| `mode: 'essential'` | `mode: 'red'` |
| `shutdown.scores` | `scores` |
| `shutdown.sleepiness.sleepiness1105` | `sleepiness.sleepiness1155` |
| `shutdown.sleepiness.sleepiness1525` | `sleepiness.sleepiness1615` |
| `shutdown.sleepiness.sleepiness1645` | `sleepiness.sleepiness1735` |
| `shutdown.outcomes` | `wrapup.outcomes` (HIT / MISS) |
| `shutdown.unfinished` / `.hardest` / `.complete` | `wrapup.unfinished` / `.hardest` / `.complete` |
| `shutdown.sleepHours` | `sleep.hours` |
| `shutdown.nap` | `sleep.nap1` |
| `shutdown.workout` | `workout` |
| `shutdown.note` | `note` |
| `shutdown.tally` | `tally` |
| `shutdown.codes` | `codes` |
| block id `shutdown` | block id `wrapup` |
| block id `night` | block id `nightroutine` |

Untouched and carried across verbatim: **daily logs and milestone drafts, block completion
state, HIT/MISS outcomes, the mistake notebook, the Doubt log, module progress and module
notes, weekly reviews, and your settings.**

The new fields that v2.1 did not have (`wrapup.stillFuzzy`, the six wrap-up checkboxes,
`checkin`, `sleep.lightsOut`, `sleep.wakeUp`, `sleep.miniNap`, `morningCheck`) simply start
empty. The new `helper` and `lightout` blocks start un-ticked.

### Backups

- **Settings → Export backup** writes one JSON file containing both the `config` (the
  schedule snapshot) and the `data` (your logs, errors, doubts, modules and reviews).
- **Settings → Import backup** reads that file back. Import replaces the data *after*
  validating that it really is a tracker backup.
- Export before any bulk change. The import path is also the recovery path: if a migration
  ever looks wrong, export, clear, and re-import.

---

## 6. Known limitations

1. **The weekend mode schedules are scaled, not quoted.** The source gives explicit
   Modified Load / Recovery Plan / Essential Plan timetables for weekdays only. For Saturday and Sunday the tracker
   applies the same proportional reductions (the source's rule is that the weekend version
   is "scaled to the day's load", §2.3). If you want different weekend numbers, edit
   `MODE_RULES` in `schedule-data.js` — it is the only place they live.
2. **The Modified Load weekday clock is derived, not quoted.** §27.2 gives the Lite block
   lengths and says where the 80 freed minutes go, but not a full clock. The tracker's
   Modified Load day is
   built to those rules: PHY/CHE 70, C+E 70, FOM-4 30, REV 50, a longer Break 2, a longer
   Break 3, a longer free time before dinner and an earlier lights-out at 00:10. The study
   total is exactly 560 minutes and the day is exactly 1,440 minutes.
3. **One timezone.** The schedule is evaluated in **Asia/Kolkata (IST)**. The app shows the
   schedule clock and, if your device is in another zone, tells you what your device reads.
   It never shifts the schedule to your local time.
4. **No notifications.** No alarms, no notifications, no background timers — by design
   (see the source's alarm list, reproduced in Settings).
5. **The app is single-browser.** Data lives in one browser's `localStorage`. Use
   **Export backup** to move it. Clearing site data erases it.
6. **The "daily" log is per calendar date, not per wake-up.** A night that runs past
   midnight is still logged against the day it started.
7. **The evidence folder, the timed-set analysis sheet and the subject logs** (source
   §§25.8, 25.9, 25.11) are paper artefacts. The tracker carries the error notebook, the
   Doubt log and the FOM-4 tally — the parts that are genuinely tabular — and leaves the
   rest to the notebook.
8. **Official exam dates are not in the app.** The source is explicit that exam dates must
   come from the official notices. The Weekly Review has a "dates within 21 days" field for
   them, and the helper maintains that calendar.

---

## 7. A note on the source

The schedule is transcribed from `FOM_Daily_Schedule_v3.0_FINAL.md`, which is the authority
for every time, rule and threshold in this application. Where the source is explicit, it is
implemented exactly. Where the source is silent (the weekend mode tables; the Modified Load
weekday clock), the app makes the smallest reasonable choice and says so in the code and
in the limitations above. Nothing has been invented.

/* ==========================================================================
   FOM DAILY SCHEDULE v3.0 — SCHEDULE DATA
   schedule-data.js

   READ-ONLY SOURCE OF TRUTH.

   Every block time in this file is transcribed verbatim from the master
   timelines in the source schedule (FOM_Daily_Schedule_v3.0_FINAL.md):

     Section 6.1  — Weekday master timeline (Mon–Fri)   -> templates.weekday
     Section 7.1  — Saturday master timeline             -> templates.saturday
     Section 8.1  — Sunday master timeline              -> templates.sunday
     Section 5.1  — Week at a glance / themes           -> templates.*.variants
     Section 9.1  — FOM block playbook                   -> FOM_BLOCKS
     Section 9.8  — Error log codes                     -> ERROR_CODES
     Section 9.13 — FOM-4 analysis protocol              -> FOM4_PROTOCOL
     Section 9.7  — 10-point proof checklist            -> PROOF_CHECKLIST
     Section 9.9  — Retrieval queue (five boxes)        -> RETRIEVAL_BOXES
     Section 13.6 — The wind-down / "finished" check    -> WRAPUP_CHECKS
     Section 21    — Weekly Review template             -> WEEKLY_REVIEW_FIELDS
     Section 22    — Day modes and the load ladder      -> DAY_MODES / LOAD_LADDER
     Section 23.3  — Weekly Energy Dashboard            -> ZONES / THRESHOLDS
     Section 24.1  — The cut order                      -> CUT_ORDER
     Section 24.9  — Alarm list                         -> ALARM_LIST
     Section 25.4  — Daily log template                 -> DAILY_SCORES
     Section 25.6  — Module tracker                     -> MODULES
     Section 26.3  — Module calendar                    -> MODULES

   These objects are frozen. The user interface contains no control that can
   change a start time, an end time, a category or a template. Changing the
   schedule means editing this file deliberately.

   v3 vs v2.1 — the clock moved, the load did not:
     · wake-up 08:00 every day (was 07:00 / 07:30 at weekends)
     · lights-out 00:30 ± 10 (was 23:45), never later than 00:40
     · the shutdown ritual split into a 21:30 helper check-in and a
       23:40–23:50 night wrap-up
     · reading moved into bed, 00:00–00:25 — the day now crosses midnight,
       so the last three blocks belong to the small hours of the next morning
     · study blocks are unchanged: 10 h 40 m a weekday, 62 h 05 m a week

   No external dependencies. Exposes a single global: FOM_SCHEDULE.
   ========================================================================== */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
     TIME HELPERS
     A block's end time may fall on the following calendar day (night sleep).
     `toMinutes` converts "HH:MM" to minutes from midnight; `duration` treats
     an end that is not after the start as belonging to the next day.
     ------------------------------------------------------------------ */
  function toMinutes(hhmm) {
    var parts = String(hhmm).split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }

  function duration(start, end) {
    var s = toMinutes(start);
    var e = toMinutes(end);
    if (e <= s) e += 1440;              // wraps past midnight
    return e - s;
  }

  /* ------------------------------------------------------------------
     BLOCK CATEGORIES
     The exact set required by the tracker specification. Every block in
     every template carries one of these.
     ------------------------------------------------------------------ */
  var CATEGORIES = [
    { id: 'Study',      label: 'Study',      cssVar: 'cat-study',      description: 'A scheduled learning or problem-solving block.' },
    { id: 'Analysis',   label: 'Analysis',   cssVar: 'cat-analysis',   description: 'Review, diagnosis and correction of your own work.' },
    { id: 'Revision',   label: 'Revision',   cssVar: 'cat-revision',   description: 'The closing block: retrieval and book reading.' },
    { id: 'Breakfast',  label: 'Breakfast',  cssVar: 'cat-breakfast',  description: 'A proper morning meal, 15–20 minutes, no bath.' },
    { id: 'Lunch',      label: 'Lunch',      cssVar: 'cat-lunch',      description: 'Moderate — fuel, not a food coma.' },
    { id: 'Dinner',     label: 'Dinner',     cssVar: 'cat-dinner',     description: 'The fixed 21:55–22:30 family window.' },
    { id: 'Nap',        label: 'Nap',        cssVar: 'cat-nap',        description: 'Nap 1 — 30 minutes, dim room, up on the alarm.' },
    { id: 'Night Sleep',label: 'Night Sleep',cssVar: 'cat-nightsleep',description: 'The fixed non-negotiable sleep block.' },
    { id: 'Workout',    label: 'Workout',    cssVar: 'cat-workout',    description: '17:55 hinge of the day, five days a week.' },
    { id: 'Break',      label: 'Break',      cssVar: 'cat-break',      description: 'A scheduled break, not an accident.' },
    { id: 'Free',       label: 'Free',       cssVar: 'cat-free',       description: 'Protected time with no study at all.' },
    { id: 'Planning',   label: 'Planning',   cssVar: 'cat-planning',   description: 'Weekly review, dashboard and next-week planning.' },
    { id: 'Fuel',       label: 'Fuel',       cssVar: 'cat-fuel',       description: 'Post-workout light fuel and the bath.' },
    { id: 'Recovery',   label: 'Recovery',   cssVar: 'cat-recovery',   description: 'Wake-up routine, resets, rest, wrap-up and wind-down.' },
    { id: 'Free Zone',  label: 'Free Zone',  cssVar: 'cat-freezone',   description: 'Protected non-study block — treated like a class.' }
  ];

  /* ------------------------------------------------------------------
     DAY MODES  (source Section 22 + the load ladder in 27.2)
     The ladder runs Full Capacity -> Modified Load -> Recovery Plan ->
     Essential Plan (Green -> Lite -> Yellow -> Red in the source). Recovery blocks
     never change; only the study load shrinks.
     ------------------------------------------------------------------ */
  var DAY_MODES = [
    {
      id: 'green',
      label: 'Full Capacity',
      short: 'Full',
      full: 'Full Capacity',
      sourceLabel: 'Green',
      rank: 0,
      zone: 'green',
      cssClass: 'zone-green',
      studyMinutes: 640,
      studyLabel: '10 h 40 m',
      description: 'The full plan exactly as written in the master timeline.',
      detail: 'The full plan: Sections 6–8 and 15–21 of the source. Every block runs at its scheduled length, the weekend Free Zones stay protected, and the free time before dinner stays free — it is never used for catch-up.',
      weekdayDetail: 'FOM 90 + 90 + 90 + 60 · PHY 80 · CHE 80 · C+E 80 · REV 70 = 10 h 40 m.',
      rules: [
        'All recovery blocks stay exactly as scheduled.',
        'Dinner stays 21:55–22:30 and lights-out stays 00:30 ± 10.',
        'The Milestone Card is written the night before, in the night wrap-up.'
      ]
    },
    {
      id: 'lite',
      label: 'Modified Load',
      short: 'Modified',
      full: 'Modified Load',
      sourceLabel: 'Lite',
      rank: 1,
      zone: 'lite',
      cssClass: 'zone-lite',
      studyMinutes: 560,
      studyLabel: '9 h 20 m',
      description: 'A one-rung step down for a dashboard reading of Yellow.',
      detail: 'The first rung down the load ladder. The analysis block, the closing revision and the main subject sittings are shortened; the freed minutes become a longer free time before dinner, a longer Break 3, an earlier lights-out and breathing room.',
      weekdayDetail: 'FOM-4 30 (X problems + the weakest proof) · REV 50 (Maths 30 + others 20) · PHY and CHE 70 each · C+E 70 (CS 35 + ENG 35) = 9 h 20 m.',
      rules: [
        'Only the study load shrinks — never sleep, nap, meals or the workout.',
        'FOM-4 is shortened, never skipped.',
        'Step back up to Full Capacity only after a Green week on the Dashboard.'
      ]
    },
    {
      id: 'yellow',
      label: 'Recovery Plan',
      short: 'Recovery',
      full: 'Recovery Plan',
      sourceLabel: 'Yellow',
      rank: 2,
      zone: 'yellow',
      cssClass: 'zone-yellow',
      studyMinutes: 320,
      studyLabel: '5 h 20 m',
      description: 'A deliberately small day for bad sleep, illness or a heavy week.',
      detail: 'A deliberately small day for bad sleep, illness or a heavy week. Only the study load shrinks — the recovery blocks, the meals and the naps stay exactly as they are, and lights-out moves earlier so the sleep is never shorter.',
      weekdayDetail: 'FOM-1 60 · FOM-2 60 · PHY 50 · CHE 50 · C+E mini 30 · FOM-4 30 · REV 40 = 5 h 20 m. Lights-out moves to 00:10.',
      rules: [
        'Recovery blocks stay exactly as they are; the wake-up and dinner do not move.',
        'Lights-out moves earlier to 00:10 — never later.',
        'Do not make up the dropped work later. Drop it or move it to the weekend.'
      ]
    },
    {
      id: 'red',
      label: 'Essential Plan',
      short: 'Essential',
      full: 'Essential Plan',
      sourceLabel: 'Red',
      rank: 3,
      zone: 'red',
      cssClass: 'zone-red',
      studyMinutes: 45,
      studyLabel: '45 m',
      description: 'The minimum viable day: protect recovery and keep a thread alive.',
      detail: 'The minimum viable day. One gentle touch of FOM and a short closing revision; everything else is rest, the workout becomes an easy walk, and lights-out moves to the earliest point the plan allows.',
      weekdayDetail: 'One gentle FOM touch of 30 minutes — a single Tier 1 problem or a re-read of yesterday\'s notes — and 15 minutes of revision. Lights-out moves to 00:00.',
      rules: [
        'This is a recovery day, not a lost day. Tomorrow starts clean.',
        'The workout is replaced by an easy 20–30 minute walk.',
        'Two Essential days in one week means you talk to someone the same day.'
      ]
    }
  ];

  /* ------------------------------------------------------------------
     ERROR CODES  (source Section 9.8)
     Every mistake found in the analysis block is coded with one of these.
     ------------------------------------------------------------------ */
  var ERROR_CODES = [
    { code: 'C', name: 'Concept gap',            fix: 'Return to FOM-1: re-derive from first principles and add a card to the queue.' },
    { code: 'T', name: 'Technique not recalled',  fix: 'Make a technique card, then do three similar problems.' },
    { code: 'A', name: 'Algebra / arithmetic slip', fix: 'Write every line; sanity-check with a special case.' },
    { code: 'P', name: 'Proof gap (logic)',       fix: 'Rewrite using the 10-point proof checklist.' },
    { code: 'M', name: 'Misread the question',    fix: 'Restate the problem in your own words before solving.' },
    { code: 'S', name: 'Speed / time management',fix: 'Timed mini-sets; use the skip-and-return rule.' },
    { code: 'D', name: "Didn't try / gave up early", fix: 'Apply the stuck ladder strictly.' }
  ];

  /* ------------------------------------------------------------------
     DAILY SCORES AND SLEEPINESS SLOTS  (source Sections 23.2 and 13.4)
     The v3 sleepiness slots moved with the clock: 11:55, 16:15, 17:35.
     ------------------------------------------------------------------ */
  var DAILY_SCORES = [
    { key: 'sleepQuality', label: 'Sleep quality', min: 1, max: 5 },
    { key: 'energy',       label: 'Energy',        min: 1, max: 5 },
    { key: 'mood',         label: 'Mood',          min: 1, max: 5 },
    { key: 'focus',        label: 'Focus',         min: 1, max: 5 },
    { key: 'motivation',   label: 'Motivation',    min: 1, max: 5 }
  ];

  var SLEEPINESS_SLOTS = [
    { key: 'sleepiness1155', time: '11:55', label: 'Morning check' },
    { key: 'sleepiness1615', time: '16:15', label: 'Post-nap check' },
    { key: 'sleepiness1735', time: '17:35', label: 'Pre-workout check' }
  ];

  var SLEEPINESS_SCALE = [
    { value: 1, label: 'Alert' },
    { value: 2, label: 'Fine' },
    { value: 3, label: 'Slightly drowsy' },
    { value: 4, label: 'Fighting it' },
    { value: 5, label: 'Struggling to keep your eyes open' }
  ];

  /* ------------------------------------------------------------------
     FOM BLOCK PLAYBOOK  (source Section 9.1)
     ------------------------------------------------------------------ */
  var FOM_BLOCKS = [
    {
      id: 'fom1', name: 'FOM-1 · Learn', time: '08:25', length: 90,
      job: 'Understand and rebuild material',
      walksAway: 'Notes in your own words + 1–2 proofs reproduced from a blank page',
      steps: 'Set-up 5 → Part A 40 → micro-break 5 → Part B 35 → close-out 5'
    },
    {
      id: 'fom2', name: 'FOM-2 · Practice', time: '10:05', length: 90,
      job: 'Apply it under pressure',
      walksAway: 'A problem set, every problem marked C / H / X',
      steps: 'Pick problems 5 → Set A 40 → micro-break 5 → Set B 35 → mark C / H / X 5'
    },
    {
      id: 'fom3', name: 'FOM-3 · Prove & Lock', time: '18:50', length: 90,
      job: 'Write it properly: the day\'s key proof and the hardest problem',
      walksAway: 'One clean written proof + a Tier 2/3 attempt + a Milestone check',
      steps: 'Reset 5 → Part A 35 → micro-break 5 → Part B 35 → Milestone check 10'
    },
    {
      id: 'fom4', name: 'FOM-4 · Analysis', time: '20:30', length: 60,
      job: 'Entirely analysis: review your work → find all your mistakes → correct them',
      walksAway: 'A coded error log for the day, a corrected version of every flagged item, a tally',
      steps: 'Set-up 3 → Review 20 → Identify 15 → Correct 20 → close 2',
      analysisOnly: true
    }
  ];

  /* FOM-4 analysis protocol — source Section 9.13. */
  var FOM4_PROTOCOL = [
    { step: 'Set-up', minutes: 3, detail: 'Today\'s FOM-1 pages, the marked FOM-2 sets, the FOM-3 write-up, the Milestone Card, the error-log notebook, a pen in a different colour, and the 10-point checklist.' },
    { step: 'Review', minutes: 20, detail: 'Re-read every line of every proof and solution — not only the H and X ones. Underline anything you cannot justify in one phrase. Number each flag. Do not fix anything yet.' },
    { step: 'Identify', minutes: 15, detail: 'For each numbered flag write one line: date · where · code · cause. "Cause" means why you made the mistake, not what the right answer is.' },
    { step: 'Correct', minutes: 20, detail: 'Concept gaps (C) first, then proof gaps (P), then unsolved problems (X), then slips and misreads (A / M / S / T). Check against the source only after your own correction.' },
    { step: 'Close', minutes: 2, detail: 'Write the tally: flagged __ · corrected __ · to Doubt Log __. Set a re-solve date 3–7 days ahead for the hardest item.' }
  ];

  /* The weekly FOM-4 focus — source Section 9.13. */
  var FOM4_WEEKLY_FOCUS = {
    mon: 'The day\'s own work',
    tue: 'The day\'s own work',
    wed: 'The day\'s own work',
    thu: 'The day\'s work plus a spot-check of Monday\'s proofs for hidden gaps',
    fri: 'Week level: count the week\'s codes, find the most frequent one, choose the one improvement for next week'
  };

  /* The 10-point proof checklist — source Section 9.7. */
  var PROOF_CHECKLIST = [
    'Given vs. to-prove are both written out.',
    'Notation is defined before it is used.',
    'Method announced (direct, contradiction, induction, cases, construction…).',
    'Every step has a reason — a theorem, a definition, or an earlier line.',
    'Cases are exhaustive and (where it matters) disjoint.',
    'Quantifiers are right ("for all" vs "there exists").',
    'Edge cases are handled: 0, 1, negatives, the empty set, equality.',
    'No pattern-spotting dressed as proof. Three cases checked is not a proof.',
    'The conclusion matches the claim — word for word, not approximately.',
    'Grader test: read it as a sceptical examiner. Could they find a gap? If yes, fix it.'
  ];

  /* The retrieval queue — source Section 9.9. */
  var RETRIEVAL_BOXES = [
    { box: 1, review: 'next day', pass: '→ Box 2', fail: 'stay in Box 1' },
    { box: 2, review: '3 days',    pass: '→ Box 3', fail: 'back to Box 1' },
    { box: 3, review: '7 days',    pass: '→ Box 4', fail: 'back to Box 1' },
    { box: 4, review: '14 days',   pass: '→ Box 5', fail: 'back to Box 1' },
    { box: 5, review: '30 days',   pass: 'retire (re-check every 60–90 days)', fail: 'back to Box 1' }
  ];

  /* The "everything is finished before bed" check — source Section 13.6. */
  var WRAPUP_CHECKS = [
    { key: 'revTicked',   label: 'REV ticked',            detail: 'Tick the REV row on the Milestone Card.' },
    { key: 'cardWritten', label: "Tomorrow's card written", detail: 'Four minutes, written after REV has shown what is still fuzzy.' },
    { key: 'logFinished', label: 'Daily log finished',    detail: 'HIT counts, the sleepiness scores and the FOM-4 tally.' },
    { key: 'parkingClosed', label: 'Parking page closed',  detail: 'The worry dump is written and closed.' },
    { key: 'routineDone', label: 'Night routine done',    detail: 'Phone outside the room, alarms set, bag ready.' },
    { key: 'readingDone', label: 'Reading done',          detail: 'The paper book, in bed, by 00:25.' }
  ];

  /* The helper check-in — source Section 4.3. */
  var HELPER_CHECKIN_STEPS = [
    'Look at today\'s Milestone Card: HIT or MISS for each block so far.',
    'Look at the FOM-4 tally: mistakes found / mistakes corrected.',
    'He writes the five scores now. Two scores of 2 or lower → tomorrow is Yellow.',
    'Ask exactly one question: "What was the hardest ten minutes today?"',
    'Confirm tomorrow\'s mode, then leave — the free time starts.'
  ];

  /* ------------------------------------------------------------------
     WEEKDAY MASTER TIMELINE  (source Section 6.1 — 28 blocks)
     Mon–Fri. `id` is stable and is the key used by stored daily logs, so it
     must never change without a deliberate migration.
     ------------------------------------------------------------------ */
  var WEEKDAY_BLOCKS = [
    { id: 'wake',        start: '08:00', end: '08:25', title: 'Wake-up + slow morning',   category: 'Recovery',    type: 'RECOVERY', purpose: 'Water, wash, mobility, plan the day, daylight, 60-second check — no phone, no screens.' },
    { id: 'fom1',        start: '08:25', end: '09:55', title: 'FOM-1 · Learn',            category: 'Study',       type: 'DEEP',     purpose: 'Hardest new thinking, fresh brain.', milestone: true, subject: 'FOM' },
    { id: 'break1',      start: '09:55', end: '10:05', title: 'Break 1',                  category: 'Break',       type: 'RECOVERY', purpose: 'Step outside, drink, look far away.' },
    { id: 'fom2',        start: '10:05', end: '11:35', title: 'FOM-2 · Practice',         category: 'Study',       type: 'DEEP',     purpose: 'Apply what FOM-1 built; mark every problem C / H / X.', milestone: true, subject: 'FOM' },
    { id: 'breakfast',   start: '11:35', end: '11:55', title: 'Breakfast',                category: 'Breakfast',   type: 'FUEL',     purpose: 'A proper meal, 15–20 minutes, no bath.' },
    { id: 'phy',         start: '11:55', end: '13:15', title: 'PHY · Physics',            category: 'Study',       type: 'STUDY',    purpose: 'One deep block; the day\'s rotation (Section 10.2).', milestone: true, subject: 'PHY' },
    { id: 'break2',      start: '13:15', end: '13:45', title: 'Break 2 + mini-nap',      category: 'Break',       type: 'RECOVERY', purpose: '10–15 minutes of that is a mini-nap; then water and fresh air.' },
    { id: 'che',         start: '13:45', end: '15:05', title: 'CHE · Chemistry',          category: 'Study',       type: 'STUDY',    purpose: 'One deep block; Physical / Organic / Inorganic (Section 10.3).', milestone: true, subject: 'CHE' },
    { id: 'lunch',       start: '15:05', end: '15:35', title: 'Lunch',                    category: 'Lunch',       type: 'FUEL',     purpose: 'Moderate — fuel, not a food coma.' },
    { id: 'nap1',        start: '15:35', end: '16:05', title: 'Nap 1',                    category: 'Nap',         type: 'RECOVERY', purpose: 'Alarm on, dim room, up on the alarm. Never longer than 30 minutes.' },
    { id: 'reset',       start: '16:05', end: '16:15', title: 'Reset',                    category: 'Recovery',    type: 'RECOVERY', purpose: 'Water, face wash, light, standing stretches.' },
    { id: 'ce',          start: '16:15', end: '17:35', title: 'C+E · Computer + English', category: 'Study',       type: 'STUDY',    purpose: 'CS 40 + ENG 40, in the day\'s order (Section 5.1).', milestone: true, subject: 'C+E' },
    { id: 'break3',      start: '17:35', end: '17:45', title: 'Break 3',                  category: 'Break',       type: 'RECOVERY', purpose: 'Break only — no snack. Fresh air, move.' },
    { id: 'rest2',       start: '17:45', end: '17:55', title: 'Rest 2',                   category: 'Recovery',    type: 'RECOVERY', purpose: 'Eyes-closed rest — a rest, never a nap.' },
    { id: 'workout',     start: '17:55', end: '18:30', title: 'Workout',                  category: 'Workout',     type: 'MOVE',     purpose: 'The hinge of the day: strength, cardio or mobility (Section 14.1).', subject: 'Workout' },
    { id: 'fuel',        start: '18:30', end: '18:50', title: 'Bath + light fuel',        category: 'Fuel',        type: 'FUEL',     purpose: 'Bath, then fruit / curd / nuts — a real small meal.' },
    { id: 'fom3',        start: '18:50', end: '20:20', title: 'FOM-3 · Prove & Lock',     category: 'Study',       type: 'DEEP',     purpose: 'Evening peak, right after the workout and bath.', milestone: true, subject: 'FOM' },
    { id: 'break4',      start: '20:20', end: '20:30', title: 'Break 4',                  category: 'Break',       type: 'RECOVERY', purpose: 'Decompress, no screens.' },
    { id: 'fom4',        start: '20:30', end: '21:30', title: 'FOM-4 · Analysis',         category: 'Analysis',    type: 'DEEP-LITE', purpose: 'Review your work → find all your mistakes → correct them. Nothing else lives in it.', milestone: true, subject: 'FOM', always: true },
    { id: 'helper',      start: '21:30', end: '21:35', title: 'Helper check-in',          category: 'Recovery',    type: 'RECOVERY', purpose: "Today's card, the FOM-4 tally, the five scores, the one question (Section 4.3)." },
    { id: 'freeeve',     start: '21:35', end: '21:55', title: 'Free time',                category: 'Free',        type: 'FREE',     purpose: 'Family, music — no study.' },
    { id: 'dinner',      start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',      type: 'FUEL',     purpose: 'Fixed family window — light-to-moderate. Screens off for the night.' },
    { id: 'rev',         start: '22:30', end: '23:40', title: 'REV · Revision',           category: 'Revision',    type: 'STUDY',    purpose: 'REV-M Maths 40 + REV-A all other subjects 30 (book reading). Paper only; no new hard problems.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'wrapup',      start: '23:40', end: '23:50', title: 'Night wrap-up',            category: 'Recovery',    type: 'RECOVERY', purpose: 'Tick REV · write tomorrow\'s Milestone Card · finish the daily log · parking-page worry dump.' },
    { id: 'nightroutine',start: '23:50', end: '00:00', title: 'Night routine',            category: 'Recovery',    type: 'RECOVERY', purpose: 'Brush, wash, dim lights, phone outside the room, alarms set.' },
    { id: 'reading',     start: '00:00', end: '00:25', title: 'Bedtime reading',          category: 'Recovery',    type: 'RECOVERY', purpose: 'In bed, paper book, English preferred — the last activity of the day. Stop alarm at 00:25.' },
    { id: 'lightout',    start: '00:25', end: '00:30', title: 'Lights-out prep',          category: 'Recovery',    type: 'RECOVERY', purpose: 'Glasses off, lights off. Lights-out 00:30 (window 00:20–00:40; never later).' },
    { id: 'sleep',       start: '00:30', end: '08:00', title: 'Sleep',                    category: 'Night Sleep', type: 'RECOVERY', purpose: '7 h 30 m — fixed every night. With Nap 1 and the mini-nap ≈ 8 h asleep per 24.', anchor: true }
  ];

  /* Weekday content rotation (source Section 5.1). */
  var WEEKDAY_VARIANTS = {
    mon: {
      theme: 'Launch',
      fom1: 'New section', fom2: 'Tier 1 → 2', fom3: 'Prove the first key result',
      fom4: 'Review Monday\'s work · find all mistakes · correct them',
      phy: 'Concept intake', che: 'Physical', ce: 'CS 40 (new idea) → ENG 40 (writing)', workout: 'Strength A'
    },
    tue: {
      theme: 'Build',
      fom1: 'Finish section', fom2: 'Tier 2', fom3: 'Prove + a second look at an H problem',
      fom4: 'Same, on Tuesday\'s work',
      phy: 'Numerical day', che: 'Organic', ce: 'ENG 40 (reading + vocabulary) → CS 40 (practice)', workout: 'Steady cardio'
    },
    wed: {
      theme: 'Deepen',
      fom1: 'Connections to earlier modules', fom2: 'Tier 2 + first Tier 3', fom3: 'Write the Tier 3 solution',
      fom4: 'Same, on Wednesday\'s work',
      phy: 'Concept deepening', che: 'Inorganic', ce: 'CS 40 (problem-solving) → ENG 40 (speaking)', workout: 'Strength B + core'
    },
    thu: {
      theme: 'Proof day',
      fom1: 'Proof-heavy reading', fom2: 'Tier 3 set', fom3: 'Rewrite the weakest proof',
      fom4: 'Same, plus a spot-check of Monday\'s proofs',
      phy: 'Board-writing day', che: 'Physical numericals', ce: 'ENG 40 (grammar + board) → CS 40 (board CS)', workout: 'Intervals or sport'
    },
    fri: {
      theme: 'Integrate',
      fom1: 'Spaced retrieval (blank page)', fom2: 'Mixed timed set', fom3: 'Lock the week\'s best two results',
      fom4: 'Week-level analysis: the week\'s top error code → one improvement',
      phy: 'JEE-style timed mix', che: 'Organic practice + Inorganic recall', ce: 'CS 40 (algorithms / number theory) → ENG 40 (listening)', workout: 'Mobility + core'
    }
  };

  /* ------------------------------------------------------------------
     SATURDAY MASTER TIMELINE  (source Section 7.1 — 20 blocks)
     ------------------------------------------------------------------ */
  var SATURDAY_BLOCKS = [
    { id: 'wake',        start: '08:00', end: '08:30', title: 'Wake-up + slow morning',    category: 'Recovery',    type: 'RECOVERY', purpose: 'Slower start, 8-minute mobility, card read aloud.' },
    { id: 's1',          start: '08:30', end: '10:00', title: 'S1 · Milestone attempt (unaided)', category: 'Study', type: 'DEEP', purpose: "The week's checkable result, from a blank page.", milestone: true, subject: 'FOM' },
    { id: 'break1',      start: '10:00', end: '10:15', title: 'Break',                     category: 'Break',       type: 'RECOVERY', purpose: 'Move, water.' },
    { id: 's2',          start: '10:15', end: '11:45', title: 'S2 · Weekly timed set',     category: 'Study',       type: 'DEEP', purpose: 'Exam-style problems under real conditions — no analysis yet.', milestone: true, subject: 'FOM' },
    { id: 'breakfast',   start: '11:45', end: '12:05', title: 'Breakfast',                 category: 'Breakfast',   type: 'FUEL', purpose: 'No bath — the bath comes after the Free Zone sport.' },
    { id: 'pcm',         start: '12:05', end: '13:05', title: 'PCM weekly check',          category: 'Study',       type: 'STUDY', purpose: 'Physics 30 + Chemistry 30: closed-book mini-test, then fix.', milestone: true, subject: 'PCM' },
    { id: 'break2',      start: '13:05', end: '13:20', title: 'Break',                     category: 'Break',       type: 'RECOVERY', purpose: 'Outdoors.' },
    { id: 'ce',          start: '13:20', end: '14:05', title: 'C+E · Code & write',        category: 'Study',       type: 'STUDY', purpose: 'CS 25 + English 20 — one small thing finished.', milestone: true, subject: 'C+E' },
    { id: 'lunch',       start: '14:05', end: '14:35', title: 'Lunch',                     category: 'Lunch',       type: 'FUEL', purpose: 'With family if possible.' },
    { id: 'nap1',        start: '14:35', end: '15:05', title: 'Nap 1',                     category: 'Nap',         type: 'RECOVERY', purpose: 'Thirty minutes, as on weekdays.' },
    { id: 'reset',       start: '15:05', end: '15:15', title: 'Reset',                     category: 'Recovery',    type: 'RECOVERY', purpose: 'Water, light.' },
    { id: 'freezone',    start: '15:15', end: '21:55', title: 'FREE ZONE',                 category: 'Free Zone',   type: 'FREE', purpose: 'Six hours forty — sport (this is the workout, with a bath after it), outdoors, friends, family, hobbies. No study. Protected like a class.', anchor: true },
    { id: 'dinner',      start: '21:55', end: '22:30', title: 'Dinner',                    category: 'Dinner',      type: 'FUEL', purpose: 'Fixed window, with family. Screens off for the night.' },
    { id: 'revw',        start: '22:30', end: '22:55', title: 'REV-W · closing revision', category: 'Revision',    type: 'STUDY', purpose: 'Maths 10 · Physics 5 · Chemistry 5 · CS 2 · English 3 — the day\'s subjects, from the day\'s pages.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'wrapup',      start: '22:55', end: '23:05', title: 'Night wrap-up',             category: 'Recovery',    type: 'RECOVERY', purpose: 'Tick REV-W · write Sunday\'s Milestone Card · daily log · parking-page worry dump.' },
    { id: 'freeeve',     start: '23:05', end: '23:35', title: 'Free evening',              category: 'Free',        type: 'FREE', purpose: 'No study, no screens — family, music.' },
    { id: 'nightroutine',start: '23:35', end: '23:45', title: 'Night routine',             category: 'Recovery',    type: 'RECOVERY', purpose: 'Brush, wash, dim lights, phone outside, alarms set.' },
    { id: 'reading',     start: '23:45', end: '00:25', title: 'Bedtime reading',           category: 'Recovery',    type: 'RECOVERY', purpose: 'In bed, paper book. Stop alarm at 00:25.' },
    { id: 'lightout',    start: '00:25', end: '00:30', title: 'Lights-out prep',           category: 'Recovery',    type: 'RECOVERY', purpose: 'Glasses off, lights off. Lights-out 00:30 (window 00:20–00:40; never later).' },
    { id: 'sleep',       start: '00:30', end: '08:00', title: 'Sleep',                     category: 'Night Sleep', type: 'RECOVERY', purpose: '7 h 30 m — fixed every night.', anchor: true }
  ];

  /* ------------------------------------------------------------------
     SUNDAY MASTER TIMELINE  (source Section 8.1 — 22 blocks)
     ------------------------------------------------------------------ */
  var SUNDAY_BLOCKS = [
    { id: 'wake',        start: '08:00', end: '08:30', title: 'Wake-up + slow morning',      category: 'Recovery',    type: 'RECOVERY', purpose: 'Slow start; 60-second check; read the card aloud.' },
    { id: 's3',          start: '08:30', end: '09:45', title: 'S3 · Analysis & rewrite',     category: 'Analysis',    type: 'DEEP-LITE', purpose: 'Learn from Saturday\'s timed set; two model solutions.', milestone: true, subject: 'FOM' },
    { id: 'break1',      start: '09:45', end: '10:00', title: 'Break',                       category: 'Break',       type: 'RECOVERY', purpose: 'Move, water.' },
    { id: 's4',          start: '10:00', end: '10:45', title: 'S4 · Recall without notes',   category: 'Study',       type: 'MEDIUM', purpose: 'The week\'s key results from a blank page.', milestone: true, subject: 'FOM' },
    { id: 'breakfast',   start: '10:45', end: '11:05', title: 'Breakfast',                   category: 'Breakfast',   type: 'FUEL', purpose: 'No bath — it comes after the Free Zone.' },
    { id: 'ce',          start: '11:05', end: '11:35', title: 'C+E · Calm literacy',          category: 'Study',       type: 'LIGHT', purpose: 'English reading for pleasure or a light CS review.', milestone: true, subject: 'C+E' },
    { id: 'freezonea',   start: '11:35', end: '14:00', title: 'FREE ZONE A',                 category: 'Free Zone',   type: 'FREE', purpose: 'Long walk or cycle, sport, family — no study.', anchor: true },
    { id: 'lunch',       start: '14:00', end: '14:30', title: 'Lunch',                       category: 'Lunch',       type: 'FUEL', purpose: 'With family.' },
    { id: 'nap1',        start: '14:30', end: '15:00', title: 'Nap 1',                       category: 'Nap',         type: 'RECOVERY', purpose: 'Thirty minutes.' },
    { id: 'reset',       start: '15:00', end: '15:10', title: 'Reset',                       category: 'Recovery',    type: 'RECOVERY', purpose: 'Water, light.' },
    { id: 'freezoneb',   start: '15:10', end: '19:15', title: 'FREE ZONE B',                 category: 'Free Zone',   type: 'FREE', purpose: 'Anything that isn\'t study; bath after any sport.', anchor: true },
    { id: 'weekly',      start: '19:15', end: '20:00', title: 'Weekly Review & planning',   category: 'Planning',    type: 'PLANNING', purpose: 'Energy Dashboard 5 · Review 15 · Plan next week 10 · Helper sync 15.', milestone: true, subject: 'Review' },
    { id: 'mondayprep',  start: '20:00', end: '20:15', title: 'Monday prep',                 category: 'Recovery',    type: 'RECOVERY', purpose: 'Bag, alarms, clothes, Monday\'s seeds.' },
    { id: 'family',      start: '20:15', end: '21:55', title: 'Family evening',              category: 'Free',        type: 'FREE', purpose: 'Film, games, people. No study.' },
    { id: 'dinner',      start: '21:55', end: '22:30', title: 'Dinner',                      category: 'Dinner',      type: 'FUEL', purpose: 'Fixed window, with family. Screens off for the night.' },
    { id: 'revw',        start: '22:30', end: '22:50', title: 'REV-W · closing revision',   category: 'Revision',    type: 'STUDY', purpose: 'Maths 10 · Physics 3 · Chemistry 3 · CS 2 · English 2 — the week\'s weak spots from the "Still fuzzy" lists.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'wrapup',      start: '22:50', end: '23:00', title: 'Night wrap-up',               category: 'Recovery',    type: 'RECOVERY', purpose: 'Tick REV-W · write Monday\'s Milestone Card · daily log · parking-page worry dump.' },
    { id: 'winddown',    start: '23:00', end: '23:30', title: 'Free / wind-down',            category: 'Free',        type: 'FREE', purpose: 'No study, no screens.' },
    { id: 'nightroutine',start: '23:30', end: '23:40', title: 'Night routine',               category: 'Recovery',    type: 'RECOVERY', purpose: 'Brush, wash, dim lights, Monday\'s alarms checked.' },
    { id: 'reading',     start: '23:40', end: '00:25', title: 'Bedtime reading',             category: 'Recovery',    type: 'RECOVERY', purpose: 'In bed, paper book. Stop alarm at 00:25.' },
    { id: 'lightout',    start: '00:25', end: '00:30', title: 'Lights-out prep',             category: 'Recovery',    type: 'RECOVERY', purpose: 'Glasses off, lights off. Lights-out 00:30 (window 00:20–00:40; never later).' },
    { id: 'sleep',       start: '00:30', end: '08:00', title: 'Sleep',                       category: 'Night Sleep', type: 'RECOVERY', purpose: '7 h 30 m — fixed every night.', anchor: true }
  ];

  /* ------------------------------------------------------------------
     TEMPLATES
     The three master timelines. `days` holds the JavaScript day numbers
     each template owns (0 = Sunday).
     ------------------------------------------------------------------ */
  var TEMPLATES = {
    weekday: {
      id: 'weekday',
      label: 'Weekday',
      shortLabel: 'Mon–Fri',
      days: [1, 2, 3, 4, 5],                 // JavaScript day numbers
      theme: 'Standard study day',
      plannedStudyMinutes: 640,
      blocks: WEEKDAY_BLOCKS,
      variants: WEEKDAY_VARIANTS
    },
    saturday: {
      id: 'saturday',
      label: 'Saturday',
      shortLabel: 'Sat',
      days: [6],
      theme: 'Milestone day',
      plannedStudyMinutes: 310,
      blocks: SATURDAY_BLOCKS
    },
    sunday: {
      id: 'sunday',
      label: 'Sunday',
      shortLabel: 'Sun',
      days: [0],
      theme: 'Review and reset',
      plannedStudyMinutes: 215,
      blocks: SUNDAY_BLOCKS
    }
  };

  /* ------------------------------------------------------------------
     WEEKDAY · LITE  (source Section 27.2, rung 2)
     FOM-4 30 · REV 50 · PHY / CHE 70 each · C+E 70 = 560 minutes.
     The 80 freed minutes become a longer Break 2, a longer Break 3, a
     longer free time before dinner and an earlier lights-out (00:10).
     ------------------------------------------------------------------ */
  var WEEKDAY_LITE_BLOCKS = [
    { id: 'wake',        start: '08:00', end: '08:25', title: 'Wake-up + slow morning',   category: 'Recovery',    type: 'RECOVERY', purpose: 'As usual. Do the 60-second check and choose the mode.' },
    { id: 'fom1',        start: '08:25', end: '09:55', title: 'FOM-1 · Learn',            category: 'Study',       type: 'DEEP', purpose: 'Hardest new thinking, fresh brain.', milestone: true, subject: 'FOM' },
    { id: 'break1',      start: '09:55', end: '10:05', title: 'Break 1',                  category: 'Break',       type: 'RECOVERY', purpose: 'Step outside, drink, look far away.' },
    { id: 'fom2',        start: '10:05', end: '11:35', title: 'FOM-2 · Practice',         category: 'Study',       type: 'DEEP', purpose: 'Apply what FOM-1 built; mark every problem C / H / X.', milestone: true, subject: 'FOM' },
    { id: 'breakfast',   start: '11:35', end: '11:55', title: 'Breakfast',                category: 'Breakfast',   type: 'FUEL', purpose: 'A proper meal, 15–20 minutes, no bath.' },
    { id: 'phy',         start: '11:55', end: '13:05', title: 'PHY · Physics (short)',    category: 'Study',       type: 'STUDY', purpose: 'The day\'s rotation, 70 minutes instead of 80.', milestone: true, subject: 'PHY' },
    { id: 'break2',      start: '13:05', end: '13:45', title: 'Break 2 + mini-nap',      category: 'Break',       type: 'RECOVERY', purpose: '30 minutes, with 10 minutes of breathing room added.' },
    { id: 'che',         start: '13:45', end: '14:55', title: 'CHE · Chemistry (short)',  category: 'Study',       type: 'STUDY', purpose: 'Physical / Organic / Inorganic, 70 minutes instead of 80.', milestone: true, subject: 'CHE' },
    { id: 'lunch',       start: '14:55', end: '15:25', title: 'Lunch',                    category: 'Lunch',       type: 'FUEL', purpose: 'Moderate — fuel, not a food coma.' },
    { id: 'nap1',        start: '15:25', end: '15:55', title: 'Nap 1',                    category: 'Nap',         type: 'RECOVERY', purpose: 'As usual — it bends by at most ±15 minutes.' },
    { id: 'reset',       start: '15:55', end: '16:05', title: 'Reset',                    category: 'Recovery',    type: 'RECOVERY', purpose: 'Water, face wash, light, standing stretches.' },
    { id: 'ce',          start: '16:05', end: '17:15', title: 'C+E · Computer + English', category: 'Study',       type: 'STUDY', purpose: 'CS 35 + ENG 35, in the day\'s order.', milestone: true, subject: 'C+E' },
    { id: 'break3',      start: '17:15', end: '17:40', title: 'Break 3 (longer)',         category: 'Break',       type: 'RECOVERY', purpose: 'Break only — no snack. Fresh air, move.' },
    { id: 'rest2',       start: '17:40', end: '17:50', title: 'Rest 2',                   category: 'Recovery',    type: 'RECOVERY', purpose: 'Eyes-closed rest — a rest, never a nap.' },
    { id: 'workout',     start: '17:50', end: '18:25', title: 'Workout',                  category: 'Workout',     type: 'MOVE', purpose: 'Keep it, but easier.', subject: 'Workout' },
    { id: 'fuel',        start: '18:25', end: '18:45', title: 'Bath + light fuel',        category: 'Fuel',        type: 'FUEL', purpose: 'Bath, then fruit / curd / nuts.' },
    { id: 'fom3',        start: '18:45', end: '20:15', title: 'FOM-3 · Prove & Lock',     category: 'Study',       type: 'DEEP', purpose: 'Evening peak, right after the workout and bath.', milestone: true, subject: 'FOM' },
    { id: 'break4',      start: '20:15', end: '20:25', title: 'Break 4',                  category: 'Break',       type: 'RECOVERY', purpose: 'Decompress, no screens.' },
    { id: 'fom4',        start: '20:25', end: '20:55', title: 'FOM-4 · Analysis (short)', category: 'Analysis',    type: 'DEEP-LITE', purpose: "Today's X problems and the weakest proof only: review → identify → correct, compressed.", milestone: true, subject: 'FOM', always: true },
    { id: 'helper',      start: '20:55', end: '21:00', title: 'Helper check-in',          category: 'Recovery',    type: 'RECOVERY', purpose: "Today's card so far, the FOM-4 tally, the five scores." },
    { id: 'freeeve',     start: '21:00', end: '21:55', title: 'Free time (longer)',       category: 'Free',        type: 'FREE', purpose: 'Family, music — no study.' },
    { id: 'dinner',      start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',      type: 'FUEL', purpose: 'Fixed family window — light-to-moderate.' },
    { id: 'rev',         start: '22:30', end: '23:20', title: 'REV (short) — last block', category: 'Revision',    type: 'STUDY', purpose: 'Maths 30 + all other subjects 20 (book reading). Paper only.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'wrapup',      start: '23:20', end: '23:30', title: 'Night wrap-up',            category: 'Recovery',    type: 'RECOVERY', purpose: 'Tick REV · tomorrow\'s card · log · worry dump.' },
    { id: 'nightroutine',start: '23:30', end: '23:40', title: 'Night routine',            category: 'Recovery',    type: 'RECOVERY', purpose: 'Brush, wash, dim lights, phone outside the room.' },
    { id: 'reading',     start: '23:40', end: '00:00', title: 'Bedtime reading',          category: 'Recovery',    type: 'RECOVERY', purpose: 'In bed, paper book.' },
    { id: 'lightout',    start: '00:00', end: '00:10', title: 'Lights-out prep',          category: 'Recovery',    type: 'RECOVERY', purpose: 'Glasses off, lights off. Lights-out 00:10 on a Modified Load day.' },
    { id: 'sleep',       start: '00:10', end: '08:00', title: 'Sleep',                    category: 'Night Sleep', type: 'RECOVERY', purpose: '7 h 50 m — earlier on purpose.', anchor: true }
  ];

  /* ------------------------------------------------------------------
     WEEKDAY · YELLOW  (source Section 22.3 — 24 blocks, verbatim)
     ------------------------------------------------------------------ */
  var WEEKDAY_YELLOW_BLOCKS = [
    { id: 'wake',        start: '08:00', end: '08:30', title: 'Wake-up + slow morning',   category: 'Recovery',    type: 'RECOVERY', purpose: 'As usual. Do the 60-second check and choose Recovery Plan.' },
    { id: 'fom1',        start: '08:30', end: '09:30', title: 'FOM-1 · Learn (short)',    category: 'Study',       type: 'DEEP', purpose: 'Reading + one reconstruction. Skip the second.', milestone: true, subject: 'FOM' },
    { id: 'break1',      start: '09:30', end: '09:45', title: 'Break 1',                  category: 'Break',       type: 'RECOVERY', purpose: 'Step outside.' },
    { id: 'fom2',        start: '09:45', end: '10:45', title: 'FOM-2 · Practice (short)', category: 'Study',       type: 'DEEP', purpose: 'Tier 1–2 only. No Tier 3 today.', milestone: true, subject: 'FOM' },
    { id: 'breakfast',   start: '10:45', end: '11:05', title: 'Breakfast',                category: 'Breakfast',   type: 'FUEL', purpose: 'Unhurried.' },
    { id: 'phy',         start: '11:05', end: '11:55', title: 'PHY (short)',              category: 'Study',       type: 'STUDY', purpose: 'Part A + 3 problems.', milestone: true, subject: 'PHY' },
    { id: 'break2',      start: '11:55', end: '12:10', title: 'Break',                    category: 'Break',       type: 'RECOVERY', purpose: 'Outdoors.' },
    { id: 'che',         start: '12:10', end: '13:00', title: 'CHE (short)',              category: 'Study',       type: 'STUDY', purpose: 'Part A + 3 problems, or flashcards.', milestone: true, subject: 'CHE' },
    { id: 'recovery',    start: '13:00', end: '14:20', title: 'Recovery menu',            category: 'Recovery',    type: 'RECOVERY', purpose: 'Replaces the afternoon blocks. Pick two: sunlight walk (20) · music or a hobby (30) · stretching or yoga (15) · a chat with family.' },
    { id: 'lunch',       start: '14:20', end: '14:50', title: 'Lunch',                    category: 'Lunch',       type: 'FUEL', purpose: 'Moderate.' },
    { id: 'nap1',        start: '14:50', end: '15:20', title: 'Nap 1',                    category: 'Nap',         type: 'RECOVERY', purpose: 'As usual.' },
    { id: 'reset',       start: '15:20', end: '15:30', title: 'Reset',                    category: 'Recovery',    type: 'RECOVERY', purpose: '—' },
    { id: 'ce',          start: '15:30', end: '16:00', title: 'C+E (mini)',               category: 'Study',       type: 'STUDY', purpose: 'One item only: English reading for pleasure or a 25-minute CS review.', milestone: true, subject: 'C+E' },
    { id: 'freeeve',     start: '16:00', end: '20:15', title: 'Free time + easy movement', category: 'Free',      type: 'FREE', purpose: 'A 20–30 minute easy walk replaces the workout; bath and a real light-fuel snack.' },
    { id: 'fom4',        start: '20:15', end: '20:45', title: 'FOM-4 · Analysis (short)', category: 'Analysis',    type: 'DEEP-LITE', purpose: "Today's X problems and the weakest proof only: review → identify → correct, compressed.", milestone: true, subject: 'FOM', always: true },
    { id: 'helper',      start: '20:45', end: '20:50', title: 'Helper check-in',          category: 'Recovery',    type: 'RECOVERY', purpose: 'Card so far, FOM-4 tally, five scores.' },
    { id: 'freeeve2',    start: '20:50', end: '21:55', title: 'Free time',                category: 'Free',        type: 'FREE', purpose: 'No study.' },
    { id: 'dinner',      start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',      type: 'FUEL', purpose: 'Fixed window, light. Screens off.' },
    { id: 'rev',         start: '22:30', end: '23:10', title: 'REV (short) — still the last study block', category: 'Revision', type: 'STUDY', purpose: 'Maths 25 (queue 15 + recall 10) + others 15 (Physics 5 · Chemistry 5 · CS / English 5).', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'wrapup',      start: '23:10', end: '23:20', title: 'Night wrap-up',            category: 'Recovery',    type: 'RECOVERY', purpose: 'Tick REV · tomorrow\'s card (pick the smaller of two seeds) · log · worry dump.' },
    { id: 'nightroutine',start: '23:20', end: '23:30', title: 'Night routine',            category: 'Recovery',    type: 'RECOVERY', purpose: '—' },
    { id: 'reading',     start: '23:30', end: '00:00', title: 'Bedtime reading',          category: 'Recovery',    type: 'RECOVERY', purpose: 'In bed, paper book.' },
    { id: 'lightout',    start: '00:00', end: '00:10', title: 'Wind-down + lights-out prep', category: 'Recovery', type: 'RECOVERY', purpose: 'Glasses off, lights off. Lights-out 00:10.' },
    { id: 'sleep',       start: '00:10', end: '08:00', title: 'Sleep',                    category: 'Night Sleep', type: 'RECOVERY', purpose: '7 h 50 m — earlier on purpose.', anchor: true }
  ];

  /* ------------------------------------------------------------------
     WEEKDAY · RED  (source Section 22.4 — 19 blocks, verbatim)
     ------------------------------------------------------------------ */
  var WEEKDAY_RED_BLOCKS = [
    { id: 'backbed',     start: '08:00', end: '08:45', title: 'Back to bed',              category: 'Recovery',    type: 'RECOVERY', purpose: 'After the check, go back to bed to rest.' },
    { id: 'wake',        start: '08:45', end: '09:15', title: 'Slow wake-up routine',     category: 'Recovery',    type: 'RECOVERY', purpose: 'Water, wash, natural light. Skip the mobility routine if you do not feel like it.' },
    { id: 'fom1',        start: '09:15', end: '09:45', title: 'Gentle FOM touch',         category: 'Study',       type: 'DEEP', purpose: 'One Tier 1 problem, or re-read yesterday\'s notes. The streak keeper.', milestone: true, subject: 'FOM' },
    { id: 'breakfast',   start: '09:45', end: '10:30', title: 'Breakfast + bath',         category: 'Breakfast',   type: 'FUEL', purpose: 'Slow.' },
    { id: 'walk',        start: '10:30', end: '11:30', title: 'Outdoor walk / stretch',   category: 'Recovery',    type: 'RECOVERY', purpose: 'Natural light, no phone.' },
    { id: 'freeeve',     start: '11:30', end: '14:30', title: 'Free time',                category: 'Free',        type: 'FREE', purpose: 'Hobby, music, family. Not a screen binge.' },
    { id: 'lunch',       start: '14:30', end: '15:00', title: 'Lunch',                    category: 'Lunch',       type: 'FUEL', purpose: '—' },
    { id: 'nap1',        start: '15:00', end: '15:30', title: 'Nap 1',                    category: 'Nap',         type: 'RECOVERY', purpose: '—' },
    { id: 'reset',       start: '15:30', end: '15:40', title: 'Reset',                    category: 'Recovery',    type: 'RECOVERY', purpose: '—' },
    { id: 'freeeve2',    start: '15:40', end: '20:45', title: 'Free time',                category: 'Free',        type: 'FREE', purpose: 'No study.' },
    { id: 'helper',      start: '20:45', end: '20:50', title: 'Helper check-in',          category: 'Recovery',    type: 'RECOVERY', purpose: 'One sentence about how you feel.' },
    { id: 'freeeve3',    start: '20:50', end: '21:55', title: 'Free time',                category: 'Free',        type: 'FREE', purpose: '—' },
    { id: 'dinner',      start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',      type: 'FUEL', purpose: 'Fixed window.' },
    { id: 'rev',         start: '22:30', end: '22:45', title: 'REV-lite — still the last study block', category: 'Revision', type: 'STUDY', purpose: 'Ten cards from any subjects, nothing else.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'wrapup',      start: '22:45', end: '22:55', title: 'Night wrap-up',            category: 'Recovery',    type: 'RECOVERY', purpose: 'Tick REV-lite · choose tomorrow\'s mode · a tiny card · worry dump.' },
    { id: 'nightroutine',start: '22:55', end: '23:05', title: 'Night routine',            category: 'Recovery',    type: 'RECOVERY', purpose: '—' },
    { id: 'reading',     start: '23:05', end: '23:35', title: 'Bedtime reading',          category: 'Recovery',    type: 'RECOVERY', purpose: 'In bed, paper book.' },
    { id: 'winddown',    start: '23:35', end: '00:00', title: 'Wind-down',                category: 'Recovery',    type: 'RECOVERY', purpose: 'No screens.' },
    { id: 'sleep',       start: '00:00', end: '08:00', title: 'Sleep',                    category: 'Night Sleep', type: 'RECOVERY', purpose: '8 h — earlier on purpose.', anchor: true }
  ];

  var MODE_TIMELINES = {
    weekday: {
      lite:   WEEKDAY_LITE_BLOCKS,
      yellow: WEEKDAY_YELLOW_BLOCKS,
      red:    WEEKDAY_RED_BLOCKS
    }
  };

  /* Weekend reduction rules. `durations` sets a new length in minutes (0 drops
     the block); `absorbers` lists the Free / Free Zone blocks that take the
     freed minutes, in the order the freed time reaches them.
     The source gives no separate weekend mode tables: the weekend version is
     scaled to the day's load (Section 2.3), so these mirror the weekday
     reductions in the same proportions the source uses. */
  var MODE_RULES = {
    saturday: {
      lite:   { durations: { s1: 90, s2: 60, pcm: 40, ce: 40, revw: 20 }, absorbers: ['freezone', 'freeeve'] },
      yellow: { durations: { s1: 60, s2: 60, pcm: 30, ce: 30, revw: 15 },  absorbers: ['freezone', 'freeeve'] },
      red:    { durations: { s1: 30, s2: 0,  pcm: 0,  ce: 0,  revw: 15 },  absorbers: ['freezone', 'freeeve'] }
    },
    sunday: {
      lite:   { durations: { s3: 60, s4: 40, ce: 25, weekly: 30, revw: 15 },  absorbers: ['freezonea', 'freezoneb', 'family', 'winddown'] },
      yellow: { durations: { s3: 45, s4: 30, ce: 25, weekly: 30, revw: 15 },  absorbers: ['freezonea', 'freezoneb', 'family', 'winddown'] },
      red:    { durations: { s3: 30, s4: 0,  ce: 0,  weekly: 15, revw: 15 },  absorbers: ['freezonea', 'freezoneb', 'family', 'winddown'] }
    }
  };

  /** Turn "HH:MM" minutes past midnight into a clock string. */
  function minutesToClock(mins) {
    var m = ((mins % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  /**
   * Reduce a template to a mode's schedule.
   * Freed minutes flow forward to the next absorber; anything still pending at
   * the end of the day extends the sleep block, so lights-out only moves earlier.
   */
  function reduceTemplate(template, rules) {
    var dropped = {};
    Object.keys(rules.durations).forEach(function (id) {
      if (rules.durations[id] === 0) dropped[id] = true;
    });
    var absorberSet = (rules.absorbers || []).filter(function (id) { return !dropped[id]; });
    var absorberIndex = 0;

    var out = [];
    var pending = 0;

    template.blocks.forEach(function (src) {
      var dur = duration(src.start, src.end);
      var target = rules.durations[src.id];

      /* A dropped block frees its whole length. */
      if (target === 0) { pending += dur; return; }

      var minutes = dur;
      if (target !== undefined) { pending += dur - target; minutes = target; }

      /* The next absorber in line takes whatever is pending right now, so the
         anchors further down the day (dinner, lights-out) stay put. */
      if (absorberIndex < absorberSet.length && absorberSet[absorberIndex] === src.id) {
        minutes += pending;
        pending = 0;
        absorberIndex++;
      }

      out.push({ src: src, minutes: minutes });
    });

    /* Anything still pending extends the sleep block, so lights-out only ever
       moves earlier — never later. */
    if (pending > 0) {
      for (var i = out.length - 1; i >= 0; i--) {
        if (out[i].src.id === 'sleep') { out[i].minutes += pending; break; }
      }
    }

    /* Pack the day sequentially from the first block's start time. */
    var cursor = toMinutes(template.blocks[0].start);
    var result = [];
    out.forEach(function (item) {
      var b = Object.assign({}, item.src);
      b.duration = item.minutes;
      b.start = minutesToClock(cursor);
      cursor += item.minutes;
      b.end = minutesToClock(cursor);
      result.push(b);
    });
    return result;
  }

  /**
   * The blocks for a template under a given day mode.
   * Returns null when the base template applies (Green / Full).
   */
  function modeTimeline(templateId, modeId) {
    if (!modeId || modeId === 'green') return null;
    var weekday = MODE_TIMELINES.weekday && MODE_TIMELINES.weekday[modeId];
    if (templateId === 'weekday' && weekday) return weekday.map(function (b) { return Object.assign({}, b); });
    var rules = MODE_RULES[templateId] && MODE_RULES[templateId][modeId];
    if (!rules) return null;
    return reduceTemplate(TEMPLATES[templateId], rules);
  }

  /* ------------------------------------------------------------------
     BURNOUT ZONES  (source Section 23.3 — the weekly Energy Dashboard)
     The dashboard averages all 35 scores (5 scores × 7 days).
       >= 3.50  Green   normal week, keep the Full Capacity load
       >= 2.50  Yellow  step down to Modified Load; REV-A and C+E optional
       <  2.50  Red    start a deload week now and use the response ladder
     ------------------------------------------------------------------ */
  var ZONES = [
    {
      id: 'green', label: 'Green', cssClass: 'zone-green', min: 3.5, max: 5,
      action: 'Normal week — keep the Full Capacity load.',
      actionDetail: 'Run the master timeline exactly as written.'
    },
    {
      id: 'yellow', label: 'Yellow', cssClass: 'zone-yellow', min: 2.5, max: 3.49,
      action: 'Step down to the Modified Load version.',
      actionDetail: 'REV-A and C+E become optional, one extra evening of free time; recheck on Wednesday.'
    },
    {
      id: 'red', label: 'Red', cssClass: 'zone-red', min: 0, max: 2.49,
      action: 'Start a deload week now and use the response ladder.',
      actionDetail: 'Protect sleep, drop the heaviest blocks, and talk to one person about how you are feeling.'
    }
  ];

  var THRESHOLDS = {
    zoneBands: ZONES,
    green: 3.5,
    yellow: 2.5,
    red: 0,
    /* Source overrides, applied on top of the weekly average. */
    singleScoreFloor: 2.0,        // a day averaging <= 2.0 forces at least Yellow
    lowScoresPerDay: 3,           // three or more scores of 2 or lower
    lowScoreValue: 2,
    sleepinessAlarm: 3.5,         // average sleepiness >= 3.5
    sleepinessAlarmDays: 5,       // on five or more days
    sleepFloorHours: 7,
    lightsOut: '00:30',
    lightsOutWindow: '00:20 – 00:40',
    lightsOutLite: '00:10',
    lightsOutYellow: '00:10',
    lightsOutRed: '00:00',
    wakeUp: '08:00',
    targets: { workoutsPerWeek: 4, studyHoursPerWeek: 62 }
  };

  /* ------------------------------------------------------------------
     LOAD LADDER  (source Section 27.2)
     ------------------------------------------------------------------ */
  var LOAD_LADDER = [
    { id: 'green',  label: 'Full Capacity', mode: 'green',  study: '10 h 40 m', when: 'A Green week', what: 'The plan as written.' },
    { id: 'lite',   label: 'Modified Load', mode: 'lite',   study: '9 h 20 m',  when: 'Dashboard Yellow · two Yellow days in a week · any time you ask', what: 'FOM-4 30 · REV 50 · PHY / CHE 70 each · C+E 70. The 80 freed minutes become a longer free time, a longer Break 3 and an earlier lights-out.' },
    { id: 'yellow', label: 'Recovery Plan', mode: 'yellow', study: '5 h 20 m',  when: 'The morning check says so', what: 'Section 22.3. Recovery blocks stay; lights-out moves to 00:10.' },
    { id: 'red',    label: 'Essential Plan', mode: 'red',    study: '45 m',      when: 'The morning check says so', what: 'Section 22.4. Lights-out moves to 00:00.' }
  ];

  /* ------------------------------------------------------------------
     THE CUT ORDER  (source Section 24.1)
     ------------------------------------------------------------------ */
  var CUT_ORDER = [
    { order: 1, cut: 'REV-A shrinks 30 → 15', why: 'Keeps REV-M and keeps REV the last block.' },
    { order: 2, cut: 'C+E shrinks 80 → 60', why: 'The English half goes 40 → 20 — lowest cognitive cost; the weekend holds a catch-up.' },
    { order: 3, cut: 'FOM-4 shrinks 60 → 30', why: "Today's X problems and the weakest proof only. Analysis is compressed, never skipped." },
    { order: 4, cut: 'PHY and CHE Part B shrinks — 80 → 60 each', why: 'Concepts survive; problem volume drops.' },
    { order: 5, cut: 'FOM-2 Tier targets drop', why: 'Fewer problems, same ladder.' }
  ];

  var NEVER_CUT = [
    'Night sleep (lights-out 00:30 ± 10; never later than 00:40)',
    'Nap 1 (minimum 15 min) and the mini-nap',
    'Meals, and dinner at 21:55',
    'The bath',
    'The workout (it becomes a 20-minute walk)',
    'FOM-1 and FOM-3',
    'REV-M (minimum 25)',
    'The free time before dinner',
    'The night wrap-up',
    'The bedtime reading'
  ];

  /* ------------------------------------------------------------------
     ALARM LIST  (source Section 24.9)
     ------------------------------------------------------------------ */
  var ALARM_LIST = [
    { time: '08:00', label: 'WAKE — feet on the floor (every day)' },
    { time: '08:23', label: 'DESK RESET → FOM-1' },
    { time: '13:15', label: 'BREAK 2 — set the 12-minute mini-nap alarm' },
    { time: '15:05', label: 'LUNCH' },
    { time: '15:35', label: 'NAP 1 — set the 25-minute alarm when you lie down' },
    { time: '16:05', label: 'END NAP — water + light' },
    { time: '17:45', label: 'REST 2' },
    { time: '17:55', label: 'WORKOUT' },
    { time: '18:50', label: 'FOM-3' },
    { time: '20:30', label: 'FOM-4 — ANALYSIS ONLY' },
    { time: '21:30', label: 'HELPER CHECK-IN' },
    { time: '21:55', label: 'DINNER — SCREENS OFF FOR THE NIGHT' },
    { time: '22:30', label: 'REV — LAST STUDY BLOCK' },
    { time: '23:40', label: 'STOP → NIGHT WRAP-UP' },
    { time: '23:50', label: 'NIGHT ROUTINE' },
    { time: '00:00', label: 'BEDTIME READING' },
    { time: '00:25', label: 'STOP READING → LIGHTS-OUT PREP' },
    { time: '00:30', label: 'LIGHTS-OUT (hard stop 00:40)' }
  ];

  /* ------------------------------------------------------------------
     MILESTONE CARD  (source Section 25.1)
     The three questions a good milestone answers.
     ------------------------------------------------------------------ */
  var MILESTONE_RULES = [
    'Could a stranger judge this from my page? If not, rewrite it.',
    'Can it be ticked or unticked — no "nearly"? If not, rewrite it.',
    'Does it fit inside the block? A 90-minute block holds one big result, not a whole chapter.'
  ];

  var MILESTONE_EXAMPLES = [
    'Reproduce the irrationality proof unaided from memory.',
    'Prove the section\'s main theorem without looking — every step justified, in 15 lines or fewer.',
    'Solve 8 of 10 Tier 1 problems with zero hints in 40 minutes.',
    'Find the flaw in a given faulty proof, and repair it.',
    'Write a model solution to one Tier 3 problem that a classmate could follow.'
  ];

  /* ------------------------------------------------------------------
     WEEKLY REVIEW FIELDS  (source Section 25.5)
     ------------------------------------------------------------------ */
  var WEEKLY_REVIEW_FIELDS = [
    { key: 'som',            label: 'Modules / sections completed',        type: 'text' },
    { key: 'streak',         label: 'Consecutive Green weeks',             type: 'number' },
    { key: 'tally',          label: 'FOM-4 tallies Mon–Fri (flagged / corrected)', type: 'text' },
    { key: 'lateLightsOut',  label: 'Nights with lights-out later than 00:40 (target: zero)', type: 'number' },
    { key: 'topCode',        label: 'Most frequent error code this week',  type: 'text' },
    { key: 'marks',          label: 'H marks / X marks (FOM)',             type: 'text' },
    { key: 'shortNights',    label: 'Nights below 7 h sleep',              type: 'number' },
    { key: 'workouts',       label: 'Workouts done (target ≥ 4)',          type: 'number' },
    { key: 'worked',         label: 'One thing that worked',               type: 'text' },
    { key: 'change',         label: 'One thing to change',                 type: 'text' },
    { key: 'upcoming',       label: 'Dates within 21 days (exams, forms, college)', type: 'text' },
    { key: 'dial',           label: 'Dial change for next week (one, or none)', type: 'text' }
  ];

  /* Subject groups used on the milestone card. */
  var MILESTONE_SUBJECTS = ['FOM', 'PHY', 'CHE', 'C+E', 'REV'];

  /* ------------------------------------------------------------------
     MODULE CALENDAR  (source Section 26.3)
     The 22 modules with their planned windows.
     ------------------------------------------------------------------ */
  var MODULES = [
    { id: 'A-00', name: 'Arithmetic & Number Sense',        weeks: 1, window: '9 – 15 Nov 2026',    book: 1 },
    { id: 'A-01', name: 'Sets, Numbers & Divisibility',     weeks: 2, window: '16 – 29 Nov',        book: 2 },
    { id: 'A-02', name: 'Counting & Induction',             weeks: 3, window: '30 Nov – 20 Dec',    book: 2.5 },
    { id: 'A-03', name: 'Logarithms, Polynomials & Quadratics', weeks: 2, window: '21 Dec – 3 Jan 2027', book: 2 },
    { id: 'A-04', name: 'Sequences & Inequalities',         weeks: 2, window: '4 – 17 Jan',         book: 1.5 },
    { id: 'A-05', name: 'Complex Numbers, Matrices & Determinants', weeks: 2, window: '18 – 31 Jan', book: 2 },
    { id: 'B-01', name: 'Plane & Coordinate Geometry Foundations', weeks: 3, window: '1 – 21 Feb',   book: 2.5 },
    { id: 'B-02', name: 'Triangles & Mensuration',           weeks: 2, window: '22 Feb – 7 Mar',     book: 1.5 },
    { id: 'B-03', name: 'Conic Sections',                    weeks: 3, window: '8 – 28 Mar',         book: 3 },
    { id: 'C-01', name: 'Angles & Trigonometric Functions',  weeks: 2, window: '29 Mar – 11 Apr',     book: 1.5 },
    { id: 'C-02', name: 'Identities & Equations',            weeks: 2, window: '12 – 25 Apr',        book: 2 },
    { id: 'C-03', name: 'Triangles & Applications',         weeks: 2, window: '26 Apr – 9 May',      book: 1.5 },
    { id: 'D-01', name: 'Sequences, Functions & Limits',     weeks: 3, window: '10 – 30 May',        book: 2.5 },
    { id: 'D-02', name: 'Differentiation',                   weeks: 3, window: '31 May – 20 Jun',     book: 3 },
    { id: 'D-03', name: 'Curve Sketching',                  weeks: 1, window: '21 – 27 Jun',        book: 1 },
    { id: 'D-04', name: 'Integration & Applications',       weeks: 2, window: '28 Jun – 11 Jul',     book: 2 },
    { id: 'D-05', name: 'Differential Equations',            weeks: 1, window: '12 – 18 Jul 2027',    book: 0.5 },
    { id: 'E-01', name: 'Number Theory',                    weeks: 6, window: '19 Jul – 29 Aug',     book: 6 },
    { id: 'E-02', name: 'Combinatorics',                    weeks: 6, window: '30 Aug – 10 Oct',     book: 6 },
    { id: 'E-03', name: 'Olympiad Inequalities',             weeks: 5, window: '11 Oct – 14 Nov',     book: 5 },
    { id: 'E-04', name: 'Functional Equations',             weeks: 4, window: '15 Nov – 12 Dec',     book: 4 },
    { id: 'E-05', name: 'Olympiad Synthetic Geometry',      weeks: 5, window: '13 Dec – 16 Jan 2028', book: 5 }
  ];

  /* The eight checkpoints inside one module cycle (source Section 25.6). */
  var MODULE_CHECKPOINTS = [
    { key: 'tier1', label: 'Tier I',    purpose: 'Tier I set solved with no hints.' },
    { key: 'tier2', label: 'Tier II',   purpose: 'Tier II set solved under time pressure.' },
    { key: 'tier3', label: 'Tier III',  purpose: 'Tier III attempt written up properly.' },
    { key: 'mixed', label: 'Mixed review', purpose: 'Mixed review across the whole module.' },
    { key: 'test',  label: 'Module test',  purpose: 'Module test under exam conditions.' },
    { key: 'ms1',   label: 'Milestone 1', purpose: 'First milestone attempt.' },
    { key: 'ms2',   label: 'Milestone 2', purpose: 'First re-attempt after a miss.' },
    { key: 'ms3',   label: 'Milestone 3', purpose: 'Final re-attempt. Still missed? Shrink the milestone or go back to Tier I.' }
  ];

  /* ------------------------------------------------------------------
     PLAN METADATA
     ------------------------------------------------------------------ */
  var PLAN = {
    version: '3.0',
    edition: 'Self-Study Edition',
    title: 'FOM Daily Schedule',
    startDate: '2026-11-16',          // the v3 clock starts tonight, Monday 16 November 2026
    calendarStart: '2026-11-09',      // module-calendar Week 1 (unchanged from v2.1)
    deloadWeeks: [4, 8, 12, 16, 20, 24],
    timeZone: 'Asia/Kolkata (IST)',
    timeZoneKey: 'Asia/Kolkata',   // IANA key — the schedule is evaluated in this zone
    target: 'ISI B.Stat · CMI Mathematics · CMI Mathematics & Computer Science · JEE Main + Advanced · Maharashtra HSC',
    weeklyStudyHours: 62,
    weeklyStudyLabel: '62 h 05 m',
    notifications: false             // by design: no alarms, no notifications
  };

  /* ------------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------------ */

  /**
   * The module-calendar week number of an ISO date (Week 1 starts on the
   * calendar's first Monday — 9 November 2026).
   */
  function calendarWeekNumber(isoKey) {
    var start = PLAN.calendarStart;
    if (!start) return null;
    var a = new Date(start + 'T00:00:00');
    var b = new Date(String(isoKey) + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    var days = Math.floor((b - a) / 86400000);
    if (days < 0) return null;
    return Math.floor(days / 7) + 1;
  }

  /** True when the date falls inside a scheduled deload week (Section 22.8). */
  function isDeloadWeek(isoKey) {
    var week = calendarWeekNumber(isoKey);
    if (!week) return false;
    return PLAN.deloadWeeks.indexOf(week) !== -1;
  }

  /** The template that owns a given JavaScript day number (0 = Sunday). */
  function templateForDay(dayNumber) {
    var keys = Object.keys(TEMPLATES);
    for (var i = 0; i < keys.length; i++) {
      if (TEMPLATES[keys[i]].days.indexOf(dayNumber) !== -1) return TEMPLATES[keys[i]];
    }
    return TEMPLATES.weekday;
  }

  /** The weekday variant key ('mon'..'fri') for a day number, else null. */
  function variantKeyForDay(dayNumber) {
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayNumber] || null;
  }

  /** Resolve the blocks for a template, applying that day's content variant. */
  function blocksFor(template, dayNumber, override) {
    var blocks = (override || template.blocks).map(function (b) {
      return Object.assign({}, b);
    });
    if (template.variants) {
      var key = variantKeyForDay(dayNumber);
      var variant = key ? template.variants[key] : null;
      if (variant) {
        blocks.forEach(function (b) {
          if (variant[b.id]) {
            b.content = variant[b.id];
            b.theme = variant.theme;
          }
        });
      }
    }
    return blocks;
  }

  /** Attach computed duration and minute offsets to a block list. */
  function withTiming(blocks) {
    return blocks.map(function (b) {
      var copy = Object.assign({}, b);
      copy.duration = duration(b.start, b.end);
      copy.startMin = toMinutes(b.start);
      copy.endMin = toMinutes(b.end) + (copy.duration >= 1440 ? 1440 : 0);
      if (copy.endMin <= copy.startMin) copy.endMin += 1440;
      return copy;
    });
  }

  /** Zone descriptor for a weekly average, honouring the source overrides. */
  function zoneForAverage(avg, overrides) {
    if (typeof avg !== 'number' || !isFinite(avg)) return null;
    var zone = ZONES[ZONES.length - 1];
    for (var i = 0; i < ZONES.length; i++) {
      if (avg >= ZONES[i].min) { zone = ZONES[i]; break; }
    }
    /* Source override: a single day averaging <= 2.0 for the week means the
       week is at least Yellow — never better, never worse. */
    if (overrides && overrides.forceAtLeastYellow && zone.rank > 1) {
      zone = ZONES.filter(function (z) { return z.id === 'yellow'; })[0];
    }
    return zone;
  }

  /* Ordered list, lowest rank first — used by the UI for the traffic light. */
  ZONES.forEach(function (z, i) { z.rank = i; });

  /* ------------------------------------------------------------------
     EXPORT
     ------------------------------------------------------------------ */
  var FOM_SCHEDULE = {
    plan: PLAN,
    categories: CATEGORIES,
    dayModes: DAY_MODES,
    errorCodes: ERROR_CODES,
    dailyScores: DAILY_SCORES,
    sleepinessSlots: SLEEPINESS_SLOTS,
    sleepinessScale: SLEEPINESS_SCALE,
    fomBlocks: FOM_BLOCKS,
    fom4Protocol: FOM4_PROTOCOL,
    fom4WeeklyFocus: FOM4_WEEKLY_FOCUS,
    proofChecklist: PROOF_CHECKLIST,
    retrievalBoxes: RETRIEVAL_BOXES,
    wrapupChecks: WRAPUP_CHECKS,
    helperCheckinSteps: HELPER_CHECKIN_STEPS,
    loadLadder: LOAD_LADDER,
    cutOrder: CUT_ORDER,
    neverCut: NEVER_CUT,
    alarmList: ALARM_LIST,
    templates: TEMPLATES,
    zones: ZONES,
    thresholds: THRESHOLDS,
    milestoneRules: MILESTONE_RULES,
    milestoneExamples: MILESTONE_EXAMPLES,
    milestoneSubjects: MILESTONE_SUBJECTS,
    weeklyReviewFields: WEEKLY_REVIEW_FIELDS,
    modules: MODULES,
    moduleCheckpoints: MODULE_CHECKPOINTS,

    /* helpers */
    toMinutes: toMinutes,
    duration: duration,
    templateForDay: templateForDay,
    variantKeyForDay: variantKeyForDay,
    calendarWeekNumber: calendarWeekNumber,
    isDeloadWeek: isDeloadWeek,
    blocksFor: blocksFor,
    withTiming: withTiming,
    zoneForAverage: zoneForAverage,
    modeTimeline: modeTimeline,
    modeTimelines: MODE_TIMELINES,
    modeRules: MODE_RULES,

    /* The configuration half of an exported backup. */
    getConfig: function () {
      return {
        version: PLAN.version,
        edition: PLAN.edition,
        title: PLAN.title,
        startDate: PLAN.startDate,
        calendarStart: PLAN.calendarStart,
        timeZone: PLAN.timeZone,
        categories: CATEGORIES.map(function (c) { return c.id; }),
        dayModes: DAY_MODES.map(function (m) {
          return {
            id: m.id, label: m.label, rank: m.rank, zone: m.zone,
            studyMinutes: m.studyMinutes, studyLabel: m.studyLabel,
            description: m.description, detail: m.detail
          };
        }),
        errorCodes: ERROR_CODES.map(function (e) {
          return { code: e.code, name: e.name, fix: e.fix };
        }),
        templates: Object.keys(TEMPLATES).reduce(function (acc, key) {
          var t = TEMPLATES[key];
          acc[key] = {
            id: t.id, label: t.label, days: t.days,
            plannedStudyMinutes: t.plannedStudyMinutes,
            blocks: t.blocks.map(function (b) {
              return {
                id: b.id, start: b.start, end: b.end, title: b.title,
                category: b.category, type: b.type || null, purpose: b.purpose,
                milestone: !!b.milestone, subject: b.subject || null
              };
            })
          };
          return acc;
        }, {}),
        zones: ZONES.map(function (z) {
          return { id: z.id, label: z.label, min: z.min, max: z.max, action: z.action };
        }),
        thresholds: THRESHOLDS,
        modules: MODULES.map(function (m) {
          return { id: m.id, name: m.name, weeks: m.weeks, window: m.window };
        })
      };
    }
  };

  /* Freeze the configuration surface so no runtime code can mutate the
     schedule by accident. */
  Object.freeze(FOM_SCHEDULE.categories);
  Object.freeze(FOM_SCHEDULE.dayModes);
  Object.freeze(FOM_SCHEDULE.errorCodes);
  Object.freeze(FOM_SCHEDULE.templates);
  Object.freeze(FOM_SCHEDULE.zones);
  Object.freeze(FOM_SCHEDULE.modules);
  Object.freeze(FOM_SCHEDULE.plan);

  global.FOM_SCHEDULE = FOM_SCHEDULE;

})(typeof window !== 'undefined' ? window : this);

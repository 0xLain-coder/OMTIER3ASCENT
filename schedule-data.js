/* ==========================================================================
   FOM DAILY SCHEDULE v2.1 — SCHEDULE DATA
   schedule-data.js

   READ-ONLY SOURCE OF TRUTH.

   Every block time in this file is transcribed verbatim from the master
   timelines in the source schedule (FOM_Daily_Schedule_v2.1_SelfStudy.md):

     Section 6.1 — Weekday master timeline (Mon–Fri)   -> templates.weekday
     Section 7.1 — Saturday master timeline             -> templates.saturday
     Section 8.1 — Sunday master timeline              -> templates.sunday
     Section 5.1 — Week at a glance / themes           -> templates.*.variants
     Section 9.8 — Error log codes                     -> ERROR_CODES
     Section 22   — Day modes and the load ladder      -> DAY_MODES
     Section 23.3 — Weekly Energy Dashboard            -> THRESHOLDS
     Section 25.4 — Daily log template                 -> DAILY_SCORES
     Section 25.6 — Module tracker                     -> MODULES

   These objects are frozen. The user interface contains no control that can
   change a start time, an end time, a category or a template. Changing the
   schedule means editing this file deliberately.

   TERMINOLOGY: the source document's colour-coded day modes are exposed here
   only under their professional operating names:
       full capacity / modified load / recovery plan / essential plan

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
    { id: 'Workout',    label: 'Workout',    cssVar: 'cat-workout',    description: '17:10 hinge of the day, five days a week.' },
    { id: 'Break',      label: 'Break',      cssVar: 'cat-break',      description: 'A scheduled break, not an accident.' },
    { id: 'Free',       label: 'Free',       cssVar: 'cat-free',       description: 'Protected time with no study at all.' },
    { id: 'Planning',   label: 'Planning',   cssVar: 'cat-planning',   description: 'Weekly review, dashboard and next-week planning.' },
    { id: 'Fuel',       label: 'Fuel',       cssVar: 'cat-fuel',       description: 'Post-workout light fuel and the bath.' },
    { id: 'Recovery',   label: 'Recovery',   cssVar: 'cat-recovery',   description: 'Wake-up routine, resets, rest and wind-down.' },
    { id: 'Free Zone',  label: 'Free Zone',  cssVar: 'cat-freezone',   description: 'Protected non-study block — treated like a class.' }
  ];

  /* ------------------------------------------------------------------
     DAY MODES  (source Section 22 — professional terminology only)
     The load ladder runs full capacity -> modified load -> recovery plan
     -> essential plan. Recovery blocks never change; only study load does.
     ------------------------------------------------------------------ */
  var DAY_MODES = [
    {
      id: 'full',
      label: 'Full Capacity',
      short: 'Full',
      rank: 0,
      zone: 'full',
      cssClass: 'zone-full',
      studyMinutes: 640,
      studyLabel: '10 h 40 m',
      description: 'The full plan exactly as written in the master timeline.',
      detail: 'Every block runs at its scheduled length. Use the weekend Free Zones as protected time, and keep the free evening free — it is never used for catch-up.',
      rules: [
        'All recovery blocks stay exactly as scheduled.',
        'Dinner stays 21:55–22:30 and lights-out stays 23:45.',
        'The milestone card is written the night before, on paper.'
      ]
    },
    {
      id: 'modified',
      label: 'Modified Load',
      short: 'Modified',
      rank: 1,
      zone: 'modified',
      cssClass: 'zone-modified',
      studyMinutes: 560,
      studyLabel: '9 h 20 m',
      description: 'A reduced study load for a week that is already heavy.',
      detail: 'A reduced study load for a week that is already heavy. The analysis block, the closing revision and the main subject sittings are all shortened, and the freed minutes become a longer free evening, a longer break and an earlier lights-out.',
      weekdayDetail: 'FOM-4 drops to 30 minutes, revision to 50, Physics and Chemistry to 70 each, and Computer + English to 70. Recovery blocks are untouched.',
      rules: [
        'Only the study load shrinks — never sleep, nap, meals or the workout.',
        'FOM-4 is shortened, never skipped.',
        'Recheck the dashboard on Wednesday.'
      ]
    },
    {
      id: 'recovery',
      label: 'Recovery Plan',
      short: 'Recovery',
      rank: 2,
      zone: 'recovery',
      cssClass: 'zone-recovery',
      studyMinutes: 320,
      studyLabel: '5 h 20 m',
      description: 'A deliberately small day for bad sleep, illness or a heavy week.',
      detail: 'A deliberately small day for bad sleep, illness or a heavy week. Only the study load shrinks — the recovery blocks, the meals and the naps stay exactly as they are, and lights-out moves earlier so the sleep is never shorter.',
      weekdayDetail: 'FOM-1 and FOM-2 to 60 minutes, Physics and Chemistry to 50, Computer + English to a 30-minute single item, FOM-4 to 30, revision to 40. The afternoon becomes a recovery menu.',
      rules: [
        'Recovery blocks stay exactly as they are; the wake-up and dinner do not move.',
        'Lights-out moves earlier to 23:15 — never later.',
        'Do not make up the dropped work later. Drop it or move it to the weekend.'
      ]
    },
    {
      id: 'essential',
      label: 'Essential Plan',
      short: 'Essential',
      rank: 3,
      zone: 'essential',
      cssClass: 'zone-essential',
      studyMinutes: 45,
      studyLabel: '45 m',
      description: 'The minimum viable day: protect recovery and keep a thread alive.',
      detail: 'The minimum viable day. One gentle touch of FOM and a short closing revision; everything else is rest, the workout becomes an easy walk, and lights-out moves to the earliest point the plan allows.',
      weekdayDetail: 'One gentle FOM touch of 30 minutes — a single Tier 1 problem or a re-read of yesterday\'s notes — and 15 minutes of revision. Lights-out moves to 23:00.',
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
    { code: 'C', name: 'Concept gap',            fix: 'Return to the learning block: re-derive from first principles and add a card to the queue.' },
    { code: 'T', name: 'Technique not recalled',  fix: 'Make a technique card, then do three similar problems.' },
    { code: 'A', name: 'Algebra / arithmetic slip', fix: 'Write every line; sanity-check with a special case.' },
    { code: 'P', name: 'Proof gap (logic)',       fix: 'Rewrite using the 10-point proof checklist.' },
    { code: 'M', name: 'Misread the question',    fix: 'Restate the problem in your own words before solving.' },
    { code: 'S', name: 'Speed / time management',fix: 'Timed mini-sets; use the skip-and-return rule.' },
    { code: 'D', name: "Didn't try / gave up early", fix: 'Apply the stuck ladder strictly.' }
  ];

  /* ------------------------------------------------------------------
     DAILY SCORES AND SLEEPINESS SLOTS  (source Sections 23.2 and 13.4)
     ------------------------------------------------------------------ */
  var DAILY_SCORES = [
    { key: 'sleepQuality', label: 'Sleep quality', min: 1, max: 5 },
    { key: 'energy',       label: 'Energy',        min: 1, max: 5 },
    { key: 'mood',         label: 'Mood',          min: 1, max: 5 },
    { key: 'focus',        label: 'Focus',         min: 1, max: 5 },
    { key: 'motivation',   label: 'Motivation',    min: 1, max: 5 }
  ];

  var SLEEPINESS_SLOTS = [
    { key: 'sleepiness1105', time: '11:05', label: 'Morning check' },
    { key: 'sleepiness1525', time: '15:25', label: 'Post-nap check' },
    { key: 'sleepiness1645', time: '16:45', label: 'Pre-workout check' }
  ];

  var SLEEPINESS_SCALE = [
    { value: 1, label: 'Alert' },
    { value: 2, label: 'Fine' },
    { value: 3, label: 'Slightly drowsy' },
    { value: 4, label: 'Fighting it' },
    { value: 5, label: 'Struggling to keep your eyes open' }
  ];

  /* ------------------------------------------------------------------
     WEEKDAY MASTER TIMELINE  (source Section 6.1 — 26 blocks)
     Mon–Fri. `id` is stable and is the key used by stored daily logs, so it
     must never change without a deliberate migration.
     ------------------------------------------------------------------ */
  var WEEKDAY_BLOCKS = [
    { id: 'wake',      start: '07:00', end: '07:30', title: 'Wake-up + slow morning',  category: 'Recovery',    purpose: 'Water, wash, mobility, plan the day, daylight, 60-second check — no phone, no screens.' },
    { id: 'fom1',      start: '07:30', end: '09:00', title: 'FOM-1 · Learn',           category: 'Study',       purpose: 'Hardest new thinking, fresh brain.', milestone: true, subject: 'FOM' },
    { id: 'break1',    start: '09:00', end: '09:15', title: 'Break 1',                 category: 'Break',       purpose: 'Step outside, drink, look far away.' },
    { id: 'fom2',      start: '09:15', end: '10:45', title: 'FOM-2 · Practice',        category: 'Study',       purpose: 'Apply what FOM-1 built; mark every problem C / H / X.', milestone: true, subject: 'FOM' },
    { id: 'breakfast', start: '10:45', end: '11:05', title: 'Breakfast',               category: 'Breakfast',   purpose: 'A proper meal, 15–20 minutes, no bath.' },
    { id: 'phy',       start: '11:05', end: '12:25', title: 'PHY · Physics',           category: 'Study',       purpose: 'One deep block; the day\'s rotation.', milestone: true, subject: 'PHY' },
    { id: 'break2',    start: '12:25', end: '12:55', title: 'Break 2 + mini-nap',      category: 'Break',       purpose: '10–15 minutes of that is a mini-nap; then water and fresh air.' },
    { id: 'che',       start: '12:55', end: '14:15', title: 'CHE · Chemistry',         category: 'Study',       purpose: 'One deep block; Physical / Organic / Inorganic.', milestone: true, subject: 'CHE' },
    { id: 'lunch',     start: '14:15', end: '14:45', title: 'Lunch',                   category: 'Lunch',       purpose: 'Moderate — fuel, not a food coma.' },
    { id: 'nap1',      start: '14:45', end: '15:15', title: 'Nap 1',                   category: 'Nap',         purpose: 'Alarm on, dim room, up on the alarm.' },
    { id: 'reset',     start: '15:15', end: '15:25', title: 'Reset',                   category: 'Recovery',    purpose: 'Water, face wash, light, standing stretches.' },
    { id: 'ce',        start: '15:25', end: '16:45', title: 'C+E · Computer + English',category: 'Study',       purpose: 'CS 40 + English 40, in the day\'s order.', milestone: true, subject: 'C+E' },
    { id: 'break3',    start: '16:45', end: '17:00', title: 'Break 3',                 category: 'Break',       purpose: 'Break only — no snack. Fresh air, move.' },
    { id: 'rest2',     start: '17:00', end: '17:10', title: 'Rest 2',                  category: 'Recovery',    purpose: 'Eyes-closed rest — a rest, never a nap.' },
    { id: 'workout',   start: '17:10', end: '17:45', title: 'Workout',                 category: 'Workout',     purpose: 'The hinge of the day: strength, cardio or mobility.', subject: 'Workout' },
    { id: 'fuel',      start: '17:45', end: '18:05', title: 'Bath + light fuel',       category: 'Fuel',        purpose: 'Bath, then fruit / curd / nuts.' },
    { id: 'fom3',      start: '18:05', end: '19:35', title: 'FOM-3 · Prove & Lock',    category: 'Study',       purpose: 'Evening peak, right after the workout and bath.', milestone: true, subject: 'FOM' },
    { id: 'break4',    start: '19:35', end: '19:45', title: 'Break 4',                 category: 'Break',       purpose: 'Decompress, no screens.' },
    { id: 'fom4',      start: '19:45', end: '20:45', title: 'FOM-4 · Analysis',        category: 'Analysis',    purpose: 'Review your work → find all your mistakes → correct them. Nothing else.', milestone: true, subject: 'FOM', always: true },
    { id: 'shutdown',  start: '20:45', end: '20:55', title: 'Shutdown ritual',         category: 'Recovery',    purpose: 'Tomorrow\'s card, daily log, worry dump, helper check-in.' },
    { id: 'freeeve',   start: '20:55', end: '21:35', title: 'Free evening',            category: 'Free',        purpose: 'Family, hobby, music — no study.' },
    { id: 'reading',   start: '21:35', end: '21:55', title: 'Evening reading',         category: 'Recovery',    purpose: 'Paper book, English preferred; stop when dinner starts.' },
    { id: 'dinner',    start: '21:55', end: '22:30', title: 'Dinner',                  category: 'Dinner',      purpose: 'Fixed family window — light-to-moderate.' },
    { id: 'rev',       start: '22:30', end: '23:40', title: 'REV · Revision',          category: 'Revision',    purpose: 'Maths 40 + all other subjects 30 (book reading). Paper only; no new hard problems.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'night',     start: '23:40', end: '23:45', title: 'Night routine',           category: 'Recovery',    purpose: 'Brush, dim lights, alarm check, phone out of the room.' },
    { id: 'sleep',     start: '23:45', end: '07:00', title: 'Sleep',                   category: 'Night Sleep', purpose: '7 h 15 m — fixed every night. With Nap 1 and the mini-nap ≈ 8 h asleep per 24 h.', anchor: true }
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
     SATURDAY MASTER TIMELINE  (source Section 7.1 — 19 blocks)
     ------------------------------------------------------------------ */
  var SATURDAY_BLOCKS = [
    { id: 'wake',      start: '07:30', end: '08:00', title: 'Wake-up + slow morning',   category: 'Recovery',   purpose: 'Slower start, 8-minute mobility.' },
    { id: 's1',        start: '08:00', end: '09:30', title: 'S1 · Milestone attempt',   category: 'Study',      purpose: 'The week\'s checkable result, from a blank page.', milestone: true, subject: 'FOM' },
    { id: 'break1',    start: '09:30', end: '09:45', title: 'Break',                    category: 'Break',      purpose: 'Move, water.' },
    { id: 's2',        start: '09:45', end: '11:15', title: 'S2 · Weekly timed set',    category: 'Study',      purpose: 'Exam-style problems under real conditions.', milestone: true, subject: 'FOM' },
    { id: 'breakfast', start: '11:15', end: '11:35', title: 'Breakfast',                category: 'Breakfast',  purpose: 'No bath — the bath comes after the Free Zone sport.' },
    { id: 'pcm',       start: '11:35', end: '12:35', title: 'PCM weekly check',         category: 'Study',      purpose: 'Physics 30 + Chemistry 30: closed-book mini-test, then fix.', milestone: true, subject: 'PCM' },
    { id: 'break2',    start: '12:35', end: '12:50', title: 'Break',                    category: 'Break',      purpose: 'Outdoors.' },
    { id: 'ce',        start: '12:50', end: '13:35', title: 'C+E · Code & write',       category: 'Study',      purpose: 'CS 25 + English 20 — one small thing finished.', milestone: true, subject: 'C+E' },
    { id: 'lunch',     start: '13:35', end: '14:05', title: 'Lunch',                    category: 'Lunch',      purpose: 'With family if possible.' },
    { id: 'nap1',      start: '14:05', end: '14:35', title: 'Nap 1',                    category: 'Nap',        purpose: 'Thirty minutes, as on weekdays.' },
    { id: 'reset',     start: '14:35', end: '14:45', title: 'Reset',                    category: 'Recovery',   purpose: 'Water, light.' },
    { id: 'freezone',  start: '14:45', end: '21:45', title: 'FREE ZONE',                category: 'Free Zone',  purpose: 'Seven hours — sport, outdoors, friends, family, hobbies. No study. Protected like a class.', anchor: true },
    { id: 'shutdown',  start: '21:45', end: '21:55', title: 'Shutdown ritual',          category: 'Recovery',   purpose: 'Daily log; jot Sunday\'s seeds.' },
    { id: 'dinner',    start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',     purpose: 'Fixed window, with family.' },
    { id: 'revw',      start: '22:30', end: '22:55', title: 'REV-W · Closing revision', category: 'Revision',   purpose: 'Maths 10 · Physics 5 · Chemistry 5 · CS 2 · English 3 — the day\'s subjects, from the day\'s pages.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'freeeve',   start: '22:55', end: '23:10', title: 'Free evening',             category: 'Free',       purpose: 'No study.' },
    { id: 'reading',   start: '23:10', end: '23:40', title: 'Evening reading',          category: 'Recovery',   purpose: 'Paper book.' },
    { id: 'night',     start: '23:40', end: '23:45', title: 'Night routine',            category: 'Recovery',   purpose: 'Brush, dim lights, alarm check.' },
    { id: 'sleep',     start: '23:45', end: '07:30', title: 'Sleep',                    category: 'Night Sleep',purpose: '7 h 45 m — starts repaying the week.', anchor: true }
  ];

  /* ------------------------------------------------------------------
     SUNDAY MASTER TIMELINE  (source Section 8.1 — 20 blocks)
     ------------------------------------------------------------------ */
  var SUNDAY_BLOCKS = [
    { id: 'wake',      start: '07:30', end: '08:00', title: 'Wake-up + slow morning',   category: 'Recovery',   purpose: 'Slow start.' },
    { id: 's3',        start: '08:00', end: '09:15', title: 'S3 · Analysis & rewrite',  category: 'Analysis',   purpose: 'Learn from Saturday\'s timed set; two model solutions.', milestone: true, subject: 'FOM' },
    { id: 'break1',    start: '09:15', end: '09:30', title: 'Break',                    category: 'Break',      purpose: 'Move, water.' },
    { id: 's4',        start: '09:30', end: '10:15', title: 'S4 · Recall without notes', category: 'Study',      purpose: 'The week\'s key results from a blank page.', milestone: true, subject: 'FOM' },
    { id: 'breakfast', start: '10:15', end: '10:35', title: 'Breakfast',                category: 'Breakfast',  purpose: 'No bath — it comes after the Free Zone.' },
    { id: 'ce',        start: '10:35', end: '11:05', title: 'C+E · Calm literacy',       category: 'Study',      purpose: 'English reading for pleasure or a light CS review.', milestone: true, subject: 'C+E' },
    { id: 'freezonea', start: '11:05', end: '13:30', title: 'FREE ZONE A',               category: 'Free Zone',  purpose: 'Long walk or cycle, sport, family — no study.', anchor: true },
    { id: 'lunch',     start: '13:30', end: '14:00', title: 'Lunch',                    category: 'Lunch',      purpose: 'With family.' },
    { id: 'nap1',      start: '14:00', end: '14:30', title: 'Nap 1',                    category: 'Nap',        purpose: 'Thirty minutes.' },
    { id: 'reset',     start: '14:30', end: '14:40', title: 'Reset',                    category: 'Recovery',   purpose: '—' },
    { id: 'freezoneb', start: '14:40', end: '18:45', title: 'FREE ZONE B',               category: 'Free Zone',  purpose: 'Anything that isn\'t study; bath after any sport.', anchor: true },
    { id: 'weekly',    start: '18:45', end: '19:30', title: 'Weekly Review & planning', category: 'Planning',   purpose: 'Energy dashboard 5 · Review 15 · Plan next week 10 · Helper sync 15.', milestone: true, subject: 'PLAN' },
    { id: 'shutdown',  start: '19:30', end: '19:45', title: 'Shutdown + Monday prep',   category: 'Recovery',   purpose: 'Monday\'s milestone card, bag, alarms, clothes.' },
    { id: 'family',    start: '19:45', end: '21:55', title: 'Family evening',           category: 'Free',       purpose: 'Film, games, people. No study.' },
    { id: 'dinner',    start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',     purpose: 'Fixed window, with family.' },
    { id: 'revw',      start: '22:30', end: '22:50', title: 'REV-W · Closing revision', category: 'Revision',   purpose: 'Maths 10 · Physics 3 · Chemistry 3 · CS 2 · English 2 — the week\'s weak spots.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'winddown',  start: '22:50', end: '23:10', title: 'Free / wind-down',         category: 'Free',       purpose: 'No study, no screens.' },
    { id: 'reading',   start: '23:10', end: '23:40', title: 'Evening reading',          category: 'Recovery',   purpose: 'Paper book.' },
    { id: 'night',     start: '23:40', end: '23:45', title: 'Night routine',            category: 'Recovery',   purpose: 'Brush, dim lights, alarm check.' },
    { id: 'sleep',     start: '23:45', end: '07:00', title: 'Sleep',                    category: 'Night Sleep',purpose: '7 h 15 m — an even start to Monday.', anchor: true }
  ];

  /* ------------------------------------------------------------------
     TEMPLATES
     Each template records its own planned study total for verification.
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
     MODE-SPECIFIC TIMELINES
     The day modes are not just a label — each one carries its own clock.

     The weekday timelines below are transcribed verbatim from the source:
       Modified Load  -> Section 27.2 (the load ladder's reduced rung)
       Recovery Plan  -> Section 22.3 (the reduced weekday)
       Essential Plan -> Section 22.4 (the minimum viable day)

     The source defines reduced-day timelines for weekdays only. For
     Saturday and Sunday the same reduction principles are applied with a
     documented reducer (see MODE_RULES and reduceTemplate below):
     study blocks shrink, recovery blocks never do, the freed minutes flow
     forward into the next Free / Free Zone block, and anything left over at
     the end of the day extends the sleep block, so lights-out only ever
     moves earlier.
     ------------------------------------------------------------------ */

  /* Weekday · Modified Load — Section 27.2.
     FOM-4 30 · REV 50 · PHY 70 · CHE 70 · C+E 70. The 80 freed minutes go
     to a longer Break 3 (+15), a longer free evening (+30), a breathing
     room block (+15) and an earlier lights-out (23:25, +20). */
  var WEEKDAY_MODIFIED_BLOCKS = [
    { id: 'wake',      start: '07:00', end: '07:30', title: 'Wake-up + slow morning',  category: 'Recovery',    purpose: 'Water, wash, mobility, plan the day, daylight, 60-second check — no phone, no screens.' },
    { id: 'fom1',      start: '07:30', end: '09:00', title: 'FOM-1 · Learn',           category: 'Study',       purpose: 'Hardest new thinking, fresh brain.', milestone: true, subject: 'FOM' },
    { id: 'break1',    start: '09:00', end: '09:15', title: 'Break 1',                 category: 'Break',       purpose: 'Step outside, drink, look far away.' },
    { id: 'fom2',      start: '09:15', end: '10:45', title: 'FOM-2 · Practice',        category: 'Study',       purpose: 'Apply what FOM-1 built; mark every problem C / H / X.', milestone: true, subject: 'FOM' },
    { id: 'breakfast', start: '10:45', end: '11:05', title: 'Breakfast',               category: 'Breakfast',   purpose: 'A proper meal, 15–20 minutes, no bath.' },
    { id: 'phy',       start: '11:05', end: '12:15', title: 'PHY · Physics',           category: 'Study',       purpose: 'One deep block; the day\'s rotation.', milestone: true, subject: 'PHY' },
    { id: 'break2',    start: '12:15', end: '12:45', title: 'Break 2 + mini-nap',      category: 'Break',       purpose: '10–15 minutes of that is a mini-nap; then water and fresh air.' },
    { id: 'che',       start: '12:45', end: '13:55', title: 'CHE · Chemistry',         category: 'Study',       purpose: 'One deep block; Physical / Organic / Inorganic.', milestone: true, subject: 'CHE' },
    { id: 'lunch',     start: '13:55', end: '14:25', title: 'Lunch',                   category: 'Lunch',       purpose: 'Moderate — fuel, not a food coma.' },
    { id: 'nap1',      start: '14:25', end: '14:55', title: 'Nap 1',                   category: 'Nap',         purpose: 'Alarm on, dim room, up on the alarm.' },
    { id: 'reset',     start: '14:55', end: '15:05', title: 'Reset',                   category: 'Recovery',    purpose: 'Water, face wash, light, standing stretches.' },
    { id: 'ce',        start: '15:05', end: '16:15', title: 'C+E · Computer + English',category: 'Study',       purpose: 'CS 35 + English 35, in the day\'s order.', milestone: true, subject: 'C+E' },
    { id: 'break3',    start: '16:15', end: '16:45', title: 'Break 3',                 category: 'Break',       purpose: 'Longer on a reduced day — no snack. Fresh air, move.' },
    { id: 'rest2',     start: '16:45', end: '16:55', title: 'Rest 2',                  category: 'Recovery',    purpose: 'Eyes-closed rest — a rest, never a nap.' },
    { id: 'room',      start: '16:55', end: '17:10', title: 'Breathing room',          category: 'Recovery',    purpose: 'The 15 minutes this rung buys back. Do not fill it.' },
    { id: 'workout',   start: '17:10', end: '17:45', title: 'Workout',                 category: 'Workout',     purpose: 'The hinge of the day: strength, cardio or mobility.', subject: 'Workout' },
    { id: 'fuel',      start: '17:45', end: '18:05', title: 'Bath + light fuel',       category: 'Fuel',        purpose: 'Bath, then fruit / curd / nuts.' },
    { id: 'fom3',      start: '18:05', end: '19:35', title: 'FOM-3 · Prove & Lock',    category: 'Study',       purpose: 'Evening peak, right after the workout and bath.', milestone: true, subject: 'FOM' },
    { id: 'break4',    start: '19:35', end: '19:45', title: 'Break 4',                 category: 'Break',       purpose: 'Decompress, no screens.' },
    { id: 'fom4',      start: '19:45', end: '20:15', title: 'FOM-4 · Analysis',        category: 'Analysis',    purpose: 'Today\'s X problems and the weakest proof only: review → identify → correct.', milestone: true, subject: 'FOM', always: true },
    { id: 'shutdown',  start: '20:15', end: '20:25', title: 'Shutdown ritual',         category: 'Recovery',    purpose: 'Tomorrow\'s card, daily log, worry dump, helper check-in.' },
    { id: 'freeeve',   start: '20:25', end: '21:35', title: 'Free evening',            category: 'Free',        purpose: 'Family, hobby, music — no study. Longer on this rung.' },
    { id: 'reading',   start: '21:35', end: '21:55', title: 'Evening reading',         category: 'Recovery',    purpose: 'Paper book, English preferred; stop when dinner starts.' },
    { id: 'dinner',    start: '21:55', end: '22:30', title: 'Dinner',                  category: 'Dinner',      purpose: 'Fixed family window — light-to-moderate.' },
    { id: 'rev',       start: '22:30', end: '23:20', title: 'REV · Revision',          category: 'Revision',    purpose: 'Maths 30 + all other subjects 20 (book reading). Paper only.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'night',     start: '23:20', end: '23:25', title: 'Night routine',           category: 'Recovery',    purpose: 'Brush, dim lights, alarm check, phone out of the room.' },
    { id: 'sleep',     start: '23:25', end: '07:00', title: 'Sleep',                   category: 'Night Sleep', purpose: '7 h 35 m — the same sleep or longer. Lights-out is never later.', anchor: true }
  ];

  /* Weekday · Recovery Plan — Section 22.3, verbatim. */
  var WEEKDAY_RECOVERY_BLOCKS = [
    { id: 'wake',      start: '07:00', end: '07:30', title: 'Wake-up + slow morning',   category: 'Recovery',    purpose: 'As usual. Do the 60-second check and choose this mode.' },
    { id: 'fom1',      start: '07:30', end: '08:30', title: 'FOM-1 · Learn (short)',    category: 'Study',       purpose: 'Reading + one reconstruction. Skip the second.', milestone: true, subject: 'FOM' },
    { id: 'break1',    start: '08:30', end: '08:45', title: 'Break 1',                  category: 'Break',       purpose: 'Step outside.' },
    { id: 'fom2',      start: '08:45', end: '09:45', title: 'FOM-2 · Practice (short)', category: 'Study',       purpose: 'Tier 1–2 only. No Tier 3 today.', milestone: true, subject: 'FOM' },
    { id: 'breakfast', start: '09:45', end: '10:05', title: 'Breakfast',                category: 'Breakfast',   purpose: 'Unhurried.' },
    { id: 'phy',       start: '10:05', end: '10:55', title: 'PHY (short)',              category: 'Study',       purpose: 'Part A + 3 problems.', milestone: true, subject: 'PHY' },
    { id: 'break2',    start: '10:55', end: '11:10', title: 'Break',                    category: 'Break',       purpose: 'Outdoors.' },
    { id: 'che',       start: '11:10', end: '12:00', title: 'CHE (short)',              category: 'Study',       purpose: 'Part A + 3 problems, or flashcards.', milestone: true, subject: 'CHE' },
    { id: 'recovery',  start: '12:00', end: '13:20', title: 'Recovery menu',            category: 'Recovery',    purpose: 'Replaces the afternoon blocks. Pick two: sunlight walk (20) · music or a hobby (30) · stretching or yoga (15) · a chat with family.' },
    { id: 'lunch',     start: '13:20', end: '13:50', title: 'Lunch',                    category: 'Lunch',       purpose: 'Moderate.' },
    { id: 'nap1',      start: '13:50', end: '14:20', title: 'Nap 1',                    category: 'Nap',         purpose: 'As usual.' },
    { id: 'reset',     start: '14:20', end: '14:30', title: 'Reset',                    category: 'Recovery',    purpose: '—' },
    { id: 'ce',        start: '14:30', end: '15:00', title: 'C+E (mini)',               category: 'Study',       purpose: 'One item only: English reading for pleasure or a 25-minute CS review.', milestone: true, subject: 'C+E' },
    { id: 'freeeve',   start: '15:00', end: '19:15', title: 'Free time + easy movement',category: 'Free',        purpose: 'A 20–30 minute easy walk replaces the workout; bath and a real light-fuel snack.' },
    { id: 'fom4',      start: '19:15', end: '19:45', title: 'FOM-4 · Analysis (short)', category: 'Analysis',    purpose: 'Today\'s X problems and the weakest proof only: review → identify → correct.', milestone: true, subject: 'FOM', always: true },
    { id: 'shutdown',  start: '19:45', end: '19:55', title: 'Shutdown ritual',          category: 'Recovery',    purpose: 'Card for tomorrow: pick the smaller of two seeds.' },
    { id: 'freeeve2',  start: '19:55', end: '21:35', title: 'Free evening',             category: 'Free',        purpose: 'No study.' },
    { id: 'reading',   start: '21:35', end: '21:55', title: 'Evening reading',          category: 'Recovery',    purpose: 'Paper book.' },
    { id: 'dinner',    start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',      purpose: 'Fixed window, light.' },
    { id: 'rev',       start: '22:30', end: '23:10', title: 'REV (short) — last block', category: 'Revision',    purpose: 'Maths 25 (queue 15 + recall 10) + others 15. Paper only.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'night',     start: '23:10', end: '23:15', title: 'Night routine',            category: 'Recovery',    purpose: '—' },
    { id: 'sleep',     start: '23:15', end: '07:00', title: 'Sleep',                    category: 'Night Sleep', purpose: '7 h 45 m — earlier on purpose.', anchor: true }
  ];

  /* Weekday · Essential Plan — Section 22.4, verbatim. */
  var WEEKDAY_ESSENTIAL_BLOCKS = [
    { id: 'backbed',   start: '07:00', end: '07:45', title: 'Back to bed',              category: 'Recovery',    purpose: 'After the check, go back to bed.' },
    { id: 'wake',      start: '07:45', end: '08:15', title: 'Slow wake-up routine',     category: 'Recovery',    purpose: 'Water, wash, natural light. Skip the mobility routine if you do not feel like it.' },
    { id: 'fom1',      start: '08:15', end: '08:45', title: 'Gentle FOM touch',         category: 'Study',       purpose: 'One Tier 1 problem, or re-read yesterday\'s notes. The streak keeper.', milestone: true, subject: 'FOM' },
    { id: 'breakfast', start: '08:45', end: '09:30', title: 'Breakfast + bath',         category: 'Breakfast',   purpose: 'Slow.' },
    { id: 'walk',      start: '09:30', end: '10:30', title: 'Outdoor walk / stretch',   category: 'Recovery',    purpose: 'Natural light, no phone.' },
    { id: 'freeeve',   start: '10:30', end: '13:30', title: 'Free time',                category: 'Free',        purpose: 'Hobby, music, family. Not a screen binge.' },
    { id: 'lunch',     start: '13:30', end: '14:00', title: 'Lunch',                    category: 'Lunch',       purpose: '—' },
    { id: 'nap1',      start: '14:00', end: '14:30', title: 'Nap 1',                    category: 'Nap',         purpose: '—' },
    { id: 'reset',     start: '14:30', end: '14:40', title: 'Reset',                    category: 'Recovery',    purpose: '—' },
    { id: 'freeeve2',  start: '14:40', end: '19:30', title: 'Free time',                category: 'Free',        purpose: 'No study.' },
    { id: 'shutdown',  start: '19:30', end: '19:40', title: 'Shutdown ritual',          category: 'Recovery',    purpose: 'One sentence about how you feel; choose tomorrow\'s mode.' },
    { id: 'freeeve3',  start: '19:40', end: '21:35', title: 'Free evening',             category: 'Free',        purpose: '—' },
    { id: 'reading',   start: '21:35', end: '21:55', title: 'Evening reading',          category: 'Recovery',    purpose: '—' },
    { id: 'dinner',    start: '21:55', end: '22:30', title: 'Dinner',                   category: 'Dinner',      purpose: 'Fixed window.' },
    { id: 'rev',       start: '22:30', end: '22:45', title: 'REV-lite — last block',    category: 'Revision',    purpose: 'Ten cards from any subjects, nothing else.', milestone: true, subject: 'REV', lastBlock: true },
    { id: 'winddown',  start: '22:45', end: '22:55', title: 'Wind-down',                category: 'Recovery',    purpose: 'No screens.' },
    { id: 'night',     start: '22:55', end: '23:00', title: 'Night routine',            category: 'Recovery',    purpose: '—' },
    { id: 'sleep',     start: '23:00', end: '07:00', title: 'Sleep',                    category: 'Night Sleep', purpose: '8 h.', anchor: true }
  ];

  var MODE_TIMELINES = {
    weekday: {
      modified:  WEEKDAY_MODIFIED_BLOCKS,
      recovery:  WEEKDAY_RECOVERY_BLOCKS,
      essential: WEEKDAY_ESSENTIAL_BLOCKS
    }
  };

  /* Weekend reduction rules. `durations` sets a new length in minutes (0 drops
     the block); `absorbers` lists the Free / Free Zone blocks that take the
     freed minutes, in the order the freed time reaches them. */
  var MODE_RULES = {
    saturday: {
      modified:  { durations: { pcm: 50, ce: 40 },                        absorbers: ['freezone', 'freeeve'] },
      recovery:  { durations: { s1: 60, s2: 60, pcm: 30, ce: 30 },      absorbers: ['freezone', 'freeeve'] },
      essential: { durations: { s1: 30, s2: 0, pcm: 0, ce: 0, revw: 15 }, absorbers: ['freezone', 'freeeve'] }
    },
    sunday: {
      modified:  { durations: { s3: 60, s4: 40, ce: 25 },                          absorbers: ['freezonea', 'freezoneb', 'family', 'winddown'] },
      recovery:  { durations: { s3: 45, s4: 30, ce: 25, weekly: 30, revw: 15 },    absorbers: ['freezonea', 'freezoneb', 'family', 'winddown'] },
      essential: { durations: { s3: 30, s4: 0, ce: 0, weekly: 15, revw: 15 },     absorbers: ['freezonea', 'freezoneb', 'family', 'winddown'] }
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
   * Returns null when the base template applies (Full Capacity).
   */
  function modeTimeline(templateId, modeId) {
    if (!modeId || modeId === 'full') return null;
    var weekday = MODE_TIMELINES.weekday && MODE_TIMELINES.weekday[modeId];
    if (templateId === 'weekday' && weekday) return weekday.map(function (b) { return Object.assign({}, b); });
    var rules = MODE_RULES[templateId] && MODE_RULES[templateId][modeId];
    if (!rules) return null;
    return reduceTemplate(TEMPLATES[templateId], rules);
  }

  /* ------------------------------------------------------------------
     BURNOUT ZONES  (source Section 23.3 — the weekly Energy Dashboard)
     The dashboard averages the five daily scores across the week.
       >= 3.50  Full Capacity     (source: normal week, keep the full load)
       >= 3.00  Modified Load     (source: step down to the reduced-load version)
       >= 2.50  Recovery Plan     (source: reduced day)
       <  2.50  Essential Plan    (source: minimum viable day)
     The 3.50 and 2.50 anchors are the source's own thresholds; the 3.00
     split represents the explicit "step down to the reduced-load version"
     instruction that the source gives for a dashboard reading in the
     reduced band.
     ------------------------------------------------------------------ */
  var ZONES = [
    {
      id: 'full', label: 'Full Capacity', cssClass: 'zone-full', min: 3.5, max: 5,
      action: 'Normal week — keep the full load.',
      actionDetail: 'Run the master timeline exactly as written.'
    },
    {
      id: 'modified', label: 'Modified Load', cssClass: 'zone-modified', min: 3.0, max: 3.49,
      action: 'Step down to the Modified Load version.',
      actionDetail: 'Shorten the analysis block, revision, Physics, Chemistry and Computer + English. Recovery blocks stay.'
    },
    {
      id: 'recovery', label: 'Recovery Plan', cssClass: 'zone-recovery', min: 2.5, max: 2.99,
      action: 'Run the Recovery Plan version of the day.',
      actionDetail: 'Shrink the study load, move lights-out earlier, add one free evening and recheck on Wednesday.'
    },
    {
      id: 'essential', label: 'Essential Plan', cssClass: 'zone-essential', min: 0, max: 2.49,
      action: 'Start a deload week now and use the response ladder.',
      actionDetail: 'Protect sleep, drop the heaviest blocks, and talk to one person about how you are feeling.'
    }
  ];

  var THRESHOLDS = {
    zoneBands: ZONES,
    fullCapacity: 3.5,
    modifiedLoad: 3.0,
    recoveryPlan: 2.5,
    /* Source overrides, applied on top of the weekly average. */
    singleScoreFloor: 2.0,        // a score averaging <= 2.0 forces at least Recovery Plan
    lowScoresPerDay: 3,           // three or more scores of 2 or lower
    lowScoreValue: 2,
    sleepinessAlarm: 3.5,         // average sleepiness >= 3.5
    sleepinessAlarmDays: 5,       // on five or more days
    sleepFloorHours: 7,
    lightsOut: '23:45',
    lightsOutRecovery: '23:15',
    lightsOutEssential: '23:00',
    targets: { workoutsPerWeek: 4, studyHoursPerWeek: 62 }
  };

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
    { key: 'streak',         label: 'Consecutive Full Capacity weeks',     type: 'number' },
    { key: 'tally',          label: 'FOM-4 tallies Mon–Fri (flagged / corrected)', type: 'text' },
    { key: 'lateLightsOut',  label: 'Nights with lights-out after 23:45',  type: 'number' },
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
    version: '2.1',
    edition: 'Self-Study Edition',
    title: 'FOM Daily Schedule',
    startDate: '2026-11-09',          // Monday, 9 November 2026
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
    /* Source override: a single score averaging <= 2.0 for the week means the
       week is at least a Recovery Plan — never better, never worse. */
    if (overrides && overrides.forceAtLeastRecovery && zone.rank < 2) {
      zone = ZONES.filter(function (z) { return z.id === 'recovery'; })[0];
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
                category: b.category, purpose: b.purpose,
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

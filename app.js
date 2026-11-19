/* ==========================================================================
   FOM DAILY SCHEDULE v3.0 — OPERATIONAL TRACKER
   app.js — state, persistence, rendering and analytics.

   Contents
   --------
   01. Constants and application state
   02. Utilities (dates, DOM, formatting, toast)
   03. Persistence (localStorage, debounced save, export, import)
   04. Data access (day logs, derived metrics)
   05. Chrome rendering (top bar, sidebar zone, view switching)
   06. Dashboard (now/next, rings, strip, stats)
   07. Timeline (block cards, milestone drafts, filters)
   08. Daily log (morning check, shutdown, scores, tally, codes)
   09. Analytics (charts, weekly rates, error codes, modules, warnings)
   10. Module tracker
   11. Weekly review
   12. Settings
   13. Event wiring and initialisation

   No frameworks, no network calls, no notifications or alarms.
   ========================================================================== */

(function () {
  'use strict';

  var S = window.FOM_SCHEDULE;

  /* ======================================================================
     01. CONSTANTS AND STATE
     ====================================================================== */

  var STORAGE_KEY = 'fom-schedule-tracker';
  var SCHEMA_VERSION = 2;

  /** Blocks that are not "actionable" for completion counting. */
  var NON_ACTIONABLE = ['Night Sleep', 'Free Zone', 'Free', 'Nap'];

  /** Application state. `data` is the persisted half of a backup. */
  var state = {
    config: null,          // snapshot of the schedule configuration
    data: null,            // daily logs, errors, modules, reviews, settings
    ui: {
      view: 'dashboard',
      date: '',            // selected date, ISO
      range: 14,           // analytics range in days
      category: 'all',     // timeline category filter
      weekStart: '',       // weekly review week, ISO (a Monday)
      importedConfig: null,// config captured from an imported backup
      moduleSearch: '',    // module tracker search text
      moduleFilter: 'all', // all | active | done
      selectedModule: null // id of the module open in the detail panel
    }
  };

  /* Cache of the blocks for a given day, keyed by ISO date. */
  var blockCache = {};

  /* ======================================================================
     02. UTILITIES
     ====================================================================== */

  /* ---------- DOM helpers ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /**
   * Minimal element factory.
   * h('div', {class:'x', onclick:fn, dataset:{id:1}}, 'text', child)
   */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    var props = attrs || {};
    Object.keys(props).forEach(function (key) {
      var val = props[key];
      if (val === null || val === undefined || val === false) return;
      if (key === 'class') { e.className = val; }
      else if (key === 'html') { e.innerHTML = val; }
      else if (key === 'dataset') { Object.assign(e.dataset, val); }
      else if (key === 'style' && typeof val === 'object') {
        Object.keys(val).forEach(function (prop) {
          /* Custom properties must go through setProperty. */
          if (prop.charAt(0) === '-') e.style.setProperty(prop, val[prop]);
          else e.style[prop] = val[prop];
        });
      }
      else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
        e.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (val === true) { e.setAttribute(key, ''); }
      else { e.setAttribute(key, val); }
    });
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(parent, c); }); return; }
    parent.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function icon(name, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---------- Date helpers (all local time, never UTC) ---------- */

  /** Today, as measured in the schedule's timezone. */
  function todayISO() { return planTodayISO(); }

  function dateKey(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function parseISO(key) {
    var p = String(key).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  /** Monday of the week containing the given date. */
  function weekStart(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var offset = (d.getDay() + 6) % 7;         // Monday = 0
    d.setDate(d.getDate() - offset);
    return d;
  }

  function isoWeekNumber(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    var week1 = new Date(d.getFullYear(), 0, 4);
    var diff = (d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7);
    return 1 + Math.round(diff / 7);
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function fmtDate(key, style) {
    var d = parseISO(key);
    var day = d.getDate();
    var mon = MONTHS[d.getMonth()];
    var year = d.getFullYear();
    if (style === 'long') return DAYS[d.getDay()] + ' ' + day + ' ' + mon + ' ' + year;
    if (style === 'short') return day + ' ' + mon;
    if (style === 'weekday') return DAYS[d.getDay()].slice(0, 3);
    return day + ' ' + mon + ' ' + year;
  }

  function fmtClock(date) {
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  function fmtDuration(mins) {
    if (!mins) return '0 m';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h && m) return h + ' h ' + m + ' m';
    if (h) return h + ' h';
    return m + ' min';
  }

  /**
   * A clock range for one block. Times that fall after midnight carry a "+1"
   * marker, because the v3 day crosses midnight (reading, lights-out, sleep).
   */
  function fmtClockRange(block) {
    var startMark = block.absStart !== undefined && block.absStart >= 1440 ? ' +1' : '';
    var endAbs = (block.absStart !== undefined ? block.absStart : 0) + block.duration;
    var endMark = endAbs >= 1440 ? ' +1' : '';
    return block.start + startMark + '–' + block.end + endMark;
  }

  /* ---------- Numbers ---------- */

  function avg(list) {
    var vals = list.filter(function (v) { return typeof v === 'number' && isFinite(v); });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  /* ---------- Toast ---------- */

  var toastTimer = null;
  function toast(message, kind) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  }

  /* ======================================================================
     03. PERSISTENCE
     ====================================================================== */

  function emptyData() {
    return {
      days: {},
      errors: [],
      doubts: [],
      modules: {},
      reviews: {},
      settings: { startDate: S.plan.startDate }
    };
  }

  function load() {
    state.data = emptyData();
    state.config = S.getConfig();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) return;
      state.data = migrate(parsed.data);
      if (parsed.config) state.ui.importedConfig = parsed.config;
      /* If the payload was an older schema, the migration is written back
         straight away — the upgrade is persisted, not just held in memory,
         and nothing in the old payload is ever overwritten before it is read. */
      if (parsed.schema !== SCHEMA_VERSION) writeNow();
    } catch (err) {
      /* Corrupt or unavailable storage must never break the app. */
      console.warn('Could not read saved data:', err);
    }
  }

  /* ------------------------------------------------------------------
     MIGRATION — v2.1 (schema 1) -> v3.0 (schema 2)

     v2.1 kept one "shutdown" object per day. v3 splits it into two things:
     a 21:30 helper check-in and a 23:40 night wrap-up, and it moves the
     scores, the sleepiness readings and the tally to the top of the day
     record. Nothing is thrown away — every v2.1 value is carried across,
     and the old block ids are remapped to their v3 names.
     ------------------------------------------------------------------ */

  /** v2.1 mode id -> v3 mode id (the load ladder was renamed). */
  var MODE_MIGRATION = {
    full: 'green', modified: 'lite', recovery: 'yellow', essential: 'red'
  };

  /** v2.1 sleepiness key -> v3 key (the slots moved with the clock). */
  var SLEEPINESS_MIGRATION = {
    sleepiness1105: 'sleepiness1155',
    sleepiness1525: 'sleepiness1615',
    sleepiness1645: 'sleepiness1735'
  };

  /** v2.1 block id -> v3 block id. */
  var BLOCK_MIGRATION = {
    shutdown: 'wrapup',
    night: 'nightroutine'
  };

  function remapKeys(obj, map) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      out[map[k] || k] = obj[k];
    });
    return out;
  }

  /** Bring one stored day record up to the v3 shape without losing data. */
  function migrateDay(day) {
    var out = emptyDay();
    if (!day || typeof day !== 'object') return out;

    out.mode = MODE_MIGRATION[day.mode] || day.mode || 'green';
    out.template = day.template || null;

    /* Block completion state, with the old block ids remapped. */
    Object.keys(day.blocks || {}).forEach(function (id) {
      out.blocks[BLOCK_MIGRATION[id] || id] = day.blocks[id];
    });

    /* Values already stored in the v3 shape win outright. */
    if (day.checkin) out.checkin = Object.assign(out.checkin, day.checkin);
    if (day.wrapup) {
      out.wrapup = Object.assign(out.wrapup, day.wrapup);
      out.wrapup.outcomes = day.wrapup.outcomes || {};
    }
    if (day.scores) out.scores = Object.assign({}, day.scores);
    if (day.sleepiness) out.sleepiness = Object.assign({}, day.sleepiness);
    if (day.sleep) out.sleep = Object.assign(out.sleep, day.sleep);
    if (day.tally) out.tally = Object.assign({ flagged: 0, corrected: 0, doubt: 0 }, day.tally);
    if (day.codes) out.codes = Object.assign({}, day.codes);
    if (day.workout) out.workout = day.workout;
    if (day.note) out.note = day.note;

    /* Carry the v2.1 shutdown values across. */
    var sh = day.shutdown || {};
    if (sh.outcomes) out.wrapup.outcomes = Object.assign({}, sh.outcomes);
    if (sh.unfinished) out.wrapup.unfinished = sh.unfinished;
    if (sh.hardest) out.wrapup.hardest = sh.hardest;
    if (sh.complete !== undefined) out.wrapup.complete = !!sh.complete;
    if (sh.scores) out.scores = Object.assign({}, sh.scores);
    if (sh.sleepiness) out.sleepiness = remapKeys(sh.sleepiness, SLEEPINESS_MIGRATION);
    if (sh.tally) out.tally = Object.assign({ flagged: 0, corrected: 0, doubt: 0 }, sh.tally);
    if (sh.codes) out.codes = Object.assign({}, sh.codes);
    if (sh.sleepHours !== undefined && out.sleep.hours === '') out.sleep.hours = sh.sleepHours;
    if (sh.nap !== undefined && out.sleep.nap1 === '') out.sleep.nap1 = sh.nap;
    if (sh.workout && !out.workout) out.workout = sh.workout;
    if (sh.note && !out.note) out.note = sh.note;

    return out;
  }

  /** Bring an older payload up to the current shape without losing data. */
  function migrate(data) {
    var base = emptyData();
    if (!data || typeof data !== 'object') return base;
    ['errors', 'doubts', 'modules', 'reviews', 'settings'].forEach(function (key) {
      if (data[key] !== undefined && data[key] !== null) base[key] = data[key];
    });
    if (!base.settings.startDate) base.settings.startDate = S.plan.startDate;

    /* Each day is migrated on its own so a v2.1 record never loses data. */
    base.days = {};
    Object.keys(data.days || {}).forEach(function (key) {
      base.days[key] = migrateDay(data.days[key]);
    });
    return base;
  }

  var saveTimer = null;
  function save(immediate) {
    var indicator = $('#save-indicator');
    if (indicator) {
      indicator.textContent = 'Saving';
      indicator.className = 'save-indicator is-saving';
    }
    if (immediate) {
      writeNow();
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 350);
  }

  function writeNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    var payload = {
      schema: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      config: S.getConfig(),
      data: state.data
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      var indicator = $('#save-indicator');
      if (indicator) {
        indicator.textContent = 'Saved';
        indicator.className = 'save-indicator is-saved';
        setTimeout(function () {
          if (indicator.classList.contains('is-saved')) {
            indicator.className = 'save-indicator';
            indicator.textContent = 'Saved';
          }
        }, 1600);
      }
    } catch (err) {
      var ind = $('#save-indicator');
      if (ind) { ind.textContent = 'Not saved'; ind.className = 'save-indicator is-saving'; }
      toast('Could not save — browser storage is full. Export a backup.', 'error');
    }
  }

  /* ---------- Export ---------- */

  function buildBackup() {
    return {
      schema: SCHEMA_VERSION,
      app: 'FOM Daily Schedule Tracker',
      version: S.plan.version,
      edition: S.plan.edition,
      exportedAt: new Date().toISOString(),
      config: S.getConfig(),
      data: {
        days: state.data.days,
        errors: state.data.errors,
        doubts: state.data.doubts,
        modules: state.data.modules,
        reviews: state.data.reviews,
        settings: state.data.settings
      }
    };
  }

  function exportBackup() {
    var json = JSON.stringify(buildBackup(), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: 'fom-schedule-backup-' + todayISO() + '.json' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Backup exported — ' + Math.round(json.length / 1024) + ' KB', 'success');
  }

  /* ---------- Import ---------- */

  function importBackup(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { ok: false, message: 'That file is not valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, message: 'That file does not contain a backup object.' };
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
      return { ok: false, message: 'That file has no "data" section — it is not a tracker backup.' };
    }
    if (!parsed.data.days) {
      return { ok: false, message: 'That backup has no daily logs.' };
    }
    state.data = migrate(parsed.data);
    state.ui.importedConfig = parsed.config || null;
    clearBlockCache();          /* the restored schedule may differ from the cached one */
    save(true);
    renderAll();
    var days = Object.keys(state.data.days).length;
    return { ok: true, message: 'Backup imported — ' + days + ' day' + (days === 1 ? '' : 's') + ' restored.' };
  }

  /* ======================================================================
     04. DATA ACCESS
     ====================================================================== */

  /** The day mode in force for a date. */
  function modeIdForDate(key) {
    var log = peekDay(key);
    return (log && log.mode) ? log.mode : 'green';
  }

  /**
   * Blocks for a given ISO date, with timing computed.
   * The schedule shown is the one for that date's TEMPLATE and its DAY MODE —
   * a reduced day has its own clock, not the full-capacity one.
   */
  function blocksForDate(key) {
    if (blockCache[key]) return blockCache[key];
    var date = parseISO(key);
    var template = templateForDate(key);
    var mode = modeIdForDate(key);
    var reduced = S.modeTimeline(template.id, mode);
    var blocks = S.withTiming(S.blocksFor(template, date.getDay(), reduced));
    var dayStart = blocks[0].startMin;
    blocks.forEach(function (b) {
      b.absStart = b.startMin >= dayStart ? b.startMin : b.startMin + 1440;
      b.absEnd = b.absStart + b.duration;
      b.templateId = template.id;
    });
    blockCache[key] = blocks;
    return blocks;
  }

  /** Drop every cached schedule so the next render recomputes it. */
  function clearBlockCache() {
    Object.keys(blockCache).forEach(function (key) { delete blockCache[key]; });
  }

  /** The template the app would auto-detect for a date (by weekday). */
  function autoTemplateForDate(key) {
    return S.templateForDay(parseISO(key).getDay());
  }

  /**
   * The template actually in force for a date.
   * Auto-detection is the default; a manual override stored on the day record
   * takes precedence, which is what the top-bar template control sets.
   */
  function templateForDate(key) {
    var log = state.data.days[key];
    if (log && log.template && S.templates[log.template]) return S.templates[log.template];
    return autoTemplateForDate(key);
  }

  /** True when the date carries a manual template override. */
  function hasTemplateOverride(key) {
    var log = state.data.days[key];
    return !!(log && log.template && S.templates[log.template]);
  }

  /** A blank day record. Used as a read-only stand-in for un-logged dates. */
  function emptyDay() {
    return {
      mode: 'green',
      template: null,
      blocks: {},
      /* 21:30 — straight after FOM-4 (Section 4.3). */
      checkin: { done: false, hardestTen: '' },
      /* 23:40 — after REV (Section 13.6). */
      wrapup: {
        complete: false,
        outcomes: {},
        unfinished: '',
        hardest: '',
        stillFuzzy: '',
        revTicked: false,
        cardWritten: false,
        logFinished: false,
        parkingClosed: false,
        routineDone: false,
        readingDone: false
      },
      scores: {},
      sleepiness: {},
      sleep: { hours: '', lightsOut: '', wakeUp: '', nap1: '', miniNap: '' },
      tally: { flagged: 0, corrected: 0, doubt: 0 },
      codes: {},
      workout: '',
      note: ''
    };
  }

  /** The stored log for a date, created on demand. */
  function dayLog(key) {
    if (!state.data.days[key]) state.data.days[key] = emptyDay();
    var log = state.data.days[key];
    if (log.template === undefined) log.template = null;
    if (!log.blocks) log.blocks = {};
    if (!log.checkin) log.checkin = { done: false, hardestTen: '' };
    if (!log.wrapup) log.wrapup = {};
    var w = log.wrapup;
    if (!w.outcomes) w.outcomes = {};
    if (!log.scores) log.scores = {};
    if (!log.sleepiness) log.sleepiness = {};
    if (!log.sleep) log.sleep = {};
    ['hours', 'lightsOut', 'wakeUp', 'nap1', 'miniNap'].forEach(function (k) {
      if (log.sleep[k] === undefined) log.sleep[k] = '';
    });
    if (!log.tally) log.tally = { flagged: 0, corrected: 0, doubt: 0 };
    if (!log.codes) log.codes = {};
    if (log.workout === undefined) log.workout = '';
    if (log.note === undefined) log.note = '';
    return log;
  }

  /** A read-only peek that does not create an empty log. */
  function peekDay(key) { return state.data.days[key] || null; }

  /**
   * A normalised, read-only view of a day record.
   * It never creates a record, but it always returns every field the
   * renderer expects — so an older, half-written record cannot crash a view.
   */
  function readDay(key) {
    var log = peekDay(key);
    if (!log) return emptyDay();
    var out = Object.assign({}, log);
    out.blocks = log.blocks || {};
    out.checkin = log.checkin || { done: false, hardestTen: '' };
    out.wrapup = Object.assign({}, log.wrapup || {});
    out.wrapup.outcomes = (log.wrapup && log.wrapup.outcomes) || {};
    out.scores = log.scores || {};
    out.sleepiness = log.sleepiness || {};
    out.sleep = log.sleep || { hours: '', lightsOut: '', wakeUp: '', nap1: '', miniNap: '' };
    out.tally = log.tally || { flagged: 0, corrected: 0, doubt: 0 };
    out.codes = log.codes || {};
    out.workout = log.workout || '';
    out.note = log.note || '';
    return out;
  }

  function blockState(log, id) {
    if (!log.blocks[id]) log.blocks[id] = {};
    return log.blocks[id];
  }

  /** The five daily scores as numbers, missing entries omitted. */
  function scoreValues(key) {
    var log = peekDay(key);
    if (!log || !log.scores) return [];
    return S.dailyScores.map(function (s) {
      var v = log.scores[s.key];
      return typeof v === 'number' ? v : null;
    }).filter(function (v) { return v !== null; });
  }

  /** The daily average of the five scores, or null. */
  function scoreAverage(key) { return avg(scoreValues(key)); }

  /** The average of the three sleepiness scores for a date. */
  function sleepinessAverage(key) {
    var log = peekDay(key);
    if (!log || !log.sleepiness) return null;
    var vals = S.sleepinessSlots.map(function (s) {
      var v = log.sleepiness[s.key];
      return typeof v === 'number' ? v : null;
    });
    return avg(vals);
  }

  /** The weekly average of the five scores for the week containing `key`. */
  function weeklyScoreAverage(key) {
    var start = weekStart(parseISO(key));
    var vals = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i);
      var v = scoreAverage(dateKey(d));
      if (v !== null) vals.push(v);
    }
    return avg(vals);
  }

  /** The zone descriptor for the week containing `key`. */
  function zoneForWeek(key) {
    var days = 7;
    var start = weekStart(parseISO(key));
    var allScores = [];
    var lowScoreDays = 0;
    var singleScoreFloor = [];
    for (var i = 0; i < 7; i++) {
      var dk = dateKey(addDays(start, i));
      var vals = scoreValues(dk);
      vals.forEach(function (v) { allScores.push(v); });
      var low = vals.filter(function (v) { return v <= S.thresholds.lowScoreValue; }).length;
      if (low >= S.thresholds.lowScoresPerDay) lowScoreDays++;
      if (vals.length) {
        var dayAvg = avg(vals);
        if (dayAvg !== null && dayAvg <= S.thresholds.singleScoreFloor) singleScoreFloor.push(dk);
      }
    }
    var mean = avg(allScores);
    var zone = S.zoneForAverage(mean, { forceAtLeastYellow: singleScoreFloor.length > 0 });
    return {
      average: mean,
      zone: zone,
      loggedDays: allScores.length / 5,
      singleScoreFloorDays: singleScoreFloor,
      lowScoreDays: lowScoreDays
    };
  }

  /** Block completion summary for a date. */
  function completionFor(key) {
    var log = peekDay(key);
    var blocks = blocksForDate(key);
    var done = 0, actionable = 0, studyDone = 0, studyTotal = 0;
    blocks.forEach(function (b) {
      var st = log && log.blocks && log.blocks[b.id];
      var isDone = !!(st && st.done);
      if (NON_ACTIONABLE.indexOf(b.category) === -1) {
        actionable++;
        if (isDone) done++;
      }
      if (['Study', 'Analysis', 'Revision', 'Planning'].indexOf(b.category) !== -1) {
        studyTotal += b.duration;
        if (isDone) studyDone += b.duration;
      }
    });
    var hits = 0, misses = 0;
    if (log && log.wrapup) {
      Object.keys(log.wrapup.outcomes || {}).forEach(function (k) {
        if (log.wrapup.outcomes[k] === 'HIT') hits++;
        else if (log.wrapup.outcomes[k] === 'MISS') misses++;
      });
    }
    return {
      done: done, actionable: actionable, blocks: blocks,
      studyDone: studyDone, studyTotal: studyTotal,
      hits: hits, misses: misses,
      milestones: blocks.filter(function (b) { return b.milestone; })
    };
  }

  /** All logged dates, sorted ascending. */
  function loggedDates() { return Object.keys(state.data.days).sort(); }

  /** Dates in the analytics range, oldest first. */
  function rangeDates() {
    var out = [];
    var end = parseISO(state.ui.date);
    for (var i = state.ui.range - 1; i >= 0; i--) out.push(dateKey(addDays(end, -i)));
    return out;
  }

  /** Count of error-code occurrences across the daily tallies and notebook. */
  function errorCodeTotals(fromKey, toKey) {
    var totals = {};
    S.errorCodes.forEach(function (c) { totals[c.code] = 0; });
    Object.keys(state.data.days).forEach(function (key) {
      if (fromKey && key < fromKey) return;
      if (toKey && key > toKey) return;
      var codes = state.data.days[key].codes || {};
      Object.keys(codes).forEach(function (code) {
        var n = parseInt(codes[code], 10);
        if (!isNaN(n) && totals[code] !== undefined) totals[code] += n;
      });
    });
    (state.data.errors || []).forEach(function (row) {
      if (!row.code) return;
      if (fromKey && row.date && row.date < fromKey) return;
      if (toKey && row.date && row.date > toKey) return;
      if (totals[row.code] !== undefined) totals[row.code] += 1;
    });
    return totals;
  }

  /* ======================================================================
     05. CHROME
     ====================================================================== */

  var VIEW_META = {
    dashboard: { title: 'Dashboard',        sub: 'Live operations view' },
    timeline: { title: "Today's Timeline", sub: 'Fixed blocks · draft milestones here' },
    log:      { title: 'Daily Log & Wrap-up', sub: '60-second check, 21:30 check-in, 23:40 night wrap-up' },
    analytics:{ title: 'Analytics',         sub: 'Energy, sleep, burnout and module progress' },
    modules:  { title: 'Module Tracker',    sub: 'The FOM module cycle and its checkpoints' },
    weekly:   { title: 'Weekly Review',     sub: 'Sunday, 45 minutes' },
    settings: { title: 'Settings',          sub: 'Backup, storage and schedule information' }
  };

  function setView(name) {
    if (!VIEW_META[name]) return;
    state.ui.view = name;
    $$('.view').forEach(function (v) {
      var active = v.dataset.view === name;
      v.classList.toggle('is-active', active);
      v.hidden = !active;
    });
    $$('[data-view-target]').forEach(function (btn) {
      var active = btn.dataset.viewTarget === name;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    var meta = VIEW_META[name];
    $('#topbar-title').textContent = meta.title;
    $('#topbar-sub').textContent = meta.sub;
    document.body.classList.remove('nav-open');
    $('#sidebar-toggle').setAttribute('aria-expanded', 'false');

    /* Re-render the view being opened so it never shows stale data. */
    renderView(name);

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /** Render whichever view is currently active. */
  function renderView(name) {
    switch (name) {
      case 'dashboard': renderDashboard(); break;
      case 'timeline':  renderTimeline();  break;
      case 'log':       renderLog();       break;
      case 'analytics': renderAnalytics(); break;
      case 'modules':   renderModules();   break;
      case 'weekly':    renderWeekly();    break;
      case 'settings':  renderSettings();  break;
    }
  }

  function renderChrome() {
    var key = state.ui.date;
    var template = templateForDate(key);
    var auto = autoTemplateForDate(key);
    var log = peekDay(key);
    var mode = modeById(log && log.mode ? log.mode : 'green');

    /* --- Date control --- */
    $('#topbar-date').textContent = fmtDate(key, 'long');
    $('#topbar-date-input').value = key;

    /* --- Template control: the select holds an "auto" option plus one per
           template. The auto option names the template auto-detected for the
           currently selected date, so the chip is never ambiguous. --- */
    var tsel = $('#template-select');
    if (tsel.options[0]) tsel.options[0].textContent = 'Auto · ' + auto.label;
    tsel.value = hasTemplateOverride(key) ? log.template : 'auto';
    tsel.title = 'In force: ' + template.label + ' · ' + template.shortLabel;

    /* --- Mode control --- */
    var msel = $('#mode-select');
    msel.value = mode.id;
    var modeChip = $('#topbar-mode-chip');
    modeChip.className = 'chip chip--control ' + mode.cssClass;

    // Sidebar zone readout.
    var wk = zoneForWeek(key);
    var zoneLabel = $('#sidebar-zone-value');
    var zoneBox = $('#sidebar-zone');
    zoneBox.className = 'zone-readout ' + (wk.zone ? wk.zone.cssClass : '');
    zoneLabel.textContent = wk.zone ? wk.zone.label : 'No data';
    $('#sidebar-zone-fill').style.width = (wk.average !== null
      ? clamp(((wk.average - 1) / 4) * 100, 0, 100) : 0) + '%';
    $('#sidebar-zone-hint').textContent = wk.average !== null
      ? 'Week average ' + wk.average.toFixed(2) + ' · ' + (wk.zone ? wk.zone.action : '')
      : 'Log the five daily scores to compute your zone.';

    var foot = $('#foot-status');
    if (foot) {
      foot.textContent = 'Offline-first · ' + loggedDates().length + ' day' +
        (loggedDates().length === 1 ? '' : 's') + ' logged · data stays in this browser';
    }
  }

  function modeById(id) {
    for (var i = 0; i < S.dayModes.length; i++) if (S.dayModes[i].id === id) return S.dayModes[i];
    return S.dayModes[0];
  }

  /* ======================================================================
     06. DASHBOARD
     ====================================================================== */

  function renderDashboard() {
    var key = state.ui.date;
    var template = templateForDate(key);
    renderNow();
    renderRings(key);
    renderStrip(key);
    renderStats(key);
    renderSleepPanel(key);
    renderEnergyDashboard(key);
    renderTodayScores(key);
    renderNotices(key);
  }

  /* ---------- Timezone and clock ---------- */

  /**
   * The wall-clock time in the SCHEDULE's timezone (IST).
   * The schedule is evaluated in this zone, not in the device zone — a laptop
   * set to another timezone must still show what is running in the plan.
   */
  function planNow() {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: S.plan.timeZoneKey,
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).formatToParts(new Date());
      var h = 0, m = 0, sec = 0;
      parts.forEach(function (p) {
        if (p.type === 'hour') h = parseInt(p.value, 10) % 24;
        else if (p.type === 'minute') m = parseInt(p.value, 10);
        else if (p.type === 'second') sec = parseInt(p.value, 10);
      });
      return { hour: h, minute: m, second: sec, minutes: h * 60 + m };
    } catch (err) {
      var d = new Date();
      return {
        hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(),
        minutes: d.getHours() * 60 + d.getMinutes()
      };
    }
  }

  /** Today's calendar date in the schedule's timezone. */
  function planTodayISO() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: S.plan.timeZoneKey, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (err) {
      return dateKey(new Date());
    }
  }

  /** The browser's own timezone and its short name. */
  function timezoneInfo() {
    var zone = S.plan.timeZoneKey;
    var abbrev = 'IST';
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || zone;
      var parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date());
      parts.forEach(function (p) { if (p.type === 'timeZoneName') abbrev = p.value; });
    } catch (err) { /* keep the defaults */ }
    return { zone: zone, abbrev: abbrev };
  }

  /** Paint the live clock and the current-timezone line. */
  function renderClock() {
    var plan = planNow();
    var device = timezoneInfo();
    var clock = $('#topbar-clock');
    if (clock) {
      clock.textContent = String(plan.hour).padStart(2, '0') + ':' +
        String(plan.minute).padStart(2, '0') + ':' + String(plan.second).padStart(2, '0');
    }
    var tzEl = $('#topbar-tz');
    if (tzEl) tzEl.textContent = 'IST';
    var chip = $('#topbar-clock-chip');
    if (chip) {
      chip.title = 'Schedule clock — ' + S.plan.timeZone + '. Your device reads ' +
        device.abbrev + ' ' + fmtClock(new Date()) + '.';
    }

    var line = $('#now-tz');
    if (line) {
      var base = 'Schedule clock: ' + S.plan.timeZone + ' · ' + fmtDate(todayISO(), 'long');
      if (device.zone !== S.plan.timeZoneKey) {
        base += ' · your device reads ' + device.abbrev + ' ' + fmtClock(new Date());
      }
      line.textContent = base;
    }
  }

  /* ---------- Now / next ---------- */

  function renderNow() {
    var todayKey = todayISO();
    var blocks = blocksForDate(todayKey);
    var now = planNow();
    var nowMin = now.minutes;
    var dayStart = blocks[0].startMin;
    var rel = nowMin >= dayStart ? nowMin : nowMin + 1440;

    var current = null, next = null;
    blocks.forEach(function (b, i) {
      if (!current && rel >= b.absStart && rel < b.absEnd) current = b;
      if (!next && b.absStart > rel) next = b;
    });
    if (!next) next = blocks[0];

    var viewingOther = state.ui.date !== todayKey;

    if (current) {
      var pct = clamp(((rel - current.absStart) / current.duration) * 100, 0, 100);
      var remaining = current.absEnd - rel;
      $('#now-time').textContent = String(now.hour).padStart(2, '0') + ':' +
        String(now.minute).padStart(2, '0');
      $('#now-window').textContent = fmtClockRange(current) + ' · ' + fmtDuration(current.duration);
      $('#now-title').textContent = current.title;
      $('#now-running').textContent = 'Running now · ' + current.title;
      $('#now-purpose').textContent = current.purpose;
      $('#now-category').textContent = current.category;
      $('#now-category').dataset.cat = current.category;
      $('#now-category').className = 'pill pill--cat';
      $('#now-progress-fill').style.width = pct.toFixed(1) + '%';
      $('#now-remaining').textContent = fmtDuration(remaining) + ' left · ' +
        Math.round(pct) + '% through';
      $('#now-next').textContent = next.title + ' · ' + fmtClockRange(next);
    } else {
      $('#now-time').textContent = String(now.hour).padStart(2, '0') + ':' +
        String(now.minute).padStart(2, '0');
      $('#now-window').textContent = '—';
      $('#now-title').textContent = 'No active block';
      $('#now-running').textContent = 'Running now · resting';
      $('#now-purpose').textContent = 'The schedule is resting. The next block begins at ' +
        next.start + '.';
      $('#now-category').textContent = '—';
      $('#now-category').removeAttribute('data-cat');
      $('#now-category').className = 'pill';
      $('#now-progress-fill').style.width = '0%';
      $('#now-remaining').textContent = '—';
      $('#now-next').textContent = next.title + ' · ' + fmtClockRange(next);
    }

    if (viewingOther) {
      $('#now-purpose').textContent += '  (Live clock — showing today\'s block while ' +
        fmtDate(state.ui.date, 'long') + ' is selected.)';
    }
  }

  /* ---------- Rings ---------- */

  function renderRings(key) {
    var c = completionFor(key);
    var blockPct = c.actionable ? (c.done / c.actionable) * 100 : 0;
    var msTotal = c.hits + c.misses;
    var msPct = msTotal ? (c.hits / msTotal) * 100 : 0;

    var CIRC = 2 * Math.PI * 52;
    $('#ring-blocks-value').style.strokeDasharray = CIRC;
    $('#ring-blocks-value').style.strokeDashoffset = CIRC * (1 - blockPct / 100);
    $('#ring-blocks-pct').textContent = Math.round(blockPct) + '%';

    $('#ring-milestones-value').style.strokeDasharray = CIRC;
    $('#ring-milestones-value').style.strokeDashoffset = CIRC * (1 - msPct / 100);
    $('#ring-milestones-pct').textContent = msTotal ? Math.round(msPct) + '%' : '—';
  }

  /* ---------- Day strip ---------- */

  function renderStrip(key) {
    var host = $('#day-strip');
    var legend = $('#day-strip-legend');
    clear(host); clear(legend);

    var blocks = blocksForDate(key);
    var log = peekDay(key);
    var todayKey = todayISO();
    var todayBlocks = key === todayKey ? blocks : blocksForDate(todayKey);
    var now = planNow();
    var nowMin = now.minutes;
    var dayStart = todayBlocks[0].startMin;
    var rel = nowMin >= dayStart ? nowMin : nowMin + 1440;
    var currentId = null;
    todayBlocks.forEach(function (b) { if (rel >= b.absStart && rel < b.absEnd) currentId = b.id; });

    var cats = [];
    blocks.forEach(function (b) {
      if (cats.indexOf(b.category) === -1) cats.push(b.category);
      var st = log && log.blocks && log.blocks[b.id];
      var done = !!(st && st.done);
      var seg = h('div', {
        class: 'strip__seg' + (done ? ' is-done' : '') + (b.id === currentId ? ' is-now' : ''),
        dataset: { cat: b.category },
        style: { flexGrow: String(b.duration), flexBasis: '0' },
        role: 'listitem',
        tabindex: '0',
        title: b.title + ' · ' + fmtClockRange(b) + ' — click to open',
        onclick: function () { focusBlock(key, b.id); },
        onkeydown: function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusBlock(key, b.id); }
        }
      }, h('span', { class: 'strip__seg__tip' }, b.title + ' · ' + fmtClockRange(b)));
      host.appendChild(seg);
    });

    cats.forEach(function (cat) {
      legend.appendChild(h('span', { class: 'legend-item', dataset: { cat: cat } },
        h('i'), cat));
    });
    $('#day-template-pill').textContent = templateForDate(key).label + ' · ' +
      fmtDate(key, 'weekday');
  }

  /* ---------- Stats ---------- */

  function renderStats(key) {
    var log = peekDay(key);
    var c = completionFor(key);
    var mode = modeById(log && log.mode ? log.mode : 'green');

    $('#stat-mode').textContent = mode.label;
    $('#stat-mode-note').textContent = mode.description;

    $('#stat-study').textContent = fmtDuration(c.studyDone);
    $('#stat-study-note').textContent = 'of ' + fmtDuration(c.studyTotal) + ' planned study load';

    var hours = log && log.sleep ? log.sleep.hours : '';
    $('#stat-sleep').textContent = hours ? hours + ' h' : '—';
    $('#stat-sleep-note').textContent = hours
      ? (parseFloat(hours) < S.thresholds.sleepFloorHours
          ? 'Below the 7 h floor — protect tonight\'s sleep.'
          : 'At or above the 7 h floor · target 7 h 30 m.')
      : 'Not logged yet · target 7 h 30 m';

    var wk = zoneForWeek(key);
    $('#stat-zone').textContent = wk.zone ? wk.zone.label : '—';
    $('#stat-zone-note').textContent = wk.average !== null
      ? 'Week average ' + wk.average.toFixed(2) + ' · ' + wk.zone.action
      : 'Needs a week of scores';

    var fiveDay = [];
    var sleepFive = [];
    for (var i = 4; i >= 0; i--) {
      var dk = dateKey(addDays(parseISO(key), -i));
      var e = scoreAverage(dk);
      if (e !== null) fiveDay.push(e);
      var sl = sleepinessAverage(dk);
      if (sl !== null) sleepFive.push(sl);
    }
    var eAvg = avg(fiveDay), sAvg = avg(sleepFive);
    $('#stat-energy').textContent = eAvg !== null ? eAvg.toFixed(2) + ' / 5' : '—';
    $('#stat-energy-note').textContent = eAvg !== null
      ? 'Average of the five daily scores, last 5 days'
      : 'Daily score average';
    $('#stat-sleepiness').textContent = sAvg !== null ? sAvg.toFixed(2) + ' / 5' : '—';
    $('#stat-sleepiness-note').textContent = sAvg !== null
      ? (sAvg >= S.thresholds.sleepinessAlarm
          ? 'At or above the 3.5 alarm level — add sleep before cutting blocks.'
          : '11:55 / 16:15 / 17:35 averaged')
      : '11:55 / 16:15 / 17:35';
  }

  /* ---------- Sleep & recovery panel (Section 13.1) ---------- */

  function renderSleepPanel(key) {
    var host = $('#sleep-panel');
    if (!host) return;
    clear(host);
    var log = peekDay(key);
    var sleep = (log && log.sleep) || {};
    var mode = modeById(log && log.mode ? log.mode : 'green');

    /* The mode decides the lights-out: Full Capacity 00:30, Modified Load and
       Recovery Plan 00:10, Essential Plan 00:00. */
    var modeLightsOut = mode.id === 'green' ? S.thresholds.lightsOut
      : mode.id === 'red' ? S.thresholds.lightsOutRed
      : S.thresholds.lightsOutLite;

    var hours = sleep.hours !== undefined && sleep.hours !== '' ? parseFloat(sleep.hours) : null;
    var nap = parseInt(sleep.nap1, 10);
    var mini = parseInt(sleep.miniNap, 10);
    var napTotal = (isNaN(nap) ? 0 : nap) + (isNaN(mini) ? 0 : mini);

    var cells = [
      {
        k: 'Lights-out', v: sleep.lightsOut || modeLightsOut,
        n: sleep.lightsOut
          ? (sleep.lightsOut > '00:40' ? 'After the 00:40 wall — fix the night.'
             : 'Inside the 00:20–00:40 window.')
          : 'Target 00:30 ± 10 · window 00:20–00:40',
        cls: sleep.lightsOut && sleep.lightsOut > '00:40' ? 'zone-red' : 'zone-green'
      },
      {
        k: 'Wake-up', v: sleep.wakeUp || S.thresholds.wakeUp,
        n: '08:00 every day, weekends included',
        cls: 'zone-green'
      },
      {
        k: 'Sleep last night', v: hours !== null && !isNaN(hours) ? hours.toFixed(2) + ' h' : '7 h 30 m',
        n: hours !== null && !isNaN(hours)
          ? (hours < S.thresholds.sleepFloorHours ? 'Below the 7 h floor.' : 'At or above the 7 h floor.')
          : '7 h 30 m target · never below 7 h',
        cls: hours !== null && !isNaN(hours) && hours < S.thresholds.sleepFloorHours ? 'zone-red' : 'zone-green'
      },
      {
        k: 'Napping', v: napTotal ? napTotal + ' min' : '—',
        n: napTotal
          ? (napTotal > 45 ? 'Over the 45-minute napping cap.' : 'Within the 45-minute cap.')
          : 'Nap 1 (30) + mini-nap (≤ 15) = 45 max',
        cls: napTotal > 45 ? 'zone-yellow' : 'zone-lite'
      },
      {
        k: 'Workout', v: (log && log.workout) || '—',
        n: '17:55 – 18:30, five days a week',
        cls: 'zone-lite'
      },
      {
        k: 'Mode lights-out', v: modeLightsOut,
        n: mode.label + ' · ' + mode.studyLabel + ' of study',
        cls: mode.cssClass.replace('zone-', 'zone-')
      }
    ];

    cells.forEach(function (cell) {
      host.appendChild(h('div', { class: 'sleep-cell ' + (cell.cls || '') },
        h('span', { class: 'sleep-cell__k' }, cell.k),
        h('span', { class: 'sleep-cell__v' }, cell.v),
        h('span', { class: 'sleep-cell__n' }, cell.n)));
    });
  }

  /* ---------- Energy dashboard card ---------- */

  function renderEnergyDashboard(key) {
    var wk = zoneForWeek(key);
    var pill = $('#energy-dashboard-zone');
    var fill = $('#energy-dashboard-fill');
    var meter = fill.parentNode;

    if (!wk.zone) {
      pill.textContent = 'No data';
      pill.className = 'pill';
      meter.className = 'progress progress--lg';
      fill.style.width = '0%';
      $('#energy-dashboard-text').textContent =
        'Average all five daily scores across the current week to see the zone.';
    } else {
      pill.textContent = wk.zone.label;
      pill.className = 'pill ' + wk.zone.cssClass;
      meter.className = 'progress progress--lg ' + wk.zone.cssClass;
      fill.style.width = clamp(((wk.average - 1) / 4) * 100, 0, 100).toFixed(1) + '%';
      $('#energy-dashboard-text').textContent = 'Week average ' + wk.average.toFixed(2) +
        ' across ' + Math.round(wk.loggedDays) + ' logged day' +
        (wk.loggedDays === 1 ? '' : 's') + '. ' + wk.zone.action + ' ' + wk.zone.actionDetail;
    }

    var legend = $('#zone-legend');
    clear(legend);
    S.zones.forEach(function (z) {
      legend.appendChild(h('li', { class: z.cssClass },
        h('i'),
        h('span', {}, h('b', {}, z.label)),
        h('em', {}, z.min.toFixed(2) + ' – ' + z.max.toFixed(2))));
    });
  }

  /* ---------- Today's scores ---------- */

  function renderTodayScores(key) {
    var log = peekDay(key);
    var list = $('#today-score-list');
    clear(list);
    var scores = (log && log.scores) || {};
    var filled = 0;

    S.dailyScores.forEach(function (s) {
      var v = scores[s.key];
      if (typeof v === 'number') filled++;
      list.appendChild(h('li', {},
        h('span', {}, s.label),
        h('span', { class: 'bar' }, h('i', { style: { width: (v ? (v / 5) * 100 : 0) + '%' } })),
        h('b', {}, typeof v === 'number' ? String(v) : '—')));
    });
    $('#today-score-count').textContent = filled + ' / 5 logged';

    var sl = (log && log.sleepiness) || {};
    S.sleepinessSlots.forEach(function (slot) {
      var el = $('#today-sleepiness-row .sleepiness-slot[data-slot="' + slot.time + '"]');
      if (!el) return;
      var value = sl[slot.key];
      var level = typeof value === 'number' ? value : 0;
      el.querySelector('strong').textContent = typeof value === 'number' ? String(value) : '—';
      el.className = 'sleepiness-slot ' +
        (level >= 4 ? 'zone-red'
          : level === 3 ? 'zone-yellow'
          : level === 2 ? 'zone-lite'
          : level === 1 ? 'zone-green' : '');
    });
  }

  /* ---------- Notices ---------- */

  function renderNotices(key) {
    var host = $('#dashboard-notices');
    clear(host);
    var log = peekDay(key);
    var mode = modeById(log && log.mode ? log.mode : 'green');
    var template = templateForDate(key);

    if (mode.id !== 'green') {
      host.appendChild(h('div', { class: 'notice notice--warn ' + mode.cssClass },
        icon('alert'),
        h('p', {}, h('strong', {}, mode.label + ' today. '), mode.detail)));
    }

    if (template.id === 'sunday') {
      host.appendChild(h('div', { class: 'notice notice--info' },
        icon('target'),
        h('p', {}, h('strong', {}, 'Sunday is the Weekly Review & planning block. '),
          'Run the Energy Dashboard, complete the review and plan next week while the week\'s work is still fresh.')));
    }

    /* Section 22.8 — the deload week is scheduled before you need it. */
    if (S.isDeloadWeek(key)) {
      host.appendChild(h('div', { class: 'notice notice--info' },
        icon('target'),
        h('p', {}, h('strong', {}, 'Deload week. '),
          'Weeks 4, 8, 12 and every 4th week after that are deload weeks — scheduled before you need them. ' +
          'FOM-3 goes free, FOM-4 halves, Physics and Chemistry drop to 50 minutes, C+E to 40 and REV to 40. ' +
          'The sleep block does not change.')));
    }

    var wk = zoneForWeek(key);
    if (wk.average !== null && wk.zone && wk.zone.id === 'red') {
      host.appendChild(h('div', { class: 'notice notice--danger' },
        icon('alert'),
        h('p', {}, h('strong', {}, 'Burnout zone: ' + wk.zone.label + '. '),
          wk.zone.action + ' ' + wk.zone.actionDetail)));
    }
  }

  /* ======================================================================
     07. TIMELINE
     ====================================================================== */

  /**
   * The section a block belongs to.
   * `absStart` is the block's start measured from the beginning of the day's
   * own frame, so a block after midnight (00:00–00:30) counts as 1440+ and
   * stays in the Night section instead of jumping back to Morning.
   */
  function periodFor(absStart) {
    if (absStart < 12 * 60) return 'Morning';
    if (absStart < 15 * 60) return 'Midday';
    if (absStart < 18 * 60) return 'Afternoon';
    if (absStart < 22 * 60) return 'Evening';
    return 'Night';
  }

  function renderFilters(key) {
    var host = $('#category-filters');
    clear(host);
    var blocks = blocksForDate(key);
    var present = [];
    blocks.forEach(function (b) { if (present.indexOf(b.category) === -1) present.push(b.category); });

    var counts = {};
    blocks.forEach(function (b) { counts[b.category] = (counts[b.category] || 0) + 1; });

    var all = h('button', {
      type: 'button',
      class: 'filter-chip' + (state.ui.category === 'all' ? ' is-active' : ''),
      dataset: { cat: '' },
      onclick: function () { state.ui.category = 'all'; renderTimeline(); }
    }, 'All categories', h('span', { class: 'filter-chip__count' }, String(blocks.length)));
    host.appendChild(all);

    present.forEach(function (cat) {
      var chip = h('button', {
        type: 'button',
        class: 'filter-chip' + (state.ui.category === cat ? ' is-active' : ''),
        dataset: { cat: cat },
        onclick: function () { state.ui.category = cat; renderTimeline(); }
      }, h('i'), cat, h('span', { class: 'filter-chip__count' }, String(counts[cat])));
      host.appendChild(chip);
    });
  }

  function renderTimeline() {
    var key = state.ui.date;
    var blocks = blocksForDate(key);
    var log = readDay(key);
    var template = templateForDate(key);

    /* When the day runs on a reduced schedule, say so plainly. */
    var mode = modeById(modeIdForDate(key));
    var note = $('#timeline-mode-note');
    if (mode.id !== 'green') {
      var planBlocks = blocksForDate(key);
      var planStudy = planBlocks.filter(function (b) {
        return ['Study', 'Analysis', 'Revision', 'Planning'].indexOf(b.category) !== -1;
      }).reduce(function (a, b) { return a + b.duration; }, 0);
      var planSleep = planBlocks.filter(function (b) { return b.category === 'Night Sleep'; })[0];
      note.hidden = false;
      note.innerHTML = '';
      note.appendChild(icon('alert'));
      note.appendChild(h('p', {},
        h('strong', {}, mode.label + ' schedule — ' + planBlocks.length + ' blocks, ' +
          fmtDuration(planStudy) + ' of study. '),
        mode.detail + ' Lights-out ' + (planSleep ? planSleep.start : '—') +
        ' · sleep ' + (planSleep ? fmtDuration(planSleep.duration) : '—') + '.'));
    } else {
      note.hidden = true;
    }

    /* Show the template in force, and offer a reset when it is overridden. */
    var auto = autoTemplateForDate(key);
    var overridden = hasTemplateOverride(key);
    $('#timeline-template-pill').textContent = overridden
      ? template.label + ' · ' + template.theme + ' (override)'
      : template.label + ' · ' + template.theme + ' (auto: ' + auto.shortLabel + ')';
    $('#template-reset').hidden = !overridden;
    var c = completionFor(key);
    $('#timeline-progress-pill').textContent = c.done + ' / ' + c.actionable + ' done';
    $('#date-picker').value = key;

    renderFilters(key);

    var host = $('#timeline-blocks');
    clear(host);

    var groups = [];
    blocks.forEach(function (b) {
      if (state.ui.category !== 'all' && b.category !== state.ui.category) return;
      var p = periodFor(b.absStart);
      var g = groups.filter(function (x) { return x.name === p; })[0];
      if (!g) { g = { name: p, blocks: [] }; groups.push(g); }
      g.blocks.push(b);
    });

    if (!groups.length) {
      host.appendChild(h('p', { class: 'table__empty' }, 'No blocks in this category for this template.'));
      return;
    }

    var crossesMidnight = blocks.some(function (b) { return b.absStart >= 1440; });

    groups.forEach(function (g) {
      var label = h('h3', { class: 'timeline__grouplabel' }, g.name);
      if (crossesMidnight && g.name === 'Night') {
        label.appendChild(h('span', { class: 'timeline__groupnote' },
          'runs past midnight — the blocks marked +1 are tomorrow morning'));
      }
      var section = h('section', { class: 'timeline__group' }, label);
      g.blocks.forEach(function (b) { section.appendChild(renderBlockCard(b, log, key)); });
      host.appendChild(section);
    });
  }

  function renderBlockCard(block, log, key) {
    var st = blockState(log, block.id);
    var done = !!st.done;
    var startNextDay = block.absStart >= 1440;
    var endNextDay = (block.absStart + block.duration) >= 1440;

    var card = h('article', {
      class: 'block' + (done ? ' is-done' : ''),
      dataset: { cat: block.category, blockId: block.id }
    });

    /* Time column — read-only, straight from the master timeline. */
    card.appendChild(h('div', { class: 'block__time' },
      h('b', {}, block.start,
        startNextDay ? h('i', { class: 'block__plus1', title: 'after midnight — the next morning' }, '+1') : null),
      h('span', {}, block.end,
        endNextDay ? h('i', { class: 'block__plus1', title: 'the next morning' }, '+1') : null),
      h('span', { class: 'block__dur' }, fmtDuration(block.duration))));

    /* Main column */
    var main = h('div', { class: 'block__main' });
    var head = h('div', { class: 'block__head' },
      h('h3', { class: 'block__title' }, block.title),
      h('span', { class: 'pill pill--cat', dataset: { cat: block.category } }, block.category),
      /* The source's type column is only worth showing when it says
         something the category does not already say. */
      (block.type && block.type.toLowerCase() !== block.category.toLowerCase())
        ? h('span', { class: 'pill pill--type', title: 'Block type in the master timeline' }, block.type)
        : null,
      block.lastBlock ? h('span', { class: 'pill pill--quiet' }, 'Last block') : null,
      block.always ? h('span', { class: 'pill pill--quiet' }, 'Never skipped') : null);
    main.appendChild(head);
    main.appendChild(h('p', { class: 'block__purpose' }, block.purpose));
    if (block.content) {
      main.appendChild(h('p', { class: 'block__purpose' },
        h('strong', {}, 'Today: '), block.content));
    }
    card.appendChild(main);

    /* Done / Not Done */
    var toggle = h('button', {
      type: 'button',
      class: 'toggle ' + (done ? 'is-on' : 'is-off'),
      dataset: { action: 'toggle-done', blockId: block.id },
      onclick: function () { toggleDone(key, block.id); }
    }, h('span', { class: 'dot' }), done ? 'Done' : 'Not Done');
    card.appendChild(h('div', { class: 'block__actions' }, toggle));

    /* Milestone draft (hybrid paper workflow) */
    if (block.milestone) {
      var draft = h('div', { class: 'block__draft' });
      if (!st.open) draft.hidden = true;

      var draftToggle = h('button', {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        dataset: { action: 'toggle-draft', blockId: block.id },
        onclick: function () {
          var s = blockState(dayLog(key), block.id);
          s.open = !s.open;
          save();
          renderTimeline();
        }
      }, icon('log'), st.open ? 'Hide draft' : 'Draft milestone');

      card.querySelector('.block__actions').appendChild(draftToggle);

      draft.appendChild(h('div', { class: 'milestone-draft' },
        h('span', { class: 'milestone-draft__label' }, 'Milestone draft — ' + (block.subject || block.title)),
        h('p', { class: 'milestone-draft__hint' },
          'Could a stranger judge this from your page? Can it be ticked or unticked? Does it fit inside the block?'),
        h('div', { class: 'milestone-draft__row' },
          h('label', { class: 'field' },
            h('span', { class: 'field__label' }, 'Milestone'),
            h('textarea', {
              class: 'input textarea', rows: '2',
              dataset: { action: 'milestone', blockId: block.id },
              placeholder: 'e.g. Prove the section\'s main theorem unaided in ≤ 15 lines.',
              oninput: function (e) { blockState(dayLog(key), block.id).milestone = e.target.value; save(); }
            }, st.milestone || '')),
          h('label', { class: 'field' },
            h('span', { class: 'field__label' }, 'Evidence (page / file)'),
            h('input', {
              type: 'text', class: 'input',
              dataset: { action: 'evidence', blockId: block.id },
              placeholder: 'Notebook p.42',
              value: st.evidence || '',
              oninput: function (e) { blockState(dayLog(key), block.id).evidence = e.target.value; save(); }
            }))),
        h('label', { class: 'draft-toggle' },
          h('input', {
            type: 'checkbox',
            checked: !!st.writtenNightBefore,
            onchange: function (e) { blockState(dayLog(key), block.id).writtenNightBefore = e.target.checked; save(); }
          }),
          h('span', {}, 'Written the night before — the integrity guard'))));

      card.appendChild(draft);
    }

    return card;
  }

  /** Open the timeline for a date and bring one block into focus. */
  function focusBlock(key, blockId) {
    if (key !== state.ui.date) setDate(key);
    setView('timeline');
    setTimeout(function () {
      var el = $('#timeline-blocks .block[data-block-id="' + blockId + '"]');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('is-focus');
      setTimeout(function () { el.classList.remove('is-focus'); }, 2000);
    }, 140);
  }

  function toggleDone(key, blockId) {
    var log = dayLog(key);
    var st = blockState(log, blockId);
    st.done = !st.done;
    save();
    renderTimeline();
    renderLog();
    renderDashboard();
  }

  /* ======================================================================
     08. DAILY LOG
     ====================================================================== */

  function renderLog() {
    var key = state.ui.date;
    var log = readDay(key);
    var blocks = blocksForDate(key);
    var template = templateForDate(key);

    $('#log-date-picker').value = key;
    $('#log-mode-pill').textContent = template.label + ' · ' + fmtDate(key, 'long');

    renderMorningCheck(key);
    renderModePicker(key);
    renderChecklist(key);
    renderCheckinSteps();
    renderWrapupGrid(key);
    renderShutdownTable(key);
    renderPaperSheet(key);
    renderCodeGrid(key);
    renderFom4Protocol();
    populateStaticLogFields(key);
    renderErrorRows();
    renderDoubtRows();
  }

  /* ---------- A. The 60-second check (Section 22.1) ---------- */

  /* The three checks of the source's morning table, worst decides the mode. */
  var MORNING_CHECKS = [
    { id: 'sleep', label: 'Sleep', green: '≥ 7 h, reasonably restful', yellow: '6 h – 7 h, or restless', red: '< 6 h' },
    { id: 'body',  label: 'Body',  green: 'Fine', yellow: 'Mildly tired, slight headache, minor aches', red: 'Fever, vomiting, strong pain' },
    { id: 'head',  label: 'Head',  green: 'Ready or neutral', yellow: 'Flat, irritable, easily distracted', red: 'Dread, overwhelmed, can\'t start' }
  ];

  var MORNING_RANK = { green: 0, yellow: 1, red: 2 };

  function renderMorningCheck(key) {
    var log = readDay(key);
    var host = $('#morning-check-grid');
    clear(host);
    var saved = log.morningCheck || {};

    MORNING_CHECKS.forEach(function (check) {
      var opts = h('div', { class: 'check-grid__opts' });
      ['green', 'yellow', 'red'].forEach(function (level) {
        var id = 'mc-' + check.id + '-' + level;
        var radio = h('input', {
          type: 'radio', id: id, name: 'morning-' + check.id, value: level,
          checked: saved[check.id] === level,
          onchange: function () {
            var d = dayLog(key);
            if (!d.morningCheck) d.morningCheck = {};
            d.morningCheck[check.id] = level;
            save();
            renderMorningCheck(key);
            renderModePicker(key);
          }
        });
        opts.appendChild(h('label', {
          class: 'check-grid__opt zone-' + level,
          for: id,
          title: level === 'green' ? check.green : level === 'yellow' ? check.yellow : check.red
        }, radio, h('span', {}, level.charAt(0).toUpperCase() + level.slice(1))));
      });
      host.appendChild(h('div', { class: 'check-grid__row' },
        h('span', { class: 'check-grid__label' }, check.label),
        opts));
    });

    /* The worst of the three decides the mode. */
    var verdict = $('#morning-verdict');
    clear(verdict);
    var levels = MORNING_CHECKS.map(function (c) { return saved[c.id]; })
      .filter(function (v) { return !!v; });
    if (!levels.length) {
      verdict.className = 'check-grid__verdict';
      verdict.appendChild(h('span', {}, 'Answer the three checks — the worst of the three decides the mode.'));
      return;
    }
    var worst = levels.reduce(function (a, b) {
      return MORNING_RANK[a] >= MORNING_RANK[b] ? a : b;
    });
    var mode = modeById(worst === 'red' ? 'red' : worst === 'yellow' ? 'yellow' : 'green');
    verdict.className = 'check-grid__verdict zone-' + worst;
    verdict.appendChild(h('span', { class: 'zone-dot' }));
    verdict.appendChild(h('span', {},
      'The worst of the three is ', h('b', {}, mode.label), ' (', mode.sourceLabel,
      ') — that is the mode the checks point to. ',
      'Write it in the daily log; choosing a lighter plan early is a skill, not a failure.'));
  }

  /* ---------- C. Helper check-in steps (Section 4.3) ---------- */

  function renderCheckinSteps() {
    var host = $('#checkin-steps');
    if (!host) return;
    clear(host);
    S.helperCheckinSteps.forEach(function (step) {
      host.appendChild(h('li', {}, step));
    });
  }

  /* ---------- D. Night wrap-up checklist (Section 13.6) ---------- */

  function renderWrapupGrid(key) {
    var host = $('#wrapup-grid');
    if (!host) return;
    clear(host);
    var log = readDay(key);

    S.wrapupChecks.forEach(function (item) {
      var done = !!log.wrapup[item.key];
      var box = h('input', {
        type: 'checkbox', id: 'wrapup-' + item.key,
        checked: done,
        onchange: function (e) {
          dayLog(key).wrapup[item.key] = e.target.checked;
          save();
          renderWrapupGrid(key);
        }
      });
      host.appendChild(h('label', {
        class: 'wrapup-item' + (done ? ' is-done' : ''),
        for: 'wrapup-' + item.key,
        title: item.detail
      }, box, h('span', { class: 'wrapup-item__text' },
        h('span', { class: 'wrapup-item__label' }, item.label),
        h('span', { class: 'wrapup-item__detail' }, item.detail))));
    });
  }

  /* ---------- G. FOM-4 protocol (Section 9.13) ---------- */

  function renderFom4Protocol() {
    var host = $('#fom4-protocol');
    if (!host) return;
    clear(host);
    S.fom4Protocol.forEach(function (step) {
      host.appendChild(h('li', {},
        h('b', {}, step.step + ' (' + step.minutes + ' min) — '),
        step.detail));
    });
  }

  /* ---------- A. Mode picker ---------- */

  function renderModePicker(key) {
    var log = readDay(key);
    var host = $('#mode-picker');
    clear(host);
    S.dayModes.forEach(function (mode) {
      var card = h('button', {
        type: 'button',
        class: 'mode-card ' + mode.cssClass + (log.mode === mode.id ? ' is-selected' : ''),
        role: 'radio',
        'aria-checked': log.mode === mode.id ? 'true' : 'false',
        onclick: function () {
          log.mode = mode.id;
          clearBlockCache();
          save();
          renderModePicker(key);
          renderChrome();
          renderDashboard();
          renderTimeline();
          renderLog();
        }
      },
        h('span', { class: 'mode-card__name' }, h('span', { class: 'zone-dot' }), mode.label,
          h('span', { class: 'mode-card__src', title: 'Name used in the source document' }, mode.sourceLabel),
          h('span', { class: 'mode-card__load' }, mode.studyLabel + ' study')),
        h('span', { class: 'mode-card__desc' }, mode.description));
      host.appendChild(card);
    });

    var mode = modeById(log.mode);
    var detail = $('#mode-detail');
    clear(detail);
    detail.className = 'mode-detail ' + mode.cssClass;
    detail.appendChild(h('p', {}, h('strong', {}, mode.label + ' (' + mode.sourceLabel + ') — '), mode.detail));
    /* The source gives a weekday-by-weekday breakdown; show it only when the
       selected date actually runs on the weekday template. */
    if (templateForDate(key).id === 'weekday' && mode.weekdayDetail) {
      detail.appendChild(h('p', { style: { marginTop: '8px', color: 'var(--text-faint)' } },
        mode.weekdayDetail));
    }
    detail.appendChild(h('ul', {}, mode.rules.map(function (r) { return h('li', {}, r); })));
  }

  /* ---------- B. Completion checklist ---------- */

  function renderChecklist(key) {
    var log = readDay(key);
    var blocks = blocksForDate(key);
    var host = $('#log-block-checklist');
    clear(host);

    blocks.forEach(function (b) {
      var st = log.blocks[b.id] || {};
      var done = !!st.done;
      var row = h('li', {
        class: 'checklist__row' + (done ? ' is-done' : ''),
        dataset: { cat: b.category, blockId: b.id }
      },
        h('span', { class: 'checklist__time' }, b.start,
          b.absStart >= 1440 ? h('i', { class: 'block__plus1', title: 'after midnight — the next morning' }, '+1') : null),
        h('span', { class: 'checklist__name', title: b.title }, b.title),
        h('button', {
          type: 'button',
          class: 'toggle ' + (done ? 'is-on' : 'is-off'),
          dataset: { action: 'toggle-done', blockId: b.id },
          onclick: function () { toggleDone(key, b.id); }
        }, h('span', { class: 'dot' }), done ? 'Done' : 'Not Done'));
      host.appendChild(row);
    });
  }

  /* ---------- C. Shutdown table ---------- */

  function renderShutdownTable(key) {
    var log = readDay(key);
    var blocks = blocksForDate(key).filter(function (b) { return b.milestone; });
    var host = $('#shutdown-rows');
    clear(host);

    if (!blocks.length) {
      host.appendChild(h('tr', {}, h('td', { colspan: '4', class: 'table__empty' },
        'This template has no milestone blocks.')));
      return;
    }

    blocks.forEach(function (b) {
      var st = log.blocks[b.id] || {};
      var outcome = (log.wrapup.outcomes || {})[b.id] || '';

      var hit = h('button', {
        type: 'button',
        class: 'hitmiss__btn is-hit' + (outcome === 'HIT' ? ' is-on' : ''),
        dataset: { action: 'outcome', blockId: b.id, value: 'HIT' },
        onclick: function () { setOutcome(key, b.id, outcome === 'HIT' ? '' : 'HIT'); }
      }, 'HIT');

      var miss = h('button', {
        type: 'button',
        class: 'hitmiss__btn is-miss' + (outcome === 'MISS' ? ' is-on' : ''),
        dataset: { action: 'outcome', blockId: b.id, value: 'MISS' },
        onclick: function () { setOutcome(key, b.id, outcome === 'MISS' ? '' : 'MISS'); }
      }, 'MISS');

      host.appendChild(h('tr', {},
        h('td', {},
          h('strong', {}, b.title),
          h('div', { class: 'block__dur' }, fmtClockRange(b))),
        h('td', { style: { color: st.milestone ? 'var(--text-soft)' : 'var(--text-faint)', fontSize: 'var(--fs-sm)' } },
          st.milestone || '— not drafted —'),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: st.evidence || '',
          placeholder: 'page / file',
          dataset: { action: 'evidence', blockId: b.id },
          oninput: function (e) { blockState(dayLog(key), b.id).evidence = e.target.value; save(); }
        })),
        h('td', { class: 'ta-center' }, h('div', { class: 'hitmiss' }, hit, miss))));
    });
  }

  function setOutcome(key, blockId, value) {
    var log = dayLog(key);
    if (!log.wrapup.outcomes) log.wrapup.outcomes = {};
    if (value) log.wrapup.outcomes[blockId] = value;
    else delete log.wrapup.outcomes[blockId];
    save();
    renderShutdownTable(key);
    renderPaperSheet(key);
    renderDashboard();
  }

  /* ---------- D. Paper milestone card ---------- */

  function renderPaperSheet(key) {
    var log = readDay(key);
    var blocks = blocksForDate(key).filter(function (b) { return b.milestone; });
    $('#paper-date').textContent = fmtDate(key, 'long');
    $('#paper-mode').textContent = modeById(log.mode).label;

    var host = $('#paper-rows');
    clear(host);
    blocks.forEach(function (b) {
      var st = log.blocks[b.id] || {};
      var outcome = (log.wrapup.outcomes || {})[b.id] || '';
      host.appendChild(h('tr', {},
        h('td', {}, h('strong', {}, b.title), h('div', {}, fmtClockRange(b))),
        h('td', {}, st.milestone || ''),
        h('td', {}, st.evidence || ''),
        h('td', { class: 'ta-center' }, outcome)));
    });

    $('#paper-unfinished').textContent = log.wrapup.unfinished || '______________________________';
    $('#paper-hardest').textContent = log.wrapup.hardest || '______________________________';
  }

  /* ---------- E. Static form fields (scores, tally, sleep) ---------- */

  function populateStaticLogFields(key) {
    var log = readDay(key);
    var sh = log;

    S.dailyScores.forEach(function (s) {
      var input = document.querySelector('input[name="score-' + s.key + '"]:checked');
      var value = sh.scores[s.key];
      $$('input[name="score-' + s.key + '"]').forEach(function (radio) {
        radio.checked = (typeof value === 'number' && String(value) === radio.value);
      });
      void input;
    });

    S.sleepinessSlots.forEach(function (s) {
      var value = sh.sleepiness[s.key];
      $$('input[name="score-' + s.key + '"]').forEach(function (radio) {
        radio.checked = (typeof value === 'number' && String(value) === radio.value);
      });
    });

    $('#shut-unfinished').value = sh.unfinished || '';
    $('#shut-hardest').value = sh.hardest || '';
    $('#shut-fuzzy').value = sh.stillFuzzy || '';
    $('#shut-complete').checked = !!sh.complete;
    $('#log-checkin-done').checked = !!(log.checkin && log.checkin.done);
    $('#log-hardest-ten').value = (log.checkin && log.checkin.hardestTen) || '';
    $('#log-sleep-hours').value = sh.sleep.hours === '' ? '' : sh.sleep.hours;
    $('#log-lightsout').value = sh.sleep.lightsOut || '';
    $('#log-wakeup').value = sh.sleep.wakeUp || '';
    $('#log-workout').value = log.workout || '';
    $('#log-nap').value = sh.sleep.nap1 || '';
    $('#log-mininap').value = sh.sleep.miniNap || '';
    $('#log-note').value = log.note || '';
    $('#tally-flagged').value = sh.tally.flagged || 0;
    $('#tally-corrected').value = sh.tally.corrected || 0;
    $('#tally-doubt').value = sh.tally.doubt || 0;
  }

  /* ---------- F. Error code counters ---------- */

  function renderCodeGrid(key) {
    var log = readDay(key);
    var host = $('#code-grid');
    clear(host);
    S.errorCodes.forEach(function (code) {
      var value = log.codes[code.code] || 0;
      var item = h('div', { class: 'code-item' + (value ? ' has-value' : ''), dataset: { code: code.code } },
        h('span', { class: 'code-item__letter', title: code.name + ' — ' + code.fix }, code.code),
        h('span', { class: 'code-item__text' },
          h('span', { class: 'code-item__name', title: code.fix }, code.name)),
        h('input', {
          type: 'number', class: 'code-item__count', min: '0', max: '999', value: String(value),
          'aria-label': code.name + ' count',
          dataset: { action: 'code', code: code.code },
          oninput: function (e) {
            var v = parseInt(e.target.value, 10);
            var log2 = dayLog(key);
            log2.codes[code.code] = isNaN(v) ? 0 : v;
            e.target.closest('.code-item').classList.toggle('has-value', !isNaN(v) && v > 0);
            save();
          }
        }));
      host.appendChild(item);
    });
  }

  /* ---------- H. Mistake notebook ---------- */

  function renderErrorRows() {
    var host = $('#error-log-rows');
    clear(host);
    var rows = state.data.errors || [];

    if (!rows.length) {
      host.appendChild(h('tr', {}, h('td', { colspan: '7', class: 'table__empty' },
        'No mistakes logged yet. Add an entry for every error found in the analysis block.')));
      return;
    }

    rows.forEach(function (row, index) {
      var codeSelect = h('select', {
        class: 'cell-input cell-input--code',
        dataset: { action: 'err-code', index: String(index) },
        onchange: function (e) { row.code = e.target.value; save(); }
      }, h('option', { value: '' }, '—'));
      S.errorCodes.forEach(function (c) {
        var opt = h('option', { value: c.code }, c.code + ' · ' + c.name);
        if (row.code === c.code) opt.selected = true;
        codeSelect.appendChild(opt);
      });

      host.appendChild(h('tr', {},
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.source || '', placeholder: 'FOM-2 p.12',
          oninput: function (e) { row.source = e.target.value; save(); }
        })),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.problem || '', placeholder: 'Problem 14',
          oninput: function (e) { row.problem = e.target.value; save(); }
        })),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input cell-input--num', value: row.mark || '', placeholder: 'H',
          oninput: function (e) { row.mark = e.target.value; save(); }
        })),
        h('td', {}, codeSelect),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.what || '', placeholder: 'What went wrong',
          oninput: function (e) { row.what = e.target.value; save(); }
        })),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.fix || '', placeholder: 'Fix',
          oninput: function (e) { row.fix = e.target.value; save(); }
        })),
        h('td', {}, h('button', {
          type: 'button', class: 'row-remove', title: 'Remove entry',
          onclick: function () { state.data.errors.splice(index, 1); save(); renderErrorRows(); renderAnalytics(); }
        }, icon('trash')))));
    });
  }

  /* ---------- J. Doubt log (Section 25.7) ---------- */

  function renderDoubtRows() {
    var host = $('#doubt-log-rows');
    if (!host) return;
    clear(host);
    var rows = state.data.doubts || [];

    if (!rows.length) {
      host.appendChild(h('tr', {}, h('td', { colspan: '7', class: 'table__empty' },
        'No doubts logged. Anything FOM-4 could not correct in the hour goes here — never onto tomorrow\'s plate.')));
      return;
    }

    var hintLevels = ['0', '1', '2', 'full'];

    rows.forEach(function (row, index) {
      var hintSelect = h('select', {
        class: 'cell-input cell-input--code',
        dataset: { action: 'doubt-hint', index: String(index) },
        onchange: function (e) { row.hint = e.target.value; save(); }
      });
      hintLevels.forEach(function (level) {
        var opt = h('option', { value: level }, level === 'full' ? 'full solution' : 'Hint ' + level);
        if (row.hint === level || (!row.hint && level === '0')) opt.selected = true;
        hintSelect.appendChild(opt);
      });

      host.appendChild(h('tr', {},
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.date || state.ui.date, placeholder: '2026-11-18',
          oninput: function (e) { row.date = e.target.value; save(); }
        })),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.subject || '', placeholder: 'FOM',
          oninput: function (e) { row.subject = e.target.value; save(); }
        })),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.question || '', placeholder: 'The question or problem',
          oninput: function (e) { row.question = e.target.value; save(); }
        })),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.stuck || '', placeholder: 'Minute of the ladder',
          oninput: function (e) { row.stuck = e.target.value; save(); }
        })),
        h('td', {}, hintSelect),
        h('td', {}, h('input', {
          type: 'text', class: 'cell-input', value: row.resolved || '', placeholder: 'How it was resolved',
          oninput: function (e) { row.resolved = e.target.value; save(); }
        })),
        h('td', {}, h('button', {
          type: 'button', class: 'row-remove', title: 'Remove entry',
          onclick: function () { state.data.doubts.splice(index, 1); save(); renderDoubtRows(); }
        }, icon('trash')))));
    });
  }

  /* ======================================================================
     09. ANALYTICS
     ====================================================================== */

  function renderAnalytics() {
    var dates = rangeDates();
    var from = dates[0], to = dates[dates.length - 1];

    /* --- Energy series --- */
    var energySeries = [
      { label: 'Energy score', color: '#4A90E2', points: dates.map(function (k) { return { x: k, y: energyScoreOf(k) }; }) },
      { label: 'Five-score average', color: '#F5A623', dashed: true, points: dates.map(function (k) { return { x: k, y: scoreAverage(k) }; }) }
    ];
    drawLineChart($('#chart-energy'), energySeries, { yMin: 1, yMax: 5, yStep: 1 });
    var energyPoints = energySeries[0].points.filter(function (p) { return p.y !== null; });
    $('#chart-energy-note').textContent = energyPoints.length
      ? energyPoints.length + ' day' + (energyPoints.length === 1 ? '' : 's') + ' with an energy score in this range.'
      : 'No energy scores logged in this range yet.';
    renderChartLegend($('#chart-energy'), energySeries);

    /* --- Sleepiness series --- */
    var sleepSeries = S.sleepinessSlots.map(function (slot, i) {
      var colors = ['#4A90E2', '#9C7BE8', '#F5A623'];
      return {
        label: slot.time,
        color: colors[i % colors.length],
        points: dates.map(function (k) {
          var log = peekDay(k);
          var v = log && log.sleepiness ? log.sleepiness[slot.key] : null;
          return { x: k, y: typeof v === 'number' ? v : null };
        })
      };
    });
    drawLineChart($('#chart-sleepiness'), sleepSeries, { yMin: 1, yMax: 5, yStep: 1 });
    var sleepPoints = sleepSeries.reduce(function (a, s) {
      return a + s.points.filter(function (p) { return p.y !== null; }).length;
    }, 0);
    $('#chart-sleepiness-note').textContent = sleepPoints
      ? sleepPoints + ' sleepiness reading' + (sleepPoints === 1 ? '' : 's') + ' logged at 11:55, 16:15 and 17:35.'
      : 'No sleepiness scores logged in this range yet.';
    renderChartLegend($('#chart-sleepiness'), sleepSeries);

    /* --- Weekly HIT / MISS --- */
    renderHitMissTable(from, to);

    /* --- Error codes --- */
    renderErrorCodeTable(from, to);

    /* --- Module progress --- */
    renderModuleProgress();

    /* --- Warnings --- */
    renderWarnings(from, to);

    var wk = zoneForWeek(state.ui.date);
    var pill = $('#analytics-zone-pill');
    if (wk.zone) {
      pill.textContent = wk.zone.label + ' · ' + wk.average.toFixed(2);
      pill.className = 'pill ' + wk.zone.cssClass;
    } else {
      pill.textContent = 'No data';
      pill.className = 'pill';
    }
  }

  function energyScoreOf(key) {
    var log = peekDay(key);
    if (!log || !log.scores) return null;
    var v = log.scores.energy;
    return typeof v === 'number' ? v : null;
  }

  /* ---------- Canvas line chart ---------- */

  function drawLineChart(canvas, series, opts) {
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(240, Math.round(rect.width || canvas.clientWidth || 480));
    var hgt = Math.max(160, Math.round(rect.height || canvas.clientHeight || 260));
    var dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = hgt * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);

    var padL = 30, padR = 12, padT = 12, padB = 24;
    var plotW = w - padL - padR;
    var plotH = hgt - padT - padB;
    var yMin = opts.yMin, yMax = opts.yMax;

    function yPos(v) { return padT + ((yMax - v) / (yMax - yMin)) * plotH; }

    /* Grid + y labels */
    ctx.font = '10px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var v = yMin; v <= yMax; v += opts.yStep) {
      var y = yPos(v);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(y) + 0.5);
      ctx.lineTo(w - padR, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = '#6C7583';
      ctx.fillText(String(v), padL - 7, y);
    }

    /* Axis line */
    ctx.strokeStyle = '#3C3C3C';
    ctx.beginPath();
    ctx.moveTo(padL + 0.5, padT);
    ctx.lineTo(padL + 0.5, padT + plotH);
    ctx.stroke();

    var n = series.length ? series[0].points.length : 0;
    if (!n) return;

    /* X labels: first, middle, last */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6C7583';
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i) {
      if (i < 0 || i >= n) return;
      var pt = series[0].points[i];
      var x = n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
      ctx.fillText(fmtDate(pt.x, 'short'), x, padT + plotH + 7);
    });

    var hasData = false;

    series.forEach(function (s) {
      var pts = s.points;
      var drew = false;

      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.dashed ? 1.6 : 2;
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();

      pts.forEach(function (p, i) {
        if (p.y === null || p.y === undefined) { drew = false; return; }
        hasData = true;
        var x = n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
        var y = yPos(p.y);
        if (!drew) { ctx.moveTo(x, y); drew = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      /* Points */
      pts.forEach(function (p, i) {
        if (p.y === null || p.y === undefined) return;
        var x = n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
        var y = yPos(p.y);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    if (!hasData) {
      ctx.fillStyle = '#6C7583';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '12px ' + getComputedStyle(document.body).fontFamily;
      ctx.fillText('No data in this range', padL + plotW / 2, padT + plotH / 2);
    }
  }

  function renderChartLegend(canvas, series) {
    /* The legend belongs to the card, not to the fixed-height chart frame. */
    var host = (canvas.closest && canvas.closest('.card')) || canvas.parentNode;
    if (!host) return;
    var old = host.querySelector('.chart-legend');
    if (old) old.remove();
    var legend = h('div', { class: 'chart-legend' });
    series.forEach(function (s) {
      legend.appendChild(h('span', { style: { '--lc': s.color } }, h('i'), s.label));
    });
    host.appendChild(legend);
  }

  /* ---------- Weekly HIT / MISS table ---------- */

  function renderHitMissTable(from, to) {
    var host = $('#hitmiss-rows');
    clear(host);

    var weeks = [];
    var start = weekStart(parseISO(from));
    var guard = 0;
    while (dateKey(start) <= to && guard++ < 200) {
      weeks.push(dateKey(start));
      start = addDays(start, 7);
    }

    var rows = weeks.map(function (wkStartKey) {
      var hits = 0, misses = 0, days = 0, planned = 0, doneBlocks = 0;
      for (var i = 0; i < 7; i++) {
        var key = dateKey(addDays(parseISO(wkStartKey), i));
        if (key < from || key > to) continue;
        var log = peekDay(key);
        if (!log) continue;
        days++;
        var c = completionFor(key);
        planned += c.actionable;
        doneBlocks += c.done;
        var outcomes = (log.wrapup && log.wrapup.outcomes) || {};
        Object.keys(outcomes).forEach(function (bid) {
          if (outcomes[bid] === 'HIT') hits++;
          else if (outcomes[bid] === 'MISS') misses++;
        });
      }
      return { key: wkStartKey, hits: hits, misses: misses, days: days, planned: planned, done: doneBlocks };
    }).filter(function (r) { return r.days > 0; });

    if (!rows.length) {
      host.appendChild(h('tr', {}, h('td', { colspan: '6', class: 'table__empty' },
        'No logged days in this range.')));
      return;
    }

    rows.forEach(function (r) {
      var total = r.hits + r.misses;
      var rate = total ? (r.hits / total) * 100 : 0;
      var blockRate = r.planned ? (r.done / r.planned) * 100 : 0;
      host.appendChild(h('tr', {},
        h('td', {}, h('strong', {}, 'W' + isoWeekNumber(parseISO(r.key))),
          h('div', { class: 'block__dur' }, fmtDate(r.key, 'short'))),
        h('td', {}, r.days + ' / 7'),
        h('td', { class: 'ta-right' }, String(r.hits)),
        h('td', { class: 'ta-right' }, String(r.misses)),
        h('td', { class: 'ta-right' }, total ? Math.round(rate) + '%' : '—'),
        h('td', {}, h('div', { class: 'rate-cell' },
          h('div', { class: 'progress' }, h('i', { style: { width: blockRate.toFixed(1) + '%' } })),
          h('span', {}, Math.round(blockRate) + '%')))));
    });
  }

  /* ---------- Error code table ---------- */

  function renderErrorCodeTable(from, to) {
    var totals = errorCodeTotals(from, to);
    var host = $('#error-code-rows');
    clear(host);
    var grand = 0;
    Object.keys(totals).forEach(function (k) { grand += totals[k]; });

    var ordered = S.errorCodes.slice().sort(function (a, b) { return totals[b.code] - totals[a.code]; });

    if (!grand) {
      host.appendChild(h('tr', {}, h('td', { colspan: '4', class: 'table__empty' },
        'No error codes logged in this range.')));
    } else {
      ordered.forEach(function (c) {
        var share = grand ? (totals[c.code] / grand) * 100 : 0;
        host.appendChild(h('tr', {},
          h('td', {}, h('span', { class: 'code-badge', title: c.fix }, c.code)),
          h('td', {}, c.name),
          h('td', { class: 'ta-right' }, String(totals[c.code])),
          h('td', { class: 'ta-right' }, share.toFixed(0) + '%')));
      });
    }

    var bars = $('#error-code-bars');
    clear(bars);
    if (grand) {
      ordered.forEach(function (c) {
        if (!totals[c.code]) return;
        var share = (totals[c.code] / grand) * 100;
        bars.appendChild(h('div', { class: 'code-bars__row' },
          h('span', { class: 'code-badge' }, c.code),
          h('div', { class: 'code-bars__bar' }, h('i', { style: { width: share.toFixed(1) + '%' } })),
          h('b', {}, String(totals[c.code]))));
      });
    }
  }

  /* ---------- Module progress ---------- */

  function renderModuleProgress() {
    var host = $('#module-progress');
    clear(host);
    var all = allModules();
    var totalSteps = all.length * S.moduleCheckpoints.length;
    var doneSteps = 0;
    var completeModules = 0;

    all.forEach(function (m) {
      var done = moduleDone(m);
      doneSteps += done;
      var complete = done === S.moduleCheckpoints.length;
      if (complete) completeModules++;
      var pct = (done / S.moduleCheckpoints.length) * 100;
      host.appendChild(h('div', { class: 'module-progress__row' + (complete ? ' is-complete' : '') },
        h('div', { class: 'module-progress__head' },
          h('b', {}, m.id + ' · ' + m.name),
          h('span', {}, done + ' / ' + S.moduleCheckpoints.length)),
        h('div', { class: 'progress' }, h('i', { style: { width: pct.toFixed(1) + '%' } }))));
    });

    var pill = $('#module-summary-pill');
    if (pill) pill.textContent = completeModules + ' / ' + all.length + ' complete';

    var overview = $('#module-summary');
    if (overview) {
      clear(overview);
      overview.appendChild(h('div', { class: 'module-summary__item' },
        h('span', {}, 'Modules complete'), h('strong', {}, completeModules + ' / ' + all.length)));
      overview.appendChild(h('div', { class: 'module-summary__item' },
        h('span', {}, 'Checkpoints done'), h('strong', {}, doneSteps + ' / ' + totalSteps)));
      overview.appendChild(h('div', { class: 'module-summary__item' },
        h('span', {}, 'Overall progress'),
        h('strong', {}, (totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0) + '%')));
      overview.appendChild(h('div', { class: 'module-summary__item' },
        h('span', {}, 'Current module'), h('strong', {}, currentModuleId())));
    }
  }

  function currentModuleId() {
    var all = allModules();
    for (var i = 0; i < all.length; i++) {
      if (moduleDone(all[i]) < S.moduleCheckpoints.length) return all[i].id;
    }
    return all.length ? all[all.length - 1].id : '—';
  }

  /* ---------- Burnout warnings ---------- */

  function renderWarnings(from, to) {
    var host = $('#warning-list');
    clear(host);
    var wk = zoneForWeek(state.ui.date);

    var items = [];

    if (wk.average === null) {
      items.push({
        cls: '', title: 'No scores yet',
        body: 'Log the five daily scores for each day of the week to see your zone.'
      });
    } else {
      items.push({
        cls: wk.zone.cssClass, title: 'Weekly dashboard average ' + wk.average.toFixed(2),
        body: 'Zone: ' + wk.zone.label + '. ' + wk.zone.action + ' ' + wk.zone.actionDetail
      });
    }

    /* Source override: three or more scores of 2 or lower in one day. */
    if (wk.lowScoreDays > 0) {
      items.push({
        cls: 'zone-yellow', title: 'Low-score day detected',
        body: wk.lowScoreDays + ' day' + (wk.lowScoreDays === 1 ? ' has' : 's have') +
          ' three or more scores of 2 or lower. The next day should be a Recovery Plan.'
      });
    }

    /* Source override: a single score averaging 2.0 or lower for the week. */
    if (wk.singleScoreFloorDays.length > 0) {
      items.push({
        cls: 'zone-yellow', title: 'Single-score override applied',
        body: 'A day averaged ' + S.thresholds.singleScoreFloor.toFixed(1) +
          ' or lower (' + wk.singleScoreFloorDays.join(', ') +
          '). The week counts as at least Yellow regardless of the overall average.'
      });
    }

    /* Source override: average sleepiness 3.5+ on five or more days. */
    var alarmDays = 0;
    for (var i = 0; i < state.ui.range; i++) {
      var dk = dateKey(addDays(parseISO(to), -i));
      var sl = sleepinessAverage(dk);
      if (sl !== null && sl >= S.thresholds.sleepinessAlarm) alarmDays++;
    }
    if (alarmDays >= S.thresholds.sleepinessAlarmDays) {
      items.push({
        cls: 'zone-red', title: 'Sleepiness alarm',
        body: 'Average sleepiness reached 3.5 or above on ' + alarmDays +
          ' days. Add sleep — move lights-out earlier — before cutting any block.'
      });
    }

    /* Consecutive recovery / essential days. */
    var streak = 0;
    for (var j = 0; j < 30; j++) {
      var key = dateKey(addDays(parseISO(state.ui.date), -j));
      var log = peekDay(key);
      if (!log) break;
      var mode = modeById(log.mode);
      if (mode.rank >= 2) streak++;
      else break;
    }
    if (streak >= 3) {
      items.push({
        cls: 'zone-yellow', title: streak + ' consecutive reduced days',
        body: 'Three or more reduced days in a row means you should start a deload week now rather than waiting for the scheduled one.'
      });
    }

    /* Nights below seven hours. */
    var shortNights = 0;
    for (var k = 0; k < 7; k++) {
      var sk = dateKey(addDays(parseISO(state.ui.date), -k));
      var sLog = peekDay(sk);
      var hrs = sLog && sLog.sleep ? parseFloat(sLog.sleep.hours) : NaN;
      if (!isNaN(hrs) && hrs < S.thresholds.sleepFloorHours) shortNights++;
    }
    if (shortNights > 0) {
      items.push({
        cls: 'zone-yellow', title: shortNights + ' night' + (shortNights === 1 ? '' : 's') + ' below 7 hours',
        body: 'Sleep is never traded for study. Fix the night before touching the naps.'
      });
    }

    var pill = $('#warning-zone-pill');
    if (pill) {
      pill.textContent = wk.zone ? wk.zone.label : 'No data';
      pill.className = 'pill' + (wk.zone ? ' ' + wk.zone.cssClass : '');
    }
    $('#warning-lede').textContent = wk.zone
      ? 'Week average ' + wk.average.toFixed(2) + ' — ' + wk.zone.action
      : 'Log the five daily scores across the week to see your zone and the recommended action.';

    items.forEach(function (it) {
      host.appendChild(h('li', { class: it.cls },
        h('span', { class: 'zone-dot' }),
        h('div', {}, h('b', {}, it.title), h('span', {}, it.body))));
    });
  }

  /* ======================================================================
     10. MODULE TRACKER
     ====================================================================== */

  /** The built-in module calendar plus any module the user has added. */
  function allModules() {
    var list = S.modules.map(function (m) { return Object.assign({}, m); });
    var overrides = state.data.modules || {};

    /* A built-in module may have been renamed or re-windowed by the user. */
    S.modules.forEach(function (m, idx) {
      var o = overrides[m.id];
      if (!o) return;
      if (o.name) list[idx].name = o.name;
      if (o.window) list[idx].window = o.window;
      if (o.weeks) list[idx].weeks = o.weeks;
    });

    /* User-added modules live only in the stored overrides. */
    Object.keys(overrides).forEach(function (id) {
      for (var i = 0; i < S.modules.length; i++) if (S.modules[i].id === id) return;
      var o = overrides[id];
      list.push({
        id: id,
        name: o.name || id,
        weeks: o.weeks || 1,
        window: o.window || '—',
        book: o.book || null,
        custom: true
      });
    });
    return list;
  }

  /** The stored state for a module, created on demand. */
  function moduleState(id) {
    if (!state.data.modules[id]) state.data.modules[id] = {};
    return state.data.modules[id];
  }

  /** Checkpoints completed for a module. */
  function moduleDone(module) {
    var o = (state.data.modules || {})[module.id] || {};
    return S.moduleCheckpoints.filter(function (cp) { return o[cp.key]; }).length;
  }

  /** Push a module's checkpoint state into its table-row checkboxes. */
  function syncModuleCheckboxes(moduleId) {
    var o = (state.data.modules || {})[moduleId] || {};
    $$('#module-rows tr[data-module-id="' + moduleId + '"] .mod-check').forEach(function (input, idx) {
      var cp = S.moduleCheckpoints[idx];
      if (cp) input.checked = !!o[cp.key];
    });
  }

  function renderModules() {
    var host = $('#module-rows');
    clear(host);
    var overrides = state.data.modules || {};
    var all = allModules();
    var q = (state.ui.moduleSearch || '').toLowerCase().trim();
    var filter = state.ui.moduleFilter || 'all';

    var visible = all.filter(function (m) {
      var done = moduleDone(m);
      var complete = done === S.moduleCheckpoints.length;
      if (filter === 'done' && !complete) return false;
      if (filter === 'active' && complete) return false;
      if (q && (m.id + ' ' + m.name).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var completeCount = all.filter(function (m) {
      return moduleDone(m) === S.moduleCheckpoints.length;
    }).length;

    visible.forEach(function (m) {
      var o = overrides[m.id] || {};
      var done = moduleDone(m);
      var isComplete = done === S.moduleCheckpoints.length;
      var selected = state.ui.selectedModule === m.id;

      var row = h('tr', {
        class: 'mod-row' + (isComplete ? ' is-done' : '') + (selected ? ' is-selected' : ''),
        dataset: { moduleId: m.id },
        onclick: function () { selectModule(m.id); }
      });

      row.appendChild(h('td', {},
        h('span', { class: 'mod-name mod-title' }, m.id + ' · ' + m.name,
          h('span', {}, m.weeks + ' week' + (m.weeks === 1 ? '' : 's') +
            (m.custom ? ' · added by you' : '')))));

      row.appendChild(h('td', {}, h('span', { class: 'mod-window' }, m.window)));

      S.moduleCheckpoints.forEach(function (cp) {
        row.appendChild(h('td', { class: 'ta-center' },
          h('input', {
            type: 'checkbox', class: 'mod-check',
            'aria-label': m.id + ' ' + cp.label,
            checked: !!o[cp.key],
            dataset: { action: 'mod-check', moduleId: m.id, key: cp.key },
            onchange: function (e) {
              moduleState(m.id)[cp.key] = e.target.checked;
              save();
              /* Update in place — a full re-render would steal focus. */
              updateModuleRow(m, row);
              syncModuleCheckboxes(m.id);
              renderModuleProgress();
              if (state.ui.selectedModule === m.id) renderModuleDetail();
            }
          })));
      });

      /* Notes are edited in the detail panel; the table shows a preview. */
      row.appendChild(h('td', {},
        h('span', { class: 'mod-notes-preview', title: o.notes || '' },
          o.notes ? o.notes : '—')));

      host.appendChild(row);
    });

    $('#modules-count-pill').textContent = completeCount + ' / ' + all.length + ' complete';
    $('#modules-shown-pill').textContent = visible.length + ' / ' + all.length + ' shown';
    $('#module-empty').hidden = visible.length > 0;

    renderModuleDetail();
    renderModuleProgress();
  }

  /** Select a module (or clear the selection) and refresh the detail panel. */
  function selectModule(id) {
    state.ui.selectedModule = id;
    $$('#module-rows tr').forEach(function (tr) {
      tr.classList.toggle('is-selected', tr.dataset.moduleId === id);
    });
    renderModuleDetail();
    /* The panel sits above the table, so bring it into view on selection. */
    if (id) {
      var panel = $('#module-detail');
      if (panel && panel.getBoundingClientRect().top < 0) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  /** The detail panel for the selected module. */
  function renderModuleDetail() {
    var panel = $('#module-detail');
    var id = state.ui.selectedModule;
    if (!id) { panel.hidden = true; clear(panel); return; }

    var m = null;
    var all = allModules();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) m = all[i];
    if (!m) { state.ui.selectedModule = null; panel.hidden = true; clear(panel); return; }

    var o = (state.data.modules || {})[m.id] || {};
    var done = moduleDone(m);
    var pct = Math.round((done / S.moduleCheckpoints.length) * 100);

    panel.hidden = false;
    clear(panel);

    panel.appendChild(h('header', { class: 'card__head' },
      h('span', { class: 'eyebrow' }, 'Module ' + m.id),
      h('span', { class: 'pill' + (done === S.moduleCheckpoints.length ? ' pill--quiet' : '') },
        done + ' / ' + S.moduleCheckpoints.length + ' checkpoints · ' + pct + '%'),
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--sm',
        onclick: function () { selectModule(null); }
      }, 'Close')));

    var grid = h('div', { class: 'module-detail__grid' });

    /* Left column: facts + progress */
    var left = h('div', {});
    left.appendChild(h('h3', { class: 'subsection__title' }, m.name));
    left.appendChild(h('div', { class: 'module-detail__meta' },
      h('div', {}, h('span', {}, 'Planned weeks'), h('strong', {}, String(m.weeks))),
      h('div', {}, h('span', {}, 'Planned window'), h('strong', {}, m.window)),
      h('div', {}, h('span', {}, 'Book estimate'), h('strong', {}, m.book ? m.book + ' wks' : '—')),
      h('div', {}, h('span', {}, 'Checkpoints'), h('strong', {}, done + ' / ' + S.moduleCheckpoints.length))));

    left.appendChild(h('div', { class: 'progress progress--lg' },
      h('i', { style: { width: pct + '%' } })));

    left.appendChild(h('label', { class: 'field', style: { marginTop: '16px' } },
      h('span', { class: 'field__label' }, 'Reflection notes'),
      h('textarea', {
        class: 'input textarea', rows: '4',
        placeholder: 'What worked, what did not, what to change.',
        oninput: function (e) {
          moduleState(m.id).notes = e.target.value;
          save();
        }
      }, o.notes || '')));

    grid.appendChild(left);

    /* Right column: the checkpoint list */
    var right = h('div', {});
    right.appendChild(h('h3', { class: 'subsection__title' }, 'Module cycle'));
    var list = h('div', { class: 'checkpoint-list' });
    S.moduleCheckpoints.forEach(function (cp) {
      var isDone = !!o[cp.key];
      list.appendChild(h('label', { class: isDone ? 'is-done' : '' },
        h('input', {
          type: 'checkbox', class: 'mod-check',
          checked: isDone,
          'aria-label': cp.label,
          onchange: function (e) {
            moduleState(m.id)[cp.key] = e.target.checked;
            save();
            e.target.closest('label').classList.toggle('is-done', e.target.checked);
            var row = $('#module-rows tr[data-module-id="' + m.id + '"]');
            if (row) updateModuleRow(m, row);
            syncModuleCheckboxes(m.id);
            renderModuleProgress();
            updateModuleDetailCount(m, panel);
          }
        }),
        h('span', {}, h('strong', {}, cp.label), ' — ' + cp.purpose)));
    });
    right.appendChild(list);
    grid.appendChild(right);

    panel.appendChild(grid);
  }

  /** Refresh the checkpoint counter in the detail panel header. */
  function updateModuleDetailCount(module, panel) {
    var done = moduleDone(module);
    var pct = Math.round((done / S.moduleCheckpoints.length) * 100);
    var pill = panel.querySelector('.card__head .pill');
    if (pill) pill.textContent = done + ' / ' + S.moduleCheckpoints.length + ' checkpoints · ' + pct + '%';
    var bar = panel.querySelector('.progress i');
    if (bar) bar.style.width = pct + '%';
  }

  /** Refresh one module row and the summary counters without a full re-render. */
  function updateModuleRow(module, row) {
    var done = moduleDone(module);
    var isComplete = done === S.moduleCheckpoints.length;
    row.classList.toggle('is-done', isComplete);

    var all = allModules();
    var complete = all.filter(function (m) {
      return moduleDone(m) === S.moduleCheckpoints.length;
    }).length;
    $('#modules-count-pill').textContent = complete + ' / ' + all.length + ' complete';
  }

  /* ======================================================================
     11. WEEKLY REVIEW
     ====================================================================== */

  function renderWeekly() {
    if (!state.ui.weekStart) {
      state.ui.weekStart = dateKey(weekStart(parseISO(state.ui.date)));
    }
    $('#week-picker').value = state.ui.weekStart;
    var review = state.data.reviews[state.ui.weekStart] || {};
    var wk = zoneForWeek(state.ui.weekStart);

    $('#wk-fom').value = review.fom || '';
    $('#wk-phy').value = review.phy || '';
    $('#wk-che').value = review.che || '';
    $('#wk-ce').value = review.ce || '';
    $('#wk-rev').value = review.rev || '';
    $('#wk-modules').value = review.som || '';
    $('#wk-streak').value = review.streak !== undefined ? review.streak : '';
    $('#wk-tally').value = review.tally || '';
    $('#wk-late').value = review.lateLightsOut !== undefined ? review.lateLightsOut : '';
    $('#wk-topcode').value = review.topCode || '';
    $('#wk-marks').value = review.marks || '';
    $('#wk-sleep').value = review.shortNights !== undefined ? review.shortNights : '';
    $('#wk-workouts').value = review.workouts !== undefined ? review.workouts : '';
    $('#wk-worked').value = review.worked || '';
    $('#wk-change').value = review.change || '';
    $('#wk-dates').value = review.upcoming || '';
    $('#wk-dial').value = review.dial || '';
    $('#wk-deload').checked = !!review.deload;
    $('#wk-helper').checked = !!review.helper;

    var pill = $('#week-zone-pill');
    if (wk.zone) {
      var weekNo = S.calendarWeekNumber(state.ui.weekStart);
      var isDeload = S.isDeloadWeek(state.ui.weekStart);
      pill.textContent = wk.zone.label + ' · ' + wk.average.toFixed(2) +
        (weekNo ? ' · W' + weekNo + (isDeload ? ' · deload' : '') : '');
      pill.className = 'pill ' + wk.zone.cssClass;
      $('#week-zone-text').textContent = 'Energy Dashboard average ' + wk.average.toFixed(2) +
        ' → ' + wk.zone.label + '. ' + wk.zone.action + ' ' + wk.zone.actionDetail +
        (isDeload ? ' This is a deload week — step down before you need it.' : '');
    } else {
      pill.textContent = 'No data';
      pill.className = 'pill';
      $('#week-zone-text').textContent =
        'Fill the daily scores in the Daily Log to compute the dashboard average automatically.';
    }

    renderSavedReviews();
  }

  function renderSavedReviews() {
    var host = $('#saved-reviews-rows');
    clear(host);
    var keys = Object.keys(state.data.reviews).sort().reverse();
    $('#saved-reviews-count').textContent = String(keys.length);

    if (!keys.length) {
      host.appendChild(h('tr', {}, h('td', { colspan: '6', class: 'table__empty' },
        'No weekly reviews saved yet.')));
      return;
    }

    keys.forEach(function (key) {
      var r = state.data.reviews[key];
      var wk = zoneForWeek(key);
      host.appendChild(h('tr', {},
        h('td', {}, h('strong', {}, 'W' + isoWeekNumber(parseISO(key))),
          h('div', { class: 'block__dur' }, fmtDate(key, 'short'))),
        h('td', {}, wk.zone ? wk.zone.label : '—'),
        h('td', {}, r.worked || '—'),
        h('td', {}, r.change || '—'),
        h('td', {}, r.deload ? 'Yes' : 'No'),
        h('td', {}, h('button', {
          type: 'button', class: 'row-remove', title: 'Delete review',
          onclick: function () {
            delete state.data.reviews[key];
            save();
            renderWeekly();
          }
        }, icon('trash')))));
    });
  }

  function saveWeeklyReview() {
    state.data.reviews[state.ui.weekStart] = {
      fom: $('#wk-fom').value,
      phy: $('#wk-phy').value,
      che: $('#wk-che').value,
      ce: $('#wk-ce').value,
      rev: $('#wk-rev').value,
      som: $('#wk-modules').value,
      streak: numOrEmpty($('#wk-streak').value),
      tally: $('#wk-tally').value,
      lateLightsOut: numOrEmpty($('#wk-late').value),
      topCode: $('#wk-topcode').value,
      marks: $('#wk-marks').value,
      shortNights: numOrEmpty($('#wk-sleep').value),
      workouts: numOrEmpty($('#wk-workouts').value),
      worked: $('#wk-worked').value,
      change: $('#wk-change').value,
      upcoming: $('#wk-dates').value,
      dial: $('#wk-dial').value,
      deload: $('#wk-deload').checked,
      helper: $('#wk-helper').checked,
      savedAt: new Date().toISOString()
    };
    save(true);
    toast('Weekly review saved for the week of ' + fmtDate(state.ui.weekStart, 'long'), 'success');
    renderWeekly();
  }

  function numOrEmpty(v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = parseInt(v, 10);
    return isNaN(n) ? '' : n;
  }

  /* ======================================================================
     12. SETTINGS
     ====================================================================== */

  function renderSettings() {
    var bytes = 0;
    try { bytes = (localStorage.getItem(STORAGE_KEY) || '').length; } catch (e) { bytes = 0; }

    var stats = $('#storage-stats');
    clear(stats);
    var days = loggedDates();
    var doneModules = 0;
    var allModulesList = allModules();
    allModulesList.forEach(function (m) {
      if (moduleDone(m) === S.moduleCheckpoints.length) doneModules++;
    });

    [
      { k: 'Days logged', v: String(days.length) },
      { k: 'Mistake entries', v: String((state.data.errors || []).length) },
      { k: 'Modules complete', v: doneModules + ' / ' + allModulesList.length },
      { k: 'Weekly reviews', v: String(Object.keys(state.data.reviews).length) },
      { k: 'Storage used', v: (bytes / 1024).toFixed(1) + ' KB' },
      { k: 'Schedule version', v: S.plan.version + ' · ' + S.plan.edition }
    ].forEach(function (item) {
      stats.appendChild(h('div', { class: 'stat' },
        h('span', { class: 'stat__k' }, item.k),
        h('strong', { class: 'stat__v', style: { fontSize: 'var(--fs-xl)' } }, item.v)));
    });

    $('#storage-size-pill').textContent = (bytes / 1024).toFixed(1) + ' KB';
    $('#start-date').value = state.data.settings.startDate || S.plan.startDate;
    $('#about-version').textContent = S.plan.version + ' · ' + S.plan.edition;

    renderReferencePanels();

    var list = $('#mode-label-list');
    clear(list);
    S.dayModes.forEach(function (m) {
      list.appendChild(h('li', { class: m.cssClass },
        h('span', { class: 'zone-dot' }),
        h('b', {}, m.label),
        h('span', { style: { color: 'var(--text-faint)', fontSize: 'var(--fs-sm)' } }, m.description),
        h('em', {}, m.studyLabel + ' study')));
    });

    var note = $('#import-status');
    if (state.ui.importedConfig) {
      var drifted = JSON.stringify(state.ui.importedConfig.templates) !==
        JSON.stringify(S.getConfig().templates);
      note.textContent = drifted
        ? 'An imported backup carried a different schedule configuration. Block times still come from the built-in, read-only schedule.'
        : 'The last imported backup matched the built-in schedule configuration exactly.';
    } else {
      note.textContent = '';
    }
  }

  /* ---------- Reference panels: alarms, ladder, cut order ---------- */

  function renderReferencePanels() {
    var alarms = $('#alarm-list');
    if (alarms) {
      clear(alarms);
      S.alarmList.forEach(function (row) {
        /* The last three alarms fall after midnight — flag them the same way
           the timeline does, so "00:30" can never be read as the afternoon. */
        var hhmm = row.time.split(':');
        var mins = parseInt(hhmm[0], 10) * 60 + parseInt(hhmm[1], 10);
        var late = mins < 480;
        alarms.appendChild(h('div', { class: 'ref-list__row' },
          h('b', {}, row.time,
            late ? h('i', { class: 'block__plus1', title: 'after midnight — the next morning' }, '+1') : null),
          h('span', {}, row.label)));
      });
    }

    var ladder = $('#ladder-list');
    if (ladder) {
      clear(ladder);
      S.loadLadder.forEach(function (rung) {
        ladder.appendChild(h('div', { class: 'ref-list__row ref-list__row--ladder' },
          h('b', {}, rung.label),
          h('span', {}, rung.what, ' ', h('em', {}, '· ' + rung.when)),
          h('em', {}, rung.study)));
      });
    }

    var cut = $('#cut-order-list');
    if (cut) {
      clear(cut);
      S.cutOrder.forEach(function (step) {
        cut.appendChild(h('li', {},
          h('span', {}, h('b', {}, step.cut), ' — ', h('em', {}, step.why))));
      });
    }

    var never = $('#never-cut-list');
    if (never) {
      clear(never);
      S.neverCut.forEach(function (item) {
        never.appendChild(h('li', { class: 'zone-red' }, h('i'), h('span', {}, item)));
      });
    }
  }

  /* ---------- Sample data (demo / first-run helper) ---------- */

  function seedSampleWeek() {
    var today = new Date();
    var start = weekStart(today);
    var sampleModes = ['green', 'green', 'yellow', 'green', 'lite', 'green', 'green'];
    var energies = [4, 4, 2, 3, 3, 4, 4];

    for (var i = 0; i < 7; i++) {
      var key = dateKey(addDays(start, i));
      var log = dayLog(key);
      log.mode = sampleModes[i];
      var blocks = blocksForDate(key);
      blocks.forEach(function (b, idx) {
        if (NON_ACTIONABLE.indexOf(b.category) !== -1) return;
        var st = blockState(log, b.id);
        st.done = idx % 5 !== 0;
        if (b.milestone && idx % 3 !== 0) {
          st.milestone = 'Drafted milestone for ' + b.title + ' — checkable and binary.';
          st.evidence = 'Notebook p.' + (10 + idx);
          st.writtenNightBefore = true;
        }
      });
      var sh = log;
      sh.scores = {
        sleepQuality: clamp(energies[i] + (i % 2), 1, 5),
        energy: energies[i],
        mood: clamp(energies[i], 1, 5),
        focus: clamp(energies[i] - (i === 2 ? 1 : 0), 1, 5),
        motivation: clamp(energies[i] - (i === 2 ? 1 : 0), 1, 5)
      };
      sh.sleepiness = { sleepiness1155: 2, sleepiness1615: 3, sleepiness1735: 2 };
      sh.sleep = {
        hours: (7 + (i % 3) * 0.25).toFixed(2),
        lightsOut: '00:30',
        wakeUp: '08:00',
        nap1: '30',
        miniNap: '12'
      };
      sh.workout = 'Strength A';
      sh.tally = { flagged: 3 + i, corrected: 2 + i, doubt: i % 2 };
      sh.codes = { C: 1, T: 2, A: 1, P: 0, M: 1, S: 1, D: 0 };
      sh.wrapup.unfinished = i === 2 ? 'Tier 3 proof set carried over.' : '';
      sh.wrapup.hardest = 'The first ten minutes of the evening analysis block.';
      sh.wrapup.stillFuzzy = 'The tier ladder step from Tier 2 to Tier 3.';
      sh.note = 'Seeded sample day.';
      sh.checkin = { done: true, hardestTen: 'The first ten minutes of FOM-3.' };
      sh.morningCheck = { sleep: 'green', body: 'green', head: 'yellow' };
      blocks.filter(function (b) { return b.milestone; }).forEach(function (b, j) {
        sh.wrapup.outcomes[b.id] = j % 4 === 3 ? 'MISS' : 'HIT';
      });
      sh.wrapup.complete = true;
      sh.wrapup.revTicked = true;
      sh.wrapup.cardWritten = true;
      sh.wrapup.logFinished = true;
      sh.wrapup.parkingClosed = true;
      sh.wrapup.routineDone = true;
      sh.wrapup.readingDone = true;
    }

    clearBlockCache();
    state.data.doubts = [
      { date: dateKey(addDays(start, 3)), subject: 'FOM', question: 'Why does the induction step need the base case?', stuck: 'Minute 8 — probe', hint: '1', resolved: 'Re-derived it from the principle of well-ordering', resolvedDate: '' },
      { date: dateKey(addDays(start, 5)), subject: 'PHY', question: 'Derivation of the lens formula', stuck: 'Minute 15 — name the tool', hint: '0', resolved: '', resolvedDate: '' }
    ];
    state.data.errors = [
      { date: dateKey(addDays(start, 1)), source: 'FOM-2 p.12', problem: 'Problem 14', mark: 'H', code: 'T', what: 'Could not recall the technique', fix: 'Made a technique card' },
      { date: dateKey(addDays(start, 1)), source: 'PHY ch.4', problem: 'Q3(b)', mark: 'X', code: 'A', what: 'Sign error in the last line', fix: 'Wrote every line and checked a special case' },
      { date: dateKey(addDays(start, 3)), source: 'FOM-1', problem: 'Lemma 6', mark: 'H', code: 'P', what: 'Proof gap at the induction step', fix: 'Rewrote with the 10-point checklist' },
      { date: dateKey(addDays(start, 4)), source: 'C+E', problem: 'Bug 2', mark: 'H', code: 'C', what: 'Misread the problem statement', fix: 'Restated the problem before solving' }
    ];

    save(true);
    renderAll();
    toast('Sample week loaded — 7 days of example data.', 'success');
  }

  function eraseAllData() {
    if (!window.confirm('Erase every logged day, mistake, module and review from this browser?\n\nExport a backup first if you want to keep it.')) return;
    state.data = emptyData();
    state.ui.importedConfig = null;
    clearBlockCache();
    save(true);
    renderAll();
    toast('All data erased.', 'success');
  }

  /* ======================================================================
     13. EVENT WIRING AND INITIALISATION
     ====================================================================== */

  function setDate(key) {
    if (!key) return;
    state.ui.date = key;
    state.ui.weekStart = dateKey(weekStart(parseISO(key)));
    renderChrome();
    renderDashboard();
    renderTimeline();
    renderLog();
    if (state.ui.view === 'analytics') renderAnalytics();
  }

  /**
   * Set the template for the selected date.
   * 'auto' returns the date to its auto-detected template; any other value is
   * stored as a manual override on that day's record.
   */
  function setTemplate(value) {
    var key = state.ui.date;
    var log = dayLog(key);
    if (value === 'auto') log.template = null;
    else if (S.templates[value]) log.template = value;
    clearBlockCache();               // the schedule for this date changed
    save();
    renderAll();
    var t = templateForDate(key);
    toast(value === 'auto'
      ? 'Template reset to auto — ' + t.label + ' for ' + fmtDate(key, 'long') + '.'
      : 'Template set to ' + t.label + ' for ' + fmtDate(key, 'long') + '.', 'success');
  }

  /** Set the day mode for the selected date. */
  function setDayMode(id) {
    var key = state.ui.date;
    dayLog(key).mode = id;
    clearBlockCache();           // the schedule for this date changed
    save();
    renderAll();
    var mode = modeById(id);
    toast(mode.label + ' — showing the ' + mode.label.toLowerCase() + ' schedule for ' +
      fmtDate(key, 'long') + '.', 'success');
  }

  function wireEvents() {
    /* Navigation */
    $$('[data-view-target]').forEach(function (btn) {
      btn.addEventListener('click', function () { setView(btn.dataset.viewTarget); });
    });
    $('#sidebar-toggle').addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    /* Top-bar controls: date, template, mode */
    $('#topbar-date-input').addEventListener('change', function () {
      if (this.value) setDate(this.value);
    });
    $('#template-select').addEventListener('change', function () { setTemplate(this.value); });
    $('#mode-select').addEventListener('change', function () { setDayMode(this.value); });

    /* Date navigation */
    $('#date-prev').addEventListener('click', function () { setDate(dateKey(addDays(parseISO(state.ui.date), -1))); });
    $('#date-next').addEventListener('click', function () { setDate(dateKey(addDays(parseISO(state.ui.date), 1))); });
    $('#date-today').addEventListener('click', function () { setDate(todayISO()); });
    $('#date-picker').addEventListener('change', function () { setDate(this.value); });
    $('#template-reset').addEventListener('click', function () { setTemplate('auto'); });

    $('#log-date-prev').addEventListener('click', function () { setDate(dateKey(addDays(parseISO(state.ui.date), -1))); });
    $('#log-date-next').addEventListener('click', function () { setDate(dateKey(addDays(parseISO(state.ui.date), 1))); });
    $('#log-date-today').addEventListener('click', function () { setDate(todayISO()); });
    $('#log-date-picker').addEventListener('change', function () { setDate(this.value); });

    /* Analytics range */
    $$('#range-picker .segmented__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.ui.range = parseInt(btn.dataset.range, 10);
        $$('#range-picker .segmented__btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        renderAnalytics();
      });
    });

    /* Night wrap-up fields */
    $('#shut-unfinished').addEventListener('input', function () {
      dayLog(state.ui.date).wrapup.unfinished = this.value; save(); renderPaperSheet(state.ui.date);
    });
    $('#shut-hardest').addEventListener('input', function () {
      dayLog(state.ui.date).wrapup.hardest = this.value; save(); renderPaperSheet(state.ui.date);
    });
    $('#shut-fuzzy').addEventListener('input', function () {
      dayLog(state.ui.date).wrapup.stillFuzzy = this.value; save();
    });
    $('#shut-complete').addEventListener('change', function () {
      dayLog(state.ui.date).wrapup.complete = this.target.checked; save();
    });

    /* Helper check-in */
    $('#log-checkin-done').addEventListener('change', function () {
      dayLog(state.ui.date).checkin.done = this.target.checked; save();
    });
    $('#log-hardest-ten').addEventListener('input', function () {
      dayLog(state.ui.date).checkin.hardestTen = this.value; save();
    });

    /* Daily scores */
    S.dailyScores.forEach(function (s) {
      $$('input[name="score-' + s.key + '"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
          dayLog(state.ui.date).scores[s.key] = parseInt(radio.value, 10);
          save();
          renderDashboard();
          renderChrome();
          if (state.ui.view === 'weekly') renderWeekly();
        });
      });
    });

    /* Sleepiness */
    S.sleepinessSlots.forEach(function (s) {
      $$('input[name="score-' + s.key + '"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
          dayLog(state.ui.date).sleepiness[s.key] = parseInt(radio.value, 10);
          save();
          renderDashboard();
        });
      });
    });

    /* Sleep, workout, naps, note */
    $('#log-sleep-hours').addEventListener('input', function () {
      dayLog(state.ui.date).sleep.hours = this.value; save(); renderDashboard(); renderSleepPanel(state.ui.date);
    });
    $('#log-lightsout').addEventListener('change', function () {
      dayLog(state.ui.date).sleep.lightsOut = this.value; save(); renderDashboard();
    });
    $('#log-wakeup').addEventListener('change', function () {
      dayLog(state.ui.date).sleep.wakeUp = this.value; save(); renderDashboard();
    });
    $('#log-workout').addEventListener('input', function () {
      dayLog(state.ui.date).workout = this.value; save(); renderDashboard();
    });
    $('#log-nap').addEventListener('change', function () {
      dayLog(state.ui.date).sleep.nap1 = this.value; save(); renderDashboard();
    });
    $('#log-mininap').addEventListener('change', function () {
      dayLog(state.ui.date).sleep.miniNap = this.value; save(); renderDashboard();
    });
    $('#log-note').addEventListener('input', function () {
      dayLog(state.ui.date).note = this.value; save();
    });

    /* FOM-4 tally */
    [['tally-flagged', 'flagged'], ['tally-corrected', 'corrected'], ['tally-doubt', 'doubt']].forEach(function (pair) {
      $('#' + pair[0]).addEventListener('input', function () {
        var v = parseInt(this.value, 10);
        dayLog(state.ui.date).tally[pair[1]] = isNaN(v) ? 0 : v;
        save();
      });
    });

    /* Mistake notebook */
    $('#add-error-row').addEventListener('click', function () {
      state.data.errors.push({ date: state.ui.date, source: '', problem: '', mark: '', code: '', what: '', fix: '' });
      save();
      renderErrorRows();
    });

    /* Doubt log */
    $('#add-doubt-row').addEventListener('click', function () {
      if (!state.data.doubts) state.data.doubts = [];
      state.data.doubts.push({
        date: state.ui.date, subject: '', question: '', stuck: '',
        hint: '0', resolved: '', resolvedDate: ''
      });
      save();
      renderDoubtRows();
    });

    /* Weekly review */
    $('#week-picker').addEventListener('change', function () {
      state.ui.weekStart = this.value;
      renderWeekly();
    });
    $('#week-save').addEventListener('click', saveWeeklyReview);

    /* Settings */
    $('#export-btn').addEventListener('click', exportBackup);
    $('#import-btn').addEventListener('click', function () { $('#import-file').click(); });
    $('#import-file').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var result = importBackup(String(reader.result));
        $('#import-status').textContent = result.message;
        toast(result.message, result.ok ? 'success' : 'error');
      };
      reader.onerror = function () {
        $('#import-status').textContent = 'That file could not be read.';
        toast('That file could not be read.', 'error');
      };
      reader.readAsText(file);
      this.value = '';
    });
    $('#start-date').addEventListener('change', function () {
      state.data.settings.startDate = this.value;
      save();
      toast('Plan start date updated.', 'success');
    });
    $('#reset-btn').addEventListener('click', eraseAllData);
    $('#seed-btn').addEventListener('click', function () {
      if (window.confirm('Replace the current data with a sample week?')) seedSampleWeek();
    });

    /* Paper card */
    $('#print-card').addEventListener('click', function () { window.print(); });

    /* Module tracker: search, status filter and the inline add form */
    $('#module-search').addEventListener('input', function () {
      state.ui.moduleSearch = this.value;
      renderModules();
    });
    $$('#module-filter .segmented__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.ui.moduleFilter = btn.dataset.mfilter;
        $$('#module-filter .segmented__btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        renderModules();
      });
    });
    $('#modules-add-toggle').addEventListener('click', function () {
      var card = $('#modules-add-card');
      card.hidden = !card.hidden;
      if (!card.hidden) $('#new-module-id').focus();
    });
    $('#modules-add-cancel').addEventListener('click', function () {
      $('#modules-add-card').hidden = true;
    });
    $('#modules-add-confirm').addEventListener('click', function () {
      var id = $('#new-module-id').value.trim();
      var name = $('#new-module-name').value.trim();
      if (!id && !name) { toast('Give the module an id or a name.', 'error'); return; }
      if (!id) id = 'X-' + (Object.keys(state.data.modules).length + 1);
      if (!name) name = id;
      var st = moduleState(id);
      st.name = name;
      st.window = $('#new-module-window').value.trim() || '—';
      state.ui.selectedModule = id;
      save();
      $('#modules-add-card').hidden = true;
      $('#new-module-id').value = '';
      $('#new-module-name').value = '';
      $('#new-module-window').value = '';
      renderModules();
      selectModule(id);
      toast('Module ' + id + ' added to your tracker.', 'success');
    });

    /* Keyboard shortcuts */
    document.addEventListener('keydown', function (e) {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 't' || e.key === 'T') setDate(todayISO());
      if (e.key === '[') setDate(dateKey(addDays(parseISO(state.ui.date), -1)));
      if (e.key === ']') setDate(dateKey(addDays(parseISO(state.ui.date), 1)));
    });

    /* Clock + chart redraws */
    setInterval(function () { if (state.ui.view === 'dashboard') renderNow(); }, 20000);
    setInterval(renderClock, 1000);          // live clock + timezone line
    window.addEventListener('resize', function () {
      if (state.ui.view === 'analytics') renderAnalytics();
    });
  }

  /* ---------- Master render ---------- */

  function renderAll() {
    renderChrome();
    renderDashboard();
    renderTimeline();
    renderLog();
    renderModules();
    renderWeekly();
    renderSettings();
    if (state.ui.view === 'analytics') renderAnalytics();
  }

  function init() {
    load();
    state.ui.date = todayISO();
    state.ui.weekStart = dateKey(weekStart(parseISO(state.ui.date)));

    /* Day-mode auto-detection: the template is chosen from the current day. */
    var today = new Date();
    var template = S.templateForDay(today.getDay());

    /* Build the top-bar controls once; renderChrome only sets their values,
       so an open dropdown is never rebuilt underneath the user. */
    var tsel = $('#template-select');
    clear(tsel);
    tsel.appendChild(h('option', { value: 'auto' }, 'Auto · ' + template.label));
    Object.keys(S.templates).forEach(function (id) {
      var t = S.templates[id];
      tsel.appendChild(h('option', { value: id }, t.label + ' · ' + t.shortLabel));
    });

    var msel = $('#mode-select');
    clear(msel);
    S.dayModes.forEach(function (m) {
      msel.appendChild(h('option', { value: m.id }, m.label + ' · ' + m.studyLabel));
    });

    wireEvents();
    setView('dashboard');
    renderAll();
    renderClock();
    setInterval(renderChrome, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

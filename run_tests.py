"""Consolidated regression suite for the FOM Daily Schedule tracker (v3.0).

Covers: core flows, the controls that were dead, mode-aware schedules, the
v2.1 -> v3.0 data migration and the timezone clock.

Run with:  python3 /workspace/fom-schedule-tracker/run_tests.py
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent

# The browser may live in a couple of places depending on the machine; take
# the first one that exists and fall back to Playwright's own resolution.
CHROME_CANDIDATES = [
    '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome',
    '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    '/workspace/.home/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
]

PASS, FAIL = [], []


def chrome_path():
    for candidate in CHROME_CANDIDATES:
        if pathlib.Path(candidate).exists():
            return candidate
    return None


def ok(name, cond, extra=''):
    (PASS if cond else FAIL).append(name)
    print(('  PASS  ' if cond else '  FAIL  ') + name + (('  | ' + str(extra)) if extra else ''))


def run(pg):
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.goto(ROOT.as_uri() + '/index.html')
    pg.wait_for_timeout(700)
    pg.evaluate("() => localStorage.clear()")
    pg.reload()
    pg.wait_for_timeout(800)

    def sel_value(s):
        return pg.eval_on_selector(s, "e => e.options[e.selectedIndex].text")

    # ---------------------------------------------------------------- A. LOAD
    print("\n=== A. LOAD & AUTO-DETECTION ===")
    ok("no page errors", not errs, errs[:3])
    ok("FOM_SCHEDULE exposed", pg.evaluate("() => typeof window.FOM_SCHEDULE") == 'object')
    ok("schedule version is 3.0", pg.evaluate("() => window.FOM_SCHEDULE.plan.version") == '3.0',
       pg.evaluate("() => window.FOM_SCHEDULE.plan.version"))
    ok("template auto-selected", sel_value('#template-select') != '—', sel_value('#template-select'))
    ok("now card populated", len(pg.inner_text('#now-title')) > 2, pg.inner_text('#now-title'))
    ok("next block populated", pg.inner_text('#now-next') != '—', pg.inner_text('#now-next'))

    # ---------------------------------------------------------------- B. TIMELINE
    print("\n=== B. TIMELINE ===")
    pg.click('[data-view-target="timeline"]')
    pg.wait_for_timeout(400)
    ok("blocks rendered", pg.locator('#timeline-blocks .block').count() > 5,
       pg.locator('#timeline-blocks .block').count())
    ok("category filters rendered", pg.locator('#category-filters .filter-chip').count() > 3)
    ok("blocks carry categories", pg.locator('#timeline-blocks .block[data-cat="Study"]').count() > 0)
    ok("blocks carry the source type", pg.locator('#timeline-blocks .pill--type').count() > 0)

    # The v3 day crosses midnight: the small-hours blocks must stay at the end
    # of the day, in the Night section, marked "+1" — never filed under Morning.
    seq = pg.eval_on_selector_all('#timeline-blocks .block', """els => els.map(e => ({
        title: e.querySelector('.block__title').innerText.trim(),
        start: e.querySelector('.block__time b').childNodes[0].textContent.trim(),
        plus: !!e.querySelector('.block__time b .block__plus1')
    }))""")

    def mins(t):
        hh, mm = t.split(':')
        v = int(hh) * 60 + int(mm)
        return v + 1440 if v < 480 else v   # 08:00 is the start of the day

    ordered = [mins(b['start']) for b in seq]
    ok("timeline runs in day order across midnight", ordered == sorted(ordered),
       [b['title'] for b in seq])
    ok("the three small-hours blocks carry a +1 marker",
       [b['title'] for b in seq if b['plus']] == ['Bedtime reading', 'Lights-out prep', 'Sleep'],
       [b['title'] for b in seq if b['plus']])
    ok("the small-hours blocks are the last three",
       [b['title'] for b in seq[-3:]] == ['Bedtime reading', 'Lights-out prep', 'Sleep'],
       [b['title'] for b in seq[-3:]])
    groups = pg.eval_on_selector_all('#timeline-blocks .timeline__group', """els => els.map(e => ({
        name: e.querySelector('.timeline__grouplabel').innerText.trim().split('\\n')[0],
        titles: Array.from(e.querySelectorAll('.block__title')).map(t => t.innerText.trim())
    }))""")
    ok("sections read Morning → Night",
       [g['name'].lower() for g in groups] == ['morning', 'midday', 'afternoon', 'evening', 'night'],
       [g['name'] for g in groups])
    night = [g for g in groups if g['name'].lower() == 'night'][0]
    ok("the small-hours blocks sit in the Night section",
       night['titles'][-3:] == ['Bedtime reading', 'Lights-out prep', 'Sleep'], night['titles'])
    ok("the Night section says it runs past midnight",
       'past midnight' in pg.inner_text('#timeline-blocks .timeline__group:last-child .timeline__grouplabel'))
    before = pg.inner_text('#timeline-progress-pill')
    pg.locator('#timeline-blocks .block').first.locator('.toggle').click()
    pg.wait_for_timeout(300)
    ok("Done toggle updates progress", before != pg.inner_text('#timeline-progress-pill'),
       before + ' -> ' + pg.inner_text('#timeline-progress-pill'))
    msblock = pg.locator('#timeline-blocks .block:has(textarea[data-action="milestone"])').first
    msblock.locator('.btn--ghost').click()
    pg.wait_for_timeout(300)
    ok("milestone draft opens", pg.locator('#timeline-blocks textarea[data-action="milestone"]').count() > 0)
    pg.fill('#timeline-blocks textarea[data-action="milestone"]', "Prove the main theorem unaided")
    pg.wait_for_timeout(400)

    # ---------------------------------------------------------------- C. DAILY LOG
    print("\n=== C. DAILY LOG ===")
    pg.click('[data-view-target="log"]')
    pg.wait_for_timeout(500)
    ok("mode picker has 4 modes", pg.locator('#mode-picker .mode-card').count() == 4)
    ok("professional mode names",
       all(l in pg.inner_text('#mode-picker')
           for l in ['Full Capacity', 'Modified Load', 'Recovery Plan', 'Essential Plan']),
       pg.inner_text('#mode-picker').replace('\n', ' ')[:90])
    ok("source names kept beside them",
       all(l in pg.inner_text('#mode-picker') for l in ['Green', 'Lite', 'Yellow', 'Red']))
    ok("the top-bar dropdown uses the professional names",
       sel_value('#mode-select').startswith('Full Capacity'), sel_value('#mode-select'))
    ok("the dropdown lists all four professional names",
       all(n in pg.inner_text('#mode-select')
           for n in ['Full Capacity', 'Modified Load', 'Recovery Plan', 'Essential Plan']))
    ok("checklist rendered", pg.locator('#log-block-checklist .checklist__row').count() > 5)
    ok("shutdown rows rendered", pg.locator('#shutdown-rows tr').count() > 3)
    ok("error code grid = 7", pg.locator('#code-grid .code-item').count() == 7)
    ok("paper sheet rows", pg.locator('#paper-rows tr').count() > 3)
    ok("60-second check has 3 rows", pg.locator('#morning-check-grid .check-grid__row').count() == 3)
    ok("60-second check has 9 options", pg.locator('#morning-check-grid .check-grid__opt').count() == 9)
    ok("night wrap-up checklist has 6 boxes", pg.locator('#wrapup-grid .wrapup-item').count() == 6)
    ok("helper check-in steps listed", pg.locator('#checkin-steps li').count() == 5)
    ok("FOM-4 protocol listed", pg.locator('#fom4-protocol li').count() == 5)
    ok("doubt log has an empty state", pg.locator('#doubt-log-rows tr').count() == 1)

    # The worst of the three checks decides the mode.
    pg.check('#mc-head-red')
    pg.wait_for_timeout(400)
    ok("worst check shows Essential Plan", 'Essential Plan' in pg.inner_text('#morning-verdict'),
       pg.inner_text('#morning-verdict'))
    ok("worst check keeps the source name", 'Red' in pg.inner_text('#morning-verdict'))
    pg.check('#mc-head-yellow')
    pg.check('#mc-sleep-green')
    pg.check('#mc-body-green')
    pg.wait_for_timeout(400)
    ok("worst check shows Recovery Plan", 'Recovery Plan' in pg.inner_text('#morning-verdict'))

    # The night wrap-up checklist ticks and persists.
    pg.locator('#wrapup-grid .wrapup-item input').first.check()
    pg.wait_for_timeout(300)
    ok("wrap-up box ticks", pg.locator('#wrapup-grid .wrapup-item.is-done').count() == 1)

    pg.locator('#shutdown-rows .hitmiss__btn.is-hit').first.click()
    pg.wait_for_timeout(300)
    ok("HIT registers", pg.locator('#shutdown-rows .hitmiss__btn.is-hit.is-on').count() > 0)
    ok("paper card shows HIT", 'HIT' in pg.inner_text('#paper-rows'))
    for key in ['sleepQuality', 'energy', 'mood', 'focus', 'motivation']:
        pg.check('input[name="score-%s"][value="4"]' % key)
    pg.check('input[name="score-sleepiness1155"][value="2"]')
    pg.wait_for_timeout(400)
    ok("v3 sleepiness slot names", pg.locator('input[name="score-sleepiness1155"]').count() == 5)

    # ---------------------------------------------------------------- D. DASHBOARD
    print("\n=== D. DASHBOARD ===")
    pg.click('[data-view-target="dashboard"]')
    pg.wait_for_timeout(500)
    ok("today scores list populated", pg.locator('#today-score-list li').count() == 5)
    ok("energy dashboard zone computed", pg.inner_text('#energy-dashboard-zone') not in ('—', ''),
       pg.inner_text('#energy-dashboard-zone'))
    ok("zone legend has 3 zones", pg.locator('#zone-legend li').count() == 3)
    ok("day strip rendered", pg.locator('#day-strip .strip__seg').count() > 5)
    ok("sidebar zone readout", pg.inner_text('#sidebar-zone-value') not in ('', 'No data'),
       pg.inner_text('#sidebar-zone-value'))
    ok("sleep & recovery panel rendered", pg.locator('#sleep-panel .sleep-cell').count() == 6)
    ok("panel names the v3 lights-out", '00:30' in pg.inner_text('#sleep-panel'),
       pg.inner_text('#sleep-panel').replace('\n', ' ')[:110])

    # ---------------------------------------------------------------- E. ANALYTICS
    print("\n=== E. ANALYTICS ===")
    pg.click('[data-view-target="analytics"]')
    pg.wait_for_timeout(800)

    def painted(sel):
        return pg.evaluate("""s => { const c=document.querySelector(s);
            const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
            let n=0; for(let i=3;i<x.length;i+=4) if(x[i]>0) n++; return n; }""", sel)
    ok("energy chart painted", painted('#chart-energy') > 500, painted('#chart-energy'))
    ok("sleepiness chart painted", painted('#chart-sleepiness') > 500)
    ok("HIT/MISS table rows", pg.locator('#hitmiss-rows tr').count() >= 1)
    ok("error code table rows", pg.locator('#error-code-rows tr').count() >= 1)
    ok("module progress rows", pg.locator('#module-progress .module-progress__row').count() >= 22)
    ok("warnings rendered", pg.locator('#warning-list li').count() >= 1)
    ok("sleepiness note uses the v3 slots",
       '11:55' in pg.inner_text('#chart-sleepiness-note'), pg.inner_text('#chart-sleepiness-note'))

    # ---------------------------------------------------------------- F. MODULES
    print("\n=== F. MODULES ===")
    pg.click('[data-view-target="modules"]')
    pg.wait_for_timeout(500)
    ok("22 module rows", pg.locator('#module-rows tr').count() == 22)
    pg.locator('#module-rows tr').first.locator('.mod-check').first.check()
    pg.wait_for_timeout(300)
    ok("module checkbox stays checked",
       pg.locator('#module-rows tr').first.locator('.mod-check').first.is_checked())
    pg.locator('#module-rows tr').nth(3).locator('.mod-title').click()
    pg.wait_for_timeout(400)
    ok("module selection opens detail", pg.locator('#module-detail').is_visible())
    ok("detail lists 8 checkpoints", pg.locator('#module-detail .checkpoint-list label').count() == 8)
    b4 = pg.locator('#module-rows tr.is-selected .mod-check:checked').count()
    pg.locator('#module-detail .checkpoint-list label').first.click()
    pg.wait_for_timeout(500)
    ok("detail checkbox syncs to the table",
       pg.locator('#module-rows tr.is-selected .mod-check:checked').count() == b4 + 1)
    pg.fill('#module-search', 'Geometry')
    pg.wait_for_timeout(400)
    n = pg.locator('#module-rows tr').count()
    ok("search filters", 0 < n < 22, n)
    pg.fill('#module-search', '')
    pg.click('#module-filter .segmented__btn[data-mfilter="active"]')
    pg.wait_for_timeout(400)
    ok("status filter works", pg.locator('#module-rows tr').count() == 22)
    pg.click('#module-filter .segmented__btn[data-mfilter="all"]')
    pg.wait_for_timeout(300)

    # ---------------------------------------------------------------- G. WEEKLY
    print("\n=== G. WEEKLY REVIEW ===")
    pg.click('[data-view-target="weekly"]')
    pg.wait_for_timeout(500)
    ok("zone pill computed", pg.inner_text('#week-zone-pill') not in ('', 'No data'),
       pg.inner_text('#week-zone-pill'))
    ok("lights-out target is 00:40", '00:40' in pg.inner_text('#view-weekly'), pg.inner_text('#view-weekly')[:0])
    pg.fill('#wk-worked', 'Milestones written the night before')
    pg.fill('#wk-change', 'Earlier lights-out')
    pg.click('#week-save')
    pg.wait_for_timeout(500)
    ok("review saved and listed", pg.locator('#saved-reviews-rows tr').count() >= 1)

    # ---------------------------------------------------------------- H. SETTINGS
    print("\n=== H. SETTINGS & PERSISTENCE ===")
    pg.click('[data-view-target="settings"]')
    pg.wait_for_timeout(400)
    ok("storage stats rendered", pg.locator('#storage-stats .stat').count() == 6)
    ok("mode label list = 4", pg.locator('#mode-label-list li').count() == 4)
    ok("alarm list rendered", pg.locator('#alarm-list .ref-list__row').count() == 18)
    ok("load ladder rendered", pg.locator('#ladder-list .ref-list__row').count() == 4)
    ok("cut order rendered", pg.locator('#cut-order-list li').count() == 5)
    ok("never-cut list rendered", pg.locator('#never-cut-list li').count() > 5)
    stored = pg.evaluate("() => JSON.parse(localStorage.getItem('fom-schedule-tracker'))")
    ok("payload has config + data", 'config' in stored and 'data' in stored)
    ok("config has templates/categories/dayModes",
       all(k in stored['config'] for k in ['templates', 'categories', 'dayModes']))
    ok("data has days/modules/reviews",
       all(k in stored['data'] for k in ['days', 'modules', 'reviews']))

    # ---------------------------------------------------------------- I. RELOAD
    print("\n=== I. RELOAD PERSISTENCE ===")
    pg.reload()
    pg.wait_for_timeout(900)
    pg.click('[data-view-target="log"]')
    pg.wait_for_timeout(500)
    ok("scores persisted", pg.evaluate("""() => {
        const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
        const k = Object.keys(d.data.days)[0];
        return d.data.days[k].scores.energy === 4; }"""))
    ok("milestone draft persisted", pg.evaluate("""() => {
        const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
        return JSON.stringify(d.data.days).includes('main theorem'); }"""))
    ok("wrap-up checklist persisted", pg.evaluate("""() => {
        const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
        const k = Object.keys(d.data.days)[0];
        return d.data.days[k].wrapup.revTicked === true; }"""))
    ok("60-second check persisted", pg.evaluate("""() => {
        const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
        const k = Object.keys(d.data.days)[0];
        return d.data.days[k].morningCheck.head === 'yellow'; }"""))

    # ---------------------------------------------------------------- J. IMPORT/EXPORT
    print("\n=== J. IMPORT / EXPORT ===")
    pg.click('[data-view-target="settings"]')
    pg.wait_for_timeout(400)
    with pg.expect_download() as dl:
        pg.click('#export-btn')
    import json
    parsed = json.loads(pathlib.Path(dl.value.path()).read_text())
    ok("export is valid JSON", isinstance(parsed, dict))
    ok("export has config + data", 'config' in parsed and 'data' in parsed)
    ok("export config has 3 templates", len(parsed['config']['templates']) == 3)
    ok("export filename", 'fom-schedule-backup' in dl.value.suggested_filename,
       dl.value.suggested_filename)
    pg.evaluate("() => localStorage.clear()")
    pg.reload()
    pg.wait_for_timeout(700)
    pg.click('[data-view-target="settings"]')
    pg.wait_for_timeout(400)
    pg.set_input_files('#import-file', dl.value.path())
    pg.wait_for_timeout(900)
    ok("import reports success", 'imported' in pg.inner_text('#import-status'),
       pg.inner_text('#import-status'))

    # ---------------------------------------------------------------- K. TOP BAR CONTROLS
    print("\n=== K. TOP-BAR CONTROLS ===")
    pg.click('[data-view-target="dashboard"]')
    pg.wait_for_timeout(400)
    pg.fill('#topbar-date-input', '2026-11-09')
    pg.dispatch_event('#topbar-date-input', 'change')
    pg.wait_for_timeout(600)
    ok("date control changes the day", 'Monday 9 Nov' in pg.inner_text('#topbar-date'),
       pg.inner_text('#topbar-date'))
    pg.select_option('#template-select', 'sunday')
    pg.wait_for_timeout(700)
    ok("template control changes the schedule",
       pg.locator('#day-strip .strip__seg').count() == 22,
       pg.locator('#day-strip .strip__seg').count())
    pg.click('[data-view-target="timeline"]')
    pg.wait_for_timeout(400)
    ok("override is marked", 'override' in pg.inner_text('#timeline-template-pill').lower())
    ok("reset button appears", pg.locator('#template-reset').is_visible())
    pg.click('#template-reset')
    pg.wait_for_timeout(700)
    ok("reset returns to auto", pg.locator('#timeline-blocks .block').count() == 28,
       pg.locator('#timeline-blocks .block').count())
    pg.click('[data-view-target="dashboard"]')
    pg.wait_for_timeout(400)
    pg.locator('#day-strip .strip__seg').nth(2).click()
    pg.wait_for_timeout(900)
    ok("day strip navigates to the timeline",
       pg.evaluate("() => document.querySelector('.view.is-active').dataset.view") == 'timeline')
    ok("day strip focuses a block", pg.locator('#timeline-blocks .block.is-focus').count() == 1)

    # ---------------------------------------------------------------- L. MODE SCHEDULES
    print("\n=== L. MODE-SPECIFIC SCHEDULES ===")
    pg.fill('#topbar-date-input', '2026-11-09')
    pg.dispatch_event('#topbar-date-input', 'change')
    pg.wait_for_timeout(600)
    pg.click('[data-view-target="timeline"]')
    pg.wait_for_timeout(400)
    expected = {'green': 28, 'lite': 28, 'yellow': 24, 'red': 19}
    for mode, n in expected.items():
        pg.select_option('#mode-select', mode)
        pg.wait_for_timeout(700)
        got = pg.locator('#timeline-blocks .block').count()
        ok("%s shows its own schedule (%d blocks)" % (mode, n), got == n, got)
    ok("reduced-mode note appears", pg.locator('#timeline-mode-note').is_visible())
    pg.select_option('#mode-select', 'yellow')
    pg.wait_for_timeout(700)
    body = pg.inner_text('#timeline-blocks')
    ok("yellow uses the source times",
       all(t in body for t in ['08:30', '09:45', '11:05', '20:15', '23:10', '00:10']),
       [t for t in ['08:30', '09:45', '11:05', '20:15', '23:10', '00:10'] if t not in body])
    pg.select_option('#mode-select', 'green')
    pg.wait_for_timeout(700)
    body = pg.inner_text('#timeline-blocks')
    ok("green uses the v3 clock",
       all(t in body for t in ['08:00', '08:25', '10:05', '18:50', '20:30', '21:30', '22:30', '23:40', '00:30']),
       [t for t in ['08:00', '08:25', '10:05', '18:50', '20:30', '21:30', '22:30', '23:40', '00:30'] if t not in body])
    ok("the helper check-in is on the timeline", 'Helper check-in' in body)
    pg.click('[data-view-target="log"]')
    pg.wait_for_timeout(600)
    ok("log checklist follows the mode",
       pg.locator('#log-block-checklist .checklist__row').count() == 28,
       pg.locator('#log-block-checklist .checklist__row').count())

    # ---------------------------------------------------------------- M. TIMEZONE
    print("\n=== M. TIMEZONE LINE & LIVE CLOCK ===")
    pg.click('[data-view-target="dashboard"]')
    pg.wait_for_timeout(700)
    tz = pg.inner_text('#now-tz')
    ok("schedule timezone is stated", 'Asia/Kolkata' in tz and 'IST' in tz, tz)
    ok("running block is named",
       pg.inner_text('#now-running').lower().startswith('running now'),
       pg.inner_text('#now-running'))
    ok("top-bar clock shows h:m:s", len(pg.inner_text('#topbar-clock').strip()) == 8,
       pg.inner_text('#topbar-clock'))
    ok("top-bar tz badge", pg.inner_text('#topbar-tz').strip() == 'IST')
    t1 = pg.inner_text('#topbar-clock')
    pg.wait_for_timeout(1600)
    ok("clock ticks", t1 != pg.inner_text('#topbar-clock'),
       t1 + ' -> ' + pg.inner_text('#topbar-clock'))

    # ---------------------------------------------------------------- N. RESPONSIVE
    print("\n=== N. RESPONSIVE ===")
    pg.set_viewport_size({'width': 390, 'height': 844})
    pg.wait_for_timeout(500)
    ok("sidebar off-canvas on mobile",
       pg.evaluate("getComputedStyle(document.querySelector('#sidebar')).transform") != 'none')
    pg.click('#sidebar-toggle')
    pg.wait_for_timeout(400)
    ok("drawer opens", pg.evaluate("document.body.classList.contains('nav-open')"))
    pg.set_viewport_size({'width': 1600, 'height': 1050})
    pg.wait_for_timeout(300)

    # ---------------------------------------------------------------- O2. DELOAD WEEKS
    print("\n=== O2. DELOAD WEEKS (Section 22.8) ===")
    pg.click('[data-view-target="dashboard"]')
    pg.wait_for_timeout(500)
    for date, want in [('2026-11-30', True), ('2026-12-28', True), ('2026-11-18', False)]:
        pg.fill('#topbar-date-input', date)
        pg.dispatch_event('#topbar-date-input', 'change')
        pg.wait_for_timeout(600)
        has = 'Deload week' in pg.inner_text('#dashboard-notices')
        ok("%s %s a deload notice" % (date, 'has' if want else 'has no'),
           has == want, pg.inner_text('#dashboard-notices')[:60])
    ok("week number is right for Week 2",
       pg.evaluate("() => window.FOM_SCHEDULE.calendarWeekNumber('2026-11-16')") == 2)
    ok("deload weeks are 4, 8, 12",
       pg.evaluate("() => window.FOM_SCHEDULE.plan.deloadWeeks.slice(0,3).join(',')") == '4,8,12')

    # ---------------------------------------------------------------- O. V2 -> V3 MIGRATION
    print("\n=== O. v2.1 -> v3.0 DATA MIGRATION ===")
    pg.evaluate("""() => {
        const legacy = {
          schema: 1,
          savedAt: '2026-11-09T00:00:00.000Z',
          config: { version: '2.1', templates: {}, categories: [], dayModes: [] },
          data: {
            days: {
              '2026-11-09': {
                mode: 'modified',
                template: null,
                blocks: { fom1: { done: true, milestone: 'legacy FOM-1 card' },
                          shutdown: { done: true } },
                shutdown: {
                  complete: true,
                  outcomes: { fom1: 'HIT' },
                  unfinished: 'legacy unfinished',
                  hardest: 'legacy hardest',
                  scores: { sleepQuality: 4, energy: 4, mood: 3, focus: 4, motivation: 3 },
                  sleepiness: { sleepiness1105: 1, sleepiness1525: 2, sleepiness1645: 3 },
                  sleepHours: '7.50',
                  workout: 'Strength A',
                  nap: '30',
                  tally: { flagged: 4, corrected: 3, doubt: 1 },
                  codes: { C: 1, T: 2 },
                  note: 'legacy note'
                }
              }
            },
            errors: [{ date: '2026-11-09', source: 'FOM-2', problem: 'P14', mark: 'H',
                       code: 'T', what: 'x', fix: 'y' }],
            doubts: [],
            modules: { 'A-00': { tier1: true, notes: 'legacy module note' } },
            reviews: { '2026-11-09': { worked: 'legacy review', change: 'x', deload: false } },
            settings: { startDate: '2026-11-09' }
          }
        };
        localStorage.setItem('fom-schedule-tracker', JSON.stringify(legacy));
    }""")
    pg.reload()
    pg.wait_for_timeout(900)
    pg.fill('#topbar-date-input', '2026-11-09')
    pg.dispatch_event('#topbar-date-input', 'change')
    pg.wait_for_timeout(600)
    ok("legacy mode maps to Modified Load", pg.eval_on_selector('#mode-select', 'e => e.value') == 'lite',
       pg.eval_on_selector('#mode-select', 'e => e.value'))
    pg.click('[data-view-target="log"]')
    pg.wait_for_timeout(600)
    ok("legacy scores carried over",
       pg.evaluate("""() => {
         const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
         const day = d.data.days['2026-11-09'];
         return day.scores.energy === 4 && day.scores.mood === 3; }"""))
    ok("legacy sleepiness keys remapped",
       pg.evaluate("""() => {
         const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
         const s = d.data.days['2026-11-09'].sleepiness;
         return s.sleepiness1155 === 1 && s.sleepiness1615 === 2 && s.sleepiness1735 === 3
             && s.sleepiness1105 === undefined; }"""))
    ok("legacy shutdown became the night wrap-up",
       pg.evaluate("""() => {
         const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
         const w = d.data.days['2026-11-09'].wrapup;
         return w.unfinished === 'legacy unfinished' && w.hardest === 'legacy hardest'
             && w.outcomes.fom1 === 'HIT' && w.complete === true; }"""))
    ok("legacy sleep + tally + codes carried over",
       pg.evaluate("""() => {
         const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
         const day = d.data.days['2026-11-09'];
         return day.sleep.hours === '7.50' && day.sleep.nap1 === '30'
             && day.tally.flagged === 4 && day.codes.T === 2
             && day.workout === 'Strength A' && day.note === 'legacy note'; }"""))
    ok("legacy block ids remapped",
       pg.evaluate("""() => {
         const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
         const b = d.data.days['2026-11-09'].blocks;
         return !!(b.fom1 && b.fom1.milestone === 'legacy FOM-1 card')
             && !!b.wrapup && b.shutdown === undefined; }"""))
    ok("legacy module progress preserved",
       pg.evaluate("""() => {
         const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
         return d.data.modules['A-00'].tier1 === true
             && d.data.modules['A-00'].notes === 'legacy module note'; }"""))
    ok("legacy review preserved",
       pg.evaluate("""() => {
         const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
         return d.data.reviews['2026-11-09'].worked === 'legacy review'; }"""))
    ok("legacy mistake notebook preserved", pg.evaluate("""() => {
        const d = JSON.parse(localStorage.getItem('fom-schedule-tracker'));
        const e = d.data.errors || [];
        return e.length === 1 && e[0].problem === 'P14' && e[0].code === 'T'; }"""))
    pg.click('[data-view-target="analytics"]')
    pg.wait_for_timeout(600)
    ok("legacy errors still count", pg.locator('#error-code-rows tr').count() >= 1)

    print("\n=== ERRORS ===", errs or "none")
    ok("no console/page errors at the end", not errs, errs[:3])
    return errs


with sync_playwright() as p:
    exe = chrome_path()
    b = p.chromium.launch(executable_path=exe, args=['--no-sandbox', '--disable-dev-shm-usage']) if exe \
        else p.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
    pg = b.new_page(viewport={'width': 1600, 'height': 1050})
    run(pg)
    b.close()

print("\n=====================================")
print("PASSED: %d    FAILED: %d" % (len(PASS), len(FAIL)))
if FAIL:
    print("FAILURES:")
    for f in FAIL:
        print("  -", f)
    sys.exit(1)
print("ALL CHECKS PASSED")

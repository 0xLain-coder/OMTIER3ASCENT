"""Consolidated regression suite for the FOM Daily Schedule tracker.

Covers: core flows, the controls that were dead, mode-aware schedules and the
timezone clock. Run with:  python3 /workspace/fom-schedule-tests/run_tests.py
"""
import pathlib
import sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path('/workspace/fom-schedule-tracker').resolve()
CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome'

PASS, FAIL = [], []


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
    ok("professional mode labels",
       all(l in pg.inner_text('#mode-picker') for l in
           ['Full Capacity', 'Modified Load', 'Recovery Plan', 'Essential Plan']))
    ok("no forbidden colour terms",
       not any(t in pg.inner_text('#mode-picker') for t in ['Green', 'Yellow', 'Red ', 'Lite']))
    ok("checklist rendered", pg.locator('#log-block-checklist .checklist__row').count() > 5)
    ok("shutdown rows rendered", pg.locator('#shutdown-rows tr').count() > 3)
    ok("error code grid = 7", pg.locator('#code-grid .code-item').count() == 7)
    ok("paper sheet rows", pg.locator('#paper-rows tr').count() > 3)
    pg.locator('#shutdown-rows .hitmiss__btn.is-hit').first.click()
    pg.wait_for_timeout(300)
    ok("HIT registers", pg.locator('#shutdown-rows .hitmiss__btn.is-hit.is-on').count() > 0)
    ok("paper card shows HIT", 'HIT' in pg.inner_text('#paper-rows'))
    for key in ['sleepQuality', 'energy', 'mood', 'focus', 'motivation']:
        pg.check('input[name="score-%s"][value="4"]' % key)
    pg.check('input[name="score-sleepiness1105"][value="2"]')
    pg.wait_for_timeout(400)

    # ---------------------------------------------------------------- D. DASHBOARD
    print("\n=== D. DASHBOARD ===")
    pg.click('[data-view-target="dashboard"]')
    pg.wait_for_timeout(500)
    ok("today scores list populated", pg.locator('#today-score-list li').count() == 5)
    ok("energy dashboard zone computed", pg.inner_text('#energy-dashboard-zone') not in ('—', ''),
       pg.inner_text('#energy-dashboard-zone'))
    ok("zone legend has 4 zones", pg.locator('#zone-legend li').count() == 4)
    ok("day strip rendered", pg.locator('#day-strip .strip__seg').count() > 5)
    ok("sidebar zone readout", pg.inner_text('#sidebar-zone-value') not in ('', 'No data'),
       pg.inner_text('#sidebar-zone-value'))

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
    stored = pg.evaluate("() => JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]))")
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
        const d = JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]));
        const k = Object.keys(d.data.days)[0];
        return d.data.days[k].shutdown.scores.energy === 4; }"""))
    ok("milestone draft persisted", pg.evaluate("""() => {
        const d = JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]));
        return JSON.stringify(d.data.days).includes('main theorem'); }"""))

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
    print("\n=== K. TOP-BAR CONTROLS (were dead) ===")
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
       pg.locator('#day-strip .strip__seg').count() == 20,
       pg.locator('#day-strip .strip__seg').count())
    pg.click('[data-view-target="timeline"]')
    pg.wait_for_timeout(400)
    ok("override is marked", 'override' in pg.inner_text('#timeline-template-pill').lower())
    ok("reset button appears", pg.locator('#template-reset').is_visible())
    pg.click('#template-reset')
    pg.wait_for_timeout(700)
    ok("reset returns to auto", pg.locator('#timeline-blocks .block').count() == 26,
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
    expected = {'full': 26, 'modified': 27, 'recovery': 22, 'essential': 18}
    for mode, n in expected.items():
        pg.select_option('#mode-select', mode)
        pg.wait_for_timeout(700)
        got = pg.locator('#timeline-blocks .block').count()
        ok("%s shows its own schedule (%d blocks)" % (mode, n), got == n, got)
    ok("reduced-mode note appears", pg.locator('#timeline-mode-note').is_visible())
    pg.select_option('#mode-select', 'recovery')
    pg.wait_for_timeout(700)
    body = pg.inner_text('#timeline-blocks')
    ok("recovery uses the source times",
       all(t in body for t in ['07:30', '08:30', '09:45', '10:05', '19:15', '23:15']))
    pg.select_option('#mode-select', 'full')
    pg.wait_for_timeout(700)
    pg.click('[data-view-target="log"]')
    pg.wait_for_timeout(600)
    ok("log checklist follows the mode",
       pg.locator('#log-block-checklist .checklist__row').count() == 26,
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

    print("\n=== ERRORS ===", errs or "none")
    ok("no console/page errors at the end", not errs, errs[:3])
    return errs


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--disable-dev-shm-usage'])
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

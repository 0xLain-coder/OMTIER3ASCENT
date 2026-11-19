#!/usr/bin/env python3
"""Render every view of the tracker at desktop and mobile for visual review."""
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path('/workspace/shots')
OUT.mkdir(exist_ok=True)

CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome'

VIEWS = ['dashboard', 'timeline', 'log', 'analytics', 'modules', 'weekly', 'settings']


def main():
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox', '--disable-dev-shm-usage'])
        pg = b.new_page(viewport={'width': 1600, 'height': 1100}, device_scale_factor=1)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.goto(ROOT.as_uri() + '/index.html')
        pg.wait_for_timeout(700)
        pg.evaluate("() => localStorage.clear()")
        pg.reload()
        pg.wait_for_timeout(900)

        # A seeded week makes the screens look like the real thing.
        pg.click('[data-view-target="settings"]')
        pg.wait_for_timeout(400)
        pg.once('dialog', lambda d: d.accept())
        pg.click('#seed-btn')
        pg.wait_for_timeout(900)

        for v in VIEWS:
            pg.click('[data-view-target="%s"]' % v)
            pg.wait_for_timeout(700)
            pg.screenshot(path=str(OUT / ('desktop-%s.png' % v)), full_page=True)
            print('desktop-%s.png' % v)

        # Mobile
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.wait_for_timeout(500)
        for v in ['dashboard', 'timeline', 'log']:
            pg.click('#sidebar-toggle')
            pg.wait_for_timeout(300)
            pg.click('[data-view-target="%s"]' % v)
            pg.wait_for_timeout(700)
            pg.screenshot(path=str(OUT / ('mobile-%s.png' % v)), full_page=True)
            print('mobile-%s.png' % v)

        b.close()

    print('\nERRORS:', errs or 'none')
    return 0 if not errs else 1


sys.exit(main())

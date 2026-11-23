// Cała strona w Chromium na nowym serwerze – przeniesione testy starego testy/strona.e2e.js (wzorzec drukarni 005-21).
// Wymaga: npm run build (robi to npm run test:e2e) i Playwright 1.63.0 z Chromium.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySettings, generate, launch, loadTestImage, openPage, startServer, type RunningServer } from './support';

let server: RunningServer;
let browser: Browser;
let page: Page;
const errors: string[] = [];

beforeAll(async () => {
  server = await startServer('new', 3700 + Math.floor(Math.random() * 90));
  browser = await launch();
  page = await openPage(browser, server.url, errors);
  await loadTestImage(page);
});
afterAll(async () => {
  await browser?.close();
  server?.stop();
});

const P005 = {
  fields: { wallW: '350', wallH: '270', mT: '3', mB: '3', mL: '3', mR: '3', overlap: '6', count: '3', dpi: '150' },
  radios: { join: 'overlap', split: 'equal' },
};

describe('strona (nowy serwer)', () => {
  it('wzorzec 005-21: 350×270, naddatek 3, zakład 6, 3 bryty, 150 DPI → 7245×16300 px, ta sama grafika na zakładzie', async () => {
    await applySettings(page, P005);
    const r = await generate(page, 354); // 6 cm przy 150 DPI
    expect(r.msg).toMatch(/Gotowe: 3 bryty, wysokość 16300 px, 150 DPI/);
    expect(r.files.filter(f => f.w).map(f => [f.w, f.h, f.dpi])).toEqual(Array(3).fill([7245, 16300, 150]));
    for (const d of r.diffs) expect(d).toBeLessThan(2);
    const names = r.files.map(f => f.name);
    expect(
      names.some(n => /\.zip$/.test(n)) &&
        names.some(n => /^calosc_/.test(n)) &&
        names.some(n => /\.(pdf|cdr)$/.test(n)),
    ).toBe(true);
  });
  it('na styk: 1 cm wspólnej grafiki, ta sama grafika u sąsiadów', async () => {
    await applySettings(page, { radios: { join: 'butt' } });
    const r = await generate(page, 59);
    expect(r.files.filter(f => f.w)).toHaveLength(3);
    for (const d of r.diffs) expect(d).toBeLessThan(2);
  });
  it('pokazanie próbki 40×60 nie kasuje wygenerowanych plików', async () => {
    const before = await page.evaluate(() => document.querySelectorAll('#dl a').length);
    expect(before).toBeGreaterThan(0);
    await applySettings(page, { checks: { probkaShow: true } });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.querySelectorAll('#dl a').length)).toBe(before);
  });
  it('uszkodzony zapis ustawień w przeglądarce nie zatrzymuje strony', async () => {
    const errs: string[] = [];
    const p2 = await openPage(browser, server.url, errs);
    await p2.evaluate(() => localStorage.setItem('fototapety.ustawienia.v3', '5'));
    await p2.reload();
    const saved = await p2.evaluate(() => localStorage.getItem('fototapety.ustawienia.v3'));
    await p2.close();
    expect(errs).toEqual([]);
    expect(saved).not.toBe('5');
  });
  it('brak błędów JavaScript na stronie (także naruszeń CSP)', () => {
    expect(errors).toEqual([]);
  });
});

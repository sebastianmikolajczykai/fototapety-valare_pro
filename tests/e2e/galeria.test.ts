// Galeria gotowych wzorów – stary vs nowy program. Pełny plik wzoru nie jest pobierany z internetu:
// adresy upload.wikimedia.org podmienia przeglądarka testowa na miniaturę z katalogu (albo na błąd 404).
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, loadTestImage, OLD_REPO, openPage, startServer, type RunningServer } from './support';

const enabled = !!OLD_REPO;
const THUMB = fs.readFileSync(path.resolve('public/wzory/mini/c34259360.jpg'));
let browser: Browser;
let wikimedia: 'ok' | 'error' = 'ok';
const side: Record<'old' | 'new', { server: RunningServer; page: Page; errors: string[] }> = {} as never;

/** Stan galerii i wszystkiego, na co wpływa: HTML, styl w <head>, tekst, pole pliku, metryka wzoru. */
const state = (page: Page): Promise<unknown> =>
  page.evaluate(() => {
    const G = (
      window as unknown as {
        Galeria?: { current(): unknown; licenseText(): string; CONFIG: { katalog: string; mini(id: string): string } };
      }
    ).Galeria;
    return {
      html: document.body.innerHTML.replace(/blob:[^"')\s]+/g, 'blob:X'),
      head: document.head.innerHTML,
      text: document.body.innerText,
      q: (document.getElementById('gQ') as HTMLInputElement | null)?.value ?? null,
      file: (document.getElementById('file') as HTMLInputElement).files?.[0]?.name ?? null,
      current: G ? G.current() : 'brak window.Galeria',
      license: G ? G.licenseText() : null,
      config: G ? [G.CONFIG.katalog, G.CONFIG.mini('x1')] : null,
    };
  });

const waitMsg = (page: Page, re: RegExp): Promise<unknown> =>
  page.waitForFunction(r => new RegExp(r).test(document.getElementById('gMsg')?.textContent ?? ''), re.source, {
    timeout: 30_000,
  });

const setWall = (page: Page, f: Record<string, string>): Promise<void> =>
  page.evaluate(f => {
    for (const [id, v] of Object.entries(f)) {
      const e = document.getElementById(id) as HTMLInputElement;
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, f);

/** Klik przez DOM (galeria leży w kroku, który może być zwinięty – jak kliki w porównaniu stron). */
const click = (page: Page, sel: string): Promise<void> =>
  page.evaluate(sel => (document.querySelector(sel) as HTMLElement).click(), sel);

/** Wpisanie w pole wyszukiwania (zdarzenie input, jak od użytkownika). */
const search = (page: Page, text: string): Promise<void> =>
  page.evaluate(text => {
    const q = document.getElementById('gQ') as HTMLInputElement;
    q.value = text;
    q.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);

beforeAll(async () => {
  if (!enabled) return;
  browser = await launch();
  for (const [kind, base] of [
    ['old', 3800],
    ['new', 3850],
  ] as const) {
    const server = await startServer(kind, base + Math.floor(Math.random() * 40));
    const errors: string[] = [];
    const page = await openPage(browser, server.url, errors);
    await page
      .context()
      .route('https://upload.wikimedia.org/**', r =>
        wikimedia === 'ok'
          ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: THUMB })
          : r.fulfill({ status: 404, body: 'brak' }),
      );
    await loadTestImage(page);
    await setWall(page, { wallW: '350', wallH: '270', mT: '3', mB: '3', mL: '3', mR: '3' });
    side[kind] = { server, page, errors };
  }
});
afterAll(async () => {
  await browser?.close();
  for (const s of Object.values(side)) s.server.stop();
});

describe.skipIf(!enabled)('galeria wzorów: stary vs nowy program', () => {
  const both = async (f: (page: Page) => Promise<void>): Promise<unknown> => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const { page } = side[kind];
      await f(page);
      await page.waitForTimeout(400);
      out[kind] = await state(page);
    }
    expect(out.new).toEqual(out.old);
    return out.new;
  };
  const html = (o: unknown): string => (o as { html: string }).html;

  it('zwinięta galeria (przed wczytaniem katalogu)', async () => {
    const o = await both(async () => {});
    expect(html(o)).toContain('<details id="galeriaBox" class="sub">');
  });
  it('otwarcie: kategorie, pierwsza wybrana, miniatury z plakietkami jakości', async () => {
    const o = await both(async p => {
      await click(p, '#galeriaBox > summary');
      await p.waitForSelector('#gGrid .g-thumb', { state: 'attached' });
    });
    expect(html(o)).toContain('data-cat="krajobrazy"');
    expect(html(o)).toMatch(/gq-(good|ok)/);
  });
  it('inna kategoria (Kosmos)', () => both(p => click(p, '#gCats button[data-cat="kosmos"]')));
  it('wybór miniatury – szczegóły wzoru, licencja, źródło', async () => {
    const o = await both(p => click(p, '#gGrid .g-thumb[data-i="1"]'));
    expect(html(o)).toContain('Użyj tego wzoru');
  });
  it('wyszukiwanie po polsku („zachód”) – kategorie odznaczone', () => both(p => search(p, 'zachód')));
  it('wyszukiwanie dwóch słów i Enter w polu nie wysyła formularza', () =>
    both(async p => {
      await search(p, 'las jesień');
      await p.evaluate(() =>
        document
          .getElementById('gQ')!
          .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })),
      );
    }));
  it('brak wyników', async () => {
    const o = await both(p => search(p, 'xyzqwe'));
    expect(html(o)).toContain('Brak wzorów dla tego słowa.');
  });
  it('wyczyszczenie pola – powrót do ostatniej kategorii', () => both(p => search(p, '')));
  it('większa ściana – za słabe wzory ukryte, wybrany zostaje, jeśli jest dalej dostępny', async () => {
    const o = await both(async p => {
      await click(p, '#gCats button[data-cat="krajobrazy"]');
      await click(p, '#gGrid .g-thumb[data-i="0"]');
      await setWall(p, { wallW: '900', wallH: '400' });
    });
    expect(html(o)).toMatch(/Ukryto \d+ wzor/);
  });
  it('bardzo duża ściana – nic nie zostaje, podpowiedź', async () => {
    const o = await both(p => setWall(p, { wallW: '5000', wallH: '3000' }));
    expect(html(o)).toContain('Zmniejsz ścianę albo wybierz inną kategorię.');
  });
  it('bez wymiaru ściany – plakietek brak, opis zachęca do podania wymiaru', () =>
    both(async p => {
      await setWall(p, { wallW: '', wallH: '' });
      await p.waitForTimeout(400); // siatka przelicza się 250 ms po ostatniej zmianie
      await click(p, '#gGrid .g-thumb[data-i="0"]');
    }));
  it('błąd pobierania z Wikimedia (404) – komunikat, przycisk znów aktywny', async () => {
    wikimedia = 'error';
    const o = await both(async p => {
      await setWall(p, { wallW: '350', wallH: '270' });
      await p.waitForTimeout(400);
      await click(p, '#gGrid .g-thumb[data-i="0"]');
      await click(p, '#gUse');
      await waitMsg(p, /Nie udało się pobrać/);
    });
    wikimedia = 'ok';
    expect(html(o)).toContain('serwer Wikimedia odpowiedział 404');
  });
  it('„Użyj tego wzoru” – wzór w polu pliku, metryka licencji, podpis autora', async () => {
    const o = await both(async p => {
      await click(p, '#gUse');
      await waitMsg(p, /Wzór wstawiony/);
      await p.waitForFunction(() => !(document.getElementById('go') as HTMLButtonElement).disabled);
    });
    expect((o as { file: string }).file).toMatch(/^wzor-c\w+-[a-z0-9-]+\.jpg$/);
    expect(html(o)).toContain('Pobierz metrykę licencji (TXT)');
  });
  it('pobranie metryki licencji (TXT z BOM, wiersze CRLF)', async () => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const { page } = side[kind];
      const [d] = await Promise.all([page.waitForEvent('download'), click(page, '#gTxt')]);
      const body = fs.readFileSync((await d.path())!);
      out[kind] = { name: d.suggestedFilename(), body: body.toString('base64') };
    }
    expect(out.new).toEqual(out.old);
    const b = Buffer.from((out.new as { body: string }).body, 'base64').toString('utf8');
    expect(b.startsWith('﻿Metryka wzoru fototapety\r\n')).toBe(true);
  });
  it('własne zdjęcie zastępuje wzór – metryka znika', async () => {
    const o = await both(async p => {
      await loadTestImage(p);
    });
    expect((o as { current: unknown }).current).toBeNull();
  });
  it('brak pliku katalogu – komunikat błędu (nowa karta)', async () => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const p2 = await side[kind].page.context().newPage();
      p2.on('pageerror', e => side[kind].errors.push(e.message));
      await p2.route('**/wzory/katalog.js', r => r.fulfill({ status: 404, body: '' }));
      await p2.goto(side[kind].server.url + '/');
      await p2.waitForLoadState('load');
      await p2.waitForTimeout(500); // odtworzenie zapisanych ustawień i skrypty strony
      await click(p2, '#galeriaBox > summary');
      await waitMsg(p2, /Nie udało się/);
      out[kind] = await state(p2);
      await p2.close();
    }
    expect(out.new).toEqual(out.old);
    expect(html(out.new)).toContain('Nie udało się wczytać galerii (brak pliku wzory/katalog.js).');
  });
  it('brak błędów JavaScript po obu stronach', () => {
    const net = (e: string): boolean => !/404|Failed to load resource/.test(e);
    expect(side.new.errors.filter(net)).toEqual(side.old.errors.filter(net));
    expect(side.new.errors.filter(net)).toEqual([]);
  });
});

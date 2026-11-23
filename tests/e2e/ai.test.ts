// Grafika AI – stary vs nowy program. Płatne API nigdy nie jest wywoływane:
// 1) tryb demo – serwery testowe nie mają kluczy, obrazki rysuje przeglądarka;
// 2) tryb „serwer” – /api/health i /api/ai/* podmienia przeglądarka testowa (atrapy), zapytania są porównywane.
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canvasHashes,
  launch,
  loadTestImage,
  FIXED_NOW,
  OLD_REPO,
  openPage,
  startServer,
  type RunningServer,
} from './support';

const enabled = !!OLD_REPO;
const THUMB = fs.readFileSync(path.resolve('public/wzory/mini/c34259360.jpg')); // 500 × 292 px
const THUMB_URL = 'data:image/jpeg;base64,' + THUMB.toString('base64');
type Kind = 'old' | 'new';
let browser: Browser;
const side: Record<Kind, { server: RunningServer; page: Page; errors: string[] }> = {} as never;
/** Tryb „serwer”: druga karta z atrapami AI i zapis zapytań do /api/ai/*. */
const mock: Record<Kind, { page: Page; calls: unknown[] }> = {} as never;

/** Skrót SHA-256 (długie dane obrazów w zapytaniach i wynikach). */
const sha = (page: Page, s: string): Promise<string> =>
  page.evaluate(async s => {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }, s);

/** Stan sekcji AI i strony: HTML, styl, tekst, pola, obrazy propozycji (SHA-256), płótna, plik zdjęcia, fokus. */
const state = (page: Page): Promise<unknown> =>
  page
    .evaluate(async () => {
      const hex = async (b: Blob): Promise<string> =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()))]
          .map(x => x.toString(16).padStart(2, '0'))
          .join('');
      const imgs = [];
      for (const im of document.querySelectorAll<HTMLImageElement>('#aiGrid img, #avImg, #aiRefInfo img'))
        imgs.push(im.src ? [im.id || im.alt, await hex(await (await fetch(im.src)).blob())] : [im.id, '']);
      const f = (document.getElementById('file') as HTMLInputElement).files?.[0];
      const G = (window as unknown as { GrafikaAI?: { CONFIG: unknown; target(): unknown } }).GrafikaAI;
      const val = (id: string): unknown => {
        const e = document.getElementById(id) as HTMLInputElement | null;
        return e ? (e.type === 'checkbox' ? e.checked : e.value) : null;
      };
      return {
        html: document.body.innerHTML.replace(/(blob|data):[^"')\s]+/g, '$1:X'),
        head: document.head.innerHTML,
        text: document.body.innerText,
        fields: ['aiPrompt', 'aiStyle', 'aiCount', 'aiFix', 'aiRefOk'].map(val),
        imgs,
        file: f ? [f.name, f.type, f.size, await hex(f)] : null,
        config: G ? [G.CONFIG, G.target()] : 'brak window.GrafikaAI',
        focus: document.activeElement && (document.activeElement.id || document.activeElement.className),
        view: (document.getElementById('avImg') as HTMLImageElement | null)?.style.transform ?? null,
      };
    })
    .then(async s => ({ ...s, canvases: await canvasHashes(page) }));

const click = (page: Page, sel: string): Promise<void> =>
  page.evaluate(sel => (document.querySelector(sel) as HTMLElement).click(), sel);
const fields = (page: Page, f: Record<string, string>): Promise<void> =>
  page.evaluate(f => {
    for (const [id, v] of Object.entries(f)) {
      const e = document.getElementById(id) as HTMLInputElement;
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, f);
const key = (page: Page, k: string): Promise<void> =>
  page.evaluate(
    k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })),
    k,
  );
const waitText = (page: Page, sel: string, re: RegExp): Promise<unknown> =>
  page.waitForFunction(
    ([sel, r]) => new RegExp(r!).test(document.querySelector(sel!)?.textContent ?? ''),
    [sel, re.source],
    { timeout: 300_000 },
  );
/** Zdjęcie-inspiracja (płótno 800×600) w polu „Zdjęcie-inspiracja”; pusty = usunięcie. */
const setReference = (page: Page, empty = false): Promise<void> =>
  page.evaluate(async empty => {
    const dt = new DataTransfer();
    if (!empty) {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 600;
      const g = c.getContext('2d')!;
      g.fillStyle = '#3a7';
      g.fillRect(0, 0, 800, 600);
      g.fillStyle = '#fd3';
      g.fillRect(100, 100, 300, 200);
      const b = await new Promise<Blob>(r => c.toBlob(x => r(x!), 'image/jpeg', 0.9));
      dt.items.add(new File([b], 'inspiracja <1>.jpg', { type: 'image/jpeg' }));
    }
    const f = document.getElementById('aiRef') as HTMLInputElement;
    f.files = dt.files;
    f.dispatchEvent(new Event('change', { bubbles: true }));
  }, empty);

beforeAll(async () => {
  if (!enabled) return;
  browser = await launch();
  for (const [kind, base] of [
    ['old', 3900],
    ['new', 3950],
  ] as const) {
    const server = await startServer(kind, base + Math.floor(Math.random() * 40));
    const errors: string[] = [];
    const page = await openPage(browser, server.url, errors);
    await loadTestImage(page);
    await fields(page, { wallW: '350', wallH: '270' });
    side[kind] = { server, page, errors };
  }
});
afterAll(async () => {
  await browser?.close();
  for (const s of Object.values(side)) s.server.stop();
});

describe.skipIf(!enabled)('grafika AI: stary vs nowy program', () => {
  const both = async (f: (page: Page) => Promise<unknown>, pages = side): Promise<Record<string, unknown>> => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const { page } = pages[kind];
      await f(page);
      await page.waitForTimeout(300);
      out[kind] = await state(page);
    }
    expect(out.new).toEqual(out.old);
    return out.new as Record<string, unknown>;
  };
  const html = (o: Record<string, unknown>): string => o.html as string;

  describe('tryb demo (serwer bez kluczy)', () => {
    it('sekcja po sprawdzeniu serwera: AI niedostępne', async () => {
      const o = await both(p => click(p, '#aiDetails > summary'));
      expect(html(o)).toContain('<b>AI niedostępne</b>');
    });
    it('bez opisu i inspiracji – komunikat', async () => {
      const o = await both(p => click(p, '#aiGen'));
      expect(html(o)).toContain('Wpisz opis tapety albo wgraj zdjęcie-inspirację.');
    });
    it('dwie propozycje demo (akwarela) – obrazy identyczne bajt w bajt', async () => {
      const o = await both(async p => {
        await fields(p, { aiPrompt: 'las sosnowy we mgle o świcie', aiStyle: 'akwarela', aiCount: '2' });
        await click(p, '#aiGen');
        await waitText(p, '#aiMsg', /AI niedostępne/);
      });
      expect((o.imgs as unknown[]).length).toBe(2);
    });
    it('wybór propozycji 2 – pole poprawki', () => both(p => click(p, '#aiGrid .ai-thumb[data-i="1"]')));
    it('podgląd na cały ekran: następna strzałką, przybliżenie, wybór', () =>
      both(async p => {
        await click(p, '#aiGrid .ai-zoom[data-z="0"]');
        await key(p, 'ArrowRight');
        await key(p, 'ArrowRight');
        await click(p, '#aiView [data-a="in"]');
        await click(p, '#aiView [data-a="in"]');
        await click(p, '#aiView [data-a="out"]');
        await click(p, '#aiView [data-a="pick"]');
      }));
    it('podgląd: Tab krąży po przyciskach, Esc zamyka i oddaje fokus', () =>
      both(async p => {
        await p.focus('#aiGen');
        await click(p, '#aiGrid .ai-zoom[data-z="1"]');
        await key(p, 'Tab');
        await key(p, 'Tab');
        await click(p, '#aiView [data-a="fit"]');
        await key(p, 'Escape');
      }));
    it('poprawka bez tekstu – komunikat', () => both(p => click(p, '#aiFixBtn')));
    it('poprawka wybranej propozycji (demo nakłada wybraną)', async () => {
      const o = await both(async p => {
        await fields(p, { aiFix: 'jaśniejsze tło' });
        await click(p, '#aiFixBtn');
        await waitText(p, '#aiMsg', /Możesz poprawić dalej/);
      });
      expect((o.imgs as unknown[]).length).toBe(1);
    });
    it('„Użyj wybranej do podziału” – bez powiększania, plik grafika-ai.png', async () => {
      const o = await both(async p => {
        await click(p, '#aiUse');
        await waitText(p, '#aiMsg', /Przekazano do podziału/);
        await p.waitForFunction(() => !(document.getElementById('go') as HTMLButtonElement).disabled);
      });
      expect((o.file as unknown[])[0]).toBe('grafika-ai.png');
    });
    it('zdjęcie-inspiracja: podgląd, styl „Jak na zdjęciu”, bez zgody – komunikat', async () => {
      const o = await both(async p => {
        await fields(p, { aiPrompt: '', aiCount: '1' });
        await setReference(p);
        await waitText(p, '#aiRefInfo', /inspiracja/);
        await click(p, '#aiGen');
      });
      expect(html(o)).toContain('inspiracja &lt;1&gt;.jpg');
      expect(html(o)).toContain('Zaznacz, że inspiracja służy tylko jako kierunek');
    });
    it('inspiracja ze zgodą – jedna propozycja wybrana od razu', () =>
      both(async p => {
        await p.evaluate(() => ((document.getElementById('aiRefOk') as HTMLInputElement).checked = true));
        await click(p, '#aiGen');
        await waitText(p, '#aiMsg', /AI niedostępne/);
      }));
    it('usunięcie inspiracji; zmiana ściany i DPI – nowy wymiar do druku', async () => {
      const o = await both(async p => {
        await setReference(p, true);
        await fields(p, { wallW: '412,5', dpi: '200' });
      });
      expect(html(o)).toContain('id="aiTarget"');
    });
  });

  describe('tryb „serwer” (atrapy /api/health i /api/ai)', () => {
    beforeAll(async () => {
      if (!enabled) return;
      for (const kind of ['old', 'new'] as const) {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date(FIXED_NOW));
        page.on('pageerror', e => side[kind].errors.push(e.message));
        const calls: unknown[] = [];
        let generated = 0;
        await page.route('**/api/health', async r => {
          const res = await r.fetch();
          const body = (await res.json()) as Record<string, unknown>;
          body.ai = { generate: true, upscale: true, upscaler: 'replicate', provider: 'OpenAI', model: 'gpt-image-2' };
          await r.fulfill({ response: res, body: JSON.stringify(body) });
        });
        await page.route('**/api/ai/*', async r => {
          const kind = r.request().url().split('/').pop()!;
          const body = r.request().postDataJSON() as Record<string, unknown>;
          for (const k of ['source', 'reference']) if (typeof body[k] === 'string') body[k] = await sha(page, body[k]);
          calls.push([kind, body]);
          if (kind === 'upscale') {
            await new Promise(res => setTimeout(res, 800));
            return r.fulfill({
              status: 200,
              headers: { 'Content-Type': 'image/jpeg', 'X-Width': '500', 'X-Height': '292' },
              body: THUMB,
            });
          }
          // Trzecie zapytanie generowania: błąd usługi (limit) – reszta propozycji ma się pokazać.
          if (kind === 'generate' && ++generated === 3) return r.fulfill({ status: 500, body: 'limit testowy' });
          return r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ images: [{ dataUrl: THUMB_URL, width: 1024, height: 1024 }] }),
          });
        });
        await page.goto(side[kind].server.url + '/');
        await loadTestImage(page);
        await fields(page, { wallW: '350', wallH: '270' });
        mock[kind] = { page, calls };
      }
    });
    const pages = (): typeof side => ({
      old: { ...side.old, page: mock.old.page },
      new: { ...side.new, page: mock.new.page },
    });

    it('pasek trybu: dostawca i model z serwera', async () => {
      const o = await both(p => click(p, '#aiDetails > summary'), pages());
      expect(html(o)).toContain('<b>AI: OpenAI (gpt-image-2).</b>');
    });
    it('trzy propozycje równolegle, jedna z błędem – komunikat z liczbą gotowych', async () => {
      const o = await both(async p => {
        await fields(p, { aiPrompt: 'plaża o zachodzie', aiStyle: 'foto', aiCount: '3' });
        await click(p, '#aiGen');
        await p.waitForFunction(() => !(document.getElementById('aiGen') as HTMLButtonElement).disabled);
      }, pages());
      expect(html(o)).toContain('Gotowe 2 z 3 (pozostałe: limit testowy)');
    });
    it('poprawka przez serwer', () =>
      both(async p => {
        await click(p, '#aiGrid .ai-thumb[data-i="0"]');
        await fields(p, { aiFix: 'więcej słońca' });
        await click(p, '#aiFixBtn');
        await waitText(p, '#aiMsg', /Możesz poprawić dalej/);
      }, pages()));
    it('„Użyj” z powiększaniem w tle; „Generuj bryty” czeka i rusza samo po powiększeniu', async () => {
      const o = await both(async p => {
        await click(p, '#aiUse');
        await waitText(p, '#aiMsg', /W tle powiększam/);
        await click(p, '#go');
        await waitText(p, '#aiMsg', /Powiększono do|nie udało/);
        await waitText(p, '#msg', /Gotowe|Błąd/);
      }, pages());
      expect(html(o)).toContain('Powiększono do 500 × 292 px.');
    });
    it('„Popraw jakość (AI)” przy słabym zdjęciu – ta sama nazwa pliku', async () => {
      const o = await both(async p => {
        await p.waitForFunction(() => !(document.getElementById('aiQuality') as HTMLElement).hidden);
        await click(p, '#aiQBtn');
        await waitText(p, '#aiQMsg', /Gotowe|Nie udało/);
      }, pages());
      expect(html(o)).toContain('Gotowe: zdjęcie ma teraz 500 × 292 px');
    });
    it('zapytania do serwera AI identyczne (treść, kolejność rodzajów)', () => {
      const sort = (c: unknown[]): string[] => c.map(x => JSON.stringify(x)).sort();
      expect(sort(mock.new.calls)).toEqual(sort(mock.old.calls));
      expect(mock.new.calls.length).toBe(6); // 3 × generate, edit, 2 × upscale
    });
  });

  it('brak błędów JavaScript po obu stronach', () => {
    expect(side.new.errors).toEqual(side.old.errors);
    expect(side.new.errors).toEqual([]);
  });
});

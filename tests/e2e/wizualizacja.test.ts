// Wizualizacja we wnętrzu – stary vs nowy program. Usługa AI nigdy nie jest wywoływana naprawdę:
// serwery testowe nie mają kluczy, a tryb z AI działa na atrapach /api/health i /api/ai/interior (zapytania porównywane).
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canvasHashes,
  FIXED_NOW,
  launch,
  loadTestImage,
  OLD_REPO,
  openPage,
  startServer,
  type RunningServer,
} from './support';
import { staryPoZmianach } from '../support/zmiany';

const enabled = !!OLD_REPO;
const THUMB = fs.readFileSync(path.resolve('public/wzory/mini/c34259360.jpg'));
const THUMB_URL = 'data:image/jpeg;base64,' + THUMB.toString('base64');
type Kind = 'old' | 'new';
let browser: Browser;
const side: Record<Kind, { server: RunningServer; page: Page; errors: string[] }> = {} as never;
const mock: Record<Kind, { page: Page; calls: unknown[]; fail: boolean }> = {} as never;

const sha = (page: Page, s: string): Promise<string> =>
  page.evaluate(async s => {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }, s);

/** Stan panelu wizualizacji i strony (HTML, styl, tekst, płótna, stan wewnętrzny, rysunek geometrii, wynik AI). */
const state = async (page: Page): Promise<unknown> => {
  const s = await page.evaluate(async () => {
    const hex = async (b: Blob): Promise<string> =>
      [...new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()))]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
    const W = (window as unknown as { Wizualizacja?: { _state(): unknown; geometry(): string | null } }).Wizualizacja;
    const out = document.querySelector<HTMLImageElement>('#wizAiOut img');
    const geo = W ? W.geometry() : null;
    return {
      html: document.body.innerHTML.replace(/(blob|data):[^"')\s]+/g, '$1:X'),
      head: document.head.innerHTML,
      text: document.body.innerText,
      viz: W ? W._state() : 'brak window.Wizualizacja',
      geometry: geo ? await hex(await (await fetch(geo)).blob()) : null,
      result: out ? await hex(await (await fetch(out.src)).blob()) : null,
      cursor: (document.getElementById('wizCanvas') as HTMLCanvasElement | null)?.style.cursor ?? null,
    };
  });
  return { ...s, canvases: await canvasHashes(page) };
};

const click = (page: Page, sel: string): Promise<void> =>
  page.evaluate(sel => (document.querySelector(sel) as HTMLElement).click(), sel);
const setValue = (page: Page, sel: string, v: string, ev = 'change'): Promise<void> =>
  page.evaluate(
    ([sel, v, ev]) => {
      const e = document.querySelector(sel!) as HTMLInputElement;
      if (e.type === 'radio') e.checked = true;
      else e.value = v!;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event(ev!, { bubbles: true }));
    },
    [sel, v, ev],
  );
/** Zdjęcie wnętrza (płótno 2400×1800: ściana, podłoga, „drzwi”) w polu „Wgraj zdjęcie wnętrza”. */
const loadInterior = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1800;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e8e2d6';
    g.fillRect(0, 0, 2400, 1800);
    g.fillStyle = '#a07850';
    g.fillRect(0, 1400, 2400, 400);
    g.fillStyle = '#6b4b2a';
    g.fillRect(1900, 700, 300, 700);
    const b = await new Promise<Blob>(r => c.toBlob(x => r(x!), 'image/jpeg', 0.9));
    const dt = new DataTransfer();
    dt.items.add(new File([b], 'salon.jpg', { type: 'image/jpeg' }));
    const f = document.getElementById('wizFile') as HTMLInputElement;
    f.files = dt.files;
    f.dispatchEvent(new Event('change', { bubbles: true }));
  });
/** Klik myszą w punkt płótna podany jako ułamek (0–1) szerokości i wysokości. */
async function canvasClick(page: Page, x: number, y: number): Promise<void> {
  const cv = page.locator('#wizCanvas');
  await cv.scrollIntoViewIfNeeded();
  const b = (await cv.boundingBox())!;
  await page.mouse.click(b.x + b.width * x, b.y + b.height * y);
  await page.waitForTimeout(100);
}
async function canvasDrag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const b = (await page.locator('#wizCanvas').boundingBox())!;
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 6 });
  await page.mouse.up();
}
const CORNERS: [number, number][] = [
  [0.08, 0.1],
  [0.7, 0.12],
  [0.71, 0.77],
  [0.07, 0.78],
];
const waitText = (page: Page, sel: string, re: RegExp): Promise<unknown> =>
  page.waitForFunction(
    ([sel, r]) => new RegExp(r!).test(document.querySelector(sel!)?.textContent ?? ''),
    [sel, re.source],
    { timeout: 60_000 },
  );

beforeAll(async () => {
  if (!enabled) return;
  browser = await launch();
  for (const [kind, base] of [
    ['old', 4000],
    ['new', 4050],
  ] as const) {
    const server = await startServer(kind, base + Math.floor(Math.random() * 40));
    const errors: string[] = [];
    const page = await openPage(browser, server.url, errors);
    await loadTestImage(page);
    side[kind] = { server, page, errors };
  }
});
afterAll(async () => {
  await browser?.close();
  for (const s of Object.values(side)) s.server.stop();
});

describe.skipIf(!enabled)('wizualizacja we wnętrzu: stary vs nowy program', () => {
  const both = async (f: (page: Page) => Promise<unknown>, pages = side): Promise<Record<string, unknown>> => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const { page } = pages[kind];
      await f(page);
      await page.waitForTimeout(400);
      out[kind] = await state(page);
    }
    expect(out.new).toEqual(staryPoZmianach(out.old));
    return out.new as Record<string, unknown>;
  };
  const html = (o: Record<string, unknown>): string => o.html as string;

  describe('bez usługi AI', () => {
    it('przykładowy pokój: komunikat, AI niedostępne, rysunek geometrii dla AI', async () => {
      const o = await both(async () => {});
      expect(html(o)).toContain('Wizualizacja AI niedostępna – brak połączenia z usługą AI.');
      expect(o.geometry).not.toBeNull();
    });
    it('inny typ wnętrza i inny wymiar ściany', () =>
      both(async p => {
        await setValue(p, '#wizRoom', 'biuro');
        await setValue(p, '#wallW', '520');
        await setValue(p, '#wallH', '250');
      }));
    it('błędne ustawienia – prośba o poprawienie, brak rysunku geometrii', async () => {
      const o = await both(p => setValue(p, '#count', '0'));
      expect(html(o)).toContain('Popraw ustawienia po lewej');
      await both(p => setValue(p, '#count', '3'));
    });
    it('moje wnętrze bez zdjęcia: pusta scena z zachętą', () =>
      both(p => setValue(p, 'input[name=wizMode][value=wnetrze]', '')));
    it('zdjęcie wnętrza – prośba o 1. narożnik, kursor celownika', async () => {
      const o = await both(async p => {
        await loadInterior(p);
        await waitText(p, '#wizMsg', /Kliknij 1\. punkt/);
      });
      expect(o.cursor).toBe('crosshair');
    });
    it('3 narożniki, cofnięcie punktu', () =>
      both(async p => {
        for (const [x, y] of CORNERS.slice(0, 3)) await canvasClick(p, x, y);
        await click(p, '#wizUndo');
      }));
    it('zaznacz ponownie i 4 narożniki – obszar, sprawdzenie skali widoczne', async () => {
      const o = await both(async p => {
        await click(p, '#wizRedo');
        for (const [x, y] of CORNERS) await canvasClick(p, x, y);
      });
      expect(html(o)).toContain('Zaznaczony obszar będzie miał w rzeczywistości wymiar ściany');
    });
    it('przeciągnięcie narożnika', () => both(p => canvasDrag(p, CORNERS[1]!, [0.75, 0.08])));
    it('odcinek odniesienia: 2 kliknięcia, brak długości – podpowiedź', async () => {
      const o = await both(async p => {
        await click(p, '#wizRefPick');
        await canvasClick(p, 0.66, 0.4);
        await canvasClick(p, 0.66, 0.77);
      });
      expect(html(o)).toContain('Wpisz długość odcinka w cm (10–2000).');
    });
    it('długość odcinka 200 cm – ocena skali', () => both(p => setValue(p, '#wizRefLen', '200', 'input')));
    it('długość odcinka 80 cm i przeciągnięcie końca odcinka', () =>
      both(async p => {
        await setValue(p, '#wizRefLen', '80', 'input');
        await canvasDrag(p, [0.66, 0.4], [0.6, 0.3]);
      }));
    it('cofnięcie: najpierw koniec odcinka odniesienia', () => both(p => click(p, '#wizUndo')));
    it('powrót do przykładowego pokoju', () => both(p => setValue(p, 'input[name=wizMode][value=pokoj]', '')));
  });

  describe('z usługą AI (atrapy)', () => {
    beforeAll(async () => {
      if (!enabled) return;
      for (const kind of ['old', 'new'] as const) {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date(FIXED_NOW));
        page.on('pageerror', e => side[kind].errors.push(e.message));
        const m = { page, calls: [] as unknown[], fail: false };
        await page.route('**/api/health', async r => {
          const res = await r.fetch();
          const body = (await res.json()) as Record<string, unknown>;
          body.ai = { generate: true, upscale: false, upscaler: null, provider: 'OpenAI', model: 'gpt-image-2' };
          await r.fulfill({ response: res, body: JSON.stringify(body) });
        });
        await page.route('**/api/ai/interior', async r => {
          const body = r.request().postDataJSON() as Record<string, unknown>;
          for (const k of ['photo', 'guide', 'mask', 'geometry', 'mural'])
            if (typeof body[k] === 'string') body[k] = await sha(page, body[k]);
          m.calls.push(body);
          if (m.fail) return r.fulfill({ status: 502, body: 'usługa AI chwilowo niedostępna <test>' });
          return r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ image: { dataUrl: THUMB_URL } }),
          });
        });
        await page.goto(side[kind].server.url + '/');
        await loadTestImage(page);
        mock[kind] = m;
      }
    });
    const pages = (): typeof side => ({
      old: { ...side.old, page: mock.old.page },
      new: { ...side.new, page: mock.new.page },
    });
    const runAi = async (p: Page): Promise<void> => {
      await p.waitForFunction(() => !(document.getElementById('wizAi') as HTMLButtonElement).disabled);
      await click(p, '#wizAi');
      await p.waitForFunction(() => !(document.getElementById('wizAi') as HTMLButtonElement).disabled);
    };

    it('przykładowy pokój (sypialnia): wynik AI i link do pobrania', async () => {
      const o = await both(async p => {
        await setValue(p, '#wizRoom', 'sypialnia');
        await runAi(p);
      }, pages());
      expect(html(o)).toMatch(/download="[^"]+_wizualizacja_AI_sypialnia\.png"/);
    });
    it('moje wnętrze: zdjęcie, 4 narożniki, wynik AI tylko w zaznaczonym obszarze', async () => {
      const o = await both(async p => {
        await setValue(p, 'input[name=wizMode][value=wnetrze]', '');
        await loadInterior(p);
        await waitText(p, '#wizMsg', /Kliknij 1\. punkt/);
        for (const [x, y] of CORNERS) await canvasClick(p, x, y);
        await runAi(p);
      }, pages());
      expect(html(o)).toMatch(/download="[^"]+_wizualizacja_AI_moje-wnetrze\.png"/);
    });
    it('błąd usługi AI – komunikat (znaki HTML zabezpieczone)', async () => {
      mock.old.fail = mock.new.fail = true;
      const o = await both(runAi, pages());
      expect(html(o)).toContain('Wizualizacja AI nie powiodła się: usługa AI chwilowo niedostępna &lt;test&gt;');
    });
    it('zapytania do /api/ai/interior identyczne (zdjęcie, obrys, maska, geometria, kadr)', () => {
      expect(mock.new.calls).toEqual(mock.old.calls);
      expect(mock.new.calls).toHaveLength(3);
    });
  });

  it('brak błędów JavaScript po obu stronach', () => {
    expect(side.new.errors).toEqual(side.old.errors);
    expect(side.new.errors).toEqual([]);
  });
});

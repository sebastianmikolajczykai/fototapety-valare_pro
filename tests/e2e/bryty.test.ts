// Strona główna (bryty.js) – stary vs nowy program: kadr myszą, suwak i „Wyśrodkuj”, zły plik, limit przeglądarki,
// thru cut bez pliku dla Corela oraz zapis .cdr na atrapie serwera z CorelDRAW (/api/health → corel, /api/cdr).
// Jedyna świadoma różnica (decyzja Sebastiana 23.11.2026): nowy program wysyła do Corela obrazy osadzone
// (link: false), a opcja „Obrazy w .cdr jako linki” – widoczna tylko przy serwerze z Corelem – daje link: true.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySettings,
  canvasHashes,
  FIXED_NOW,
  generate,
  launch,
  loadTestImage,
  OLD_REPO,
  openPage,
  pageHtml,
  startServer,
  visibleText,
  type FormSettings,
  type RunningServer,
} from './support';

const enabled = !!OLD_REPO;
type Kind = 'old' | 'new';
let browser: Browser;
const side: Record<Kind, { server: RunningServer; page: Page; errors: string[] }> = {} as never;
/** Druga karta: atrapa serwera z CorelDRAW; zapis opisów arkusza wysłanych do /api/cdr. */
const corel: Record<Kind, { page: Page; jobs: Record<string, unknown>[]; fail: boolean }> = {} as never;

/** Opcja linkowania obrazów istnieje tylko w nowym programie – przy porównaniu HTML jest wycinana. */
const LINK_OPTION = /<label class="check" id="cdrLinkBox">.*?<\/label>/;

const state = async (page: Page): Promise<unknown> => ({
  text: (await visibleText(page)).replace(/\n?Obrazy w \.cdr jako linki[^\n]*/, ''),
  html: (await pageHtml(page)).replace(LINK_OPTION, ''),
  head: await page.evaluate(() => document.head.innerHTML),
  form: await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('.panel input:not(#cdrLink), .panel select')].map(e => [
      e.id || e.name,
      e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value,
    ]),
  ),
  canvases: await canvasHashes(page),
});

async function drag(page: Page, sel: string, from: [number, number], d: [number, number]): Promise<void> {
  const el = page.locator(sel);
  await el.scrollIntoViewIfNeeded();
  const b = (await el.boundingBox())!;
  const x = b.x + b.width * from[0];
  const y = b.y + b.height * from[1];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + d[0], y + d[1], { steps: 8 });
  await page.mouse.up();
}

beforeAll(async () => {
  if (!enabled) return;
  browser = await launch();
  for (const [kind, base] of [
    ['old', 4100],
    ['new', 4150],
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

describe.skipIf(!enabled)('strona główna: stary vs nowy program', () => {
  const both = async (
    f: (page: Page) => Promise<unknown>,
    pages: Record<Kind, { page: Page }> = side,
  ): Promise<Record<string, unknown>> => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const { page } = pages[kind];
      const r = await f(page);
      await page.waitForTimeout(300);
      out[kind] = { ...((await state(page)) as object), r };
    }
    expect(out.new).toEqual(out.old);
    return out.new as Record<string, unknown>;
  };
  const html = (o: Record<string, unknown>): string => o.html as string;
  const set = (s: FormSettings) => (p: Page) => applySettings(p, s);

  it('kadr: powiększenie suwakiem i przeciągnięcie na podglądzie', () =>
    both(async p => {
      await applySettings(p, { fields: { wallW: '300', wallH: '260', count: '3' }, radios: { split: 'equal' } });
      await p.evaluate(() => {
        const z = document.getElementById('zoom') as HTMLInputElement;
        z.value = '180';
        z.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await p.waitForTimeout(100);
      await drag(p, '#preview', [0.5, 0.2], [-90, 40]);
    }));
  it('przeciągnięcie poniżej górnego podglądu nie zmienia kadru', () =>
    both(p => drag(p, '#preview', [0.5, 0.95], [120, -30])));
  it('„Wyśrodkuj” wraca do pełnego kadru', () => both(set({ clicks: ['#center'] })));
  it('plik, który nie jest zdjęciem – komunikat', async () => {
    const o = await both(p =>
      p.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(['to nie jest jpg'], 'zly.jpg', { type: 'image/jpeg' }));
        const f = document.getElementById('file') as HTMLInputElement;
        f.files = dt.files;
        f.dispatchEvent(new Event('change', { bubbles: true }));
      }),
    );
    expect(html(o)).toContain('Nie udało się wczytać pliku.');
  });
  it('limit przeglądarki: za wysoki bryt przy 300 DPI – podpowiedź DPI', async () => {
    const o = await both(set({ fields: { wallH: '3000', dpi: '300' } }));
    expect(html(o)).toContain('przeglądarka zapisze najwyżej 32000 px');
  });
  it('limit przeglądarki: za szeroki bryt – podpowiedź liczby brytów', async () => {
    const o = await both(set({ fields: { wallH: '260', wallW: '1200', count: '2', dpi: '300' } }));
    expect(html(o)).toContain('jest za duży dla przeglądarki');
  });
  it('thru cut, bez pliku dla Corela: bryty, całość i ZIP bajt w bajt', async () => {
    const o = await both(async p => {
      await loadTestImage(p);
      await applySettings(p, {
        fields: { wallW: '200', wallH: '150', count: '2', dpi: '100', order: 'Test thru' },
        checks: { thru: true, pdf: false },
      });
      await p.waitForTimeout(200);
      return generate(p);
    });
    expect(JSON.stringify(o.r)).toContain('bryty_Test_thru.zip');
  });

  describe('serwer z CorelDRAW (atrapa)', () => {
    beforeAll(async () => {
      if (!enabled) return;
      for (const kind of ['old', 'new'] as const) {
        const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date(FIXED_NOW));
        page.on('pageerror', e => side[kind].errors.push(e.message));
        const c = { page, jobs: [] as Record<string, unknown>[], fail: false };
        await page.route('**/api/health', async r => {
          const res = await r.fetch();
          const body = (await res.json()) as Record<string, unknown>;
          await r.fulfill({ response: res, body: JSON.stringify({ ...body, corel: true }) });
        });
        await page.route('**/api/cdr', async r => {
          const buf = r.request().postDataBuffer()!;
          const len = buf.readUInt32LE(0);
          const job = JSON.parse(buf.subarray(4, 4 + len).toString('utf8')) as Record<string, unknown>;
          c.jobs.push({ ...job, dataBytes: buf.length - 4 - len });
          if (c.fail) return r.fulfill({ status: 500, body: 'CorelDRAW nie zapisał pliku.' });
          const link = job.link === true;
          return r.fulfill({
            status: 200,
            headers: {
              'Content-Type': 'application/octet-stream',
              ...(link ? { 'X-Folder': encodeURIComponent('C:\\fototapety\\wyniki\\bryty_zlecenie') } : {}),
            },
            body: Buffer.from('atrapa pliku cdr'),
          });
        });
        await page.goto(side[kind].server.url + '/');
        await loadTestImage(page);
        await applySettings(page, { fields: { wallW: '250', wallH: '200', count: '2', dpi: '100' } });
        corel[kind] = c;
      }
    });
    const pages = (): Record<Kind, { page: Page }> => ({ old: corel.old, new: corel.new });

    it('informacja „Plik .cdr zapisze CorelDRAW.”; opcja linków tylko w nowym, domyślnie wyłączona', async () => {
      const o = await both(async () => {}, pages());
      expect(html(o)).toContain('Plik .cdr zapisze CorelDRAW.');
      expect(
        await corel.new.page.evaluate(() => (document.getElementById('cdrLink') as HTMLInputElement).checked),
      ).toBe(false);
      expect(await corel.old.page.evaluate(() => !!document.getElementById('cdrLink'))).toBe(false);
    });
    it('.cdr: ten sam arkusz i pliki; stary – obrazy linkowane, nowy – osadzone (świadoma zmiana)', async () => {
      const o = await both(p => generate(p), pages());
      expect(JSON.stringify(o.r)).toContain('bryty_zlecenie.cdr');
      const [oldJob, newJob] = [corel.old.jobs[0]!, corel.new.jobs[0]!];
      expect(oldJob.link).toBe(true);
      expect(newJob.link).toBe(false);
      expect({ ...newJob, link: true }).toEqual(oldJob);
    });
    it('opcja „Obrazy w .cdr jako linki” – zlecenie identyczne ze starym (z folderem w komunikacie)', async () => {
      await corel.new.page.evaluate(() => ((document.getElementById('cdrLink') as HTMLInputElement).checked = true));
      const o = await both(p => generate(p), pages());
      expect(corel.new.jobs[1]).toEqual(corel.old.jobs[1]);
      expect(html(o)).toContain(
        'Pliki i .cdr są też zapisane w folderze <b>C:\\fototapety\\wyniki\\bryty_zlecenie</b>',
      );
    });
    it('błąd CorelDRAW – zamiast .cdr powstaje PDF (bajt w bajt) z informacją o błędzie', async () => {
      corel.old.fail = corel.new.fail = true;
      const o = await both(p => generate(p), pages());
      expect(html(o)).toContain(
        'Nie udało się zapisać .cdr, zamiast niego jest PDF. CorelDRAW: CorelDRAW nie zapisał pliku.',
      );
    });
  });

  it('brak błędów JavaScript po obu stronach', () => {
    expect(side.new.errors).toEqual(side.old.errors);
    expect(side.new.errors).toEqual([]);
  });
});

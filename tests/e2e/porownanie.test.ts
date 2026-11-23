// Porównanie stary vs nowy program w tej samej przeglądarce: te same ustawienia i to samo zdjęcie muszą dać
// ten sam tekst na stronie i identyczne pliki (bajt w bajt: bryty JPG, całość, PDF, ZIP).
// Wymaga OLD_REPO=/ścieżka/do/fototapety-valare (main 6933982); bez niej test jest pomijany.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySettings,
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

const SCENARIOS: { name: string; s: FormSettings; generate: boolean; expectText?: string[] }[] = [
  {
    name: '005-21: 350×270, naddatek 3, zakład 6, 3 bryty, Mural Canvas CT',
    s: {
      fields: {
        wallW: '350',
        wallH: '270',
        mT: '3',
        mB: '3',
        mL: '3',
        mR: '3',
        overlap: '6',
        count: '3',
        dpi: '150',
        material: '131|mural-canvas-ct',
      },
      radios: { join: 'overlap', split: 'equal' },
    },
    generate: true,
  },
  {
    name: 'na styk, 325×245, thru cut, 100 DPI, zlecenie z polskimi znakami',
    s: {
      fields: { wallW: '325', wallH: '245', count: '3', dpi: '100', order: 'Kowalski – ŻÓŁĆ' },
      radios: { join: 'butt' },
      checks: { thru: true },
    },
    generate: true,
  },
  {
    name: 'własne szerokości 100 / 120 / reszta',
    s: {
      fields: { wallW: '350', count: '3', material: '' },
      radios: { join: 'overlap', split: 'custom' },
      widths: ['100', '120', ''],
    },
    generate: true,
  },
  {
    name: 'wycena: ekspres, powierzchnia brytów, na styk, Canvas NW',
    s: {
      fields: { wallW: '400', count: '4', material: '132|canvas-nw', wycArea: 'print' },
      radios: { join: 'butt', split: 'equal', wycTermin: 'express' },
    },
    generate: false,
    expectText: ['Canvas NW:', 'Przygotowanie na styk', 'Dopłata za termin +30%'],
  },
  {
    name: 'wycena: materiał na zamówienie (Diamante CT) blokuje wybór terminu, sama ściana',
    s: {
      fields: { material: '130|diamante-ct', wycArea: 'wall' },
      radios: { join: 'overlap' },
      checks: { wycOrder: true },
    },
    generate: false,
  },
  {
    name: 'materiały: filtr „Własny klej”, rolka Sand Dot 160, klik w kartę zostawia wybraną rolkę',
    s: {
      fields: { wallW: '300', count: '2' },
      clicks: [
        '#mkBox [data-f="Własny klej"]',
        '#mkBox .mk-chip[data-id="sand-dot-gw-160"]',
        '#mkBox .mk-card[data-id="sand-dot-gw-107"] .mk-meta',
      ],
    },
    generate: false,
    expectText: ['Wybrany: <b>Sand Dot GW 160</b>, maks. druk 154 cm'],
  },
  {
    name: 'materiały: filtr „Wszystkie”, Enter na karcie Woven Bamboo (na zamówienie), klik w opis nic nie zmienia',
    s: {
      clicks: ['#mkBox [data-f="Wszystkie"]', '#mkBox .mk-card[data-id="concrete-nw"] summary'],
      keys: [{ selector: '#mkBox .mk-card[data-id="woven-bamboo-nw"]', key: 'Enter' }],
    },
    generate: false,
    expectText: ['Wybrany: <b>Woven Bamboo NW</b>', 'na zamówienie (21 dni rob.)'],
  },
  {
    name: 'materiały: karta „Inny materiał” z wpisaną szerokością 120,5 cm',
    s: { fields: { maxPrint: '120.5' }, clicks: ['#mkBox .mk-card[data-id="own"]'] },
    generate: false,
    expectText: ['Wybrany: <b>inny materiał</b>, maks. druk 120.5 cm'],
  },
  {
    name: 'materiały: karta „Bez materiału”, filtr „Uzupełniające”',
    s: { clicks: ['#mkBox .mk-card[data-id=""]', '#mkBox [data-f="Uzupełniające"]'] },
    generate: false,
    expectText: ['Wybrany: <b>bez materiału</b>'],
  },
  {
    name: 'błąd: bryt szerszy niż materiał',
    s: { fields: { wallW: '120', count: '1', material: '100|sand-dot-gw-107' }, radios: { split: 'equal' } },
    generate: false,
  },
];

const enabled = !!OLD_REPO;
let browser: Browser;
const side: Record<'old' | 'new', { server: RunningServer; page: Page; errors: string[] }> = {} as never;

beforeAll(async () => {
  if (!enabled) return;
  browser = await launch();
  for (const [kind, port] of [
    ['old', 3600],
    ['new', 3650],
  ] as const) {
    const server = await startServer(kind, port + Math.floor(Math.random() * 40));
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

describe.skipIf(!enabled)('stary vs nowy program', () => {
  for (const sc of SCENARIOS)
    it(sc.name, async () => {
      const out: Record<string, unknown> = {};
      for (const kind of ['old', 'new'] as const) {
        const { page } = side[kind];
        await applySettings(page, sc.s);
        await page.waitForTimeout(300);
        const result = sc.generate ? await generate(page) : null;
        const disabled = await page.evaluate(() =>
          [...document.querySelectorAll('input, select, button')]
            .filter(e => (e as HTMLInputElement).disabled)
            .map(e => e.id || (e as HTMLInputElement).name),
        );
        const material = await page.evaluate(() => {
          const M = (window as unknown as { Materialy?: { wybrany(): unknown } }).Materialy;
          return M ? M.wybrany() : 'brak window.Materialy';
        });
        out[kind] = { text: await visibleText(page), html: await pageHtml(page), disabled, material, result };
      }
      expect(out.new).toEqual(out.old);
      for (const t of sc.expectText ?? []) expect((out.new as { html: string }).html).toContain(t);
    });
  it('brak błędów JavaScript po obu stronach', () => {
    expect(side.new.errors).toEqual(side.old.errors);
    expect(side.new.errors).toEqual([]);
  });
});

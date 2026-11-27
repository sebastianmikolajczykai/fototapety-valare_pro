// Porównanie stary vs nowy program w tej samej przeglądarce: te same ustawienia i to samo zdjęcie muszą dać
// ten sam tekst na stronie i identyczne pliki (bajt w bajt: bryty JPG, całość, PDF, ZIP).
// Wymaga OLD_REPO=/ścieżka/do/fototapety-valare (main 6933982); bez niej test jest pomijany.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySettings,
  canvasHashes,
  generate,
  generateAssembly,
  generateSample,
  launch,
  loadTestImage,
  FIXED_NOW,
  OLD_REPO,
  openPage,
  pageHtml,
  startServer,
  visibleText,
  type FormSettings,
  type RunningServer,
} from './support';
import { staryPoZmianach } from '../support/zmiany';

const SCENARIOS: {
  name: string;
  s: FormSettings;
  generate: boolean;
  /** Klik „Generuj próbkę” i porównanie pliku próbki. */
  sample?: boolean;
  /** Klik „Schemat montażu” i porównanie pliku PDF (nowy program z docięciem 0, jak stary). */
  assembly?: boolean;
  /** Teksty w domyślnym schemacie nowego programu (po docięciu na Zundzie), zapis jak w treści PDF. */
  assemblyText?: string[];
  /** Wyrażenie liczone na stronie po ustawieniach (porównywany wynik). */
  probe?: string;
  expectText?: string[];
}[] = [
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
  {
    name: 'jakość: progi 9000 / 3000 px/m dają „Za słaba” i ostrzeżenie pod ustawieniami',
    s: {
      fields: { wallW: '400', wallH: '270', count: '3', material: '', jqGood: '9000', jqMin: '3000' },
      radios: { split: 'equal' },
    },
    generate: false,
    expectText: ['Jakość zdjęcia: za słaba', 'jq-badge jq-bad'],
  },
  {
    name: 'jakość: próg „za słaba” wyższy niż „dobra” zostaje obcięty; podgląd fragmentu 200%',
    s: { fields: { jqGood: '1500', jqMin: '4000' }, checks: { jqX2: true } },
    generate: false,
    expectText: ['minimum 1500 px/m', '<span style="left:66.66666666666666%">1500</span>'],
  },
  {
    name: 'jakość: przeciągnięcie fragmentu 1:1 przesuwa zieloną ramkę na podglądzie',
    s: {
      fields: { jqGood: '2500', jqMin: '1000' },
      checks: { jqX2: false },
      drag: { selector: '#jakoscCanvas', dx: 150, dy: 60 },
    },
    generate: false,
  },
  {
    name: 'próbka: pionowo 40×60, 150 DPI, thru cut – plik bajt w bajt',
    s: {
      fields: { wallW: '350', wallH: '270', count: '3', dpi: '150', order: 'Próbka 1' },
      radios: { split: 'equal', join: 'overlap' },
      checks: { thru: true },
    },
    generate: false,
    sample: true,
    expectText: ['Gotowe: próbka 40 × 60 cm, 2363 × 3544 px, 150 DPI'],
  },
  {
    name: 'próbka: poziomo 60×40, pokazana na podglądzie i przesunięta myszą, bez thru cut',
    s: {
      radios: { probkaOr: 'h' },
      checks: { thru: false, probkaShow: true },
      drag: { selector: '#preview', dx: 90, dy: -40 },
    },
    generate: false,
    sample: true,
    expectText: ['Gotowe: próbka 60 × 40 cm'],
  },
  {
    name: 'próbka: ściana węższa niż próbka – ostrzeżenie',
    s: { fields: { wallW: '30', count: '1' }, radios: { probkaOr: 'h' }, checks: { probkaShow: false } },
    generate: false,
    expectText: ['Ściana jest węższa niż próbka'],
  },
  {
    name: 'schemat montażu: 3 bryty na zakład, Linen NW, naddatki różne – PDF bajt w bajt',
    s: {
      fields: {
        wallW: '360',
        wallH: '260',
        mT: '3',
        mB: '3',
        mL: '2',
        mR: '4',
        count: '3',
        material: '132|linen-nw',
        order: 'Montaż ŁÓDŹ',
      },
      radios: { split: 'equal', join: 'overlap' },
    },
    generate: false,
    assembly: true,
    expectText: ['schemat-montazu_Fototapeta_360x260_23.11.2026.pdf (0.6 MB, 1 strona)'],
    // 360 + 2 + 4 = 366 → 365 po docięciu; 260 + 3 + 3 = 266 → 265; zakład 6 → 5
    assemblyText: ['z naddatkiem 365 \\327 265 cm', 'zak\\203ad 5 cm'],
  },
  {
    name: 'schemat montażu: na styk, 6 brytów, inny materiał',
    s: {
      fields: { wallW: '600', count: '6', material: 'own', maxPrint: '120' },
      radios: { join: 'butt' },
    },
    generate: false,
    assembly: true,
    // styk 1 cm wspólnej grafiki znika po docięciu – bryty stykają się krawędziami
    assemblyText: ['(\\203\\200czenie na styk) Tj'],
  },
  {
    name: 'schemat montażu: błąd w ustawieniach – przycisk wyłączony',
    s: { fields: { count: '0' } },
    generate: false,
  },
  {
    name: 'ściana: narożnik, drzwi i okno w danych (sekcja niewidoczna) – ostrzeżenia, nakładka, propozycja, schemat PDF',
    s: {
      script:
        "Sciana.items.push({ type: 'corner', x: 118, w: NaN, y: NaN, h: NaN }, { type: 'door', x: 200, w: 90, y: 0, h: 205 }, { type: 'window', x: 20, w: 60, y: 100, h: NaN })",
      fields: {
        wallW: '350',
        wallH: '270',
        mT: '3',
        mB: '3',
        mL: '3',
        mR: '3',
        count: '3',
        material: '131|mural-canvas-ct',
      },
      radios: { split: 'equal', join: 'overlap' },
    },
    generate: false,
    assembly: true,
    probe:
      '(() => { const B = window.Bryty; const p = B ? B.params() : params(); const L = B ? B.layout(p) : layout(p); return { data: Sciana.data(p, L), suggest: Sciana.suggest(p, L), warnings: Sciana.warnings(p, L), items: Sciana.items, min: [Sciana.CORNER_MIN_CM, Sciana.OPENING_MIN_CM] }; })()',
    expectText: ['wypada bliżej niż 20 cm od narożnika'],
  },
  {
    name: 'ściana: niekompletne i wystające elementy – ostrzeżenia',
    s: {
      script:
        "Sciana.items.splice(0, Sciana.items.length, { type: 'door', x: NaN, w: 80, y: 0, h: NaN }, { type: 'window', x: 10, w: NaN, y: NaN, h: NaN }, { type: 'window', x: 300, w: 80, y: NaN, h: NaN }, { type: 'door', x: 10, w: 50, y: 100, h: 200 })",
      fields: { count: '3' },
    },
    generate: false,
    probe:
      '(() => { const B = window.Bryty; const p = B ? B.params() : params(); const L = B ? B.layout(p) : layout(p); return { data: Sciana.data(p, L), suggest: Sciana.suggest(p, L), warnings: Sciana.warnings(p, L), items: Sciana.items, min: [Sciana.CORNER_MIN_CM, Sciana.OPENING_MIN_CM] }; })()',
    expectText: [
      'Drzwi 1: wpisz położenie',
      'Okno 1: wpisz szerokość',
      'Okno 2 wychodzi poza ścianę',
      'Drzwi 2 wychodzi poza ścianę u góry',
    ],
  },
  {
    name: 'ściana: panel wstawiony na stronę – dodanie narożnika, wpisanie położenia, propozycja podziału, usunięcie',
    s: {
      script: `Sciana.items.splice(0, Sciana.items.length);
        const box = document.createElement('div'); box.id = 'scianaBox'; box.className = 'step';
        document.getElementById('widthsBox').after(box); Sciana.init();
        box.querySelector('[data-add=corner]').click(); box.querySelector('[data-add=window]').click();
        const set = (i, k, v) => { const el = box.querySelector('input[data-i="' + i + '"][data-k="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
        set(0, 'x', '120,5'); set(1, 'x', '235'); set(1, 'w', '70');`,
      fields: { wallW: '350', count: '3', material: '131|mural-canvas-ct' },
      radios: { split: 'equal', join: 'overlap' },
      clicks: ['#scianaSuggest'],
    },
    generate: false,
    probe:
      '(() => { const B = window.Bryty; const p = B ? B.params() : params(); const L = B ? B.layout(p) : layout(p); return { data: Sciana.data(p, L), suggest: Sciana.suggest(p, L), warnings: Sciana.warnings(p, L), items: Sciana.items, min: [Sciana.CORNER_MIN_CM, Sciana.OPENING_MIN_CM] }; })()',
    expectText: ['Ustawiono'],
  },
  {
    name: 'ściana: usunięcie elementów z panelu, obecny podział bez konfliktów',
    s: {
      script: `const box = document.getElementById('scianaBox'); box.querySelector('[data-del="1"]').click();`,
      fields: { count: '1', wallW: '100' },
      radios: { split: 'equal' },
      clicks: ['#scianaSuggest'],
    },
    generate: false,
    probe:
      '(() => { const B = window.Bryty; const p = B ? B.params() : params(); const L = B ? B.layout(p) : layout(p); return { data: Sciana.data(p, L), suggest: Sciana.suggest(p, L), warnings: Sciana.warnings(p, L), items: Sciana.items, min: [Sciana.CORNER_MIN_CM, Sciana.OPENING_MIN_CM] }; })()',
    expectText: ['Obecny podział już omija narożniki i otwory.'],
  },
  {
    name: 'pamięć: ustawienia zapisane w przeglądarce (własne szerokości, materiał po nazwie, thru cut)',
    s: {
      fields: {
        wallW: '380',
        wallH: '255',
        count: '3',
        material: '100|texile-stick-gw-107',
        dpi: '200',
        order: 'Nie zapisywać',
      },
      radios: { split: 'custom', join: 'overlap' },
      checks: { thru: true },
      widths: ['100', '95', ''],
    },
    generate: false,
    probe: "JSON.parse(localStorage.getItem('fototapety.ustawienia.v3'))",
  },
  {
    name: 'kroki: materiał wymaga 4 brytów – przycisk „Ustaw 4 bryty”',
    s: {
      fields: {
        wallW: '500',
        wallH: '270',
        mL: '3',
        mR: '3',
        overlap: '6',
        count: '2',
        material: '131|mural-canvas-ct',
      },
      radios: { split: 'equal', join: 'overlap' },
      clicks: ['#needSet'],
    },
    generate: false,
    probe:
      "[document.activeElement && (document.activeElement.id || document.activeElement.className), [...document.querySelectorAll('.panel > .step')].map(s => s.className)]",
    expectText: ['potrzeba co najmniej 4 bryty'],
  },
  {
    name: 'kroki: zwijanie kroku kliknięciem, Enter na nagłówku, „Dalej” przenosi fokus do następnego kroku',
    s: {
      clicks: ['.panel > .step:nth-of-type(2) > .step-head', '.panel > .step:first-of-type > button.next'],
      keys: [{ selector: '.panel > .step:nth-of-type(4) > .step-head', key: 'Enter' }],
    },
    generate: false,
    probe:
      "[document.activeElement && (document.activeElement.id || document.activeElement.className), [...document.querySelectorAll('.panel > .step')].map(s => s.className)]",
  },
  {
    name: 'kroki: własne szerokości – pole szersze niż druk oznaczone, reszta w podpowiedzi',
    s: {
      fields: { wallW: '350', count: '3', material: '131|mural-canvas-ct' },
      radios: { split: 'custom' },
      widths: ['140', '100', ''],
      clicks: ['.panel > .step:nth-of-type(3) > button.next'],
    },
    generate: false,
    probe:
      "[document.activeElement && (document.activeElement.id || document.activeElement.className), [...document.querySelectorAll('.panel > .step')].map(s => s.className)]",
    expectText: ['class="over"', 'Do pokrycia: 356 cm'],
  },
  {
    name: 'lupa: otwarcie, dwa razy „+”, ramka kadru i łączenia brytów',
    s: {
      fields: { wallW: '350', wallH: '270', count: '3', material: '131|mural-canvas-ct' },
      radios: { split: 'equal', join: 'overlap' },
      clicks: ['#lupaBtn', '#lpIn', '#lpIn'],
    },
    generate: false,
    probe:
      '[document.activeElement && (document.activeElement.id || document.activeElement.className), document.body.style.overflow]',
    expectText: ['lp-seam', 'test.jpg · 6000 × 4000 px'],
  },
  {
    name: 'lupa: 100% pikseli, klawisz „−”, przeciągnięcie myszą, Tab zostaje w oknie',
    s: {
      clicks: ['#lp100'],
      keys: [
        { selector: '#lpView', key: '-' },
        { selector: '#lpClose', key: 'Tab' },
      ],
      drag: { selector: '#lpView', dx: -120, dy: 80 },
    },
    generate: false,
    probe:
      '[document.activeElement && (document.activeElement.id || document.activeElement.className), document.body.style.overflow]',
  },
  {
    name: 'lupa: Esc zamyka i oddaje fokus',
    s: { keys: [{ selector: '#lpView', key: 'Escape' }] },
    generate: false,
    probe:
      '[document.activeElement && (document.activeElement.id || document.activeElement.className), document.body.style.overflow]',
  },
  {
    name: 'lupa: błąd w ustawieniach – lupa bez ramki, z informacją',
    s: { fields: { count: '0' }, clicks: ['#lupaBtn', '#lpFit'] },
    generate: false,
    probe:
      '[document.activeElement && (document.activeElement.id || document.activeElement.className), document.body.style.overflow]',
    expectText: ['kadr pojawi się po poprawieniu ustawień'],
  },
  {
    name: 'lupa: zamknięcie przyciskiem, ustawienia z powrotem poprawne',
    s: { clicks: ['#lpClose'], fields: { count: '3' } },
    generate: false,
    probe:
      '[document.activeElement && (document.activeElement.id || document.activeElement.className), document.body.style.overflow]',
  },
  {
    name: 'wygląd: domyślna nazwa zlecenia idzie za wymiarem ściany; przyciski −/+ powiększenia kadru',
    s: {
      fields: { wallW: '410', wallH: '265', count: '4', material: '131|mural-canvas-ct' },
      radios: { split: 'equal' },
      clicks: ['#zoomIn', '#zoomIn', '#zoomOut'],
    },
    generate: false,
  },
  {
    name: 'wygląd: nazwa wpisana przez użytkownika zostaje po zmianie wymiaru; minimalne powiększenie wyłącza „−”',
    s: { type: { selector: '#order', text: 'Kowalski salon' }, clicks: ['#zoomOut', '#zoomOut'] },
    generate: false,
  },
  {
    name: 'wygląd: po wpisaniu nazwy zmiana ściany jej nie nadpisuje; upuszczenie pliku, który nie jest zdjęciem',
    s: {
      fields: { wallW: '420' },
      script: `const dt = new DataTransfer(); dt.items.add(new File(['abc'], 'notatka.txt', { type: 'text/plain' }));
        const drop = document.getElementById('drop');
        for (const t of ['dragenter', 'dragover']) drop.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
        drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));`,
    },
    generate: false,
    expectText: ['To nie jest plik JPG ani PNG.'],
  },
];

/** Stan formularza (wartości pól, zaznaczenia) – porównanie po ponownym otwarciu strony. */
const formState = (page: Page): Promise<unknown> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>('.panel input, .panel select')].map(e => [
      e.id || e.name,
      e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value,
    ]),
  );

const enabled = !!OLD_REPO;
let browser: Browser;
type Bridge = { Montaz: { setTrim(cm: number): void } };

/** Treść ostatnio wygenerowanego schematu (PDF bez kompresji, znaki jak w strumieniu strony). */
const assemblyText = (page: Page): Promise<string> =>
  page.evaluate(async () => {
    const a = document.querySelector<HTMLAnchorElement>('#montazMsg a')!;
    const buf = await (await fetch(a.href)).arrayBuffer();
    return new TextDecoder('latin1').decode(buf);
  });

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
      let trimmedText = '';
      for (const kind of ['old', 'new'] as const) {
        const { page } = side[kind];
        await applySettings(page, sc.s);
        await page.waitForTimeout(300);
        const result = sc.generate ? await generate(page) : null;
        const sample = sc.sample ? await generateSample(page) : null;
        // Schemat po docięciu na Zundzie to świadoma zmiana (Valare 27.11.2026): nowy program porównany ze starym
        // z docięciem 0, a domyślny schemat (0,5 cm) sprawdzony osobno – inny plik, wymiary po docięciu.
        if (sc.assembly && kind === 'new') await page.evaluate(() => (window as unknown as Bridge).Montaz.setTrim(0));
        const assembly = sc.assembly ? await generateAssembly(page) : null;
        const disabled = await page.evaluate(() =>
          [...document.querySelectorAll('input, select, button')]
            .filter(e => (e as HTMLInputElement).disabled)
            .map(e => e.id || (e as HTMLInputElement).name),
        );
        const material = await page.evaluate(() => {
          const M = (window as unknown as { Materialy?: { wybrany(): unknown } }).Materialy;
          return M ? M.wybrany() : 'brak window.Materialy';
        });
        const canvases = await canvasHashes(page);
        const probe = sc.probe ? await page.evaluate(sc.probe) : null;
        out[kind] = {
          text: await visibleText(page),
          html: await pageHtml(page),
          // Style i inne wstawki w <head> (np. CSS modułów) – różnica w wyglądzie, której nie widać w treści.
          head: await page.evaluate(() => document.head.innerHTML),
          // Wartości pól (atrybut value w HTML nie zmienia się po wpisaniu).
          form: await formState(page),
          disabled,
          material,
          canvases,
          result,
          sample,
          assembly,
          probe,
        };
        if (sc.assembly && kind === 'new') {
          await page.evaluate(() => (window as unknown as Bridge).Montaz.setTrim(0.5));
          const trimmed = await generateAssembly(page);
          expect(trimmed.files).toHaveLength(1);
          expect(trimmed.files[0]!.name).toBe(assembly!.files[0]!.name);
          expect(trimmed.files[0]!.sha256).not.toBe(assembly!.files[0]!.sha256);
          trimmedText = await assemblyText(page);
        }
      }
      expect(out.new).toEqual(staryPoZmianach(out.old));
      if (sc.assembly) expect(trimmedText).toMatch(/z naddatkiem [\d,]+ \\327 [\d,]+ cm/);
      for (const t of sc.assemblyText ?? []) expect(trimmedText).toContain(t);
      for (const t of sc.expectText ?? []) expect((out.new as { html: string }).html).toContain(t);
    });
  it('pamięć: po ponownym otwarciu strony wracają zapisane ustawienia (bez nazwy zlecenia)', async () => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const p2 = await side[kind].page.context().newPage();
      await p2.clock.setFixedTime(new Date(FIXED_NOW));
      p2.on('pageerror', e => side[kind].errors.push(e.message));
      await p2.goto(side[kind].server.url + '/');
      await p2.waitForTimeout(300);
      out[kind] = { form: await formState(p2), html: await pageHtml(p2) };
      await p2.close();
    }
    expect(out.new).toEqual(staryPoZmianach(out.old));
    expect(JSON.stringify(out.new)).toContain('texile-stick-gw-107');
  });
  it('pamięć: „Przywróć ustawienia domyślne” kasuje zapis i wraca do wartości z formularza', async () => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) {
      const { page } = side[kind];
      await page.evaluate(() => (document.getElementById('resetSettings') as HTMLButtonElement).click());
      await page.waitForTimeout(300);
      out[kind] = {
        form: await formState(page),
        html: await pageHtml(page),
        saved: await page.evaluate(() => localStorage.getItem('fototapety.ustawienia.v3')),
      };
    }
    expect(out.new).toEqual(staryPoZmianach(out.old));
    expect((out.new as { html: string }).html).toContain('Przywrócono ustawienia domyślne.');
  });
  it('brak błędów JavaScript po obu stronach', () => {
    expect(side.new.errors).toEqual(side.old.errors);
    expect(side.new.errors).toEqual([]);
  });
});

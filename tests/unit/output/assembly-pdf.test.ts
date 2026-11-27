import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import { MaterialCatalog } from '../../../src/domain/materials';
import { validate } from '../../../src/domain/validation';
import {
  assemblyModel,
  assemblyPdf,
  materialLabel,
  ZUND_TRIM,
  type AssemblyModel,
  type AssemblyWall,
} from '../../../src/output/assembly-pdf';
import type { PdfImage } from '../../../src/output/pdf-file';
import { concat, enc } from '../../support/bytes';
import { golden, toBase64 } from '../../support/golden';
import { P005 } from '../../support/params';

const NOW = new Date('2026-11-23T10:00:00+01:00');
const PANO: PdfImage<Uint8Array> = { data: enc('PANO-MONTAZ'), size: 11, w: 2400, h: 1800 };
const text = (parts: readonly Uint8Array[]): string => new TextDecoder('latin1').decode(concat(parts));
const optionText = (value: string): string | undefined =>
  new MaterialCatalog().options().find(o => o.value === value)?.text;
const build = (p: WallParams, material = '', wall?: AssemblyWall, logo?: null, trim?: number) =>
  assemblyPdf(p, computeLayout(p), { material, wall, pano: PANO, now: NOW, logo, trim });
const NO_CUT = { l: 0, r: 0, t: 0, b: 0 };

describe('schemat montażu: dane', () => {
  it('nazwa materiału z tekstu opcji; brak wyboru i „inny materiał” = bez nazwy', () => {
    expect(materialLabel('131|mural-canvas-ct', 'Mural Canvas CT – druk 131 cm')).toBe('Mural Canvas CT');
    expect(materialLabel('own', 'Inny materiał (wpisz maks. szerokość)')).toBe('');
    expect(materialLabel('', '– nie wybrano –')).toBe('');
    expect(materialLabel('131|x', undefined)).toBe('');
  });
  it('bryty z dokładnych szerokości: początek, szerokość i zakres na ścianie (bez naddatku)', () => {
    const M = assemblyModel(P005, computeLayout(P005), '', undefined, 0);
    expect(M.n).toBe(3);
    expect(M.bryty[0]).toMatchObject({ nr: 1, a: 0, from: 0 });
    expect(M.bryty.at(-1)!.to).toBe(P005.wallW);
    expect([M.material, M.corners, M.openings]).toEqual(['', [], []]);
  });
});

describe('schemat montażu po docięciu na Zundzie (Valare 27.11.2026)', () => {
  // Każdy bryt docinany po 0,5 cm z każdej strony: zakład 6 → 5 cm, styk 1 cm → bez wspólnej grafiki,
  // bryt o 1 cm węższy i niższy, naddatek 3 → 2,5 cm. Plik produkcyjny bez zmian.
  const L = computeLayout(P005);
  it('domyślnie docięcie 0,5 cm', () => {
    expect(ZUND_TRIM).toBe(0.5);
    expect(assemblyModel(P005, L)).toEqual(assemblyModel(P005, L, '', undefined, 0.5));
  });
  it('zakład 6 cm → 5 cm, bryty o 1 cm węższe, zakres na ścianie z docięciem', () => {
    const before = assemblyModel(P005, L, '', undefined, 0);
    const M = assemblyModel(P005, L);
    expect(M.ov).toBe(5);
    expect(M.cut).toEqual({ l: 0.5, r: 0.5, t: 0.5, b: 0.5 });
    M.bryty.forEach((b, i) => {
      const o = before.bryty[i]!;
      expect(b.w).toBeCloseTo(o.w - 1, 9);
      expect(b.a).toBeCloseTo(o.a + 0.5, 9);
    });
    expect(M.bryty[0]!.from).toBe(0);
    expect(M.bryty.at(-1)!.to).toBe(P005.wallW);
    // sąsiednie bryty po docięciu zachodzą na siebie dokładnie o zakład
    expect(M.bryty[0]!.a + M.bryty[0]!.w - M.bryty[1]!.a).toBeCloseTo(5, 9);
  });
  it('styk 1 cm → bryty stykają się krawędziami, bez wspólnej grafiki', () => {
    const p = { ...P005, join: 'butt' as const, overlap: 1 };
    const M = assemblyModel(p, computeLayout(p));
    expect(M.ov).toBe(0);
    expect(M.bryty[0]!.a + M.bryty[0]!.w).toBeCloseTo(M.bryty[1]!.a, 9);
    const t = text(build(p).parts);
    expect(t).toContain('(\\203\\200czenie na styk) Tj');
    expect(t).not.toContain('wsp\\363lnej grafiki');
  });
  it('nagłówek, legenda i tabela z wymiarami po docięciu: zakład 5 cm, całość i wysokość o 1 cm mniejsze', () => {
    const t = text(build(P005).parts);
    const t0 = text(build(P005, '', undefined, undefined, 0).parts);
    expect(t0).toContain('z naddatkiem 356 \\327 276 cm');
    expect(t).toContain('z naddatkiem 355 \\327 275 cm');
    expect(t).toContain('zak\\203ad 5 cm');
    expect(t).not.toContain('zak\\203ad 6 cm');
    expect(t).toContain('(275) Tj');
    expect(t).not.toContain('(276) Tj');
  });
  it('grafika przycięta do obrysu po docięciu (ścieżka przycinania), bez docięcia bez przycinania', () => {
    expect(text(build(P005).parts)).toMatch(/re W n q [\d. ]+ cm \/Pano Do Q Q/);
    expect(text(build(P005, '', undefined, undefined, 0).parts)).not.toContain(' W n ');
  });
  it('naddatek mniejszy niż 0,5 cm: docięcie najwyżej do krawędzi ściany', () => {
    const p = { ...P005, mL: 0, mR: 0.3 };
    const M = assemblyModel(p, computeLayout(p));
    expect(M.cut).toEqual({ l: 0, r: 0.3, t: 0.5, b: 0.5 });
    expect(M.bryty[0]!.from).toBe(0);
    expect(M.bryty.at(-1)!.to).toBe(p.wallW);
  });
  it('jeden bryt: docięcie tylko na krawędziach zewnętrznych', () => {
    const p = { ...P005, count: 1, wallW: 100 };
    const M = assemblyModel(p, computeLayout(p));
    expect(M.bryty[0]!.w).toBeCloseTo(105, 9);
  });
});

describe('schemat montażu: PDF', () => {
  it('A4 poziomo, jedna strona, logo jako wektor, data w stopce, nazwa pliku z nazwy zlecenia', () => {
    const r = build({ ...P005, order: 'Zlecenie_1', orderName: 'Zlecenie 1' });
    const t = text(r.parts);
    expect([r.name, r.pages]).toEqual(['schemat-montazu_Zlecenie_1.pdf', 1]);
    expect(t).toContain('/MediaBox [0 0 841.890 595.276]');
    expect(t).toContain('23.11.2026');
    expect(t).toMatch(/1 1 1 rg [\d. ml]+ h /); // biały ukośnik w literze V
    expect(t).toContain('/Pano 5 0 R');
  });
  it('bez logo: napis VALARE', () => {
    const t = text(build(P005, '', undefined, null).parts);
    expect(t).toContain('(VALARE) Tj');
  });
  it('narożnik i otwory: przerywana pomarańczowa linia, obrys otworu, pozycje w legendzie', () => {
    const wall: AssemblyWall = {
      corners: [{ label: 'Narożnik A', x: 100 }],
      openings: [
        { label: 'Drzwi 1', type: 'door', x: 20, w: 80, y: 0, h: null },
        { label: 'Okno 1', type: 'window', x: 200, w: 60, y: 90, h: 120 },
      ],
    };
    const t = text(build(P005, 'Canvas NW', wall).parts);
    expect(t).toContain('(naro\\207nik a) Tj');
    expect(t).toContain('0.961 0.62 0.043 RG');
    expect(t).toContain('(drzwi 1) Tj');
    expect(t).toContain('(okno 1) Tj');
    expect(t).toContain('/GSopen gs');
    expect(t).toContain('(drzwi / okno \\226 wytnij na miejscu) Tj');
    expect(t).toContain('materia\\203: Canvas NW');
  });
  it('jeden bryt bez zakładu i łączenie na styk bez wspólnej grafiki: linia łączenia', () => {
    const one = text(build({ ...P005, count: 1, wallW: 100 }).parts);
    expect(one).toContain('1 bryt');
    const butt = text(build({ ...P005, overlap: 0 }).parts);
    expect(butt).toContain('(\\203\\200czenie na styk) Tj');
  });
});

type Out = { name: string; pages: number; pdf: string; p: WallParams; model: AssemblyModel };
type Case = { material: string; out: Out | { errs: string[] } };
describe('zgodność ze starym programem', () => {
  const cases = golden<Case[]>('assembly-pdf');
  it('6 nagranych przypadków bez docięcia (4 pliki PDF bajt w bajt, 2 odrzucone przez walidację)', () => {
    expect(cases).toHaveLength(6);
    let pdfs = 0;
    for (const c of cases) {
      if ('errs' in c.out) continue;
      const { p } = c.out;
      expect(validate(p)).toEqual([]);
      const L = computeLayout(p);
      const material = materialLabel(c.material, optionText(c.material));
      // stary program: bez docięcia na Zundzie (trim 0) – reszta schematu bajt w bajt
      expect(assemblyModel(p, L, material, undefined, 0)).toEqual({ ...c.out.model, cut: NO_CUT });
      const r = assemblyPdf(p, L, { material, pano: PANO, now: NOW, trim: 0 });
      expect([r.name, r.pages]).toEqual([c.out.name, c.out.pages]);
      expect(toBase64(concat(r.parts)), p.orderName).toBe(c.out.pdf);
      pdfs++;
    }
    expect(pdfs).toBe(4);
  });
});

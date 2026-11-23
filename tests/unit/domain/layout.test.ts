import { describe, expect, it } from 'vitest';
import { pxCeil } from '../../../src/domain/units';
import { computeLayout, fitImage, type WallParams } from '../../../src/domain/layout';
import { asJson, golden } from '../../support/golden';

import { P005 } from '../../support/params';

describe('podział na bryty', () => {
  it('005-21: trzy bryty 7245 × 16300 px, zakład 354 px', () => {
    const L = computeLayout(P005);
    expect(L.bWs).toEqual([7245, 7245, 7245]);
    expect(L.bH).toBe(16300);
    expect(L.ov).toBe(354);
    expect(L.panoW).toBeGreaterThanOrEqual(pxCeil(356, 150));
  });
  it('na styk: 1 cm wspólnej grafiki = 59 px przy 150 DPI', () => {
    expect(computeLayout({ ...P005, join: 'butt', overlap: 1 }).ov).toBe(59);
  });
  it('własne szerokości z pustym ostatnim polem: ostatni bryt dopełnia resztę', () => {
    const L = computeLayout({ ...P005, split: 'custom', widths: [100, 120, NaN] });
    expect(L.bw.added).toBe(true);
    expect(L.bw.widths[2]).toBeCloseTo(356 - (100 + 120 - 6) + 6, 9);
  });
  it('pasek thru cut zabiera 0,5 cm z góry i z dołu pola zdjęcia', () => {
    const L = computeLayout({ ...P005, thru: true });
    expect(L.band).toBe(30);
    expect(L.imgH).toBe(16300 - 60);
  });
  it('kadr wypełnia całe pole zdjęcia i przesuwa wycinek wg położenia', () => {
    const L = computeLayout(P005);
    const F = fitImage(L, 9000, 6000, { zoom: 1, fx: 0.5, fy: 0.5 });
    expect(9000 * F.s).toBeGreaterThanOrEqual(L.panoW - 1e-6);
    expect(6000 * F.s).toBeGreaterThanOrEqual(L.imgH - 1e-6);
    expect(F.cx).toBeCloseTo(F.exW / 2, 9);
  });
});

type LayoutCase = { p: WallParams; errs: string[]; L?: Record<string, unknown> };
type FitCase = { p: WallParams; iw: number; ih: number; zoom: number; fx: number; fy: number; out: unknown };

describe('zgodność ze starym programem', () => {
  it('geometria identyczna dla wszystkich nagranych ustawień', () => {
    const cases = golden<LayoutCase[]>('layout');
    expect(cases.length).toBeGreaterThan(4000);
    for (const c of cases) if (c.L) expect(asJson(computeLayout(c.p)), JSON.stringify(c.p)).toEqual(c.L);
  });
  it('kadr (fit) identyczny', () => {
    for (const c of golden<FitCase[]>('fit')) {
      expect(fitImage(computeLayout(c.p), c.iw, c.ih, { zoom: c.zoom, fx: c.fx, fy: c.fy })).toEqual(c.out);
    }
  });
});

// Porównanie v2 ze złotym wzorcem recenzenta (oryginalne funkcje starego programu, 837 przypadków podziału).
// Kolejne części (walidacja, wycena, terminy, jakość) dochodzą w PR-ach tych modułów.
import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/domain/layout';
import { addWorkdays, areaM2, calcPrice, type PriceInput } from '../../src/domain/pricing';
import { QualityAssessor } from '../../src/domain/quality';
import { layoutWarnings, validate } from '../../src/domain/validation';
import { reviewerGolden, withDefaults } from '../support/reviewer';

const G = reviewerGolden();
const valid = G.bryty.filter(c => c.layout !== null);

describe('złoty wzorzec recenzenta: podział na bryty', () => {
  it('zawiera oczekiwaną liczbę przypadków', () => {
    expect(G.bryty).toHaveLength(837);
    expect(valid).toHaveLength(488);
  });

  it.each(valid.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const L = computeLayout(withDefaults(c.p));
    const exp = c.layout!;
    expect({
      totalWcm: L.totalWcm,
      totalHcm: L.totalHcm,
      widthsCm: L.bw.widths,
      bWs: L.bWs,
      xs: L.xs,
      bH: L.bH,
      band: L.band,
      ov: L.ov,
      panoW: L.panoW,
      imgH: L.imgH,
    }).toEqual({
      totalWcm: exp.totalWcm,
      totalHcm: exp.totalHcm,
      widthsCm: exp.widthsCm,
      bWs: exp.bWs,
      xs: exp.xs,
      bH: exp.bH,
      band: exp.band,
      ov: exp.ov,
      panoW: exp.panoW,
      imgH: exp.imgH,
    });
  });
});

describe('złoty wzorzec recenzenta: błędy i ostrzeżenia', () => {
  it.each(G.bryty.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const p = withDefaults(c.p);
    expect(validate(p)).toEqual(c.errors);
    if (c.layout) expect(layoutWarnings(p, computeLayout(p))).toEqual(c.warnings);
  });
});

describe('złoty wzorzec recenzenta: powierzchnie, wyceny, terminy', () => {
  it('powierzchnie do wyceny dla 488 podziałów', () => {
    for (const c of valid) {
      const p = withDefaults(c.p);
      const L = computeLayout(p);
      expect(
        { margin: areaM2(p, L, 'margin'), print: areaM2(p, L, 'print'), wall: areaM2(p, L, 'wall') },
        c.name,
      ).toEqual(c.layout!.area);
    }
  });
  it('1140 wycen', () => {
    expect(G.wycena).toHaveLength(1140);
    for (const w of G.wycena) expect(calcPrice(w.in as unknown as PriceInput), JSON.stringify(w.in)).toEqual(w.out);
  });
  it('24 terminy w dniach roboczych', () => {
    expect(G.terminy).toHaveLength(24);
    const pad = (n: number) => String(n).padStart(2, '0');
    for (const t of G.terminy) {
      const r = addWorkdays(new Date(`${t.od}T12:00:00`), t.dni);
      expect(`${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}`, `${t.od}+${t.dni}`).toBe(t.wynik);
    }
  });
});

describe('złoty wzorzec recenzenta: jakość zdjęcia', () => {
  it('21 ocen', () => {
    expect(G.jakosc).toHaveLength(21);
    for (const j of G.jakosc) expect(new QualityAssessor().assess(j.pxPerM, j.zoom), JSON.stringify(j)).toEqual(j.out);
  });
});

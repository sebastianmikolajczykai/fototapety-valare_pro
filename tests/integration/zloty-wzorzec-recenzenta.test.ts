// Porównanie v2 ze złotym wzorcem recenzenta (oryginalne funkcje starego programu, 837 przypadków podziału).
// Kolejne części (walidacja, wycena, terminy, jakość) dochodzą w PR-ach tych modułów.
import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/domain/layout';
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

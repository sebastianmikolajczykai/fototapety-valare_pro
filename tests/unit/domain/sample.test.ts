import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import {
  SAMPLE_PRICE_ZL,
  sampleDoneMessage,
  sampleFileName,
  sampleGeom,
  sampleInfo,
  samplePositionCm,
  type SamplePos,
} from '../../../src/domain/sample';
import { golden } from '../../support/golden';
import { P005 } from '../../support/params';

const mid: SamplePos = { fx: 0.5, fy: 0.5 };

describe('próbka 40×60 cm (cennik 2024: 89 zł)', () => {
  it('005-21, pionowo, środek ściany: 2363 × 3544 px przy 150 DPI', () => {
    const G = sampleGeom(P005, computeLayout(P005), true, mid);
    expect([G.w, G.h, G.wcm, G.hcm, G.x, G.y, G.fitsW, G.fitsH]).toEqual([2363, 3544, 40, 60, 9332, 6378, true, true]);
  });
  it('poziomo 60×40 i pasek thru cut wewnątrz próbki', () => {
    const p: WallParams = { ...P005, thru: true };
    const G = sampleGeom(p, computeLayout(p), false, { fx: 0, fy: 0 });
    expect([G.wcm, G.hcm, G.band, G.ih]).toEqual([60, 40, 30, 2363 - 60]);
  });
  it('ściana węższa niż próbka: próbka na środku, ostrzeżenie w opisie', () => {
    const p: WallParams = { ...P005, wallW: 30, count: 1 };
    const G = sampleGeom(p, computeLayout(p), true, mid);
    expect(G.fitsW).toBe(false);
    expect(sampleInfo(p, G)).toBe(
      'Plik: 2363 × 3544 px, 150 DPI (40 × 60 cm). <span class="warn">Ściana jest węższa niż próbka – próbka obejmie też naddatek lub puste pole.</span>',
    );
  });
  it('opis, nazwa pliku, położenie i komunikat po wygenerowaniu', () => {
    const G = sampleGeom(P005, computeLayout(P005), true, mid);
    expect(sampleInfo(P005, G)).toBe('Plik: 2363 × 3544 px, 150 DPI (40 × 60 cm).');
    expect(sampleFileName('Kowalski', G)).toBe('probka_Kowalski_40x60.jpg');
    expect(samplePositionCm(P005, G)).toEqual({ left: 155, top: 105 });
    expect(sampleDoneMessage(P005, G)).toBe(
      '<span class="ok">Gotowe: próbka 40 × 60 cm, 2363 × 3544 px, 150 DPI, grafika od lewej 155 cm, od góry 105 cm ściany. Cena wg cennika: 89 zł.</span>',
    );
    expect(SAMPLE_PRICE_ZL).toBe(89);
  });
});

type Case = { p: WallParams; vertical: boolean; fx: number; fy: number; out: unknown };
describe('zgodność ze starym programem', () => {
  it('48 nagranych położeń próbki', () => {
    const all = golden<Case[]>('sample');
    expect(all).toHaveLength(48);
    for (const c of all)
      expect(sampleGeom(c.p, computeLayout(c.p), c.vertical, { fx: c.fx, fy: c.fy }), JSON.stringify(c)).toEqual(c.out);
  });
});

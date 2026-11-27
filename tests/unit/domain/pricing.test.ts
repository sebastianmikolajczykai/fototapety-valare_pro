import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import {
  addWorkdays,
  areaM2,
  BUTT_PER_M,
  calcPrice,
  isHoliday,
  materialNameFromOption,
  PRICE_LIST,
  PRICING_TERMS,
  type AreaMode,
  type PriceInput,
  type PriceResult,
} from '../../../src/domain/pricing';
import { golden } from '../../support/golden';
import { expectPriceLikeOld, SAND_DOT_BRUTTO } from '../../support/zmiany';
import { P005 } from '../../support/params';

const ymd = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const day = (s: string): Date => new Date(`${s}T12:00:00`);
const priced = (r: PriceResult) => {
  if (r.price === null) throw new Error('oczekiwano ceny');
  return r;
};

describe('wycena (cennik 2024/1)', () => {
  it('005-21 na zakładkę, Mural Canvas CT, standard: 9,83 m² × 279 zł', () => {
    const L = computeLayout(P005);
    const area = areaM2(P005, L, 'margin');
    expect(area).toBeCloseTo(9.8256, 10);
    const R = priced(
      calcPrice({
        material: 'Mural Canvas CT',
        area,
        joints: 2,
        heightCm: 276,
        butt: false,
        termin: 'standard',
        order: false,
      }),
    );
    expect(R.brutto).toEqual({ druk: 2742.57, styk: 0, doplata: 0, razem: 2742.57 });
    expect(R.netto.razem).toBe(2229.74);
  });
  it('na styk: mb = łączenia × wysokość, 20 zł/mb brutto; ekspres +30% od całości', () => {
    const R = priced(
      calcPrice({
        material: 'Canvas NW',
        area: 10,
        joints: 2,
        heightCm: 276,
        butt: true,
        termin: 'express',
        order: false,
      }),
    );
    expect(R.mb).toBe(5.52);
    expect(R.brutto).toEqual({ druk: 2490, styk: 110.4, doplata: 780.12, razem: 3380.52 });
    expect(R.termin).toEqual({ name: 'Ekspres', days: 3, extra: 0.3 });
  });
  it('materiał na zamówienie: 21 dni, bez dopłaty niezależnie od wybranego terminu', () => {
    const R = calcPrice({
      material: 'Diamante CT',
      area: 1,
      joints: 0,
      heightCm: 100,
      butt: false,
      termin: 'fast',
      order: true,
    });
    expect(R.termin).toEqual({ name: 'Na zamówienie', days: 21, extra: 0 });
  });
  it('materiał spoza cennika: bez ceny', () => {
    expect(
      calcPrice({ material: null, area: 5, joints: 1, heightCm: 1, butt: false, termin: 'zly', order: false }),
    ).toEqual({
      termin: PRICING_TERMS.standard,
      price: null,
    });
  });
  it('powierzchnia: ściana, z naddatkiem, bryty z zakładem', () => {
    const L = computeLayout(P005);
    const r = (m: AreaMode) => areaM2(P005, L, m);
    expect([r('wall'), r('margin'), r('print')].map(x => Math.round(x * 1e4) / 1e4)).toEqual([9.45, 9.8256, 10.1568]);
  });
  it('nazwa materiału z tekstu opcji („Sand Dot GW 137 – druk 131 cm” → „Sand Dot GW”)', () => {
    expect(materialNameFromOption('131|sand-dot-gw-137', 'Sand Dot GW 137 – druk 131 cm')).toBe('Sand Dot GW');
    expect(materialNameFromOption('own', 'Inny materiał (wpisz maks. szerokość)')).toBeNull();
    expect(materialNameFromOption('', '–')).toBeNull();
  });
  it('cennik zgodny z katalogiem materiałów; styk 20 / 16,26 zł', () => {
    expect(Object.keys(PRICE_LIST)).toHaveLength(18);
    expect(PRICE_LIST['Sand Dot GW']).toEqual([279, 226.83]);
    expect(BUTT_PER_M).toEqual([20, 16.26]);
  });
});

describe('dni robocze (bez weekendów i świąt w Polsce)', () => {
  it('pomija Boże Narodzenie, Wigilię (od 2025), Nowy Rok i Trzech Króli', () => {
    expect(ymd(addWorkdays(day('2026-12-23'), 3))).toBe('2026-12-30');
    expect(ymd(addWorkdays(day('2026-12-31'), 1))).toBe('2027-1-4');
    expect(ymd(addWorkdays(day('2027-01-05'), 1))).toBe('2027-1-7');
  });
  it('święta ruchome: Poniedziałek Wielkanocny i Boże Ciało 2027', () => {
    expect(isHoliday(day('2027-03-29'))).toBe(true);
    expect(isHoliday(day('2027-05-27'))).toBe(true);
    expect(isHoliday(day('2027-05-26'))).toBe(false);
  });
  it('Wigilia jest dniem wolnym dopiero od 2025', () => {
    expect(isHoliday(day('2024-12-24'))).toBe(false);
    expect(isHoliday(day('2025-12-24'))).toBe(true);
  });
});

type CalcCase = { inp: PriceInput; out: unknown };
type G = {
  cennik: Record<string, [number, number]>;
  stykMb: [number, number];
  terminy: unknown;
  calc: CalcCase[];
  area: { p: WallParams; mode: AreaMode; out: number }[];
  workdays: { d: string; n: number; out: string }[];
};
describe('zgodność ze starym programem', () => {
  const G = golden<G>('pricing');
  it('cennik, styk i terminy', () => {
    expect(PRICE_LIST).toEqual({ ...G.cennik, 'Sand Dot GW': [SAND_DOT_BRUTTO, G.cennik['Sand Dot GW']![1]] });
    expect(BUTT_PER_M).toEqual(G.stykMb);
    expect(PRICING_TERMS).toEqual(G.terminy);
  });
  it('400 nagranych wycen (Sand Dot GW: netto jak w starym, brutto z ceny 279 zł)', () => {
    for (const c of G.calc) expectPriceLikeOld(c.inp, calcPrice(c.inp), c.out);
  });
  it('powierzchnie', () => {
    for (const c of G.area) expect(areaM2(c.p, computeLayout(c.p), c.mode)).toBe(c.out);
  });
  it('terminy w dniach roboczych', () => {
    for (const c of G.workdays) expect(ymd(addWorkdays(day(c.d), c.n)), `${c.d}+${c.n}`).toBe(c.out);
  });
});

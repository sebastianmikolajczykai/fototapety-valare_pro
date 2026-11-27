// Świadome zmiany względem starego programu (fototapety-valare @ 6933982), potwierdzone przez Valare/ARPI.
// Wzorce nagrane ze starego programu zostają bez zmian; testy nakładają na nie tylko te poprawki.
import { expect } from 'vitest';
import { r2, type PriceInput, type PriceResult } from '../../src/domain/pricing';

/** Valare 27.11.2026: Sand Dot GW kosztuje 279 zł brutto za m² (w cenniku 2024/1 było 279,05 – literówka). */
export const SAND_DOT_BRUTTO = 279;
export const SAND_DOT_STARE = 279.05;

/** Lista materiałów ze starego programu z poprawioną ceną Sand Dot GW. */
export function materialyPoZmianach<T extends Record<string, unknown>>(lista: readonly T[]): T[] {
  return lista.map(m => (m.cenaBruttoM2 === SAND_DOT_STARE ? { ...m, cenaBruttoM2: SAND_DOT_BRUTTO } : m));
}

/**
 * Wycena nowego programu wobec wyceny nagranej w starym: identyczna, a dla Sand Dot GW netto i termin jak w starym,
 * brutto przeliczone z ceny 279 zł (te same zasady zaokrąglania).
 */
export function expectPriceLikeOld(inp: PriceInput, now: PriceResult, old: unknown): void {
  const label = JSON.stringify(inp);
  if (inp.material !== 'Sand Dot GW' || (old as PriceResult).price === null) {
    expect(now, label).toEqual(old);
    return;
  }
  const o = old as Extract<PriceResult, { mb: number }>;
  expect(o.price, label).toEqual([SAND_DOT_STARE, 226.83]);
  expect(now, label).toMatchObject({ termin: o.termin, mb: o.mb, netto: o.netto, price: [SAND_DOT_BRUTTO, 226.83] });
  const b = (now as typeof o).brutto;
  expect(b.druk, label).toBe(r2(r2(inp.area) * SAND_DOT_BRUTTO));
  expect(b.styk, label).toBe(o.brutto.styk);
  expect(b.doplata, label).toBe(r2((b.druk + b.styk) * o.termin.extra));
  expect(b.razem, label).toBe(r2(b.druk + b.styk + b.doplata));
}

/** Wynik strony starego programu (tekst, HTML, wartości) z nałożonymi świadomymi zmianami: cena Sand Dot GW. */
export function staryPoZmianach<T>(v: T): T {
  if (v === SAND_DOT_STARE) return SAND_DOT_BRUTTO as T;
  if (typeof v === 'string') return v.replace(/279,05/g, '279,00') as T;
  if (Array.isArray(v)) return v.map(staryPoZmianach) as T;
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, staryPoZmianach(x)])) as T;
  return v;
}

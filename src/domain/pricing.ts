// Wycena i termin realizacji – odpowiednik czystej części starego wycena.js.
// Źródło cen i terminów: CENNIK_VALARE.pdf, edycja 2024/1, ważny od 15.05.2024 (CONFIRMED wg cennika):
//   ceny za 1 m² brutto/netto; „na zakładkę” w cenie; „na styk” 20,00 zł/mb brutto (16,26 netto);
//   standard 10 dni rob., przyspieszony 7 (+15%), ekspres 3 (+30%); na zamówienie 21 dni rob.
// DO WALIDACJI (ARPI): jaką powierzchnię liczyć, długość mb styku (łączenia × wysokość brytu), czy dopłata
//   za termin obejmuje styk (tu: tak), zasada zaokrąglania (tu: ilości do 0,01).
// Sand Dot GW 279 zł brutto/m² – CONFIRMED przez Valare 27.11.2026 (w cenniku literówka 279,05).
import type { Layout, WallParams } from './layout';
import { MaterialCatalog, TERMS } from './materials';

export type AreaMode = 'margin' | 'print' | 'wall';
export type TermKey = 'standard' | 'fast' | 'express';

export interface Term {
  name: string;
  days: number;
  extra: number;
}

/** Dane do wyceny. area w m², heightCm = wysokość brytu z naddatkami, termin = klucz z PRICING_TERMS. */
export interface PriceInput {
  material: string | null;
  area: number;
  joints: number;
  heightCm: number;
  butt: boolean;
  termin: string;
  order: boolean;
}

export interface PriceLines {
  druk: number;
  styk: number;
  doplata: number;
  razem: number;
}

/** Wynik wyceny. Bez ceny (materiał spoza cennika) – tylko termin. */
export type PriceResult =
  | { termin: Term; price: null }
  | { termin: Term; price: [number, number]; mb: number; brutto: PriceLines; netto: PriceLines };

/** [brutto, netto] zł za 1 m² według nazwy produktu (z katalogu materiałów – jedno źródło cen). */
export const PRICE_LIST: Readonly<Record<string, [number, number]>> = Object.fromEntries(
  new MaterialCatalog().list.map(m => [m.nazwa.replace(/ \d+$/, ''), [m.cenaBruttoM2, m.cenaNettoM2]]),
);

/** Przygotowanie „na styk”: [brutto, netto] zł za 1 mb. */
export const BUTT_PER_M: readonly [number, number] = [20.0, 16.26];

export const PRICING_TERMS: Readonly<Record<TermKey, Term>> = {
  standard: { name: 'Standard', days: TERMS.standard.dni, extra: TERMS.standard.doplata },
  fast: { name: 'Przyspieszony', days: TERMS.przyspieszony.dni, extra: TERMS.przyspieszony.doplata },
  express: { name: 'Ekspres', days: TERMS.ekspres.dni, extra: TERMS.ekspres.doplata },
};

const ORDER_TERM: Term = { name: 'Na zamówienie', days: TERMS.naZamowienie.dni, extra: 0 };

export const r2 = (x: number): number => Math.round(x * 100) / 100;

const isTermKey = (k: string): k is TermKey => Object.hasOwn(PRICING_TERMS, k);

/**
 * Cena liczona z tych samych zaokrąglonych ilości, które widzi klient (0,01 m² i 0,01 mb) –
 * „9,83 m² × 279 zł” daje dokładnie pokazaną kwotę.
 */
export function calcPrice(inp: PriceInput): PriceResult {
  const termin = inp.order ? ORDER_TERM : isTermKey(inp.termin) ? PRICING_TERMS[inp.termin] : PRICING_TERMS.standard;
  const price = inp.material !== null && Object.hasOwn(PRICE_LIST, inp.material) ? PRICE_LIST[inp.material]! : null;
  if (!price) return { termin, price: null };
  const mb = r2(inp.butt ? (inp.joints * inp.heightCm) / 100 : 0);
  const area = r2(inp.area);
  const line = (k: 0 | 1): PriceLines => {
    const druk = r2(area * price[k]);
    const styk = r2(mb * BUTT_PER_M[k]);
    const doplata = r2((druk + styk) * termin.extra);
    return { druk, styk, doplata, razem: r2(druk + styk + doplata) };
  };
  return { termin, price, mb, brutto: line(0), netto: line(1) };
}

/** Powierzchnia do wyceny [m²]: sama ściana, ściana z naddatkiem albo bryty do druku (z zakładem). */
export function areaM2(p: WallParams, L: Layout, mode: AreaMode): number {
  if (mode === 'wall') return (p.wallW * p.wallH) / 1e4;
  if (mode === 'print') return (L.bw.widths.reduce((a, w) => a + w, 0) * L.totalHcm) / 1e4;
  return (L.totalWcm * L.totalHcm) / 1e4;
}

/** Nazwa produktu z opcji listy materiałów („Sand Dot GW 137 – druk 131 cm” → „Sand Dot GW”). */
export function materialNameFromOption(value: string, text: string): string | null {
  if (value === '' || value === 'own') return null;
  return text.split(' – ')[0]!.replace(/ \d+$/, '').trim();
}

/** Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera). */
function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const FIXED_HOLIDAYS = ['1-1', '1-6', '5-1', '5-3', '8-15', '11-1', '11-11', '12-25', '12-26'];

/** Święto ustawowe w Polsce (Wigilia wolna od 2025; ruchome: Poniedziałek Wielkanocny, Boże Ciało). */
export function isHoliday(d: Date): boolean {
  const md = `${d.getMonth() + 1}-${d.getDate()}`;
  if (FIXED_HOLIDAYS.includes(md) || (d.getFullYear() >= 2025 && md === '12-24')) return true;
  const e = easter(d.getFullYear());
  return [1, 60].some(off => {
    const x = new Date(e);
    x.setDate(e.getDate() + off);
    return x.toDateString() === d.toDateString();
  });
}

/** Data po n dniach roboczych (bez sobót, niedziel i świąt), licząc od dnia po `from`. */
export function addWorkdays(from: Date, n: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(d)) left--;
  }
  return d;
}

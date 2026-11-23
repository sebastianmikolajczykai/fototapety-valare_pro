// Walidacja ustawień i ostrzeżenia – dokładny odpowiednik validate/warnings ze starego bryty.js.
// Błędy blokują generowanie plików; ostrzeżenia nie (ustalenie: wąski pasek to odpowiedzialność klienta).
import {
  BROWSER_MAX_AREA_PX,
  BROWSER_MAX_SIDE_PX,
  DPI_OPTIONS,
  MAX_BRYTY,
  MAX_MARGIN_CM,
  MIN_DPI,
  MIN_LAST_CM,
  THRU_CM,
} from './constants';
import { f1, plural } from './format';
import { computeLayout, type Layout, type WallParams } from './layout';
import { cmToPx, pxCeil } from './units';

const MARGINS = [
  ['mT', 'górze'],
  ['mB', 'dole'],
  ['mL', 'lewej'],
  ['mR', 'prawej'],
] as const;

/** Błędy danych wejściowych (bez liczenia podziału). */
function inputErrors(p: WallParams): string[] {
  const e: string[] = [];
  if (!(p.wallW > 0) || !(p.wallH > 0)) e.push('Podaj wymiary ściany większe od zera.');
  for (const [k, name] of MARGINS) {
    const m = p[k];
    if (!(Number.isInteger(m * 2) && m >= 0 && m <= MAX_MARGIN_CM))
      e.push(`Naddatek na ${name} musi wynosić 0–${MAX_MARGIN_CM} cm, co 0,5 cm.`);
  }
  if (!(p.overlap >= 0)) e.push('Zakład nie może być ujemny.');
  if (!(p.maxPrint > 0)) e.push('Wpisz maksymalną szerokość druku materiału (większą od zera).');
  if (!(p.dpi >= MIN_DPI)) e.push(`Rozdzielczość musi wynosić co najmniej ${MIN_DPI} DPI.`);
  if (!(p.count >= 1 && p.count <= MAX_BRYTY)) e.push(`Liczba brytów musi wynosić od 1 do ${MAX_BRYTY}.`);
  if (
    p.thru &&
    p.wallH > 0 &&
    p.dpi > 0 &&
    pxCeil(p.wallH + p.mT + p.mB, p.dpi) <= 2 * Math.round(cmToPx(THRU_CM, p.dpi))
  )
    e.push(`Przy pasku thru cut wysokość z naddatkami musi być większa niż ${f1(2 * THRU_CM)} cm.`);
  if (p.split === 'custom' && p.widths.some((w, i) => !(w > 0) && !(i === p.widths.length - 1 && Number.isNaN(w))))
    e.push('Wpisz szerokość każdego brytu (większą od zera). Puste może zostać tylko ostatnie pole.');
  return e;
}

/** Błędy podziału: szerokość materiału, pokrycie ściany, zakład. */
function layoutErrors(p: WallParams, L: Layout): string[] {
  const e: string[] = [];
  const widths = L.bw.widths;
  const widest = Math.max(...widths);
  if (widest > p.maxPrint + 1e-6) {
    const need = Math.ceil((L.totalWcm - p.overlap) / (p.maxPrint - p.overlap));
    e.push(
      `Bryt ma ${f1(widest)} cm, a materiał drukuje maks. ${f1(p.maxPrint)} cm (naddatki i zakład wliczone).` +
        (p.split === 'equal' && p.maxPrint > p.overlap
          ? ` Potrzeba co najmniej ${need} ${plural(need)}.`
          : ' Zwiększ liczbę brytów albo zmniejsz ich szerokości.'),
    );
  }
  const last = widths[widths.length - 1]!;
  const rest = L.bw.rest ?? NaN;
  if (p.split === 'custom' && L.bw.added && widths.length > 1 && !(last > p.overlap))
    e.push('Wcześniejsze bryty już pokrywają całą ścianę z naddatkiem. Zmniejsz liczbę brytów albo ich szerokości.');
  else if (p.split === 'custom' && rest < -0.05)
    e.push(`Bryty są o ${f1(-rest)} cm za szerokie względem ściany z naddatkiem. Zmniejsz szerokości.`);
  else if (p.split === 'custom' && rest > 0.05)
    e.push(
      `Bryty są o ${f1(rest)} cm za wąskie względem ściany z naddatkiem. Zwiększ szerokości albo zostaw ostatnie pole puste.`,
    );
  else if (widths.length > 1 && widths.some(w => w <= p.overlap)) e.push('Zakład jest większy niż szerokość brytu.');
  return e;
}

/** Limity przeglądarki – komunikat mówi, co realnie pomoże. */
function browserErrors(p: WallParams, L: Layout, dpiOptions: readonly number[]): string[] {
  const SIDE = BROWSER_MAX_SIDE_PX;
  const AREA = BROWSER_MAX_AREA_PX;
  if (L.bH > SIDE) {
    const fit = [...dpiOptions]
      .sort((a, b) => a - b)
      .filter(d => pxCeil(L.totalHcm, d) <= SIDE)
      .pop();
    return [
      `Bryt miałby ${L.bH} px wysokości, a przeglądarka zapisze najwyżej ${SIDE} px. Przy ${f1(L.totalHcm)} cm wysokości (z naddatkami) ` +
        (fit ? `wybierz najwyżej ${fit} DPI.` : 'zmniejsz rozdzielczość.') +
        ' Zmiana szerokości ani liczby brytów tu nie pomoże.',
    ];
  }
  const widestPx = Math.max(...L.bWs);
  if (!(widestPx > SIDE || widestPx * L.bH > AREA)) return [];
  // najmniejsza liczba równych brytów, która się mieści (sprawdzona na prawdziwym podziale)
  let need: number | null = null;
  for (let k = L.bWs.length + 1; k <= MAX_BRYTY && need === null; k++) {
    const Lk = computeLayout({ ...p, split: 'equal', count: k });
    const wk = Math.max(...Lk.bWs);
    if (wk <= SIDE && wk * Lk.bH <= AREA) need = k;
  }
  const maxWcm = (Math.min(SIDE, Math.floor(AREA / L.bH)) / p.dpi) * 2.54;
  return [
    `Bryt ${widestPx} × ${L.bH} px jest za duży dla przeglądarki (maks. ok. ${f1(Math.floor(maxWcm))} cm szerokości przy ${p.dpi} DPI). ` +
      (p.split === 'equal' && need
        ? `Ustaw co najmniej ${need} ${plural(need)} albo zmniejsz DPI.`
        : 'Zmniejsz szerokość brytów albo DPI.'),
  ];
}

/** Lista błędów blokujących (pusta = można generować). dpiOptions: rozdzielczości do wyboru w formularzu. */
export function validate(p: WallParams, dpiOptions: readonly number[] = DPI_OPTIONS): string[] {
  const input = inputErrors(p);
  if (input.length) return input;
  const L = computeLayout(p);
  const layout = layoutErrors(p, L);
  if (layout.length) return layout;
  return browserErrors(p, L, dpiOptions);
}

/** Ostrzeżenia (nie blokują): zbyt wąski ostatni bryt albo jedyny bryt. */
export function layoutWarnings(p: WallParams, L: Layout): string[] {
  const widths = L.bw.widths;
  const n = widths.length;
  if (n > 1) {
    const strip = widths[n - 1]! - p.overlap; // część ostatniego brytu, której nie pokrywa poprzedni
    return strip < MIN_LAST_CM - 1e-6
      ? [
          `Ostatni bryt jest wąski: ${f1(strip)} cm szerokości po odjęciu zakładu (minimum ${MIN_LAST_CM} cm). Tak wąskiego paska raczej się nie tnie.`,
        ]
      : [];
  }
  return widths[0]! < MIN_LAST_CM ? [`Bryt ma tylko ${f1(widths[0]!)} cm szerokości (minimum ${MIN_LAST_CM} cm).`] : [];
}

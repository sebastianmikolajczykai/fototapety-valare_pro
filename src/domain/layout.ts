// Geometria podziału fototapety na bryty. Wzorzec: zlecenie 005-21 (ściana 350×270, naddatek 3, zakład 6, 3 bryty
// -> bryty 7245×16300 px przy 150 DPI, zdjęcie wpasowane w obszar między paskami thru cut).
import { THRU_CM } from './constants';
import { cmToPx, pxCeil } from './units';

export type JoinType = 'overlap' | 'butt';
export type SplitMode = 'equal' | 'custom';

/** Ustawienia z formularza (cm, DPI). widths: własne szerokości brytów, NaN = puste pole. */
export interface WallParams {
  wallW: number;
  wallH: number;
  mT: number;
  mB: number;
  mL: number;
  mR: number;
  join: JoinType;
  overlap: number;
  split: SplitMode;
  count: number;
  widths: number[];
  /** Maks. szerokość druku materiału [cm]; Infinity = bez materiału, NaN = „inny materiał” bez wartości. */
  maxPrint: number;
  dpi: number;
  thru: boolean;
  pdf: boolean;
  /** Nazwa zlecenia do nazw plików (bez spacji i znaków specjalnych). */
  order: string;
  /** Nazwa zlecenia do wyświetlenia (PDF, schemat). */
  orderName: string;
}

/** Szerokości brytów w cm. added = ostatni bryt policzony jako reszta; rest = brak/nadmiar pokrycia. */
export interface BrytWidths {
  widths: number[];
  added: boolean;
  rest?: number;
}

export interface Layout {
  totalWcm: number;
  totalHcm: number;
  bw: BrytWidths;
  /** Szerokości brytów [px]. */
  bWs: number[];
  /** Lewe krawędzie brytów w całości [px]. */
  xs: number[];
  /** Wysokość brytu [px] (z paskami). */
  bH: number;
  /** Wysokość paska thru cut [px] (0 = bez paska). */
  band: number;
  /** Zakład [px]. */
  ov: number;
  /** Szerokość całości [px]. */
  panoW: number;
  /** Wysokość pola zdjęcia [px]. */
  imgH: number;
}

export interface Crop {
  /** Powiększenie ≥ 1 względem minimalnego wypełnienia. */
  zoom: number;
  /** Położenie wycinka 0..1 (0,5 = środek). */
  fx: number;
  fy: number;
}

export interface Fit {
  /** Skala: piksele druku na piksel zdjęcia. */
  s: number;
  cx: number;
  cy: number;
  exW: number;
  exH: number;
}

/** Całość (ściana + naddatki boczne) = suma brytów − zakłady. */
export function brytWidths(p: WallParams, totalWcm: number): BrytWidths {
  if (p.split === 'equal') {
    const w = (totalWcm + (p.count - 1) * p.overlap) / p.count;
    return { widths: Array<number>(p.count).fill(w), added: false };
  }
  const w = p.widths.slice();
  const auto = Number.isNaN(w[w.length - 1]);
  const known = auto ? w.slice(0, -1) : w;
  const covered = known.reduce((a, x) => a + x, 0) - Math.max(0, known.length - 1) * p.overlap;
  if (auto) {
    // puste ostatnie pole: ostatni bryt dopełnia resztę (z zakładem do poprzedniego)
    w[w.length - 1] = totalWcm - covered + (known.length ? p.overlap : 0);
    return { widths: w, added: true, rest: 0 };
  }
  return { widths: w, added: false, rest: totalWcm - covered };
}

export function computeLayout(p: WallParams): Layout {
  const totalWcm = p.wallW + p.mL + p.mR;
  const totalHcm = p.wallH + p.mT + p.mB;
  const bw = brytWidths(p, totalWcm);
  const bH = pxCeil(totalHcm, p.dpi);
  const band = p.thru ? Math.round(cmToPx(THRU_CM, p.dpi)) : 0;
  const ov = Math.round(cmToPx(p.overlap, p.dpi));
  const bWs = bw.widths.map(w => pxCeil(w, p.dpi));
  const xs: number[] = [];
  let x = 0;
  for (const w of bWs) {
    xs.push(x);
    x += w - ov;
  }
  let panoW = x + ov;
  // Zaokrąglony zakład (np. 6 cm przy 300 DPI = 708,66 -> 709 px) potrafi skrócić całość o ułamek mm –
  // brakujące piksele dostaje ostatni bryt, żeby wydruk zawsze pokrył ścianę z naddatkiem.
  const needW = pxCeil(totalWcm, p.dpi);
  if (panoW < needW) {
    // Przy 0 brytów (dane odrzuca walidacja) indeks −1 – zostawione celowo jak w starym programie.
    const last = bWs.length - 1;
    bWs[last] = bWs[last]! + needW - panoW;
    panoW = needW;
  }
  const imgH = bH - 2 * band;
  return { totalWcm, totalHcm, bw, bWs, xs, bH, band, ov, panoW, imgH };
}

/** Wypełnienie całego pola zdjęciem, powiększenie i położenie wycinka wg kadru. */
export function fitImage(L: Layout, iw: number, ih: number, crop: Crop): Fit {
  const s = Math.max(L.panoW / iw, L.imgH / ih) * crop.zoom;
  const exW = iw * s - L.panoW;
  const exH = ih * s - L.imgH;
  return { s, cx: exW * crop.fx, cy: exH * crop.fy, exW, exH };
}

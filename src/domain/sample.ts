// Próbka 40×60 cm – wycinek grafiki w skali 1:1, w tej samej rozdzielczości co bryty (czysta część probka.js).
// Cennik Valare 2024 (str. 5): „Próbka 40×60 cm (zwykle wycinek 1:1): 89,00 zł” – aktualność DO WALIDACJI.
// DO WALIDACJI (drukarnia): format pliku próbki – przyjęty jak bryty (JPG RGB, DPI z kroku 7);
//   pasek thru cut – jak w brytach (0,5 cm góra i dół w obrębie 60 cm).
import { f1 } from './format';
import type { Layout, WallParams } from './layout';
import { cmToPx, pxCeil } from './units';

export const SAMPLE_SHORT_CM = 40;
export const SAMPLE_LONG_CM = 60;
export const SAMPLE_PRICE_ZL = 89;

/** Położenie próbki w obrębie ściany, 0..1 (0,5 = środek). */
export interface SamplePos {
  fx: number;
  fy: number;
}

/**
 * Prostokąt próbki w pikselach całości (jak bryty): x, y = lewy górny róg pola zdjęcia próbki w układzie
 * wysokości brytu (z paskami), w × h = cały plik, ih = wysokość pola zdjęcia, x0..x1 / y0..y1 = ściana bez naddatków.
 */
export interface SampleGeom {
  wcm: number;
  hcm: number;
  w: number;
  h: number;
  band: number;
  ih: number;
  x: number;
  y: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  fitsW: boolean;
  fitsH: boolean;
}

export function sampleGeom(p: WallParams, L: Layout, vertical: boolean, pos: SamplePos): SampleGeom {
  const wcm = vertical ? SAMPLE_SHORT_CM : SAMPLE_LONG_CM;
  const hcm = vertical ? SAMPLE_LONG_CM : SAMPLE_SHORT_CM;
  const w = pxCeil(wcm, p.dpi);
  const h = pxCeil(hcm, p.dpi);
  const band = L.band;
  const ih = h - 2 * band;
  // Próbkę wybiera się ze ściany (bez naddatków), w obrębie pola zdjęcia.
  const x0 = Math.round(cmToPx(p.mL, p.dpi));
  const x1 = L.panoW - Math.round(cmToPx(p.mR, p.dpi));
  const y0 = Math.max(L.band, Math.round(cmToPx(p.mT, p.dpi)));
  const y1 = Math.min(L.bH - L.band, L.bH - Math.round(cmToPx(p.mB, p.dpi)));
  const fitsW = x1 - x0 >= w;
  const fitsH = y1 - y0 >= ih;
  const x = Math.round(fitsW ? x0 + pos.fx * (x1 - x0 - w) : (x0 + x1 - w) / 2);
  const y = Math.round(fitsH ? y0 + pos.fy * (y1 - y0 - ih) : (y0 + y1 - ih) / 2);
  return { wcm, hcm, w, h, band, ih, x, y, x0, x1, y0, y1, fitsW, fitsH };
}

/** Opis pod przyciskiem „Generuj próbkę”. */
export function sampleInfo(p: WallParams, G: SampleGeom): string {
  const info = `Plik: ${G.w} × ${G.h} px, ${p.dpi} DPI (${G.wcm} × ${G.hcm} cm).`;
  return (
    info +
    (!G.fitsW || !G.fitsH
      ? ` <span class="warn">Ściana jest ${!G.fitsW ? 'węższa' : 'niższa'} niż próbka – próbka obejmie też naddatek lub puste pole.</span>`
      : '')
  );
}

export const sampleFileName = (order: string, G: SampleGeom): string => `probka_${order}_${G.wcm}x${G.hcm}.jpg`;

/** Położenie grafiki próbki od lewego górnego rogu ściany (bez naddatku), w cm z dokładnością 0,1. */
export function samplePositionCm(p: WallParams, G: SampleGeom): { left: number; top: number } {
  const cm = (px: number): number => Math.round((px / p.dpi) * 25.4) / 10 + 0;
  return { left: cm(G.x - cmToPx(p.mL, p.dpi)), top: cm(G.y - cmToPx(p.mT, p.dpi)) };
}

export function sampleDoneMessage(p: WallParams, G: SampleGeom): string {
  const { left, top } = samplePositionCm(p, G);
  return (
    `<span class="ok">Gotowe: próbka ${G.wcm} × ${G.hcm} cm, ${G.w} × ${G.h} px, ${p.dpi} DPI, ` +
    `grafika od lewej ${f1(left)} cm, od góry ${f1(top)} cm ściany. Cena wg cennika: ${SAMPLE_PRICE_ZL} zł.</span>`
  );
}

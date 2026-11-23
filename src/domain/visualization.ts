// Wizualizacja we wnętrzu (sekcja 10) – czysta matematyka starego wizualizacja.js:
// geometria pokoju dla AI (perspektywa), homografia czworokąta „Moje wnętrze” i sprawdzenie skali
// (przeniesione z FeltDecor interior/interior-scale.js, tolerancja ±10%). Wizualizacja nie zmienia plików produkcyjnych.
import type { WallParams } from './layout';
export interface Pt {
  x: number;
  y: number;
}
export interface ScaleInput {
  points: Pt[];
  photoWidth: number;
  photoHeight: number;
  wallW: number;
  wallH: number;
  reference: { a: Pt; b: Pt; length: number } | null;
}
export interface ScaleReference {
  lengthInWall: number;
  scale: number;
  estW: number;
  estH: number;
  verdict: 'ok' | 'larger' | 'smaller';
}
export type ScaleResult =
  | { ok: false }
  | { ok: true; frontal: boolean; aspectDeviation: number; aspectWarning: boolean; reference: ScaleReference | null };
export interface Homography {
  m: number[];
  map: (u: number, v: number) => Pt;
}
export interface SceneGeo {
  W: number;
  H: number;
  s: number;
  E: number;
  D: number;
  f: number;
  CH: number;
  cx: number;
  yh: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  w: number;
  h: number;
  P: (X: number, Y: number, z: number) => Pt;
  sc: (z: number) => number;
}

/** Szerokość sceny w px (wysokość zależy od proporcji ściany). */
export const SCENE_W = 1200;
/** Wysokość aparatu – typowe zdjęcie wnętrza [cm]. */
export const EYE_CM = 130;

/** Typy wnętrz jak w FeltDecor (roomTypeForPrompt) + jadalnia; opisy dla AI są po stronie serwera. */
export const ROOMS: Readonly<Record<string, string>> = {
  salon: 'Salon',
  sypialnia: 'Sypialnia',
  jadalnia: 'Jadalnia',
  'gabinet-domowy': 'Gabinet domowy',
  'pokoj-dzieciecy': 'Pokój dziecięcy',
  'pokoj-nastolatka': 'Pokój nastolatka',
  biuro: 'Biuro',
  'sala-konferencyjna': 'Sala konferencyjna',
  recepcja: 'Recepcja',
};

/** Kolejność klikania narożników na zdjęciu wnętrza. */
export const PHOTO_CORNERS: readonly string[] = ['lewy górny', 'prawy górny', 'prawy dolny', 'lewy dolny'];

const SCALE_TOLERANCE = 0.1;
const ASPECT_TOLERANCE = 0.2;
const PARALLEL_DEGREES = 3;

/**
 * Geometria przykładowego pokoju (rysunek dla AI). Ściana w płaszczyźnie z = 0, aparat na osi ściany,
 * na wysokości E, w odległości D (cm). X: cm od środka ściany, Y: cm od podłogi, z: cm od ściany w stronę aparatu.
 */
export function sceneGeo(p: Pick<WallParams, 'wallW' | 'wallH'>): SceneGeo {
  const W = p.wallW;
  const H = p.wallH;
  const CW = SCENE_W;
  const maxCH = Math.round(CW * 0.92);
  const s = Math.min((CW * 0.8) / W, (maxCH * 0.7) / H); // px na cm w płaszczyźnie ściany
  const wh = H * s;
  const ww = W * s;
  const CH = Math.round(Math.min(maxCH, Math.max(CW * 0.56, wh / 0.7)));
  const D = Math.max(420, W * 0.9, H * 1.5); // odległość aparatu od ściany
  const E = Math.min(EYE_CM, H * 0.6);
  const f = s * D;
  const cx = CW / 2;
  const yTop = Math.max(CH * 0.06, (CH - wh) * 0.24);
  const yh = yTop + (H - E) * s; // linia horyzontu (wysokość aparatu)
  const P = (X: number, Y: number, z: number): Pt => {
    const k = f / Math.max(1, D - z);
    return { x: cx + X * k, y: yh - (Y - E) * k };
  };
  const sc = (z: number): number => f / Math.max(1, D - z);
  return {
    W,
    H,
    s,
    E,
    D,
    f,
    CH,
    cx,
    yh,
    P,
    sc,
    x0: cx - ww / 2,
    x1: cx + ww / 2,
    y0: yTop,
    y1: yTop + wh,
    w: ww,
    h: wh,
  };
}

/** Odwzorowanie kwadratu jednostkowego (u, v) na czworokąt q0..q3 (LG, PG, PD, LD). null = czworokąt zdegenerowany. */
export function homography(q: readonly Pt[]): Homography | null {
  const [p0, p1, p2, p3] = q as [Pt, Pt, Pt, Pt];
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-12) return null;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;
  if (Math.abs(a * e - b * d) < 1e-12) return null;
  const map = (u: number, v: number): Pt => {
    const z = g * u + h * v + 1;
    return { x: (a * u + b * v + c) / z, y: (d * u + e * v + f) / z };
  };
  return { m: [a, b, c, d, e, f, g, h, 1], map };
}

/** Przekształcenie odwrotne (punkt zdjęcia → (u, v)); null = macierz osobliwa. */
export function invertHomography(H: readonly number[]): ((x: number, y: number) => Pt | null) | null {
  const [a, b, c, d, e, f, g, h, i] = H as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  const m = [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ] as [number, number, number, number, number, number, number, number, number];
  return (x, y) => {
    const w = m[6] * x + m[7] * y + m[8];
    return Math.abs(w) < 1e-12 ? null : { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
  };
}

/**
 * Sprawdzenie skali: zaznaczony obszar z definicji ma wymiar ściany; odcinek odniesienia (np. drzwi 200 cm)
 * mówi, czy tak jest naprawdę. Punkty jako ułamki szerokości/wysokości zdjęcia.
 */
export function assessScale({
  points,
  photoWidth: pw,
  photoHeight: ph,
  wallW: W,
  wallH: H,
  reference,
}: ScaleInput): ScaleResult {
  if (!points || points.length !== 4 || !(W > 0) || !(H > 0)) return { ok: false };
  const px = points.map(q => ({ x: q.x * pw, y: q.y * ph })) as [Pt, Pt, Pt, Pt];
  const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
  const angle = (a: Pt, b: Pt, c: Pt, d: Pt): number => {
    const diff = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(d.y - c.y, d.x - c.x)) % Math.PI;
    return (Math.min(diff, Math.PI - diff) * 180) / Math.PI;
  };
  const apparentAspect =
    (dist(px[0], px[1]) + dist(px[3], px[2])) / 2 / Math.max(1e-9, (dist(px[0], px[3]) + dist(px[1], px[2])) / 2);
  const frontal =
    angle(px[0], px[1], px[3], px[2]) < PARALLEL_DEGREES && angle(px[0], px[3], px[1], px[2]) < PARALLEL_DEGREES;
  const aspectDeviation = apparentAspect / (W / H) - 1;
  let ref: ScaleReference | null = null;
  if (reference && reference.a && reference.b && reference.length > 0) {
    const map = homography(px);
    const inv = map && invertHomography(map.m);
    const a = inv && inv(reference.a.x * pw, reference.a.y * ph);
    const b = inv && inv(reference.b.x * pw, reference.b.y * ph);
    if (a && b) {
      const len = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
      if (len > 1e-6) {
        const scale = reference.length / len;
        ref = {
          lengthInWall: len,
          scale,
          estW: W * scale,
          estH: H * scale,
          verdict: Math.abs(scale - 1) <= SCALE_TOLERANCE ? 'ok' : scale > 1 ? 'larger' : 'smaller',
        };
      }
    }
  }
  return {
    ok: true,
    frontal,
    aspectDeviation,
    aspectWarning: frontal && Math.abs(aspectDeviation) > ASPECT_TOLERANCE,
    reference: ref,
  };
}

const f0 = (x: number): string => Math.round(x).toLocaleString('pl-PL');

/** Komunikat pod zdjęciem wnętrza; refPoints = liczba zaznaczonych końców odcinka odniesienia. */
export function scaleMessageHtml(a: ScaleResult, p: Pick<WallParams, 'wallW' | 'wallH'>, refPoints = 0): string {
  let html = '';
  if (a.ok && a.reference) {
    const R = a.reference;
    const est = `${f0(R.estW)} × ${f0(R.estH)} cm`;
    const want = `${f0(p.wallW)} × ${f0(p.wallH)} cm`;
    const fx = R.scale.toFixed(2).replace('.', ',');
    html =
      R.verdict === 'ok'
        ? `<div class="ok">✓ Skala się zgadza: według odcinka odniesienia zaznaczony obszar ma około ${est}.</div>`
        : R.verdict === 'larger'
          ? `<div class="warn">Zaznaczony obszar jest większy niż ściana: około ${est} zamiast ${want} (${fx}×). Zmniejsz zaznaczenie albo ustaw wymiar ściany na około ${est}.</div>`
          : `<div class="warn">Zaznaczony obszar jest mniejszy niż ściana: około ${est} zamiast ${want} (${fx}×). Powiększ zaznaczenie albo ustaw wymiar ściany na około ${est}.</div>`;
  } else if (refPoints === 2) html = '<div class="hint">Wpisz długość odcinka w cm (10–2000).</div>';
  if (a.ok && a.aspectWarning)
    html +=
      '<div class="warn">Proporcje zaznaczenia odbiegają od proporcji ściany. Jeśli ściana jest na zdjęciu na wprost, popraw narożniki.</div>';
  return html;
}

// RED: część strony bez DOM – pusta implementacja, testy muszą paść.
export interface VizMessageState {
  own: boolean;
  hasPhoto: boolean;
  points: number;
  refPicking: boolean;
  refPoints: number;
  valid: boolean | null;
  hasImage: boolean;
  wallW: number;
  wallH: number;
}
export const wallTextureRect = (_p: unknown, _L: unknown): null => null;
export const photoStoreSize = (_w: number, _h: number): { w: number; h: number } => ({ w: 0, h: 0 });
export const photoViewSize = (_w: number, _h: number): { W: number; H: number } => ({ W: 0, H: 0 });
export const jpegSize = (_w: number, _h: number, _m: number): null => null;
export const grownQuad = (_q: readonly Pt[], _g = 0): Pt[] => [];
export const nearestPoint = (_l: readonly Pt[], _q: Pt, _w: number, _h: number, _m = 22): number => -1;
export const vizMessage = (_s: VizMessageState): string => '';
export const refPickLabel = (_p: boolean, _n: number): string => '';
export const vizAiInfoHtml = (_h: unknown): string => '';
export const vizFileName = (_o: string, _w: boolean, _r: string): string => '';

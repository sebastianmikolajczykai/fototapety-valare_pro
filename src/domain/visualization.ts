// Wizualizacja we wnętrzu (sekcja 10) – czysta matematyka starego wizualizacja.js:
// geometria pokoju dla AI (perspektywa), homografia czworokąta „Moje wnętrze” i sprawdzenie skali
// (przeniesione z FeltDecor interior/interior-scale.js, tolerancja ±10%). Wizualizacja nie zmienia plików produkcyjnych.
import type { Layout, WallParams } from './layout';
import { cmToPx } from './units';
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

// ---------- Część strony „Wizualizacja we wnętrzu” bez DOM (stary wizualizacja.js) ----------

/** Maks. bok kadru ściany w px użyty w wizualizacji. */
export const TEXTURE_MAX = 1800;
/** Zdjęcie klienta zmniejszane do 1600 px (jak FeltDecor prepareMyInteriorPhoto). */
export const PHOTO_MAX = 1600;

/** Kadr ściany bez naddatków w pikselach całości (X0..X1, Y0..Y1) i skala k obrazu dla wizualizacji; null = brak. */
export function wallTextureRect(
  p: Pick<WallParams, 'mL' | 'mR' | 'mT' | 'mB' | 'dpi'>,
  L: Pick<Layout, 'band' | 'panoW' | 'bH'>,
): { X0: number; X1: number; Y0: number; Y1: number; k: number; w: number; h: number } | null {
  const band = L.band;
  const X0 = Math.round(cmToPx(p.mL, p.dpi));
  const X1 = L.panoW - Math.round(cmToPx(p.mR, p.dpi));
  const Y0 = Math.max(band, Math.round(cmToPx(p.mT, p.dpi)));
  const Y1 = Math.min(L.bH - band, L.bH - Math.round(cmToPx(p.mB, p.dpi)));
  if (!(X1 > X0 && Y1 > Y0)) return null;
  const k = Math.min(1, TEXTURE_MAX / (X1 - X0), TEXTURE_MAX / (Y1 - Y0));
  return { X0, X1, Y0, Y1, k, w: Math.max(1, Math.round((X1 - X0) * k)), h: Math.max(1, Math.round((Y1 - Y0) * k)) };
}

/** Wymiar zdjęcia wnętrza po zmniejszeniu do PHOTO_MAX (dłuższy bok). */
export const photoStoreSize = (w: number, h: number): { w: number; h: number } => {
  const k = Math.min(1, PHOTO_MAX / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
};

/** Podgląd zdjęcia na ekranie: maks. 1200 × 900 px. */
export const photoViewSize = (w: number, h: number): { W: number; H: number } => {
  const k = Math.min(1, SCENE_W / w, 900 / h);
  return { W: Math.round(w * k), H: Math.round(h * k) };
};

/** Wymiar obrazu wysłanego do AI (dłuższy bok maks. max); null = bez zmniejszania. */
export const jpegSize = (w: number, h: number, max: number): { w: number; h: number } | null => {
  const k = Math.min(1, max / Math.max(w, h));
  return k === 1 ? null : { w: Math.round(w * k), h: Math.round(h * k) };
};

/** Czworokąt odsunięty od środka o grow px (maska trochę większa niż zaznaczenie). */
export function grownQuad(q: readonly Pt[], grow = 0): Pt[] {
  const cx = q.reduce((a, b) => a + b.x, 0) / 4;
  const cy = q.reduce((a, b) => a + b.y, 0) / 4;
  return q.map(v => {
    const dx = v.x - cx;
    const dy = v.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return { x: v.x + (dx / l) * grow, y: v.y + (dy / l) * grow };
  });
}

/** Indeks punktu (ułamki zdjęcia) najbliższego q w promieniu max px ekranu; -1 = żaden. */
export function nearestPoint(list: readonly Pt[], q: Pt, width: number, height: number, max = 22): number {
  let best = -1;
  let bd = max;
  list.forEach((p, i) => {
    const d = Math.hypot((p.x - q.x) * width, (p.y - q.y) * height);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Stan panelu potrzebny do komunikatu pod sceną. */
export interface VizMessageState {
  own: boolean;
  hasPhoto: boolean;
  points: number;
  refPicking: boolean;
  refPoints: number;
  /** Ustawienia poprawne (null = brak głównego skryptu). */
  valid: boolean | null;
  hasImage: boolean;
  wallW: number;
  wallH: number;
}

/** Komunikat pod sceną (to, co zwracał draw() starego programu). */
export function vizMessage(s: VizMessageState): string {
  if (s.own) {
    if (!s.hasPhoto)
      return 'Zrób zdjęcie ściany, najlepiej na wprost, z całą ścianą w kadrze. Potem zaznacz jej 4 narożniki.';
    if (s.points < 4)
      return `Kliknij ${s.points + 1}. punkt: ${PHOTO_CORNERS[s.points]} narożnik obszaru fototapety (zwykle całej ściany). Kolejność: lewy górny, prawy górny, prawy dolny, lewy dolny.`;
    if (s.refPicking) return `Kliknij ${s.refPoints + 1}. koniec odcinka odniesienia na tej samej ścianie.`;
    return s.valid && s.hasImage
      ? 'Narożniki zaznaczone (punkty możesz przeciągać). Kliknij „Stwórz wizualizację AI” – AI nałoży fototapetę na zaznaczoną ścianę.'
      : 'Narożniki zaznaczone. Wgraj grafikę i ustaw wymiary ściany, potem kliknij „Stwórz wizualizację AI”.';
  }
  if (!s.valid) return 'Popraw ustawienia po lewej, żeby zrobić wizualizację.';
  return (
    `Wybierz typ wnętrza i kliknij „Stwórz wizualizację AI”. AI zrobi realistyczne zdjęcie takiego wnętrza z fototapetą na całej ścianie ${f0(s.wallW)} × ${f0(s.wallH)} cm.` +
    (s.hasImage ? '' : ' Najpierw wgraj grafikę.')
  );
}

/** Napis przycisku odcinka odniesienia. */
export const refPickLabel = (picking: boolean, points: number): string =>
  picking
    ? 'Kliknij 2 końce odcinka na zdjęciu…'
    : points === 2
      ? 'Zaznacz odcinek ponownie'
      : 'Zaznacz odcinek odniesienia';

/** Informacja o usłudze AI pod przyciskiem (HTML); health = odpowiedź /api/health albo null (brak serwera). */
export function vizAiInfoHtml(
  health: { ai?: { generate?: boolean; provider?: unknown; model?: unknown } } | null,
): string {
  const lt = (s: unknown): string => String(s).replace(/</g, '&lt;');
  if (health && health.ai && health.ai.generate)
    return `AI: ${lt(health.ai.provider)} (${lt(health.ai.model)}). Podgląd z panelu (w trybie „Moje wnętrze” razem ze zdjęciem wnętrza) i kadr ściany są wysyłane do OpenAI. Każde zdjęcie kosztuje. Wynik jest poglądowy – AI może zmienić szczegóły grafiki, do produkcji idą bryty.`;
  return health
    ? 'Wizualizacja AI niedostępna – brak połączenia z usługą AI.'
    : 'Wizualizacja AI niedostępna – brak połączenia z serwerem.';
}

/** Nazwa pobieranego pliku wizualizacji AI. */
export const vizFileName = (order: string, own: boolean, room: string): string =>
  `${order || 'zlecenie'}_wizualizacja_AI_${own ? 'moje-wnetrze' : room}.png`;

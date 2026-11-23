// Lupa: całe zdjęcie na pełnym ekranie z powiększeniem do pikseli (ustalenie Sebastiana 2026-10-25) –
// czysta część starego lupa.js: skala i przesunięcie obrazu w oknie oraz ramka kadru i łączenia brytów.
import type { Fit, Layout } from './layout';

/** Największe powiększenie: 400% pikseli zdjęcia. */
export const MAGNIFIER_MAX = 4;
const EPS = 1e-9;

/** Skala (s) i przesunięcie (tx, ty) obrazu iw × ih w oknie; fitS = skala „całe zdjęcie” (maks. 100%). */
export class ZoomView {
  s = 1;
  tx = 0;
  ty = 0;
  fitS = 1;

  constructor(
    readonly iw: number,
    readonly ih: number,
  ) {}

  get label(): string {
    return Math.round(this.s * 100) + '%';
  }
  get canZoomOut(): boolean {
    return !(this.s <= this.fitS + EPS);
  }
  get canZoomIn(): boolean {
    return !(this.s >= MAGNIFIER_MAX - EPS);
  }
  /** Od 200% piksele bez wygładzania (widać, jak wydrukuje się zdjęcie). */
  get pixelated(): boolean {
    return this.s >= 2;
  }

  /** Obraz mniejszy niż okno – na środku; większy – nie odjeżdża poza krawędź. */
  private clamp(vw: number, vh: number): void {
    const w = this.iw * this.s;
    const h = this.ih * this.s;
    this.tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, this.tx));
    this.ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, this.ty));
  }

  private fitScale(vw: number, vh: number): number {
    return Math.min(1, vw / this.iw, vh / this.ih);
  }

  fitAll(vw: number, vh: number): void {
    this.fitS = this.fitScale(vw, vh);
    this.s = this.fitS;
    this.tx = this.ty = 0;
    this.clamp(vw, vh);
  }

  /** Nowa skala (w granicach „całe zdjęcie” … 400%) z punktem (cx, cy) okna w miejscu. */
  zoomAt(ns: number, cx: number, cy: number, vw: number, vh: number): void {
    ns = Math.min(MAGNIFIER_MAX, Math.max(this.fitS, ns));
    this.tx = cx - ((cx - this.tx) * ns) / this.s;
    this.ty = cy - ((cy - this.ty) * ns) / this.s;
    this.s = ns;
    this.clamp(vw, vh);
  }

  moveTo(tx: number, ty: number, vw: number, vh: number): void {
    this.tx = tx;
    this.ty = ty;
    this.clamp(vw, vh);
  }

  /** Zmiana okna: dopasowany obraz zostaje dopasowany, powiększony – w tej samej skali. */
  resize(vw: number, vh: number): void {
    const wasFit = this.s <= this.fitS + EPS;
    this.fitS = this.fitScale(vw, vh);
    if (wasFit) this.s = this.fitS;
    this.clamp(vw, vh);
  }
}

/** Kadr do druku i łączenia brytów (środek zakładu) w pikselach zdjęcia – z tych samych danych co podgląd. */
export function magnifierFrame(L: Layout, F: Fit): { x: number; y: number; w: number; h: number; seams: number[] } {
  const seams: number[] = [];
  for (let i = 1; i < L.xs.length; i++) seams.push((L.xs[i]! + L.ov / 2) / F.s);
  return { x: F.cx / F.s, y: F.cy / F.s, w: L.panoW / F.s, h: L.imgH / F.s, seams };
}

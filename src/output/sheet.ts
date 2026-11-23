// Arkusz produkcyjny jak DRUK 1.cdr – wspólny dla PDF i CorelDRAW (sheetGeom, drawSchema, drawBryty ze starego bryty.js).
// Od góry: 1) „LEGENDA”: całość z ramką naddatku (niebieską) i liniami wymiarowymi ściany (czerwonymi),
// 2) schemat podziału: całość z paskami nad i pod, na których widać granice brytów i zakłady,
// 3) nazwa zlecenia i bryty obok siebie w skali 1:1 (pasek thru cut jako osobny prostokąt CMYK 100% C).
// Sekcję „Jak zlecam plik do produkcji” usunięto (decyzja Sebastiana 26.10.2026). Jednostki: cm, y od góry.
import type { Layout, WallParams } from '../domain/layout';
import { textWidthApprox, textWidthExact } from './pdf-text';
export type Cmyk = readonly [number, number, number, number];
export const CMYK = { RED: [0, 100, 100, 0], CYAN: [100, 0, 0, 0], BLACK: [0, 0, 0, 100] } as const satisfies Record<
  string,
  Cmyk
>;
export interface SheetGeom {
  n: number;
  wCm: number[];
  xsCm: number[];
  PW: number;
  PH: number;
  IH: number;
  B: number;
  fs: number;
  fsS: number;
  lw: number;
  M: number;
  ext: number;
  gap: number;
}
export type SheetOp =
  | { t: 'img'; file: string; x: number; y: number; w: number; h: number }
  | { t: 'rectF'; col: Cmyk; x: number; y: number; w: number; h: number }
  | { t: 'rectS'; col: Cmyk; x: number; y: number; w: number; h: number; wd: number }
  | { t: 'line'; col: Cmyk; x1: number; y1: number; x2: number; y2: number; wd: number }
  | { t: 'text'; col: Cmyk; s: string; x: number; y: number; size: number; rot: boolean };
export interface SheetDrawer {
  img(name: string, x: number, top: number, w: number, h: number): void;
  rectF(col: Cmyk, x: number, top: number, w: number, h: number): void;
  rectS(col: Cmyk, x: number, top: number, w: number, h: number, wd: number): void;
  line(col: Cmyk, x1: number, y1: number, x2: number, y2: number, wd: number): void;
  text(col: Cmyk, s: string, x: number, base: number, size: number, rot?: boolean): void;
}
/** Rysownik arkusza z zapisem operacji – to samo, co trafia do zlecenia dla CorelDRAW. */
export class OpsRecorder implements SheetDrawer {
  readonly ops: SheetOp[] = [];

  img(name: string, x: number, y: number, w: number, h: number): void {
    this.ops.push({ t: 'img', file: name === 'Pano' ? 'pano.jpg' : `bryt_${+name.slice(2) + 1}.jpg`, x, y, w, h });
  }
  rectF(col: Cmyk, x: number, y: number, w: number, h: number): void {
    this.ops.push({ t: 'rectF', col, x, y, w, h });
  }
  rectS(col: Cmyk, x: number, y: number, w: number, h: number, wd: number): void {
    this.ops.push({ t: 'rectS', col, x, y, w, h, wd });
  }
  line(col: Cmyk, x1: number, y1: number, x2: number, y2: number, wd: number): void {
    this.ops.push({ t: 'line', col, x1, y1, x2, y2, wd });
  }
  text(col: Cmyk, s: string, x: number, y: number, size: number, rot = false): void {
    this.ops.push({ t: 'text', col, s, x, y, size, rot });
  }
}

const { RED, CYAN, BLACK } = CMYK;

/** Jedna strona: schemat, pod nim nazwa zlecenia i wszystkie bryty w jednym rzędzie, 1:1. */
export class ProductionSheet {
  readonly geom: SheetGeom;

  constructor(
    L: Layout,
    private readonly p: WallParams,
  ) {
    const cm = (px: number): number => (px / p.dpi) * 2.54;
    const PW = cm(L.panoW);
    const fs = Math.max(3, PW / 40); // wielkość tytułów [cm]
    this.geom = {
      n: L.bWs.length,
      wCm: L.bWs.map(cm),
      xsCm: L.xs.map(cm),
      PW,
      PH: cm(L.bH),
      IH: cm(L.imgH),
      B: cm(L.band),
      fs,
      fsS: fs * 0.8,
      lw: Math.max(0.15, PW / 600),
      M: fs * 2,
      ext: cm(L.bH) * 0.1,
      gap: Math.max(5, PW * 0.04),
    };
  }

  /** Wysokość schematu (sekcje 1–2) bez dolnego marginesu. */
  private schemaHeight(): number {
    const { fs, PH, ext, M } = this.geom;
    return M + fs * 2.6 + PH + fs * 3.5 + ext + PH + ext;
  }
  /** Miejsce na pionowy wymiar ściany po lewej. */
  private schemaX(): number {
    return this.geom.M + this.geom.fs * 3;
  }
  private schemaWidth(): number {
    const G = this.geom;
    return this.schemaX() + G.PW + G.fsS * 2.5 + G.M;
  }
  /** Od góry bloku brytów do pierwszego rzędu. */
  private rowTop(): number {
    const G = this.geom;
    return G.M + G.fs * 2.6 + G.fsS * 1.5;
  }
  private rowHeight(): number {
    const G = this.geom;
    return G.PH + G.fsS * 1.5 + G.gap;
  }
  private rowWidth(r: readonly number[]): number {
    return r.reduce((a, i) => a + this.geom.wCm[i]!, 0) + (r.length - 1) * this.geom.gap;
  }
  private row(): number[] {
    return [...Array(this.geom.n).keys()];
  }

  /** Wymiar strony [cm]: szerokość pod schemat, nazwę zlecenia (dokładna szerokość) i rząd brytów. */
  pageSize(): { w: number; h: number } {
    const G = this.geom;
    const row = this.row();
    return {
      w: Math.max(
        this.schemaWidth(),
        2 * G.M + textWidthExact(this.p.orderName, G.fs * 2),
        2 * G.M + this.rowWidth(row),
      ),
      h: this.schemaHeight() + this.rowTop() + this.rowHeight() - G.gap + G.M,
    };
  }

  draw(d: SheetDrawer): void {
    this.drawSchema(d);
    this.drawBryty(d, [this.row()], this.schemaHeight(), this.p.orderName);
  }

  private drawSchema(d: SheetDrawer): void {
    const { n, wCm, xsCm, PW, PH, IH, B, fs, fsS, lw, M, ext } = this.geom;
    const p = this.p;
    const textW = textWidthApprox;
    const X0 = this.schemaX();
    let y = M;
    const s2 = { title: y + fs, img: y + fs * 2.6 };
    y = s2.img + PH + fs * 3.5;
    const s3 = { img: y + ext };
    const panoImg = (top: number): void => d.img('Pano', X0, top + B, PW, IH);
    const wall = { x: X0 + p.mL, w: p.wallW, t: p.mT, h: p.wallH };
    const mm = (v: number): string => (v * 10).toFixed(2).replace('.', ',') + ' mm';

    // 1) Legenda: naddatek i wymiar ściany
    d.text(BLACK, 'LEGENDA:', X0, s2.title, fs);
    d.text(CYAN, 'naddatek', X0, s2.title + fs * 1.3, fsS);
    d.text(CYAN, 'naddatek', X0 + PW + fsS * 1.2, s2.img + textW('naddatek', fsS), fsS, true);
    panoImg(s2.img);
    d.rectS(CYAN, X0, s2.img, PW, PH, lw * 2);
    d.rectS(RED, wall.x, s2.img + wall.t, wall.w, wall.h, lw);
    const dimY = s2.img + PH + fs * 0.8;
    const dimX = X0 - fs * 0.8;
    const tk = fs * 0.3;
    d.line(RED, wall.x, dimY, wall.x + wall.w, dimY, lw);
    d.line(RED, wall.x, dimY - tk, wall.x, dimY + tk, lw);
    d.line(RED, wall.x + wall.w, dimY - tk, wall.x + wall.w, dimY + tk, lw);
    d.text(RED, mm(p.wallW), wall.x + wall.w / 2 - textW(mm(p.wallW), fsS) / 2, dimY + fsS * 1.1, fsS);
    d.text(RED, 'wymiar ściany', wall.x + wall.w / 2 - textW('wymiar ściany', fs) / 2, dimY + fsS * 1.2 + fs, fs);
    const wt = s2.img + wall.t;
    d.line(RED, dimX, wt, dimX, wt + wall.h, lw);
    d.line(RED, dimX - tk, wt, dimX + tk, wt, lw);
    d.line(RED, dimX - tk, wt + wall.h, dimX + tk, wt + wall.h, lw);
    d.text(RED, mm(p.wallH), dimX - fsS * 0.3, wt + wall.h / 2 + textW(mm(p.wallH), fsS) / 2, fsS, true);
    d.text(RED, 'wymiar ściany', dimX - fsS * 1.4, wt + wall.h / 2 + textW('wymiar ściany', fs) / 2, fs, true);

    // 2) Schemat podziału: paski nad i pod całością z granicami brytów (podwójne linie = zakład)
    panoImg(s3.img);
    if (B) {
      d.rectF(CYAN, X0, s3.img, PW, B);
      d.rectF(CYAN, X0, s3.img + PH - B, PW, B);
    }
    for (let i = 0; i < n; i++) {
      d.rectS(BLACK, X0 + xsCm[i]!, s3.img - ext, wCm[i]!, ext, lw);
      d.rectS(BLACK, X0 + xsCm[i]!, s3.img + PH, wCm[i]!, ext, lw);
    }
    d.rectS(BLACK, X0, s3.img, PW, PH, lw);
  }

  /** Nazwa zlecenia i rzędy brytów 1:1 od wysokości top. rows = tablice indeksów brytów. */
  private drawBryty(d: SheetDrawer, rows: readonly (readonly number[])[], top: number, label: string): void {
    const { n, wCm, PH, IH, B, fs, fsS, M, gap } = this.geom;
    d.text(BLACK, label, M, top + M + fs * 2, fs * 2);
    rows.forEach((r, ri) => {
      const y = top + this.rowTop() + ri * this.rowHeight();
      let x = M;
      for (const i of r) {
        const w = wCm[i]!;
        d.text(
          BLACK,
          `${i + 1}/${n}  ${w.toFixed(1).replace('.', ',')} × ${PH.toFixed(1).replace('.', ',')} cm`,
          x,
          y - fsS * 0.6,
          fsS,
        );
        d.img(`Im${i}`, x, y + B, w, IH);
        if (B) {
          d.rectF(CYAN, x, y, w, B);
          d.rectF(CYAN, x, y + PH - B, w, B);
        }
        x += w + gap;
      }
    });
  }
}

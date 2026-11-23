// PDF dla CorelDRAW w układzie jak DRUK 1.cdr – odpowiednik makePdf ze starego bryty.js.
// Jedna strona: legenda, schemat podziału, pod nim nazwa zlecenia i bryty 1:1 (arkusz: sheet.ts).
// CorelDRAW 2026 ignoruje /UserUnit; strona większa niż 508 cm (limit Acrobata) otwiera się w Corelu 1:1,
// dlatego strona nie jest pomniejszana. Wcześniej osobne strony różnej wielkości – Corel ustawiał je na środku
// pierwszej i bryty wypadały poza arkusz (zgłoszenie 27.10.2026).
// Dane JPG nie są kopiowane: wynik to części pliku (bajty nagłówków + oryginalne dane, np. Blob w przeglądarce).
import type { Layout, WallParams } from '../domain/layout';
import { PdfFile, type PdfImage, type PdfPart } from './pdf-file';
import { helveticaWidths, PL_NAMES, pdfText } from './pdf-text';
import { ProductionSheet, type Cmyk, type SheetDrawer } from './sheet';

/** Punkty PDF na cm. */
export const PT_PER_CM = 72 / 2.54;

export type { PdfImage } from './pdf-file';

export interface ProductionPdf<T> {
  parts: (Uint8Array | T)[];
  pages: number;
  schemaScale: number;
}

interface Page {
  w: number;
  h: number;
  sc: number;
  k: number;
  c: string;
}

/** Liczba w treści PDF: maks. 3 miejsca po przecinku. */
const f = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const k4 = (col: Cmyk): string => col.map(v => v / 100).join(' ');

/** Rysownik arkusza do strumienia treści strony PDF (y od góry → PDF od dołu). */
class PdfPageDrawer implements SheetDrawer {
  constructor(private readonly pg: Page) {}
  private X = (v: number): string => f(v * this.pg.k);
  private Y = (v: number): string => f((this.pg.h - v) * this.pg.k);
  private S = (v: number): string => f(v * this.pg.k);

  img(name: string, x: number, top: number, w: number, h: number): void {
    this.pg.c += `q ${this.S(w)} 0 0 ${this.S(h)} ${this.X(x)} ${this.Y(top + h)} cm /${name} Do Q\n`;
  }
  rectF(col: Cmyk, x: number, top: number, w: number, h: number): void {
    this.pg.c += `q ${k4(col)} k ${this.X(x)} ${this.Y(top + h)} ${this.S(w)} ${this.S(h)} re f Q\n`;
  }
  rectS(col: Cmyk, x: number, top: number, w: number, h: number, wd: number): void {
    this.pg.c += `q ${k4(col)} K ${this.S(wd)} w ${this.X(x)} ${this.Y(top + h)} ${this.S(w)} ${this.S(h)} re S Q\n`;
  }
  line(col: Cmyk, x1: number, y1: number, x2: number, y2: number, wd: number): void {
    this.pg.c += `q ${k4(col)} K ${this.S(wd)} w ${this.X(x1)} ${this.Y(y1)} m ${this.X(x2)} ${this.Y(y2)} l S Q\n`;
  }
  text(col: Cmyk, s: string, x: number, base: number, size: number, rot = false): void {
    // Obrót przez macierz cm (nie Tm): CorelDRAW przy imporcie przesuwał tekst obrócony przez Tm o ok. 0,5 m.
    this.pg.c += rot
      ? `q 0 1 -1 0 ${this.X(x)} ${this.Y(base)} cm BT /F1 ${this.S(size)} Tf ${k4(col)} k 0 0 Td (${pdfText(s)}) Tj ET Q\n`
      : `BT /F1 ${this.S(size)} Tf ${k4(col)} k ${this.X(x)} ${this.Y(base)} Td (${pdfText(s)}) Tj ET\n`;
  }
}

/** PDF produkcyjny. jpegs: bryty bez pasków (wymiar z układu), pano: podgląd całości w niższej rozdzielczości. */
export function productionPdf<T>(
  L: Layout,
  p: WallParams,
  jpegs: readonly PdfImage<T>[],
  pano: PdfImage<T>,
): ProductionPdf<T> {
  const sheet = new ProductionSheet(L, p);
  const size = sheet.pageSize();
  const pg: Page = { w: size.w, h: size.h, sc: 1, k: PT_PER_CM, c: '' };
  sheet.draw(new PdfPageDrawer(pg));
  const pages = [pg];

  const pdf = new PdfFile<T>();
  const enc = new TextEncoder();
  const catalog = pdf.add();
  const pagesObj = pdf.add();
  const font = pdf.add([
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 255 /Widths [${helveticaWidths(false).join(' ')}] /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${PL_NAMES}] >> >>`,
  ]);
  const imgDict = (w: number, h: number, img: PdfImage<T>): PdfPart<T>[] => [
    `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.size} >>\nstream\n`,
    img,
    '\nendstream',
  ];
  const xo = [`/Pano ${pdf.add(imgDict(pano.w, pano.h, pano))} 0 R`];
  jpegs.forEach((j, i) => xo.push(`/Im${i} ${pdf.add(imgDict(L.bWs[i]!, L.imgH, j))} 0 R`));
  const res = pdf.add([`<< /Font << /F1 ${font} 0 R >> /XObject << ${xo.join(' ')} >> >>`]);
  const kids = pages.map(P => {
    const content = pdf.add([`<< /Length ${enc.encode(P.c).length} >>\nstream\n`, P.c, '\nendstream']);
    return pdf.add([
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${f(P.w * P.k)} ${f(P.h * P.k)}] /Resources ${res} 0 R /Contents ${content} 0 R >>`,
    ]);
  });
  pdf.set(catalog, [`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`]);
  pdf.set(pagesObj, [`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`]);
  return { parts: pdf.bytes(catalog), pages: pages.length, schemaScale: pg.sc };
}

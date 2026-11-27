// Schemat montażu dla klienta / montażysty (PDF, A4 poziomo) – odpowiednik starego montaz.js (Montaz.make).
// Jedna strona: nagłówek z logo, schemat podziału (naddatek, zakłady, narożniki, otwory, wymiary ściany),
// legenda i tabela brytów. Bez listy „Kolejność montażu” (decyzja Sebastiana 26.10.2026 – w starym kodzie
// funkcje steps/drawSteps nie były wywoływane, tu ich nie ma).
// Zamiast odczytu ze strony (lista materiałów, sekcja ściany, logo w nagłówku, zegar) dane przychodzą parametrami.
import { plural } from '../domain/format';
import type { Layout, WallParams } from '../domain/layout';
import type { WallData } from '../domain/wall';
import { PdfFile, type PdfImage } from './pdf-file';
import { helveticaWidths, PL_NAMES, pdfText, textWidth } from './pdf-text';
import { VALARE_LOGO, type SvgLogo } from './valare-logo';

export type AssemblyWall = Pick<WallData, 'corners' | 'openings'>;

export interface AssemblyBryt {
  nr: number;
  /** Lewa krawędź brytu w całości (z naddatkiem) [cm]. */
  a: number;
  w: number;
  /** Zakres na ścianie (bez naddatku) [cm]. */
  from: number;
  to: number;
}

export interface AssemblyModel extends AssemblyWall {
  n: number;
  ov: number;
  /** Docięcie krawędzi zewnętrznych całości [cm]. */
  cut?: { l: number; r: number; t: number; b: number };
  bryty: AssemblyBryt[];
  material: string;
}

export interface AssemblyOptions<T> {
  /** Nazwa materiału do nagłówka (materialLabel); pusta = bez materiału. */
  material?: string;
  /** Narożniki i otwory (WallFeatures.data); brak = bez nich. */
  wall?: AssemblyWall;
  /** Podgląd całości (JPG, w starym programie 2400 px szerokości). */
  pano: PdfImage<T>;
  /** Data w stopce (domyślnie dziś). */
  now?: Date;
  /** Logo wektorowe; null = napis „VALARE” (jak gdy w stronie brakowało logo). */
  logo?: SvgLogo | null;
  /** Docięcie każdego brytu z każdej strony [cm] (domyślnie ZUND_TRIM); 0 = jak w starym programie. */
  trim?: number;
}

/** Docięcie na Zundzie: każdy bryt po 0,5 cm z każdej strony (Valare 27.11.2026). TODO: implementacja. */
export const ZUND_TRIM = 0;

export interface AssemblyPdf<T> {
  parts: (Uint8Array | T)[];
  name: string;
  pages: number;
}

type Rgb = readonly [number, number, number];

const PT = 72 / 2.54;
const PW = 29.7; // A4 poziomo [cm]
const PH = 21;
const MG = 1.2; // margines [cm]
const INK: Rgb = [0x22, 0x2a, 0x35];
const GREEN: Rgb = [0x25, 0xc0, 0x9e];
const ORANGE: Rgb = [0xf5, 0x9e, 0x0b];
const GRAY: Rgb = [0x6b, 0x72, 0x80];
const LINE: Rgb = [0xd5, 0xd9, 0xde];
const WHITE: Rgb = [255, 255, 255];

/** Punkty → cm (rozmiar czcionki). */
const PTS = (v: number): number => v * 0.03528;
/** Liczba w opisach: 1 miejsce po przecinku, format polski (zaokrąglenie jak w starym programie). */
const fmt = (x: number): string => (Math.round(x * 10) / 10).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
/** Liczba w treści PDF: maks. 3 miejsca po przecinku. */
const f = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const X = (x: number): string => f(x * PT);
const Y = (y: number): string => f((PH - y) * PT);
const S = (v: number): string => f(v * PT);
const rgb = (col: Rgb): string => col.map(v => f(v / 255)).join(' ');

interface RectStyle {
  fill?: Rgb;
  stroke?: Rgb;
  lw?: number;
  alpha?: string;
  dash?: readonly number[];
}

interface TextStyle {
  align?: 'l' | 'c' | 'r';
  bold?: boolean;
  rot?: boolean;
  col?: Rgb;
}

/** Rysownik strony PDF: współrzędne w cm od lewego górnego rogu. */
class AssemblyPage {
  content = '';

  img(name: string, x: number, y: number, w: number, h: number): void {
    this.content += `q ${S(w)} 0 0 ${S(h)} ${X(x)} ${Y(y + h)} cm /${name} Do Q\n`;
  }

  rect(x: number, y: number, w: number, h: number, o: RectStyle = {}): void {
    this.content +=
      'q ' +
      (o.alpha ? `/${o.alpha} gs ` : '') +
      (o.fill ? `${rgb(o.fill)} rg ` : '') +
      (o.stroke ? `${rgb(o.stroke)} RG ${S(o.lw ?? 0.02)} w ` : '') +
      (o.dash ? `[${o.dash.map(S).join(' ')}] 0 d ` : '') +
      `${X(x)} ${Y(y + h)} ${S(w)} ${S(h)} re ` +
      (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S') +
      ' Q\n';
  }

  line(x1: number, y1: number, x2: number, y2: number, col: Rgb, lw: number, dash?: readonly number[]): void {
    this.content +=
      `q ${rgb(col)} RG ${S(lw)} w ` +
      (dash ? `[${dash.map(S).join(' ')}] 0 d ` : '') +
      `${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S Q\n`;
  }

  circle(cx: number, cy: number, r: number, fill: Rgb, stroke: Rgb, lw: number): void {
    const k = 0.5523 * r;
    this.content +=
      `q ${rgb(fill)} rg ${rgb(stroke)} RG ${S(lw)} w ${X(cx + r)} ${Y(cy)} m ` +
      `${X(cx + r)} ${Y(cy - k)} ${X(cx + k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c ` +
      `${X(cx - k)} ${Y(cy - r)} ${X(cx - r)} ${Y(cy - k)} ${X(cx - r)} ${Y(cy)} c ` +
      `${X(cx - r)} ${Y(cy + k)} ${X(cx - k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c ` +
      `${X(cx + k)} ${Y(cy + r)} ${X(cx + r)} ${Y(cy + k)} ${X(cx + r)} ${Y(cy)} c B Q\n`;
  }

  /** y = linia bazowa; rot = obrót o 90° (tekst od dołu do góry). */
  text(s: string, x: number, y: number, size: number, o: TextStyle = {}): void {
    const w = textWidth(s, size, o.bold ?? false);
    const dx = o.align === 'c' ? -w / 2 : o.align === 'r' ? -w : 0;
    const font = o.bold ? 'F2' : 'F1';
    // półpauza = WinAnsi 0x96 (kody 128–143 zajmują polskie litery)
    const str = s.split('–').map(pdfText).join('\\226');
    const col = rgb(o.col ?? INK);
    this.content += o.rot
      ? `BT /${font} ${S(size)} Tf ${col} rg 0 1 -1 0 ${X(x)} ${Y(y - dx)} Tm (${str}) Tj ET\n`
      : `BT /${font} ${S(size)} Tf ${col} rg ${X(x + dx)} ${Y(y)} Td (${str}) Tj ET\n`;
  }

  /** Ścieżka SVG (tylko M, L, C, Z, współrzędne bezwzględne – tak jest zapisane logo Valare). */
  svgPath(d: string, x0: number, y0: number, vb: SvgLogo['viewBox'], k: number, col: Rgb): void {
    const t = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
    const P = (i: number): string => `${X(x0 + (+t[i]! - vb[0]) * k)} ${Y(y0 + (+t[i + 1]! - vb[1]) * k)}`;
    let s = '';
    for (let i = 0; i < t.length;) {
      const op = t[i++]!.toUpperCase();
      if (op === 'M') {
        s += P(i) + ' m ';
        i += 2;
      } else if (op === 'L') {
        s += P(i) + ' l ';
        i += 2;
      } else if (op === 'C') {
        s += `${P(i)} ${P(i + 2)} ${P(i + 4)} c `;
        i += 6;
      } else if (op === 'Z') s += 'h ';
      else i++;
    }
    this.content += `q ${rgb(col)} rg ${s}f Q\n`;
  }
}

/** Nazwa materiału z tekstu opcji listy („Mural Canvas CT – druk 131 cm” → „Mural Canvas CT”). */
export function materialLabel(value: string, optionText: string | undefined): string {
  return value && value !== 'own' && optionText ? optionText.split(' – ')[0]! : '';
}

/** Dane do schematu (cm). Bryty liczone z dokładnych szerokości (bez zaokrąglenia do pikseli). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assemblyModel(
  p: WallParams,
  L: Layout,
  material = '',
  wall?: AssemblyWall,
  _trim = ZUND_TRIM,
): AssemblyModel {
  const n = L.bw.widths.length;
  const ov = p.overlap;
  const bryty: AssemblyBryt[] = [];
  let a = 0;
  for (let i = 0; i < n; i++) {
    const w = L.bw.widths[i]!;
    bryty.push({ nr: i + 1, a, w, from: Math.max(0, a - p.mL), to: Math.min(p.wallW, a + w - p.mL) });
    a += w - ov;
  }
  return { n, ov, bryty, material, corners: wall?.corners ?? [], openings: wall?.openings ?? [] };
}

/** Rysunek jednej strony schematu montażu. */
class AssemblySheet {
  constructor(
    private readonly d: AssemblyPage,
    private readonly p: WallParams,
    private readonly L: Layout,
    private readonly M: AssemblyModel,
  ) {}

  logo(logo: SvgLogo | null, x: number, y: number, h: number): void {
    if (!logo) {
      this.d.text('VALARE', x, y + h * 0.85, h, { bold: true });
      return;
    }
    const vb = logo.viewBox;
    const k = h / vb[3];
    for (const path of logo.paths) this.d.svgPath(path.d, x, y, vb, k, path.white ? WHITE : INK);
  }

  /** Schemat: grafika z podziałem, naddatek, zakłady, wymiary, narożniki i otwory. Zwraca dół rysunku. */
  schema(top: number, maxH: number): number {
    const { d, p, L, M } = this;
    const TW = L.totalWcm;
    const TH = L.totalHcm;
    const bh = 0.38;
    const twoRows = M.ov > 0 && M.n > 1; // paski z szerokościami brytów nad rysunkiem (2 rzędy, gdy zakład)
    const barsH = twoRows ? 2 * bh + 0.07 : bh;
    const left = MG + 1.0;
    const availW = PW - MG - left - 0.2;
    const k = Math.min(availW / TW, (maxH - barsH - 1.6) / TH);
    const w = TW * k;
    const h = TH * k;
    const x0 = left + (availW - w) / 2;
    const y0 = top + barsH + 0.15;
    const Xc = (cm: number): number => x0 + cm * k;
    const B = (L.band / p.dpi) * 2.54;
    const IH = (L.imgH / p.dpi) * 2.54;

    d.rect(x0, y0, w, h, { fill: WHITE });
    d.img('Pano', x0, y0 + B * k, w, IH * k);
    // naddatek: jaśniejsze pole
    const wx = Xc(p.mL);
    const wy = y0 + p.mT * k;
    const ww = p.wallW * k;
    const wh = p.wallH * k;
    const lite: RectStyle = { fill: WHITE, alpha: 'GSlite' };
    if (p.mT > 0) d.rect(x0, y0, w, wy - y0, lite);
    if (p.mB > 0) d.rect(x0, wy + wh, w, y0 + h - wy - wh, lite);
    if (p.mL > 0) d.rect(x0, wy, wx - x0, wh, lite);
    if (p.mR > 0) d.rect(wx + ww, wy, x0 + w - wx - ww, wh, lite);
    // zakłady
    for (let i = 0; i < M.n - 1; i++) {
      const s = M.bryty[i + 1]!.a;
      if (M.ov > 0) d.rect(Xc(s), y0, M.ov * k, h, { fill: GREEN, alpha: 'GSzak' });
      else d.line(Xc(s), y0, Xc(s), y0 + h, INK, 0.03);
    }
    // otwory i narożniki
    for (const o of M.openings) {
      const oy = o.y || 0;
      const oh = o.h == null ? p.wallH - oy : o.h;
      const rx = Xc(p.mL + o.x);
      const ry = y0 + (p.mT + p.wallH - oy - oh) * k;
      d.rect(rx, ry, o.w * k, oh * k, { fill: WHITE, alpha: 'GSopen', stroke: INK, lw: 0.025, dash: [0.12, 0.08] });
      d.text(o.label.toLowerCase(), rx + (o.w * k) / 2, ry + Math.min((oh * k) / 2, 0.5), PTS(7), { align: 'c' });
    }
    for (const c of M.corners) {
      const cx = Xc(p.mL + c.x);
      d.line(cx, y0, cx, y0 + h, ORANGE, 0.035, [0.15, 0.1]);
      d.text(c.label.toLowerCase(), cx, y0 + h + 0.32, PTS(7), { align: 'c', col: ORANGE });
    }
    // obrys ściany i całości
    d.rect(wx, wy, ww, wh, { stroke: INK, lw: 0.02, dash: [0.1, 0.07] });
    d.rect(x0, y0, w, h, { stroke: INK, lw: 0.02 });
    // numery brytów i paski z szerokościami nad rysunkiem
    M.bryty.forEach((b, i) => {
      const by = top + (twoRows && i % 2 ? bh + 0.07 : 0);
      const bx = Xc(b.a);
      const bw = b.w * k;
      d.rect(bx, by, bw, bh, { fill: WHITE, stroke: INK, lw: 0.015 });
      const label = `${b.nr}: ${fmt(b.w)} cm`;
      const size = PTS(7);
      d.text(textWidth(label, size, false) < bw - 0.1 ? label : String(b.nr), bx + bw / 2, by + bh * 0.7, size, {
        align: 'c',
      });
      // numer w środku części widocznej brytu
      const vis0 = i > 0 ? b.a + M.ov : b.a;
      const vis1 = b.a + b.w;
      const r = Math.min(0.36, ((vis1 - vis0) * k) / 2.4);
      if (r > 0.12) {
        const cx = Xc((vis0 + vis1) / 2);
        const cy = y0 + h / 2;
        d.circle(cx, cy, r, WHITE, INK, 0.03);
        d.text(String(b.nr), cx, cy + r * 0.38, r * 1.05, { align: 'c', bold: true });
      }
    });
    // wymiary ściany
    const tk = 0.12;
    const dy = y0 + h + (M.corners.length ? 0.6 : 0.35);
    d.line(wx, dy, wx + ww, dy, INK, 0.02);
    d.line(wx, dy - tk, wx, dy + tk, INK, 0.02);
    d.line(wx + ww, dy - tk, wx + ww, dy + tk, INK, 0.02);
    d.text(`szerokość ściany ${fmt(p.wallW)} cm`, wx + ww / 2, dy + 0.42, PTS(8.5), { align: 'c', bold: true });
    const dx = x0 - 0.35;
    d.line(dx, wy, dx, wy + wh, INK, 0.02);
    d.line(dx - tk, wy, dx + tk, wy, INK, 0.02);
    d.line(dx - tk, wy + wh, dx + tk, wy + wh, INK, 0.02);
    d.text(`wysokość ściany ${fmt(p.wallH)} cm`, dx - 0.15, wy + wh / 2, PTS(8.5), {
      align: 'c',
      bold: true,
      rot: true,
    });
    return dy + 0.55;
  }

  legend(y: number): void {
    const { d, p, M } = this;
    let x = MG;
    const item = (draw: (ix: number, iy: number) => void, label: string): void => {
      draw(x, y - 0.25);
      x += 0.6;
      d.text(label, x, y, PTS(7.5), { col: GRAY });
      x += textWidth(label, PTS(7.5), false) + 0.6;
    };
    item(
      (ix, iy) => d.rect(ix, iy, 0.45, 0.3, { fill: [0xee, 0xf0, 0xf2], stroke: LINE, lw: 0.015 }),
      'naddatek – docinasz na miejscu',
    );
    item((ix, iy) => d.rect(ix, iy, 0.45, 0.3, { stroke: INK, lw: 0.02, dash: [0.1, 0.07] }), 'wymiar ściany');
    if (M.n > 1 && M.ov > 0)
      item(
        (ix, iy) => d.rect(ix, iy, 0.45, 0.3, { fill: GREEN, alpha: 'GSzak' }),
        p.join === 'butt' ? `styk – ${fmt(M.ov)} cm wspólnej grafiki` : `zakład ${fmt(M.ov)} cm`,
      );
    if (M.n > 1 && M.ov === 0)
      item((ix, iy) => d.line(ix + 0.22, iy, ix + 0.22, iy + 0.3, INK, 0.03), 'łączenie na styk');
    if (M.corners.length)
      item((ix, iy) => d.line(ix + 0.22, iy, ix + 0.22, iy + 0.3, ORANGE, 0.035, [0.08, 0.05]), 'narożnik');
    if (M.openings.length)
      item(
        (ix, iy) => d.rect(ix, iy, 0.45, 0.3, { stroke: INK, lw: 0.02, dash: [0.08, 0.05] }),
        'drzwi / okno – wytnij na miejscu',
      );
  }

  /** Tabela brytów; gdy brytów dużo, dzieli się na kolumny (wiersze niższe zamiast gubienia brytów). */
  table(x: number, y: number, maxW: number, maxH: number): void {
    const { d, L, M } = this;
    const cols: [string, number][] = [
      ['Bryt', 1.1],
      ['Szerokość [cm]', 2.4],
      ['Wysokość [cm]', 2.3],
      ['Na ścianie od – do [cm]', 3.6],
    ];
    const tabW = cols.reduce((a, c) => a + c[1], 0);
    const fitGroups = Math.max(1, Math.floor((maxW + 0.5 + 1e-6) / (tabW + 0.5)));
    let rowH = 0.46;
    if (Math.ceil(M.n / Math.max(1, Math.floor((maxH - rowH) / rowH))) > fitGroups)
      rowH = Math.max(0.2, maxH / (Math.ceil(M.n / fitGroups) + 1));
    const size = (PTS(8) * rowH) / 0.46;
    const perCol = Math.max(1, Math.floor((maxH - rowH) / rowH + 1e-9));
    const groups = Math.ceil(M.n / perCol);
    for (let g = 0; g < groups; g++) {
      const gx = x + g * (tabW + 0.5);
      if (gx + tabW > x + maxW + 1e-6) return;
      let cx = gx;
      d.rect(gx, y, tabW, rowH, { fill: [0xf3, 0xf4, 0xf6] });
      for (const [h, w] of cols) {
        d.text(h, cx + 0.12, y + rowH * 0.66, size, { bold: true });
        cx += w;
      }
      M.bryty.slice(g * perCol, (g + 1) * perCol).forEach((b, r) => {
        const ry = y + (r + 1) * rowH;
        d.line(gx, ry + rowH, gx + tabW, ry + rowH, LINE, 0.015);
        const vals = [String(b.nr), fmt(b.w), fmt(L.totalHcm), `${fmt(b.from)} – ${fmt(b.to)}`];
        let vx = gx;
        vals.forEach((v, j) => {
          d.text(v, vx + 0.12, ry + rowH * 0.66, size, { bold: j === 0 });
          vx += cols[j]![1];
        });
      });
    }
  }

  header(logo: SvgLogo | null, date: string): void {
    const { d, p, L, M } = this;
    this.logo(logo, MG, MG, 0.62);
    d.text('Schemat montażu fototapety', PW - MG, MG + 0.5, PTS(15), { align: 'r', bold: true });
    const join =
      M.n < 2
        ? '1 bryt'
        : p.join === 'butt'
          ? `łączenie na styk (${fmt(p.overlap)} cm wspólnej grafiki)`
          : `zakład ${fmt(p.overlap)} cm`;
    const info = [
      `Zlecenie: ${p.orderName || p.order}`,
      `ściana ${fmt(p.wallW)} × ${fmt(p.wallH)} cm`,
      `z naddatkiem ${fmt(L.totalWcm)} × ${fmt(L.totalHcm)} cm`,
      `${M.n} ${plural(M.n)}`,
      join,
      M.material ? `materiał: ${M.material}` : '',
    ]
      .filter(Boolean)
      .join('  ·  ');
    // długa nazwa zlecenia: mniejsza czcionka zamiast ucięcia
    const maxW = PW - 2 * MG;
    const iw = textWidth(info, PTS(8.5), false);
    d.text(info, MG, MG + 1.25, iw > maxW ? (PTS(8.5) * maxW) / iw : PTS(8.5), { col: GRAY });
    d.rect(MG, MG + 1.5, PW - 2 * MG, 0.06, { fill: GREEN });
    d.text(`Wymiary w cm. Grafika na schemacie jest pomniejszona.  ·  ${date}`, MG, PH - 0.7, PTS(7), { col: GRAY });
  }
}

function buildPdf<T>(pages: readonly AssemblyPage[], pano: PdfImage<T>): (Uint8Array | T)[] {
  const enc = new TextEncoder();
  const pdf = new PdfFile<T>();
  const catalog = pdf.add();
  const pagesObj = pdf.add();
  const fontDict = (base: string): string =>
    `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /FirstChar 32 /LastChar 255 /Widths [${helveticaWidths(base.endsWith('Bold')).join(' ')}] ` +
    `/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${PL_NAMES}] >> >>`;
  const f1 = pdf.add([fontDict('Helvetica')]);
  const f2 = pdf.add([fontDict('Helvetica-Bold')]);
  const im = pdf.add([
    `<< /Type /XObject /Subtype /Image /Width ${pano.w} /Height ${pano.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pano.size} >>\nstream\n`,
    pano,
    '\nendstream',
  ]);
  const gs = pdf.add([
    '<< /GSlite << /Type /ExtGState /ca 0.6 >> /GSzak << /Type /ExtGState /ca 0.45 >> /GSopen << /Type /ExtGState /ca 0.5 >> >>',
  ]);
  const res = pdf.add([
    `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << /Pano ${im} 0 R >> /ExtGState ${gs} 0 R >>`,
  ]);
  const W = (PW * PT).toFixed(3);
  const H = (PH * PT).toFixed(3);
  const kids = pages.map(d => {
    const content = pdf.add([`<< /Length ${enc.encode(d.content).length} >>\nstream\n`, d.content, '\nendstream']);
    return pdf.add([
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} 0 R /Contents ${content} 0 R >>`,
    ]);
  });
  pdf.set(catalog, [`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`]);
  pdf.set(pagesObj, [`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`]);
  return pdf.bytes(catalog);
}

/** Schemat montażu (PDF). p i L muszą przejść walidację (jak przycisk w starym programie). */
export function assemblyPdf<T>(p: WallParams, L: Layout, o: AssemblyOptions<T>): AssemblyPdf<T> {
  const M = assemblyModel(p, L, o.material, o.wall);
  const top = MG + 2.1;
  // Schemat dostaje miejsce, które zostaje nad tabelą (maks. 11 wierszy).
  const tableH = (Math.min(M.n, 11) + 1) * 0.46;
  const schemaMax = Math.max(7, Math.min(13, PH - 1.1 - top - 0.85 - 0.35 - tableH));
  const d = new AssemblyPage();
  const sheet = new AssemblySheet(d, p, L, M);
  const schemaBottom = sheet.schema(top, schemaMax);
  sheet.legend(schemaBottom + 0.25);
  const tTop = schemaBottom + 0.85;
  sheet.table(MG, tTop, PW - 2 * MG, PH - 1.1 - tTop);
  sheet.header(o.logo === undefined ? VALARE_LOGO : o.logo, (o.now ?? new Date()).toLocaleDateString('pl-PL'));
  // Zawsze jedna strona (stary kod miał numerację stron „strona i/n” na wypadek wielu stron – nieużywana).
  return { parts: buildPdf([d], o.pano), name: `schemat-montazu_${p.order}.pdf`, pages: 1 };
}

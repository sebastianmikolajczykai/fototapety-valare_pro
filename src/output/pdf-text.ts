// Tekst w PDF: kodowanie znaków i szerokości czcionki Helvetica – odpowiednik pdfCodes/pdfText/textWExact
// (stary bryty.js) i tabeli AFM z montaz.js. Wspólne dla PDF produkcyjnego i schematu montażu.
// Czcionka: Helvetica z kodowaniem WinAnsi, polskie litery na własnych kodach 128–143 (/Differences w PDF).

/** Polskie litery w kolejności kodów 128–143 (ó/Ó są w WinAnsi). */
export const PL = 'ąćęłńśźżĄĆĘŁŃŚŹŻ';
export const PL_NAMES =
  '/aogonek /cacute /eogonek /lslash /nacute /sacute /zacute /zdotaccent /Aogonek /Cacute /Eogonek /Lslash /Nacute /Sacute /Zacute /Zdotaccent';

/** Kody znaków w czcionce PDF; nieobsługiwany znak → „?”. Tekst normalizowany do NFC (np. „a” + ogonek z macOS → „ą”). */
export function pdfCodes(s: string): number[] {
  return [...String(s).normalize('NFC')].map(ch => {
    const k = PL.indexOf(ch);
    const code =
      k >= 0
        ? 128 + k
        : ch === 'ó'
          ? 0xf3
          : ch === 'Ó'
            ? 0xd3
            : ch === '×'
              ? 0xd7
              : ch === '–'
                ? 0x96
                : ch.charCodeAt(0);
    return code > 255 ? 63 : code;
  });
}

/** Tekst do operatora Tj: nawiasy i „\\” poprzedzone „\\”, kody powyżej 126 zapisane ósemkowo. */
export function pdfText(s: string): string {
  let o = '';
  for (const code of pdfCodes(s)) {
    const c = String.fromCharCode(code);
    o += c === '(' || c === ')' || c === '\\' ? '\\' + c : code > 126 ? '\\' + code.toString(8).padStart(3, '0') : c;
  }
  return o;
}

// Szerokości znaków Helvetica / Helvetica-Bold (AFM, 1/1000 em) dla kodów 32–126 i polskich liter.
// Bez /Widths część przeglądarek PDF brała szerokości znaków WinAnsi z kodów 128–143 i „zjadała” spację.
// prettier-ignore
const AFM = {
  r: '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584',
  b: '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584',
  // ą ć ę ł ń ś ź ż Ą Ć Ę Ł Ń Ś Ź Ż
  plR: '556 500 556 222 556 500 500 500 667 722 667 556 722 667 611 611',
  plB: '556 556 556 278 611 556 500 500 722 722 667 611 722 667 611 611',
};

const cache = new Map<boolean, readonly number[]>();

/** Szerokości dla kodów 32–255 w naszym kodowaniu (tablica /Widths w PDF, 224 pozycje). */
export function helveticaWidths(bold: boolean): number[] {
  let w = cache.get(bold);
  if (!w) {
    const ascii = (bold ? AFM.b : AFM.r).split(' ').map(Number);
    const pl = (bold ? AFM.plB : AFM.plR).split(' ').map(Number);
    const out: number[] = [];
    for (let c = 32; c <= 255; c++) {
      if (c <= 126) out.push(ascii[c - 32]!);
      else if (c >= 128 && c <= 143) out.push(pl[c - 128]!);
      else if (c === 0x96)
        out.push(556); // półpauza
      else if (c === 0xb7)
        out.push(278); // ·
      else if (c === 0xd7)
        out.push(584); // ×
      else if (c === 0xd3)
        out.push(778); // Ó
      else if (c === 0xf3)
        out.push(bold ? 611 : 556); // ó
      else out.push(556);
    }
    w = out;
    cache.set(bold, w);
  }
  return [...w];
}

/** Przybliżona szerokość tekstu Helvetica (opisy na schemacie PDF produkcyjnego). */
export const textWidthApprox = (s: string, size: number): number => s.length * size * 0.52;

/**
 * Dokładna szerokość (do szerokości strony pod nazwę zlecenia): wielkie litery są o 30–80% szersze
 * od przybliżenia. Nigdy mniejsza niż przybliżona (jak w starym programie).
 */
export function textWidthExact(s: string, size: number): number {
  const W = helveticaWidths(false);
  return Math.max(
    textWidthApprox(s, size),
    (pdfCodes(s).reduce((a, c) => a + (c >= 32 ? W[c - 32]! : 556), 0) / 1000) * size,
  );
}

/** Szerokość tekstu na schemacie montażu (bez normalizacji NFC; znaki spoza 32–255 liczone jak „?”). */
export function textWidth(s: string, size: number, bold: boolean): number {
  const tab = helveticaWidths(bold);
  let w = 0;
  for (const ch of String(s)) {
    const k = PL.indexOf(ch);
    let code = k >= 0 ? 128 + k : ch === '–' ? 0x96 : ch.charCodeAt(0);
    if (code < 32 || code > 255) code = 63;
    w += tab[code - 32]!;
  }
  return (w / 1000) * size;
}

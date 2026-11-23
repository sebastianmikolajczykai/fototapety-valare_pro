// Rozdzielczość (DPI) w nagłówku JFIF pliku JPG – odpowiednik withDpi ze starego bryty.js.
// Przeglądarka zapisuje JPG z gęstością 1:1 bez jednostek; drukarnia odczytuje z nagłówka np. 150 DPI.
// Działa na pierwszych 18 bajtach pliku – reszta (setki MB) zostaje bez kopiowania.

/** Ile bajtów początku pliku potrzeba (znacznik SOI, APP0, „JFIF”, wersja, jednostki, gęstość X/Y). */
export const JFIF_HEADER_BYTES = 18;

/**
 * Nowy początek pliku z jednostką „cale” i gęstością dpi × dpi.
 * null = to nie jest JPG z nagłówkiem JFIF (np. EXIF) albo za mało bajtów – plik zostaje bez zmian.
 */
export function setJfifDpi(header: Uint8Array, dpi: number): Uint8Array | null {
  const b = header.slice(0, JFIF_HEADER_BYTES);
  const isJfif =
    b.length >= JFIF_HEADER_BYTES &&
    b[2] === 0xff &&
    b[3] === 0xe0 &&
    String.fromCharCode(b[6]!, b[7]!, b[8]!, b[9]!) === 'JFIF';
  if (!isJfif) return null;
  b[13] = 1;
  b[14] = dpi >> 8;
  b[15] = dpi & 255;
  b[16] = dpi >> 8;
  b[17] = dpi & 255;
  return b;
}

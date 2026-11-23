// Stałe produkcyjne i limity. Źródła w komentarzach (ustalenia z ARPI i Sebastianem, cennik Valare 2024).

/** Pasek thru cut (przecięcie na wylot), 0,5 cm góra i dół – kolor odczytany z brytów drukarni 005-21: RGB (0,163,212) = 100% C. */
export const THRU_CM = 0.5;
export const THRU_RGB = 'rgb(0,163,212)';

/** Uwagi ARPI 28.10.2026: na styk sąsiednie bryty mają 1 cm wspólnej grafiki. */
export const BUTT_OVERLAP_CM = 1;

/** Ustalenie Sebastiana 20.10.2026: węższego paska niż 5 cm raczej się nie tnie (ostrzeżenie, nie blokada). */
export const MIN_LAST_CM = 5;

export const MAX_BRYTY = 30;
export const MAX_MARGIN_CM = 10;
export const MIN_DPI = 50;

/** Rozdzielczości do wyboru w formularzu (krok „Pliki do produkcji”). */
export const DPI_OPTIONS: readonly number[] = [100, 150, 200, 300];

/** Jakość zapisu JPG brytów. */
export const JPEG_QUALITY = 0.92;

/** Limity przeglądarki (Chromium: bok 65 535 px, pole 268 435 456 px – z zapasem). */
export const BROWSER_MAX_SIDE_PX = 32000;
export const BROWSER_MAX_AREA_PX = 260e6;

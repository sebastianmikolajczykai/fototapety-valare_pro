// Jednostki: centymetry ↔ piksele druku. 1 cal = 2,54 cm.
export const CM_PER_INCH = 2.54;

/** Centymetry na piksele przy danej rozdzielczości (bez zaokrąglenia). */
export const cmToPx = (cm: number, dpi: number): number => (cm / CM_PER_INCH) * dpi;

/** Piksele zaokrąglone w górę; poprawka 1e-6 chroni przed np. 300,0000000001 -> 301. */
export const pxCeil = (cm: number, dpi: number): number => Math.ceil(cmToPx(cm, dpi) - 1e-6);

/** Piksele na centymetry. */
export const pxToCm = (px: number, dpi: number): number => (px / dpi) * CM_PER_INCH;

/** Liczba z pola formularza: akceptuje przecinek („122,7”), pusty tekst = NaN. */
export const parseNum = (v: unknown): number => parseFloat(String(v).replace(',', '.'));

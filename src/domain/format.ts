// Liczby i odmiana po polsku – tak samo jak w starym programie (toLocaleString 'pl-PL').
const LOCALE = 'pl-PL';

/** Liczba z maks. 1 miejscem po przecinku, np. 122,7. */
export const f1 = (x: number): string => x.toLocaleString(LOCALE, { maximumFractionDigits: 1 });

/** Liczba z maks. 2 miejscami po przecinku, np. 1,25. */
export const f2 = (x: number): string => x.toLocaleString(LOCALE, { maximumFractionDigits: 2 });

/** Odmiana słowa „bryt”: 1 bryt, 2–4 bryty, 5+ brytów (12–14 brytów). */
export function plural(n: number): string {
  if (n === 1) return 'bryt';
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20);
  return few ? 'bryty' : 'brytów';
}

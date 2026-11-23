// Przebieg krok po kroku – teksty pomocy (czysta część starego kroki.js).
export {};
const todo = (): never => {
  throw new Error('nie zaimplementowano');
};
export const needInfo = todo as (...a: unknown[]) => { text: string; setTo: number | null };
export const widthsHint = todo as (...a: unknown[]) => string;
export const wallSummary = todo as (...a: unknown[]) => string;
export const marginsSummary = todo as (...a: unknown[]) => string;
export const joinSummary = todo as (...a: unknown[]) => string;
export const splitSummary = todo as (...a: unknown[]) => string;
export const fileSummary = todo as (...a: unknown[]) => string;
export const pricingSummary = todo as (...a: unknown[]) => string;
export const outputSummary = todo as (...a: unknown[]) => string;
export const safeLayout = todo as (...a: unknown[]) => import('./layout').Layout | null;

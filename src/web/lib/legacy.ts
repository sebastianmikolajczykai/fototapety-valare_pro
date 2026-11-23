// Stan strony głównej (src/web/bryty.ts) dla pozostałych modułów. Każdy moduł strony jest osobnym skryptem,
// więc wspólny stan idzie przez jeden obiekt window.Bryty (zamiast globalnych zmiennych starego bryty.js:
// img, crop, params, render, changed, canvasPoint, renderPano). Odczyt w chwili wywołania – kolejność
// ładowania skryptów (część modułów ładuje się przed bryty.js) nie ma znaczenia.
import type { Crop, Layout, WallParams } from '../../domain/layout';

/** Zdjęcie wczytane na stronie (z ewentualnym zmniejszonym podglądem). */
export type PageImage = HTMLImageElement & { preview?: HTMLCanvasElement };

export interface BrytyBridge {
  img(): PageImage | null;
  crop: Crop;
  params(): WallParams;
  render(): void;
  changed(): void;
  canvasPoint(e: { clientX: number; clientY: number }): { x: number; y: number };
  renderPano(L: Layout, maxW: number): Promise<{ blob: Blob; w: number; h: number }>;
}

const bridge = (): BrytyBridge => (window as unknown as { Bryty: BrytyBridge }).Bryty;

export const page = {
  img: (): PageImage | null => bridge().img(),
  crop: (): Crop => bridge().crop,
  params: (): WallParams => bridge().params(),
  /** Przerysowanie podglądu bez kasowania wygenerowanych plików. */
  render: (): void => bridge().render(),
  /** Zmiana ustawień: przeliczenie i skasowanie nieaktualnych plików. */
  changed: (): void => bridge().changed(),
  canvasPoint: (e: PointerEvent): { x: number; y: number } => bridge().canvasPoint(e),
  /** Podgląd całości (JPG, bez pasków) o szerokości maks. maxW px. */
  renderPano: (L: Layout, maxW: number): Promise<{ blob: Blob; w: number; h: number }> => bridge().renderPano(L, maxW),
};

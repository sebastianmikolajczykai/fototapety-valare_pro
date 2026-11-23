// Dostęp do stanu głównego skryptu strony (public/bryty.js), który nie jest jeszcze przepisany na TypeScript.
// bryty.js to zwykły skrypt: jego `let img`, `const crop` i funkcje są w globalnym zasięgu strony, więc moduły TS
// czytają je po nazwie. Jedno miejsce z tymi odwołaniami – po przepisaniu bryty.js ten plik zniknie.
import type { Crop, WallParams } from '../../domain/layout';

/** Zdjęcie wczytane na stronie (z ewentualnym zmniejszonym podglądem). */
export type PageImage = HTMLImageElement;

declare const img: PageImage | null;
declare const crop: Crop;
declare function params(): WallParams;
declare function render(): void;
declare function canvasPoint(e: PointerEvent): { x: number; y: number };

export const page = {
  img: (): PageImage | null => img,
  crop: (): Crop => crop,
  params: (): WallParams => params(),
  /** Przerysowanie podglądu bez kasowania wygenerowanych plików. */
  render: (): void => render(),
  canvasPoint: (e: PointerEvent): { x: number; y: number } => canvasPoint(e),
};

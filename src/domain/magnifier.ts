// Lupa (czysta część starego lupa.js).
import type { Fit, Layout } from './layout';
export const MAGNIFIER_MAX = 4;
const todo = (): never => {
  throw new Error('nie zaimplementowano');
};
export class ZoomView {
  s = 1;
  tx = 0;
  ty = 0;
  fitS = 1;
  constructor(
    readonly iw: number,
    readonly ih: number,
  ) {}
  get label(): string {
    return todo();
  }
  get canZoomIn(): boolean {
    return todo();
  }
  get canZoomOut(): boolean {
    return todo();
  }
  get pixelated(): boolean {
    return todo();
  }
  fitAll(_vw: number, _vh: number): void {
    todo();
  }
  zoomAt(_ns: number, _cx: number, _cy: number, _vw: number, _vh: number): void {
    todo();
  }
  moveTo(_tx: number, _ty: number, _vw: number, _vh: number): void {
    todo();
  }
  resize(_vw: number, _vh: number): void {
    todo();
  }
}
export function magnifierFrame(_L: Layout, _F: Fit): { x: number; y: number; w: number; h: number; seams: number[] } {
  return todo();
}

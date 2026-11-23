// RED: pusta implementacja – testy muszą paść.
export const AI_STYLES: readonly (readonly [string, string])[] = [];
export const STYLE_PROMPTS: Readonly<Record<string, string | null>> = {};
export type AiKind = 'generate' | 'edit' | 'upscale';
export interface PrintTarget {
  wCm: number;
  hCm: number;
  dpi: number;
  wPx: number;
  hPx: number;
  aspect: number;
}
export interface TargetFields {
  wallW: number;
  wallH: number;
  mT: number;
  mB: number;
  mL: number;
  mR: number;
  dpi: number;
}
export interface AiHealth {
  generate?: boolean;
  upscale?: boolean;
  upscaler?: string | null;
  provider?: string;
  model?: string;
}
export const printTarget = (_f: TargetFields): PrintTarget => ({ wCm: 0, hCm: 0, dpi: 0, wPx: 0, hPx: 0, aspect: 0 });
export const targetHint = (_t: PrintTarget): string => '';
export const previewSize = (_a: number, _l: number): { w: number; h: number } => ({ w: 0, h: 0 });
export const demoSeed = (_s: string): number => 0;
export const demoRandom =
  (_s: number): (() => number) =>
  () =>
    0;
export const demoCaption = (_k: AiKind, _i: number): string => '';
export const generatedMessage = (_d: boolean, _c: number, _h: boolean): string => '';
export const progressMessage = (_d: number, _t: number, _e?: string): string => '';
export const modeHtml = (_a: AiHealth): string => '';
export const qualityHint = (_u: string | null | undefined): string => '';
export const qualityButtonHidden = (_s: {
  busy: boolean;
  pending: boolean;
  upscale: boolean;
  badgeClass: string;
}): boolean => true;
export const handedOverMessage = (_w: number, _h: number, _t: PrintTarget): string => '';
export const upscalingMessage = (_t: PrintTarget, _u: string | null | undefined): string => '';
export const aiFileName = (_t: string): string => '';
export const upscaledName = (_n: string, _t: string): string => '';
export const referenceScale = (_w: number, _h: number): number => 0;
export class ViewerZoom {
  k = 0;
  x = 0;
  y = 0;
  fit = 0;
  fitTo(_W: number, _H: number, _w: number, _h: number): void {}
  zoomAt(_f: number, _x: number, _y: number): void {}
  get zoomed(): boolean {
    return false;
  }
  get transform(): string {
    return '';
  }
}

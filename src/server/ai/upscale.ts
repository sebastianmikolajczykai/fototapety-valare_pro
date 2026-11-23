// Powiększanie grafiki do rozdzielczości druku – część wspólna (upscalery: Replicate, Topaz, lokalny Real-ESRGAN).
// Zależności zewnętrzne (zmienne środowiskowe, fetch, zegar, czekanie, log) wstrzykiwane – testy działają na atrapach.
import type { ServerResponse } from 'node:http';
import type { Send } from '../respond';

export interface AiDeps {
  /** Zmienne środowiskowe (klucze API tylko stąd). */
  env: Readonly<Record<string, string | undefined>>;
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (...a: unknown[]) => void;
}

/** Zależności produkcyjne: process.env, globalny fetch, zegar systemowy, console.log. */
export function systemDeps(): AiDeps {
  return {
    env: process.env,
    fetch: (...a) => fetch(...a),
    now: Date.now,
    sleep: ms => new Promise(ok => setTimeout(ok, ms)),
    log: (...a) => console.log(...a),
  };
}

/** Dane od przeglądarki (sprawdzone przez AiService: source = data URL, targetPx = dodatnie liczby). */
export interface UpscaleRequest {
  source: string;
  targetPx: { w: number; h: number };
  sourceWidth?: unknown;
  sourceHeight?: unknown;
  style?: unknown;
}

export interface Upscaler {
  ready(): boolean;
  handle(p: UpscaleRequest, res: ServerResponse, send: Send): Promise<void>;
}

/** Klucz ze zmiennej środowiskowej (przycięty); brak = null. */
export const envKey = (env: AiDeps['env'], name: string): string | null => env[name]?.trim() || null;

/** Maks. bok wyniku Topaz. */
export const MAX_SIDE = 32000;

/** Wymiar wyniku pokrywający cały wymiar druku (bez pasów), maks. 32 000 px na bok. */
export function outputSize(srcW: number, srcH: number, target: { w: number; h: number }): { w: number; h: number } {
  let s = Math.max(target.w / srcW, target.h / srcH);
  s = Math.min(s, MAX_SIDE / srcW, MAX_SIDE / srcH);
  return { w: Math.round(srcW * s), h: Math.round(srcH * s) };
}

/** Model Topaz: zdjęcia → „Standard V2”, ilustracje/grafika → „CGI” (DO WALIDACJI na wydruku próbnym); override = TOPAZ_MODEL. */
export const modelFor = (style?: unknown, override?: string): string =>
  override || (style === 'foto' ? 'Standard V2' : 'CGI');

/** Wymiar PNG z nagłówka (IHDR), bez dekodowania obrazu. */
export function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG')
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  return null;
}

/** Wymiar źródła: z nagłówka PNG, inaczej z danych przeglądarki (sourceWidth/sourceHeight). */
export const sourceSize = (buf: Buffer, p: UpscaleRequest): { w: number; h: number } =>
  pngSize(buf) ?? { w: Number(p.sourceWidth), h: Number(p.sourceHeight) };

/** Śledzi rozłączenie przeglądarki (zamknięta karta) – wtedy przestajemy czekać i nie pobieramy wyniku. */
export function watchGone(res: ServerResponse): () => boolean {
  let gone = false;
  res.on('close', () => {
    if (!res.writableEnded) gone = true;
  });
  return () => gone;
}

/** Odpowiedź JSON albo {} (jak `.json().catch(() => ({}))`). */
export const jsonOrEmpty = (r: Response): Promise<Record<string, unknown>> =>
  r.json().then(
    j => (j && typeof j === 'object' ? (j as Record<string, unknown>) : {}),
    () => ({}),
  );

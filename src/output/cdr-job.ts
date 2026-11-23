// Zlecenie zapisu .cdr: przeglądarka wysyła opis arkusza (te same operacje rysunku co PDF) i pliki JPG,
// serwer z CorelDRAW (PowerShell + COM) składa z nich plik .cdr. Odpowiednik makeCdr (bryty.js)
// i parseCdrJob (serwer-fototapety.js). Format żądania: [długość opisu: 4 bajty LE][opis JSON][dane plików po kolei].
//
// UWAGA (znany błąd starego programu, decyzja Sebastiana): link = true – .cdr linkuje JPG ścieżką bezwzględną,
// więc po przeniesieniu lub wysłaniu pliku brak obrazów (potwierdzone 06.11.2026). Zostawione jak było,
// żeby porównanie stary/nowy było bajt w bajt; zmiana = jeden parametr (LINK_IMAGES).
import type { WallParams } from '../domain/layout';
import { OpsRecorder, type ProductionSheet, type SheetOp } from './sheet';

export const CDR_MAX_FILES = 64;
const MAX_OPS = 10000;
const MAX_TEXT = 500;
const LINK_IMAGES = true;

export interface CdrJob {
  name: string;
  unit: 'cm';
  link: boolean;
  pageW: number;
  pageH: number;
  ops: SheetOp[];
  files: { name: string; size: number }[];
}

/** Błąd danych z przeglądarki (serwer odpowiada kodem 400 i tym komunikatem). */
export class CdrJobError extends Error {
  readonly status = 400;
}

/** Opis arkusza. sizes: rozmiary plików [podgląd całości, bryt 1, bryt 2, …] w bajtach. */
export function cdrJob(sheet: ProductionSheet, p: WallParams, sizes: readonly number[]): CdrJob {
  const rec = new OpsRecorder();
  sheet.draw(rec);
  const { w, h } = sheet.pageSize();
  const names = ['pano.jpg', ...sizes.slice(1).map((_, i) => `bryt_${i + 1}.jpg`)];
  return {
    name: `bryty_${p.order}.cdr`,
    unit: 'cm',
    link: LINK_IMAGES,
    pageW: w,
    pageH: h,
    ops: rec.ops,
    files: names.map((name, i) => ({ name, size: sizes[i]! })),
  };
}

/** Treść żądania POST /api/cdr (dane plików bez kopiowania). */
export function cdrRequestParts<T>(job: CdrJob, files: readonly T[]): (Uint8Array | T)[] {
  const head = new TextEncoder().encode(JSON.stringify(job));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, head.length, true);
  return [len, head, ...files];
}

const OP_TYPES = ['img', 'rectF', 'rectS', 'line', 'text'];

/**
 * Sprawdza opis arkusza, zanim cokolwiek trafi na dysk i do CorelDRAW: nazwy plików tylko [litery cyfry . _ -].jpg,
 * rozmiary = dokładnie długość danych, obrazy w ops tylko z listy files (inaczej Corel mógłby zaimportować
 * dowolny plik z dysku, np. "..\\..\\x.jpg"). dataStart = początek danych pierwszego pliku.
 */
export function parseCdrJob(body: Uint8Array): CdrJob & { dataStart: number } {
  const bad = (msg: string): CdrJobError => new CdrJobError(msg);
  if (body.length < 4) throw bad('Niekompletne dane z przeglądarki.');
  const len = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true);
  if (len < 2 || 4 + len > body.length) throw bad('Niekompletne dane z przeglądarki.');
  let job: unknown;
  try {
    job = JSON.parse(new TextDecoder().decode(body.subarray(4, 4 + len)));
  } catch {
    throw bad('Niepoprawny opis arkusza.');
  }
  const j = job as Record<string, unknown> | null;
  if (!j || typeof j !== 'object' || !Array.isArray(j.files) || !Array.isArray(j.ops))
    throw bad('Niepoprawny opis arkusza.');
  if (j.files.length < 1 || j.files.length > CDR_MAX_FILES) throw bad('Niepoprawna liczba plików.');
  const names = new Set<string>();
  let total = 0;
  for (const f of j.files as { name?: unknown; size?: unknown }[]) {
    if (!f || typeof f.name !== 'string' || !/^[\w.-]{1,100}\.jpg$/.test(f.name) || f.name.startsWith('.'))
      throw bad('Niepoprawna nazwa pliku.');
    if (!Number.isSafeInteger(f.size) || (f.size as number) < 0) throw bad('Niepoprawny rozmiar pliku.');
    if (names.has(f.name)) throw bad('Powtórzona nazwa pliku.');
    names.add(f.name);
    total += f.size as number;
  }
  if (4 + len + total !== body.length) throw bad('Niekompletne dane z przeglądarki.');
  const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!fin(j.pageW) || !fin(j.pageH) || j.pageW <= 0 || j.pageH <= 0) throw bad('Niepoprawny wymiar arkusza.');
  if (j.ops.length > MAX_OPS) throw bad('Za dużo elementów arkusza.');
  for (const op of j.ops as { t?: unknown; file?: unknown; s?: unknown }[]) {
    if (!op || !OP_TYPES.includes(op.t as string)) throw bad('Niepoprawny element arkusza.');
    if (op.t === 'img' && !names.has(op.file as string)) throw bad('Obraz spoza przesłanych plików.');
    if (op.t === 'text' && (typeof op.s !== 'string' || op.s.length > MAX_TEXT))
      throw bad('Niepoprawny tekst arkusza.');
  }
  return Object.assign(j, { dataStart: 4 + len }) as unknown as CdrJob & { dataStart: number };
}

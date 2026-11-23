// Wzorce nagrane ze starego programu (tests/golden/record-old.mjs). NaN/Infinity zapisane jako { "$n": ... }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/golden');
const SPECIAL: Record<string, number> = { NaN: NaN, Inf: Infinity, '-Inf': -Infinity, '-0': -0 };

function decode(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === '$n') return SPECIAL[String(o.$n)];
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

export function golden<T>(name: string): T {
  return decode(JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'))) as T;
}

export const fromBase64 = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));
export const toBase64 = (u: Uint8Array): string => Buffer.from(u).toString('base64');

function encode(v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $n: 'NaN' };
    if (v === Infinity) return { $n: 'Inf' };
    if (v === -Infinity) return { $n: '-Inf' };
    if (Object.is(v, -0)) return { $n: '-0' };
    return v;
  }
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, encode(x)]),
    );
  return v;
}

/** Wartość po zapisie i odczycie JSON – tak jak wzorzec (np. bez właściwości tablicy spoza indeksów). */
export const asJson = <T>(v: T): T => decode(JSON.parse(JSON.stringify(encode(v)))) as T;

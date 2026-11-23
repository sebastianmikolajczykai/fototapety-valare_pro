import { describe, expect, it } from 'vitest';
import { Crc32, ZIP_MAX_BYTES, zipParts, type ZipEntry } from '../../../src/output/zip';
import { fromBase64, golden, toBase64 } from '../../support/golden';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const entry = (name: string, data: Uint8Array): ZipEntry<Uint8Array> => ({
  name,
  size: data.length,
  crc: new Crc32().update(data).digest(),
  data,
});

describe('CRC-32', () => {
  it('wartości wzorcowe: „abc” = 0x352441C2, puste = 0', () => {
    expect(new Crc32().update(enc('abc')).digest()).toBe(0x352441c2);
    expect(new Crc32().digest()).toBe(0);
  });
  it('liczenie kawałkami daje to samo co w całości', () => {
    const data = enc('123456789'.repeat(100));
    const c = new Crc32();
    for (let i = 0; i < data.length; i += 37) c.update(data.subarray(i, i + 37));
    expect(c.digest()).toBe(new Crc32().update(data).digest());
    expect(new Crc32().update(enc('123456789')).digest()).toBe(0xcbf43926);
  });
});

describe('ZIP bez kompresji', () => {
  it('nagłówek lokalny, dane w oryginale (bez kopiowania), katalog i zakończenie', () => {
    const data = enc('abc');
    const parts = zipParts([entry('a.txt', data)]);
    expect(parts).toContain(data);
    const z = concat(parts);
    expect([...z.slice(0, 4)]).toEqual([0x50, 0x4b, 3, 4]);
    expect([...z.slice(-22, -18)]).toEqual([0x50, 0x4b, 5, 6]);
  });
  it('polskie znaki w nazwie (UTF-8)', () => {
    const z = concat(zipParts([entry('bryt_ż.jpg', enc('x'))]));
    expect(z[26]).toBe(enc('bryt_ż.jpg').length);
  });
  it('ponad 4 GB: czytelny błąd', () => {
    const big: ZipEntry<null> = { name: 'a', size: ZIP_MAX_BYTES, crc: 0, data: null };
    expect(() => zipParts([big])).toThrow('ZIP ponad 4 GB – pobierz pliki pojedynczo.');
  });
});

describe('zgodność ze starym programem', () => {
  it('nagrane archiwa bajt w bajt', () => {
    for (const c of golden<{ files: { name: string; b64: string }[]; zip: string }[]>('zip')) {
      const parts = zipParts(c.files.map(f => entry(f.name, fromBase64(f.b64))));
      expect(toBase64(concat(parts))).toBe(c.zip);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { JFIF_HEADER_BYTES, setJfifDpi } from '../../../src/output/jfif';
import { fromBase64, golden, toBase64 } from '../../support/golden';

// Początek pliku JPG z nagłówkiem JFIF (APP0): FF D8 FF E0, długość, „JFIF\0”, wersja, jednostki, gęstość X/Y.
const head = (): Uint8Array =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1]);

describe('JPG: zapis rozdzielczości (DPI) w nagłówku JFIF', () => {
  it('150 DPI: jednostka = cale, gęstość 150 × 150', () => {
    const out = setJfifDpi(head(), 150)!;
    expect([...out.slice(13, 18)]).toEqual([1, 0, 150, 0, 150]);
    expect([...out.slice(0, 13)]).toEqual([...head().slice(0, 13)]);
  });
  it('300 DPI zapisane na dwóch bajtach (1 × 256 + 44)', () => {
    expect([...setJfifDpi(head(), 300)!.slice(14, 16)]).toEqual([1, 44]);
  });
  it('nie zmienia danych wejściowych', () => {
    const h = head();
    setJfifDpi(h, 200);
    expect(h).toEqual(head());
  });
  it('bez nagłówka JFIF albo za krótki: null (plik zostaje bez zmian)', () => {
    const exif = head();
    exif[3] = 0xe1;
    expect(setJfifDpi(exif, 150)).toBeNull();
    expect(setJfifDpi(head().slice(0, 10), 150)).toBeNull();
    expect(JFIF_HEADER_BYTES).toBe(18);
  });
});

describe('zgodność ze starym programem', () => {
  it('nagrane nagłówki', () => {
    for (const c of golden<{ b64: string; dpi: number; out: string }[]>('jfif')) {
      const src = fromBase64(c.b64);
      const patched = setJfifDpi(src.slice(0, JFIF_HEADER_BYTES), c.dpi);
      const whole = patched ? new Uint8Array([...patched, ...src.slice(JFIF_HEADER_BYTES)]) : src;
      expect(toBase64(whole), c.b64).toBe(c.out);
    }
  });
});

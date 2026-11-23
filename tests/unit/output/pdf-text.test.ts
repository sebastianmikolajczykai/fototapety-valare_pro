import { describe, expect, it } from 'vitest';
import {
  PL_NAMES,
  helveticaWidths,
  pdfCodes,
  pdfText,
  textWidth,
  textWidthApprox,
  textWidthExact,
} from '../../../src/output/pdf-text';
import { golden } from '../../support/golden';

describe('tekst w PDF (Helvetica, WinAnsi + polskie litery na kodach 128–143)', () => {
  it('polskie litery na własnych kodach, ó/Ó/×/– z WinAnsi, inne znaki spoza 0–255 = „?”', () => {
    expect(pdfCodes('ąŻ')).toEqual([128, 143]);
    expect(pdfCodes('óÓ×–')).toEqual([0xf3, 0xd3, 0xd7, 0x96]);
    expect(pdfCodes('€')).toEqual([63]);
  });
  it('litera z ogonkiem wklejona w postaci rozłożonej (macOS) = jedna litera', () => {
    expect(pdfCodes('ą')).toEqual([128]);
  });
  it('nawiasy i ukośnik odwrotny poprzedzone „\\”, kody > 126 ósemkowo', () => {
    expect(pdfText('(a)\\')).toBe('\\(a\\)\\\\');
    expect(pdfText('ł')).toBe('\\203');
  });
  it('tabela szerokości: 224 kody (32–255), spacja 278, ł regular 222 / bold 278', () => {
    const r = helveticaWidths(false);
    expect(r).toHaveLength(224);
    expect(r[0]).toBe(278);
    expect(r[131 - 32]).toBe(222);
    expect(helveticaWidths(true)[131 - 32]).toBe(278);
  });
  it('szerokość tekstu: dokładna, nie mniejsza niż przybliżona', () => {
    expect(textWidthApprox('abcd', 10)).toBeCloseTo(20.8, 10);
    expect(textWidthExact('WWWW', 10)).toBeCloseTo(37.76, 10);
    expect(textWidthExact('iiii', 10)).toBeCloseTo(20.8, 10);
    expect(textWidth('ł–', 10, false)).toBeCloseTo(7.78, 10);
    expect(textWidth('\u0001', 10, true)).toBeCloseTo(6.11, 10);
  });
});

describe('zgodność ze starym programem', () => {
  const G = golden<{
    widthsR: string;
    widthsB: string;
    plNames: string;
    codes: { s: string; codes: number[]; text: string; w: number }[];
  }>('pdf-text');
  it('tabele szerokości i nazwy znaków', () => {
    expect(helveticaWidths(false).join(' ')).toBe(G.widthsR);
    expect(helveticaWidths(true).join(' ')).toBe(G.widthsB);
    expect(PL_NAMES).toBe(G.plNames);
  });
  it('kody, tekst PDF i szerokości dla nagranych napisów', () => {
    for (const c of G.codes) {
      expect(pdfCodes(c.s), c.s).toEqual(c.codes);
      expect(pdfText(c.s)).toBe(c.text);
      expect(textWidthExact(c.s, 10)).toBe(c.w);
    }
  });
});

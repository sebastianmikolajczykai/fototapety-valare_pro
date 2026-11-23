import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import { productionPdf, type PdfImage } from '../../../src/output/production-pdf';
import { concat, enc } from '../../support/bytes';
import { golden, toBase64 } from '../../support/golden';
import { P005 } from '../../support/params';

const img = (s: string, w = 0, h = 0): PdfImage<Uint8Array> => ({ data: enc(s), size: enc(s).length, w, h });
const build = (p: WallParams, panoW = 4000, panoH = 3063) => {
  const L = computeLayout(p);
  const jpegs = L.bWs.map((w, i) => img(`JPEG-${i}-${w}x${L.imgH}`));
  return productionPdf(L, p, jpegs, img('PANO-JPEG', panoW, panoH));
};
const text = (parts: readonly Uint8Array[]): string => new TextDecoder('latin1').decode(concat(parts));

describe('PDF dla CorelDRAW (jedna strona jak DRUK 1)', () => {
  it('nagłówek PDF 1.4, jedna strona, bez pomniejszania (strona większa niż 500 cm otwiera się w Corelu 1:1)', () => {
    const r = build(P005);
    const t = text(r.parts);
    expect(t.startsWith('%PDF-1.4\n')).toBe(true);
    expect(t.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(r.pages).toBe(1);
    expect(r.schemaScale).toBe(1);
    expect(t).not.toContain('/UserUnit');
  });
  it('czcionka z szerokościami znaków i polskimi literami; obrazy JPG bez kopiowania danych', () => {
    const p = { ...P005, orderName: 'Zażółć' };
    const r = build(p);
    const t = text(r.parts);
    expect(t).toContain('/FirstChar 32 /LastChar 255 /Widths [278 278 355');
    expect(t).toContain('/Differences [128 /aogonek');
    expect(t).toContain('(Za\\207\\363\\203\\201) Tj');
    expect(t.match(/\/Subtype \/Image/g)).toHaveLength(4);
  });
  it('tabela xref wskazuje początki obiektów', () => {
    const all = concat(build(P005).parts);
    const t = new TextDecoder('latin1').decode(all);
    const xref = Number(t.slice(t.lastIndexOf('startxref\n') + 10).split('\n')[0]);
    const first = t.slice(xref).split('\n')[3]!;
    expect(t.slice(Number(first.slice(0, 10)), Number(first.slice(0, 10)) + 7)).toBe('1 0 obj');
  });
});

type Case = { p: WallParams; panoW: number; panoH: number; out: { pdf: string; pages: number; schemaScale: number } };
describe('zgodność ze starym programem', () => {
  it('7 nagranych plików PDF bajt w bajt', () => {
    for (const c of golden<Case[]>('production-sheet')) {
      const r = build(c.p, c.panoW, c.panoH);
      expect(toBase64(concat(r.parts)), c.p.orderName).toBe(c.out.pdf);
      expect([r.pages, r.schemaScale]).toEqual([c.out.pages, c.out.schemaScale]);
    }
  });
});

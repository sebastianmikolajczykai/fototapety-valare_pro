import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import { CMYK, OpsRecorder, ProductionSheet, type SheetGeom, type SheetOp } from '../../../src/output/sheet';
import { golden } from '../../support/golden';
import { P005 } from '../../support/params';

const sheet = (p: WallParams): ProductionSheet => new ProductionSheet(computeLayout(p), p);

describe('arkusz produkcyjny (PDF / CDR jak DRUK 1)', () => {
  it('005-21: bryty 122,7 cm, całość 356,1 × 276 cm, tytuły 8,9 cm', () => {
    const G = sheet(P005).geom;
    expect(G.n).toBe(3);
    expect(G.wCm[0]).toBeCloseTo(122.682, 6);
    expect(G.PW).toBeCloseTo(356.0572, 6);
    expect(G.fs).toBeCloseTo(8.90143, 6);
    expect(G.B).toBe(0);
  });
  it('rysunek: legenda, wymiary ściany w mm, opisy brytów i obrazy 1:1', () => {
    const rec = new OpsRecorder();
    sheet({ ...P005, orderName: 'Kowalski' }).draw(rec);
    const texts = rec.ops.filter((o): o is Extract<SheetOp, { t: 'text' }> => o.t === 'text').map(o => o.s);
    expect(texts).toEqual([
      'LEGENDA:',
      'naddatek',
      'naddatek',
      '3500,00 mm',
      'wymiar ściany',
      '2700,00 mm',
      'wymiar ściany',
      'Kowalski',
      '1/3  122,7 × 276,0 cm',
      '2/3  122,7 × 276,0 cm',
      '3/3  122,7 × 276,0 cm',
    ]);
    expect(rec.ops.filter(o => o.t === 'img').map(o => (o as { file: string }).file)).toEqual([
      'pano.jpg',
      'pano.jpg',
      'bryt_1.jpg',
      'bryt_2.jpg',
      'bryt_3.jpg',
    ]);
  });
  it('pasek thru cut: niebieskie prostokąty CMYK 100% C nad i pod', () => {
    const rec = new OpsRecorder();
    sheet({ ...P005, thru: true }).draw(rec);
    const cyanFills = rec.ops.filter(o => o.t === 'rectF' && o.col === CMYK.CYAN);
    expect(cyanFills).toHaveLength(2 + 3 * 2);
  });
  it('długa nazwa zlecenia poszerza stronę', () => {
    const short = sheet(P005).pageSize();
    const long = sheet({ ...P005, orderName: 'W'.repeat(80) }).pageSize();
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.h).toBe(short.h);
  });
});

type Case = {
  p: WallParams;
  panoW: number;
  panoH: number;
  out: { G: SheetGeom; cdr: { pageW: number; pageH: number; ops: SheetOp[] } };
};
describe('zgodność ze starym programem', () => {
  it('geometria, operacje rysunku i wymiar strony dla 7 nagranych arkuszy', () => {
    for (const c of golden<Case[]>('production-sheet')) {
      const s = sheet(c.p);
      const rec = new OpsRecorder();
      s.draw(rec);
      expect(s.geom).toEqual(c.out.G);
      expect(JSON.parse(JSON.stringify(rec.ops))).toEqual(c.out.cdr.ops);
      expect(s.pageSize()).toEqual({ w: c.out.cdr.pageW, h: c.out.cdr.pageH });
    }
  });
});

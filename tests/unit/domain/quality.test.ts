import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../../src/domain/layout';
import { QUALITY_DEFAULTS, QUALITY_LEVELS, QualityAssessor, sourcePxPerM } from '../../../src/domain/quality';
import { golden } from '../../support/golden';
import { P005 } from '../../support/params';

describe('jakość zdjęcia (progi Weroniki: dobra ≥ 2500 px/m, za słaba < 1000 px/m)', () => {
  it('poziomy na granicach progów', () => {
    const q = new QualityAssessor();
    expect(q.assess(999.9, 1).level).toBe('bad');
    expect(q.assess(1000, 1).level).toBe('ok');
    expect(q.assess(2499.9, 1).level).toBe('ok');
    expect(q.assess(2500, 1).level).toBe('good');
  });
  it('maks. powiększenie dla poziomu „dobra” (odwrotnie proporcjonalne)', () => {
    expect(new QualityAssessor().assess(5000, 1.5).zoomGood).toBe(3);
  });
  it('piksele źródła na metr ściany: 150 DPI i skala 1 = ok. 5906 px/m', () => {
    expect(Math.round(sourcePxPerM(150, 1))).toBe(5906);
    expect(sourcePxPerM(150, 2)).toBeCloseTo(2952.76, 2);
  });
  it('zmiana progów: tylko wartości > 0, „za słaba” nie wyżej niż „dobra”', () => {
    const q = new QualityAssessor();
    q.setThresholds(3000, 4000);
    expect(q.thresholds).toEqual({ good: 3000, min: 3000 });
    q.setThresholds(NaN, -5);
    expect(q.thresholds).toEqual({ good: 3000, min: 3000 });
    expect(new QualityAssessor().thresholds).toEqual(QUALITY_DEFAULTS);
  });
  it('ostrzeżenie pod ustawieniami tylko przy „za słaba”', () => {
    const q = new QualityAssessor();
    expect(q.warningHtml(2952.76, 1)).toBe('');
    expect(q.warningHtml(812.4, 1)).toBe(
      '<div class="warn">Jakość zdjęcia: za słaba (812 px/m, minimum 1000 px/m).</div>',
    );
  });
  it('opis dla 005-21 i zdjęcia 6000 × 4000 px', () => {
    const L = computeLayout(P005);
    const q = new QualityAssessor();
    const f = q.facts({ dpi: 150, L, imgW: 6000, imgH: 4000, pxPerM: 1685.4, zoom: 1 });
    expect(f).toEqual([
      'Na ścianie: <b>1685 px/m</b> (ok. 43 DPI zdjęcia źródłowego; druk 150 DPI).',
      'Zdjęcie 6000 × 4000 px. Na „dobrą” jakość przy tej ścianie z naddatkiem (3,56 × 2,76 m) potrzeba ok. 8900 × 6900 px przy pełnym kadrze.',
      'Powiększenie kadru 100%. Nawet przy 100% zdjęcie nie osiąga poziomu „dobra”.',
    ]);
    expect(q.facts({ dpi: 150, L, imgW: 40000, imgH: 20000, pxPerM: 11000, zoom: 1.2 }).slice(2)).toEqual([
      'Powiększenie kadru 120%. Poziom „dobra” zostaje do ok. 300% (maks. suwaka).',
      'Dłuższy bok ponad 30\u00a0000 px – według grafików obciąża programy bez wyraźnej poprawy jakości.',
    ]);
  });
  it('nazwy i opisy poziomów', () => {
    expect(QUALITY_LEVELS.good.name).toBe('Dobra');
    expect(QUALITY_LEVELS.bad.cls).toBe('jq-bad');
  });
});

describe('zgodność ze starym programem', () => {
  const G = golden<{ defaults: unknown; assess: { v: number; z: number; out: unknown }[] }>('quality');
  it('progi domyślne i nagrane oceny', () => {
    expect(QUALITY_DEFAULTS).toEqual(G.defaults);
    for (const c of G.assess) expect(new QualityAssessor().assess(c.v, c.z)).toEqual(c.out);
  });
});

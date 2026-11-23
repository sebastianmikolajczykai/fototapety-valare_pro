import { describe, expect, it } from 'vitest';
import type { WallParams } from '../../../src/domain/layout';
import {
  assessScale,
  homography,
  invertHomography,
  scaleMessageHtml,
  sceneGeo,
  ROOMS,
  type Pt,
  type ScaleInput,
} from '../../../src/domain/visualization';
import { golden } from '../../support/golden';
import { P005 } from '../../support/params';

const sq: Pt[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const frame = sq.map(q => ({ x: 0.1 + q.x * 0.8, y: 0.1 + q.y * 0.8 }));

describe('wizualizacja: homografia', () => {
  it('kwadrat jednostkowy = przekształcenie tożsamościowe', () => {
    const H = homography(sq)!;
    expect(H.m).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(H.map(0.3, 0.8)).toEqual({ x: 0.3, y: 0.8 });
  });
  it('punkty współliniowe: brak przekształcenia', () => {
    expect(homography([0, 10, 20, 30].map(x => ({ x, y: 0 })))).toBeNull();
  });
  it('odwrotność wraca do (u, v)', () => {
    const q = [
      { x: 100, y: 50 },
      { x: 700, y: 80 },
      { x: 680, y: 500 },
      { x: 120, y: 520 },
    ];
    const H = homography(q)!;
    const inv = invertHomography(H.m)!;
    const p = H.map(0.25, 0.6);
    const back = inv(p.x, p.y)!;
    expect(back.x).toBeCloseTo(0.25, 9);
    expect(back.y).toBeCloseTo(0.6, 9);
    expect(invertHomography([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('wizualizacja: sprawdzenie skali (z FeltDecor, ±10%)', () => {
  const base: ScaleInput = {
    points: frame,
    photoWidth: 1200,
    photoHeight: 900,
    wallW: 350,
    wallH: 270,
    reference: null,
  };
  it('niekompletne dane: ok = false', () => {
    expect(assessScale({ ...base, points: frame.slice(0, 3) })).toEqual({ ok: false });
    expect(assessScale({ ...base, wallW: 0 })).toEqual({ ok: false });
  });
  it('odcinek 200 cm wypada ok. 202,5 cm w ścianie: skala się zgadza', () => {
    const a = assessScale({ ...base, reference: { a: { x: 0.2, y: 0.2 }, b: { x: 0.2, y: 0.8 }, length: 200 } });
    expect(a.ok && a.reference?.verdict).toBe('ok');
    expect(scaleMessageHtml(a, P005)).toBe(
      '<div class="ok">✓ Skala się zgadza: według odcinka odniesienia zaznaczony obszar ma około 346 × 267 cm.</div>',
    );
  });
  it('odcinek 1000 cm: obszar większy niż ściana', () => {
    const a = assessScale({ ...base, reference: { a: { x: 0.2, y: 0.2 }, b: { x: 0.2, y: 0.8 }, length: 1000 } });
    expect(scaleMessageHtml(a, P005)).toMatch(
      /^<div class="warn">Zaznaczony obszar jest większy niż ściana: około 1728 × 1333 cm zamiast 350 × 270 cm \(4,94×\)\./,
    );
  });
  it('odcinek 100 cm: obszar mniejszy; proporcje bez ostrzeżenia', () => {
    const a = assessScale({ ...base, reference: { a: { x: 0.2, y: 0.2 }, b: { x: 0.2, y: 0.8 }, length: 100 } });
    expect(scaleMessageHtml(a, P005)).toMatch(/^<div class="warn">Zaznaczony obszar jest mniejszy niż ściana/);
  });
  it('proporcje zaznaczenia inne niż ściany (na wprost): ostrzeżenie', () => {
    const a = assessScale({ ...base, wallW: 700 });
    expect(a.ok && a.aspectWarning).toBe(true);
    expect(scaleMessageHtml(a, { ...P005, wallW: 700 })).toBe(
      '<div class="warn">Proporcje zaznaczenia odbiegają od proporcji ściany. Jeśli ściana jest na zdjęciu na wprost, popraw narożniki.</div>',
    );
    expect(scaleMessageHtml(assessScale(base), P005)).toBe('');
    expect(scaleMessageHtml(assessScale(base), P005, 2)).toBe(
      '<div class="hint">Wpisz długość odcinka w cm (10–2000).</div>',
    );
  });
  it('9 typów wnętrz', () => {
    expect(Object.keys(ROOMS)).toHaveLength(9);
  });
});

describe('wizualizacja: geometria pokoju dla AI', () => {
  it('005-21: scena 1200 × 1058 px, aparat 130 cm nad podłogą, 420 cm od ściany', () => {
    const G = sceneGeo(P005);
    expect([G.CH, G.E, G.D, G.x0, G.x1]).toEqual([1058, 130, 420, 120, 1080]);
    expect(G.P(0, 130, 0).y).toBeCloseTo(G.yh, 9);
  });
});

type V = {
  homography: { q: Pt[]; m: number[] | null; pts: Pt[] | null }[];
  assessScale: { a: ScaleInput; out: unknown }[];
  sceneGeo: { p: WallParams; out: Record<string, unknown> & { pts: Pt[]; sc: number[] } }[];
};
describe('zgodność ze starym programem', () => {
  const G = golden<V>('visualization');
  it('homografie', () => {
    for (const c of G.homography) {
      const H = homography(c.q);
      expect(H ? H.m : null).toEqual(c.m);
      if (H)
        expect(
          [
            [0, 0],
            [1, 0],
            [0.5, 0.5],
            [0.3, 0.8],
          ].map(([u, v]) => H.map(u!, v!)),
        ).toEqual(c.pts);
    }
  });
  it('oceny skali', () => {
    for (const c of G.assessScale) expect(assessScale(c.a)).toEqual(c.out);
  });
  it('geometria sceny', () => {
    for (const c of G.sceneGeo) {
      const { P, sc, ...rest } = sceneGeo(c.p);
      const { pts, sc: scOut, ...exp } = c.out;
      expect(rest).toEqual(exp);
      expect(
        [
          [0, 0, 0],
          [100, 50, 30],
          [-200, 0, 0],
        ].map(([X, Y, z]) => P(X!, Y!, z!)),
      ).toEqual(pts);
      expect([0, 100].map(sc)).toEqual(scOut);
    }
  });
});

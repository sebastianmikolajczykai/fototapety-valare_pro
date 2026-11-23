import { describe, expect, it } from 'vitest';
import { computeLayout, fitImage } from '../../../src/domain/layout';
import { MAGNIFIER_MAX, magnifierFrame, ZoomView } from '../../../src/domain/magnifier';
import { P005 } from '../../support/params';

describe('lupa – powiększenie i przesuwanie zdjęcia (stary lupa.js)', () => {
  it('„Całe zdjęcie”: skala dopasowana do okna (maks. 100%), obraz na środku', () => {
    const v = new ZoomView(6000, 4000);
    v.fitAll(1200, 800);
    expect([v.s, v.fitS, v.tx, v.ty]).toEqual([0.2, 0.2, 0, 100]);
    expect(v.label).toBe('20%');
    expect([v.canZoomOut, v.canZoomIn, v.pixelated]).toEqual([false, true, false]);
    const small = new ZoomView(300, 200);
    small.fitAll(1200, 800);
    expect([small.s, small.tx, small.ty]).toEqual([1, 450, 300]);
  });
  it('powiększenie w punkcie kursora, w granicach dopasowania i 400%', () => {
    const v = new ZoomView(6000, 4000);
    v.fitAll(1200, 800);
    v.zoomAt(1, 600, 400, 1200, 800);
    expect([v.s, v.tx, v.ty]).toEqual([1, -2400, -1600]);
    v.zoomAt(100, 0, 0, 1200, 800);
    expect(v.s).toBe(MAGNIFIER_MAX);
    expect([v.canZoomIn, v.pixelated, v.label]).toEqual([false, true, '400%']);
    v.zoomAt(0.001, 0, 0, 1200, 800);
    expect(v.s).toBe(0.2);
  });
  it('przesunięcie: większy obraz nie odjeżdża poza krawędź okna', () => {
    const v = new ZoomView(6000, 4000);
    v.fitAll(1200, 800);
    v.zoomAt(1, 600, 400, 1200, 800);
    v.moveTo(500, 500, 1200, 800);
    expect([v.tx, v.ty]).toEqual([0, 0]);
    v.moveTo(-99999, -99999, 1200, 800);
    expect([v.tx, v.ty]).toEqual([-4800, -3200]);
  });
  it('zmiana rozmiaru okna: dopasowane zostaje dopasowane, powiększone – bez zmiany skali', () => {
    const v = new ZoomView(6000, 4000);
    v.fitAll(1200, 800);
    v.resize(600, 800);
    expect([v.s, v.fitS]).toEqual([0.1, 0.1]);
    v.zoomAt(1, 0, 0, 600, 800);
    v.resize(1200, 800);
    expect([v.s, v.fitS]).toEqual([1, 0.2]);
  });
  it('ramka kadru i łączenia brytów w pikselach zdjęcia', () => {
    const L = computeLayout(P005);
    const F = fitImage(L, 6000, 4000, { zoom: 1, fx: 0.5, fy: 0.5 });
    const fr = magnifierFrame(L, F);
    expect(fr.w).toBeCloseTo(L.panoW / F.s, 9);
    expect(fr.h).toBeCloseTo(4000, 9);
    expect(fr.y).toBeCloseTo(0, 9);
    expect(fr.seams).toHaveLength(2);
    expect(fr.seams[0]).toBeCloseTo((L.xs[1]! + L.ov / 2) / F.s, 9);
  });
});

import { describe, expect, it } from 'vitest';
import { cmToPx, parseNum, pxCeil, pxToCm } from '../../../src/domain/units';
import { BUTT_OVERLAP_CM, THRU_CM } from '../../../src/domain/constants';

describe('jednostki cm ↔ px', () => {
  it('wzorzec 005-21: 276 cm wysokości przy 150 DPI = 16300 px', () => {
    expect(pxCeil(270 + 3 + 3, 150)).toBe(16300);
  });
  it('zaokrągla zawsze w górę: 6 cm przy 150 DPI = 354,33 -> 355 px, przy 300 DPI = 708,66 -> 709 px', () => {
    expect(pxCeil(6, 150)).toBe(355);
    expect(pxCeil(6, 300)).toBe(709);
  });
  it('styk 1 cm przy 150 DPI = 59,06 px (zakład w układzie liczony przez Math.round = 59)', () => {
    expect(Math.round(cmToPx(BUTT_OVERLAP_CM, 150))).toBe(59);
    expect(pxCeil(BUTT_OVERLAP_CM, 150)).toBe(60);
  });
  it('nie podbija wartości dokładnych przez błąd zaokrąglenia (2,54 cm = 150 px)', () => {
    expect(pxCeil(2.54, 150)).toBe(150);
    expect(pxCeil(25.4, 300)).toBe(3000);
  });
  it('cmToPx bez zaokrąglenia, pxToCm odwrotnie', () => {
    expect(cmToPx(2.54, 100)).toBeCloseTo(100, 10);
    expect(cmToPx(THRU_CM, 150)).toBeCloseTo(29.527559, 5);
    expect(pxToCm(150, 150)).toBeCloseTo(2.54, 10);
    expect(pxToCm(cmToPx(123.4, 200), 200)).toBeCloseTo(123.4, 10);
  });
  it('parseNum: przecinek, kropka, puste pole', () => {
    expect(parseNum('122,7')).toBe(122.7);
    expect(parseNum('3.5')).toBe(3.5);
    expect(parseNum(6)).toBe(6);
    expect(parseNum('')).toBeNaN();
    expect(parseNum('abc')).toBeNaN();
    expect(parseNum('12 cm')).toBe(12);
  });
});

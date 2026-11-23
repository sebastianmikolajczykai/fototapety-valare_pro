import { describe, expect, it } from 'vitest';
import { f1, f2, plural } from '../../../src/domain/format';
import { golden } from '../../support/golden';

describe('format liczb po polsku', () => {
  it('zaokrągla do jednego miejsca i używa przecinka', () => {
    expect(f1(122.75)).toBe('122,8');
    expect(f1(7245)).toBe('7245');
  });
  it('f2 pokazuje do dwóch miejsc po przecinku', () => {
    expect(f2(1.255)).toMatch(/^1,2[56]$/);
    expect(f2(3)).toBe('3');
  });
  it('odmienia słowo „bryt”', () => {
    expect([1, 2, 4, 5, 12, 22, 25, 112].map(plural)).toEqual([
      'bryt',
      'bryty',
      'bryty',
      'brytów',
      'brytów',
      'bryty',
      'brytów',
      'brytów',
    ]);
  });
  it('daje to samo co stary program dla wszystkich nagranych liczb', () => {
    for (const g of golden<{ x: number; f1: string; f2: string; plural: string | null }[]>('format')) {
      expect(f1(g.x), String(g.x)).toBe(g.f1);
      expect(f2(g.x), String(g.x)).toBe(g.f2);
      if (g.plural !== null) expect(plural(g.x)).toBe(g.plural);
    }
  });
});

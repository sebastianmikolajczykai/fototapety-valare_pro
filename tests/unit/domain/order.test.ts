import { describe, expect, it } from 'vitest';
import { defaultOrderName } from '../../../src/domain/order';

describe('domyślna nazwa zlecenia (stary bryty-wyglad.js, Sebastian 26.10.2026)', () => {
  const day = new Date('2026-10-26T12:00:00+01:00');
  it('„Fototapeta SZERxWYS DD.MM.RRRR” z wymiaru ściany i daty', () => {
    expect(defaultOrderName(350, 270, day)).toBe('Fototapeta 350x270 26.10.2026');
    expect(defaultOrderName(350.5, 270, day)).toBe('Fototapeta 350.5x270 26.10.2026');
  });
  it('bez poprawnego wymiaru – sama nazwa i data', () => {
    expect(defaultOrderName(NaN, 270, day)).toBe('Fototapeta 26.10.2026');
    expect(defaultOrderName(350, 0, day)).toBe('Fototapeta 26.10.2026');
  });
});

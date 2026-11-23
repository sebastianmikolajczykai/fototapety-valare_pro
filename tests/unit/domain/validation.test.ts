import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import { validate, layoutWarnings } from '../../../src/domain/validation';
import { golden } from '../../support/golden';
import { P005 } from '../../support/params';

describe('walidacja ustawień', () => {
  it('005-21 przy materiale 131 cm jest poprawne', () => {
    expect(validate(P005)).toEqual([]);
  });
  it('odrzuca zerowe wymiary ściany', () => {
    expect(validate({ ...P005, wallW: 0 })).toContain('Podaj wymiary ściany większe od zera.');
  });
  it('odrzuca naddatek spoza 0–10 cm albo nie co 0,5 cm', () => {
    expect(validate({ ...P005, mT: 0.3 })).toContain('Naddatek na górze musi wynosić 0–10 cm, co 0,5 cm.');
    expect(validate({ ...P005, mL: 10.5 })).toContain('Naddatek na lewej musi wynosić 0–10 cm, co 0,5 cm.');
  });
  it('bryt szerszy niż druk materiału: podaje potrzebną liczbę brytów', () => {
    expect(validate({ ...P005, maxPrint: 100 })).toEqual([
      'Bryt ma 122,7 cm, a materiał drukuje maks. 100 cm (naddatki i zakład wliczone). Potrzeba co najmniej 4 bryty.',
    ]);
  });
  it('za wysoki bryt dla przeglądarki: proponuje niższe DPI', () => {
    const e = validate({ ...P005, wallH: 600, dpi: 300 });
    expect(e[0]).toMatch(/przeglądarka zapisze najwyżej 32000 px.*wybierz najwyżej 100 DPI/);
  });
  it('jeden bryt węższy niż 5 cm: ostrzeżenie', () => {
    const p: WallParams = { ...P005, wallW: 2, mL: 0, mR: 0, count: 1 };
    expect(layoutWarnings(p, computeLayout(p))).toEqual(['Bryt ma tylko 2 cm szerokości (minimum 5 cm).']);
  });
  it('bryt za szeroki dla przeglądarki: proponuje liczbę brytów', () => {
    const e = validate({ ...P005, wallW: 2000, count: 3, maxPrint: Infinity, dpi: 200 });
    expect(e[0]).toMatch(/jest za duży dla przeglądarki.*Ustaw co najmniej \d+ brytów albo zmniejsz DPI\./);
  });
  it('ostrzega (bez blokady), gdy ostatni bryt jest węższy niż 5 cm po odjęciu zakładu', () => {
    const p: WallParams = { ...P005, wallW: 250, split: 'custom', widths: [130, 130, NaN] }; // 256 − (130 + 130 − 6) = 2 cm
    expect(validate(p)).toEqual([]);
    expect(layoutWarnings(p, computeLayout(p))[0]).toBe(
      'Ostatni bryt jest wąski: 2 cm szerokości po odjęciu zakładu (minimum 5 cm). Tak wąskiego paska raczej się nie tnie.',
    );
  });
});

type Case = { p: WallParams; errs: string[]; warn?: string[]; L?: unknown };
describe('zgodność ze starym programem', () => {
  it('te same błędy i ostrzeżenia dla wszystkich nagranych ustawień', () => {
    for (const c of golden<Case[]>('layout')) {
      expect(validate(c.p), JSON.stringify(c.p)).toEqual(c.errs);
      if (c.warn) expect(layoutWarnings(c.p, computeLayout(c.p))).toEqual(c.warn);
    }
  });
});

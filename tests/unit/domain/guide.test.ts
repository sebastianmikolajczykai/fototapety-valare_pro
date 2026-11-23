import { describe, expect, it } from 'vitest';
import {
  fileSummary,
  joinSummary,
  marginsSummary,
  needInfo,
  outputSummary,
  pricingSummary,
  safeLayout,
  splitSummary,
  wallSummary,
  widthsHint,
} from '../../../src/domain/guide';
import type { WallParams } from '../../../src/domain/layout';
import { P005 } from '../../support/params';

describe('przebieg krok po kroku – teksty pomocy (stary kroki.js)', () => {
  it('liczba brytów wymagana przez materiał i przycisk „Ustaw N brytów”', () => {
    expect(needInfo(P005)).toEqual({
      text: 'Materiał drukuje maks. 131 cm, więc przy 356 cm z naddatkami potrzeba co najmniej 3 bryty. Teraz każdy bryt ma 122,7 cm.',
      need: 3,
      setTo: null,
    });
    expect(needInfo({ ...P005, wallW: 500, count: 2 })).toEqual({
      text: 'Materiał drukuje maks. 131 cm, więc przy 506 cm z naddatkami potrzeba co najmniej 4 bryty. Teraz każdy bryt ma 256 cm.',
      need: 4,
      setTo: 4,
    });
    expect(needInfo({ ...P005, split: 'custom', count: 3 }).text).toBe(
      'Materiał drukuje maks. 131 cm, więc przy 356 cm z naddatkami potrzeba co najmniej 3 bryty.',
    );
  });
  it('bez materiału: zachęta do wyboru; materiał węższy niż zakład albo brak ściany: bez tekstu', () => {
    expect(needInfo({ ...P005, maxPrint: Infinity })).toEqual({
      text: 'Wybierz materiał w kroku 1, żeby program pilnował maksymalnej szerokości brytu.',
      need: null,
      setTo: null,
    });
    // „Inny materiał” z pustym polem (NaN) – jak brak materiału.
    expect(needInfo({ ...P005, maxPrint: NaN }).text).toBe(
      'Wybierz materiał w kroku 1, żeby program pilnował maksymalnej szerokości brytu.',
    );
    expect(needInfo({ ...P005, maxPrint: 5 })).toEqual({ text: '', need: null, setTo: null });
    expect(needInfo({ ...P005, wallW: NaN })).toEqual({ text: '', need: null, setTo: null });
  });
  it('podpowiedź pod własnymi szerokościami', () => {
    expect(widthsHint(P005, 3)).toBe(
      'Do pokrycia: 356 cm (ściana 350 + naddatki 3 i 3 cm), każde łączenie zabiera 6 cm zakładu. Bryt może mieć maks. 131 cm.',
    );
    expect(widthsHint({ ...P005, overlap: 0, maxPrint: Infinity, mL: 2.5 }, 1)).toBe(
      'Do pokrycia: 355,5 cm (ściana 350 + naddatki 2,5 i 3 cm).',
    );
    expect(widthsHint({ ...P005, wallW: NaN }, 3)).toBe('');
  });
  it('skróty w nagłówkach zamkniętych kroków', () => {
    expect(wallSummary(P005, 'Mural Canvas CT – druk 131 cm')).toBe('350 × 270 cm · Mural Canvas CT – druk 131 cm');
    expect(wallSummary({ ...P005, wallW: NaN, wallH: 0 }, '')).toBe('0 × 0 cm · materiał nie wybrany');
    expect(marginsSummary({ ...P005, mL: 2.5 })).toBe('góra 3 · dół 3 · lewo 2,5 · prawo 3 cm');
    expect(joinSummary(P005)).toBe('Zakład 6 cm');
    expect(joinSummary({ ...P005, join: 'butt', overlap: 1 })).toBe('Na styk');
    expect(joinSummary({ ...P005, overlap: NaN })).toBe('Zakład 0 cm');
    expect(splitSummary(P005)).toBe('3 bryty równej szerokości');
    expect(splitSummary({ ...P005, count: 0 })).toBe('Liczba brytów do uzupełnienia');
    const custom: WallParams = { ...P005, split: 'custom', widths: [120, NaN, NaN] };
    expect(splitSummary(custom)).toBe('Własne szerokości: do uzupełnienia');
    expect(splitSummary({ ...custom, widths: [120, 130, NaN] })).toBe('Własne szerokości: 120 / 130 / 118 cm');
    expect(fileSummary('', null)).toBe('Brak zdjęcia – wybierz plik, gotowy wzór albo grafikę AI');
    expect(fileSummary('zdjecie.jpg', null)).toBe('zdjecie.jpg');
    expect(fileSummary('wzor.jpg', 'Góry o świcie')).toBe('Gotowy wzór: Góry o świcie');
    expect(pricingSummary(null, null)).toBe('Cena po wybraniu materiału');
    expect(pricingSummary('1 234,00 zł', 'Standard, 10 dni roboczych')).toBe(
      'Razem 1 234,00 zł brutto · Standard, 10 dni roboczych',
    );
    expect(outputSummary(P005)).toBe('150 DPI · plik dla CorelDRAW');
    expect(outputSummary({ ...P005, thru: true, pdf: false, dpi: 100 })).toBe('100 DPI · pasek thru cut');
  });
  it('safeLayout: układ tylko, gdy wszystkie szerokości są liczbami', () => {
    expect(safeLayout(P005)!.bw.widths).toHaveLength(3);
    expect(safeLayout({ ...P005, split: 'custom', widths: [NaN, 100, 100] })).toBeNull();
  });
});

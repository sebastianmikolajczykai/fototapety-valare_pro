import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import {
  brytTableHtml,
  calcBase,
  calcImage,
  cdrInfoText,
  cdrNote,
  doneMessage,
  equalSplitCm,
  errorsHtml,
  mb,
  sourcePxPerMeter,
  warningsHtml,
} from '../../../src/domain/summary';

const P: WallParams = {
  wallW: 350,
  wallH: 270,
  mT: 3,
  mB: 3,
  mL: 3,
  mR: 3,
  join: 'overlap',
  overlap: 6,
  split: 'equal',
  count: 3,
  widths: [],
  maxPrint: 131,
  dpi: 150,
  thru: false,
  pdf: true,
  order: 'zlecenie',
  orderName: 'zlecenie',
};

describe('strona główna (stary bryty.js) – teksty i liczby bez DOM', () => {
  it('equalSplitCm: równy podział w górę do 0,1 cm; bez ściany – puste', () => {
    expect(equalSplitCm(356, 3, 6)).toBe(122.7);
    expect(equalSplitCm(1000, 8, 6)).toBe(130.3);
    expect(equalSplitCm(300, 3, NaN)).toBe(100);
    expect(equalSplitCm(0, 3, 6)).toBe('');
  });

  it('tabela brytów: wiersz na bryt, „reszta” przy własnych szerokościach', () => {
    const L = computeLayout(P);
    expect(brytTableHtml(L)).toBe(
      '<tr><th>Bryt</th><th>Szerokość</th><th>Wysokość</th><th>Piksele</th></tr>' +
        [1, 2, 3].map(i => `<tr><td>${i}</td><td>122,67 cm</td><td>276 cm</td><td>7245 × 16300</td></tr>`).join(''),
    );
    const C = computeLayout({ ...P, split: 'custom', widths: [130, NaN] });
    expect(brytTableHtml(C)).toContain('<td>2 <span class="hint">(reszta)</span></td>');
  });

  it('podsumowanie: całość, łączenie, zdjęcie (powiększenie, px/m, poza kadrem)', () => {
    const L = computeLayout(P);
    expect(calcBase(P, L)).toBe('Całość z naddatkiem: 356 × 276 cm. Zakład 6 cm.');
    expect(calcBase({ ...P, join: 'butt', overlap: 1 }, L)).toContain('Łączenie na styk (1 cm wspólnej grafiki).');
    const F = { s: 4.08, cx: 0, cy: 0, exW: 3427.2, exH: 0 };
    expect(sourcePxPerMeter(150, F)).toBe(1447);
    expect(calcImage(P, F)).toBe(
      ' Zdjęcie powiększone 4,08×, rozdzielczość źródła na ścianie ok. 1447 px/m. Poza kadrem w poziomie: 840 px zdjęcia.',
    );
    expect(calcImage(P, { ...F, exW: 0, exH: 408 })).toMatch(/Poza kadrem w pionie: 100 px zdjęcia\.$/);
  });

  it('HTML ostrzeżeń, błędów i komunikat końcowy', () => {
    expect(warningsHtml(['a', 'b'])).toBe('<div class="warn">a</div><div class="warn">b</div>');
    expect(errorsHtml([])).toBe('');
    expect(errorsHtml(['x'])).toBe('<div class="err">x</div>');
    expect(mb(12_345_678)).toBe('12.3');
    expect(doneMessage(3, 16300, 150, ' PDF.')).toBe(
      '<span class="ok">Gotowe: 3 bryty, wysokość 16300 px, 150 DPI. PDF.</span>',
    );
  });

  it('.cdr: informacja o dostępności i notka z folderem tylko przy obrazach linkowanych', () => {
    expect(cdrInfoText({ corel: true })).toBe('Plik .cdr zapisze CorelDRAW.');
    expect(cdrInfoText({ corel: false })).toContain('na tym serwerze');
    expect(cdrInfoText(null)).toBe('Zapis .cdr niedostępny – powstanie PDF (otwórz w CorelDRAW i zapisz jako .cdr).');
    expect(cdrNote(1234.5, 800, '')).toBe(' CDR: jeden arkusz 1234,5 × 800 cm, bryty 1:1.');
    expect(cdrNote(10, 10, 'C:\\wyniki\\x')).toContain('w folderze <b>C:\\wyniki\\x</b>; .cdr korzysta z tych JPG');
  });
});

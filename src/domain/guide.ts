// Przebieg krok po kroku – teksty pomocy (czysta część starego kroki.js, ustalenia Sebastiana 2026-10-25):
// skróty ustawień w nagłówkach zamkniętych kroków, liczba brytów wymagana przez materiał,
// podpowiedź pod własnymi szerokościami. Bez DOM – moduł strony (src/web/kroki.ts) tylko je wstawia.
import { f1, plural } from './format';
import { computeLayout, type Layout, type WallParams } from './layout';

/** Układ tylko wtedy, gdy wszystkie szerokości brytów są liczbami (np. puste pole własnej szerokości = brak). */
export function safeLayout(p: WallParams): Layout | null {
  try {
    const L = computeLayout(p);
    return L.bw.widths.every(w => Number.isFinite(w)) ? L : null;
  } catch {
    return null;
  }
}

/**
 * Ile brytów wymaga materiał (maks. szerokość druku). need = null, gdy nie da się policzyć (brak materiału albo ściany);
 * setTo = liczba dla przycisku „Ustaw N brytów”, gdy obecnie brytów jest za mało.
 */
export function needInfo(p: WallParams): { text: string; need: number | null; setTo: number | null } {
  const total = p.wallW + p.mL + p.mR;
  if (!(total > 0) || !Number.isFinite(p.maxPrint) || !(p.maxPrint > p.overlap))
    return {
      text: Number.isFinite(p.maxPrint)
        ? ''
        : 'Wybierz materiał w kroku 1, żeby program pilnował maksymalnej szerokości brytu.',
      need: null,
      setTo: null,
    };
  const need = Math.max(1, Math.ceil((total - p.overlap) / (p.maxPrint - p.overlap) - 1e-9));
  let text = `Materiał drukuje maks. ${f1(p.maxPrint)} cm, więc przy ${f1(total)} cm z naddatkami potrzeba co najmniej ${need} ${plural(need)}.`;
  if (p.split === 'equal' && p.count >= 1)
    text += ` Teraz każdy bryt ma ${f1((total + (p.count - 1) * p.overlap) / p.count)} cm.`;
  return { text, need, setTo: p.count < need ? need : null };
}

/** Podpowiedź pod polami własnych szerokości (fields = liczba pól). */
export function widthsHint(p: WallParams, fields: number): string {
  const total = p.wallW + p.mL + p.mR;
  if (!(total > 0)) return '';
  return (
    `Do pokrycia: ${f1(total)} cm (ściana ${f1(p.wallW)} + naddatki ${f1(p.mL)} i ${f1(p.mR)} cm)` +
    (p.overlap > 0 && fields > 1 ? `, każde łączenie zabiera ${f1(p.overlap)} cm zakładu.` : '.') +
    (Number.isFinite(p.maxPrint) ? ` Bryt może mieć maks. ${f1(p.maxPrint)} cm.` : '')
  );
}

/** Krok 1: wymiary ściany i materiał (materialText = tekst opcji listy, pusty = nie wybrano). */
export const wallSummary = (p: WallParams, materialText: string): string =>
  `${f1(p.wallW || 0)} × ${f1(p.wallH || 0)} cm · ${materialText || 'materiał nie wybrany'}`;

export const marginsSummary = (p: WallParams): string =>
  `góra ${f1(p.mT)} · dół ${f1(p.mB)} · lewo ${f1(p.mL)} · prawo ${f1(p.mR)} cm`;

export const joinSummary = (p: WallParams): string =>
  p.join === 'butt' ? 'Na styk' : `Zakład ${f1(p.overlap || 0)} cm`;

export function splitSummary(p: WallParams): string {
  if (!(p.count >= 1)) return 'Liczba brytów do uzupełnienia';
  if (p.split !== 'custom') return `${p.count} ${plural(p.count)} równej szerokości`;
  const L = safeLayout(p);
  return 'Własne szerokości: ' + (L ? L.bw.widths.map(w => f1(w)).join(' / ') + ' cm' : 'do uzupełnienia');
}

/** Krok zdjęcia: nazwa pliku albo tytuł gotowego wzoru z galerii. */
export const fileSummary = (fileName: string, galleryTitle: string | null): string =>
  fileName
    ? galleryTitle
      ? 'Gotowy wzór: ' + galleryTitle
      : fileName
    : 'Brak zdjęcia – wybierz plik, gotowy wzór albo grafikę AI';

/** Krok wyceny: suma brutto i termin z tabeli wyceny (null = brak). */
export const pricingSummary = (sum: string | null, term: string | null): string =>
  (sum ? `Razem ${sum} brutto` : 'Cena po wybraniu materiału') + (term ? ` · ${term}` : '');

export const SAMPLE_SUMMARY = 'Opcjonalnie: wydruk próbny fragmentu przed całym zleceniem';

export const outputSummary = (p: WallParams): string =>
  `${p.dpi} DPI${p.thru ? ' · pasek thru cut' : ''}${p.pdf ? ' · plik dla CorelDRAW' : ''}`;

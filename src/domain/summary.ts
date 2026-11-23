// Teksty i liczby strony głównej (stary bryty.js) bez DOM: tabela brytów, podsumowanie pod podglądem,
// równy podział do pól „własne szerokości”, komunikaty generowania i zapisu .cdr.
import { f1, f2, plural } from './format';
import type { Fit, Layout, WallParams } from './layout';

/** Dłuższy bok kopii zdjęcia do podglądu [px]. */
export const PREVIEW_MAX = 4000;

/**
 * Szerokość z równego podziału do pól „własne szerokości”, zaokrąglona w górę do 0,1 cm: przy zaokrągleniu w dół
 * „reszta” wychodziła szersza od pozostałych i mogła przekroczyć szerokość druku materiału. '' = brak ściany.
 */
export const equalSplitCm = (total: number, n: number, overlap: number): number | '' =>
  total > 0 ? Math.ceil(((total + (n - 1) * (overlap || 0)) / n) * 10 - 1e-9) / 10 : '';

/** Wiersze tabeli brytów (HTML). */
export function brytTableHtml(L: Layout): string {
  const n = L.bWs.length;
  let rows = '<tr><th>Bryt</th><th>Szerokość</th><th>Wysokość</th><th>Piksele</th></tr>';
  L.bw.widths.forEach((w, i) => {
    const note = L.bw.added && i === n - 1 ? ' <span class="hint">(reszta)</span>' : '';
    rows += `<tr><td>${i + 1}${note}</td><td>${f2(w)} cm</td><td>${f1(L.totalHcm)} cm</td><td>${L.bWs[i]} × ${L.bH}</td></tr>`;
  });
  return rows;
}

/** Początek podsumowania: całość z naddatkiem i łączenie. */
export const calcBase = (p: WallParams, L: Layout): string =>
  `Całość z naddatkiem: ${f1(L.totalWcm)} × ${f1(L.totalHcm)} cm. ` +
  (p.join === 'butt' ? `Łączenie na styk (${f1(p.overlap)} cm wspólnej grafiki).` : `Zakład ${f1(p.overlap)} cm.`);

/** Rozdzielczość źródła na metr ściany przy dopasowaniu F. */
export const sourcePxPerMeter = (dpi: number, F: Fit): number => Math.round(((dpi / 2.54) * 100) / F.s);

/** Podsumowanie zdjęcia: powiększenie, px/m, część poza kadrem. */
export function calcImage(p: WallParams, F: Fit): string {
  let calc = ` Zdjęcie powiększone ${f2(F.s)}×, rozdzielczość źródła na ścianie ok. ${sourcePxPerMeter(p.dpi, F)} px/m.`;
  const cutW = Math.round(F.exW / F.s);
  const cutH = Math.round(F.exH / F.s);
  if (cutW > 0) calc += ` Poza kadrem w poziomie: ${cutW} px zdjęcia.`;
  if (cutH > 0) calc += ` Poza kadrem w pionie: ${cutH} px zdjęcia.`;
  return calc;
}

/** Ostrzeżenia pod podsumowaniem (HTML). */
export const warningsHtml = (list: readonly string[]): string => list.map(x => `<div class="warn">${x}</div>`).join('');

/** Błędy ustawień (HTML). */
export const errorsHtml = (list: readonly string[]): string => list.map(x => `<div class="err">${x}</div>`).join('');

/** Rozmiar pliku w MB z 1 miejscem po przecinku (jak na liście plików). */
export const mb = (bytes: number): string => (bytes / 1e6).toFixed(1);

/** Komunikat po wygenerowaniu (HTML). */
export const doneMessage = (n: number, bH: number, dpi: number, note: string): string =>
  `<span class="ok">Gotowe: ${n} ${plural(n)}, wysokość ${bH} px, ${dpi} DPI.${note}</span>`;

/** Informacja pod opcją pliku dla CorelDRAW; health = odpowiedź /api/health (null = brak serwera). */
export function cdrInfoText(health: { corel?: unknown } | null): string {
  if (health && health.corel) return 'Plik .cdr zapisze CorelDRAW.';
  return health
    ? 'Zapis .cdr niedostępny na tym serwerze – powstanie PDF (otwórz w CorelDRAW i zapisz jako .cdr).'
    : 'Zapis .cdr niedostępny – powstanie PDF (otwórz w CorelDRAW i zapisz jako .cdr).';
}

/**
 * Notka o pliku .cdr; folder = folder z JPG i .cdr na serwerze (tylko obrazy linkowane). escapedFolder: już
 * zabezpieczony do HTML.
 */
export function cdrNote(pageW: number, pageH: number, escapedFolder: string): string {
  let note = ` CDR: jeden arkusz ${f1(pageW)} × ${f1(pageH)} cm, bryty 1:1.`;
  if (escapedFolder)
    note += ` Pliki i .cdr są też zapisane w folderze <b>${escapedFolder}</b>; .cdr korzysta z tych JPG, przy przenoszeniu zabierz cały folder.`;
  return note;
}

// Domyślna nazwa zlecenia (Sebastian 26.10.2026): „Fototapeta 350x270 26.10.2026” – wymiar ściany i data
// zamiast nazwy pliku zdjęcia. Strona podstawia ją, dopóki użytkownik nie wpisze własnej (np. nazwiska klienta).
export function defaultOrderName(w: number, h: number, day: Date): string {
  return 'Fototapeta' + (w > 0 && h > 0 ? ` ${w}x${h}` : '') + ' ' + day.toLocaleDateString('pl-PL');
}

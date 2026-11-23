# Stan prac

Aktualizacja: 2026-11-23

| Etap | Zakres                                                                                                              | Stan         |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0    | Szkielet: TS strict, ESLint, Prettier, Vitest + pokrycie, CI, wzorce „golden” ze starego programu, `units`/`format` | PR #2        |
| 1    | Domena: podział na bryty (`layout`) + złoty wzorzec recenzenta                                                      | PR #3        |
| 2    | Domena: walidacja i ostrzeżenia                                                                                     | PR #4        |
| 3    | Domena: materiały (PR #5), wycena, jakość, ściana, próbka, wizualizacja, teksty AI                                  | do zrobienia |
| 4    | Wyjście: JPG DPI, ZIP, PDF produkcyjny, zlecenie CDR, PDF montażu                                                   | do zrobienia |
| 5    | Serwer: pliki, bezpieczeństwo, logowanie, AI na atrapach, CDR                                                       | do zrobienia |
| 6    | Strona w TS (ten sam wygląd)                                                                                        | do zrobienia |
| 7    | Porównanie e2e stary vs nowy                                                                                        | do zrobienia |

## Ustalenia z audytu starego programu (do raportu)

- Sekcja „Ściana” (narożniki/otwory) nie jest widoczna: w `bryty.html` brak `#scianaBox`. Logika zostanie
  przeniesiona i przetestowana, ale nie podłączona – żeby działanie było identyczne. Decyzja Sebastiana.
- Martwy kod w starym programie: lista `MATERIALS` w `bryty.js` (nadpisywana przez `materialy.js`),
  `steps()/drawSteps()` w `montaz.js`, flaga `scaled` w PDF (zawsze false), jedna gałąź w `jakosc.js`.
- Cena Sand Dot GW 279,05 zł – DO WALIDACJI (możliwa literówka w cenniku).
- PR #6 starego repo (schemat montażu: zakład 5 cm) nie jest scalony – wzorcem jest `main`.

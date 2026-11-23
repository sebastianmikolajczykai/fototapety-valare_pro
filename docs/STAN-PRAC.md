# Stan prac

Aktualizacja: 2026-11-23

| Etap | Zakres                                                                                                                                              | Stan         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0    | Szkielet: TS strict, ESLint, Prettier, Vitest + pokrycie, CI, wzorce „golden” ze starego programu, `units`/`format`                                 | PR #2        |
| 1    | Domena: podział na bryty (`layout`) + złoty wzorzec recenzenta                                                                                      | PR #3        |
| 2    | Domena: walidacja i ostrzeżenia                                                                                                                     | PR #4        |
| 3    | Domena: materiały (PR #5), wycena (PR #6), jakość (PR #7), ściana (PR #8), próbka (PR #9), wizualizacja (PR #10), teksty AI (PR #11)                | do zrobienia |
| 4    | Wyjście: JPG DPI (PR #12), ZIP (PR #13), tekst PDF (PR #14), arkusz (PR #15), PDF produkcyjny (PR #16), zlecenie CDR (PR #17), PDF montażu (PR #18) | gotowe w PR  |
| 5    | Serwer: bezpieczeństwo (PR #19), logowanie, AI na atrapach, CDR, serwer HTTP                                                                        | do zrobienia |
| 6    | Strona w TS (ten sam wygląd)                                                                                                                        | do zrobienia |
| 7    | Porównanie e2e stary vs nowy                                                                                                                        | do zrobienia |

## Ustalenia z audytu starego programu (do raportu)

- Sekcja „Ściana” (narożniki/otwory) nie jest widoczna: w `bryty.html` brak `#scianaBox`. Logika zostanie
  przeniesiona i przetestowana, ale nie podłączona – żeby działanie było identyczne. Decyzja Sebastiana.
- Martwy kod w starym programie: lista `MATERIALS` w `bryty.js` (nadpisywana przez `materialy.js`),
  `steps()/drawSteps()` i numeracja stron „strona i/n” w `montaz.js` (zawsze 1 strona), flaga `scaled` w PDF (zawsze false), jedna gałąź w `jakosc.js`.
- Cena Sand Dot GW 279,05 zł – DO WALIDACJI (możliwa literówka w cenniku).
- PR #6 starego repo (schemat montażu: zakład 5 cm) nie jest scalony – wzorcem jest `main`.

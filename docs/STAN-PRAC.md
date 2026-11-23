# Stan prac

Aktualizacja: 2026-11-23

| Etap | Zakres                                                                                                                                                                                                                                                                                                        | Stan         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0    | Szkielet: TS strict, ESLint, Prettier, Vitest + pokrycie, CI, wzorce „golden” ze starego programu, `units`/`format`                                                                                                                                                                                           | PR #2        |
| 1    | Domena: podział na bryty (`layout`) + złoty wzorzec recenzenta                                                                                                                                                                                                                                                | PR #3        |
| 2    | Domena: walidacja i ostrzeżenia                                                                                                                                                                                                                                                                               | PR #4        |
| 3    | Domena: materiały (PR #5), wycena (PR #6), jakość (PR #7), ściana (PR #8), próbka (PR #9), wizualizacja (PR #10), teksty AI (PR #11)                                                                                                                                                                          | do zrobienia |
| 4    | Wyjście: JPG DPI (PR #12), ZIP (PR #13), tekst PDF (PR #14), arkusz (PR #15), PDF produkcyjny (PR #16), zlecenie CDR (PR #17), PDF montażu (PR #18)                                                                                                                                                           | gotowe w PR  |
| 5    | Serwer: bezpieczeństwo (PR #19), logowanie (PR #20), AI na atrapach (PR #21), Corel + serwer HTTP (PR #22)                                                                                                                                                                                                    | gotowe w PR  |
| 6    | Strona: pliki starego programu w public/ (PR #23), skrypty → TS: wycena (PR #24), materiały (PR #25), jakość (PR #26), próbka (PR #27), montaż (PR #28), ściana (PR #29), pamięć ustawień (PR #30), kroki (PR #31), lupa (PR #32), wygląd (PR #33), logowanie (PR #34), galeria (PR #35), grafika AI (PR #36) | w toku       |
| 7    | Porównanie e2e stary vs nowy (PR #23, rozbudowa z każdym PR strony)                                                                                                                                                                                                                                           | w toku       |

## Ustalenia z audytu starego programu (do raportu)

- Sekcja „Ściana” (narożniki/otwory) nie jest widoczna: w `bryty.html` brak `#scianaBox`. Logika zostanie
  przeniesiona i przetestowana, ale nie podłączona – żeby działanie było identyczne. Decyzja Sebastiana.
- Martwy kod w starym programie: lista `MATERIALS` w `bryty.js` (nadpisywana przez `materialy.js`),
  `steps()/drawSteps()` i numeracja stron „strona i/n” w `montaz.js` (zawsze 1 strona), flaga `scaled` w PDF (zawsze false), jedna gałąź w `jakosc.js`.
- Klucze API tylko ze zmiennych środowiskowych (stary program czytał też pliki `klucz-*.txt` obok serwera) – zgodnie z zasadą „sekrety tylko w env”; zmienione komunikaty o braku klucza.
- Corel: gdy skrypt nie zapisał pliku, a proces nie zgłosił błędu, stary serwer pokazywał klientowi „null” – teraz „CorelDRAW nie zapisał pliku.”.
- Cena Sand Dot GW 279,05 zł – DO WALIDACJI (możliwa literówka w cenniku).
- `window.Materialy` w nowym programie nie wystawia surowej listy `PRODUKTY` (żaden skrypt strony jej nie używa);
  reszta obiektu (`lista`, `GRUPY`, `TERMINY`, `ZRODLO`, `wybrany`, `init`, `sync`) – bez zmian.
- `window.Montaz` w nowym programie nie ma `steps` (martwy kod, patrz wyżej); `widths`, `init`, `make`, `model` – bez zmian.
- **Świadoma zmiana (decyzja Sebastiana 23.11.2026):** plik .cdr domyślnie z obrazami osadzonymi (stary program od 31.10 wysyłał `link:true` – po przeniesieniu pliku brak obrazów); obrazy linkowane jako opcja. PDF zostaje podstawowym plikiem dla ARPI. Wprowadzane przy przepisaniu `bryty.js`, z testem i opisem w README.
- PR #6 starego repo (schemat montażu: zakład 5 cm) nie jest scalony – wzorcem jest `main`.

# Zasady pracy w repozytorium (dla Claude i innych asystentów AI)

Repozytorium: konfigurator fototapet Valare (ARPI), wersja napisana od nowa w TypeScript.
Właściciel: Sebastian (konsultant AI, nie programista). Komunikacja po polsku, konkretnie.

## Cel przepisania

Nowy program ma działać **identycznie** jak stary (repo `fototapety-valare`, gałąź `main`, commit 6933982).
Dowodem są testy charakteryzujące („golden”): wyniki starego programu nagrane w `tests/fixtures/golden/`
(nagrywarka: `tests/golden/record-old.mjs`), które nowy kod musi odtworzyć co do znaku i bajtu.
Repo `fototapety-valare` jest tylko do odczytu.

## Zasady kodu (obowiązkowe)

- TypeScript `strict`, modułowy monolit: `src/` (kod) + `tests/` (testy).
- TDD: RED → GREEN → REFACTOR. Najpierw test, który pada (zapis w `docs/tdd-log.md`), potem minimum kodu.
- Klasy i moduły zamiast zmiennych globalnych. Logika domenowa bez DOM (`src/domain`), generatory plików
  na bajtach (`src/output`), serwer Node (`src/server`), interfejs (`src/web`).
- Lint (ESLint) i formatowanie (Prettier) muszą przechodzić. Pokrycie testami: min. 80% linii, 70% gałęzi.
- Sekrety (klucze OpenAI, Replicate, Topaz, hasło aplikacji) **tylko w zmiennych środowiskowych**. Nigdy w repo.
- Płatne API (OpenAI, Replicate/Topaz) testujemy **wyłącznie na atrapach (mockach)**.
- Nie wymyślać danych, cen, parametrów technicznych. Statusy: CONFIRMED / DO WALIDACJI / BRAK DANYCH.
- Przed każdym fragmentem kodu checklista:
  `Checklista: [analiza ✔] [test RED najpierw ✔] [minimum kodu ✔] [refactor ✔] [klasy zamiast globali ✔] [src/ + tests/ ✔] [pokrycie ≥80% ✔] [CI zielone ✔] [pułapki AI sprawdzone ✔]`

## Proces

- Małe pull requesty: **jeden moduł na PR**, na osobnej gałęzi (PR-y mogą być „piętrowe”).
- **Bez scalania do `main` bez zgody Sebastiana. Bez wdrożenia (deploy).** CI nie wdraża.
- Uwagi z code review (Claude-recenzent, Copilot) odpowiadamy i poprawiamy w PR / Issues.
- Stan prac na koniec każdego etapu: `docs/STAN-PRAC.md`.

## Polecenia

- `npm run check` – formatowanie, lint, typy, testy z pokryciem (to samo co CI).
- `npm test` – szybkie testy. `npm run format` – poprawia formatowanie.
- `OLD_REPO=/ścieżka/do/fototapety-valare node tests/golden/record-old.mjs` – ponowne nagranie wzorców
  (wymaga Playwright 1.63.0 z przeglądarką Chromium).

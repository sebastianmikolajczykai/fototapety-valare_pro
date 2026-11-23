# Konfigurator fototapet Valare – wersja 2

Narzędzie dla Valare (ARPI): klient podaje wymiary ściany i zdjęcie, a program dzieli grafikę na bryty
(pasy do druku) z naddatkami i zakładem oraz przygotowuje pliki do produkcji (JPG, ZIP, PDF, CorelDRAW)
i schemat montażu.

Wersja 2 to ten sam program napisany od nowa – porządniej, z testami – tak, aby działał **identycznie**
jak obecna wersja. Zgodność jest sprawdzana automatycznie (porównanie wyników starej i nowej wersji).

## Stan

Prace trwają etapami, każdy moduł w osobnym pull requeście. Aktualny stan: [docs/STAN-PRAC.md](docs/STAN-PRAC.md).
Budowa programu: [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md).

## Uruchomienie (dla technika)

Wymagany Node.js 22.12 lub nowszy.

```
npm ci
npm run check   # formatowanie, lint, typy, testy
```

Klucze do usług AI i hasło aplikacji podaje się wyłącznie jako zmienne środowiskowe (nigdy w plikach repo).
Miejsce uruchomienia (hosting) nie jest jeszcze wybrane.

# Konfigurator fototapet Valare – wersja 2

Narzędzie dla Valare (ARPI): klient podaje wymiary ściany i zdjęcie, a program dzieli grafikę na bryty
(pasy do druku) z naddatkami i zakładem oraz przygotowuje pliki do produkcji (JPG, ZIP, PDF, CorelDRAW)
i schemat montażu.

Wersja 2 to ten sam program napisany od nowa – porządniej, z testami – tak, aby działał **identycznie**
jak obecna wersja. Zgodność jest sprawdzana automatycznie (porównanie wyników starej i nowej wersji).

## Jedyna świadoma różnica względem starej wersji: plik .cdr

Decyzja Sebastiana z 23.11.2026.

- **Plik dla ARPI to PDF.** Bez zmian: PDF jest podstawowym plikiem wysyłanym do drukarni.
- **Plik .cdr (CorelDRAW) ma obrazy osadzone w środku.** Można go przenieść albo wysłać jako jeden plik.
  Stara wersja (od 31.10.2026) wstawiała do .cdr tylko odnośniki do plików JPG na dysku serwera.
  Po przeniesieniu albo wysłaniu takiego pliku obrazów w nim brakowało.
- **Opcja „Obrazy w .cdr jako linki”** daje stary sposób: mniejszy plik .cdr, który działa tylko razem
  z folderem JPG na tym samym komputerze. Opcja jest domyślnie wyłączona. Widać ją tylko wtedy, gdy serwer
  ma CorelDRAW (wyłącznie serwer Windows z licencją Corela). Bez Corela program robi PDF, tak jak dotąd.

Test porównawczy (`tests/e2e/bryty.test.ts`) sprawdza:

- że poza tym jednym punktem oba programy wysyłają do Corela identyczne zlecenie;
- że po włączeniu opcji zlecenie jest identyczne ze starym.

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

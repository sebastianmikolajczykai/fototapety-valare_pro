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

## Świadome zmiany po uwagach Valare/ARPI

Zmiany względem starego programu, potwierdzone przez Valare. Wzorce nagrane ze starego programu zostają bez zmian,
a testy nakładają na nie tylko te poprawki (`tests/support/zmiany.ts`):

- **Cena Sand Dot GW: 279 zł brutto/m²** (Valare 27.11.2026; w cenniku 2024/1 była literówka 279,05).

## Stan

Prace trwają etapami, każdy moduł w osobnym pull requeście. Aktualny stan: [docs/STAN-PRAC.md](docs/STAN-PRAC.md).
Budowa programu: [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md).

## Uruchomienie

Wymagany Node.js 22.12 lub nowszy (sprawdzenie: `node -v`).

```
npm ci          # instalacja zależności (raz, po pobraniu repo)
npm run build   # budowa strony i serwera do folderu dist/
npm start       # start serwera
```

Bez zmiennej `PORT` serwer działa lokalnie: strona pod adresem http://127.0.0.1:3100, dostępna tylko z tego
komputera, a AI działa bez hasła. Gdy `PORT` jest ustawiony (serwer w internecie), serwer nasłuchuje na wszystkich
adresach, a płatne AI działa tylko po zalogowaniu hasłem `APP_PASSWORD`.

Stan serwera: http://127.0.0.1:3100/api/health. Pole `corel` mówi, czy działa zapis .cdr, a pole `ai`, czy są klucze.

Sprawdzenie kodu (to samo, co robi CI): `npm run check`.

## Ustawienia (zmienne środowiskowe)

Klucze i hasła podaje się **wyłącznie jako zmienne środowiskowe**, nigdy w plikach repo.
**Uwaga:** stara wersja czytała też pliki `klucz-openai.txt` i `klucz-topaz.txt` obok serwera. Nowa wersja ich
nie czyta. Na komputerze, na którym AI działało z tych plików, trzeba przepisać klucze do zmiennych (niżej).

| Zmienna                               | Do czego                                                         | Domyślnie                        |
| ------------------------------------- | ---------------------------------------------------------------- | -------------------------------- |
| `OPENAI_API_KEY`                      | grafika AI i wizualizacja AI (OpenAI)                            | brak = AI niedostępne            |
| `REPLICATE_API_TOKEN`                 | powiększanie zdjęć w chmurze (Replicate, model Topaz)            | brak                             |
| `TOPAZ_API_KEY`                       | powiększanie bezpośrednio w Topaz                                | brak                             |
| `UPSCALER`                            | wymuszenie powiększania: `replicate`, `topaz` albo `lokalny`     | pierwszy gotowy w tej kolejności |
| `AI_LIMIT_DZIENNY`                    | maks. liczba płatnych zapytań AI na dobę                         | brak limitu                      |
| `APP_PASSWORD`                        | hasło do strony, gdy serwer jest w internecie                    | brak                             |
| `SESSION_SECRET`                      | klucz podpisu sesji logowania                                    | wyprowadzony z hasła             |
| `PORT`                                | port serwera w internecie (włącza tryb „w internecie”)           | brak = tryb lokalny              |
| `LOCAL_PORT`                          | port w trybie lokalnym                                           | 3100                             |
| `OSADZENIE_NA`                        | adresy stron (https://…), które mogą osadzić narzędzie w ramce   | brak                             |
| `OPENAI_IMAGE_MODEL`                  | model obrazów OpenAI                                             | `gpt-image-2`                    |
| `OPENAI_IMAGE_QUALITY`                | jakość obrazów OpenAI: `low`, `medium`, `high` (wpływa na koszt) | `medium`                         |
| `REPLICATE_MODEL`                     | model powiększania w Replicate                                   | `topazlabs/image-upscale`        |
| `REPLICATE_SCALE_MAX`                 | maks. powiększenie w Replicate (do 10)                           | 4                                |
| `TOPAZ_MODEL`                         | wymuszony model Topaz                                            | dobierany do rodzaju grafiki     |
| `REALESRGAN_MODEL`, `REALESRGAN_TILE` | lokalne powiększanie Real-ESRGAN (tylko demo)                    | `realesrgan-x4plus`, 64          |
| `PUBLIC_DIR`                          | inny folder strony                                               | `dist/public`                    |

### Jak ustawić zmienne na Windows

Na jeden start, w oknie PowerShell w folderze programu:

```
$env:OPENAI_API_KEY = "tu-wklej-klucz"
$env:REPLICATE_API_TOKEN = "tu-wklej-token"
npm start
```

Na stałe dla użytkownika Windows (po tym zamknij i otwórz okno PowerShell):

```
setx OPENAI_API_KEY "tu-wklej-klucz"
setx REPLICATE_API_TOKEN "tu-wklej-token"
```

Albo: Start → „Edytuj zmienne środowiskowe dla konta” → Nowa. Klucza nie wpisuj do żadnego pliku w repo.

## Usługa testowa na Renderze

`render.yaml` opisuje osobną usługę testową `fototapety-valare-v2-test` (stara usługa `fototapety-valare` zostaje bez
zmian). Utworzenie raz w panelu Rendera: **New → Blueprint** → repo `fototapety-valare_pro`, gałąź `render-test`,
wpisać `APP_PASSWORD` (bez niego strona jest otwarta, a płatne AI wyłączone) i ewentualnie klucze AI. Na serwerze
Rendera nie ma Corela, więc pliki produkcyjne wychodzą jako PDF (jak w starej wersji).

## Plik .cdr (CorelDRAW)

Zapis .cdr działa tylko na komputerze z Windows, na którym jest zainstalowany licencjonowany CorelDRAW,
i tylko gdy serwer działa na tym samym komputerze. Serwer uruchamia Corela przez PowerShell
(skrypt `zapisz-cdr.ps1`, kopiowany do `dist/server/` przy `npm run build`).
Gdy Corela nie ma, `/api/health` pokazuje `"corel": false`, a strona robi PDF, tak jak dotąd.

Sprawdzone 23.11.2026 na laptopie z CorelDRAW 2026 (wersja 27.2): ściana 250 × 200 cm, 2 bryty, 100 DPI.

- .cdr z osadzonymi obrazami: 105 MB, 52 s. Po przeniesieniu do innego folderu jest kompletny.
- .cdr z linkami: 24 MB, 25 s. Po przeniesieniu linki są zerwane. Corel pokazuje wtedy tylko podgląd
  w niskiej rozdzielczości, więc błąd widać dopiero w druku.

Pliki trybu „linki” zostają na serwerze w folderze `wyniki/` obok strony.

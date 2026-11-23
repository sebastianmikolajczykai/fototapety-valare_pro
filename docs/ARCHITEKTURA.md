# Architektura (wersja 2)

Modułowy monolit w TypeScript. Jeden proces Node serwuje stronę i API; logika liczona w przeglądarce
(jak w starej wersji – zdjęcie klienta nie wychodzi z komputera, poza funkcjami AI).

| Warstwa | Folder       | Zawartość                                                                                                                    | Zależy od       |
| ------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Domena  | `src/domain` | jednostki, podział na bryty, walidacja, materiały, wycena, jakość zdjęcia, ściana, próbka, geometria wizualizacji, teksty AI | nic             |
| Wyjście | `src/output` | bajty plików: JPG z DPI (JFIF), ZIP, PDF produkcyjny, zlecenie CDR, PDF schematu montażu                                     | domena          |
| Serwer  | `src/server` | pliki statyczne, nagłówki bezpieczeństwa, logowanie, AI (OpenAI/Replicate – tylko przez env), CorelDRAW (Windows)            | domena          |
| Strona  | `src/web`    | interfejs w przeglądarce (ten sam HTML/CSS i identyfikatory co stara wersja)                                                 | domena, wyjście |

Zasady: domena i wyjście nie znają DOM ani Node (działają na liczbach i `Uint8Array`), więc są testowane
bez przeglądarki. Zgodność ze starym programem sprawdzają testy „golden” (`tests/fixtures/golden`), a na końcu
test e2e porównujący stary i nowy program (te same dane → te same teksty i pliki).

Hosting: **nie wybrany** (decyzja Sebastiana; docelowo system Valare). CI tylko sprawdza, nie wdraża.

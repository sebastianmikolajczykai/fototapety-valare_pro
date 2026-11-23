# Dziennik TDD (RED → GREEN)

Każdy moduł: najpierw test, potem pusta implementacja (`throw new Error('nie zaimplementowano')`), uruchomienie
(test MUSI paść), potem implementacja (test przechodzi). Tu zapisane wyniki przebiegów RED i GREEN.

| Moduł             | RED (padło)                                                                                                                                                                                                                                                   | GREEN (przeszło)          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| domain/format     | 4 testy padły („nie zaimplementowano”)                                                                                                                                                                                                                        | 4/4                       |
| domain/units      | 6 testów padło („nie zaimplementowano”); po implementacji 2 dalej padły – błędne założenie w teście (6 cm przy 150 DPI = 355 px w górę, a 354 to zaokrąglenie zakładu w układzie); test poprawiony do faktów                                                  | 6/6                       |
| domain/layout     | 496 testów padło na pustej implementacji (7 unit + 488 wzorzec recenzenta + 1 liczność); po implementacji 1 padł – błędne założenie o liczbie poprawnych przypadków (jest 488), test poprawiony                                                               | 506/506 (wszystkie testy) |
| domain/validation | 844 testy padły na pustej implementacji (7 unit + 837 wzorzec recenzenta); po implementacji 2 testy padły – złe dane w moich testach (ściana 350 nie daje wąskiego ostatniego brytu; 276 cm przy 300 DPI przekracza wysokość, nie szerokość); dane poprawione | 1352/1352                 |

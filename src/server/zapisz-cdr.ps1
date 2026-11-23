# Zapis arkusza fototapety jako plik CorelDRAW (.cdr) przez COM.
# Wejscie: katalog z manifest.json (opis arkusza w cm, y od gory) i plikami JPG.
# Wyjscie: wynik.cdr w tym samym katalogu. Wzorzec: eksport CDR w konfiguratorze FeltDecor.
# "link": true w manifescie = JPG linkowane zewnetrznie (zostaja obok .cdr), bez tego osadzone.
param([Parameter(Mandatory = $true)][string]$Dir)
$ErrorActionPreference = "Stop"

$m = Get-Content -LiteralPath (Join-Path $Dir "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$mm = 10.0                                   # manifest w cm, dokument w mm
$ptPerCm = 72 / 2.54
$W = [double]$m.pageW * $mm
$H = [double]$m.pageH * $mm
function Y([double]$v) { return $H - $v * $mm }   # Corel: y od dolu strony
$link = [bool]$m.link

$app = $null
# Corel otwarty przez uzytkownika (widoczne okno): COM podlaczylby sie do tego samego programu, ukryl go
# i zamknal razem z niezapisana praca - dlatego wtedy przerywamy z prosba o zamkniecie Corela.
# Ukryty Corel bez okna (np. po przerwanym zapisie) nie blokuje - zostanie uzyty i zamkniety jak dotad.
if (Get-Process -Name "CorelDRW" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }) {
    throw "CorelDRAW jest otwarty. Zapisz swoja prace, zamknij CorelDRAW i sprobuj ponownie (zapis .cdr uruchamia Corela w tle)."
}
# Jedna proba: nieudane uruchomienie Corela trwa ok. 2 min (np. wygasla licencja).
try { $app = New-Object -ComObject "CorelDRAW.Application" }
catch { throw ("CorelDRAW nie uruchomil sie w trybie automatyzacji. Najczesciej oznacza to brak aktywnej licencji (Trial Expired). Szczegoly: " + $_.Exception.Message) }
$app.Visible = $false
try { $app.Optimization = $true } catch {}

function Cmyk($c) { return $app.CreateCMYKColor([int]$c[0], [int]$c[1], [int]$c[2], [int]$c[3]) }
function Set-Cmyk($color, $c) { $color.CMYKAssign([int]$c[0], [int]$c[1], [int]$c[2], [int]$c[3]) }
function Set-Outline($shape, $col, [double]$wd) {
    $shape.Fill.ApplyNoFill()
    $shape.Outline.Width = $wd * $mm
    Set-Cmyk $shape.Outline.Color $col
}

$doc = $null
try {
    $doc = $app.CreateDocument()
    $doc.Unit = 3                            # cdrMillimeter
    $page = $doc.ActivePage
    $page.SetSize($W, $H)
    $layer = $page.ActiveLayer

    foreach ($op in $m.ops) {
        switch ($op.t) {
            "img" {
                # Tylko pliki przeslane do tego folderu (serwer sprawdza to samo) – bez sciezek typu ..\x.jpg
                if ([string]$op.file -notmatch '^[\w.-]+\.jpg$') { throw ("Niepoprawna nazwa pliku: " + $op.file) }
                # Import() z PowerShella nie dziala (opcjonalne argumenty COM); ImportEx + Finish tak.
                $io = $app.CreateStructImportOptions()
                $io.LinkBitmapExternally = $link
                $layer.ImportEx((Join-Path $Dir $op.file), 0, $io).Finish()
                $s = $app.ActiveSelectionRange
                $s.SetSize([double]$op.w * $mm, [double]$op.h * $mm)
                $s.Move([double]$op.x * $mm - $s.LeftX, (Y $op.y) - $s.TopY)   # lewy gorny rog
            }
            "rectF" {
                $r = $layer.CreateRectangle([double]$op.x * $mm, (Y $op.y), ([double]$op.x + [double]$op.w) * $mm, (Y ([double]$op.y + [double]$op.h)))
                $r.Fill.ApplyUniformFill((Cmyk $op.col))
                $r.Outline.SetNoOutline()
            }
            "rectS" {
                $r = $layer.CreateRectangle([double]$op.x * $mm, (Y $op.y), ([double]$op.x + [double]$op.w) * $mm, (Y ([double]$op.y + [double]$op.h)))
                Set-Outline $r $op.col $op.wd
            }
            "line" {
                $l = $layer.CreateLineSegment([double]$op.x1 * $mm, (Y $op.y1), [double]$op.x2 * $mm, (Y $op.y2))
                Set-Outline $l $op.col $op.wd
            }
            "text" {
                $t = $layer.CreateArtisticText([double]$op.x * $mm, (Y $op.y), [string]$op.s, 1045, 238, "Arial", [double]$op.size * $ptPerCm)
                $t.Fill.ApplyUniformFill((Cmyk $op.col))
                if ($op.rot) {
                    $t.RotationCenterX = [double]$op.x * $mm
                    $t.RotationCenterY = (Y $op.y)
                    $t.Rotate(90)
                }
            }
        }
    }
    $out = Join-Path $Dir "wynik.cdr"
    $opts = $app.CreateStructSaveAsOptions()
    $doc.SaveAs($out, $opts)
    Write-Output "saved"
} finally {
    if ($doc) { try { $doc.Close() } catch {} }
    try { $app.Quit() } catch {}
}

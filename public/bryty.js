// Główny skrypt strony bryty.html (przeniesiony z HTML 06.11.2026, żeby nagłówek CSP mógł zakazać skryptów wpisanych w stronę).
// Kolor paska thru cut odczytany z brytów drukarni (zlecenie 005-21): RGB ok. (0,163,212) = 100% C.
const THRU_RGB = 'rgb(0,163,212)';
const THRU_CM = 0.5;
const JPEG_QUALITY = 0.92;
const MAX_BRYTY = 30;
// Uwagi ARPI 28.10.2026: na styk sąsiednie bryty też mają wspólną grafikę – 1 cm.
const BUTT_OV_CM = 1;
const MIN_LAST_CM = 5;          // ustalenie Sebastiana 2026-10-20: węższego paska raczej się nie tnie
// Materiały z cennika Valare 2024 (docs/kontekst-folderu.md): [nazwa, maks. szerokość druku w cm].
const MATERIALS = [
  ['Mural Canvas CT', 131], ['Burlap Blend CT', 131], ['Dune Dust CT', 131], ['Rock Stone CT', 131], ['Woven Bamboo NW', 131],
  ['Diamante CT', 130], ['Fabric Canvas NW', 124], ['Granular Sand NW', 124], ['Canvas NW', 132], ['Concrete NW', 131], ['Linen NW', 132],
  ['Sand Dot GW 107', 100], ['Sand Dot GW 137', 131], ['Sand Dot GW 160', 154],
  ['Texile Stick GW 107', 100], ['Texile Stick GW 127', 121], ['Texile Stick GW 152', 146], ['Canvas GW', 131],
  ['Soft Skin', 135], ['Luxe Lino (podłoga)', 194], ['Tapeta Waterproof Out', 94],
];
const MAX_MARGIN_CM = 10;

const $ = id => document.getElementById(id);
// Tekst z zewnątrz (komunikaty serwera, ścieżki) wstawiany do HTML – bez interpretacji znaczników.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let img = null, imgUrl = null;
let lastUrls = [];
// Kadr: zoom >= 1 względem minimalnego wypełnienia, fx/fy = położenie wycinka 0..1 (0,5 = środek).
const crop = { zoom: 1, fx: 0.5, fy: 0.5 };
const PREVIEW_MAX = 4000;   // dłuższy bok kopii zdjęcia do podglądu [px]
// Rysuje fragment zdjęcia (współrzędne w pikselach oryginału) z kopii podglądowej, jeśli jest.
function drawFast(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
  const s = img.preview, r = s ? s.width / img.naturalWidth : 1;
  ctx.drawImage(s || img, sx * r, sy * r, sw * r, sh * r, dx, dy, dw, dh);
}

const cmToPx = (cm, dpi) => cm / 2.54 * dpi;
const pxCeil = (cm, dpi) => Math.ceil(cmToPx(cm, dpi) - 1e-6);
const num = v => parseFloat(String(v).replace(',', '.'));

function params() {
  const join = document.querySelector('input[name=join]:checked').value;
  const split = document.querySelector('input[name=split]:checked').value;
  return {
    wallW: num($('wallW').value), wallH: num($('wallH').value),
    mT: num($('mT').value), mB: num($('mB').value), mL: num($('mL').value), mR: num($('mR').value),
    join, overlap: join === 'butt' ? BUTT_OV_CM : num($('overlap').value),
    split, count: parseInt($('count').value, 10),
    widths: [...document.querySelectorAll('#widthsBox input')].map(el => el.value.trim() === '' ? NaN : num(el.value)),
    maxPrint: $('material').value === 'own' ? num($('maxPrint').value) : $('material').value === '' ? Infinity : parseFloat($('material').value),
    dpi: parseInt($('dpi').value, 10), thru: $('thru').checked, pdf: $('pdf').checked,
    order: ($('order').value || 'zlecenie').trim().replace(/[^\w\-.,]+/g, '_'),
    orderName: ($('order').value || 'zlecenie').trim(),   // do wyświetlenia (PDF), bez zamiany spacji na _
  };
}

// Szerokości brytów w cm. Całość (ściana + naddatki boczne) = suma brytów - zakłady.
function brytWidths(p, totalWcm) {
  if (p.split === 'equal') {
    const w = (totalWcm + (p.count - 1) * p.overlap) / p.count;
    return { widths: Array(p.count).fill(w), added: false };
  }
  const w = p.widths.slice();
  const auto = Number.isNaN(w[w.length - 1]);
  const known = auto ? w.slice(0, -1) : w;
  const covered = known.reduce((a, x) => a + x, 0) - Math.max(0, known.length - 1) * p.overlap;
  if (auto) {
    // puste ostatnie pole: ostatni bryt dopełnia resztę (z zakładem do poprzedniego)
    w[w.length - 1] = totalWcm - covered + (known.length ? p.overlap : 0);
    return { widths: w, added: true, rest: 0 };
  }
  return { widths: w, added: false, rest: totalWcm - covered };
}

// Geometria. Wzorzec: zlecenie 005-21 (ściana 350x270, naddatek 3, zakład 6, 3 bryty
// -> bryty 7245x16300 px przy 150 DPI, zdjęcie wpasowane w obszar między paskami thru cut).
function layout(p) {
  const totalWcm = p.wallW + p.mL + p.mR;
  const totalHcm = p.wallH + p.mT + p.mB;
  const bw = brytWidths(p, totalWcm);
  const bH = pxCeil(totalHcm, p.dpi);
  const band = p.thru ? Math.round(cmToPx(THRU_CM, p.dpi)) : 0;
  const ov = Math.round(cmToPx(p.overlap, p.dpi));
  const bWs = bw.widths.map(w => pxCeil(w, p.dpi));
  const xs = []; let x = 0;
  for (const w of bWs) { xs.push(x); x += w - ov; }
  let panoW = x + ov;                          // szerokość całości w px
  // Zaokrąglony zakład (np. 6 cm przy 300 DPI = 708,66 -> 709 px) potrafi skrócić całość o ułamek mm –
  // brakujące piksele dostaje ostatni bryt, żeby wydruk zawsze pokrył ścianę z naddatkiem.
  const needW = pxCeil(totalWcm, p.dpi);
  if (panoW < needW) { bWs[bWs.length - 1] += needW - panoW; panoW = needW; }
  const imgH = bH - 2 * band;                  // wysokość pola zdjęcia
  return { totalWcm, totalHcm, bw, bWs, xs, bH, band, ov, panoW, imgH };
}

// Wypełnienie całego pola zdjęciem, powiększenie i położenie wycinka wg kadru.
function fit(L, iw, ih) {
  const s = Math.max(L.panoW / iw, L.imgH / ih) * crop.zoom;
  const exW = iw * s - L.panoW, exH = ih * s - L.imgH;
  return { s, cx: exW * crop.fx, cy: exH * crop.fy, exW, exH };
}

function validate(p) {
  const e = [];
  if (!(p.wallW > 0) || !(p.wallH > 0)) e.push('Podaj wymiary ściany większe od zera.');
  for (const [k, n] of [['mT', 'górze'], ['mB', 'dole'], ['mL', 'lewej'], ['mR', 'prawej']])
    if (!(Number.isInteger(p[k] * 2) && p[k] >= 0 && p[k] <= MAX_MARGIN_CM)) e.push(`Naddatek na ${n} musi wynosić 0–${MAX_MARGIN_CM} cm, co 0,5 cm.`);
  if (!(p.overlap >= 0)) e.push('Zakład nie może być ujemny.');
  if (!(p.maxPrint > 0)) e.push('Wpisz maksymalną szerokość druku materiału (większą od zera).');   // „Inny materiał” z pustym polem przepuszczał każdy bryt
  if (!(p.dpi >= 50)) e.push('Rozdzielczość musi wynosić co najmniej 50 DPI.');
  if (!(p.count >= 1 && p.count <= MAX_BRYTY)) e.push(`Liczba brytów musi wynosić od 1 do ${MAX_BRYTY}.`);
  if (p.thru && p.wallH > 0 && p.dpi > 0 && pxCeil(p.wallH + p.mT + p.mB, p.dpi) <= 2 * Math.round(cmToPx(THRU_CM, p.dpi)))
    e.push(`Przy pasku thru cut wysokość z naddatkami musi być większa niż ${f1(2 * THRU_CM)} cm.`);
  if (p.split === 'custom' && p.widths.some((w, i) => !(w > 0) && !(i === p.widths.length - 1 && Number.isNaN(w))))
    e.push('Wpisz szerokość każdego brytu (większą od zera). Puste może zostać tylko ostatnie pole.');
  if (e.length) return e;
  const L = layout(p);
  const widest = Math.max(...L.bw.widths);
  if (widest > p.maxPrint + 1e-6) {
    const need = Math.ceil((L.totalWcm - p.overlap) / (p.maxPrint - p.overlap));
    e.push(`Bryt ma ${f1(widest)} cm, a materiał drukuje maks. ${f1(p.maxPrint)} cm (naddatki i zakład wliczone).` +
      (p.split === 'equal' && p.maxPrint > p.overlap ? ` Potrzeba co najmniej ${need} ${plural(need)}.` : ' Zwiększ liczbę brytów albo zmniejsz ich szerokości.'));
  }
  const last = L.bw.widths[L.bw.widths.length - 1];
  if (p.split === 'custom' && L.bw.added && L.bw.widths.length > 1 && !(last > p.overlap))
    e.push('Wcześniejsze bryty już pokrywają całą ścianę z naddatkiem. Zmniejsz liczbę brytów albo ich szerokości.');
  else if (p.split === 'custom' && L.bw.rest < -0.05)
    e.push(`Bryty są o ${f1(-L.bw.rest)} cm za szerokie względem ściany z naddatkiem. Zmniejsz szerokości.`);
  else if (p.split === 'custom' && L.bw.rest > 0.05)
    e.push(`Bryty są o ${f1(L.bw.rest)} cm za wąskie względem ściany z naddatkiem. Zwiększ szerokości albo zostaw ostatnie pole puste.`);
  else if (L.bw.widths.length > 1 && L.bw.widths.some(w => w <= p.overlap)) e.push('Zakład jest większy niż szerokość brytu.');
  if (e.length) return e;
  // Limity przeglądarki (Chromium: bok 65 535 px, pole 268 435 456 px – zostawiamy zapas). Komunikat mówi, co realnie pomoże.
  const SIDE = 32000, AREA = 260e6;
  if (L.bH > SIDE) {
    const fit = [...document.querySelectorAll('#dpi option')].map(o => +o.value).sort((a, b) => a - b).filter(d => pxCeil(L.totalHcm, d) <= SIDE).pop();
    e.push(`Bryt miałby ${L.bH} px wysokości, a przeglądarka zapisze najwyżej ${SIDE} px. Przy ${f1(L.totalHcm)} cm wysokości (z naddatkami) ` +
      (fit ? `wybierz najwyżej ${fit} DPI.` : 'zmniejsz rozdzielczość.') + ' Zmiana szerokości ani liczby brytów tu nie pomoże.');
    return e;
  }
  const widestPx = Math.max(...L.bWs);
  if (widestPx > SIDE || widestPx * L.bH > AREA) {
    let need = null;   // najmniejsza liczba równych brytów, która się mieści (sprawdzona na prawdziwym podziale)
    for (let k = L.bWs.length + 1; k <= MAX_BRYTY && need === null; k++) {
      const Lk = layout({ ...p, split: 'equal', count: k }), wk = Math.max(...Lk.bWs);
      if (wk <= SIDE && wk * Lk.bH <= AREA) need = k;
    }
    const maxWcm = Math.min(SIDE, Math.floor(AREA / L.bH)) / p.dpi * 2.54;
    e.push(`Bryt ${widestPx} × ${L.bH} px jest za duży dla przeglądarki (maks. ok. ${f1(Math.floor(maxWcm))} cm szerokości przy ${p.dpi} DPI). ` +
      (p.split === 'equal' && need ? `Ustaw co najmniej ${need} ${plural(need)} albo zmniejsz DPI.` : 'Zmniejsz szerokość brytów albo DPI.'));
  }
  return e;
}

const f1 = x => x.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
const f2 = x => x.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
const plural = n => n === 1 ? 'bryt' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'bryty' : 'brytów';

// Zmiana ustawień unieważnia wcześniej wygenerowane pliki.
function changed() {
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
  if ($('dl').innerHTML) { $('dl').innerHTML = ''; lastUrls.forEach(u => URL.revokeObjectURL(u)); lastUrls = []; }
  render();
}
// Przeciąganie kadru i suwak powiększenia: najwyżej jedno przerysowanie na klatkę ekranu
// (zdarzeń myszy bywa kilka razy więcej niż klatek, a każde przerysowanie liczy też jakość, wycenę i wizualizację).
let frame = 0;
function changedSoon() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; changed(); }); }

// Ostrzeżenia nie blokują generowania (ustalenie: wąski pasek to odpowiedzialność klienta).
function warnings(p, L) {
  const w = [];
  const n = L.bw.widths.length;
  if (n > 1) {
    const strip = L.bw.widths[n - 1] - p.overlap;     // część ostatniego brytu, której nie pokrywa poprzedni
    if (strip < MIN_LAST_CM - 1e-6)
      w.push(`Ostatni bryt jest wąski: ${f1(strip)} cm szerokości po odjęciu zakładu (minimum ${MIN_LAST_CM} cm). Tak wąskiego paska raczej się nie tnie.`);
  } else if (L.bw.widths[0] < MIN_LAST_CM) {
    w.push(`Bryt ma tylko ${f1(L.bw.widths[0])} cm szerokości (minimum ${MIN_LAST_CM} cm).`);
  }
  return w;
}

let view = null; // skala i położenie górnego podglądu (do przeciągania kadru)

// Pola szerokości: tyle, ile brytów. Nowe pola dostają szerokość z równego podziału
// (w pełnych cm), ostatnie zostaje puste = reszta.
let widthsWasCustom = false, widthsAuto = null;   // tryb przy poprzednim odświeżeniu; wartości wpisane automatycznie
function syncWidths() {
  const box = $('widthsBox');
  const n = Math.min(MAX_BRYTY, Math.max(1, parseInt($('count').value, 10) || 1));
  const cur = [...box.querySelectorAll('input')];
  // Po przełączeniu na „własne” pola startują od aktualnego równego podziału, a nie od wartości sprzed zmiany ściany
  // (dawało np. 122,7 cm + reszta 145 cm) – ale tylko gdy użytkownik ich nie zmieniał (wpisane szerokości zostają).
  const custom = document.querySelector('input[name=split]:checked').value === 'custom';
  const entering = custom && !widthsWasCustom; widthsWasCustom = custom;
  const vals = cur.map(el => el.value);
  const fresh = entering && !!widthsAuto && vals.length === widthsAuto.length && vals.every((v, i) => v === widthsAuto[i]);
  if (cur.length === n && !fresh) return;
  const p = params();
  const total = p.wallW + p.mL + p.mR;
  // Równy podział zaokrąglony w górę do 0,1 cm: przy zaokrągleniu w dół „reszta” wychodziła szersza od pozostałych
  // i mogła przekroczyć szerokość druku materiału (np. 1000 cm, 8 brytów: 130 + reszta 132 cm przy limicie 131).
  const eq = total > 0 ? Math.ceil((total + (n - 1) * (p.overlap || 0)) / n * 10 - 1e-9) / 10 : '';
  box.innerHTML = '';
  const written = [];
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? '' : (custom && !fresh && vals[i] ? vals[i] : eq);   // przy równym podziale nowe pola zawsze z równego podziału
    written.push(String(v));
    box.insertAdjacentHTML('beforeend', `<div><label for="bw${i}">Bryt ${i + 1}</label><input id="bw${i}" type="number" min="1" step="0.1" value="${v}"${i === n - 1 ? ' placeholder="reszta"' : ''}></div>`);
  }
  widthsAuto = written.every((v, i) => i === n - 1 || v === String(eq)) ? written : null;
}

function render() {
  $('maxBox').hidden = $('material').value !== 'own';
  syncWidths();
  const p = params();
  $('customBox').hidden = p.split !== 'custom';
  $('overlap').disabled = p.join === 'butt';
  $('zoomVal').textContent = Math.round(crop.zoom * 100) + '%';
  const errs = validate(p);
  $('msg').innerHTML = errs.map(x => `<div class="err">${x}</div>`).join('');
  $('go').disabled = genBusy || !img || errs.length > 0;
  if (window.Wycena) Wycena.update(p, errs.length ? null : layout(p));
  const cv = $('preview'), ctx = cv.getContext('2d');
  if (errs.length) { $('tbl').innerHTML = ''; $('calc').innerHTML = ''; view = null; if (window.Jakosc) Jakosc.update(null); return; }
  const L = layout(p);
  const n = L.bWs.length;

  let rows = '<tr><th>Bryt</th><th>Szerokość</th><th>Wysokość</th><th>Piksele</th></tr>';
  L.bw.widths.forEach((w, i) => {
    const note = L.bw.added && i === n - 1 ? ' <span class="hint">(reszta)</span>' : '';
    rows += `<tr><td>${i + 1}${note}</td><td>${f2(w)} cm</td><td>${f1(L.totalHcm)} cm</td><td>${L.bWs[i]} × ${L.bH}</td></tr>`;
  });
  $('tbl').innerHTML = rows;

  let calc = `Całość z naddatkiem: ${f1(L.totalWcm)} × ${f1(L.totalHcm)} cm. ` +
    (p.join === 'butt' ? `Łączenie na styk (${f1(p.overlap)} cm wspólnej grafiki).` : `Zakład ${f1(p.overlap)} cm.`);
  if (img) {
    const F = fit(L, img.naturalWidth, img.naturalHeight);
    const pxPerM = Math.round(p.dpi / 2.54 * 100 / F.s);
    calc += ` Zdjęcie powiększone ${f2(F.s)}×, rozdzielczość źródła na ścianie ok. ${pxPerM} px/m.`;
    const cutW = Math.round(F.exW / F.s), cutH = Math.round(F.exH / F.s);
    if (cutW > 0) calc += ` Poza kadrem w poziomie: ${cutW} px zdjęcia.`;
    if (cutH > 0) calc += ` Poza kadrem w pionie: ${cutH} px zdjęcia.`;
    if (window.Jakosc) calc += Jakosc.update(p, L, img, F, crop.zoom);
    else if (pxPerM < 1000) calc += ` <span class="warn">Poniżej 1000 px/m – zdjęcie może być nieostre w druku.</span>`;
  }
  calc += [...warnings(p, L), ...(window.Sciana ? Sciana.warnings(p, L) : [])].map(x => `<div class="warn">${x}</div>`).join('');
  $('calc').innerHTML = calc;

  // Górny podgląd: całość z naddatkami, podziałem i kadrem
  const gap = 14;
  const sc = Math.min((cv.width - 20) / L.panoW, 280 / L.bH);
  const brSc = Math.min((cv.width - 20 - (n - 1) * gap) / L.bWs.reduce((a, x) => a + x, 0), 200 / L.bH);
  const pad = 36;
  cv.height = Math.round(L.bH * sc + L.bH * brSc + 2 * pad + 50);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  const ox = (cv.width - L.panoW * sc) / 2, oy = pad;
  view = { ox, oy, sc, w: L.panoW * sc, h: L.bH * sc, L };

  if (img) {
    const F = fit(L, img.naturalWidth, img.naturalHeight);
    // całe zdjęcie przygaszone (część poza kadrem), potem kadr w pełnych kolorach
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cv.width, oy + L.bH * sc + pad); ctx.clip();
    ctx.globalAlpha = 0.25;
    ctx.drawImage(img.preview || img, ox - F.cx * sc, oy + (L.band - F.cy) * sc, img.naturalWidth * F.s * sc, img.naturalHeight * F.s * sc);
    ctx.restore();
    drawFast(ctx, F.cx / F.s, F.cy / F.s, L.panoW / F.s, L.imgH / F.s, ox, oy + L.band * sc, L.panoW * sc, L.imgH * sc);
  } else { ctx.fillStyle = '#ddd'; ctx.fillRect(ox, oy, L.panoW * sc, L.bH * sc); }
  if (L.band) { ctx.fillStyle = THRU_RGB; ctx.fillRect(ox, oy, L.panoW * sc, L.band * sc); ctx.fillRect(ox, oy + (L.bH - L.band) * sc, L.panoW * sc, L.band * sc); }
  for (let i = 1; i < n; i++) {
    if (L.ov > 0) { ctx.fillStyle = 'rgba(10,126,164,.35)'; ctx.fillRect(ox + L.xs[i] * sc, oy, L.ov * sc, L.bH * sc); }
    else { ctx.fillStyle = '#0a7ea4'; ctx.fillRect(ox + L.xs[i] * sc - 1, oy, 2, L.bH * sc); }
  }
  const mt = cmToPx(p.mT, p.dpi) * sc, mb = cmToPx(p.mB, p.dpi) * sc, ml = cmToPx(p.mL, p.dpi) * sc, mr = cmToPx(p.mR, p.dpi) * sc;
  const W = L.panoW * sc, H = L.bH * sc;
  ctx.fillStyle = 'rgba(220,38,38,.25)';
  ctx.fillRect(ox, oy, W, mt); ctx.fillRect(ox, oy + H - mb, W, mb);
  ctx.fillRect(ox, oy + mt, ml, H - mt - mb); ctx.fillRect(ox + W - mr, oy + mt, mr, H - mt - mb);
  ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5; ctx.strokeRect(ox + ml, oy + mt, W - ml - mr, H - mt - mb);

  if (window.Sciana) Sciana.draw(ctx, view, p);
  if (window.Probka) Probka.draw(ctx, view, p);
  if (window.Jakosc) Jakosc.draw(ctx, view);

  // Dolny podgląd: bryty osobno
  const by = oy + L.bH * sc + pad + 22;
  const totalBr = L.bWs.reduce((a, x) => a + x * brSc, 0) + (n - 1) * gap;
  let x = (cv.width - totalBr) / 2;
  ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    drawBryt(ctx, L, i, x, by, brSc, true, true);
    ctx.fillStyle = '#1d1d1b'; ctx.fillText(String(i + 1), x + L.bWs[i] * brSc / 2, by - 6);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.strokeRect(x, by, L.bWs[i] * brSc, L.bH * brSc);
    x += L.bWs[i] * brSc + gap;
  }
  cv.classList.toggle('drag', !!img);
}

// Rysuje bryt i (w px docelowych * k) w punkcie (x, y).
// bands=false: tylko pole zdjęcia (wysokość imgH), bez pasków – do pliku PDF, gdzie paski są osobnymi obiektami.
function drawBryt(ctx, L, i, x, y, k, bands = true, fast = false) {
  const bW = L.bWs[i];
  const top = bands ? L.band : 0;
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, bW * k, (bands ? L.bH : L.imgH) * k);
  if (img) {
    const F = fit(L, img.naturalWidth, img.naturalHeight);
    const a = [(L.xs[i] + F.cx) / F.s, F.cy / F.s, bW / F.s, L.imgH / F.s, x, y + top * k, bW * k, L.imgH * k];
    if (fast) drawFast(ctx, ...a); else ctx.drawImage(img, ...a);
  }
  if (bands && L.band) {
    ctx.fillStyle = THRU_RGB;
    ctx.fillRect(x, y, bW * k, L.band * k);
    ctx.fillRect(x, y + (L.bH - L.band) * k, bW * k, L.band * k);
  }
}

// Przeciąganie kadru na górnym podglądzie.
let dragFrom = null;
function canvasPoint(e) {
  const r = $('preview').getBoundingClientRect(), cv = $('preview');
  return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
}
$('preview').addEventListener('pointerdown', e => {
  if (!img || !view) return;
  const pt = canvasPoint(e);
  if (pt.y > view.oy + view.h) return;
  dragFrom = { pt, fx: crop.fx, fy: crop.fy };
  $('preview').setPointerCapture(e.pointerId);
});
$('preview').addEventListener('pointermove', e => {
  if (!dragFrom || !view) return;
  const pt = canvasPoint(e);
  const F = fit(view.L, img.naturalWidth, img.naturalHeight);
  const dx = (pt.x - dragFrom.pt.x) / view.sc, dy = (pt.y - dragFrom.pt.y) / view.sc;
  crop.fx = F.exW > 0 ? Math.min(1, Math.max(0, dragFrom.fx - dx / F.exW)) : 0.5;
  crop.fy = F.exH > 0 ? Math.min(1, Math.max(0, dragFrom.fy - dy / F.exH)) : 0.5;
  changedSoon();
});
['pointerup', 'pointercancel'].forEach(ev => $('preview').addEventListener(ev, () => { dragFrom = null; }));
$('zoom').addEventListener('input', () => { crop.zoom = $('zoom').value / 100; changedSoon(); });
$('center').addEventListener('click', () => { crop.fx = crop.fy = 0.5; crop.zoom = 1; $('zoom').value = 100; changed(); });

// Ustawia gęstość w nagłówku JFIF, żeby plik miał zapisane DPI (canvas zapisuje 1:1 bez jednostki).
// Zmienia tylko 18 bajtów nagłówka – bez kopiowania całego pliku (bryt to kilkadziesiąt MB) do pamięci.
async function withDpi(blob, dpi) {
  const b = new Uint8Array(await blob.slice(0, 18).arrayBuffer());
  if (b.length < 18 || !(b[2] === 0xFF && b[3] === 0xE0 && String.fromCharCode(b[6], b[7], b[8], b[9]) === 'JFIF')) return blob;
  b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255;
  return new Blob([b, blob.slice(18)], { type: 'image/jpeg' });
}

// Minimalny ZIP bez kompresji (JPG i tak jest skompresowany).
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
// Suma kontrolna liczona kawałkami z blob.stream() – bez wczytywania całego pliku (PDF potrafi mieć setki MB) do pamięci.
// Pętla w osobnej zwykłej funkcji (zmienna lokalna) – w domknięciu async V8 liczy ją wyraźnie wolniej.
function crcAdd(c, u8) { for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return c; }
// Pliki do 256 MB czytane w całości (szybciej), większe kawałkami.
async function crc32(blob) {
  let c = 0xFFFFFFFF;
  if (blob.size <= 256e6) c = crcAdd(c, new Uint8Array(await blob.arrayBuffer()));
  else { const rd = blob.stream().getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; c = crcAdd(c, value); } }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
async function makeZip(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const data = { length: f.blob.size };
    const name = new TextEncoder().encode(f.name), crc = await crc32(f.blob);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(h.buffer, name, f.blob);   // Blob, nie kopia w pamięci JS – 30 brytów to ponad 1 GB
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, name);
    off += 30 + name.length + data.length;
  }
  const cSize = central.reduce((a, x) => a + x.byteLength, 0);
  if (off + cSize > 0xFFFFFFFF) throw new Error('ZIP ponad 4 GB – pobierz pliki pojedynczo.');   // zwykły ZIP (bez ZIP64) ma limit 4 GB
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}

// Renderuje bryt do JPG (z DPI w nagłówku).
async function renderJpeg(L, i, dpi, bands) {
  const cv = document.createElement('canvas');
  cv.width = L.bWs[i]; cv.height = bands ? L.bH : L.imgH;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  drawBryt(ctx, L, i, 0, 0, 1, bands);
  const raw = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Przeglądarka nie zapisała pliku (za mało pamięci?).')), 'image/jpeg', JPEG_QUALITY));
  cv.width = cv.height = 0;
  return withDpi(raw, dpi);
}

// PDF do CorelDRAW w układzie jak DRUK 1.cdr.
// Strona 1 – schemat (od góry):
// 1) „LEGENDA”: całość z ramką naddatku (niebieską) i liniami wymiarowymi ściany (czerwonymi),
// 2) schemat podziału: całość z paskami nad i pod, na których widać granice brytów i zakłady.
// Sekcję „Jak zlecam plik do produkcji” usunięto (decyzja Sebastiana 26.10.2026).
// Pod schematem (ta sama strona): nazwa zlecenia i bryty obok siebie w skali 1:1 – JPG w pełnej rozdzielczości,
//    pasek thru cut jako osobny prostokąt CMYK 100% C.
// Podglądy 1–3 korzystają z jednego zdjęcia w niższej rozdzielczości.
// CorelDRAW ignoruje /UserUnit; strona większa niż 508 cm (limit Acrobata) otwiera się w Corelu 1:1.
// (Dawniej: osobne strony do 500 cm – Corel centrował je względem strony 1 i bryty wypadały poza arkusz.)
const PT = 72 / 2.54;               // punkty na cm
const PDF_MAX_CM = 500;
const RED = [0, 100, 100, 0], CYAN = [100, 0, 0, 0], BLACK = [0, 0, 0, 100];   // CMYK %
// Polskie litery: własne kody 128–143 mapowane na nazwy znaków (ó/Ó są w WinAnsi).
const PL = 'ąćęłńśźżĄĆĘŁŃŚŹŻ';
const PL_NAMES = '/aogonek /cacute /eogonek /lslash /nacute /sacute /zacute /zdotaccent /Aogonek /Cacute /Eogonek /Lslash /Nacute /Sacute /Zacute /Zdotaccent';
// Kody znaków w czcionce PDF (WinAnsi + polskie litery na 128–143); nieobsługiwany znak -> „?”.
function pdfCodes(s) {
  return [...String(s).normalize('NFC')].map(ch => {   // nazwa wklejona w rozłożonej postaci (np. z macOS): „a” + ogonek -> „ą”
    const k = PL.indexOf(ch);
    const code = k >= 0 ? 128 + k : ch === 'ó' ? 0xF3 : ch === 'Ó' ? 0xD3 : ch === '×' ? 0xD7 : ch === '–' ? 0x96 : ch.charCodeAt(0);
    return code > 255 ? 63 : code;
  });
}
function pdfText(s) {
  let o = '';
  for (const code of pdfCodes(s)) {
    const c = String.fromCharCode(code);
    o += c === '(' || c === ')' || c === '\\' ? '\\' + c : code > 126 ? '\\' + code.toString(8).padStart(3, '0') : c;
  }
  return o;
}
const textW = (s, size) => s.length * size * 0.52;      // przybliżona szerokość tekstu Helvetica (opisy na schemacie)
// Dokładna szerokość z tych samych szerokości znaków co /Widths w PDF (montaz.js) – do szerokości strony pod nazwę
// zlecenia: wielkie litery są o 30–80% szersze od przybliżenia i długa nazwa wychodziła poza stronę.
let PDF_W = null;
const textWExact = (s, size) => {
  if (!window.Montaz) return textW(s, size);
  if (!PDF_W) PDF_W = Montaz.widths(false).split(' ').map(Number);
  return Math.max(textW(s, size), pdfCodes(s).reduce((a, c) => a + (c >= 32 ? PDF_W[c - 32] : 556), 0) / 1000 * size);
};

// Wymiary wspólne dla PDF i CDR (cm).
function sheetGeom(L, p) {
  const cm = px => px / p.dpi * 2.54;
  const PW = cm(L.panoW);
  const fs = Math.max(3, PW / 40);                       // wielkość tytułów [cm]
  return {
    n: L.bWs.length, wCm: L.bWs.map(cm), xsCm: L.xs.map(cm),
    PW, PH: cm(L.bH), IH: cm(L.imgH), B: cm(L.band),
    fs, fsS: fs * 0.8, lw: Math.max(0.15, PW / 600), M: fs * 2,
    ext: cm(L.bH) * 0.1, gap: Math.max(5, PW * 0.04),
  };
}

// Sekcje 1–3 (schemat). d = rysownik (img, rectF, rectS, line, text), y od góry, cm.
// Zwraca wysokość zajętą przez schemat (bez dolnego marginesu).
function schemaHeight(G) {
  const { fs, PH, ext, M } = G;
  return M + fs * 2.6 + PH + fs * 3.5 + ext + PH + ext;
}
const SCHEMA_X = G => G.M + G.fs * 3;                   // miejsce na pionowy wymiar ściany po lewej
const schemaWidth = G => SCHEMA_X(G) + G.PW + G.fsS * 2.5 + G.M;

function drawSchema(G, p, d) {
  const { n, wCm, xsCm, PW, PH, IH, B, fs, fsS, lw, M, ext } = G;
  const X0 = SCHEMA_X(G);
  let y = M;
  const s2 = { title: y + fs, img: y + fs * 2.6 }; y = s2.img + PH + fs * 3.5;
  const s3 = { img: y + ext };
  const panoImg = top => d.img('Pano', X0, top + B, PW, IH);
  const wall = { x: X0 + p.mL, w: p.wallW, t: p.mT, h: p.wallH };
  const mm = v => (v * 10).toFixed(2).replace('.', ',') + ' mm';

  // 1) Legenda: naddatek i wymiar ściany
  d.text(BLACK, 'LEGENDA:', X0, s2.title, fs);
  d.text(CYAN, 'naddatek', X0, s2.title + fs * 1.3, fsS);
  d.text(CYAN, 'naddatek', X0 + PW + fsS * 1.2, s2.img + textW('naddatek', fsS), fsS, true);
  panoImg(s2.img);
  d.rectS(CYAN, X0, s2.img, PW, PH, lw * 2);
  d.rectS(RED, wall.x, s2.img + wall.t, wall.w, wall.h, lw);
  const dimY = s2.img + PH + fs * 0.8, dimX = X0 - fs * 0.8, tk = fs * 0.3;
  d.line(RED, wall.x, dimY, wall.x + wall.w, dimY, lw);
  d.line(RED, wall.x, dimY - tk, wall.x, dimY + tk, lw); d.line(RED, wall.x + wall.w, dimY - tk, wall.x + wall.w, dimY + tk, lw);
  d.text(RED, mm(p.wallW), wall.x + wall.w / 2 - textW(mm(p.wallW), fsS) / 2, dimY + fsS * 1.1, fsS);
  d.text(RED, 'wymiar ściany', wall.x + wall.w / 2 - textW('wymiar ściany', fs) / 2, dimY + fsS * 1.2 + fs, fs);
  const wt = s2.img + wall.t;
  d.line(RED, dimX, wt, dimX, wt + wall.h, lw);
  d.line(RED, dimX - tk, wt, dimX + tk, wt, lw); d.line(RED, dimX - tk, wt + wall.h, dimX + tk, wt + wall.h, lw);
  d.text(RED, mm(p.wallH), dimX - fsS * 0.3, wt + wall.h / 2 + textW(mm(p.wallH), fsS) / 2, fsS, true);
  d.text(RED, 'wymiar ściany', dimX - fsS * 1.4, wt + wall.h / 2 + textW('wymiar ściany', fs) / 2, fs, true);

  // 2) Schemat podziału: paski nad i pod całością z granicami brytów (podwójne linie = zakład)
  panoImg(s3.img);
  if (B) { d.rectF(CYAN, X0, s3.img, PW, B); d.rectF(CYAN, X0, s3.img + PH - B, PW, B); }
  for (let i = 0; i < n; i++) {
    d.rectS(BLACK, X0 + xsCm[i], s3.img - ext, wCm[i], ext, lw);
    d.rectS(BLACK, X0 + xsCm[i], s3.img + PH, wCm[i], ext, lw);
  }
  d.rectS(BLACK, X0, s3.img, PW, PH, lw);
}

// Nazwa zlecenia i rzędy brytów 1:1 od wysokości top. rows = tablice indeksów brytów.
const brytyRowTop = G => G.M + G.fs * 2.6 + G.fsS * 1.5;   // od góry bloku do pierwszego rzędu
const brytyRowH = G => G.PH + G.fsS * 1.5 + G.gap;
function drawBryty(G, d, rows, top, label) {
  const { n, wCm, PH, IH, B, fs, fsS, M, gap } = G;
  d.text(BLACK, label, M, top + M + fs * 2, fs * 2);
  rows.forEach((r, ri) => {
    const y = top + brytyRowTop(G) + ri * brytyRowH(G);
    let x = M;
    for (const i of r) {
      d.text(BLACK, `${i + 1}/${n}  ${wCm[i].toFixed(1).replace('.', ',')} × ${PH.toFixed(1).replace('.', ',')} cm`, x, y - fsS * 0.6, fsS);
      d.img(`Im${i}`, x, y + B, wCm[i], IH);
      if (B) { d.rectF(CYAN, x, y, wCm[i], B); d.rectF(CYAN, x, y + PH - B, wCm[i], B); }
      x += wCm[i] + gap;
    }
  });
}
const rowWidth = (G, r) => r.reduce((a, i) => a + G.wCm[i], 0) + (r.length - 1) * G.gap;

// PDF: jedna strona jak arkusz .cdr.

async function makePdf(L, p, jpegs, pano) {
  const G = sheetGeom(L, p);
  const { n, wCm, fs, gap, M } = G;
  const f = v => (Math.round(v * 1000) / 1000).toString();
  const pages = [];
  let pg;
  const newPage = (w, h, full = false) => {
    const sc = full ? 1 : Math.min(1, PDF_MAX_CM / Math.max(w, h));
    pg = { w, h, sc, k: PT * sc, c: '' }; pages.push(pg);
  };
  const X = v => f(v * pg.k), Y = v => f((pg.h - v) * pg.k);   // y od góry -> PDF od dołu
  const S = v => f(v * pg.k);
  const k4 = col => col.map(v => v / 100).join(' ');
  const d = {
    img: (name, x, top, w, h) => { pg.c += `q ${S(w)} 0 0 ${S(h)} ${X(x)} ${Y(top + h)} cm /${name} Do Q\n`; },
    rectF: (col, x, top, w, h) => { pg.c += `q ${k4(col)} k ${X(x)} ${Y(top + h)} ${S(w)} ${S(h)} re f Q\n`; },
    rectS: (col, x, top, w, h, wd) => { pg.c += `q ${k4(col)} K ${S(wd)} w ${X(x)} ${Y(top + h)} ${S(w)} ${S(h)} re S Q\n`; },
    line: (col, x1, y1, x2, y2, wd) => { pg.c += `q ${k4(col)} K ${S(wd)} w ${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S Q\n`; },
    text: (col, s, x, base, size, rot = false) => {
      // Obrót przez macierz cm (nie Tm): CorelDRAW przy imporcie przesuwał tekst obrócony przez Tm o ok. 0,5 m.
      pg.c += rot ? `q 0 1 -1 0 ${X(x)} ${Y(base)} cm BT /F1 ${S(size)} Tf ${k4(col)} k 0 0 Td (${pdfText(s)}) Tj ET Q\n`
                  : `BT /F1 ${S(size)} Tf ${k4(col)} k ${X(x)} ${Y(base)} Td (${pdfText(s)}) Tj ET\n`;
    },
  };

  // Jedna strona jak arkusz .cdr (DRUK 1): legenda, schemat podziału, pod nim nazwa zlecenia i bryty 1:1.
  // Wcześniej schemat i bryty były na osobnych stronach różnej wielkości – CorelDRAW przy imporcie
  // ustawia wszystkie strony na środku pierwszej, więc bryty wypadały poza stronę (zgłoszenie 27.10.2026).
  // Strona nie jest pomniejszana do 500 cm: Corel otwiera większe strony 1:1 (sprawdzone na laptopie).
  const row = [...Array(n).keys()];
  const top = schemaHeight(G);
  newPage(Math.max(schemaWidth(G), 2 * M + textWExact(p.orderName, fs * 2), 2 * M + rowWidth(G, row)),
          top + brytyRowTop(G) + brytyRowH(G) - gap + M, true);
  drawSchema(G, p, d);
  drawBryty(G, d, [row], top, p.orderName);

  // Złożenie pliku PDF
  const enc = new TextEncoder();
  const objs = [];
  const add = parts => { objs.push(parts); return objs.length; };
  const catalog = add(null), pagesObj = add(null);
  const font = add([`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${window.Montaz ? `/FirstChar 32 /LastChar 255 /Widths [${Montaz.widths(false)}] ` : ''}/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${PL_NAMES}] >> >>`]);
  const imgDict = (w, h, data) => [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.size} >>\nstream\n`, data, '\nendstream'];
  const xo = [`/Pano ${add(imgDict(pano.w, pano.h, pano.blob))} 0 R`];
  for (let i = 0; i < n; i++) xo.push(`/Im${i} ${add(imgDict(L.bWs[i], L.imgH, jpegs[i]))} 0 R`);
  const res = add([`<< /Font << /F1 ${font} 0 R >> /XObject << ${xo.join(' ')} >> >>`]);
  const kids = pages.map(P => {
    const content = add([`<< /Length ${enc.encode(P.c).length} >>\nstream\n`, P.c, '\nendstream']);
    return add([`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${f(P.w * P.k)} ${f(P.h * P.k)}] /Resources ${res} 0 R /Contents ${content} 0 R >>`]);
  });
  objs[catalog - 1] = [`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`];
  objs[pagesObj - 1] = [`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`];
  const out = [], offsets = [];
  let off = 0;
  const push = part => {
    const b = typeof part === 'string' ? enc.encode(part) : part;
    out.push(b); off += b.size !== undefined ? b.size : b.length;
  };
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  objs.forEach((parts, i) => { offsets.push(off); push(`${i + 1} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); });
  const xref = off;
  let t = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { t += String(o).padStart(10, '0') + ' 00000 n \n'; });
  t += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  push(t);
  const scaled = pages.slice(1).some(P => P.sc < 1);
  return { blob: new Blob(out, { type: 'application/pdf' }), pages: pages.length, schemaScale: pages[0].sc, scaled };
}

// CDR: jeden arkusz jak w DRUK 1 (strona Corela nie ma limitu 5 m): schemat, pod nim nazwa
// zlecenia i bryty w jednym rzędzie, wszystko 1:1. Opis arkusza (cm, y od góry) trafia do
// lokalnego serwera, który przez CorelDRAW (PowerShell + COM) zapisuje plik .cdr.
async function makeCdr(L, p, jpegs, pano) {
  const G = sheetGeom(L, p);
  const ops = [];
  const d = {
    img: (name, x, y, w, h) => ops.push({ t: 'img', file: name === 'Pano' ? 'pano.jpg' : `bryt_${+name.slice(2) + 1}.jpg`, x, y, w, h }),
    rectF: (col, x, y, w, h) => ops.push({ t: 'rectF', col, x, y, w, h }),
    rectS: (col, x, y, w, h, wd) => ops.push({ t: 'rectS', col, x, y, w, h, wd }),
    line: (col, x1, y1, x2, y2, wd) => ops.push({ t: 'line', col, x1, y1, x2, y2, wd }),
    text: (col, s, x, y, size, rot = false) => ops.push({ t: 'text', col, s, x, y, size, rot }),
  };
  const row = [...Array(G.n).keys()];
  const top = schemaHeight(G);
  drawSchema(G, p, d);
  drawBryty(G, d, [row], top, p.orderName);
  const pageW = Math.max(schemaWidth(G), 2 * G.M + textWExact(p.orderName, G.fs * 2), 2 * G.M + rowWidth(G, row));
  const pageH = top + brytyRowTop(G) + brytyRowH(G) - G.gap + G.M;
  const files = [{ name: 'pano.jpg', blob: pano.blob }, ...jpegs.map((b, i) => ({ name: `bryt_${i + 1}.jpg`, blob: b }))];
  const job = { name: `bryty_${p.order}.cdr`, unit: 'cm', link: true, pageW, pageH, ops, files: files.map(f => ({ name: f.name, size: f.blob.size })) };
  const head = new TextEncoder().encode(JSON.stringify(job));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, head.length, true);
  const res = await fetch('/api/cdr', { method: 'POST', body: new Blob([len, head, ...files.map(f => f.blob)]) });
  if (!res.ok) throw new Error('CorelDRAW: ' + (await res.text()));
  const folder = decodeURIComponent(res.headers.get('X-Folder') || '');
  return { blob: await res.blob(), name: job.name, pageW, pageH, folder };
}

// Podgląd całości (bez pasków) w niższej rozdzielczości – do sekcji poglądowych w PDF.
async function renderPano(L, maxW) {
  const k = Math.min(1, maxW / L.panoW);
  const cv = document.createElement('canvas');
  cv.width = Math.round(L.panoW * k); cv.height = Math.round(L.imgH * k);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const F = fit(L, img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, F.cx / F.s, F.cy / F.s, L.panoW / F.s, L.imgH / F.s, 0, 0, cv.width, cv.height);
  const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Nie udało się zapisać podglądu.')), 'image/jpeg', 0.85));
  return { blob, w: cv.width, h: cv.height };
}

// W trakcie generowania strona jest zablokowana (inert): zmiana kadru albo ustawień między brytami dawała
// bryty niepasujące do siebie na zakładzie, a ponowny klik – dwa przebiegi piszące do tej samej listy plików.
let genBusy = false;
async function generate() {
  if (genBusy) return;
  const p = params();
  if (validate(p).length || !img) return;
  const L = layout(p);
  const n = L.bWs.length;
  genBusy = true;
  // Blokujemy wszystko poza komunikatami i listą plików (#msg, #dl zostają dostępne dla czytników ekranu).
  const zones = [...document.querySelectorAll('.panel > :not(.actions), .actions > :not(#msg):not(#dl), .stage')];
  zones.forEach(z => { z.inert = true; });
  $('go').disabled = true; $('dl').innerHTML = '';
  lastUrls.forEach(u => URL.revokeObjectURL(u)); lastUrls = [];
  const files = [], pdfJpegs = [];
  try {
    for (let i = 0; i < n; i++) {
      $('msg').innerHTML = `Generuję bryt ${i + 1} z ${n}…`;
      await new Promise(r => setTimeout(r, 30));
      const blob = await renderJpeg(L, i, p.dpi, true);
      // Bez paska thru cut bryt do PDF/CDR jest identyczny z JPG – nie liczymy go drugi raz (połowa czasu i pamięci).
      if (p.pdf) pdfJpegs.push(L.band ? await renderJpeg(L, i, p.dpi, false) : blob);
      const name = `bryt_${p.order}_${i + 1}.jpg`;
      files.push({ name, blob });
      const u = URL.createObjectURL(blob); lastUrls.push(u);
      $('dl').insertAdjacentHTML('beforeend', `<a href="${u}" download="${name}">${name} (${(blob.size / 1e6).toFixed(1)} MB)</a>`);
    }
    // Cała grafika po złączeniu brytów (z naddatkiem, bez pasków thru cut), maks. 8000 px szerokości – podgląd całości.
    $('msg').innerHTML = 'Generuję JPG całości…';
    const whole = await renderPano(L, 8000);
    const wholeName = `calosc_${p.order}.jpg`;
    files.push({ name: wholeName, blob: whole.blob });
    const wu = URL.createObjectURL(whole.blob); lastUrls.push(wu);
    $('dl').insertAdjacentHTML('beforeend', `<a href="${wu}" download="${wholeName}">${wholeName} – cała grafika (${whole.w} × ${whole.h} px, ${(whole.blob.size / 1e6).toFixed(1)} MB)</a>`);
    let pdfNote = '', cdrError = '', pano = null;
    if (p.pdf && cdrReady) {
      $('msg').innerHTML = 'CorelDRAW tworzy plik .cdr… (to może potrwać kilka minut)';
      pano = await renderPano(L, 4000);
      let cdr = null;
      try { cdr = await makeCdr(L, p, pdfJpegs, pano); }
      catch (e) { cdrError = e.message; }
      if (cdr) {
        files.push({ name: cdr.name, blob: cdr.blob });
        const u = URL.createObjectURL(cdr.blob); lastUrls.push(u);
        $('dl').insertAdjacentHTML('beforeend', `<br><a href="${u}" download="${cdr.name}"><b>${cdr.name}</b> – plik CorelDRAW (${(cdr.blob.size / 1e6).toFixed(1)} MB)</a>`);
        pdfNote = ` CDR: jeden arkusz ${f1(cdr.pageW)} × ${f1(cdr.pageH)} cm, bryty 1:1.`;
        if (cdr.folder) pdfNote += ` Pliki i .cdr są też zapisane w folderze <b>${esc(cdr.folder)}</b>; .cdr korzysta z tych JPG, przy przenoszeniu zabierz cały folder.`;
      }
    }
    if (p.pdf && (!cdrReady || cdrError)) {
      $('msg').innerHTML = 'Tworzę plik PDF dla Corela…';
      if (!pano) pano = await renderPano(L, 4000);
      const pdf = await makePdf(L, p, pdfJpegs, pano);
      const name = `bryty_${p.order}.pdf`;
      files.push({ name, blob: pdf.blob });
      const u = URL.createObjectURL(pdf.blob); lastUrls.push(u);
      $('dl').insertAdjacentHTML('beforeend', `<br><a href="${u}" download="${name}">${name} – plik dla CorelDRAW, otwórz w Corelu i zapisz jako .cdr (${(pdf.blob.size / 1e6).toFixed(1)} MB)</a>`);
      pdfNote = ` PDF: jeden arkusz jak w Corelu (legenda, podział, bryty 1:1).`;
      if (cdrError) pdfNote += ` <span class="err">Nie udało się zapisać .cdr, zamiast niego jest PDF. ${esc(cdrError)}</span>`;

    }
    $('msg').innerHTML = 'Pakuję ZIP…';
    try {
      const zip = await makeZip(files);
      const zu = URL.createObjectURL(zip); lastUrls.push(zu);
      $('dl').insertAdjacentHTML('afterbegin', `<a href="${zu}" download="bryty_${p.order}.zip"><b>Pobierz wszystkie (ZIP)</b></a><br>`);
    } catch (e) {   // zbyt duży komplet (pamięć przeglądarki) – pliki pojedynczo są już na liście
      pdfNote += ` <span class="err">ZIP nie powstał (${esc(e.message)}) – pobierz pliki pojedynczo z listy poniżej.</span>`;
    }
    $('msg').innerHTML = `<span class="ok">Gotowe: ${n} ${plural(n)}, wysokość ${L.bH} px, ${p.dpi} DPI.${pdfNote}</span>`;
  } catch (e) {
    $('msg').innerHTML = `<span class="err">Błąd: ${esc(e.message)}</span>`;
  } finally {
    genBusy = false;
    zones.forEach(z => { z.inert = false; });
    $('go').disabled = false;
  }
}

let loadSeq = 0;   // dwa pliki wybrane szybko po sobie: wygrywa ostatni, nie ten, który wczyta się później
$('file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  // Numer grafiki: rośnie przy nowym zdjęciu/wzorze, ale nie przy podmianie na powiększoną wersję tej samej grafiki
  // (ai.js ustawia keepCropOnce). Galeria i wizualizacja AI sprawdzają po nim, czy wynik dotyczy aktualnej grafiki.
  if (!window.keepCropOnce) window.grafikaId = (window.grafikaId || 0) + 1;
  const im = new Image(), u = URL.createObjectURL(f);
  const seq = ++loadSeq;
  im.onload = () => {
    if (seq !== loadSeq) { URL.revokeObjectURL(u); return; }
    img = im;
    // Duże zdjęcie: do podglądu mniejsza kopia (szybkie rysowanie); pliki do druku i fragment 1:1 biorą pełne zdjęcie.
    const big = Math.max(im.naturalWidth, im.naturalHeight);
    if (big > PREVIEW_MAX) {
      const r = PREVIEW_MAX / big, c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r);
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
      im.preview = c;
    }
    if (window.keepCropOnce) window.keepCropOnce = false;   // ai.js podmienia na powiększoną wersję – kadr zostaje
    else { crop.zoom = 1; crop.fx = crop.fy = 0.5; $('zoom').value = 100; }
    $('imgInfo').textContent = `${f.name}: ${im.naturalWidth} × ${im.naturalHeight} px`;
    // Poprzednie zdjęcie (np. przed powiększeniem AI, setki MB) zwalniamy z pamięci.
    if (imgUrl && imgUrl !== u) URL.revokeObjectURL(imgUrl);
    imgUrl = u;
    changed();
  };
  im.onerror = () => { URL.revokeObjectURL(u); $('imgInfo').innerHTML = '<span class="err">Nie udało się wczytać pliku.</span>'; };
  im.src = u;
});
document.querySelectorAll('input:not([type=file]):not(#zoom), select').forEach(el => el.addEventListener('input', changed));
$('widthsBox').addEventListener('input', changed);
$('go').addEventListener('click', generate);
$('material').innerHTML = '<option value="">– nie wybrano (bez kontroli szerokości) –</option>' +
  MATERIALS.map(([n, w]) => `<option value="${w}">${n} – druk ${w} cm</option>`).join('') + '<option value="own">Inny materiał (wpisz maks. szerokość)</option>';

// Zapis .cdr działa, gdy strona jest otwarta przez start-fototapety.bat (lokalny serwer + CorelDRAW).
// Otwarta jako zwykły plik daje PDF do ręcznego zapisania w Corelu.
let cdrReady = false;
(async () => {
  try {
    const r = location.protocol.startsWith('http') ? await fetch('/api/health') : null;
    const h = r && r.ok ? await r.json() : null;
    cdrReady = !!(h && h.corel);
    $('cdrInfo').textContent = cdrReady ? 'Plik .cdr zapisze CorelDRAW.'
      : h ? 'Zapis .cdr niedostępny na tym serwerze – powstanie PDF (otwórz w CorelDRAW i zapisz jako .cdr).'
      : 'Zapis .cdr niedostępny – powstanie PDF (otwórz w CorelDRAW i zapisz jako .cdr).';
  } catch { $('cdrInfo').textContent = 'Zapis .cdr niedostępny – powstanie PDF (otwórz w CorelDRAW i zapisz jako .cdr).'; }
})();
if (window.Sciana) Sciana.init();
if (window.Montaz) Montaz.init();
if (window.Probka) Probka.init();
if (window.Jakosc) Jakosc.init();
render();

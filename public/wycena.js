// Wycena na żywo i termin realizacji (wątek „Wycena i termin realizacji”).
// Osobny plik, żeby nie mieszać z główną logiką bryty.html. Haki w bryty.html:
//   <div id="wycenaBox" class="step"></div>, <script src="wycena.js"></script>,
//   Wycena.update(p, L) w render() (L = null, gdy ustawienia mają błąd).
// Źródło cen i terminów: CENNIK_VALARE.pdf, edycja 2024/1, ważny od 15.05.2024 (CONFIRMED wg cennika).
//   - ceny za 1 m², brutto i netto jak w cenniku,
//   - „na zakładkę”: w cenie fototapety; „na styk”: 20,00 zł/mb brutto (16,26 netto) – mb cięcia w miejscu łączenia,
//   - termin: standard 10 dni rob., przyspieszony 7 (+15%), ekspres 3 (+30%); materiały na zamówienie 21 dni rob.
// DO WALIDACJI: jaką powierzchnię liczyć (ściana / z naddatkiem / bryty z zakładem), długość mb styku
//   (tu: liczba łączeń × wysokość brytu), czy dopłata za termin obejmuje też styk (tu: tak, całe zamówienie),
//   czy ceny „z uwzględnieniem grafik z kolekcji Valare” dotyczą też zdjęcia klienta, Sand Dot GW 279,05 (netto 226,83 = 279,00).
'use strict';
window.Wycena = (() => {
  // [brutto, netto] zł za 1 m² – przepisane z cennika 2024/1.
  const CENNIK = {
    'Mural Canvas CT': [279.00, 226.83], 'Burlap Blend CT': [279.00, 226.83], 'Dune Dust CT': [279.00, 226.83],
    'Rock Stone CT': [279.00, 226.83], 'Woven Bamboo NW': [319.00, 259.35], 'Diamante CT': [499.00, 405.69],
    'Fabric Canvas NW': [259.00, 210.57], 'Granular Sand NW': [259.00, 210.57], 'Canvas NW': [249.00, 202.44],
    'Concrete NW': [249.00, 202.44], 'Linen NW': [249.00, 202.44], 'Linen NW jednobarwna + druk': [249.00, 202.44],
    'Sand Dot GW': [279.05, 226.83], 'Texile Stick GW': [279.00, 226.83], 'Canvas GW': [279.00, 226.83],
    'Soft Skin': [309.00, 251.22], 'Luxe Lino (podłoga)': [315.00, 256.10], 'Tapeta Waterproof Out': [310.00, 252.03],
  };
  const STYK_MB = [20.00, 16.26];
  const TERMINY = {
    standard: { name: 'Standard', days: 10, extra: 0 },
    fast: { name: 'Przyspieszony', days: 7, extra: 0.15 },
    express: { name: 'Ekspres', days: 3, extra: 0.30 },
  };
  const NA_ZAMOWIENIE_DNI = 21;
  const AREAS = {
    margin: 'ściana z naddatkiem',
    print: 'bryty do druku (z naddatkiem i zakładem)',
    wall: 'sama ściana',
  };
  const state = { area: 'margin', termin: 'standard', order: false };
  let last = { p: null, L: null };

  const r2 = x => Math.round(x * 100) / 100;
  const zl = x => x.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
  const n2 = x => x.toLocaleString('pl-PL', { maximumFractionDigits: 2 });

  // Nazwa materiału z listy w bryty.html („Sand Dot GW 137 – druk 131 cm” -> „Sand Dot GW”).
  function materialName() {
    const sel = document.getElementById('material');
    const o = sel && sel.selectedOptions[0];
    if (!o || o.value === '' || o.value === 'own') return null;
    return o.textContent.split(' – ')[0].replace(/ \d+$/, '').trim();
  }

  // Dni robocze: bez sobót, niedziel i świąt ustawowych w Polsce.
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }
  function isHoliday(d) {
    const md = `${d.getMonth() + 1}-${d.getDate()}`;
    const fixed = ['1-1', '1-6', '5-1', '5-3', '8-15', '11-1', '11-11', '12-25', '12-26'];
    if (d.getFullYear() >= 2025) fixed.push('12-24');
    if (fixed.includes(md)) return true;
    const e = easter(d.getFullYear());
    return [1, 60].some(off => { const x = new Date(e); x.setDate(e.getDate() + off); return x.toDateString() === d.toDateString(); });
  }
  function addWorkdays(from, n) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6 && !isHoliday(d)) n--; }
    return d;
  }

  // Czyste obliczenie (używane też w testach). in: { material, area: m², joints, heightCm, butt, termin, order }.
  function calc(inp) {
    const t = inp.order ? { name: 'Na zamówienie', days: NA_ZAMOWIENIE_DNI, extra: 0 } : TERMINY[inp.termin] || TERMINY.standard;
    const out = { termin: t, price: CENNIK[inp.material] || null };
    if (!out.price) return out;
    // Cena liczona z tych samych zaokrąglonych ilości, które widzi klient (0,01 m² i 0,01 mb) – „9,83 m² × 279 zł”
    // daje dokładnie pokazaną kwotę. Zasada zaokrąglania DO WALIDACJI z ARPI (rekomendacja z przeglądu 05.11.2026).
    const mb = r2(inp.butt ? inp.joints * inp.heightCm / 100 : 0);
    inp = { ...inp, area: r2(inp.area) };
    const lines = [0, 1].map(k => {
      const druk = r2(inp.area * out.price[k]);
      const styk = r2(mb * STYK_MB[k]);
      const doplata = r2((druk + styk) * t.extra);
      return { druk, styk, doplata, razem: r2(druk + styk + doplata) };
    });
    return Object.assign(out, { mb, brutto: lines[0], netto: lines[1] });
  }

  function areaM2(p, L, mode) {
    if (mode === 'wall') return p.wallW * p.wallH / 1e4;
    if (mode === 'print') return L.bw.widths.reduce((a, w) => a + w, 0) * L.totalHcm / 1e4;
    return L.totalWcm * L.totalHcm / 1e4;
  }

  function build() {
    const box = document.getElementById('wycenaBox');
    if (!box) return;
    const radio = (k, t) => `<label class="radio"><input type="radio" name="wycTermin" value="${k}"${state.termin === k ? ' checked' : ''}> ${t.name}</label>`;
    box.innerHTML =
      '<div class="step-head"><span class="num">8</span><h2>Wycena i termin</h2></div>' +
      '<label>Termin realizacji</label>' +
      `<div class="radios seg" role="radiogroup" aria-label="Termin realizacji" id="wycTerminy">${Object.entries(TERMINY).map(([k, t]) => radio(k, t)).join('')}</div>` +
      `<label class="check"><input id="wycOrder" type="checkbox"${state.order ? ' checked' : ''}> Materiał na zamówienie (brak na stanie) – ${NA_ZAMOWIENIE_DNI} dni roboczych</label>` +
      '<label for="wycArea">Powierzchnia do wyceny</label>' +
      `<select id="wycArea">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}"${state.area === k ? ' selected' : ''}>${v}</option>`).join('')}</select>` +
      '<div id="wycOut" class="msg" aria-live="polite"></div>' +
      '<div class="hint">Ceny i terminy: cennik Valare 2024/1 (od 15.05.2024).</div>';
    box.addEventListener('input', e => {
      if (e.target.name === 'wycTermin') state.termin = e.target.value;
      else if (e.target.id === 'wycOrder') state.order = e.target.checked;
      else if (e.target.id === 'wycArea') state.area = e.target.value;
      show();
    });
  }

  function show() {
    const out = document.getElementById('wycOut');
    const put = h => { if (out.__h !== h) { out.__h = h; out.innerHTML = h; } };   // region aria-live: zapis tylko przy zmianie
    if (!out) return;
    syncTermin();
    const { p, L } = last;
    if (!p || !L) { put('<div class="hint">Wycena pojawi się po poprawieniu ustawień.</div>'); return; }
    const n = L.bw.widths.length;
    const area = areaM2(p, L, state.area);
    const material = materialName();
    const R = calc({ material, area, joints: n - 1, heightCm: L.totalHcm, butt: p.join === 'butt', termin: state.termin, order: state.order });
    const date = addWorkdays(new Date(), R.termin.days).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
    let h = `<div>Termin: <b>${R.termin.name}, ${R.termin.days} ${R.termin.days < 5 ? 'dni robocze' : 'dni roboczych'}</b>` + (R.termin.extra ? ` (dopłata +${Math.round(R.termin.extra * 100)}%)` : '') +
      `. Gotowe orientacyjnie <b>${date}</b> (licząc od dziś, bez weekendów i świąt).</div>`;
    if (!R.price) {
      put(h + '<div class="warn">Wybierz materiał z cennika, żeby zobaczyć cenę.</div>');
      return;
    }
    const B = R.brutto, N = R.netto;
    h += '<table class="wycTbl"><tr><th>Pozycja</th><th>Brutto</th><th>Netto</th></tr>' +
      `<tr><td>${material}: ${n2(area)} m² × ${zl(R.price[0])}</td><td>${zl(B.druk)}</td><td>${zl(N.druk)}</td></tr>` +
      (p.join === 'butt' ? `<tr><td>Przygotowanie na styk: ${n2(R.mb)} mb × ${zl(STYK_MB[0])}</td><td>${zl(B.styk)}</td><td>${zl(N.styk)}</td></tr>`
        : '<tr><td>Przygotowanie na zakładkę</td><td colspan="2">w cenie</td></tr>') +
      (R.termin.extra ? `<tr><td>Dopłata za termin +${Math.round(R.termin.extra * 100)}%</td><td>${zl(B.doplata)}</td><td>${zl(N.doplata)}</td></tr>` : '') +
      `<tr class="wycSum"><td><b>Razem</b></td><td><b>${zl(B.razem)}</b></td><td>${zl(N.razem)}</td></tr></table>`;
    put(h);
  }

  // Przy materiale na zamówienie nie ma danych o przyspieszeniu – wybór terminu wyłączony.
  function syncTermin() {
    document.querySelectorAll('#wycTerminy input').forEach(el => { el.disabled = state.order; });
  }

  function update(p, L) { last = { p, L }; show(); }

  // Minimalny styl tabeli wyceny (resztę wyglądu daje bryty.html).
  const css = document.createElement('style');
  css.textContent = '.wycTbl{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}.wycTbl td,.wycTbl th{padding:6px 4px;text-align:right}' +
    '.wycTbl td:first-child,.wycTbl th:first-child{text-align:left;white-space:normal}.wycSum td{border-top:2px solid var(--v-green,#25c09e)}';
  document.head.appendChild(css);

  // Karty materiałów (materialy.js): kłódka z cennika ustawia „na zamówienie” przy zmianie materiału.
  // Domyślne „na zamówienie” ustawia się tylko przy zmianie materiału – nie przy każdym znaku w polu szerokości
  // „Inny materiał” (wcześniej każde wpisanie kasowało ręczne zaznaczenie).
  let lastMat;
  document.addEventListener('materialy:zmiana', e => {
    const id = e.detail ? e.detail.id : '';
    if (id === lastMat) { show(); return; }
    lastMat = id;
    state.order = !!(e.detail && e.detail.naZamowienie);
    const cb = document.getElementById('wycOrder'); if (cb) cb.checked = state.order;
    show();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { build(); show(); });
  else { build(); show(); }

  return { CENNIK, STYK_MB, TERMINY, calc, areaM2, addWorkdays, update };
})();

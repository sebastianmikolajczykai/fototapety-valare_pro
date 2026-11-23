// Materiały Valare jako karty z opisem (sekcja 02). Dane WYŁĄCZNIE z CENNIK_VALARE.pdf, edycja 2024/1,
// ważny od 15.05.2024, str. 2–4. Pole null = BRAK DANYCH w cenniku (nie zgadujemy).
// Wybór dalej siedzi w <select id="material"> (ukrytym): value = "szerokośćDruku|id", więc parseFloat(value)
// w bryty.html nadal daje maks. szerokość druku. Tekst opcji jak dawniej ("Nazwa – druk N cm"),
// żeby pamiec.js odtwarzał zapisany wybór.
// Dla innych modułów (wycena, termin): window.Materialy.wybrany(), .lista, .TERMINY, zdarzenie 'materialy:zmiana'.
(() => {
  const $ = id => document.getElementById(id);

  // [szerokość materiału, maks. szerokość druku] w cm (ikony legendy w cenniku).
  // naZamowienie: kłódka zamknięta = "dostępne na zamówienie", otwarta = "ogólnodostępne".
  // waterproof: ikona kropli przy aspekcie (legenda: WATERPROOF – nadaje się pod prysznic w systemie WATERPROOF).
  const PRODUKTY = [
    { id: 'mural-canvas-ct', nazwa: 'Mural Canvas CT', grupa: 'Premium', szer: [[137, 131]], brutto: 279.00, netto: 226.83,
      aspekt: 'mat / błysk', gramatura: 290, struktura: 'płótno', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: true,
      opis: 'Winylowa tapeta na nośniku z tkaniny o strukturze płótna. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku w pełnym zakresie kolorów.' },
    { id: 'burlap-blend-ct', nazwa: 'Burlap Blend CT', grupa: 'Premium', szer: [[137, 131]], brutto: 279.00, netto: 226.83,
      aspekt: 'mat', gramatura: 290, struktura: 'worek jutowy', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: true,
      opis: 'Winylowa tapeta na nośniku z tkaniny o strukturze worka jutowego. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'dune-dust-ct', nazwa: 'Dune Dust CT', grupa: 'Premium', szer: [[137, 131]], brutto: 279.00, netto: 226.83,
      aspekt: 'mat', gramatura: 290, struktura: 'drobny piasek', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: true,
      opis: 'Winylowa tapeta na nośniku z tkaniny o strukturze drobnego piasku. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'rock-stone-ct', nazwa: 'Rock Stone CT', grupa: 'Premium', szer: [[137, 131]], brutto: 279.00, netto: 226.83,
      aspekt: 'mat / błysk', gramatura: 290, struktura: 'tynk', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: true,
      opis: 'Winylowa tapeta na nośniku z tkaniny o strukturze tynku. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'woven-bamboo-nw', nazwa: 'Woven Bamboo NW', grupa: 'Premium', szer: [[137, 131]], brutto: 319.00, netto: 259.35,
      aspekt: 'mat', gramatura: 290, struktura: 'pleciony bambus', palnosc: 'B-s1, d0', naZamowienie: true, waterproof: false,
      opis: 'Ekologiczna tapeta o strukturze plecionego bambusa. Maskuje niedoskonałości zdjęcia i łączenia; dobra jakość druku.' },
    { id: 'diamante-ct', nazwa: 'Diamante CT', grupa: 'Premium', szer: [[136, 130]], brutto: 499.00, netto: 405.69,
      aspekt: 'błysk', gramatura: 350, struktura: 'skórka pomarańczy', palnosc: 'B-s2, d0', naZamowienie: true, waterproof: false,
      opis: 'Ekskluzywna tapeta na nośniku tekstylnym o strukturze skórki pomarańczy z kryształkami. Do nowoczesnych wnętrz; wymaga dobrania odpowiedniego zdjęcia.' },
    { id: 'fabric-canvas-nw', nazwa: 'Fabric Canvas NW', grupa: 'Standard', szer: [[130, 124]], brutto: 259.00, netto: 210.57,
      aspekt: 'mat / błysk', gramatura: 350, struktura: 'płótno', palnosc: 'B-s1, d0', naZamowienie: false, waterproof: false,
      opis: 'Winylowa tapeta na nośniku flizelinowym o strukturze płótna. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'granular-sand-nw', nazwa: 'Granular Sand NW', grupa: 'Standard', szer: [[130, 124]], brutto: 259.00, netto: 210.57,
      aspekt: 'mat / błysk', gramatura: 350, struktura: 'piasek', palnosc: 'B-s1, d0', naZamowienie: false, waterproof: false,
      opis: 'Winylowa tapeta na nośniku flizelinowym o strukturze piasku. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'canvas-nw', nazwa: 'Canvas NW', grupa: 'Standard', szer: [[138, 132]], brutto: 249.00, netto: 202.44,
      aspekt: 'mat / błysk', gramatura: 350, struktura: 'płótno', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: false,
      opis: 'Winylowa tapeta na nośniku flizelinowym o strukturze płótna. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'concrete-nw', nazwa: 'Concrete NW', grupa: 'Standard', szer: [[137, 131]], brutto: 249.00, netto: 202.44,
      aspekt: 'mat', gramatura: 350, struktura: 'beton', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: false,
      opis: 'Winylowa tapeta na nośniku flizelinowym o strukturze betonu. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'linen-nw', nazwa: 'Linen NW', grupa: 'Standard', szer: [[138, 132]], brutto: 249.00, netto: 202.44,
      aspekt: 'mat', gramatura: 350, struktura: 'materiał jutowy', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: false,
      opis: 'Winylowa tapeta na nośniku flizelinowym o strukturze materiału jutowego. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku.' },
    { id: 'linen-nw-jednobarwna-druk', nazwa: 'Linen NW jednobarwna + druk', grupa: 'Standard', szer: [[138, 132]], brutto: 249.00, netto: 202.44,
      aspekt: 'mat', gramatura: 350, struktura: 'materiał jutowy', palnosc: 'B-s2, d0', naZamowienie: true, waterproof: false,
      opis: 'Linen NW w jednym z 17 kolorów, druk pigmentem kolorowym lub białym. Przed zamówieniem zawsze próba wydruku; okleiny na jednej ścianie z jednej partii produkcyjnej. (Sama jednobarwna, bez druku: 99,00 zł/m².)' },
    { id: 'sand-dot-gw', nazwa: 'Sand Dot GW', grupa: 'Własny klej', szer: [[107, 100], [137, 131], [160, 154]], brutto: 279.05, netto: 226.83,
      aspekt: 'mat / błysk', gramatura: null, struktura: 'drobny piasek', palnosc: 'B-s1, d0', naZamowienie: false, waterproof: false,
      opis: 'Folia samoprzylepna o strukturze drobnego piasku na podłogi, ściany i meble wewnątrz, bez laminowania. Możliwa poprawka przy naklejaniu; druk UVgel odporny na ścieranie. (Wersja wycinana po obrysie ZUND: 325,00 zł/m², na zamówienie.)' },
    { id: 'texile-stick-gw', nazwa: 'Texile Stick GW', grupa: 'Własny klej', szer: [[107, 100], [127, 121], [152, 146]], brutto: 279.00, netto: 226.83,
      aspekt: 'mat / błysk', gramatura: 145, struktura: 'delikatne płótno', palnosc: 'B-s2, d0', naZamowienie: false, waterproof: false,
      opis: 'Poliestrowa repozycjonowalna tkanina samoprzylepna. Łatwa aplikacja bez ekipy; łączenie na styk lub na zakładkę; po usunięciu nie niszczy powierzchni. Do wnętrz.' },
    { id: 'canvas-gw', nazwa: 'Canvas GW', grupa: 'Własny klej', szer: [[137, 131]], brutto: 279.00, netto: 226.83,
      aspekt: 'mat / błysk', gramatura: 360, struktura: 'płótno', palnosc: 'B-s2, d0', naZamowienie: true, waterproof: false,
      opis: 'Samoprzylepna tapeta PCV o strukturze płótna z klejem permanentnym. Do jednobrytowych dekoracji (pokoje dziecięce, hotele, recepcje) i reprodukcji obrazów.' },
    { id: 'soft-skin', nazwa: 'Soft Skin', grupa: 'Uzupełniające', szer: [[141, 135]], brutto: 309.00, netto: 251.22,
      aspekt: 'mat', gramatura: 550, struktura: 'skóra', palnosc: 'BS 5852-1', naZamowienie: true, waterproof: false,
      opis: 'Materiał o strukturze skóry do tapicerstwa tradycyjnego i medycznego. Odporny na zadrapania, atest PZH.' },
    { id: 'luxe-lino', nazwa: 'Luxe Lino (podłoga)', grupa: 'Uzupełniające', szer: [[200, 194]], brutto: 315.00, netto: 256.10,
      aspekt: 'satyna', gramatura: 1485, struktura: 'piaskowiec', palnosc: 'Cn-s1', naZamowienie: true, waterproof: false,
      opis: 'Winylowy materiał na podłogę (reklama pozioma, wykończenie wnętrz). Certyfikat antypoślizgowości; zmywalność zależy od zadruku i zabezpieczenia.' },
    { id: 'tapeta-waterproof-out', nazwa: 'Tapeta Waterproof Out', grupa: 'Uzupełniające', szer: [[100, 94]], brutto: 310.00, netto: 252.03,
      aspekt: 'mat', gramatura: null, struktura: 'skórka pomarańczy', palnosc: 'B-s1, d0', naZamowienie: true, waterproof: false,
      opis: 'Tapeta z włókna szklanego bez PCV do wilgotnych pomieszczeń, wewnątrz i na zewnątrz (system WATERproof, np. kabiny prysznicowe). Najlepiej z pełnym systemem WATERproof IN/OUT.' },
  ];
  // Terminy z cennika (dni robocze). Na zamówienie: 21 dni, chyba że materiał jest na stanie – wtedy jak standard.
  const TERMINY = {
    standard: { dni: 10, doplata: 0 }, przyspieszony: { dni: 7, doplata: 0.15 }, ekspres: { dni: 3, doplata: 0.30 },
    naZamowienie: { dni: 21, uwaga: 'Jeżeli materiał jest na stanie magazynowym, termin jak dla materiałów standardowych.' },
  };
  const GRUPY = ['Premium', 'Standard', 'Własny klej', 'Uzupełniające'];

  // Jedna pozycja listy = jeden wariant szerokości (Sand Dot / Texile mają po 3 rolki).
  const lista = [];
  PRODUKTY.forEach(p => p.szer.forEach(([mat, druk]) => {
    const wiele = p.szer.length > 1;
    lista.push({ ...p, id: wiele ? `${p.id}-${mat}` : p.id, produkt: p.id, nazwa: wiele ? `${p.nazwa} ${mat}` : p.nazwa,
      szerMaterialu: mat, szerDruku: druk, cenaBruttoM2: p.brutto, cenaNettoM2: p.netto,
      terminDni: p.naZamowienie ? TERMINY.naZamowienie.dni : TERMINY.standard.dni, szer: undefined, brutto: undefined, netto: undefined });
  }));
  const byId = Object.fromEntries(lista.map(m => [m.id, m]));

  const sel = () => $('material');
  const idOf = v => (String(v).split('|')[1] || '');
  function wybrany() {
    const v = sel() ? sel().value : '';
    if (v === 'own') return { id: 'own', nazwa: 'Inny materiał', szerDruku: parseFloat(String($('maxPrint').value).replace(',', '.')) || null, wlasny: true };
    return byId[idOf(v)] || null;
  }

  const zl = n => n.toFixed(2).replace('.', ',');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LOCK = zamk => `<svg class="mk-lock" viewBox="0 0 16 18" aria-hidden="true"><path d="${zamk ? 'M4 8V5a4 4 0 0 1 8 0v3' : 'M4 8V5a4 4 0 0 1 7.6-1.7'}" fill="none" stroke="currentColor" stroke-width="2"/><rect x="1" y="8" width="14" height="10" fill="currentColor"/></svg>`;

  const CSS = `
  .mk-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
  #mkBox .mk-filters button { width: auto; height: 30px; margin: 0; padding: 0 10px; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
    border: 1px solid var(--line); background: var(--field); color: var(--text); border-radius: var(--radius-btn); cursor: pointer; }
  #mkBox .mk-filters button:hover { background: var(--small-hover); }
  #mkBox .mk-filters button[aria-pressed=true] { background: var(--seg-on); color: var(--seg-on-text); border-color: var(--seg-on); }
  .mk-list { display: flex; flex-direction: column; gap: 8px; max-height: 460px; overflow-y: auto; padding-right: 4px; }
  .mk-card { position: relative; border: 1px solid var(--card-line); background: var(--card); padding: 10px 12px 10px 14px; cursor: pointer; border-radius: var(--radius); transition: border-color .15s, background .15s; }
  .mk-card:hover { border-color: var(--line-strong); }
  .mk-card:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
  .mk-card.on { border-color: var(--accent); background: var(--accent-soft); }
  .mk-card.on::before { content: ''; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 4px; background: var(--accent); }
  .mk-top { display: flex; align-items: baseline; gap: 8px; }
  .mk-lock { width: 12px; height: 14px; color: var(--v-green); flex: none; align-self: center; }
  .mk-name { font-weight: 600; text-transform: uppercase; letter-spacing: .8px; font-size: 13px; flex: 1; min-width: 0; }
  .mk-price { font-size: 13px; font-weight: 600; white-space: nowrap; }
  .mk-price small { font-weight: 400; color: var(--muted); }
  .mk-meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .mk-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
  .mk-badge { font-size: 11px; letter-spacing: .3px; padding: 2px 7px; border: 1px solid var(--line); color: var(--text); white-space: nowrap; }
  .mk-badge.order { border-color: var(--warn); color: var(--warn); background: var(--warn-bg); }
  .mk-badge.stock { border-color: var(--accent); color: var(--link); }
  .mk-badge.print { background: var(--v-ink); border-color: var(--v-ink); color: #fff; }
  #mkBox .mk-chip { width: auto; height: auto; margin: 0; padding: 2px 7px; font: inherit; font-size: 11px; font-weight: 400; letter-spacing: .3px; text-transform: none;
    border: 1px solid var(--line-strong); background: var(--field); color: var(--text); border-radius: 0; cursor: pointer; }
  #mkBox .mk-chip:hover { background: var(--small-hover); }
  #mkBox .mk-chip.on { background: var(--v-ink); border-color: var(--v-ink); color: #fff; }
  .mk-card details { margin-top: 6px; font-size: 12px; color: var(--muted); }
  .mk-card summary { cursor: pointer; color: var(--link); width: max-content; }
  .mk-card details p { margin: 4px 0 0; }
  .mk-sel { font-size: 12px; margin-top: 8px; color: var(--muted); }
  .mk-sel b { color: var(--text); }`;

  function karta(grupa) {
    const w = grupa.warianty, m = w[0];
    const gram = m.gramatura ? `${m.gramatura} g/m²` : '';
    const chips = w.length > 1
      ? w.map(v => `<button type="button" class="mk-chip" data-id="${v.id}" title="materiał ${v.szerMaterialu} cm">${v.szerMaterialu} cm → druk ${v.szerDruku}</button>`).join('')
      : `<span class="mk-badge print">druk maks. ${m.szerDruku} cm</span><span class="mk-meta" style="margin:0">materiał ${m.szerMaterialu} cm</span>`;
    return `<div class="mk-card" role="button" tabindex="0" data-id="${w[0].id}" data-group="${esc(m.grupa)}">
      <div class="mk-top">${LOCK(m.naZamowienie)}<span class="mk-name">${esc(m.nazwa.replace(/ \d+$/, w.length > 1 ? '' : '$&'))}</span>
        <span class="mk-price">${zl(m.cenaBruttoM2)} zł <small>/m² brutto</small></span></div>
      <div class="mk-meta">${esc(m.grupa)} · ${esc(m.aspekt.toUpperCase())} · ${gram ? gram + ' · ' : ''}${esc(m.struktura)} · palność ${esc(m.palnosc)}${m.waterproof ? ' · WATERPROOF' : ''}</div>
      <div class="mk-row">${chips}
        <span class="mk-badge ${m.naZamowienie ? 'order' : 'stock'}">${m.naZamowienie ? `na zamówienie · ${TERMINY.naZamowienie.dni} dni rob.` : `ogólnodostępny · ${TERMINY.standard.dni} dni rob.`}</span></div>
      <details><summary>Opis</summary><p>${esc(m.opis)}</p><p>Cena netto: ${zl(m.cenaNettoM2)} zł/m². Źródło: cennik Valare 2024/1.</p></details>
    </div>`;
  }

  function init() {
    const s = sel(); if (!s || $('mkBox')) return;
    const prev = s.selectedIndex >= 0 ? s.options[s.selectedIndex].text : '';
    s.innerHTML = '<option value="">– nie wybrano (bez kontroli szerokości) –</option>' +
      lista.map(m => `<option value="${m.szerDruku}|${m.id}">${esc(m.nazwa)} – druk ${m.szerDruku} cm</option>`).join('') +
      '<option value="own">Inny materiał (wpisz maks. szerokość)</option>';
    const pi = [...s.options].findIndex(o => o.text === prev); if (pi > 0) s.selectedIndex = pi;
    s.hidden = true;

    document.head.insertAdjacentHTML('beforeend', `<style id="mkCss">${CSS}</style>`);
    const grupy = []; lista.forEach(m => { const g = grupy.find(x => x.produkt === m.produkt); g ? g.warianty.push(m) : grupy.push({ produkt: m.produkt, warianty: [m] }); });
    s.insertAdjacentHTML('afterend', `<div id="mkBox">
      <div class="mk-filters" role="group" aria-label="Grupa materiałów">${['Wszystkie', ...GRUPY].map((g, i) => `<button type="button" data-f="${g}" aria-pressed="${i === 0}">${g}</button>`).join('')}</div>
      <div class="mk-list">${grupy.map(karta).join('')}
        <div class="mk-card" role="button" tabindex="0" data-id="own" data-group="*"><div class="mk-top"><span class="mk-name">Inny materiał</span></div><div class="mk-meta">Spoza cennika – wpisz maks. szerokość druku poniżej.</div></div>
        <div class="mk-card" role="button" tabindex="0" data-id="" data-group="*"><div class="mk-top"><span class="mk-name">Bez materiału</span></div><div class="mk-meta">Bez kontroli szerokości brytu.</div></div>
      </div>
      <div class="mk-sel" id="mkSel" aria-live="polite"></div></div>`);

    const box = $('mkBox');
    const choose = id => {
      const v = id === '' || id === 'own' ? id : `${byId[id].szerDruku}|${id}`;
      if (s.value === v) return;
      s.value = v;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    };
    box.addEventListener('click', e => {
      if (e.target.closest('summary, details p')) return;
      const f = e.target.closest('[data-f]');
      if (f) {
        box.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', b === f));
        box.querySelectorAll('.mk-card').forEach(c => { c.hidden = !(f.dataset.f === 'Wszystkie' || c.dataset.group === '*' || c.dataset.group === f.dataset.f); });
        return;
      }
      const chip = e.target.closest('.mk-chip'), card = e.target.closest('.mk-card');
      if (chip) return choose(chip.dataset.id);
      if (!card) return;
      // Karta z kilkoma rolkami: zostaw wybraną rolkę, jeśli karta już jest wybrana.
      const cur = wybrany();
      if (cur && card.querySelector(`.mk-chip[data-id="${cur.id}"]`)) return;
      choose(card.dataset.id);
    });
    box.addEventListener('keydown', e => {
      const card = e.target.classList && e.target.classList.contains('mk-card') ? e.target : null;
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); card.click(); }
    });
    // Odśwież zaznaczenie po każdej zmianie formularza (także gdy pamiec.js przywraca wybór).
    document.addEventListener('input', sync); document.addEventListener('change', sync);
    sync();
  }

  let last;
  function sync() {
    const box = $('mkBox'); if (!box) return;
    const m = wybrany(), id = m ? m.id : '';
    box.querySelectorAll('.mk-card').forEach(c => {
      const on = c.dataset.id === id || !!c.querySelector(`.mk-chip[data-id="${id}"]`);
      c.classList.toggle('on', on); c.setAttribute('aria-pressed', on);
    });
    box.querySelectorAll('.mk-chip').forEach(c => { c.classList.toggle('on', c.dataset.id === id); c.setAttribute('aria-pressed', c.dataset.id === id); });
    const sel = $('mkSel'), h = !m ? 'Wybrany: <b>bez materiału</b> (bez kontroli szerokości).'
      : m.wlasny ? `Wybrany: <b>inny materiał</b>, maks. druk ${m.szerDruku ?? '?'} cm.`
      : `Wybrany: <b>${esc(m.nazwa)}</b>, maks. druk ${m.szerDruku} cm, ${zl(m.cenaBruttoM2)} zł/m² brutto, ${m.naZamowienie ? 'na zamówienie (21 dni rob.)' : 'ogólnodostępny (10 dni rob.)'}.`;
    if (sel.__h !== h) { sel.__h = h; sel.innerHTML = h; }   // region aria-live: zapis tylko przy zmianie (czytnik ekranu nie czyta przy każdym ruchu)
    const key = JSON.stringify(m);
    if (key !== last) { last = key; document.dispatchEvent(new CustomEvent('materialy:zmiana', { detail: m })); }
  }

  window.Materialy = { lista, PRODUKTY, GRUPY, TERMINY, ZRODLO: 'CENNIK_VALARE.pdf, edycja 2024/1, ważny od 15.05.2024', wybrany, init, sync };
  init();
})();

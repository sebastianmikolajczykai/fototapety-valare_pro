// Galeria gotowych wzorów (docs/sections/15-galeria-wzorow.md).
// Osobny plik, żeby nie mieszać z resztą bryty.html. Haki w bryty.html:
//   <div id="galeriaBox" class="step"></div> (pod krokiem 1) i <script src="galeria.js"></script> na końcu strony.
// Wersja 2 (2026-10-25): stały, przejrzany katalog zamiast wyszukiwania na żywo w muzeum (to dawało przypadkowe
// wyniki i nie ładowało miniatur). Katalog: wzory/katalog.js + miniatury wzory/mini/*.jpg, tworzy je
// wzory/pobierz-wzory.js z Wikimedia Commons (tylko CC0, domena publiczna, CC BY, CC BY-SA – druk i sprzedaż dozwolone).
// Pełny plik pobiera przeglądarka z upload.wikimedia.org dopiero po „Użyj tego wzoru” i wstawia do kroku 1
// tak samo jak przeciągnięty plik: dalej kadr, bryty, wycena, PDF bez zmian.
'use strict';
window.Galeria = (() => {
  const CONFIG = {
    katalog: 'wzory/katalog.js',
    mini: id => `wzory/mini/${id}.jpg`,
  };
  // Najczęstsze polskie słowa -> angielskie (tytuły w Commons są głównie po angielsku).
  const PL = { las: 'forest', drzewa: 'tree', drzewo: 'tree', morze: 'sea', plaża: 'beach', plaza: 'beach', góry: 'mountain', gory: 'mountain',
    kwiaty: 'flower', kwiat: 'flower', róże: 'rose', roze: 'rose', ptaki: 'bird', ptak: 'bird', miasto: 'city', most: 'bridge', rzeka: 'river',
    jezioro: 'lake', niebo: 'sky', chmury: 'cloud', zima: 'winter', śnieg: 'snow', snieg: 'snow', jesień: 'autumn', jesien: 'autumn',
    wiosna: 'spring', ogród: 'garden', ogrod: 'garden', łąka: 'meadow', laka: 'meadow', fale: 'wave', fala: 'wave', wodospad: 'waterfall',
    zachód: 'sunset', zachod: 'sunset', wschód: 'sunrise', wschod: 'sunrise', noc: 'night', palmy: 'palm', pustynia: 'desert', wyspa: 'island',
    zamek: 'castle', kosmos: 'nebula', galaktyka: 'galaxy', lew: 'lion', słoń: 'elephant', slon: 'elephant', koń: 'horse', kon: 'horse' };

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = x => Math.round(x).toLocaleString('pl-PL');
  const num = id => { const el = $(id); return el ? (parseFloat(el.value) || 0) : 0; };
  const prog = () => (window.Jakosc && Jakosc.prog) || { good: 2500, min: 1000 };   // te same progi co kontrola jakości
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

  // Tytuły z Commons bywają zrzutem etykiet Wikidata („… title QS:Lfr,…”) – zostawiamy sam tytuł, maks. 90 znaków.
  const cleanTitle = t => { t = String(t || '').split(/\s*(?:title\s+)?QS:/)[0].trim() || 'Wzór'; return t.length > 90 ? t.slice(0, 87).trim() + '…' : t; };

  let K = null, catalogLoading = null;   // { kategorie, wzory }; obietnica trwającego wczytywania katalogu
  let cat = null, query = '', list = [], chosen = null, busy = false;
  let current = null;        // metryka wzoru, który jest teraz w kroku 1 (null = własne zdjęcie)

  // Katalog ładowany dopiero przy otwarciu galerii (zwykły <script>, działa też z pliku bez serwera).
  function loadCatalog() {
    // Tylko wpisy z bezpiecznymi danymi: id = litery/cyfry (trafia do adresu miniatury), linki https (bez javascript:).
    const https = u => /^https:\/\//.test(String(u || ''));
    const prep = k => { k.wzory = k.wzory.filter(a => a.w > 0 && a.h > 0 && /^\w+$/.test(String(a.id)) && https(a.plik) && https(a.zrodlo))
      .map(a => ({ ...a, tytul: cleanTitle(a.tytul) })); return k; };
    if (window.WZORY_KATALOG) { K = prep(window.WZORY_KATALOG); return Promise.resolve(); }
    if (catalogLoading) return catalogLoading;   // ponowne otwarcie przed wczytaniem – bez drugiego <script>
    return catalogLoading = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = CONFIG.katalog;
      s.onload = () => {   // uszkodzony katalog: komunikat i możliwość ponowienia, zamiast wiecznego „Wczytuję…”
        const k = window.WZORY_KATALOG;
        try { if (!k || !Array.isArray(k.wzory)) throw new Error('pusty albo uszkodzony katalog'); K = prep(k); res(); }
        catch (e) { K = null; catalogLoading = null; s.remove(); try { delete window.WZORY_KATALOG; } catch { window.WZORY_KATALOG = undefined; } rej(e); }
      };
      s.onerror = () => { catalogLoading = null; s.remove(); rej(new Error('brak pliku ' + CONFIG.katalog)); };
      document.head.appendChild(s);
    });
  }

  // --- jakość pod aktualną ścianę (kadr „cover”, powiększenie 100%) ---
  function quality(w, h) {
    const wm = (num('wallW') + num('mL') + num('mR')) / 100, hm = (num('wallH') + num('mT') + num('mB')) / 100;
    if (!(wm > 0 && hm > 0)) return null;
    const v = Math.min(w / wm, h / hm), p = prog();
    return { v, level: v >= p.good ? 'good' : v >= p.min ? 'ok' : 'bad' };
  }
  const QL = { good: ['Dobra', 'gq-good'], ok: ['Akceptowalna', 'gq-ok'], bad: ['Za słaba', 'gq-bad'] };
  const badge = a => { const q = quality(a.w, a.h); return q ? `<span class="gq ${QL[q.level][1]}">${QL[q.level][0]}</span>` : ''; };
  const catName = id => ((K && K.kategorie.find(c => c.id === id)) || {}).nazwa || '';

  // --- interfejs ---
  function css() {
    if ($('galeriaCss')) return;
    const s = document.createElement('style'); s.id = 'galeriaCss';
    s.textContent = `
      #galeriaBox { border-top: 3px solid var(--v-green); }
      #galeriaBox > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; }
      #galeriaBox > summary::-webkit-details-marker { display: none; }
      #galeriaBox > summary::before { content: "▦"; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: var(--v-green); color: var(--v-ink); font-size: 15px; }
      #galeriaBox > summary .g-opt { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--muted); }
      #galeriaBox .g-cats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      #galeriaBox .g-cats button { width: auto; letter-spacing: .5px; text-transform: none; height: 30px; padding: 0 10px; font-size: 12.5px; font-weight: 500; background: var(--field); color: var(--text); border: 1px solid var(--line); }
      #galeriaBox .g-cats button.on { background: var(--v-ink); color: #fff; border-color: var(--v-ink); }
      #galeriaBox .g-search { margin-top: 10px; }
      #galeriaBox .g-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 10px; max-height: 420px; overflow-y: auto; }
      #galeriaBox .g-grid button.g-thumb { position: relative; height: auto; aspect-ratio: 4 / 3; padding: 0; background: var(--disabled); border: 2px solid transparent; overflow: hidden; }
      #galeriaBox .g-grid button.g-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
      #galeriaBox .g-grid button.g-thumb.on { border-color: var(--v-green); }
      #galeriaBox .g-grid .gq { position: absolute; left: 3px; bottom: 3px; }
      #galeriaBox .gq { display: inline-block; text-transform: none; letter-spacing: 0; padding: 1px 6px; font-size: 10.5px; font-weight: 600; line-height: 1.5; }
      #galeriaBox .gq-good { background: #d9f5ec; color: #11634f; }
      #galeriaBox .gq-ok { background: var(--warn-bg); color: var(--warn); }
      #galeriaBox .gq-bad { background: #fde3e1; color: var(--err); }
      #galeriaBox .g-detail { margin-top: 12px; padding: 10px; border: 1px solid var(--line); background: var(--field-soft); font-size: 13px; }
      #galeriaBox .g-detail img { display: block; width: 100%; max-height: 260px; object-fit: contain; background: var(--disabled); margin-bottom: 8px; }
      #galeriaBox .g-detail .g-title { font-weight: 600; font-size: 14px; }
      #galeriaBox .g-detail .g-lic { margin-top: 6px; color: var(--muted); font-size: 12px; }
      #galeriaBox .g-detail a { color: var(--link); }
      #galeriaBox .g-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
      #galeriaBox .g-msg { margin-top: 8px; font-size: 13px; }
      #galeriaBox .g-msg.err { color: var(--err); }
      #galeriaBox .g-cur { margin-top: 10px; padding: 8px 10px; background: var(--accent-soft); font-size: 12.5px; }
      #galeriaBox .g-cur button { height: 30px; padding: 0 10px; font-size: 12px; margin-top: 6px; }
      @media (max-width: 520px) { #galeriaBox .g-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`;
    document.head.appendChild(s);
  }

  function build() {
    const box = $('galeriaBox');
    const d = document.createElement('details'); d.id = 'galeriaBox'; d.className = box.className;
    d.innerHTML = `
      <summary>Gotowe wzory<span class="g-opt">zamiast własnego zdjęcia</span></summary>
      <div class="hint">Wybrane zdjęcia i obrazy z Wikimedia Commons na licencjach, które pozwalają drukować i sprzedawać. Plakietka mówi, czy rozdzielczość wystarczy na ścianę z kroku 1.</div>
      <div class="g-cats" id="gCats"></div>
      <div class="g-search"><input id="gQ" type="text" placeholder="Szukaj, np. zachód słońca, palmy, zamek…" aria-label="Szukaj wzoru"></div>
      <div class="g-grid" id="gGrid"></div>
      <div id="gDetail"></div>
      <div class="g-msg" id="gMsg" role="status" aria-live="polite"></div>
      <div id="gCur"></div>`;
    box.replaceWith(d);
    d.addEventListener('toggle', () => { if (d.open && !K) open(); });
  }

  const msg = (t, err) => { const el = $('gMsg'); if (el) { el.textContent = t; el.className = 'g-msg' + (err ? ' err' : ''); } };
  const setBusy = b => { busy = b; const el = $('gUse'); if (el) el.disabled = b; };

  async function open() {
    msg('Wczytuję galerię…');
    try {
      await loadCatalog();
      $('gCats').innerHTML = K.kategorie.filter(c => K.wzory.some(w => w.cat === c.id))
        .map(c => `<button type="button" data-cat="${esc(c.id)}">${esc(c.nazwa)}</button>`).join('');
      const first = $('gCats').querySelector('button');
      msg(first ? '' : 'Katalog wzorów jest pusty.');
      if (first) pickCat(first.dataset.cat);
    } catch (e) { msg('Nie udało się wczytać galerii (' + e.message + ').', true); }
  }

  function filter() {
    const keepId = chosen !== null && list[chosen] ? list[chosen].id : null;   // wybrany wzór zostaje wybrany po przeliczeniu
    if (query) {
      const words = norm(query).split(/\s+/).filter(Boolean).map(w => [w, norm(PL[w] || w)]);
      list = K.wzory.filter(a => { const t = norm(`${a.tytul} ${catName(a.cat)} ${a.cat}`); return words.every(([pl, en]) => t.includes(pl) || t.includes(en)); });
    } else list = K.wzory.filter(a => a.cat === cat);
    // Wzorów za słabych na tę ścianę (poniżej progu minimum z jakosc.js) klient w ogóle nie widzi.
    const all = list.length;
    list = list.filter(a => !tooWeak(a));
    const hidden = all - list.length;
    const idx = keepId === null ? -1 : list.findIndex(a => a.id === keepId);
    chosen = idx >= 0 ? idx : null;
    showGrid();
    if (chosen !== null) showDetail(); else $('gDetail').innerHTML = '';
    const note = hidden ? `Ukryto ${hidden} ${hidden === 1 ? 'wzór' : hidden < 5 ? 'wzory' : 'wzorów'} o zbyt małej rozdzielczości na tę ścianę.` : '';
    msg(list.length ? note : (all ? note + ' Zmniejsz ścianę albo wybierz inną kategorię.' : 'Brak wzorów dla tego słowa. Wybierz kategorię powyżej.'));
  }
  const tooWeak = a => { const q = quality(a.w, a.h); return !!q && q.level === 'bad'; };

  function showGrid() {
    $('gGrid').innerHTML = list.map((a, i) => `<button type="button" class="g-thumb${chosen === i ? ' on' : ''}" data-i="${i}" title="${esc(a.tytul)}">
      <img loading="lazy" src="${CONFIG.mini(a.id)}" alt="${esc(a.tytul)}">${badge(a)}</button>`).join('');
  }

  function pickCat(id) {
    cat = id; query = ''; $('gQ').value = '';
    document.querySelectorAll('#gCats button').forEach(b => b.classList.toggle('on', b.dataset.cat === id));
    filter();
  }
  function runSearch() {
    query = $('gQ').value.trim();
    if (!query) { if (cat) pickCat(cat); return; }
    document.querySelectorAll('#gCats button').forEach(b => b.classList.remove('on'));
    filter();
  }

  function showDetail() {
    const a = list[chosen]; if (!a) { $('gDetail').innerHTML = ''; return; }
    const q = quality(a.w, a.h);
    const qText = q ? `${fmt(q.v)} px na metr ściany (progi ${fmt(prog().good)} / ${fmt(prog().min)} px/m).` : 'Podaj wymiar ściany w kroku 1, żeby ocenić jakość.';
    $('gDetail').innerHTML = `<div class="g-detail">
      <img src="${CONFIG.mini(a.id)}" alt="${esc(a.tytul)}">
      <div class="g-title">${esc(a.tytul)}</div>
      <div>Autor: ${esc(a.autor)}</div>
      <div>Oryginał: ${fmt(a.w)} × ${fmt(a.h)} px${a.bajty ? `, ${(a.bajty / 1e6).toFixed(1)} MB` : ''} · Jakość na tę ścianę: ${q ? `<span class="gq ${QL[q.level][1]}">${QL[q.level][0]}</span>` : '–'}</div>
      <div class="g-lic">${esc(qText)}<br>Licencja: ${esc(a.licencja)}${a.podpisWymagany ? ' – wymaga podpisu autora (jest w metryce)' : ''} · Źródło: <a href="${esc(a.zrodlo)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>
      <div class="g-actions"><button type="button" id="gUse">Użyj tego wzoru</button></div>
    </div>`;
  }

  async function use() {
    const a = list[chosen]; if (!a || busy) return;
    if (tooWeak(a)) return msg('Ten wzór ma za małą rozdzielczość na tę ścianę.', true);
    setBusy(true);
    const before = window.grafikaId;   // podmiana na powiększenie AI tej samej grafiki nie liczy się jako zmiana
    try {
      msg(`Pobieram pełny plik (${a.bajty ? (a.bajty / 1e6).toFixed(1) + ' MB, ' : ''}${fmt(a.w)} × ${fmt(a.h)} px)…`);
      // Limit 10 min: zawieszone pobieranie nie blokuje galerii na zawsze (przycisk „Użyj” wraca).
      const r = await fetch(a.plik, { signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!r.ok) throw new Error(`serwer Wikimedia odpowiedział ${r.status}`);
      const blob = await r.blob();
      if (window.grafikaId !== before) return msg('W międzyczasie wybrano inne zdjęcie – wzoru nie wstawiono.', true);
      const slug = norm(a.tytul).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'wzor';
      const name = `wzor-${a.id}-${slug}.jpg`;
      current = { name, id: a.id, title: a.tytul, artist: a.autor, source: 'Wikimedia Commons', url: a.zrodlo, file: a.plik,
        license: a.licencja, licenseUrl: a.licencjaUrl, attribution: a.podpisWymagany,
        credit: `„${a.tytul}”, autor: ${a.autor}, licencja ${a.licencja}${a.licencjaUrl ? ' (' + a.licencjaUrl + ')' : ''}, źródło: Wikimedia Commons.`,
        at: new Date().toISOString() };
      const input = $('file');
      const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: 'image/jpeg' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      msg('Wzór wstawiony w miejsce zdjęcia. Ustaw kadr na podglądzie, potem przejdź do kroku 6 (pliki do produkcji).');
      showCurrent();
    } catch (e) { msg('Nie udało się pobrać wzoru: ' + (e.name === 'TimeoutError' ? 'pobieranie trwało ponad 10 minut' : e.message) + '. Sprawdź internet.', true); }
    finally { setBusy(false); }
  }

  function showCurrent() {
    const el = $('gCur'); if (!el) return;
    el.innerHTML = current ? `<div class="g-cur"><b>Wzór w zleceniu:</b> ${esc(current.credit)}
      ${current.attribution ? '<br>Licencja wymaga podania autora – dołącz metrykę do zlecenia i podaj autora przy sprzedaży.' : ''}<br>
      <button type="button" class="small" id="gTxt">Pobierz metrykę licencji (TXT)</button></div>` : '';
  }

  // Metryka do dołączenia do zlecenia (dowód źródła i licencji).
  function licenseText(c = current) {
    if (!c) return '';
    return [`Metryka wzoru fototapety`, ``, `Plik: ${c.name}`, `Tytuł: ${c.title}`, `Autor: ${c.artist}`,
      `Źródło: ${c.source} – ${c.url}`, `Plik oryginalny: ${c.file}`, `Licencja: ${c.license}${c.licenseUrl ? ' – ' + c.licenseUrl : ''}`,
      `Podpis autora wymagany: ${c.attribution ? 'TAK' : 'nie'}`, `Podpis: ${c.credit}`, `Pobrano: ${c.at}`, ``,
      `Uwaga: licencję podaje Wikimedia Commons. Ewentualne prawa osób trzecich (np. znaki towarowe, wizerunek osób,`,
      `prawa do budynków w niektórych krajach) sprawdza sprzedawca.`].join('\r\n');
  }
  function downloadTxt() {
    if (!current) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + licenseText()], { type: 'text/plain;charset=utf-8' }));
    a.download = current.name.replace(/\.jpg$/, '-licencja.txt');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function init() {
    const box = $('galeriaBox'); if (!box) return;
    css(); build();
    const d = $('galeriaBox');
    d.addEventListener('click', e => {
      const c = e.target.closest('#gCats button');
      if (c) return pickCat(c.dataset.cat);
      const th = e.target.closest('.g-thumb');
      if (th) { chosen = +th.dataset.i; document.querySelectorAll('#gGrid .g-thumb').forEach(b => b.classList.toggle('on', b === th)); showDetail(); msg(''); return; }
      if (e.target.id === 'gUse') use();
      else if (e.target.id === 'gTxt') downloadTxt();
    });
    $('gQ').addEventListener('input', () => { if (K) runSearch(); });
    $('gQ').addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    // Własne zdjęcie (albo grafika AI) zastępuje wzór – metryka przestaje obowiązywać.
    $('file').addEventListener('change', () => { const f = $('file').files[0]; if (current && (!f || f.name !== current.name)) { current = null; showCurrent(); } });
    // Plakietki jakości idą za wymiarem ściany i naddatkami.
    ['wallW', 'wallH', 'mT', 'mB', 'mL', 'mR'].forEach(id => { const el = $(id); if (el) { el.addEventListener('input', refresh); el.addEventListener('change', refresh); } });
  }
  // Zmiana ściany lub naddatków: plakietki i lista dostępnych wzorów liczą się od nowa.
  // Odczekanie 250 ms po ostatnim znaku: przy wpisywaniu wymiaru siatka nie przebudowuje się co klawisz.
  let refreshTimer = 0;
  function refresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (K && (cat || query)) filter(); }, 250); }

  return { init, current: () => current, licenseText, CONFIG };
})();
Galeria.init();

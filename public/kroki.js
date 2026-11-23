// Przebieg krok po kroku (ustalenia Sebastiana 2026-10-25):
//   - sekcje rozwijane: otwarta jest jedna, zamknięte pokazują w nagłówku skrót ustawień,
//   - przycisk „Dalej” przechodzi do następnego kroku, numery kroków idą w kolejności na stronie,
//   - podział: ile brytów wymaga materiał (maks. szerokość druku) i przycisk, który to ustawia,
//   - własne szerokości: ostatnie puste pole pokazuje wyliczoną resztę, pole szersze niż druk jest oznaczone.
// Nie zmienia obliczeń: korzysta z params(), layout() i validate() głównego skryptu.
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const panel = document.querySelector('.panel');
  if (!panel) return;
  const fmt = x => x.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
  const steps = () => [...panel.querySelectorAll(':scope > .step')].filter(s => s.querySelector(':scope > .step-head'));
  const title = s => s.querySelector(':scope > .step-head h2').textContent.trim();

  document.head.insertAdjacentHTML('beforeend', `<style id="krokiCss">
    .panel > .step > .step-head { cursor: pointer; user-select: none; margin-bottom: 0; }
    .panel > .step > .step-head::after { content: "−"; order: 2; margin-left: auto; font-size: 18px; line-height: 1; color: var(--v-ink); }
    .panel > .step.collapsed > .step-head::after { content: "+"; }
    .panel > .step:not(.collapsed) > .step-head { margin-bottom: 4px; }
    .panel > .step.collapsed { padding-bottom: 18px; }
    .panel > .step.collapsed > :not(.step-head) { display: none !important; }
    .panel > .step > .step-head:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
    .step-sum { order: 3; flex-basis: 100%; padding-left: 36px; font-size: 12.5px; color: var(--muted); text-transform: none; letter-spacing: 0; line-height: 1.4; }
    .panel > .step:not(.collapsed) .step-sum { display: none; }
    .panel > .step.collapsed .step-note { display: none; }
    .panel > .step .step-head h2 { flex: 0 1 auto; }
    button.next { width: 100%; margin-top: 16px; height: 40px; }
    .need-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
    .need-row .hint { margin: 0; flex: 1 1 200px; }
    .need-row button { flex: none; }
    #widthsBox input.over { border-color: var(--err); box-shadow: 0 0 0 2px rgba(220,38,38,.15); }
    #widthsBox input::placeholder { color: var(--v-ink); opacity: .55; }
    .sub-lead { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--card-line); font-size: 13px; color: var(--muted); }
    .step .sub { margin-top: 10px; padding: 12px 0 0; border: 0; border-top: 1px solid var(--card-line); background: none; box-shadow: none; }
    details#galeriaBox.sub, div#aiBox.sub { border-top: 1px solid var(--card-line); padding: 12px 0 0; margin-top: 10px; background: none; box-shadow: none; }
  </style>`);

  // --- skróty ustawień w nagłówkach zamkniętych sekcji ---
  const has = (s, id) => !!s.querySelector('#' + id);
  function summary(s) {
    const p = params();
    if (has(s, 'wallW')) {
      const m = $('material'), name = m && m.selectedIndex >= 0 && m.value ? m.options[m.selectedIndex].text : 'materiał nie wybrany';
      return `${fmt(p.wallW || 0)} × ${fmt(p.wallH || 0)} cm · ${name}`;
    }
    if (has(s, 'mT')) return `góra ${fmt(p.mT)} · dół ${fmt(p.mB)} · lewo ${fmt(p.mL)} · prawo ${fmt(p.mR)} cm`;
    if (has(s, 'overlap')) return p.join === 'butt' ? 'Na styk' : `Zakład ${fmt(p.overlap || 0)} cm`;
    if (has(s, 'count')) {
      if (!(p.count >= 1)) return 'Liczba brytów do uzupełnienia';
      if (p.split !== 'custom') return `${p.count} ${plural(p.count)} równej szerokości`;
      const L = safeLayout(p);
      return 'Własne szerokości: ' + (L ? L.bw.widths.map(w => fmt(w)).join(' / ') + ' cm' : 'do uzupełnienia');
    }
    if (has(s, 'file')) {
      const f = $('file').files[0], g = window.Galeria && Galeria.current && Galeria.current();
      return f ? (g ? 'Gotowy wzór: ' + g.title : f.name) : 'Brak zdjęcia – wybierz plik, gotowy wzór albo grafikę AI';
    }
    if (has(s, 'wycOut')) {
      const t = s.querySelector('#wycOut b'), sum = s.querySelector('#wycOut .wycSum td:nth-child(2)');
      return (sum ? `Razem ${sum.textContent.trim()} brutto` : 'Cena po wybraniu materiału') + (t ? ` · ${t.textContent.trim()}` : '');
    }
    if (has(s, 'probkaMsg') || s.id === 'probkaBox') return 'Opcjonalnie: wydruk próbny fragmentu przed całym zleceniem';
    if (has(s, 'dpi')) return `${p.dpi} DPI${p.thru ? ' · pasek thru cut' : ''}${p.pdf ? ' · plik dla CorelDRAW' : ''}`;
    return '';
  }
  function safeLayout(p) {
    try { const L = layout(p); return L.bw.widths.every(w => Number.isFinite(w)) ? L : null; } catch { return null; }
  }

  // --- rozwijanie ---
  function open(s, scroll) {
    steps().forEach(x => setOpen(x, x === s));
    if (scroll) {
      const r = s.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  function setOpen(s, on) {
    s.classList.toggle('collapsed', !on);
    const h = s.querySelector(':scope > .step-head');
    h.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  panel.addEventListener('click', e => {
    const h = e.target.closest('.step-head');
    if (h && h.parentElement.parentElement === panel) {
      const s = h.parentElement;
      if (s.classList.contains('collapsed')) open(s, false); else setOpen(s, false);
      return;
    }
    const n = e.target.closest('button.next');
    if (n) { const all = steps(), i = all.indexOf(n.closest('.step')); if (all[i + 1]) {
      const t = all[i + 1]; open(t, true);
      // fokus do następnego kroku – przycisk „Dalej” zostaje w zwiniętym kroku, niewidoczny dla klawiatury
      // zaznaczona opcja (nie pierwsza z brzegu – Spacja zmieniłaby ustawienie); ukryte pole pliku pomijamy
      const f = t.querySelector('input[type=radio]:checked:not([disabled])') ||
        [...t.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([disabled]), select:not([disabled]), textarea')].find(el => el.id !== 'file' && el.offsetWidth > 1) ||
        t.querySelector('.step-head');
      if (f) f.focus({ preventScroll: true });
    } }
  });
  panel.addEventListener('keydown', e => {
    const h = e.target.closest && e.target.closest('.step-head');
    if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.click(); }
  });

  function prepare() {
    const all = steps();
    all.forEach((s, i) => {
      const h = s.querySelector(':scope > .step-head');
      const num = h.querySelector('.num');
      if (num && num.textContent !== String(i + 1)) num.textContent = String(i + 1);
      if (!h.hasAttribute('tabindex')) { h.setAttribute('tabindex', '0'); h.setAttribute('role', 'button'); }
      if (!h.querySelector('.step-sum')) h.insertAdjacentHTML('beforeend', '<span class="step-sum"></span>');
      // Krok, który moduł dobudował później (np. wycena), startuje zwinięty.
      if (!s.dataset.kr) { s.dataset.kr = '1'; if (ready) setOpen(s, false); }
    });
  }

  // --- liczba brytów wymagana przez materiał ---
  function needInfo() {
    let box = $('needRow');
    if (!box) {
      $('count').insertAdjacentHTML('afterend', '<div class="need-row" id="needRow"><span class="hint" id="needTxt"></span><button type="button" class="small" id="needSet" hidden></button></div>');
      box = $('needRow');
    }
    const p = params(), total = p.wallW + p.mL + p.mR;
    const txt = $('needTxt'), btn = $('needSet');
    const set = (el, t) => { if (el.textContent !== t) el.textContent = t; };
    let bt = '';
    if (!(total > 0) || !Number.isFinite(p.maxPrint) || !(p.maxPrint > p.overlap)) {
      set(txt, Number.isFinite(p.maxPrint) ? '' : 'Wybierz materiał w kroku 1, żeby program pilnował maksymalnej szerokości brytu.');
      btn.hidden = true; return;
    }
    const need = Math.max(1, Math.ceil((total - p.overlap) / (p.maxPrint - p.overlap) - 1e-9));
    let t = `Materiał drukuje maks. ${fmt(p.maxPrint)} cm, więc przy ${fmt(total)} cm z naddatkami potrzeba co najmniej ${need} ${plural(need)}.`;
    if (p.split === 'equal' && p.count >= 1) {
      const w = (total + (p.count - 1) * p.overlap) / p.count;
      t += ` Teraz każdy bryt ma ${fmt(w)} cm.`;
    }
    set(txt, t);
    if (p.count < need) { bt = `Ustaw ${need} ${plural(need)}`; btn.dataset.n = need; }
    set(btn, bt); btn.hidden = !bt;
  }
  document.addEventListener('click', e => {
    if (e.target.id !== 'needSet') return;
    const c = $('count'); c.value = e.target.dataset.n;
    c.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // --- własne szerokości: wyliczona reszta i pola za szerokie ---
  function widthsHelp() {
    const ins = [...document.querySelectorAll('#widthsBox input')];
    if (!ins.length) return;
    const p = params();
    const L = p.split === 'custom' ? safeLayout(p) : null;
    const last = ins[ins.length - 1];
    // Ostatnie puste pole = reszta: etykieta mówi to wprost, a w polu widać wyliczoną szerokość.
    const lab = document.querySelector(`label[for="${last.id}"]`);
    if (lab) { const t = ins.length > 1 ? `Bryt ${ins.length} · reszta` : `Bryt ${ins.length}`; if (lab.textContent !== t) lab.textContent = t; }
    if (L && last.value.trim() === '' && ins.length > 1) last.placeholder = fmt(L.bw.widths[L.bw.widths.length - 1]);
    else if (last.value.trim() === '') last.placeholder = 'reszta';
    ins.forEach((el, i) => {
      const w = L ? L.bw.widths[i] : parseFloat(el.value);
      const over = Number.isFinite(p.maxPrint) && w > p.maxPrint + 1e-6;
      el.classList.toggle('over', over);
      el.title = over ? `Szerszy niż maks. szerokość druku materiału (${fmt(p.maxPrint)} cm)` : '';
    });
    let hint = $('widthsHint');
    if (!hint) { $('widthsBox').insertAdjacentHTML('afterend', '<div class="hint" id="widthsHint"></div>'); hint = $('widthsHint'); }
    const total = p.wallW + p.mL + p.mR;
    const ht = total > 0
      ? `Do pokrycia: ${fmt(total)} cm (ściana ${fmt(p.wallW)} + naddatki ${fmt(p.mL)} i ${fmt(p.mR)} cm)` +
        (p.overlap > 0 && ins.length > 1 ? `, każde łączenie zabiera ${fmt(p.overlap)} cm zakładu.` : '.') +
        (Number.isFinite(p.maxPrint) ? ` Bryt może mieć maks. ${fmt(p.maxPrint)} cm.` : '')
      : '';
    if (hint.textContent !== ht) hint.textContent = ht;
  }

  let queued = false;
  function update() {
    queued = false;
    prepare();
    steps().forEach(s => { const el = s.querySelector('.step-sum'); if (el) { const t = summary(s); if (el.textContent !== t) el.textContent = t; } });
    needInfo();
    widthsHelp();
  }
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  // Dalej: przycisk na końcu kroków nad paskiem „Generuj bryty” (poza ostatnim z nich).
  function addNext() {
    const act = panel.querySelector(':scope > .actions');
    const all = steps().filter(s => !act || (s.compareDocumentPosition(act) & Node.DOCUMENT_POSITION_FOLLOWING));
    all.forEach((s, i) => {
      if (i === all.length - 1 || s.querySelector(':scope > button.next') || !s.querySelector('input, select')) return;
      s.insertAdjacentHTML('beforeend', `<button type="button" class="small next">Dalej: ${title(all[i + 1])}</button>`);
    });
  }

  panel.addEventListener('input', later);
  panel.addEventListener('change', later);
  new MutationObserver(later).observe($('tbl'), { childList: true });
  new MutationObserver(later).observe($('msg'), { childList: true });
  new MutationObserver(later).observe(panel, { childList: true });
  panel.querySelectorAll(':scope > .step').forEach(s => new MutationObserver(later).observe(s, { childList: true }));

  let ready = false;
  prepare();
  addNext();
  steps().forEach((s, i) => setOpen(s, i === 0));
  ready = true;
  update();
  window.Kroki = { open: i => open(steps()[i], true), update };
})();

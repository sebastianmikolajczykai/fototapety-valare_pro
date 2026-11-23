// Sekcja 09 – narożniki, drzwi i okna (docs/sections/09-narozniki-otwory.md).
// Osobny plik, żeby nie mieszać z wyglądem bryty.html. Haki w bryty.html:
//   <div id="scianaBox"></div>, Sciana.warnings(p, L) w render(), Sciana.draw(ctx, view, p) po górnym podglądzie.
// Reguły z transkryptu (L972–981, L1089–1096, L1207–1211):
//   - łączenie nie może wypaść tuż przy narożniku (5 cm źle, 20–30 cm zawinięcia dobrze),
//   - łączenie nie w drzwiach/oknie ani tuż przy ich krawędzi,
//   - drzwi i okna drukujemy w całości (pełny prostokąt), montażysta docina na miejscu.
// Położenia mierzone od lewej krawędzi ściany (bez naddatku), w cm.
'use strict';
window.Sciana = (() => {
  const CORNER_MIN_CM = 20;   // DO WALIDACJI: dolna granica „20–30 cm” z rozmowy
  const OPENING_MIN_CM = 5;   // DO WALIDACJI: jak minimalny pasek (P5), żeby obok ościeżnicy nie został wąski pasek
  const NAMES = { corner: 'Narożnik', door: 'Drzwi', window: 'Okno' };
  const items = [];           // { type, x, w, y, h } – x, w, y, h w cm (y = od podłogi)
  const val = v => { const s = String(v).trim(); return s === '' ? NaN : parseFloat(s.replace(',', '.')); };
  // Numeracja w obrębie rodzaju: Narożnik 1, Drzwi 1, Okno 1…
  const label = i => `${NAMES[items[i].type]} ${items.slice(0, i + 1).filter(x => x.type === items[i].type).length}`;
  const fmt = x => x.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

  function rowHtml(it, i) {
    const f = (k, label, ph) => `<div><label>${label}</label><input type="number" step="0.1" data-i="${i}" data-k="${k}" value="${Number.isNaN(it[k]) ? '' : it[k]}"${ph ? ` placeholder="${ph}"` : ''}></div>`;
    const fields = it.type === 'corner'
      ? f('x', 'Od lewej [cm]')
      : f('x', 'Od lewej [cm]') + f('w', 'Szerokość [cm]') + f('y', 'Od podłogi [cm]', it.type === 'door' ? '0' : '') + f('h', 'Wysokość [cm]', 'cała');
    return `<div class="scianaRow" style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">${label(i)}</b>` +
      `<button type="button" class="small" data-del="${i}">Usuń</button></div><div class="row4">${fields}</div></div>`;
  }

  function build() {
    const box = document.getElementById('scianaBox');
    if (!box) return;
    box.innerHTML = '<h2>Narożniki, drzwi i okna</h2>' +
      '<div class="hint">Położenie mierz od lewej krawędzi ściany (bez naddatku). Drzwi i okna drukujemy w całości, montażysta docina je na miejscu. Program pilnuje, żeby łączenia nie wypadły przy narożniku ani przy otworze.</div>' +
      '<div id="scianaRows">' + items.map(rowHtml).join('') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button type="button" class="small" data-add="corner">+ Narożnik</button>' +
      '<button type="button" class="small" data-add="door">+ Drzwi</button>' +
      '<button type="button" class="small" data-add="window">+ Okno</button></div>' +
      (items.length ? '<button type="button" class="small" id="scianaSuggest" style="margin-top:10px">Zaproponuj podział omijający narożniki i otwory</button><div id="scianaMsg" class="hint"></div>' : '');
  }

  function init() {
    const box = document.getElementById('scianaBox');
    if (!box) return;
    build();
    box.addEventListener('click', e => {
      const t = e.target;
      if (t.dataset.add) { items.push({ type: t.dataset.add, x: NaN, w: NaN, y: t.dataset.add === 'door' ? 0 : NaN, h: NaN }); build(); changed(); }
      else if (t.dataset.del !== undefined) { items.splice(+t.dataset.del, 1); build(); changed(); }
      else if (t.id === 'scianaSuggest') applySuggestion();
    });
    box.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.k === undefined) return;
      items[+t.dataset.i][t.dataset.k] = val(t.value);
      changed();
    });
  }

  // Pola, w których nie może leżeć łączenie (w cm całości, czyli razem z lewym naddatkiem).
  function forbidden(p) {
    const out = [];
    for (const it of items) {
      if (!(it.x >= 0)) continue;
      if (it.type === 'corner') out.push({ it, a: p.mL + it.x - CORNER_MIN_CM, b: p.mL + it.x + CORNER_MIN_CM });
      else if (it.w > 0) out.push({ it, a: p.mL + it.x - OPENING_MIN_CM, b: p.mL + it.x + it.w + OPENING_MIN_CM });
    }
    return out;
  }

  // Łączenia: pas zakładu (albo linia przy styku) między brytem i a i+1, w cm całości.
  function seams(p, widths) {
    const s = []; let a = 0;
    for (let i = 0; i < widths.length - 1; i++) { a += widths[i] - p.overlap; s.push({ i, a, b: a + p.overlap }); }
    return s;
  }
  const hits = (s, f) => s.a < f.b - 1e-6 && s.b > f.a + 1e-6;

  function conflicts(p, L) {
    const F = forbidden(p), out = [];
    for (const s of seams(p, L.bw.widths)) for (const f of F) if (hits(s, f)) out.push({ s, f });
    return out;
  }

  function warnings(p, L) {
    if (!items.length) return [];
    const w = [];
    items.forEach((it, i) => {
      const name = label(i);
      if (!(it.x >= 0)) w.push(`${name}: wpisz położenie od lewej krawędzi ściany.`);
      else if (it.type !== 'corner' && !(it.w > 0)) w.push(`${name}: wpisz szerokość.`);
      else if (it.x + (it.type === 'corner' ? 0 : it.w) > p.wallW + 1e-6) w.push(`${name} wychodzi poza ścianę (${fmt(p.wallW)} cm).`);
      else if (it.type !== 'corner' && (it.y || 0) + (it.h > 0 ? it.h : 0) > p.wallH + 1e-6) w.push(`${name} wychodzi poza ścianę u góry (wysokość ${fmt(p.wallH)} cm).`);
    });
    for (const { s, f } of conflicts(p, L)) {
      const at = fmt(s.a - p.mL), name = label(items.indexOf(f.it)).toLowerCase();
      w.push(f.it.type === 'corner'
        ? `Łączenie brytów ${s.i + 1} i ${s.i + 2} (${at} cm od lewej) wypada bliżej niż ${CORNER_MIN_CM} cm od narożnika (${name}). Montażysta nie zawinie tak wąskiego kawałka – zmień podział.`
        : `Łączenie brytów ${s.i + 1} i ${s.i + 2} (${at} cm od lewej) wypada w otworze lub bliżej niż ${OPENING_MIN_CM} cm od jego krawędzi (${name}) – zmień podział.`);
    }
    const ss = seams(p, L.bw.widths);
    if (ss.length && !w.length) w.push(`<span class="ok">Łączenia (${ss.map(s => fmt(s.a - p.mL)).join(', ')} cm od lewej krawędzi ściany) omijają narożniki i otwory.</span>`);
    return w;
  }

  // Szuka szerokości brytów (pełne cm, ostatni = reszta), żeby żadne łączenie nie trafiło w zakazane pole.
  // Zaczyna od obecnej liczby brytów (albo minimalnej dla materiału) i próbuje kolejnych.
  function suggest(p, L) {
    const T = L.totalWcm, ov = p.overlap, F = forbidden(p);
    const maxW = Number.isFinite(p.maxPrint) ? p.maxPrint : Math.max(...L.bw.widths);
    if (!(maxW > ov + MIN_LAST_CM)) return null;
    const minW = ov + MIN_LAST_CM;
    const nMin = Math.max(1, Math.ceil((T - ov) / (maxW - ov) - 1e-9));
    let budget = 200000, until = 0;   // na każdą liczbę brytów maks. ok. 0,3 s – nierozwiązywalny układ nie zamrozi strony
    const solve = (a, rem) => {
      if (--budget < 0 || Date.now() > until) return null;
      if (rem === 1) { const w = T - a; return w <= maxW + 1e-6 && (a === 0 || w >= minW - 1e-6) ? [w] : null; }
      const ideal = (T - a + (rem - 1) * ov) / rem;
      const cands = [];
      for (let w = Math.ceil(minW); w <= Math.floor(maxW); w++) cands.push(w);
      cands.sort((x, y) => Math.abs(x - ideal) - Math.abs(y - ideal));
      for (const w of cands) {
        const s = { a: a + w - ov, b: a + w };
        if (F.some(f => hits(s, f))) continue;
        const left = T - (a + w - ov);
        if (left > (rem - 1) * maxW - (rem - 2) * ov + 1e-6) continue;
        if (left < minW) continue;
        const r = solve(a + w - ov, rem - 1);
        if (r) return [w, ...r];
      }
      return null;
    };
    for (let n = Math.max(nMin, p.count); n <= Math.min(MAX_BRYTY, Math.max(nMin, p.count) + 6); n++) {
      budget = 200000; until = Date.now() + 300;
      const r = solve(0, n);
      if (r) return r;
    }
    return null;
  }

  function applySuggestion() {
    const p = params();
    const msg = document.getElementById('scianaMsg');
    if (validate(p).length) { msg.innerHTML = '<span class="err">Najpierw popraw błędy w ustawieniach.</span>'; return; }
    const L = layout(p);
    if (!conflicts(p, L).length) { msg.innerHTML = '<span class="ok">Obecny podział już omija narożniki i otwory.</span>'; return; }
    const r = suggest(p, L);
    if (!r) { msg.innerHTML = '<span class="err">Nie znalazłem podziału, który omija wszystkie narożniki i otwory przy tym materiale. Ustaw szerokości ręcznie.</span>'; return; }
    document.querySelector('input[name=split][value=custom]').checked = true;
    document.getElementById('count').value = r.length;
    render();
    const inputs = [...document.querySelectorAll('#widthsBox input')];
    inputs.forEach((el, i) => { el.value = i < r.length - 1 ? r[i] : ''; });
    changed();
    document.getElementById('scianaMsg').innerHTML = `<span class="ok">Ustawiono ${r.length} ${plural(r.length)}: ${r.slice(0, -1).join(' / ')} cm + reszta ${fmt(r[r.length - 1])} cm.</span>`;
  }

  // Nakładka na górny podgląd: narożniki (linia przerywana), otwory (prostokąt), łączenia w konflikcie (czerwone).
  function draw(ctx, view, p) {
    if (!items.length || !view) return;
    const k = view.sc * p.dpi / 2.54;               // cm -> piksele podglądu
    const X = cm => view.ox + (p.mL + cm) * k;
    const floorY = view.oy + (p.mT + p.wallH) * k;
    ctx.save();
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 2;
    items.forEach((it, i) => {
      if (!(it.x >= 0)) return;
      if (it.type === 'corner') {
        ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(X(it.x), view.oy); ctx.lineTo(X(it.x), view.oy + view.h); ctx.stroke();
        ctx.setLineDash([]); ctx.fillStyle = '#b45309'; ctx.fillText(label(i).toLowerCase(), X(it.x), view.oy - 6);
        return;
      }
      if (!(it.w > 0)) return;
      const y0 = it.y >= 0 ? it.y : 0;
      const h = it.h > 0 ? it.h : p.wallH - y0;
      const x = X(it.x), w = it.w * k, top = floorY - (y0 + h) * k;
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x, top, w, h * k);
      ctx.strokeStyle = '#1d1d1b'; ctx.setLineDash([5, 4]); ctx.strokeRect(x, top, w, h * k); ctx.setLineDash([]);
      ctx.fillStyle = '#1d1d1b'; ctx.fillText(label(i).toLowerCase(), x + w / 2, top + Math.min(h * k / 2, 16) + 4);
    });
    const L = view.L;
    for (const { s } of conflicts(p, L)) {
      ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3;
      const x0 = view.ox + s.a * k, x1 = view.ox + s.b * k;
      ctx.strokeRect(x0 - 2, view.oy, Math.max(4, x1 - x0 + 4), view.h);
    }
    ctx.restore();
  }

  // Dane dla innych modułów (np. schemat montażu, sekcja 05). Wszystko w cm od lewej krawędzi ściany
  // (bez naddatku); y = od podłogi. Pomija niekompletne wpisy. seams = łączenia z oznaczeniem konfliktu.
  function data(p, L) {
    const ok = it => it.x >= 0 && (it.type === 'corner' || it.w > 0);
    const list = items.map((it, i) => ({ it, i })).filter(({ it }) => ok(it));
    const bad = L ? conflicts(p, L).map(c => c.s.i) : [];
    return {
      corners: list.filter(({ it }) => it.type === 'corner').map(({ it, i }) => ({ label: label(i), x: it.x })),
      openings: list.filter(({ it }) => it.type !== 'corner').map(({ it, i }) => ({
        label: label(i), type: it.type, x: it.x, w: it.w, y: it.y >= 0 ? it.y : 0, h: it.h > 0 ? it.h : null })),
      seams: L ? seams(p, L.bw.widths).map(s => ({ between: [s.i + 1, s.i + 2], from: s.a - p.mL, to: s.b - p.mL, conflict: bad.includes(s.i) })) : [],
    };
  }

  return { init, warnings, draw, suggest, data, items, CORNER_MIN_CM, OPENING_MIN_CM };
})();

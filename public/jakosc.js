// Sekcja 08 – kontrola jakości zdjęcia (docs/sections/08-jakosc-grafiki.md).
// Osobny plik, żeby nie mieszać z bryty.html. Haki w bryty.html:
//   <div id="jakoscBox"></div> pod tabelą brytów, Jakosc.update(...) w render() (zwraca ostrzeżenie do #calc),
//   Jakosc.draw(ctx, view) po górnym podglądzie, Jakosc.init() na końcu skryptu.
// Miara: ile pikseli zdjęcia źródłowego przypada na 1 m ściany przy aktualnym kadrze i powiększeniu.
// Progi (DO WALIDACJI, źródła sprzeczne):
//   - 2500 px/m – e-mail Weroniki 12.10.2026 („ok. 2500 px na metr często wystarcza”, 5×3 m → 12 500×7 500 px),
//   - 1000 px/m – rozmowa z Asią (próg, który był w prototypie).
// Weronika podaje też 150 DPI (= ok. 5900 px/m), co przeczy 2500 px/m – dlatego progi są parametrem do zmiany w oknie.
'use strict';
window.Jakosc = (() => {
  const DEFAULTS = { good: 2500, min: 1000 };  // px/m, DO WALIDACJI
  const LONG_SIDE_MAX = 30000;                 // Weronika: powyżej ok. 30 000 px obciąża programy bez poprawy
  const prog = { ...DEFAULTS };
  const frag = { u: 0.5, v: 0.5, x2: false };  // środek fragmentu 1:1 jako ułamek pola zdjęcia, x2 = podgląd 200%
  let last = null;                              // { L, img, F } z ostatniego render()
  const $ = id => document.getElementById(id);
  const fmt = x => Math.round(x).toLocaleString('pl-PL');
  const LEVELS = {
    good: { name: 'Dobra', cls: 'jq-good', text: 'Zdjęcie ma wystarczającą rozdzielczość na tę ścianę.' },
    ok:   { name: 'Akceptowalna', cls: 'jq-ok', text: 'Druk może być lekko miękki z bliska. Obejrzyj fragment 1:1 poniżej i zdecyduj.' },
    bad:  { name: 'Za słaba', cls: 'jq-bad', text: 'Zdjęcie jest za małe na tę ścianę lub ten kadr. Druk będzie rozmyty albo „w kratkę”. Zmniejsz powiększenie, użyj większego pliku albo ulepsz zdjęcie.' },
  };

  // Ocena: pxPerM = piksele źródła na metr ściany. Poziom wg progów.
  function assess(pxPerM, zoom) {
    const level = pxPerM >= prog.good ? 'good' : pxPerM >= prog.min ? 'ok' : 'bad';
    // pxPerM jest odwrotnie proporcjonalne do powiększenia kadru -> maks. powiększenie dla poziomu „dobra”.
    const zoomGood = zoom * pxPerM / prog.good;
    return { level, zoomGood };
  }

  function css() {
    const s = document.createElement('style');
    s.textContent = `
#jakoscBox { margin-top: 14px; border-top: 1px solid var(--stage-line); padding-top: 14px; }
#jakoscBox:empty { display: none; }
#jakoscBox h3 { margin: 0 0 8px; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
#jakoscBox .jq-badge { display: inline-block; padding: 2px 10px; font-size: 13px; font-weight: 700; border-radius: var(--radius-sm); }
#jakoscBox .jq-good { background: var(--accent-soft); color: var(--ok); }
#jakoscBox .jq-ok { background: var(--warn-bg); color: var(--warn); }
#jakoscBox .jq-bad { background: var(--err-bg); color: var(--err); }
#jakoscBox .jq-scale { position: relative; height: 8px; margin: 10px 0 4px; display: flex; }
#jakoscBox .jq-scale i { display: block; height: 100%; }
#jakoscBox .jq-scale b { position: absolute; top: -4px; width: 3px; height: 16px; background: var(--stage-text); transform: translateX(-1px); }
#jakoscBox .jq-ticks { position: relative; height: 16px; font-size: 11px; color: var(--stage-muted); }
#jakoscBox .jq-ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
#jakoscBox .jq-facts { font-size: 13px; line-height: 1.55; margin: 6px 0 0; padding-left: 18px; }
#jakoscBox .jq-frag { margin-top: 12px; }
#jakoscBox .jq-frag-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; font-weight: 600; }
#jakoscBox .jq-wrap { margin-top: 6px; border: 1px solid var(--stage-line); overflow: hidden; background: #fff; }
#jakoscCanvas { display: block; cursor: grab; touch-action: none; }
#jakoscCanvas.drag { cursor: grabbing; }
#jakoscBox details { margin-top: 10px; font-size: 13px; }
#jakoscBox details summary { cursor: pointer; color: var(--stage-muted); }
#jakoscBox .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
#jakoscBox label { font-size: 12px; }
`;
    document.head.appendChild(s);
  }

  function build() {
    const box = $('jakoscBox');
    if (!box) return;
    box.innerHTML =
      '<h3>Jakość zdjęcia <span id="jqBadge" class="jq-badge"></span></h3>' +
      '<div id="jqText" class="hint" style="margin-top:0"></div>' +
      '<div class="jq-scale" id="jqScale"></div><div class="jq-ticks" id="jqTicks"></div>' +
      '<ul class="jq-facts" id="jqFacts"></ul>' +
      '<div class="jq-frag"><div class="jq-frag-head"><span>Fragment w skali 1:1 (piksel ekranu = piksel druku)</span>' +
      '<label class="check" style="margin:0;font-weight:400"><input type="checkbox" id="jqX2"> powiększ 200%</label></div>' +
      '<div class="jq-wrap"><canvas id="jakoscCanvas" width="400" height="220"></canvas></div>' +
      '<div class="hint" id="jqFragInfo">Przeciągnij fragment, żeby obejrzeć inne miejsce. Zielona ramka na podglądzie pokazuje, gdzie jest.</div></div>' +
      '<details><summary>Progi oceny</summary>' +
      '<div class="row"><div><label for="jqGood">Dobra od [px/m]</label><input id="jqGood" type="number" min="1" step="50" value="' + prog.good + '"></div>' +
      '<div><label for="jqMin">Za słaba poniżej [px/m]</label><input id="jqMin" type="number" min="1" step="50" value="' + prog.min + '"></div></div>' +
      '<div class="hint">Domyślnie: dobra od 2500 px/m (np. ściana 5×3 m → 12 500×7 500 px), za słaba poniżej 1000 px/m.</div></details>';
    box.hidden = true;
    const onProg = () => {
      const g = parseFloat($('jqGood').value), m = parseFloat($('jqMin').value);
      if (g > 0) prog.good = g;
      if (m > 0) prog.min = m;
      if (prog.min > prog.good) prog.min = prog.good;
      // Cały podgląd (bez kasowania wygenerowanych plików), żeby ostrzeżenie o jakości pod ustawieniami też się zmieniło.
      if (typeof window.render === 'function') window.render(); else refresh();
    };
    $('jqGood').addEventListener('input', e => { e.stopPropagation(); onProg(); });
    $('jqMin').addEventListener('input', e => { e.stopPropagation(); onProg(); });
    $('jqX2').addEventListener('input', e => { e.stopPropagation(); frag.x2 = e.target.checked; drawFrag(); });

    // Przeciąganie fragmentu 1:1 (przesuwa miejsce w polu zdjęcia).
    const cv = $('jakoscCanvas');
    let from = null, raf = 0;
    cv.addEventListener('pointerdown', e => {
      if (!last) return;
      from = { x: e.clientX, y: e.clientY, u: frag.u, v: frag.v };
      cv.setPointerCapture(e.pointerId); cv.classList.add('drag');
    });
    cv.addEventListener('pointermove', e => {
      if (!from || !last) return;
      const k = frag.x2 ? 2 : 1;
      frag.u = clamp(from.u - (e.clientX - from.x) / k / last.L.panoW);
      frag.v = clamp(from.v - (e.clientY - from.y) / k / last.L.imgH);
      // jedno przerysowanie na klatkę (render() i tak rysuje fragment i przesuwa zieloną ramkę na podglądzie)
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (typeof window.render === 'function') window.render(); else drawFrag(); });
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { from = null; cv.classList.remove('drag'); }));
    window.addEventListener('resize', drawFrag);
  }
  const clamp = x => Math.min(1, Math.max(0, x));

  // Wywoływane z render(). Bez zdjęcia albo przy błędach: (null). Zwraca HTML ostrzeżenia do #calc (albo '').
  function update(p, L, img, F, zoom) {
    const box = $('jakoscBox');
    if (!p || !L || !img || !F) { last = null; if (box) box.hidden = true; return ''; }
    last = { p, L, img, F, zoom: zoom || 1 };
    refresh();
    const a = assess(pxPerM(), last.zoom);
    return a.level === 'bad'
      ? `<div class="warn">Jakość zdjęcia: za słaba (${fmt(pxPerM())} px/m, minimum ${fmt(prog.min)} px/m).</div>`
      : '';
  }
  // Piksele źródła na metr ściany: 1 m = dpi/0,0254 px druku, 1 px źródła = F.s px druku.
  const pxPerM = () => last.p.dpi / 2.54 * 100 / last.F.s;

  function refresh() {
    const box = $('jakoscBox');
    if (!box || !last) return;
    box.hidden = false;
    const { p, L, img, zoom } = last;
    const v = pxPerM(), a = assess(v, zoom), lv = LEVELS[a.level];
    $('jqBadge').textContent = lv.name; $('jqBadge').className = 'jq-badge ' + lv.cls;
    $('jqText').textContent = lv.text;

    // Pasek skali 0 … 1,5 × próg „dobra”, ze wskaźnikiem.
    const max = prog.good * 1.5, pc = x => Math.min(100, x / max * 100);
    $('jqScale').innerHTML = `<i style="width:${pc(prog.min)}%;background:var(--err)"></i>` +
      `<i style="width:${pc(prog.good) - pc(prog.min)}%;background:var(--warn)"></i>` +
      `<i style="width:${100 - pc(prog.good)}%;background:var(--accent)"></i><b style="left:${pc(v)}%"></b>`;
    $('jqTicks').innerHTML = `<span style="left:${pc(prog.min)}%">${fmt(prog.min)}</span><span style="left:${pc(prog.good)}%">${fmt(prog.good)} px/m</span>`;

    const wallM = L.totalWcm / 100, hM = L.totalHcm / 100;
    const needW = Math.ceil(wallM * prog.good), needH = Math.ceil(hM * prog.good);
    const facts = [
      `Na ścianie: <b>${fmt(v)} px/m</b> (ok. ${fmt(v * 0.0254)} DPI zdjęcia źródłowego; druk ${p.dpi} DPI).`,
      `Zdjęcie ${fmt(img.naturalWidth)} × ${fmt(img.naturalHeight)} px. Na „dobrą” jakość przy tej ścianie z naddatkiem (${(wallM).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} × ${(hM).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} m) potrzeba ok. ${fmt(needW)} × ${fmt(needH)} px przy pełnym kadrze.`,
      a.zoomGood >= 1
        ? `Powiększenie kadru ${Math.round(zoom * 100)}%. Poziom „dobra” zostaje do ok. ${Math.round(Math.min(a.zoomGood, 3) * 100)}%${a.zoomGood > 3 ? ' (maks. suwaka)' : ''}.`
        : `Powiększenie kadru ${Math.round(zoom * 100)}%. Nawet przy 100% zdjęcie nie osiąga poziomu „dobra”.`,
    ];
    if (Math.max(img.naturalWidth, img.naturalHeight) > LONG_SIDE_MAX)
      facts.push(`Dłuższy bok ponad ${fmt(LONG_SIDE_MAX)} px – według grafików obciąża programy bez wyraźnej poprawy jakości.`);
    $('jqFacts').innerHTML = facts.map(x => `<li>${x}</li>`).join('');
    drawFrag();
  }

  // Fragment pola zdjęcia w pikselach druku 1:1 (albo 2:1 przy „powiększ 200%”), bez wygładzania przy 200%.
  function drawFrag() {
    const cv = $('jakoscCanvas');
    if (!cv || !last) return;
    const wrap = cv.parentElement;
    const w = Math.max(160, Math.min(1000, (wrap.clientWidth || 400) - 2));
    if (cv.width !== w) cv.width = w;
    cv.style.width = w + 'px'; cv.style.height = cv.height + 'px';
    const { L, img, F } = last, k = frag.x2 ? 2 : 1;
    const fw = cv.width / k, fh = cv.height / k;                       // rozmiar fragmentu w px druku
    const x0 = Math.max(0, Math.min(L.panoW - fw, frag.u * L.panoW - fw / 2));
    const y0 = Math.max(0, Math.min(L.imgH - fh, frag.v * L.imgH - fh / 2));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    // 1) fragment w rozdzielczości druku (jak w renderJpeg), 2) ewentualne powiększenie 2× bez wygładzania
    const tmp = document.createElement('canvas');
    tmp.width = Math.ceil(fw); tmp.height = Math.ceil(fh);
    const t = tmp.getContext('2d');
    t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
    t.drawImage(img, (x0 + F.cx) / F.s, (y0 + F.cy) / F.s, fw / F.s, fh / F.s, 0, 0, fw, fh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tmp.width * k, tmp.height * k);
    last.box = { x0, y0, fw, fh };
    const cm = px => (px / last.p.dpi * 2.54).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
    $('jqFragInfo').textContent = `Widoczny fragment: ${cm(fw)} × ${cm(fh)} cm ściany. Przeciągnij, żeby obejrzeć inne miejsce. Zielona ramka na podglądzie pokazuje, gdzie jest.`;
  }

  // Zielona ramka fragmentu na górnym podglądzie (view z render()).
  function draw(ctx, view) {
    if (!last || !last.box || !view || $('jakoscBox').hidden) return;
    const b = last.box, sc = view.sc;
    const x = view.ox + b.x0 * sc, y = view.oy + (view.L.band + b.y0) * sc;
    const w = Math.max(6, b.fw * sc), h = Math.max(6, b.fh * sc);
    ctx.save();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#25c09e'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function init() { css(); build(); }
  return { init, update, draw, assess, DEFAULTS, prog };
})();

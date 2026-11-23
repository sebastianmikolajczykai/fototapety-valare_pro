// Lupa: całe zdjęcie na pełnym ekranie, z powiększeniem do pikseli (ustalenie Sebastiana 2026-10-25).
// Ramka pokazuje kadr, który idzie do druku, cienkie linie – łączenia brytów. Niczego nie zmienia w kadrze.
// Hak w bryty.html: <button id="lupaBtn"> w pasku podglądu i <script src="lupa.js"> po głównym skrypcie.
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const btn = $('lupaBtn');
  if (!btn) return;
  const MAX = 4;          // największe powiększenie: 400% pikseli zdjęcia

  document.head.insertAdjacentHTML('beforeend', `<style id="lupaCss">
    #lupa { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; background: #161b22; color: #fff; }
    #lupa[hidden] { display: none; }
    #lupa .lp-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px; border-top: 3px solid var(--v-green); background: var(--v-ink); }
    #lupa .lp-title { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-right: auto; }
    #lupa .lp-title span { font-weight: 300; letter-spacing: .5px; text-transform: none; margin-left: 10px; color: rgba(255,255,255,.7); }
    #lupa button { width: auto; height: 34px; margin: 0; padding: 0 12px; font-size: 12px; letter-spacing: 1px; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.35); }
    #lupa button:hover:not(:disabled) { background: rgba(255,255,255,.12); }
    #lupa button.icon { width: 34px; padding: 0; font-size: 18px; letter-spacing: 0; }
    #lupa button.close { background: var(--v-green); color: var(--v-ink); border-color: var(--v-green); }
    #lupa .lp-val { min-width: 48px; text-align: center; font-size: 13px; font-variant-numeric: tabular-nums; }
    #lupa .lp-view { position: relative; flex: 1; overflow: hidden; cursor: grab; touch-action: none; }
    #lupa .lp-view.drag { cursor: grabbing; }
    #lupa .lp-wrap { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    #lupa .lp-wrap img { display: block; max-width: none; user-select: none; -webkit-user-drag: none; }
    #lupa .lp-frame { position: absolute; border: 2px solid var(--v-green); box-shadow: 0 0 0 100000px rgba(0,0,0,.35); pointer-events: none; }
    #lupa .lp-seam { position: absolute; top: 0; bottom: 0; transform: translateX(-50%); }
    #lupa .lp-tip { padding: 6px 16px 10px; font-size: 12px; color: rgba(255,255,255,.65); background: var(--v-ink); }
    @media (max-width: 560px) { #lupa .lp-title span { display: none; } #lupa .lp-tip { display: none; } }
  </style>`);
  document.body.insertAdjacentHTML('beforeend', `<div id="lupa" hidden role="dialog" aria-modal="true" aria-label="Lupa – całe zdjęcie">
    <div class="lp-bar">
      <div class="lp-title">Lupa<span id="lpInfo"></span></div>
      <button type="button" class="icon" id="lpOut" aria-label="Pomniejsz">−</button>
      <span class="lp-val" id="lpVal">100%</span>
      <button type="button" class="icon" id="lpIn" aria-label="Powiększ">+</button>
      <button type="button" id="lpFit">Całe zdjęcie</button>
      <button type="button" id="lp100">100% pikseli</button>
      <button type="button" class="close" id="lpClose">Zamknij</button>
    </div>
    <div class="lp-view" id="lpView"><div class="lp-wrap" id="lpWrap"><img id="lpImg" alt="Zdjęcie w powiększeniu"><div id="lpFrame" class="lp-frame" hidden></div></div></div>
    <div class="lp-tip">Kółko myszy lub +/− powiększa w miejscu kursora, przeciągnij, żeby przesunąć. Zielona ramka – kadr do druku, biało-grafitowe linie – łączenia brytów. Esc zamyka.</div>
  </div>`);

  const box = $('lupa'), view = $('lpView'), wrap = $('lpWrap'), pic = $('lpImg'), frame = $('lpFrame');
  let s = 1, tx = 0, ty = 0, fitS = 1, iw = 0, ih = 0, back = null;
  const src = () => (typeof img !== 'undefined' && img) ? img : null;   // zdjęcie wczytane w kroku „Zdjęcie i zlecenie”

  function apply() {
    const vw = view.clientWidth, vh = view.clientHeight, w = iw * s, h = ih * s;
    // obraz mniejszy niż okno – na środku; większy – nie odjeżdża poza krawędź
    tx = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, tx));
    ty = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, ty));
    wrap.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    $('lpVal').textContent = Math.round(s * 100) + '%';
    $('lpOut').disabled = s <= fitS + 1e-9;
    $('lpIn').disabled = s >= MAX - 1e-9;
    pic.style.imageRendering = s >= 2 ? 'pixelated' : 'auto';
  }
  function zoomAt(ns, cx, cy) {
    ns = Math.min(MAX, Math.max(fitS, ns));
    tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns; apply();
  }
  const center = () => [view.clientWidth / 2, view.clientHeight / 2];
  function fitAll() { fitS = Math.min(1, view.clientWidth / iw, view.clientHeight / ih); s = fitS; tx = ty = 0; apply(); }

  // Kadr i łączenia w pikselach zdjęcia – z tych samych funkcji co podgląd i generowanie.
  function drawFrame() {
    frame.hidden = true; frame.innerHTML = '';
    try {
      const p = params();
      if (validate(p).length) return;
      const L = layout(p), F = fit(L, iw, ih);
      const x = F.cx / F.s, y = F.cy / F.s, w = L.panoW / F.s, h = L.imgH / F.s;
      Object.assign(frame.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', borderWidth: Math.max(2, 3 / fitS) + 'px' });
      for (let i = 1; i < L.xs.length; i++) {
        const sx = (L.xs[i] + L.ov / 2) / F.s;
        const d = Math.max(4, 12 / fitS);   // kreska biało-grafitowa, widoczna na jasnym i ciemnym zdjęciu
        frame.insertAdjacentHTML('beforeend', `<div class="lp-seam" style="left:${sx}px;width:${Math.max(2, 3 / fitS)}px;background:repeating-linear-gradient(to bottom,#fff 0 ${d}px,#222A35 ${d}px ${2 * d}px)"></div>`);
      }
      frame.hidden = false;
      return true;
    } catch { return false; }
  }

  function openLupa() {
    const im = src(); if (!im) return;
    iw = im.naturalWidth; ih = im.naturalHeight;
    pic.src = im.src; pic.width = iw; pic.height = ih;
    back = document.activeElement;
    box.hidden = false; document.body.style.overflow = 'hidden';
    const f = $('file').files[0];
    $('lpInfo').textContent = `${f ? f.name + ' · ' : ''}${iw.toLocaleString('pl-PL')} × ${ih.toLocaleString('pl-PL')} px`;
    const framed = drawFrame();
    if (!framed) $('lpInfo').textContent += ' · kadr pojawi się po poprawieniu ustawień';
    fitAll();
    $('lpClose').focus();
  }
  function closeLupa() {
    box.hidden = true; document.body.style.overflow = ''; pic.removeAttribute('src');
    if (back && back.focus) back.focus();
  }

  btn.addEventListener('click', openLupa);
  $('lpClose').addEventListener('click', closeLupa);
  $('lpFit').addEventListener('click', fitAll);
  $('lp100').addEventListener('click', () => zoomAt(1, ...center()));
  $('lpIn').addEventListener('click', () => zoomAt(s * 1.5, ...center()));
  $('lpOut').addEventListener('click', () => zoomAt(s / 1.5, ...center()));
  view.addEventListener('wheel', e => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    zoomAt(s * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  view.addEventListener('dblclick', e => {
    const r = view.getBoundingClientRect();
    if (s > fitS + 1e-9) fitAll(); else zoomAt(1, e.clientX - r.left, e.clientY - r.top);
  });
  let drag = null;
  view.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, tx, ty }; view.setPointerCapture(e.pointerId); view.classList.add('drag'); });
  view.addEventListener('pointermove', e => { if (!drag) return; tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; apply(); });
  ['pointerup', 'pointercancel'].forEach(ev => view.addEventListener(ev, () => { drag = null; view.classList.remove('drag'); }));
  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') closeLupa();
    else if (e.key === '+' || e.key === '=') zoomAt(s * 1.5, ...center());
    else if (e.key === '-') zoomAt(s / 1.5, ...center());
    else if (e.key === 'Tab') {   // fokus zostaje w oknie lupy
      const f = [...box.querySelectorAll('button:not(:disabled)')];
      const i = f.indexOf(document.activeElement);
      e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  window.addEventListener('resize', () => { if (!box.hidden) { const was = s <= fitS + 1e-9; fitS = Math.min(1, view.clientWidth / iw, view.clientHeight / ih); if (was) s = fitS; apply(); } });

  // Przycisk aktywny tylko z wczytanym zdjęciem (główny skrypt odświeża tabelę po każdej zmianie).
  const sync = () => { btn.disabled = !src(); };
  new MutationObserver(sync).observe($('tbl'), { childList: true });
  // Nowe zdjęcie (też podmiana po powiększeniu AI) przy otwartej lupie: zamykamy – pokazywałaby stare zdjęcie i kadr.
  $('file').addEventListener('change', () => { if (!box.hidden) closeLupa(); setTimeout(sync, 300); });
  window.addEventListener('load', sync);
  sync();
  window.Lupa = { open: openLupa, close: closeLupa };
})();

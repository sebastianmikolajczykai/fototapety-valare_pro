// Próbka 40×60 cm – wycinek grafiki w skali 1:1, w tej samej rozdzielczości co bryty.
// Cennik Valare 2024 (str. 5, docs/kontekst-folderu.md): „Próbka 40×60 cm (zwykle wycinek 1:1): 89,00 zł”.
// Osobny plik, haki w bryty.html: <div id="probkaBox"></div>, Probka.draw(ctx, view, p) po górnym podglądzie,
// Probka.init() obok Sciana.init().
// Korzysta z funkcji głównego skryptu: params, validate, layout, fit, cmToPx, pxCeil, withDpi, canvasPoint, changed, img.
// DO WALIDACJI (drukarnia): format pliku próbki – przyjęty jak bryty (JPG RGB, DPI z kroku 7);
//   pasek thru cut – jak w brytach (wg pola „Pasek thru cut”, 0,5 cm góra i dół w obrębie 60 cm).
'use strict';
window.Probka = (() => {
  const SHORT_CM = 40, LONG_CM = 60;
  const PRICE_ZL = 89;        // cennik Valare 2024 – aktualność DO WALIDACJI (czeka na cennik 2026)
  const pos = { fx: 0.5, fy: 0.5 };   // położenie próbki w obrębie ściany, 0..1 (0,5 = środek)
  let show = false, vertical = true, url = null, urlKey = '', drag = null, rect = null;
  const $ = id => document.getElementById(id);
  // Region aria-live: zapis tylko przy zmianie treści (czytnik ekranu nie czyta komunikatu przy każdym przerysowaniu).
  const say = h => { const e = $('probkaMsg'); if (e.__h !== h) { e.__h = h; e.innerHTML = h; } };
  const fmt = x => x.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

  // Prostokąt próbki w pikselach docelowych całości (jak bryty): x, y = lewy górny róg pola zdjęcia próbki
  // w układzie wysokości brytu (z paskami), w × h = cały plik próbki, ih = wysokość pola zdjęcia.
  function geom(p, L) {
    const wcm = vertical ? SHORT_CM : LONG_CM, hcm = vertical ? LONG_CM : SHORT_CM;
    const w = pxCeil(wcm, p.dpi), h = pxCeil(hcm, p.dpi);
    const band = L.band, ih = h - 2 * band;
    // Próbkę wybiera się ze ściany (bez naddatków), w obrębie pola zdjęcia.
    const x0 = Math.round(cmToPx(p.mL, p.dpi)), x1 = L.panoW - Math.round(cmToPx(p.mR, p.dpi));
    const y0 = Math.max(L.band, Math.round(cmToPx(p.mT, p.dpi))), y1 = Math.min(L.bH - L.band, L.bH - Math.round(cmToPx(p.mB, p.dpi)));
    const fitsW = x1 - x0 >= w, fitsH = y1 - y0 >= ih;
    const x = Math.round(fitsW ? x0 + pos.fx * (x1 - x0 - w) : (x0 + x1 - w) / 2);
    const y = Math.round(fitsH ? y0 + pos.fy * (y1 - y0 - ih) : (y0 + y1 - ih) / 2);
    return { wcm, hcm, w, h, band, ih, x, y, x0, x1, y0, y1, fitsW, fitsH };
  }

  const key = p => JSON.stringify([p, img && img.src, crop, pos, vertical]);

  function build() {
    const box = $('probkaBox');
    box.innerHTML = '<div class="step-head"><span class="num">9</span><h2>Próbka 40×60 cm</h2></div>' +
      `<div class="hint">Wycinek grafiki w skali 1:1, w tej samej rozdzielczości co bryty. Cena wg cennika Valare 2024: <b>${PRICE_ZL} zł</b>.</div>` +
      '<div class="radios seg" role="radiogroup" aria-label="Układ próbki" style="margin-top:10px">' +
      '<label class="radio"><input type="radio" name="probkaOr" value="v" checked> Pionowo 40×60</label>' +
      '<label class="radio"><input type="radio" name="probkaOr" value="h"> Poziomo 60×40</label></div>' +
      '<label class="check"><input id="probkaShow" type="checkbox"> Pokaż próbkę na podglądzie i ustaw ją przeciągając</label>' +
      '<button id="probkaGo" type="button" disabled style="margin-top:10px;width:100%">Generuj próbkę</button>' +
      '<div id="probkaMsg" class="msg" role="status" aria-live="polite"></div><div id="probkaDl" class="dl"></div>';
  }

  let frame = 0, working = false;
  function clearLink() {
    if (url) URL.revokeObjectURL(url);
    url = null; urlKey = '';
    $('probkaDl').innerHTML = '';
  }

  function init() {
    if (!$('probkaBox')) return;
    build();
    $('probkaBox').addEventListener('change', e => {
      if (e.target.name === 'probkaOr') vertical = e.target.value === 'v';
      if (e.target.id === 'probkaShow') show = e.target.checked;
      window.render();   // (probka.js ma własne render(p) – tu główny podgląd) tylko nakładka próbki – wygenerowane bryty zostają (changed() kasował linki do plików)
    });
    $('probkaGo').addEventListener('click', generate);
    // Przeciąganie próbki ma pierwszeństwo przed przeciąganiem kadru, ale tylko w obrębie prostokąta próbki.
    const cv = $('preview');
    cv.addEventListener('pointerdown', e => {
      if (!show || !rect || !img) return;
      const pt = canvasPoint(e);
      if (pt.x < rect.x || pt.x > rect.x + rect.w || pt.y < rect.y || pt.y > rect.y + rect.h) return;
      e.stopImmediatePropagation();
      drag = { pt, fx: pos.fx, fy: pos.fy, r: rect };
      cv.setPointerCapture(e.pointerId);
    }, true);
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      e.stopImmediatePropagation();
      const pt = canvasPoint(e), r = drag.r;
      if (r.freeW > 0) pos.fx = Math.min(1, Math.max(0, drag.fx + (pt.x - drag.pt.x) / r.freeW));
      if (r.freeH > 0) pos.fy = Math.min(1, Math.max(0, drag.fy + (pt.y - drag.pt.y) / r.freeH));
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; window.render(); });   // jedno przerysowanie na klatkę
    }, true);
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { drag = null; }, true));
  }

  // Wywoływane przy każdym odświeżeniu podglądu (po Sciana.draw).
  function draw(ctx, view, p) {
    if (!$('probkaBox')) return;
    const ok = !!img && !!view;
    $('probkaGo').disabled = !ok || working;   // w trakcie tworzenia próbki przycisk zostaje wyłączony (bez podwójnego kliku)
    if (url && urlKey !== key(p)) clearLink();
    rect = null;
    if (!ok) { say(''); return; }
    const G = geom(p, view.L), sc = view.sc;
    const info = `Plik: ${G.w} × ${G.h} px, ${p.dpi} DPI (${G.wcm} × ${G.hcm} cm).`;
    if (!url) say(info + (!G.fitsW || !G.fitsH
      ? ` <span class="warn">Ściana jest ${!G.fitsW ? 'węższa' : 'niższa'} niż próbka – próbka obejmie też naddatek lub puste pole.</span>` : ''));
    if (!show) return;
    rect = { x: view.ox + G.x * sc, y: view.oy + (G.y - G.band) * sc, w: G.w * sc, h: G.h * sc,
      freeW: (G.x1 - G.x0 - G.w) * sc, freeH: (G.y1 - G.y0 - G.ih) * sc };
    ctx.save();
    ctx.fillStyle = 'rgba(34,42,53,.18)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.lineWidth = 3; ctx.strokeStyle = '#25c09e'; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.strokeStyle = '#222a35'; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
    const t = `PRÓBKA ${G.wcm}×${G.hcm}`;
    ctx.font = '600 12px Urbanist, "Segoe UI", sans-serif'; ctx.textAlign = 'left';
    const tw = ctx.measureText(t).width + 10;
    ctx.fillStyle = '#25c09e'; ctx.fillRect(rect.x, rect.y - 18, tw, 18);
    ctx.fillStyle = '#222a35'; ctx.fillText(t, rect.x + 5, rect.y - 5);
    ctx.restore();
  }

  // Plik próbki: wycinek z tej samej skali co bryty (piksel próbki = piksel brytu), paski thru cut jak w brytach.
  async function render(p) {
    const L = layout(p), G = geom(p, L), F = fit(L, img.naturalWidth, img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = G.w; cv.height = G.h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, G.w, G.h);
    ctx.drawImage(img, (G.x + F.cx) / F.s, (G.y - L.band + F.cy) / F.s, G.w / F.s, G.ih / F.s, 0, G.band, G.w, G.ih);
    if (G.band) {
      ctx.fillStyle = THRU_RGB;
      ctx.fillRect(0, 0, G.w, G.band); ctx.fillRect(0, G.h - G.band, G.w, G.band);
    }
    const raw = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('Przeglądarka nie zapisała pliku.')), 'image/jpeg', JPEG_QUALITY));
    cv.width = cv.height = 0;
    return { blob: await withDpi(raw, p.dpi), G, L };
  }

  async function generate() {
    const p = params();
    if (!img || validate(p).length) { return say('<span class="err">Najpierw popraw ustawienia (komunikat nad przyciskiem „Generuj bryty”).</span>'); }
    if (working) return;
    working = true;
    $('probkaGo').disabled = true; clearLink();
    try {
      const { blob, G, L } = await render(p);
      const name = `probka_${p.order}_${G.wcm}x${G.hcm}.jpg`;
      url = URL.createObjectURL(blob); urlKey = key(p);
      // położenie od lewego górnego rogu ściany (bez naddatku), w cm
      const cm = px => Math.round(px / p.dpi * 25.4) / 10 + 0;
      const left = cm(G.x - cmToPx(p.mL, p.dpi)), top = cm(G.y - cmToPx(p.mT, p.dpi));
      $('probkaDl').innerHTML = `<a href="${url}" download="${name}">${name} (${(blob.size / 1e6).toFixed(1)} MB)</a>`;
      say(`<span class="ok">Gotowe: próbka ${G.wcm} × ${G.hcm} cm, ${G.w} × ${G.h} px, ${p.dpi} DPI, ` +
        `grafika od lewej ${fmt(left)} cm, od góry ${fmt(top)} cm ściany. Cena wg cennika: ${PRICE_ZL} zł.</span>`);
    } catch (e) {
      say(`<span class="err">Błąd: ${String(e.message).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>`);
    } finally {
      working = false;
      $('probkaGo').disabled = false;
    }
  }

  return { init, draw, geom, render, pos, PRICE_ZL };
})();

// Wizualizacja we wnętrzu (sekcja 10) – podgląd kadru fototapety na ścianie.
// Dwa tryby, jak „Zobacz we wnętrzu” w konfiguratorze FeltDecor (TileFlex-MVP: Przykładowy pokój / Moje wnętrze):
//   1. Przykładowy pokój: typ wnętrza z listy (9 typów), realistyczne zdjęcie robi tylko AI (ai-wnetrze.js,
//      klucz OpenAI tylko na serwerze). Rysowany podgląd pokoju usunięty (Sebastian 2026-10-26: wyglądał
//      nieprzekonująco); w kodzie został tylko niewidoczny rysunek geometrii pokoju (szara ściana w wymiarach
//      z kroku 1) jako referencja skali dla AI.
//   2. Moje wnętrze: zdjęcie wnętrza od klienta (zmniejszane do 1600 px jak w FeltDecor), klient klika 4 narożniki
//      obszaru fototapety po kolei (lewy górny, prawy górny, prawy dolny, lewy dolny), może je potem przeciągać.
//      Grafika NIE jest nakładana lokalnie (Sebastian 2026-10-27: ręczne nałożenie zwykle wygląda źle) – na zdjęciu
//      tylko punkty i obrys; fototapetę nakłada AI po kliknięciu „Stwórz wizualizację AI”. Sprawdzenie skali
//      odcinkiem odniesienia – przeniesione z FeltDecor interior/interior-scale.js (assessScale, tolerancja ±10%).
//      Zdjęcie idzie do OpenAI tylko po kliknięciu przycisku.
// Osobny plik, haki w bryty.html: <div id="wizBox" class="step"></div> pod podsumowaniem i <script src="wizualizacja.js">
// na końcu strony. Odświeża się sam, gdy główny skrypt przelicza podgląd (obserwuje #calc).
// Korzysta z funkcji głównego skryptu: params, validate, layout, fit, cmToPx, img, crop.
// Wizualizacja nie zmienia żadnych plików produkcyjnych.
'use strict';
window.Wizualizacja = (() => {
  const $ = id => document.getElementById(id);
  const CW = 1200;                        // szerokość sceny w px (wysokość zależy od proporcji ściany)
  const EYE_CM = 130;                     // wysokość aparatu – typowe zdjęcie wnętrza
  const TEX_MAX = 1800;                   // maks. szerokość kadru w px użyta w wizualizacji
  const PHOTO_MAX = 1600;                 // zdjęcie klienta zmniejszane do 1600 px (jak FeltDecor prepareMyInteriorPhoto)
  // Typy wnętrz jak w FeltDecor (roomTypeForPrompt) + jadalnia; opisy dla AI są w ai-wnetrze.js.
  const ROOMS = {
    salon: 'Salon', sypialnia: 'Sypialnia', jadalnia: 'Jadalnia', 'gabinet-domowy': 'Gabinet domowy',
    'pokoj-dzieciecy': 'Pokój dziecięcy', 'pokoj-nastolatka': 'Pokój nastolatka', biuro: 'Biuro',
    'sala-konferencyjna': 'Sala konferencyjna', recepcja: 'Recepcja',
  };
  const CORNERS = ['lewy górny', 'prawy górny', 'prawy dolny', 'lewy dolny'];
  let mode = 'pokoj', room = 'salon';
  let photo = null, photoName = '', pts = [], dragIdx = -1;
  let ref = [], refPicking = false, refDrag = -1;
  let timer = 0, lastMsg = '';

  const f0 = x => Math.round(x).toLocaleString('pl-PL');

  // ---------- Kadr ściany (bez naddatków) jako obraz ----------
  function current() {
    if (typeof params !== 'function') return null;
    const p = params();
    if (validate(p).length) return { p, err: true };
    return { p, L: layout(p) };
  }

  function wallTexture(p, L) {
    if (!img) return null;
    const band = L.band;
    const X0 = Math.round(cmToPx(p.mL, p.dpi)), X1 = L.panoW - Math.round(cmToPx(p.mR, p.dpi));
    const Y0 = Math.max(band, Math.round(cmToPx(p.mT, p.dpi))), Y1 = Math.min(L.bH - band, L.bH - Math.round(cmToPx(p.mB, p.dpi)));
    if (!(X1 > X0 && Y1 > Y0)) return null;
    const F = fit(L, img.naturalWidth, img.naturalHeight);
    const k = Math.min(1, TEX_MAX / (X1 - X0), TEX_MAX / (Y1 - Y0));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round((X1 - X0) * k)); cv.height = Math.max(1, Math.round((Y1 - Y0) * k));
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (X0 + F.cx) / F.s, (Y0 - band + F.cy) / F.s, (X1 - X0) / F.s, (Y1 - Y0) / F.s, 0, 0, cv.width, cv.height);
    return cv;
  }

  // ---------- Przykładowy pokój: rysunek geometrii dla AI (perspektywa jak na zdjęciu) ----------
  // Ściana w płaszczyźnie z = 0, aparat na osi ściany, na wysokości E, w odległości D (cm).
  // X: cm od środka ściany, Y: cm od podłogi, z: cm od ściany w stronę aparatu.
  function sceneGeo(p) {
    const W = p.wallW, H = p.wallH;
    const maxCH = Math.round(CW * 0.92);
    const s = Math.min(CW * 0.8 / W, maxCH * 0.7 / H);           // px na cm w płaszczyźnie ściany
    const wh = H * s, ww = W * s;
    const CH = Math.round(Math.min(maxCH, Math.max(CW * 0.56, wh / 0.7)));
    const D = Math.max(420, W * 0.9, H * 1.5);                    // odległość aparatu od ściany
    const E = Math.min(EYE_CM, H * 0.6);
    const f = s * D;
    const cx = CW / 2, yTop = Math.max(CH * 0.06, (CH - wh) * 0.24);
    const yh = yTop + (H - E) * s;                                // linia horyzontu (wysokość aparatu)
    const P = (X, Y, z) => { const k = f / Math.max(1, D - z); return { x: cx + X * k, y: yh - (Y - E) * k }; };
    const sc = z => f / Math.max(1, D - z);
    return { W, H, s, E, D, f, CH, cx, yh, P, sc, x0: cx - ww / 2, x1: cx + ww / 2, y0: yTop, y1: yTop + wh, w: ww, h: wh };
  }

  // Punkt na brzegu płótna na półprostej z punktu zbiegu przez punkt (x, y).
  function toEdge(vp, x, y, CH) {
    const dx = x - vp.x, dy = y - vp.y;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (CW - vp.x) / dx); if (dx < 0) t = Math.min(t, -vp.x / dx);
    if (dy > 0) t = Math.min(t, (CH - vp.y) / dy); if (dy < 0) t = Math.min(t, -vp.y / dy);
    return { x: vp.x + dx * t, y: vp.y + dy * t };
  }
  function path(ctx, list) { ctx.beginPath(); list.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); }
  function poly(ctx, list, fill) { path(ctx, list); ctx.fillStyle = fill; ctx.fill(); }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(Math.max(0, Math.min(255, v + (f > 0 ? (255 - v) : v) * f))));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  // Rysunek geometrii pokoju dla AI: szara ściana w proporcjach, ściany boczne, sufit, podłoga. Nie jest pokazywany
  // klientowi – AI dostaje go tylko jako referencję skali i perspektywy. Bez listew: fototapeta ma sięgać podłogi.
  function drawRoom(ctx, p) {
    const G = sceneGeo(p), CH = G.CH, SIDE = '#e7e4df', CEIL = '#f6f5f2', FLOOR = '#b08c68';
    const { x0, x1, y0, y1, w, h } = G;
    const vp = { x: G.cx, y: G.yh };
    const TL = { x: x0, y: y0 }, TR = { x: x1, y: y0 }, BR = { x: x1, y: y1 }, BL = { x: x0, y: y1 };
    const eTL = toEdge(vp, x0, y0, CH), eTR = toEdge(vp, x1, y0, CH), eBR = toEdge(vp, x1, y1, CH), eBL = toEdge(vp, x0, y1, CH);
    const sg = ctx.createLinearGradient(0, 0, CW, 0);
    sg.addColorStop(0, shade(SIDE, -0.14)); sg.addColorStop(0.5, SIDE); sg.addColorStop(1, shade(SIDE, -0.2));
    ctx.fillStyle = sg; ctx.fillRect(0, 0, CW, CH);
    const ceil = [eTL, TL, TR, eTR]; if (eTR.y > 0.5) ceil.splice(4, 0, { x: CW, y: 0 }); if (eTL.y > 0.5) ceil.push({ x: 0, y: 0 });
    poly(ctx, ceil, CEIL);
    const floor = [BL, BR, eBR]; if (eBR.y < CH - 0.5) floor.push({ x: CW, y: CH }); if (eBL.y < CH - 0.5) floor.push({ x: 0, y: CH }); floor.push(eBL);
    const fg = ctx.createLinearGradient(0, y1, 0, CH);
    fg.addColorStop(0, shade(FLOOR, -0.16)); fg.addColorStop(1, shade(FLOOR, 0.06));
    poly(ctx, floor, fg);
    // deski podłogi (co 18 cm) zbiegające się w punkcie zbiegu – czytelna perspektywa
    ctx.save(); path(ctx, floor); ctx.clip();
    ctx.strokeStyle = 'rgba(60,40,20,.16)'; ctx.lineWidth = 1;
    for (let X = -G.W / 2 - 1800; X <= G.W / 2 + 1800; X += 18) {
      const a = G.P(X, 0, 0), e = toEdge(vp, a.x, a.y, CH);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#d9dcdf'; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(TL.x, TL.y); ctx.lineTo(BL.x, BL.y); ctx.moveTo(TR.x, TR.y); ctx.lineTo(BR.x, BR.y); ctx.stroke();
    return G;
  }

  // ---------- Moje wnętrze: homografia ----------
  // Odwzorowanie kwadratu jednostkowego (u, v) na czworokąt q0..q3 (LG, PG, PD, LD).
  function homography(q) {
    const [p0, p1, p2, p3] = q;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    let g = 0, h = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
      const den = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(den) < 1e-12) return null;
      g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
    }
    const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
    const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
    if (Math.abs(a * e - b * d) < 1e-12) return null;
    const map = (u, v) => { const z = g * u + h * v + 1; return { x: (a * u + b * v + c) / z, y: (d * u + e * v + f) / z }; };
    map.m = [a, b, c, d, e, f, g, h, 1];
    return map;
  }
  function invert(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-18) return null;
    const m = [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
    return (x, y) => { const w = m[6] * x + m[7] * y + m[8]; return Math.abs(w) < 1e-12 ? null : { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w }; };
  }

  // Sprawdzenie skali – przeniesione z FeltDecor interior/interior-scale.js (assessScale), jednostki: cm.
  // Zaznaczony obszar z definicji ma wymiar ściany. Odcinek odniesienia (np. drzwi 200 cm) mówi, czy tak jest naprawdę.
  const SCALE_TOLERANCE = 0.1, ASPECT_TOLERANCE = 0.2, PARALLEL_DEGREES = 3;
  function assessScale({ points, photoWidth: pw, photoHeight: ph, wallW: W, wallH: H, reference }) {
    if (!points || points.length !== 4 || !(W > 0) || !(H > 0)) return { ok: false };
    const px = points.map(q => ({ x: q.x * pw, y: q.y * ph }));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const angle = (a, b, c, d) => { const diff = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(d.y - c.y, d.x - c.x)) % Math.PI; return Math.min(diff, Math.PI - diff) * 180 / Math.PI; };
    const apparentAspect = ((dist(px[0], px[1]) + dist(px[3], px[2])) / 2) / Math.max(1e-9, (dist(px[0], px[3]) + dist(px[1], px[2])) / 2);
    const frontal = angle(px[0], px[1], px[3], px[2]) < PARALLEL_DEGREES && angle(px[0], px[3], px[1], px[2]) < PARALLEL_DEGREES;
    const aspectDeviation = apparentAspect / (W / H) - 1;
    const r = { ok: true, frontal, aspectDeviation, aspectWarning: frontal && Math.abs(aspectDeviation) > ASPECT_TOLERANCE, reference: null };
    if (reference && reference.a && reference.b && reference.length > 0) {
      const map = homography(px), inv = map && invert(map.m);
      const a = inv && inv(reference.a.x * pw, reference.a.y * ph), b = inv && inv(reference.b.x * pw, reference.b.y * ph);
      if (a && b) {
        const len = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
        if (len > 1e-6) {
          const scale = reference.length / len;
          r.reference = { lengthInWall: len, scale, estW: W * scale, estH: H * scale,
            verdict: Math.abs(scale - 1) <= SCALE_TOLERANCE ? 'ok' : scale > 1 ? 'larger' : 'smaller' };
        }
      }
    }
    return r;
  }

  // Podgląd zdjęcia: maks. 1200 × 900 px na ekranie (zdjęcie w pamięci ma do 1600 px).
  function photoSize() {
    const k = Math.min(1, CW / photo.width, 900 / photo.height);
    return { W: Math.round(photo.width * k), H: Math.round(photo.height * k) };
  }

  function dot(ctx, q, label, fill) {
    ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#222a35'; ctx.stroke();
    if (label) { ctx.fillStyle = '#222a35'; ctx.font = '600 12px Urbanist, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, q.x, q.y + 0.5); }
  }

  // Na zdjęciu tylko punkty i obrys – grafikę nakłada AI dopiero po kliknięciu przycisku (Sebastian 2026-10-27).
  function drawPhoto(ctx, cv, handles) {
    const { W, H } = photoSize();
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.drawImage(photo, 0, 0, W, H);   // bez dodatkowego płótna przy każdym przerysowaniu
    const quad = pts.map(q => ({ x: q.x * W, y: q.y * H }));
    if (!handles) return;
    // obrys jak w FeltDecor: żółta przerywana linia, odcinek odniesienia zielony
    ctx.save();
    if (quad.length) {
      ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeStyle = '#ffd400';
      ctx.beginPath(); quad.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      if (quad.length === 4) ctx.closePath();
      ctx.stroke();
      if (quad.length === 4) { path(ctx, quad); ctx.fillStyle = 'rgba(0,140,255,.28)'; ctx.fill(); }
    }
    if (ref.length) {
      const r = ref.map(q => ({ x: q.x * W, y: q.y * H }));
      if (r.length === 2) { ctx.strokeStyle = '#1fd65f'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(r[0].x, r[0].y); ctx.lineTo(r[1].x, r[1].y); ctx.stroke(); }
      ctx.setLineDash([]);
      r.forEach(q => dot(ctx, q, '', '#1fd65f'));
    }
    ctx.setLineDash([]);
    quad.forEach((q, i) => dot(ctx, q, String(i + 1), '#ffd400'));
    ctx.restore();
  }

  // ---------- Rysowanie i interfejs ----------
  function scaleInfo(st) {
    if (!(st && !st.err && photo && pts.length === 4)) return null;
    const { W, H } = photoSize(), len = Number($('wizRefLen') && $('wizRefLen').value);
    return assessScale({ points: pts, photoWidth: W, photoHeight: H, wallW: st.p.wallW, wallH: st.p.wallH,
      reference: ref.length === 2 && len >= 10 && len <= 2000 ? { a: ref[0], b: ref[1], length: len } : null });
  }

  function draw(cv, handles) {
    const ctx = cv.getContext('2d');
    const st = current();
    if (mode === 'wnetrze') {
      if (!photo) {
        if (cv.width !== CW || cv.height !== Math.round(CW * 0.45)) { cv.width = CW; cv.height = Math.round(CW * 0.45); }
        ctx.fillStyle = '#f4fbf9'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = '#5d6470'; ctx.font = '22px Urbanist, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Wgraj zdjęcie swojego wnętrza', cv.width / 2, cv.height / 2);
        return 'Zrób zdjęcie ściany, najlepiej na wprost, z całą ścianą w kadrze. Potem zaznacz jej 4 narożniki.';
      }
      drawPhoto(ctx, cv, handles);
      if (pts.length < 4) return `Kliknij ${pts.length + 1}. punkt: ${CORNERS[pts.length]} narożnik obszaru fototapety (zwykle całej ściany). Kolejność: lewy górny, prawy górny, prawy dolny, lewy dolny.`;
      if (refPicking) return `Kliknij ${ref.length + 1}. koniec odcinka odniesienia na tej samej ścianie.`;
      return st && !st.err && img ? 'Narożniki zaznaczone (punkty możesz przeciągać). Kliknij „Stwórz wizualizację AI” – AI nałoży fototapetę na zaznaczoną ścianę.'
        : 'Narożniki zaznaczone. Wgraj grafikę i ustaw wymiary ściany, potem kliknij „Stwórz wizualizację AI”.';
    }
    if (!st || st.err) return 'Popraw ustawienia po lewej, żeby zrobić wizualizację.';
    return `Wybierz typ wnętrza i kliknij „Stwórz wizualizację AI”. AI zrobi realistyczne zdjęcie takiego wnętrza z fototapetą na całej ścianie ${f0(st.p.wallW)} × ${f0(st.p.wallH)} cm.` +
      (img ? '' : ' Najpierw wgraj grafikę.');
  }

  function syncScale(st) {
    const box = $('wizScale'); if (!box) return;
    box.hidden = !(mode === 'wnetrze' && photo && pts.length === 4);
    if (box.hidden) return;
    const ok = st && !st.err;
    $('wizScaleIntro').textContent = ok ? `Zaznaczony obszar będzie miał w rzeczywistości wymiar ściany: ${f0(st.p.wallW)} × ${f0(st.p.wallH)} cm.` : '';
    $('wizRefPick').textContent = refPicking ? 'Kliknij 2 końce odcinka na zdjęciu…' : ref.length === 2 ? 'Zaznacz odcinek ponownie' : 'Zaznacz odcinek odniesienia';
    const a = scaleInfo(st), out = $('wizScaleOut');
    let html = '';
    if (a && a.reference) {
      const R = a.reference, est = `${f0(R.estW)} × ${f0(R.estH)} cm`, want = `${f0(st.p.wallW)} × ${f0(st.p.wallH)} cm`, fx = R.scale.toFixed(2).replace('.', ',');
      html = R.verdict === 'ok' ? `<div class="ok">✓ Skala się zgadza: według odcinka odniesienia zaznaczony obszar ma około ${est}.</div>`
        : R.verdict === 'larger' ? `<div class="warn">Zaznaczony obszar jest większy niż ściana: około ${est} zamiast ${want} (${fx}×). Zmniejsz zaznaczenie albo ustaw wymiar ściany na około ${est}.</div>`
        : `<div class="warn">Zaznaczony obszar jest mniejszy niż ściana: około ${est} zamiast ${want} (${fx}×). Powiększ zaznaczenie albo ustaw wymiar ściany na około ${est}.</div>`;
    } else if (ref.length === 2) html = '<div class="hint">Wpisz długość odcinka w cm (10–2000).</div>';
    if (a && a.aspectWarning) html += '<div class="warn">Proporcje zaznaczenia odbiegają od proporcji ściany. Jeśli ściana jest na zdjęciu na wprost, popraw narożniki.</div>';
    if (out.innerHTML !== html) out.innerHTML = html;
  }

  let dragFrame = 0;
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const cv = $('wizCanvas'); if (!cv) return;
      const msg = draw(cv, true);
      if (msg !== lastMsg) { $('wizMsg').textContent = msg; lastMsg = msg; }
      const own = mode === 'wnetrze';
      $('wizRoomRow').hidden = own;
      $('wizPhotoRow').hidden = !own;
      $('wizWrap').hidden = !own;
      $('wizUndo').disabled = !photo || (!pts.length && !ref.length);
      $('wizRedo').disabled = !photo || !pts.length;
      cv.style.cursor = own && photo && (pts.length < 4 || refPicking) ? 'crosshair' : '';
      syncScale(current());
      syncAi();
    }, 60);
  }

  function build() {
    const box = $('wizBox');
    box.innerHTML = '<h2>Wizualizacja <b>we wnętrzu</b></h2>' +
      '<div class="hint">Kadr na ścianie (bez naddatku). Tylko dla klienta – nie zmienia plików do produkcji. Do OpenAI idzie obraz tylko po kliknięciu „Stwórz wizualizację AI”.</div>' +
      '<div class="radios seg wiz-seg" role="radiogroup" aria-label="Wnętrze">' +
      '<label class="radio"><input type="radio" name="wizMode" value="pokoj" checked> Przykładowy pokój</label>' +
      '<label class="radio"><input type="radio" name="wizMode" value="wnetrze"> Moje wnętrze</label></div>' +
      '<div id="wizRoomRow" class="wiz-row"><label for="wizRoom">Typ wnętrza</label><select id="wizRoom">' +
      Object.entries(ROOMS).map(([id, n]) => `<option value="${id}"${id === room ? ' selected' : ''}>${n}</option>`).join('') + '</select></div>' +
      '<div id="wizPhotoRow" class="wiz-row" hidden><label class="wiz-file small-btn"><input id="wizFile" type="file" accept="image/jpeg,image/png,image/webp"> Wgraj zdjęcie wnętrza</label>' +
      '<button id="wizUndo" class="small" type="button">Cofnij punkt</button><button id="wizRedo" class="small" type="button">Zaznacz ponownie</button></div>' +
      '<div id="wizWrap" class="wiz-wrap" hidden><canvas id="wizCanvas" width="' + CW + '" height="' + Math.round(CW * 0.6) + '"></canvas></div>' +
      '<div id="wizMsg" class="hint" role="status" aria-live="polite"></div>' +
      '<div id="wizScale" hidden><div class="wiz-sub">Sprawdź skalę <span>(opcjonalnie)</span></div><div id="wizScaleIntro" class="hint"></div>' +
      '<div class="hint">Zaznacz na tej samej ścianie coś o znanym wymiarze (np. wysokość drzwi, szerokość okna) i wpisz jego długość.</div>' +
      '<div class="wiz-row"><button id="wizRefPick" class="small" type="button">Zaznacz odcinek odniesienia</button>' +
      '<label class="wiz-len">Długość odcinka <input id="wizRefLen" type="number" min="10" max="2000" step="1" inputmode="numeric"> cm</label></div>' +
      '<div id="wizScaleOut" role="status" aria-live="polite"></div></div>' +
      '<div class="wiz-ai"><button id="wizAi" type="button" disabled>Stwórz wizualizację AI</button>' +
      '<div id="wizAiInfo" class="hint"></div><div id="wizAiMsg" class="msg" role="status" aria-live="polite"></div><div id="wizAiOut"></div></div>';
    const css = document.createElement('style');
    css.textContent = '#wizBox { margin-top: 14px; border-top: 3px solid var(--v-green); }' +
      '#wizBox:empty { display: none; } #wizBox > h2 { font-weight: 300; margin-bottom: 4px; } #wizBox > h2 b { font-weight: 700; }' +
      '#wizBox .wiz-seg { grid-template-columns: 1fr 1fr; }' +
      '#wizBox .wiz-row { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; margin-top: 10px; }' +
      '#wizBox .wiz-row .check { margin-top: 0; } #wizBox .wiz-row[hidden], #wizBox .check[hidden], #wizScale[hidden], #wizBox .wiz-wrap[hidden] { display: none; }' +
      '#wizBox #wizRoomRow select { flex: 1 1 200px; max-width: 320px; }' +
      '#wizBox .wiz-file { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border: 1px solid var(--stage-line-strong, #222a35); font-size: 12px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--stage-text, #222a35); cursor: pointer; }' +
      '#wizBox .wiz-file:hover { background: var(--stage-hover, #e6f7f3); } #wizBox .wiz-file input { position: absolute; width: 1px; height: 1px; opacity: 0; }' +
      '#wizBox .wiz-wrap { margin-top: 12px; border: 1px solid var(--stage-line, #e3e5e8); background: #f4f5f6; }' +
      '#wizCanvas { display: block; width: 100%; height: auto; touch-action: none; }' +
      '#wizBox #wizMsg { margin-top: 8px; }' +
      '#wizScale { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--stage-line, #e3e5e8); }' +
      '#wizScale .wiz-sub { font-weight: 600; } #wizScale .wiz-sub span { font-weight: 400; color: #5d6470; }' +
      '#wizScale .wiz-len { display: inline-flex; align-items: center; gap: 6px; } #wizScale .wiz-len input { width: 90px; }' +
      '#wizScaleOut > div { margin-top: 8px; } #wizScaleOut .ok { color: #16806a; font-weight: 600; } #wizScaleOut .warn { color: #a05a00; }' +
      '#wizBox .wiz-ai { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--stage-line, #e3e5e8); }' +
      '#wizBox #wizAi { width: 100%; } #wizBox #wizAiInfo { margin-top: 8px; }' +
      '#wizBox #wizAiOut img { display: block; width: 100%; height: auto; margin-top: 10px; border: 1px solid var(--stage-line, #e3e5e8); }' +
      '#wizBox #wizAiOut a { display: inline-block; margin-top: 8px; color: var(--link, #16806a); font-weight: 600; }';
    document.head.appendChild(css);
  }

  function canvasPt(e) {
    const cv = $('wizCanvas'), r = cv.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  function nearest(list, q, r, max = 22) {
    let best = -1, bd = max;
    list.forEach((p, i) => { const d = Math.hypot((p.x - q.x) * r.width, (p.y - q.y) * r.height); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // Zdjęcie klienta zmniejszone do 1600 px (dłuższy bok), jak w FeltDecor.
  let photoSeq = 0;   // dwa zdjęcia wybrane szybko po sobie: wygrywa ostatnio wybrane, nie ostatnio wczytane
  function loadPhoto(f) {
    const im = new Image(), u = URL.createObjectURL(f), seq = ++photoSeq;
    im.onload = () => {
      if (seq !== photoSeq) { URL.revokeObjectURL(u); return; }
      const k = Math.min(1, PHOTO_MAX / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      photo = c; photoName = f.name; pts = []; ref = []; refPicking = false;
      refresh();
    };
    im.onerror = () => { URL.revokeObjectURL(u); if (seq !== photoSeq) return; $('wizMsg').textContent = 'Nie udało się wczytać zdjęcia (JPG, PNG albo WEBP).'; lastMsg = ''; };
    im.src = u;
  }

  // ---------- Wizualizacja AI (OpenAI przez lokalny serwer, klucz tylko na serwerze) ----------
  // Przykładowy pokój: geometria pokoju + kadr ściany, AI tworzy wnętrze wybranego typu (opisy w ai-wnetrze.js).
  // Moje wnętrze: zdjęcie, zdjęcie z zaznaczonym obszarem i maska – AI zmienia tylko zaznaczoną ścianę.
  let aiReady = false, aiBusy = false, aiUrl = null;
  const quadPath = (ctx, q, grow = 0) => {
    const cx = q.reduce((a, b) => a + b.x, 0) / 4, cy = q.reduce((a, b) => a + b.y, 0) / 4;
    ctx.beginPath();
    q.forEach((v, i) => { const dx = v.x - cx, dy = v.y - cy, l = Math.hypot(dx, dy) || 1, x = v.x + dx / l * grow, y = v.y + dy / l * grow; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  };
  // Czyste zdjęcie, zdjęcie z zaznaczonym czworokątem (jak w FeltDecor) i maska edycji
  // (PNG, ten sam wymiar co zdjęcie; przezroczysty czworokąt = obszar do zmiany – wg dokumentacji OpenAI).
  function photoInputs() {
    const { W, H } = photoSize();
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const base = mk(); base.getContext('2d').drawImage(photo, 0, 0, W, H);
    const quad = pts.map(q => ({ x: q.x * W, y: q.y * H }));
    const guide = mk(), g = guide.getContext('2d');
    g.drawImage(base, 0, 0);
    g.fillStyle = 'rgba(60,0,0,.6)'; g.fillRect(0, 0, W, H);
    g.save(); quadPath(g, quad); g.clip(); g.drawImage(base, 0, 0); g.fillStyle = 'rgba(0,255,0,.45)'; g.fillRect(0, 0, W, H); g.restore();
    g.strokeStyle = '#00ff00'; g.lineWidth = 3; quadPath(g, quad); g.stroke();
    quad.forEach((q, i) => {
      g.beginPath(); g.arc(q.x, q.y, 14, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#000'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), q.x, q.y + 1);
    });
    const mask = mk(), m = mask.getContext('2d');
    m.fillStyle = '#000'; m.fillRect(0, 0, W, H);
    m.globalCompositeOperation = 'destination-out'; quadPath(m, quad, 1); m.fill();
    return { W, H, base, quad, photo: base.toDataURL('image/jpeg', 0.9), guide: guide.toDataURL('image/jpeg', 0.9), mask: mask.toDataURL('image/png') };
  }
  // Wynik AI na zdjęciu klienta: poza czworokątem zawsze oryginalne zdjęcie (maska OpenAI może nie być ścisła).
  function keepOutside(resultImg, inp) {
    const c = document.createElement('canvas'); c.width = inp.W; c.height = inp.H;
    const x = c.getContext('2d');
    x.drawImage(inp.base, 0, 0);
    x.save(); quadPath(x, inp.quad, 2); x.clip(); x.drawImage(resultImg, 0, 0, inp.W, inp.H); x.restore();
    return new Promise(res => c.toBlob(res, 'image/png'));
  }
  const jpeg = (cv, max) => {
    const k = Math.min(1, max / Math.max(cv.width, cv.height));
    if (k === 1) return cv.toDataURL('image/jpeg', 0.9);
    const c = document.createElement('canvas'); c.width = Math.round(cv.width * k); c.height = Math.round(cv.height * k);
    c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  };

  async function checkAi() {
    let h = null;
    try { h = location.protocol.startsWith('http') ? await (await fetch('/api/health')).json() : null; } catch { h = null; }
    aiReady = !!(h && h.ai && h.ai.generate);
    $('wizAiInfo').innerHTML = aiReady
      ? `AI: ${String(h.ai.provider).replace(/</g, '&lt;')} (${String(h.ai.model).replace(/</g, '&lt;')}). Podgląd z panelu (w trybie „Moje wnętrze” razem ze zdjęciem wnętrza) i kadr ściany są wysyłane do OpenAI. Każde zdjęcie kosztuje. Wynik jest poglądowy – AI może zmienić szczegóły grafiki, do produkcji idą bryty.`
      : h ? 'Wizualizacja AI niedostępna – brak połączenia z usługą AI.'
      : 'Wizualizacja AI niedostępna – brak połączenia z serwerem.';
    syncAi();
  }
  function syncAi() {
    const b = $('wizAi'); if (!b) return;
    b.disabled = !aiReady || aiBusy || !img || (mode === 'wnetrze' && (!photo || pts.length < 4));
    b.textContent = aiBusy ? 'Generuję… (zwykle do kilku minut)' : 'Stwórz wizualizację AI';
  }

  async function generateAi() {
    const st = current();
    if (!aiReady || aiBusy || !st || st.err || !img) return;
    const tex = wallTexture(st.p, st.L);
    if (!tex) return;
    const own = mode === 'wnetrze';
    let req, inp = null;
    if (own) {
      if (!photo || pts.length < 4) return;
      inp = photoInputs();
      req = { mode: 'photo', photo: inp.photo, guide: inp.guide, mask: inp.mask, aspect: inp.W / inp.H };
    } else {
      req = { mode: 'scene', room, geometry: geometry(), aspect: CW / sceneGeo(st.p).CH };
    }
    req.mural = jpeg(tex, 1536); req.wallW = st.p.wallW; req.wallH = st.p.wallH;
    aiBusy = true; syncAi();
    const srcId = window.grafikaId, reqRoom = room;   // wynik dotyczy grafiki i typu wnętrza z chwili kliknięcia
    $('wizAiMsg').innerHTML = '';
    try {
      const r = await fetch('/api/ai/interior', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
      if (!r.ok) throw new Error((await r.text()) || `Błąd ${r.status}`);
      const j = await r.json();
      let blob = await (await fetch(j.image.dataUrl)).blob();
      if (window.grafikaId !== srcId) throw new Error('w międzyczasie zmieniono grafikę – kliknij ponownie, żeby zobaczyć nową');
      if (inp) {
        const im = new Image(); const u = URL.createObjectURL(blob); im.src = u;
        try { await im.decode(); blob = await keepOutside(im, inp); } finally { URL.revokeObjectURL(u); }
      }
      if (aiUrl) URL.revokeObjectURL(aiUrl);
      aiUrl = URL.createObjectURL(blob);
      const order = params().order || 'zlecenie';
      $('wizAiOut').innerHTML = `<img src="${aiUrl}" alt="Wizualizacja AI we wnętrzu">` +
        `<a href="${aiUrl}" download="${order}_wizualizacja_AI_${own ? 'moje-wnetrze' : reqRoom}.png">Pobierz wizualizację AI (PNG)</a>`;
    } catch (e) {
      $('wizAiMsg').innerHTML = `<div class="err">Wizualizacja AI nie powiodła się: ${String(e.message || e).replace(/</g, '&lt;')}</div>`;
    } finally { aiBusy = false; syncAi(); }
  }

  function init() {
    const box = $('wizBox');
    if (!box) return;
    build();
    const stop = e => e.stopPropagation();    // zmiany w panelu nie przeliczają reszty strony
    box.addEventListener('input', e => { stop(e); if (e.target.id === 'wizRefLen') refresh(); });
    box.addEventListener('change', e => {
      const t = e.target;
      stop(e);
      if (t.name === 'wizMode') { mode = t.value; refPicking = false; }
      else if (t.id === 'wizRoom') room = t.value;
      else if (t.id === 'wizFile') { const f = t.files && t.files[0]; if (f) loadPhoto(f); t.value = ''; return; }
      refresh();
    });
    $('wizUndo').addEventListener('click', () => {
      if (refPicking || ref.length) { ref.pop(); refPicking = ref.length === 1; }   // najpierw odcinek odniesienia
      else pts.pop();
      refresh();
    });
    $('wizRedo').addEventListener('click', () => { pts = []; ref = []; refPicking = false; refresh(); });
    $('wizRefPick').addEventListener('click', () => { ref = []; refPicking = true; refresh(); });
    $('wizAi').addEventListener('click', generateAi);
    checkAi();
    // Moje wnętrze (jak FeltDecor onMyInteriorEditorPointerDown): klik dodaje kolejny narożnik, potem punkty się przeciąga;
    // w trybie odcinka odniesienia 2 kliknięcia wyznaczają odcinek, jego końce też można przeciągać.
    const cv = $('wizCanvas');
    cv.addEventListener('pointerdown', e => {
      if (mode !== 'wnetrze' || !photo || (e.button != null && e.button !== 0)) return;
      const q = canvasPt(e), r = cv.getBoundingClientRect();
      const grab = () => { cv.setPointerCapture(e.pointerId); e.preventDefault(); };
      const ri = ref.length === 2 ? nearest(ref, q, r) : -1;
      if (ri >= 0) { refDrag = ri; return grab(); }
      if (refPicking && pts.length === 4) { e.preventDefault(); ref.push(q); if (ref.length >= 2) refPicking = false; return refresh(); }
      const i = nearest(pts, q, r);
      if (i >= 0) { dragIdx = i; return grab(); }
      if (pts.length >= 4) return;
      e.preventDefault(); pts.push(q); refresh();
    });
    cv.addEventListener('pointermove', e => {
      if (dragIdx < 0 && refDrag < 0) return;
      const q = canvasPt(e);
      if (refDrag >= 0) ref[refDrag] = q; else pts[dragIdx] = q;
      // Narożnik idzie za kursorem: rysunek co klatkę (refresh() czeka 60 ms na koniec ruchu), pełne odświeżenie po ruchu.
      if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; const c = $('wizCanvas'); if (c) draw(c, true); });
      refresh();
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { dragIdx = -1; refDrag = -1; }));
    // Główny skrypt przepisuje #calc przy każdym przeliczeniu (wymiary, kadr, bryty) – wtedy odświeżamy scenę.
    const calc = $('calc');
    if (calc) new MutationObserver(refresh).observe(calc, { childList: true, characterData: true, subtree: true });
    $('file') && $('file').addEventListener('change', () => setTimeout(refresh, 300));
    refresh();
  }

  // Rysunek geometrii pokoju wysyłany do AI (do testów: test/ai-wizualizacja/geometria-pokoju.jpg).
  function geometry() {
    const st = current(); if (!st || st.err) return null;
    const G = sceneGeo(st.p), c = document.createElement('canvas'); c.width = CW; c.height = G.CH;
    drawRoom(c.getContext('2d'), st.p);
    return c.toDataURL('image/jpeg', 0.9);
  }

  return { init, refresh, homography, assessScale, sceneGeo, geometry,
    _state: () => ({ mode, room, pts: pts.slice(), ref: ref.slice(), refPicking, hasPhoto: !!photo }) };
})();
Wizualizacja.init();

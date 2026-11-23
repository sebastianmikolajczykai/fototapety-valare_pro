// Sekcja 05 – schemat montażu dla klienta / montażysty (docs/sections/05-schemat-montazu.md).
// Osobny plik, żeby nie mieszać z wyglądem bryty.html. Haki w bryty.html:
//   <script src="montaz.js"></script>, <div id="montazBox"></div> w kroku plików, Montaz.init().
// Korzysta z funkcji głównego skryptu: params(), layout(), validate(), renderPano(), pdfText(), PL_NAMES, img.
// Treść instrukcji tylko z transkryptu (L111–126 zakład i styk, L302–305 i L421–422 naddatek,
// L412–425 drzwi i okna w całości, L972–981 narożnik, L1056–1070 schemat jak w Wallart: wymiar całości,
// numery brytów 1, 2, 3…, szerokość każdego brytu, naddatek jako jaśniejsze pole z opisem).
// PDF: A4 poziomo, wymiary w cm, logo Valare jako wektor (ścieżki z logo w nagłówku strony).
'use strict';
window.Montaz = (() => {
  const PT = 72 / 2.54;
  const PW = 29.7, PH = 21, MG = 1.2;                  // A4 poziomo, margines [cm]
  const INK = [0x22, 0x2a, 0x35], GREEN = [0x25, 0xc0, 0x9e], ORANGE = [0xf5, 0x9e, 0x0b], GRAY = [0x6b, 0x72, 0x80], LINE = [0xd5, 0xd9, 0xde];
  const PTS = v => v * 0.03528;                        // punkty -> cm (rozmiar czcionki)
  const fmt = x => (Math.round(x * 10) / 10).toLocaleString('pl-PL', { maximumFractionDigits: 1 });

  // Szerokość tekstu (cm) z tych samych szerokości znaków co /Widths w PDF (tabela AFM niżej).
  let W_R = null, W_B = null;
  function tw(s, size, bold) {
    if (!W_R) { W_R = widths(false).split(' ').map(Number); W_B = widths(true).split(' ').map(Number); }
    const tab = bold ? W_B : W_R;
    let w = 0;
    for (const ch of String(s)) {
      const k = PL.indexOf(ch);
      let code = k >= 0 ? 128 + k : ch === '–' ? 0x96 : ch.charCodeAt(0);
      if (code < 32 || code > 255) code = 63;
      w += tab[code - 32];
    }
    return w / 1000 * size;
  }
  function wrap(s, size, maxW, bold) {
    const out = []; let line = '';
    for (const word of s.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (line && tw(t, size, bold) > maxW) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  // Rysownik strony PDF: współrzędne w cm od lewego górnego rogu.
  function page() {
    let c = '';
    const f = v => (Math.round(v * 1000) / 1000).toString();
    const X = x => f(x * PT), Y = y => f((PH - y) * PT), S = v => f(v * PT);
    const rgb = col => col.map(v => f(v / 255)).join(' ');
    return {
      get content() { return c; },
      raw: s => { c += s; },
      img: (name, x, y, w, h) => { c += `q ${S(w)} 0 0 ${S(h)} ${X(x)} ${Y(y + h)} cm /${name} Do Q\n`; },
      rect: (x, y, w, h, o = {}) => {
        c += 'q ' + (o.alpha ? `/${o.alpha} gs ` : '') + (o.fill ? `${rgb(o.fill)} rg ` : '') + (o.stroke ? `${rgb(o.stroke)} RG ${S(o.lw || 0.02)} w ` : '') +
          (o.dash ? `[${o.dash.map(S).join(' ')}] 0 d ` : '') + `${X(x)} ${Y(y + h)} ${S(w)} ${S(h)} re ` + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S') + ' Q\n';
      },
      line: (x1, y1, x2, y2, col, lw, dash) => {
        c += `q ${rgb(col)} RG ${S(lw)} w ` + (dash ? `[${dash.map(S).join(' ')}] 0 d ` : '') + `${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S Q\n`;
      },
      circle: (cx, cy, r, fill, stroke, lw) => {
        const k = 0.5523 * r;
        c += `q ${rgb(fill)} rg ${rgb(stroke)} RG ${S(lw)} w ${X(cx + r)} ${Y(cy)} m ` +
          `${X(cx + r)} ${Y(cy - k)} ${X(cx + k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c ` +
          `${X(cx - k)} ${Y(cy - r)} ${X(cx - r)} ${Y(cy - k)} ${X(cx - r)} ${Y(cy)} c ` +
          `${X(cx - r)} ${Y(cy + k)} ${X(cx - k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c ` +
          `${X(cx + k)} ${Y(cy + r)} ${X(cx + r)} ${Y(cy + k)} ${X(cx + r)} ${Y(cy)} c B Q\n`;
      },
      // y = linia bazowa; align: 'l' | 'c' | 'r'; rot = obrót o 90° (tekst od dołu do góry)
      text: (s, x, y, size, o = {}) => {
        const w = tw(s, size, o.bold);
        const dx = o.align === 'c' ? -w / 2 : o.align === 'r' ? -w : 0;
        const font = o.bold ? 'F2' : 'F1';
        const str = String(s).split('–').map(pdfText).join('\\226');   // półpauza = WinAnsi 0x96 (kody 128–143 zajmują polskie litery)
        c += o.rot
          ? `BT /${font} ${S(size)} Tf ${rgb(o.col || INK)} rg 0 1 -1 0 ${X(x)} ${Y(y - dx)} Tm (${str}) Tj ET\n`
          : `BT /${font} ${S(size)} Tf ${rgb(o.col || INK)} rg ${X(x + dx)} ${Y(y)} Td (${str}) Tj ET\n`;
      },
      // Ścieżka SVG (tylko M, L, C, Z, współrzędne bezwzględne – tak jest zapisane logo Valare).
      svgPath: (d, x0, y0, vb, k, col) => {
        const t = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
        const P = (i) => `${X(x0 + (+t[i] - vb[0]) * k)} ${Y(y0 + (+t[i + 1] - vb[1]) * k)}`;
        let s = '';
        for (let i = 0; i < t.length;) {
          const op = t[i++].toUpperCase();
          if (op === 'M') { s += P(i) + ' m '; i += 2; }
          else if (op === 'L') { s += P(i) + ' l '; i += 2; }
          else if (op === 'C') { s += `${P(i)} ${P(i + 2)} ${P(i + 4)} c `; i += 6; }
          else if (op === 'Z') s += 'h ';
          else i++;
        }
        c += `q ${rgb(col)} rg ${s}f Q\n`;
      },
    };
  }

  // Logo Valare z nagłówka strony (inline SVG). Brak logo w stronie -> napis.
  function drawLogo(d, x, y, h) {
    const svg = document.querySelector('svg.valare-logo');
    if (!svg) { d.text('VALARE', x, y + h * 0.85, h, { bold: true }); return h * 4; }
    const vb = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
    const k = h / vb[3];
    for (const path of svg.querySelectorAll('path')) {
      const white = path.classList.contains('v-slash');
      d.svgPath(path.getAttribute('d'), x, y, vb, k, white ? [255, 255, 255] : INK);
    }
    return vb[2] * k;
  }

  // Dane do schematu (cm). Bryty liczone z dokładnych szerokości (bez zaokrąglenia do pikseli).
  function model(p, L) {
    const n = L.bw.widths.length, ov = p.overlap;
    const bryty = []; let a = 0;
    for (let i = 0; i < n; i++) {
      const w = L.bw.widths[i];
      bryty.push({ nr: i + 1, a, w, from: Math.max(0, a - p.mL), to: Math.min(p.wallW, a + w - p.mL) });
      a += w - ov;
    }
    const sel = document.getElementById('material');
    const opt = sel && sel.selectedOptions[0];
    const material = sel && sel.value && sel.value !== 'own' && opt ? opt.textContent.split(' – ')[0] : '';
    let wall = { corners: [], openings: [] };
    if (window.Sciana && typeof Sciana.data === 'function') { try { wall = Sciana.data(p, L) || wall; } catch { /* strona działa bez sekcji 09 */ } }
    return { n, ov, bryty, material, corners: wall.corners || [], openings: wall.openings || [] };
  }

  function steps(p, M) {
    const nad = [p.mT, p.mB, p.mL, p.mR];
    const same = nad.every(v => v === nad[0]);
    const nadTxt = same ? `${fmt(nad[0])} cm z każdej strony` : `góra ${fmt(p.mT)}, dół ${fmt(p.mB)}, lewo ${fmt(p.mL)}, prawo ${fmt(p.mR)} cm`;
    const nums = M.n > 4 ? `1, 2, 3 ... ${M.n}` : M.bryty.map(b => b.nr).join(', ');
    const s = [
      `Sprawdź bryty z tabelą obok: ${M.n} ${plural(M.n)}, szerokość każdego brytu i wysokość ${fmt(L_H(p))} cm.`,
      `Klej bryty po kolei według numerów: ${nums} – numeracja od lewej krawędzi ściany, jak na schemacie.`,
    ];
    if (M.n > 1) s.push(p.join === 'butt'
      ? `Bryty łączysz na styk: krawędzie są docięte maszynowo, grafika składa się na łączeniu (sąsiednie bryty mają ${fmt(p.overlap)} cm wspólnej grafiki).`
      : `Sąsiednie bryty zachodzą na siebie o ${fmt(p.overlap)} cm (zielone pole). Naklej bryt, przy krawędzi zakładu nie dawaj jeszcze kleju. Nałóż następny bryt, przetnij przez obie warstwy, usuń oba odcięte paski, podklej i dociśnij łączenie.`);
    if (nad.some(v => v > 0)) s.push(`Jaśniejsze pole wokół ściany to naddatek (${nadTxt}), bo ściany nie są równe. Nadmiar odetnij po naklejeniu.`);
    if (M.openings.length) s.push('Drzwi i okna są wydrukowane w całości (przerywany obrys). Otwór wytnij na miejscu.');
    if (M.corners.length) s.push('Przerywana pomarańczowa linia to narożnik – bryt przechodzi przez narożnik, zawiń go.');
    return s;
  }
  const L_H = p => p.wallH + p.mT + p.mB;

  // Schemat: grafika z podziałem, naddatek, zakłady, wymiary, narożniki i otwory. Zwraca dół rysunku.
  function drawSchema(d, p, L, M, top, maxH) {
    const TW = L.totalWcm, TH = L.totalHcm;
    const bh = 0.38, twoRows = M.ov > 0 && M.n > 1;    // paski z szerokościami brytów nad rysunkiem (2 rzędy, gdy zakład)
    const barsH = twoRows ? 2 * bh + 0.07 : bh;
    const left = MG + 1.0, availW = PW - MG - left - 0.2;
    const k = Math.min(availW / TW, (maxH - barsH - 1.6) / TH);
    const w = TW * k, h = TH * k;
    const x0 = left + (availW - w) / 2, y0 = top + barsH + 0.15;
    const X = cm => x0 + cm * k;
    const B = L.band / p.dpi * 2.54, IH = L.imgH / p.dpi * 2.54;

    d.rect(x0, y0, w, h, { fill: [255, 255, 255] });
    d.img('Pano', x0, y0 + B * k, w, IH * k);
    // naddatek: jaśniejsze pole
    const wx = X(p.mL), wy = y0 + p.mT * k, ww = p.wallW * k, wh = p.wallH * k;
    const lite = { fill: [255, 255, 255], alpha: 'GSlite' };
    if (p.mT > 0) d.rect(x0, y0, w, wy - y0, lite);
    if (p.mB > 0) d.rect(x0, wy + wh, w, y0 + h - wy - wh, lite);
    if (p.mL > 0) d.rect(x0, wy, wx - x0, wh, lite);
    if (p.mR > 0) d.rect(wx + ww, wy, x0 + w - wx - ww, wh, lite);
    // zakłady
    for (let i = 0; i < M.n - 1; i++) {
      const s = M.bryty[i + 1].a;
      if (M.ov > 0) d.rect(X(s), y0, M.ov * k, h, { fill: GREEN, alpha: 'GSzak' });
      else d.line(X(s), y0, X(s), y0 + h, INK, 0.03);
    }
    // otwory i narożniki (sekcja 09)
    for (const o of M.openings) {
      const oy = o.y || 0, oh = o.h == null ? p.wallH - oy : o.h;
      const rx = X(p.mL + o.x), ry = y0 + (p.mT + p.wallH - oy - oh) * k;
      d.rect(rx, ry, o.w * k, oh * k, { fill: [255, 255, 255], alpha: 'GSopen', stroke: INK, lw: 0.025, dash: [0.12, 0.08] });
      d.text(o.label.toLowerCase(), rx + o.w * k / 2, ry + Math.min(oh * k / 2, 0.5), PTS(7), { align: 'c' });
    }
    for (const c of M.corners) {
      const cx = X(p.mL + c.x);
      d.line(cx, y0, cx, y0 + h, ORANGE, 0.035, [0.15, 0.1]);
      d.text(c.label.toLowerCase(), cx, y0 + h + 0.32, PTS(7), { align: 'c', col: ORANGE });
    }
    // obrys ściany i całości
    d.rect(wx, wy, ww, wh, { stroke: INK, lw: 0.02, dash: [0.1, 0.07] });
    d.rect(x0, y0, w, h, { stroke: INK, lw: 0.02 });
    // numery brytów i paski z szerokościami nad rysunkiem
    M.bryty.forEach((b, i) => {
      const by = top + (twoRows && i % 2 ? bh + 0.07 : 0);
      const bx = X(b.a), bw = b.w * k;
      d.rect(bx, by, bw, bh, { fill: [255, 255, 255], stroke: INK, lw: 0.015 });
      const label = `${b.nr}: ${fmt(b.w)} cm`;
      const size = PTS(7);
      d.text(tw(label, size) < bw - 0.1 ? label : String(b.nr), bx + bw / 2, by + bh * 0.7, size, { align: 'c' });
      // numer w środku części widocznej brytu
      const vis0 = i > 0 ? b.a + M.ov : b.a, vis1 = b.a + b.w;
      const r = Math.min(0.36, (vis1 - vis0) * k / 2.4);
      if (r > 0.12) {
        const cx = X((vis0 + vis1) / 2), cy = y0 + h / 2;
        d.circle(cx, cy, r, [255, 255, 255], INK, 0.03);
        d.text(String(b.nr), cx, cy + r * 0.38, r * 1.05, { align: 'c', bold: true });
      }
    });
    // wymiary ściany
    const tk = 0.12, dy = y0 + h + (M.corners.length ? 0.6 : 0.35);
    d.line(wx, dy, wx + ww, dy, INK, 0.02); d.line(wx, dy - tk, wx, dy + tk, INK, 0.02); d.line(wx + ww, dy - tk, wx + ww, dy + tk, INK, 0.02);
    d.text(`szerokość ściany ${fmt(p.wallW)} cm`, wx + ww / 2, dy + 0.42, PTS(8.5), { align: 'c', bold: true });
    const dx = x0 - 0.35;
    d.line(dx, wy, dx, wy + wh, INK, 0.02); d.line(dx - tk, wy, dx + tk, wy, INK, 0.02); d.line(dx - tk, wy + wh, dx + tk, wy + wh, INK, 0.02);
    d.text(`wysokość ściany ${fmt(p.wallH)} cm`, dx - 0.15, wy + wh / 2, PTS(8.5), { align: 'c', bold: true, rot: true });
    return dy + 0.55;
  }

  function drawLegend(d, p, M, y) {
    let x = MG;
    const item = (draw, label) => { draw(x, y - 0.25); x += 0.6; d.text(label, x, y, PTS(7.5), { col: GRAY }); x += tw(label, PTS(7.5)) + 0.6; };
    item((ix, iy) => d.rect(ix, iy, 0.45, 0.3, { fill: [0xee, 0xf0, 0xf2], stroke: LINE, lw: 0.015 }), 'naddatek – docinasz na miejscu');
    item((ix, iy) => d.rect(ix, iy, 0.45, 0.3, { stroke: INK, lw: 0.02, dash: [0.1, 0.07] }), 'wymiar ściany');
    if (M.n > 1 && M.ov > 0) item((ix, iy) => d.rect(ix, iy, 0.45, 0.3, { fill: GREEN, alpha: 'GSzak' }), p.join === 'butt' ? `styk – ${fmt(M.ov)} cm wspólnej grafiki` : `zakład ${fmt(M.ov)} cm`);
    if (M.n > 1 && M.ov === 0) item((ix, iy) => d.line(ix + 0.22, iy, ix + 0.22, iy + 0.3, INK, 0.03), 'łączenie na styk');
    if (M.corners.length) item((ix, iy) => d.line(ix + 0.22, iy, ix + 0.22, iy + 0.3, ORANGE, 0.035, [0.08, 0.05]), 'narożnik');
    if (M.openings.length) item((ix, iy) => d.rect(ix, iy, 0.45, 0.3, { stroke: INK, lw: 0.02, dash: [0.08, 0.05] }), 'drzwi / okno – wytnij na miejscu');
  }

  // Tabela brytów; zwraca listę kolumn tabeli (gdy brytów dużo, tabela dzieli się na kolumny).
  function drawTable(d, p, L, M, x, y, maxW, maxH) {
    const cols = [['Bryt', 1.1], ['Szerokość [cm]', 2.4], ['Wysokość [cm]', 2.3], ['Na ścianie od – do [cm]', 3.6]];
    const tabW = cols.reduce((a, c) => a + c[1], 0);
    // Gdy brytów jest tyle, że kolumny tabeli nie mieszczą się obok siebie, wiersze robią się niższe (mniejsza czcionka),
    // zamiast gubić bryty (np. 26 brytów: dawniej w tabeli tylko 1–24).
    const fitGroups = Math.max(1, Math.floor((maxW + 0.5 + 1e-6) / (tabW + 0.5)));
    let rowH = 0.46;
    if (Math.ceil(M.n / Math.max(1, Math.floor((maxH - rowH) / rowH))) > fitGroups) rowH = Math.max(0.2, maxH / (Math.ceil(M.n / fitGroups) + 1));
    const size = PTS(8) * rowH / 0.46;
    const perCol = Math.max(1, Math.floor((maxH - rowH) / rowH + 1e-9));
    const groups = Math.ceil(M.n / perCol);
    for (let g = 0; g < groups; g++) {
      const gx = x + g * (tabW + 0.5);
      if (gx + tabW > x + maxW + 1e-6) return false;
      let cx = gx;
      d.rect(gx, y, tabW, rowH, { fill: [0xf3, 0xf4, 0xf6] });
      for (const [h, w] of cols) { d.text(h, cx + 0.12, y + rowH * 0.66, size, { bold: true }); cx += w; }
      M.bryty.slice(g * perCol, (g + 1) * perCol).forEach((b, r) => {
        const ry = y + (r + 1) * rowH;
        d.line(gx, ry + rowH, gx + tabW, ry + rowH, LINE, 0.015);
        const vals = [String(b.nr), fmt(b.w), fmt(L.totalHcm), `${fmt(b.from)} – ${fmt(b.to)}`];
        let vx = gx;
        vals.forEach((v, j) => { d.text(v, vx + 0.12, ry + rowH * 0.66, size, { bold: j === 0 }); vx += cols[j][1]; });
      });
    }
    return { w: groups * tabW + (groups - 1) * 0.5, h: (Math.min(M.n, perCol) + 1) * rowH };
  }

  function drawSteps(d, list, x, y, w) {
    d.text('Kolejność montażu', x, y, PTS(11), { bold: true });
    y += 0.55;
    const size = PTS(8.5), lh = size * 1.35;
    list.forEach((s, i) => {
      d.circle(x + 0.22, y - size * 0.35, 0.2, GREEN, GREEN, 0.01);
      d.text(String(i + 1), x + 0.22, y - size * 0.35 + 0.1, PTS(8), { align: 'c', bold: true, col: [255, 255, 255] });
      const lines = wrap(s, size, w - 0.65);
      lines.forEach((ln, j) => d.text(ln, x + 0.6, y + j * lh, size));
      y += lines.length * lh + 0.2;
    });
    return y;
  }

  function header(d, p, M, L, pageNo, pages) {
    const lw = drawLogo(d, MG, MG, 0.62);
    d.text('Schemat montażu fototapety', PW - MG, MG + 0.5, PTS(15), { align: 'r', bold: true });
    const join = M.n < 2 ? '1 bryt' : p.join === 'butt' ? `łączenie na styk (${fmt(p.overlap)} cm wspólnej grafiki)` : `zakład ${fmt(p.overlap)} cm`;
    const info = [`Zlecenie: ${p.orderName || p.order}`, `ściana ${fmt(p.wallW)} × ${fmt(p.wallH)} cm`, `z naddatkiem ${fmt(L.totalWcm)} × ${fmt(L.totalHcm)} cm`,
      `${M.n} ${plural(M.n)}`, join, M.material ? `materiał: ${M.material}` : ''].filter(Boolean).join('  ·  ');
    const maxW = PW - 2 * MG, iw = tw(info, PTS(8.5));   // długa nazwa zlecenia: mniejsza czcionka zamiast ucięcia
    d.text(info, MG, MG + 1.25, iw > maxW ? PTS(8.5) * maxW / iw : PTS(8.5), { col: GRAY });
    d.rect(MG, MG + 1.5, PW - 2 * MG, 0.06, { fill: GREEN });
    const date = new Date().toLocaleDateString('pl-PL');
    d.text(`Wymiary w cm. Grafika na schemacie jest pomniejszona.  ·  ${date}` + (pages > 1 ? `  ·  strona ${pageNo}/${pages}` : ''), MG, PH - 0.7, PTS(7), { col: GRAY });
    void lw;
  }

  async function make() {
    const p = params();
    const L = layout(p);
    const M = model(p, L);
    const pano = await renderPano(L, 2400);
    const pages = [];
    const top = MG + 2.1;

    // Jedna strona: schemat, legenda i tabela brytów. Bez listy „Kolejność montażu” (decyzja Sebastiana 26.10.2026),
    // funkcje steps()/drawSteps() zostają na wypadek powrotu. Schemat dostaje miejsce, które zostaje nad tabelą.
    const tableH = (Math.min(M.n, 11) + 1) * 0.46;
    const schemaMax = Math.max(7, Math.min(13, PH - 1.1 - top - 0.85 - 0.35 - tableH));
    const d1 = page(); pages.push(d1);
    const schemaBottom = drawSchema(d1, p, L, M, top, schemaMax);
    drawLegend(d1, p, M, schemaBottom + 0.25);
    const tTop = schemaBottom + 0.85, tMaxH = PH - 1.1 - tTop;
    drawTable(d1, p, L, M, MG, tTop, PW - 2 * MG, tMaxH);
    pages.forEach((d, i) => header(d, p, M, L, i + 1, pages.length));
    return { blob: buildPdf(pages, pano), name: `schemat-montazu_${p.order}.pdf`, pages: pages.length };
  }

  // Szerokości znaków Helvetica / Helvetica-Bold (AFM, 1/1000 em) dla kodów 32–255 w naszym kodowaniu
  // (WinAnsi + polskie litery na 128–143). Bez /Widths część przeglądarek PDF brała szerokości znaków WinAnsi
  // z tych kodów (np. 0 dla 129 = ć) i „zjadała” spację po polskiej literze: „Kolejnośćmontażu”.
  const AFM = {
    r: '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584',
    b: '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584',
    // ą ć ę ł ń ś ź ż Ą Ć Ę Ł Ń Ś Ź Ż
    plR: '556 500 556 222 556 500 500 500 667 722 667 556 722 667 611 611',
    plB: '556 556 556 278 611 556 500 500 722 722 667 611 722 667 611 611',
  };
  function widths(bold) {
    const w = [];
    const ascii = (bold ? AFM.b : AFM.r).split(' ').map(Number), pl = (bold ? AFM.plB : AFM.plR).split(' ').map(Number);
    for (let c = 32; c <= 255; c++) {
      if (c <= 126) w.push(ascii[c - 32]);
      else if (c >= 128 && c <= 143) w.push(pl[c - 128]);
      else if (c === 0x96) w.push(556);                     // półpauza
      else if (c === 0xB7) w.push(278);                     // ·
      else if (c === 0xD7) w.push(584);                     // ×
      else if (c === 0xD3) w.push(778);                     // Ó
      else if (c === 0xF3) w.push(bold ? 611 : 556);        // ó
      else w.push(556);
    }
    return w.join(' ');
  }

  function buildPdf(pages, pano) {
    const enc = new TextEncoder();
    const objs = [];
    const add = parts => { objs.push(parts); return objs.length; };
    const catalog = add(null), pagesObj = add(null);
    const fontDict = base => [`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /FirstChar 32 /LastChar 255 /Widths [${widths(base.endsWith('Bold'))}] ` +
      `/Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${PL_NAMES}] >> >>`];
    const f1 = add(fontDict('Helvetica')), f2 = add(fontDict('Helvetica-Bold'));
    const im = add([`<< /Type /XObject /Subtype /Image /Width ${pano.w} /Height ${pano.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pano.blob.size} >>\nstream\n`, pano.blob, '\nendstream']);
    const gs = add(['<< /GSlite << /Type /ExtGState /ca 0.6 >> /GSzak << /Type /ExtGState /ca 0.45 >> /GSopen << /Type /ExtGState /ca 0.5 >> >>']);
    const res = add([`<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /XObject << /Pano ${im} 0 R >> /ExtGState ${gs} 0 R >>`]);
    const W = (PW * PT).toFixed(3), H = (PH * PT).toFixed(3);
    const kids = pages.map(d => {
      const c = d.content;
      const content = add([`<< /Length ${enc.encode(c).length} >>\nstream\n`, c, '\nendstream']);
      return add([`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} 0 R /Contents ${content} 0 R >>`]);
    });
    objs[catalog - 1] = [`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`];
    objs[pagesObj - 1] = [`<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`];
    const out = [], offsets = [];
    let off = 0;
    const push = part => { const b = typeof part === 'string' ? enc.encode(part) : part; out.push(b); off += b.size !== undefined ? b.size : b.length; };
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    objs.forEach((parts, i) => { offsets.push(off); push(`${i + 1} 0 obj\n`); parts.forEach(push); push('\nendobj\n'); });
    const xref = off;
    let t = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach(o => { t += String(o).padStart(10, '0') + ' 00000 n \n'; });
    t += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    push(t);
    return new Blob(out, { type: 'application/pdf' });
  }

  let lastUrl = null;
  function init() {
    const box = document.getElementById('montazBox');
    if (!box) return;
    box.innerHTML = '<button type="button" class="small" id="montazGo" style="width:100%;margin-top:10px">Schemat montażu dla klienta (PDF)</button>' +
      '<div id="montazMsg" class="msg" role="status" aria-live="polite"></div>';
    const btn = document.getElementById('montazGo'), msg = document.getElementById('montazMsg');
    // Przycisk aktywny razem z „Generuj bryty” (zdjęcie wczytane, brak błędów w ustawieniach).
    const go = document.getElementById('go');
    const sync = () => { btn.disabled = !go || go.disabled; };
    if (go) new MutationObserver(sync).observe(go, { attributes: true, attributeFilter: ['disabled'] });
    sync();
    btn.addEventListener('click', async () => {
      const p = params();
      if (!img || validate(p).length) { msg.innerHTML = '<span class="err">Najpierw wczytaj zdjęcie i popraw błędy w ustawieniach.</span>'; return; }
      btn.disabled = true; msg.textContent = 'Tworzę schemat montażu…';
      try {
        const r = await make();
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = URL.createObjectURL(r.blob);
        msg.innerHTML = `<div class="dl"><a href="${lastUrl}" download="${r.name}">${r.name} (${(r.blob.size / 1e6).toFixed(1)} MB, ${r.pages} ${r.pages === 1 ? 'strona' : 'strony'})</a></div>`;
      } catch (e) {
        msg.innerHTML = `<span class="err">Błąd schematu: ${String(e.message).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>`;
      } finally { sync(); }
    });
  }

  return { init, make, model, steps, widths };
})();

// Złoty wzorzec zachowania STAREGO konfiguratora (repo fototapety-valare, main 6933982).
// Uruchamia oryginalne funkcje layout/validate/warnings (bryty.js), Wycena.calc/areaM2/addWorkdays,
// Jakosc.assess w Node (vm) na siatce parametrów i zapisuje wynik do JSON.
// Użycie: node zloty-wzorzec.js <ścieżka do repo fototapety-valare> <plik-wyjściowy.json>
// Nowa wersja (v2) ma dać identyczny JSON dla tych samych wejść (komunikaty mogą się różnić tylko świadomie).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const repo = process.argv[2], out = process.argv[3];
const src = fs.readFileSync(path.join(repo, 'bryty.js'), 'utf8');
// Tylko czysta część bryty.js (do funkcji warnings włącznie) – reszta to DOM/UI.
const cut = src.indexOf('let view = null;');
const pure = src.slice(0, cut) + '\n;globalThis.__api = { layout, validate, warnings, brytWidths, pxCeil, cmToPx, MATERIALS };';
const dpiOpts = [100, 150, 200, 300].map(v => ({ value: String(v) }));
const ctx = { console, Math, Number, Array, String, Object, JSON, Infinity, NaN, parseFloat, parseInt, Date,
  document: { getElementById: () => null, querySelectorAll: s => s === '#dpi option' ? dpiOpts : [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }), head: { appendChild() {} }, addEventListener() {} },
  addEventListener() {} };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(pure, ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'wycena.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(repo, 'jakosc.js'), 'utf8'), ctx);
const A = ctx.__api, W = ctx.Wycena, J = ctx.Jakosc;

const base = { wallW: 350, wallH: 270, mT: 3, mB: 3, mL: 3, mR: 3, join: 'overlap', overlap: 6, split: 'equal', count: 3,
  widths: [], maxPrint: 131, dpi: 150, thru: false };
const cases = [];
const add = (name, over) => cases.push({ name, p: { ...base, ...over } });
add('005-21', {});
add('005-21 thru', { thru: true, mT: 2.5, mB: 2.5, mL: 2.5, mR: 2.5, overlap: 5 });
add('styk', { join: 'butt', overlap: 1 });
for (const dpi of [100, 150, 200, 300]) for (const ov of [0, 1, 2.5, 5, 6]) for (const count of [1, 2, 3, 4, 7]) for (const wallW of [40, 80, 100, 129.5, 250, 325, 350, 512.3])
  add(`grid dpi${dpi} ov${ov} n${count} w${wallW}`, { dpi, overlap: ov, join: ov === 1 ? 'butt' : 'overlap', count, wallW, maxPrint: 154 });
// własne szerokości (puste ostatnie = reszta; pełne; za szerokie; za wąskie; pokrywa ścianę)
for (const widths of [[120, 120, NaN], [100, 130, 130], [131, 131, 131], [50, 50, 50], [356, NaN], [300, 70], [128, 128, 112], [60, NaN], [NaN]])
  for (const ov of [0, 6]) add(`custom ${widths.map(String).join('/')} ov${ov}`, { split: 'custom', widths, count: widths.length, overlap: ov });
// walidacja błędnych danych
for (const [n, o] of [['zero', { wallW: 0 }], ['ujemny', { wallH: -1 }], ['naddatek 11', { mT: 11 }], ['naddatek 0.3', { mL: 0.3 }],
  ['zakład ujemny', { overlap: -1 }], ['maxPrint 0', { maxPrint: 0 }], ['maxPrint NaN', { maxPrint: NaN }], ['dpi 40', { dpi: 40 }],
  ['count 0', { count: 0 }], ['count 31', { count: 31 }], ['za szeroki', { count: 2 }], ['thru za niska', { thru: true, wallH: 0.1, mT: 0, mB: 0 }],
  ['za wysoka 300dpi', { wallH: 2800, dpi: 300 }], ['za duży bryt', { wallW: 2000, count: 3, maxPrint: Infinity, dpi: 300 }],
  ['wąski ostatni', { split: 'custom', widths: [130, 130, NaN], count: 3, wallW: 250 }], ['1 bryt wąski', { wallW: 2, mL: 0, mR: 0, count: 1 }]])
  add(`błąd ${n}`, o);

const clean = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
const res = { zrodlo: 'fototapety-valare main', bryty: [], wycena: [], terminy: [], jakosc: [] };
for (const c of cases) {
  const errors = A.validate(c.p);
  let L = null, warn = [];
  if (!errors.length) { L = A.layout(c.p); warn = A.warnings(c.p, L); }
  res.bryty.push(clean({ name: c.name, p: c.p, errors, warnings: warn,
    layout: L && { totalWcm: L.totalWcm, totalHcm: L.totalHcm, widthsCm: L.bw.widths, bWs: L.bWs, xs: L.xs, bH: L.bH, band: L.band, ov: L.ov, panoW: L.panoW, imgH: L.imgH,
      area: { margin: W.areaM2(c.p, L, 'margin'), print: W.areaM2(c.p, L, 'print'), wall: W.areaM2(c.p, L, 'wall') } } }));
}
for (const material of [...Object.keys(W.CENNIK), 'Nieznany']) for (const area of [0, 1, 9.834, 10.005, 27.3]) for (const butt of [false, true]) for (const termin of ['standard', 'fast', 'express']) for (const order of [false, true])
  res.wycena.push(clean({ in: { material, area, joints: 2, heightCm: 276, butt, termin, order }, out: W.calc({ material, area, joints: 2, heightCm: 276, butt, termin, order }) }));
for (const d of ['2026-11-23', '2026-12-18', '2026-12-23', '2027-03-24', '2027-04-28', '2027-10-29']) for (const n of [3, 7, 10, 21]) {
  const r = W.addWorkdays(new Date(d + 'T12:00:00'), n);
  res.terminy.push({ od: d, dni: n, wynik: `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}` });
}
for (const px of [0, 999.9, 1000, 1500, 2499.9, 2500, 5900]) for (const zoom of [1, 2, 3]) res.jakosc.push({ pxPerM: px, zoom, out: J.assess(px, zoom) });
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log(`zapisano ${out}: ${res.bryty.length} przypadków podziału, ${res.wycena.length} wycen, ${res.terminy.length} terminów, ${res.jakosc.length} ocen jakości`);

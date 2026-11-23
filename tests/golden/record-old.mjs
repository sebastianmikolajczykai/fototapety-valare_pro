// Nagrywa wzorce (golden) ze STAREGO programu (katalog nadrzędny: ../.. = repozytorium z prototypem JS).
// Te same wejścia -> wyjścia starego kodu zapisane w tests/fixtures/golden/*.json. Testy nowego kodu porównują się z nimi.
// Uruchom tylko, gdy zmieni się stary program:  node tests/golden/record-old.mjs
// Potrzebny Chromium (Playwright). Ścieżkę do przeglądarki można podać w CHROMIUM_PATH.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { cases } from './cases.mjs';
import { encode } from './json-special.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OLD = path.resolve(process.env.OLD_REPO || path.join(HERE, '../../../fototapety-valare'));
const OUT = path.resolve(HERE, '../fixtures/golden');
const require = createRequire(import.meta.url);
const PORT = 3700 + Math.floor(Math.random() * 90);
const FIXED_NOW = '2026-11-23T10:00:00+01:00';

const save = (name, data) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(encode(data), null, 1) + '\n');
  console.log('zapisano', name, Array.isArray(data) ? data.length : '');
};

// ---------- część serwerowa (Node, CommonJS starego programu) ----------
function recordServerSide() {
  const ai = require(path.join(OLD, 'ai-serwer.js'));
  const wn = require(path.join(OLD, 'ai-wnetrze.js'));
  const tp = require(path.join(OLD, 'ai-powieksz.js'));
  const srv = require(path.join(OLD, 'serwer-fototapety.js'));
  const C = cases.server;
  save('server-ai', {
    size: C.aspects.map(a => ({ a, out: ai.size(a) })),
    prompt: C.prompts.map(p => ({ kind: p.kind, p: p.p, out: ai.prompt(p.kind, { ...p.p }) })),
    isImage: C.images.map(v => ({ v, out: ai.isImage(v) })),
    validTarget: C.targets.map(t => ({ t, out: ai.validTarget(t) })),
    text: C.texts.map(([v, max]) => ({ v, max, out: max === undefined ? ai.text(v) : ai.text(v, max) })),
    scenePrompt: C.scenes.map(p => ({ p, out: wn.scenePrompt(p) })),
    photoPrompt: wn.photoPrompt(),
    rooms: wn.ROOMS,
    outputSize: C.upscales.map(([w, h, t]) => ({ w, h, t, out: tp.outputSize(w, h, t) })),
    modelFor: ['foto', 'cgi', undefined].map(s => ({ s, out: tp.modelFor(s) })),
    cdrMessage: C.cdrMessages.map(t => ({ t, out: srv.cdrMessage(t) })),
    privatePaths: C.paths.map(p => ({ p, out: srv.PRIVATE.test(p) })),
    parseCdrJob: C.cdrJobs.map(b64 => {
      try {
        const j = srv.parseCdrJob(Buffer.from(b64, 'base64'));
        return { b64, ok: j };
      } catch (e) {
        return { b64, err: e.message, status: e.status };
      }
    }),
  });
}

// ---------- część przeglądarkowa (strona bryty.html starego programu) ----------
async function recordBrowser() {
  const server = spawn(process.execPath, [path.join(OLD, 'serwer-fototapety.js')], {
    env: { PATH: process.env.PATH, LOCAL_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForFunction(() => typeof layout === 'function' && window.Montaz && window.Wycena);

    // 1) Geometria, walidacja, ostrzeżenia
    const layoutOut = await page.evaluate(
      list =>
        list.map(p => {
          const q = {
            ...p,
            widths: p.widths.map(w => (w === null ? NaN : w)),
            maxPrint: p.maxPrint === 'Inf' ? Infinity : p.maxPrint === null ? NaN : p.maxPrint,
          };
          const errs = validate(q);
          const r = { errs };
          try {
            const L = layout(q);
            r.L = {
              totalWcm: L.totalWcm,
              totalHcm: L.totalHcm,
              bw: L.bw,
              bWs: L.bWs,
              xs: L.xs,
              bH: L.bH,
              band: L.band,
              ov: L.ov,
              panoW: L.panoW,
              imgH: L.imgH,
            };
            if (!errs.length) r.warn = warnings(q, L);
          } catch (e) {
            r.layoutErr = String(e);
          }
          return r;
        }),
      cases.layout,
    );
    save(
      'layout',
      cases.layout.map((p, i) => ({ p, ...layoutOut[i] })),
    );

    // 2) Kadr (fit) dla różnych zdjęć, powiększeń i położeń
    const fitOut = await page.evaluate(
      list =>
        list.map(c => {
          crop.zoom = c.zoom;
          crop.fx = c.fx;
          crop.fy = c.fy;
          const L = layout(c.p);
          return fit(L, c.iw, c.ih);
        }),
      cases.fit,
    );
    await page.evaluate(() => {
      crop.zoom = 1;
      crop.fx = crop.fy = 0.5;
    });
    save(
      'fit',
      cases.fit.map((c, i) => ({ ...c, out: fitOut[i] })),
    );

    // 3) Formatowanie liczb i odmiana
    save(
      'format',
      await page.evaluate(
        list => list.map(x => ({ x, f1: f1(x), f2: f2(x), plural: Number.isInteger(x) && x >= 0 ? plural(x) : null })),
        cases.numbers,
      ),
    );

    // 4) Materiały (karty i lista w <select>)
    save(
      'materials',
      await page.evaluate(() => ({
        lista: Materialy.lista,
        grupy: Materialy.GRUPY,
        terminy: Materialy.TERMINY,
        zrodlo: Materialy.ZRODLO,
        options: [...document.getElementById('material').options].map(o => ({ value: o.value, text: o.text })),
      })),
    );

    // 5) Wycena
    save(
      'pricing',
      await page.evaluate(
        c => ({
          cennik: Wycena.CENNIK,
          stykMb: Wycena.STYK_MB,
          terminy: Wycena.TERMINY,
          calc: c.calc.map(inp => ({ inp, out: Wycena.calc(inp) })),
          area: c.area.map(a => {
            const L = layout(a.p);
            return { ...a, out: Wycena.areaM2(a.p, L, a.mode) };
          }),
          workdays: c.workdays.map(([d, n]) => {
            const r = Wycena.addWorkdays(new Date(d + 'T12:00:00'), n);
            return { d, n, out: `${r.getFullYear()}-${r.getMonth() + 1}-${r.getDate()}` };
          }),
        }),
        cases.pricing,
      ),
    );

    // 6) Jakość
    save(
      'quality',
      await page.evaluate(
        list => ({ defaults: Jakosc.DEFAULTS, assess: list.map(([v, z]) => ({ v, z, out: Jakosc.assess(v, z) })) }),
        cases.quality,
      ),
    );

    // 7) Ściana: narożniki i otwory (logika sekcji 09)
    const wallOut = await page.evaluate(
      list =>
        list.map(c => {
          Sciana.items.splice(
            0,
            Sciana.items.length,
            ...c.items.map(it => Object.fromEntries(Object.entries(it).map(([k, v]) => [k, v === null ? NaN : v]))),
          );
          const L = layout(c.p);
          const r = { warnings: Sciana.warnings(c.p, L), data: Sciana.data(c.p, L) };
          if (!validate(c.p).length) r.suggest = Sciana.suggest(c.p, L);
          return r;
        }),
      cases.wall,
    );
    await page.evaluate(() => Sciana.items.splice(0));
    save(
      'wall',
      cases.wall.map((c, i) => ({ ...c, out: wallOut[i] })),
    );

    // 8) Próbka 40×60
    const sampleOut = await page.evaluate(
      list =>
        list.map(c => {
          const r = document.querySelector(`input[name=probkaOr][value=${c.vertical ? 'v' : 'h'}]`);
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
          Probka.pos.fx = c.fx;
          Probka.pos.fy = c.fy;
          return Probka.geom(c.p, layout(c.p));
        }),
      cases.sample,
    );
    save(
      'sample',
      cases.sample.map((c, i) => ({ ...c, out: sampleOut[i] })),
    );

    // 9) Wizualizacja: homografia, skala, geometria sceny
    save(
      'visualization',
      await page.evaluate(
        c => ({
          homography: c.quads.map(q => {
            const m = Wizualizacja.homography(q);
            return {
              q,
              m: m ? m.m : null,
              pts: m
                ? [
                    [0, 0],
                    [1, 0],
                    [0.5, 0.5],
                    [0.3, 0.8],
                  ].map(([u, v]) => m(u, v))
                : null,
            };
          }),
          assessScale: c.scales.map(a => ({ a, out: Wizualizacja.assessScale(a) })),
          sceneGeo: c.walls.map(p => {
            const G = Wizualizacja.sceneGeo(p);
            const o = {};
            for (const [k, v] of Object.entries(G)) if (typeof v !== 'function') o[k] = v;
            o.pts = [
              [0, 0, 0],
              [100, 50, 30],
              [-200, 0, 0],
            ].map(([X, Y, z]) => G.P(X, Y, z));
            o.sc = [0, 100].map(G.sc);
            return { p, out: o };
          }),
        }),
        cases.visualization,
      ),
    );

    // 10) Teksty PDF i szerokości znaków
    save(
      'pdf-text',
      await page.evaluate(
        list => ({
          widthsR: Montaz.widths(false),
          widthsB: Montaz.widths(true),
          plNames: PL_NAMES,
          codes: list.map(s => ({ s, codes: pdfCodes(s), text: pdfText(s), w: textWExact(s, 10) })),
        }),
        cases.texts,
      ),
    );

    // 11) PDF dla Corela i arkusz CDR (bajty) dla zestawu ustawień, z umownymi danymi JPG
    const sheetOut = await page.evaluate(async list => {
      const b64 = async blob => {
        const u = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (const x of u) s += String.fromCharCode(x);
        return btoa(s);
      };
      const out = [];
      for (const c of list) {
        const L = layout(c.p);
        const jpegs = L.bWs.map((_, i) => new Blob([`JPEG-${i}-${L.bWs[i]}x${L.imgH}`]));
        const pano = { blob: new Blob(['PANO-JPEG']), w: c.panoW, h: c.panoH };
        const pdf = await makePdf(L, c.p, jpegs, pano);
        const G = sheetGeom(L, c.p);
        // operacje arkusza CDR bez wysyłania do serwera (ten sam rysownik co makeCdr)
        const ops = [];
        const d = {
          img: (name, x, y, w, h) =>
            ops.push({ t: 'img', file: name === 'Pano' ? 'pano.jpg' : `bryt_${+name.slice(2) + 1}.jpg`, x, y, w, h }),
          rectF: (col, x, y, w, h) => ops.push({ t: 'rectF', col, x, y, w, h }),
          rectS: (col, x, y, w, h, wd) => ops.push({ t: 'rectS', col, x, y, w, h, wd }),
          line: (col, x1, y1, x2, y2, wd) => ops.push({ t: 'line', col, x1, y1, x2, y2, wd }),
          text: (col, s, x, y, size, rot = false) => ops.push({ t: 'text', col, s, x, y, size, rot }),
        };
        const row = [...Array(G.n).keys()],
          top = schemaHeight(G);
        drawSchema(G, c.p, d);
        drawBryty(G, d, [row], top, c.p.orderName);
        const pageW = Math.max(
          schemaWidth(G),
          2 * G.M + textWExact(c.p.orderName, G.fs * 2),
          2 * G.M + rowWidth(G, row),
        );
        const pageH = top + brytyRowTop(G) + brytyRowH(G) - G.gap + G.M;
        out.push({
          pdf: await b64(pdf.blob),
          pages: pdf.pages,
          schemaScale: pdf.schemaScale,
          G,
          cdr: { pageW, pageH, ops },
        });
      }
      return out;
    }, cases.sheet);
    save(
      'production-sheet',
      cases.sheet.map((c, i) => ({ ...c, out: sheetOut[i] })),
    );

    // 12) Schemat montażu (PDF) – dane ustawiane w formularzu, podgląd całości podmieniony na umowny plik
    const asmOut = [];
    for (const c of cases.assembly) {
      await page.evaluate(() => Kroki.open(4)); // krok „Zdjęcie i zlecenie” otwarty – pole nazwy widoczne
      await page.fill('#order', c.order); // zdarzenie od użytkownika: własna nazwa zlecenia (pusta = automatyczna)
      asmOut.push(
        await page.evaluate(async c => {
          const setv = (id, v) => {
            const e = document.getElementById(id);
            e.value = v;
            e.dispatchEvent(new Event('input', { bubbles: true }));
          };
          for (const [k, v] of Object.entries(c.form)) setv(k, v);
          const sel = document.getElementById('material');
          sel.value = c.material;
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          for (const [n, v] of Object.entries(c.radios)) {
            const r = document.querySelector(`input[name=${n}][value=${v}]`);
            r.checked = true;
            r.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (c.widths) {
            const ins = [...document.querySelectorAll('#widthsBox input')];
            ins.forEach((el, i) => {
              el.value = c.widths[i] ?? '';
            });
            document.getElementById('widthsBox').dispatchEvent(new Event('input', { bubbles: true }));
          }
          window.renderPano = async () => ({ blob: new Blob(['PANO-MONTAZ']), w: 2400, h: 1800 });
          const p = params();
          if (validate(p).length) return { errs: validate(p) };
          const r = await Montaz.make();
          const u = new Uint8Array(await r.blob.arrayBuffer());
          let s = '';
          for (const x of u) s += String.fromCharCode(x);
          return { name: r.name, pages: r.pages, pdf: btoa(s), p, model: Montaz.model(p, layout(p)) };
        }, c),
      );
    }
    save(
      'assembly-pdf',
      cases.assembly.map((c, i) => ({ ...c, out: asmOut[i] })),
    );

    // 13) ZIP, DPI w JFIF, CRC
    save(
      'zip',
      await page.evaluate(async list => {
        const b64 = async blob => {
          const u = new Uint8Array(await blob.arrayBuffer());
          let s = '';
          for (const x of u) s += String.fromCharCode(x);
          return btoa(s);
        };
        const out = [];
        for (const c of list) {
          const files = c.files.map(f => ({
            name: f.name,
            blob: new Blob([Uint8Array.from(atob(f.b64), ch => ch.charCodeAt(0))]),
          }));
          out.push({ ...c, zip: await b64(await makeZip(files)) });
        }
        return out;
      }, cases.zip),
    );
    save(
      'jfif',
      await page.evaluate(async list => {
        const b64 = async blob => {
          const u = new Uint8Array(await blob.arrayBuffer());
          let s = '';
          for (const x of u) s += String.fromCharCode(x);
          return btoa(s);
        };
        const out = [];
        for (const c of list)
          out.push({
            ...c,
            out: await b64(await withDpi(new Blob([Uint8Array.from(atob(c.b64), ch => ch.charCodeAt(0))]), c.dpi)),
          });
        return out;
      }, cases.jfif),
    );

    if (errors.length) throw new Error('Błędy JS na starej stronie: ' + errors.join('; '));
  } finally {
    await browser.close();
    server.kill();
  }
}

recordServerSide();
await recordBrowser();
console.log('Gotowe.');

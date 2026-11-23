// Główny skrypt strony bryty.html – odpowiednik starego bryty.js: formularz → podział na bryty, podgląd z kadrem,
// generowanie JPG brytów, JPG całości, pliku dla CorelDRAW (.cdr przez serwer z Corelem albo PDF) i ZIP.
// Logika w domenie i generatorach plików (src/domain, src/output); tu tylko strona.
// Świadoma zmiana względem starego programu (decyzja Sebastiana 23.11.2026): .cdr domyślnie z obrazami OSADZONYMI
// (stary wysyłał link: true – po przeniesieniu pliku brak obrazów); obrazy linkowane jako opcja „cdrLink”,
// widoczna tylko, gdy serwer ma CorelDRAW. PDF zostaje podstawowym plikiem dla ARPI.
import { computeLayout, fitImage, type Crop, type Layout, type WallParams } from '../domain/layout';
import { BUTT_OVERLAP_CM, MAX_BRYTY, THRU_RGB } from '../domain/constants';
import { cmToPx } from '../domain/units';
import { layoutWarnings, validate } from '../domain/validation';
import {
  brytTableHtml,
  calcBase,
  calcImage,
  cdrInfoText,
  cdrNote,
  doneMessage,
  equalSplitCm,
  errorsHtml,
  mb,
  PREVIEW_MAX,
  sourcePxPerMeter,
  warningsHtml,
} from '../domain/summary';
import { cdrJob, cdrRequestParts } from '../output/cdr-job';
import { productionPdf, type PdfImage } from '../output/production-pdf';
import { ProductionSheet } from '../output/sheet';
import { Crc32, zipParts, type ZipEntry } from '../output/zip';
import { canvasJpeg, withDpi } from './lib/jpeg';
import type { PageImage } from './lib/legacy';

/** Skala i położenie górnego podglądu (do przeciągania kadru i rysunków modułów). */
export interface PreviewView {
  ox: number;
  oy: number;
  sc: number;
  w: number;
  h: number;
  L: Layout;
}

interface PageModules {
  Wycena?: { update(p: WallParams, L: Layout | null): void };
  Jakosc?: {
    init(): void;
    update(p: WallParams | null, L?: Layout, img?: PageImage, F?: ReturnType<typeof fitImage>, zoom?: number): string;
    draw(ctx: CanvasRenderingContext2D, view: PreviewView): void;
  };
  Sciana?: {
    init(): void;
    warnings(p: WallParams, L: Layout): string[];
    draw(ctx: CanvasRenderingContext2D, view: PreviewView, p: WallParams): void;
  };
  Probka?: { init(): void; draw(ctx: CanvasRenderingContext2D, view: PreviewView, p: WallParams): void };
  Montaz?: { init(): void };
  keepCropOnce?: boolean;
  grafikaId?: number;
}
type BrytyWindow = Window & typeof globalThis & PageModules;

// Tekst z zewnątrz (komunikaty serwera, ścieżki) wstawiany do HTML – bez interpretacji znaczników.
const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (v: unknown): number => parseFloat(String(v).replace(',', '.'));
const blobPdfImage = (blob: Blob, w: number, h: number): PdfImage<Blob> => ({ data: blob, size: blob.size, w, h });

/** Suma CRC-32 pliku: do 256 MB w całości (szybciej), większe kawałkami. */
async function crc32(blob: Blob): Promise<number> {
  const c = new Crc32();
  if (blob.size <= 256e6) return c.update(new Uint8Array(await blob.arrayBuffer())).digest();
  const rd = blob.stream().getReader();
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    c.update(value);
  }
  return c.digest();
}

export class BrytyPage {
  img: PageImage | null = null;
  private imgUrl: string | null = null;
  private lastUrls: string[] = [];
  /** Kadr: zoom ≥ 1 względem minimalnego wypełnienia, fx/fy = położenie wycinka 0..1 (0,5 = środek). */
  readonly crop: Crop = { zoom: 1, fx: 0.5, fy: 0.5 };
  private view: PreviewView | null = null;
  private frame = 0;
  private widthsWasCustom = false;
  /** Wartości wpisane automatycznie do pól szerokości (null = użytkownik je zmieniał). */
  private widthsAuto: string[] | null = null;
  private dragFrom: { pt: { x: number; y: number }; fx: number; fy: number } | null = null;
  private genBusy = false;
  private cdrReady = false;
  /** Dwa pliki wybrane szybko po sobie: wygrywa ostatni, nie ten, który wczyta się później. */
  private loadSeq = 0;

  constructor(private readonly win: BrytyWindow) {}

  private get doc(): Document {
    return this.win.document;
  }
  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.doc.getElementById(id) as T;
  }
  private val(id: string): string {
    return this.$<HTMLInputElement>(id).value;
  }

  // Rysuje fragment zdjęcia (współrzędne w pikselach oryginału) z kopii podglądowej, jeśli jest.
  private drawFast(ctx: CanvasRenderingContext2D, ...a: number[]): void {
    const img = this.img!;
    const s = img.preview;
    const r = s ? s.width / img.naturalWidth : 1;
    const [sx, sy, sw, sh, dx, dy, dw, dh] = a as [number, number, number, number, number, number, number, number];
    ctx.drawImage(s || img, sx * r, sy * r, sw * r, sh * r, dx, dy, dw, dh);
  }

  params(): WallParams {
    const doc = this.doc;
    const join = doc.querySelector<HTMLInputElement>('input[name=join]:checked')!.value as WallParams['join'];
    const split = doc.querySelector<HTMLInputElement>('input[name=split]:checked')!.value as WallParams['split'];
    const material = this.val('material');
    const order = this.val('order');
    return {
      wallW: num(this.val('wallW')),
      wallH: num(this.val('wallH')),
      mT: num(this.val('mT')),
      mB: num(this.val('mB')),
      mL: num(this.val('mL')),
      mR: num(this.val('mR')),
      join,
      overlap: join === 'butt' ? BUTT_OVERLAP_CM : num(this.val('overlap')),
      split,
      count: parseInt(this.val('count'), 10),
      widths: [...doc.querySelectorAll<HTMLInputElement>('#widthsBox input')].map(el =>
        el.value.trim() === '' ? NaN : num(el.value),
      ),
      maxPrint: material === 'own' ? num(this.val('maxPrint')) : material === '' ? Infinity : parseFloat(material),
      dpi: parseInt(this.val('dpi'), 10),
      thru: this.$<HTMLInputElement>('thru').checked,
      pdf: this.$<HTMLInputElement>('pdf').checked,
      order: (order || 'zlecenie').trim().replace(/[^\w\-.,]+/g, '_'),
      orderName: (order || 'zlecenie').trim(), // do wyświetlenia (PDF), bez zamiany spacji na _
    };
  }

  /** Rozdzielczości do wyboru w formularzu (komunikat o limicie przeglądarki proponuje jedną z nich). */
  private dpiOptions(): number[] {
    return [...this.doc.querySelectorAll<HTMLOptionElement>('#dpi option')].map(o => +o.value);
  }
  private validate(p: WallParams): string[] {
    return validate(p, this.dpiOptions());
  }
  private fit(L: Layout, iw: number, ih: number): ReturnType<typeof fitImage> {
    return fitImage(L, iw, ih, this.crop);
  }

  /** Zmiana ustawień unieważnia wcześniej wygenerowane pliki. */
  changed(): void {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    const dl = this.$('dl');
    if (dl.innerHTML) {
      dl.innerHTML = '';
      this.lastUrls.forEach(u => URL.revokeObjectURL(u));
      this.lastUrls = [];
    }
    this.render();
  }
  // Przeciąganie kadru i suwak powiększenia: najwyżej jedno przerysowanie na klatkę ekranu.
  private changedSoon(): void {
    if (!this.frame)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.changed();
      });
  }

  // Pola szerokości: tyle, ile brytów. Nowe pola dostają szerokość z równego podziału, ostatnie zostaje puste = reszta.
  private syncWidths(): void {
    const box = this.$('widthsBox');
    const n = Math.min(MAX_BRYTY, Math.max(1, parseInt(this.val('count'), 10) || 1));
    const cur = [...box.querySelectorAll('input')];
    // Po przełączeniu na „własne” pola startują od aktualnego równego podziału – ale tylko gdy użytkownik ich
    // nie zmieniał (wpisane szerokości zostają).
    const custom = this.doc.querySelector<HTMLInputElement>('input[name=split]:checked')!.value === 'custom';
    const entering = custom && !this.widthsWasCustom;
    this.widthsWasCustom = custom;
    const vals = cur.map(el => el.value);
    const auto = this.widthsAuto;
    const fresh = entering && !!auto && vals.length === auto.length && vals.every((v, i) => v === auto[i]);
    if (cur.length === n && !fresh) return;
    const p = this.params();
    const eq = equalSplitCm(p.wallW + p.mL + p.mR, n, p.overlap);
    box.innerHTML = '';
    const written: string[] = [];
    for (let i = 0; i < n; i++) {
      // Przy równym podziale nowe pola zawsze z równego podziału.
      const v = i === n - 1 ? '' : custom && !fresh && vals[i] ? vals[i] : eq;
      written.push(String(v));
      box.insertAdjacentHTML(
        'beforeend',
        `<div><label for="bw${i}">Bryt ${i + 1}</label><input id="bw${i}" type="number" min="1" step="0.1" value="${v}"${i === n - 1 ? ' placeholder="reszta"' : ''}></div>`,
      );
    }
    this.widthsAuto = written.every((v, i) => i === n - 1 || v === String(eq)) ? written : null;
  }

  render(): void {
    const W = this.win;
    const img = this.img;
    this.$('maxBox').hidden = this.val('material') !== 'own';
    this.syncWidths();
    const p = this.params();
    this.$('customBox').hidden = p.split !== 'custom';
    this.$<HTMLInputElement>('overlap').disabled = p.join === 'butt';
    this.$('zoomVal').textContent = Math.round(this.crop.zoom * 100) + '%';
    const errs = this.validate(p);
    this.$('msg').innerHTML = errorsHtml(errs);
    this.$<HTMLButtonElement>('go').disabled = this.genBusy || !img || errs.length > 0;
    if (W.Wycena) W.Wycena.update(p, errs.length ? null : computeLayout(p));
    const cv = this.$<HTMLCanvasElement>('preview');
    const ctx = cv.getContext('2d')!;
    if (errs.length) {
      this.$('tbl').innerHTML = '';
      this.$('calc').innerHTML = '';
      this.view = null;
      if (W.Jakosc) W.Jakosc.update(null);
      return;
    }
    const L = computeLayout(p);
    const n = L.bWs.length;
    this.$('tbl').innerHTML = brytTableHtml(L);

    let calc = calcBase(p, L);
    if (img) {
      const F = this.fit(L, img.naturalWidth, img.naturalHeight);
      calc += calcImage(p, F);
      if (W.Jakosc) calc += W.Jakosc.update(p, L, img, F, this.crop.zoom);
      else if (sourcePxPerMeter(p.dpi, F) < 1000)
        calc += ` <span class="warn">Poniżej 1000 px/m – zdjęcie może być nieostre w druku.</span>`;
    }
    calc += warningsHtml([...layoutWarnings(p, L), ...(W.Sciana ? W.Sciana.warnings(p, L) : [])]);
    this.$('calc').innerHTML = calc;

    // Górny podgląd: całość z naddatkami, podziałem i kadrem.
    const gap = 14;
    const sc = Math.min((cv.width - 20) / L.panoW, 280 / L.bH);
    const brSc = Math.min((cv.width - 20 - (n - 1) * gap) / L.bWs.reduce((a, x) => a + x, 0), 200 / L.bH);
    const pad = 36;
    cv.height = Math.round(L.bH * sc + L.bH * brSc + 2 * pad + 50);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const ox = (cv.width - L.panoW * sc) / 2;
    const oy = pad;
    const view = (this.view = { ox, oy, sc, w: L.panoW * sc, h: L.bH * sc, L });

    if (img) {
      const F = this.fit(L, img.naturalWidth, img.naturalHeight);
      // Całe zdjęcie przygaszone (część poza kadrem), potem kadr w pełnych kolorach.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, cv.width, oy + L.bH * sc + pad);
      ctx.clip();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(
        img.preview || img,
        ox - F.cx * sc,
        oy + (L.band - F.cy) * sc,
        img.naturalWidth * F.s * sc,
        img.naturalHeight * F.s * sc,
      );
      ctx.restore();
      this.drawFast(
        ctx,
        F.cx / F.s,
        F.cy / F.s,
        L.panoW / F.s,
        L.imgH / F.s,
        ox,
        oy + L.band * sc,
        L.panoW * sc,
        L.imgH * sc,
      );
    } else {
      ctx.fillStyle = '#ddd';
      ctx.fillRect(ox, oy, L.panoW * sc, L.bH * sc);
    }
    if (L.band) {
      ctx.fillStyle = THRU_RGB;
      ctx.fillRect(ox, oy, L.panoW * sc, L.band * sc);
      ctx.fillRect(ox, oy + (L.bH - L.band) * sc, L.panoW * sc, L.band * sc);
    }
    for (let i = 1; i < n; i++) {
      if (L.ov > 0) {
        ctx.fillStyle = 'rgba(10,126,164,.35)';
        ctx.fillRect(ox + L.xs[i]! * sc, oy, L.ov * sc, L.bH * sc);
      } else {
        ctx.fillStyle = '#0a7ea4';
        ctx.fillRect(ox + L.xs[i]! * sc - 1, oy, 2, L.bH * sc);
      }
    }
    const mt = cmToPx(p.mT, p.dpi) * sc;
    const mbm = cmToPx(p.mB, p.dpi) * sc;
    const ml = cmToPx(p.mL, p.dpi) * sc;
    const mr = cmToPx(p.mR, p.dpi) * sc;
    const Wd = L.panoW * sc;
    const H = L.bH * sc;
    ctx.fillStyle = 'rgba(220,38,38,.25)';
    ctx.fillRect(ox, oy, Wd, mt);
    ctx.fillRect(ox, oy + H - mbm, Wd, mbm);
    ctx.fillRect(ox, oy + mt, ml, H - mt - mbm);
    ctx.fillRect(ox + Wd - mr, oy + mt, mr, H - mt - mbm);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + ml, oy + mt, Wd - ml - mr, H - mt - mbm);

    if (W.Sciana) W.Sciana.draw(ctx, view, p);
    if (W.Probka) W.Probka.draw(ctx, view, p);
    if (W.Jakosc) W.Jakosc.draw(ctx, view);

    // Dolny podgląd: bryty osobno.
    const by = oy + L.bH * sc + pad + 22;
    const totalBr = L.bWs.reduce((a, x) => a + x * brSc, 0) + (n - 1) * gap;
    let x = (cv.width - totalBr) / 2;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      this.drawBryt(ctx, L, i, x, by, brSc, true, true);
      ctx.fillStyle = '#1d1d1b';
      ctx.fillText(String(i + 1), x + (L.bWs[i]! * brSc) / 2, by - 6);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, by, L.bWs[i]! * brSc, L.bH * brSc);
      x += L.bWs[i]! * brSc + gap;
    }
    cv.classList.toggle('drag', !!img);
  }

  // Rysuje bryt i (w px docelowych × k) w punkcie (x, y).
  // bands = false: tylko pole zdjęcia (wysokość imgH), bez pasków – do pliku PDF, gdzie paski są osobnymi obiektami.
  private drawBryt(
    ctx: CanvasRenderingContext2D,
    L: Layout,
    i: number,
    x: number,
    y: number,
    k: number,
    bands = true,
    fast = false,
  ): void {
    const bW = L.bWs[i]!;
    const top = bands ? L.band : 0;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, bW * k, (bands ? L.bH : L.imgH) * k);
    const img = this.img;
    if (img) {
      const F = this.fit(L, img.naturalWidth, img.naturalHeight);
      const a = [
        (L.xs[i]! + F.cx) / F.s,
        F.cy / F.s,
        bW / F.s,
        L.imgH / F.s,
        x,
        y + top * k,
        bW * k,
        L.imgH * k,
      ] as const;
      if (fast) this.drawFast(ctx, ...a);
      else ctx.drawImage(img, ...a);
    }
    if (bands && L.band) {
      ctx.fillStyle = THRU_RGB;
      ctx.fillRect(x, y, bW * k, L.band * k);
      ctx.fillRect(x, y + (L.bH - L.band) * k, bW * k, L.band * k);
    }
  }

  /** Punkt zdarzenia w pikselach płótna podglądu. */
  canvasPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const cv = this.$<HTMLCanvasElement>('preview');
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * cv.width) / r.width, y: ((e.clientY - r.top) * cv.height) / r.height };
  }

  // Renderuje bryt do JPG (z DPI w nagłówku).
  private async renderJpeg(L: Layout, i: number, dpi: number, bands: boolean): Promise<Blob> {
    const cv = this.doc.createElement('canvas');
    cv.width = L.bWs[i]!;
    cv.height = bands ? L.bH : L.imgH;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.drawBryt(ctx, L, i, 0, 0, 1, bands);
    const raw = await canvasJpeg(cv).catch(() => {
      throw new Error('Przeglądarka nie zapisała pliku (za mało pamięci?).');
    });
    cv.width = cv.height = 0;
    return withDpi(raw, dpi);
  }

  /** Podgląd całości (bez pasków) w niższej rozdzielczości – JPG całości i sekcje poglądowe w PDF/CDR. */
  async renderPano(L: Layout, maxW: number): Promise<{ blob: Blob; w: number; h: number }> {
    const img = this.img!;
    const k = Math.min(1, maxW / L.panoW);
    const cv = this.doc.createElement('canvas');
    cv.width = Math.round(L.panoW * k);
    cv.height = Math.round(L.imgH * k);
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const F = this.fit(L, img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, F.cx / F.s, F.cy / F.s, L.panoW / F.s, L.imgH / F.s, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob>((res, rej) =>
      cv.toBlob(b => (b ? res(b) : rej(new Error('Nie udało się zapisać podglądu.'))), 'image/jpeg', 0.85),
    );
    return { blob, w: cv.width, h: cv.height };
  }

  // CDR: jeden arkusz jak w DRUK 1 (strona Corela nie ma limitu 5 m). Opis arkusza (cm, y od góry) i pliki JPG
  // trafiają do serwera, który przez CorelDRAW (PowerShell + COM) zapisuje plik .cdr.
  private async makeCdr(
    L: Layout,
    p: WallParams,
    jpegs: Blob[],
    pano: { blob: Blob },
  ): Promise<{ blob: Blob; name: string; pageW: number; pageH: number; folder: string }> {
    const files = [pano.blob, ...jpegs];
    const link = !!this.doc.querySelector<HTMLInputElement>('#cdrLink')?.checked;
    const job = cdrJob(
      new ProductionSheet(L, p),
      p,
      files.map(b => b.size),
      link,
    );
    const res = await this.win.fetch('/api/cdr', {
      method: 'POST',
      body: new Blob(cdrRequestParts(job, files) as BlobPart[]),
    });
    if (!res.ok) throw new Error('CorelDRAW: ' + (await res.text()));
    const folder = decodeURIComponent(res.headers.get('X-Folder') || '');
    return { blob: await res.blob(), name: job.name, pageW: job.pageW, pageH: job.pageH, folder };
  }

  private async makeZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
    const entries: ZipEntry<Blob>[] = [];
    for (const f of files) entries.push({ name: f.name, size: f.blob.size, crc: await crc32(f.blob), data: f.blob });
    return new Blob(zipParts(entries) as BlobPart[], { type: 'application/zip' });
  }

  // W trakcie generowania strona jest zablokowana (inert): zmiana kadru albo ustawień między brytami dawała
  // bryty niepasujące do siebie na zakładzie, a ponowny klik – dwa przebiegi piszące do tej samej listy plików.
  private async generate(): Promise<void> {
    if (this.genBusy) return;
    const p = this.params();
    if (this.validate(p).length || !this.img) return;
    const L = computeLayout(p);
    const n = L.bWs.length;
    this.genBusy = true;
    const msg = this.$('msg');
    const dl = this.$('dl');
    // Blokujemy wszystko poza komunikatami i listą plików (#msg, #dl zostają dostępne dla czytników ekranu).
    const zones = [
      ...this.doc.querySelectorAll<HTMLElement>('.panel > :not(.actions), .actions > :not(#msg):not(#dl), .stage'),
    ];
    zones.forEach(z => (z.inert = true));
    this.$<HTMLButtonElement>('go').disabled = true;
    dl.innerHTML = '';
    this.lastUrls.forEach(u => URL.revokeObjectURL(u));
    this.lastUrls = [];
    const files: { name: string; blob: Blob }[] = [];
    const pdfJpegs: Blob[] = [];
    const link = (blob: Blob): string => {
      const u = URL.createObjectURL(blob);
      this.lastUrls.push(u);
      return u;
    };
    try {
      for (let i = 0; i < n; i++) {
        msg.innerHTML = `Generuję bryt ${i + 1} z ${n}…`;
        await new Promise(r => setTimeout(r, 30));
        const blob = await this.renderJpeg(L, i, p.dpi, true);
        // Bez paska thru cut bryt do PDF/CDR jest identyczny z JPG – nie liczymy go drugi raz.
        if (p.pdf) pdfJpegs.push(L.band ? await this.renderJpeg(L, i, p.dpi, false) : blob);
        const name = `bryt_${p.order}_${i + 1}.jpg`;
        files.push({ name, blob });
        dl.insertAdjacentHTML(
          'beforeend',
          `<a href="${link(blob)}" download="${name}">${name} (${mb(blob.size)} MB)</a>`,
        );
      }
      // Cała grafika po złączeniu brytów (z naddatkiem, bez pasków thru cut), maks. 8000 px szerokości.
      msg.innerHTML = 'Generuję JPG całości…';
      const whole = await this.renderPano(L, 8000);
      const wholeName = `calosc_${p.order}.jpg`;
      files.push({ name: wholeName, blob: whole.blob });
      dl.insertAdjacentHTML(
        'beforeend',
        `<a href="${link(whole.blob)}" download="${wholeName}">${wholeName} – cała grafika (${whole.w} × ${whole.h} px, ${mb(whole.blob.size)} MB)</a>`,
      );
      let pdfNote = '';
      let cdrError = '';
      let pano: { blob: Blob; w: number; h: number } | null = null;
      if (p.pdf && this.cdrReady) {
        msg.innerHTML = 'CorelDRAW tworzy plik .cdr… (to może potrwać kilka minut)';
        pano = await this.renderPano(L, 4000);
        let cdr: Awaited<ReturnType<BrytyPage['makeCdr']>> | null = null;
        try {
          cdr = await this.makeCdr(L, p, pdfJpegs, pano);
        } catch (e) {
          cdrError = (e as Error).message;
        }
        if (cdr) {
          files.push({ name: cdr.name, blob: cdr.blob });
          dl.insertAdjacentHTML(
            'beforeend',
            `<br><a href="${link(cdr.blob)}" download="${cdr.name}"><b>${cdr.name}</b> – plik CorelDRAW (${mb(cdr.blob.size)} MB)</a>`,
          );
          pdfNote = cdrNote(cdr.pageW, cdr.pageH, cdr.folder ? esc(cdr.folder) : '');
        }
      }
      if (p.pdf && (!this.cdrReady || cdrError)) {
        msg.innerHTML = 'Tworzę plik PDF dla Corela…';
        if (!pano) pano = await this.renderPano(L, 4000);
        const pdf = productionPdf(
          L,
          p,
          pdfJpegs.map((b, i) => blobPdfImage(b, L.bWs[i]!, L.imgH)),
          blobPdfImage(pano.blob, pano.w, pano.h),
        );
        const blob = new Blob(pdf.parts as BlobPart[], { type: 'application/pdf' });
        const name = `bryty_${p.order}.pdf`;
        files.push({ name, blob });
        dl.insertAdjacentHTML(
          'beforeend',
          `<br><a href="${link(blob)}" download="${name}">${name} – plik dla CorelDRAW, otwórz w Corelu i zapisz jako .cdr (${mb(blob.size)} MB)</a>`,
        );
        pdfNote = ` PDF: jeden arkusz jak w Corelu (legenda, podział, bryty 1:1).`;
        if (cdrError)
          pdfNote += ` <span class="err">Nie udało się zapisać .cdr, zamiast niego jest PDF. ${esc(cdrError)}</span>`;
      }
      msg.innerHTML = 'Pakuję ZIP…';
      try {
        const zip = await this.makeZip(files);
        dl.insertAdjacentHTML(
          'afterbegin',
          `<a href="${link(zip)}" download="bryty_${p.order}.zip"><b>Pobierz wszystkie (ZIP)</b></a><br>`,
        );
      } catch (e) {
        // Zbyt duży komplet (pamięć przeglądarki) – pliki pojedynczo są już na liście.
        pdfNote += ` <span class="err">ZIP nie powstał (${esc((e as Error).message)}) – pobierz pliki pojedynczo z listy poniżej.</span>`;
      }
      msg.innerHTML = doneMessage(n, L.bH, p.dpi, pdfNote);
    } catch (e) {
      msg.innerHTML = `<span class="err">Błąd: ${esc((e as Error).message)}</span>`;
    } finally {
      this.genBusy = false;
      zones.forEach(z => (z.inert = false));
      this.$<HTMLButtonElement>('go').disabled = false;
    }
  }

  private loadFile(f: File): void {
    const W = this.win;
    // Numer grafiki: rośnie przy nowym zdjęciu/wzorze, ale nie przy podmianie na powiększoną wersję tej samej
    // grafiki (AI ustawia keepCropOnce). Galeria i wizualizacja AI sprawdzają po nim, czy wynik jest aktualny.
    if (!W.keepCropOnce) W.grafikaId = (W.grafikaId || 0) + 1;
    const im = new Image() as PageImage;
    const u = URL.createObjectURL(f);
    const seq = ++this.loadSeq;
    im.onload = (): void => {
      if (seq !== this.loadSeq) {
        URL.revokeObjectURL(u);
        return;
      }
      this.img = im;
      // Duże zdjęcie: do podglądu mniejsza kopia; pliki do druku i fragment 1:1 biorą pełne zdjęcie.
      const big = Math.max(im.naturalWidth, im.naturalHeight);
      if (big > PREVIEW_MAX) {
        const r = PREVIEW_MAX / big;
        const c = this.doc.createElement('canvas');
        c.width = Math.round(im.naturalWidth * r);
        c.height = Math.round(im.naturalHeight * r);
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.drawImage(im, 0, 0, c.width, c.height);
        im.preview = c;
      }
      if (W.keepCropOnce)
        W.keepCropOnce = false; // podmiana na powiększoną wersję – kadr zostaje
      else {
        this.crop.zoom = 1;
        this.crop.fx = this.crop.fy = 0.5;
        this.$<HTMLInputElement>('zoom').value = '100';
      }
      this.$('imgInfo').textContent = `${f.name}: ${im.naturalWidth} × ${im.naturalHeight} px`;
      // Poprzednie zdjęcie (np. przed powiększeniem AI, setki MB) zwalniamy z pamięci.
      if (this.imgUrl && this.imgUrl !== u) URL.revokeObjectURL(this.imgUrl);
      this.imgUrl = u;
      this.changed();
    };
    im.onerror = (): void => {
      URL.revokeObjectURL(u);
      this.$('imgInfo').innerHTML = '<span class="err">Nie udało się wczytać pliku.</span>';
    };
    im.src = u;
  }

  // Zapis .cdr działa, gdy serwer ma CorelDRAW; inaczej powstaje PDF do ręcznego zapisania w Corelu.
  private async checkCdr(): Promise<void> {
    const info = this.$('cdrInfo');
    try {
      const r = this.win.location.protocol.startsWith('http') ? await this.win.fetch('/api/health') : null;
      const h = r && r.ok ? ((await r.json()) as { corel?: unknown }) : null;
      this.cdrReady = !!(h && h.corel);
      info.textContent = cdrInfoText(h);
      if (this.cdrReady) this.showCdrOption(info);
    } catch {
      info.textContent = cdrInfoText(null);
    }
  }

  /** Opcja obrazów linkowanych w .cdr (domyślnie osadzone – plik działa po przeniesieniu i wysłaniu). */
  private showCdrOption(info: HTMLElement): void {
    if (this.doc.getElementById('cdrLink')) return;
    info.insertAdjacentHTML(
      'afterend',
      '<label class="check" id="cdrLinkBox"><input id="cdrLink" type="checkbox"> Obrazy w .cdr jako linki do plików JPG (mniejszy .cdr, ale działa tylko razem z folderem JPG na tym komputerze)</label>',
    );
  }

  start(): void {
    const cv = this.$<HTMLCanvasElement>('preview');
    // Przeciąganie kadru na górnym podglądzie.
    cv.addEventListener('pointerdown', e => {
      if (!this.img || !this.view) return;
      const pt = this.canvasPoint(e);
      if (pt.y > this.view.oy + this.view.h) return;
      this.dragFrom = { pt, fx: this.crop.fx, fy: this.crop.fy };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      const d = this.dragFrom;
      const v = this.view;
      if (!d || !v) return;
      const pt = this.canvasPoint(e);
      const F = this.fit(v.L, this.img!.naturalWidth, this.img!.naturalHeight);
      const dx = (pt.x - d.pt.x) / v.sc;
      const dy = (pt.y - d.pt.y) / v.sc;
      this.crop.fx = F.exW > 0 ? Math.min(1, Math.max(0, d.fx - dx / F.exW)) : 0.5;
      this.crop.fy = F.exH > 0 ? Math.min(1, Math.max(0, d.fy - dy / F.exH)) : 0.5;
      this.changedSoon();
    });
    for (const ev of ['pointerup', 'pointercancel'])
      cv.addEventListener(ev, () => {
        this.dragFrom = null;
      });
    const zoom = this.$<HTMLInputElement>('zoom');
    zoom.addEventListener('input', () => {
      this.crop.zoom = +zoom.value / 100;
      this.changedSoon();
    });
    this.$('center').addEventListener('click', () => {
      this.crop.fx = this.crop.fy = 0.5;
      this.crop.zoom = 1;
      zoom.value = '100';
      this.changed();
    });
    this.$<HTMLInputElement>('file').addEventListener('change', e => {
      const f = (e.target as HTMLInputElement).files![0];
      if (f) this.loadFile(f);
    });
    const changed = (): void => this.changed();
    this.doc
      .querySelectorAll('input:not([type=file]):not(#zoom), select')
      .forEach(el => el.addEventListener('input', changed));
    this.$('widthsBox').addEventListener('input', changed);
    this.$('go').addEventListener('click', () => void this.generate());
    void this.checkCdr();
    const W = this.win;
    if (W.Sciana) W.Sciana.init();
    if (W.Montaz) W.Montaz.init();
    if (W.Probka) W.Probka.init();
    if (W.Jakosc) W.Jakosc.init();
    this.render();
  }
}

// Stan strony dla pozostałych modułów (każdy jest osobnym skryptem): jeden obiekt window.Bryty zamiast
// globalnych zmiennych starego bryty.js (img, crop, params, render, changed, canvasPoint, renderPano, layout).
const bryty = new BrytyPage(window as BrytyWindow);
Object.assign(window, {
  Bryty: {
    img: () => bryty.img,
    crop: bryty.crop,
    params: () => bryty.params(),
    render: () => bryty.render(),
    changed: () => bryty.changed(),
    canvasPoint: (e: PointerEvent) => bryty.canvasPoint(e),
    renderPano: (L: Layout, maxW: number) => bryty.renderPano(L, maxW),
    layout: (p: WallParams) => computeLayout(p),
  },
});
bryty.start();

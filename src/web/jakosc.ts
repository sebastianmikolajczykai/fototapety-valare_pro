// Kontrola jakości zdjęcia (okno pod tabelą brytów) – odpowiednik starego jakosc.js. Ocena, progi i teksty
// w domenie (src/domain/quality.ts); tu okno, fragment 1:1 do przeciągania i zielona ramka na podglądzie.
// Haki: <div id="jakoscBox"></div>; bryty.js wywołuje Jakosc.update(p, L, img, F, zoom) w render() (zwraca
// ostrzeżenie do #calc), Jakosc.draw(ctx, view) po podglądzie i Jakosc.init() na końcu. galeria.js czyta Jakosc.prog.
// Do czasu przepisania bryty.js okno wystawia globalny obiekt Jakosc.
import type { Layout } from '../domain/layout';
import { QUALITY_DEFAULTS, QUALITY_LEVELS, QualityAssessor, sourcePxPerM } from '../domain/quality';

/** Kadr z bryty.js: s = px druku na 1 px zdjęcia, cx/cy = przesunięcie kadru w px druku. */
export interface Crop {
  s: number;
  cx: number;
  cy: number;
}
/** Podgląd z bryty.js: skala i początek rysunku na płótnie #preview. */
export interface PreviewView {
  sc: number;
  ox: number;
  oy: number;
  L: Layout;
}
type Img = CanvasImageSource & { naturalWidth: number; naturalHeight: number };
interface Last {
  p: { dpi: number };
  L: Layout;
  img: Img;
  F: Crop;
  zoom: number;
  box?: { x0: number; y0: number; fw: number; fh: number };
}

const fmt = (x: number): string => Math.round(x).toLocaleString('pl-PL');
const clamp = (x: number): number => Math.min(1, Math.max(0, x));

// Wygląd okna (skopiowany 1:1 ze starego programu).
const CSS = `
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

export class QualityPanel {
  /** Środek fragmentu 1:1 jako ułamek pola zdjęcia; x2 = podgląd 200%. */
  private readonly frag = { u: 0.5, v: 0.5, x2: false };
  private last: Last | null = null;

  constructor(
    private readonly win: Window & typeof globalThis,
    readonly assessor: QualityAssessor = new QualityAssessor(),
  ) {}

  private get doc(): Document {
    return this.win.document;
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }

  /** Całe przeliczenie strony (render z bryty.js), a bez niego tylko to okno. */
  private rerender(fallback: () => void): void {
    const render = (this.win as unknown as { render?: unknown }).render;
    if (typeof render === 'function') (render as () => void)();
    else fallback();
  }

  private css(): void {
    const s = this.doc.createElement('style');
    s.textContent = CSS;
    this.doc.head.appendChild(s);
  }

  private build(): void {
    const box = this.el('jakoscBox');
    if (!box) return;
    const prog = this.assessor.thresholds;
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
      `<div class="row"><div><label for="jqGood">Dobra od [px/m]</label><input id="jqGood" type="number" min="1" step="50" value="${prog.good}"></div>` +
      `<div><label for="jqMin">Za słaba poniżej [px/m]</label><input id="jqMin" type="number" min="1" step="50" value="${prog.min}"></div></div>` +
      '<div class="hint">Domyślnie: dobra od 2500 px/m (np. ściana 5×3 m → 12 500×7 500 px), za słaba poniżej 1000 px/m.</div></details>';
    box.hidden = true;
    const good = this.el<HTMLInputElement>('jqGood')!;
    const min = this.el<HTMLInputElement>('jqMin')!;
    const onProg = (e: Event): void => {
      e.stopPropagation();
      this.assessor.setThresholds(parseFloat(good.value), parseFloat(min.value));
      // Cały podgląd (bez kasowania wygenerowanych plików), żeby ostrzeżenie pod ustawieniami też się zmieniło.
      this.rerender(() => this.refresh());
    };
    good.addEventListener('input', onProg);
    min.addEventListener('input', onProg);
    this.el('jqX2')!.addEventListener('input', e => {
      e.stopPropagation();
      this.frag.x2 = (e.target as HTMLInputElement).checked;
      this.drawFrag();
    });
    this.dragging(this.el<HTMLCanvasElement>('jakoscCanvas')!);
    this.win.addEventListener('resize', () => this.drawFrag());
  }

  /** Przeciąganie fragmentu 1:1 (przesuwa miejsce w polu zdjęcia). */
  private dragging(cv: HTMLCanvasElement): void {
    let from: { x: number; y: number; u: number; v: number } | null = null;
    let raf = 0;
    cv.addEventListener('pointerdown', e => {
      if (!this.last) return;
      from = { x: e.clientX, y: e.clientY, u: this.frag.u, v: this.frag.v };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('drag');
    });
    cv.addEventListener('pointermove', e => {
      const last = this.last;
      if (!from || !last) return;
      const k = this.frag.x2 ? 2 : 1;
      this.frag.u = clamp(from.u - (e.clientX - from.x) / k / last.L.panoW);
      this.frag.v = clamp(from.v - (e.clientY - from.y) / k / last.L.imgH);
      // jedno przerysowanie na klatkę (render() i tak rysuje fragment i przesuwa zieloną ramkę na podglądzie)
      if (!raf)
        raf = this.win.requestAnimationFrame(() => {
          raf = 0;
          this.rerender(() => this.drawFrag());
        });
    });
    for (const ev of ['pointerup', 'pointercancel'])
      cv.addEventListener(ev, () => {
        from = null;
        cv.classList.remove('drag');
      });
  }

  private pxPerM(last: Last): number {
    return sourcePxPerM(last.p.dpi, last.F.s);
  }

  /** Z render(): bez zdjęcia albo przy błędach (null). Zwraca HTML ostrzeżenia do #calc (albo ''). */
  update(p: Last['p'] | null, L?: Layout, img?: Img, F?: Crop, zoom?: number): string {
    const box = this.el('jakoscBox');
    if (!p || !L || !img || !F) {
      this.last = null;
      if (box) box.hidden = true;
      return '';
    }
    const last: Last = { p, L, img, F, zoom: zoom || 1 };
    this.last = last;
    this.refresh();
    return this.assessor.warningHtml(this.pxPerM(last), last.zoom);
  }

  private refresh(): void {
    const box = this.el('jakoscBox');
    const last = this.last;
    if (!box || !last) return;
    box.hidden = false;
    const { p, L, img, zoom } = last;
    const prog = this.assessor.thresholds;
    const v = this.pxPerM(last);
    const lv = QUALITY_LEVELS[this.assessor.assess(v, zoom).level];
    const badge = this.el('jqBadge')!;
    badge.textContent = lv.name;
    badge.className = 'jq-badge ' + lv.cls;
    this.el('jqText')!.textContent = lv.text;

    // Pasek skali 0 … 1,5 × próg „dobra”, ze wskaźnikiem.
    const max = prog.good * 1.5;
    const pc = (x: number): number => Math.min(100, (x / max) * 100);
    this.el('jqScale')!.innerHTML =
      `<i style="width:${pc(prog.min)}%;background:var(--err)"></i>` +
      `<i style="width:${pc(prog.good) - pc(prog.min)}%;background:var(--warn)"></i>` +
      `<i style="width:${100 - pc(prog.good)}%;background:var(--accent)"></i><b style="left:${pc(v)}%"></b>`;
    this.el('jqTicks')!.innerHTML =
      `<span style="left:${pc(prog.min)}%">${fmt(prog.min)}</span><span style="left:${pc(prog.good)}%">${fmt(prog.good)} px/m</span>`;
    const facts = this.assessor.facts({
      dpi: p.dpi,
      L,
      imgW: img.naturalWidth,
      imgH: img.naturalHeight,
      pxPerM: v,
      zoom,
    });
    this.el('jqFacts')!.innerHTML = facts.map(x => `<li>${x}</li>`).join('');
    this.drawFrag();
  }

  /** Fragment pola zdjęcia w pikselach druku 1:1 (albo 2:1 przy „powiększ 200%”), bez wygładzania przy 200%. */
  private drawFrag(): void {
    const cv = this.el<HTMLCanvasElement>('jakoscCanvas');
    const last = this.last;
    if (!cv || !last) return;
    const wrap = cv.parentElement!;
    const w = Math.max(160, Math.min(1000, (wrap.clientWidth || 400) - 2));
    if (cv.width !== w) cv.width = w;
    cv.style.width = w + 'px';
    cv.style.height = cv.height + 'px';
    const { L, img, F } = last;
    const k = this.frag.x2 ? 2 : 1;
    const fw = cv.width / k; // rozmiar fragmentu w px druku
    const fh = cv.height / k;
    const x0 = Math.max(0, Math.min(L.panoW - fw, this.frag.u * L.panoW - fw / 2));
    const y0 = Math.max(0, Math.min(L.imgH - fh, this.frag.v * L.imgH - fh / 2));
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    // 1) fragment w rozdzielczości druku (jak w pliku JPG), 2) ewentualne powiększenie 2× bez wygładzania
    const tmp = this.doc.createElement('canvas');
    tmp.width = Math.ceil(fw);
    tmp.height = Math.ceil(fh);
    const t = tmp.getContext('2d')!;
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = 'high';
    t.drawImage(img, (x0 + F.cx) / F.s, (y0 + F.cy) / F.s, fw / F.s, fh / F.s, 0, 0, fw, fh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tmp.width * k, tmp.height * k);
    last.box = { x0, y0, fw, fh };
    const cm = (px: number): string => ((px / last.p.dpi) * 2.54).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
    this.el('jqFragInfo')!.textContent =
      `Widoczny fragment: ${cm(fw)} × ${cm(fh)} cm ściany. Przeciągnij, żeby obejrzeć inne miejsce. Zielona ramka na podglądzie pokazuje, gdzie jest.`;
  }

  /** Zielona ramka fragmentu na górnym podglądzie. */
  draw(ctx: CanvasRenderingContext2D, view: PreviewView | null): void {
    const b = this.last?.box;
    if (!b || !view || this.el('jakoscBox')!.hidden) return;
    const sc = view.sc;
    const x = view.ox + b.x0 * sc;
    const y = view.oy + (view.L.band + b.y0) * sc;
    const w = Math.max(6, b.fw * sc);
    const h = Math.max(6, b.fh * sc);
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#25c09e';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  init(): void {
    this.css();
    this.build();
  }
}

const panel = new QualityPanel(window);

// Zgodność ze starymi skryptami strony (bryty.js, galeria.js) – do czasu ich przepisania.
Object.assign(window, {
  Jakosc: {
    init: () => panel.init(),
    update: (p: Last['p'] | null, L?: Layout, img?: Img, F?: Crop, zoom?: number) => panel.update(p, L, img, F, zoom),
    draw: (ctx: CanvasRenderingContext2D, view: PreviewView | null) => panel.draw(ctx, view),
    assess: (pxPerM: number, zoom: number) => panel.assessor.assess(pxPerM, zoom),
    DEFAULTS: QUALITY_DEFAULTS,
    /** Aktualne progi (galeria.js ukrywa wzory za słabe na wymiary ściany). */
    get prog() {
      return panel.assessor.thresholds;
    },
  },
});

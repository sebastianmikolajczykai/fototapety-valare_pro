// Próbka 40×60 cm (krok 9) – odpowiednik starego probka.js. Geometria, nazwy i komunikaty w domenie
// (src/domain/sample.ts); tu panel, prostokąt próbki na podglądzie (z przeciąganiem) i zapis pliku JPG.
// Haki: <div id="probkaBox"></div>; bryty.js wywołuje Probka.draw(ctx, view, p) po podglądzie i Probka.init().
// Stan zdjęcia i kadru czytany z bryty.js (src/web/legacy.ts) do czasu jego przepisania.
import { THRU_RGB } from '../domain/constants';
import { computeLayout, fitImage, type Layout, type WallParams } from '../domain/layout';
import {
  SAMPLE_PRICE_ZL,
  sampleDoneMessage,
  sampleFileName,
  sampleGeom,
  sampleInfo,
  type SampleGeom,
  type SamplePos,
} from '../domain/sample';
import { validate } from '../domain/validation';
import { canvasJpeg, withDpi } from './lib/jpeg';
import { page } from './lib/legacy';

/** Podgląd z bryty.js: skala i początek rysunku na płótnie #preview. */
export interface PreviewView {
  sc: number;
  ox: number;
  oy: number;
  L: Layout;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  freeW: number;
  freeH: number;
}

const escHtml = (s: string): string => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export class SamplePanel {
  /** Położenie próbki w obrębie ściany, 0..1 (0,5 = środek). */
  readonly pos: SamplePos = { fx: 0.5, fy: 0.5 };
  private show = false;
  private vertical = true;
  private url: string | null = null;
  private urlKey = '';
  private rect: Rect | null = null;
  private drag: { pt: { x: number; y: number }; fx: number; fy: number; r: Rect } | null = null;
  private frame = 0;
  private working = false;
  private lastMsg: string | undefined;

  constructor(private readonly win: Window & typeof globalThis) {}

  private el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.win.document.getElementById(id) as T | null;
  }
  private get go(): HTMLButtonElement {
    return this.el<HTMLButtonElement>('probkaGo')!;
  }

  /** Region aria-live: zapis tylko przy zmianie treści (czytnik ekranu nie czyta przy każdym przerysowaniu). */
  private say(h: string): void {
    if (this.lastMsg !== h) {
      this.lastMsg = h;
      this.el('probkaMsg')!.innerHTML = h;
    }
  }

  geom(p: WallParams, L: Layout): SampleGeom {
    return sampleGeom(p, L, this.vertical, this.pos);
  }

  private key(p: WallParams): string {
    const im = page.img();
    return JSON.stringify([p, im && im.src, page.crop(), this.pos, this.vertical]);
  }

  private build(box: HTMLElement): void {
    box.innerHTML =
      '<div class="step-head"><span class="num">9</span><h2>Próbka 40×60 cm</h2></div>' +
      `<div class="hint">Wycinek grafiki w skali 1:1, w tej samej rozdzielczości co bryty. Cena wg cennika Valare 2024: <b>${SAMPLE_PRICE_ZL} zł</b>.</div>` +
      '<div class="radios seg" role="radiogroup" aria-label="Układ próbki" style="margin-top:10px">' +
      '<label class="radio"><input type="radio" name="probkaOr" value="v" checked> Pionowo 40×60</label>' +
      '<label class="radio"><input type="radio" name="probkaOr" value="h"> Poziomo 60×40</label></div>' +
      '<label class="check"><input id="probkaShow" type="checkbox"> Pokaż próbkę na podglądzie i ustaw ją przeciągając</label>' +
      '<button id="probkaGo" type="button" disabled style="margin-top:10px;width:100%">Generuj próbkę</button>' +
      '<div id="probkaMsg" class="msg" role="status" aria-live="polite"></div><div id="probkaDl" class="dl"></div>';
  }

  private clearLink(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.urlKey = '';
    this.el('probkaDl')!.innerHTML = '';
  }

  init(): void {
    const box = this.el('probkaBox');
    if (!box) return;
    this.build(box);
    box.addEventListener('change', e => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'probkaOr') this.vertical = t.value === 'v';
      if (t.id === 'probkaShow') this.show = t.checked;
      page.render(); // tylko nakładka próbki – wygenerowane bryty zostają
    });
    this.go.addEventListener('click', () => void this.generate());
    // Przeciąganie próbki ma pierwszeństwo przed przeciąganiem kadru, ale tylko w obrębie prostokąta próbki.
    const cv = this.el<HTMLCanvasElement>('preview')!;
    cv.addEventListener(
      'pointerdown',
      e => {
        const r = this.rect;
        if (!this.show || !r || !page.img()) return;
        const pt = page.canvasPoint(e);
        if (pt.x < r.x || pt.x > r.x + r.w || pt.y < r.y || pt.y > r.y + r.h) return;
        e.stopImmediatePropagation();
        this.drag = { pt, fx: this.pos.fx, fy: this.pos.fy, r };
        cv.setPointerCapture(e.pointerId);
      },
      true,
    );
    cv.addEventListener(
      'pointermove',
      e => {
        const d = this.drag;
        if (!d) return;
        e.stopImmediatePropagation();
        const pt = page.canvasPoint(e);
        if (d.r.freeW > 0) this.pos.fx = Math.min(1, Math.max(0, d.fx + (pt.x - d.pt.x) / d.r.freeW));
        if (d.r.freeH > 0) this.pos.fy = Math.min(1, Math.max(0, d.fy + (pt.y - d.pt.y) / d.r.freeH));
        // jedno przerysowanie na klatkę
        if (!this.frame)
          this.frame = this.win.requestAnimationFrame(() => {
            this.frame = 0;
            page.render();
          });
      },
      true,
    );
    for (const ev of ['pointerup', 'pointercancel']) cv.addEventListener(ev, () => (this.drag = null), true);
  }

  /** Przy każdym odświeżeniu podglądu (po ścianie): stan przycisku, opis i prostokąt próbki. */
  draw(ctx: CanvasRenderingContext2D, view: PreviewView | null, p: WallParams): void {
    if (!this.el('probkaBox')) return;
    const ok = !!page.img() && !!view;
    this.go.disabled = !ok || this.working; // w trakcie tworzenia próbki przycisk zostaje wyłączony
    if (this.url && this.urlKey !== this.key(p)) this.clearLink();
    this.rect = null;
    if (!ok) return this.say('');
    const G = this.geom(p, view.L);
    const sc = view.sc;
    if (!this.url) this.say(sampleInfo(p, G));
    if (!this.show) return;
    const r: Rect = {
      x: view.ox + G.x * sc,
      y: view.oy + (G.y - G.band) * sc,
      w: G.w * sc,
      h: G.h * sc,
      freeW: (G.x1 - G.x0 - G.w) * sc,
      freeH: (G.y1 - G.y0 - G.ih) * sc,
    };
    this.rect = r;
    ctx.save();
    ctx.fillStyle = 'rgba(34,42,53,.18)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#25c09e';
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = '#222a35';
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
    const t = `PRÓBKA ${G.wcm}×${G.hcm}`;
    ctx.font = '600 12px Urbanist, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    const tw = ctx.measureText(t).width + 10;
    ctx.fillStyle = '#25c09e';
    ctx.fillRect(r.x, r.y - 18, tw, 18);
    ctx.fillStyle = '#222a35';
    ctx.fillText(t, r.x + 5, r.y - 5);
    ctx.restore();
  }

  /** Plik próbki: wycinek z tej samej skali co bryty (piksel próbki = piksel brytu), paski thru cut jak w brytach. */
  async render(p: WallParams): Promise<{ blob: Blob; G: SampleGeom; L: Layout }> {
    const im = page.img()!;
    const L = computeLayout(p);
    const G = this.geom(p, L);
    const F = fitImage(L, im.naturalWidth, im.naturalHeight, page.crop());
    const cv = this.win.document.createElement('canvas');
    cv.width = G.w;
    cv.height = G.h;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, G.w, G.h);
    ctx.drawImage(im, (G.x + F.cx) / F.s, (G.y - L.band + F.cy) / F.s, G.w / F.s, G.ih / F.s, 0, G.band, G.w, G.ih);
    if (G.band) {
      ctx.fillStyle = THRU_RGB;
      ctx.fillRect(0, 0, G.w, G.band);
      ctx.fillRect(0, G.h - G.band, G.w, G.band);
    }
    const raw = await canvasJpeg(cv);
    cv.width = cv.height = 0;
    return { blob: await withDpi(raw, p.dpi), G, L };
  }

  async generate(): Promise<void> {
    const p = page.params();
    if (!page.img() || validate(p).length)
      return this.say(
        '<span class="err">Najpierw popraw ustawienia (komunikat nad przyciskiem „Generuj bryty”).</span>',
      );
    if (this.working) return;
    this.working = true;
    this.go.disabled = true;
    this.clearLink();
    try {
      const { blob, G } = await this.render(p);
      const name = sampleFileName(p.order, G);
      this.url = URL.createObjectURL(blob);
      this.urlKey = this.key(p);
      this.el('probkaDl')!.innerHTML =
        `<a href="${this.url}" download="${name}">${name} (${(blob.size / 1e6).toFixed(1)} MB)</a>`;
      this.say(sampleDoneMessage(p, G));
    } catch (e) {
      this.say(`<span class="err">Błąd: ${escHtml(String((e as Error).message))}</span>`);
    } finally {
      this.working = false;
      this.go.disabled = false;
    }
  }
}

const panel = new SamplePanel(window);

// Zgodność ze starymi skryptami strony (bryty.js) – do czasu ich przepisania.
Object.assign(window, {
  Probka: {
    init: () => panel.init(),
    draw: (ctx: CanvasRenderingContext2D, view: PreviewView | null, p: WallParams) => panel.draw(ctx, view, p),
    geom: (p: WallParams, L: Layout) => panel.geom(p, L),
    render: (p: WallParams) => panel.render(p),
    pos: panel.pos,
    PRICE_ZL: SAMPLE_PRICE_ZL,
  },
});

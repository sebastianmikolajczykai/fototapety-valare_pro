// Narożniki, drzwi i okna (sekcja 09) – odpowiednik starego sciana.js. Reguły, ostrzeżenia, propozycja podziału
// i dane dla schematu montażu w domenie (src/domain/wall.ts); tu panel, nakładka na podglądzie i zastosowanie propozycji.
// Uwaga z audytu: w bryty.html nie ma #scianaBox, więc panel nie jest widoczny (jak w starym programie).
// Haki: bryty.js wywołuje Sciana.warnings(p, L) w render(), Sciana.draw(ctx, view, p) i Sciana.init();
// montaz.ts czyta Sciana.data(p, L).
import { computeLayout, type Layout, type WallParams } from '../domain/layout';
import { validate } from '../domain/validation';
import {
  CORNER_MIN_CM,
  OPENING_MIN_CM,
  parseWallField,
  WallFeatures,
  type WallField,
  type WallItem,
  type WallItemType,
} from '../domain/wall';
import { page } from './lib/legacy';

/** Podgląd z bryty.js: skala, początek i wysokość rysunku na płótnie #preview. */
export interface PreviewView {
  sc: number;
  ox: number;
  oy: number;
  h: number;
  L: Layout;
}

export class WallPanel {
  constructor(
    private readonly doc: Document,
    readonly features: WallFeatures = new WallFeatures(),
  ) {}

  private get items(): WallItem[] {
    return this.features.items;
  }

  private rowHtml(it: WallItem, i: number): string {
    const f = (k: WallField, label: string, ph?: string): string =>
      `<div><label>${label}</label><input type="number" step="0.1" data-i="${i}" data-k="${k}" value="${Number.isNaN(it[k]) ? '' : it[k]}"${ph ? ` placeholder="${ph}"` : ''}></div>`;
    const fields =
      it.type === 'corner'
        ? f('x', 'Od lewej [cm]')
        : f('x', 'Od lewej [cm]') +
          f('w', 'Szerokość [cm]') +
          f('y', 'Od podłogi [cm]', it.type === 'door' ? '0' : '') +
          f('h', 'Wysokość [cm]', 'cała');
    return (
      `<div class="scianaRow" style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:13px">${this.features.label(i)}</b>` +
      `<button type="button" class="small" data-del="${i}">Usuń</button></div><div class="row4">${fields}</div></div>`
    );
  }

  private build(): void {
    const box = this.doc.getElementById('scianaBox');
    if (!box) return;
    box.innerHTML =
      '<h2>Narożniki, drzwi i okna</h2>' +
      '<div class="hint">Położenie mierz od lewej krawędzi ściany (bez naddatku). Drzwi i okna drukujemy w całości, montażysta docina je na miejscu. Program pilnuje, żeby łączenia nie wypadły przy narożniku ani przy otworze.</div>' +
      '<div id="scianaRows">' +
      this.items.map((it, i) => this.rowHtml(it, i)).join('') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button type="button" class="small" data-add="corner">+ Narożnik</button>' +
      '<button type="button" class="small" data-add="door">+ Drzwi</button>' +
      '<button type="button" class="small" data-add="window">+ Okno</button></div>' +
      (this.items.length
        ? '<button type="button" class="small" id="scianaSuggest" style="margin-top:10px">Zaproponuj podział omijający narożniki i otwory</button><div id="scianaMsg" class="hint"></div>'
        : '');
  }

  init(): void {
    const box = this.doc.getElementById('scianaBox');
    if (!box) return;
    this.build();
    box.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      if (t.dataset.add) {
        this.features.add(t.dataset.add as WallItemType);
        this.build();
        page.changed();
      } else if (t.dataset.del !== undefined) {
        this.features.remove(+t.dataset.del);
        this.build();
        page.changed();
      } else if (t.id === 'scianaSuggest') this.applySuggestion();
    });
    box.addEventListener('input', e => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.k === undefined) return;
      this.features.update(+t.dataset.i!, t.dataset.k as WallField, parseWallField(t.value));
      page.changed();
    });
  }

  warnings(p: WallParams, L: Layout): string[] {
    return this.features.warnings(p, L);
  }

  /** Propozycja podziału wpisana w pola „własne szerokości” (ostatni bryt = reszta). */
  private applySuggestion(): void {
    const p = page.params();
    const msg = this.doc.getElementById('scianaMsg')!;
    if (validate(p).length) {
      msg.innerHTML = '<span class="err">Najpierw popraw błędy w ustawieniach.</span>';
      return;
    }
    const L = computeLayout(p);
    if (!this.features.conflicts(p, L).length) {
      msg.innerHTML = '<span class="ok">Obecny podział już omija narożniki i otwory.</span>';
      return;
    }
    const r = this.features.suggest(p, L);
    if (!r) {
      msg.innerHTML =
        '<span class="err">Nie znalazłem podziału, który omija wszystkie narożniki i otwory przy tym materiale. Ustaw szerokości ręcznie.</span>';
      return;
    }
    (this.doc.querySelector('input[name=split][value=custom]') as HTMLInputElement).checked = true;
    (this.doc.getElementById('count') as HTMLInputElement).value = String(r.length);
    page.render();
    const inputs = [...this.doc.querySelectorAll<HTMLInputElement>('#widthsBox input')];
    inputs.forEach((el, i) => (el.value = i < r.length - 1 ? String(r[i]) : ''));
    page.changed();
    this.doc.getElementById('scianaMsg')!.innerHTML = WallFeatures.suggestionMessage(r);
  }

  /** Nakładka na podgląd: narożniki (linia przerywana), otwory (prostokąt), łączenia w konflikcie (czerwone). */
  draw(ctx: CanvasRenderingContext2D, view: PreviewView | null, p: WallParams): void {
    if (!this.items.length || !view) return;
    const k = (view.sc * p.dpi) / 2.54; // cm -> piksele podglądu
    const X = (cm: number): number => view.ox + (p.mL + cm) * k;
    const floorY = view.oy + (p.mT + p.wallH) * k;
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2;
    this.items.forEach((it, i) => {
      if (!(it.x >= 0)) return;
      const label = this.features.label(i).toLowerCase();
      if (it.type === 'corner') {
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(X(it.x), view.oy);
        ctx.lineTo(X(it.x), view.oy + view.h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#b45309';
        ctx.fillText(label, X(it.x), view.oy - 6);
        return;
      }
      if (!(it.w > 0)) return;
      const y0 = it.y >= 0 ? it.y : 0;
      const h = it.h > 0 ? it.h : p.wallH - y0;
      const x = X(it.x);
      const w = it.w * k;
      const top = floorY - (y0 + h) * k;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(x, top, w, h * k);
      ctx.strokeStyle = '#1d1d1b';
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x, top, w, h * k);
      ctx.setLineDash([]);
      ctx.fillStyle = '#1d1d1b';
      ctx.fillText(label, x + w / 2, top + Math.min((h * k) / 2, 16) + 4);
    });
    for (const { s } of this.features.conflicts(p, view.L)) {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 3;
      const x0 = view.ox + s.a * k;
      const x1 = view.ox + s.b * k;
      ctx.strokeRect(x0 - 2, view.oy, Math.max(4, x1 - x0 + 4), view.h);
    }
    ctx.restore();
  }
}

const panel = new WallPanel(document);

// Zgodność ze starymi skryptami strony (bryty.js, schemat montażu) – do czasu ich przepisania.
Object.assign(window, {
  Sciana: {
    init: () => panel.init(),
    warnings: (p: WallParams, L: Layout) => panel.warnings(p, L),
    draw: (ctx: CanvasRenderingContext2D, view: PreviewView | null, p: WallParams) => panel.draw(ctx, view, p),
    suggest: (p: WallParams, L: Layout) => panel.features.suggest(p, L),
    data: (p: WallParams, L: Layout | null) => panel.features.data(p, L),
    items: panel.features.items,
    CORNER_MIN_CM,
    OPENING_MIN_CM,
  },
});

// Schemat montażu dla klienta (PDF, krok plików) – odpowiednik starego montaz.js. Rysunek i plik PDF w module
// wyjścia (src/output/assembly-pdf.ts, sprawdzony bajt w bajt ze starym programem); tu przycisk i dane ze strony.
// Haki: <div id="montazBox"></div>; bryty.js wywołuje Montaz.init() i Montaz.widths(false) (szerokości znaków
// czcionki w PDF produkcyjnym). Narożniki i otwory z sekcji „Ściana” (window.Sciana), gdy jest na stronie.
import { computeLayout, type Layout, type WallParams } from '../domain/layout';
import { validate } from '../domain/validation';
import {
  assemblyModel,
  assemblyPdf,
  materialLabel,
  type AssemblyModel,
  type AssemblyWall,
} from '../output/assembly-pdf';
import { helveticaWidths } from '../output/pdf-text';
import type { SvgLogo } from '../output/valare-logo';
import { page } from './lib/legacy';

const escHtml = (s: string): string => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export class AssemblyButton {
  private lastUrl: string | null = null;

  constructor(private readonly win: Window & typeof globalThis) {}

  private get doc(): Document {
    return this.win.document;
  }

  /** Nazwa materiału z listy wyboru (pusta = bez materiału albo „inny materiał”). */
  private material(): string {
    const sel = this.doc.getElementById('material') as HTMLSelectElement | null;
    return sel ? materialLabel(sel.value, sel.selectedOptions[0]?.textContent ?? undefined) : '';
  }

  /** Narożniki i otwory z sekcji „Ściana”; strona działa i bez niej. */
  private wall(p: WallParams, L: Layout): AssemblyWall | undefined {
    const S = (this.win as unknown as { Sciana?: { data?: (p: WallParams, L: Layout) => AssemblyWall | null } }).Sciana;
    if (!S || typeof S.data !== 'function') return undefined;
    try {
      return S.data(p, L) ?? undefined;
    } catch {
      return undefined; // strona działa bez sekcji „Ściana”
    }
  }

  /** Logo Valare z nagłówka strony (inline SVG); brak logo w stronie = napis „VALARE”. */
  private logo(): SvgLogo | null {
    const svg = this.doc.querySelector('svg.valare-logo');
    if (!svg) return null;
    const vb = svg.getAttribute('viewBox')!.split(/[ ,]+/).map(Number) as [number, number, number, number];
    const paths = [...svg.querySelectorAll('path')].map(el => ({
      d: el.getAttribute('d') ?? '',
      white: el.classList.contains('v-slash'),
    }));
    return { viewBox: vb, paths };
  }

  model(p: WallParams, L: Layout): AssemblyModel {
    return assemblyModel(p, L, this.material(), this.wall(p, L));
  }

  async make(): Promise<{ blob: Blob; name: string; pages: number }> {
    const p = page.params();
    const L = computeLayout(p);
    const pano = await page.renderPano(L, 2400);
    const r = assemblyPdf(p, L, {
      material: this.material(),
      wall: this.wall(p, L),
      pano: { data: pano.blob, size: pano.blob.size, w: pano.w, h: pano.h },
      logo: this.logo(),
    });
    return { blob: new Blob(r.parts as BlobPart[], { type: 'application/pdf' }), name: r.name, pages: r.pages };
  }

  init(): void {
    const box = this.doc.getElementById('montazBox');
    if (!box) return;
    box.innerHTML =
      '<button type="button" class="small" id="montazGo" style="width:100%;margin-top:10px">Schemat montażu dla klienta (PDF)</button>' +
      '<div id="montazMsg" class="msg" role="status" aria-live="polite"></div>';
    const btn = this.doc.getElementById('montazGo') as HTMLButtonElement;
    const msg = this.doc.getElementById('montazMsg')!;
    // Przycisk aktywny razem z „Generuj bryty” (zdjęcie wczytane, brak błędów w ustawieniach).
    const go = this.doc.getElementById('go') as HTMLButtonElement | null;
    const sync = (): void => {
      btn.disabled = !go || go.disabled;
    };
    if (go) new MutationObserver(sync).observe(go, { attributes: true, attributeFilter: ['disabled'] });
    sync();
    btn.addEventListener('click', async () => {
      const p = page.params();
      if (!page.img() || validate(p).length) {
        msg.innerHTML = '<span class="err">Najpierw wczytaj zdjęcie i popraw błędy w ustawieniach.</span>';
        return;
      }
      btn.disabled = true;
      msg.textContent = 'Tworzę schemat montażu…';
      try {
        const r = await this.make();
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
        this.lastUrl = URL.createObjectURL(r.blob);
        msg.innerHTML = `<div class="dl"><a href="${this.lastUrl}" download="${r.name}">${r.name} (${(r.blob.size / 1e6).toFixed(1)} MB, ${r.pages} ${r.pages === 1 ? 'strona' : 'strony'})</a></div>`;
      } catch (e) {
        msg.innerHTML = `<span class="err">Błąd schematu: ${escHtml(String((e as Error).message))}</span>`;
      } finally {
        sync();
      }
    });
  }
}

const button = new AssemblyButton(window);

// Zgodność ze starymi skryptami strony (bryty.js) – do czasu ich przepisania.
Object.assign(window, {
  Montaz: {
    init: () => button.init(),
    make: () => button.make(),
    model: (p: WallParams, L: Layout) => button.model(p, L),
    /** Szerokości znaków Helvetica (/Widths w PDF), jak tekst w starym programie. */
    widths: (bold: boolean) => helveticaWidths(bold).join(' '),
  },
});

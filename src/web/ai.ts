// Grafika AI (sekcja 11, docs/sections/11-grafika-ai.md) – odpowiednik starego ai.js.
// Hak w bryty.html: <div id="aiBox" class="sub"></div> pod krokiem 1. Przebieg z transkryptu: opis lub
// zdjęcie-inspiracja → kilka propozycji → wybór → ewentualna poprawka → powiększenie do wymiaru druku → podział.
// Tryb wybiera się sam: serwer z kluczem OpenAI (GET /api/health → ai.generate) → prawdziwe AI; w każdym innym
// przypadku TRYB DEMO (obrazki rysuje przeglądarka, nic nie idzie do internetu). Jedyne miejsce wywołania AI
// to callApi(). Klucz jest tylko na serwerze, nigdy w tej stronie. Czysta logika: src/domain/ai-design.ts.
import {
  AI_STYLES,
  aiFileName,
  demoCaption,
  demoRandom,
  demoSeed,
  generatedMessage,
  handedOverMessage,
  modeHtml,
  previewSize,
  printTarget,
  progressMessage,
  qualityButtonHidden,
  qualityHint,
  referenceScale,
  STYLE_PROMPTS,
  targetHint,
  upscaledName,
  upscalingMessage,
  ViewerZoom,
  type AiHealth,
  type AiKind,
  type PrintTarget,
} from '../domain/ai-design';
import { page } from './lib/legacy';

export interface AiConfig {
  /** 'demo' = bez AI, bez sieci; 'serwer' = POST na endpoint (ustawia detect()). */
  mode: 'demo' | 'serwer';
  /** Lokalny serwer dopisuje klucz i wysyła zapytanie do OpenAI. */
  endpoint: string;
  /** Powiększanie do druku – włącza detect(), gdy serwer ma upscaler. */
  upscale: boolean;
  upscaler?: string | null;
  /** Dłuższy bok podglądu propozycji [px]. */
  previewLong: number;
}

export interface AiPayload {
  prompt?: string;
  style: string;
  stylePrompt?: string | null;
  count: number;
  aspect: number;
  widthCm: number;
  heightCm: number;
  targetPx: { w: number; h: number };
  reference?: string | null;
  source: string | null;
  sourceWidth?: number;
  sourceHeight?: number;
}

export interface AiImage {
  blob: Blob;
  width: number;
  height: number;
}

interface AiResult extends AiImage {
  url: string;
  prompt: string;
}

// Wygląd sekcji AI (tekst stylu skopiowany 1:1 ze starego programu).
const CSS = `
      #aiBox { border-top: 3px solid var(--v-green); }
      #aiBox > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; }
      #aiBox > summary::-webkit-details-marker { display: none; }
      #aiBox > summary::before { content: "AI"; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: var(--v-green); color: var(--v-ink); font-size: 11px; font-weight: 700; }
      #aiBox > summary .ai-opt { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--muted); }
      #aiBox textarea { width: 100%; min-height: 76px; padding: 10px 12px; border: 1px solid var(--line); background: var(--field); color: var(--text); font: 14px/1.4 var(--font); resize: vertical; }
      #aiBox textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--focus); }
      #aiBox .ai-row { display: grid; grid-template-columns: 1fr 110px; gap: 10px; }
      #aiBox .ai-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
      #aiBox .ai-grid button.ai-thumb { height: auto; padding: 0; background: var(--disabled); border: 2px solid transparent; }
      #aiBox .ai-grid button.ai-thumb img { display: block; width: 100%; height: auto; }
      #aiBox .ai-grid button.ai-thumb.on { border-color: var(--v-green); }
      #aiBox .ai-cell { position: relative; }
      #aiBox .ai-cell button.ai-zoom { position: absolute; top: 6px; right: 6px; width: auto; display: inline-block; height: auto; min-height: 0; padding: 4px 8px; font-size: 11px; letter-spacing: .5px;
        background: rgba(255,255,255,.92); color: #222; border: 1px solid rgba(0,0,0,.15); }
      #aiView { position: fixed; inset: 0; z-index: 1000; background: #14181e; display: flex; flex-direction: column; color: #fff; }
      #aiView[hidden] { display: none; }
      #aiView .av-bar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; flex-wrap: wrap; }
      #aiView .av-bar .av-title { font-size: 14px; margin-right: auto; }
      #aiView .av-bar button { width: auto; flex: none; display: inline-block; margin: 0; height: auto; min-height: 0; padding: 8px 14px; font-size: 13px; background: rgba(255,255,255,.12); color: #fff; border: 1px solid rgba(255,255,255,.3); }
      #aiView .av-bar button.av-pick { background: var(--v-green, #25c09e); color: #222; border-color: transparent; font-weight: 700; }
      #aiView .av-stage { position: relative; flex: 1; overflow: hidden; cursor: grab; touch-action: none; }
      #aiView .av-stage.drag { cursor: grabbing; }
      #aiView .av-stage img { position: absolute; left: 0; top: 0; transform-origin: 0 0; max-width: none; user-select: none; -webkit-user-drag: none; }
      #aiView .av-hint { padding: 6px 14px 12px; font-size: 12px; color: rgba(255,255,255,.7); }
      #aiBox .ai-ref { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 13px; }
      #aiBox .ai-ref img { width: 64px; height: 44px; object-fit: cover; border: 1px solid var(--line); }
      #aiBox .ai-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
      #aiBox .ai-msg { margin-top: 8px; font-size: 13px; }
      #aiBox .ai-msg.err { color: var(--err); }
      #aiBox .ai-demo { margin-top: 8px; padding: 8px 10px; background: var(--warn-bg); color: var(--warn); font-size: 12.5px; }
      #aiBox .ai-check { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; margin-top: 8px; }
      #aiBox .ai-check input { margin-top: 3px; }
      #aiQuality .ai-msg { margin-top: 6px; font-size: 13px; } #aiQuality .ai-msg.err { color: var(--err); } #aiQuality[hidden] { display: none; }
      #aiQuality { margin: 8px 0 4px; } #aiQuality .hint { margin-top: 4px; } #aiQuality:not([hidden]) + .jq-scale { margin-top: 12px; }`;

const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (x: number): string => Math.round(x).toLocaleString('pl-PL');
const toBlob = (cv: HTMLCanvasElement): Promise<Blob> => new Promise(res => cv.toBlob(b => res(b!), 'image/png'));
const loadImg = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const im = new Image();
    im.onload = (): void => res(im);
    im.onerror = rej;
    im.src = src;
  });
const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise(res => {
    const fr = new FileReader();
    fr.onload = (): void => res(fr.result as string);
    fr.readAsDataURL(b);
  });

type AiWindow = Window & typeof globalThis & { keepCropOnce?: boolean };

export class AiDesigner {
  readonly config: AiConfig = { mode: 'demo', endpoint: '/api/ai', upscale: false, previewLong: 1024 };
  /** Zdjęcie-inspiracja. */
  private reference: { dataUrl: string; name: string } | null = null;
  private results: AiResult[] = [];
  private chosen = -1;
  private busy = false;
  /** Trwające powiększanie wybranej propozycji. */
  private pending: Promise<AiImage | undefined> | null = null;
  /** „Generuj bryty” kliknięte w trakcie powiększania – wygenerujemy sami po jego końcu. */
  private goWaiting = false;
  /** Plik w polu zdjęcia, którego dotyczy trwające powiększanie. */
  private pendingFile: File | null = null;
  private swapping = false;
  private qBusy = false;
  private qSync: () => void = () => {};
  private refTok = 0;
  private readonly view = new ViewerZoom();
  private viewIndex = 0;
  private viewerShow: ((i: number) => void) | null = null;

  constructor(private readonly win: AiWindow) {}

  private get doc(): Document {
    return this.win.document;
  }
  private $<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }
  private num(id: string): number {
    const el = this.$<HTMLInputElement>(id);
    const v = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
    return Number.isFinite(v) ? v : 0;
  }

  /** Wymiar całości do druku (ściana + naddatki) i piksele przy wybranym DPI – to samo, co liczy podział. */
  target(): PrintTarget {
    const n = (id: string): number => this.num(id);
    return printTarget({
      wallW: n('wallW'),
      wallH: n('wallH'),
      mT: n('mT'),
      mB: n('mB'),
      mL: n('mL'),
      mR: n('mR'),
      dpi: n('dpi'),
    });
  }

  // ===== JEDYNE MIEJSCE WYWOŁANIA AI =====
  async callApi(kind: AiKind, payload: AiPayload): Promise<{ images: AiImage[]; demo: boolean }> {
    const C = this.config;
    // Serwer może mieć samo powiększanie (bez klucza OpenAI).
    if (C.mode === 'serwer' || (kind === 'upscale' && C.upscale)) {
      const r = await this.win.fetch(C.endpoint + '/' + kind, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.text()) || 'Serwer AI zwrócił błąd ' + r.status);
      // Powiększenie wraca jako plik JPG (setki MP) – wymiar z nagłówków, bez dekodowania w przeglądarce.
      if ((r.headers.get('Content-Type') || '').startsWith('image/'))
        return {
          images: [{ blob: await r.blob(), width: +r.headers.get('X-Width')!, height: +r.headers.get('X-Height')! }],
          demo: false,
        };
      const j = (await r.json()) as { images: { dataUrl: string }[] };
      const images = await Promise.all(
        j.images.map(async x => {
          const blob = await (await this.win.fetch(x.dataUrl)).blob();
          const bm = await createImageBitmap(blob); // prawdziwy wymiar obrazu, nie zamówiony
          const im = { blob, width: bm.width, height: bm.height };
          bm.close();
          return im;
        }),
      );
      return { images, demo: false };
    }
    return this.demoApi(kind, payload);
  }

  // ----- Tryb demo: obrazki zastępcze rysowane lokalnie, wyraźnie podpisane -----
  private async demoApi(kind: AiKind, p: AiPayload): Promise<{ images: AiImage[]; demo: boolean }> {
    await new Promise(r => setTimeout(r, 300)); // udaje czas odpowiedzi
    const { w, h } = previewSize(p.aspect, this.config.previewLong);
    const n = kind === 'generate' ? p.count : 1;
    const images: AiImage[] = [];
    for (let i = 0; i < n; i++) {
      const cv = this.doc.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d')!;
      const r = demoRandom(demoSeed(String(p.prompt) + '|' + p.style + '|' + i + '|' + kind));
      const hue = Math.floor(r() * 360);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${hue},45%,82%)`);
      g.addColorStop(1, `hsl(${(hue + 60) % 360},40%,55%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = `hsla(${(hue + r() * 120) % 360},50%,${30 + r() * 50}%,${0.15 + r() * 0.35})`;
        ctx.beginPath();
        if (p.style === 'geometria') {
          const s = 20 + r() * 160;
          ctx.rect(r() * w, r() * h, s, s);
        } else ctx.ellipse(r() * w, r() * h, 20 + r() * 220, 10 + r() * 120, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.source) {
        // Poprawka: pokaż, że bazuje na wybranej propozycji.
        const im = await loadImg(p.source);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(im, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillRect(0, h - 64, w, 64);
      ctx.fillStyle = '#222a35';
      ctx.font = '600 22px Urbanist, Arial, sans-serif';
      ctx.fillText(demoCaption(kind, i), 16, h - 36);
      ctx.font = '15px Urbanist, Arial, sans-serif';
      ctx.fillText(p.prompt!.slice(0, 110), 16, h - 14);
      images.push({ blob: await toBlob(cv), width: w, height: h });
    }
    return { images, demo: true };
  }

  private css(): void {
    if (this.$('aiCss')) return;
    const s = this.doc.createElement('style');
    s.id = 'aiCss';
    s.textContent = CSS;
    this.doc.head.appendChild(s);
  }

  private build(): void {
    const box = this.$('aiBox');
    if (!box) return;
    const t = this.target();
    box.innerHTML = `<details id="aiDetails"><summary>Grafika AI<span class="ai-opt">opcjonalnie</span></summary>
      <div class="hint">Nie masz zdjęcia? Opisz tapetę albo wgraj zdjęcie, które Ci się podoba (np. znalezione w internecie). AI stworzy nowe, własne zdjęcie w podobnym klimacie. Wybierz jedną z propozycji i przekaż ją do podziału na bryty.</div>
      <div class="ai-demo" id="aiMode" role="status" aria-live="polite">Sprawdzam połączenie z AI…</div>
      <label for="aiPrompt">Opis tapety</label>
      <textarea id="aiPrompt" placeholder="np. las sosnowy we mgle o świcie, spokojne zielenie, bez ludzi"></textarea>
      <div class="ai-row">
        <div><label for="aiStyle">Styl</label><select id="aiStyle">${AI_STYLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div><label for="aiCount">Propozycje</label><select id="aiCount"><option>1</option><option>2</option><option>3</option><option selected>4</option></select></div>
      </div>
      <label for="aiRef">Zdjęcie-inspiracja, np. z internetu (opcjonalnie)</label>
      <input id="aiRef" type="file" accept="image/jpeg,image/png">
      <div id="aiRefInfo"></div>
      <div class="ai-check" id="aiRefRights" hidden><input type="checkbox" id="aiRefOk"><label for="aiRefOk" style="margin:0">Rozumiem, że AI stworzy nowe zdjęcie w podobnym temacie, kolorach i nastroju, a nie kopię ani przeróbkę wgranego zdjęcia (prawa autorskie).</label></div>
      <div class="hint" id="aiTarget">${targetHint(t)}</div>
      <div class="ai-actions"><button type="button" id="aiGen">Wygeneruj propozycje</button></div>
      <div id="aiMsg" class="ai-msg" role="status" aria-live="polite"></div>
      <div id="aiGrid" class="ai-grid"></div>
      <div id="aiAfter" hidden>
        <label for="aiFix">Poprawka wybranej propozycji (opcjonalnie)</label>
        <textarea id="aiFix" placeholder="np. jaśniejsze tło, drzwi w odcieniu różu"></textarea>
        <div class="ai-actions">
          <button type="button" class="small" id="aiFixBtn">Popraw wybraną</button>
          <button type="button" id="aiUse">Użyj wybranej do podziału</button>
        </div>
      </div>
    </details>`;
  }

  private msg(text: string, err?: boolean): void {
    const m = this.$('aiMsg');
    if (m) {
      m.textContent = text;
      m.className = 'ai-msg' + (err ? ' err' : '');
    }
  }
  private setBusy(b: boolean): void {
    this.busy = b;
    for (const id of ['aiGen', 'aiFixBtn', 'aiUse']) {
      const el = this.$<HTMLButtonElement>(id);
      if (el) el.disabled = b;
    }
  }

  private showResults(): void {
    const grid = this.$('aiGrid')!;
    const cells = grid.querySelectorAll('.ai-thumb');
    if (cells.length === this.results.length) {
      // Tylko zmiana wyboru – bez przerysowania (inaczej dwuklik nie działa).
      cells.forEach((c, i) => c.classList.toggle('on', i === this.chosen));
      this.$('aiAfter')!.hidden = this.chosen < 0;
      return;
    }
    grid.innerHTML = this.results
      .map(
        (r, i) =>
          `<div class="ai-cell"><button type="button" class="ai-thumb${i === this.chosen ? ' on' : ''}" data-i="${i}" aria-label="Propozycja ${i + 1}" title="Kliknij, aby wybrać. Dwuklik – powiększ."><img src="${r.url}" alt="Propozycja ${i + 1}"></button>` +
          `<button type="button" class="ai-zoom" data-z="${i}" title="Powiększ na cały ekran">Powiększ</button></div>`,
      )
      .join('');
    this.$('aiAfter')!.hidden = this.chosen < 0;
  }
  private setResults(images: AiImage[], prompt: string): void {
    this.results.forEach(r => URL.revokeObjectURL(r.url));
    this.results = images.map(x => ({ ...x, url: URL.createObjectURL(x.blob), prompt }));
    this.chosen = this.results.length === 1 ? 0 : -1;
    this.$('aiGrid')!.innerHTML = ''; // nowe obrazy – pełne przerysowanie
    this.showResults();
  }
  private addResults(images: AiImage[], prompt: string): void {
    this.results.push(...images.map(x => ({ ...x, url: URL.createObjectURL(x.blob), prompt })));
    this.showResults();
  }

  // Podgląd propozycji na cały ekran: kółko myszy / przyciski = przybliżenie, przeciąganie = przesuwanie,
  // strzałki = następna/poprzednia, Esc = zamknij. „Wybierz tę propozycję” zaznacza ją i zamyka podgląd.
  private viewer(): (i: number) => void {
    if (this.viewerShow) return this.viewerShow;
    const doc = this.doc;
    const view = this.view;
    const v = doc.createElement('div');
    v.id = 'aiView';
    v.hidden = true;
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-label', 'Podgląd propozycji AI');
    v.innerHTML =
      '<div class="av-bar"><span class="av-title" id="avTitle"></span>' +
      '<button type="button" data-a="prev" title="Poprzednia (←)" aria-label="Poprzednia propozycja">‹</button><button type="button" data-a="next" title="Następna (→)" aria-label="Następna propozycja">›</button>' +
      '<button type="button" data-a="out" title="Oddal" aria-label="Oddal">−</button><button type="button" data-a="fit">Cały obraz</button><button type="button" data-a="in" title="Przybliż" aria-label="Przybliż">+</button>' +
      '<button type="button" class="av-pick" data-a="pick">Wybierz tę propozycję</button><button type="button" data-a="close" title="Zamknij (Esc)" aria-label="Zamknij podgląd">✕</button></div>' +
      '<div class="av-stage" id="avStage"><img id="avImg" alt=""></div>' +
      '<div class="av-hint">Kółko myszy przybliża, przeciągnij, aby przesunąć. Strzałki ← → zmieniają propozycję, Esc zamyka.</div>';
    doc.body.appendChild(v);
    const st = this.$('avStage')!;
    const im = this.$<HTMLImageElement>('avImg')!;
    const apply = (): void => {
      im.style.transform = view.transform;
    };
    const zoomAt = (f: number, cx: number, cy: number): void => {
      view.zoomAt(f, cx, cy);
      apply();
    };
    const fit = (): void => {
      const r = this.results[this.viewIndex];
      if (!r) return;
      view.fitTo(st.clientWidth, st.clientHeight, r.width, r.height);
      apply();
    };
    let back: Element | null = null; // fokus wraca tam, skąd otwarto podgląd
    const show = (i: number): void => {
      this.viewIndex = (i + this.results.length) % this.results.length;
      const r = this.results[this.viewIndex]!;
      im.src = r.url;
      im.width = r.width;
      im.height = r.height;
      this.$('avTitle')!.textContent =
        `Propozycja ${this.viewIndex + 1} z ${this.results.length}` +
        (this.viewIndex === this.chosen ? ' – wybrana' : '');
      if (v.hidden) {
        back = doc.activeElement;
        v.hidden = false;
        v.querySelector<HTMLElement>('[data-a=close]')!.focus();
      }
      fit();
    };
    const close = (): void => {
      v.hidden = true;
      if (back && back.isConnected) (back as HTMLElement).focus();
      back = null;
    };
    v.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!a) return;
      const cx = st.clientWidth / 2;
      const cy = st.clientHeight / 2;
      const actions: Record<string, () => void> = {
        prev: () => show(this.viewIndex - 1),
        next: () => show(this.viewIndex + 1),
        fit,
        close,
        in: () => zoomAt(1.5, cx, cy),
        out: () => zoomAt(1 / 1.5, cx, cy),
        pick: () => {
          this.chosen = this.viewIndex;
          this.showResults();
          this.msg('Wybrano propozycję ' + (this.chosen + 1) + '. Możesz ją poprawić albo użyć do podziału.');
          close();
        },
      };
      actions[a.dataset.a!]!();
    });
    st.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const b = st.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - b.left, e.clientY - b.top);
      },
      { passive: false },
    );
    let from: { x: number; y: number } | null = null;
    st.addEventListener('pointerdown', e => {
      from = { x: e.clientX - view.x, y: e.clientY - view.y };
      st.setPointerCapture(e.pointerId);
      st.classList.add('drag');
    });
    st.addEventListener('pointermove', e => {
      if (!from) return;
      view.x = e.clientX - from.x;
      view.y = e.clientY - from.y;
      apply();
    });
    for (const ev of ['pointerup', 'pointercancel'])
      st.addEventListener(ev, () => {
        from = null;
        st.classList.remove('drag');
      });
    st.addEventListener('dblclick', e => {
      const b = st.getBoundingClientRect();
      if (view.zoomed) fit();
      else zoomAt(3, e.clientX - b.left, e.clientY - b.top);
    });
    doc.addEventListener('keydown', e => {
      if (v.hidden) return;
      if (e.key === 'Tab') {
        // Tab krąży po przyciskach podglądu, nie ucieka pod spód.
        const b = [...v.querySelectorAll('button')];
        const i = b.indexOf(doc.activeElement as HTMLButtonElement);
        b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length]!.focus();
      } else if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(this.viewIndex - 1);
      else if (e.key === 'ArrowRight') show(this.viewIndex + 1);
      else return;
      e.preventDefault();
    });
    this.win.addEventListener('resize', () => {
      if (!v.hidden) fit();
    });
    return (this.viewerShow = show);
  }

  private payload(extra: Partial<AiPayload> = {}): AiPayload {
    const t = this.target();
    const prompt = this.$<HTMLTextAreaElement>('aiPrompt')!.value.trim();
    const style = this.$<HTMLSelectElement>('aiStyle')!.value;
    return {
      prompt,
      style,
      stylePrompt: STYLE_PROMPTS[style],
      count: +this.$<HTMLSelectElement>('aiCount')!.value,
      aspect: t.aspect,
      widthCm: t.wCm,
      heightCm: t.hCm,
      targetPx: { w: t.wPx, h: t.hPx },
      reference: this.reference ? this.reference.dataUrl : null,
      source: null,
      ...extra,
    };
  }

  private async generate(): Promise<void> {
    const p = this.payload();
    if (!p.prompt && !p.reference) return this.msg('Wpisz opis tapety albo wgraj zdjęcie-inspirację.', true);
    if (p.reference && !this.$<HTMLInputElement>('aiRefOk')!.checked)
      return this.msg('Zaznacz, że inspiracja służy tylko jako kierunek (prawa autorskie).', true);
    this.setBusy(true);
    this.msg('Tworzę propozycje…');
    try {
      if (this.config.mode === 'serwer' && p.count > 1) {
        // Każda propozycja osobnym zapytaniem, równolegle: ten sam koszt, a pierwsza pokazuje się, gdy tylko jest gotowa.
        this.setResults([], p.prompt!);
        let err: Error | null = null;
        await Promise.all(
          Array.from({ length: p.count }, () =>
            this.callApi('generate', { ...p, count: 1 })
              .then(r => {
                this.addResults(r.images, p.prompt!);
                this.msg(progressMessage(this.results.length, p.count));
              })
              .catch((e: Error) => {
                err = e;
              }),
          ),
        );
        if (!this.results.length) throw err;
        if (err) this.msg(progressMessage(this.results.length, p.count, (err as Error).message));
        return;
      }
      const r = await this.callApi('generate', p);
      this.setResults(r.images, p.prompt!);
      this.msg(generatedMessage(r.demo, r.images.length, this.win.location.protocol.startsWith('http')), r.demo);
    } catch (e) {
      this.msg('Nie udało się: ' + (e as Error).message, true);
    } finally {
      this.setBusy(false);
    }
  }

  private async fix(): Promise<void> {
    if (this.chosen < 0) return this.msg('Najpierw wybierz propozycję.', true);
    const fixText = this.$<HTMLTextAreaElement>('aiFix')!.value.trim();
    if (!fixText) return this.msg('Wpisz, co poprawić.', true);
    this.setBusy(true);
    this.msg('Poprawiam wybraną propozycję…');
    try {
      const src = await blobToDataUrl(this.results[this.chosen]!.blob);
      const r = await this.callApi('edit', this.payload({ prompt: fixText, count: 1, source: src, reference: null }));
      this.setResults(r.images, fixText);
      this.msg('Gotowe. Możesz poprawić dalej albo użyć do podziału.');
    } catch (e) {
      this.msg('Nie udało się: ' + (e as Error).message, true);
    } finally {
      this.setBusy(false);
    }
  }

  // Przekazanie do podziału (tak samo jak przeciągnięcie pliku na pole zdjęcia). Podgląd i kadr od razu z propozycji,
  // powiększenie do wymiaru druku w tle; po nim plik podmienia się bez zmiany kadru. „Generuj bryty” w tym czasie
  // czeka, więc pliki do druku zawsze powstają z pełnej rozdzielczości.
  private setFile(blob: Blob, keepCrop: boolean): File {
    const type = blob.type || 'image/png';
    const file = new File([blob], aiFileName(type), { type });
    const input = this.$<HTMLInputElement>('file')!;
    const dt = new DataTransfer();
    dt.items.add(file);
    this.win.keepCropOnce = !!keepCrop; // główny skrypt: nie resetuj kadru przy podmianie na większy plik
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.files![0]!;
  }
  /** Czeka, aż strona wczyta podmieniony plik (nowy obiekt img): true = wczytany, false = błąd/limit 60 s. */
  private loaded(before: unknown): Promise<boolean> {
    return new Promise(ok => {
      const t0 = Date.now();
      const chk = (): void => {
        const cur = page.img();
        if (cur && cur !== before) ok(true);
        else if (Date.now() - t0 > 60000) ok(false);
        else setTimeout(chk, 200);
      };
      chk();
    });
  }

  private async use(): Promise<void> {
    if (this.chosen < 0) return this.msg('Najpierw wybierz propozycję.', true);
    if (this.pending)
      return this.msg(
        'Trwa powiększanie poprzednio wybranej propozycji – poczekaj na wynik (każde powiększenie kosztuje).',
        true,
      );
    const prop = this.results[this.chosen]!;
    const t = this.target();
    this.pendingFile = this.setFile(prop.blob, false);
    const C = this.config;
    if (!(C.mode !== 'demo' && C.upscale)) return this.msg(handedOverMessage(prop.width, prop.height, t));
    const job = (this.pending = (async () => {
      let src: Blob = prop.blob;
      if (C.upscaler === 'lokalny' && src.type !== 'image/png') {
        // Lokalny Real-ESRGAN przyjmuje tylko PNG.
        const bm = await createImageBitmap(src);
        const cv = this.doc.createElement('canvas');
        cv.width = bm.width;
        cv.height = bm.height;
        cv.getContext('2d')!.drawImage(bm, 0, 0);
        bm.close();
        src = await toBlob(cv);
      }
      return (
        await this.callApi(
          'upscale',
          this.payload({
            count: 1,
            reference: null,
            source: await blobToDataUrl(src),
            sourceWidth: prop.width,
            sourceHeight: prop.height,
          }),
        )
      ).images[0];
    })());
    this.qSync(); // w trakcie powiększania propozycji „Popraw jakość” jest ukryty (drugie płatne powiększenie)
    this.msg(upscalingMessage(t, C.upscaler));
    try {
      const up = (await job)!;
      if (this.pending !== job) {
        // W międzyczasie wybrano inne zdjęcie (zmiana pliku zwolniła blokadę).
        if (/W tle powiększam/.test(this.$('aiMsg')!.textContent ?? ''))
          this.msg('Powiększenie pominięte – w międzyczasie wybrano inne zdjęcie.');
        return;
      }
      const before = page.img();
      this.swapping = true;
      try {
        this.pendingFile = this.setFile(up.blob, true);
      } finally {
        this.swapping = false;
      }
      const ok = await this.loaded(before);
      this.win.keepCropOnce = false;
      if (this.pending !== job) return;
      this.pending = null;
      this.pendingFile = null;
      this.qSync();
      // (Wynik bywa węższy od propozycji: przy małej ścianie powiększanie zmniejsza do wymiaru druku – to nie błąd.)
      if (!ok) throw new Error('Przeglądarka nie wczytała powiększonego pliku (za mało pamięci?).');
      this.msg(
        `Powiększono do ${fmt(up.width)} × ${fmt(up.height)} px. Pliki do druku powstaną z pełnej rozdzielczości.`,
      );
      if (this.goWaiting) {
        this.goWaiting = false;
        this.$('go')!.click();
      }
    } catch (e) {
      if (this.pending === job) {
        this.pending = null;
        this.pendingFile = null;
        this.qSync();
      }
      this.goWaiting = false;
      this.msg(
        'Powiększanie do druku nie udało się: ' +
          (e as Error).message +
          ' Podgląd jest z propozycji w małej rozdzielczości – do druku byłby za słaby.',
        true,
      );
    }
  }

  // Przycisk „Popraw jakość (AI)” w ocenie jakości: przy ocenie „Za słaba” albo „Akceptowalna”, gdy serwer ma
  // powiększanie. Powiększa wgrane zdjęcie (albo wzór z galerii) do wymiaru druku i podmienia je w polu zdjęcia.
  // Każde kliknięcie to płatne wywołanie, dlatego nie dzieje się samo.
  private qualityHook(): void {
    const badge = this.$('jqBadge');
    const text = this.$('jqText');
    if (!badge || !text) return;
    const wrap = this.doc.createElement('div');
    wrap.id = 'aiQuality';
    wrap.hidden = true;
    wrap.innerHTML =
      '<button type="button" class="small" id="aiQBtn">Popraw jakość (AI)</button>' +
      '<div class="hint" id="aiQHint">AI powiększy zdjęcie do wymiaru druku i wyostrzy szczegóły (w chmurze, zwykle 1–3 min). Każde powiększenie kosztuje.</div>' +
      '<div class="ai-msg" id="aiQMsg" role="status" aria-live="polite"></div>';
    text.after(wrap);
    this.qSync = (): void => {
      this.$('aiQHint')!.textContent = qualityHint(this.config.upscaler);
      wrap.hidden = qualityButtonHidden({
        busy: this.qBusy,
        pending: !!this.pending,
        upscale: this.config.upscale,
        badgeClass: badge.className,
      });
    };
    new MutationObserver(this.qSync).observe(badge, { attributes: true, attributeFilter: ['class'] });
    wrap.addEventListener('click', e => {
      if ((e.target as HTMLElement).id === 'aiQBtn') void this.improve();
    });
  }

  private async improve(): Promise<void> {
    const input = this.$<HTMLInputElement>('file')!;
    const f = input.files![0];
    if (!f || this.qBusy) return;
    const m = this.$('aiQMsg')!;
    const say = (t: string, err?: boolean): void => {
      m.textContent = t;
      m.className = 'ai-msg' + (err ? ' err' : '');
    };
    if (this.pending)
      return say('Trwa powiększanie wybranej propozycji – poczekaj na wynik (każde powiększenie kosztuje).', true);
    const t = this.target();
    const btn = this.$<HTMLButtonElement>('aiQBtn')!;
    this.qBusy = true;
    btn.disabled = true;
    say(`Powiększam zdjęcie do ok. ${fmt(t.wPx)} × ${fmt(t.hPx)} px…`);
    try {
      const bm = await createImageBitmap(f);
      let src: Blob = f;
      // Lokalny Real-ESRGAN przyjmuje tylko PNG – wtedy JPG zamieniamy w przeglądarce.
      if (this.config.upscaler === 'lokalny' && f.type !== 'image/png') {
        const cv = this.doc.createElement('canvas');
        cv.width = bm.width;
        cv.height = bm.height;
        cv.getContext('2d')!.drawImage(bm, 0, 0);
        src = await toBlob(cv);
      }
      const size = { w: bm.width, h: bm.height };
      bm.close();
      const r = await this.callApi('upscale', {
        style: 'foto',
        count: 1,
        aspect: t.aspect,
        widthCm: t.wCm,
        heightCm: t.hCm,
        targetPx: { w: t.wPx, h: t.hPx },
        source: await blobToDataUrl(src),
        sourceWidth: size.w,
        sourceHeight: size.h,
      });
      if (input.files![0] !== f)
        return say('W międzyczasie wybrano inne zdjęcie – powiększenia nie podmieniono.', true);
      const out = r.images[0]!;
      const type = out.blob.type || 'image/jpeg';
      // Ta sama nazwa pliku co oryginał – nazwa zlecenia się nie zmienia.
      const file = new File([out.blob], upscaledName(f.name, type), { type });
      const dt = new DataTransfer();
      dt.items.add(file);
      this.win.keepCropOnce = true; // te same proporcje – kadr użytkownika zostaje
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      say(
        `Gotowe: zdjęcie ma teraz ${fmt(out.width)} × ${fmt(out.height)} px (było ${fmt(size.w)} × ${fmt(size.h)}). Obejrzyj fragment 1:1 poniżej.`,
      );
    } catch (e) {
      say('Nie udało się: ' + (e as Error).message, true);
    } finally {
      this.qBusy = false;
      btn.disabled = false;
      this.qSync();
    }
  }

  private refreshTarget(): void {
    const el = this.$('aiTarget');
    if (!el) return;
    el.innerHTML = targetHint(this.target());
  }

  // Prawdziwe AI tylko przez serwer z kluczem (GET /api/health → ai.generate).
  private async detect(): Promise<void> {
    if (!this.win.location.protocol.startsWith('http')) return;
    try {
      const h = (await (await this.win.fetch('/api/health')).json()) as { ai?: AiHealth } | null;
      const ai = h && h.ai;
      const el = this.$('aiMode');
      if (!ai || !el) return;
      this.config.upscale = !!ai.upscale; // powiększanie działa też bez klucza OpenAI
      this.config.upscaler = ai.upscaler;
      this.qSync();
      if (ai.generate) this.config.mode = 'serwer';
      el.innerHTML = modeHtml(ai);
    } catch {
      /* zostaje demo */
    }
  }

  // Inspiracja służy tylko jako wskazówka stylu: wysyłamy ją pomniejszoną (maks. 2048 px), a nie np. 12 MB
  // z telefonu przy każdej z 4 propozycji. Mniejsze zdjęcie zostaje bez zmian.
  private async refDataUrl(f: File): Promise<string> {
    try {
      const bm = await createImageBitmap(f);
      const k = referenceScale(bm.width, bm.height);
      if (k === 1 && f.size < 4e6) {
        bm.close();
        return blobToDataUrl(f);
      }
      const cv = this.doc.createElement('canvas');
      cv.width = Math.round(bm.width * k);
      cv.height = Math.round(bm.height * k);
      cv.getContext('2d')!.drawImage(bm, 0, 0, cv.width, cv.height);
      bm.close();
      return cv.toDataURL('image/jpeg', 0.92);
    } catch {
      return blobToDataUrl(f);
    }
  }

  init(): void {
    const box = this.$('aiBox');
    if (!box) return;
    // Inne zdjęcie w polu (własne, wzór z galerii) w trakcie powiększania: wynik powiększenia już nie dotyczy
    // tego zdjęcia, więc „Generuj bryty” nie może dalej na nie czekać.
    const fileIn = this.$<HTMLInputElement>('file');
    if (fileIn)
      fileIn.addEventListener('change', () => {
        if (this.pending && !this.swapping && fileIn.files![0] !== this.pendingFile) {
          this.pending = null;
          this.pendingFile = null;
          this.qSync();
          if (this.goWaiting) {
            this.goWaiting = false;
            this.msg('Wybrano inne zdjęcie – powiększanie propozycji AI pominięte. Kliknij „Generuj bryty” ponownie.');
          }
        }
      });
    this.css();
    this.build();
    this.qualityHook();
    void this.detect();
    // „Generuj bryty” w trakcie powiększania: czekamy na pełną rozdzielczość i generujemy sami po jej nadejściu.
    const go = this.$('go');
    if (go)
      go.addEventListener(
        'click',
        e => {
          if (!this.pending) return;
          e.stopImmediatePropagation();
          e.preventDefault();
          this.goWaiting = true;
          this.msg('Pliki do druku wygenerują się same, gdy skończy się powiększanie do pełnej rozdzielczości.');
        },
        true,
      );
    box.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const zb = t.closest<HTMLElement>('.ai-zoom');
      if (zb) {
        this.viewer()(+zb.dataset.z!); // podgląd działa też, gdy reszta propozycji jeszcze się tworzy
        return;
      }
      if (this.busy) return;
      const th = t.closest<HTMLElement>('.ai-thumb');
      if (th) {
        this.chosen = +th.dataset.i!;
        this.showResults();
        this.msg('');
        return;
      }
      if (t.id === 'aiGen') void this.generate();
      else if (t.id === 'aiFixBtn') void this.fix();
      else if (t.id === 'aiUse') void this.use();
    });
    box.addEventListener('dblclick', e => {
      const th = (e.target as HTMLElement).closest<HTMLElement>('.ai-thumb');
      if (th) this.viewer()(+th.dataset.i!);
    });
    box.addEventListener('change', e => {
      const input = e.target as HTMLInputElement;
      if (input.id !== 'aiRef') return;
      void (async () => {
        const f = input.files![0];
        const tok = ++this.refTok;
        if (!f) {
          this.reference = null;
          this.$('aiRefInfo')!.innerHTML = '';
          this.$('aiRefRights')!.hidden = true;
          return;
        }
        const dataUrl = await this.refDataUrl(f);
        if (tok !== this.refTok) return; // w międzyczasie wybrano inne zdjęcie-inspirację
        this.reference = { dataUrl, name: f.name };
        this.$('aiRefInfo')!.innerHTML =
          `<div class="ai-ref"><img src="${this.reference.dataUrl}" alt=""><span>${esc(f.name)}</span></div>`;
        this.$('aiRefRights')!.hidden = false;
        this.$<HTMLSelectElement>('aiStyle')!.value = 'ref'; // inny styl psułby podobieństwo do inspiracji
      })();
    });
    const refresh = (): void => this.refreshTarget();
    for (const id of ['wallW', 'wallH', 'mT', 'mB', 'mL', 'mR', 'dpi']) {
      const el = this.$(id);
      if (el) {
        el.addEventListener('input', refresh);
        el.addEventListener('change', refresh);
      }
    }
  }
}

// Pomost dla skryptów, które jeszcze nie są przepisane (np. wizualizacja korzysta z GrafikaAI).
const ai = new AiDesigner(window as AiWindow);
Object.assign(window, {
  GrafikaAI: {
    init: () => ai.init(),
    callApi: (kind: AiKind, payload: AiPayload) => ai.callApi(kind, payload),
    target: () => ai.target(),
    CONFIG: ai.config,
  },
});
ai.init();

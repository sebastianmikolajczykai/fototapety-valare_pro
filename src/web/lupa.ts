// Lupa: całe zdjęcie na pełnym ekranie, z powiększeniem do pikseli (ustalenie Sebastiana 2026-10-25) –
// odpowiednik starego lupa.js. Ramka pokazuje kadr, który idzie do druku, cienkie linie – łączenia brytów.
// Niczego nie zmienia w kadrze. Skala i ramka w domenie (src/domain/magnifier.ts); tu okno i obsługa myszy/klawiszy.
// Hak w bryty.html: <button id="lupaBtn"> w pasku podglądu.
import { computeLayout, fitImage } from '../domain/layout';
import { magnifierFrame, ZoomView } from '../domain/magnifier';
import { validate } from '../domain/validation';
import { page } from './lib/legacy';

// Wygląd okna lupy (znacznik <style> skopiowany 1:1 ze starego programu).
const CSS = `<style id="lupaCss">
    #lupa { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; background: #161b22; color: #fff; }
    #lupa[hidden] { display: none; }
    #lupa .lp-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px; border-top: 3px solid var(--v-green); background: var(--v-ink); }
    #lupa .lp-title { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-right: auto; }
    #lupa .lp-title span { font-weight: 300; letter-spacing: .5px; text-transform: none; margin-left: 10px; color: rgba(255,255,255,.7); }
    #lupa button { width: auto; height: 34px; margin: 0; padding: 0 12px; font-size: 12px; letter-spacing: 1px; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.35); }
    #lupa button:hover:not(:disabled) { background: rgba(255,255,255,.12); }
    #lupa button.icon { width: 34px; padding: 0; font-size: 18px; letter-spacing: 0; }
    #lupa button.close { background: var(--v-green); color: var(--v-ink); border-color: var(--v-green); }
    #lupa .lp-val { min-width: 48px; text-align: center; font-size: 13px; font-variant-numeric: tabular-nums; }
    #lupa .lp-view { position: relative; flex: 1; overflow: hidden; cursor: grab; touch-action: none; }
    #lupa .lp-view.drag { cursor: grabbing; }
    #lupa .lp-wrap { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    #lupa .lp-wrap img { display: block; max-width: none; user-select: none; -webkit-user-drag: none; }
    #lupa .lp-frame { position: absolute; border: 2px solid var(--v-green); box-shadow: 0 0 0 100000px rgba(0,0,0,.35); pointer-events: none; }
    #lupa .lp-seam { position: absolute; top: 0; bottom: 0; transform: translateX(-50%); }
    #lupa .lp-tip { padding: 6px 16px 10px; font-size: 12px; color: rgba(255,255,255,.65); background: var(--v-ink); }
    @media (max-width: 560px) { #lupa .lp-title span { display: none; } #lupa .lp-tip { display: none; } }
  </style>`;
const HTML = `<div id="lupa" hidden role="dialog" aria-modal="true" aria-label="Lupa – całe zdjęcie">
    <div class="lp-bar">
      <div class="lp-title">Lupa<span id="lpInfo"></span></div>
      <button type="button" class="icon" id="lpOut" aria-label="Pomniejsz">−</button>
      <span class="lp-val" id="lpVal">100%</span>
      <button type="button" class="icon" id="lpIn" aria-label="Powiększ">+</button>
      <button type="button" id="lpFit">Całe zdjęcie</button>
      <button type="button" id="lp100">100% pikseli</button>
      <button type="button" class="close" id="lpClose">Zamknij</button>
    </div>
    <div class="lp-view" id="lpView"><div class="lp-wrap" id="lpWrap"><img id="lpImg" alt="Zdjęcie w powiększeniu"><div id="lpFrame" class="lp-frame" hidden></div></div></div>
    <div class="lp-tip">Kółko myszy lub +/− powiększa w miejscu kursora, przeciągnij, żeby przesunąć. Zielona ramka – kadr do druku, biało-grafitowe linie – łączenia brytów. Esc zamyka.</div>
  </div>`;

export class Magnifier {
  private zv = new ZoomView(0, 0);
  private back: Element | null = null;
  private drag: { x: number; y: number; tx: number; ty: number } | null = null;

  constructor(
    private readonly win: Window & typeof globalThis,
    private readonly btn: HTMLButtonElement,
  ) {}

  private get doc(): Document {
    return this.win.document;
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.doc.getElementById(id) as T;
  }
  private get box(): HTMLElement {
    return this.el('lupa');
  }
  private get view(): HTMLElement {
    return this.el('lpView');
  }
  private size(): [number, number] {
    return [this.view.clientWidth, this.view.clientHeight];
  }
  private center(): [number, number] {
    return [this.view.clientWidth / 2, this.view.clientHeight / 2];
  }

  /** Stan widoku na stronie: przesunięcie i skala obrazu, wartość %, przyciski −/+. */
  private apply(): void {
    const v = this.zv;
    this.el('lpWrap').style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
    this.el('lpVal').textContent = v.label;
    this.el<HTMLButtonElement>('lpOut').disabled = !v.canZoomOut;
    this.el<HTMLButtonElement>('lpIn').disabled = !v.canZoomIn;
    this.el('lpImg').style.imageRendering = v.pixelated ? 'pixelated' : 'auto';
  }
  private zoomAt(ns: number, cx: number, cy: number): void {
    this.zv.zoomAt(ns, cx, cy, ...this.size());
    this.apply();
  }
  private fitAll(): void {
    this.zv.fitAll(...this.size());
    this.apply();
  }

  /** Kadr i łączenia w pikselach zdjęcia; false/undefined = ustawienia z błędem (bez ramki). */
  private drawFrame(): boolean | undefined {
    const frame = this.el('lpFrame');
    frame.hidden = true;
    frame.innerHTML = '';
    try {
      const p = page.params();
      if (validate(p).length) return;
      const L = computeLayout(p);
      const fr = magnifierFrame(L, fitImage(L, this.zv.iw, this.zv.ih, page.crop()));
      const fitS = this.zv.fitS;
      Object.assign(frame.style, {
        left: fr.x + 'px',
        top: fr.y + 'px',
        width: fr.w + 'px',
        height: fr.h + 'px',
        borderWidth: Math.max(2, 3 / fitS) + 'px',
      });
      for (const sx of fr.seams) {
        const d = Math.max(4, 12 / fitS); // kreska biało-grafitowa, widoczna na jasnym i ciemnym zdjęciu
        frame.insertAdjacentHTML(
          'beforeend',
          `<div class="lp-seam" style="left:${sx}px;width:${Math.max(2, 3 / fitS)}px;background:repeating-linear-gradient(to bottom,#fff 0 ${d}px,#222A35 ${d}px ${2 * d}px)"></div>`,
        );
      }
      frame.hidden = false;
      return true;
    } catch {
      return false;
    }
  }

  open(): void {
    const im = page.img();
    if (!im) return;
    const iw = im.naturalWidth;
    const ih = im.naturalHeight;
    this.zv = Object.assign(new ZoomView(iw, ih), { s: this.zv.s, tx: this.zv.tx, ty: this.zv.ty, fitS: this.zv.fitS });
    const pic = this.el<HTMLImageElement>('lpImg');
    pic.src = im.src;
    pic.width = iw;
    pic.height = ih;
    this.back = this.doc.activeElement;
    this.box.hidden = false;
    this.doc.body.style.overflow = 'hidden';
    const f = this.el<HTMLInputElement>('file').files?.[0];
    const info = this.el('lpInfo');
    info.textContent = `${f ? f.name + ' · ' : ''}${iw.toLocaleString('pl-PL')} × ${ih.toLocaleString('pl-PL')} px`;
    if (!this.drawFrame()) info.textContent += ' · kadr pojawi się po poprawieniu ustawień';
    this.fitAll();
    this.el('lpClose').focus();
  }

  close(): void {
    this.box.hidden = true;
    this.doc.body.style.overflow = '';
    this.el('lpImg').removeAttribute('src');
    const back = this.back as HTMLElement | null;
    if (back && back.focus) back.focus();
  }

  private onKey(e: KeyboardEvent): void {
    const box = this.box;
    if (box.hidden) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === '+' || e.key === '=') this.zoomAt(this.zv.s * 1.5, ...this.center());
    else if (e.key === '-') this.zoomAt(this.zv.s / 1.5, ...this.center());
    else if (e.key === 'Tab') {
      // fokus zostaje w oknie lupy
      const f = [...box.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const i = f.indexOf(this.doc.activeElement as HTMLButtonElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]!.focus();
    }
  }

  start(): void {
    const { doc, win } = this;
    doc.head.insertAdjacentHTML('beforeend', CSS);
    doc.body.insertAdjacentHTML('beforeend', HTML);
    const view = this.view;
    this.btn.addEventListener('click', () => this.open());
    this.el('lpClose').addEventListener('click', () => this.close());
    this.el('lpFit').addEventListener('click', () => this.fitAll());
    this.el('lp100').addEventListener('click', () => this.zoomAt(1, ...this.center()));
    this.el('lpIn').addEventListener('click', () => this.zoomAt(this.zv.s * 1.5, ...this.center()));
    this.el('lpOut').addEventListener('click', () => this.zoomAt(this.zv.s / 1.5, ...this.center()));
    view.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const r = view.getBoundingClientRect();
        this.zoomAt(this.zv.s * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
    view.addEventListener('dblclick', e => {
      const r = view.getBoundingClientRect();
      if (this.zv.canZoomOut) this.fitAll();
      else this.zoomAt(1, e.clientX - r.left, e.clientY - r.top);
    });
    view.addEventListener('pointerdown', e => {
      this.drag = { x: e.clientX, y: e.clientY, tx: this.zv.tx, ty: this.zv.ty };
      view.setPointerCapture(e.pointerId);
      view.classList.add('drag');
    });
    view.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d) return;
      this.zv.moveTo(d.tx + e.clientX - d.x, d.ty + e.clientY - d.y, ...this.size());
      this.apply();
    });
    for (const ev of ['pointerup', 'pointercancel'])
      view.addEventListener(ev, () => {
        this.drag = null;
        view.classList.remove('drag');
      });
    doc.addEventListener('keydown', e => this.onKey(e));
    win.addEventListener('resize', () => {
      if (this.box.hidden) return;
      this.zv.resize(...this.size());
      this.apply();
    });

    // Przycisk aktywny tylko z wczytanym zdjęciem (główny skrypt odświeża tabelę po każdej zmianie).
    const sync = (): void => {
      this.btn.disabled = !page.img();
    };
    new MutationObserver(sync).observe(this.el('tbl'), { childList: true });
    // Nowe zdjęcie (też po powiększeniu AI) przy otwartej lupie: zamykamy – pokazywałaby stare zdjęcie i kadr.
    this.el('file').addEventListener('change', () => {
      if (!this.box.hidden) this.close();
      setTimeout(sync, 300);
    });
    win.addEventListener('load', sync);
    sync();
  }
}

const btn = document.getElementById('lupaBtn') as HTMLButtonElement | null;
if (btn) {
  const lupa = new Magnifier(window, btn);
  lupa.start();
  Object.assign(window, { Lupa: { open: () => lupa.open(), close: () => lupa.close() } });
}

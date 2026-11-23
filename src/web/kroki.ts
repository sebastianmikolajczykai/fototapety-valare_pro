// Przebieg krok po kroku (ustalenia Sebastiana 2026-10-25) – odpowiednik starego kroki.js:
//   - sekcje rozwijane: otwarta jest jedna, zamknięte pokazują w nagłówku skrót ustawień,
//   - przycisk „Dalej” przechodzi do następnego kroku, numery kroków idą w kolejności na stronie,
//   - podział: ile brytów wymaga materiał i przycisk, który to ustawia,
//   - własne szerokości: ostatnie puste pole pokazuje wyliczoną resztę, pole szersze niż druk jest oznaczone.
// Teksty w domenie (src/domain/guide.ts); nie zmienia obliczeń.
import { f1, plural } from '../domain/format';
import {
  fileSummary,
  joinSummary,
  marginsSummary,
  needInfo,
  outputSummary,
  pricingSummary,
  safeLayout,
  SAMPLE_SUMMARY,
  splitSummary,
  wallSummary,
  widthsHint,
} from '../domain/guide';
import { page } from './lib/legacy';

// Wygląd kroków (znacznik <style> skopiowany 1:1 ze starego programu).
const CSS = `<style id="krokiCss">
    .panel > .step > .step-head { cursor: pointer; user-select: none; margin-bottom: 0; }
    .panel > .step > .step-head::after { content: "−"; order: 2; margin-left: auto; font-size: 18px; line-height: 1; color: var(--v-ink); }
    .panel > .step.collapsed > .step-head::after { content: "+"; }
    .panel > .step:not(.collapsed) > .step-head { margin-bottom: 4px; }
    .panel > .step.collapsed { padding-bottom: 18px; }
    .panel > .step.collapsed > :not(.step-head) { display: none !important; }
    .panel > .step > .step-head:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
    .step-sum { order: 3; flex-basis: 100%; padding-left: 36px; font-size: 12.5px; color: var(--muted); text-transform: none; letter-spacing: 0; line-height: 1.4; }
    .panel > .step:not(.collapsed) .step-sum { display: none; }
    .panel > .step.collapsed .step-note { display: none; }
    .panel > .step .step-head h2 { flex: 0 1 auto; }
    button.next { width: 100%; margin-top: 16px; height: 40px; }
    .need-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
    .need-row .hint { margin: 0; flex: 1 1 200px; }
    .need-row button { flex: none; }
    #widthsBox input.over { border-color: var(--err); box-shadow: 0 0 0 2px rgba(220,38,38,.15); }
    #widthsBox input::placeholder { color: var(--v-ink); opacity: .55; }
    .sub-lead { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--card-line); font-size: 13px; color: var(--muted); }
    .step .sub { margin-top: 10px; padding: 12px 0 0; border: 0; border-top: 1px solid var(--card-line); background: none; box-shadow: none; }
    details#galeriaBox.sub, div#aiBox.sub { border-top: 1px solid var(--card-line); padding: 12px 0 0; margin-top: 10px; background: none; box-shadow: none; }
  </style>`;

/** Zmiana tekstu tylko, gdy inny (bez zbędnych zmian w drzewie strony). */
const setText = (el: HTMLElement, t: string): void => {
  if (el.textContent !== t) el.textContent = t;
};

export class StepGuide {
  private queued = false;
  private ready = false;

  constructor(
    private readonly win: Window & typeof globalThis,
    private readonly panel: HTMLElement,
  ) {}

  private get doc(): Document {
    return this.win.document;
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }

  steps(): HTMLElement[] {
    return [...this.panel.querySelectorAll<HTMLElement>(':scope > .step')].filter(s =>
      s.querySelector(':scope > .step-head'),
    );
  }
  private static title(s: HTMLElement): string {
    return s.querySelector(':scope > .step-head h2')!.textContent!.trim();
  }

  /** Skrót ustawień w nagłówku zamkniętego kroku (rozpoznanie kroku po polach, które zawiera). */
  private summary(s: HTMLElement): string {
    const p = page.params();
    const has = (id: string): boolean => !!s.querySelector('#' + id);
    if (has('wallW')) {
      const m = this.el<HTMLSelectElement>('material');
      return wallSummary(p, m && m.selectedIndex >= 0 && m.value ? m.options[m.selectedIndex]!.text : '');
    }
    if (has('mT')) return marginsSummary(p);
    if (has('overlap')) return joinSummary(p);
    if (has('count')) return splitSummary(p);
    if (has('file')) {
      const f = this.el<HTMLInputElement>('file')!.files?.[0];
      const G = (this.win as unknown as { Galeria?: { current?: () => { title: string } | null } }).Galeria;
      const g = G && G.current && G.current();
      return fileSummary(f ? f.name : '', g ? g.title : null);
    }
    if (has('wycOut')) {
      const t = s.querySelector('#wycOut b');
      const sum = s.querySelector('#wycOut .wycSum td:nth-child(2)');
      return pricingSummary(sum ? sum.textContent!.trim() : null, t ? t.textContent!.trim() : null);
    }
    if (has('probkaMsg') || s.id === 'probkaBox') return SAMPLE_SUMMARY;
    if (has('dpi')) return outputSummary(p);
    return '';
  }

  /** Otwiera jeden krok, resztę zwija. */
  open(s: HTMLElement, scroll: boolean): void {
    this.steps().forEach(x => this.setOpen(x, x === s));
    if (scroll) {
      const r = s.getBoundingClientRect();
      if (r.top < 0 || r.top > this.win.innerHeight * 0.6) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  private setOpen(s: HTMLElement, on: boolean): void {
    s.classList.toggle('collapsed', !on);
    s.querySelector(':scope > .step-head')!.setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  private onClick(target: Element): void {
    const h = target.closest('.step-head');
    if (h && h.parentElement!.parentElement === this.panel) {
      const s = h.parentElement!;
      if (s.classList.contains('collapsed')) this.open(s, false);
      else this.setOpen(s, false);
      return;
    }
    const n = target.closest('button.next');
    if (!n) return;
    const all = this.steps();
    const t = all[all.indexOf(n.closest<HTMLElement>('.step')!) + 1];
    if (!t) return;
    this.open(t, true);
    // fokus do następnego kroku – zaznaczona opcja (Spacja na pierwszej z brzegu zmieniłaby ustawienie);
    // ukryte pole pliku pomijamy
    const f =
      t.querySelector<HTMLElement>('input[type=radio]:checked:not([disabled])') ||
      [
        ...t.querySelectorAll<HTMLElement>(
          'input:not([type=hidden]):not([type=radio]):not([disabled]), select:not([disabled]), textarea',
        ),
      ].find(el => el.id !== 'file' && el.offsetWidth > 1) ||
      t.querySelector<HTMLElement>('.step-head');
    if (f) f.focus({ preventScroll: true });
  }

  /** Numery kroków, nagłówki jako przyciski, miejsce na skrót; krok dobudowany później startuje zwinięty. */
  private prepare(): void {
    this.steps().forEach((s, i) => {
      const h = s.querySelector<HTMLElement>(':scope > .step-head')!;
      const num = h.querySelector('.num');
      if (num && num.textContent !== String(i + 1)) num.textContent = String(i + 1);
      if (!h.hasAttribute('tabindex')) {
        h.setAttribute('tabindex', '0');
        h.setAttribute('role', 'button');
      }
      if (!h.querySelector('.step-sum')) h.insertAdjacentHTML('beforeend', '<span class="step-sum"></span>');
      if (!s.dataset.kr) {
        s.dataset.kr = '1';
        if (this.ready) this.setOpen(s, false);
      }
    });
  }

  /** Liczba brytów wymagana przez materiał i przycisk „Ustaw N brytów”. */
  private needRow(): void {
    if (!this.el('needRow'))
      this.el('count')!.insertAdjacentHTML(
        'afterend',
        '<div class="need-row" id="needRow"><span class="hint" id="needTxt"></span><button type="button" class="small" id="needSet" hidden></button></div>',
      );
    const { text, need, setTo } = needInfo(page.params());
    const btn = this.el<HTMLButtonElement>('needSet')!;
    setText(this.el('needTxt')!, text);
    if (need === null) {
      btn.hidden = true;
      return;
    }
    let bt = '';
    if (setTo !== null) {
      bt = `Ustaw ${setTo} ${plural(setTo)}`;
      btn.dataset.n = String(setTo);
    }
    setText(btn, bt);
    btn.hidden = !bt;
  }

  /** Własne szerokości: wyliczona reszta w ostatnim polu i pola szersze niż druk. */
  private widthsHelp(): void {
    const ins = [...this.doc.querySelectorAll<HTMLInputElement>('#widthsBox input')];
    if (!ins.length) return;
    const p = page.params();
    const L = p.split === 'custom' ? safeLayout(p) : null;
    const last = ins[ins.length - 1]!;
    // Ostatnie puste pole = reszta: etykieta mówi to wprost, a w polu widać wyliczoną szerokość.
    const lab = this.doc.querySelector<HTMLElement>(`label[for="${last.id}"]`);
    if (lab) setText(lab, ins.length > 1 ? `Bryt ${ins.length} · reszta` : `Bryt ${ins.length}`);
    if (L && last.value.trim() === '' && ins.length > 1) last.placeholder = f1(L.bw.widths[L.bw.widths.length - 1]!);
    else if (last.value.trim() === '') last.placeholder = 'reszta';
    ins.forEach((el, i) => {
      const w = L ? L.bw.widths[i]! : parseFloat(el.value);
      const over = Number.isFinite(p.maxPrint) && w > p.maxPrint + 1e-6;
      el.classList.toggle('over', over);
      el.title = over ? `Szerszy niż maks. szerokość druku materiału (${f1(p.maxPrint)} cm)` : '';
    });
    if (!this.el('widthsHint'))
      this.el('widthsBox')!.insertAdjacentHTML('afterend', '<div class="hint" id="widthsHint"></div>');
    setText(this.el('widthsHint')!, widthsHint(p, ins.length));
  }

  update(): void {
    this.queued = false;
    this.prepare();
    for (const s of this.steps()) {
      const el = s.querySelector<HTMLElement>('.step-sum');
      if (el) setText(el, this.summary(s));
    }
    this.needRow();
    this.widthsHelp();
  }
  private later(): void {
    if (this.queued) return;
    this.queued = true;
    this.win.requestAnimationFrame(() => this.update());
  }

  /** „Dalej: …” na końcu kroków nad paskiem „Generuj bryty” (poza ostatnim z nich). */
  private addNext(): void {
    const act = this.panel.querySelector(':scope > .actions');
    const all = this.steps().filter(s => !act || s.compareDocumentPosition(act) & Node.DOCUMENT_POSITION_FOLLOWING);
    all.forEach((s, i) => {
      if (i === all.length - 1 || s.querySelector(':scope > button.next') || !s.querySelector('input, select')) return;
      s.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="small next">Dalej: ${StepGuide.title(all[i + 1]!)}</button>`,
      );
    });
  }

  start(): void {
    this.doc.head.insertAdjacentHTML('beforeend', CSS);
    const { panel } = this;
    panel.addEventListener('click', e => this.onClick(e.target as Element));
    panel.addEventListener('keydown', e => {
      const t = e.target as Element;
      const h = t.closest && t.closest<HTMLElement>('.step-head');
      if (h && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        h.click();
      }
    });
    this.doc.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      if (t.id !== 'needSet') return;
      const c = this.el<HTMLInputElement>('count')!;
      c.value = t.dataset.n!;
      c.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const later = (): void => this.later();
    panel.addEventListener('input', later);
    panel.addEventListener('change', later);
    new MutationObserver(later).observe(this.el('tbl')!, { childList: true });
    new MutationObserver(later).observe(this.el('msg')!, { childList: true });
    new MutationObserver(later).observe(panel, { childList: true });
    panel.querySelectorAll(':scope > .step').forEach(s => new MutationObserver(later).observe(s, { childList: true }));

    this.prepare();
    this.addNext();
    this.steps().forEach((s, i) => this.setOpen(s, i === 0));
    this.ready = true;
    this.update();
  }
}

const panel = document.querySelector<HTMLElement>('.panel');
if (panel) {
  const guide = new StepGuide(window, panel);
  guide.start();
  Object.assign(window, {
    Kroki: { open: (i: number) => guide.open(guide.steps()[i]!, true), update: () => guide.update() },
  });
}

// Galeria gotowych wzorów (docs/sections/15-galeria-wzorow.md) – odpowiednik starego galeria.js.
// Hak w bryty.html: <div id="galeriaBox" class="sub"></div> pod krokiem 1. Stały katalog z Wikimedia Commons
// (wzory/katalog.js + miniatury wzory/mini/*.jpg) wczytywany dopiero przy otwarciu galerii. Pełny plik pobiera
// przeglądarka z upload.wikimedia.org po „Użyj tego wzoru” i wstawia do kroku 1 jak przeciągnięty plik.
// Czysta logika (katalog, wyszukiwanie, jakość, metryka licencji) w src/domain/gallery.ts; tu strona.
import {
  downloadMessage,
  findPatterns,
  GALLERY_BADGES,
  galleryQuality,
  hiddenMessage,
  licenseText,
  originalSize,
  patternRecord,
  prepCatalog,
  qualityNote,
  type GalleryCatalog,
  type GalleryPattern,
  type GalleryQuality,
  type PatternRecord,
} from '../domain/gallery';
import type { QualityThresholds } from '../domain/quality';

export const CONFIG = {
  katalog: 'wzory/katalog.js',
  mini: (id: string): string => `wzory/mini/${id}.jpg`,
};

// Wygląd galerii (tekst stylu skopiowany 1:1 ze starego programu).
const CSS = `
      #galeriaBox { border-top: 3px solid var(--v-green); }
      #galeriaBox > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; }
      #galeriaBox > summary::-webkit-details-marker { display: none; }
      #galeriaBox > summary::before { content: "▦"; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; background: var(--v-green); color: var(--v-ink); font-size: 15px; }
      #galeriaBox > summary .g-opt { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--muted); }
      #galeriaBox .g-cats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
      #galeriaBox .g-cats button { width: auto; letter-spacing: .5px; text-transform: none; height: 30px; padding: 0 10px; font-size: 12.5px; font-weight: 500; background: var(--field); color: var(--text); border: 1px solid var(--line); }
      #galeriaBox .g-cats button.on { background: var(--v-ink); color: #fff; border-color: var(--v-ink); }
      #galeriaBox .g-search { margin-top: 10px; }
      #galeriaBox .g-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 10px; max-height: 420px; overflow-y: auto; }
      #galeriaBox .g-grid button.g-thumb { position: relative; height: auto; aspect-ratio: 4 / 3; padding: 0; background: var(--disabled); border: 2px solid transparent; overflow: hidden; }
      #galeriaBox .g-grid button.g-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
      #galeriaBox .g-grid button.g-thumb.on { border-color: var(--v-green); }
      #galeriaBox .g-grid .gq { position: absolute; left: 3px; bottom: 3px; }
      #galeriaBox .gq { display: inline-block; text-transform: none; letter-spacing: 0; padding: 1px 6px; font-size: 10.5px; font-weight: 600; line-height: 1.5; }
      #galeriaBox .gq-good { background: #d9f5ec; color: #11634f; }
      #galeriaBox .gq-ok { background: var(--warn-bg); color: var(--warn); }
      #galeriaBox .gq-bad { background: #fde3e1; color: var(--err); }
      #galeriaBox .g-detail { margin-top: 12px; padding: 10px; border: 1px solid var(--line); background: var(--field-soft); font-size: 13px; }
      #galeriaBox .g-detail img { display: block; width: 100%; max-height: 260px; object-fit: contain; background: var(--disabled); margin-bottom: 8px; }
      #galeriaBox .g-detail .g-title { font-weight: 600; font-size: 14px; }
      #galeriaBox .g-detail .g-lic { margin-top: 6px; color: var(--muted); font-size: 12px; }
      #galeriaBox .g-detail a { color: var(--link); }
      #galeriaBox .g-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
      #galeriaBox .g-msg { margin-top: 8px; font-size: 13px; }
      #galeriaBox .g-msg.err { color: var(--err); }
      #galeriaBox .g-cur { margin-top: 10px; padding: 8px 10px; background: var(--accent-soft); font-size: 12.5px; }
      #galeriaBox .g-cur button { height: 30px; padding: 0 10px; font-size: 12px; margin-top: 6px; }
      @media (max-width: 520px) { #galeriaBox .g-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`;

const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

type GalleryWindow = Window &
  typeof globalThis & {
    WZORY_KATALOG?: GalleryCatalog;
    Jakosc?: { prog?: QualityThresholds };
    grafikaId?: number;
  };

export class PatternGallery {
  /** Katalog po sprawdzeniu wpisów (null = jeszcze nie wczytany). */
  private K: GalleryCatalog | null = null;
  /** Obietnica trwającego wczytywania katalogu. */
  private catalogLoading: Promise<void> | null = null;
  private cat: string | null = null;
  private query = '';
  private list: GalleryPattern[] = [];
  private chosen: number | null = null;
  private busy = false;
  /** Metryka wzoru, który jest teraz w kroku 1 (null = własne zdjęcie). */
  private cur: PatternRecord | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly win: GalleryWindow) {}

  private get doc(): Document {
    return this.win.document;
  }
  private $<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }
  private num(id: string): number {
    const el = this.$<HTMLInputElement>(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }
  /** Te same progi co kontrola jakości. */
  private prog(): QualityThresholds {
    return (this.win.Jakosc && this.win.Jakosc.prog) || { good: 2500, min: 1000 };
  }

  get current(): PatternRecord | null {
    return this.cur;
  }

  // Katalog ładowany dopiero przy otwarciu galerii (zwykły <script>, działa też z pliku bez serwera).
  private loadCatalog(): Promise<void> {
    const win = this.win;
    if (win.WZORY_KATALOG) {
      this.K = prepCatalog(win.WZORY_KATALOG);
      return Promise.resolve();
    }
    if (this.catalogLoading) return this.catalogLoading; // ponowne otwarcie przed wczytaniem – bez drugiego <script>
    return (this.catalogLoading = new Promise((res, rej) => {
      const s = this.doc.createElement('script');
      s.src = CONFIG.katalog;
      s.onload = (): void => {
        // Uszkodzony katalog: komunikat i możliwość ponowienia, zamiast wiecznego „Wczytuję…”.
        const k = win.WZORY_KATALOG;
        try {
          if (!k || !Array.isArray(k.wzory)) throw new Error('pusty albo uszkodzony katalog');
          this.K = prepCatalog(k);
          res();
        } catch (e) {
          this.K = null;
          this.catalogLoading = null;
          s.remove();
          delete win.WZORY_KATALOG;
          rej(e as Error);
        }
      };
      s.onerror = (): void => {
        this.catalogLoading = null;
        s.remove();
        rej(new Error('brak pliku ' + CONFIG.katalog));
      };
      this.doc.head.appendChild(s);
    }));
  }

  // --- jakość pod aktualną ścianę (kadr „cover”, powiększenie 100%) ---
  private quality(w: number, h: number): GalleryQuality | null {
    const wm = (this.num('wallW') + this.num('mL') + this.num('mR')) / 100;
    const hm = (this.num('wallH') + this.num('mT') + this.num('mB')) / 100;
    return galleryQuality(w, h, wm, hm, this.prog());
  }
  private badge(a: GalleryPattern): string {
    const q = this.quality(a.w, a.h);
    return q ? `<span class="gq ${GALLERY_BADGES[q.level][1]}">${GALLERY_BADGES[q.level][0]}</span>` : '';
  }
  /** Wzorów za słabych na tę ścianę (poniżej progu minimum) klient w ogóle nie widzi. */
  private tooWeak(a: GalleryPattern): boolean {
    const q = this.quality(a.w, a.h);
    return !!q && q.level === 'bad';
  }

  // --- interfejs ---
  private css(): void {
    if (this.$('galeriaCss')) return;
    const s = this.doc.createElement('style');
    s.id = 'galeriaCss';
    s.textContent = CSS;
    this.doc.head.appendChild(s);
  }

  private build(): void {
    const box = this.$('galeriaBox')!;
    const d = this.doc.createElement('details');
    d.id = 'galeriaBox';
    d.className = box.className;
    d.innerHTML = `
      <summary>Gotowe wzory<span class="g-opt">zamiast własnego zdjęcia</span></summary>
      <div class="hint">Wybrane zdjęcia i obrazy z Wikimedia Commons na licencjach, które pozwalają drukować i sprzedawać. Plakietka mówi, czy rozdzielczość wystarczy na ścianę z kroku 1.</div>
      <div class="g-cats" id="gCats"></div>
      <div class="g-search"><input id="gQ" type="text" placeholder="Szukaj, np. zachód słońca, palmy, zamek…" aria-label="Szukaj wzoru"></div>
      <div class="g-grid" id="gGrid"></div>
      <div id="gDetail"></div>
      <div class="g-msg" id="gMsg" role="status" aria-live="polite"></div>
      <div id="gCur"></div>`;
    box.replaceWith(d);
    d.addEventListener('toggle', () => {
      if (d.open && !this.K) void this.open();
    });
  }

  private msg(t: string, err?: boolean): void {
    const el = this.$('gMsg');
    if (el) {
      el.textContent = t;
      el.className = 'g-msg' + (err ? ' err' : '');
    }
  }
  private setBusy(b: boolean): void {
    this.busy = b;
    const el = this.$<HTMLButtonElement>('gUse');
    if (el) el.disabled = b;
  }

  private async open(): Promise<void> {
    this.msg('Wczytuję galerię…');
    try {
      await this.loadCatalog();
      const K = this.K!;
      const cats = this.$('gCats')!;
      cats.innerHTML = K.kategorie
        .filter(c => K.wzory.some(w => w.cat === c.id))
        .map(c => `<button type="button" data-cat="${esc(c.id)}">${esc(c.nazwa)}</button>`)
        .join('');
      const first = cats.querySelector('button');
      this.msg(first ? '' : 'Katalog wzorów jest pusty.');
      if (first) this.pickCat(first.dataset.cat!);
    } catch (e) {
      this.msg('Nie udało się wczytać galerii (' + (e as Error).message + ').', true);
    }
  }

  private filter(): void {
    const K = this.K!;
    // Wybrany wzór zostaje wybrany po przeliczeniu.
    const keepId = this.chosen !== null && this.list[this.chosen] ? this.list[this.chosen]!.id : null;
    const found = findPatterns(K, this.cat, this.query);
    this.list = found.filter(a => !this.tooWeak(a));
    const hidden = found.length - this.list.length;
    const idx = keepId === null ? -1 : this.list.findIndex(a => a.id === keepId);
    this.chosen = idx >= 0 ? idx : null;
    this.showGrid();
    if (this.chosen !== null) this.showDetail();
    else this.$('gDetail')!.innerHTML = '';
    this.msg(hiddenMessage(this.list.length, found.length, hidden));
  }

  private showGrid(): void {
    this.$('gGrid')!.innerHTML = this.list
      .map(
        (
          a,
          i,
        ) => `<button type="button" class="g-thumb${this.chosen === i ? ' on' : ''}" data-i="${i}" title="${esc(a.tytul)}">
      <img loading="lazy" src="${CONFIG.mini(a.id)}" alt="${esc(a.tytul)}">${this.badge(a)}</button>`,
      )
      .join('');
  }

  private catButtons(): NodeListOf<HTMLButtonElement> {
    return this.doc.querySelectorAll<HTMLButtonElement>('#gCats button');
  }
  private pickCat(id: string): void {
    this.cat = id;
    this.query = '';
    this.$<HTMLInputElement>('gQ')!.value = '';
    this.catButtons().forEach(b => b.classList.toggle('on', b.dataset.cat === id));
    this.filter();
  }
  private runSearch(): void {
    this.query = this.$<HTMLInputElement>('gQ')!.value.trim();
    if (!this.query) {
      if (this.cat) this.pickCat(this.cat);
      return;
    }
    this.catButtons().forEach(b => b.classList.remove('on'));
    this.filter();
  }

  private showDetail(): void {
    const a = this.chosen === null ? undefined : this.list[this.chosen];
    if (!a) {
      this.$('gDetail')!.innerHTML = '';
      return;
    }
    const q = this.quality(a.w, a.h);
    const qText = qualityNote(q, this.prog());
    this.$('gDetail')!.innerHTML = `<div class="g-detail">
      <img src="${CONFIG.mini(a.id)}" alt="${esc(a.tytul)}">
      <div class="g-title">${esc(a.tytul)}</div>
      <div>Autor: ${esc(a.autor)}</div>
      <div>Oryginał: ${originalSize(a)} · Jakość na tę ścianę: ${q ? `<span class="gq ${GALLERY_BADGES[q.level][1]}">${GALLERY_BADGES[q.level][0]}</span>` : '–'}</div>
      <div class="g-lic">${esc(qText)}<br>Licencja: ${esc(a.licencja)}${a.podpisWymagany ? ' – wymaga podpisu autora (jest w metryce)' : ''} · Źródło: <a href="${esc(a.zrodlo)}" target="_blank" rel="noopener">Wikimedia Commons</a></div>
      <div class="g-actions"><button type="button" id="gUse">Użyj tego wzoru</button></div>
    </div>`;
  }

  private async use(): Promise<void> {
    const a = this.chosen === null ? undefined : this.list[this.chosen];
    if (!a || this.busy) return;
    if (this.tooWeak(a)) return this.msg('Ten wzór ma za małą rozdzielczość na tę ścianę.', true);
    this.setBusy(true);
    const before = this.win.grafikaId; // podmiana na powiększenie AI tej samej grafiki nie liczy się jako zmiana
    try {
      this.msg(downloadMessage(a));
      // Limit 10 min: zawieszone pobieranie nie blokuje galerii na zawsze (przycisk „Użyj” wraca).
      const r = await this.win.fetch(a.plik, { signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!r.ok) throw new Error(`serwer Wikimedia odpowiedział ${r.status}`);
      const blob = await r.blob();
      if (this.win.grafikaId !== before)
        return this.msg('W międzyczasie wybrano inne zdjęcie – wzoru nie wstawiono.', true);
      this.cur = patternRecord(a, new Date().toISOString());
      const input = this.$<HTMLInputElement>('file')!;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], this.cur.name, { type: 'image/jpeg' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      this.msg(
        'Wzór wstawiony w miejsce zdjęcia. Ustaw kadr na podglądzie, potem przejdź do kroku 6 (pliki do produkcji).',
      );
      this.showCurrent();
    } catch (e) {
      const err = e as Error;
      this.msg(
        'Nie udało się pobrać wzoru: ' +
          (err.name === 'TimeoutError' ? 'pobieranie trwało ponad 10 minut' : err.message) +
          '. Sprawdź internet.',
        true,
      );
    } finally {
      this.setBusy(false);
    }
  }

  private showCurrent(): void {
    const el = this.$('gCur');
    if (!el) return;
    const c = this.cur;
    el.innerHTML = c
      ? `<div class="g-cur"><b>Wzór w zleceniu:</b> ${esc(c.credit)}
      ${c.attribution ? '<br>Licencja wymaga podania autora – dołącz metrykę do zlecenia i podaj autora przy sprzedaży.' : ''}<br>
      <button type="button" class="small" id="gTxt">Pobierz metrykę licencji (TXT)</button></div>`
      : '';
  }

  /** Metryka do dołączenia do zlecenia (dowód źródła i licencji). */
  licenseText(c: PatternRecord | null = this.cur): string {
    return licenseText(c);
  }

  private downloadTxt(): void {
    if (!this.cur) return;
    const a = this.doc.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + this.licenseText()], { type: 'text/plain;charset=utf-8' }));
    a.download = this.cur.name.replace(/\.jpg$/, '-licencja.txt');
    this.doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  init(): void {
    if (!this.$('galeriaBox')) return;
    this.css();
    this.build();
    const d = this.$('galeriaBox')!;
    d.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const c = t.closest<HTMLElement>('#gCats button');
      if (c) return this.pickCat(c.dataset.cat!);
      const th = t.closest<HTMLElement>('.g-thumb');
      if (th) {
        this.chosen = +th.dataset.i!;
        this.doc.querySelectorAll('#gGrid .g-thumb').forEach(b => b.classList.toggle('on', b === th));
        this.showDetail();
        this.msg('');
        return;
      }
      if (t.id === 'gUse') void this.use();
      else if (t.id === 'gTxt') this.downloadTxt();
    });
    const q = this.$<HTMLInputElement>('gQ')!;
    q.addEventListener('input', () => {
      if (this.K) this.runSearch();
    });
    q.addEventListener('keydown', e => {
      if (e.key === 'Enter') e.preventDefault();
    });
    // Własne zdjęcie (albo grafika AI) zastępuje wzór – metryka przestaje obowiązywać.
    const file = this.$<HTMLInputElement>('file')!;
    file.addEventListener('change', () => {
      const f = file.files![0];
      if (this.cur && (!f || f.name !== this.cur.name)) {
        this.cur = null;
        this.showCurrent();
      }
    });
    // Plakietki jakości idą za wymiarem ściany i naddatkami.
    const refresh = (): void => this.refresh();
    for (const id of ['wallW', 'wallH', 'mT', 'mB', 'mL', 'mR']) {
      const el = this.$(id);
      if (el) {
        el.addEventListener('input', refresh);
        el.addEventListener('change', refresh);
      }
    }
  }

  // Zmiana ściany lub naddatków: plakietki i lista dostępnych wzorów liczą się od nowa.
  // Odczekanie 250 ms po ostatnim znaku: przy wpisywaniu wymiaru siatka nie przebudowuje się co klawisz.
  private refresh(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      if (this.K && (this.cat || this.query)) this.filter();
    }, 250);
  }
}

// Pomost dla skryptów, które jeszcze nie są przepisane (kroki czytają Galeria.current().title).
const gallery = new PatternGallery(window as GalleryWindow);
Object.assign(window, {
  Galeria: {
    init: () => gallery.init(),
    current: () => gallery.current,
    licenseText: (c?: PatternRecord | null) => gallery.licenseText(c === undefined ? gallery.current : c),
    CONFIG,
  },
});
gallery.init();

// Karty materiałów Valare (krok 2) – odpowiednik starego materialy.js. Dane i wybór z domeny
// (src/domain/materials.ts, cennik Valare 2024/1); tu tylko karty na stronie.
// Wybór dalej siedzi w ukrytym <select id="material"> (value = „szerokośćDruku|id”, tekst „Nazwa – druk N cm”),
// więc bryty.js i pamiec.js działają bez zmian. Inne moduły: zdarzenie 'materialy:zmiana' (detail = wybrany
// materiał albo null) i – do czasu przepisania reszty strony – globalny obiekt Materialy.
import {
  MATERIAL_GROUPS,
  MATERIAL_SOURCE,
  MaterialCatalog,
  TERMS,
  type Material,
  type OwnMaterial,
} from '../domain/materials';

const zl = (n: number): string => n.toFixed(2).replace('.', ',');
const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const LOCK = (closed: boolean): string =>
  `<svg class="mk-lock" viewBox="0 0 16 18" aria-hidden="true"><path d="${closed ? 'M4 8V5a4 4 0 0 1 8 0v3' : 'M4 8V5a4 4 0 0 1 7.6-1.7'}" fill="none" stroke="currentColor" stroke-width="2"/><rect x="1" y="8" width="14" height="10" fill="currentColor"/></svg>`;

// Wygląd kart (skopiowany 1:1 ze starego programu).
const CSS = `
  .mk-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; }
  #mkBox .mk-filters button { width: auto; height: 30px; margin: 0; padding: 0 10px; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;
    border: 1px solid var(--line); background: var(--field); color: var(--text); border-radius: var(--radius-btn); cursor: pointer; }
  #mkBox .mk-filters button:hover { background: var(--small-hover); }
  #mkBox .mk-filters button[aria-pressed=true] { background: var(--seg-on); color: var(--seg-on-text); border-color: var(--seg-on); }
  .mk-list { display: flex; flex-direction: column; gap: 8px; max-height: 460px; overflow-y: auto; padding-right: 4px; }
  .mk-card { position: relative; border: 1px solid var(--card-line); background: var(--card); padding: 10px 12px 10px 14px; cursor: pointer; border-radius: var(--radius); transition: border-color .15s, background .15s; }
  .mk-card:hover { border-color: var(--line-strong); }
  .mk-card:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
  .mk-card.on { border-color: var(--accent); background: var(--accent-soft); }
  .mk-card.on::before { content: ''; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 4px; background: var(--accent); }
  .mk-top { display: flex; align-items: baseline; gap: 8px; }
  .mk-lock { width: 12px; height: 14px; color: var(--v-green); flex: none; align-self: center; }
  .mk-name { font-weight: 600; text-transform: uppercase; letter-spacing: .8px; font-size: 13px; flex: 1; min-width: 0; }
  .mk-price { font-size: 13px; font-weight: 600; white-space: nowrap; }
  .mk-price small { font-weight: 400; color: var(--muted); }
  .mk-meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
  .mk-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
  .mk-badge { font-size: 11px; letter-spacing: .3px; padding: 2px 7px; border: 1px solid var(--line); color: var(--text); white-space: nowrap; }
  .mk-badge.order { border-color: var(--warn); color: var(--warn); background: var(--warn-bg); }
  .mk-badge.stock { border-color: var(--accent); color: var(--link); }
  .mk-badge.print { background: var(--v-ink); border-color: var(--v-ink); color: #fff; }
  #mkBox .mk-chip { width: auto; height: auto; margin: 0; padding: 2px 7px; font: inherit; font-size: 11px; font-weight: 400; letter-spacing: .3px; text-transform: none;
    border: 1px solid var(--line-strong); background: var(--field); color: var(--text); border-radius: 0; cursor: pointer; }
  #mkBox .mk-chip:hover { background: var(--small-hover); }
  #mkBox .mk-chip.on { background: var(--v-ink); border-color: var(--v-ink); color: #fff; }
  .mk-card details { margin-top: 6px; font-size: 12px; color: var(--muted); }
  .mk-card summary { cursor: pointer; color: var(--link); width: max-content; }
  .mk-card details p { margin: 4px 0 0; }
  .mk-sel { font-size: 12px; margin-top: 8px; color: var(--muted); }
  .mk-sel b { color: var(--text); }`;

/** Karta produktu; produkt z kilkoma rolkami (Sand Dot, Texile) ma przyciski-rolki zamiast jednej szerokości. */
function card(variants: readonly Material[]): string {
  const m = variants[0]!;
  const gram = m.gramatura ? `${m.gramatura} g/m²` : '';
  const chips =
    variants.length > 1
      ? variants
          .map(
            v =>
              `<button type="button" class="mk-chip" data-id="${v.id}" title="materiał ${v.szerMaterialu} cm">${v.szerMaterialu} cm → druk ${v.szerDruku}</button>`,
          )
          .join('')
      : `<span class="mk-badge print">druk maks. ${m.szerDruku} cm</span><span class="mk-meta" style="margin:0">materiał ${m.szerMaterialu} cm</span>`;
  return `<div class="mk-card" role="button" tabindex="0" data-id="${m.id}" data-group="${esc(m.grupa)}">
      <div class="mk-top">${LOCK(m.naZamowienie)}<span class="mk-name">${esc(m.nazwa.replace(/ \d+$/, variants.length > 1 ? '' : '$&'))}</span>
        <span class="mk-price">${zl(m.cenaBruttoM2)} zł <small>/m² brutto</small></span></div>
      <div class="mk-meta">${esc(m.grupa)} · ${esc(m.aspekt.toUpperCase())} · ${gram ? gram + ' · ' : ''}${esc(m.struktura)} · palność ${esc(m.palnosc)}${m.waterproof ? ' · WATERPROOF' : ''}</div>
      <div class="mk-row">${chips}
        <span class="mk-badge ${m.naZamowienie ? 'order' : 'stock'}">${m.naZamowienie ? `na zamówienie · ${TERMS.naZamowienie.dni} dni rob.` : `ogólnodostępny · ${TERMS.standard.dni} dni rob.`}</span></div>
      <details><summary>Opis</summary><p>${esc(m.opis)}</p><p>Cena netto: ${zl(m.cenaNettoM2)} zł/m². Źródło: cennik Valare 2024/1.</p></details>
    </div>`;
}

export class MaterialPicker {
  /** Ostatnio ogłoszony wybór (zdarzenie tylko przy zmianie). */
  private last: string | undefined;
  /** Ostatni tekst regionu aria-live (czytnik ekranu nie czyta przy każdym ruchu). */
  private lastHtml: string | undefined;

  constructor(
    private readonly doc: Document,
    readonly catalog: MaterialCatalog = new MaterialCatalog(),
  ) {}

  private get select(): HTMLSelectElement | null {
    return this.doc.getElementById('material') as HTMLSelectElement | null;
  }

  /** Wybrany materiał z listy (null = bez materiału). */
  selected(): Material | OwnMaterial | null {
    const s = this.select;
    const max = this.doc.getElementById('maxPrint') as HTMLInputElement | null;
    return this.catalog.selected(s ? s.value : '', max ? max.value : '');
  }

  /** Buduje karty pod listą (raz) i zachowuje wcześniejszy wybór po tekście opcji. */
  init(): void {
    const s = this.select;
    if (!s || this.doc.getElementById('mkBox')) return;
    const prev = s.selectedIndex >= 0 ? s.options[s.selectedIndex]!.text : '';
    s.innerHTML = this.catalog
      .options()
      .map(o => `<option value="${o.value}">${esc(o.text)}</option>`)
      .join('');
    const pi = [...s.options].findIndex(o => o.text === prev);
    if (pi > 0) s.selectedIndex = pi;
    s.hidden = true;

    this.doc.head.insertAdjacentHTML('beforeend', `<style id="mkCss">${CSS}</style>`);
    const groups = new Map<string, Material[]>();
    for (const m of this.catalog.list) groups.set(m.produkt, [...(groups.get(m.produkt) ?? []), m]);
    s.insertAdjacentHTML(
      'afterend',
      `<div id="mkBox">
      <div class="mk-filters" role="group" aria-label="Grupa materiałów">${['Wszystkie', ...MATERIAL_GROUPS].map((g, i) => `<button type="button" data-f="${g}" aria-pressed="${i === 0}">${g}</button>`).join('')}</div>
      <div class="mk-list">${[...groups.values()].map(card).join('')}
        <div class="mk-card" role="button" tabindex="0" data-id="own" data-group="*"><div class="mk-top"><span class="mk-name">Inny materiał</span></div><div class="mk-meta">Spoza cennika – wpisz maks. szerokość druku poniżej.</div></div>
        <div class="mk-card" role="button" tabindex="0" data-id="" data-group="*"><div class="mk-top"><span class="mk-name">Bez materiału</span></div><div class="mk-meta">Bez kontroli szerokości brytu.</div></div>
      </div>
      <div class="mk-sel" id="mkSel" aria-live="polite"></div></div>`,
    );

    const box = this.doc.getElementById('mkBox')!;
    box.addEventListener('click', e => this.onClick(box, e.target as Element));
    box.addEventListener('keydown', e => {
      const t = e.target as HTMLElement;
      if (t.classList?.contains('mk-card') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        t.click();
      }
    });
    // Odśwież zaznaczenie po każdej zmianie formularza (także gdy pamiec.js przywraca wybór).
    this.doc.addEventListener('input', () => this.sync());
    this.doc.addEventListener('change', () => this.sync());
    this.sync();
  }

  /** Ustawia wybór w liście i powiadamia stronę jak użytkownik (input + change). */
  private choose(id: string): void {
    const s = this.select!;
    const v = id === '' || id === 'own' ? id : `${this.catalog.byId(id)!.szerDruku}|${id}`;
    if (s.value === v) return;
    s.value = v;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private onClick(box: HTMLElement, target: Element): void {
    if (target.closest('summary, details p')) return;
    const f = target.closest<HTMLElement>('[data-f]');
    if (f) {
      box.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', String(b === f)));
      box.querySelectorAll<HTMLElement>('.mk-card').forEach(c => {
        c.hidden = !(f.dataset.f === 'Wszystkie' || c.dataset.group === '*' || c.dataset.group === f.dataset.f);
      });
      return;
    }
    const chip = target.closest<HTMLElement>('.mk-chip');
    const card = target.closest<HTMLElement>('.mk-card');
    if (chip) return this.choose(chip.dataset.id!);
    if (!card) return;
    // Karta z kilkoma rolkami: zostaw wybraną rolkę, jeśli karta już jest wybrana.
    const cur = this.selected();
    if (cur && card.querySelector(`.mk-chip[data-id="${cur.id}"]`)) return;
    this.choose(card.dataset.id!);
  }

  /** Zaznaczenie kart, opis wyboru i zdarzenie 'materialy:zmiana' (tylko gdy wybór się zmienił). */
  sync(): void {
    const box = this.doc.getElementById('mkBox');
    if (!box) return;
    const m = this.selected();
    const id = m ? m.id : '';
    box.querySelectorAll('.mk-card').forEach(c => {
      const on = (c as HTMLElement).dataset.id === id || !!c.querySelector(`.mk-chip[data-id="${id}"]`);
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    box.querySelectorAll<HTMLElement>('.mk-chip').forEach(c => {
      c.classList.toggle('on', c.dataset.id === id);
      c.setAttribute('aria-pressed', String(c.dataset.id === id));
    });
    const h = !m
      ? 'Wybrany: <b>bez materiału</b> (bez kontroli szerokości).'
      : 'wlasny' in m
        ? `Wybrany: <b>inny materiał</b>, maks. druk ${m.szerDruku ?? '?'} cm.`
        : `Wybrany: <b>${esc(m.nazwa)}</b>, maks. druk ${m.szerDruku} cm, ${zl(m.cenaBruttoM2)} zł/m² brutto, ${m.naZamowienie ? 'na zamówienie (21 dni rob.)' : 'ogólnodostępny (10 dni rob.)'}.`;
    if (this.lastHtml !== h) {
      this.lastHtml = h;
      this.doc.getElementById('mkSel')!.innerHTML = h;
    }
    const key = JSON.stringify(m);
    if (key !== this.last) {
      this.last = key;
      this.doc.dispatchEvent(new CustomEvent('materialy:zmiana', { detail: m }));
    }
  }
}

const picker = new MaterialPicker(document);

// Zgodność ze starymi skryptami strony – do czasu ich przepisania.
Object.assign(window, {
  Materialy: {
    lista: picker.catalog.list,
    GRUPY: MATERIAL_GROUPS,
    TERMINY: TERMS,
    ZRODLO: MATERIAL_SOURCE,
    wybrany: () => picker.selected(),
    init: () => picker.init(),
    sync: () => picker.sync(),
  },
});
picker.init();

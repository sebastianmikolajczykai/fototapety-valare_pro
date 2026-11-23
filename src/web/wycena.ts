// Wycena na żywo i termin realizacji (krok 8) – odpowiednik starego wycena.js. Obliczenia w domenie
// (src/domain/pricing.ts: cennik Valare 2024/1, styk, terminy, dni robocze); tu tylko panel na stronie.
// Haki w bryty.html: <div id="wycenaBox" class="step"></div>; bryty.js wywołuje Wycena.update(p, L)
// (L = null, gdy ustawienia mają błąd). Do czasu przepisania bryty.js panel wystawia globalny obiekt Wycena.
import type { Layout, WallParams } from '../domain/layout';
import {
  addWorkdays,
  areaM2,
  BUTT_PER_M,
  calcPrice,
  materialNameFromOption,
  PRICE_LIST,
  PRICING_TERMS,
  type AreaMode,
  type TermKey,
} from '../domain/pricing';

const ORDER_DAYS = 21;
const AREAS: Readonly<Record<AreaMode, string>> = {
  margin: 'ściana z naddatkiem',
  print: 'bryty do druku (z naddatkiem i zakładem)',
  wall: 'sama ściana',
};

const zl = (x: number): string =>
  x.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const n2 = (x: number): string => x.toLocaleString('pl-PL', { maximumFractionDigits: 2 });

export class PricingPanel {
  private readonly state: { area: AreaMode; termin: TermKey; order: boolean } = {
    area: 'margin',
    termin: 'standard',
    order: false,
  };
  private last: { p: WallParams | null; L: Layout | null } = { p: null, L: null };
  private lastHtml: string | null = null;
  private lastMat: string | undefined;

  constructor(
    private readonly doc: Document,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Nazwa materiału z listy („Sand Dot GW 137 – druk 131 cm” → „Sand Dot GW”). */
  private materialName(): string | null {
    const sel = this.doc.getElementById('material') as HTMLSelectElement | null;
    const o = sel?.selectedOptions[0];
    return o ? materialNameFromOption(o.value, o.textContent ?? '') : null;
  }

  build(): void {
    const box = this.doc.getElementById('wycenaBox');
    if (!box) return;
    const { state } = this;
    const radio = (k: string, name: string): string =>
      `<label class="radio"><input type="radio" name="wycTermin" value="${k}"${state.termin === k ? ' checked' : ''}> ${name}</label>`;
    box.innerHTML =
      '<div class="step-head"><span class="num">8</span><h2>Wycena i termin</h2></div>' +
      '<label>Termin realizacji</label>' +
      `<div class="radios seg" role="radiogroup" aria-label="Termin realizacji" id="wycTerminy">${Object.entries(
        PRICING_TERMS,
      )
        .map(([k, t]) => radio(k, t.name))
        .join('')}</div>` +
      `<label class="check"><input id="wycOrder" type="checkbox"${state.order ? ' checked' : ''}> Materiał na zamówienie (brak na stanie) – ${ORDER_DAYS} dni roboczych</label>` +
      '<label for="wycArea">Powierzchnia do wyceny</label>' +
      `<select id="wycArea">${Object.entries(AREAS)
        .map(([k, v]) => `<option value="${k}"${state.area === k ? ' selected' : ''}>${v}</option>`)
        .join('')}</select>` +
      '<div id="wycOut" class="msg" aria-live="polite"></div>' +
      '<div class="hint">Ceny i terminy: cennik Valare 2024/1 (od 15.05.2024).</div>';
    box.addEventListener('input', e => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'wycTermin') state.termin = t.value as TermKey;
      else if (t.id === 'wycOrder') state.order = t.checked;
      else if (t.id === 'wycArea') state.area = t.value as AreaMode;
      this.show();
    });
  }

  /** Region aria-live: zapis tylko przy zmianie treści. */
  private put(out: HTMLElement, h: string): void {
    if (this.lastHtml !== h) {
      this.lastHtml = h;
      out.innerHTML = h;
    }
  }

  show(): void {
    const out = this.doc.getElementById('wycOut');
    if (!out) return;
    // Przy materiale na zamówienie nie ma danych o przyspieszeniu – wybór terminu wyłączony.
    this.doc.querySelectorAll<HTMLInputElement>('#wycTerminy input').forEach(el => (el.disabled = this.state.order));
    const { p, L } = this.last;
    if (!p || !L) return this.put(out, '<div class="hint">Wycena pojawi się po poprawieniu ustawień.</div>');
    const n = L.bw.widths.length;
    const area = areaM2(p, L, this.state.area);
    const material = this.materialName();
    const R = calcPrice({
      material,
      area,
      joints: n - 1,
      heightCm: L.totalHcm,
      butt: p.join === 'butt',
      termin: this.state.termin,
      order: this.state.order,
    });
    const t = R.termin;
    const date = addWorkdays(this.now(), t.days).toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    let h =
      `<div>Termin: <b>${t.name}, ${t.days} ${t.days < 5 ? 'dni robocze' : 'dni roboczych'}</b>` +
      (t.extra ? ` (dopłata +${Math.round(t.extra * 100)}%)` : '') +
      `. Gotowe orientacyjnie <b>${date}</b> (licząc od dziś, bez weekendów i świąt).</div>`;
    if (R.price === null)
      return this.put(out, h + '<div class="warn">Wybierz materiał z cennika, żeby zobaczyć cenę.</div>');
    const B = R.brutto;
    const N = R.netto;
    h +=
      '<table class="wycTbl"><tr><th>Pozycja</th><th>Brutto</th><th>Netto</th></tr>' +
      `<tr><td>${material}: ${n2(area)} m² × ${zl(R.price[0])}</td><td>${zl(B.druk)}</td><td>${zl(N.druk)}</td></tr>` +
      (p.join === 'butt'
        ? `<tr><td>Przygotowanie na styk: ${n2(R.mb)} mb × ${zl(BUTT_PER_M[0])}</td><td>${zl(B.styk)}</td><td>${zl(N.styk)}</td></tr>`
        : '<tr><td>Przygotowanie na zakładkę</td><td colspan="2">w cenie</td></tr>') +
      (t.extra
        ? `<tr><td>Dopłata za termin +${Math.round(t.extra * 100)}%</td><td>${zl(B.doplata)}</td><td>${zl(N.doplata)}</td></tr>`
        : '') +
      `<tr class="wycSum"><td><b>Razem</b></td><td><b>${zl(B.razem)}</b></td><td>${zl(N.razem)}</td></tr></table>`;
    this.put(out, h);
  }

  update(p: WallParams, L: Layout | null): void {
    this.last = { p, L };
    this.show();
  }

  /** Karty materiałów: przy zmianie materiału „na zamówienie” ustawia się wg cennika (nie przy każdym znaku). */
  onMaterialChange(detail: { id?: string; naZamowienie?: boolean } | null): void {
    const id = detail ? detail.id : '';
    if (id === this.lastMat) return this.show();
    this.lastMat = id;
    this.state.order = !!detail?.naZamowienie;
    const cb = this.doc.getElementById('wycOrder') as HTMLInputElement | null;
    if (cb) cb.checked = this.state.order;
    this.show();
  }

  /** Podłączenie do strony: styl tabeli, zdarzenie kart materiałów, budowa panelu po wczytaniu. */
  mount(): void {
    const css = this.doc.createElement('style');
    css.textContent =
      '.wycTbl{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}.wycTbl td,.wycTbl th{padding:6px 4px;text-align:right}' +
      '.wycTbl td:first-child,.wycTbl th:first-child{text-align:left;white-space:normal}.wycSum td{border-top:2px solid var(--v-green,#25c09e)}';
    this.doc.head.appendChild(css);
    this.doc.addEventListener('materialy:zmiana', e => this.onMaterialChange((e as CustomEvent).detail ?? null));
    const start = (): void => {
      this.build();
      this.show();
    };
    if (this.doc.readyState === 'loading') this.doc.addEventListener('DOMContentLoaded', start);
    else start();
  }
}

const panel = new PricingPanel(document);
panel.mount();

// Zgodność ze starymi skryptami strony (bryty.js wywołuje Wycena.update) – do czasu ich przepisania.
Object.assign(window, {
  Wycena: {
    CENNIK: PRICE_LIST,
    STYK_MB: BUTT_PER_M,
    TERMINY: PRICING_TERMS,
    calc: calcPrice,
    areaM2,
    addWorkdays,
    update: (p: WallParams, L: Layout | null) => panel.update(p, L),
  },
});

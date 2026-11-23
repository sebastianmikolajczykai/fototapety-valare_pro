// Zapamiętywanie ostatnich ustawień formularza w tej przeglądarce (localStorage) – odpowiednik starego pamiec.js.
// Nie zapisuje zdjęcia ani nazwy zlecenia. Przy otwarciu strony przywraca ustawienia,
// przycisk #resetSettings wraca do wartości domyślnych z formularza.

/** v3 (31.10.2026): uwagi ARPI z 28.10 – naddatek 3 cm, zakład 6 cm, bez paska thru cut; starsze zapisy nie wracają. */
export const SETTINGS_KEY = 'fototapety.ustawienia.v3';
const FIELDS = [
  'wallW',
  'wallH',
  'material',
  'maxPrint',
  'mT',
  'mB',
  'mL',
  'mR',
  'overlap',
  'count',
  'dpi',
  'thru',
  'pdf',
];
const RADIOS = ['join', 'split'];

export interface SavedSettings {
  radios: Record<string, string>;
  widths: string[];
  /** Kilka materiałów ma tę samą szerokość druku (value), więc materiał zapamiętujemy po nazwie. */
  materialName?: string;
  [field: string]: unknown;
}

export class SettingsMemory {
  constructor(
    private readonly doc: Document,
    private readonly storage: () => Storage,
  ) {}

  private el(id: string): HTMLInputElement | null {
    return this.doc.getElementById(id) as HTMLInputElement | null;
  }
  private widthInputs(): HTMLInputElement[] {
    return [...this.doc.querySelectorAll<HTMLInputElement>('#widthsBox input')];
  }

  read(): SavedSettings {
    const s: SavedSettings = { radios: {}, widths: this.widthInputs().map(el => el.value) };
    for (const id of FIELDS) {
      const el = this.el(id);
      if (el) s[id] = el.type === 'checkbox' ? el.checked : el.value;
    }
    const m = this.doc.getElementById('material') as HTMLSelectElement | null;
    if (m && m.selectedIndex >= 0) s.materialName = m.options[m.selectedIndex]!.text;
    for (const n of RADIOS) {
      const el = this.doc.querySelector<HTMLInputElement>(`input[name=${n}]:checked`);
      if (el) s.radios[n] = el.value;
    }
    return s;
  }

  write(s: SavedSettings): void {
    for (const id of FIELDS) {
      const el = this.el(id);
      if (!el || !(id in s)) continue;
      if (el.type === 'checkbox') el.checked = !!s[id];
      else if (
        el.tagName === 'SELECT' ? [...(el as unknown as HTMLSelectElement).options].some(o => o.value === s[id]) : true
      )
        el.value = s[id] as string;
    }
    const m = this.doc.getElementById('material') as HTMLSelectElement | null;
    const mi = m ? [...m.options].findIndex(o => o.text === s.materialName) : -1;
    if (m && mi >= 0) m.selectedIndex = mi;
    for (const n of RADIOS) {
      const el =
        s.radios &&
        [...this.doc.querySelectorAll<HTMLInputElement>(`input[name=${n}]`)].find(r => r.value === s.radios[n]);
      if (el) el.checked = true;
    }
    // główny skrypt odświeża podgląd i tworzy pola szerokości
    this.el('count')!.dispatchEvent(new Event('input', { bubbles: true }));
    const ws = this.widthInputs();
    if (s.widths && s.widths.length === ws.length) {
      ws.forEach((el, i) => (el.value = s.widths[i]!));
      this.el('widthsBox')!.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  private load(): unknown {
    try {
      return JSON.parse(this.storage().getItem(SETTINGS_KEY) || 'null');
    } catch {
      return null;
    }
  }
  private save(): void {
    try {
      this.storage().setItem(SETTINGS_KEY, JSON.stringify(this.read()));
    } catch {
      /* przeglądarka bez zapisu */
    }
  }
  private forget(): void {
    try {
      this.storage().removeItem(SETTINGS_KEY);
    } catch {
      /* przeglądarka bez zapisu */
    }
  }

  /** Przywraca zapis (uszkodzony albo z innej wersji jest kasowany) i od tej chwili zapisuje każdą zmianę. */
  start(): void {
    const defaults = this.read();
    const saved = this.load();
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      try {
        this.write(saved as SavedSettings);
      } catch {
        this.forget();
        this.write(defaults);
      }
    } else if (saved !== null) this.forget();

    const panel = this.doc.querySelector('.panel') || this.doc.body;
    const onEdit = (e: Event): void => {
      const id = (e.target as HTMLElement).id;
      if (id !== 'order' && id !== 'file') this.save();
    };
    panel.addEventListener('input', onEdit);
    panel.addEventListener('change', onEdit);

    this.el('resetSettings')?.addEventListener('click', () => {
      this.forget();
      this.write(defaults);
      const note = this.el('resetNote');
      if (note) {
        note.textContent = 'Przywrócono ustawienia domyślne.';
        setTimeout(() => (note.textContent = ''), 3000);
      }
    });
  }
}

new SettingsMemory(document, () => localStorage).start();

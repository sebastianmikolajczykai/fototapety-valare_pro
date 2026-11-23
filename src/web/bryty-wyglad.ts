// Warstwa interfejsu strony (wygląd Valare) – odpowiednik starego bryty-wyglad.js: przeciąganie zdjęcia,
// przyciski −/+ powiększenia, stan pola zdjęcia i domyślna nazwa zlecenia (src/domain/order.ts).
// Nie liczy niczego sama – przekazuje zdarzenia do pól, które obsługuje główny skrypt.
import { defaultOrderName } from '../domain/order';
import { parseNum } from '../domain/units';

export class PageChrome {
  /** Użytkownik wpisał własną nazwę zlecenia – domyślna przestaje za nim chodzić. */
  private orderTyped = false;

  constructor(private readonly win: Window & typeof globalThis) {}

  private el<T extends HTMLElement = HTMLInputElement>(id: string): T {
    return this.win.document.getElementById(id) as T;
  }

  /** Przeciągnij i upuść zdjęcie na pole „Wybierz zdjęcie”; upuszczenie obok nie otwiera pliku w przeglądarce. */
  private dropZone(): void {
    const drop = this.el<HTMLElement>('drop');
    const file = this.el('file');
    for (const ev of ['dragenter', 'dragover'])
      drop.addEventListener(ev, e => {
        e.preventDefault();
        drop.classList.add('over');
      });
    for (const ev of ['dragleave', 'dragend', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      const f = [...((e as DragEvent).dataTransfer?.files || [])].find(x => /^image\/(jpeg|png)$/.test(x.type));
      if (!f) {
        this.el<HTMLElement>('imgInfo').innerHTML = '<span class="err">To nie jest plik JPG ani PNG.</span>';
        return;
      }
      const dt = new DataTransfer();
      dt.items.add(f);
      file.files = dt.files;
      file.dispatchEvent(new Event('change', { bubbles: true }));
    });
    for (const ev of ['dragover', 'drop'])
      this.win.addEventListener(ev, e => {
        if (!drop.contains(e.target as Node)) e.preventDefault();
      });
    file.addEventListener('change', () => {
      if (!file.files?.[0]) return;
      this.el<HTMLElement>('dropTitle').textContent = 'Zmień zdjęcie';
      drop.classList.add('has-file');
    });
  }

  private autoOrder(): void {
    if (this.orderTyped) return;
    this.el('order').value = defaultOrderName(
      parseNum(this.el('wallW').value),
      parseNum(this.el('wallH').value),
      new Date(),
    );
  }

  /** Domyślna nazwa idzie za wymiarem ściany (też po przywróceniu ustawień), dopóki użytkownik nie wpisze własnej. */
  private orderName(): void {
    const order = this.el('order');
    order.addEventListener('input', e => {
      if (e.isTrusted) this.orderTyped = order.value.trim() !== '';
      this.autoOrder();
    });
    this.win.document.addEventListener('input', e => {
      if ((e.target as HTMLElement).id !== 'order') this.autoOrder();
    });
    this.autoOrder();
  }

  /** Powiększenie: −/+ o 10 punktów procentowych w granicach suwaka. */
  private zoomButtons(): void {
    const zoom = this.el('zoom');
    const out = this.el<HTMLButtonElement>('zoomOut');
    const inn = this.el<HTMLButtonElement>('zoomIn');
    const step = (d: number): void => {
      const v = Math.min(+zoom.max, Math.max(+zoom.min, Math.round(+zoom.value) + d));
      if (v === +zoom.value) return;
      zoom.value = String(v);
      zoom.dispatchEvent(new Event('input', { bubbles: true }));
    };
    out.addEventListener('click', () => step(-10));
    inn.addEventListener('click', () => step(10));
    const sync = (): void => {
      out.disabled = +zoom.value <= +zoom.min;
      inn.disabled = +zoom.value >= +zoom.max;
    };
    // Główny skrypt wpisuje aktualne powiększenie do #zoomVal przy każdym odświeżeniu podglądu.
    new MutationObserver(sync).observe(this.el('zoomVal'), { childList: true, characterData: true, subtree: true });
    sync();
  }

  start(): void {
    this.dropZone();
    this.orderName();
    this.zoomButtons();
  }
}

new PageChrome(window).start();

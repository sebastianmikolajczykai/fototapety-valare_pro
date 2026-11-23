// Narożniki, drzwi i okna – odpowiednik czystej części starego sciana.js (sekcja 09).
// Uwaga z audytu: w starym bryty.html nie ma #scianaBox, więc ta sekcja nie jest widoczna dla klienta.
// Logika przeniesiona i przetestowana; podłączenie w interfejsie = decyzja Sebastiana.
// Reguły z transkryptu (L972–981, L1089–1096, L1207–1211):
//   - łączenie nie może wypaść tuż przy narożniku (5 cm źle, 20–30 cm zawinięcia dobrze),
//   - łączenie nie w drzwiach/oknie ani tuż przy ich krawędzi,
//   - drzwi i okna drukujemy w całości, montażysta docina na miejscu.
// Położenia w cm od lewej krawędzi ściany (bez naddatku); y = od podłogi.
import { MAX_BRYTY, MIN_LAST_CM } from './constants';
import { f1, plural } from './format';
import type { Layout, WallParams } from './layout';

/** DO WALIDACJI: dolna granica „20–30 cm” z rozmowy. */
export const CORNER_MIN_CM = 20;
/** DO WALIDACJI: jak minimalny pasek (P5), żeby obok ościeżnicy nie został wąski pasek. */
export const OPENING_MIN_CM = 5;

export type WallItemType = 'corner' | 'door' | 'window';
export type WallField = 'x' | 'w' | 'y' | 'h';

/** Element ściany; NaN = puste pole. */
export interface WallItem {
  type: WallItemType;
  x: number;
  w: number;
  y: number;
  h: number;
}

export interface WallData {
  corners: { label: string; x: number }[];
  openings: { label: string; type: WallItemType; x: number; w: number; y: number; h: number | null }[];
  seams: { between: [number, number]; from: number; to: number; conflict: boolean }[];
}

interface Range {
  it: WallItem;
  a: number;
  b: number;
}
interface Seam {
  i: number;
  a: number;
  b: number;
}

const NAMES: Readonly<Record<WallItemType, string>> = { corner: 'Narożnik', door: 'Drzwi', window: 'Okno' };

/** Pole formularza: pusty tekst = NaN, przecinek dozwolony. */
export function parseWallField(v: string): number {
  const s = String(v).trim();
  return s === '' ? NaN : parseFloat(s.replace(',', '.'));
}

const hits = (s: { a: number; b: number }, f: Range): boolean => s.a < f.b - 1e-6 && s.b > f.a + 1e-6;

/** Łączenia: pas zakładu (albo linia przy styku) między brytem i a i+1, w cm całości. */
function seams(p: WallParams, widths: readonly number[]): Seam[] {
  const s: Seam[] = [];
  let a = 0;
  for (let i = 0; i < widths.length - 1; i++) {
    a += widths[i]! - p.overlap;
    s.push({ i, a, b: a + p.overlap });
  }
  return s;
}

export class WallFeatures {
  readonly items: WallItem[] = [];

  /** now: zegar do limitu czasu szukania propozycji (podmieniany w testach). */
  constructor(private readonly now: () => number = Date.now) {}

  add(type: WallItemType, values: Partial<Omit<WallItem, 'type'>> = {}): void {
    this.items.push({ x: NaN, w: NaN, y: type === 'door' ? 0 : NaN, h: NaN, ...values, type });
  }

  update(i: number, field: WallField, value: number): void {
    const it = this.items[i];
    if (it) it[field] = value;
  }

  remove(i: number): void {
    this.items.splice(i, 1);
  }

  /** Numeracja w obrębie rodzaju: Narożnik 1, Drzwi 1, Okno 1… */
  label(i: number): string {
    const type = this.items[i]!.type;
    return `${NAMES[type]} ${this.items.slice(0, i + 1).filter(x => x.type === type).length}`;
  }

  /** Pola, w których nie może leżeć łączenie (w cm całości, czyli razem z lewym naddatkiem). */
  private forbidden(p: WallParams): Range[] {
    const out: Range[] = [];
    for (const it of this.items) {
      if (!(it.x >= 0)) continue;
      if (it.type === 'corner') out.push({ it, a: p.mL + it.x - CORNER_MIN_CM, b: p.mL + it.x + CORNER_MIN_CM });
      else if (it.w > 0) out.push({ it, a: p.mL + it.x - OPENING_MIN_CM, b: p.mL + it.x + it.w + OPENING_MIN_CM });
    }
    return out;
  }

  conflicts(p: WallParams, L: Layout): { s: Seam; f: Range }[] {
    const F = this.forbidden(p);
    const out: { s: Seam; f: Range }[] = [];
    for (const s of seams(p, L.bw.widths)) for (const f of F) if (hits(s, f)) out.push({ s, f });
    return out;
  }

  warnings(p: WallParams, L: Layout): string[] {
    if (!this.items.length) return [];
    const w: string[] = [];
    this.items.forEach((it, i) => {
      const name = this.label(i);
      if (!(it.x >= 0)) w.push(`${name}: wpisz położenie od lewej krawędzi ściany.`);
      else if (it.type !== 'corner' && !(it.w > 0)) w.push(`${name}: wpisz szerokość.`);
      else if (it.x + (it.type === 'corner' ? 0 : it.w) > p.wallW + 1e-6)
        w.push(`${name} wychodzi poza ścianę (${f1(p.wallW)} cm).`);
      else if (it.type !== 'corner' && (it.y || 0) + (it.h > 0 ? it.h : 0) > p.wallH + 1e-6)
        w.push(`${name} wychodzi poza ścianę u góry (wysokość ${f1(p.wallH)} cm).`);
    });
    for (const { s, f } of this.conflicts(p, L)) {
      const at = f1(s.a - p.mL);
      const name = this.label(this.items.indexOf(f.it)).toLowerCase();
      w.push(
        f.it.type === 'corner'
          ? `Łączenie brytów ${s.i + 1} i ${s.i + 2} (${at} cm od lewej) wypada bliżej niż ${CORNER_MIN_CM} cm od narożnika (${name}). Montażysta nie zawinie tak wąskiego kawałka – zmień podział.`
          : `Łączenie brytów ${s.i + 1} i ${s.i + 2} (${at} cm od lewej) wypada w otworze lub bliżej niż ${OPENING_MIN_CM} cm od jego krawędzi (${name}) – zmień podział.`,
      );
    }
    const ss = seams(p, L.bw.widths);
    if (ss.length && !w.length)
      w.push(
        `<span class="ok">Łączenia (${ss.map(s => f1(s.a - p.mL)).join(', ')} cm od lewej krawędzi ściany) omijają narożniki i otwory.</span>`,
      );
    return w;
  }

  /**
   * Szerokości brytów (pełne cm, ostatni = reszta), przy których żadne łączenie nie trafia w zakazane pole.
   * Zaczyna od obecnej liczby brytów (albo minimalnej dla materiału) i próbuje do 6 kolejnych.
   * Na każdą liczbę brytów maks. ok. 0,3 s i 200 000 kroków – nierozwiązywalny układ nie zamrozi strony.
   */
  suggest(p: WallParams, L: Layout): number[] | null {
    const T = L.totalWcm;
    const ov = p.overlap;
    const F = this.forbidden(p);
    const maxW = Number.isFinite(p.maxPrint) ? p.maxPrint : Math.max(...L.bw.widths);
    if (!(maxW > ov + MIN_LAST_CM)) return null;
    const minW = ov + MIN_LAST_CM;
    const nMin = Math.max(1, Math.ceil((T - ov) / (maxW - ov) - 1e-9));
    let budget = 0;
    let until = 0;
    const solve = (a: number, rem: number): number[] | null => {
      if (--budget < 0 || this.now() > until) return null;
      if (rem === 1) {
        const w = T - a;
        return w <= maxW + 1e-6 && (a === 0 || w >= minW - 1e-6) ? [w] : null;
      }
      const ideal = (T - a + (rem - 1) * ov) / rem;
      const cands: number[] = [];
      for (let w = Math.ceil(minW); w <= Math.floor(maxW); w++) cands.push(w);
      cands.sort((x, y) => Math.abs(x - ideal) - Math.abs(y - ideal));
      for (const w of cands) {
        const s = { a: a + w - ov, b: a + w };
        if (F.some(f => hits(s, f))) continue;
        const left = T - (a + w - ov);
        if (left > (rem - 1) * maxW - (rem - 2) * ov + 1e-6) continue;
        if (left < minW) continue;
        const r = solve(a + w - ov, rem - 1);
        if (r) return [w, ...r];
      }
      return null;
    };
    const start = Math.max(nMin, p.count);
    for (let n = start; n <= Math.min(MAX_BRYTY, start + 6); n++) {
      budget = 200000;
      until = this.now() + 300;
      const r = solve(0, n);
      if (r) return r;
    }
    return null;
  }

  /** Dane dla schematu montażu: pomija niekompletne wpisy; seams = łączenia z oznaczeniem konfliktu. */
  data(p: WallParams, L: Layout | null): WallData {
    const list = this.items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.x >= 0 && (it.type === 'corner' || it.w > 0));
    const bad = L ? this.conflicts(p, L).map(c => c.s.i) : [];
    return {
      corners: list.filter(({ it }) => it.type === 'corner').map(({ it, i }) => ({ label: this.label(i), x: it.x })),
      openings: list
        .filter(({ it }) => it.type !== 'corner')
        .map(({ it, i }) => ({
          label: this.label(i),
          type: it.type,
          x: it.x,
          w: it.w,
          y: it.y >= 0 ? it.y : 0,
          h: it.h > 0 ? it.h : null,
        })),
      seams: L
        ? seams(p, L.bw.widths).map(s => ({
            between: [s.i + 1, s.i + 2] as [number, number],
            from: s.a - p.mL,
            to: s.b - p.mL,
            conflict: bad.includes(s.i),
          }))
        : [],
    };
  }

  /** Komunikat po zastosowaniu propozycji. */
  static suggestionMessage(r: readonly number[]): string {
    return `<span class="ok">Ustawiono ${r.length} ${plural(r.length)}: ${r.slice(0, -1).join(' / ')} cm + reszta ${f1(r[r.length - 1]!)} cm.</span>`;
  }
}

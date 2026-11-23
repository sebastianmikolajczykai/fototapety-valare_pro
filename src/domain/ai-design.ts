// Grafika AI (sekcja 11) – czysta część starego ai.js: wymiar do druku, zapytanie do AI, obrazki trybu demo
// (deterministyczne losowanie), teksty komunikatów i skala podglądu propozycji. Bez DOM i bez sieci.
// Style to tylko podpowiedź dopisywana do opisu. Lista robocza – DO WALIDACJI z Rafałem / graficzką.

export const AI_STYLES: readonly (readonly [string, string])[] = [
  ['ref', 'Jak na zdjęciu-inspiracji'],
  ['foto', 'Fotografia (realistycznie)'],
  ['akwarela', 'Akwarela / malarstwo'],
  ['ilustracja', 'Ilustracja / szkic'],
  ['botanika', 'Botanika / liście'],
  ['geometria', 'Wzór geometryczny'],
  ['vintage', 'Vintage / retro'],
];

/** Dopisek stylu do opisu (ref = styl bierze się z wgranej inspiracji). */
export const STYLE_PROMPTS: Readonly<Record<string, string | null>> = {
  ref: null,
  foto: 'photorealistic photograph, natural light, high detail',
  akwarela: 'watercolor painting, soft brush strokes',
  ilustracja: 'clean line illustration, crisp consistent lines',
  botanika: 'botanical illustration, leaves and plants',
  geometria: 'seamless geometric pattern, flat colors',
  vintage: 'vintage retro style, muted palette',
};

export type AiKind = 'generate' | 'edit' | 'upscale';

export interface PrintTarget {
  wCm: number;
  hCm: number;
  dpi: number;
  wPx: number;
  hPx: number;
  aspect: number;
}

export interface TargetFields {
  wallW: number;
  wallH: number;
  mT: number;
  mB: number;
  mL: number;
  mR: number;
  dpi: number;
}

const fmt = (x: number): string => Math.round(x).toLocaleString('pl-PL');
const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Wymiar całości do druku (ściana + naddatki) i piksele przy wybranym DPI (0 → 150) – to samo, co liczy podział. */
export function printTarget(f: TargetFields): PrintTarget {
  const w = f.wallW + f.mL + f.mR;
  const h = f.wallH + f.mT + f.mB;
  const dpi = f.dpi || 150;
  const px = (cm: number): number => (cm / 2.54) * dpi;
  return { wCm: w, hCm: h, dpi, wPx: Math.round(px(w)), hPx: Math.round(px(h)), aspect: h > 0 ? w / h : 1 };
}

/** Podpowiedź pod formularzem AI (HTML). */
export const targetHint = (t: PrintTarget): string =>
  `Do druku potrzeba: <b>${fmt(t.wPx)} × ${fmt(t.hPx)} px</b> (${t.wCm} × ${t.hCm} cm z naddatkami, ${t.dpi} DPI).`;

/** Wymiar obrazka demo: dłuższy bok = long, proporcje ściany. */
export const previewSize = (aspect: number, long: number): { w: number; h: number } =>
  aspect >= 1 ? { w: long, h: Math.round(long / aspect) } : { w: Math.round(long * aspect), h: long };

/** Skrót FNV-1a tekstu (ziarno losowania obrazków demo). */
export function demoSeed(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministyczne liczby z [0, 1) (mulberry32) – te same obrazki demo dla tego samego opisu. */
export function demoRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Podpis na obrazku demo. */
export const demoCaption = (kind: AiKind, i: number): string =>
  `PODGLĄD PRZYKŁADOWY · ${kind === 'edit' ? 'poprawka' : 'propozycja ' + (i + 1)}`;

/** Komunikat po wygenerowaniu jednym zapytaniem (demo: zależnie od tego, czy strona jest z serwera). */
export function generatedMessage(demo: boolean, count: number, http: boolean): string {
  if (demo)
    return http
      ? 'AI niedostępne – brak połączenia z usługą AI. Pokazuję podglądy przykładowe.'
      : 'AI niedostępne – brak połączenia z serwerem. Pokazuję podglądy przykładowe.';
  return count > 1 ? 'Kliknij propozycję, którą chcesz użyć.' : 'Gotowe.';
}

/** Postęp równoległego generowania (każda propozycja osobnym zapytaniem). */
export const progressMessage = (done: number, total: number, error?: string): string =>
  error === undefined
    ? `Gotowe ${done} z ${total}. Kliknij propozycję, którą chcesz użyć.`
    : `Gotowe ${done} z ${total} (pozostałe: ${error}). Kliknij propozycję, którą chcesz użyć.`;

/** Stan usługi AI z /api/health. */
export interface AiHealth {
  generate?: boolean;
  upscale?: boolean;
  upscaler?: string | null;
  provider?: string;
  model?: string;
}

/** Pasek trybu AI (HTML) po sprawdzeniu serwera. */
export const modeHtml = (ai: AiHealth): string =>
  ai.generate
    ? `<b>AI: ${esc(ai.provider)} (${esc(ai.model)}).</b> Opis i ewentualna inspiracja są wysyłane do OpenAI. Każda propozycja kosztuje – generuj tyle, ile potrzeba.`
    : '<b>AI niedostępne</b> – brak połączenia z usługą AI. Zamiast propozycji AI pojawią się podglądy przykładowe.';

/** Opis przycisku „Popraw jakość (AI)” zależnie od upscalera. */
export const qualityHint = (upscaler: string | null | undefined): string =>
  upscaler === 'lokalny'
    ? 'AI powiększy zdjęcie do wymiaru druku i wyostrzy szczegóły (bez opłat, może potrwać kilka minut).'
    : 'AI powiększy zdjęcie do wymiaru druku i wyostrzy szczegóły (w chmurze, zwykle 1–3 min). Każde powiększenie kosztuje.';

/**
 * Czy schować „Popraw jakość (AI)”: widać go przy ocenie „Za słaba”/„Akceptowalna”, gdy serwer ma powiększanie,
 * i nie w trakcie powiększania wybranej propozycji (drugie płatne powiększenie). W trakcie własnego – zostaje.
 */
export const qualityButtonHidden = (s: {
  busy: boolean;
  pending: boolean;
  upscale: boolean;
  badgeClass: string;
}): boolean => !s.busy && (s.pending || !(s.upscale && /\bjq-(bad|ok)\b/.test(s.badgeClass)));

/** Komunikat po przekazaniu propozycji do podziału, gdy powiększanie nie jest dostępne. */
export const handedOverMessage = (w: number, h: number, t: PrintTarget): string =>
  `Przekazano do podziału (${w} × ${h} px), bez powiększania. Do druku potrzeba ${fmt(t.wPx)} × ${fmt(t.hPx)} px – powiększanie (upscaling) jeszcze niepodłączone.`;

/** Komunikat w trakcie powiększania propozycji w tle. */
export const upscalingMessage = (t: PrintTarget, upscaler: string | null | undefined): string =>
  `Podgląd gotowy – możesz już ustawiać kadr. W tle powiększam do druku (ok. ${fmt(t.wPx)} × ${fmt(t.hPx)} px, ` +
  (upscaler === 'lokalny' ? 'może potrwać kilka minut' : 'zwykle 1–3 min') +
  ').';

/** Nazwa pliku propozycji przekazanej do podziału. */
export const aiFileName = (type: string): string => 'grafika-ai.' + (type === 'image/jpeg' ? 'jpg' : 'png');

/** Powiększone zdjęcie ma tę samą nazwę co oryginał (nazwa zlecenia się nie zmienia), rozszerzenie wg typu. */
export const upscaledName = (name: string, type: string): string =>
  name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');

/** Skala inspiracji wysyłanej do AI: dłuższy bok maks. 2048 px (1 = bez zmian). */
export const referenceScale = (w: number, h: number): number => Math.min(1, 2048 / Math.max(w, h));

/**
 * Podgląd propozycji na cały ekran: skala k i przesunięcie (x, y); fit = skala „cały obraz”.
 * Przybliżenie od fit do 8 × fit, w punkcie (cx, cy).
 */
export class ViewerZoom {
  k = 1;
  x = 0;
  y = 0;
  fit = 1;

  fitTo(W: number, H: number, w: number, h: number): void {
    this.fit = this.k = Math.min(W / w, H / h);
    this.x = (W - w * this.k) / 2;
    this.y = (H - h * this.k) / 2;
  }

  zoomAt(f: number, cx: number, cy: number): void {
    const k = Math.min(this.fit * 8, Math.max(this.fit, this.k * f));
    this.x = cx - ((cx - this.x) * k) / this.k;
    this.y = cy - ((cy - this.y) * k) / this.k;
    this.k = k;
  }

  get zoomed(): boolean {
    return this.k > this.fit * 1.01;
  }

  get transform(): string {
    return `translate(${this.x}px, ${this.y}px) scale(${this.k})`;
  }
}

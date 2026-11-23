// Galeria gotowych wzorów – czysta część starego galeria.js (katalog, wyszukiwanie, jakość, metryka licencji).
// Katalog: stały, przejrzany zbiór z Wikimedia Commons (tylko CC0, domena publiczna, CC BY, CC BY-SA – druk
// i sprzedaż dozwolone), plik public/wzory/katalog.js tworzony przez wzory/pobierz-wzory.js w starym programie.
import type { QualityLevel, QualityThresholds } from './quality';

export interface GalleryCategory {
  id: string;
  nazwa: string;
  slowa?: string;
}

export interface GalleryPattern {
  id: string;
  cat: string;
  tytul: string;
  autor: string;
  licencja: string;
  licencjaUrl?: string;
  podpisWymagany?: boolean;
  /** Strona pliku w Commons. */
  zrodlo: string;
  /** Pełny plik (upload.wikimedia.org). */
  plik: string;
  w: number;
  h: number;
  bajty?: number;
}

export interface GalleryCatalog {
  kategorie: GalleryCategory[];
  wzory: GalleryPattern[];
}

/** Metryka wzoru wstawionego do zlecenia (dowód źródła i licencji). */
export interface PatternRecord {
  name: string;
  id: string;
  title: string;
  artist: string;
  source: string;
  url: string;
  file: string;
  license: string;
  licenseUrl: string | undefined;
  attribution: boolean | undefined;
  credit: string;
  at: string;
}

export interface GalleryQuality {
  v: number;
  level: QualityLevel;
}

/** Najczęstsze polskie słowa → angielskie (tytuły w Commons są głównie po angielsku). */
export const PL_WORDS: Readonly<Record<string, string>> = {
  las: 'forest',
  drzewa: 'tree',
  drzewo: 'tree',
  morze: 'sea',
  plaża: 'beach',
  plaza: 'beach',
  góry: 'mountain',
  gory: 'mountain',
  kwiaty: 'flower',
  kwiat: 'flower',
  róże: 'rose',
  roze: 'rose',
  ptaki: 'bird',
  ptak: 'bird',
  miasto: 'city',
  most: 'bridge',
  rzeka: 'river',
  jezioro: 'lake',
  niebo: 'sky',
  chmury: 'cloud',
  zima: 'winter',
  śnieg: 'snow',
  snieg: 'snow',
  jesień: 'autumn',
  jesien: 'autumn',
  wiosna: 'spring',
  ogród: 'garden',
  ogrod: 'garden',
  łąka: 'meadow',
  laka: 'meadow',
  fale: 'wave',
  fala: 'wave',
  wodospad: 'waterfall',
  zachód: 'sunset',
  zachod: 'sunset',
  wschód: 'sunrise',
  wschod: 'sunrise',
  noc: 'night',
  palmy: 'palm',
  pustynia: 'desert',
  wyspa: 'island',
  zamek: 'castle',
  kosmos: 'nebula',
  galaktyka: 'galaxy',
  lew: 'lion',
  słoń: 'elephant',
  slon: 'elephant',
  koń: 'horse',
  kon: 'horse',
};

const fmt = (x: number): string => Math.round(x).toLocaleString('pl-PL');
const MB = (bytes: number): string => (bytes / 1e6).toFixed(1);

/** Do porównań: małe litery, bez znaków diakrytycznych, ł → l. */
export const normalize = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

/** Tytuły z Commons bywają zrzutem etykiet Wikidata („… title QS:Lfr,…”) – sam tytuł, maks. 90 znaków. */
export function cleanTitle(t: unknown): string {
  const s =
    String(t || '')
      .split(/\s*(?:title\s+)?QS:/)[0]!
      .trim() || 'Wzór';
  return s.length > 90 ? s.slice(0, 87).trim() + '…' : s;
}

const https = (u: unknown): boolean => /^https:\/\//.test(String(u || ''));

/**
 * Tylko wpisy z bezpiecznymi danymi: id = litery/cyfry (trafia do adresu miniatury), linki https (bez javascript:).
 * Zmienia i zwraca ten sam obiekt katalogu (jak stary program).
 */
export function prepCatalog(k: GalleryCatalog): GalleryCatalog {
  k.wzory = k.wzory
    .filter(a => a.w > 0 && a.h > 0 && /^\w+$/.test(String(a.id)) && https(a.plik) && https(a.zrodlo))
    .map(a => ({ ...a, tytul: cleanTitle(a.tytul) }));
  return k;
}

/** Jakość wzoru na ścianę wm × hm metrów (z naddatkami; kadr „cover”, powiększenie 100%). */
export function galleryQuality(
  w: number,
  h: number,
  wm: number,
  hm: number,
  p: QualityThresholds,
): GalleryQuality | null {
  if (!(wm > 0 && hm > 0)) return null;
  const v = Math.min(w / wm, h / hm);
  return { v, level: v >= p.good ? 'good' : v >= p.min ? 'ok' : 'bad' };
}

/** Plakietka jakości: nazwa i klasa CSS. */
export const GALLERY_BADGES: Readonly<Record<QualityLevel, readonly [string, string]>> = {
  good: ['Dobra', 'gq-good'],
  ok: ['Akceptowalna', 'gq-ok'],
  bad: ['Za słaba', 'gq-bad'],
};

export const categoryName = (k: GalleryCatalog, id: string): string => k.kategorie.find(c => c.id === id)?.nazwa || '';

/** Wzory kategorii albo (gdy jest zapytanie) wszystkie, w których tytule lub kategorii są wszystkie słowa (PL lub EN). */
export function findPatterns(k: GalleryCatalog, cat: string | null, query: string): GalleryPattern[] {
  if (!query) return k.wzory.filter(a => a.cat === cat);
  const words = normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .map(w => [w, normalize(PL_WORDS[w] || w)] as const);
  return k.wzory.filter(a => {
    const t = normalize(`${a.tytul} ${categoryName(k, a.cat)} ${a.cat}`);
    return words.every(([pl, en]) => t.includes(pl) || t.includes(en));
  });
}

/** Komunikat pod siatką: ukryte (za słabe) wzory i podpowiedź, gdy nic nie zostało. */
export function hiddenMessage(shown: number, all: number, hidden: number): string {
  const note = hidden
    ? `Ukryto ${hidden} ${hidden === 1 ? 'wzór' : hidden < 5 ? 'wzory' : 'wzorów'} o zbyt małej rozdzielczości na tę ścianę.`
    : '';
  if (shown) return note;
  return all
    ? note + ' Zmniejsz ścianę albo wybierz inną kategorię.'
    : 'Brak wzorów dla tego słowa. Wybierz kategorię powyżej.';
}

/** Opis jakości w szczegółach wzoru. */
export const qualityNote = (q: GalleryQuality | null, p: QualityThresholds): string =>
  q
    ? `${fmt(q.v)} px na metr ściany (progi ${fmt(p.good)} / ${fmt(p.min)} px/m).`
    : 'Podaj wymiar ściany w kroku 1, żeby ocenić jakość.';

/** Rozmiar oryginału w szczegółach wzoru. */
export const originalSize = (a: GalleryPattern): string =>
  `${fmt(a.w)} × ${fmt(a.h)} px${a.bajty ? `, ${MB(a.bajty)} MB` : ''}`;

export const downloadMessage = (a: GalleryPattern): string =>
  `Pobieram pełny plik (${a.bajty ? MB(a.bajty) + ' MB, ' : ''}${fmt(a.w)} × ${fmt(a.h)} px)…`;

/** Metryka wzoru wstawionego do kroku 1: nazwa pliku ze slugiem tytułu i podpis autora. */
export function patternRecord(a: GalleryPattern, at: string): PatternRecord {
  const slug =
    normalize(a.tytul)
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'wzor';
  return {
    name: `wzor-${a.id}-${slug}.jpg`,
    id: a.id,
    title: a.tytul,
    artist: a.autor,
    source: 'Wikimedia Commons',
    url: a.zrodlo,
    file: a.plik,
    license: a.licencja,
    licenseUrl: a.licencjaUrl,
    attribution: a.podpisWymagany,
    credit: `„${a.tytul}”, autor: ${a.autor}, licencja ${a.licencja}${a.licencjaUrl ? ' (' + a.licencjaUrl + ')' : ''}, źródło: Wikimedia Commons.`,
    at,
  };
}

/** Metryka do dołączenia do zlecenia (wiersze CRLF, jak w starym programie). */
export function licenseText(c: PatternRecord | null): string {
  if (!c) return '';
  return [
    `Metryka wzoru fototapety`,
    ``,
    `Plik: ${c.name}`,
    `Tytuł: ${c.title}`,
    `Autor: ${c.artist}`,
    `Źródło: ${c.source} – ${c.url}`,
    `Plik oryginalny: ${c.file}`,
    `Licencja: ${c.license}${c.licenseUrl ? ' – ' + c.licenseUrl : ''}`,
    `Podpis autora wymagany: ${c.attribution ? 'TAK' : 'nie'}`,
    `Podpis: ${c.credit}`,
    `Pobrano: ${c.at}`,
    ``,
    `Uwaga: licencję podaje Wikimedia Commons. Ewentualne prawa osób trzecich (np. znaki towarowe, wizerunek osób,`,
    `prawa do budynków w niektórych krajach) sprawdza sprzedawca.`,
  ].join('\r\n');
}

import { describe, expect, it } from 'vitest';
import {
  cleanTitle,
  downloadMessage,
  findPatterns,
  galleryQuality,
  hiddenMessage,
  licenseText,
  normalize,
  patternRecord,
  prepCatalog,
  qualityNote,
  type GalleryCatalog,
  type GalleryPattern,
} from '../../../src/domain/gallery';

const P = { good: 2500, min: 1000 };
const pat = (o: Partial<GalleryPattern> = {}): GalleryPattern => ({
  id: 'c1',
  cat: 'las',
  tytul: 'Forest in autumn',
  autor: 'Jan',
  licencja: 'CC0',
  licencjaUrl: '',
  podpisWymagany: false,
  zrodlo: 'https://commons.wikimedia.org/wiki/File:X.jpg',
  plik: 'https://upload.wikimedia.org/x.jpg',
  w: 6000,
  h: 4000,
  bajty: 12_345_678,
  ...o,
});
const catalog = (): GalleryCatalog => ({
  kategorie: [
    { id: 'las', nazwa: 'Las' },
    { id: 'morze', nazwa: 'Morze' },
    { id: 'gory', nazwa: 'Góry' },
  ],
  wzory: [
    pat({ id: 'a1', cat: 'las', tytul: 'Beech forest' }),
    pat({ id: 'a2', cat: 'morze', tytul: 'Sea waves at sunset' }),
    pat({ id: 'a3', cat: 'gory', tytul: 'Tatra Łomnica peak' }),
  ],
});

describe('galeria wzorów (stary galeria.js) – czysta logika', () => {
  it('normalize: małe litery, bez ogonków, ł → l', () => {
    expect(normalize('Zachód Słońca ŁĄKA')).toBe('zachod slonca laka');
    expect(normalize(undefined)).toBe('');
  });

  it('cleanTitle: obcina zrzut etykiet Wikidata, maks. 90 znaków, pusty → „Wzór”', () => {
    expect(cleanTitle('Mona Lisa title QS:Lfr,"La Joconde"')).toBe('Mona Lisa');
    expect(cleanTitle('  ')).toBe('Wzór');
    expect(cleanTitle(null)).toBe('Wzór');
    const long = 'x'.repeat(95);
    expect(cleanTitle(long)).toBe('x'.repeat(87) + '…');
    expect(cleanTitle('a'.repeat(90))).toBe('a'.repeat(90));
  });

  it('prepCatalog: tylko bezpieczne wpisy (id \\w+, linki https, wymiar > 0), tytuły oczyszczone', () => {
    const k = catalog();
    k.wzory.push(
      pat({ id: 'zły id' }),
      pat({ id: 'b2', plik: 'javascript:alert(1)' }),
      pat({ id: 'b3', zrodlo: 'http://x' }),
      pat({ id: 'b4', w: 0 }),
      pat({ id: 'b5', tytul: 'Ok title QS:Lpl,"x"' }),
    );
    const out = prepCatalog(k);
    expect(out).toBe(k); // ten sam obiekt (jak w starym programie)
    expect(out.wzory.map(a => a.id)).toEqual(['a1', 'a2', 'a3', 'b5']);
    expect(out.wzory[3]!.tytul).toBe('Ok'); // „title” przed QS: też jest odcinane
  });

  it('galleryQuality: px na metr ściany z naddatkami, poziom wg progów; bez ściany – null', () => {
    expect(galleryQuality(6000, 4000, 3, 2, P)).toEqual({ v: 2000, level: 'ok' });
    expect(galleryQuality(9000, 6000, 3, 2, P)).toEqual({ v: 3000, level: 'good' });
    expect(galleryQuality(2000, 1000, 3, 2, P)).toEqual({ v: 500, level: 'bad' });
    expect(galleryQuality(6000, 4000, 0, 2, P)).toBeNull();
  });

  it('findPatterns: kategoria albo wyszukiwanie po słowach (PL → EN, tytuł i nazwa kategorii)', () => {
    const k = catalog();
    expect(findPatterns(k, 'morze', '').map(a => a.id)).toEqual(['a2']);
    expect(findPatterns(k, 'morze', 'las').map(a => a.id)).toEqual(['a1']); // las → forest
    expect(findPatterns(k, null, 'zachod').map(a => a.id)).toEqual(['a2']); // zachod → sunset
    expect(findPatterns(k, null, 'Góry').map(a => a.id)).toEqual(['a3']); // nazwa kategorii
    expect(findPatterns(k, null, 'łomnica tatra').map(a => a.id)).toEqual(['a3']);
    expect(findPatterns(k, null, 'kosmos')).toEqual([]);
  });

  it('hiddenMessage: liczba ukrytych wzorów i podpowiedź, gdy nic nie zostało', () => {
    expect(hiddenMessage(3, 3, 0)).toBe('');
    expect(hiddenMessage(2, 3, 1)).toBe('Ukryto 1 wzór o zbyt małej rozdzielczości na tę ścianę.');
    expect(hiddenMessage(1, 4, 3)).toBe('Ukryto 3 wzory o zbyt małej rozdzielczości na tę ścianę.');
    expect(hiddenMessage(0, 5, 5)).toBe(
      'Ukryto 5 wzorów o zbyt małej rozdzielczości na tę ścianę. Zmniejsz ścianę albo wybierz inną kategorię.',
    );
    expect(hiddenMessage(0, 0, 0)).toBe('Brak wzorów dla tego słowa. Wybierz kategorię powyżej.');
  });

  it('qualityNote i downloadMessage: teksty z liczbami po polsku', () => {
    expect(qualityNote({ v: 2000.4, level: 'ok' }, P)).toBe('2000 px na metr ściany (progi 2500 / 1000 px/m).');
    expect(qualityNote(null, P)).toBe('Podaj wymiar ściany w kroku 1, żeby ocenić jakość.');
    expect(downloadMessage(pat())).toBe('Pobieram pełny plik (12.3 MB, 6000 × 4000 px)…');
    expect(downloadMessage(pat({ bajty: 0 }))).toBe('Pobieram pełny plik (6000 × 4000 px)…');
  });

  it('patternRecord i licenseText: nazwa pliku ze slugiem, podpis, metryka z CRLF', () => {
    const c = patternRecord(
      pat({ id: 'c9', tytul: 'Żółta łąka – Zakopane!', licencjaUrl: 'https://cc/by', podpisWymagany: true }),
      '2026-11-23T09:00:00.000Z',
    );
    expect(c.name).toBe('wzor-c9-zolta-laka-zakopane.jpg');
    expect(c.credit).toBe(
      '„Żółta łąka – Zakopane!”, autor: Jan, licencja CC0 (https://cc/by), źródło: Wikimedia Commons.',
    );
    expect(patternRecord(pat({ tytul: '!!!' }), 'x').name).toBe('wzor-c1-wzor.jpg');
    const t = licenseText(c);
    expect(t.split('\r\n')).toHaveLength(14);
    expect(t).toContain('Licencja: CC0 – https://cc/by\r\nPodpis autora wymagany: TAK');
    expect(t).toContain('Pobrano: 2026-11-23T09:00:00.000Z');
    expect(licenseText(null)).toBe('');
    expect(licenseText(patternRecord(pat(), 'x'))).toContain('Licencja: CC0\r\nPodpis autora wymagany: nie');
  });
});

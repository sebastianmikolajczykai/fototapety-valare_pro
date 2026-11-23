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

// RED: pusta implementacja – testy muszą paść.
export const normalize = (_s: unknown): string => '';
export const cleanTitle = (_t: unknown): string => '';
export const prepCatalog = (k: GalleryCatalog): GalleryCatalog => k;
export const galleryQuality = (
  _w: number,
  _h: number,
  _wm: number,
  _hm: number,
  _p: QualityThresholds,
): GalleryQuality | null => null;
export const findPatterns = (_k: GalleryCatalog, _c: string | null, _q: string): GalleryPattern[] => [];
export const hiddenMessage = (_s: number, _a: number, _h: number): string => '';
export const qualityNote = (_q: GalleryQuality | null, _p: QualityThresholds): string => '';
export const downloadMessage = (_a: GalleryPattern): string => '';
export const patternRecord = (_a: GalleryPattern, at: string): PatternRecord => ({
  name: '',
  id: '',
  title: '',
  artist: '',
  source: '',
  url: '',
  file: '',
  license: '',
  licenseUrl: '',
  attribution: false,
  credit: '',
  at,
});
export const licenseText = (_c: PatternRecord | null): string => '';

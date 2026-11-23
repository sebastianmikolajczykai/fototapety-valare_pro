// Złoty wzorzec niezależnego recenzenta (fototapety/recenzja-v2/zloty-wzorzec.js, stary main 6933982).
// Liczby nieskończone i NaN zapisane tam jako tekst („NaN”, „Infinity”).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WallParams } from '../../src/domain/layout';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/recenzent/zloty-wzorzec.json');
const NUM: Record<string, number> = { NaN: NaN, Infinity: Infinity, '-Infinity': -Infinity };

const revive = (_k: string, v: unknown): unknown => (typeof v === 'string' && v in NUM ? NUM[v] : v);

export interface ReviewerLayout {
  totalWcm: number;
  totalHcm: number;
  widthsCm: number[];
  bWs: number[];
  xs: number[];
  bH: number;
  band: number;
  ov: number;
  panoW: number;
  imgH: number;
  area: { margin: number; print: number; wall: number };
}

export interface ReviewerCase {
  name: string;
  p: Omit<WallParams, 'pdf' | 'order' | 'orderName'>;
  errors: string[];
  warnings: string[];
  layout: ReviewerLayout | null;
}

export interface ReviewerGolden {
  bryty: ReviewerCase[];
  wycena: { in: Record<string, unknown>; out: unknown }[];
  terminy: { od: string; dni: number; wynik: string }[];
  jakosc: { pxPerM: number; zoom: number; out: unknown }[];
}

export const reviewerGolden = (): ReviewerGolden => JSON.parse(fs.readFileSync(FILE, 'utf8'), revive) as ReviewerGolden;

/** Parametry przypadku uzupełnione o pola, których wzorzec recenzenta nie używa. */
export const withDefaults = (p: ReviewerCase['p']): WallParams => ({
  ...p,
  pdf: true,
  order: 'Fototapeta',
  orderName: 'Fototapeta',
});

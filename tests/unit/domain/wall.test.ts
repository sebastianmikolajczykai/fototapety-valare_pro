import { describe, expect, it } from 'vitest';
import { computeLayout, type WallParams } from '../../../src/domain/layout';
import { validate } from '../../../src/domain/validation';
import { WallFeatures, parseWallField, type WallItem } from '../../../src/domain/wall';
import { golden } from '../../support/golden';
import { P005 } from '../../support/params';

// Zegar jak w programie (limit 0,3 s na liczbę brytów). Sprawdzone też z zatrzymanym zegarem (tylko limit
// kroków): wyniki identyczne, ale 4 nierozwiązywalne układy liczą się wtedy po ok. 6 s.
const wall = (...items: WallItem[]): WallFeatures => {
  const w = new WallFeatures();
  for (const it of items) w.add(it.type, it);
  return w;
};

describe('narożniki, drzwi i okna', () => {
  it('bez elementów: brak ostrzeżeń', () => {
    expect(new WallFeatures().warnings(P005, computeLayout(P005))).toEqual([]);
  });
  it('łączenie 20 cm od narożnika: ostrzeżenie z położeniem łączenia', () => {
    const w = wall({ type: 'corner', x: 120, w: NaN, y: NaN, h: NaN });
    expect(w.warnings(P005, computeLayout(P005))).toEqual([
      'Łączenie brytów 1 i 2 (113,7 cm od lewej) wypada bliżej niż 20 cm od narożnika (narożnik 1). Montażysta nie zawinie tak wąskiego kawałka – zmień podział.',
    ]);
  });
  it('łączenia omijają elementy: komunikat „ok” z położeniami łączeń', () => {
    const w = wall({ type: 'corner', x: 170, w: NaN, y: NaN, h: NaN });
    expect(w.warnings(P005, computeLayout(P005))).toEqual([
      '<span class="ok">Łączenia (113,7, 230,3 cm od lewej krawędzi ściany) omijają narożniki i otwory.</span>',
    ]);
  });
  it('niekompletne lub wychodzące poza ścianę elementy', () => {
    const w = wall(
      { type: 'corner', x: NaN, w: NaN, y: NaN, h: NaN },
      { type: 'door', x: 10, w: NaN, y: 0, h: NaN },
      { type: 'window', x: 340, w: 20, y: NaN, h: NaN },
      { type: 'window', x: 10, w: 20, y: 200, h: 100 },
    );
    expect(w.warnings(P005, computeLayout(P005))).toEqual([
      'Narożnik 1: wpisz położenie od lewej krawędzi ściany.',
      'Drzwi 1: wpisz szerokość.',
      'Okno 1 wychodzi poza ścianę (350 cm).',
      'Okno 2 wychodzi poza ścianę u góry (wysokość 270 cm).',
    ]);
  });
  it('łączenie w otworze: ostrzeżenie', () => {
    const w = wall({ type: 'window', x: 100, w: 30, y: 90, h: 120 });
    expect(w.warnings(P005, computeLayout(P005))[0]).toBe(
      'Łączenie brytów 1 i 2 (113,7 cm od lewej) wypada w otworze lub bliżej niż 5 cm od jego krawędzi (okno 1) – zmień podział.',
    );
  });
  it('propozycja podziału omijającego narożnik', () => {
    const w = wall({ type: 'corner', x: 120, w: NaN, y: NaN, h: NaN });
    expect(w.suggest(P005, computeLayout(P005))).toEqual([93, 94, 93, 94]);
  });
  it('propozycja niemożliwa, gdy materiał węższy niż zakład + 5 cm', () => {
    const p: WallParams = { ...P005, maxPrint: 10 };
    expect(wall({ type: 'corner', x: 120, w: NaN, y: NaN, h: NaN }).suggest(p, computeLayout(p))).toBeNull();
  });
  it('limit czasu przerywa szukanie (strona się nie zawiesza)', () => {
    let t = 0;
    const w = new WallFeatures(() => (t += 1000));
    w.add('corner', { x: 120 });
    expect(w.suggest(P005, computeLayout(P005))).toBeNull();
  });
  it('dane dla schematu montażu, usuwanie i zmiana pól', () => {
    const w = new WallFeatures();
    w.add('door');
    w.update(0, 'x', parseWallField('20,5'));
    w.update(0, 'w', parseWallField('90'));
    w.add('corner', { x: 120 });
    expect(w.items.map(i => i.y)).toEqual([0, NaN]);
    expect(w.data(P005, null)).toEqual({
      corners: [{ label: 'Narożnik 1', x: 120 }],
      openings: [{ label: 'Drzwi 1', type: 'door', x: 20.5, w: 90, y: 0, h: null }],
      seams: [],
    });
    w.remove(0);
    expect(w.items).toHaveLength(1);
    expect(parseWallField('  ')).toBeNaN();
  });
  it('komunikat po zastosowaniu propozycji', () => {
    expect(WallFeatures.suggestionMessage([93, 94, 93, 94])).toBe(
      '<span class="ok">Ustawiono 4 bryty: 93 / 94 / 93 cm + reszta 94 cm.</span>',
    );
  });
});

type Case = { p: WallParams; items: WallItem[]; out: { warnings: string[]; data: unknown; suggest?: number[] | null } };
describe('zgodność ze starym programem', () => {
  const cases = golden<Case[]>('wall');
  it('66 nagranych układów', () => expect(cases).toHaveLength(66));
  it.each(cases.map((c, i) => [i, c] as const))(
    'układ %i: ostrzeżenia, dane i propozycja',
    (_i, c) => {
      const w = wall(...c.items);
      const L = computeLayout(c.p);
      expect(w.warnings(c.p, L)).toEqual(c.out.warnings);
      expect(w.data(c.p, L)).toEqual(c.out.data);
      if (!validate(c.p).length) expect(w.suggest(c.p, L)).toEqual(c.out.suggest);
    },
    20_000,
  );
});

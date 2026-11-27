import { describe, expect, it } from 'vitest';
import { MaterialCatalog, MATERIAL_GROUPS, MATERIAL_SOURCE, TERMS } from '../../../src/domain/materials';
import { asJson, golden } from '../../support/golden';
import { materialyPoZmianach } from '../../support/zmiany';

type G = {
  lista: Record<string, unknown>[];
  grupy: string[];
  terminy: unknown;
  zrodlo: string;
  options: { value: string; text: string }[];
};
const G = golden<G>('materials');
const cat = new MaterialCatalog();

describe('katalog materiałów (cennik Valare 2024/1)', () => {
  it('ma 22 pozycje: 18 produktów, Sand Dot GW i Texile Stick GW w 3 szerokościach rolki', () => {
    expect(cat.list).toHaveLength(22);
    expect(cat.list.filter(m => m.produkt === 'sand-dot-gw').map(m => m.id)).toEqual([
      'sand-dot-gw-107',
      'sand-dot-gw-137',
      'sand-dot-gw-160',
    ]);
  });
  it('Mural Canvas CT: materiał 137 cm, druk 131 cm, 279 zł brutto, 10 dni', () => {
    const m = cat.byId('mural-canvas-ct')!;
    expect([m.szerMaterialu, m.szerDruku, m.cenaBruttoM2, m.terminDni]).toEqual([137, 131, 279, 10]);
  });
  it('Sand Dot GW: 279 zł brutto / 226,83 zł netto za m² we wszystkich rolkach (Valare 27.11.2026)', () => {
    const sd = cat.list.filter(m => m.produkt === 'sand-dot-gw');
    expect(sd.map(m => [m.cenaBruttoM2, m.cenaNettoM2])).toEqual([
      [279, 226.83],
      [279, 226.83],
      [279, 226.83],
    ]);
  });
  it('materiał na zamówienie: 21 dni roboczych', () => {
    expect(cat.byId('diamante-ct')!.terminDni).toBe(21);
  });
  it('wybór z listy: „druk|id”, „own” = inny materiał, pusty = bez materiału', () => {
    expect(cat.selected('131|mural-canvas-ct', '')!.id).toBe('mural-canvas-ct');
    expect(cat.selected('own', '120,5')).toEqual({ id: 'own', nazwa: 'Inny materiał', szerDruku: 120.5, wlasny: true });
    expect(cat.selected('own', '')).toEqual({ id: 'own', nazwa: 'Inny materiał', szerDruku: null, wlasny: true });
    expect(cat.selected('', '')).toBeNull();
    expect(cat.selected('131|nie-ma', '')).toBeNull();
  });
  it('maks. szerokość druku z wartości opcji (jak parseFloat w starym formularzu)', () => {
    expect(MaterialCatalog.maxPrintOf('154|sand-dot-gw-160', '')).toBe(154);
    expect(MaterialCatalog.maxPrintOf('', '')).toBe(Infinity);
    expect(MaterialCatalog.maxPrintOf('own', '99,5')).toBe(99.5);
    expect(MaterialCatalog.maxPrintOf('own', '')).toBeNaN();
  });
});

describe('zgodność ze starym programem', () => {
  it('lista, grupy, terminy, źródło i opcje formularza identyczne', () => {
    expect(asJson(cat.list)).toEqual(materialyPoZmianach(G.lista));
    expect(MATERIAL_GROUPS).toEqual(G.grupy);
    expect(TERMS).toEqual(G.terminy);
    expect(MATERIAL_SOURCE).toBe(G.zrodlo);
    expect(cat.options()).toEqual(G.options);
  });
});

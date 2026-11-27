// Materiały Valare. Dane WYŁĄCZNIE z CENNIK_VALARE.pdf, edycja 2024/1, ważny od 15.05.2024, str. 2–4
// (przeniesione 1:1 ze starego materialy.js). Pole null = BRAK DANYCH w cenniku (nie zgadujemy).
// Sand Dot GW: 279 zł brutto/m² (CONFIRMED przez Valare 27.11.2026; w cenniku 2024/1 literówka 279,05).
import { parseNum } from './units';

export const MATERIAL_SOURCE = 'CENNIK_VALARE.pdf, edycja 2024/1, ważny od 15.05.2024';
export const MATERIAL_GROUPS: readonly string[] = ['Premium', 'Standard', 'Własny klej', 'Uzupełniające'];

/** Terminy z cennika (dni robocze). Na zamówienie: 21 dni, chyba że materiał jest na stanie – wtedy jak standard. */
export const TERMS = {
  standard: { dni: 10, doplata: 0 },
  przyspieszony: { dni: 7, doplata: 0.15 },
  ekspres: { dni: 3, doplata: 0.3 },
  naZamowienie: {
    dni: 21,
    uwaga: 'Jeżeli materiał jest na stanie magazynowym, termin jak dla materiałów standardowych.',
  },
} as const;

/** Produkt z cennika. szer: [szerokość materiału, maks. szerokość druku] w cm, po jednej parze na rolkę. */
interface Product {
  id: string;
  nazwa: string;
  grupa: string;
  szer: [number, number][];
  brutto: number;
  netto: number;
  aspekt: string;
  gramatura: number | null;
  struktura: string;
  palnosc: string;
  /** Kłódka zamknięta w cenniku = dostępne na zamówienie. */
  naZamowienie: boolean;
  /** Ikona kropli: nadaje się pod prysznic w systemie WATERPROOF. */
  waterproof: boolean;
  opis: string;
}

/** Pozycja listy = jeden wariant szerokości rolki (nazwy pól jak w starym programie). */
export interface Material {
  id: string;
  produkt: string;
  nazwa: string;
  grupa: string;
  aspekt: string;
  gramatura: number | null;
  struktura: string;
  palnosc: string;
  naZamowienie: boolean;
  waterproof: boolean;
  opis: string;
  szerMaterialu: number;
  szerDruku: number;
  cenaBruttoM2: number;
  cenaNettoM2: number;
  terminDni: number;
}

/** „Inny materiał” spoza cennika (szerokość druku wpisana ręcznie, null = puste pole). */
export interface OwnMaterial {
  id: 'own';
  nazwa: 'Inny materiał';
  szerDruku: number | null;
  wlasny: true;
}

export interface MaterialOption {
  value: string;
  text: string;
}

// prettier-ignore
const PRODUCTS: readonly Product[] = [
  {"id":"mural-canvas-ct","nazwa":"Mural Canvas CT","grupa":"Premium","szer":[[137,131]],"brutto":279,"netto":226.83,"aspekt":"mat / błysk","gramatura":290,"struktura":"płótno","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":true,"opis":"Winylowa tapeta na nośniku z tkaniny o strukturze płótna. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku w pełnym zakresie kolorów."},
  {"id":"burlap-blend-ct","nazwa":"Burlap Blend CT","grupa":"Premium","szer":[[137,131]],"brutto":279,"netto":226.83,"aspekt":"mat","gramatura":290,"struktura":"worek jutowy","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":true,"opis":"Winylowa tapeta na nośniku z tkaniny o strukturze worka jutowego. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"dune-dust-ct","nazwa":"Dune Dust CT","grupa":"Premium","szer":[[137,131]],"brutto":279,"netto":226.83,"aspekt":"mat","gramatura":290,"struktura":"drobny piasek","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":true,"opis":"Winylowa tapeta na nośniku z tkaniny o strukturze drobnego piasku. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"rock-stone-ct","nazwa":"Rock Stone CT","grupa":"Premium","szer":[[137,131]],"brutto":279,"netto":226.83,"aspekt":"mat / błysk","gramatura":290,"struktura":"tynk","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":true,"opis":"Winylowa tapeta na nośniku z tkaniny o strukturze tynku. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"woven-bamboo-nw","nazwa":"Woven Bamboo NW","grupa":"Premium","szer":[[137,131]],"brutto":319,"netto":259.35,"aspekt":"mat","gramatura":290,"struktura":"pleciony bambus","palnosc":"B-s1, d0","naZamowienie":true,"waterproof":false,"opis":"Ekologiczna tapeta o strukturze plecionego bambusa. Maskuje niedoskonałości zdjęcia i łączenia; dobra jakość druku."},
  {"id":"diamante-ct","nazwa":"Diamante CT","grupa":"Premium","szer":[[136,130]],"brutto":499,"netto":405.69,"aspekt":"błysk","gramatura":350,"struktura":"skórka pomarańczy","palnosc":"B-s2, d0","naZamowienie":true,"waterproof":false,"opis":"Ekskluzywna tapeta na nośniku tekstylnym o strukturze skórki pomarańczy z kryształkami. Do nowoczesnych wnętrz; wymaga dobrania odpowiedniego zdjęcia."},
  {"id":"fabric-canvas-nw","nazwa":"Fabric Canvas NW","grupa":"Standard","szer":[[130,124]],"brutto":259,"netto":210.57,"aspekt":"mat / błysk","gramatura":350,"struktura":"płótno","palnosc":"B-s1, d0","naZamowienie":false,"waterproof":false,"opis":"Winylowa tapeta na nośniku flizelinowym o strukturze płótna. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"granular-sand-nw","nazwa":"Granular Sand NW","grupa":"Standard","szer":[[130,124]],"brutto":259,"netto":210.57,"aspekt":"mat / błysk","gramatura":350,"struktura":"piasek","palnosc":"B-s1, d0","naZamowienie":false,"waterproof":false,"opis":"Winylowa tapeta na nośniku flizelinowym o strukturze piasku. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"canvas-nw","nazwa":"Canvas NW","grupa":"Standard","szer":[[138,132]],"brutto":249,"netto":202.44,"aspekt":"mat / błysk","gramatura":350,"struktura":"płótno","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":false,"opis":"Winylowa tapeta na nośniku flizelinowym o strukturze płótna. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"concrete-nw","nazwa":"Concrete NW","grupa":"Standard","szer":[[137,131]],"brutto":249,"netto":202.44,"aspekt":"mat","gramatura":350,"struktura":"beton","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":false,"opis":"Winylowa tapeta na nośniku flizelinowym o strukturze betonu. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"linen-nw","nazwa":"Linen NW","grupa":"Standard","szer":[[138,132]],"brutto":249,"netto":202.44,"aspekt":"mat","gramatura":350,"struktura":"materiał jutowy","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":false,"opis":"Winylowa tapeta na nośniku flizelinowym o strukturze materiału jutowego. Maskuje niedoskonałości zdjęcia i łączenia; fotorealistyczna jakość druku."},
  {"id":"linen-nw-jednobarwna-druk","nazwa":"Linen NW jednobarwna + druk","grupa":"Standard","szer":[[138,132]],"brutto":249,"netto":202.44,"aspekt":"mat","gramatura":350,"struktura":"materiał jutowy","palnosc":"B-s2, d0","naZamowienie":true,"waterproof":false,"opis":"Linen NW w jednym z 17 kolorów, druk pigmentem kolorowym lub białym. Przed zamówieniem zawsze próba wydruku; okleiny na jednej ścianie z jednej partii produkcyjnej. (Sama jednobarwna, bez druku: 99,00 zł/m².)"},
  {"id":"sand-dot-gw","nazwa":"Sand Dot GW","grupa":"Własny klej","szer":[[107,100],[137,131],[160,154]],"brutto":279,"netto":226.83,"aspekt":"mat / błysk","gramatura":null,"struktura":"drobny piasek","palnosc":"B-s1, d0","naZamowienie":false,"waterproof":false,"opis":"Folia samoprzylepna o strukturze drobnego piasku na podłogi, ściany i meble wewnątrz, bez laminowania. Możliwa poprawka przy naklejaniu; druk UVgel odporny na ścieranie. (Wersja wycinana po obrysie ZUND: 325,00 zł/m², na zamówienie.)"},
  {"id":"texile-stick-gw","nazwa":"Texile Stick GW","grupa":"Własny klej","szer":[[107,100],[127,121],[152,146]],"brutto":279,"netto":226.83,"aspekt":"mat / błysk","gramatura":145,"struktura":"delikatne płótno","palnosc":"B-s2, d0","naZamowienie":false,"waterproof":false,"opis":"Poliestrowa repozycjonowalna tkanina samoprzylepna. Łatwa aplikacja bez ekipy; łączenie na styk lub na zakładkę; po usunięciu nie niszczy powierzchni. Do wnętrz."},
  {"id":"canvas-gw","nazwa":"Canvas GW","grupa":"Własny klej","szer":[[137,131]],"brutto":279,"netto":226.83,"aspekt":"mat / błysk","gramatura":360,"struktura":"płótno","palnosc":"B-s2, d0","naZamowienie":true,"waterproof":false,"opis":"Samoprzylepna tapeta PCV o strukturze płótna z klejem permanentnym. Do jednobrytowych dekoracji (pokoje dziecięce, hotele, recepcje) i reprodukcji obrazów."},
  {"id":"soft-skin","nazwa":"Soft Skin","grupa":"Uzupełniające","szer":[[141,135]],"brutto":309,"netto":251.22,"aspekt":"mat","gramatura":550,"struktura":"skóra","palnosc":"BS 5852-1","naZamowienie":true,"waterproof":false,"opis":"Materiał o strukturze skóry do tapicerstwa tradycyjnego i medycznego. Odporny na zadrapania, atest PZH."},
  {"id":"luxe-lino","nazwa":"Luxe Lino (podłoga)","grupa":"Uzupełniające","szer":[[200,194]],"brutto":315,"netto":256.1,"aspekt":"satyna","gramatura":1485,"struktura":"piaskowiec","palnosc":"Cn-s1","naZamowienie":true,"waterproof":false,"opis":"Winylowy materiał na podłogę (reklama pozioma, wykończenie wnętrz). Certyfikat antypoślizgowości; zmywalność zależy od zadruku i zabezpieczenia."},
  {"id":"tapeta-waterproof-out","nazwa":"Tapeta Waterproof Out","grupa":"Uzupełniające","szer":[[100,94]],"brutto":310,"netto":252.03,"aspekt":"mat","gramatura":null,"struktura":"skórka pomarańczy","palnosc":"B-s1, d0","naZamowienie":true,"waterproof":false,"opis":"Tapeta z włókna szklanego bez PCV do wilgotnych pomieszczeń, wewnątrz i na zewnątrz (system WATERproof, np. kabiny prysznicowe). Najlepiej z pełnym systemem WATERproof IN/OUT."},
];

export class MaterialCatalog {
  readonly list: readonly Material[];
  private readonly index: ReadonlyMap<string, Material>;

  constructor(products: readonly Product[] = PRODUCTS) {
    this.list = products.flatMap(p => p.szer.map(([mat, druk]) => MaterialCatalog.variant(p, mat, druk)));
    this.index = new Map(this.list.map(m => [m.id, m]));
  }

  private static variant(p: Product, mat: number, druk: number): Material {
    const many = p.szer.length > 1;
    const { szer: _s, brutto, netto, ...rest } = p;
    return {
      ...rest,
      id: many ? `${p.id}-${mat}` : p.id,
      produkt: p.id,
      nazwa: many ? `${p.nazwa} ${mat}` : p.nazwa,
      szerMaterialu: mat,
      szerDruku: druk,
      cenaBruttoM2: brutto,
      cenaNettoM2: netto,
      terminDni: p.naZamowienie ? TERMS.naZamowienie.dni : TERMS.standard.dni,
    };
  }

  byId(id: string): Material | undefined {
    return this.index.get(id);
  }

  /** Opcje listy wyboru: value = „szerokośćDruku|id” (parseFloat daje maks. druk), tekst jak w starym formularzu. */
  options(): MaterialOption[] {
    return [
      { value: '', text: '– nie wybrano (bez kontroli szerokości) –' },
      ...this.list.map(m => ({ value: `${m.szerDruku}|${m.id}`, text: `${m.nazwa} – druk ${m.szerDruku} cm` })),
      { value: 'own', text: 'Inny materiał (wpisz maks. szerokość)' },
    ];
  }

  /** Wybrany materiał z wartości listy; maxPrintText = pole „maks. szerokość” dla innego materiału. */
  selected(value: string, maxPrintText: string): Material | OwnMaterial | null {
    if (value === 'own')
      return { id: 'own', nazwa: 'Inny materiał', szerDruku: parseNum(maxPrintText) || null, wlasny: true };
    return this.index.get(value.split('|')[1] ?? '') ?? null;
  }

  /** Maks. szerokość druku do walidacji: brak materiału = bez limitu, inny materiał = wpisana wartość. */
  static maxPrintOf(value: string, maxPrintText: string): number {
    if (value === 'own') return parseNum(maxPrintText);
    return value === '' ? Infinity : parseFloat(value);
  }
}

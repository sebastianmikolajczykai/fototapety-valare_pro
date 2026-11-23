// Kontrola jakości zdjęcia – odpowiednik czystej części starego jakosc.js.
// Miara: ile pikseli zdjęcia źródłowego przypada na 1 m ściany przy aktualnym kadrze i powiększeniu.
// Progi (decyzja Sebastiana 25.10.2026, CONFIRMED): dobra ≥ 2500 px/m (e-mail Weroniki 12.10.2026),
// za słaba < 1000 px/m. Klient może je zmienić w oknie „Progi oceny”.
import type { Layout } from './layout';

export type QualityLevel = 'good' | 'ok' | 'bad';

export interface QualityThresholds {
  good: number;
  min: number;
}

export interface QualityAssessment {
  level: QualityLevel;
  /** Maks. powiększenie kadru, przy którym jakość zostaje „dobra”. */
  zoomGood: number;
}

export interface QualityFactsInput {
  dpi: number;
  L: Layout;
  imgW: number;
  imgH: number;
  pxPerM: number;
  zoom: number;
}

export const QUALITY_DEFAULTS: Readonly<QualityThresholds> = { good: 2500, min: 1000 };

/** Weronika: powyżej ok. 30 000 px obciąża programy bez poprawy jakości. */
export const LONG_SIDE_MAX_PX = 30000;

/** Maks. powiększenie na suwaku kadru. */
const ZOOM_MAX = 3;

export const QUALITY_LEVELS: Readonly<Record<QualityLevel, { name: string; cls: string; text: string }>> = {
  good: { name: 'Dobra', cls: 'jq-good', text: 'Zdjęcie ma wystarczającą rozdzielczość na tę ścianę.' },
  ok: {
    name: 'Akceptowalna',
    cls: 'jq-ok',
    text: 'Druk może być lekko miękki z bliska. Obejrzyj fragment 1:1 poniżej i zdecyduj.',
  },
  bad: {
    name: 'Za słaba',
    cls: 'jq-bad',
    text: 'Zdjęcie jest za małe na tę ścianę lub ten kadr. Druk będzie rozmyty albo „w kratkę”. Zmniejsz powiększenie, użyj większego pliku albo ulepsz zdjęcie.',
  },
};

/** Piksele źródła na metr ściany: 1 m = dpi / 0,0254 px druku, 1 px źródła = s px druku. */
export const sourcePxPerM = (dpi: number, s: number): number => ((dpi / 2.54) * 100) / s;

const fmt = (x: number): string => Math.round(x).toLocaleString('pl-PL');
const f2 = (x: number): string => x.toLocaleString('pl-PL', { maximumFractionDigits: 2 });

export class QualityAssessor {
  private current: QualityThresholds = { ...QUALITY_DEFAULTS };

  get thresholds(): QualityThresholds {
    return { ...this.current };
  }

  /** Zmiana progów z formularza: przyjmowane tylko wartości > 0; „za słaba” nie wyżej niż „dobra”. */
  setThresholds(good: number, min: number): void {
    if (good > 0) this.current.good = good;
    if (min > 0) this.current.min = min;
    if (this.current.min > this.current.good) this.current.min = this.current.good;
  }

  assess(pxPerM: number, zoom: number): QualityAssessment {
    const { good, min } = this.current;
    const level: QualityLevel = pxPerM >= good ? 'good' : pxPerM >= min ? 'ok' : 'bad';
    // pxPerM jest odwrotnie proporcjonalne do powiększenia kadru
    return { level, zoomGood: (zoom * pxPerM) / good };
  }

  /** Ostrzeżenie pod ustawieniami (tylko przy „za słaba”). */
  warningHtml(pxPerM: number, zoom: number): string {
    return this.assess(pxPerM, zoom).level === 'bad'
      ? `<div class="warn">Jakość zdjęcia: za słaba (${fmt(pxPerM)} px/m, minimum ${fmt(this.current.min)} px/m).</div>`
      : '';
  }

  /** Lista faktów w oknie „Jakość zdjęcia” (HTML, jak w starym programie). */
  facts({ dpi, L, imgW, imgH, pxPerM, zoom }: QualityFactsInput): string[] {
    const a = this.assess(pxPerM, zoom);
    const wallM = L.totalWcm / 100;
    const hM = L.totalHcm / 100;
    const needW = Math.ceil(wallM * this.current.good);
    const needH = Math.ceil(hM * this.current.good);
    const facts = [
      `Na ścianie: <b>${fmt(pxPerM)} px/m</b> (ok. ${fmt(pxPerM * 0.0254)} DPI zdjęcia źródłowego; druk ${dpi} DPI).`,
      `Zdjęcie ${fmt(imgW)} × ${fmt(imgH)} px. Na „dobrą” jakość przy tej ścianie z naddatkiem (${f2(wallM)} × ${f2(hM)} m) potrzeba ok. ${fmt(needW)} × ${fmt(needH)} px przy pełnym kadrze.`,
      a.zoomGood >= 1
        ? `Powiększenie kadru ${Math.round(zoom * 100)}%. Poziom „dobra” zostaje do ok. ${Math.round(Math.min(a.zoomGood, ZOOM_MAX) * 100)}%${a.zoomGood > ZOOM_MAX ? ' (maks. suwaka)' : ''}.`
        : `Powiększenie kadru ${Math.round(zoom * 100)}%. Nawet przy 100% zdjęcie nie osiąga poziomu „dobra”.`,
    ];
    if (Math.max(imgW, imgH) > LONG_SIDE_MAX_PX)
      facts.push(
        `Dłuższy bok ponad ${fmt(LONG_SIDE_MAX_PX)} px – według grafików obciąża programy bez wyraźnej poprawy jakości.`,
      );
    return facts;
  }
}

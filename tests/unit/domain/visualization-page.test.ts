import { describe, expect, it } from 'vitest';
import {
  grownQuad,
  jpegSize,
  nearestPoint,
  photoStoreSize,
  photoViewSize,
  refPickLabel,
  vizAiInfoHtml,
  vizFileName,
  vizMessage,
  wallTextureRect,
  type VizMessageState,
} from '../../../src/domain/visualization';

describe('wizualizacja – część strony bez DOM (stary wizualizacja.js)', () => {
  it('wallTextureRect: kadr bez naddatków i pasków thru cut, maks. 1800 px', () => {
    const p = { mL: 3, mR: 3, mT: 3, mB: 3, dpi: 150 };
    const r = wallTextureRect(p, { band: 0, panoW: 21024, bH: 16300 })!;
    expect([r.X0, r.X1, r.Y0, r.Y1]).toEqual([177, 21024 - 177, 177, 16300 - 177]);
    expect(r.w).toBe(1800);
    expect(r.h).toBe(Math.round((16300 - 354) * (1800 / (21024 - 354))));
    const banded = wallTextureRect({ ...p, mT: 0, mB: 0 }, { band: 59, panoW: 1000, bH: 1000 })!;
    expect([banded.Y0, banded.Y1, banded.k]).toEqual([59, 941, 1]);
    expect(wallTextureRect({ ...p, mL: 500 }, { band: 0, panoW: 1000, bH: 1000 })).toBeNull();
  });

  it('rozmiary: zdjęcie w pamięci 1600 px, podgląd 1200 × 900, obraz dla AI', () => {
    expect(photoStoreSize(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(photoStoreSize(800, 600)).toEqual({ w: 800, h: 600 });
    expect(photoViewSize(1600, 1200)).toEqual({ W: 1200, H: 900 });
    expect(photoViewSize(900, 1600)).toEqual({ W: 506, H: 900 });
    expect(jpegSize(3000, 1500, 1536)).toEqual({ w: 1536, h: 768 });
    expect(jpegSize(1000, 500, 1536)).toBeNull();
  });

  it('grownQuad i nearestPoint', () => {
    const q = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(grownQuad(q)).toEqual(q);
    const g = grownQuad(q, Math.SQRT2);
    expect(g[0]!.x).toBeCloseTo(-1);
    expect(g[2]!.y).toBeCloseTo(11);
    const pts = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
    ];
    expect(nearestPoint(pts, { x: 0.11, y: 0.1 }, 1000, 500)).toBe(0);
    expect(nearestPoint(pts, { x: 0.3, y: 0.3 }, 1000, 500)).toBe(-1);
    expect(nearestPoint([], { x: 0, y: 0 }, 1, 1)).toBe(-1);
  });

  it('vizMessage: wszystkie stany panelu', () => {
    const s: VizMessageState = {
      own: false,
      hasPhoto: false,
      points: 0,
      refPicking: false,
      refPoints: 0,
      valid: true,
      hasImage: true,
      wallW: 350,
      wallH: 270,
    };
    expect(vizMessage(s)).toBe(
      'Wybierz typ wnętrza i kliknij „Stwórz wizualizację AI”. AI zrobi realistyczne zdjęcie takiego wnętrza z fototapetą na całej ścianie 350 × 270 cm.',
    );
    expect(vizMessage({ ...s, hasImage: false })).toMatch(/ Najpierw wgraj grafikę\.$/);
    expect(vizMessage({ ...s, valid: false })).toBe('Popraw ustawienia po lewej, żeby zrobić wizualizację.');
    expect(vizMessage({ ...s, valid: null })).toBe('Popraw ustawienia po lewej, żeby zrobić wizualizację.');
    const o = { ...s, own: true };
    expect(vizMessage(o)).toMatch(/^Zrób zdjęcie ściany/);
    expect(vizMessage({ ...o, hasPhoto: true, points: 2 })).toMatch(/^Kliknij 3\. punkt: prawy dolny narożnik/);
    expect(vizMessage({ ...o, hasPhoto: true, points: 4, refPicking: true, refPoints: 1 })).toBe(
      'Kliknij 2. koniec odcinka odniesienia na tej samej ścianie.',
    );
    expect(vizMessage({ ...o, hasPhoto: true, points: 4 })).toMatch(/^Narożniki zaznaczone \(punkty/);
    expect(vizMessage({ ...o, hasPhoto: true, points: 4, hasImage: false })).toMatch(/^Narożniki zaznaczone\. Wgraj/);
  });

  it('napisy: odcinek odniesienia, informacja o AI, nazwa pliku', () => {
    expect(refPickLabel(true, 0)).toBe('Kliknij 2 końce odcinka na zdjęciu…');
    expect(refPickLabel(false, 2)).toBe('Zaznacz odcinek ponownie');
    expect(refPickLabel(false, 1)).toBe('Zaznacz odcinek odniesienia');
    expect(vizAiInfoHtml({ ai: { generate: true, provider: 'OpenAI', model: '<m>' } })).toMatch(
      /^AI: OpenAI \(&lt;m>\)\. Podgląd z panelu/,
    );
    expect(vizAiInfoHtml({ ai: { generate: false } })).toBe(
      'Wizualizacja AI niedostępna – brak połączenia z usługą AI.',
    );
    expect(vizAiInfoHtml(null)).toBe('Wizualizacja AI niedostępna – brak połączenia z serwerem.');
    expect(vizFileName('Kowalski', false, 'salon')).toBe('Kowalski_wizualizacja_AI_salon.png');
    expect(vizFileName('', true, 'salon')).toBe('zlecenie_wizualizacja_AI_moje-wnetrze.png');
  });
});

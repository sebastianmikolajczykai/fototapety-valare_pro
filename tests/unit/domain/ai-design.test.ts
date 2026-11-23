import { describe, expect, it } from 'vitest';
import {
  AI_STYLES,
  aiFileName,
  demoCaption,
  demoRandom,
  demoSeed,
  generatedMessage,
  handedOverMessage,
  modeHtml,
  previewSize,
  printTarget,
  progressMessage,
  qualityButtonHidden,
  qualityHint,
  referenceScale,
  STYLE_PROMPTS,
  targetHint,
  upscaledName,
  upscalingMessage,
  ViewerZoom,
} from '../../../src/domain/ai-design';

const F = { wallW: 350, wallH: 270, mT: 3, mB: 3, mL: 3, mR: 3, dpi: 150 };

describe('grafika AI (stary ai.js) – czysta logika', () => {
  it('printTarget: ściana z naddatkami, piksele przy DPI, DPI 0 → 150, proporcje', () => {
    const t = printTarget(F);
    expect(t).toEqual({ wCm: 356, hCm: 276, dpi: 150, wPx: 21024, hPx: 16299, aspect: 356 / 276 });
    expect(printTarget({ ...F, dpi: 0 }).dpi).toBe(150);
    expect(printTarget({ ...F, wallH: 0, mT: 0, mB: 0 }).aspect).toBe(1);
    expect(targetHint(t)).toBe('Do druku potrzeba: <b>21 024 × 16 299 px</b> (356 × 276 cm z naddatkami, 150 DPI).');
  });

  it('style i dopiski stylu do opisu', () => {
    expect(AI_STYLES.map(s => s[0])).toEqual(Object.keys(STYLE_PROMPTS));
    expect(STYLE_PROMPTS.ref).toBeNull();
  });

  it('previewSize: dłuższy bok 1024, proporcje ściany', () => {
    expect(previewSize(2, 1024)).toEqual({ w: 1024, h: 512 });
    expect(previewSize(0.5, 1024)).toEqual({ w: 512, h: 1024 });
    expect(previewSize(1, 1024)).toEqual({ w: 1024, h: 1024 });
  });

  it('losowanie demo: deterministyczne, z przedziału [0, 1)', () => {
    expect(demoSeed('')).toBe(2166136261);
    expect(demoSeed('las|foto|0|generate')).toBe(demoSeed('las|foto|0|generate'));
    expect(demoSeed('a')).not.toBe(demoSeed('b'));
    const a = demoRandom(42);
    const b = demoRandom(42);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    expect(demoCaption('generate', 1)).toBe('PODGLĄD PRZYKŁADOWY · propozycja 2');
    expect(demoCaption('edit', 0)).toBe('PODGLĄD PRZYKŁADOWY · poprawka');
  });

  it('komunikaty generowania i trybu AI', () => {
    expect(generatedMessage(true, 4, true)).toContain('brak połączenia z usługą AI');
    expect(generatedMessage(true, 4, false)).toContain('brak połączenia z serwerem');
    expect(generatedMessage(false, 4, true)).toBe('Kliknij propozycję, którą chcesz użyć.');
    expect(generatedMessage(false, 1, true)).toBe('Gotowe.');
    expect(progressMessage(1, 3)).toBe('Gotowe 1 z 3. Kliknij propozycję, którą chcesz użyć.');
    expect(progressMessage(2, 3, 'limit')).toBe(
      'Gotowe 2 z 3 (pozostałe: limit). Kliknij propozycję, którą chcesz użyć.',
    );
    expect(modeHtml({ generate: true, provider: 'OpenAI', model: '<x>' })).toContain('<b>AI: OpenAI (&lt;x&gt;).</b>');
    expect(modeHtml({ generate: false })).toContain('<b>AI niedostępne</b>');
  });

  it('przycisk „Popraw jakość (AI)”: opis i widoczność', () => {
    expect(qualityHint('lokalny')).toContain('bez opłat');
    expect(qualityHint('replicate')).toContain('Każde powiększenie kosztuje.');
    const s = { busy: false, pending: false, upscale: true, badgeClass: 'jq-badge jq-bad' };
    expect(qualityButtonHidden(s)).toBe(false);
    expect(qualityButtonHidden({ ...s, badgeClass: 'jq-badge jq-good' })).toBe(true);
    expect(qualityButtonHidden({ ...s, upscale: false })).toBe(true);
    expect(qualityButtonHidden({ ...s, pending: true })).toBe(true);
    expect(qualityButtonHidden({ ...s, pending: true, busy: true })).toBe(false);
  });

  it('przekazanie do podziału i powiększanie: komunikaty i nazwy plików', () => {
    const t = printTarget(F);
    expect(handedOverMessage(1024, 794, t)).toBe(
      'Przekazano do podziału (1024 × 794 px), bez powiększania. Do druku potrzeba 21 024 × 16 299 px – powiększanie (upscaling) jeszcze niepodłączone.',
    );
    expect(upscalingMessage(t, 'lokalny')).toMatch(/może potrwać kilka minut\)\.$/);
    expect(upscalingMessage(t, 'replicate')).toMatch(/zwykle 1–3 min\)\.$/);
    expect(aiFileName('image/jpeg')).toBe('grafika-ai.jpg');
    expect(aiFileName('')).toBe('grafika-ai.png');
    expect(upscaledName('zdjecie.v2.jpeg', 'image/png')).toBe('zdjecie.v2.png');
    expect(upscaledName('foto', 'image/jpeg')).toBe('foto.jpg');
    expect(referenceScale(4096, 1000)).toBe(0.5);
    expect(referenceScale(800, 600)).toBe(1);
  });

  it('ViewerZoom: cały obraz na środku, przybliżenie w punkcie, granice fit…8×fit', () => {
    const v = new ViewerZoom();
    v.fitTo(1000, 800, 2000, 1000);
    expect([v.k, v.x, v.y, v.fit]).toEqual([0.5, 0, 150, 0.5]);
    expect(v.zoomed).toBe(false);
    v.zoomAt(1.5, 500, 400);
    expect(v.k).toBe(0.75);
    expect(v.x).toBe(-250);
    expect(v.zoomed).toBe(true);
    v.zoomAt(100, 0, 0);
    expect(v.k).toBe(4);
    v.zoomAt(0.001, 0, 0);
    expect(v.k).toBe(0.5);
    expect(v.transform).toMatch(/^translate\(.+px, .+px\) scale\(0\.5\)$/);
  });
});

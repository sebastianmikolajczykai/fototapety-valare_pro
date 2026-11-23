import { describe, expect, it } from 'vitest';
import {
  INTERIOR_ROOMS,
  isImage,
  photoPrompt,
  prompt,
  scenePrompt,
  size,
  text,
  validTarget,
  type PromptKind,
  type PromptParams,
  type ScenePromptParams,
} from '../../../src/server/ai/prompts';
import { golden } from '../../support/golden';

describe('AI: rozmiar obrazu dla OpenAI (boki /16, proporcje 1:3–3:1)', () => {
  it('kwadrat, panorama i pion; proporcja przycięta do 3:1', () => {
    expect(size(1)).toBe('2048x2048');
    expect(size(2)).toBe('2048x1024');
    expect(size(0.5)).toBe('1024x2048');
    expect(size(10)).toBe('2048x688');
    expect(size('zly')).toBe('2048x2048');
  });
});

describe('AI: dane od przeglądarki', () => {
  it('obraz tylko jako data URL PNG/JPEG/WEBP', () => {
    expect(isImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isImage('https://x.example/a.png')).toBe(false);
    expect(isImage('data:image/png;base64,<script>')).toBe(false);
  });
  it('tekst przycięty do limitu, inne typy = pusty tekst', () => {
    expect(text('  abc  ')).toBe('abc');
    expect(text('x'.repeat(5000))).toHaveLength(4000);
    expect(text('y'.repeat(500), 300)).toHaveLength(300);
    expect(text(5)).toBe('');
  });
  it('wymiar druku: dodatnie liczby do 10 mln', () => {
    expect(validTarget({ w: 100, h: 100 })).toBe(true);
    expect(validTarget({ w: 1e7 + 1, h: 1 })).toBe(false);
    expect(validTarget({ w: '5', h: 5 })).toBe(false);
    expect(validTarget(null)).toBe(false);
  });
});

describe('AI: polecenia', () => {
  it('generowanie: temat, styl, reguły druku, końcowa kontrola', () => {
    const t = prompt('generate', { prompt: 'las sosnowy', stylePrompt: 'watercolor painting', reference: null });
    expect(t).toContain('SUBJECT\nlas sosnowy\n\nSTYLE\nwatercolor painting');
    expect(t).toContain('PRINT RULES (always apply)');
    expect(t.endsWith('nothing important at the edges.')).toBe(true);
  });
  it('poprawka: tylko zmiana z opisu', () => {
    expect(prompt('edit', { prompt: 'jaśniejsze tło' })).toContain(
      'REQUESTED CHANGE (apply only this, nothing else):\njaśniejsze tło',
    );
  });
  it('przykładowe wnętrze: wymiar ściany i proporcja', () => {
    const t = scenePrompt({ room: 'salon', wallW: 350, wallH: 270 });
    expect(t).toContain(
      'The physical wall measures 350 cm wide × 270 cm high. Required wall proportion: 35:27 (width ÷ height = 1.296).',
    );
    expect(t).toContain('ROOM TYPE: living room');
  });
  it('nieznany lub podstępny typ wnętrza = salon', () => {
    for (const room of ['nieznany', 'constructor', '__proto__', 5])
      expect(scenePrompt({ room, wallW: 300, wallH: 300 })).toContain('ROOM TYPE: living room');
  });
  it('zdjęcie klienta: twarda granica czworokąta', () => {
    expect(photoPrompt()).toContain('HARD BOUNDARY: the mural may appear ONLY inside that quadrilateral.');
  });
});

type SA = {
  size: { a: unknown; out: string }[];
  prompt: { kind: PromptKind; p: PromptParams; out: string }[];
  isImage: { v: unknown; out: boolean }[];
  validTarget: { t: unknown; out: boolean }[];
  text: { v: unknown; max?: number; out: string }[];
  scenePrompt: { p: ScenePromptParams; out: string }[];
  photoPrompt: string;
  rooms: unknown;
};
describe('zgodność ze starym serwerem', () => {
  const G = golden<SA>('server-ai');
  it('rozmiary, obrazy, wymiary druku, teksty', () => {
    for (const c of G.size) expect(size(c.a), String(c.a)).toBe(c.out);
    for (const c of G.isImage) expect(isImage(c.v), String(c.v)).toBe(c.out);
    for (const c of G.validTarget) expect(validTarget(c.t), JSON.stringify(c.t)).toBe(c.out);
    for (const c of G.text) expect(c.max === undefined ? text(c.v) : text(c.v, c.max)).toBe(c.out);
  });
  it('polecenia co do znaku', () => {
    for (const c of G.prompt) expect(prompt(c.kind, c.p)).toBe(c.out);
    for (const c of G.scenePrompt) expect(scenePrompt(c.p)).toBe(c.out);
    expect(photoPrompt()).toBe(G.photoPrompt);
    expect(INTERIOR_ROOMS).toEqual(G.rooms);
  });
});

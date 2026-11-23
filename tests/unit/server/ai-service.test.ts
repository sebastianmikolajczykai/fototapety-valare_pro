// Usługa AI na atrapach: żadne zapytanie nie idzie do OpenAI/Replicate/Topaz (fetch podmieniony), nic płatnego.
import { describe, expect, it } from 'vitest';
import { AiService } from '../../../src/server/ai/ai-service';
import { photoPrompt, prompt, scenePrompt } from '../../../src/server/ai/prompts';
import type { AiDeps, Upscaler } from '../../../src/server/ai/upscale';
import { send } from '../../../src/server/respond';
import { fakeReq, fakeRes, jsonResponse, mockFetch, type FetchCall } from '../../support/http';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQ';
const NOW = Date.UTC(2026, 10, 23, 9);

function service(
  env: Record<string, string> = {},
  route?: (url: string, c: FetchCall) => Response | Promise<Response>,
  o: Partial<AiDeps> = {},
) {
  const f = mockFetch(route ?? (() => jsonResponse({ data: [{ b64_json: 'QUJD' }] })));
  const logs: string[] = [];
  const deps: AiDeps = {
    env,
    fetch: f.fetch,
    now: () => NOW,
    sleep: async () => {},
    log: (...a: unknown[]) => void logs.push(a.join(' ')),
    ...o,
  };
  return { ai: new AiService(deps), calls: f.calls, logs };
}
const KEY = { OPENAI_API_KEY: ' sk-test \n' };

async function post(ai: AiService, kind: string, body: unknown, headers: Record<string, string> = {}) {
  const r = fakeRes();
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  await ai.handle(kind, fakeReq('POST', `/api/ai/${kind}`, raw, headers), r.res, send);
  return r;
}

describe('stan AI (/api/health)', () => {
  it('bez kluczy: nic nie działa; model domyślny gpt-image-2', () => {
    expect(service().ai.status()).toEqual({
      generate: false,
      upscale: false,
      upscaler: null,
      provider: 'OpenAI',
      model: 'gpt-image-2',
    });
  });
  it('z kluczami: pierwszy gotowy upscaler (Replicate, Topaz); UPSCALER wymusza wybór; model ze zmiennej', () => {
    const s = (env: Record<string, string>) => service(env).ai.status();
    expect(s({ ...KEY, REPLICATE_API_TOKEN: 'r', TOPAZ_API_KEY: 't' })).toMatchObject({
      generate: true,
      upscaler: 'replicate',
    });
    expect(s({ TOPAZ_API_KEY: 't' })).toMatchObject({ generate: false, upscale: true, upscaler: 'topaz' });
    expect(s({ UPSCALER: 'lokalny', OPENAI_IMAGE_MODEL: 'gpt-x' })).toMatchObject({
      upscaler: 'lokalny',
      model: 'gpt-x',
    });
  });
});

describe('obsługa zapytań', () => {
  it('nieznana operacja 404; brak klucza OpenAI 503 (bez wywołania fetch)', async () => {
    const { ai, calls } = service();
    expect((await post(ai, 'nieznane', {})).status()).toBe(404);
    const r = await post(ai, 'generate', '{nie-json');
    expect([r.status(), r.text()]).toEqual([
      503,
      'Brak klucza OpenAI: ustaw zmienną OPENAI_API_KEY na serwerze i uruchom serwer ponownie.',
    ]);
    expect((await post(ai, 'interior', {})).status()).toBe(503);
    expect(calls).toHaveLength(0);
  });
  it('dane: zły JSON 400, nie obiekt 400, ponad 40 MB 413', async () => {
    const { ai } = service(KEY);
    expect((await post(ai, 'generate', '{x')).text()).toBe('Niepoprawne dane (JSON).');
    expect((await post(ai, 'generate', '[1]')).text()).toBe('Niepoprawne dane.');
    expect((await post(ai, 'generate', 'null')).status()).toBe(400);
    const big = await post(ai, 'generate', '{}', { 'content-length': String(41 << 20) });
    expect([big.status(), big.text()]).toEqual([413, 'Za duże zdjęcie (limit 40 MB).']);
    const stream = await post(ai, 'generate', Buffer.alloc((40 << 20) + 1, 32).toString());
    expect(stream.status()).toBe(413);
  });
  it('generowanie: zapytanie do OpenAI (model, prompt, n ≤ 4, rozmiar, JPEG 95), wynik jako data URL', async () => {
    const { ai, calls, logs } = service({ ...KEY, OPENAI_IMAGE_QUALITY: 'high' }, () =>
      jsonResponse({ data: [{ b64_json: 'QUJD' }, {}, { b64_json: 'REVG' }], usage: { total_tokens: 5 } }),
    );
    const r = await post(ai, 'generate', { prompt: '  las  ', stylePrompt: 'akwarela', count: 9, aspect: 2 });
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/images/generations');
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-test');
    expect(calls[0]!.body).toEqual({
      model: 'gpt-image-2',
      prompt: prompt('generate', { prompt: 'las', stylePrompt: 'akwarela' }),
      n: 4,
      size: '2048x1024',
      quality: 'high',
      output_format: 'jpeg',
      output_compression: 95,
    });
    expect(r.status()).toBe(200);
    expect(r.json()).toEqual({
      images: [
        { dataUrl: 'data:image/jpeg;base64,QUJD', width: 2048, height: 1024 },
        { dataUrl: 'data:image/jpeg;base64,REVG', width: 2048, height: 1024 },
      ],
    });
    expect(logs.at(-1)).toMatch(/^AI generate: 2 obraz\(y\) 2048x1024, gpt-image-2\/high, 0 s, tokeny/);
  });
  it('wzór (reference) idzie do /edits; poprawka wymaga obrazu i opisu; zły obraz 400', async () => {
    const { ai, calls } = service(KEY);
    await post(ai, 'generate', { reference: JPG, count: 0 });
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/images/edits');
    expect(calls[0]!.body).toMatchObject({ n: 1, images: [{ image_url: JPG }] });
    expect((await post(ai, 'edit', { source: JPG })).text()).toBe('Brak obrazu lub opisu poprawki.');
    expect((await post(ai, 'generate', { reference: 'https://x.pl/a.jpg' })).text()).toBe(
      'Niepoprawny obraz (dozwolone PNG, JPEG, WEBP).',
    );
    await post(ai, 'edit', { source: PNG, prompt: 'jaśniej', count: 3 });
    expect(calls[1]!.body).toMatchObject({ n: 1, prompt: prompt('edit', { prompt: 'jaśniej', stylePrompt: '' }) });
  });
  it('błędy OpenAI: komunikat 502, brak obrazu 502, przekroczony czas, inne błędy 500', async () => {
    const err = await post(service(KEY, () => jsonResponse({ error: { message: 'Billing' } }, 400)).ai, 'generate', {});
    expect([err.status(), err.text()]).toEqual([502, 'Billing']);
    const bare = await post(service(KEY, () => new Response('x', { status: 500 })).ai, 'generate', {});
    expect(bare.text()).toBe('OpenAI zwrócił błąd 500');
    expect((await post(service(KEY, () => jsonResponse({})).ai, 'generate', {})).text()).toBe(
      'OpenAI nie zwrócił obrazu.',
    );
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const t = await post(service(KEY, () => Promise.reject(timeout)).ai, 'generate', {});
    expect([t.status(), t.text()]).toEqual([500, 'OpenAI nie odpowiedział w 5 minut.']);
    const net = await post(service(KEY, () => Promise.reject(new Error('fetch failed'))).ai, 'generate', {});
    expect([net.status(), net.text()]).toEqual([500, 'fetch failed']);
  });
  it('maks. 8 zapytań naraz (9. dostaje 429), po zakończeniu znowu można', async () => {
    let release!: () => void;
    const gate = new Promise<void>(ok => (release = ok));
    const { ai } = service(KEY, async () => {
      await gate;
      return jsonResponse({ data: [{ b64_json: 'QQ==' }] });
    });
    const running = Array.from({ length: 8 }, () => post(ai, 'generate', {}));
    await new Promise(ok => setTimeout(ok, 10));
    const ninth = await post(ai, 'generate', {});
    expect([ninth.status(), ninth.text()]).toEqual([429, 'Za dużo zapytań AI naraz. Spróbuj za chwilę.']);
    release();
    expect((await Promise.all(running)).map(r => r.status())).toEqual(Array(8).fill(200));
    expect((await post(ai, 'generate', {})).status()).toBe(200);
  });
  it('dzienny limit (AI_LIMIT_DZIENNY) liczy każde zapytanie, zeruje się następnego dnia', async () => {
    let now = NOW;
    const { ai, logs } = service({ ...KEY, AI_LIMIT_DZIENNY: '2' }, undefined, { now: () => now });
    expect((await post(ai, 'generate', {})).status()).toBe(200);
    expect((await post(ai, 'edit', {})).status()).toBe(400);
    const r = await post(ai, 'generate', {});
    expect([r.status(), r.text()]).toEqual([
      429,
      'Wyczerpano dzienny limit zapytań AI. Spróbuj jutro albo skontaktuj się z obsługą.',
    ]);
    expect(logs).toContain('AI: dzienny limit 2 zapytań wyczerpany.');
    now += 864e5;
    expect((await post(ai, 'generate', {})).status()).toBe(200);
  });
});

describe('powiększanie (wybór i sprawdzenie danych)', () => {
  const fake = (): Upscaler & { got: unknown[] } => {
    const got: unknown[] = [];
    return {
      got,
      ready: () => true,
      handle: async (p, res, s) => {
        got.push(p);
        s(res, 200, 'ok');
      },
    };
  };
  it('bez upscalera 503; zły obraz albo wymiar 400; poprawne dane trafiają do wybranego upscalera', async () => {
    expect((await post(service().ai, 'upscale', {})).text()).toBe('Brak skonfigurowanego powiększania.');
    const u = fake();
    const ai = new AiService(
      {
        env: { UPSCALER: 'topaz' },
        fetch: mockFetch(() => jsonResponse({})).fetch,
        now: () => NOW,
        sleep: async () => {},
        log: () => {},
      },
      { topaz: u },
    );
    expect((await post(ai, 'upscale', { source: 'x' })).text()).toBe('Brak obrazu do powiększenia.');
    expect((await post(ai, 'upscale', { source: PNG, targetPx: { w: 0, h: 1 } })).text()).toBe(
      'Brak wymiarów obrazu lub wymiaru druku.',
    );
    expect((await post(ai, 'upscale', { source: PNG, targetPx: { w: 10, h: 10 } })).status()).toBe(200);
    expect(u.got).toEqual([{ source: PNG, targetPx: { w: 10, h: 10 } }]);
  });
});

describe('wizualizacja we wnętrzu', () => {
  it('przykładowe wnętrze: obrazy ściany i geometrii, wymiary ściany, PNG, wynik jeden obraz', async () => {
    const { ai, calls } = service(KEY);
    expect((await post(ai, 'interior', { mural: PNG })).text()).toBe('Brak obrazów do wizualizacji.');
    expect((await post(ai, 'interior', { mural: PNG, geometry: PNG, wallW: 0, wallH: 250 })).text()).toBe(
      'Brak wymiarów ściany.',
    );
    const r = await post(ai, 'interior', {
      mural: PNG,
      geometry: JPG,
      wallW: 350,
      wallH: 270,
      room: 'sypialnia',
      aspect: 1.5,
    });
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/images/edits');
    expect(calls[0]!.body).toEqual({
      model: 'gpt-image-2',
      prompt: scenePrompt({ room: 'sypialnia', wallW: 350, wallH: 270 }),
      n: 1,
      size: '2048x1360',
      quality: 'medium',
      output_format: 'png',
      images: [{ image_url: PNG }, { image_url: JPG }],
    });
    expect(r.json()).toEqual({ image: { dataUrl: 'data:image/png;base64,QUJD', width: 2048, height: 1360 } });
  });
  it('zdjęcie klienta: zdjęcie, ściana, podgląd i maska; błędy OpenAI jak przy generowaniu', async () => {
    const { ai, calls } = service(KEY);
    await post(ai, 'interior', { mode: 'photo', mural: PNG, photo: JPG, guide: PNG, mask: PNG });
    expect(calls[0]!.body).toMatchObject({
      prompt: photoPrompt(),
      images: [{ image_url: JPG }, { image_url: PNG }, { image_url: PNG }],
      mask: { image_url: PNG },
    });
    const err = await post(service(KEY, () => jsonResponse({ error: {} }, 401)).ai, 'interior', {
      mode: 'photo',
      mural: PNG,
      photo: JPG,
      guide: PNG,
      mask: PNG,
    });
    expect([err.status(), err.text()]).toEqual([502, 'OpenAI zwrócił błąd 401']);
    const none = await post(service(KEY, () => jsonResponse({ data: [{}] })).ai, 'interior', {
      mode: 'photo',
      mural: PNG,
      photo: JPG,
      guide: PNG,
      mask: PNG,
    });
    expect(none.text()).toBe('OpenAI nie zwrócił obrazu.');
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const t = await post(service(KEY, () => Promise.reject(timeout)).ai, 'interior', {
      mode: 'photo',
      mural: PNG,
      photo: JPG,
      guide: PNG,
      mask: PNG,
    });
    expect(t.text()).toBe('OpenAI nie odpowiedział w 5 minut.');
  });
});

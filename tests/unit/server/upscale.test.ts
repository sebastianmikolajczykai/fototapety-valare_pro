// Powiększanie do druku na atrapach: fetch podmieniony (Replicate, Topaz), program Real-ESRGAN podmieniony.
import { describe, expect, it } from 'vitest';
import { LocalUpscaler } from '../../../src/server/ai/upscale-local';
import { ReplicateUpscaler } from '../../../src/server/ai/upscale-replicate';
import { TopazUpscaler } from '../../../src/server/ai/upscale-topaz';
import {
  modelFor,
  outputSize,
  pngSize,
  type AiDeps,
  type UpscaleRequest,
  type Upscaler,
} from '../../../src/server/ai/upscale';
import { send } from '../../../src/server/respond';
import { golden } from '../../support/golden';
import { fakeRes, jsonResponse, mockFetch, type FetchCall } from '../../support/http';

/** PNG z nagłówkiem IHDR o podanym wymiarze (reszta pliku nieistotna). */
const png = (w: number, h: number): string => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return 'data:image/png;base64,' + b.toString('base64');
};
const JPG = 'data:image/jpeg;base64,/9j/4AAQ';
const RESULT = new Uint8Array([1, 2, 3, 4]);

function deps(
  env: Record<string, string>,
  route: (url: string, c: FetchCall) => Response | Promise<Response>,
  clock?: () => number,
) {
  const f = mockFetch(route);
  const logs: string[] = [];
  let t = 0;
  const d: AiDeps = {
    env,
    fetch: f.fetch,
    now: clock ?? (() => t),
    sleep: async ms => {
      t += ms; // czas umowny; oddanie pętli zdarzeń jak przy prawdziwym czekaniu
      await new Promise(ok => setImmediate(ok));
    },
    log: (...a: unknown[]) => void logs.push(a.join(' ')),
  };
  return { d, calls: f.calls, logs };
}

async function run(u: Upscaler, p: UpscaleRequest, close = false) {
  const r = fakeRes();
  const job = u.handle(p, r.res, send);
  if (close) r.res.destroy();
  await job;
  await r.done();
  return r;
}

describe('rozmiar wyniku i model (zgodność ze starym programem)', () => {
  type G = {
    outputSize: { w: number; h: number; t: { w: number; h: number }; out: { w: number; h: number } }[];
    modelFor: { s?: string; out: string }[];
  };
  const G = golden<G>('server-ai');
  it('outputSize i modelFor jak w nagraniu', () => {
    for (const c of G.outputSize) expect(outputSize(c.w, c.h, c.t)).toEqual(c.out);
    for (const c of G.modelFor) expect(modelFor(c.s)).toBe(c.out);
    expect(modelFor('foto', 'Inny')).toBe('Inny');
  });
  it('wymiar PNG z nagłówka; inny format → null', () => {
    expect(pngSize(Buffer.from(png(640, 480).split(',')[1]!, 'base64'))).toEqual({ w: 640, h: 480 });
    expect(pngSize(Buffer.from('/9j/4AAQ', 'base64'))).toBeNull();
  });
});

describe('Replicate (domyślnie Topaz na Replicate)', () => {
  const ok = (calls: { status?: string; output?: unknown }[] = []) => {
    let poll = 0;
    return (url: string): Response => {
      if (url.endsWith('/files')) return jsonResponse({ urls: { get: 'https://api.replicate.com/v1/files/abc' } });
      if (url.endsWith('/predictions')) return jsonResponse({ id: 'p 1', status: 'starting' }, 201);
      if (url.includes('/predictions/p%201') && !url.endsWith('/cancel')) {
        const next = calls[poll++] ?? { status: 'succeeded', output: ['https://replicate.delivery/x/out.jpg'] };
        return jsonResponse(next);
      }
      if (url.endsWith('/cancel')) return jsonResponse({});
      return new Response(RESULT, { headers: { 'content-type': 'image/jpeg', 'content-length': '4' } });
    };
  };
  it('gotowość tylko z tokenem; brak tokenu 503', async () => {
    const { d } = deps({}, ok());
    const u = new ReplicateUpscaler(d);
    expect(u.ready()).toBe(false);
    expect((await run(u, { source: JPG, targetPx: { w: 1, h: 1 } })).status()).toBe(503);
  });
  it('wysyłka pliku, zadanie z Prefer: wait=60, dopytywanie, wynik strumieniem z wymiarem', async () => {
    const { d, calls, logs } = deps({ REPLICATE_API_TOKEN: ' r8 ' }, ok([{ status: 'processing' }, {}]));
    const r = await run(new ReplicateUpscaler(d), {
      source: png(1000, 500),
      targetPx: { w: 2500, h: 1000 },
      style: 'foto',
    });
    expect(calls[0]!.url).toBe('https://api.replicate.com/v1/files');
    expect(calls[0]!.headers.authorization).toBe('Bearer r8');
    expect(calls[1]!.url).toBe('https://api.replicate.com/v1/models/topazlabs/image-upscale/predictions');
    expect(calls[1]!.headers.prefer).toBe('wait=60');
    expect(calls[1]!.body).toEqual({
      input: {
        image: 'https://api.replicate.com/v1/files/abc',
        enhance_model: 'Standard V2',
        upscale_factor: '4x',
        output_format: 'jpg',
        face_enhancement: false,
      },
    });
    expect(calls.at(-1)!.headers.authorization).toBe('Bearer r8');
    expect([r.status(), r.headers()['X-Width'], r.headers()['X-Height'], r.headers()['Content-Length']]).toEqual([
      200,
      4000,
      2000,
      '4',
    ]);
    expect([...r.body()]).toEqual([...RESULT]);
    expect(logs.at(-1)).toMatch(/^AI upscale \(Replicate topazlabs\/image-upscale\): 1000x500 ×4 -> ok. 4000x2000/);
  });
  it('Real-ESRGAN (REPLICATE_MODEL): skala liczbowa ≤ REPLICATE_SCALE_MAX; plik przez data URL, gdy Files API zawiedzie', async () => {
    const route = ok();
    const { d, calls } = deps(
      { REPLICATE_API_TOKEN: 'r', REPLICATE_MODEL: 'nightmareai/real-esrgan', REPLICATE_SCALE_MAX: '20' },
      url => (url.endsWith('/files') ? jsonResponse({ detail: 'x' }, 500) : route(url)),
    );
    await run(new ReplicateUpscaler(d), {
      source: JPG,
      sourceWidth: 100,
      sourceHeight: 100,
      targetPx: { w: 1234, h: 50 },
    });
    expect(calls[1]!.body).toEqual({ input: { image: JPG, scale: 10, face_enhance: false } });
  });
  it('wynik spoza serwerów Replicate pobierany bez tokenu; adres nie-https → 502', async () => {
    const out = (o: unknown) => deps({ REPLICATE_API_TOKEN: 'r' }, ok([{ status: 'succeeded', output: o }]));
    const a = out('https://cdn.example.com/o.jpg');
    await run(new ReplicateUpscaler(a.d), {
      source: JPG,
      sourceWidth: 10,
      sourceHeight: 10,
      targetPx: { w: 100, h: 100 },
    });
    expect(a.calls.at(-1)!.headers.authorization).toBeUndefined();
    const b = out('http://replicate.delivery/o.jpg');
    const r = await run(new ReplicateUpscaler(b.d), {
      source: JPG,
      sourceWidth: 10,
      sourceHeight: 10,
      targetPx: { w: 100, h: 100 },
    });
    expect([r.status(), r.text()]).toEqual([502, 'Replicate nie podał poprawnego adresu wyniku.']);
  });
  it('błędy: zły obraz 400, brak wymiaru 400, odrzucone zadanie 502, nieudane 502, wynik nie do pobrania 502', async () => {
    const r8 = { REPLICATE_API_TOKEN: 'r' };
    const t = { w: 100, h: 100 };
    expect((await run(new ReplicateUpscaler(deps(r8, ok()).d), { source: 'x', targetPx: t })).status()).toBe(400);
    expect((await run(new ReplicateUpscaler(deps(r8, ok()).d), { source: JPG, targetPx: t })).text()).toBe(
      'Brak wymiarów obrazu lub wymiaru druku.',
    );
    const rej = deps(r8, url =>
      url.endsWith('/predictions') ? jsonResponse({ detail: 'Zły token' }, 401) : ok()(url),
    );
    expect((await run(new ReplicateUpscaler(rej.d), { source: png(10, 10), targetPx: t })).text()).toBe(
      'Replicate: Zły token',
    );
    const failed = deps(r8, ok([{ status: 'failed', error: 'CUDA' } as never]));
    expect((await run(new ReplicateUpscaler(failed.d), { source: png(10, 10), targetPx: t })).text()).toBe(
      'Replicate: CUDA',
    );
    const dl = deps(r8, url =>
      url.startsWith('https://replicate.delivery') ? new Response(null, { status: 404 }) : ok()(url),
    );
    expect((await run(new ReplicateUpscaler(dl.d), { source: png(10, 10), targetPx: t })).text()).toBe(
      'Nie udało się pobrać wyniku z Replicate.',
    );
  });
  it('błędna odpowiedź przy dopytywaniu nie gubi zadania; po 10 min anulowanie i 504; rozłączenie → anulowanie', async () => {
    const r8 = { REPLICATE_API_TOKEN: 'r' };
    const t = { w: 100, h: 100 };
    const flaky = deps(r8, ok([{ status: 'processing' }, 'zły' as never]));
    expect((await run(new ReplicateUpscaler(flaky.d), { source: png(10, 10), targetPx: t })).status()).toBe(200);
    const forever = Array(400).fill({ status: 'processing' });
    const slow = deps(r8, ok(forever));
    const r = await run(new ReplicateUpscaler(slow.d), { source: png(10, 10), targetPx: t });
    expect([r.status(), r.text()]).toEqual([504, 'Replicate nie skończył w 10 minut.']);
    expect(slow.calls.at(-1)!.url).toBe('https://api.replicate.com/v1/predictions/p%201/cancel');
    const gone = deps(r8, ok(forever));
    await run(new ReplicateUpscaler(gone.d), { source: png(10, 10), targetPx: t }, true);
    expect(gone.calls.at(-1)!.url).toMatch(/\/cancel$/);
    expect(gone.logs).toContain('Replicate: przeglądarka rozłączona – zadanie anulowane.');
  });
});

describe('Topaz (bezpośrednio)', () => {
  const route =
    (status = 'Completed') =>
    (url: string): Response => {
      if (url.endsWith('/enhance/async')) return jsonResponse({ process_id: 'id 1' });
      if (url.includes('/status/')) return jsonResponse({ status });
      if (url.includes('/download/')) return jsonResponse({ url: 'https://dl.topaz/x.jpg' });
      return new Response(RESULT, { headers: { 'content-length': '4' } });
    };
  it('brak klucza 503; zadanie multipart z modelem i szerokością wyniku; wynik JPG strumieniem', async () => {
    expect(
      (await run(new TopazUpscaler(deps({}, route()).d), { source: JPG, targetPx: { w: 1, h: 1 } })).status(),
    ).toBe(503);
    const { d, calls } = deps({ TOPAZ_API_KEY: 'tk' }, route());
    const u = new TopazUpscaler(d);
    expect(u.ready()).toBe(true);
    const r = await run(u, { source: png(1024, 768), targetPx: { w: 21000, h: 16000 } });
    expect(calls[0]!.headers['x-api-key']).toBe('tk');
    const form = calls[0]!.body as FormData;
    expect([form.get('model'), form.get('output_width'), form.get('output_format')]).toEqual(['CGI', '21333', 'jpeg']);
    expect((form.get('image') as File).name).toBe('grafika.png');
    expect(calls[1]!.url).toBe('https://api.topazlabs.com/image/v1/status/id%201');
    expect([r.status(), r.headers()['Content-Type'], r.headers()['X-Width'], r.headers()['X-Height']]).toEqual([
      200,
      'image/jpeg',
      21333,
      16000,
    ]);
    expect([...r.body()]).toEqual([...RESULT]);
  });
  it('błędy: zły obraz, brak wymiaru, odrzucone zadanie, zadanie Failed, brak adresu, wynik nie do pobrania, 10 min', async () => {
    const k = { TOPAZ_API_KEY: 'tk' };
    const t = { w: 100, h: 100 };
    const go = async (r: (u: string) => Response, p: UpscaleRequest = { source: png(10, 10), targetPx: t }) =>
      (await run(new TopazUpscaler(deps(k, r).d), p)).text();
    expect(await go(route(), { source: 'data:image/webp;base64,AA', targetPx: t })).toBe(
      'Brak obrazu do powiększenia.',
    );
    expect(await go(route(), { source: JPG, targetPx: t })).toBe('Brak wymiarów obrazu lub wymiaru druku.');
    expect(await go(() => jsonResponse({ message: 'Brak kredytów' }, 402))).toBe('Topaz: Brak kredytów');
    expect(await go(route('Failed'))).toBe('Topaz: zadanie Failed.');
    expect(await go(u => (u.includes('/download/') ? jsonResponse({}) : route()(u)))).toBe(
      'Topaz nie podał adresu wyniku.',
    );
    expect(await go(u => (u.startsWith('https://dl.topaz') ? new Response(null, { status: 500 }) : route()(u)))).toBe(
      'Nie udało się pobrać wyniku z Topaz.',
    );
    expect(await go(route('Processing'))).toBe('Topaz nie skończył w 10 minut.');
  });
  it('rozłączona przeglądarka: przestaje czekać', async () => {
    const { d, logs } = deps({ TOPAZ_API_KEY: 'tk' }, route('Processing'));
    await run(
      new TopazUpscaler(d),
      { source: JPG, sourceWidth: 10, sourceHeight: 10, targetPx: { w: 100, h: 100 } },
      true,
    );
    expect(logs).toContain('Topaz: przeglądarka rozłączona – przestaję czekać.');
  });
});

describe('lokalnie (Real-ESRGAN, tylko Windows z programem)', () => {
  const sys = (over: Partial<ConstructorParameters<typeof LocalUpscaler>[1]> = {}) => {
    const runs: string[][] = [];
    return {
      runs,
      s: {
        platform: 'win32' as NodeJS.Platform,
        toolsDir: '/narzedzia/realesrgan',
        exists: () => true,
        run: async (file: string, args: string[]) => {
          runs.push([file, ...args]);
          const i = args.indexOf('-o');
          const o = i >= 0 ? args[i + 1] : undefined;
          const ps = args.find(a => a.includes('System.Drawing'));
          const out = o || /\$b\.Save\('([^']+)'/.exec(ps ?? '')?.[1];
          if (out) (await import('node:fs')).writeFileSync(out, Buffer.from(RESULT));
        },
        ...over,
      },
    };
  };
  it('poza Windows albo bez programu: niegotowy, 503', async () => {
    const { d } = deps({}, () => jsonResponse({}));
    const u = new LocalUpscaler(d, { ...sys().s, platform: 'linux' });
    expect(u.ready()).toBe(false);
    expect((await run(u, { source: png(10, 10), targetPx: { w: 1, h: 1 } })).status()).toBe(503);
  });
  it('tylko PNG; skala ≤ 4: jeden przebieg i zmniejszenie; > 4: dwa przebiegi (JPG)', async () => {
    const { d } = deps({}, () => jsonResponse({}));
    const a = sys();
    expect((await run(new LocalUpscaler(d, a.s), { source: JPG, targetPx: { w: 1, h: 1 } })).status()).toBe(400);
    const r = await run(new LocalUpscaler(d, a.s), { source: png(100, 50), targetPx: { w: 300, h: 100 } });
    expect([r.status(), r.headers()['Content-Type'], r.headers()['X-Width'], r.headers()['X-Height']]).toEqual([
      200,
      'image/png',
      300,
      150,
    ]);
    expect(a.runs.map(x => x[0])).toEqual(['/narzedzia/realesrgan/realesrgan-ncnn-vulkan.exe', 'powershell']);
    const b = sys();
    const r2 = await run(new LocalUpscaler(d, b.s), { source: png(100, 50), targetPx: { w: 1000, h: 100 } });
    expect([r2.headers()['Content-Type'], r2.headers()['X-Width'], r2.headers()['X-Height']]).toEqual([
      'image/jpeg',
      1000,
      500,
    ]);
    expect(b.runs).toHaveLength(3);
    expect(b.runs[2]).toContain('jpg');
  });
  it('błąd programu → 500 z treścią; ścieżka z apostrofem bezpieczna w PowerShell', async () => {
    const { d } = deps({}, () => jsonResponse({}));
    const bad = sys({
      run: async () => {
        throw new Error('vkQueueSubmit failed');
      },
    });
    const r = await run(new LocalUpscaler(d, bad.s), { source: png(10, 10), targetPx: { w: 20, h: 20 } });
    expect([r.status(), r.text()]).toEqual([500, 'Real-ESRGAN: vkQueueSubmit failed']);
    expect(LocalUpscaler.psPath("C:\\O'Brien\\a.png")).toBe("'C:\\O''Brien\\a.png'");
  });
  it('jedno powiększanie naraz (409)', async () => {
    const { d } = deps({}, () => jsonResponse({}));
    let release!: () => void;
    const gate = new Promise<void>(ok => (release = ok));
    const base = sys();
    const u = new LocalUpscaler(d, { ...base.s, run: async (f, a) => (await gate, base.s.run(f, a)) });
    const first = run(u, { source: png(10, 10), targetPx: { w: 20, h: 20 } });
    await new Promise(ok => setTimeout(ok, 10));
    expect((await run(u, { source: png(10, 10), targetPx: { w: 20, h: 20 } })).status()).toBe(409);
    release();
    expect((await first).status()).toBe(200);
  });
});

// Powiększanie przez Topaz Labs API (Gigapixel) – odpowiednik starego ai-powieksz.js.
// API wg developer.topazlabs.com (25.10.2026): POST /image/v1/enhance/async (multipart), GET /status/{id},
// GET /download/{id} -> { url }. Maks. 32 000 px na bok. Cena: 1 kredyt za 24 MP wyniku.
// Klucz: zmienna TOPAZ_API_KEY. Wynik (JPG) idzie prosto do przeglądarki.
import type { ServerResponse } from 'node:http';
import { pipeBody, type Send } from '../respond';
import {
  envKey,
  jsonOrEmpty,
  modelFor,
  outputSize,
  sourceSize,
  watchGone,
  type AiDeps,
  type UpscaleRequest,
  type Upscaler,
} from './upscale';

const BASE = 'https://api.topazlabs.com/image/v1';
const POLL_MS = 3000;
const TIMEOUT_MS = 10 * 60 * 1000;

export class TopazUpscaler implements Upscaler {
  constructor(private readonly d: AiDeps) {}

  private key(): string | null {
    return envKey(this.d.env, 'TOPAZ_API_KEY');
  }

  ready(): boolean {
    return !!this.key();
  }

  async handle(p: UpscaleRequest, res: ServerResponse, send: Send): Promise<void> {
    const { d } = this;
    const key = this.key();
    if (!key) return send(res, 503, 'Brak klucza Topaz: ustaw zmienną TOPAZ_API_KEY na serwerze.');
    const m = /^data:(image\/(png|jpeg));base64,(.+)$/.exec(p.source || '');
    if (!m) return send(res, 400, 'Brak obrazu do powiększenia.');
    const buf = Buffer.from(m[3]!, 'base64');
    const src = sourceSize(buf, p);
    if (!src.w || !src.h || !p.targetPx) return send(res, 400, 'Brak wymiarów obrazu lub wymiaru druku.');
    const out = outputSize(src.w, src.h, p.targetPx);
    const model = modelFor(p.style, d.env.TOPAZ_MODEL);
    const auth = { 'X-API-Key': key };
    const t0 = d.now();
    const gone = watchGone(res);

    const form = new FormData();
    form.append('image', new Blob([buf], { type: m[1] }), m[2] === 'png' ? 'grafika.png' : 'grafika.jpg');
    form.append('model', model);
    form.append('output_width', String(out.w));
    form.append('output_format', 'jpeg');
    const r = await d.fetch(`${BASE}/enhance/async`, { method: 'POST', headers: auth, body: form });
    const j = await jsonOrEmpty(r);
    if (!r.ok || !j.process_id) return send(res, 502, `Topaz: ${String(j.message || j.error || 'błąd ' + r.status)}`);
    const id = encodeURIComponent(String(j.process_id));

    // Czekanie na wynik (status co 3 s, maks. 10 min).
    for (;;) {
      if (gone()) {
        d.log('Topaz: przeglądarka rozłączona – przestaję czekać.');
        return;
      }
      if (d.now() - t0 > TIMEOUT_MS) return send(res, 504, 'Topaz nie skończył w 10 minut.');
      await d.sleep(POLL_MS);
      const s = await jsonOrEmpty(await d.fetch(`${BASE}/status/${id}`, { headers: auth }));
      if (s.status === 'Completed') break;
      if (s.status === 'Failed' || s.status === 'Cancelled') return send(res, 502, `Topaz: zadanie ${s.status}.`);
    }
    if (gone()) return;
    const dl = await jsonOrEmpty(await d.fetch(`${BASE}/download/${id}`, { headers: auth }));
    if (!dl.url) return send(res, 502, 'Topaz nie podał adresu wyniku.');
    const f = await d.fetch(String(dl.url));
    if (!f.ok || !f.body) return send(res, 502, 'Nie udało się pobrać wyniku z Topaz.');
    const mp = ((out.w * out.h) / 1e6).toFixed(0);
    d.log(
      `AI upscale: ${src.w}x${src.h} -> ${out.w}x${out.h} (${mp} MP, ok. ${Math.ceil(Number(mp) / 24)} kredytów), ${model}, ${((d.now() - t0) / 1000).toFixed(0)} s`,
    );
    const len = f.headers.get('content-length');
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'X-Width': out.w,
      'X-Height': out.h,
      ...(len ? { 'Content-Length': len } : {}),
    });
    await pipeBody(f.body, res);
  }
}

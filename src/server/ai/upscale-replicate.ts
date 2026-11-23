// Powiększanie w chmurze przez Replicate – odpowiednik starego ai-powieksz-replicate.js (domyślny upscaler).
// Domyślnie topazlabs/image-upscale (Topaz Gigapixel na Replicate, do ×6), zapasowo nightmareai/real-esrgan
// (REPLICATE_MODEL). API wg replicate.com/docs/reference/http (26.10.2026): POST /v1/models/{owner}/{name}/predictions,
// nagłówek „Prefer: wait=60”, status starting/processing/succeeded/failed/canceled, wynik jako adres pliku.
// Klucz: zmienna REPLICATE_API_TOKEN. Płatność za sekundy pracy GPU – zadanie anulowane po rozłączeniu i po 10 min.
import type { ServerResponse } from 'node:http';
import { pipeBody, type Send } from '../respond';
import { envKey, jsonOrEmpty, sourceSize, watchGone, type AiDeps, type UpscaleRequest, type Upscaler } from './upscale';

const API = 'https://api.replicate.com/v1';
const TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 2000;
const DONE = ['succeeded', 'failed', 'canceled'];

/** Token Replicate tylko do serwerów Replicate – nie do dowolnego adresu z odpowiedzi. */
const ownHost = (host: string): boolean =>
  host === 'replicate.com' ||
  host.endsWith('.replicate.com') ||
  host === 'replicate.delivery' ||
  host.endsWith('.replicate.delivery');

export class ReplicateUpscaler implements Upscaler {
  constructor(private readonly d: AiDeps) {}

  private key(): string | null {
    return envKey(this.d.env, 'REPLICATE_API_TOKEN');
  }

  ready(): boolean {
    return !!this.key();
  }

  /** Duże pliki Replicate każe podawać jako adres, więc najpierw Files API; awaria → data URL (DO WALIDACJI > 256 KB). */
  private async upload(buf: Buffer, type: string, auth: Record<string, string>): Promise<string> {
    try {
      const form = new FormData();
      form.append('content', new Blob([buf], { type }), type === 'image/png' ? 'grafika.png' : 'grafika.jpg');
      const r = await this.d.fetch(`${API}/files`, { method: 'POST', headers: auth, body: form });
      const j = await jsonOrEmpty(r);
      const urls = j.urls as { get?: unknown } | undefined;
      if (r.ok && urls && typeof urls.get === 'string') return urls.get;
      this.d.log('Replicate Files API:', r.status, j.detail || '');
    } catch (e) {
      this.d.log('Replicate Files API:', (e as Error).message);
    }
    return `data:${type};base64,${buf.toString('base64')}`;
  }

  async handle(p: UpscaleRequest, res: ServerResponse, send: Send): Promise<void> {
    const { d } = this;
    const key = this.key();
    if (!key) return send(res, 503, 'Brak klucza Replicate: ustaw zmienną REPLICATE_API_TOKEN na serwerze.');
    const model = d.env.REPLICATE_MODEL || 'topazlabs/image-upscale';
    const isTopaz = model.startsWith('topazlabs/');
    const scaleMax = Math.min(10, Number(d.env.REPLICATE_SCALE_MAX) || 4);
    const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(p.source || '');
    if (!m) return send(res, 400, 'Brak obrazu do powiększenia.');
    const buf = Buffer.from(m[2]!, 'base64');
    const src = sourceSize(buf, p);
    if (!src.w || !src.h || !p.targetPx) return send(res, 400, 'Brak wymiarów obrazu lub wymiaru druku.');
    const need = Math.max(p.targetPx.w / src.w, p.targetPx.h / src.h);
    // Topaz na Replicate: „2x”/„4x”/„6x” (najmniejszy wystarczający, inaczej 6x). Real-ESRGAN: liczba ≤ scaleMax.
    const scale = isTopaz
      ? ([2, 4, 6].find(f => f >= need) ?? 6)
      : Math.max(1, Math.min(scaleMax, Math.round(need * 100) / 100));
    const input = isTopaz
      ? {
          enhance_model: p.style === 'foto' ? 'Standard V2' : 'CGI',
          upscale_factor: scale + 'x',
          output_format: 'jpg',
          face_enhancement: false,
        }
      : { scale, face_enhance: false };
    const auth = { Authorization: `Bearer ${key}` };
    const t0 = d.now();
    const gone = watchGone(res); // od początku – także w trakcie wysyłki i pierwszych 60 s czekania

    const image = await this.upload(buf, m[1]!, auth);
    const r = await d.fetch(`${API}/models/${model}/predictions`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'wait=60' },
      body: JSON.stringify({ input: { image, ...input } }),
    });
    let pred = await jsonOrEmpty(r);
    if (!r.ok || !pred.id)
      return send(res, 502, `Replicate: ${String(pred.detail || pred.error || 'błąd ' + r.status)}`);
    // Id zapamiętane osobno: błędna odpowiedź przy dopytywaniu (np. limit zapytań) nie może zgubić zadania.
    const id = encodeURIComponent(String(pred.id));
    const cancel = (): Promise<unknown> =>
      d.fetch(`${API}/predictions/${id}/cancel`, { method: 'POST', headers: auth }).catch(() => undefined);
    while (!DONE.includes(String(pred.status))) {
      if (gone()) {
        await cancel();
        d.log('Replicate: przeglądarka rozłączona – zadanie anulowane.');
        return;
      }
      if (d.now() - t0 > TIMEOUT_MS) {
        await cancel();
        return send(res, 504, 'Replicate nie skończył w 10 minut.');
      }
      await d.sleep(POLL_MS);
      const next = await d
        .fetch(`${API}/predictions/${id}`, { headers: auth })
        .then(x => x.json() as Promise<Record<string, unknown> | null>)
        .catch(() => null);
      if (next && next.status) pred = next;
    }
    if (pred.status !== 'succeeded') return send(res, 502, `Replicate: ${String(pred.error || pred.status)}`);
    const url = String(Array.isArray(pred.output) ? pred.output[0] : pred.output);
    let host: string;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') throw new Error('nie https');
      host = u.hostname;
    } catch {
      return send(res, 502, 'Replicate nie podał poprawnego adresu wyniku.');
    }
    const f = await d.fetch(url, ownHost(host) ? { headers: auth } : {});
    if (!f.ok || !f.body) return send(res, 502, 'Nie udało się pobrać wyniku z Replicate.');
    const w = Math.round(src.w * scale);
    const h = Math.round(src.h * scale);
    const sec = (pred.metrics as { predict_time?: number } | undefined)?.predict_time;
    d.log(
      `AI upscale (Replicate ${model}): ${src.w}x${src.h} ×${scale} -> ok. ${w}x${h}, ${((d.now() - t0) / 1000).toFixed(0)} s` +
        (sec ? `, czas GPU ${sec.toFixed(1)} s` : ''),
    );
    const len = f.headers.get('content-length');
    res.writeHead(200, {
      'Content-Type': f.headers.get('content-type') || 'image/png',
      'X-Width': w,
      'X-Height': h,
      ...(len ? { 'Content-Length': len } : {}),
    });
    await pipeBody(f.body, res);
  }
}

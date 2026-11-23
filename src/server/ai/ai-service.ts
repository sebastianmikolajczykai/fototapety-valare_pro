// Grafika AI – część serwerowa: odpowiednik starych ai-serwer.js i ai-wnetrze.js.
// POST /api/ai/generate | edit | upscale | interior. OpenAI Images API (generowanie, poprawki, wizualizacja we wnętrzu),
// powiększanie przez wybrany upscaler. Klucze tylko ze zmiennych środowiskowych, nigdy w przeglądarce.
// Bezpieczniki kosztów: maks. 8 zapytań naraz (429) i opcjonalny dzienny limit AI_LIMIT_DZIENNY.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Send } from '../respond';
import { isImage, photoPrompt, prompt, scenePrompt, size, text, validTarget } from './prompts';
import { envKey, type AiDeps, type UpscaleRequest, type Upscaler } from './upscale';
import { LocalUpscaler, localSystem } from './upscale-local';
import { ReplicateUpscaler } from './upscale-replicate';
import { TopazUpscaler } from './upscale-topaz';

export type UpscalerName = 'replicate' | 'topaz' | 'lokalny';
export type AiKind = 'generate' | 'edit' | 'upscale' | 'interior';

const KINDS: readonly string[] = ['generate', 'edit', 'upscale', 'interior'];
const ORDER: readonly UpscalerName[] = ['replicate', 'topaz', 'lokalny'];
const MAX_BODY = 40 << 20; // zdjęcia w data URL
const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_ACTIVE = 8; // 4 propozycje naraz + zapas
const OPENAI = 'https://api.openai.com/v1/images';

export interface AiStatus {
  generate: boolean;
  upscale: boolean;
  upscaler: string | null;
  provider: 'OpenAI';
  model: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    msg: string,
  ) {
    super(msg);
  }
}

type Json = Record<string, unknown>;

async function readJson(req: IncomingMessage): Promise<Json> {
  const tooBig = (): HttpError => new HttpError(413, 'Za duże zdjęcie (limit 40 MB).');
  if (Number(req.headers['content-length']) > MAX_BODY) throw tooBig();
  const chunks: Buffer[] = [];
  let len = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    len += c.length;
    if (len > MAX_BODY) throw tooBig();
    chunks.push(c);
  }
  let p: unknown;
  try {
    p = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Niepoprawne dane (JSON).');
  }
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new HttpError(400, 'Niepoprawne dane.');
  return p as Json;
}

const errorMessage = (e: unknown): string =>
  e instanceof Error ? (e.name === 'TimeoutError' ? 'OpenAI nie odpowiedział w 5 minut.' : e.message) : String(e);

export class AiService {
  private active = 0;
  private readonly day = { date: '', used: 0 };
  private readonly upscalers: Partial<Record<UpscalerName, Upscaler>>;

  /** upscalers: domyślnie Replicate, Topaz i lokalny Real-ESRGAN (folder narzedzia/realesrgan obok serwera). */
  constructor(
    private readonly d: AiDeps,
    upscalers?: Partial<Record<UpscalerName, Upscaler>>,
  ) {
    this.upscalers = upscalers ?? {
      replicate: new ReplicateUpscaler(d),
      topaz: new TopazUpscaler(d),
      lokalny: new LocalUpscaler(d, localSystem('narzedzia/realesrgan')),
    };
  }

  private get model(): string {
    return this.d.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  }
  private get quality(): string {
    return this.d.env.OPENAI_IMAGE_QUALITY || 'medium'; // low / medium / high – wpływa na koszt
  }
  private apiKey(): string | null {
    return envKey(this.d.env, 'OPENAI_API_KEY');
  }

  /** UPSCALER=replicate|topaz|lokalny wymusza wybór; domyślnie pierwszy gotowy. */
  private upscalerName(): string | null {
    return this.d.env.UPSCALER || ORDER.find(k => this.upscalers[k]?.ready()) || null;
  }

  status(): AiStatus {
    const u = this.upscalerName();
    return { generate: !!this.apiKey(), upscale: !!u, upscaler: u, provider: 'OpenAI', model: this.model };
  }

  /**
   * Dzienny limit zapytań (AI_LIMIT_DZIENNY; brak = bez limitu). Każda propozycja, poprawka, powiększenie
   * i wizualizacja to jedno zapytanie. Licznik w pamięci: zeruje się o północy (czas serwera) i po restarcie.
   */
  private overDaily(): boolean {
    const limit = Math.floor(Number(this.d.env.AI_LIMIT_DZIENNY)) || 0;
    if (!(limit > 0)) return false;
    const date = new Date(this.d.now()).toLocaleDateString('sv-SE'); // RRRR-MM-DD
    if (this.day.date !== date) Object.assign(this.day, { date, used: 0 });
    if (this.day.used >= limit) {
      this.d.log(`AI: dzienny limit ${limit} zapytań wyczerpany.`);
      return true;
    }
    this.day.used++;
    return false;
  }

  async handle(kind: string, req: IncomingMessage, res: ServerResponse, send: Send): Promise<void> {
    if (!KINDS.includes(kind)) return send(res, 404, 'Nieznana operacja AI.');
    if (this.active >= MAX_ACTIVE) return send(res, 429, 'Za dużo zapytań AI naraz. Spróbuj za chwilę.');
    if (this.overDaily())
      return send(res, 429, 'Wyczerpano dzienny limit zapytań AI. Spróbuj jutro albo skontaktuj się z obsługą.');
    this.active++;
    try {
      await this.run(kind as AiKind, req, res, send);
    } catch (e) {
      if (!(e instanceof HttpError)) this.d.log(`Błąd AI ${kind}:`, e instanceof Error ? e.stack : e);
      send(res, e instanceof HttpError ? e.status : 500, errorMessage(e));
    } finally {
      this.active--;
    }
  }

  private noKey(res: ServerResponse, send: Send): void {
    send(res, 503, 'Brak klucza OpenAI: ustaw zmienną OPENAI_API_KEY na serwerze i uruchom serwer ponownie.');
  }

  private async run(kind: AiKind, req: IncomingMessage, res: ServerResponse, send: Send): Promise<void> {
    if (kind === 'interior') return this.interior(req, res, send);
    if (kind === 'upscale') return this.upscale(req, res, send);
    const key = this.apiKey();
    if (!key) return this.noKey(res, send);
    const p = await readJson(req);
    const promptText = text(p.prompt);
    const stylePrompt = text(p.stylePrompt, 300);
    const image = kind === 'edit' ? p.source : p.reference;
    if (kind === 'edit' && (!isImage(image) || !promptText)) return send(res, 400, 'Brak obrazu lub opisu poprawki.');
    if (image && !isImage(image)) return send(res, 400, 'Niepoprawny obraz (dozwolone PNG, JPEG, WEBP).');
    const body: Json = {
      model: this.model,
      prompt: prompt(kind, { prompt: promptText, stylePrompt, reference: p.reference }),
      n: Math.min(4, Math.max(1, kind === 'edit' ? 1 : Number(p.count) || 1)),
      size: size(p.aspect),
      quality: this.quality,
      output_format: 'jpeg', // JPEG ok. 8× mniejszy od PNG – szybciej do przeglądarki
      output_compression: 95,
    };
    if (image) body.images = [{ image_url: image }];
    const t0 = this.d.now();
    const j = await this.openai(image ? 'edits' : 'generations', key, body, res, send, '');
    if (!j) return;
    const [w, h] = String(body.size).split('x').map(Number);
    const data = Array.isArray(j.data) ? (j.data as { b64_json?: string }[]) : [];
    const images = data
      .filter(x => x.b64_json)
      .map(x => ({ dataUrl: 'data:image/jpeg;base64,' + x.b64_json, width: w, height: h }));
    this.d.log(
      `AI ${kind}: ${images.length} obraz(y) ${String(body.size)}, ${this.model}/${this.quality}, ${((this.d.now() - t0) / 1000).toFixed(0)} s` +
        (j.usage ? `, tokeny: ${JSON.stringify(j.usage)}` : ''),
    );
    if (!images.length) return send(res, 502, 'OpenAI nie zwrócił obrazu.');
    send(res, 200, JSON.stringify({ images }), 'application/json');
  }

  /** Zapytanie do OpenAI Images API; błąd → 502 z komunikatem OpenAI i null. */
  private async openai(
    endpoint: 'edits' | 'generations',
    key: string,
    body: Json,
    res: ServerResponse,
    send: Send,
    what: string,
  ): Promise<Json | null> {
    const r = await this.d.fetch(`${OPENAI}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const j = (await r.json().catch(() => ({}))) as Json;
    if (!r.ok) {
      const msg = (j.error as { message?: string } | undefined)?.message || `OpenAI zwrócił błąd ${r.status}`;
      this.d.log(`Błąd OpenAI${what}:`, r.status, msg);
      send(res, 502, msg);
      return null;
    }
    return j;
  }

  private async upscale(req: IncomingMessage, res: ServerResponse, send: Send): Promise<void> {
    const u = this.upscalers[this.upscalerName() as UpscalerName];
    if (!u) return send(res, 503, 'Brak skonfigurowanego powiększania.');
    const p = await readJson(req);
    if (!isImage(p.source)) return send(res, 400, 'Brak obrazu do powiększenia.');
    if (!validTarget(p.targetPx)) return send(res, 400, 'Brak wymiarów obrazu lub wymiaru druku.');
    return u.handle(p as unknown as UpscaleRequest, res, send);
  }

  /**
   * Wizualizacja AI we wnętrzu. scene: IMAGE 1 = kadr ściany, IMAGE 2 = rysunek geometrii pokoju.
   * photo: IMAGE 1 = zdjęcie klienta, IMAGE 2 = kadr ściany, IMAGE 3 = zdjęcie z zaznaczonym czworokątem, plus maska.
   */
  private async interior(req: IncomingMessage, res: ServerResponse, send: Send): Promise<void> {
    const key = this.apiKey();
    if (!key) return this.noKey(res, send);
    const p = await readJson(req);
    const photo = p.mode === 'photo';
    const imgs = photo ? [p.mural, p.photo, p.guide, p.mask] : [p.mural, p.geometry];
    if (!imgs.every(isImage)) return send(res, 400, 'Brak obrazów do wizualizacji.');
    const wallOk = [p.wallW, p.wallH].every(v => typeof v === 'number' && v > 0 && v < 100000);
    if (!photo && !wallOk) return send(res, 400, 'Brak wymiarów ściany.');
    const body: Json = {
      model: this.model,
      prompt: photo ? photoPrompt() : scenePrompt({ room: p.room, wallW: p.wallW as number, wallH: p.wallH as number }),
      n: 1,
      size: size(p.aspect),
      quality: this.quality,
      output_format: 'png',
      images: photo
        ? [{ image_url: p.photo }, { image_url: p.mural }, { image_url: p.guide }]
        : [{ image_url: p.mural }, { image_url: p.geometry }],
    };
    if (photo) body.mask = { image_url: p.mask };
    const t0 = this.d.now();
    const j = await this.openai('edits', key, body, res, send, ' (wnętrze)');
    if (!j) return;
    const data = Array.isArray(j.data) ? (j.data as { b64_json?: string }[]) : [];
    const img = data.find(x => x.b64_json);
    this.d.log(
      `AI wnętrze (${photo ? 'zdjęcie' : String(p.room)}): ${String(body.size)}, ${this.model}/${this.quality}, ${((this.d.now() - t0) / 1000).toFixed(0)} s` +
        (j.usage ? `, tokeny: ${JSON.stringify(j.usage)}` : ''),
    );
    if (!img) return send(res, 502, 'OpenAI nie zwrócił obrazu.');
    const [w, h] = String(body.size).split('x').map(Number);
    send(
      res,
      200,
      JSON.stringify({ image: { dataUrl: 'data:image/png;base64,' + img.b64_json, width: w, height: h } }),
      'application/json',
    );
  }
}

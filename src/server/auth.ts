// Logowanie jak w konfiguratorze FeltDecor – odpowiednik starego logowanie.js (decyzja Sebastiana 27.10.2026):
// własny ekran w stronie, dowolny adres e-mail + wspólne hasło (APP_PASSWORD). Bez hasła strona otwarta.
// Sesja: podpisane ciasteczko na 14 dni. Klucz podpisu pochodzi z hasła (albo SESSION_SECRET), więc uśpienie
// serwera nikogo nie wylogowuje, a zmiana hasła wylogowuje wszystkich.
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const SESSION_COOKIE = 'fv_sesja';
const DAYS = 14;
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX_ADDRESSES = 10000;
const BODY_MAX = 10000;
// Strony konfiguratora, które bez logowania zastępuje ekran logowania. Skrypty, czcionki i miniatury są publiczne.
const GATED_PAGES = new Set(['/', '/bryty.html']);
const OPEN_API = new Set(['/api/health', '/api/login', '/api/logout', '/api/me']);

export interface AuthOptions {
  /** APP_PASSWORD; puste = logowanie wyłączone. */
  password: string;
  /** SESSION_SECRET; domyślnie klucz wyprowadzony z hasła. */
  secret?: string;
  now?: () => number;
}

const b64u = (buf: Buffer | string): string => Buffer.from(buf).toString('base64url');
const validEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
// Porównanie w stałym czasie także dla różnych długości (skróty SHA-256 mają 32 bajty – długość hasła nie wycieka).
const digest = (v: string): Buffer => crypto.createHash('sha256').update(v).digest();
const same = (a: string, b: string): boolean => crypto.timingSafeEqual(digest(a), digest(b));
const first = (v: string | string[] | undefined): string => String((Array.isArray(v) ? v[0] : v) ?? '');

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of first(req.headers.cookie).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function json(res: ServerResponse, code: number, data: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(data));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > BODY_MAX) throw new Error('za duże');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
}

export class Auth {
  readonly enabled: boolean;
  private readonly password: string;
  private readonly secret: string;
  private readonly now: () => number;
  /** Nieudane próby logowania na adres (czasy). */
  private readonly fails = new Map<string, number[]>();

  constructor(o: AuthOptions) {
    this.password = o.password;
    this.enabled = o.password.length > 0;
    this.secret = o.secret || crypto.createHmac('sha256', 'fototapety-valare-sesja').update(o.password).digest('hex');
    this.now = o.now ?? Date.now;
  }

  get trackedAddresses(): number {
    return this.fails.size;
  }

  sign(payload: string): string {
    return b64u(crypto.createHmac('sha256', this.secret).update(payload).digest());
  }

  /** Adres zalogowanej osoby albo null. */
  session(req: IncomingMessage): { email: string } | null {
    const [payload, sig] = String(cookies(req)[SESSION_COOKIE] || '').split('.');
    if (!payload || !sig || !same(this.sign(payload), sig)) return null;
    try {
      const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: unknown; exp?: number };
      return typeof d.e === 'string' && Number(d.exp) > this.now() ? { email: d.e } : null;
    } catch {
      return null;
    }
  }

  private cookie(req: IncomingMessage, value: string, maxAge: number): string {
    const secure = first(req.headers['x-forwarded-proto']).split(',')[0]!.trim() === 'https';
    return [`${SESSION_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
      .concat(secure ? ['Secure'] : [])
      .join('; ');
  }

  /** Adres klienta: ostatni wpis x-forwarded-for (dopisuje go serwer pośredniczący), inaczej adres gniazda. */
  private static address(req: IncomingMessage): string {
    const parts = first(req.headers['x-forwarded-for'])
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return parts.pop() || req.socket.remoteAddress || '?';
  }

  private async login(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const addr = Auth.address(req);
    const now = this.now();
    const list = (this.fails.get(addr) || []).filter(t => now - t < FAIL_WINDOW_MS);
    if (list.length >= FAIL_LIMIT) return json(res, 429, { ok: false, error: 'Za dużo prób. Spróbuj za 15 minut.' });
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { ok: false, error: 'Niepoprawne dane.' });
    }
    const email = String(body.email || '')
      .trim()
      .toLowerCase();
    if (!validEmail(email)) return json(res, 400, { ok: false, error: 'Wpisz poprawny adres e-mail.' });
    if (!this.enabled || !same(String(body.password || ''), this.password)) {
      list.push(now);
      this.fails.set(addr, list);
      // Limit pamięci: najpierw przeterminowane wpisy (pełne czyszczenie kasowałoby też aktywne blokady).
      if (this.fails.size > FAIL_MAX_ADDRESSES)
        for (const [k, v] of this.fails) if (!v.some(t => now - t < FAIL_WINDOW_MS)) this.fails.delete(k);
      if (this.fails.size > FAIL_MAX_ADDRESSES) this.fails.clear();
      return json(res, 401, { ok: false, error: 'Nieprawidłowe hasło.' });
    }
    this.fails.delete(addr);
    const payload = b64u(JSON.stringify({ e: email, exp: now + DAYS * 864e5 }));
    json(
      res,
      200,
      { ok: true, email },
      { 'Set-Cookie': this.cookie(req, `${payload}.${this.sign(payload)}`, DAYS * 86400) },
    );
  }

  /** true = żądanie obsłużone (logowanie, wylogowanie, /api/me, ekran logowania albo odmowa 401). */
  async handle(req: IncomingMessage, res: ServerResponse, url: string, serveLogin: () => void): Promise<boolean> {
    if (req.method === 'POST' && url === '/api/login') {
      await this.login(req, res);
      return true;
    }
    if (url === '/api/logout') {
      json(res, 200, { ok: true }, { 'Set-Cookie': this.cookie(req, '', 0) });
      return true;
    }
    if (url === '/api/me') {
      const s = this.session(req);
      json(res, 200, { ok: true, loginRequired: this.enabled, email: s ? s.email : null });
      return true;
    }
    if (!this.enabled || this.session(req)) return false;
    if (req.method === 'GET' && GATED_PAGES.has(url)) {
      serveLogin();
      return true;
    }
    if (url.startsWith('/api/') && !OPEN_API.has(url)) {
      json(res, 401, { ok: false, error: 'Zaloguj się ponownie.' });
      return true;
    }
    return false;
  }
}

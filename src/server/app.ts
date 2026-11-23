// Serwer HTTP konfiguratora – odpowiednik route() ze starego serwer-fototapety.js. Składa moduły:
// bezpieczeństwo (security.ts), logowanie (auth.ts), AI (ai/ai-service.ts), Corel (corel.ts) i pliki strony.
// Tryb lokalny (brak zmiennej PORT): nasłuch 127.0.0.1, sprawdzany nagłówek Host, AI otwarte bez hasła.
// W internecie (PORT ustawiony): nasłuch 0.0.0.0, płatne AI tylko za hasłem (APP_PASSWORD).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AiService } from './ai/ai-service';
import { systemDeps } from './ai/upscale';
import { Auth } from './auth';
import { CorelExporter, systemPowerShell } from './corel';
import { send } from './respond';
import { decodeUrl, frameOrigins, RESULTS_DIR, SecurityPolicy, STATIC_TYPES, staticFile } from './security';

type Env = Readonly<Record<string, string | undefined>>;
type Log = (...a: unknown[]) => void;

export interface ServerParts {
  /** Folder plików strony (bryty.html, logowanie.html, skrypty, czcionki, wzory). */
  root: string;
  port: number;
  local: boolean;
  /** RENDER_GIT_COMMIT – wersja w /api/health. */
  commit: string;
  security: SecurityPolicy;
  auth: Auth;
  ai: AiService;
  corel: CorelExporter;
  log: Log;
}

export interface FromEnvOptions {
  log?: Log;
  platform?: NodeJS.Platform;
}

/** Plik do odpowiedzi; błąd odczytu zamyka połączenie zamiast wyłączać serwer. */
const stream = (file: string, res: http.ServerResponse): void => {
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
};

export class FototapetyServer {
  /** Czas startu procesu (w /api/health: zmiana = restart, np. po awarii). */
  private readonly started = new Date().toISOString();

  constructor(private readonly s: ServerParts) {}

  static fromEnv(env: Env, root: string, o: FromEnvOptions = {}): FototapetyServer {
    const local = !env.PORT;
    const port = Number(env.PORT) || Number(env.LOCAL_PORT) || 3100;
    const log = o.log ?? ((...a: unknown[]) => console.log(...a));
    const deps = { ...systemDeps(), env, log };
    return new FototapetyServer({
      root: path.resolve(root),
      port,
      local,
      commit: env.RENDER_GIT_COMMIT || '',
      security: new SecurityPolicy({ local, port, frame: frameOrigins(env.OSADZENIE_NA) }),
      auth: new Auth({ password: env.APP_PASSWORD || '', secret: env.SESSION_SECRET }),
      ai: new AiService(deps),
      corel: new CorelExporter({
        platform: o.platform ?? process.platform,
        script: fileURLToPath(new URL('./zapisz-cdr.ps1', import.meta.url)),
        resultsDir: path.join(path.resolve(root), RESULTS_DIR),
        tmpDir: os.tmpdir(),
        log,
        powershell: systemPowerShell,
      }),
      log,
    });
  }

  get port(): number {
    return this.s.port;
  }
  get host(): string {
    return this.s.local ? '127.0.0.1' : '0.0.0.0';
  }

  /** AI tylko lokalnie albo za hasłem (bez hasła w internecie płatne AI byłoby otwarte dla każdego). */
  private get aiOpen(): boolean {
    return this.s.local || this.s.auth.enabled;
  }

  /** Plik statyczny z Last-Modified: przeglądarka pyta „czy zmieniony?” i dostaje 304 zamiast całego pliku. */
  private serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string): void {
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      return send(res, 404, 'Nie znaleziono.');
    }
    if (!st.isFile()) return send(res, 404, 'Nie znaleziono.');
    const mod = new Date(Math.floor(st.mtimeMs / 1000) * 1000);
    const since = Date.parse(req.headers['if-modified-since'] || '');
    const headers = {
      'Content-Type': STATIC_TYPES[path.extname(file)]!,
      'Last-Modified': mod.toUTCString(),
      'Cache-Control': 'no-cache',
    };
    if (!Number.isNaN(since) && mod.getTime() <= since) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    stream(file, res);
  }

  async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const { s } = this;
    for (const [k, v] of Object.entries(s.security.headers)) res.setHeader(k, v);
    if (s.security.isForeign(req)) return send(res, 403, 'Żądanie z innej strony odrzucone.');
    const url = decodeUrl(req.url);
    if (url === null) return send(res, 400, 'Niepoprawny adres.');
    const loginPage = (): void => {
      res.writeHead(200, { 'Content-Type': STATIC_TYPES['.html']!, 'Cache-Control': 'no-store' });
      stream(path.join(s.root, 'logowanie.html'), res);
    };
    if (await s.auth.handle(req, res, url, loginPage)) return;
    if (req.method === 'GET' && url === '/api/health') {
      const ai = s.ai.status();
      const body = {
        ok: true,
        wersja: s.commit.slice(0, 7) || null,
        dzialaOd: this.started,
        corel: await s.corel.installed(),
        ai: this.aiOpen ? ai : { ...ai, generate: false, upscale: false },
      };
      return send(res, 200, JSON.stringify(body), 'application/json');
    }
    if (req.method === 'POST' && url.startsWith('/api/ai/')) {
      if (!this.aiOpen) return send(res, 503, 'AI wyłączone: serwer nie ma ustawionego hasła (APP_PASSWORD).');
      return s.ai.handle(url.slice(8), req, res, send);
    }
    if (req.method === 'POST' && url === '/api/cdr') return s.corel.handle(req, res, send);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Metoda niedozwolona.');
    const file = staticFile(s.root, url);
    if (!file) return send(res, 404, 'Nie znaleziono.');
    this.serveFile(req, res, file);
  }

  /** Uruchamia nasłuch (port i adres wg trybu). */
  listen(): http.Server {
    const srv = this.createServer();
    srv.listen(this.port, this.host, () =>
      this.s.log(`Fototapety – podział na bryty: http://${this.host}:${this.port}`),
    );
    return srv;
  }

  /** Serwer HTTP: błąd w obsłudze jednego żądania kończy tylko to żądanie (500), a nie cały serwer. */
  createServer(): http.Server {
    return http.createServer((req, res) => {
      this.route(req, res).catch((e: unknown) => {
        this.s.log(`Błąd ${req.method} ${req.url}:`, (e instanceof Error && e.stack) || e);
        try {
          send(res, 500, 'Błąd serwera.');
        } catch {
          res.destroy();
        }
      });
    });
  }
}

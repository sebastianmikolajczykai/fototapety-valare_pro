// Bezpieczeństwo serwera – odpowiednik części starego serwer-fototapety.js: nagłówki (CSP), ochrona przed
// żądaniami z obcych stron (CSRF, DNS rebinding), dekodowanie adresu i wybór pliku statycznego, komunikat Corela.
import path from 'node:path';

/** Typy plików podawanych przeglądarce; inne rozszerzenia (np. klucze *.txt, .cdr) → 404. */
export const STATIC_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
};

/** Folder wyników Corela (tryb „link”): pliki zostają na dysku, ale nie są podawane przez serwer. */
export const RESULTS_DIR = 'wyniki';

// Pliki serwera nie są podawane przeglądarce (kod serwera, testy, narzędzia) ani pliki zaczynające się kropką.
const PRIVATE =
  /^\/(?:serwer-fototapety|ai-serwer|ai-wnetrze|ai-powieksz[\w-]*|logowanie|test-[\w-]+)\.js$|^\/(?:testy|node_modules|narzedzia|wyniki|zdjecia-testowe|test)\/|^\/wzory\/pobierz-wzory\.js$|\/\./i;

export const isPrivatePath = (p: string): boolean => PRIVATE.test(p);

/**
 * Dla klienta tylko treść błędu PowerShella, bez technicznego ogona („At …ps1:21 char:5”, „+ CategoryInfo…”);
 * polski Windows pisze „W …ps1:21 znak:5”. Bez znacznika – ostatnie 6 linii.
 */
export function cdrMessage(text: string | null | undefined): string {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  const end = lines.findIndex(l => /^\s*(At|W) .+:\d+ (char|znak):\d+/.test(l) || /^\s*\+ /.test(l));
  return (end > 0 ? lines.slice(0, end) : lines.slice(-6)).join('\n').trim();
}

/** Ścieżka z adresu bez zapytania; zepsute kodowanie (np. „/%E0%A4%A” od botów) → null zamiast awarii. */
export function decodeUrl(raw: string | undefined): string | null {
  try {
    return decodeURIComponent(String(raw || '/').split('?')[0]!);
  } catch {
    return null;
  }
}

/** Plik statyczny dla adresu albo null (404): poza folderem, ukryty, z „~” (krótkie nazwy 8.3 na Windows), nieznany typ. */
export function staticFile(root: string, url: string): string | null {
  const file = path.join(root, url === '/' ? 'bryty.html' : url);
  const rel = '/' + path.relative(root, file).split(path.sep).join('/'); // po rozwinięciu „..”
  const results = path.join(root, RESULTS_DIR) + path.sep;
  if (
    file.includes('\0') ||
    rel.includes('~') ||
    PRIVATE.test(rel) ||
    !file.startsWith(root + path.sep) ||
    file.toLowerCase().startsWith(results.toLowerCase()) ||
    !STATIC_TYPES[path.extname(file)]
  )
    return null;
  return file;
}

/** OSADZENIE_NA: adresy stron, które mogą osadzić narzędzie w ramce (tylko https://host[:port]). */
export function frameOrigins(env: string | undefined): string[] {
  return String(env || '')
    .split(/[\s,]+/)
    .filter(u => /^https:\/\/[\w.-]+(:\d+)?$/.test(u));
}

export interface RequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface SecurityOptions {
  /** Tryb lokalny (127.0.0.1): nagłówek Host musi wskazywać ten komputer. */
  local: boolean;
  port: number;
  /** Strony, które mogą osadzić narzędzie w ramce (frameOrigins). */
  frame?: readonly string[];
}

const header = (req: RequestLike, name: string): string | undefined => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/** Nagłówki bezpieczeństwa i ochrona przed żądaniami z obcych stron. */
export class SecurityPolicy {
  readonly headers: Readonly<Record<string, string>>;
  private readonly local: boolean;
  private readonly hosts: readonly string[];

  constructor(o: SecurityOptions) {
    const frame = o.frame ?? [];
    // CSP: skrypty tylko z tego serwera, połączenia do siebie i do Wikimedia (pełne pliki wzorów z galerii),
    // obrazy z plików/blob/data. Style wpisane w stronę dozwolone (nie wykonują kodu).
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' data: blob: https://upload.wikimedia.org",
      "media-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      `frame-ancestors ${frame.length ? "'self' " + frame.join(' ') : "'none'"}`,
    ].join('; ');
    this.headers = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': csp,
      // X-Frame-Options nie zna listy stron – przy osadzeniu decyduje CSP
      ...(frame.length ? {} : { 'X-Frame-Options': 'DENY' }),
    };
    this.local = o.local;
    this.hosts =
      o.port === 80
        ? ['127.0.0.1', 'localhost', '127.0.0.1:80', 'localhost:80']
        : [`127.0.0.1:${o.port}`, `localhost:${o.port}`];
  }

  /**
   * true = odrzucić (403). Lokalnie Host musi wskazywać ten komputer (DNS rebinding). Zapis/AI (poza GET/HEAD)
   * tylko z tej samej strony: Sec-Fetch-Site, a w starszych przeglądarkach Origin zgodny z Host.
   */
  isForeign(req: RequestLike): boolean {
    const host = String(header(req, 'host') || '').toLowerCase();
    if (this.local && !this.hosts.includes(host)) return true;
    if (req.method === 'GET' || req.method === 'HEAD') return false;
    const site = header(req, 'sec-fetch-site');
    if (site) return site !== 'same-origin' && site !== 'none';
    const origin = header(req, 'origin');
    if (origin === 'null') return true;
    if (origin) {
      try {
        return new URL(origin).host.toLowerCase() !== host;
      } catch {
        return true;
      }
    }
    return false;
  }
}

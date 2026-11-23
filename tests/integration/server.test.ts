// Odporność serwera – przeniesione testy starego programu (testy/serwer.test.js, awaria Rendera 29.10.2026
// „Exited with status 1”) plus nagłówki, pliki statyczne, health, AI i Corel. Serwer uruchomiony w tym procesie
// na wolnym porcie, folder strony = tymczasowy folder z plikami testowymi. Bez kluczy AI – nic płatnego.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FototapetyServer } from '../../src/server/app';

const PASSWORD = 'haslo-testowe';
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fototapety-root-'));
fs.writeFileSync(
  path.join(ROOT, 'bryty.html'),
  '<h1>Podział fototapety na bryty</h1><p>podział fototapety na bryty</p>',
);
fs.writeFileSync(path.join(ROOT, 'logowanie.html'), '<h1>logowanie</h1>');
fs.writeFileSync(path.join(ROOT, 'bryty.js'), 'console.log(1)');
fs.writeFileSync(path.join(ROOT, 'klucz-openai.txt'), 'sk-tajny');
fs.writeFileSync(path.join(ROOT, '.env'), 'X=1');
fs.mkdirSync(path.join(ROOT, 'wyniki'));
fs.writeFileSync(path.join(ROOT, 'wyniki', 'x.jpg'), 'x');
fs.mkdirSync(path.join(ROOT, 'katalog.js'));

let PORT = 0;
let server: http.Server;
const logs: string[] = [];
const app = (env: Record<string, string | undefined>, root = ROOT) =>
  FototapetyServer.fromEnv(env, root, { log: (...a: unknown[]) => void logs.push(a.join(' ')), platform: 'linux' });

function raw(
  method: string,
  url: string,
  o: { body?: string; headers?: Record<string, string>; port?: number } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: o.port ?? PORT, method, path: url, headers: o.headers ?? {} },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    if (o.body !== undefined) req.write(o.body);
    req.end();
  });
}

function socket(text: string, port = PORT): Promise<string> {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1', () => s.end(text));
    let out = '';
    s.on('data', d => (out += d));
    s.on('close', () => resolve(out));
    s.on('error', () => resolve(out));
  });
}

async function alive(): Promise<void> {
  const r = await raw('GET', '/api/health');
  expect(r.status).toBe(200);
  expect(server.listening).toBe(true);
}

async function start(a: FototapetyServer): Promise<{ srv: http.Server; port: number }> {
  const srv = a.createServer();
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok));
  return { srv, port: (srv.address() as net.AddressInfo).port };
}

beforeAll(async () => {
  const s = await start(app({ PORT: '10000', APP_PASSWORD: PASSWORD, RENDER_GIT_COMMIT: 'abcdef1234' }));
  server = s.srv;
  PORT = s.port;
});
afterAll(() => {
  server.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
});

const login = async (): Promise<string> => {
  const ok = await raw('POST', '/api/login', { body: JSON.stringify({ email: 'test@valare.pl', password: PASSWORD }) });
  return String(ok.headers['set-cookie']![0]).split(';')[0]!;
};

describe('serwer: testy odporności starego programu', () => {
  it('health odpowiada JSON-em (wersja, czas startu, Corel, AI wyłączone bez kluczy)', async () => {
    const r = await raw('GET', '/api/health');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/json');
    const j = JSON.parse(r.text);
    expect(j).toMatchObject({ ok: true, wersja: 'abcdef1', corel: false, ai: { generate: false, upscale: false } });
    expect(Number.isNaN(Date.parse(j.dzialaOd))).toBe(false);
  });

  for (const bad of ['/%E0%A4%A', '/%', '/%zz', '/abc%2', '/%E0%A4%A?x=1', '/api/%C0%AF', '/%%%', '/bryty.html%'])
    it(`zepsuty adres ${bad} -> 400, serwer działa`, async () => {
      expect((await raw('GET', bad)).status).toBe(400);
      await alive();
    });

  it('zepsuty adres w POST -> 400; wysłany surowo przez gniazdo -> 400', async () => {
    expect((await raw('POST', '/api/ai/%zz', { body: '{}' })).status).toBe(400);
    expect(await socket('GET /%E0%A4%A HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')).toMatch(/^HTTP\/1\.1 400/);
    await alive();
  });

  it('bajt zerowy w adresie -> 404; bardzo długi adres (8 KB) -> 404; ponad limit nagłówków (40 KB) -> 431', async () => {
    for (const u of ['/%00', '/bryty.html%00', '/%00.js', '/a%00b.png'])
      expect((await raw('GET', u)).status, u).toBe(404);
    expect((await raw('GET', '/' + 'a'.repeat(8000) + '.js')).status).toBe(404);
    expect(await socket('GET /' + 'a'.repeat(40000) + ' HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')).toMatch(
      /^HTTP\/1\.1 431/,
    );
    expect((await raw('GET', '/' + '%E0'.repeat(2000))).status).toBe(400);
    await alive();
  });

  it('śmieci zamiast HTTP -> 400, serwer działa', async () => {
    expect(await socket('HELLO\r\n\r\n')).toMatch(/^HTTP\/1\.1 400/);
    await socket('\x00\x01\x02\xff\r\n\r\n');
    await alive();
  });

  it('wyjście poza folder aplikacji i pliki prywatne -> 404', async () => {
    for (const u of [
      '/..%2f..%2fetc%2fpasswd',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/..%5c..%5cwindows%5cwin.ini',
      '/wyniki/x.jpg',
      '/klucz-openai.txt',
      '/.env',
      '/katalog.js',
    ])
      expect((await raw('GET', u)).status, u).toBe(404);
    await alive();
  });

  it('bez logowania: strona startowa = ekran logowania, API = 401', async () => {
    const r = await raw('GET', '/');
    expect([r.status, r.headers['cache-control']]).toEqual([200, 'no-store']);
    expect(r.text).toMatch(/logowanie/);
    expect((await raw('POST', '/api/ai/generate', { body: '{}' })).status).toBe(401);
  });

  it('logowanie: błędny JSON 400, za duże 400, złe hasło 401, dobre hasło 200 + ciasteczko', async () => {
    expect((await raw('POST', '/api/login', { body: '{nie-json' })).status).toBe(400);
    expect((await raw('POST', '/api/login', { body: 'x'.repeat(20000) })).status).toBe(400);
    expect(
      (await raw('POST', '/api/login', { body: JSON.stringify({ email: 'a@b.pl', password: 'zle' }) })).status,
    ).toBe(401);
    expect(await login()).toMatch(/^fv_sesja=/);
    await alive();
  });

  it('zalogowany: konfigurator, błędne żądania kończą się 4xx/5xx, serwer działa', async () => {
    const headers = { cookie: await login() };
    const page = await raw('GET', '/', { headers });
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/podział fototapety na bryty/);
    // Bez kluczy AI: odpowiedź 503, nic nie idzie do OpenAI/Replicate.
    expect((await raw('POST', '/api/ai/generate', { headers, body: '{nie-json' })).status).toBe(503);
    expect((await raw('POST', '/api/ai/upscale', { headers, body: '{}' })).status).toBe(503);
    expect((await raw('POST', '/api/ai/interior', { headers, body: '{}' })).status).toBe(503);
    expect((await raw('POST', '/api/ai/nieznane', { headers, body: '{}' })).status).toBe(404);
    // Bez CorelDRAW (Linux/macOS): 501.
    expect((await raw('POST', '/api/cdr', { headers, body: 'x' })).status).toBe(501);
    expect((await raw('PUT', '/bryty.html', { headers })).status).toBe(405);
    expect((await raw('GET', '/nie-ma-takiego.js', { headers })).status).toBe(404);
    expect((await raw('GET', '/%zz', { headers })).status).toBe(400);
    await alive();
  });

  it('sfałszowane ciasteczko sesji -> ekran logowania', async () => {
    for (const cookie of ['fv_sesja=abc.def', 'fv_sesja=%zz', 'fv_sesja=.', 'fv_sesja=' + 'x'.repeat(5000)]) {
      const r = await raw('GET', '/', { headers: { cookie } });
      expect(r.status).toBe(200);
      expect(r.text).toMatch(/logowanie/);
    }
    await alive();
  });

  it('zerwane wysyłanie danych logowania nie wyłącza serwera', async () => {
    await new Promise<void>(resolve => {
      const s = net.connect(PORT, '127.0.0.1', () => {
        s.write(
          'POST /api/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 5000\r\n\r\n{"email":',
        );
        setTimeout(() => {
          s.destroy();
          resolve();
        }, 100);
      });
      s.on('error', () => resolve());
    });
    await new Promise(ok => setTimeout(ok, 200));
    await alive();
  });

  it('seria 200 zepsutych żądań naraz -> serwer działa', async () => {
    const urls = ['/%E0%A4%A', '/%', '/%zz', '/%00', '/..%2f..%2fetc%2fpasswd'];
    const all = await Promise.all(Array.from({ length: 200 }, (_, i) => raw('GET', urls[i % urls.length]!)));
    expect(all.every(r => r.status === 400 || r.status === 404)).toBe(true);
    await alive();
  });

  it('w logu serwera brak awarii', () => {
    expect(logs.join('\n')).not.toMatch(/URIError|Nieobsłużony błąd|Błąd GET|Błąd POST/);
  });
});

describe('serwer: nagłówki, pliki statyczne, obce strony', () => {
  it('nagłówki bezpieczeństwa w każdej odpowiedzi; plik statyczny z Last-Modified i 304', async () => {
    const r = await raw('GET', '/bryty.js');
    expect(r.status).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['content-security-policy']).toContain("script-src 'self'");
    expect([r.headers['content-type'], r.headers['cache-control'], r.headers['content-length']]).toEqual([
      'text/javascript',
      'no-cache',
      '14',
    ]);
    expect(r.text).toBe('console.log(1)');
    const again = await raw('GET', '/bryty.js', { headers: { 'if-modified-since': r.headers['last-modified']! } });
    expect([again.status, again.text]).toEqual([304, '']);
    const head = await raw('HEAD', '/bryty.js');
    expect([head.status, head.headers['content-length'], head.text]).toEqual([200, '14', '']);
  });
  it('POST z obcej strony -> 403', async () => {
    const r = await raw('POST', '/api/login', { headers: { 'sec-fetch-site': 'cross-site' }, body: '{}' });
    expect([r.status, r.text]).toEqual([403, 'Żądanie z innej strony odrzucone.']);
  });
  it('lokalnie (bez PORT): Host musi wskazywać ten komputer; AI otwarte bez hasła; logowanie wyłączone', async () => {
    const a = app({ LOCAL_PORT: '3999' });
    const { srv, port } = await start(a);
    try {
      expect((await raw('GET', '/', { port, headers: { host: 'zly.pl' } })).status).toBe(403);
      const page = await raw('GET', '/', { port, headers: { host: '127.0.0.1:3999' } });
      expect(page.text).toMatch(/podział fototapety/);
      const h = JSON.parse((await raw('GET', '/api/health', { port, headers: { host: 'localhost:3999' } })).text);
      expect([h.wersja, h.ai.provider]).toEqual([null, 'OpenAI']);
      expect(a.port).toBe(3999);
      expect(a.host).toBe('127.0.0.1');
    } finally {
      srv.close();
    }
  });
  it('w internecie bez hasła: płatne AI wyłączone (503), strona otwarta', async () => {
    const a = app({ PORT: '8080', OPENAI_API_KEY: 'sk-x' });
    const { srv, port } = await start(a);
    try {
      const r = await raw('POST', '/api/ai/generate', { port, body: '{}' });
      expect([r.status, r.text]).toEqual([503, 'AI wyłączone: serwer nie ma ustawionego hasła (APP_PASSWORD).']);
      const h = JSON.parse((await raw('GET', '/api/health', { port })).text);
      expect(h.ai).toMatchObject({ generate: false, upscale: false });
      expect([a.port, a.host]).toEqual([8080, '0.0.0.0']);
      expect(app({}).port).toBe(3100);
    } finally {
      srv.close();
    }
  });
  it('błąd w obsłudze żądania kończy tylko to żądanie (500), zapis w logu', async () => {
    const a = app({ PORT: '1' }, path.join(ROOT, 'nie-ma'));
    const broken = Object.assign(a, {
      route: async () => {
        throw new Error('awaria testowa');
      },
    });
    const { srv, port } = await start(broken);
    try {
      const r = await raw('GET', '/', { port });
      expect([r.status, r.text]).toEqual([500, 'Błąd serwera.']);
      expect(logs.some(l => l.startsWith('Błąd GET /:') && l.includes('awaria testowa'))).toBe(true);
    } finally {
      srv.close();
    }
  });
});

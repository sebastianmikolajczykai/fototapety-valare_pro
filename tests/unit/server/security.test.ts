import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cdrMessage,
  decodeUrl,
  frameOrigins,
  isPrivatePath,
  SecurityPolicy,
  staticFile,
  STATIC_TYPES,
} from '../../../src/server/security';
import { golden } from '../../support/golden';

const ROOT = path.resolve('/srv/app');
const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers });

describe('adres żądania', () => {
  it('zepsute kodowanie → null (stary serwer padał na URIError); zapytanie odcięte', () => {
    for (const bad of ['/%E0%A4%A', '/%', '/%zz', '/abc%2', '/api/%C0%AF', '/%%%']) expect(decodeUrl(bad)).toBeNull();
    expect(decodeUrl('/a%20b.js?x=1')).toBe('/a b.js');
    expect(decodeUrl(undefined)).toBe('/');
  });
});

describe('pliki statyczne', () => {
  it('strona główna = bryty.html; znane typy plików', () => {
    expect(staticFile(ROOT, '/')).toBe(path.join(ROOT, 'bryty.html'));
    expect(staticFile(ROOT, '/fonts/a.woff2')).toBe(path.join(ROOT, 'fonts/a.woff2'));
    expect(STATIC_TYPES['.js']).toBe('text/javascript');
  });
  it('odrzuca: wyjście poza folder, bajt zerowy, „~”, pliki serwera, wyniki, nieznane typy', () => {
    for (const u of [
      '/../../etc/passwd',
      '/..\\..\\windows\\win.ini',
      '/bryty.html\0',
      '/ai-ser~1.js',
      '/serwer-fototapety.js',
      '/wyniki/x.jpg',
      '/WYNIKI/x.jpg',
      '/klucz-openai.txt',
      '/.env',
      '/a.cdr',
    ])
      expect(staticFile(ROOT, u), u).toBeNull();
  });
});

describe('nagłówki bezpieczeństwa', () => {
  it('bez stron do osadzenia: frame-ancestors none + X-Frame-Options DENY', () => {
    const h = new SecurityPolicy({ local: true, port: 3100 }).headers;
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Security-Policy']).toContain("script-src 'self';");
    expect(h['Content-Security-Policy']).toMatch(/frame-ancestors 'none'$/);
    expect(h['X-Frame-Options']).toBe('DENY');
  });
  it('OSADZENIE_NA: tylko adresy https, wtedy bez X-Frame-Options', () => {
    const frame = frameOrigins('https://valare.pl, http://zly.pl https://www.valare.pl:8443 javascript:x');
    expect(frame).toEqual(['https://valare.pl', 'https://www.valare.pl:8443']);
    const h = new SecurityPolicy({ local: false, port: 80, frame }).headers;
    expect(h['Content-Security-Policy']).toMatch(
      /frame-ancestors 'self' https:\/\/valare.pl https:\/\/www.valare.pl:8443$/,
    );
    expect(h).not.toHaveProperty('X-Frame-Options');
    expect(frameOrigins(undefined)).toEqual([]);
  });
});

describe('żądania z obcych stron (CSRF, DNS rebinding)', () => {
  const local = new SecurityPolicy({ local: true, port: 3100 });
  const net = new SecurityPolicy({ local: false, port: 10000 });
  it('lokalnie nagłówek Host musi wskazywać ten komputer', () => {
    expect(local.isForeign(req('GET', { host: '127.0.0.1:3100' }))).toBe(false);
    expect(local.isForeign(req('GET', { host: 'LOCALHOST:3100' }))).toBe(false);
    expect(local.isForeign(req('GET', { host: 'zly.pl' }))).toBe(true);
    expect(local.isForeign(req('GET'))).toBe(true);
    const p80 = new SecurityPolicy({ local: true, port: 80 });
    expect(p80.isForeign(req('GET', { host: 'localhost' }))).toBe(false);
  });
  it('GET/HEAD zawsze; POST tylko z tej samej strony (Sec-Fetch-Site albo Origin = Host)', () => {
    expect(net.isForeign(req('HEAD', { host: 'a.pl' }))).toBe(false);
    expect(net.isForeign(req('POST', { host: 'a.pl', 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(net.isForeign(req('POST', { host: 'a.pl', 'sec-fetch-site': 'none' }))).toBe(false);
    expect(net.isForeign(req('POST', { host: 'a.pl', 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(net.isForeign(req('POST', { host: 'a.pl', origin: 'https://A.pl' }))).toBe(false);
    expect(net.isForeign(req('POST', { host: 'a.pl', origin: 'https://b.pl' }))).toBe(true);
    expect(net.isForeign(req('POST', { host: 'a.pl', origin: 'null' }))).toBe(true);
    expect(net.isForeign(req('POST', { host: 'a.pl', origin: 'nie adres' }))).toBe(true);
    expect(net.isForeign(req('POST', { host: 'a.pl' }))).toBe(false);
  });
});

type G = { cdrMessage: { t: string | null; out: string }[]; privatePaths: { p: string; out: boolean }[] };
describe('zgodność ze starym programem', () => {
  const G = golden<G>('server-ai');
  it('komunikat błędu CorelDRAW bez technicznego ogona', () => {
    for (const c of G.cdrMessage) expect(cdrMessage(c.t), String(c.t)).toBe(c.out);
  });
  it('lista plików ukrytych przed przeglądarką', () => {
    for (const c of G.privatePaths) expect(isPrivatePath(c.p), c.p).toBe(c.out);
  });
});

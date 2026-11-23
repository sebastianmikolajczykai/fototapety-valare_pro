import { describe, expect, it } from 'vitest';
import { Auth, SESSION_COOKIE } from '../../../src/server/auth';
import { fakeReq, fakeRes } from '../../support/http';

const PASSWORD = 'haslo-testowe';
const T0 = Date.UTC(2026, 10, 23, 9);
const make = (password = PASSWORD, now = () => T0) => new Auth({ password, now });

async function call(
  a: Auth,
  method: string,
  url: string,
  body = '',
  headers: Record<string, string> = {},
  ip?: string,
) {
  const r = fakeRes();
  let login = false;
  const handled = await a.handle(fakeReq(method, url, body, headers, ip), r.res, url, () => {
    login = true;
  });
  return { ...r, handled, login };
}
const creds = (email = 'Test@Valare.pl ', password = PASSWORD) => JSON.stringify({ email, password });
async function loginCookie(a: Auth, headers: Record<string, string> = {}) {
  const r = await call(a, 'POST', '/api/login', creds(), headers);
  return String(r.headers()['Set-Cookie']);
}

describe('logowanie wyłączone (brak APP_PASSWORD)', () => {
  it('strona otwarta, /api/me mówi że logowanie niepotrzebne, żadne hasło nie pasuje', async () => {
    const a = make('');
    expect(a.enabled).toBe(false);
    expect((await call(a, 'GET', '/')).handled).toBe(false);
    expect((await call(a, 'GET', '/api/me')).json()).toEqual({ ok: true, loginRequired: false, email: null });
    expect((await call(a, 'POST', '/api/login', creds('a@b.pl', ''))).status()).toBe(401);
  });
});

describe('logowanie włączone', () => {
  it('bez sesji: strona = ekran logowania, API = 401, pliki i otwarte API przechodzą dalej', async () => {
    const a = make();
    const page = await call(a, 'GET', '/');
    expect([page.handled, page.login]).toEqual([true, true]);
    expect((await call(a, 'GET', '/bryty.html')).login).toBe(true);
    const api = await call(a, 'POST', '/api/ai/generate', '{}');
    expect([api.status(), api.json()]).toEqual([401, { ok: false, error: 'Zaloguj się ponownie.' }]);
    expect((await call(a, 'GET', '/bryty.js')).handled).toBe(false);
    expect((await call(a, 'GET', '/api/health')).handled).toBe(false);
  });
  it('błędne dane 400, zły e-mail 400, złe hasło 401, dobre 200 + ciasteczko na 14 dni', async () => {
    const a = make();
    expect((await call(a, 'POST', '/api/login', '{nie-json')).status()).toBe(400);
    expect((await call(a, 'POST', '/api/login', 'x'.repeat(20000))).json()).toEqual({
      ok: false,
      error: 'Niepoprawne dane.',
    });
    expect((await call(a, 'POST', '/api/login', creds('zly'))).json().error).toBe('Wpisz poprawny adres e-mail.');
    expect((await call(a, 'POST', '/api/login', creds('a@b.pl', 'zle'))).json()).toEqual({
      ok: false,
      error: 'Nieprawidłowe hasło.',
    });
    const ok = await call(a, 'POST', '/api/login', creds());
    expect([ok.status(), ok.json()]).toEqual([200, { ok: true, email: 'test@valare.pl' }]);
    const c = String(ok.headers()['Set-Cookie']);
    expect(c).toMatch(
      new RegExp(`^${SESSION_COOKIE}=[\\w-]+\\.[\\w-]+; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600$`),
    );
  });
  it('Secure za proxy https; sesja otwiera stronę i API; /api/me zna adres; wylogowanie kasuje ciasteczko', async () => {
    const a = make();
    const c = await loginCookie(a, { 'x-forwarded-proto': 'https, http' });
    expect(c).toMatch(/; Secure$/);
    const cookie = c.split(';')[0]!;
    expect((await call(a, 'GET', '/', '', { cookie })).handled).toBe(false);
    expect((await call(a, 'POST', '/api/ai/generate', '{}', { cookie: `x=1; ${cookie}` })).handled).toBe(false);
    expect((await call(a, 'GET', '/api/me', '', { cookie })).json()).toEqual({
      ok: true,
      loginRequired: true,
      email: 'test@valare.pl',
    });
    const out = await call(a, 'GET', '/api/logout');
    expect(out.headers()['Set-Cookie']).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  });
  it('sesja wygasa po 14 dniach; zmiana hasła wylogowuje; sfałszowane ciasteczka nie działają', async () => {
    let now = T0;
    const a = make(PASSWORD, () => now);
    const cookie = (await loginCookie(a)).split(';')[0]!;
    now = T0 + 14 * 864e5 - 1;
    expect((await call(a, 'GET', '/', '', { cookie })).login).toBe(false);
    now = T0 + 14 * 864e5;
    expect((await call(a, 'GET', '/', '', { cookie })).login).toBe(true);
    expect((await call(make('inne'), 'GET', '/', '', { cookie })).login).toBe(true);
    const fake = Buffer.from(JSON.stringify({ e: 'x@y.pl', exp: 9e15 })).toString('base64url');
    for (const v of ['abc.def', '%zz', '.', 'x'.repeat(5000), `${fake}.abc`, cookie.split('=')[1]!.split('.')[0]])
      expect((await call(a, 'GET', '/', '', { cookie: `${SESSION_COOKIE}=${v}` })).login, v).toBe(true);
  });
  it('podpis poprawny, ale treść bez adresu albo nie JSON → brak sesji', async () => {
    const a = make();
    for (const payload of [JSON.stringify({ exp: 9e15 }), 'nie-json']) {
      const p = Buffer.from(payload).toString('base64url');
      expect((await call(a, 'GET', '/', '', { cookie: `${SESSION_COOKIE}=${p}.${a.sign(p)}` })).login).toBe(true);
    }
  });
  it('10 nieudanych prób z jednego adresu w 15 min → 429; inny adres działa; po 15 min znowu można', async () => {
    let now = T0;
    const a = make(PASSWORD, () => now);
    const bad = creds('a@b.pl', 'zle');
    for (let i = 0; i < 10; i++) await call(a, 'POST', '/api/login', bad, { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });
    const r = await call(a, 'POST', '/api/login', creds(), { 'x-forwarded-for': '9.9.9.9, 2.2.2.2' });
    expect([r.status(), r.json().error]).toEqual([429, 'Za dużo prób. Spróbuj za 15 minut.']);
    expect((await call(a, 'POST', '/api/login', creds(), {}, '3.3.3.3')).status()).toBe(200);
    now += 15 * 60 * 1000;
    expect((await call(a, 'POST', '/api/login', creds(), { 'x-forwarded-for': '2.2.2.2' })).status()).toBe(200);
  });
  it('pamięć prób ograniczona do 10 000 adresów (najpierw przeterminowane)', async () => {
    let now = T0;
    const a = make(PASSWORD, () => now);
    const bad = creds('a@b.pl', 'zle');
    for (let i = 0; i < 10001; i++)
      await call(a, 'POST', '/api/login', bad, {}, `10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`);
    expect(a.trackedAddresses).toBe(0);
    for (let i = 0; i < 5000; i++) await call(a, 'POST', '/api/login', bad, {}, `11.0.${i >> 8}.${i & 255}`);
    now += 16 * 60 * 1000;
    for (let i = 0; i < 5001; i++) await call(a, 'POST', '/api/login', bad, {}, `12.0.${i >> 8}.${i & 255}`);
    expect(a.trackedAddresses).toBe(5001);
  });
});

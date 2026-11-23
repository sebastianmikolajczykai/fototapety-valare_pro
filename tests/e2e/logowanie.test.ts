// Formularz logowania (serwer „w internecie”: PORT i hasło aplikacji) – stary vs nowy program.
// Hasło to wartość wyłącznie testowa, ustawiana tylko dla serwerów uruchamianych w tym teście.
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launch, OLD_REPO, openPage, startServer, type RunningServer } from './support';

const TEST_PASSWORD = 'haslo-tylko-do-testow';
const enabled = !!OLD_REPO;
let browser: Browser;
const side: Record<'old' | 'new', { server: RunningServer; page: Page; errors: string[] }> = {} as never;

/** Wpisanie danych i klik „Zaloguj”; wynik: komunikat, jego klasa i stan przycisku. */
async function login(page: Page, email: string, password: string): Promise<unknown> {
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('#go');
  await page.waitForFunction(() => {
    const go = document.getElementById('go') as HTMLButtonElement | null;
    return !go || !go.disabled;
  });
  return page.evaluate(() => {
    const msg = document.getElementById('msg');
    const go = document.getElementById('go') as HTMLButtonElement | null;
    return { msg: msg?.textContent, cls: msg?.className, go: go?.disabled, title: document.title };
  });
}

beforeAll(async () => {
  if (!enabled) return;
  browser = await launch();
  for (const [kind, base] of [
    ['old', 3700],
    ['new', 3750],
  ] as const) {
    const port = base + Math.floor(Math.random() * 40);
    const server = await startServer(kind, port, {
      PORT: String(port),
      APP_PASSWORD: TEST_PASSWORD,
      SESSION_SECRET: 'sekret-tylko-do-testow',
    });
    const errors: string[] = [];
    const page = await openPage(browser, server.url, errors);
    side[kind] = { server, page, errors };
  }
});
afterAll(async () => {
  await browser?.close();
  for (const s of Object.values(side)) s.server.stop();
});

describe.skipIf(!enabled)('logowanie: stary vs nowy program', () => {
  const both = async (f: (page: Page) => Promise<unknown>): Promise<void> => {
    const out: Record<string, unknown> = {};
    for (const kind of ['old', 'new'] as const) out[kind] = await f(side[kind].page);
    expect(out.new).toEqual(out.old);
  };
  it('strona logowania zamiast konfiguratora', () =>
    both(p => p.evaluate(() => [document.title, document.body.innerHTML])));
  it('niepoprawny e-mail', () => both(p => login(p, 'abc', 'x')));
  it('złe hasło', () => both(p => login(p, 'jan@example.com', 'zle')));
  it('brak połączenia z serwerem', () =>
    both(async p => {
      await p.route('**/api/login', r => r.abort());
      const r = await login(p, 'jan@example.com', TEST_PASSWORD);
      await p.unroute('**/api/login');
      return r;
    }));
  it('poprawne hasło – strona przeładowuje się na konfigurator', () =>
    both(async p => {
      await p.fill('#email', 'jan@example.com');
      await p.fill('#password', TEST_PASSWORD);
      await Promise.all([p.waitForNavigation(), p.click('#go')]);
      await p.waitForSelector('#wallW');
      return p.evaluate(() => [document.title, location.pathname, !!document.getElementById('wallW')]);
    }));
  it('brak błędów JavaScript', () => {
    expect(side.new.errors).toEqual(side.old.errors);
  });
});

import { describe, expect, it } from 'vitest';
import { systemDeps } from '../../../src/server/ai/upscale';
import { localSystem } from '../../../src/server/ai/upscale-local';
import { pipeBody, send } from '../../../src/server/respond';
import { fakeRes } from '../../support/http';

describe('odpowiedzi serwera', () => {
  it('tekst z typem; gdy odpowiedź już leci – zamknięcie połączenia zamiast drugiego nagłówka', () => {
    const r = fakeRes();
    send(r.res, 404, 'Nie znaleziono.');
    expect([r.status(), r.headers()['Content-Type'], r.text()]).toEqual([
      404,
      'text/plain; charset=utf-8',
      'Nie znaleziono.',
    ]);
    const s = fakeRes();
    s.res.writeHead(200);
    send(s.res, 500, 'Błąd');
    expect([s.status(), s.res.destroyed]).toEqual([200, true]);
  });
  it('strumień z fetch do przeglądarki; zerwany transfer zamyka połączenie', async () => {
    const r = fakeRes();
    await pipeBody(new Response('abc').body!, r.res);
    expect(r.text()).toBe('abc');
    const broken = new ReadableStream<Uint8Array>({
      pull: c => c.error(new Error('zerwane')),
    });
    const b = fakeRes();
    await pipeBody(broken, b.res);
    expect(b.res.destroyed).toBe(true);
  });
});

describe('zależności produkcyjne', () => {
  it('systemDeps: zmienne procesu, zegar, czekanie, log', async () => {
    const d = systemDeps();
    expect(d.env).toBe(process.env);
    expect(Math.abs(d.now() - Date.now())).toBeLessThan(1000);
    await d.sleep(1);
    expect(typeof d.fetch).toBe('function');
    expect(typeof d.log).toBe('function');
  });
  it('localSystem uruchamia program w folderze narzędzi; błąd = ostatnie linie wyjścia', async () => {
    const s = localSystem(process.cwd());
    expect(s.platform).toBe(process.platform);
    expect(s.exists('package.json')).toBe(true);
    await s.run(process.execPath, ['-e', '']);
    await expect(
      s.run(process.execPath, ['-e', 'console.error("a\\nb\\nc\\nd\\ne"); process.exit(1)']),
    ).rejects.toThrow('b c d e');
  });
});

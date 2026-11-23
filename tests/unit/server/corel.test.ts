// Zapis .cdr przez CorelDRAW na atrapie PowerShella (Corel nie jest uruchamiany; na Linuksie i tak 501).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cdrRequestParts, type CdrJob } from '../../../src/output/cdr-job';
import { CorelExporter, type PowerShellResult } from '../../../src/server/corel';
import { send } from '../../../src/server/respond';
import { concat, enc } from '../../support/bytes';
import { fakeReq, fakeRes } from '../../support/http';

const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
const dir = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'corel-test-'));
  tmp.push(d);
  return d;
};

const job = (o: Partial<CdrJob> = {}): CdrJob => ({
  name: 'bryty_Kowalski.cdr',
  unit: 'cm',
  link: false,
  pageW: 100,
  pageH: 50,
  ops: [{ t: 'img', file: 'bryt_1.jpg', x: 0, y: 0, w: 1, h: 1 } as never],
  files: [{ name: 'bryt_1.jpg', size: 3 }],
  ...o,
});
const body = (j: CdrJob, data = enc('JPG')): Buffer => Buffer.from(concat(cdrRequestParts(j, [data])));

function exporter(o: { platform?: NodeJS.Platform; fail?: string; registry?: string; noFile?: boolean } = {}) {
  const calls: string[][] = [];
  const logs: string[] = [];
  const results = path.join(dir(), 'wyniki');
  const seen: { files: string[]; manifest?: unknown }[] = [];
  const e = new CorelExporter({
    platform: o.platform ?? 'win32',
    script: 'C:\\app\\zapisz-cdr.ps1',
    resultsDir: results,
    tmpDir: dir(),
    log: (...a: unknown[]) => void logs.push(a.join(' ')),
    powershell: async (args): Promise<PowerShellResult> => {
      calls.push(args);
      if (args[0] === '-Command') return { err: null, out: (o.registry ?? 'tak') + '\r\n', errText: '' };
      const d = args[args.indexOf('-Dir') + 1]!;
      seen.push({
        files: fs.readdirSync(d).sort(),
        manifest: JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')),
      });
      if (o.fail) return { err: new Error('exit 1'), out: '', errText: o.fail };
      if (!o.noFile) fs.writeFileSync(path.join(d, 'wynik.cdr'), 'CDR-DANE');
      return { err: null, out: '', errText: '' };
    },
  });
  return { e, calls, logs, results, seen };
}

async function post(e: CorelExporter, data: Buffer, headers: Record<string, string> = {}) {
  const r = fakeRes();
  await e.handle(fakeReq('POST', '/api/cdr', data, headers), r.res, send);
  return r;
}

describe('CorelDRAW zainstalowany?', () => {
  it('poza Windows: nie (bez uruchamiania PowerShella); na Windows: wpis w rejestrze, sprawdzany raz', async () => {
    const lin = exporter({ platform: 'linux' });
    expect(await lin.e.installed()).toBe(false);
    expect(lin.calls).toHaveLength(0);
    const win = exporter();
    expect(await win.e.installed()).toBe(true);
    expect(await win.e.installed()).toBe(true);
    expect(win.calls).toHaveLength(1);
    expect(win.calls[0]![1]).toContain('CorelDRAW.Application');
    expect(await exporter({ registry: 'nie' }).e.installed()).toBe(false);
  });
});

describe('zapis .cdr', () => {
  it('poza Windows 501 z prośbą o PDF', async () => {
    const r = await post(exporter({ platform: 'linux' }).e, body(job()));
    expect([r.status(), r.text()]).toEqual([501, 'Zapis .cdr działa tylko na komputerze z CorelDRAW. Pobierz PDF.']);
  });
  it('pliki i opis arkusza do folderu tymczasowego, skrypt PowerShell, plik .cdr do przeglądarki, folder usunięty', async () => {
    const { e, calls, seen, logs } = exporter();
    const r = await post(e, body(job()));
    expect(calls[0]).toEqual(['-File', 'C:\\app\\zapisz-cdr.ps1', '-Dir', expect.any(String)]);
    expect(seen[0]!.files).toEqual(['bryt_1.jpg', 'manifest.json']);
    expect(seen[0]!.manifest).toEqual(JSON.parse(JSON.stringify(job())));
    expect([r.status(), r.headers()['Content-Type'], r.headers()['Content-Length'], r.text()]).toEqual([
      200,
      'application/octet-stream',
      8,
      'CDR-DANE',
    ]);
    expect(fs.existsSync(calls[0]![3]!)).toBe(false);
    expect(logs.at(-1)).toMatch(/^Zapisano bryty_Kowalski\.cdr \(0\.0 MB\) w 0 s$/);
  });
  it('tryb link: folder w wyniki/ zostaje (JPG + .cdr pod nazwą zlecenia), nagłówek X-Folder; drugi raz → nazwa_2', async () => {
    const { e, results } = exporter();
    const r = await post(e, body(job({ link: true, name: 'bryty_Żółw ąę/..\\x.cdr' })));
    const d = path.join(results, 'bryty_Żółw_ąę_.._x');
    expect(r.headers()['X-Folder']).toBe(encodeURIComponent(d));
    expect(fs.readdirSync(d).sort()).toEqual(['bryt_1.jpg', 'bryty_Żółw_ąę_.._x.cdr']);
    await post(e, body(job({ link: true, name: 'bryty_Żółw ąę/..\\x.cdr' })));
    expect(fs.existsSync(d + '_2')).toBe(true);
    await post(e, body(job({ link: true, name: '.cdr' })));
    expect(fs.existsSync(path.join(results, 'bryty'))).toBe(true);
  });
  it('błąd Corela: komunikat bez technicznego ogona (500), pełny w logu; brak pliku → komunikat domyślny', async () => {
    const f = exporter({ fail: 'Brak licencji\r\nAt C:\\app\\zapisz-cdr.ps1:21 char:5\r\n+ CategoryInfo' });
    const r = await post(f.e, body(job()));
    expect([r.status(), r.text()]).toEqual([500, 'Brak licencji']);
    expect(f.logs[0]).toContain('Błąd CorelDRAW:');
    const n = await post(exporter({ noFile: true }).e, body(job()));
    expect([n.status(), n.text()]).toEqual([500, 'CorelDRAW nie zapisał pliku.']);
  });
  it('złe dane 400 (przed zapisem na dysk); za dużo danych 413; jeden plik naraz 409', async () => {
    const { e, calls } = exporter();
    const bad = await post(e, Buffer.from('x'));
    expect([bad.status(), bad.text()]).toEqual([400, 'Niekompletne dane z przeglądarki.']);
    expect(calls).toHaveLength(0);
    const big = await post(e, body(job()), { 'content-length': String(4 * 1024 ** 3) });
    expect([big.status(), big.text()]).toEqual([413, 'Za dużo danych dla CorelDRAW (limit 3 GB).']);
    let release!: () => void;
    const gate = new Promise<void>(ok => (release = ok));
    const slow = new CorelExporter({
      platform: 'win32',
      script: 's.ps1',
      resultsDir: dir(),
      tmpDir: dir(),
      log: () => {},
      powershell: async () => (await gate, { err: null, out: '', errText: '' }),
    });
    const first = post(slow, body(job()));
    await new Promise(ok => setTimeout(ok, 20));
    const second = await post(slow, body(job()));
    expect([second.status(), second.text()]).toEqual([409, 'CorelDRAW tworzy już inny plik. Spróbuj za chwilę.']);
    release();
    expect((await first).status()).toBe(500);
    expect((await post(slow, Buffer.from('x'))).status()).toBe(400);
  });
  it('strumień ponad limit: połączenie zamknięte bez odpowiedzi', async () => {
    const e = new CorelExporter({
      platform: 'win32',
      script: 's.ps1',
      resultsDir: dir(),
      tmpDir: dir(),
      log: () => {},
      maxBytes: 10,
      powershell: async () => ({ err: null, out: '', errText: '' }),
    });
    const r = fakeRes();
    const req = fakeReq('POST', '/api/cdr', Buffer.alloc(20));
    await e.handle(req, r.res, send);
    expect([r.status(), req.destroyed]).toEqual([0, true]);
  });
});

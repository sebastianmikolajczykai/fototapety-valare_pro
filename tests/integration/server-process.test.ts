// Zbudowany serwer (npm run build → dist/server/main.js) uruchomiony jako osobny proces – jak w starym
// testy/serwer.test.js: zepsute adresy nie wyłączają procesu. Bez kluczy AI.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 3900 + Math.floor(Math.random() * 90);
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fototapety-proc-'));
fs.writeFileSync(path.join(ROOT, 'logowanie.html'), 'logowanie');
let proc: ChildProcess;
let log = '';
let exitCode: number | null = null;

const get = (url: string): Promise<{ status: number; text: string }> =>
  new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: url }, res => {
        let t = '';
        res.on('data', c => (t += c));
        res.on('end', () => resolve({ status: res.statusCode!, text: t }));
      })
      .on('error', reject);
  });

beforeAll(async () => {
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const env = { PATH: process.env.PATH, PORT: String(PORT), APP_PASSWORD: 'haslo', PUBLIC_DIR: ROOT };
  proc = spawn(process.execPath, ['dist/server/main.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout!.on('data', d => (log += d));
  proc.stderr!.on('data', d => (log += d));
  proc.on('exit', c => (exitCode = c));
  for (let i = 0; i < 50; i++) {
    try {
      await get('/api/health');
      return;
    } catch {
      await new Promise(ok => setTimeout(ok, 100));
    }
  }
  throw new Error('Serwer nie wystartował:\n' + log);
});
afterAll(() => {
  proc?.kill();
  fs.rmSync(ROOT, { recursive: true, force: true });
});

describe('zbudowany serwer jako proces', () => {
  it('startuje na 0.0.0.0:PORT, skrypt Corela obok, health, zepsute adresy → 400, proces działa', async () => {
    expect(log).toContain(`http://0.0.0.0:${PORT}`);
    expect(fs.existsSync('dist/server/zapisz-cdr.ps1')).toBe(true);
    expect(JSON.parse((await get('/api/health')).text).ok).toBe(true);
    for (const u of ['/%E0%A4%A', '/%', '/%zz']) expect((await get(u)).status).toBe(400);
    expect((await get('/')).text).toBe('logowanie');
    expect(exitCode).toBeNull();
    expect(log).not.toMatch(/URIError|Nieobsłużony błąd|Błąd GET/);
  });
});

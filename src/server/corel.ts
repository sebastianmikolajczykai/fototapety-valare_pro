// Zapis pliku .cdr przez CorelDRAW zainstalowany na komputerze z serwerem (PowerShell + COM, skrypt zapisz-cdr.ps1)
// – odpowiednik makeCdr / corelInstalled / resultDir ze starego serwer-fototapety.js. Tylko Windows z licencjonowanym
// Corelem; gdzie indziej 501 i strona daje PDF. PowerShell wstrzykiwany – testy działają na atrapie.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { CdrJobError, parseCdrJob } from '../output/cdr-job';
import type { Send } from './respond';
import { cdrMessage } from './security';

export interface PowerShellResult {
  err: Error | null;
  out: string;
  errText: string;
}

export interface CorelOptions {
  platform: NodeJS.Platform;
  /** Ścieżka zapisz-cdr.ps1. */
  script: string;
  /** Folder wyników trybu „link” (JPG + .cdr zostają na stałe; serwer ich nie podaje). */
  resultsDir: string;
  /** Folder na pliki tymczasowe. */
  tmpDir: string;
  log: (...a: unknown[]) => void;
  powershell: (args: string[], timeoutMs: number) => Promise<PowerShellResult>;
  /** Limit danych (bryty 1:1 + podgląd), domyślnie 3 GB. */
  maxBytes?: number;
}

const COREL_TIMEOUT_MS = 15 * 60 * 1000;
const CDR_MAX_BYTES = 3 * 1024 ** 3;

/** PowerShell systemu (Windows). */
export const systemPowerShell = (args: string[], timeout: number): Promise<PowerShellResult> =>
  new Promise(resolve =>
    execFile(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args],
      { timeout, windowsHide: true, maxBuffer: 16 << 20 },
      (err, stdout, stderr) => resolve({ err, out: String(stdout || ''), errText: String(stderr || '') }),
    ),
  );

export class CorelExporter {
  private checked: boolean | null = null;
  private busy = false;

  constructor(private readonly o: CorelOptions) {}

  /** CorelDRAW zainstalowany (wpis COM w rejestrze); sprawdzane raz. */
  async installed(): Promise<boolean> {
    if (this.o.platform !== 'win32') return false;
    if (this.checked === null) {
      const r = await this.o.powershell(
        ['-Command', "if (Test-Path 'Registry::HKEY_CLASSES_ROOT\\CorelDRAW.Application') { 'tak' } else { 'nie' }"],
        30000,
      );
      this.checked = r.out.trim() === 'tak';
    }
    return this.checked;
  }

  /** Nowy folder w wyniki/ na zlecenie; istniejącego nie nadpisujemy (stary .cdr linkuje do swoich JPG). */
  private resultDir(name: string): { dir: string; base: string } {
    const base =
      String(name || 'bryty')
        .replace(/\.cdr$/i, '')
        .replace(/[^\p{L}\p{N}._-]+/gu, '_')
        .slice(0, 80) || 'bryty';
    fs.mkdirSync(this.o.resultsDir, { recursive: true });
    for (let i = 1; ; i++) {
      const dir = path.join(this.o.resultsDir, i === 1 ? base : `${base}_${i}`);
      try {
        fs.mkdirSync(dir);
        return { dir, base };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse, send: Send): Promise<void> {
    const { o } = this;
    const max = o.maxBytes ?? CDR_MAX_BYTES;
    if (o.platform !== 'win32')
      return send(res, 501, 'Zapis .cdr działa tylko na komputerze z CorelDRAW. Pobierz PDF.');
    if (this.busy) return send(res, 409, 'CorelDRAW tworzy już inny plik. Spróbuj za chwilę.');
    this.busy = true;
    let dir: string | null = null;
    let keep = false;
    try {
      if (Number(req.headers['content-length']) > max)
        return send(res, 413, 'Za dużo danych dla CorelDRAW (limit 3 GB).');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req as AsyncIterable<Buffer>) {
        size += c.length;
        if (size > max) {
          req.destroy();
          return;
        }
        chunks.push(c);
      }
      const body = Buffer.concat(chunks);
      const job = parseCdrJob(body);
      let base: string | null = null;
      if (job.link) ({ dir, base } = this.resultDir(job.name));
      else dir = fs.mkdtempSync(path.join(o.tmpDir, 'fototapety-cdr-'));
      let off = job.dataStart;
      for (const f of job.files) {
        fs.writeFileSync(path.join(dir, f.name), body.subarray(off, off + f.size));
        off += f.size;
      }
      const { dataStart: _d, ...manifest } = job;
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
      const t0 = Date.now();
      const r = await o.powershell(['-File', o.script, '-Dir', dir], COREL_TIMEOUT_MS);
      const out = path.join(dir, 'wynik.cdr');
      if (r.err || !fs.existsSync(out)) {
        // Stary serwer przy braku pliku bez błędu procesu pokazywał „null” – tu komunikat domyślny.
        const full = (r.errText || r.out || (r.err ? String(r.err) : '')).trim();
        o.log('Błąd CorelDRAW:\n' + full.split('\n').slice(-8).join('\n'));
        return send(res, 500, cdrMessage(full) || 'CorelDRAW nie zapisał pliku.');
      }
      let file = out;
      const headers: Record<string, string | number> = { 'Content-Type': 'application/octet-stream' };
      if (base !== null) {
        file = path.join(dir, base + '.cdr');
        fs.renameSync(out, file);
        fs.rmSync(path.join(dir, 'manifest.json'), { force: true });
        headers['X-Folder'] = encodeURIComponent(dir);
        keep = true;
      }
      const data = fs.readFileSync(file);
      o.log(
        `Zapisano ${job.name} (${(data.length / 1e6).toFixed(1)} MB) w ${((Date.now() - t0) / 1000).toFixed(0)} s` +
          (base !== null ? ` – folder ${dir}` : ''),
      );
      headers['Content-Length'] = data.length;
      res.writeHead(200, headers);
      res.end(data);
    } catch (e) {
      send(res, e instanceof CdrJobError ? e.status : 500, (e as Error).message);
    } finally {
      this.busy = false;
      if (dir && !keep)
        try {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
        } catch (e) {
          o.log('Nie usunięto folderu tymczasowego:', dir, (e as NodeJS.ErrnoException).code);
        }
    }
  }
}

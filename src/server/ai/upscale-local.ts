// Darmowe powiększanie na komputerze z serwerem: Real-ESRGAN (realesrgan-ncnn-vulkan, karta graficzna przez Vulkan) –
// odpowiednik starego ai-powieksz-lokalny.js. Wersja do pokazania (bez konta i opłat); tylko Windows (zmiana rozmiaru
// przez PowerShell). Program: narzedzia/realesrgan/realesrgan-ncnn-vulkan.exe (źródło: github.com/xinntao/Real-ESRGAN,
// v0.2.5.0). Przebieg: ×4 → (jeśli trzeba więcej) zmniejszenie do 1/4 celu → drugi raz ×4 → plik do przeglądarki.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Send } from '../respond';
import { MAX_SIDE, pngSize, type AiDeps, type UpscaleRequest, type Upscaler } from './upscale';

const TIMEOUT_MS = 60 * 60 * 1000;

/** Dostęp do systemu (wstrzykiwany w testach). */
export interface LocalSystem {
  platform: NodeJS.Platform;
  toolsDir: string;
  exists: (file: string) => boolean;
  /** Uruchamia program; błąd = ostatnie linie wyjścia programu. */
  run: (file: string, args: string[]) => Promise<void>;
}

/** System produkcyjny: program w folderze narzędzi, uruchamiany z tego folderu (modele leżą obok). */
export function localSystem(toolsDir: string): LocalSystem {
  return {
    platform: process.platform,
    toolsDir,
    exists: f => fs.existsSync(f),
    run: (file, args) =>
      new Promise((ok, fail) =>
        execFile(
          file,
          args,
          { cwd: toolsDir, timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 16 << 20 },
          (err, out, errOut) =>
            err
              ? fail(
                  new Error(
                    String(errOut || out || err)
                      .trim()
                      .split('\n')
                      .slice(-4)
                      .join(' '),
                  ),
                )
              : ok(),
        ),
      ),
  };
}

export class LocalUpscaler implements Upscaler {
  private busy = false;

  constructor(
    private readonly d: AiDeps,
    private readonly sys: LocalSystem,
  ) {}

  /** Ścieżka w apostrofach PowerShella: apostrof podwojony (np. folder „O'Brien”). */
  static psPath(s: string): string {
    return "'" + s.replace(/'/g, "''") + "'";
  }

  private get exe(): string {
    return path.join(this.sys.toolsDir, 'realesrgan-ncnn-vulkan.exe');
  }

  ready(): boolean {
    return this.sys.platform === 'win32' && this.sys.exists(this.exe);
  }

  private esrgan(inp: string, out: string, fmt: string): Promise<void> {
    const model = this.d.env.REALESRGAN_MODEL || 'realesrgan-x4plus';
    // Mniejsze kafelki: przy domyślnych zintegrowana karta Intel traci urządzenie i dół obrazu wychodzi pusty.
    const tile = this.d.env.REALESRGAN_TILE || '64';
    return this.sys.run(this.exe, ['-i', inp, '-o', out, '-n', model, '-s', '4', '-t', tile, '-f', fmt]);
  }

  /** Zmiana rozmiaru w PowerShell (System.Drawing, dwusześcienna), 24 bity bez przezroczystości. */
  private resize(inp: string, out: string, w0: number, h0: number): Promise<void> {
    const w = Math.max(1, Math.round(w0) || 1);
    const h = Math.max(1, Math.round(h0) || 1);
    const P = LocalUpscaler.psPath;
    const ps =
      `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile(${P(inp)}); ` +
      `$b=New-Object System.Drawing.Bitmap ${w},${h},([System.Drawing.Imaging.PixelFormat]::Format24bppRgb);$g=[System.Drawing.Graphics]::FromImage($b); ` +
      `$g.InterpolationMode='HighQualityBicubic'; $g.PixelOffsetMode='HighQuality'; $g.DrawImage($s,0,0,${w},${h}); ` +
      `$b.Save(${P(out)},[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    return this.sys.run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
  }

  async handle(p: UpscaleRequest, res: ServerResponse, send: Send): Promise<void> {
    if (!this.ready()) return send(res, 503, 'Brak programu Real-ESRGAN w prototyp/narzedzia/realesrgan.');
    if (this.busy) return send(res, 409, 'Trwa już inne powiększanie. Spróbuj za chwilę.');
    const m = /^data:image\/png;base64,(.+)$/.exec(p.source || '');
    if (!m) return send(res, 400, 'Brak obrazu PNG do powiększenia.');
    const buf = Buffer.from(m[1]!, 'base64');
    const src = pngSize(buf);
    if (!src || !p.targetPx) return send(res, 400, 'Brak wymiarów obrazu lub wymiaru druku.');
    // Skala tak, by pokryć cały wymiar druku, maks. 32 000 px na bok.
    const s = Math.min(Math.max(p.targetPx.w / src.w, p.targetPx.h / src.h), MAX_SIDE / src.w, MAX_SIDE / src.h);
    this.busy = true;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fototapety-esrgan-'));
    const t0 = this.d.now();
    try {
      const inp = path.join(tmp, 'wejscie.png');
      const x4 = path.join(tmp, 'x4.png');
      fs.writeFileSync(inp, buf);
      let out: string;
      let w: number;
      let h: number;
      await this.esrgan(inp, x4, 'png');
      if (s <= 4) {
        // jeden przebieg ×4, potem zmniejszenie do celu
        w = Math.round(src.w * s);
        h = Math.round(src.h * s);
        out = path.join(tmp, 'wynik.png');
        await this.resize(x4, out, w, h);
      } else {
        // ×4, zmniejszenie do 1/4 celu, drugi raz ×4
        const w2 = Math.round((src.w * s) / 4);
        const h2 = Math.round((src.h * s) / 4);
        await this.resize(x4, path.join(tmp, 'posrednie.png'), w2, h2);
        out = path.join(tmp, 'wynik.jpg');
        await this.esrgan(path.join(tmp, 'posrednie.png'), out, 'jpg');
        w = w2 * 4;
        h = h2 * 4;
      }
      const size = fs.statSync(out).size;
      this.d.log(
        `AI upscale (Real-ESRGAN, lokalnie): ${src.w}x${src.h} -> ${w}x${h} (${((w * h) / 1e6).toFixed(0)} MP), ${((this.d.now() - t0) / 1000).toFixed(0)} s`,
      );
      res.writeHead(200, {
        'Content-Type': out.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
        'Content-Length': size,
        'X-Width': w,
        'X-Height': h,
      });
      await new Promise<void>(ok =>
        fs
          .createReadStream(out)
          .on('close', ok)
          .on('error', () => {
            res.destroy();
            ok();
          })
          .pipe(res),
      );
    } catch (e) {
      this.d.log('Błąd Real-ESRGAN:', (e as Error).message);
      send(res, 500, 'Real-ESRGAN: ' + (e as Error).message);
    } finally {
      this.busy = false;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

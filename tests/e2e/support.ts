// Wspólne dla testów e2e: uruchomienie serwera (nowego z dist/ albo starego z OLD_REPO), strona w Chromium,
// zdjęcie testowe, ustawienia formularza przez DOM i odczyt wygenerowanych plików (bez globalnych funkcji strony,
// żeby te same testy działały na starej stronie i na nowej w TypeScript).
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

export const FIXED_NOW = '2026-11-23T10:00:00+01:00';
export const OLD_REPO = process.env.OLD_REPO || '';

export interface RunningServer {
  url: string;
  stop: () => void;
  log: () => string;
}

const waitFor = async (url: string, log: () => string): Promise<void> => {
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise<boolean>(resolve =>
      http
        .get(url + '/api/health', r => {
          r.resume();
          resolve(r.statusCode === 200);
        })
        .on('error', () => resolve(false)),
    );
    if (ok) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Serwer nie wystartował:\n' + log());
};

/** Serwer lokalny (bez PORT): nowy = dist/server/main.js z public/, stary = serwer-fototapety.js z OLD_REPO. */
export async function startServer(kind: 'new' | 'old', port: number): Promise<RunningServer> {
  const file = kind === 'new' ? path.resolve('dist/server/main.js') : path.join(OLD_REPO, 'serwer-fototapety.js');
  const env = {
    PATH: process.env.PATH,
    LOCAL_PORT: String(port),
    ...(kind === 'new' ? { PUBLIC_DIR: path.resolve('dist/public') } : {}),
  };
  let out = '';
  const proc: ChildProcess = spawn(process.execPath, [file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout!.on('data', d => (out += d));
  proc.stderr!.on('data', d => (out += d));
  const url = `http://127.0.0.1:${port}`;
  await waitFor(url, () => out);
  return { url, stop: () => proc.kill(), log: () => out };
}

export async function openPage(browser: Browser, url: string, errors: string[]): Promise<Page> {
  // Własny kontekst (a nie browser.newPage), żeby można było otworzyć drugą kartę z tym samym localStorage.
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('konsola: ' + m.text()); // m.in. naruszenia CSP
  });
  await page.goto(url + '/');
  return page;
}

export const launch = (): Promise<Browser> => chromium.launch();

/** Zdjęcie testowe 6000×4000 (gradient + drobne paski o losowej jasności) wczytane do pola pliku. */
export async function loadTestImage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 6000;
    c.height = 4000;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 6000, 4000);
    gr.addColorStop(0, '#1b5e20');
    gr.addColorStop(0.5, '#fdd835');
    gr.addColorStop(1, '#0d47a1');
    g.fillStyle = gr;
    g.fillRect(0, 0, 6000, 4000);
    let seed = 7;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let x = 0; x < 6000; x += 6) {
      g.fillStyle = `rgba(0,0,0,${(rnd() * 0.6).toFixed(2)})`;
      g.fillRect(x, 0, 6, 4000);
    }
    const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.92));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'test.jpg', { type: 'image/jpeg' }));
    const f = document.getElementById('file') as HTMLInputElement;
    f.files = dt.files;
    f.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => !(document.getElementById('go') as HTMLButtonElement).disabled);
}

export interface FormSettings {
  /** Kod uruchamiany na stronie przed ustawieniem pól (np. dane sekcji „Ściana”, która nie jest widoczna). */
  script?: string;
  fields?: Record<string, string>;
  radios?: Record<string, string>;
  checks?: Record<string, boolean>;
  widths?: string[];
  /** Kliknięcia (selektory CSS) po ustawieniu pól – w DOM, więc działa też w zwiniętym kroku. */
  clicks?: string[];
  /** Klawisz na elemencie (np. Enter na karcie materiału). */
  keys?: { selector: string; key: string }[];
  /** Wpisanie tekstu jak użytkownik (zdarzenia „zaufane”, isTrusted). */
  type?: { selector: string; text: string };
  /** Przeciągnięcie myszą od środka elementu o (dx, dy) px. */
  drag?: { selector: string; dx: number; dy: number };
}

/** Ustawienia formularza przez DOM (zdarzenie input jak od użytkownika). */
export async function applySettings(page: Page, s: FormSettings): Promise<void> {
  if (s.script) await page.evaluate(s.script);
  await page.evaluate(s => {
    const fire = (e: Element, type = 'input'): boolean => e.dispatchEvent(new Event(type, { bubbles: true }));
    for (const [id, v] of Object.entries(s.fields ?? {})) {
      const e = document.getElementById(id) as HTMLInputElement;
      e.value = v;
      fire(e);
      fire(e, 'change');
    }
    for (const [n, v] of Object.entries(s.radios ?? {})) {
      const r = document.querySelector(`input[name=${n}][value=${v}]`) as HTMLInputElement;
      r.checked = true;
      fire(r);
      fire(r, 'change');
    }
    for (const [id, v] of Object.entries(s.checks ?? {})) {
      const e = document.getElementById(id) as HTMLInputElement;
      e.checked = v;
      fire(e);
      fire(e, 'change');
    }
    if (s.widths) {
      const ins = [...document.querySelectorAll('#widthsBox input')] as HTMLInputElement[];
      ins.forEach((el, i) => (el.value = s.widths![i] ?? ''));
      fire(document.getElementById('widthsBox')!);
    }
    for (const sel of s.clicks ?? []) (document.querySelector(sel) as HTMLElement).click();
    for (const k of s.keys ?? [])
      document
        .querySelector(k.selector)!
        .dispatchEvent(new KeyboardEvent('keydown', { key: k.key, bubbles: true, cancelable: true }));
  }, s);
  if (s.type) {
    // Pole w zwiniętym kroku nie jest widoczne – najpierw rozwijamy jego krok (jak użytkownik).
    await page.evaluate(sel => {
      const step = document.querySelector(sel)!.closest('.panel > .step');
      const steps = [...document.querySelectorAll('.panel > .step')].filter(x =>
        x.querySelector(':scope > .step-head'),
      );
      const K = (window as unknown as { Kroki?: { open(i: number): void } }).Kroki;
      if (step && K) K.open(steps.indexOf(step));
    }, s.type.selector);
    await page.locator(s.type.selector).fill(s.type.text);
  }
  if (s.drag) {
    const el = page.locator(s.drag.selector);
    await el.scrollIntoViewIfNeeded();
    const b = (await el.boundingBox())!;
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + s.drag.dx, y + s.drag.dy, { steps: 5 });
    await page.mouse.up();
  }
}

export interface GeneratedFile {
  name: string;
  size: number;
  sha256: string;
  /** Wymiar i DPI zapisane w JPG (tylko bryty). */
  w?: number;
  h?: number;
  dpi?: number | null;
}

export interface RunResult {
  msg: string;
  files: GeneratedFile[];
  /** Średnia różnica pikseli na wspólnej grafice sąsiednich brytów (ov = szerokość pasa w px). */
  diffs: number[];
}

/** Klik „Generuj bryty”, czekanie na wynik, odczyt plików z linków pobierania. ov = zakład w px (0 = bez porównania). */
export async function generate(page: Page, ov = 0): Promise<RunResult> {
  await page.evaluate(() => (document.getElementById('go') as HTMLButtonElement).click());
  await page.waitForFunction(() => /Gotowe|Błąd/.test(document.getElementById('msg')!.textContent ?? ''), null, {
    timeout: 300_000,
  });
  return page.evaluate(async ov => {
    const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    const links = [...document.querySelectorAll('#dl a')].map(a => ({
      name: a.getAttribute('download') ?? '',
      href: (a as HTMLAnchorElement).href,
    }));
    const files = [];
    const diffs: number[] = [];
    let prev: Uint8ClampedArray | null = null;
    for (const l of links) {
      const blob = await (await fetch(l.href)).blob();
      const buf = await blob.arrayBuffer();
      const f: Record<string, unknown> = {
        name: l.name,
        size: blob.size,
        sha256: hex(await crypto.subtle.digest('SHA-256', buf)),
      };
      if (/^bryt_.*\.jpg$/.test(l.name)) {
        const head = new Uint8Array(buf.slice(0, 18));
        const bm = await createImageBitmap(blob);
        Object.assign(f, { w: bm.width, h: bm.height, dpi: head[13] === 1 ? (head[14]! << 8) + head[15]! : null });
        if (ov > 0) {
          const strip = (x: number): Uint8ClampedArray => {
            const c = new OffscreenCanvas(ov, 2000);
            c.getContext('2d')!.drawImage(bm, x, 7000, ov, 2000, 0, 0, ov, 2000);
            return c.getContext('2d')!.getImageData(0, 0, ov, 2000).data;
          };
          const left = strip(0);
          if (prev) {
            let s = 0;
            for (let i = 0; i < left.length; i += 4)
              s +=
                Math.abs(left[i]! - prev[i]!) +
                Math.abs(left[i + 1]! - prev[i + 1]!) +
                Math.abs(left[i + 2]! - prev[i + 2]!);
            diffs.push(s / ((left.length / 4) * 3));
          }
          prev = strip(bm.width - ov);
        }
        bm.close();
      }
      files.push(f);
    }
    return { msg: document.getElementById('msg')!.textContent ?? '', files: files as never, diffs };
  }, ov);
}

/** Tekst widoczny na stronie (porównanie komunikatów, ostrzeżeń, wyceny). */
export const visibleText = (page: Page): Promise<string> => page.evaluate(() => document.body.innerText);

/** Cały HTML strony (także zwiniętych kroków); adresy blob: zastąpione stałym tekstem (są losowe). */
export const pageHtml = (page: Page): Promise<string> =>
  page.evaluate(() => document.body.innerHTML.replace(/blob:[^"')\s]+/g, 'blob:X'));

/** Skróty SHA-256 zawartości płócien strony (podgląd, fragment 1:1) – porównanie tego, co narysowane. */
export async function canvasHashes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const c of document.querySelectorAll('canvas')) {
      if (!c.id) continue;
      const data = new TextEncoder().encode(`${c.width}x${c.height}:` + c.toDataURL());
      const h = await crypto.subtle.digest('SHA-256', data);
      out[c.id] = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return out;
  });
}

/** Klik przycisku, czekanie na komunikat (done) i odczyt plików z linków: nazwa, rozmiar, SHA-256 (+ wymiar i DPI dla JPG). */
export async function clickAndCollect(
  page: Page,
  o: { button: string; msg: string; links: string; done: RegExp },
): Promise<{ msg: string; files: GeneratedFile[] }> {
  await page.evaluate(sel => (document.querySelector(sel) as HTMLButtonElement).click(), o.button);
  await page.waitForFunction(
    ([sel, re]) => new RegExp(re!).test(document.querySelector(sel!)!.textContent ?? ''),
    [o.msg, o.done.source],
    { timeout: 120_000 },
  );
  return page.evaluate(async o => {
    const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    const files: GeneratedFile[] = [];
    for (const a of document.querySelectorAll<HTMLAnchorElement>(o.links)) {
      const blob = await (await fetch(a.href)).blob();
      const buf = await blob.arrayBuffer();
      const f: GeneratedFile = {
        name: a.getAttribute('download') ?? '',
        size: blob.size,
        sha256: hex(await crypto.subtle.digest('SHA-256', buf)),
      };
      if (blob.type === 'image/jpeg') {
        const head = new Uint8Array(buf.slice(0, 18));
        const bm = await createImageBitmap(blob);
        Object.assign(f, { w: bm.width, h: bm.height, dpi: head[13] === 1 ? (head[14]! << 8) + head[15]! : null });
        bm.close();
      }
      files.push(f);
    }
    return { msg: document.querySelector(o.msg)!.textContent ?? '', files };
  }, o);
}

/** Klik „Generuj próbkę” i plik próbki. */
export const generateSample = (page: Page): Promise<{ msg: string; files: GeneratedFile[] }> =>
  clickAndCollect(page, { button: '#probkaGo', msg: '#probkaMsg', links: '#probkaDl a', done: /Gotowe|Błąd|Najpierw/ });

/** Klik „Schemat montażu dla klienta (PDF)” i plik schematu. */
export const generateAssembly = (page: Page): Promise<{ msg: string; files: GeneratedFile[] }> =>
  clickAndCollect(page, { button: '#montazGo', msg: '#montazMsg', links: '#montazMsg a', done: /MB|Błąd|Najpierw/ });

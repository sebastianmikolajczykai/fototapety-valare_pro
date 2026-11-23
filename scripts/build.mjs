/* global console */
// Budowa: serwer (dist/server/main.js + skrypt Corela) i strona (dist/public: pliki z public/ + skrypty
// przeglądarki z src/web/*.ts, każdy jako osobny plik o tej samej nazwie co dawny skrypt strony).
import { build } from 'esbuild';
import fs from 'node:fs';

await build({
  entryPoints: ['src/server/main.ts'],
  outfile: 'dist/server/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'warning',
});
fs.copyFileSync('src/server/zapisz-cdr.ps1', 'dist/server/zapisz-cdr.ps1');

fs.rmSync('dist/public', { recursive: true, force: true });
fs.cpSync('public', 'dist/public', { recursive: true });
const web = fs.readdirSync('src/web').filter(f => f.endsWith('.ts'));
for (const f of web)
  if (fs.existsSync(`public/${f.replace(/\.ts$/, '.js')}`))
    throw new Error(`public/${f.replace(/\.ts$/, '.js')} i src/web/${f} naraz – stary skrypt trzeba usunąć`);
await build({
  entryPoints: web.map(f => `src/web/${f}`),
  outdir: 'dist/public',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  logLevel: 'warning',
});
console.log(`Zbudowano dist/server/main.js i dist/public (${web.length} skryptów strony z TypeScript)`);

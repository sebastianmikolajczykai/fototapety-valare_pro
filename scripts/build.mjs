/* global console */
// Budowa serwera: jeden plik dist/server/main.js (esbuild) + skrypt Corela obok.
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
console.log('Zbudowano dist/server/main.js');

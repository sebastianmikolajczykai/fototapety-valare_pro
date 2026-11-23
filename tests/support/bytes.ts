// Pomocnicze: składanie części pliku (nagłówki + dane) w jeden ciąg bajtów.
export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

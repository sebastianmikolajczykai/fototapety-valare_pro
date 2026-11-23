// Minimalny ZIP bez kompresji (JPG i tak jest skompresowany) – odpowiednik makeZip ze starego bryty.js.
// Dane plików nie są kopiowane: zipParts zwraca nagłówki (bajty) przeplatane oryginalnymi danymi (np. Blob w
// przeglądarce), więc 30 brytów (ponad 1 GB) nie trafia w całości do pamięci JS.

/** Zwykły ZIP (bez ZIP64) ma limit 4 GB. */
export const ZIP_MAX_BYTES = 0xffffffff;

export interface ZipEntry<T> {
  name: string;
  /** Rozmiar danych w bajtach. */
  size: number;
  /** CRC-32 danych (Crc32). */
  crc: number;
  data: T;
}

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Suma kontrolna CRC-32 liczona kawałkami (plik PDF potrafi mieć setki MB). */
export class Crc32 {
  private c = 0xffffffff;

  update(u8: Uint8Array): this {
    let c = this.c;
    for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]!) & 255]! ^ (c >>> 8);
    this.c = c;
    return this;
  }

  digest(): number {
    return (this.c ^ 0xffffffff) >>> 0;
  }
}

/** Części archiwum w kolejności: [nagłówek, nazwa, dane]×n, [katalog, nazwa]×n, zakończenie. */
export function zipParts<T>(entries: readonly ZipEntry<T>[]): (Uint8Array | T)[] {
  const parts: (Uint8Array | T)[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const f of entries) {
    const name = new TextEncoder().encode(f.name);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint32(14, f.crc, true);
    h.setUint32(18, f.size, true);
    h.setUint32(22, f.size, true);
    h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, f.crc, true);
    c.setUint32(20, f.size, true);
    c.setUint32(24, f.size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.size;
  }
  const cSize = central.reduce((a, x) => a + x.byteLength, 0);
  if (off + cSize > ZIP_MAX_BYTES) throw new Error('ZIP ponad 4 GB – pobierz pliki pojedynczo.');
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, cSize, true);
  e.setUint32(16, off, true);
  return [...parts, ...central, new Uint8Array(e.buffer)];
}

// Zapis pliku PDF: obiekty i tabela xref – wspólne dla PDF produkcyjnego i schematu montażu (stare makePdf/buildPdf).
// Dane obrazów nie są kopiowane: wynik to części pliku (bajty + oryginalne dane, np. Blob w przeglądarce).

/** Obraz JPG do osadzenia: dane (bez kopiowania), rozmiar w bajtach, wymiar w px. */
export interface PdfImage<T> {
  data: T;
  size: number;
  w: number;
  h: number;
}

/** Część obiektu: tekst (UTF-8), bajty albo dane obrazu. */
export type PdfPart<T> = string | Uint8Array | PdfImage<T>;

/** Prosty zapis obiektów PDF z tabelą xref. Obrazy przekazywane bez kopiowania. */
export class PdfFile<T> {
  private readonly objs: PdfPart<T>[][] = [];

  /** Rezerwuje numer obiektu (treść można podać później przez set). */
  add(parts: PdfPart<T>[] = []): number {
    this.objs.push(parts);
    return this.objs.length;
  }

  set(id: number, parts: PdfPart<T>[]): void {
    this.objs[id - 1] = parts;
  }

  bytes(root: number): (Uint8Array | T)[] {
    const enc = new TextEncoder();
    const out: (Uint8Array | T)[] = [];
    const offsets: number[] = [];
    let off = 0;
    const push = (part: PdfPart<T>): void => {
      if (typeof part === 'string') {
        const b = enc.encode(part);
        out.push(b);
        off += b.length;
      } else if (part instanceof Uint8Array) {
        out.push(part);
        off += part.length;
      } else {
        out.push(part.data);
        off += part.size;
      }
    };
    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    this.objs.forEach((parts, i) => {
      offsets.push(off);
      push(`${i + 1} 0 obj\n`);
      parts.forEach(push);
      push('\nendobj\n');
    });
    const xref = off;
    let t = `xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) t += String(o).padStart(10, '0') + ' 00000 n \n';
    t += `trailer\n<< /Size ${this.objs.length + 1} /Root ${root} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    push(t);
    return out;
  }
}

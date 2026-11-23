// Zapis JPG z płótna z rozdzielczością (DPI) w nagłówku – odpowiednik withDpi i toBlob ze starego bryty.js.
import { JPEG_QUALITY } from '../../domain/constants';
import { JFIF_HEADER_BYTES, setJfifDpi } from '../../output/jfif';

/** Ustawia DPI w nagłówku JFIF; zmienia tylko 18 bajtów – bez kopiowania całego pliku do pamięci. */
export async function withDpi(blob: Blob, dpi: number): Promise<Blob> {
  const head = setJfifDpi(new Uint8Array(await blob.slice(0, JFIF_HEADER_BYTES).arrayBuffer()), dpi);
  if (!head) return blob;
  return new Blob([head as Uint8Array<ArrayBuffer>, blob.slice(JFIF_HEADER_BYTES)], { type: 'image/jpeg' });
}

/** JPG z płótna (jakość jak bryty). */
export const canvasJpeg = (cv: HTMLCanvasElement): Promise<Blob> =>
  new Promise((res, rej) =>
    cv.toBlob(b => (b ? res(b) : rej(new Error('Przeglądarka nie zapisała pliku.'))), 'image/jpeg', JPEG_QUALITY),
  );

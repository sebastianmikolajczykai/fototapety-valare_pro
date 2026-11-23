// Odpowiedź tekstowa serwera – wspólna dla serwera, AI i Corela (stara funkcja send z serwer-fototapety.js).
import type { ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

export type Send = (res: ServerResponse, code: number, text: string, type?: string) => void;

/** Gdy odpowiedź już leci (np. strumień obrazu), błędu nie da się wysłać – połączenie jest zamykane. */
export const send: Send = (res, code, text, type = 'text/plain; charset=utf-8') => {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(code, { 'Content-Type': type });
  res.end(text);
};

/** Przekazuje treść odpowiedzi fetch do przeglądarki; zerwany transfer zamyka połączenie, nie serwer. Czeka do końca. */
export function pipeBody(body: ReadableStream<Uint8Array>, res: ServerResponse): Promise<void> {
  return new Promise(ok => {
    res.once('close', () => ok());
    res.once('finish', () => ok());
    Readable.fromWeb(body as WebReadableStream<Uint8Array>)
      .on('error', () => res.destroy())
      .pipe(res);
  });
}

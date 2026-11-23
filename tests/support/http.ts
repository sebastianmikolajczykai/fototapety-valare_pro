// Atrapy żądania i odpowiedzi HTTP do testów obsługi serwera (bez otwierania portu).
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

export function fakeReq(
  method: string,
  url: string,
  body = '',
  headers: Record<string, string> = {},
  remoteAddress = '10.0.0.1',
): IncomingMessage {
  const r = Readable.from(body ? [Buffer.from(body)] : []) as unknown as IncomingMessage;
  Object.assign(r, { method, url, headers, socket: { remoteAddress } });
  return r;
}

export interface FakeRes {
  res: ServerResponse;
  status: () => number;
  headers: () => Record<string, string | number | string[]>;
  text: () => string;
  json: () => Record<string, unknown>;
  ended: () => boolean;
}

export function fakeRes(): FakeRes {
  let status = 0;
  let ended = false;
  let headers: Record<string, string | number | string[]> = {};
  const chunks: Buffer[] = [];
  const res = {
    headersSent: false,
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    writeHead(code: number, h: Record<string, string> = {}) {
      status = code;
      headers = { ...headers, ...h };
      res.headersSent = true;
      return res;
    },
    write(c: string | Buffer) {
      chunks.push(Buffer.from(c));
      return true;
    },
    end(c?: string | Buffer) {
      if (c !== undefined) chunks.push(Buffer.from(c));
      ended = true;
      return res;
    },
    destroy() {
      ended = true;
    },
  };
  const text = () => Buffer.concat(chunks).toString('utf8');
  return {
    res: res as unknown as ServerResponse,
    status: () => status,
    headers: () => headers,
    text,
    json: () => JSON.parse(text()) as Record<string, unknown>,
    ended: () => ended,
  };
}

// Atrapy żądania i odpowiedzi HTTP oraz fetch do testów serwera (bez otwierania portu i bez internetu).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, Writable } from 'node:stream';

export function fakeReq(
  method: string,
  url: string,
  body: string | Buffer = '',
  headers: Record<string, string> = {},
  remoteAddress = '10.0.0.1',
): IncomingMessage {
  const r = Readable.from(body.length ? [Buffer.from(body)] : []) as unknown as IncomingMessage;
  Object.assign(r, { method, url, headers, socket: { remoteAddress } });
  return r;
}

/** Odpowiedź zapisywana w pamięci; to prawdziwy strumień (działa pipe, zdarzenie „close”, destroy). */
class MemoryResponse extends Writable {
  statusCode = 0;
  headersSent = false;
  head: Record<string, string | number | string[]> = {};
  readonly chunks: Buffer[] = [];

  override _write(c: Buffer, _e: BufferEncoding, cb: () => void): void {
    this.chunks.push(Buffer.from(c));
    cb();
  }
  setHeader(k: string, v: string): void {
    this.head[k] = v;
  }
  writeHead(code: number, h: Record<string, string | number> = {}): this {
    this.statusCode = code;
    this.head = { ...this.head, ...h };
    this.headersSent = true;
    return this;
  }
}

export interface FakeRes {
  res: ServerResponse;
  status: () => number;
  headers: () => Record<string, string | number | string[]>;
  body: () => Buffer;
  text: () => string;
  json: () => Record<string, unknown>;
  ended: () => boolean;
  /** Zakończenie zapisu (pipe) albo zamknięcie. */
  done: () => Promise<void>;
}

export function fakeRes(): FakeRes {
  const r = new MemoryResponse();
  const text = (): string => Buffer.concat(r.chunks).toString('utf8');
  return {
    res: r as unknown as ServerResponse,
    status: () => r.statusCode,
    headers: () => r.head,
    body: () => Buffer.concat(r.chunks),
    text,
    json: () => JSON.parse(text()) as Record<string, unknown>,
    ended: () => r.writableEnded || r.destroyed,
    done: () =>
      r.writableFinished || r.destroyed
        ? Promise.resolve()
        : new Promise(ok => {
            r.once('finish', () => ok());
            r.once('close', () => ok());
          }),
  };
}

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Atrapa fetch: zapisuje wywołania, odpowiedź z funkcji trasującej. Żadne zapytanie nie wychodzi do internetu. */
export function mockFetch(route: (url: string, call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    let body: unknown = init.body;
    if (typeof body === 'string' && headers['content-type'] === 'application/json') body = JSON.parse(body);
    const call = { url, method: init.method ?? 'GET', headers, body };
    calls.push(call);
    if (init.signal?.aborted) throw init.signal.reason;
    return route(url, call);
  };
  return { fetch: fn as typeof fetch, calls };
}

export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

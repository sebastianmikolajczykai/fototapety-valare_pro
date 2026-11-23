import type http from 'node:http';
export class FototapetyServer {
  readonly port = 0;
  readonly host = '';
  static fromEnv(
    _env: Record<string, string | undefined>,
    _root: string,
    _o: { log?: (...a: unknown[]) => void; platform?: NodeJS.Platform } = {},
  ): FototapetyServer {
    throw new Error('nie zaimplementowano');
  }
  route(_req: http.IncomingMessage, _res: http.ServerResponse): Promise<void> {
    throw new Error('nie zaimplementowano');
  }
  createServer(): http.Server {
    throw new Error('nie zaimplementowano');
  }
}

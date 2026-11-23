import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Send } from './respond';
export interface PowerShellResult {
  err: Error | null;
  out: string;
  errText: string;
}
export interface CorelOptions {
  platform: NodeJS.Platform;
  script: string;
  resultsDir: string;
  tmpDir: string;
  log: (...a: unknown[]) => void;
  powershell: (args: string[], timeoutMs: number) => Promise<PowerShellResult>;
  maxBytes?: number;
}
export class CorelExporter {
  constructor(_o: CorelOptions) {}
  installed(): Promise<boolean> {
    throw new Error('nie zaimplementowano');
  }
  handle(_req: IncomingMessage, _res: ServerResponse, _send: Send): Promise<void> {
    throw new Error('nie zaimplementowano');
  }
}

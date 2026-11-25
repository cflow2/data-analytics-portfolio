import ParseWorker from './worker?worker&inline';
import type { ParsedFile, ParseRequest } from './types';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: ParsedFile) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new ParseWorker();
    worker.onmessage = (e: MessageEvent<{ id: number; result: ParsedFile }>) => {
      pending.get(e.data.id)?.(e.data.result);
      pending.delete(e.data.id);
    };
    worker.onerror = (e) => {
      const why = e.message || `${e.filename ?? "worker"}:${e.lineno ?? "?"}`;
      for (const resolve of pending.values()) resolve({ fileId: "", name: "", size: 0, sheets: [], candidate: null, headers: [], error: `Parser crashed: ${why}`, ms: 0 });
      pending.clear();
    };
  }
  return worker;
}

/** Parse a file off the main thread so the UI never freezes. */
export function parseInWorker(req: ParseRequest): Promise<ParsedFile> {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    getWorker().postMessage({ id, req });
  });
}

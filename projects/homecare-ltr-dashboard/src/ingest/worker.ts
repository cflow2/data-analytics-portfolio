/// <reference lib="webworker" />
import { parseFile } from './parse';
import type { ParseRequest } from './types';

self.onmessage = (e: MessageEvent<{ id: number; req: ParseRequest }>) => {
  const { id, req } = e.data;
  try {
    const result = parseFile(req);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, result: { fileId: req.fileId, name: req.name, size: 0, sheets: [], candidate: null, headers: [], error: `Parser error: ${(err as Error).message}`, ms: 0 } });
  }
};
self.addEventListener('error', (e) => console.error('worker error', e.message, e.filename, e.lineno));
console.info('worker ready');

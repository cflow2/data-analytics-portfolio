/// <reference lib="webworker" />
import { parseFile } from './parse';
import { extractRegionMap } from './regionMap';
import { DEFAULT_REGION_CONFIG } from '@/config/regions';
import type { ParseRequest } from './types';

self.onmessage = async (e: MessageEvent<{ id: number; req: ParseRequest }>) => {
  const { id, req } = e.data;
  try {
    const result = parseFile(req);
    if (result.build?.kind === 'tracker') {
      const t0 = performance.now();
      result.build.regionMap = await extractRegionMap(req.buffer, req.name, req.pictureMap ?? DEFAULT_REGION_CONFIG.pictures);
      result.ms += performance.now() - t0;
      if (result.build.regionMap) result.build.report.info?.push(`Region map read from the “LTR Region Map” sheet: ${result.build.regionMap.regions.filter((r) => r.region).length} regions${result.build.regionMap.unassigned.length ? `, ${result.build.regionMap.unassigned.length} picture(s) not matched to a region (assign them in Settings)` : ''}.`);
    }
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, result: { fileId: req.fileId, name: req.name, size: 0, sheets: [], candidate: null, headers: [], error: `Parser error: ${(err as Error).message}`, ms: 0 } });
  }
};

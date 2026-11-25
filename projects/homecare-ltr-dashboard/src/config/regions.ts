/**
 * Region configuration (the spec's regions.json). Stored in IndexedDB (kv "regionConfig") and editable in Settings;
 * these are the defaults.
 */
import { db as defaultDb, type HomeCareDB } from '@/db/db';

export type Division = 'NORTH' | 'SOUTH' | 'WEST';

export interface RegionConfig {
  divisions: Record<Division, string[]>;
  /** Tracker "LTR Region Map" picture name → region */
  pictures: Record<string, string>;
  /** Optional manual label anchors (fractions of the map width/height) */
  anchors: Record<string, { x: number; y: number }>;
}

export const DEFAULT_REGION_CONFIG: RegionConfig = {
  divisions: {
    NORTH: ['R1', 'R4', 'R7', 'R18', 'R21'],
    SOUTH: ['R2', 'R3', 'R6', 'R15', 'R27'],
    WEST: ['R5', 'R8', 'R12', 'R14'],
  },
  pictures: {
    'Picture 12': 'R14', 'Picture 13': 'R12', 'Picture 14': 'R8', 'Picture 15': 'R5', 'Picture 31': 'R4',
    'Picture 27': 'R21', 'Picture 28': 'R18', 'Picture 29': 'R7', 'Picture 32': 'R1', 'Picture 20': 'R6',
    'Picture 23': 'R2', 'Picture 22': 'R3', 'Picture 18': 'R15', 'Picture 17': 'R27',
  },
  anchors: {},
};

/**
 * Approximate region centres on the Tracker map (fractions of the base picture), measured from the 1123 map.
 * Used for labels and for the placeholder tile map when no Tracker map has been imported.
 */
export const DEFAULT_ANCHORS: Record<string, { x: number; y: number }> = {
  R14: { x: 0.239, y: 0.308 }, R12: { x: 0.492, y: 0.348 }, R8: { x: 0.146, y: 0.532 }, R5: { x: 0.374, y: 0.645 },
  R27: { x: 0.688, y: 0.849 }, R15: { x: 0.507, y: 0.794 }, R6: { x: 0.638, y: 0.535 }, R3: { x: 0.653, y: 0.664 },
  R2: { x: 0.73, y: 0.605 }, R21: { x: 0.702, y: 0.395 }, R18: { x: 0.866, y: 0.211 }, R7: { x: 0.797, y: 0.355 },
  R4: { x: 0.615, y: 0.254 }, R1: { x: 0.749, y: 0.493 },
};

export const DIVISION_ORDER: Division[] = ['SOUTH', 'WEST', 'NORTH'];

export function divisionOf(region: string, cfg: RegionConfig = DEFAULT_REGION_CONFIG): Division | null {
  for (const d of Object.keys(cfg.divisions) as Division[]) if (cfg.divisions[d].includes(region)) return d;
  return null;
}

const KEY = 'regionConfig';
export async function getRegionConfig(database: HomeCareDB = defaultDb): Promise<RegionConfig> {
  const v = (await database.kv.get(KEY))?.value as Partial<RegionConfig> | undefined;
  return { ...DEFAULT_REGION_CONFIG, ...(v ?? {}) };
}
export async function saveRegionConfig(cfg: RegionConfig, database: HomeCareDB = defaultDb) {
  await database.kv.put({ key: KEY, value: cfg });
}

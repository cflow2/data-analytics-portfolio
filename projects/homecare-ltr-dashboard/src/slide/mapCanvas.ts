/** Paints the Tracker's region pictures onto its base map: each region's alpha becomes a mask filled green/yellow. */
import type { RegionMapAsset } from '@/ingest/regionMap';

export const MAP_GREEN = '#3A8A3A';
export const MAP_YELLOW = '#F2E600';
export const MAP_GRAY = '#C9CED6';

const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Map image failed to load')); i.src = src; });

/** Returns a PNG data URL at `scale` × the map's natural size. */
export async function paintMap(asset: RegionMapAsset, colors: Record<string, string>, scale = 2): Promise<string> {
  const { base } = asset;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(base.w * scale); canvas.height = Math.round(base.h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(await load(base.dataUrl), 0, 0, canvas.width, canvas.height);
  const tmp = document.createElement('canvas');
  for (const r of asset.regions) {
    if (!r.region) continue;
    const img = await load(r.dataUrl);
    const w = Math.max(1, Math.round(r.w * scale)), h = Math.max(1, Math.round(r.h * scale));
    tmp.width = w; tmp.height = h;
    const t = tmp.getContext('2d')!;
    t.clearRect(0, 0, w, h);
    t.drawImage(img, 0, 0, w, h);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = colors[r.region] ?? MAP_GRAY;
    t.fillRect(0, 0, w, h);
    t.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, Math.round((r.x - base.x) * scale), Math.round((r.y - base.y) * scale));
  }
  return canvas.toDataURL('image/png');
}

/** Label position for a region: manual anchor, else the picture's centre, else the default anchor. */
export function regionCenter(asset: RegionMapAsset | null, region: string, anchors: Record<string, { x: number; y: number }>, fallback: Record<string, { x: number; y: number }>) {
  if (anchors[region]) return anchors[region];
  const p = asset?.regions.find((r) => r.region === region);
  if (asset && p) return { x: (p.x + p.w / 2 - asset.base.x) / asset.base.w, y: (p.y + p.h / 2 - asset.base.y) / asset.base.h };
  return fallback[region] ?? null;
}

export const PLACEHOLDER_ASPECT = 1484 / 644;
/** Tile map used before a Tracker map has been imported: one rounded tile per region at its usual position. */
export function paintPlaceholder(colors: Record<string, string>, anchors: Record<string, { x: number; y: number }>, width = 1484 * 2): string {
  const h = Math.round(width / PLACEHOLDER_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#F4F6F9';
  ctx.fillRect(0, 0, width, h);
  const tw = width * 0.06, th = h * 0.115;
  for (const [r, a] of Object.entries(anchors)) {
    ctx.fillStyle = colors[r] ?? MAP_GRAY;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(a.x * width - tw / 2, a.y * h - th / 2, tw, th, 14);
    ctx.fill(); ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}

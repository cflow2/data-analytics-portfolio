/**
 * Extracts the region map from the Tracker's "LTR Region Map" sheet: a base US map picture plus one picture per region.
 * The pictures stay in this browser (IndexedDB); they are never part of the app code.
 */
import JSZip from 'jszip';

export interface MapPicture { name: string; descr: string; dataUrl: string; x: number; y: number; w: number; h: number; region?: string }
export interface RegionMapAsset { base: MapPicture; regions: MapPicture[]; source: string; extractedAt: string; unassigned: string[] }

const EMU = 9525;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const decode = (s: string) => s.replace(/&#xA;/gi, '\n').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Resolve the sheet path and its drawing for a sheet whose name matches. */
async function drawingFor(zip: JSZip, sheetName: RegExp): Promise<{ drawing: string; rels: string } | null> {
  const wb = await zip.file('xl/workbook.xml')?.async('string');
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!wb || !wbRels) return null;
  const sheet = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => sheetName.test(decode(/name="([^"]*)"/.exec(tag)?.[1] ?? '')));
  if (!sheet) return null;
  const rid = /r:id="([^"]+)"/.exec(sheet)?.[1];
  const rel = [...wbRels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
  const target = /Target="([^"]+)"/.exec(rel ?? '')?.[1];
  if (!target) return null;
  const sheetPath = 'xl/' + target.replace(/^\/?xl\//, '');
  const sheetRels = await zip.file(sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels')?.async('string');
  const dTarget = sheetRels && /Type="[^"]*\/drawing"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*\/drawing"/.exec(sheetRels);
  const dPath = dTarget ? 'xl/drawings/' + (dTarget[1] ?? dTarget[2]).split('/').pop() : null;
  if (!dPath) return null;
  const drawing = await zip.file(dPath)?.async('string');
  const rels = await zip.file(dPath.replace('drawings/', 'drawings/_rels/') + '.rels')?.async('string');
  return drawing && rels ? { drawing, rels } : null;
}

export async function extractRegionMap(buffer: ArrayBuffer, fileName: string, pictureToRegion: Record<string, string>): Promise<RegionMapAsset | null> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(buffer); } catch { return null; }
  const d = await drawingFor(zip, /region map/i);
  if (!d) return null;
  const relMap = new Map([...d.rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])![1], /Target="([^"]+)"/.exec(m[0])![1]]));
  const pics: MapPicture[] = [];
  for (const m of d.drawing.matchAll(/<xdr:pic>[\s\S]*?<\/xdr:pic>/g)) {
    const p = m[0];
    const name = decode(/<xdr:cNvPr\b[^>]*name="([^"]*)"/.exec(p)?.[1] ?? '');
    const descr = decode(/descr="([^"]*)"/.exec(p)?.[1] ?? '');
    const embed = /r:embed="([^"]+)"/.exec(p)?.[1];
    const xf = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/><a:ext cx="(\d+)" cy="(\d+)"/.exec(p);
    const target = embed ? relMap.get(embed) : undefined;
    if (!target || !xf || !/\.png$/i.test(target)) continue;
    const bytes = await zip.file('xl/' + target.replace(/^\.\.\//, ''))?.async('uint8array');
    if (!bytes) continue;
    pics.push({ name, descr, dataUrl: `data:image/png;base64,${b64(bytes)}`, x: +xf[1] / EMU, y: +xf[2] / EMU, w: +xf[3] / EMU, h: +xf[4] / EMU });
  }
  if (pics.length < 2) return null;
  const base = pics.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  // Region overlays sit on the base map; legend swatches and labels outside it are ignored.
  const inside = (p: MapPicture) => p.x + p.w / 2 >= base.x && p.x + p.w / 2 <= base.x + base.w && p.y + p.h / 2 >= base.y && p.y + p.h / 2 <= base.y + base.h;
  const regions = pics.filter((p) => p !== base && inside(p)).map((p) => {
    const fromName = pictureToRegion[p.name];
    const fromDescr = /\bR(\d{1,2})\b/.exec(p.descr)?.[1];
    return { ...p, region: fromName ?? (fromDescr ? `R${+fromDescr}` : undefined) };
  });
  return { base, regions, source: fileName, extractedAt: new Date().toISOString(), unassigned: regions.filter((r) => !r.region).map((r) => r.name) };
}

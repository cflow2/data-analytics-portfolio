/** Shared geometry for the 1920×1080 slide (screen, PNG and PPTX use the same boxes). */
export const W = 1920, H = 1080;
export interface Box { x: number; y: number; w: number; h: number }

export const COLORS = {
  ink: '#101C33', muted: '#4A5568', border: '#DCE1E8', soft: '#F4F6F9', bar: '#0D4E9E',
  blue: '#2E6FC4', red: '#C00000', gray: '#6B7280', green: '#3A8A3A', yellow: '#F2E600', white: '#FFFFFF',
};

export const L = {
  title: { x: 0, y: 0, w: W, h: 88 },
  kpis: { x: 40, y: 108, w: 1120, h: 124 },
  divisions: { x: 1190, y: 108, w: 690, h: 124 },
  mapPanel: { x: 40, y: 252, w: 1120, h: 560 },
  map: { x: 190, y: 372, w: 820, h: 330 },
  trend: { x: 1190, y: 252, w: 690, h: 320 },
  drivers: { x: 1190, y: 588, w: 690, h: 224 },
  cards: { x: 40, y: 832, w: 1840, h: 216 },
} satisfies Record<string, Box>;

const CALLOUT_W = 356, CALLOUT_H = 108;
/** Six callout slots: three above the map, three below. */
export function calloutSlots(): Box[] {
  const xs = [56, 56 + CALLOUT_W + 20, 56 + 2 * (CALLOUT_W + 20)];
  return [...xs.map((x) => ({ x, y: 262, w: CALLOUT_W, h: CALLOUT_H })), ...xs.map((x) => ({ x, y: 704, w: CALLOUT_W, h: CALLOUT_H }))];
}

/**
 * Assigns callouts to slots: the three northernmost regions go above the map, the rest below, each row ordered
 * west → east so connectors don't cross.
 */
export function placeCallouts<T extends { region: string }>(items: T[], center: (region: string) => { x: number; y: number } | null, mapBox: Box): { item: T; box: Box; anchor: { x: number; y: number } | null }[] {
  const slots = calloutSlots();
  const withC = items.slice(0, 6).map((item) => ({ item, c: center(item.region) }));
  const byY = [...withC].sort((a, b) => (a.c?.y ?? 0.5) - (b.c?.y ?? 0.5));
  const nTop = Math.min(3, Math.ceil(withC.length / 2));
  const westToEast = (a: { c: { x: number } | null }, b: { c: { x: number } | null }) => (a.c?.x ?? 0.5) - (b.c?.x ?? 0.5);
  const top = byY.slice(0, nTop).sort(westToEast);
  const bottom = byY.slice(nTop).sort(westToEast);
  const toPx = (c: { x: number; y: number } | null) => (c ? { x: mapBox.x + c.x * mapBox.w, y: mapBox.y + c.y * mapBox.h } : null);
  return [
    ...top.map((t, i) => ({ item: t.item, box: slots[i], anchor: toPx(t.c) })),
    ...bottom.map((t, i) => ({ item: t.item, box: slots[3 + i], anchor: toPx(t.c) })),
  ];
}

/** Point on the box edge facing the anchor (top/bottom middle). */
export function connectorStart(box: Box, anchor: { x: number; y: number }) {
  const below = anchor.y > box.y + box.h;
  return { x: Math.min(Math.max(anchor.x, box.x + 24), box.x + box.w - 24), y: below ? box.y + box.h : box.y };
}

/** Fit the map image (natural aspect) inside the map box, centred. */
export function fitMap(aspect: number): Box {
  const m = L.map;
  let w = m.w, h = w / aspect;
  if (h > m.h) { h = m.h; w = h * aspect; }
  return { x: m.x + (m.w - w) / 2, y: m.y + (m.h - h) / 2, w, h };
}

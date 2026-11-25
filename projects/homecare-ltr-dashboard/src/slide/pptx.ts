/**
 * LTR slide as one editable 16:9 PowerPoint slide: native text and shapes, a native bar+line combo chart
 * (0–8 counts on the left axis, LTR on the right, dashed benchmark), native Key Drivers bars, the painted map as a
 * picture, and the talk track in the speaker notes. Built for PowerPoint on iPad too: no comments, no macros,
 * no embedded fonts, standard chart parts only.
 */
import PptxGenJS from 'pptxgenjs';
import { atOrAbove, calloutHeadline } from './ltrMetrics';
import { COLORS, L, connectorStart, type Box } from './layout';
import { arrow, arrowColor, valueColor, type SlideModel } from './model';
import type { SlideEdits } from './state';

const IN = (px: number) => px / 144; // 1920 px = 13.333 in
const PT = (px: number) => Math.round(px * 0.5 * 10) / 10; // 1 px on the 1920 canvas = 0.5 pt
const hex = (c: string) => c.replace('#', '').toUpperCase();
const FONT = 'Arial';
const pos = (b: Box) => ({ x: IN(b.x), y: IN(b.y), w: IN(b.w), h: IN(b.h) });

export interface PptxInput {
  model: SlideModel;
  edits: SlideEdits;
  title: string;
  subtitle: string;
  map: { dataUrl: string; box: Box } | null;
  /** Region labels in slide pixels */
  labels: { region: string; x: number; y: number; text: string }[];
  callouts: { region: string; categories: string[]; why: string; box: Box; anchor: { x: number; y: number } | null }[];
  notes: string;
  kpis: { label: string; value: string; sub: string; color: string }[];
}

export function buildLtrPptx(p: PptxInput): PptxGenJS {
  const { m, drivers } = p.model;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = p.title;
  pptx.company = 'HomeCare+';
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  const text = (t: string | PptxGenJS.TextProps[], b: Box, o: PptxGenJS.TextPropsOptions = {}) =>
    s.addText(t as never, { ...pos(b), fontFace: FONT, color: hex(COLORS.ink), margin: 0, valign: 'top', ...o });

  // Title bar
  s.addShape(pptx.ShapeType.rect, { ...pos(L.title), fill: { color: hex(COLORS.bar) }, line: { color: hex(COLORS.bar) } });
  text(p.title, { x: 40, y: 14, w: 1300, h: 40 }, { fontSize: PT(34), bold: true, color: 'FFFFFF' });
  text(p.subtitle, { x: 40, y: 54, w: 1300, h: 26 }, { fontSize: PT(19), color: 'DCE6F5' });
  if (p.edits.presenter) text(p.edits.presenter, { x: 1380, y: 30, w: 500, h: 30 }, { fontSize: PT(20), color: 'FFFFFF', align: 'right' });

  // KPIs
  const kw = (L.kpis.w - 3 * 16) / 4;
  p.kpis.forEach((k, i) => {
    const b = { x: L.kpis.x + i * (kw + 16), y: L.kpis.y, w: kw, h: L.kpis.h };
    s.addShape(pptx.ShapeType.roundRect, { ...pos(b), fill: { color: 'F4F6F9' }, line: { color: hex(COLORS.border), width: 0.75 }, rectRadius: 0.06 });
    text(k.label, { x: b.x + 16, y: b.y + 12, w: b.w - 32, h: 24 }, { fontSize: PT(18), color: hex(COLORS.muted), bold: true });
    text(k.value, { x: b.x + 16, y: b.y + 36, w: b.w - 32, h: 52 }, { fontSize: PT(46), bold: true, color: hex(k.color) });
    text(k.sub, { x: b.x + 16, y: b.y + 90, w: b.w - 32, h: 26 }, { fontSize: PT(17), color: hex(COLORS.muted) });
  });

  // Divisions
  const d = L.divisions;
  s.addShape(pptx.ShapeType.roundRect, { ...pos(d), fill: { color: 'F4F6F9' }, line: { color: hex(COLORS.border), width: 0.75 }, rectRadius: 0.06 });
  text('Divisions', { x: d.x + 16, y: d.y + 12, w: 300, h: 24 }, { fontSize: PT(18), bold: true, color: hex(COLORS.muted) });
  const dw = (d.w - 32) / 3;
  m.divisions.forEach((r, i) => {
    const x = d.x + 16 + i * dw;
    text(r.division, { x, y: d.y + 40, w: dw, h: 24 }, { fontSize: PT(18), bold: true });
    text([
      { text: `${r.cur.display ?? '—'}`, options: { fontSize: PT(40), bold: true, color: hex(valueColor(r.cur, m.benchmark)) } },
      { text: `  ${arrow(r.delta)}`, options: { fontSize: PT(22), bold: true, color: hex(arrowColor(r.delta)) } },
    ], { x, y: d.y + 64, w: dw, h: 50 });
  });

  // Map panel
  if (p.map) s.addImage({ data: p.map.dataUrl, ...pos(p.map.box) });
  for (const l of p.labels) text([
    { text: l.region, options: { fontSize: PT(15), bold: true, breakLine: true } },
    { text: l.text, options: { fontSize: PT(17), bold: true } },
  ], { x: l.x - 34, y: l.y - 22, w: 68, h: 44 }, { align: 'center', valign: 'middle', glow: { size: 3, opacity: 0.9, color: 'FFFFFF' } });
  for (const c of p.callouts) {
    const r = m.regions.find((x) => x.region === c.region);
    if (!r) continue;
    if (c.anchor) {
      const st = connectorStart(c.box, c.anchor);
      const x1 = Math.min(st.x, c.anchor.x), y1 = Math.min(st.y, c.anchor.y);
      s.addShape(pptx.ShapeType.line, { x: IN(x1), y: IN(y1), w: IN(Math.abs(c.anchor.x - st.x)) || 0.001, h: IN(Math.abs(c.anchor.y - st.y)) || 0.001,
        flipH: (c.anchor.x < st.x) !== (c.anchor.y < st.y), line: { color: '8A94A6', width: 1 } });
    }
    s.addShape(pptx.ShapeType.roundRect, { ...pos(c.box), fill: { color: 'FFFFFF' }, line: { color: hex(atOrAbove(r.cur, m.benchmark) ? COLORS.green : COLORS.red), width: 1.25 }, rectRadius: 0.05 });
    text([
      { text: calloutHeadline(r), options: { fontSize: PT(22), bold: true, color: hex(valueColor(r.cur, m.benchmark)), breakLine: true } },
      { text: c.categories.join(' · ') || ' ', options: { fontSize: PT(14), bold: true, color: hex(COLORS.muted), breakLine: true } },
      { text: c.why, options: { fontSize: PT(16), color: hex(COLORS.ink) } },
    ], { x: c.box.x + 12, y: c.box.y + 8, w: c.box.w - 24, h: c.box.h - 14 });
  }
  if (m.regions.some((r) => r.lowCount)) text('* fewer than 10 surveys', { x: L.mapPanel.x + L.mapPanel.w - 300, y: 682, w: 300, h: 20 }, { fontSize: PT(15), color: hex(COLORS.muted), align: 'right' });

  // Trend combo: bars = count 0–8 (left 0–25), line = LTR (right 86–96), dashed benchmark
  const t = L.trend;
  text('LTR trend · last 4 weeks', { x: t.x, y: t.y, w: t.w, h: 28 }, { fontSize: PT(22), bold: true });
  const labels = m.trend.map((w) => `FW${w.fw}`);
  const counts = m.trend.map((w) => w.low08);
  const maxCount = Math.max(25, Math.ceil(Math.max(...counts) / 5) * 5);
  const ltrs = m.trend.map((w) => (w.ltr === null ? 0 : Math.round(w.ltr * 10) / 10));
  const lo = Math.min(86, Math.floor(Math.min(...ltrs.filter(Boolean), m.benchmark) - 1)), hi = Math.max(96, Math.ceil(Math.max(...ltrs, m.benchmark) + 1));
  s.addChart([
    { type: pptx.ChartType.bar, data: [{ name: 'Scored 0–8', labels, values: counts }],
      options: { barDir: 'col', chartColors: m.trend.map((w) => hex(atOrAbove(w, m.benchmark) ? COLORS.blue : COLORS.red)), barGapWidthPct: 70,
        showValue: true, dataLabelPosition: 'inBase', dataLabelColor: 'FFFFFF', dataLabelFontSize: PT(18), dataLabelFontBold: true } },
    { type: pptx.ChartType.line, data: [{ name: 'LTR', labels, values: ltrs }],
      options: { secondaryValAxis: true, secondaryCatAxis: true, chartColors: [hex(COLORS.ink)], lineSize: 2.5, lineDataSymbol: 'circle', lineDataSymbolSize: 9,
        showValue: true, dataLabelPosition: 't', dataLabelFormatCode: '0', dataLabelColor: hex(COLORS.ink), dataLabelFontSize: PT(20), dataLabelFontBold: true } },
    { type: pptx.ChartType.line, data: [{ name: `Benchmark ${m.benchmark}`, labels, values: labels.map(() => m.benchmark) }],
      options: { secondaryValAxis: true, secondaryCatAxis: true, chartColors: ['8A94A6'], lineSize: 1.5, lineDash: 'dash', lineDataSymbol: 'none' } },
  ] as never, {
    x: IN(t.x), y: IN(t.y + 30), w: IN(t.w), h: IN(t.h - 30),
    valAxes: [
      { showValAxisTitle: true, valAxisTitle: 'Scored 0–8', valAxisTitleFontSize: 9, valAxisMinVal: 0, valAxisMaxVal: maxCount, valAxisMajorUnit: 5, valAxisLabelFontSize: 9, valGridLine: { style: 'none' } },
      { showValAxisTitle: true, valAxisTitle: 'LTR', valAxisTitleFontSize: 9, valAxisMinVal: lo, valAxisMaxVal: hi, valAxisMajorUnit: 2, valAxisLabelFontSize: 9, valGridLine: { color: 'ECEFF3', size: 0.5 } },
    ],
    catAxes: [{ catAxisTitle: '', catAxisLabelFontSize: 10 }, { catAxisHidden: true }],
    showLegend: true, legendPos: 'b', legendFontSize: 9,
  } as never);

  // Key Drivers
  const k = L.drivers;
  text('Key Drivers · % 9–10', { x: k.x, y: k.y, w: k.w, h: 28 }, { fontSize: PT(22), bold: true });
  if (drivers.some((x) => x.pct !== null)) {
    const shown = [...drivers].reverse(); // PowerPoint draws bar categories bottom-up
    s.addChart(pptx.ChartType.bar, [{ name: 'Top-2 box', labels: shown.map((x) => x.short), values: shown.map((x) => x.pct ?? 0) }], {
      x: IN(k.x), y: IN(k.y + 30), w: IN(k.w), h: IN(k.h - 30), barDir: 'bar', chartColors: [hex(COLORS.blue)], barGapWidthPct: 45,
      valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 100, valGridLine: { style: 'none' }, catAxisLabelFontSize: 11, catAxisLabelColor: hex(COLORS.ink),
      showValue: true, dataLabelFormatCode: '0', dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelFontBold: true, dataLabelColor: hex(COLORS.ink),
    });
  } else text('No driver data for this week', { x: k.x, y: k.y + 60, w: k.w, h: 30 }, { fontSize: PT(18), color: hex(COLORS.muted) });

  // Promoter / passive / detractor cards
  const cw = (L.cards.w - 2 * 20) / 3;
  const cards = [
    { key: 'promoters' as const, label: 'Promoters (9–10)', n: m.cur.promoters, color: COLORS.blue },
    { key: 'passives' as const, label: 'Passives (7–8)', n: m.cur.passives, color: COLORS.gray },
    { key: 'detractors' as const, label: 'Detractors (0–6)', n: m.cur.detractors06, color: COLORS.red },
  ];
  cards.forEach((c, i) => {
    const b = { x: L.cards.x + i * (cw + 20), y: L.cards.y, w: cw, h: L.cards.h };
    const e = p.edits.cards[c.key];
    s.addShape(pptx.ShapeType.roundRect, { ...pos(b), fill: { color: 'FFFFFF' }, line: { color: hex(c.color), width: 1.5 }, rectRadius: 0.05 });
    text([
      { text: `${c.n}  `, options: { fontSize: PT(40), bold: true, color: hex(c.color) } },
      { text: c.label, options: { fontSize: PT(22), bold: true, color: hex(COLORS.ink) } },
    ], { x: b.x + 18, y: b.y + 12, w: b.w - 36, h: 50 }, { valign: 'middle' });
    text(e.drivers.length ? `What their comments point to: ${e.drivers.join(', ')}` : ' ', { x: b.x + 18, y: b.y + 64, w: b.w - 36, h: 44 }, { fontSize: PT(15), color: hex(COLORS.muted), italic: true, valign: 'middle' });
    text(e.bullets.length ? e.bullets.map((x) => ({ text: x, options: { bullet: { indent: 10 }, breakLine: true } })) : ' ', { x: b.x + 18, y: b.y + 112, w: b.w - 36, h: b.h - 118 }, { fontSize: PT(18), paraSpaceAfter: 3 });
  });

  s.addNotes(p.notes);
  return pptx;
}

export const ltrPptxName = (fw: number) => `HomeCare_LTR_FW${fw}.pptx`;

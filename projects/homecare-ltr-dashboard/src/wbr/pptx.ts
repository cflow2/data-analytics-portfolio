/** One editable 16:9 slide: native text, a native stacked column chart, and speaker notes. */
import PptxGenJS from 'pptxgenjs';
import type { WeekFacts } from '@/analytics/facts';
import { chartRows, niceMax, type WbrDraft } from './draft';

const INK = '12233F', MUTED = '4A5568', CALLS = '0D4E9E', SURVEYS = 'E07A1F', BORDER = 'DCE1E8', SOFT = 'FBEADB';

export function buildPptx(d: WbrDraft, f: WeekFacts, notes: string): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  pptx.title = d.title;
  pptx.company = 'HomeCare+';
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  s.addText(d.title, { x: 0.45, y: 0.3, w: 12.4, h: 0.55, fontFace: 'Arial', fontSize: 26, bold: true, color: INK });
  s.addText(d.subtitle, { x: 0.45, y: 0.82, w: 12.4, h: 0.32, fontFace: 'Arial', fontSize: 12, color: MUTED });
  s.addShape(pptx.ShapeType.line, { x: 0.45, y: 1.2, w: 12.4, h: 0, line: { color: BORDER, width: 1 } });

  // Left: themes
  s.addText('Key Themes & Insights Seen in VOC', { x: 0.45, y: 1.32, w: 6.9, h: 0.36, fontFace: 'Arial', fontSize: 14, bold: true, color: INK });
  const rows = d.themes.filter((t) => t.include).flatMap((t) => [
    { text: t.header, options: { fontSize: 11, bold: true, color: INK, breakLine: true, paraSpaceBefore: 6 } },
    { text: t.line, options: { fontSize: 9.5, color: INK, bullet: { indent: 12 }, breakLine: true } },
  ]);
  s.addText(rows as PptxGenJS.TextProps[], { x: 0.45, y: 1.72, w: 6.9, h: 4.6, fontFace: 'Arial', valign: 'top', margin: 2 });

  // Right: LTR callout + chart
  s.addText(d.callout, { x: 7.6, y: 1.32, w: 5.25, h: 0.95, fontFace: 'Arial', fontSize: 11.5, bold: true, color: INK, fill: { color: SOFT }, margin: 8, valign: 'middle' });
  const cr = chartRows(f, d);
  s.addText(d.chartTitle, { x: 7.6, y: 2.4, w: 5.25, h: 0.32, fontFace: 'Arial', fontSize: 12, bold: true, color: INK });
  if (cr.length) {
    s.addChart(pptx.ChartType.bar, [
      { name: 'Surveys', labels: cr.map((r) => r.name), values: cr.map((r) => r.surveys) },
      { name: 'Calls', labels: cr.map((r) => r.name), values: cr.map((r) => r.calls) },
    ], {
      x: 7.55, y: 2.72, w: 5.35, h: 3.65, barDir: 'col', barGrouping: 'stacked', barGapWidthPct: 60,
      chartColors: [SURVEYS, CALLS], valAxisMaxVal: niceMax(Math.max(...cr.map((r) => r.total))), valAxisMinVal: 0,
      catAxisLabelFontSize: 8, catAxisLabelColor: MUTED, valAxisLabelFontSize: 8, valAxisLabelColor: MUTED,
      valGridLine: { color: 'ECEFF3', size: 0.5 }, showLegend: true, legendPos: 'b', legendFontSize: 9,
      showValue: true, dataLabelFontSize: 8, dataLabelColor: 'FFFFFF', catAxisLabelRotate: 0,
    });
  }
  s.addText(d.footnote, { x: 0.45, y: 6.62, w: 12.4, h: 0.6, fontFace: 'Arial', fontSize: 8, color: MUTED, valign: 'top' });
  s.addNotes(notes);
  return pptx;
}

export function pptxFileName(d: WbrDraft) {
  return `HomeCare_Customer_Insights_FW${d.fw}.pptx`;
}

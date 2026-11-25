/** The 1920×1080 LTR slide, drawn at natural size (the page scales it to fit). Fixed light colours, like the deck. */
import { forwardRef, useEffect, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { atOrAbove, calloutHeadline, type RegionRow } from '@/slide/ltrMetrics';
import { COLORS, H, L, W, connectorStart, type Box } from '@/slide/layout';
import { arrow, arrowColor, valueColor, type SlideModel } from '@/slide/model';
import type { SlideEdits } from '@/slide/state';

export interface PlacedCallout { region: string; categories: string[]; why: string; box: Box; anchor: { x: number; y: number } | null }
export interface Kpi { id: string; label: string; value: string; sub: string; color: string; tip: string }

const px = (b: Box) => ({ position: 'absolute' as const, left: b.x, top: b.y, width: b.w, height: b.h });

function Clickable({ onClick, label, children, style, interactive }: { onClick?: () => void; label: string; children: React.ReactNode; style: React.CSSProperties; interactive: boolean }) {
  return interactive && onClick ? <button type="button" title={label} onClick={onClick} style={{ ...style, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>{children}</button> : <div style={style}>{children}</div>;
}

export const LtrSlideCanvas = forwardRef<HTMLDivElement, {
  model: SlideModel; edits: SlideEdits; title: string; subtitle: string; kpis: Kpi[];
  map: { src: string | null; box: Box; placeholder: boolean; centers: Record<string, { x: number; y: number } | null> };
  callouts: PlacedCallout[];
  onRegion?: (r: string) => void; onKpi?: (id: string) => void; onInfo?: () => void; interactive?: boolean;
}>(function LtrSlideCanvas({ model, edits, title, subtitle, kpis, map, callouts, onRegion, onKpi, onInfo, interactive = true }, ref) {
  const { m, drivers } = model;
  const [hover, setHover] = useState<{ r: RegionRow; x: number; y: number } | null>(null);
  useEffect(() => setHover(null), [m.fw]);
  const regionTip = (r: RegionRow) => `${r.region}${r.division ? ` · ${r.division}` : ''}: ${r.cur.display ?? '—'}${r.lowCount ? '*' : ''} (${r.cur.ltr?.toFixed(2) ?? '—'}%) on ${r.cur.n} surveys · ${r.cur.low08} scored 0–8 · FW${m.fw - 1} ${r.prior.display ?? '—'} (n=${r.prior.n})`;

  const labels = m.trend.map((w) => `FW${w.fw}`);
  const maxCount = Math.max(25, Math.ceil(Math.max(...m.trend.map((w) => w.low08)) / 5) * 5);
  const ltrs = m.trend.map((w) => w.ltr);
  const lo = Math.min(86, Math.floor(Math.min(...ltrs.filter((x): x is number => x !== null), m.benchmark) - 1));
  const hi = Math.max(96, Math.ceil(Math.max(...ltrs.filter((x): x is number => x !== null), m.benchmark) + 1));
  const trend: EChartsOption = {
    animation: false,
    textStyle: { fontFamily: 'Arial, Inter, sans-serif', color: COLORS.muted, fontSize: 18 },
    grid: { left: 64, right: 64, top: 40, bottom: 64 },
    legend: { bottom: 0, itemWidth: 18, itemHeight: 12, textStyle: { fontSize: 16, color: COLORS.muted }, data: ['Scored 0–8', 'LTR', `Benchmark ${m.benchmark}`] },
    tooltip: { trigger: 'axis', textStyle: { fontSize: 16 }, formatter: (ps) => {
      const i = (ps as { dataIndex: number }[])[0].dataIndex; const w = m.trend[i];
      return `<b>FW${w.fw}</b><br/>LTR ${w.display ?? '—'} (${w.ltr?.toFixed(2) ?? '—'}%) on ${w.n}<br/>Scored 0–8: ${w.low08} · allowed at ${m.benchmark}: ${w.allowed}`;
    } },
    xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: COLORS.border } }, axisLabel: { fontSize: 18, color: COLORS.ink, fontWeight: 'bold' } },
    yAxis: [
      { type: 'value', name: 'Scored 0–8', nameTextStyle: { fontSize: 14 }, min: 0, max: maxCount, interval: 5, splitLine: { show: false }, axisLabel: { fontSize: 15 } },
      { type: 'value', name: 'LTR', nameTextStyle: { fontSize: 14 }, min: lo, max: hi, interval: 2, splitLine: { lineStyle: { color: '#ECEFF3' } }, axisLabel: { fontSize: 15 } },
    ],
    series: [
      { name: 'Scored 0–8', type: 'bar', barWidth: '46%', data: m.trend.map((w) => ({ value: w.low08, itemStyle: { color: atOrAbove(w, m.benchmark) ? COLORS.blue : COLORS.red } })),
        label: { show: true, position: 'insideBottom', distance: 8, color: '#fff', fontSize: 20, fontWeight: 'bold' } },
      { name: 'LTR', type: 'line', yAxisIndex: 1, data: m.trend.map((w) => w.ltr), symbol: 'circle', symbolSize: 12, lineStyle: { color: COLORS.ink, width: 3 }, itemStyle: { color: COLORS.ink },
        label: { show: true, position: 'top', fontSize: 22, fontWeight: 'bold', color: COLORS.ink, formatter: (p) => String(m.trend[p.dataIndex].display ?? '') },
        markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: '#8A94A6', type: 'dashed', width: 2 }, data: [{ yAxis: m.benchmark }] } },
      { name: `Benchmark ${m.benchmark}`, type: 'line', yAxisIndex: 1, data: [], lineStyle: { color: '#8A94A6', type: 'dashed', width: 2 }, itemStyle: { color: '#8A94A6' }, symbol: 'none' },
    ],
  };

  const maxDriver = 100;
  const cards = [
    { key: 'promoters' as const, label: 'Promoters (9–10)', n: m.cur.promoters, color: COLORS.blue },
    { key: 'passives' as const, label: 'Passives (7–8)', n: m.cur.passives, color: COLORS.gray },
    { key: 'detractors' as const, label: 'Detractors (0–6)', n: m.cur.detractors06, color: COLORS.red },
  ];

  return (
    <div ref={ref} style={{ width: W, height: H, position: 'relative', background: '#fff', color: COLORS.ink, fontFamily: 'Arial, Inter, sans-serif', overflow: 'hidden' }} aria-label={`LTR slide FW${m.fw}`}>
      {/* Title bar */}
      <div style={{ ...px(L.title), background: COLORS.bar, color: '#fff' }}>
        <div style={{ position: 'absolute', left: 40, top: 12, fontSize: 34, fontWeight: 700 }}>{title}</div>
        <div style={{ position: 'absolute', left: 40, top: 54, fontSize: 19, color: '#DCE6F5' }}>{subtitle}</div>
        <div style={{ position: 'absolute', right: 40, top: 28, fontSize: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          {edits.presenter && <span>{edits.presenter}</span>}
          {interactive && onInfo && <button type="button" onClick={onInfo} aria-label="How these numbers are calculated" title="How these numbers are calculated"
            style={{ width: 34, height: 34, borderRadius: 17, border: '2px solid #fff', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 20, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>i</button>}
        </div>
      </div>

      {/* KPIs */}
      {kpis.map((k, i) => {
        const kw = (L.kpis.w - 3 * 16) / 4;
        return (
          <Clickable interactive={interactive} key={k.id} onClick={onKpi ? () => onKpi(k.id) : undefined} label={k.tip}
            style={{ ...px({ x: L.kpis.x + i * (kw + 16), y: L.kpis.y, w: kw, h: L.kpis.h }), background: COLORS.soft, border: `1.5px solid ${COLORS.border}`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.muted }}>{k.label}</div>
            <div style={{ fontSize: 46, fontWeight: 700, color: k.color, lineHeight: '56px' }}>{k.value}</div>
            <div style={{ fontSize: 17, color: COLORS.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.sub}</div>
          </Clickable>
        );
      })}

      {/* Divisions */}
      <div style={{ ...px(L.divisions), background: COLORS.soft, border: `1.5px solid ${COLORS.border}`, borderRadius: 12, padding: '12px 16px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.muted }}>Divisions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 4 }}>
          {m.divisions.map((d) => (
            <div key={d.division} title={`${d.division}: ${d.cur.ltr?.toFixed(2) ?? '—'}% on ${d.cur.n} (FW${m.fw - 1} ${d.prior.ltr?.toFixed(2) ?? '—'}% on ${d.prior.n})`}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{d.division}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: valueColor(d.cur, m.benchmark) }}>{d.cur.display ?? '—'}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: arrowColor(d.delta) }}>{arrow(d.delta)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      {map.src && <img src={map.src} alt="" style={px(map.box)} />}
      {!map.src && <div style={{ ...px(map.box), border: `1.5px dashed ${COLORS.border}`, borderRadius: 12 }} />}
      {map.placeholder && <div style={{ position: 'absolute', left: map.box.x + 8, top: map.box.y + map.box.h - 26, fontSize: 14, color: COLORS.muted }}>Placeholder map: import an LTR Tracker with the “LTR Region Map” sheet to use the real one.</div>}
      {m.regions.filter((r) => map.centers[r.region]).map((r) => {
        const c = map.centers[r.region]!;
        const x = map.box.x + c.x * map.box.w, y = map.box.y + c.y * map.box.h;
        return (
          <Clickable interactive={interactive} key={r.region} onClick={onRegion ? () => onRegion(r.region) : undefined} label={regionTip(r)}
            style={{ position: 'absolute', left: x - 34, top: y - 22, width: 68, height: 44, background: 'transparent', border: 'none', padding: 0 }}>
            <div onMouseEnter={() => setHover({ r, x, y })} onMouseLeave={() => setHover(null)}
              style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.05, textShadow: '0 0 3px #fff, 0 0 3px #fff' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{r.region}</span>
              <span style={{ fontSize: 17, fontWeight: 700 }}>{r.cur.n ? `${r.cur.display}${r.lowCount ? '*' : ''}` : '—'}</span>
            </div>
          </Clickable>
        );
      })}
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
        {callouts.filter((c) => c.anchor).map((c) => { const s = connectorStart(c.box, c.anchor!); return <line key={c.region} x1={s.x} y1={s.y} x2={c.anchor!.x} y2={c.anchor!.y} stroke="#8A94A6" strokeWidth={2} />; })}
        {callouts.filter((c) => c.anchor).map((c) => <circle key={c.region} cx={c.anchor!.x} cy={c.anchor!.y} r={4} fill="#8A94A6" />)}
      </svg>
      {callouts.map((c) => {
        const r = m.regions.find((x) => x.region === c.region);
        if (!r) return null;
        return (
          <Clickable interactive={interactive} key={c.region} onClick={onRegion ? () => onRegion(c.region) : undefined} label={regionTip(r)}
            style={{ ...px(c.box), background: '#fff', border: `2px solid ${atOrAbove(r.cur, m.benchmark) ? COLORS.green : COLORS.red}`, borderRadius: 10, padding: '8px 12px', overflow: 'hidden' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: valueColor(r.cur, m.benchmark) }}>{calloutHeadline(r)}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.muted, letterSpacing: 0.5 }}>{c.categories.join(' · ') || ' '}</div>
            <div style={{ fontSize: 16, lineHeight: '19px' }}>{c.why}</div>
          </Clickable>
        );
      })}
      {m.regions.some((r) => r.lowCount) && <div style={{ position: 'absolute', left: L.mapPanel.x + L.mapPanel.w - 300, top: 682, width: 300, textAlign: 'right', fontSize: 15, color: COLORS.muted }}>* fewer than 10 surveys</div>}
      {hover && (
        <div role="tooltip" style={{ position: 'absolute', left: Math.min(hover.x + 20, W - 460), top: hover.y + 24, width: 440, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.15)', padding: '8px 12px', fontSize: 16, zIndex: 5 }}>
          {regionTip(hover.r)}
        </div>
      )}

      {/* Trend */}
      <div style={{ ...px(L.trend) }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>LTR trend · last 4 weeks</div>
        <ReactEChartsCore echarts={echarts} option={trend} notMerge style={{ height: L.trend.h - 30, width: L.trend.w }} opts={{ renderer: 'canvas' }} />
      </div>

      {/* Key Drivers */}
      <div style={{ ...px(L.drivers) }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Key Drivers · % 9–10</div>
        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          {drivers.length === 0 || drivers.every((d) => d.pct === null) ? <div style={{ fontSize: 18, color: COLORS.muted }}>No driver data for this week</div> : drivers.map((d) => (
            <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 56px', alignItems: 'center', gap: 10 }} title={`${d.short}: ${d.pct?.toFixed(2) ?? '—'}% (n=${d.n})`}>
              <span style={{ fontSize: 19 }}>{d.short}</span>
              <div style={{ height: 28, background: '#ECEFF3', borderRadius: 4 }}><div style={{ height: '100%', width: `${((d.pct ?? 0) / maxDriver) * 100}%`, background: COLORS.blue, borderRadius: 4 }} /></div>
              <span style={{ fontSize: 22, fontWeight: 700, textAlign: 'right' }}>{d.display ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cards */}
      {cards.map((c, i) => {
        const cw = (L.cards.w - 2 * 20) / 3;
        const e = edits.cards[c.key];
        return (
          <div key={c.key} style={{ ...px({ x: L.cards.x + i * (cw + 20), y: L.cards.y, w: cw, h: L.cards.h }), border: `2.5px solid ${c.color}`, borderRadius: 12, padding: '12px 18px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: c.color }}>{c.n}</span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 16, fontStyle: 'italic', color: COLORS.muted, marginTop: 2 }}>{e.drivers.length ? `What their comments point to: ${e.drivers.join(', ')}` : ' '}</div>
            <div style={{ marginTop: 6, fontSize: 18, lineHeight: '24px' }}>
              {e.bullets.map((b, j) => <div key={j} style={{ display: 'flex', gap: 10 }}><span aria-hidden>•</span><span>{b}</span></div>)}
            </div>
          </div>
        );
      })}
    </div>
  );
});

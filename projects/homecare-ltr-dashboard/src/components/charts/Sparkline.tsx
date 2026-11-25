/** Tiny inline SVG trend (no axes). Points with n below the threshold are drawn hollow and grey. */
export function Sparkline({ values, width = 96, height = 28, color = 'currentColor', faded = [], label }: {
  values: (number | null)[]; width?: number; height?: number; color?: string; faded?: boolean[]; label: string;
}) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <svg width={width} height={height} role="img" aria-label={`${label}: not enough data`} />;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => 3 + (i / Math.max(1, values.length - 1)) * (width - 6);
  const y = (v: number) => (max === min ? height / 2 : 3 + (1 - (v - min) / (max - min)) * (height - 6));
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      {pts.map((p) => faded[p.i] ? <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2} fill="var(--c-surface)" stroke="var(--c-muted)" strokeWidth={1} /> : null)}
      <circle cx={x(last.i)} cy={y(last.v)} r={2.75} fill={color} stroke="var(--c-surface)" strokeWidth={1.5} />
    </svg>
  );
}

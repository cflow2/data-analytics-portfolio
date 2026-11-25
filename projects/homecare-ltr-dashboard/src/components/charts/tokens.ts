import { useEffect, useState } from 'react';

export interface ChartTokens {
  ink: string; muted: string; border: string; surface: string; surface2: string; grid: string;
  calls: string; surveys: string; surveysDark: string; surveysSoft: string; callsSoft: string; neutral: string;
  /** below-average / alert marks (matches the slide's #C00000 in light mode) and a lighter companion for a stacked segment */
  alert: string; alertSoft: string; dark: boolean;
}

function read(): ChartTokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    ink: v('--c-ink'), muted: v('--c-muted'), border: v('--c-border'), surface: v('--c-surface'), surface2: v('--c-surface-2'),
    grid: dark ? '#22304b' : '#eceff3',
    // Validated chart-mark colors (scripts/validate_palette.js): light #0D4E9E/#E07A1F, dark #4A8FE0/#D06A12.
    calls: dark ? '#4A8FE0' : '#0D4E9E',
    surveys: dark ? '#D06A12' : '#E07A1F',
    surveysDark: dark ? '#F2A160' : '#B8560F',
    surveysSoft: dark ? '#5a3417' : '#F6C9A0',
    callsSoft: dark ? '#1c3a63' : '#C9DAF0',
    neutral: dark ? '#3a4a66' : '#C3CAD5',
    alert: dark ? '#F0605A' : '#C00000',
    alertSoft: dark ? '#8C3330' : '#EE9A96',
    dark,
  };
}

/** Chart colors from the CSS tokens; re-read when the theme changes. */
export function useChartTokens(): ChartTokens {
  const [t, setT] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setT(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // The theme may have changed between the first render and this effect: re-read once.
    setT((prev) => { const next = read(); return next.dark === prev.dark ? prev : next; });
    return () => obs.disconnect();
  }, []);
  return t;
}

/** Diverging blue/orange scale centred on the benchmark with a neutral midpoint. Fills stay light enough for ink text. */
export function divergingFill(value: number, center: number, t: ChartTokens, span = 6): string {
  const x = Math.max(-1, Math.min(1, (value - center) / span));
  const mid = t.dark ? [42, 56, 82] : [240, 242, 245];
  const pos = t.dark ? [28, 70, 128] : [176, 205, 240];
  const neg = t.dark ? [110, 62, 22] : [248, 196, 150];
  const to = x >= 0 ? pos : neg;
  const k = Math.abs(x);
  const c = mid.map((m, i) => Math.round(m + (to[i] - m) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function sequentialFill(value: number, min: number, max: number, t: ChartTokens): string {
  const k = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5;
  const lo = t.dark ? [30, 44, 70] : [236, 242, 250];
  const hi = t.dark ? [40, 90, 160] : [150, 186, 232];
  const c = lo.map((l, i) => Math.round(l + (hi[i] - l) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

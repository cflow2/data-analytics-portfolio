import type { ReactNode } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { Delta, SampleBadge, cx } from './primitives';

export function KpiCard({ label, value, sub, delta, deltaUnit = 'pts', deltaDigits = 1, invert, compareLabel, n, spark, sparkFaded, className, children }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number | null;
  deltaUnit?: string;
  deltaDigits?: number;
  /** true when a rise is bad (e.g. detractors) */
  invert?: boolean;
  compareLabel?: string;
  n?: number;
  spark?: (number | null)[];
  sparkFaded?: boolean[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <article className={cx('flex flex-col rounded-[12px] border border-border bg-surface p-4', className)} aria-label={label}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xs font-medium text-muted">{label}</h2>
        {spark && <Sparkline values={spark} faded={sparkFaded} color="var(--c-calls)" label={`${label} trend, last ${spark.length} weeks`} />}
      </div>
      <div className="mt-1 flex items-baseline gap-2 font-display text-[28px] font-semibold leading-tight tnum">
        {value}
        {n !== undefined && <span className="font-sans text-xs font-normal text-muted">n={n.toLocaleString()}</span>}
        {n !== undefined && <SampleBadge n={n} />}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted tnum">{sub}</div>}
      {delta !== undefined && (
        <div className="mt-auto flex items-center gap-1.5 pt-1.5">
          <Delta value={delta} unit={deltaUnit} digits={deltaDigits} invert={invert} />
          {compareLabel && <span className="text-xs text-muted">vs {compareLabel}</span>}
        </div>
      )}
      {children}
    </article>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { SAMPLE_FLAG_LABEL, sampleFlag, type SampleThresholds } from '@/lib/ltr';
import type { Maturity, Status } from '@/domain/types';
import { useSettings } from '@/state/settings';
import { Icon, type IconName } from './Icon';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, title, actions, as: As = 'section' }: {
  children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; as?: 'section' | 'div' | 'article';
}) {
  return (
    <As className={cx('rounded-[12px] border border-border bg-surface p-4', className)}>
      {(title || actions) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      {children}
    </As>
  );
}

export function Button({ variant = 'secondary', icon, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName;
}) {
  const styles = {
    primary: 'bg-calls text-white border-calls hover:opacity-90 dark:text-[#0d1524]',
    secondary: 'bg-surface text-ink border-border hover:bg-surface-2',
    ghost: 'bg-transparent text-muted border-transparent hover:bg-surface-2 hover:text-ink',
    danger: 'bg-surface text-surveys border-surveys hover:bg-surveys-soft',
  }[variant];
  return (
    <button
      type="button"
      className={cx('motion inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50', styles, className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/** Sample-size badge. Plain (10–29) renders nothing. */
export function SampleBadge({ n, thresholds }: { n: number; thresholds?: SampleThresholds }) {
  const t = useSettings((s) => s.thresholds);
  const flag = sampleFlag(n, thresholds ?? t);
  const label = SAMPLE_FLAG_LABEL[flag];
  if (!label) return null;
  const style = flag === 'strong' ? 'bg-calls-soft text-calls' : flag === 'directional' ? 'bg-watch text-watch-ink' : 'bg-stable text-muted';
  return <span className={cx('inline-flex items-center rounded-full px-1.5 py-px text-[11px] font-medium leading-4', style)}>{label}</span>;
}

/** "94.7% n=131" — LTR always carries its n. */
export function PctN({ pct, n, digits = 1, className }: { pct: number | null; n: number; digits?: number; className?: string }) {
  return (
    <span className={cx('tnum inline-flex items-baseline gap-1.5', className)}>
      <span>{pct === null ? '—' : `${pct.toFixed(digits)}%`}</span>
      <span className="text-xs text-muted">n={n.toLocaleString()}</span>
      <SampleBadge n={n} />
    </span>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  ACT: 'bg-surveys text-white dark:text-[#0d1524]',
  WATCH: 'bg-watch text-watch-ink',
  GROW: 'bg-grow text-white dark:text-[#0d1524]',
  STABLE: 'bg-stable text-muted',
};
export function StatusPill({ status }: { status: Status }) {
  return <span className={cx('inline-flex rounded-full px-2 py-px text-[11px] font-semibold tracking-wide', STATUS_STYLE[status])}>{status}</span>;
}

const MATURITY_STYLE: Record<Maturity, string> = {
  Emerging: 'border-border text-muted',
  Repeated: 'border-calls text-calls',
  Corroborated: 'border-calls bg-calls-soft text-calls',
  Validated: 'border-grow bg-grow-soft text-grow',
};
export function MaturityBadge({ maturity }: { maturity: Maturity }) {
  return <span className={cx('inline-flex rounded-md border px-1.5 py-px text-[11px] font-medium', MATURITY_STYLE[maturity])}>{maturity}</span>;
}

/** Delta with arrow and sign, never color alone. */
export function Delta({ value, unit = 'pts', digits = 1, invert = false }: { value: number | null; unit?: string; digits?: number; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-xs text-muted">—</span>;
  const rounded = Number(value.toFixed(digits));
  const up = rounded > 0, flat = rounded === 0;
  const good = invert ? !up : up;
  const cls = flat ? 'text-muted' : good ? 'text-calls' : 'text-surveys';
  return (
    <span className={cx('tnum text-xs font-medium', cls)}>
      {flat ? '■' : up ? '▲' : '▼'} {up ? '+' : ''}{rounded.toFixed(digits)}{unit ? ` ${unit}` : ''}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />;
}

export function EmptyState({ title, body, files, action }: { title: string; body?: string; files?: string[]; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-surface px-6 py-12 text-center">
      <Icon name="upload" size={28} className="mb-3 text-muted" />
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-muted">{body}</p>}
      {files && files.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {files.map((f) => <li key={f}><code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{f}</code></li>)}
        </ul>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div role="alert" className="rounded-[12px] border border-surveys bg-surveys-soft p-4 text-sm">
      <strong className="font-semibold">Something went wrong.</strong> <span className="text-muted">{error.message}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Select<T extends string>({ label, value, onChange, options, className }: {
  label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string;
}) {
  return (
    <label className={cx('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-ink"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function DemoBanner() {
  return <span className="rounded-md bg-watch px-1.5 py-px text-[11px] font-bold tracking-wider text-watch-ink">DEMO</span>;
}

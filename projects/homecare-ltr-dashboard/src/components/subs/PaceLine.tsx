import { paceText, type SubsPace } from '@/analytics/subscriptions';
import { cx } from '@/components/ui/primitives';

/** “On pace to beat FW42” indicator with the projection and what's needed per remaining day. */
export function PaceLine({ s }: { s: { pace: SubsPace; fw: number } }) {
  const p = s.pace;
  const good = p.status !== 'behind';
  return (
    <div className={cx('mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm', good ? 'border-grow bg-grow-soft' : 'border-surveys bg-surveys-soft')} role="status">
      <span className={cx('rounded-full px-2 py-px text-xs font-semibold text-white dark:text-[#0d1524]', good ? 'bg-grow' : 'bg-surveys')}>{p.beaten ? 'Beat' : good ? 'On pace' : 'Behind'}</span>
      <span className="tnum">{paceText(p, s.fw)}</span>
      {p.method === 'straight-line' && !p.beaten && <span className="text-xs text-muted">Load the export from 7 days ago to project from last week’s pattern instead.</span>}
    </div>
  );
}

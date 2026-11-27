import { useMemo, useState } from 'react';
import type { Dataset } from '@/data/dataset';
import { compareTopics, countsOff, divisionName, sharedNegatives, type TopicRow } from '@/analytics/medalliaTopics';
import { themeName } from '@/domain/taxonomy';
import { Card, Segmented, cx } from '@/components/ui/primitives';

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');

/**
 * Medallia Text Analytics › Top and Bottom Topics for the week, one export per division, next to the app's themes.
 * A comparison only; LTR comes from the Tracker.
 */
export function MedalliaTopicsCard({ ds, fw, division }: { ds: Dataset; fw: number; division: string | null }) {
  const all = ds.medalliaTopics ?? [];
  const hasWeek = all.some((t) => t.fw === fw), hasYtd = all.some((t) => t.fw === 0);
  const [periodPick, setPeriod] = useState<'week' | 'ytd' | null>(null);
  // fw 0 = exports covering a longer range (imported as “Whole export range”)
  const period = periodPick === 'ytd' && hasYtd ? 'ytd' : periodPick === 'week' && hasWeek ? 'week' : hasWeek ? 'week' : hasYtd ? 'ytd' : 'week';
  const c = useMemo(() => compareTopics(all, ds.surveys, ds.tags, period === 'ytd' ? 0 : fw), [all, ds, fw, period]);
  const when = period === 'ytd' ? 'year to date' : `FW${fw}`;
  const options = c.divisions.length > 1 ? ['ALL_LOADED', ...c.divisions] : c.divisions;
  const [pick, setPick] = useState<string | null>(null);
  const sel = pick && options.includes(pick) ? pick : division && c.divisions.includes(division) ? division : options[0];
  const rows = sel === 'ALL_LOADED' ? c.rows : c.rows.filter((r) => r.division === sel);
  const shared = sel === 'ALL_LOADED' ? sharedNegatives(c.rows) : [];
  const missing = ['NORTH', 'SOUTH', 'WEST'].filter((d) => !c.divisions.includes(d));

  if (!c.divisions.length) {
    return (
      <Card title={`Medallia topics · FW${fw}`}>
        <p className="text-sm text-muted">
          No Medallia topic exports for FW{fw}. In Medallia: <strong>Advanced Reporting › Text Analytics</strong>, Survey Program MyLowe’s Rewards HomeCare+,
          Saturday–Friday dates, Time Split Months, Top 2 Box, Comment field “Comment – Homecare+ Score Reason”, Topics Level 2. Run once per division
          (North, South, West), export <strong>Top and Bottom Topics</strong>, and upload the three files on the Data Manager.
        </p>
      </Card>
    );
  }

  const check = c.checks.filter((x) => sel === 'ALL_LOADED' || x.division === sel);
  return (
    <Card title={`Medallia topics · ${when}`} actions={<>
      {hasWeek && hasYtd && <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: `FW${fw}` }, { value: 'ytd', label: 'Year to date' }]} />}
      {options.length > 1 && <Segmented label="Division" value={sel} onChange={setPick} options={options.map((o) => ({ value: o, label: o === 'ALL_LOADED' ? 'All loaded' : divisionName(o) }))} />}
    </>}>
      {period === 'ytd' && !hasWeek && <p className="mb-2 text-xs text-muted">No FW{fw} exports yet; showing the year-to-date exports.</p>}
      <p className="mb-2 text-xs text-muted">
        Medallia’s own topic tags on the HomeCare+ comment (Text Analytics › Top and Bottom Topics). Impact is Medallia’s estimate of how much a topic moves Top 2 Box (LTR): positive helps, negative hurts.
        A comparison for the app’s themes; LTR still comes from the Tracker.
      </p>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tnum">
        {check.map((x) => {
          const o = countsOff(x.medallia, x.app);
          const off = o === 'low' || o === 'high';
          return (
            <li key={x.division} className={cx(off && 'text-surveys')}>
              <strong>{divisionName(x.division)}:</strong> Medallia {x.medallia?.toLocaleString('en-US') ?? '—'} comments · app {x.app.toLocaleString('en-US')} with a comment
              {off ? ' · far apart: check the export’s filters' : ''}
            </li>
          );
        })}
        {missing.length > 0 && missing.length < 3 && <li className="text-muted">Not loaded: {missing.map(divisionName).join(', ')}</li>}
      </ul>
      {shared.length > 0 && (
        <p className="mb-2 rounded-lg bg-surveys-soft px-3 py-1.5 text-sm">
          <strong>Negative in more than one division:</strong> {shared.slice(0, 4).map((x) => `${x.topic} (${x.divisions.map(divisionName).join(', ')}; ${x.negative} negative)`).join('; ')}.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm tnum">
          <thead className="text-left text-xs text-muted">
            <tr>
              {sel === 'ALL_LOADED' && <th className="py-1 pr-2 font-medium">Division</th>}
              <th className="py-1 pr-2 font-medium">Medallia topic</th>
              <th className="py-1 pr-2 text-right font-medium">Impact</th>
              <th className="py-1 pr-2 text-right font-medium">Comments</th>
              <th className="py-1 pr-2 text-right font-medium">Positive</th>
              <th className="py-1 pr-2 text-right font-medium">Negative</th>
              <th className="py-1 pr-2 font-medium">App theme (tagged {period === 'ytd' ? 'in loaded weeks' : `in FW${fw}`})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => <TopicLine key={r.id} r={r} showDiv={sel === 'ALL_LOADED'} first={i === 0 || rows[i - 1].section !== r.section || rows[i - 1].division !== r.division} />)}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Medallia usually counts somewhat more comments than the Tracker (it includes responses the Tracker doesn’t); counts turn red only when they’re under 0.7× or over 2× the app’s.{' '}
        <span className="font-medium text-surveys">Not an app theme</span> / <span className="font-medium text-surveys">app found none</span>: Medallia has 3+ negative comments on it, and the app’s themes don’t cover it or tagged none of them this week. Worth a look in the comments, and maybe a new keyword rule. Topics with fewer than 3 comments are greyed out: too few to act on.
        The topic → theme mapping is in <code>src/analytics/medalliaTopics.ts</code>.
      </p>
    </Card>
  );
}

function TopicLine({ r, showDiv, first }: { r: TopicRow; showDiv: boolean; first: boolean }) {
  return (
    <tr className={cx('border-t border-border align-top', r.small && 'text-muted', first && 'border-t-2')}>
      {showDiv && <td className="py-1 pr-2 text-xs">{divisionName(r.division)}</td>}
      <td className="py-1 pr-2">
        <span className={cx('mr-1 rounded px-1 text-[10px] font-medium uppercase', r.section === 'bottom' ? 'bg-surveys-soft text-surveys' : r.section === 'top' ? 'bg-grow-soft text-grow' : 'bg-surface-2 text-muted')}>{r.section === 'list' ? 'topic' : r.section}</span>
        {r.topic}
      </td>
      <td className={cx('py-1 pr-2 text-right', r.impact !== null && r.impact < 0 && 'text-surveys')}>{r.impact === null ? '—' : r.impact.toFixed(2)}</td>
      <td className="py-1 pr-2 text-right">{r.responses}</td>
      <td className="py-1 pr-2 text-right">{r.positive} <span className="text-xs text-muted">({pct(r.positive, r.responses)})</span></td>
      <td className={cx('py-1 pr-2 text-right', r.negative > 0 && 'text-surveys')}>{r.negative} <span className="text-xs text-muted">({pct(r.negative, r.responses)})</span></td>
      <td className="py-1 pr-2 text-xs">
        {r.appTheme ? <>{themeName(r.appTheme)} <span className="text-muted">({r.appCount})</span>{r.gap && <span className="font-medium text-surveys"> · app found none</span>}</>
          : r.gap ? <span className="font-medium text-surveys">Not an app theme</span> : <span className="text-muted">—</span>}
        {r.small && <span className="ml-1 text-muted">· too few</span>}
      </td>
    </tr>
  );
}

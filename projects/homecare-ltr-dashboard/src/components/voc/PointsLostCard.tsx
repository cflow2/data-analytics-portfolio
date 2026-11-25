import type { PointsLost } from '@/analytics/pointsLost';
import { pointsLabel } from '@/analytics/pointsLost';
import { themeName } from '@/domain/taxonomy';
import { Card } from '@/components/ui/primitives';
import { useChartTokens } from '@/components/charts/tokens';

/** Each survey scoring 0–8 costs 100 ÷ n points of LTR; grouped by the comment's primary theme. */
export function PointsLostCard({ p, fw, benchmark, className }: { p: PointsLost; fw: number; benchmark: number; className?: string }) {
  const t = useChartTokens();
  const max = Math.max(0.01, ...p.rows.map((r) => r.pts));
  return (
    <Card className={className} title={`Where LTR points went · FW${fw}`}
      actions={<span className="text-xs text-muted tnum">each 0–8 survey costs {p.n ? (100 / p.n).toFixed(2) : '—'} pts (n={p.n})</span>}>
      {p.n === 0 ? <p className="text-sm text-muted">No surveys this week.</p> : (
        <>
          <p className="mb-2 text-sm tnum">
            LTR {p.ltr?.toFixed(1)}% = 100 − <b>{p.lost.toFixed(1)} pts</b> lost to {p.rows.reduce((a, r) => a + r.count, 0)} surveys that scored 0–8
            {p.belowBenchmark ? <>; <b className="text-surveys">{p.belowBenchmark.toFixed(1)} pts</b> below {benchmark}</> : <>; at or above {benchmark}</>}.
          </p>
          {p.rows.length === 0 ? <p className="text-sm text-muted">Every survey scored 9–10.</p> : (
            <table className="w-full text-sm tnum">
              <caption className="sr-only">LTR points lost by comment theme, FW{fw}</caption>
              <thead className="text-left text-xs text-muted"><tr><th className="py-1 font-medium">Theme of the 0–8 comment</th><th className="text-right font-medium">Surveys</th><th className="w-[40%] font-medium"><span className="sr-only">Bar</span></th><th className="text-right font-medium">Pts</th><th className="text-right font-medium">Prior wk</th></tr></thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.theme} className="border-t border-border">
                    <td className="py-1 pr-2">{pointsLabel(r.theme, (id) => themeName(id))}</td>
                    <td className="text-right">{r.count}</td>
                    <td className="px-2"><div className="h-2.5 rounded-sm" style={{ width: `${(100 * r.pts) / max}%`, background: t.surveys }} aria-hidden /></td>
                    <td className="text-right font-semibold">{r.pts.toFixed(1)}</td>
                    <td className="text-right text-muted">{r.priorPts === null ? '—' : r.priorPts.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted">If those surveys had scored 9–10, LTR would be higher by the points shown. Uses each comment’s primary theme, so the rows add up to the total.</p>
        </>
      )}
    </Card>
  );
}

import { Link, useLocation } from 'react-router';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { useSelectedWeek } from '@/hooks/useWeek';
import { useFilters } from '@/state/filters';
import { useSettings } from '@/state/settings';
import { ltrSummary } from '@/lib/ltr';
import { Card, EmptyState, ErrorState, PageHeader, PctN, Skeleton, Delta } from '@/components/ui/primitives';
import { SCREENS } from '@/screens';
import { monthDay } from '@/lib/dates';

/**
 * Phase 1: a foundation check of the selected week (fiscal info + core counts straight from IndexedDB).
 * The full Command Center (KPI cards, headline, alerts, butterfly, checklist) arrives in phase 3.
 */
export function CommandCenter() {
  const s = SCREENS[0];
  const week = useSelectedWeek();
  const [f] = useFilters();
  const benchmark = useSettings((x) => x.benchmark);
  const { search } = useLocation();
  const q = useLive(async () => {
    const match = (r: { region: string; storeNo: string }) => (!f.region || r.region === f.region) && (!f.store || r.storeNo === f.store);
    const surveys = (await db.surveys.where('fw').equals(week.fw).toArray()).filter(match);
    const prior = (await db.surveys.where('fw').equals(week.fw - 1).toArray()).filter(match);
    const fytd = (await db.surveys.where('fw').between(1, week.fw, true, true).toArray()).filter(match);
    const calls = await db.calls.where('fw').equals(week.fw).toArray();
    const customer = calls.filter((c) => !c.isAssociate);
    return {
      cur: ltrSummary(surveys.map((x) => x.ltr)),
      prior: ltrSummary(prior.map((x) => x.ltr)),
      fytd: ltrSummary(fytd.map((x) => x.ltr)),
      calls: customer.length,
      cases: new Set(customer.map((c) => c.caseNo.trim())).size,
      associate: calls.length - customer.length,
    };
  }, [week.fw, f.region, f.store]);

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      {q.error && <ErrorState error={q.error} />}
      {q.loading && <div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>}
      {q.data && q.data.cur.n === 0 && q.data.calls === 0 && (
        <EmptyState
          title={`No data loaded for FW${week.fw}`}
          body="Upload this week's files on the Data Manager, or load the demo data."
          files={s.needs}
          action={<Link to={{ pathname: '/data', search }} className="text-sm font-medium text-calls underline">Go to Data Manager</Link>}
        />
      )}
      {q.data && (q.data.cur.n > 0 || q.data.calls > 0) && (
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <div className="text-xs font-medium text-muted">LTR · FW{week.fw}</div>
            <div className="mt-1 font-display text-3xl font-semibold"><PctN pct={q.data.cur.pct} n={q.data.cur.n} /></div>
            <div className="mt-1 flex gap-3">
              <Delta value={q.data.cur.pct !== null && q.data.prior.pct !== null ? q.data.cur.pct - q.data.prior.pct : null} />
              <span className="text-xs text-muted">vs FW{week.fw - 1} (n={q.data.prior.n})</span>
            </div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">vs {benchmark}% benchmark</div>
            <div className="mt-1 font-display text-3xl font-semibold tnum">
              {q.data.cur.pct === null ? '—' : `${q.data.cur.pct - benchmark >= 0 ? '+' : ''}${(q.data.cur.pct - benchmark).toFixed(1)} pts`}
            </div>
            <div className="mt-1 text-xs text-muted">n={q.data.cur.n}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">FYTD LTR (FW1–FW{week.fw})</div>
            <div className="mt-1 font-display text-3xl font-semibold"><PctN pct={q.data.fytd.pct} n={q.data.fytd.n} /></div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">Detractors (0–8)</div>
            <div className="mt-1 font-display text-3xl font-semibold tnum">{q.data.cur.detractors} <span className="text-sm font-normal text-muted">of {q.data.cur.n}</span></div>
            <div className="mt-1 text-xs text-muted">{q.data.cur.detractors0to6} scored 0–6</div>
          </Card>
          <Card>
            <div className="text-xs font-medium text-muted">Customer calls</div>
            <div className="mt-1 font-display text-3xl font-semibold tnum">{q.data.calls}</div>
            <div className="mt-1 text-xs text-muted">{q.data.cases} distinct cases · +{q.data.associate} associate/store calls (not VOC)</div>
          </Card>
          <Card className="col-span-3">
            <div className="text-xs font-medium text-muted">Fiscal calendar</div>
            <div className="mt-1 font-display text-lg font-semibold">{week.label}</div>
            <div className="mt-1 text-sm text-muted tnum">
              Fiscal month {week.month} · Q{week.quarter} · Week runs Sat {monthDay(week.start)} – Fri {monthDay(week.end)} · WBR Wednesday {monthDay(week.wbr)}
            </div>
            <p className="mt-3 text-xs text-muted">Phase 1 foundation check. KPI cards with sparklines, headline, alerts, the butterfly chart and the week checklist come in phase 3.</p>
          </Card>
        </div>
      )}
    </>
  );
}

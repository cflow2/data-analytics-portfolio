import { useMemo, useState } from 'react';
import { db } from '@/db/db';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { themeMentions } from '@/analytics/voc';
import { firstSeen, maturity, maturityRank, themeHistory, weekOfTheme, weeksSeen, whatChanged } from '@/analytics/themes';
import type { Signal, Status } from '@/domain/types';
import { useUi } from '@/state/ui';
import { useSettings } from '@/state/settings';
import { weekFacts } from '@/analytics/facts';
import { whatChangedSummary } from '@/writing/write';
import { Butterfly, type ButterflySort } from '@/components/charts/Butterfly';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, Delta, MaturityBadge, PageHeader, Segmented, StatusPill, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';

const STATUSES: Status[] = ['ACT', 'WATCH', 'GROW', 'STABLE'];

function Cell({ value, onSave, label, wide }: { value?: string; onSave: (v: string) => void; label: string; wide?: boolean }) {
  const [v, setV] = useState(value ?? '');
  const presentation = useUi((s) => s.presentation);
  if (presentation) return <span>{value}</span>;
  return <input value={v} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onSave(v)}
    className={cx('h-7 rounded border border-transparent bg-transparent px-1.5 text-sm hover:border-border focus:border-border', wide ? 'w-full min-w-[180px]' : 'w-full min-w-[90px]')} />;
}

export function CrossChannel() {
  const sc = SCREENS.find((x) => x.path === '/cross')!;
  const { data, loading, error } = useWeekData();
  const presentation = useUi((x) => x.presentation);
  const [sort, setSort] = useState<ButterflySort>('mentions');
  const thresholds = useSettings((x) => x.thresholds);

  const v = useMemo(() => {
    if (!data) return null;
    const { ds, week } = data;
    const fw = week.fw;
    const custIds = new Set(ds.calls.filter((c) => !c.isAssociate).map((c) => c.id));
    const h = themeHistory(ds.tagList, custIds);
    const validated = new Set(ds.signals.filter((x) => x.validated).map((x) => x.theme));
    const changes = whatChanged(h, fw, (th) => validated.has(th));
    const summary = whatChangedSummary(weekFacts(ds, fw, data.benchmark, thresholds, data.geo), ds.taxonomy);
    return { fw, h, mentions: themeMentions(ds.tagList, fw, custIds), changes, validated, summary };
  }, [data, thresholds]);

  if (!data || !v) return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading} error={error} empty={false}>{null}</PageGate></>;
  const { ds } = data;
  const tname = (id: string) => ds.taxonomy.find((t) => t.id === id)?.name ?? id;
  const save = (sig: Signal, patch: Partial<Signal>) => db.signals.put({ ...sig, ...patch });
  const addSignal = (theme: string, text?: string) => db.signals.put({
    id: `sig-${Date.now().toString(36)}`, signal: text ?? `${tname(theme)} signal`, theme,
    firstSeenFw: firstSeen(v.h, theme) ?? v.fw, status: ds.taxonomy.find((t) => t.id === theme)?.defaultStatus ?? 'WATCH',
  });
  const withSignal = new Set(ds.signals.map((s) => s.theme));
  const suggestions = ds.taxonomy.filter((t) => t.id !== 'other' && !withSignal.has(t.id) && maturityRank(maturity(v.h, t.id, v.fw)) >= 2);
  const rose = [...v.changes].filter((c) => c.dSurveysPrior + c.dCallsPrior > 0).sort((a, b) => (b.dSurveysPrior + b.dCallsPrior) - (a.dSurveysPrior + a.dCallsPrior));
  const fell = [...v.changes].filter((c) => c.dSurveysPrior + c.dCallsPrior < 0).sort((a, b) => (a.dSurveysPrior + a.dCallsPrior) - (b.dSurveysPrior + b.dCallsPrior));
  const movedUp = v.changes.filter((c) => maturityRank(c.maturityNow) > maturityRank(c.maturityPrev) && c.maturityPrev);
  const fresh = v.changes.filter((c) => c.isNew);

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} />
      <PageGate screen={sc} loading={loading} error={error} empty={v.mentions.length === 0} emptyTitle={`No tagged surveys or calls for FW${v.fw}`}>
        <div className="space-y-3">
          <Butterfly counts={v.mentions} sort={sort} channel={data.filters.channel} title={`Theme mentions · FW${v.fw} · surveys ← → calls`}
            actions={<Segmented<ButterflySort> label="Sort rows by" value={sort} onChange={setSort} options={[{ value: 'mentions', label: 'Mentions' }, { value: 'calls', label: 'Calls' }, { value: 'surveys', label: 'Surveys' }]} />} />
          <p className="-mt-1 text-xs text-muted">Counts are records (a record counts once per theme, as primary or secondary). Survey and call counts are never combined into a rate. One call can carry several themes.</p>

          <Card title={`What changed · FW${v.fw}`}>
            <p className="mb-3 text-sm">{v.summary}</p>
            <div className="grid grid-cols-4 gap-3 text-sm">
              {([['Rose vs FW' + (v.fw - 1), rose], ['Fell vs FW' + (v.fw - 1), fell]] as const).map(([title, list]) => (
                <div key={title}>
                  <h3 className="mb-1 text-xs font-medium text-muted">{title}</h3>
                  {list.length === 0 ? <p className="text-xs text-muted">None</p> : (
                    <ul className="space-y-1 tnum">{list.slice(0, 6).map((c) => (
                      <li key={c.theme}><span className="font-medium">{tname(c.theme)}</span>
                        <div className="text-xs text-muted">Surveys {c.cur.surveys} <Delta value={c.dSurveysPrior} unit="" digits={0} invert /> · Calls {c.cur.calls} <Delta value={c.dCallsPrior} unit="" digits={0} invert /></div>
                        <div className="text-[11px] text-muted">vs 4-wk avg: surveys {c.dSurveysAvg >= 0 ? '+' : ''}{c.dSurveysAvg.toFixed(1)}, calls {c.dCallsAvg >= 0 ? '+' : ''}{c.dCallsAvg.toFixed(1)}</div>
                      </li>))}</ul>
                  )}
                </div>
              ))}
              <div>
                <h3 className="mb-1 text-xs font-medium text-muted">New this week</h3>
                {fresh.length === 0 ? <p className="text-xs text-muted">No theme is new vs the prior 4 weeks.</p> : <ul className="space-y-1">{fresh.map((c) => <li key={c.theme}>{tname(c.theme)} <span className="text-xs text-muted">({c.cur.surveys} surveys · {c.cur.calls} calls)</span></li>)}</ul>}
              </div>
              <div>
                <h3 className="mb-1 text-xs font-medium text-muted">Moved up in maturity</h3>
                {movedUp.length === 0 ? <p className="text-xs text-muted">None</p> : <ul className="space-y-1">{movedUp.map((c) => <li key={c.theme} className="flex flex-wrap items-center gap-1">{tname(c.theme)}: {c.maturityPrev && <MaturityBadge maturity={c.maturityPrev} />} → {c.maturityNow && <MaturityBadge maturity={c.maturityNow} />}</li>)}</ul>}
              </div>
            </div>
          </Card>

          <Card title={`Signal Register · ${ds.signals.length}`} actions={!presentation && (
            <Button icon="sparkles" onClick={() => addSignal(ds.taxonomy[0].id, 'New signal')}>Add signal</Button>
          )}>
            {suggestions.length > 0 && !presentation && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">Themes with repeated or corroborated evidence and no signal yet:</span>
                {suggestions.map((t) => <Button key={t.id} variant="ghost" className="h-7 px-2 text-xs" onClick={() => addSignal(t.id)}>+ {t.name}</Button>)}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm tnum">
                <thead className="text-left text-xs text-muted">
                  <tr>{['Signal', 'Theme', 'First seen', 'Weeks seen', `Surveys FW${v.fw}`, `Calls FW${v.fw}`, 'Maturity', 'Status', 'Owner', 'Next action', 'Notes', ''].map((h) => <th key={h} className="px-1.5 py-1.5 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {ds.signals.length === 0 && <tr><td colSpan={12} className="py-6 text-center text-muted">No signals yet. Add one, or use a suggestion above.</td></tr>}
                  {[...ds.signals].sort((a, b) => a.firstSeenFw - b.firstSeenFw).map((sig) => {
                    const cur = weekOfTheme(v.h, sig.theme, v.fw);
                    const mat = maturity(v.h, sig.theme, v.fw, sig.validated);
                    return (
                      <tr key={sig.id} className="border-t border-border align-middle">
                        <td className="px-1.5 py-1"><Cell value={sig.signal} label="Signal" wide onSave={(x) => save(sig, { signal: x })} /></td>
                        <td className="px-1.5">{presentation ? tname(sig.theme) : (
                          <select value={sig.theme} aria-label="Theme" onChange={(e) => save(sig, { theme: e.target.value })} className="h-7 rounded border border-border bg-surface px-1 text-xs">
                            {ds.taxonomy.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>)}</td>
                        <td className="px-1.5">FW{sig.firstSeenFw}</td>
                        <td className="px-1.5">{weeksSeen(v.h, sig.theme, sig.firstSeenFw, v.fw)}</td>
                        <td className="px-1.5">{cur.surveys}</td>
                        <td className="px-1.5">{cur.calls}</td>
                        <td className="px-1.5">
                          <div className="flex items-center gap-1.5">
                            {mat ? <MaturityBadge maturity={mat} /> : <span className="text-xs text-muted">Not seen</span>}
                            {!presentation && <label className="flex items-center gap-1 text-[11px] text-muted" title="Validated = confirmed with operational proof (set manually)">
                              <input type="checkbox" checked={!!sig.validated} onChange={(e) => save(sig, { validated: e.target.checked })} />Validated</label>}
                          </div>
                        </td>
                        <td className="px-1.5">{presentation ? <StatusPill status={sig.status} /> : (
                          <select value={sig.status} aria-label="Status" onChange={(e) => save(sig, { status: e.target.value as Status })} className="h-7 rounded border border-border bg-surface px-1 text-xs">
                            {STATUSES.map((x) => <option key={x}>{x}</option>)}
                          </select>)}</td>
                        <td className="px-1.5"><Cell value={sig.owner} label="Owner" onSave={(x) => save(sig, { owner: x })} /></td>
                        <td className="px-1.5"><Cell value={sig.nextAction} label="Next action" wide onSave={(x) => save(sig, { nextAction: x })} /></td>
                        <td className="px-1.5"><Cell value={sig.notes} label="Notes" wide onSave={(x) => save(sig, { notes: x })} /></td>
                        <td className="px-1.5">{!presentation && <Button variant="ghost" aria-label={`Delete signal ${sig.signal}`} onClick={() => db.signals.delete(sig.id)}><Icon name="trash" size={14} /></Button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Maturity over the last 4 weeks: Emerging = 1 week · Repeated = 2+ weeks · Corroborated = seen in both surveys and calls · Validated = confirmed with operational proof (tick the box).</p>
          </Card>
        </div>
      </PageGate>
    </>
  );
}

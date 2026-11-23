import { useMemo, useState } from 'react';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { byWeek, districtFor, impact, weekOf } from '@/analytics/ltr';
import { REGIONS, UNMAPPED, regionSortKey, storeLabel } from '@/domain/geo';
import { canColor, type LtrSummary } from '@/lib/ltr';
import { useSettings } from '@/state/settings';
import { useFilters } from '@/state/filters';
import { downloadCsv } from '@/data/export';
import { divergingFill, useChartTokens } from '@/components/charts/tokens';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, PageHeader, Segmented, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { StoreDrawer } from '@/components/data/StoreDrawer';
import type { SurveyRecord } from '@/domain/types';

type SortKey = 'ltr' | 'n' | 'impact';
interface Node { key: string; label: string; level: 'region' | 'district' | 'store'; storeNo?: string; m: Map<number, LtrSummary>; children: Node[] }

const WEEKS_SHOWN = 8;

function build(surveys: SurveyRecord[], stores: Parameters<typeof districtFor>[1]): Node[] {
  const regions = new Map<string, SurveyRecord[]>();
  for (const s of surveys) regions.set(s.region || '—', [...(regions.get(s.region || '—') ?? []), s]);
  for (const r of REGIONS) if (!regions.has(r)) regions.set(r, []);
  return [...regions].map(([r, rs]) => {
    const dists = new Map<string, SurveyRecord[]>();
    for (const s of rs) { const d = districtFor(s.storeNo, stores); dists.set(d, [...(dists.get(d) ?? []), s]); }
    return {
      key: r, label: r, level: 'region' as const, m: byWeek(rs),
      children: [...dists].map(([d, ds]) => {
        const st = new Map<string, SurveyRecord[]>();
        for (const s of ds) st.set(s.storeNo, [...(st.get(s.storeNo) ?? []), s]);
        return {
          key: `${r}/${d}`, label: d, level: 'district' as const, m: byWeek(ds),
          children: [...st].map(([no, ss]) => ({ key: `${r}/${d}/${no}`, label: storeLabel(no, stores), level: 'store' as const, storeNo: no, m: byWeek(ss), children: [] })),
        };
      }),
    };
  });
}

export function RegionalDrilldown() {
  const s = SCREENS.find((x) => x.path === '/regions')!;
  const { data, loading, error } = useWeekData();
  const [f] = useFilters();
  const thresholds = useSettings((x) => x.thresholds);
  const t = useChartTokens();
  const [sort, setSort] = useState<SortKey>('ltr');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<string | null>(null);

  const v = useMemo(() => {
    if (!data) return null;
    const fw = data.week.fw;
    const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => fw - WEEKS_SHOWN + 1 + i).filter((w) => w >= 1);
    const scoped = data.ltr.filter((x) => x.fw >= weeks[0] && x.fw <= fw);
    const tree = build(scoped, data.ds.stores);
    const totalN = weekOf(data.weekly, fw).n;
    const key = (n: Node) => {
      const c = weekOf(n.m, fw);
      if (sort === 'n') return -c.n;
      if (sort === 'impact') return -impact(c, totalN);
      return c.pct === null ? 999 : c.pct; // lowest LTR first
    };
    const sortRec = (ns: Node[]): Node[] => ns.sort((a, b) => key(a) - key(b) || regionSortKey(a.label) - regionSortKey(b.label)).map((n) => ({ ...n, children: sortRec(n.children) }));
    return { fw, weeks, tree: sortRec(tree), totalN };
  }, [data, sort]);

  // Geography filter: auto-expand the chosen region/district.
  const effectiveOpen = useMemo(() => {
    const o = new Set(open);
    if (f.region) o.add(f.region);
    if (f.region && f.district) o.add(`${f.region}/${f.district}`);
    return o;
  }, [open, f.region, f.district]);

  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const visible: Node[] = [];
  if (v) {
    const walk = (ns: Node[]) => { for (const n of ns) { visible.push(n); if (effectiveOpen.has(n.key)) walk(n.children); } };
    walk(v.tree.filter((n) => !f.region || n.key === f.region).map((r) => ({ ...r, children: r.children.filter((d) => !f.district || d.label === f.district).map((d) => ({ ...d, children: d.children.filter((st) => !f.store || st.storeNo === f.store) })) })));
  }

  const exportCsv = () => {
    if (!v) return;
    const columns = ['Level', 'Name', ...v.weeks.flatMap((w) => [`FW${w} LTR %`, `FW${w} n`]), `FW${v.fw} detractors`];
    const rows = visible.map((n) => [n.level, n.label, ...v.weeks.flatMap((w) => { const c = weekOf(n.m, w); return [c.pct === null ? null : Number(c.pct.toFixed(1)), c.n]; }), weekOf(n.m, v.fw).detractors]);
    downloadCsv(`Regional_drilldown_FW${v.fw}`, { columns, rows });
  };

  return (
    <>
      <PageHeader title={s.title} subtitle={s.subtitle} />
      <PageGate screen={s} loading={loading} error={error} empty={!!data && data.ltr.length === 0}>
        {data && v && (
          <Card
            title={`LTR by region → district → store · FW${v.weeks[0]}–FW${v.fw}`}
            actions={
              <>
                <span className="text-xs text-muted">Sort</span>
                <Segmented<SortKey> label="Sort rows by" value={sort} onChange={setSort} options={[{ value: 'ltr', label: 'Lowest LTR' }, { value: 'n', label: 'n' }, { value: 'impact', label: 'Impact' }]} />
                <Button variant="ghost" className="h-8 text-xs" icon="download" onClick={exportCsv}>CSV</Button>
              </>
            }
          >
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span>below</span>
                <span className="inline-block h-3 w-40 rounded" style={{ background: `linear-gradient(90deg, ${divergingFill(data.benchmark - 6, data.benchmark, t)}, ${divergingFill(data.benchmark, data.benchmark, t)}, ${divergingFill(data.benchmark + 6, data.benchmark, t)})` }} aria-hidden />
                <span>above {data.benchmark}%</span>
              </span>
              <span>Colour only when n ≥ {thresholds.noTrendBelow}. Impact = detractors × share of n (FW{v.fw}).</span>
              <span>{data.ds.stores.size ? `${[...data.ds.stores.values()].filter((x) => !x.district).length} stores unmapped (shown under “${UNMAPPED}”)` : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-[2px] text-sm tnum">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="sticky left-0 bg-surface px-2 py-1 font-medium">Region / district / store</th>
                    {v.weeks.map((w) => <th key={w} className={cx('px-2 py-1 text-center font-medium', w === v.fw && 'text-ink')}>FW{w}</th>)}
                    <th className="px-2 py-1 text-right font-medium">Det. FW{v.fw}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && <tr><td colSpan={v.weeks.length + 2} className="py-6 text-center text-muted">No surveys match the filters.</td></tr>}
                  {visible.map((n) => {
                    const expandable = n.children.length > 0;
                    const isOpen = effectiveOpen.has(n.key);
                    const indent = n.level === 'region' ? 0 : n.level === 'district' ? 18 : 36;
                    return (
                      <tr key={n.key} className={cx(n.level === 'region' && 'font-medium')}>
                        <th scope="row" className="sticky left-0 z-[1] bg-surface px-2 py-1 text-left font-normal" style={{ paddingLeft: 8 + indent }}>
                          {expandable ? (
                            <button type="button" onClick={() => toggle(n.key)} aria-expanded={isOpen} className="inline-flex items-center gap-1 hover:text-calls">
                              <Icon name={isOpen ? 'chevronLeft' : 'chevronRight'} size={13} className={cx(isOpen && '-rotate-90')} />
                              <span className={cx(n.level === 'region' && 'font-semibold')}>{n.label}</span>
                              <span className="text-xs text-muted">({n.children.length})</span>
                            </button>
                          ) : (
                            <button type="button" onClick={() => n.storeNo && setDrawer(n.storeNo)} className="text-left text-calls underline-offset-2 hover:underline">{n.label}</button>
                          )}
                        </th>
                        {v.weeks.map((w) => {
                          const c = weekOf(n.m, w);
                          const colored = c.pct !== null && canColor(c.n, thresholds);
                          const pos = c.pct !== null && c.pct >= data.benchmark;
                          return (
                            <td key={w} className={cx('min-w-[92px] rounded-md px-2 py-1 text-center', !colored && 'text-muted', w === v.fw && 'ring-1 ring-border')}
                              style={colored ? { background: divergingFill(c.pct!, data.benchmark, t) } : undefined}
                              title={c.pct === null ? `FW${w}: no surveys` : `FW${w}: ${c.pct.toFixed(1)}% (n=${c.n}), ${pos ? 'above' : 'below'} ${data.benchmark}%`}>
                              {c.pct === null ? <span className="text-xs">—</span> : (
                                <>
                                  <div className={cx('text-sm', colored && 'text-ink')}>{c.pct.toFixed(1)}%</div>
                                  <div className="text-[11px] leading-tight text-muted">n={c.n}{colored ? (pos ? ' · ▲ above' : ' · ▼ below') : ' · no trend'}</div>
                                </>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-right">{weekOf(n.m, v.fw).detractors || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </PageGate>
      {drawer && data && <StoreDrawer storeNo={drawer} fw={data.week.fw} onClose={() => setDrawer(null)} />}
    </>
  );
}

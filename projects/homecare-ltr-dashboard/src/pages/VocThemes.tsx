import { useMemo, useState } from 'react';
import { useWeekData } from '@/data/useWeekData';
import { SCREENS } from '@/screens';
import { districtFor } from '@/analytics/ltr';
import { maturity, themeHistory, weekOfTheme } from '@/analytics/themes';
import { storeLabel, REGIONS } from '@/domain/geo';
import { monthDay } from '@/lib/dates';
import { togglePin } from '@/tagging/manual';
import type { Sentiment, SurveyRecord, ThemeTag } from '@/domain/types';
import { useUi } from '@/state/ui';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { PageGate } from '@/components/ui/PageGate';
import { Button, Card, Delta, MaturityBadge, PageHeader, Select, StatusPill, cx } from '@/components/ui/primitives';
import { RedactedText } from '@/components/data/RedactedText';
import { TagEditor } from '@/components/voc/TagEditor';

interface Row { s: SurveyRecord; tag?: ThemeTag }

export function VocThemes() {
  const sc = SCREENS.find((x) => x.path === '/voc')!;
  const { data, loading, error } = useWeekData();
  const presentation = useUi((x) => x.presentation);
  const [theme, setTheme] = useState('all');
  const [sentiment, setSentiment] = useState<'all' | Sentiment>('all');
  const [band, setBand] = useState<'all' | '0-6' | '7-8' | '9-10'>('all');
  const [region, setRegion] = useState('all');
  const [q, setQ] = useState('');

  const v = useMemo(() => {
    if (!data) return null;
    const { ds, week, geo } = data;
    const fw = week.fw;
    const geoOk = (s: SurveyRecord) => (!geo.region || s.region === geo.region) && (!geo.district || districtFor(s.storeNo, ds.stores) === geo.district) && (!geo.store || s.storeNo === geo.store);
    const vocAll = ds.surveys.filter((s) => s.comment && geoOk(s));
    const ids = new Set(vocAll.map((s) => s.id));
    const custIds = new Set(ds.calls.filter((c) => !c.isAssociate).map((c) => c.id));
    const surveyTags = ds.tagList.filter((t) => t.channel === 'survey' && ids.has(t.recordId));
    const h = themeHistory(surveyTags, custIds);
    const hAll = themeHistory(ds.tagList.filter((t) => t.channel === 'call' || ids.has(t.recordId)), custIds); // for corroboration with calls
    const validated = new Set(ds.signals.filter((x) => x.validated).map((x) => x.theme));
    const rows: Row[] = vocAll.filter((s) => s.fw === fw).map((s) => ({ s, tag: ds.tags.get(s.id) }));
    const cards = ds.taxonomy.filter((t) => t.id !== 'other').map((t) => {
      const cur = weekOfTheme(h, t.id, fw);
      const prev = weekOfTheme(h, t.id, fw - 1);
      return { def: t, cur, prev, calls: weekOfTheme(hAll, t.id, fw).calls, maturity: maturity(hAll, t.id, fw, validated.has(t.id)) };
    }).sort((a, b) => b.cur.surveys - a.cur.surveys);
    const recent = (th: string) => vocAll.filter((s) => s.fw > fw - 4 && s.fw <= fw && (() => { const t = ds.tags.get(s.id); return t && (t.primary === th || t.secondary.includes(th)); })())
      .sort((a, b) => b.date.localeCompare(a.date));
    return { fw, rows, cards, pins: ds.pins[fw] ?? {}, serviceAdd: recent('service-add'), aging: recent('aging'), untagged: rows.filter((r) => !r.tag).length };
  }, [data]);

  const filtered = useMemo(() => (v?.rows ?? []).filter(({ s, tag }) => {
    if (theme !== 'all' && !(tag && (tag.primary === theme || tag.secondary.includes(theme)))) return false;
    if (sentiment !== 'all' && tag?.sentiment !== sentiment) return false;
    const sc2 = s.ltr;
    if (band === '0-6' && !(sc2 !== null && sc2 <= 6)) return false;
    if (band === '7-8' && !(sc2 === 7 || sc2 === 8)) return false;
    if (band === '9-10' && !(sc2 !== null && sc2 >= 9)) return false;
    if (region !== 'all' && s.region !== region) return false;
    if (q && !s.comment.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [v, theme, sentiment, band, region, q]);

  if (!data || !v) return <><PageHeader title={sc.title} subtitle={sc.subtitle} /><PageGate screen={sc} loading={loading} error={error} empty={false}>{null}</PageGate></>;
  const { ds } = data;
  const tname = (id: string) => ds.taxonomy.find((t) => t.id === id)?.name ?? id;
  const pinnedIds = new Set(Object.values(v.pins));

  const cols: Col<Row>[] = [
    { id: 'date', header: 'Date', value: (r) => r.s.date, cell: (r) => <span className="whitespace-nowrap">{monthDay(r.s.date)}</span>, width: 64 },
    { id: 'store', header: 'Store', value: (r) => storeLabel(r.s.storeNo, ds.stores), width: 150 },
    { id: 'region', header: 'Region', value: (r) => r.s.region, width: 60 },
    { id: 'score', header: 'Score', value: (r) => r.s.ltr, align: 'right', width: 56, cell: (r) => <span className={cx('font-semibold', (r.s.ltr ?? 10) <= 8 && 'text-surveys')}>{r.s.ltr ?? '—'}</span> },
    { id: 'comment', header: 'Comment (redacted)', value: (r) => r.s.comment, sortable: false, width: '40%', cell: (r) => <RedactedText recordId={r.s.id} field="comment" text={r.s.comment} /> },
    { id: 'tags', header: 'Themes · sentiment', value: (r) => (r.tag ? [r.tag.primary, ...r.tag.secondary].map(tname).join(' + ') : 'Untagged'), width: 300,
      exportExtra: [{ header: 'Sentiment', value: (r) => r.tag?.sentiment ?? '' }, { header: 'Tag source', value: (r) => r.tag?.source ?? '' }],
      cell: (r) => <TagEditor recordId={r.s.id} channel="survey" fw={r.s.fw} tag={r.tag} taxonomy={ds.taxonomy} compact /> },
    { id: 'pin', header: 'WBR', value: (r) => (pinnedIds.has(r.s.id) ? 'Pinned' : ''), width: 80, sortable: false,
      cell: (r) => {
        const th = r.tag?.primary;
        if (!th || th === 'other') return <span className="text-xs text-muted">—</span>;
        const pinned = v.pins[th] === r.s.id;
        return presentation || ds.weeks.get(r.s.fw)?.locked ? (pinned ? <span className="text-xs">Pinned</span> : null) : (
          <Button variant={pinned ? 'primary' : 'ghost'} className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); void togglePin(v.fw, th, r.s.id); }}
            title={pinned ? 'Unpin' : v.pins[th] ? `Replace the pinned ${tname(th)} quote` : `Pin as the ${tname(th)} quote for the WBR`}>
            {pinned ? 'Pinned' : 'Pin'}
          </Button>
        );
      } },
  ];

  return (
    <>
      <PageHeader title={sc.title} subtitle={sc.subtitle} />
      <PageGate screen={sc} loading={loading} error={error} empty={v.rows.length === 0} emptyTitle={`No survey comments for FW${v.fw}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {v.cards.map((c) => (
              <button key={c.def.id} type="button" onClick={() => setTheme(theme === c.def.id ? 'all' : c.def.id)} aria-pressed={theme === c.def.id}
                className={cx('motion rounded-[12px] border bg-surface p-3 text-left hover:border-calls', theme === c.def.id ? 'border-calls ring-1 ring-calls' : 'border-border')}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium">{c.def.name}</span>
                  <StatusPill status={c.def.defaultStatus} />
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-semibold tnum">{c.cur.surveys}</span>
                  <span className="text-xs text-muted">survey mention{c.cur.surveys === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted tnum">
                  <span>{c.cur.pos} positive · {c.cur.neg} negative</span>
                  <Delta value={c.cur.surveys - c.prev.surveys} unit="" digits={0} invert={c.def.defaultStatus !== 'GROW'} />
                  <span>vs FW{v.fw - 1}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                  {c.maturity ? <MaturityBadge maturity={c.maturity} /> : <span>Not seen</span>}
                  <span>Calls: {c.calls}</span>
                </div>
              </button>
            ))}
          </div>

          <Card title={`Quote explorer · FW${v.fw}`} actions={<span className="text-xs text-muted">{Object.keys(v.pins).length} quote(s) pinned to the WBR (max 1 per theme) · {v.untagged} untagged</span>}>
            <DataTable rows={filtered} columns={cols} getRowId={(r) => r.s.id} exportName={`VOC_quotes_FW${v.fw}`} maxHeight={620}
              initialSort={[{ id: 'score', desc: false }]} empty="No comments match these filters."
              rowClassName={(r) => (pinnedIds.has(r.s.id) ? 'bg-calls-soft/40' : undefined)}
              toolbar={
                <>
                  <Select label="Theme" value={theme} onChange={setTheme} options={[{ value: 'all', label: 'All themes' }, ...ds.taxonomy.map((t) => ({ value: t.id, label: t.name }))]} />
                  <Select label="Sentiment" value={sentiment} onChange={setSentiment} options={[{ value: 'all', label: 'All' }, { value: 'Positive', label: 'Positive' }, { value: 'Neutral', label: 'Neutral' }, { value: 'Negative', label: 'Negative' }]} />
                  <Select label="Score" value={band} onChange={setBand} options={[{ value: 'all', label: 'All' }, { value: '0-6', label: '0–6' }, { value: '7-8', label: '7–8' }, { value: '9-10', label: '9–10' }]} />
                  <Select label="Region" value={region} onChange={setRegion} options={[{ value: 'all', label: 'All' }, ...REGIONS.map((r) => ({ value: r, label: r }))]} />
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Search</span>
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. tankless" className="h-8 w-48 rounded-lg border border-border bg-surface px-2 text-sm" aria-label="Search comments" />
                  </label>
                </>
              } />
          </Card>

          <div className="grid grid-cols-2 gap-3">
            {([['service-add', 'Service-add requests', v.serviceAdd], ['aging', 'Aging in place / accessibility', v.aging]] as const).map(([id, title, list]) => (
              <Card key={id} title={<span className="flex items-center gap-2">{title} <StatusPill status="GROW" /> <span className="text-xs font-normal text-muted">last 4 weeks · {list.length}</span></span>}>
                {list.length === 0 ? <p className="text-sm text-muted">None in FW{v.fw - 3}–FW{v.fw}.</p> : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto text-sm" tabIndex={0}>
                    {list.slice(0, 40).map((s) => (
                      <li key={s.id} className="border-l-2 border-grow pl-2">
                        <div className="text-xs text-muted tnum">FW{s.fw} · {monthDay(s.date)} · {storeLabel(s.storeNo, ds.stores)} · score {s.ltr ?? '—'}</div>
                        <RedactedText recordId={s.id} field="comment" text={s.comment} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </div>
      </PageGate>
    </>
  );
}

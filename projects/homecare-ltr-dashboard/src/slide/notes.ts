/**
 * Speaker notes for the LTR slide: a 4–4.5 minute talk track in slide order (KPIs, trend, drivers, divisions,
 * callouts, cards, RedVest shout-out, close), then a “Back pocket” section. Every number comes from the metrics.
 */
import { atOrAbove, type DriverValue, type RegionRow, type SlideMetrics, type WeekStats } from './ltrMetrics';
import type { SlideEdits } from './state';

export const WORDS_PER_MINUTE = 140;
const pts = (d: number | null) => (d === null ? 'with no prior week to compare' : d === 0 ? 'flat' : `${d > 0 ? 'up' : 'down'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'}`);
const pct1 = (w: WeekStats) => (w.ltr === null ? '—' : (Math.floor(w.ltr * 10 + 0.5 + 1e-9) / 10).toFixed(1));
const title = (d: string) => d[0] + d.slice(1).toLowerCase();
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
const CAT_PHRASE: Record<string, string> = { SCOPE: 'scope, meaning what HomeCare+ covers', EXECUTION: 'execution on the visit', CONFIRMING: 'confirming and scheduling appointments' };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function regionSentence(r: RegionRow, why: string, categories: string[], benchmark: number): string {
  const move = r.delta === null ? '' : r.delta === 0 ? ', flat on last week' : `, ${r.delta > 0 ? 'up' : 'down'} ${Math.abs(r.delta)} from ${r.prior.display} on ${r.prior.n} surveys`;
  const status = atOrAbove(r.cur, benchmark) ? `at or above ${benchmark}` : `below ${benchmark}`;
  const caution = r.lowCount ? ` That's fewer than 10 surveys, so one score moves it a lot; we watch it, we don't react to it.` : '';
  const cat = categories.filter((c) => c !== 'LOW SURVEY COUNT' && c !== 'ABOVE BENCHMARK');
  return `${r.region} came in at ${r.cur.display}${move}, ${status}. ${why[0]?.toUpperCase() ?? ''}${why.slice(1)}.${cat.length ? ` The comments point to ${list(cat.map((c) => CAT_PHRASE[c] ?? c.toLowerCase()))}.` : ''}${caution}`;
}

export function talkTrack(m: SlideMetrics, drivers: DriverValue[], e: SlideEdits): { text: string; words: number; minutes: number } {
  const { cur, prior, benchmark } = m;
  const lines: string[] = ['TALK TRACK'];

  // 1. KPIs
  const below = m.regionsWithSurveys - m.regionsAtOrAbove;
  lines.push(`1. KPIs. FW${m.fw} LTR came in at ${cur.display} on ${cur.n} surveys, ${pts(m.delta)} from ${prior.display ?? '—'} in FW${m.fw - 1}. Against our ${benchmark} benchmark that's ${m.benchDelta === null ? '—' : m.benchDelta >= 0 ? `${m.benchDelta} point${m.benchDelta === 1 ? '' : 's'} above` : `${Math.abs(m.benchDelta)} point${m.benchDelta === -1 ? '' : 's'} below`}. Put simply, ${cur.promoters} of the ${cur.n} members who answered gave us a 9 or a 10. ${m.regionsAtOrAbove} of our ${m.regionsWithSurveys} regions were at or above ${benchmark}, so ${plural(below, 'region')} ${below === 1 ? 'was' : 'were'} under. ${cur.low08} members scored us 0 to 8 this week, compared with ${prior.low08} last week.${e.showAllowance ? ` To hold ${benchmark} on ${cur.n} surveys we could afford ${cur.allowed} of those, so we were ${m.overAllowance > 0 ? `${m.overAllowance} over` : 'within it'}.` : ''}`);

  // 2. Trend
  const t = m.trend;
  const under = t.filter((w) => w.ltr !== null && w.ltr < benchmark);
  const rounding = under.filter((w) => w.display !== null && w.display >= benchmark);
  const pooled = t.reduce((a, w) => ({ n: a.n + w.n, p: a.p + w.promoters }), { n: 0, p: 0 });
  lines.push(`2. Trend. Over the last four weeks LTR went ${list(t.map((w) => `${w.display ?? '—'} in FW${w.fw}`))}. The bars are the 0 to 8 counts, ${list(t.map((w) => String(w.low08)))}; red bars are weeks under the benchmark and blue bars are at or above it. ${under.length ? `${list(under.map((w) => `FW${w.fw}`))} ${under.length === 1 ? 'was' : 'were'} under the dashed ${benchmark} line.` : `Every week was at or above the dashed ${benchmark} line.`}${rounding.length ? ` Note ${list(rounding.map((w) => `FW${w.fw}`))} shows ${rounding[0].display} but is red, because the unrounded score was ${pct1(rounding[0])}.` : ''} Across the four weeks together we're at ${pooled.n ? Math.floor((1000 * pooled.p) / pooled.n + 0.5) / 10 : '—'} on ${pooled.n} surveys.`);

  // 3. Drivers
  if (drivers.some((d) => d.pct !== null)) {
    const ds = drivers.filter((d) => d.pct !== null);
    const top = ds[0], low = ds[ds.length - 1];
    lines.push(`3. Key drivers. ${top.short} is our strongest driver at ${top.display}, which lines up with what promoters say about the RedVest Associates. ${low.short} is the weakest at ${low.display}${ds.length > 2 ? `, with ${list(ds.slice(1, -1).map((d) => `${d.short} at ${d.display}`))} in between` : ''}. The gap between the top and bottom driver is ${(top.display ?? 0) - (low.display ?? 0)} points, and that gap is where the 0 to 8 scores tend to come from.`);
  } else lines.push('3. Key drivers. No driver data loaded for this week, so skip to divisions.');

  // 4. Divisions
  const worst = [...m.divisions].filter((d) => d.delta !== null).sort((a, b) => a.delta! - b.delta!)[0];
  const divDriver = (d: string) => [...m.regions].filter((r) => r.division === d).sort((a, b) => b.cur.low08 - a.cur.low08)[0];
  lines.push(`4. Divisions. ${list(m.divisions.map((d) => `${title(d.division)} at ${d.cur.display ?? '—'}, ${pts(d.delta)}`))}.${worst && worst.delta! < 0 ? ` The biggest move was ${title(worst.division)}, and the region with the most 0 to 8 scores there was ${divDriver(worst.division)?.region ?? '—'} with ${divDriver(worst.division)?.cur.low08 ?? 0}.` : ''}`);

  // 5. Callouts
  if (e.callouts.length) {
    const parts = e.callouts.map((c) => { const r = m.regions.find((x) => x.region === c.region); return r ? regionSentence(r, c.why, c.categories, benchmark) : ''; }).filter(Boolean);
    lines.push(`5. Regions. Going around the map: ${parts.join(' ')}`);
  }

  // 6. Cards
  const card = (k: keyof SlideEdits['cards'], label: string, n: number) => {
    const c = e.cards[k];
    return `${label}, ${n}${c.drivers.length ? `: their comments point to ${list(c.drivers)}` : ''}.${c.bullets.length ? ` ${c.bullets.map((b) => b.replace(/[.]$/, '')).join('. ')}.` : ''}`;
  };
  lines.push(`6. Promoters, passives and detractors, on Medallia's scale. ${card('promoters', 'Promoters', cur.promoters)} ${card('passives', 'Passives', cur.passives)} ${card('detractors', 'Detractors', cur.detractors06)}`);

  // 7–8
  lines.push(`7. RedVest shout-out. ${e.shoutout || 'Call out the RedVest Associates members named in their 9s and 10s this week, and thank the stores behind them.'}`);
  lines.push(`8. Close. ${e.close} Happy to take questions.`);

  const body = lines.join('\n\n');
  const words = body.replace(/^\d\. /gm, '').split(/\s+/).filter(Boolean).length;
  const back: string[] = ['BACK POCKET'];
  back.push(`• Exact LTR: FW${m.fw} ${pct1(cur)}% (${cur.promoters} of ${cur.n}); FW${m.fw - 1} ${pct1(prior)}% (${prior.promoters} of ${prior.n}).`);
  back.push(`• Year to date: ${pct1(m.ytd)}% on ${m.ytd.n.toLocaleString('en-US')} surveys.`);
  back.push(`• Allowance at ${benchmark}: floor(${cur.n} × 0.07) = ${cur.allowed}; actual 0–8 = ${cur.low08}.`);
  back.push(`• Regions under 10 surveys (asterisked): ${m.regions.filter((r) => r.lowCount).map((r) => `${r.region} (n=${r.cur.n})`).join(', ') || 'none'}.`);
  back.push(`• Divisions exact: ${m.divisions.map((d) => `${title(d.division)} ${pct1(d.cur)}% on ${d.cur.n} (FW${m.fw - 1} ${pct1(d.prior)}% on ${d.prior.n})`).join('; ')}.`);
  back.push('• LTR = share of 9–10 scores on the 0–10 question; whole numbers round half up from one decimal; colours use the unrounded value.');
  back.push('• Lowe\'s counts every 0–8 as a detractor for the trend; the cards use Medallia\'s 9–10 / 7–8 / 0–6 buckets.');
  const text = `${body}\n\n${back.join('\n')}`;
  return { text, words, minutes: words / WORDS_PER_MINUTE };
}

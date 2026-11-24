/**
 * Ask — a local question answerer. No AI, no network.
 * 1) plan(): turn the question into filters + an intent; 2) answer(): compute from the loaded data.
 * If the data needed isn't loaded, it says so. It never guesses.
 */
import type { Dataset } from '@/data/dataset';
import { weekFacts, type WeekFacts } from '@/analytics/facts';
import { byWeek, districtFor, ltrSurveys, pool, weekOf, type GeoFilter } from '@/analytics/ltr';
import { attributeScores, groupRange, lowest, rangeLabel } from '@/analytics/attributes';
import { whatChangedSummary } from '@/writing/write';
import { ATTRIBUTES } from '@/domain/attributes';
import { REGIONS, normalizeRegion, storeLabel, UNMAPPED } from '@/domain/geo';
import { canColor, ltrSummary, sampleFlag, SAMPLE_FLAG_LABEL, type LtrSummary, type SampleThresholds } from '@/lib/ltr';
import type { Cell, TableData } from '@/data/export';

export type Intent = 'why-ltr' | 'regions-below' | 'whats-new' | 'detractors' | 'attributes' | 'stores' | 'theme' | 'ltr' | 'unknown';

export interface Plan {
  intent: Intent;
  from: number;
  to: number;
  geo: GeoFilter;
  theme?: string;
  attribute?: string;
  threshold?: number;
  minN: number;
  notes: string[];
}

export interface Answer {
  text: string[];
  dataUsed: { filters: string[]; n: string; table: TableData } | null;
  notLoaded?: boolean;
}

export interface AskContext {
  ds: Dataset;
  fw: number;
  benchmark: number;
  thresholds: SampleThresholds;
  /** geography from the filter bar, used when the question doesn't name one */
  geo: GeoFilter;
}

const THEME_WORDS: [RegExp, string][] = [
  [/\b(exclusions?|not covered|scope|tankless|roof)\b/, 'exclusions'],
  [/\b(damage|leaks?|safety|no hot water)\b/, 'damage'],
  [/\b(completion|unfinished|not finished|incomplete)\b/, 'completion'],
  [/\b(appointments?|booking|no-?shows?|reschedul\w*|missed visits?)\b/, 'appointment'],
  [/\b(refunds?|price|pricing|value)\b/, 'value'],
  [/\b(associates?|redvest|techs?|technicians?)\b/, 'associate'],
  [/\b(service-?add|add(ed)? services?|new services)\b/, 'service-add'],
  [/\b(aging|seniors?|elderly|accessib\w*|disab\w*)\b/, 'aging'],
];

export function plan(question: string, ctx: Pick<AskContext, 'fw' | 'benchmark' | 'geo'>): Plan {
  const q = question.toLowerCase().replace(/[’']/g, "'").replace(/≥/g, '>=').replace(/[–—]/g, '-');
  const p: Plan = { intent: 'unknown', from: ctx.fw, to: ctx.fw, geo: { ...ctx.geo }, minN: 10, notes: [] };

  // weeks
  let m: RegExpExecArray | null;
  if ((m = /\bfw\s?(\d{1,2})\s*(?:-|to|through|thru)\s*(?:fw\s?)?(\d{1,2})\b/.exec(q))) { p.from = +m[1]; p.to = +m[2]; }
  else if ((m = /\bsince\s+fw\s?(\d{1,2})\b/.exec(q))) { p.from = +m[1]; p.to = ctx.fw; }
  else if ((m = /\b(?:fw|week)\s?(\d{1,2})\b/.exec(q))) { p.from = p.to = +m[1]; }
  else if (/\b(fytd|ytd|year to date|this year|so far this year)\b/.test(q)) { p.from = 1; p.to = ctx.fw; }
  else if ((m = /\b(?:last|past|previous)\s+(\d{1,2})\s+weeks\b/.exec(q))) { p.from = Math.max(1, ctx.fw - +m[1] + 1); p.to = ctx.fw; }
  else if (/\b(last|prior|previous) week\b/.test(q) && !/\bvs\.? (last|prior|previous) week\b|\bthan (last|prior) week\b|\bsince (last|prior) week\b/.test(q)) { p.from = p.to = ctx.fw - 1; }
  if (p.from > p.to) [p.from, p.to] = [p.to, p.from];

  // geography (question overrides the filter bar)
  if ((m = /\b(?:region\s*|r)(\d{1,2})\b/.exec(q)) && (REGIONS as readonly string[]).includes(normalizeRegion(m[1]))) p.geo = { region: normalizeRegion(m[1]), district: null, store: null };
  if ((m = /\bdistrict\s+([\w-]+)/.exec(q))) p.geo = { ...p.geo, district: m[1].toUpperCase() === 'UNMAPPED' ? UNMAPPED : m[1].toUpperCase(), store: null };
  if ((m = /\b(?:store\s*#?\s*|#)(\d{3,4})\b/.exec(q))) p.geo = { ...p.geo, store: m[1].padStart(4, '0') };

  // thresholds
  if ((m = /\b(?:below|under|less than|lower than)\s+(\d{2}(?:\.\d)?)\s*%?/.exec(q))) p.threshold = +m[1];
  if ((m = /\bn\s*(?:>=|>|of at least|at least|over|above)\s*(\d+)/.exec(q))) p.minN = +m[1];

  // attribute / theme
  for (const a of ATTRIBUTES) if (q.includes(a.label.toLowerCase()) || q.includes(a.label.toLowerCase().replace(/^associate /, ''))) { p.attribute = a.key; break; }
  if (!p.attribute) for (const [re, id] of THEME_WORDS) if (re.test(q)) { p.theme = id; break; }

  // intent
  if (/\bwhy\b/.test(q) && /\b(ltr|score|lt r|recommend)\b/.test(q)) p.intent = 'why-ltr';
  else if (/\bregions?\b/.test(q) && (/\b(below|under|less than|lower than|miss(ed|ing)?)\b/.test(q) || /\bbenchmark\b/.test(q))) p.intent = 'regions-below';
  else if (/\b(new|changed?|different|moved)\b/.test(q) && /\b(vs|versus|than|since|last week|week over week|this week)\b/.test(q)) p.intent = 'whats-new';
  else if (/\bwhat'?s new\b|\bwhat changed\b/.test(q)) p.intent = 'whats-new';
  else if (/\b(detractors?|0-8|0-6|7-8|low scores?|who scored)\b/.test(q)) p.intent = 'detractors';
  else if (p.attribute || /\b(attributes?|drivers? of ltr|lowest (attribute|score))\b/.test(q)) p.intent = 'attributes';
  else if (/\bstores?\b/.test(q) && /\b(worst|lowest|bottom|best|top|highest|which)\b/.test(q) && !p.geo.store) p.intent = 'stores';
  else if (p.theme) p.intent = 'theme';
  else if (/\b(ltr|likelihood|score|recommend|how did we do|how are we doing)\b/.test(q) || p.geo.store || p.geo.region) p.intent = 'ltr';
  return p;
}

// ───────── helpers ─────────
const pct = (x: number | null, d = 1) => (x === null ? '—' : `${x.toFixed(d)}%`);
const sfx = (s: LtrSummary, t: SampleThresholds) => { const l = SAMPLE_FLAG_LABEL[sampleFlag(s.n, t)]; return l && l !== 'Strong' ? ` · ${l.toLowerCase()}` : ''; };
const ltrText = (s: LtrSummary, t: SampleThresholds) => `${pct(s.pct)} (n=${s.n}${sfx(s, t)})`;
const weeksLabel = (p: Plan) => (p.from === p.to ? `FW${p.from}` : `FW${p.from}–FW${p.to}`);
const geoLabel = (g: GeoFilter, ds: Dataset) => [g.region, g.district, g.store ? storeLabel(g.store, ds.stores) : null].filter(Boolean).join(' › ') || 'All regions';
const table = (columns: string[], rows: Cell[][]): TableData => ({ columns, rows });
/** 95% margin of error for a proportion, in points. */
const margin = (s: LtrSummary) => (s.n && s.pct !== null ? 1.96 * Math.sqrt((s.pct / 100) * (1 - s.pct / 100) / s.n) * 100 : null);

function loadedWeeks(ds: Dataset): number[] {
  return [...new Set(ds.surveys.map((s) => s.fw))].sort((a, b) => a - b);
}
function countBy<T>(xs: T[], key: (x: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
const rangeText = (ws: number[]) => (ws.length ? `FW${ws[0]}–FW${ws[ws.length - 1]}` : 'none');

function notLoaded(what: string, p: Plan, ds: Dataset): Answer {
  return { text: [`${what} for ${weeksLabel(p)} is not in the loaded data.`, `Surveys loaded: ${rangeText(loadedWeeks(ds))}.`], dataUsed: null, notLoaded: true };
}

export const SUGGESTIONS = [
  'Why did LTR move this week?',
  'Which regions are below 93% with n ≥ 10?',
  'Who were the detractors this week?',
  "What's new vs last week?",
];

// ───────── answer ─────────
export function answer(question: string, ctx: AskContext): Answer {
  const { ds, thresholds, benchmark } = ctx;
  const p = plan(question, ctx);
  const filters = [`Weeks: ${weeksLabel(p)}`, `Geography: ${geoLabel(p.geo, ds)}`];
  if (p.theme) filters.push(`Theme: ${ds.taxonomy.find((t) => t.id === p.theme)?.name}`);
  const ltr = ltrSurveys(ds.surveys, p.geo, ds.stores);
  const weekly = byWeek(ltr);
  const inRange = ltr.filter((s) => s.fw >= p.from && s.fw <= p.to);
  const facts = (fw: number): WeekFacts => weekFacts(ds, fw, benchmark, thresholds, p.geo);
  const tname = (id: string) => ds.taxonomy.find((t) => t.id === id)?.name ?? (id === 'untagged' ? 'Untagged' : id);

  switch (p.intent) {
    case 'why-ltr': {
      const fw = p.to;
      const cur = weekOf(weekly, fw), prior = weekOf(weekly, fw - 1);
      if (!cur.n) return notLoaded('LTR', { ...p, from: fw, to: fw }, ds);
      if (!prior.n) return { text: [`FW${fw} LTR is ${ltrText(cur, thresholds)}. FW${fw - 1} isn’t loaded, so there’s no change to explain.`], dataUsed: null, notLoaded: true };
      const f = facts(fw), fp = facts(fw - 1);
      const d = cur.pct! - prior.pct!;
      const moe = margin(cur);
      const out = [`LTR ${d >= 0 ? 'rose' : 'fell'} ${Math.abs(d).toFixed(1)} pts: ${ltrText(cur, thresholds)} in FW${fw} vs ${ltrText(prior, thresholds)} in FW${fw - 1}.`];
      out.push(`Detractors (0–8): ${prior.detractors} → ${cur.detractors} (0–6: ${prior.detractors0to6} → ${cur.detractors0to6}).`);
      const moves = f.regions.map((r) => ({ r: r.region, d: (r.s.detractors) - (r.prior.detractors), s: r.s, pr: r.prior })).filter((x) => x.d !== 0).sort((a, b) => b.d - a.d);
      if (moves.length) out.push(`Most extra detractors: ${moves.filter((x) => x.d > 0).slice(0, 3).map((x) => `${x.r} +${x.d} (${ltrText(x.s, thresholds)})`).join(', ') || 'none'}; fewest: ${moves.filter((x) => x.d < 0).slice(-3).reverse().map((x) => `${x.r} ${x.d}`).join(', ') || 'none'}.`);
      if (f.rootCauses.length) out.push(`FW${fw} detractor root causes: ${f.rootCauses.map((r) => `${tname(r.theme)} ${r.count}`).join(', ')}${fp.rootCauses.length ? ` (FW${fw - 1}: ${fp.rootCauses.map((r) => `${tname(r.theme)} ${r.count}`).join(', ')})` : ''}.`);
      const attrMoves = f.attrs.map((a) => ({ a, prev: f.attrsPrior.find((x) => x.key === a.key) })).filter((x) => x.a.pct !== null && x.prev?.pct != null).map((x) => ({ ...x, d: x.a.pct! - x.prev!.pct! })).sort((a, b) => a.d - b.d);
      if (attrMoves.length) out.push(`Biggest attribute move: ${attrMoves[0].a.label} ${pct(attrMoves[0].a.pct)} (${attrMoves[0].d >= 0 ? '+' : ''}${attrMoves[0].d.toFixed(1)} pts, n=${attrMoves[0].a.n}).`);
      if (moe !== null) out.push(Math.abs(d) < moe ? `Caution: the change is within the ±${moe.toFixed(1)}-pt margin of error for n=${cur.n}, so it may be noise.` : `The change is larger than the ±${moe.toFixed(1)}-pt margin of error for n=${cur.n}.`);
      return { text: out, dataUsed: { filters: [...filters, `Compared with FW${fw - 1}`], n: `n=${cur.n} (FW${fw}), n=${prior.n} (FW${fw - 1})`,
        table: table(['Region', `FW${fw} LTR %`, `FW${fw} n`, `FW${fw} detractors`, `FW${fw - 1} LTR %`, `FW${fw - 1} n`, `FW${fw - 1} detractors`],
          f.regions.map((r) => [r.region, r.s.pct === null ? null : +r.s.pct.toFixed(1), r.s.n, r.s.detractors, r.prior.pct === null ? null : +r.prior.pct.toFixed(1), r.prior.n, r.prior.detractors])) } };
    }

    case 'regions-below': {
      if (!inRange.length) return notLoaded('LTR', p, ds);
      const threshold = p.threshold ?? benchmark;
      const g = new Map<string, LtrSummary>();
      for (const r of REGIONS) g.set(r, pool([...Array(p.to - p.from + 1)].map((_, i) => weekOf(byWeek(inRange.filter((s) => s.region === r)), p.from + i))));
      const rows = [...g].map(([r, s]) => ({ r, s }));
      const below = rows.filter((x) => x.s.pct !== null && x.s.pct < threshold && x.s.n >= p.minN);
      const smallBelow = rows.filter((x) => x.s.pct !== null && x.s.pct < threshold && x.s.n < p.minN && x.s.n > 0);
      const out = [below.length
        ? `${below.length} region${below.length === 1 ? '' : 's'} below ${threshold}% with n ≥ ${p.minN} in ${weeksLabel(p)}: ${below.map((x) => `${x.r} ${ltrText(x.s, thresholds)}`).join(', ')}.`
        : `No region is below ${threshold}% with n ≥ ${p.minN} in ${weeksLabel(p)}.`];
      if (smallBelow.length) out.push(`Also below but with n < ${p.minN} (not reliable): ${smallBelow.map((x) => `${x.r} ${ltrText(x.s, thresholds)}`).join(', ')}.`);
      return { text: out, dataUsed: { filters: [...filters, `Threshold: ${threshold}%`, `Minimum n: ${p.minN}`], n: `n=${inRange.length}`, table: table(['Region', 'LTR %', 'n', 'Detractors'], rows.map((x) => [x.r, x.s.pct === null ? null : +x.s.pct.toFixed(1), x.s.n, x.s.detractors])) } };
    }

    case 'whats-new': {
      const fw = p.to;
      if (!weekOf(weekly, fw).n) return notLoaded('Data', { ...p, from: fw, to: fw }, ds);
      const f = facts(fw);
      const out = [whatChangedSummary(f, ds.taxonomy)];
      const order = ['Emerging', 'Repeated', 'Persistent'];
      const up = f.changes.filter((c) => c.maturityPrev && c.maturityNow && order.indexOf(c.maturityNow) > order.indexOf(c.maturityPrev));
      if (up.length) out.push(`Becoming more established: ${up.map((c) => `${tname(c.theme)} (${c.maturityPrev} → ${c.maturityNow})`).join(', ')}.`);
      const rows = [...f.changes].sort((a, b) => Math.abs(b.dPrior) - Math.abs(a.dPrior));
      return { text: out, dataUsed: { filters: [`Weeks: FW${fw} vs FW${fw - 1}`, `Geography: ${geoLabel(p.geo, ds)}`], n: `n=${f.ltr.cur.n} surveys`,
        table: table(['Theme', `Comments FW${fw}`, 'Δ vs prior week', 'Pattern'], rows.map((c) => [tname(c.theme), c.cur.surveys, c.dPrior, c.maturityNow ?? ''])) } };
    }

    case 'detractors': {
      if (!inRange.length) return notLoaded('LTR', p, ds);
      const s = pool([...Array(p.to - p.from + 1)].map((_, i) => weekOf(weekly, p.from + i)));
      const rows = p.from === p.to ? facts(p.to).detractors : inRange.filter((x) => x.ltr !== null && x.ltr < 9).map((x) => ({ id: x.id, date: x.date, storeNo: x.storeNo, region: x.region, score: x.ltr!, rootCause: ds.tags.get(x.id)?.primary ?? null, followUp: '—' }));
      const causes = countBy(rows, (r) => r.rootCause ?? 'untagged');
      const out = [`${s.detractors} detractors (0–8) of n=${s.n} in ${weeksLabel(p)}: ${s.detractors0to6} scored 0–6 and ${s.detractors7to8} scored 7–8.`];
      if (causes.length) out.push(`Root causes: ${causes.map((c) => `${tname(c.key)} ${c.count}`).join(', ')}.`);
      if (p.from === p.to) { const f = facts(p.to); out.push(`SM follow-up documented for ${f.followUpDocumented} of ${f.detractors.length}.`); }
      return { text: out, dataUsed: { filters, n: `n=${s.n}`, table: table(['Date', 'Store', 'Region', 'Score', 'Root cause', 'Follow-up'], rows.map((r) => [r.date, storeLabel(r.storeNo, ds.stores), r.region, r.score, tname(r.rootCause ?? 'untagged'), String(r.followUp)])) } };
    }

    case 'attributes': {
      const fw = p.to;
      const sc = attributeScores(ltr.filter((s) => s.fw === fw), ds.attributeWeekly.filter((a) => a.fw === fw), !!(p.geo.region || p.geo.district || p.geo.store));
      if (sc.every((a) => a.n === 0)) return notLoaded('Attribute data', { ...p, from: fw, to: fw }, ds);
      const out: string[] = [];
      if (p.attribute) {
        const a = sc.find((x) => x.key === p.attribute)!;
        const trend = [fw - 3, fw - 2, fw - 1, fw].filter((w) => w >= 1).map((w) => ({ w, a: attributeScores(ltr.filter((s) => s.fw === w), ds.attributeWeekly.filter((x) => x.fw === w), !!p.geo.region).find((x) => x.key === p.attribute)! }));
        out.push(`${a.label}: ${pct(a.pct)} top-2-box (n=${a.n}) in FW${fw}.`, `Last 4 weeks: ${trend.map((t) => `FW${t.w} ${pct(t.a.pct)} (n=${t.a.n})`).join(', ')}.`);
      } else {
        const low = lowest(sc);
        out.push(`Lowest attribute in FW${fw}: ${low ? `${low.label} ${pct(low.pct)} (n=${low.n})` : '—'}.`, `Pre-visit ${rangeLabel(groupRange(sc, 'Pre-visit'))}, in-home ${rangeLabel(groupRange(sc, 'In-home'))}, program ${rangeLabel(groupRange(sc, 'Program'))}.`);
      }
      if (sc[0].source === 'analytics') out.push('Source: Medallia Analytics (company-wide; n is the survey sample size).');
      return { text: out, dataUsed: { filters: [`Week: FW${fw}`, `Geography: ${geoLabel(p.geo, ds)}`], n: `n per attribute shown`, table: table(['Attribute', 'Group', 'Top-2-box %', 'n'], sc.map((a) => [a.label, a.group, a.pct === null ? null : +a.pct.toFixed(1), a.n])) } };
    }

    case 'stores': {
      const from = p.from === p.to ? Math.max(1, p.to - 3) : p.from;
      const scoped = ltr.filter((s) => s.fw >= from && s.fw <= p.to);
      if (!scoped.length) return notLoaded('LTR', p, ds);
      const g = new Map<string, (number | null)[]>();
      for (const s of scoped) g.set(s.storeNo, [...(g.get(s.storeNo) ?? []), s.ltr]);
      const rows = [...g].map(([no, scores]) => ({ no, s: ltrSummary(scores) })).filter((x) => canColor(x.s.n, thresholds));
      const best = /\b(best|top|highest)\b/.test(question.toLowerCase());
      rows.sort((a, b) => (best ? b.s.pct! - a.s.pct! || b.s.n - a.s.n : a.s.pct! - b.s.pct! || b.s.n - a.s.n));
      const top = rows.slice(0, 5);
      return { text: [`${best ? 'Highest' : 'Lowest'} LTR stores in FW${from}–FW${p.to} (n ≥ ${thresholds.noTrendBelow}): ${top.map((x) => `${storeLabel(x.no, ds.stores)} ${ltrText(x.s, thresholds)}`).join('; ')}.`, `Store samples are small; treat single-store results as directional.`],
        dataUsed: { filters: [`Weeks: FW${from}–FW${p.to}`, `Geography: ${geoLabel(p.geo, ds)}`, `Minimum n: ${thresholds.noTrendBelow}`], n: `${rows.length} stores`, table: table(['Store', 'District', 'LTR %', 'n', 'Detractors'], rows.slice(0, 25).map((x) => [storeLabel(x.no, ds.stores), districtFor(x.no, ds.stores), +x.s.pct!.toFixed(1), x.s.n, x.s.detractors])) } };
    }

    case 'theme': {
      const th = p.theme!;
      const geoIds = new Set(ds.surveys.filter((s) => (!p.geo.region || s.region === p.geo.region) && (!p.geo.store || s.storeNo === p.geo.store) && (!p.geo.district || districtFor(s.storeNo, ds.stores) === p.geo.district)).map((s) => s.id));
      const st = ds.tagList.filter((t) => t.channel === 'survey' && t.fw >= p.from && t.fw <= p.to && geoIds.has(t.recordId) && (t.primary === th || t.secondary.includes(th)));
      if (!st.length && !inRange.length) return notLoaded('Data', p, ds);
      const pos = st.filter((t) => t.sentiment === 'Positive').length, neg = st.filter((t) => t.sentiment === 'Negative').length;
      const lowIds = new Set(inRange.filter((x) => x.ltr !== null && x.ltr <= 8).map((x) => x.id));
      const inLow = st.filter((t) => lowIds.has(t.recordId)).length;
      const subs = countBy(st.filter((t) => t.primary === th && t.subTag), (t) => t.subTag!);
      const out = [`${tname(th)} in ${weeksLabel(p)}: ${st.length} survey comment${st.length === 1 ? '' : 's'} (${pos} positive, ${neg} negative); ${inLow} from surveys that scored 0–8.`];
      if (subs.length) out.push(`Sub-tags: ${subs.map((x) => `${x.key} ${x.count}`).join(', ')}.`);
      return { text: out, dataUsed: { filters, n: `${st.length} survey comments`, table: table(['Comments', 'Positive', 'Negative', 'Scored 0–8'], [[st.length, pos, neg, inLow]]) } };
    }

    case 'ltr': {
      if (!inRange.length) return notLoaded('LTR', p, ds);
      const pts = [...Array(p.to - p.from + 1)].map((_, i) => ({ w: p.from + i, s: weekOf(weekly, p.from + i) }));
      const all = pool(pts.map((x) => x.s));
      const out = [`LTR for ${geoLabel(p.geo, ds)} in ${weeksLabel(p)}: ${ltrText(all, thresholds)}, ${all.pct! >= benchmark ? 'at or above' : 'below'} the ${benchmark}% benchmark. Detractors ${all.detractors} (${all.detractors0to6} at 0–6).`];
      if (pts.length > 1 && pts.length <= 13) out.push(`By week: ${pts.map((x) => `FW${x.w} ${ltrText(x.s, thresholds)}`).join(', ')}.`);
      if (!canColor(all.n, thresholds)) out.push(`n is below ${thresholds.noTrendBelow}: no trend can be read from this.`);
      return { text: out, dataUsed: { filters, n: `n=${all.n}`, table: table(['Week', 'LTR %', 'n', 'Detractors'], pts.map((x) => [`FW${x.w}`, x.s.pct === null ? null : +x.s.pct.toFixed(1), x.s.n, x.s.detractors])) } };
    }

    default: {
      return { text: [
        'I can only answer from the loaded data, and I can’t match that question to it.',
        `I can answer about LTR, detractors, regions, stores, attributes and comment themes (surveys loaded ${rangeText(loadedWeeks(ds))}). Try “LTR for R5 last 4 weeks”, “Which stores are lowest since FW30?” or “How many exclusion comments in FW40?”.`,
      ], dataUsed: null, notLoaded: true };
    }
  }
}

/**
 * Metrics for the weekly LTR slide (build spec “HomeCare+ LTR Slide”). Pure and tested.
 *
 *  LTR = count(9–10) ÷ count(all) × 100. Benchmark 93 (“benchmark”, never “goal”).
 *  Trend “detractors” = every 0–8 score (Lowe's definition). Cards use Medallia buckets: 9–10 / 7–8 / 0–6.
 *  Allowed at 93 = floor(n × 0.07). Low survey count = n < 10.
 *  Display: whole numbers, half-up, after the Tracker's one-decimal rounding (94.49 → 94.5 → 95).
 *  Colours always use the unrounded value (FW38 92.55 shows “93” but is below the benchmark).
 */
import type { SurveyRecord, ThemeTag } from '@/domain/types';
import type { AttributeWeekly } from '@/domain/types';
import { DEFAULT_REGION_CONFIG, DIVISION_ORDER, divisionOf, type Division, type RegionConfig } from '@/config/regions';

export const roundHalfUp = (x: number, decimals = 0): number => {
  const f = 10 ** decimals;
  return Math.floor(x * f + 0.5 + 1e-9) / f;
};
/** Whole-number display, matching the Tracker: one decimal first, then whole (94.49 → 94.5 → 95). */
export const displayWhole = (x: number): number => roundHalfUp(roundHalfUp(x, 1));

export interface WeekStats {
  fw: number;
  n: number;
  promoters: number;
  passives: number; // 7–8
  detractors06: number; // 0–6 (Medallia)
  low08: number; // 0–8 (Lowe's “detractors”)
  ltr: number | null; // unrounded
  display: number | null; // whole, for the slide
  allowed: number; // floor(n × 0.07)
}

export function weekStats(fw: number, scores: (number | null)[]): WeekStats {
  const valid = scores.filter((s): s is number => typeof s === 'number' && s >= 0 && s <= 10);
  const promoters = valid.filter((s) => s >= 9).length;
  const passives = valid.filter((s) => s === 7 || s === 8).length;
  const n = valid.length;
  const ltr = n ? (100 * promoters) / n : null;
  return { fw, n, promoters, passives, detractors06: n - promoters - passives, low08: n - promoters, ltr, display: ltr === null ? null : displayWhole(ltr), allowed: Math.floor(n * 0.07 + 1e-9) };
}

export const atOrAbove = (s: WeekStats, benchmark: number) => s.ltr !== null && s.ltr >= benchmark;
export const change = (cur: WeekStats, prior: WeekStats): number | null => (cur.display === null || prior.display === null ? null : cur.display - prior.display);

export interface RegionRow { region: string; division: Division | null; cur: WeekStats; prior: WeekStats; delta: number | null; lowCount: boolean }
export interface DivisionRow { division: Division; cur: WeekStats; prior: WeekStats; delta: number | null }

export interface SlideMetrics {
  fw: number;
  benchmark: number;
  cur: WeekStats;
  prior: WeekStats;
  delta: number | null;
  benchDelta: number | null;
  ytd: WeekStats;
  regions: RegionRow[];
  regionsAtOrAbove: number;
  regionsWithSurveys: number;
  divisions: DivisionRow[];
  trend: WeekStats[];
  overAllowance: number;
}

const LOW_N = 10;

export function slideMetrics(surveys: SurveyRecord[], fw: number, benchmark = 93, cfg: RegionConfig = DEFAULT_REGION_CONFIG): SlideMetrics {
  const byWeek = (w: number, f: (s: SurveyRecord) => boolean = () => true) => weekStats(w, surveys.filter((s) => s.fw === w && f(s)).map((s) => s.ltr));
  const cur = byWeek(fw), prior = byWeek(fw - 1);
  const configRegions = Object.values(cfg.divisions).flat();
  const allRegions = [...new Set([...configRegions, ...surveys.filter((s) => s.fw === fw).map((s) => s.region)])];
  const regions: RegionRow[] = allRegions.map((r) => {
    const c = byWeek(fw, (s) => s.region === r), p = byWeek(fw - 1, (s) => s.region === r);
    return { region: r, division: divisionOf(r, cfg), cur: c, prior: p, delta: change(c, p), lowCount: c.n > 0 && c.n < LOW_N };
  }).sort((a, b) => +a.region.slice(1) - +b.region.slice(1));
  const divisions: DivisionRow[] = DIVISION_ORDER.map((d) => {
    const inDiv = (s: SurveyRecord) => divisionOf(s.region, cfg) === d;
    const c = byWeek(fw, inDiv), p = byWeek(fw - 1, inDiv);
    return { division: d, cur: c, prior: p, delta: change(c, p) };
  });
  const ytd = weekStats(fw, surveys.filter((s) => s.fw >= 1 && s.fw <= fw).map((s) => s.ltr));
  return {
    fw, benchmark, cur, prior, delta: change(cur, prior), benchDelta: cur.display === null ? null : cur.display - benchmark,
    ytd, regions,
    regionsAtOrAbove: regions.filter((r) => r.cur.n > 0 && atOrAbove(r.cur, benchmark)).length,
    regionsWithSurveys: regions.filter((r) => r.cur.n > 0).length,
    divisions,
    trend: [fw - 3, fw - 2, fw - 1, fw].filter((w) => w >= 1).map((w) => byWeek(w)),
    overAllowance: Math.max(0, cur.low08 - cur.allowed),
  };
}

// ───────── callouts ─────────
export type CalloutCategory = 'SCOPE' | 'EXECUTION' | 'CONFIRMING' | 'LOW SURVEY COUNT' | 'ABOVE BENCHMARK';
export type CalloutSlot = 'contributor' | 'drop' | 'low-count' | 'bright' | 'fill';
export interface Callout { region: string; slot: CalloutSlot; categories: CalloutCategory[]; why: string }

const THEME_TO_CATEGORY: Record<string, CalloutCategory> = { exclusions: 'SCOPE', damage: 'EXECUTION', completion: 'EXECUTION', appointment: 'CONFIRMING' };
const TOPIC_TO_CATEGORY: [RegExp, CalloutCategory][] = [[/schedul|appointment|confirm|cancel/i, 'CONFIRMING'], [/not covered|coverage|exclu|scope/i, 'SCOPE'], [/repair|damage|quality|leak|broken/i, 'EXECUTION']];

/** Categories suggested from the 0–8 surveys' comment tags (and, as hints, Medallia topics). The analyst confirms. */
export function suggestCategories(lowSurveys: SurveyRecord[], tags: Map<string, ThemeTag>): CalloutCategory[] {
  const count = new Map<CalloutCategory, number>();
  const bump = (c: CalloutCategory, w = 1) => count.set(c, (count.get(c) ?? 0) + w);
  for (const s of lowSurveys) {
    const t = tags.get(s.id);
    const seen = new Set<CalloutCategory>();
    if (t) for (const th of [t.primary, ...t.secondary]) { const c = THEME_TO_CATEGORY[th]; if (c && !seen.has(c)) { seen.add(c); bump(c, th === t.primary ? 2 : 1); } }
    for (const topic of s.topics ?? []) if (/\((negative|strongly negative)\)/i.test(topic)) for (const [re, c] of TOPIC_TO_CATEGORY) if (re.test(topic) && !seen.has(c)) { seen.add(c); bump(c, 0.5); }
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
}

const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** “two 7s”, “a 3 and two 7s” */
export function scoresPhrase(scores: number[]): string {
  const groups = new Map<number, number>();
  for (const s of [...scores].sort((a, b) => a - b)) groups.set(s, (groups.get(s) ?? 0) + 1);
  const parts = [...groups].map(([s, k]) => (k === 1 ? `${s === 8 ? 'an' : 'a'} ${s}` : `${NUM_WORD[k] ?? k} ${s}s`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/**
 * Six callouts, per the spec's selection logic:
 * 1) biggest contributors (most 0–8, n ≥ 10) ×2; 2) biggest drop with n ≥ 10 ×1–2; 3) low-count drops (n < 10) ×≤2;
 * 4) bright spot (biggest improvement now ≥ benchmark) ×1; 5) regions that moved on a single low score with n < 12 are
 * held back unless a slot is still open.
 */
export function suggestCallouts(m: SlideMetrics, surveys: SurveyRecord[], tags: Map<string, ThemeTag>, slots = 6): Callout[] {
  const used = new Set<string>();
  const picks: Omit<Callout, 'categories' | 'why'>[] = [];
  const take = (r: RegionRow | undefined, slot: CalloutSlot) => { if (r && !used.has(r.region) && picks.length < slots) { used.add(r.region); picks.push({ region: r.region, slot }); } };
  const live = m.regions.filter((r) => r.cur.n > 0);
  const singleLow = (r: RegionRow) => r.cur.low08 === 1 && r.cur.n < 12;
  const held: RegionRow[] = [];
  [...live].filter((r) => r.cur.n >= LOW_N && r.cur.low08 > 0).sort((a, b) => b.cur.low08 - a.cur.low08 || b.cur.n - a.cur.n).slice(0, 2).forEach((r) => take(r, 'contributor'));
  const bright = [...live].filter((r) => atOrAbove(r.cur, m.benchmark) && (r.delta ?? 0) > 0).sort((a, b) => b.delta! - a.delta!)[0];
  const drops = [...live].filter((r) => r.cur.n >= LOW_N && (r.delta ?? 0) < 0 && !used.has(r.region)).sort((a, b) => a.delta! - b.delta!);
  const lowDrops = [...live].filter((r) => r.lowCount && (r.delta ?? 0) < 0).sort((a, b) => a.delta! - b.delta!);
  for (const r of [...drops, ...lowDrops]) if (singleLow(r)) held.push(r);
  const dropsOk = drops.filter((r) => !singleLow(r));
  take(dropsOk[0], 'drop');
  lowDrops.filter((r) => !singleLow(r)).slice(0, 2).forEach((r) => take(r, 'low-count'));
  take(bright, 'bright');
  take(dropsOk[1], 'drop');
  // Fill any open slot with the biggest remaining drop, including regions held back by rule 5.
  for (const r of [...held, ...dropsOk.slice(2)].sort((a, b) => a.delta! - b.delta!)) take(r, r.lowCount ? 'low-count' : 'fill');

  const maxLow = Math.max(...live.map((r) => r.cur.low08));
  return picks.map((p) => {
    const r = m.regions.find((x) => x.region === p.region)!;
    const lows = surveys.filter((s) => s.fw === m.fw && s.region === p.region && s.ltr !== null && s.ltr < 9);
    const { n, low08 } = r.cur;
    let categories: CalloutCategory[];
    let why: string;
    if (p.slot === 'bright') {
      categories = r.lowCount ? ['ABOVE BENCHMARK', 'LOW SURVEY COUNT'] : ['ABOVE BENCHMARK'];
      why = low08 === 0 ? `${n} surveys, all 9–10` : `${n} surveys; ${low08} scored 0–8`;
    } else if (p.slot === 'low-count' || r.lowCount) {
      categories = ['LOW SURVEY COUNT'];
      why = `${n} surveys; ${low08} detractor${low08 === 1 ? '' : 's'}`;
    } else if (p.slot === 'contributor') {
      categories = suggestCategories(lows, tags);
      why = low08 === maxLow && picks.filter((x) => x.slot === 'contributor')[0]?.region === p.region
        ? `${low08} of ${n} surveys were detractors; most of any region`
        : `${low08} of ${n} surveys scored 0–8`;
    } else {
      categories = suggestCategories(lows, tags);
      why = `${n} surveys; ${scoresPhrase(lows.map((s) => s.ltr!))}`;
    }
    return { ...p, categories, why };
  });
}

/** “R5 · 84* ▼6” */
export function calloutHeadline(r: RegionRow): string {
  const arrow = r.delta === null || r.delta === 0 ? '' : r.delta > 0 ? ` ▲${r.delta}` : ` ▼${Math.abs(r.delta)}`;
  return `${r.region} · ${r.cur.display ?? '—'}${r.lowCount ? '*' : ''}${arrow}`;
}

// ───────── Key Drivers ─────────
export interface DriverDef { key: string; short: string }
export const DEFAULT_DRIVERS: DriverDef[] = [
  { key: 'professionalism', short: 'Professionalism' },
  { key: 'timeToAppt', short: 'Complete Time' },
  { key: 'processPrior', short: 'Process' },
  { key: 'scheduling', short: 'Scheduling' },
];
export interface DriverValue extends DriverDef { pct: number | null; display: number | null; n: number }

/** Week driver scores: Medallia Analytics first (as the slide uses), else per-survey answers. Sorted high → low. */
export function keyDrivers(fw: number, defs: DriverDef[], analytics: AttributeWeekly[], surveys: SurveyRecord[]): DriverValue[] {
  const ws = surveys.filter((s) => s.fw === fw);
  return defs.map((d) => {
    const a = analytics.find((x) => x.fw === fw && x.attr === d.key);
    if (a) return { ...d, pct: a.pct, display: displayWhole(a.pct), n: a.n };
    const v = ws.map((s) => s.attrs?.[d.key as keyof NonNullable<SurveyRecord['attrs']>]).filter((x): x is number => typeof x === 'number');
    const pct = v.length ? (100 * v.filter((x) => x >= 9).length) / v.length : null;
    return { ...d, pct, display: pct === null ? null : displayWhole(pct), n: v.length };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

// ───────── Promoter / Passive / Detractor cards ─────────
export type Bucket = 'promoters' | 'passives' | 'detractors';
export const bucketOf = (ltr: number): Bucket => (ltr >= 9 ? 'promoters' : ltr >= 7 ? 'passives' : 'detractors');

const DRIVER_HINTS: [RegExp, string][] = [
  [/professional/i, 'Professionalism'], [/knowledg|explain|informat/i, 'Knowledge'], [/craftsman|thorough|quality of work|meticulous|skill/i, 'Craftsmanship'],
  [/schedul|appointment|confirm/i, 'Ease of Scheduling'], [/not covered|exclud|scope|process/i, 'Ease of Process'],
  [/leak|no hot water|broke|damage|not finished|didn'?t finish|quality/i, 'Project Quality'], [/value|price|worth|cost|money/i, 'Project Value'],
  [/subscription|renew|cancel/i, 'Overall Subscription'], [/on time|quick|took (a while|forever)|long time/i, 'Complete Time'],
];

/** “What their comments point to” — suggested from comment text, theme tags and (as hints) Medallia topics. */
export function suggestTopDrivers(group: SurveyRecord[], tags: Map<string, ThemeTag>): string[] {
  const score = new Map<string, number>();
  const bump = (d: string, w: number) => score.set(d, (score.get(d) ?? 0) + w);
  for (const s of group) {
    for (const [re, d] of DRIVER_HINTS) if (re.test(s.comment)) bump(d, 1);
    const t = tags.get(s.id);
    if (t) for (const th of [t.primary, ...t.secondary]) {
      if (th === 'exclusions') { bump('Ease of Process', 1); bump('Overall Subscription', 0.6); }
      if (th === 'damage' || th === 'completion') bump('Project Quality', 1);
      if (th === 'appointment') bump('Ease of Scheduling', 1);
      if (th === 'value') bump('Overall Subscription', 0.6);
    }
    for (const topic of s.topics ?? []) for (const [re, d] of DRIVER_HINTS) if (re.test(topic)) bump(d, 0.3);
  }
  return [...score].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
}

/** Draft bullets (≈ 60 characters, plain language). The analyst edits them. */
export function draftBullets(bucket: Bucket, group: SurveyRecord[], tags: Map<string, ThemeTag>): string[] {
  const withComment = group.filter((s) => s.comment.trim());
  const has = (s: SurveyRecord, th: string) => { const t = tags.get(s.id); return !!t && (t.primary === th || t.secondary.includes(th)); };
  const out: string[] = [];
  if (bucket === 'promoters') {
    const assoc = withComment.filter((s) => has(s, 'associate'));
    if (withComment.length) out.push(`The RedVest are the reason: ${assoc.length} of ${withComment.length} comments call them out`);
    const quote = assoc.map((s) => s.comment.replace(/\s+/g, ' ').trim()).filter((c) => c.length >= 25 && c.length <= 58 && !/\[/.test(c)).sort((a, b) => b.length - a.length)[0];
    if (quote) out.push(`“${quote.replace(/[.!]+$/, '')}”`);
  } else if (bucket === 'passives') {
    const scope = withComment.filter((s) => has(s, 'exclusions'));
    const assoc = withComment.filter((s) => has(s, 'associate') && tags.get(s.id)?.subTag !== 'Concern');
    if (assoc.length && scope.length) out.push('Liked the RedVest but HC+ didn’t cover what they expected');
    else if (assoc.length) out.push(`${assoc.length} liked the RedVest Associate but stopped short of a 9`);
    if (scope.length) out.push(`${scope.length} not covered: ${itemsNotCovered(scope).join(', ') || 'see comments'}`);
  } else {
    const scope = withComment.filter((s) => has(s, 'exclusions'));
    const exec = withComment.filter((s) => has(s, 'damage') || has(s, 'completion'));
    const sched = withComment.filter((s) => has(s, 'appointment'));
    if (scope.length) out.push(`${scope.length} learned the service isn’t covered`);
    if (exec.length) out.push(`${exec.length} visit${exec.length === 1 ? '' : 's'} had a problem${itemsProblem(exec).length ? `: ${itemsProblem(exec).join(', ')}` : ''}`);
    if (sched.length) out.push(`${sched.length} had trouble scheduling or confirming`);
    if (!out.length && group.length) out.push(`${group.length} scored 0–6; ${group.length - withComment.length} left no comment`);
  }
  return out.slice(0, 3);
}

const COVER_ITEMS: [RegExp, string][] = [[/tankless/i, 'tankless water heater'], [/gas water heater|gas heater/i, 'gas water heater'], [/gas dryer/i, 'gas dryer'], [/roof/i, 'roof-vented dryer vent'], [/can lights?|recessed/i, 'wired can lights'], [/thermostat/i, 'thermostat'], [/warrant/i, '“warranty”'], [/12 ?(ft|feet|foot)|too high|second (story|floor)|2nd (story|floor|level)/i, 'high/2nd-story items'], [/electric/i, 'electrical work'], [/garage door/i, 'garage door']];
const PROBLEM_ITEMS: [RegExp, string][] = [[/no hot water/i, 'no hot water'], [/garage door/i, 'garage door'], [/dryer/i, 'dryer'], [/leak/i, 'leak'], [/refrigerator|fridge/i, 'refrigerator'], [/filter/i, 'filter not replaced']];
function itemsNotCovered(ss: SurveyRecord[]) { return [...new Set(ss.flatMap((s) => COVER_ITEMS.filter(([re]) => re.test(s.comment)).map(([, l]) => l)))].slice(0, 3); }
function itemsProblem(ss: SurveyRecord[]) { return [...new Set(ss.flatMap((s) => PROBLEM_ITEMS.filter(([re]) => re.test(s.comment)).map(([, l]) => l)))].slice(0, 3); }

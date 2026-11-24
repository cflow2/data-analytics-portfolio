/**
 * Synthetic, clearly labeled DEMO data. No real people, stores or comments.
 * Deterministic (seeded) and built to reproduce the real FW38–FW40 baselines so every screen can be checked.
 */
import { Rng, jitterSplit } from '@/lib/random';
import { addDays, type ISODate } from '@/lib/dates';
import { weekStart, DEFAULT_FY_START } from '@/lib/fiscal';
import { REGIONS } from '@/domain/geo';
import { ATTRIBUTES } from '@/domain/attributes';
import type {
  AttributeKey, FollowUpRecord, LeadershipQuestion, Sentiment,
  StoreRecord, SurveyRecord, ThemeTag, WeekMeta,
} from '@/domain/types';

export const DEMO_SOURCE = 'DEMO data (synthetic)';
export const DEMO_LATEST_FW = 40;

export interface DemoData {
  stores: StoreRecord[];
  surveys: SurveyRecord[];
  followups: FollowUpRecord[];
  tags: ThemeTag[];
  weeks: WeekMeta[];
  questions: LeadershipQuestion[];
}

// ───────────────────────────── stores ─────────────────────────────
const CITY_A = ['Cedar', 'Maple', 'Oak', 'Pine', 'Willow', 'Birch', 'Aspen', 'Elm', 'Hickory', 'Laurel', 'Juniper', 'Magnolia', 'Sycamore', 'Alder', 'Hazel', 'Spruce', 'Poplar', 'Linden', 'Cypress', 'Chestnut'];
const CITY_B = [' Ridge', ' Falls', 'brook', ' Hollow', ' Springs', 'field', ' Crossing', ' Grove', 'dale', ' Point', ' Heights', ' Bluff', ' Landing', ' Park', 'wood', ' Valley'];
const REGION_STATES: Record<string, string[]> = {
  R1: ['NC', 'SC'], R2: ['VA', 'MD'], R3: ['GA', 'AL'], R4: ['FL'], R5: ['OH', 'MI'], R6: ['TX'], R7: ['TN', 'KY'],
  R8: ['PA', 'NJ'], R12: ['CA'], R14: ['AZ', 'NV'], R15: ['IL', 'IN'], R18: ['WA', 'OR'], R21: ['CO', 'UT'], R27: ['NY', 'CT'],
};

function makeStores(rng: Rng): StoreRecord[] {
  const used = new Set<string>();
  const names = new Set<string>();
  const stores: StoreRecord[] = [];
  for (const region of REGIONS) {
    const districts = rng.int(3, 4);
    for (let d = 1; d <= districts; d++) {
      const count = rng.int(4, 6);
      for (let s = 0; s < count; s++) {
        let no: string;
        do { no = String(rng.int(1000, 3299)); } while (used.has(no));
        used.add(no);
        let city: string;
        do { city = rng.pick(CITY_A) + rng.pick(CITY_B); } while (names.has(city));
        names.add(city);
        stores.push({
          storeNo: no, name: `DEMO ${city}`, city, state: rng.pick(REGION_STATES[region]),
          district: `${region}-D${d}`, region,
        });
      }
    }
  }
  // A few unmapped stores (no district) so the Data Manager can show the count.
  for (const idx of [7, 41, 88, 150, 199]) if (stores[idx]) stores[idx].district = null;
  return stores;
}

// ───────────────────────────── survey comments ─────────────────────────────
interface CommentSpec {
  text: string;
  primary: string | null;
  secondary?: string[];
  sentiment: Sentiment;
  subTag?: string;
}

const ASSOC_PRAISE = [
  'The RedVest Associate was friendly and explained everything he did.',
  'Our RedVest Associate was professional, on time and very thorough.',
  'Very knowledgeable associate. Answered all my questions about the water heater.',
  'The associate was courteous and respectful of our home.',
  'Great RedVest Associate, took his time and did a thorough job.',
  'Associate was polite, professional and cleaned up after himself.',
  'She was knowledgeable and friendly, showed me how to change the filter myself next time.',
  'Excellent associate. Explained what she checked on each appliance.',
  'The RedVest Associate was respectful, quick and knew his stuff.',
  'Friendly associate who clearly takes pride in the work.',
  'Professional and courteous from start to finish.',
  'He was very thorough with the dryer vent and explained what he found.',
];
const VALUE_POS = [
  'Worth every penny for the peace of mind.',
  'Great value for $99 a year.',
  'The service pays for itself with just one visit.',
  'Good value, and the associate was friendly and professional.',
  'For the price this is a great deal. Associate was knowledgeable.',
  'Well worth the money. The associate explained everything.',
  'Excellent value, and our RedVest Associate was courteous.',
];
const APPT_PROMOTER = [
  'Scheduling online was a little confusing, but the associate was great.',
  'Took a while to get an appointment, but the RedVest Associate was very professional.',
  'Had to call to confirm the arrival time. Once he arrived the associate was friendly.',
  'The website kept timing out when I tried to book, but the visit itself was good.',
];
const AGING = [
  'At my age I can’t climb a ladder anymore, so this service is a blessing.',
  'I’m a widow and live alone, so having someone check everything is a huge help.',
  'My husband is disabled and this keeps our home safe. Thank you.',
];
const SERVICE_ADD = [
  'Would be nice if they also changed the keypad batteries on the door lock.',
  'Wish they would add more services like gutter checks.',
];
const GENERIC_POS = ['Great service, thank you!', 'Very happy with the program.', 'Everything went smoothly.', 'Will renew next year.'];

const OTHER_WEEK_NEG: CommentSpec[] = [
  { text: 'Had to reschedule twice because no one showed up.', primary: 'appointment', sentiment: 'Negative', subTag: 'No-show/missed' },
  { text: 'They would not service our tankless water heater, which is why I signed up.', primary: 'exclusions', sentiment: 'Negative', subTag: 'Exclusion question' },
  { text: 'The associate did not bring the right filter, so it was not replaced.', primary: 'completion', sentiment: 'Negative' },
  { text: 'Not sure it is worth the money given everything that is excluded.', primary: 'value', secondary: ['exclusions'], sentiment: 'Negative' },
  { text: 'The app kept showing an error message when I tried to book.', primary: 'appointment', sentiment: 'Negative', subTag: 'Online/app failure' },
  { text: 'Dryer vent is roof vented so it was skipped.', primary: 'exclusions', sentiment: 'Negative', subTag: 'Exclusion question' },
  { text: 'The associate seemed rushed and did not explain much.', primary: 'associate', sentiment: 'Negative', subTag: 'Concern' },
];

/** FW40 detractor specs, pinned to regions so Region 5 and 27 land near 89%. */
const FW40_DETRACTORS: (CommentSpec & { score: number; region: string })[] = [
  { region: 'R5', score: 8, text: 'Had to reschedule twice through the app before it finally went through.', primary: 'appointment', sentiment: 'Negative', subTag: 'Online/app failure' },
  { region: 'R5', score: 5, text: 'They said the gas water heater is not covered, so half my list was skipped.', primary: 'exclusions', sentiment: 'Negative', subTag: 'Exclusion question' },
  { region: 'R27', score: 7, text: 'The RedVest Associate was friendly but could not do the roof vented dryer vent.', primary: 'exclusions', secondary: ['associate'], sentiment: 'Negative', subTag: 'Exclusion question' },
  { region: 'R27', score: 0, text: 'Nobody showed up for my appointment and no one called to explain. Call me back at (555) 014-2231, Jane Sample.', primary: 'appointment', sentiment: 'Negative', subTag: 'No-show/missed' },
  { region: 'R1', score: 8, text: 'The associate did not bring the HVAC filter so it was never changed. Waiting on a second visit.', primary: 'completion', sentiment: 'Negative' },
  { region: 'R6', score: 8, text: 'Our water heater is tankless so it was not serviced at all.', primary: 'exclusions', sentiment: 'Negative', subTag: 'Exclusion question' },
  { region: 'R12', score: 7, text: 'Not sure it is worth $99 a year given what is excluded.', primary: 'value', secondary: ['exclusions'], sentiment: 'Negative' },
];

/** FW40 promoter comments, sized to hit: Associate 72, Value 9 (7+/2−), Appointment 6, Exclusions 4, Completion 1. */
function fw40PromoterComments(rng: Rng): CommentSpec[] {
  const out: CommentSpec[] = [];
  // 7 positive value: 4 also mention the associate
  for (let i = 0; i < 7; i++) {
    const withAssoc = i >= 3;
    out.push({
      text: withAssoc ? VALUE_POS[3 + (i - 3)] : VALUE_POS[i],
      primary: 'value', secondary: withAssoc ? ['associate'] : [], sentiment: 'Positive',
    });
  }
  // 1 negative value from a promoter, with associate secondary
  out.push({ text: 'Great associate, but the price went up and I am on the fence about renewing.', primary: 'value', secondary: ['associate'], sentiment: 'Negative' });
  // 4 appointment mentions from promoters, 3 with associate secondary
  APPT_PROMOTER.forEach((text, i) => out.push({
    text, primary: 'appointment', secondary: i < 3 ? ['associate'] : [], sentiment: 'Neutral',
    subTag: i === 3 ? 'Online/app failure' : i === 2 ? 'Arrival-time request' : 'Routine scheduling',
  }));
  // Associate mentions so far: 1 (R27 detractor) + 4 + 1 + 3 = 9 → 63 associate-primary praise comments
  for (let i = 0; i < 63; i++) out.push({ text: ASSOC_PRAISE[i % ASSOC_PRAISE.length], primary: 'associate', sentiment: 'Positive', subTag: 'Praise' });
  AGING.slice(0, 2).forEach((text) => out.push({ text, primary: 'aging', sentiment: 'Positive' }));
  out.push({ text: SERVICE_ADD[0], primary: 'service-add', sentiment: 'Neutral' });
  for (let i = 0; i < 4; i++) out.push({ text: GENERIC_POS[i], primary: 'other', sentiment: 'Positive' });
  return rng.shuffle(out);
}

function genericPromoterComment(rng: Rng): CommentSpec | null {
  const r = rng.float();
  if (r < 0.3) return null; // blank comment
  if (r < 0.82) return { text: rng.pick(ASSOC_PRAISE), primary: 'associate', sentiment: 'Positive', subTag: 'Praise' };
  if (r < 0.88) return { text: rng.pick(VALUE_POS.slice(0, 3)), primary: 'value', sentiment: 'Positive' };
  if (r < 0.92) { const text = rng.pick(APPT_PROMOTER); return { text, primary: 'appointment', secondary: /associate/i.test(text) ? ['associate'] : [], sentiment: 'Neutral', subTag: 'Routine scheduling' }; }
  if (r < 0.94) return { text: rng.pick(AGING), primary: 'aging', sentiment: 'Positive' };
  if (r < 0.95) return { text: rng.pick(SERVICE_ADD), primary: 'service-add', sentiment: 'Neutral' };
  return { text: rng.pick(GENERIC_POS), primary: 'other', sentiment: 'Positive' };
}

// ───────────────────────────── weekly LTR plan ─────────────────────────────
/** n and promoters per week FW1–FW40. FW39 = 123/131 (93.9%), FW40 = 124/131 (94.7%), FYTD = 3478/3736 (93.1%). */
export function weeklyPlan(rng: Rng): { fw: number; n: number; promoters: number }[] {
  const ns = jitterSplit(rng, 3736 - 262, 38, 14);
  const targetPromoters = 3478 - 123 - 124; // 3231
  // Per-week rate jitter around the remaining average, then fix the total.
  const avg = targetPromoters / (3736 - 262);
  const ps = ns.map((n) => Math.min(n, Math.round(n * (avg + (rng.float() * 2 - 1) * 0.018))));
  let diff = targetPromoters - ps.reduce((a, b) => a + b, 0);
  let i = 0;
  while (diff !== 0) {
    const k = i % 38;
    if (diff > 0 && ps[k] < ns[k] - 2) { ps[k]++; diff--; }
    else if (diff < 0 && ps[k] > 0) { ps[k]--; diff++; }
    i++;
  }
  const plan = ns.map((n, idx) => ({ fw: idx + 1, n, promoters: ps[idx] }));
  plan.push({ fw: 39, n: 131, promoters: 123 }, { fw: 40, n: 131, promoters: 124 });
  return plan;
}

// ───────────────────────────── attributes ─────────────────────────────
/** FW40 attribute targets: [top2, n]. Lowest = Ease of scheduling 87.4%; in-home 95–96%; professionalism 96.1%. */
export const FW40_ATTRIBUTE_TARGETS: Record<AttributeKey, [number, number]> = {
  value: [112, 121],
  scheduling: [104, 119],
  quality: [120, 126],
  timeToAppt: [108, 120],
  processPrior: [110, 121],
  overall: [118, 127],
  craftsmanship: [121, 127],
  professionalism: [124, 129],
  knowledge: [122, 127],
};
const ATTR_BASE_RATE: Record<AttributeKey, number> = {
  value: 0.92, scheduling: 0.885, quality: 0.95, timeToAppt: 0.9, processPrior: 0.905,
  overall: 0.93, craftsmanship: 0.955, professionalism: 0.962, knowledge: 0.958,
};

function assignAttributes(rng: Rng, surveys: SurveyRecord[], targets?: Record<AttributeKey, [number, number]>) {
  for (const a of ATTRIBUTES) {
    let top2: number, n: number;
    if (targets) [top2, n] = targets[a.key];
    else {
      n = Math.max(1, Math.round(surveys.length * (0.9 + rng.float() * 0.07)));
      top2 = Math.min(n, Math.round(n * (ATTR_BASE_RATE[a.key] + (rng.float() * 2 - 1) * 0.02)));
    }
    const answered = rng.shuffle([...surveys]).slice(0, n);
    // Low scores go first to detractors (correlated), then random respondents.
    answered.sort((x, y) => Number((y.ltr ?? 10) < 9) - Number((x.ltr ?? 10) < 9));
    answered.forEach((s, i) => {
      s.attrs ??= {};
      s.attrs[a.key] = i < n - top2 ? rng.int(4, 8) : rng.chance(0.75) ? 10 : 9;
    });
  }
}

// ───────────────────────────── follow-ups ─────────────────────────────
const SM_NAMES = ['DEMO SM Avery', 'DEMO SM Blake', 'DEMO SM Casey', 'DEMO SM Devon', 'DEMO SM Emery', 'DEMO SM Finley', 'DEMO SM Gray'];
const DOCUMENTED = [
  'Called member on {d}; apologized and scheduled a return visit to finish the service.',
  'Spoke with member {d}. Explained exclusions; member appreciated the call.',
  'Reached member by phone {d}, rescheduled appointment and confirmed arrival window.',
];

// ───────────────────────────── main ─────────────────────────────
export function generateDemoData(seed = 4040): DemoData {
  const rng = new Rng(seed);
  const stores = makeStores(rng);
  const byRegion = new Map<string, StoreRecord[]>();
  for (const s of stores) byRegion.set(s.region, [...(byRegion.get(s.region) ?? []), s]);
  const surveys: SurveyRecord[] = [];
  const tags: ThemeTag[] = [];
  let seq = 0;

  const addSurvey = (fw: number, date: ISODate, region: string, ltr: number, c: CommentSpec | null): SurveyRecord => {
    const store = rng.pick(byRegion.get(region)!);
    const id = `DEMO-S-${String(++seq).padStart(6, '0')}`;
    const s: SurveyRecord = {
      id, fw, date, storeNo: store.storeNo, region, market: `DEMO Market ${region}-${rng.int(1, 3)}`,
      appointmentId: `DEMO-A-${String(seq).padStart(6, '0')}`, ltr, score100: ltr >= 9 ? 100 : 0,
      comment: c?.text ?? '', sourceFile: DEMO_SOURCE, demo: true,
    };
    surveys.push(s);
    if (c?.primary) {
      tags.push({
        recordId: id, channel: 'survey', fw, primary: c.primary, secondary: c.secondary ?? [], subTag: c.subTag,
        sentiment: c.sentiment, confidence: 1, source: 'Demo',
      });
    }
    return s;
  };

  const regionWeights = REGIONS.map((r) => (r === 'R5' || r === 'R27' ? 0.8 : 1));
  const promoterScore = () => (rng.chance(0.82) ? 10 : 9);
  const detractorScore = () => rng.weighted([8, 7, 6, 5, 3, 0], [0.42, 0.3, 0.1, 0.08, 0.05, 0.05]);

  for (const { fw, n, promoters } of weeklyPlan(rng)) {
    const start = weekStart(fw, DEFAULT_FY_START);
    const weekSurveys: SurveyRecord[] = [];
    if (fw === 40) {
      // Region plan: R5 17/19, R27 16/18, remainder spread over the other 12 regions.
      const det = FW40_DETRACTORS.map((d) => ({ ...d }));
      const promoterComments = fw40PromoterComments(rng);
      const others = REGIONS.filter((r) => r !== 'R5' && r !== 'R27');
      const otherN = jitterSplit(rng, 131 - 19 - 18, others.length, 2);
      const regionN: Record<string, number> = { R5: 19, R27: 18 };
      others.forEach((r, i) => (regionN[r] = otherN[i]));
      // ensure the pinned detractor regions have room
      for (const d of det) if (regionN[d.region] < 2) regionN[d.region] = 2;
      const diff = Object.values(regionN).reduce((a, b) => a + b, 0) - 131;
      if (diff !== 0) regionN.R3 -= diff;
      for (const region of REGIONS) {
        const mine = det.filter((d) => d.region === region);
        for (const d of mine) weekSurveys.push(addSurvey(fw, addDays(start, rng.int(0, 6)), region, d.score, d));
        for (let i = 0; i < regionN[region] - mine.length; i++) {
          const c = promoterComments.pop() ?? null;
          weekSurveys.push(addSurvey(fw, addDays(start, rng.int(0, 6)), region, promoterScore(), c));
        }
      }
      if (promoterComments.length) throw new Error('FW40 comment plan did not fit');
      assignAttributes(rng, weekSurveys, FW40_ATTRIBUTE_TARGETS);
      continue;
    }
    const scores = [...Array(promoters).fill('P'), ...Array(n - promoters).fill('D')] as ('P' | 'D')[];
    rng.shuffle(scores);
    for (const kind of scores) {
      const region = rng.weighted(REGIONS, regionWeights);
      if (kind === 'P') weekSurveys.push(addSurvey(fw, addDays(start, rng.int(0, 6)), region, promoterScore(), genericPromoterComment(rng)));
      else weekSurveys.push(addSurvey(fw, addDays(start, rng.int(0, 6)), region, detractorScore(), rng.chance(0.85) ? rng.pick(OTHER_WEEK_NEG) : null));
    }
    assignAttributes(rng, weekSurveys);
  }

  // Early next-week signal: FW41 surveys dated Sat/Sun Nov 7–8 (2 detractors).
  const fw41 = weekStart(41, DEFAULT_FY_START);
  const nextWeek: SurveyRecord[] = [];
  for (let i = 0; i < 10; i++) nextWeek.push(addSurvey(41, addDays(fw41, i % 2), rng.pick(REGIONS), promoterScore(), genericPromoterComment(rng)));
  nextWeek.push(addSurvey(41, fw41, 'R8', 6, OTHER_WEEK_NEG[1]));
  nextWeek.push(addSurvey(41, addDays(fw41, 1), 'R14', 8, OTHER_WEEK_NEG[4]));
  assignAttributes(rng, nextWeek);

  // Follow-ups for FW38–FW40 detractors. FW40: 3 documented, 2 email only, 2 missing.
  const followups: FollowUpRecord[] = [];
  for (const fw of [38, 39, 40]) {
    const dets = surveys.filter((s) => s.fw === fw && s.ltr !== null && s.ltr < 9);
    dets.forEach((s, i) => {
      let status: FollowUpRecord['status'];
      if (fw === 40) status = i < 3 ? 'Documented' : i < 5 ? 'Email only' : 'Missing';
      else status = i % 5 === 4 ? 'Email only' : 'Documented';
      if (status === 'Missing') return;
      const d = addDays(s.date, 2);
      followups.push({
        id: `demo-fu-${s.id}`, surveyId: s.id, date: s.date, fw, score: s.ltr, comment: s.comment,
        storeNo: s.storeNo, sm: SM_NAMES[i % SM_NAMES.length],
        insights: status === 'Documented' ? DOCUMENTED[i % DOCUMENTED.length].replace('{d}', d.slice(5).replace('-', '/')) : 'Sent email to SM',
        region: s.region, status, sourceFile: DEMO_SOURCE, demo: true,
      });
    });
  }

  const weeks: WeekMeta[] = [
    { fw: 39, locked: true, headline: 'LTR held above benchmark; exclusion questions are the steadiest detractor theme.', note: 'Leadership asked for detractor detail.' },
    { fw: 40, locked: false, headline: 'Members love the visit. The friction is getting it booked and getting it finished.' },
  ];
  const questions: LeadershipQuestion[] = [
    { id: 'demo-q-1', fw: 39, question: 'Leadership asked for detractor detail — who are they and did stores follow up?', answered: false, createdAt: '2026-11-04T15:00:00.000Z' },
    { id: 'demo-q-2', fw: 39, question: 'Which regions are below 93?', answered: false, createdAt: '2026-11-04T15:05:00.000Z' },
  ];

  return { stores, surveys, followups, tags, weeks, questions };
}

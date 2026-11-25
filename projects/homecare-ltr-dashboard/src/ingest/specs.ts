import type { AttributeKey, FileKind } from '@/domain/types';
import { normalizeHeader } from './normalize';

export interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  /** Exact header matches (normalized). */
  aliases: string[];
  /** Fallback: header contains every token of any one group. */
  contains?: string[][];
}

export interface KindSpec {
  kind: Exclude<FileKind, 'demo'>;
  label: string;
  fields: FieldSpec[];
  fileHint?: RegExp;
  sheetHint?: RegExp;
}

export const ATTR_FIELDS: (FieldSpec & { key: AttributeKey })[] = [
  { key: 'value', label: 'Value for money', required: false, aliases: ['value for money', 'project value'], contains: [['value', 'money']] },
  { key: 'scheduling', label: 'Ease of scheduling', required: false, aliases: ['ease of scheduling'], contains: [['ease', 'schedul']] },
  { key: 'quality', label: 'Quality of services', required: false, aliases: ['quality of services', 'quality of service', 'project quality'], contains: [['quality', 'service']] },
  { key: 'timeToAppt', label: 'Time to complete the project', required: false, aliases: ['time to complete the project', 'amount of time it took to complete your project', 'time to get an appointment'], contains: [['time to get'], ['amount of time', 'complete']] },
  { key: 'processPrior', label: 'Ease of process prior to the appointment', required: false, aliases: ['ease of process prior to the appointment', 'ease of process'], contains: [['prior', 'appointment']] },
  { key: 'overall', label: 'Overall subscription', required: false, aliases: ['overall subscription', 'the overall homecare+ subscription'], contains: [['overall', 'subscription']] },
  { key: 'craftsmanship', label: 'Associate craftsmanship', required: false, aliases: ['associate craftsmanship', 'craftsmanship'], contains: [['craftsmanship']] },
  { key: 'professionalism', label: 'Associate professionalism', required: false, aliases: ['associate professionalism', 'professionalism'], contains: [['professionalism']] },
  { key: 'knowledge', label: 'Associate knowledge', required: false, aliases: ['associate knowledge', 'knowledge'], contains: [['associate', 'knowledge']] },
];
export const ATTR_FIELD_KEYS = ATTR_FIELDS.map((f) => f.key);

const COMMENT_HC = "please provide any additional feedback about the mylowe's rewards homecare+ subscription";

export const SPECS: KindSpec[] = [
  {
    kind: 'tracker', label: 'LTR Tracker', fileHint: /ltr[_ ]?tracker/i, sheetHint: /^export data$/i,
    fields: [
      { key: 'surveyId', label: 'Surveyid for internal use (e.g. RI link)', required: true, aliases: ['surveyid for internal use (e.g. ri link)', 'surveyid', 'survey id'], contains: [['surveyid']] },
      { key: 'region', label: "Lowe's Region", required: true, aliases: ["lowe's region", 'region'] },
      { key: 'market', label: "Lowe's Market", required: false, aliases: ["lowe's market", 'market'] },
      { key: 'division', label: "Lowe's Division", required: false, aliases: ["lowe's division", 'division'] },
      { key: 'topics', label: 'Medallia topic tags', required: false, aliases: ['combined ta topics', 'combined topics and sentiments tagged original'] },
      { key: 'storeNo', label: 'Store #', required: true, aliases: ['store #', 'store number', 'store no', 'store'] },
      { key: 'storeName', label: 'Store (e.g. “2968 - LOWE’S OF CARROLLTON, GA”)', required: false, aliases: ['store', 'store name', 'storename'] },
      { key: 'date', label: 'Date Only', required: true, aliases: ['date only', 'response date', 'survey date', 'date'] },
      { key: 'appointmentId', label: 'Appointment ID', required: false, aliases: ['appointment id', 'appointmentid'] },
      { key: 'ltr', label: 'Likelihood to Recommend', required: true, aliases: ['likelihood to recommend'], contains: [['likelihood', 'recommend']] },
      { key: 'score100', label: 'Score (100/0)', required: false, aliases: ['score'] },
      { key: 'fw', label: 'FW #', required: false, aliases: ['fw #', 'fw', 'fiscal week'] },
      { key: 'comment', label: 'HomeCare+ comment', required: false, aliases: [COMMENT_HC], contains: [['additional feedback', 'homecare']] },
    ],
  },
  {
    kind: 'medallia-responses', label: 'Medallia Responses export', fileHint: /responses?[_ ]?export/i,
    fields: [
      { key: 'surveyId', label: 'Survey / Response ID', required: false, aliases: ['surveyid for internal use (e.g. ri link)', 'surveyid', 'survey id', 'response id', 'responseid'] },
      { key: 'date', label: 'Response date', required: true, aliases: ['date only', 'response date', 'survey date', 'date', 'response date (local)'] },
      { key: 'ltr', label: 'Likelihood to Recommend', required: true, aliases: ['likelihood to recommend', 'ltr', 'score'], contains: [['likelihood', 'recommend']] },
      { key: 'comment', label: 'Comment', required: false, aliases: [COMMENT_HC, 'comment', 'comments', 'feedback'], contains: [['additional feedback']] },
      { key: 'storeNo', label: 'Store #', required: false, aliases: ['store #', 'store number', 'store no', 'store'] },
      { key: 'region', label: 'Region', required: false, aliases: ["lowe's region", 'region'] },
      { key: 'division', label: "Lowe's Division", required: false, aliases: ["lowe's division", 'division'] },
      { key: 'topics', label: 'Medallia topic tags', required: false, aliases: ['combined ta topics', 'combined topics and sentiments tagged original'] },
      { key: 'storeName', label: 'Store (name)', required: false, aliases: ['store name'] },
      { key: 'appointmentId', label: 'Appointment ID', required: false, aliases: ['appointment id'] },
      ...ATTR_FIELDS,
    ],
  },
  {
    kind: 'medallia-analytics', label: 'Medallia Analytics driver report', fileHint: /analytics/i,
    fields: [
      { key: 'fw', label: 'Fiscal week', required: true, aliases: ['fw', 'fw #', 'fiscal week', 'week'] },
      { key: 'attribute', label: 'Attribute / question', required: true, aliases: ['attribute', 'question', 'driver', 'metric', 'measure'] },
      { key: 'pct', label: 'Top-2-box %', required: true, aliases: ['top 2 box %', 'top 2 box', 'top-2-box %', 'top-2-box', 't2b', 't2b %', 'top2box', '%'] },
      { key: 'n', label: 'n (responses)', required: false, aliases: ['n', 'count', 'responses', 'base', 'response count'] },
    ],
  },
  {
    kind: 'commentary', label: 'Customer Commentary export', fileHint: /commentary/i,
    fields: [
      { key: 'date', label: 'date', required: true, aliases: ['date', 'response date'] },
      { key: 'ltr', label: 'score', required: true, aliases: ['score', 'ltr', 'likelihood to recommend'] },
      { key: 'comment', label: 'comment', required: true, aliases: ['comment', 'comments', 'customer commentary'] },
    ],
  },
  {
    kind: 'followup', label: 'Detractor follow-up file', fileHint: /^fw\s?\d+/i,
    fields: [
      { key: 'date', label: 'LL (date)', required: true, aliases: ['ll', 'date', 'survey date'] },
      { key: 'score', label: 'Score', required: true, aliases: ['score', 'ltr'] },
      { key: 'comment', label: 'Comment', required: false, aliases: ['comment', 'comments'] },
      { key: 'storeNo', label: 'Store', required: true, aliases: ['store', 'store #', 'store number'] },
      { key: 'sm', label: 'SM', required: false, aliases: ['sm', 'store manager', 'sm name'] },
      { key: 'insights', label: 'Insights', required: true, aliases: ['insights', 'insight', 'sm insights', 'sm insight'] },
      { key: 'region', label: 'Region', required: false, aliases: ['region'] },
      { key: 'fw', label: 'FW', required: false, aliases: ['fw', 'fw #'] },
      { key: 'fq', label: 'FQ', required: false, aliases: ['fq'] },
      { key: 'fp', label: 'FP', required: false, aliases: ['fp'] },
    ],
  },
  {
    kind: 'appointments', label: 'Appointment file (RedVest Associate)', fileHint: /appoint|job|schedul|associate/i,
    fields: [
      { key: 'appointmentId', label: 'Appointment ID', required: true, aliases: ['appointment id', 'appointment #', 'appointment number', 'appt id', 'appt #', 'appointment no', 'appointment'] },
      { key: 'associate', label: 'Associate', required: true, aliases: ['associate', 'associate name', 'redvest associate', 'redvest', 'technician', 'technician name', 'tech', 'tech name', 'service associate', 'assigned associate', 'assigned to', 'resource', 'resource name', 'employee', 'employee name'] },
      { key: 'jobId', label: 'Job ID', required: false, aliases: ['job id', 'job #', 'job number', 'job no', 'job', 'work order', 'work order #', 'work order number', 'project number'] },
      { key: 'storeNo', label: 'Store #', required: false, aliases: ['store #', 'store', 'store number', 'servicing store', 'store no'] },
      { key: 'date', label: 'Appointment date', required: false, aliases: ['appointment date', 'service date', 'scheduled date', 'completed date', 'date', 'visit date'] },
    ],
  },
  {
    kind: 'subscriptions', label: 'HomeCare+ subscriptions & appointments by store and week', fileHint: /^data\b|subscri/i,
    fields: [
      { key: 'storeNo', label: 'Store', required: true, aliases: ['store', 'store #', 'store number'] },
      { key: 'week', label: 'Week', required: true, aliases: ['week', 'fiscal week', 'fw'] },
      { key: 'subs', label: 'Net MLRHC+ Subscriptions', required: true, aliases: ['net mlrhc+ subscriptions', 'net subscriptions', 'subscriptions'] },
      { key: 'instore', label: 'Net MLRHC+ Store Subscriptions', required: true, aliases: ['net mlrhc+ store subscriptions', 'store subscriptions', 'in-store subscriptions'] },
      { key: 'online', label: 'Net MLRHC+ Online Subscriptions', required: false, aliases: ['net mlrhc+ online subscriptions', 'online subscriptions'] },
      { key: 'revenue', label: 'Net MLRHC+ Revenue', required: false, aliases: ['net mlrhc+ revenue', 'net revenue', 'revenue'] },
      { key: 'fy', label: 'Fiscal Year', required: false, aliases: ['fiscal year', 'fy'] },
      { key: 'storeName', label: 'Store Name', required: false, aliases: ['store name'] },
      { key: 'storeSet', label: 'Store Set', required: false, aliases: ['store set'] },
      { key: 'division', label: 'Division Name', required: false, aliases: ['division name', 'division'] },
      { key: 'region', label: 'Region', required: false, aliases: ['region', 'region number'] },
      { key: 'district', label: 'District', required: false, aliases: ['district'] },
      { key: 'appts', label: 'Completed Appointments', required: false, aliases: ['completed appointments'] },
      { key: 'regular', label: 'Regular', required: false, aliases: ['regular'] },
      { key: 'assessments', label: 'Assessments', required: false, aliases: ['assessments'] },
      { key: 'followUps', label: 'Follow UP', required: false, aliases: ['follow up', 'follow-up'] },
      { key: 'exceptions', label: 'Exceptions', required: false, aliases: ['exceptions'] },
      { key: 'followUpRequired', label: 'Follow Up Required', required: false, aliases: ['follow up required', 'follow-up required'] },
    ],
  },
  {
    kind: 'store-map', label: 'Store → District mapping', fileHint: /(store|district).*(map|district)/i,
    fields: [
      { key: 'storeNo', label: 'Store #', required: true, aliases: ['store #', 'store', 'store number', 'store no'] },
      { key: 'storeName', label: 'Store Name', required: false, aliases: ['store name', 'name'] },
      { key: 'city', label: 'City', required: false, aliases: ['city'] },
      { key: 'state', label: 'State', required: false, aliases: ['state', 'st'] },
      { key: 'district', label: 'District', required: true, aliases: ['district', 'district #', 'district name'] },
      { key: 'region', label: 'Region', required: false, aliases: ['region', "lowe's region"] },
    ],
  },
];

export const SPEC_BY_KIND = Object.fromEntries(SPECS.map((s) => [s.kind, s])) as Record<KindSpec['kind'], KindSpec>;

/** Remembered column mappings: field key → normalized header text. */
export type ColumnMapping = Record<string, string>;

/**
 * Map fields to column indexes. Priority: remembered mapping → exact alias → contains-tokens.
 * Each column is used at most once.
 */
export function matchFields(headers: unknown[], spec: KindSpec, remembered: ColumnMapping = {}): { map: Record<string, number>; missing: string[] } {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const map: Record<string, number> = {};
  const take = (key: string, idx: number) => { map[key] = idx; used.add(idx); };
  for (const f of spec.fields) {
    const want = remembered[f.key];
    if (want) { const i = norm.findIndex((h, j) => h === want && !used.has(j)); if (i >= 0) take(f.key, i); }
  }
  for (const f of spec.fields) {
    if (f.key in map) continue;
    for (const a of f.aliases) {
      const i = norm.findIndex((h, j) => h === a && !used.has(j));
      if (i >= 0) { take(f.key, i); break; }
    }
  }
  for (const f of spec.fields) {
    if (f.key in map || !f.contains) continue;
    const i = norm.findIndex((h, j) => !used.has(j) && h.length > 0 && f.contains!.some((g) => g.every((t) => h.includes(t))));
    if (i >= 0) take(f.key, i);
  }
  const missing = spec.fields.filter((f) => f.required && !(f.key in map)).map((f) => f.key);
  return { map, missing };
}

export interface Candidate {
  kind: KindSpec['kind'];
  sheet: string;
  /** 0-based index of the header row in the sheet's rows */
  headerIndex: number;
  map: Record<string, number>;
  missing: string[];
  score: number;
}

/** Score every (sheet, header row, kind) and return the best candidates, best first. */
export function detectCandidates(
  fileName: string,
  sheets: { name: string; rows: unknown[][] }[],
  remembered: Partial<Record<string, ColumnMapping>> = {},
  maxScan = 15,
): Candidate[] {
  const out: Candidate[] = [];
  for (const sheet of sheets) {
    const scan = Math.min(maxScan, sheet.rows.length);
    for (let r = 0; r < scan; r++) {
      const row = sheet.rows[r] ?? [];
      const filled = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
      if (filled < 2) continue;
      for (const spec of SPECS) {
        const { map, missing } = matchFields(row, spec, remembered[spec.kind]);
        const req = spec.fields.filter((f) => f.required);
        const reqHit = req.length - missing.length;
        if (reqHit === 0) continue;
        const optHit = Object.keys(map).length - reqHit;
        let score = reqHit * 3 + optHit + (missing.length === 0 ? 10 : 0);
        if (spec.fileHint?.test(fileName)) score += 4;
        if (spec.sheetHint?.test(sheet.name.trim())) score += 4;
        // Specificity: a tracker header row has SurveyID + Score + FW #
        if (spec.kind === 'tracker' && ('score100' in map) && ('fw' in map)) score += 2;
        if (spec.kind === 'store-map' && missing.length === 0 && /district/i.test(String(row[map.district]))) score += 1;
        out.push({ kind: spec.kind, sheet: sheet.name, headerIndex: r, map, missing, score });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

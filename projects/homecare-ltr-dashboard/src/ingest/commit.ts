/** Writes parsed records into IndexedDB: dedupes, merges sources, honours locked weeks, cross-checks follow-ups. */
import { db as defaultDb, type HomeCareDB } from '@/db/db';
import { countsForLtr } from '@/domain/survey';
import type { FollowUpRecord, OriginalText, StoreRecord, SurveyRecord } from '@/domain/types';
import { textKey } from './normalize';
import type { FollowUpCheck, ParsedFile, ValidationReport } from './types';

export async function lockedWeeks(database: HomeCareDB = defaultDb): Promise<Set<number>> {
  return new Set((await database.weeks.toArray()).filter((w) => w.locked).map((w) => w.fw));
}

const surveyKey = (s: Pick<SurveyRecord, 'date' | 'storeNo' | 'ltr'>) => `${s.date}|${s.storeNo}|${s.ltr}`;

/** Copy attributes / comment from a secondary-source record into the matched record. */
function mergeInto(target: SurveyRecord, from: SurveyRecord): boolean {
  let changed = false;
  if (from.attrs) {
    target.attrs ??= {};
    for (const [k, v] of Object.entries(from.attrs)) {
      if (target.attrs[k as keyof typeof target.attrs] === undefined) { target.attrs[k as keyof typeof target.attrs] = v; changed = true; }
    }
  }
  if (!target.comment && from.comment) { target.comment = from.comment; target.redactionUncertain = from.redactionUncertain; changed = true; }
  if (!target.appointmentId && from.appointmentId) { target.appointmentId = from.appointmentId; changed = true; }
  if (!target.division && from.division) { target.division = from.division; changed = true; }
  if (!target.topics?.length && from.topics?.length) { target.topics = from.topics; changed = true; }
  return changed;
}

export async function followupCheck(fw: number, database: HomeCareDB = defaultDb): Promise<FollowUpCheck> {
  const [surveys, fus] = await Promise.all([
    database.surveys.where('fw').equals(fw).toArray(),
    database.followups.where('fw').equals(fw).toArray(),
  ]);
  const dets = surveys.filter((s) => countsForLtr(s) && s.ltr !== null && s.ltr < 9);
  const linked = new Map(fus.filter((f) => f.surveyId).map((f) => [f.surveyId!, f]));
  const missing = dets.filter((d) => !linked.has(d.id) || linked.get(d.id)!.status === 'Missing')
    .map((d) => ({ surveyId: d.id, date: d.date, storeNo: d.storeNo, score: d.ltr }));
  const matched = dets.map((d) => linked.get(d.id)).filter((f): f is FollowUpRecord => !!f);
  return {
    fw, trackerNonPromoters: dets.length, inFile: fus.length,
    documented: matched.filter((f) => f.status === 'Documented').length,
    emailOnly: matched.filter((f) => f.status === 'Email only').length,
    missing,
  };
}

/** Link follow-up rows to Tracker surveys: same week + store + score, preferring the same date. */
function linkFollowups(fus: FollowUpRecord[], surveys: SurveyRecord[]) {
  const dets = surveys.filter((s) => countsForLtr(s) && s.ltr !== null && s.ltr < 9);
  const taken = new Set<string>();
  for (const f of fus) {
    const pool = dets.filter((d) => d.fw === f.fw && d.storeNo === f.storeNo && d.ltr === f.score && !taken.has(d.id));
    const hit = pool.find((d) => d.date === f.date) ?? (pool.length === 1 ? pool[0] : undefined);
    if (hit) { f.surveyId = hit.id; taken.add(hit.id); }
  }
}

export interface CommitOptions { targetWeek?: number; database?: HomeCareDB }

export async function commitParsed(parsed: ParsedFile, opts: CommitOptions = {}): Promise<ValidationReport> {
  const database = opts.database ?? defaultDb;
  const b = parsed.build;
  if (!b) throw new Error('Nothing to import: the file has not been parsed or still needs a column mapping.');
  const report: ValidationReport = structuredClone(b.report);
  const locked = await lockedWeeks(database);
  let lockedRows = 0;
  const notLocked = <T extends { fw: number }>(xs: T[]) => xs.filter((x) => (locked.has(x.fw) ? (lockedRows++, false) : true));
  let originals: OriginalText[] = b.originals;
  const touchedWeeks = new Set<number>();
  const surveyStoreNos = new Set<string>();

  await database.transaction('rw', [database.surveys, database.calls, database.followups, database.stores, database.attributeWeekly, database.originals, database.files, database.weeks, database.tags], async () => {
    // ── surveys ──
    if (b.surveys.length) {
      const incoming = notLocked(b.surveys);
      const fws = [...new Set(incoming.map((s) => s.fw))];
      const existing = (await database.surveys.where('fw').anyOf(fws).toArray());
      const byId = new Map(existing.map((s) => [s.id, s]));
      report.alreadyLoaded = incoming.filter((s) => byId.has(s.id)).length;
      let merged = 0;
      const puts: SurveyRecord[] = [];
      const deletes: string[] = [];
      if (b.kind === 'tracker') {
        // Fold earlier Medallia/commentary rows for the same survey into the Tracker record.
        const secondary = new Map<string, SurveyRecord[]>();
        for (const s of existing) if (!countsForLtr(s)) secondary.set(surveyKey(s), [...(secondary.get(surveyKey(s)) ?? []), s]);
        for (const s of incoming) {
          const prev = byId.get(s.id);
          if (prev?.attrs && !s.attrs) s.attrs = prev.attrs;
          const sec = secondary.get(surveyKey(s))?.shift();
          if (sec) { mergeInto(s, sec); deletes.push(sec.id); merged++; }
          puts.push(s);
        }
      } else {
        const primary = existing.filter(countsForLtr);
        const byAppt = new Map(primary.filter((s) => s.appointmentId).map((s) => [s.appointmentId!, s]));
        const byKey = new Map<string, SurveyRecord[]>();
        for (const s of primary) byKey.set(surveyKey(s), [...(byKey.get(surveyKey(s)) ?? []), s]);
        const byComment = new Map(primary.filter((s) => s.comment).map((s) => [`${s.date}|${s.ltr}|${textKey(s.comment)}`, s]));
        const byDateScoreNoComment = new Map<string, SurveyRecord[]>();
        for (const s of primary) if (!s.comment) { const k = `${s.date}|${s.ltr}`; byDateScoreNoComment.set(k, [...(byDateScoreNoComment.get(k) ?? []), s]); }
        const used = new Set<string>();
        const remap = new Map<string, string>();
        for (const s of incoming) {
          let target = byId.get(s.id);
          if (target && !countsForLtr(target)) { puts.push(s); continue; } // same secondary row re-uploaded
          target ??= (s.appointmentId ? byAppt.get(s.appointmentId) : undefined);
          if (!target && s.storeNo) target = byKey.get(surveyKey(s))?.find((x) => !used.has(x.id));
          if (!target && s.comment) target = byComment.get(`${s.date}|${s.ltr}|${textKey(s.comment)}`);
          if (!target && b.kind === 'commentary') {
            const pool = (byDateScoreNoComment.get(`${s.date}|${s.ltr}`) ?? []).filter((x) => !used.has(x.id));
            if (pool.length === 1) target = pool[0];
          }
          if (target) {
            used.add(target.id);
            if (mergeInto(target, s)) puts.push(target);
            remap.set(s.id, target.id);
            merged++;
          } else puts.push(s);
        }
        originals = originals.map((o) => (remap.has(o.recordId) ? { ...o, recordId: remap.get(o.recordId)! } : o));
      }
      report.merged = merged;
      if (deletes.length) {
        await database.surveys.bulkDelete(deletes);
        await database.tags.bulkDelete(deletes);
        await database.originals.where('recordId').anyOf(deletes).delete();
      }
      await database.surveys.bulkPut(puts);
      for (const s of incoming) { touchedWeeks.add(s.fw); if (s.storeNo) surveyStoreNos.add(s.storeNo); }
      // Make sure every store seen in the Tracker exists (district unknown until mapped).
      if (b.kind === 'tracker') {
        const known = new Map((await database.stores.bulkGet([...surveyStoreNos])).filter((x): x is StoreRecord => !!x).map((x) => [x.storeNo, x]));
        const region = new Map(incoming.map((s) => [s.storeNo, s.region]));
        const add: StoreRecord[] = [];
        for (const no of surveyStoreNos) {
          const k = known.get(no);
          if (!k) add.push({ storeNo: no, name: '', city: '', state: '', district: null, region: region.get(no) ?? '' });
          else if (!k.region && region.get(no)) add.push({ ...k, region: region.get(no)! });
        }
        await database.stores.bulkPut(add);
      }
    }

    // ── calls ──
    if (b.calls.length) {
      let calls = b.calls;
      if (opts.targetWeek) {
        report.targetWeek = opts.targetWeek;
        report.outsideWeek = calls.filter((c) => c.fw !== opts.targetWeek).length;
        if (report.outsideWeek) report.dropped[`Dated outside FW${opts.targetWeek}`] = report.outsideWeek;
        calls = calls.filter((c) => c.fw === opts.targetWeek);
        report.rowsKept = calls.length;
        const keep = new Set(calls.map((c) => c.id));
        originals = originals.filter((o) => keep.has(o.recordId));
      }
      calls = notLocked(calls);
      const existing = await database.calls.bulkGet(calls.map((c) => c.id));
      report.alreadyLoaded = existing.filter(Boolean).length;
      // Recount duplicates for the kept rows.
      const customer = calls.filter((c) => !c.isAssociate);
      const distinct = new Set(customer.map((c) => c.caseNo)).size;
      report.duplicates = { duplicateRows: report.duplicates?.duplicateRows ?? 0, repeatCaseRows: customer.length - distinct, distinctCases: distinct };
      report.associateCalls = calls.length - customer.length;
      await database.calls.bulkPut(calls);
      calls.forEach((c) => touchedWeeks.add(c.fw));
    }

    // ── follow-ups ──
    if (b.followups.length) {
      const fus = notLocked(b.followups);
      const fws = [...new Set(fus.map((f) => f.fw))];
      linkFollowups(fus, await database.surveys.where('fw').anyOf(fws).toArray());
      const existing = await database.followups.bulkGet(fus.map((f) => f.id));
      if (b.kind === 'followup') report.alreadyLoaded = existing.filter(Boolean).length;
      await database.followups.bulkPut(fus);
      fws.forEach((w) => touchedWeeks.add(w));
    }

    // ── stores ──
    if (b.stores.length) {
      const existing = new Map((await database.stores.bulkGet(b.stores.map((s) => s.storeNo))).filter((x): x is StoreRecord => !!x).map((x) => [x.storeNo, x]));
      await database.stores.bulkPut(b.stores.map((s) => {
        const e = existing.get(s.storeNo);
        return e ? { ...e, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== '' && v !== null)), storeNo: s.storeNo } as StoreRecord : s;
      }));
    }

    // ── attributes ──
    if (b.attributeWeekly.length) await database.attributeWeekly.bulkPut(notLocked(b.attributeWeekly));

    await database.originals.bulkPut(originals);
  });

  if (lockedRows) { report.lockedWeekRows = lockedRows; report.dropped['Week is locked'] = lockedRows; report.rowsKept -= lockedRows; }

  // Cross-checks that need the database.
  if (b.kind === 'tracker' || b.kind === 'followup') {
    const weeks = b.kind === 'followup' ? [...new Set(b.followups.map((f) => f.fw))] : [...touchedWeeks].filter((w) => w >= Math.max(...touchedWeeks) - 1);
    report.followupCheck = [];
    for (const w of weeks.sort((a, z) => a - z)) {
      const hasFollowups = (await database.followups.where('fw').equals(w).count()) > 0;
      if (hasFollowups || b.kind === 'followup') report.followupCheck.push(await followupCheck(w, database));
    }
  }
  if (b.kind === 'medallia-analytics') {
    report.medalliaLtrCheck = [];
    for (const m of b.attributeWeekly.filter((a) => a.attr === 'ltr')) {
      const t = (await database.surveys.where('fw').equals(m.fw).toArray()).filter(countsForLtr);
      const valid = t.filter((x) => x.ltr !== null);
      const prom = valid.filter((x) => x.ltr! >= 9).length;
      report.medalliaLtrCheck.push({ fw: m.fw, medalliaPct: m.pct, medalliaN: m.n, trackerPct: valid.length ? (100 * prom) / valid.length : null, trackerN: valid.length });
    }
  }
  if (surveyStoreNos.size) {
    const st = await database.stores.bulkGet([...surveyStoreNos]);
    report.unmappedStores = [...surveyStoreNos].filter((_, i) => !st[i]?.district).sort();
  }
  if (b.kind === 'store-map') {
    report.unmappedStores = (await database.stores.toArray()).filter((s) => !s.district).map((s) => s.storeNo).sort();
  }

  if (b.regionMap) await database.kv.put({ key: 'regionMap', value: b.regionMap });
  // The week calls were imported into becomes the reporting week (the default in the filter bar).
  if (b.kind === 'loyalty-cases' && opts.targetWeek) {
    const prev = (await database.kv.get('reportingWeek'))?.value as number | undefined;
    if (!prev || opts.targetWeek >= prev) await database.kv.put({ key: 'reportingWeek', value: opts.targetWeek });
  }
  const weeks = Object.keys(report.weeks).map(Number).filter((w) => !opts.targetWeek || w === opts.targetWeek).sort((a, z) => a - z);
  await database.files.put({
    id: parsed.fileId, name: parsed.name, kind: b.kind, importedAt: new Date().toISOString(),
    sheet: parsed.candidate?.sheet, headerRow: (parsed.candidate?.headerIndex ?? 0) + 1,
    rows: report.rowsRead, kept: report.rowsKept, weeks, dateRange: report.dateRange, report,
  });
  return report;
}

export async function setWeekLocked(fw: number, locked: boolean, database: HomeCareDB = defaultDb) {
  const w = await database.weeks.get(fw);
  await database.weeks.put({ ...(w ?? { fw }), fw, locked });
}

/** Delete every record dated in a fiscal week (surveys, calls, follow-ups, attributes, tags, originals). */
export async function deleteWeek(fw: number, database: HomeCareDB = defaultDb): Promise<number> {
  return database.transaction('rw', [database.surveys, database.calls, database.followups, database.attributeWeekly, database.tags, database.originals, database.weeks], async () => {
    const ids = [
      ...(await database.surveys.where('fw').equals(fw).primaryKeys()),
      ...(await database.calls.where('fw').equals(fw).primaryKeys()),
      ...(await database.followups.where('fw').equals(fw).primaryKeys()),
    ] as string[];
    await database.surveys.where('fw').equals(fw).delete();
    await database.calls.where('fw').equals(fw).delete();
    await database.followups.where('fw').equals(fw).delete();
    await database.attributeWeekly.where('fw').equals(fw).delete();
    await database.tags.where('fw').equals(fw).delete();
    await database.originals.where('recordId').anyOf(ids).delete();
    await database.weeks.delete(fw);
    return ids.length;
  });
}

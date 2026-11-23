/** Test helper: the demo data as an in-memory Dataset, tagged by the rules engine (as the app does). */
import type { Dataset } from '@/data/dataset';
import { generateDemoData } from '@/demo/generate';
import { DEFAULT_TAXONOMY } from '@/domain/taxonomy';
import { redact } from '@/ingest/redact';
import { tagRecord } from '@/tagging/engine';
import type { ThemeTag } from '@/domain/types';

export function demoDataset(): Dataset {
  const d = generateDemoData();
  d.surveys.forEach((s) => (s.source = 'demo'));
  d.calls.forEach((c) => (c.notes = redact(c.notes).text));
  const tags: ThemeTag[] = [];
  for (const s of d.surveys) { const t = tagRecord({ id: s.id, channel: 'survey', fw: s.fw, text: s.comment }); if (t) tags.push(t); }
  for (const c of d.calls) { const t = tagRecord({ id: c.id, channel: 'call', fw: c.fw, text: c.notes, driver: c.driver, isAssociate: c.isAssociate }); if (t) tags.push(t); }
  return {
    surveys: d.surveys, calls: d.calls, followups: d.followups,
    stores: new Map(d.stores.map((s) => [s.storeNo, s])), tags: new Map(tags.map((t) => [t.recordId, t])), tagList: tags,
    attributeWeekly: [], weeks: new Map(d.weeks.map((w) => [w.fw, w])), escalations: new Map(), files: [],
    taxonomy: DEFAULT_TAXONOMY, signals: d.signals, pins: {},
  };
}

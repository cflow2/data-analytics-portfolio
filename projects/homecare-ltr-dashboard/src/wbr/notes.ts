import type { Dataset } from '@/data/dataset';
import type { WeekFacts } from '@/analytics/facts';
import { answer } from '@/ask/ask';
import { storeLabel } from '@/domain/geo';
import type { LeadershipQuestion } from '@/domain/types';
import type { SampleThresholds } from '@/lib/ltr';
import { speakerNotes } from '@/writing/write';

/** Open questions logged at earlier WBRs, oldest first. */
export function openQuestionsFor(ds: { questions?: LeadershipQuestion[] }, questions: LeadershipQuestion[], fw: number): LeadershipQuestion[] {
  void ds;
  return questions.filter((q) => q.fw < fw && !q.answered).sort((a, b) => a.fw - b.fw || a.createdAt.localeCompare(b.createdAt));
}

/** Answer a logged question with this week's data (via Ask); falls back to a prompt to answer by hand. */
export function autoAnswer(q: string, ctx: { ds: Dataset; fw: number; benchmark: number; thresholds: SampleThresholds }): string {
  const a = answer(q, { ...ctx, geo: { region: null, district: null, store: null } });
  if (a.notLoaded) return 'No automatic answer from the loaded data; answer from the slide.';
  return a.text.slice(0, 2).join(' ');
}

export function buildNotes(o: {
  ds: Dataset; f: WeekFacts; headline: string; thresholds: SampleThresholds; questions: LeadershipQuestion[]; pinnedAsk: string[];
}): string {
  const { ds, f } = o;
  const open = o.questions;
  let notes = speakerNotes({
    facts: f, tax: ds.taxonomy, headline: o.headline,
    questions: open.map((q) => ({ q, answer: autoAnswer(q.question, { ds, fw: f.fw, benchmark: f.benchmark, thresholds: o.thresholds }) })),
  });
  // Member voice: pinned quotes show store and score, never a name (text is already redacted).
  const pins = ds.pins[f.fw] ?? {};
  const quotes = Object.entries(pins).map(([theme, id]) => ({ theme, s: ds.surveys.find((x) => x.id === id) })).filter((x) => x.s?.comment);
  if (quotes.length) {
    const lines = quotes.map(({ theme, s }) => `• ${ds.taxonomy.find((t) => t.id === theme)?.name}: “${s!.comment.length > 180 ? `${s!.comment.slice(0, 177)}…` : s!.comment}” (store ${storeLabel(s!.storeNo, ds.stores)}, score ${s!.ltr ?? '—'})`);
    notes = notes.replace('\nTalking points:', `\nMember voice:\n${lines.join('\n')}\n\nTalking points:`);
  }
  if (o.pinnedAsk.length) notes = notes.replace('\nCaveats:', `\nAlso:\n${o.pinnedAsk.map((x) => `• ${x}`).join('\n')}\n\nCaveats:`);
  return notes;
}

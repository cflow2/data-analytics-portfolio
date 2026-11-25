/** Leadership questions logged at a WBR; open ones lead the next week's talk track with an answer from the data. */
import type { Dataset } from '@/data/dataset';
import { answer } from '@/ask/ask';
import type { LeadershipQuestion } from '@/domain/types';
import type { SampleThresholds } from '@/lib/ltr';

/** Open questions logged at earlier WBRs, oldest first. */
export function openQuestionsFor(questions: LeadershipQuestion[], fw: number): LeadershipQuestion[] {
  return questions.filter((q) => q.fw < fw && !q.answered).sort((a, b) => a.fw - b.fw || a.createdAt.localeCompare(b.createdAt));
}

/** Answer a logged question with this week's data (via Ask); falls back to a prompt to answer by hand. */
export function autoAnswer(q: string, ctx: { ds: Dataset; fw: number; benchmark: number; thresholds: SampleThresholds }): string {
  const a = answer(q, { ...ctx, geo: { region: null, district: null, store: null } });
  if (a.notLoaded) return 'No automatic answer from the loaded data; answer from the slide.';
  return a.text.slice(0, 2).join(' ');
}

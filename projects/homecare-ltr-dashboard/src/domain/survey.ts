import type { SurveyRecord } from './types';

/** The LTR Tracker is the source of truth for LTR. Medallia/commentary rows add comments and attributes only. */
export function countsForLtr(s: Pick<SurveyRecord, 'source'>): boolean {
  return s.source === undefined || s.source === 'tracker' || s.source === 'demo';
}

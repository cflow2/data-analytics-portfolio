import { describe, expect, it } from 'vitest';
import type { SurveyRecord } from '@/domain/types';
import { weekToDate } from './weekToDate';

const sv = (id: string, date: string, fw: number, ltr: number): SurveyRecord => ({ id, fw, date, storeNo: '1', region: 'R1', ltr, comment: '', sourceFile: 'f', source: 'tracker' });

describe('week to date (FW43 = Sat Nov 21 – Fri Nov 27)', () => {
  const surveys: SurveyRecord[] = [];
  let i = 0;
  for (const fw of [39, 40, 41, 42]) for (let k = 0; k < 200; k++) surveys.push(sv(`p${i++}`, fw === 42 ? (k < 60 ? '2026-11-15' : '2026-11-19') : '2026-10-30', fw, k < 6 ? 7 : 10));
  for (let k = 0; k < 67; k++) surveys.push(sv(`c${i++}`, k < 30 ? '2026-11-21' : '2026-11-23', 43, k < 4 ? 8 : 10));
  const w = weekToDate(surveys)!;
  it('LTR so far, days in, same point last week', () => {
    expect(w).toMatchObject({ fw: 43, from: '2026-11-21', through: '2026-11-23', days: 3, inProgress: true });
    expect([w.s.n, w.s.detractors]).toEqual([67, 4]);
    expect(w.s.pct).toBeCloseTo(6300 / 67, 9);
    expect(w.samePoint.n).toBe(60); // FW42 Sat–Mon
  });
  it('budget of 0–8 scores at a typical week', () => {
    expect(w.typicalN).toBe(200);
    expect(w.allowed).toBe(14);
    expect(w.left).toBe(10);
  });
  it('no surveys → null', () => expect(weekToDate([])).toBeNull());
});

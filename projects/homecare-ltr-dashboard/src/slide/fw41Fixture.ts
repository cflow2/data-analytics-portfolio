/**
 * Synthetic FW41 dataset that reproduces the slide spec's Section 9 numbers (no real survey text).
 * Region n / 9–10 counts match the FW41 Tracker; FW40 region splits are synthetic but give the same
 * week and division totals.
 */
import type { SurveyRecord } from '@/domain/types';

let seq = 0;
function rows(fw: number, region: string, scores: number[], comments: string[] = []): SurveyRecord[] {
  return scores.map((ltr, i) => ({
    id: `fx-${fw}-${region}-${seq++}`, source: 'tracker' as SurveyRecord['source'], fw, date: '2026-11-10', storeNo: '0001', region,
    ltr, comment: comments[i] ?? '', sourceFile: 'fixture',
  }));
}
const fill = (n: number, lows: number[]) => [...Array(n - lows.length).fill(10), ...lows];

export function fw41Fixture(): SurveyRecord[] {
  seq = 0;
  return [
    // FW38 188 / 14 scored 0–8; FW39 173 / 10
    ...rows(38, 'R2', fill(188, [8, 8, 8, 8, 8, 7, 7, 7, 6, 5, 4, 3, 1, 0])),
    ...rows(39, 'R2', fill(173, [8, 8, 8, 7, 7, 6, 5, 3, 2, 0])),
    // FW40: 127 surveys, 7 scored 0–8
    ...rows(40, 'R1', fill(11, [])), ...rows(40, 'R4', fill(6, [8])), ...rows(40, 'R7', fill(8, [])), ...rows(40, 'R18', fill(6, [])), ...rows(40, 'R21', fill(6, [])),
    ...rows(40, 'R2', fill(15, [])), ...rows(40, 'R3', fill(8, [7])), ...rows(40, 'R6', fill(8, [])), ...rows(40, 'R15', fill(5, [])), ...rows(40, 'R27', fill(18, [8, 6])),
    ...rows(40, 'R5', fill(19, [8, 5])), ...rows(40, 'R8', fill(7, [7])), ...rows(40, 'R12', fill(2, [])), ...rows(40, 'R14', fill(8, [])),
    // FW41: 218 surveys; 198 / 11 / 9
    ...rows(41, 'R1', fill(20, [8, 6])), ...rows(41, 'R2', fill(26, [])), ...rows(41, 'R3', fill(20, [8, 7, 7, 3]), Array(16).fill('').concat(['', 'Great RedVest but scheduling took three calls', 'Appointment was cancelled twice', 'Told the tankless water heater is not covered'])),
    ...rows(41, 'R4', fill(12, [])), ...rows(41, 'R5', fill(31, [8, 8, 7, 4, 0])), ...rows(41, 'R6', fill(10, [])),
    ...rows(41, 'R7', fill(8, [7])), ...rows(41, 'R8', fill(12, [6])), ...rows(41, 'R12', fill(11, [5])), ...rows(41, 'R14', fill(7, [])),
    ...rows(41, 'R15', fill(8, [])), ...rows(41, 'R18', fill(8, [7, 2, 1])), ...rows(41, 'R21', fill(5, [8])), ...rows(41, 'R27', fill(40, [7, 6])),
  ];
}

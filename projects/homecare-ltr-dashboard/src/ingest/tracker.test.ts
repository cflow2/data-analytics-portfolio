import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { DEFAULT_FY_START, weekStart, fiscalQuarter, fiscalMonth } from '@/lib/fiscal';
import { dayNumber } from '@/lib/dates';
import { checkFiscalCalendar, parseFile, parseStoreName } from './parse';
import { DEFAULT_REDACTION_RULES } from './redact';

const serial = (d: string) => dayNumber(d) + 25569;

describe('Tracker specifics (real layout)', () => {
  it('parses the Store column into city and state', () => {
    expect(parseStoreName("2968 - LOWE'S OF CARROLLTON, GA")).toMatchObject({ city: 'Carrollton', state: 'GA' });
    expect(parseStoreName("0564 - LOWE'S OF E. BRANDON, FL")).toMatchObject({ city: 'E. Brandon', state: 'FL' });
    expect(parseStoreName("1234 - LOWE'S OF WILLIAMSBURG, VA.")).toMatchObject({ city: 'Williamsburg', state: 'VA' });
    expect(parseStoreName("3284 - LOWE'S OF CHICAGO")).toMatchObject({ city: 'Chicago', state: '' });
  });

  it('checks the Fiscal Calendar sheet against the app', () => {
    const rows: unknown[][] = [['WE-Date', 'FY', 'FQ', 'FM', 'FW'], [serial('2025-02-01'), 2025, 1, 1, 1]];
    for (let fw = 1; fw <= 52; fw++) rows.push([serial(weekStart(fw)), 2026, fiscalQuarter(fw), fiscalMonth(fw), fw]);
    expect(checkFiscalCalendar(rows, DEFAULT_FY_START)).toEqual({ checked: 52, mismatches: [] });
    rows[42][2] = 3; // FW41 FQ 3
    expect(checkFiscalCalendar(rows, DEFAULT_FY_START)!.mismatches).toEqual(['FW41: sheet FQ 3, app Q4']);
  });

  it('ignores other programs’ attribute columns, formula-only rows, and reads store names', () => {
    const hdr = ['Surveyid for internal use (e.g. RI link)', "Lowe's Region", "Lowe's Market", 'Store', 'Store #', 'Date Only', 'Likelihood to Recommend',
      'The installer’s craftsmanship, meaning skill or workmanship of the installer', 'Associate Professionalism', 'Q10A - Were you notified about the delay in an acceptable amount of time',
      'Please provide any additional feedback about the MyLowe’s Rewards HomeCare+ subscription', ' Score', 'FW #'];
    const aoa = [['Survey Export'], [], hdr,
      [1, 5, 892, "2968 - LOWE'S OF CARROLLTON, GA", 2968, serial('2026-11-02'), 10, 4, 3, 2, 'Great', 100, 40],
      [null, null, null, null, null, null, null, null, null, null, null, null, 41],
    ];
    const ss = [['Region', 'Region2', 'District', 'Store ', 'Division'], [5, 'Region 5', 892, 2968, 'SOUTH']];
    const det = [['LL', 'Score', 'Comment', 'Store', 'SM', 'Insights', 'Region', 'FW', 'FQ', 'FP'], ...Array.from({ length: 5 }, () => [null, null, null, null, null, null, null, 48, 4, 11]), [serial('1900-08-05') - 25569 + 1]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Export Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ss), 'Servicing Selling Stores');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), 'Detractors');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([Array.from({ length: 2000 }, (_, i) => `junk${i}`)]), 'Lost Data');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const p = parseFile({ fileId: 'x', name: 'LTR_Tracker1116a.xlsx', buffer: buf, fyStart: DEFAULT_FY_START, rules: DEFAULT_REDACTION_RULES, salt: 's', remembered: {} });
    expect(p.candidate?.kind).toBe('tracker');
    expect(Object.keys(p.candidate!.map)).not.toEqual(expect.arrayContaining(['craftsmanship']));
    expect(['craftsmanship', 'professionalism', 'timeToAppt'].some((k) => k in p.candidate!.map)).toBe(false);
    const b = p.build!;
    expect(b.surveys).toHaveLength(1);
    expect(b.surveys[0].attrs).toBeUndefined();
    expect(b.report.rowsRead).toBe(1);
    expect(b.report.dropped).toEqual({});
    expect(b.stores).toEqual([{ storeNo: '2968', name: "LOWE'S OF CARROLLTON, GA", city: 'Carrollton', state: 'GA', district: '892', region: 'R5' }]);
    expect(b.followups).toHaveLength(0);
    expect(b.report.warnings.join(' ')).not.toMatch(/dropped/);
  });
});

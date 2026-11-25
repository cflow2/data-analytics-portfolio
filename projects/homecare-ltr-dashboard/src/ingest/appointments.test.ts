import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { HomeCareDB } from '@/db/db';
import { DEFAULT_FY_START } from '@/lib/fiscal';
import { demoFiles } from '@/demo/files';
import { generateDemoData } from '@/demo/generate';
import { geoMatch, ltrSurveys } from '@/analytics/ltr';
import { parseFile } from './parse';
import { commitParsed } from './commit';
import { DEFAULT_REDACTION_RULES } from './redact';
import type { ParseRequest } from './types';

const req = (name: string, buffer: ArrayBuffer, extra: Partial<ParseRequest> = {}): ParseRequest => ({
  fileId: name, name, buffer, fyStart: DEFAULT_FY_START, rules: DEFAULT_REDACTION_RULES, salt: 's', remembered: {}, ...extra,
});
const book = (aoa: unknown[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1'); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer; };

describe('appointment file → associate', () => {
  it('detects common header names and keeps the first associate for a repeated ID', () => {
    const p = parseFile(req('Appointments_Nov.xlsx', book([
      ['Appt ID', 'Job #', 'Technician Name', 'Store', 'Service Date'],
      ['123456789012345678', 'J1', 'Pat Example', '2702 - LOWE\'S OF SOMEWHERE', '11/10/2026'],
      [' 123456789012345678 ', 'J1', 'Sam Other', 2702, '11/10/2026'],
      ['223456789012345678', 'J2', 'Sam Other', 2702, '11/11/2026'],
      ['', 'J3', 'Nobody', 2702, '11/11/2026'],
    ])));
    expect(p.candidate).toMatchObject({ kind: 'appointments', missing: [] });
    const a = p.build!.appointments!;
    expect(a.map((x) => [x.id, x.associate, x.storeNo, x.fw])).toEqual([['123456789012345678', 'Pat Example', '2702', 41], ['223456789012345678', 'Sam Other', '2702', 41]]);
    expect(p.build!.report.warnings.join(' ')).toMatch(/more than one associate/);
    expect(p.build!.report.dropped['No Appointment ID']).toBe(1);
  });
  it('a file with other names opens the mapping dialog', () => {
    const p = parseFile(req('Appointments.xlsx', book([['Appointment ID', 'Crew Lead'], ['1', 'A']])));
    expect(p.candidate?.kind).toBe('appointments');
    expect(p.candidate?.missing).toEqual(['associate']);
    const again = parseFile(req('Appointments.xlsx', book([['Appointment ID', 'Crew Lead'], ['1', 'A']]), { remembered: { appointments: { associate: 'crew lead' } } }));
    expect(again.build!.appointments).toHaveLength(1);
  });
  it('links Tracker surveys to associates on import and reports the match rate', async () => {
    const db = new HomeCareDB('appt-test');
    const files = demoFiles(generateDemoData());
    for (const re of [/Tracker/, /Appointments/]) {
      const f = files.find((x) => re.test(x.name))!;
      const r = await commitParsed(parseFile(req(f.name, f.data)), { database: db });
      if (re.source === 'Appointments') expect(r.associateLinks!.linked).toBeGreaterThan(400);
    }
    expect(await db.appointments.count()).toBeGreaterThan(400);
  }, 60_000);
});

describe('division and associate filters', () => {
  const d = generateDemoData();
  const stores = new Map(d.stores.map((s) => [s.storeNo, s]));
  const assoc = new Map(d.appointments.map((a) => [a.id, a.associate]));
  const surveys = d.surveys.map((s) => ({ ...s, source: 'demo' as const, associate: assoc.get(s.appointmentId!) }));
  it('division uses the region config when the survey has no Lowe’s Division', () => {
    const west = ltrSurveys(surveys, { division: 'WEST', region: null, district: null, store: null }, stores);
    expect(new Set(west.map((s) => s.region))).toEqual(new Set(['R5', 'R8', 'R12', 'R14']));
    expect(geoMatch({ ...surveys[0], region: 'R5', division: 'NORTH' }, { division: 'NORTH', region: null, district: null, store: null }, stores)).toBe(true);
  });
  it('associate narrows to that associate’s surveys', () => {
    const name = surveys.find((s) => s.associate)!.associate!;
    const mine = ltrSurveys(surveys, { region: null, district: null, store: null, associate: name }, stores);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((s) => s.associate === name)).toBe(true);
    expect(new Set(mine.map((s) => s.storeNo)).size).toBe(1);
  });
});

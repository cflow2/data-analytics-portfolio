import { monthDay, rangeLabel } from '@/lib/dates';
import { weekInfo } from '@/lib/fiscal';
import { useSettings } from '@/state/settings';
import type { ValidationReport } from '@/ingest/types';
import { cx } from '@/components/ui/primitives';

function Row({ label, children, flag }: { label: string; children: React.ReactNode; flag?: boolean }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 border-t border-border py-1.5 text-sm first:border-t-0">
      <dt className={cx('text-muted', flag && 'font-medium text-surveys')}>{flag ? '⚠ ' : ''}{label}</dt>
      <dd className="tnum">{children}</dd>
    </div>
  );
}

const REDACTION_LABEL: Record<string, string> = { email: 'emails', order: 'order #s', phone: 'phones', address: 'addresses', 'name-cue': 'names' };

export function ValidationReportView({ report, selectedWeek }: { report: ValidationReport; selectedWeek?: number }) {
  const fyStart = useSettings((s) => s.fyStart);
  const dropped = Object.entries(report.dropped);
  const totalDropped = dropped.reduce((a, [, n]) => a + n, 0);
  const weeks = Object.entries(report.weeks).map(([w, n]) => [Number(w), n] as const).sort((a, b) => a[0] - b[0]);
  const redactions = Object.entries(report.redactions);
  const sel = report.targetWeek ?? selectedWeek;
  return (
    <dl className="mt-2">
      <Row label="Rows">{report.rowsRead.toLocaleString()} read · {report.rowsKept.toLocaleString()} kept · {totalDropped.toLocaleString()} dropped</Row>
      {dropped.length > 0 && (
        <Row label="Dropped because" flag={totalDropped > 0}>
          <ul>{dropped.map(([why, n]) => <li key={why}>{why}: {n.toLocaleString()}</li>)}</ul>
        </Row>
      )}
      {report.dateRange && (
        <Row label="Dates found" flag={!!sel && weeks.some(([w]) => w !== sel) && report.kind === 'loyalty-cases'}>
          {rangeLabel(report.dateRange[0], report.dateRange[1])}, {report.dateRange[0].slice(0, 4)}
          {sel ? <> · selected week {weekInfo(sel, fyStart).label.split(' · ').slice(0, 2).join(' · ')}</> : null}
        </Row>
      )}
      {weeks.length > 0 && (
        <Row label="Fiscal weeks covered">
          {weeks.length > 8 ? `FW${weeks[0][0]}–FW${weeks[weeks.length - 1][0]} (${weeks.length} weeks)` : weeks.map(([w, n]) => `FW${w}: ${n.toLocaleString()}`).join(' · ')}
        </Row>
      )}
      {report.alreadyLoaded !== undefined && report.alreadyLoaded > 0 && <Row label="Already loaded">{report.alreadyLoaded.toLocaleString()} rows were already in the database (updated, not duplicated)</Row>}
      {report.merged !== undefined && report.merged > 0 && <Row label="Merged into Tracker surveys">{report.merged.toLocaleString()}</Row>}
      {report.duplicates && (
        <Row label="Cases" flag={report.duplicates.duplicateRows > 0}>
          {report.duplicates.distinctCases.toLocaleString()} distinct Case # · {report.duplicates.repeatCaseRows} repeat-case rows · {report.duplicates.duplicateRows} exact duplicate rows removed
        </Row>
      )}
      {report.associateCalls !== undefined && <Row label="Associate/store calls">{report.associateCalls} (counted separately, never in VOC)</Row>}
      {report.driverMapping && report.driverMapping.length > 0 && (
        <Row label="Call Driver typos (grouping only)">
          <ul>{report.driverMapping.map((m) => <li key={m.original}>“{m.original}” → “{m.normalized}”</li>)}</ul>
        </Row>
      )}
      {report.scoreMismatches && (
        <Row label="Score vs LTR" flag={report.scoreMismatches.length > 0}>
          {report.scoreMismatches.length === 0 ? 'All Score (100/0) values agree with Likelihood to Recommend.' : (
            <>
              {report.scoreMismatches.length} row(s) disagree. LTR uses Likelihood to Recommend.
              <ul className="mt-1 text-xs text-muted">{report.scoreMismatches.slice(0, 10).map((m) => <li key={m.id}>{m.id}: LTR {m.ltr}, Score {m.score100}</li>)}</ul>
            </>
          )}
        </Row>
      )}
      {!!report.fwMismatches && <Row label="FW # column" flag>{report.fwMismatches} row(s) where the file’s FW # differs from the calendar. The calendar was used.</Row>}
      {!!report.noScore && <Row label="No valid score">{report.noScore} row(s) kept for their comment only (not in LTR)</Row>}
      {report.followupCheck?.map((c) => (
        <Row key={c.fw} label={`FW${c.fw} follow-up check`} flag={c.missing.length > 0}>
          Tracker non-promoters: {c.trackerNonPromoters} · in follow-up file: {c.inFile} · documented {c.documented} · email only {c.emailOnly}
          {c.missing.length > 0 && (
            <ul className="mt-1 text-xs">
              <li className="text-muted">Missing from the follow-up file:</li>
              {c.missing.map((m) => <li key={m.surveyId}>{m.surveyId} · store {m.storeNo} · {monthDay(m.date)} · score {m.score}</li>)}
            </ul>
          )}
        </Row>
      ))}
      {report.storesFromSheets !== undefined && <Row label="Store → district">{report.storesFromSheets ? `${report.storesFromSheets} stores read from the Tracker’s store sheets` : 'Not in the Tracker. Upload a mapping CSV.'}</Row>}
      {report.unmappedStores && (
        <Row label="Unmapped stores" flag={report.unmappedStores.length > 0}>
          {report.unmappedStores.length === 0 ? 'None' : `${report.unmappedStores.length}: ${report.unmappedStores.slice(0, 12).join(', ')}${report.unmappedStores.length > 12 ? '…' : ''}`}
        </Row>
      )}
      <Row label="Redaction">
        {redactions.length ? redactions.map(([k, n]) => `${n} ${REDACTION_LABEL[k] ?? k}`).join(' · ') : 'No PII found'}
        {report.redactionUncertain > 0 && <span className="text-surveys"> · {report.redactionUncertain} uncertain (sent to Review Queue)</span>}
      </Row>
      {report.warnings.map((w) => <Row key={w} label="Note" flag>{w}</Row>)}
    </dl>
  );
}

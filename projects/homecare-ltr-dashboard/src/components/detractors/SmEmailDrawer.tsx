import { useEffect, useMemo, useState } from 'react';
import { db } from '@/db/db';
import type { Dataset } from '@/data/dataset';
import type { SurveyRecord } from '@/domain/types';
import { copyHtml, copyText } from '@/data/export';
import { formatPhone, normalizeApptId } from '@/ingest/normalize';
import { saveEmailEdits } from '@/state/emailTemplate';
import { buildSmEmail, firstName, type EmailEdits, type EmailFacts, type EmailTemplate } from '@/writing/smEmail';
import { Drawer } from '@/components/ui/Drawer';
import { Button, cx } from '@/components/ui/primitives';

/** SM name: the follow-up row for this survey, else the most recent SM listed for the store. */
export function smNameFor(s: SurveyRecord, ds: Dataset): { name?: string; from: string } {
  const own = ds.followups.find((f) => f.surveyId === s.id && f.sm.trim());
  if (own) return { name: own.sm.trim(), from: 'the follow-up file' };
  const latest = ds.followups.filter((f) => f.storeNo === s.storeNo && f.sm.trim()).sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest ? { name: latest.sm.trim(), from: `the follow-up file (store’s latest SM, ${latest.date})` } : { from: '' };
}

/** What the files say for this survey, before any edits. */
export function emailFactsFor(s: SurveyRecord, ds: Dataset, quote: string, rootCause: string | null): { facts: EmailFacts; sources: Partial<Record<keyof EmailEdits, string>> } {
  const st = ds.stores.get(s.storeNo);
  const appt = s.appointmentId ? ds.appointments.get(normalizeApptId(s.appointmentId)) : undefined;
  const sm = smNameFor(s, ds);
  const sources: Partial<Record<keyof EmailEdits, string>> = {};
  const src = (k: keyof EmailEdits, v: unknown, from: string) => { if (v) sources[k] = from; };
  const fromSurvey = s.source === 'tracker' || s.source === 'demo' ? 'the survey' : 'the Medallia export';
  src('customerName', s.customerName, appt?.customerName === s.customerName ? 'the appointment file' : fromSurvey);
  src('customerPhone', s.customerPhone, appt?.customerPhone === s.customerPhone ? 'the appointment file' : fromSurvey);
  src('associate', s.associate, 'the appointment file');
  src('jobId', s.jobId, appt?.jobId === s.jobId ? 'the appointment file' : 'Medallia “Project number”');
  src('appointmentDate', appt?.date, 'the appointment file');
  src('smName', sm.name, sm.from);
  return {
    facts: {
      surveyId: s.id, score: s.ltr ?? 0, quote, surveyDate: s.date, appointmentDate: appt?.date, storeNo: s.storeNo,
      storeCity: st?.city, storeState: st?.state, rootCause, customerName: s.customerName, customerPhone: s.customerPhone,
      associate: s.associate, jobId: s.jobId, smName: sm.name,
    },
    sources,
  };
}

const FIELDS: { key: Exclude<keyof EmailEdits, 'request' | 'copiedAt'>; label: string; type?: string; placeholder?: string }[] = [
  { key: 'customerName', label: 'Customer name' },
  { key: 'customerPhone', label: 'Customer phone', type: 'tel', placeholder: '(555) 555-0100' },
  { key: 'associate', label: 'HomeCare+ associate' },
  { key: 'jobId', label: 'Job ID', placeholder: 'SA…' },
  { key: 'appointmentDate', label: 'Appointment date', type: 'date' },
  { key: 'smName', label: 'Store manager', placeholder: 'First Last' },
];

export function SmEmailDrawer({ survey, ds, rootCause, edits, template, onClose }: {
  survey: SurveyRecord; ds: Dataset; rootCause: string | null; edits: EmailEdits; template: EmailTemplate; onClose: () => void;
}) {
  const [quote, setQuote] = useState<{ text: string; original: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void db.originals.get([survey.id, 'comment']).then((o) => alive && setQuote(o ? { text: o.text, original: true } : { text: survey.comment, original: false }));
    return () => { alive = false; };
  }, [survey.id, survey.comment]);

  const base = useMemo(() => emailFactsFor(survey, ds, quote?.text ?? '', rootCause), [survey, ds, quote, rootCause]);
  // Local form state, saved on blur so typing stays smooth.
  const [form, setForm] = useState<EmailEdits>(edits);
  useEffect(() => { setForm(edits); }, [survey.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const facts: EmailFacts = { ...base.facts };
  for (const f of FIELDS) if (form[f.key]) (facts as unknown as Record<string, unknown>)[f.key] = form[f.key];
  const email = buildSmEmail(facts, template, form.request);
  const [flash, setFlash] = useState<string | null>(null);
  const done = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1800); };
  const markCopied = () => void saveEmailEdits(survey.id, { ...form, copiedAt: new Date().toISOString() });
  const save = (patch: EmailEdits) => void saveEmailEdits(survey.id, patch);

  return (
    <Drawer title="Email the store manager" subtitle={`Survey ${survey.id} · score ${survey.ltr} · store ${survey.storeNo}`} onClose={onClose} width={720}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon="copy" onClick={async () => { await copyHtml(email.html, email.text); markCopied(); done('Email copied. Paste it into a new Outlook message.'); }}>Copy for Outlook</Button>
        <Button onClick={async () => { await copyText(email.subject); done('Subject copied.'); }}>Copy subject</Button>
        <Button onClick={async () => { await copyText(email.text); markCopied(); done('Plain text copied.'); }}>Copy plain text</Button>
        <span role="status" className="text-xs text-grow">{flash}</span>
      </div>
      {edits.copiedAt && <p className="text-xs text-muted">Last copied {new Date(edits.copiedAt).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</p>}
      {email.missing.length > 0 && (
        <p className="rounded-lg border border-watch bg-watch px-3 py-2 text-sm text-watch-ink">
          Still missing: <strong>{email.missing.join(', ')}</strong>. These show as highlighted [placeholders] in the email. Type them below; they’re saved for this survey.
        </p>
      )}
      {quote && !quote.original && quote.text && <p className="text-xs text-surveys">No original comment is stored for this survey, so the quote below is the redacted text. Re-import the file to keep the original.</p>}

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 max-sm:grid-cols-1">
        {FIELDS.map((f) => {
          const fileVal = base.facts[f.key] as string | undefined;
          const v = form[f.key] ?? '';
          return (
            <label key={f.key} className="flex flex-col gap-0.5 text-sm">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{f.label}</span>
              <input
                type={f.type ?? 'text'} value={v || fileVal || ''} placeholder={f.placeholder ?? ''}
                onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                onBlur={(e) => { let val = e.target.value.trim(); if (f.key === 'customerPhone' && val) val = formatPhone(val); if (val === fileVal) val = ''; setForm((x) => ({ ...x, [f.key]: val })); save({ [f.key]: val }); }}
                className={cx('h-8 rounded-lg border bg-surface px-2', !v && !fileVal ? 'border-watch-ink/60' : 'border-border')}
                aria-label={f.label}
              />
              <span className="text-[11px] text-muted">
                {v && v !== fileVal ? 'Typed here' : fileVal ? `From ${base.sources[f.key] ?? 'the files'}` : 'Not in the loaded files'}
                {f.key === 'smName' && (facts.smName ? ` · greeting uses “${firstName(facts.smName)}”` : '')}
              </span>
            </label>
          );
        })}
      </div>

      <label className="flex flex-col gap-0.5 text-sm">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Request to the store (this email only)</span>
        <textarea
          rows={4} value={form.request ?? template.request} onChange={(e) => setForm((x) => ({ ...x, request: e.target.value }))}
          onBlur={(e) => { const val = e.target.value.trim() === template.request.trim() ? '' : e.target.value; save({ request: val }); }}
          className="rounded-lg border border-border bg-surface p-2 text-sm" aria-label="Request to the store"
        />
        <span className="text-[11px] text-muted">
          {'{associateFirst}'} and {'{themeAsk}'} fill in automatically; the ask follows the root cause. Change the default wording and your signature in Settings › Store manager email.
          {form.request && <button type="button" className="ml-2 underline" onClick={() => { setForm((x) => ({ ...x, request: '' })); save({ request: '' }); }}>Use the default</button>}
        </span>
      </label>

      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Subject</div>
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">{email.subject}</p>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Preview</div>
        {/* Every value in the HTML is escaped by buildSmEmail. */}
        <div data-testid="sm-email-preview" className="rounded-lg border border-border bg-white p-4 text-black" dangerouslySetInnerHTML={{ __html: email.html }} />
      </div>
      {!template.signature.trim() && <p className="text-xs text-muted">No signature yet. Add your name, title and email in Settings › Store manager email, or let your Outlook signature add it.</p>}
    </Drawer>
  );
}

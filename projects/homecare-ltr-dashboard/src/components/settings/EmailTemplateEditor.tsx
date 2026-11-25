import { useEffect, useState } from 'react';
import { resetEmailTemplate, saveEmailTemplate, useEmailTemplate } from '@/state/emailTemplate';
import { DEFAULT_ASK, DEFAULT_TEMPLATE, THEME_ASK, type EmailTemplate } from '@/writing/smEmail';
import { themeName } from '@/domain/taxonomy';
import { Button } from '@/components/ui/primitives';

const FIELDS: { key: keyof EmailTemplate; label: string; rows: number; hint: string }[] = [
  { key: 'subject', label: 'Subject', rows: 1, hint: 'Tokens: {score} {store} {customer} {jobId}' },
  { key: 'request', label: 'Request to the store', rows: 4, hint: 'Tokens: {associateFirst} {associate} {customer} {store} {score} {themeAsk}' },
  { key: 'signature', label: 'Signature (one line each: name, title, email)', rows: 3, hint: 'Leave blank to let Outlook add your signature.' },
];

/** Default wording for the detractor email to store managers (Detractors › Email SM). Saved locally. */
export function EmailTemplateEditor() {
  const tpl = useEmailTemplate();
  const [draft, setDraft] = useState<EmailTemplate>(tpl);
  useEffect(() => setDraft(tpl), [tpl]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Used by <strong>Email SM</strong> on the Detractors screen. Customer name, phone, associate, Job ID and the exact quote fill in from the loaded files; the email is only copied to your clipboard, never sent by the app.</p>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-0.5 text-sm">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{f.label}</span>
          {f.rows === 1
            ? <input value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} onBlur={() => void saveEmailTemplate({ [f.key]: draft[f.key] })} className="h-8 rounded-lg border border-border bg-surface px-2" aria-label={f.label} />
            : <textarea rows={f.rows} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} onBlur={() => void saveEmailTemplate({ [f.key]: draft[f.key] })} className="rounded-lg border border-border bg-surface p-2" aria-label={f.label} />}
          <span className="text-xs text-muted">{f.hint}</span>
        </label>
      ))}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">What {'{themeAsk}'} says for each root cause</summary>
        <ul className="mt-1 space-y-0.5">
          {Object.entries(THEME_ASK).map(([k, v]) => <li key={k}><strong>{themeName(k)}:</strong> “…review this feedback with Pat and {v}.”</li>)}
          <li><strong>Other / untagged:</strong> “…{DEFAULT_ASK}.”</li>
        </ul>
      </details>
      <Button variant="ghost" onClick={() => void resetEmailTemplate()} disabled={JSON.stringify(tpl) === JSON.stringify(DEFAULT_TEMPLATE)}>Reset to default</Button>
    </div>
  );
}

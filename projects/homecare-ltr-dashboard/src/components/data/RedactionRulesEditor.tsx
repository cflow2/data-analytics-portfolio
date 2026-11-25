import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_REDACTION_RULES, redact, validateRule, type RedactionRule } from '@/ingest/redact';
import { getRedactionRules, saveRedactionRules } from '@/state/privacy';
import { Button } from '@/components/ui/primitives';

const SAMPLE = 'CX Jane Sample called from (704) 555-1234 about order 200012345678. Spoke with: Pat Example at 123 Main St, Apt 4. Email jane@example.com.';

export function RedactionRulesEditor() {
  const [rules, setRules] = useState<RedactionRule[] | null>(null);
  const [test, setTest] = useState(SAMPLE);
  const [saved, setSaved] = useState(false);
  useEffect(() => { void getRedactionRules().then(setRules); }, []);
  const result = useMemo(() => (rules ? redact(test, rules) : null), [rules, test]);
  if (!rules) return null;
  const errors = rules.map(validateRule);
  const update = (i: number, p: Partial<RedactionRule>) => { setSaved(false); setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r))); };

  return (
    <div>
      <p className="mb-2 text-xs text-muted">Rules run in order on every import. New rules apply to files imported from now on. Tokens can reference capture groups, e.g. <code>$1[name]</code>.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted"><tr><th className="pb-1 font-medium">On</th><th className="pb-1 font-medium">Rule</th><th className="pb-1 font-medium">Pattern (regex)</th><th className="pb-1 font-medium">Replace with</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="py-1.5 pr-2"><input type="checkbox" checked={r.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} aria-label={`Enable ${r.label}`} /></td>
              <td className="py-1.5 pr-2"><input value={r.label} onChange={(e) => update(i, { label: e.target.value })} className="h-7 w-40 rounded border border-border bg-surface px-1.5 text-xs" aria-label="Rule name" /></td>
              <td className="py-1.5 pr-2">
                <input value={r.pattern} onChange={(e) => update(i, { pattern: e.target.value })} className="h-7 w-full rounded border border-border bg-surface px-1.5 font-mono text-xs" aria-label={`Pattern for ${r.label}`} aria-invalid={!!errors[i]} />
                {errors[i] && <div className="mt-0.5 text-xs text-surveys">{errors[i]}</div>}
              </td>
              <td className="py-1.5 pr-2"><input value={r.token} onChange={(e) => update(i, { token: e.target.value })} className="h-7 w-28 rounded border border-border bg-surface px-1.5 font-mono text-xs" aria-label={`Replacement for ${r.label}`} /></td>
              <td className="py-1.5"><Button variant="ghost" onClick={() => { setSaved(false); setRules(rules.filter((_, j) => j !== i)); }} aria-label={`Delete rule ${r.label}`}>✕</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <Button onClick={() => setRules([...rules, { id: `custom-${Date.now()}`, label: 'Custom rule', pattern: '', flags: 'g', token: '[redacted]', enabled: true }])}>Add rule</Button>
        <Button variant="primary" disabled={errors.some(Boolean)} onClick={async () => { await saveRedactionRules(rules); setSaved(true); }}>Save rules</Button>
        <Button variant="ghost" onClick={() => { setSaved(false); setRules(DEFAULT_REDACTION_RULES); }}>Reset to defaults</Button>
        {saved && <span role="status" className="self-center text-xs text-grow">Saved.</span>}
      </div>
      <label className="mt-4 block text-sm">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Test box</span>
        <textarea value={test} onChange={(e) => setTest(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-sm" />
      </label>
      {result && (
        <div className="mt-2 rounded-lg bg-surface-2 p-2 text-sm">
          <div className="whitespace-pre-wrap">{result.text}</div>
          <div className="mt-1 text-xs text-muted">
            {Object.entries(result.hits).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'No matches'}
            {result.uncertain && <span className="text-surveys"> · looks like PII may remain (would go to the Review Queue)</span>}
          </div>
        </div>
      )}
    </div>
  );
}

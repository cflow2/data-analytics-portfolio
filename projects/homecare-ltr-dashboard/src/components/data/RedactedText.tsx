import { useEffect, useState } from 'react';
import { db } from '@/db/db';
import { useUi } from '@/state/ui';
import type { OriginalText } from '@/domain/types';

const RELOCK_MS = 60_000;

/** Shows redacted text. "Show original" reveals the stored original for 60 s; never available in Presentation mode. */
export function RedactedText({ recordId, field, text, className }: { recordId: string; field: OriginalText['field']; text: string; className?: string }) {
  const presentation = useUi((s) => s.presentation);
  const [original, setOriginal] = useState<string | null>(null);
  const [hasOriginal, setHasOriginal] = useState(false);

  useEffect(() => {
    let alive = true;
    void db.originals.get([recordId, field]).then((o) => alive && setHasOriginal(!!o));
    return () => { alive = false; };
  }, [recordId, field]);

  useEffect(() => {
    if (original === null) return;
    const t = setTimeout(() => setOriginal(null), RELOCK_MS);
    return () => clearTimeout(t);
  }, [original]);

  useEffect(() => { if (presentation) setOriginal(null); }, [presentation]);

  const show = original !== null && !presentation;
  return (
    <span className={className}>
      <span className="whitespace-pre-wrap">{show ? original : text || <em className="text-muted">(blank)</em>}</span>
      {hasOriginal && !presentation && (
        <button
          type="button"
          className="ml-2 rounded border border-border px-1.5 text-[11px] text-muted hover:text-ink"
          aria-pressed={show}
          onClick={async () => {
            if (show) { setOriginal(null); return; }
            const o = await db.originals.get([recordId, field]);
            setOriginal(o?.text ?? null);
          }}
        >
          {show ? 'Hide original' : 'Show original'}
        </button>
      )}
      {show && <span className="ml-2 text-[11px] text-surveys">Original text, locks again in 60 s</span>}
    </span>
  );
}

import { useState } from 'react';
import type { Channel, Sentiment, ThemeTag } from '@/domain/types';
import type { ThemeDef } from '@/domain/taxonomy';
import { saveManualTag } from '@/tagging/manual';
import { useUi } from '@/state/ui';
import { cx } from '@/components/ui/primitives';

const SOURCE_CLS: Record<string, string> = { Manual: 'bg-grow-soft text-grow', AI: 'bg-calls-soft text-calls', Rule: 'bg-stable text-muted', Demo: 'bg-stable text-muted' };

export function SourceBadge({ tag }: { tag?: ThemeTag }) {
  if (!tag) return <span className="rounded px-1 text-[10px] text-muted">Untagged</span>;
  return (
    <span className={cx('rounded px-1 text-[10px] font-medium', SOURCE_CLS[tag.source])} title={`${tag.source}${tag.source !== 'Manual' ? ` · confidence ${Math.round(tag.confidence * 100)}%` : ''}${tag.rationale ? ` · ${tag.rationale}` : ''}`}>
      {tag.source}{tag.source !== 'Manual' && tag.confidence < 0.7 ? ' · low' : ''}
    </span>
  );
}

/** Inline override: primary, secondary (up to 3) and sentiment. Saved as "Manual". */
export function TagEditor({ recordId, channel, fw, tag, taxonomy, compact }: { recordId: string; channel: Channel; fw: number; tag?: ThemeTag; taxonomy: ThemeDef[]; compact?: boolean }) {
  const presentation = useUi((s) => s.presentation);
  const [open, setOpen] = useState(false);
  const name = (id: string) => taxonomy.find((t) => t.id === id)?.name ?? id;
  if (presentation) return <span className="text-xs">{tag ? name(tag.primary) : '—'}</span>;
  const save = (patch: Parameters<typeof saveManualTag>[3]) => saveManualTag(recordId, channel, fw, patch, tag);
  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <select aria-label="Primary theme" value={tag?.primary ?? ''} onChange={(e) => e.target.value && void save({ primary: e.target.value })}
          className={cx('h-7 rounded border border-border bg-surface px-1 text-xs', compact ? 'w-[140px]' : 'w-[170px]')}>
          <option value="">Untagged</option>
          {taxonomy.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select aria-label="Sentiment" value={tag?.sentiment ?? 'Neutral'} onChange={(e) => void save({ sentiment: e.target.value as Sentiment, primary: tag?.primary ?? 'other' })}
          className="h-7 w-[84px] rounded border border-border bg-surface px-1 text-xs">
          {(['Positive', 'Neutral', 'Negative'] as Sentiment[]).map((x) => <option key={x}>{x}</option>)}
        </select>
        <SourceBadge tag={tag} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {tag?.subTag && <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">{tag.subTag}</span>}
        {tag?.secondary.map((s) => (
          <button key={s} type="button" onClick={() => void save({ secondary: tag.secondary.filter((x) => x !== s) })} title="Remove secondary theme"
            className="rounded bg-surface-2 px-1.5 text-[10px] hover:line-through">+ {name(s)}</button>
        ))}
        {tag && tag.secondary.length < 3 && (
          open ? (
            <select autoFocus aria-label="Add secondary theme" className="h-6 rounded border border-border bg-surface px-1 text-[11px]" onBlur={() => setOpen(false)}
              onChange={(e) => { if (e.target.value) void save({ secondary: [...tag.secondary, e.target.value] }); setOpen(false); }} defaultValue="">
              <option value="">Add secondary…</option>
              {taxonomy.filter((t) => t.id !== tag.primary && !tag.secondary.includes(t.id) && t.id !== 'other').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : <button type="button" className="text-[10px] text-calls hover:underline" onClick={() => setOpen(true)}>+ secondary</button>
        )}
      </div>
    </div>
  );
}

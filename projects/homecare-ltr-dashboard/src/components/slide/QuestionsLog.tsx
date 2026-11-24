import { useState } from 'react';
import { db } from '@/db/db';
import type { LeadershipQuestion } from '@/domain/types';
import { Button, Card, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';

/** Log what leadership asks at the WBR. Open questions lead next week's talk track. */
export function QuestionsLog({ fw, open, asked, readOnly }: { fw: number; open: LeadershipQuestion[]; asked: LeadershipQuestion[]; readOnly: boolean }) {
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  return (
    <Card title="Leadership questions log">
      <p className="mb-2 text-xs text-muted">Record what leadership asks at the FW{fw} WBR. Open questions start next week’s talk track (“Last week I was asked about…”) with an answer from that week’s data.</p>
      <form className="mb-2 flex flex-wrap gap-1.5" onSubmit={async (e) => {
        e.preventDefault(); if (!q.trim() || readOnly) return;
        await db.questions.put({ id: `q-${Date.now().toString(36)}`, fw, asker: who.trim() || undefined, question: q.trim(), answered: false, createdAt: new Date().toISOString() });
        setQ(''); setWho('');
      }}>
        <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Who (optional)" aria-label="Who asked" className="h-8 w-32 rounded border border-border bg-surface px-2 text-sm" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Asked for detractor detail by region" aria-label="Question" className="h-8 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-sm" />
        <Button type="submit" disabled={!q.trim() || readOnly}>Log</Button>
      </form>
      <h3 className="mt-2 text-xs font-medium text-muted">From earlier WBRs (answered in this week’s talk track)</h3>
      <QuestionList items={open} />
      <h3 className="mt-2 text-xs font-medium text-muted">Asked at the FW{fw} WBR (for next week)</h3>
      <QuestionList items={asked} />
    </Card>
  );
}

function QuestionList({ items }: { items: LeadershipQuestion[] }) {
  if (!items.length) return <p className="text-xs text-muted">None.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((q) => (
        <li key={q.id} className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={q.answered} aria-label={`Mark “${q.question}” answered`} onChange={(e) => void db.questions.update(q.id, { answered: e.target.checked })} />
          <span className={cx('flex-1', q.answered && 'text-muted line-through')}>{q.question} <span className="text-xs text-muted">· FW{q.fw}{q.asker ? ` · ${q.asker}` : ''}</span></span>
          <button type="button" aria-label="Delete question" className="text-muted hover:text-surveys" onClick={() => void db.questions.delete(q.id)}><Icon name="trash" size={13} /></button>
        </li>
      ))}
    </ul>
  );
}

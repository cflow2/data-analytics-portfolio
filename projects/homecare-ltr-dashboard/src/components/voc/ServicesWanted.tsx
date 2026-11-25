import { useMemo, useState } from 'react';
import type { StoreRecord, SurveyRecord, ThemeTag } from '@/domain/types';
import { serviceRequests, type ServiceRow } from '@/analytics/serviceRequests';
import { storeLabel } from '@/domain/geo';
import { monthDay } from '@/lib/dates';
import { Card, Segmented } from '@/components/ui/primitives';
import { DataTable, type Col } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { RedactedText } from '@/components/data/RedactedText';

type Window = 'fytd' | '13' | 'week';

/** Services members ask HomeCare+ to add, or were told aren't covered, ranked by how many members mention them. */
export function ServicesWanted({ surveys, tags, stores, fw }: { surveys: SurveyRecord[]; tags: Map<string, ThemeTag>; stores: Map<string, StoreRecord>; fw: number }) {
  const [win, setWin] = useState<Window>('fytd');
  const [open, setOpen] = useState<ServiceRow | null>(null);
  const from = win === 'week' ? fw : win === '13' ? fw - 12 : 1;
  const rows = useMemo(() => serviceRequests(surveys.filter((s) => s.fw >= from && s.fw <= fw), tags, fw), [surveys, tags, from, fw]);
  const label = win === 'week' ? `FW${fw}` : `FW${Math.max(1, from)}–FW${fw}`;
  const cols: Col<ServiceRow>[] = [
    { id: 'label', header: 'Service', value: (r) => r.label, width: 230, cell: (r) => <span className="font-medium">{r.label}</span> },
    { id: 'surveys', header: 'Members', value: (r) => r.surveys, align: 'right', width: 80 },
    { id: 'asked', header: 'Asked to add', value: (r) => r.asked, align: 'right', width: 100 },
    { id: 'notCovered', header: 'Told not covered', value: (r) => r.notCovered, align: 'right', width: 120 },
    { id: 'thisWeek', header: `FW${fw}`, value: (r) => r.thisWeek, align: 'right', width: 64 },
    { id: 'promoterPct', header: '% scored 9–10', value: (r) => (r.promoterPct === null ? null : Number(r.promoterPct.toFixed(0))), align: 'right', width: 104,
      cell: (r) => <span className="tnum">{r.promoterPct === null ? '—' : `${r.promoterPct.toFixed(0)}%`}</span> },
    { id: 'lastFw', header: 'Last seen', value: (r) => r.lastFw, align: 'right', width: 80, cell: (r) => <span className="tnum">FW{r.lastFw}</span> },
  ];
  return (
    <Card title={`Services members want added · ${label}`}
      actions={<Segmented label="Window" value={win} onChange={setWin} options={[{ value: 'fytd', label: 'FYTD' }, { value: '13', label: '13 weeks' }, { value: 'week', label: `FW${fw}` }]} />}>
      <p className="mb-2 text-xs text-muted">From survey comments that ask for a service or say it wasn’t covered (plus comments tagged Service-add or Exclusions). Each member counts once per service. Click a row for the comments.</p>
      <DataTable rows={rows} columns={cols} getRowId={(r) => r.id} exportName={`Services_wanted_${label.replace(/–/g, '-')}`} maxHeight={420}
        initialSort={[{ id: 'surveys', desc: true }]} onRowClick={setOpen} empty={`No service requests in ${label}.`} />
      {open && (
        <Drawer title={open.label} subtitle={`${open.surveys} member${open.surveys === 1 ? '' : 's'} in ${label}: ${open.asked} asked to add · ${open.notCovered} told not covered`} onClose={() => setOpen(null)}>
          <ul className="space-y-2">
            {open.mentions.slice(0, 60).map(({ survey: s, kind }) => (
              <li key={s.id} className="rounded-lg border border-border bg-surface p-2 text-sm">
                <div className="text-xs text-muted tnum">{kind === 'asked' ? 'Asked to add' : 'Told not covered'} · score {s.ltr ?? '—'} · FW{s.fw} · {monthDay(s.date)} · {storeLabel(s.storeNo, stores)}{s.associate ? ` · ${s.associate}` : ''}</div>
                <RedactedText recordId={s.id} field="comment" text={s.comment} />
              </li>
            ))}
          </ul>
        </Drawer>
      )}
    </Card>
  );
}

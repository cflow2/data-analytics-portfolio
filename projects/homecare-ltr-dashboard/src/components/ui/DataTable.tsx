import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { downloadCsv, downloadXlsx, type Cell } from '@/data/export';
import { useUi } from '@/state/ui';
import { Button, cx } from './primitives';

export interface Col<T> {
  id: string;
  header: string;
  /** Plain value used for sorting and CSV/XLSX export. */
  value: (row: T) => Cell;
  cell?: (row: T) => ReactNode;
  width?: number | string;
  align?: 'left' | 'right';
  sortable?: boolean;
  /** Extra export-only columns derived from this one (e.g. n next to a %). */
  exportExtra?: { header: string; value: (row: T) => Cell }[];
}

/** Sortable, virtualized table with CSV/XLSX export of exactly what's shown (filters applied). */
export function DataTable<T>({ rows, columns, getRowId, initialSort, maxHeight = 520, exportName, onRowClick, rowClassName, empty = 'No rows.', toolbar }: {
  rows: T[];
  columns: Col<T>[];
  getRowId: (row: T) => string;
  initialSort?: SortingState;
  maxHeight?: number;
  exportName: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  empty?: string;
  toolbar?: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? []);
  const presentation = useUi((s) => s.presentation);
  const defs = useMemo<ColumnDef<T>[]>(() => columns.map((c) => ({
    id: c.id,
    header: c.header,
    accessorFn: (r: T) => c.value(r),
    cell: (info) => (c.cell ? c.cell(info.row.original) : (info.getValue() as ReactNode) ?? '—'),
    enableSorting: c.sortable !== false,
    sortUndefined: 'last',
  })), [columns]);
  const table = useReactTable({ data: rows, columns: defs, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getRowId: (r) => getRowId(r) });
  const sorted = table.getRowModel().rows;
  const scroller = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: sorted.length, getScrollElement: () => scroller.current, estimateSize: () => 44, overscan: 12 });
  const items = virt.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virt.getTotalSize() - items[items.length - 1].end : 0;

  const exportData = () => {
    const cols = columns.flatMap((c) => [{ header: c.header, value: c.value }, ...(c.exportExtra ?? [])]);
    return { columns: cols.map((c) => c.header), rows: sorted.map((r) => cols.map((c) => c.value(r.original))) };
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {toolbar}
        <span className="ml-auto text-xs text-muted tnum">{rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}</span>
        {!presentation && (
          <>
            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => downloadCsv(exportName, exportData())}>CSV</Button>
            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => downloadXlsx(exportName, exportData())}>XLSX</Button>
          </>
        )}
      </div>
      <div ref={scroller} className="overflow-auto rounded-lg border border-border" style={{ maxHeight }}>
        <table className="w-full border-collapse text-sm tnum">
          <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const col = columns.find((c) => c.id === h.column.id)!;
                  const dir = h.column.getIsSorted();
                  return (
                    <th key={h.id} style={{ width: col.width }} className={cx('px-3 py-2 font-medium', col.align === 'right' && 'text-right')}
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
                      {h.column.getCanSort() ? (
                        <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <span aria-hidden className="text-[10px]">{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}</span>
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted">{empty}</td></tr>}
            {padTop > 0 && <tr aria-hidden><td colSpan={columns.length} style={{ height: padTop }} /></tr>}
            {items.map((vi) => {
              const row = sorted[vi.index];
              return (
                <tr key={row.id} data-index={vi.index} ref={virt.measureElement}
                  className={cx('border-t border-border align-top', onRowClick && 'cursor-pointer hover:bg-surface-2', rowClassName?.(row.original))}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row.original); } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}>
                  {row.getVisibleCells().map((cell) => {
                    const col = columns.find((c) => c.id === cell.column.id)!;
                    return <td key={cell.id} className={cx('px-3 py-2', col.align === 'right' && 'text-right')}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>;
                  })}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden><td colSpan={columns.length} style={{ height: padBottom }} /></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

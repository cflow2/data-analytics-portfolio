import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { SCREENS } from '@/screens';
import { db } from '@/db/db';
import { useLive } from '@/hooks/useLive';
import { useUi } from '@/state/ui';
import { useSettings } from '@/state/settings';
import { useFilters } from '@/state/filters';
import { weekInfo } from '@/lib/fiscal';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';

interface Item { id: string; label: string; hint: string; icon: IconName; run: () => void }

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const navigate = useNavigate();
  const { search } = useLocation();
  const [, setF] = useFilters();
  const fyStart = useSettings((s) => s.fyStart);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { data: stores } = useLive(() => db.stores.toArray(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useUi.getState().paletteOpen); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const close = () => setOpen(false);
    const screens: Item[] = SCREENS.map((s) => ({ id: `s${s.path}`, label: s.title, hint: 'Screen', icon: s.icon, run: () => { navigate({ pathname: s.path, search }); close(); } }));
    const weeks: Item[] = Array.from({ length: 52 }, (_, i) => 52 - i).map((w) => ({
      id: `w${w}`, label: weekInfo(w, fyStart).label, hint: 'Week', icon: 'trend', run: () => { setF({ fw: w }); close(); },
    }));
    const st: Item[] = (stores ?? []).map((s) => ({
      id: `st${s.storeNo}`, label: `${s.storeNo} – ${s.city}, ${s.state}`, hint: `Store · ${s.region}`, icon: 'map',
      run: () => { setF({ region: s.region, district: s.district ?? 'Unmapped', store: s.storeNo }); navigate({ pathname: '/regions', search: `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(search)), region: s.region, store: s.storeNo })}` }); close(); },
    }));
    const all = [...screens, ...weeks, ...st];
    const needle = q.trim().toLowerCase();
    if (!needle) return [...screens, ...weeks.slice(0, 5)];
    return all.filter((i) => i.label.toLowerCase().includes(needle) || i.hint.toLowerCase().includes(needle)).slice(0, 30);
  }, [q, stores, fyStart, navigate, search, setF, setOpen]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog" aria-modal="true" aria-label="Command palette"
        className="w-[560px] overflow-hidden rounded-[12px] border border-border bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Icon name="search" size={16} className="text-muted" />
          <input
            ref={input} value={q} placeholder="Jump to a screen, week or store…"
            aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-list"
            aria-activedescendant={items[idx] ? `pal-${items[idx].id}` : undefined}
            className="h-11 flex-1 bg-transparent text-sm outline-none"
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') items[idx]?.run();
            }}
          />
          <kbd className="rounded border border-border px-1 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No matches.</li>}
          {items.map((it, i) => (
            <li
              key={it.id} id={`pal-${it.id}`} role="option" aria-selected={i === idx}
              onMouseEnter={() => setIdx(i)} onClick={it.run}
              className={cx('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', i === idx && 'bg-calls-soft text-calls')}
            >
              <Icon name={it.icon} size={16} />
              <span className="flex-1 truncate">{it.label}</span>
              <span className="text-xs text-muted">{it.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

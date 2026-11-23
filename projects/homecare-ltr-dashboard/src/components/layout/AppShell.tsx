import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { LeftNav } from './LeftNav';
import { FilterBar } from './FilterBar';
import { CommandPalette } from './CommandPalette';
import { useUi } from '@/state/ui';
import { SCREENS } from '@/screens';
import { Button, cx } from '@/components/ui/primitives';
import { useSelectedWeek } from '@/hooks/useWeek';
import { DatasetProvider } from '@/data/dataset';

export function AppShell() {
  const presentation = useUi((s) => s.presentation);
  const setPresentation = useUi((s) => s.setPresentation);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const week = useSelectedWeek();

  // Presentation mode: arrow keys move between screens, Esc exits.
  useEffect(() => {
    if (!presentation) return;
    const order = SCREENS.filter((s) => s.group !== 'Manage').map((s) => s.path);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const i = Math.max(0, order.indexOf(pathname));
      if (e.key === 'ArrowRight') navigate({ pathname: order[(i + 1) % order.length], search });
      else if (e.key === 'ArrowLeft') navigate({ pathname: order[(i - 1 + order.length) % order.length], search });
      else if (e.key === 'Escape') setPresentation(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentation, pathname, search, navigate, setPresentation]);

  return (
    <DatasetProvider>
    <div className={cx('flex h-full', presentation && 'presentation')} data-presentation={presentation || undefined}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-1">Skip to content</a>
      {!presentation && <LeftNav />}
      <div className="flex min-w-0 flex-1 flex-col">
        {presentation ? (
          <div className="flex items-center justify-between border-b border-border bg-surface px-8 py-3">
            <span className="font-display text-lg font-semibold">HomeCare+ · {week.label}</span>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>← → to change screens · Esc to exit</span>
              <Button onClick={() => setPresentation(false)}>Exit presentation</Button>
            </div>
          </div>
        ) : <FilterBar />}
        <main id="main" className={cx('flex-1 overflow-y-auto', presentation ? 'px-10 py-8' : 'px-6 py-6')} tabIndex={-1}>
          <div className="mx-auto max-w-[1360px]">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
    </DatasetProvider>
  );
}

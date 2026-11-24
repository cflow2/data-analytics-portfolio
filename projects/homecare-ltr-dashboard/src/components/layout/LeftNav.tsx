import { NavLink, useLocation } from 'react-router';
import { SCREENS } from '@/screens';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { useSettings, applyTheme } from '@/state/settings';
import { useUi } from '@/state/ui';

const GROUPS = ['Report', 'Listen', 'Deliver', 'Manage'] as const;

/** Desktop: fixed sidebar (collapsible). Phone (`mobile`): full-width list inside the slide-out drawer. */
export function LeftNav({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void } = {}) {
  const collapsedSetting = useSettings((s) => s.navCollapsed);
  const collapsed = mobile ? false : collapsedSetting;
  const update = useSettings((s) => s.update);
  const { search } = useLocation();
  const theme = useSettings((s) => s.theme);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setPresentation = useUi((s) => s.setPresentation);
  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    update({ theme: next });
    applyTheme(next);
  };
  const footBtn = cx('motion flex h-8 items-center gap-2.5 rounded-lg px-2 text-sm text-muted hover:bg-surface-2 hover:text-ink', collapsed ? 'mx-2 justify-center' : 'mx-2');
  return (
    <nav
      aria-label="Main"
      className={cx('motion flex h-full shrink-0 flex-col border-r border-border bg-surface', mobile ? 'w-72 max-w-[85vw]' : collapsed ? 'w-14' : 'w-56')}
    >
      <div className={cx('flex h-14 items-center gap-2 border-b border-border', collapsed ? 'justify-center' : 'px-4')}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-calls font-display text-sm font-bold text-white dark:text-[#0d1524]" aria-hidden>H+</div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-display text-sm font-semibold">HomeCare+</div>
            <div className="text-[11px] text-muted">LTR &amp; Customer Intelligence</div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {GROUPS.map((g) => (
          <div key={g} className="mb-2">
            {!collapsed && <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</div>}
            <ul>
              {SCREENS.filter((s) => s.group === g).map((s) => (
                <li key={s.path}>
                  <NavLink
                    to={{ pathname: s.path, search }}
                    end={s.path === '/'}
                    title={collapsed ? s.title : undefined}
                    onClick={onNavigate}
                    className={({ isActive }) => cx(
                      cx('motion mx-2 flex items-center gap-2.5 rounded-lg px-2 text-sm', mobile ? 'h-11' : 'h-8'),
                      isActive ? 'bg-calls-soft font-medium text-calls' : 'text-muted hover:bg-surface-2 hover:text-ink',
                      collapsed && 'justify-center',
                    )}
                  >
                    <Icon name={s.icon} size={17} />
                    {!collapsed && <span className="truncate">{s.title}</span>}
                    {collapsed && <span className="sr-only">{s.title}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-2">
        <button type="button" className={cx(footBtn, 'w-[calc(100%-16px)]')} onClick={() => { onNavigate?.(); setPaletteOpen(true); }} aria-label={collapsed ? 'Search (Ctrl+K)' : undefined} title="Search screens, weeks and stores (Ctrl+K)">
          <Icon name="search" size={17} />
          {!collapsed && <><span className="flex-1 text-left">Search</span>{!mobile && <kbd className="rounded border border-border px-1 text-[11px]">Ctrl K</kbd>}</>}
        </button>
        <button type="button" className={cx(footBtn, 'w-[calc(100%-16px)]')} onClick={cycleTheme} aria-label={collapsed ? `Theme: ${theme}` : undefined} title="Change theme (light / dark / system)">
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={17} />
          {!collapsed && <span className="capitalize">Theme: {theme}</span>}
        </button>
        <button type="button" className={cx(footBtn, 'w-[calc(100%-16px)]')} onClick={() => { onNavigate?.(); setPresentation(true); }} aria-label={collapsed ? 'Present' : undefined} title="Presentation mode (← → to change screens, Esc to exit)">
          <Icon name="present" size={17} />
          {!collapsed && <span>Present</span>}
        </button>
      </div>
      {!mobile && <button
        type="button"
        onClick={() => update({ navCollapsed: !collapsed })}
        className="motion flex h-10 items-center justify-center gap-2 border-t border-border text-xs text-muted hover:text-ink"
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
        {!collapsed && 'Collapse'}
      </button>}
    </nav>
  );
}

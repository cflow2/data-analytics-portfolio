import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './primitives';
import { Icon } from './Icon';

export function Drawer({ title, subtitle, onClose, children, width = 640 }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect (re-running would steal focus from a field being typed in).
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onMouseDown={onClose}>
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'}
        className="flex h-full flex-col border-l border-border bg-bg shadow-xl outline-none" style={{ width, maxWidth: '95vw' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></Button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

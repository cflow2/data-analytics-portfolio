import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import type { ScreenDef } from '@/screens';
import { EmptyState, ErrorState, Skeleton } from './primitives';

/** Loading skeleton → error → empty state that names the files to upload → content. */
export function PageGate({ screen, loading, error, empty, emptyTitle, children }: {
  screen: ScreenDef; loading: boolean; error: Error | null; empty: boolean; emptyTitle?: string; children: ReactNode;
}) {
  const { search } = useLocation();
  if (error) return <ErrorState error={error} />;
  if (loading) return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );
  if (empty) return (
    <EmptyState
      title={emptyTitle ?? 'No data for this view yet'}
      body="Upload these files on the Data Manager (or load the demo data):"
      files={screen.needs}
      action={<Link to={{ pathname: '/data', search }} className="text-sm font-medium text-calls underline">Go to Data Manager</Link>}
    />
  );
  return <>{children}</>;
}

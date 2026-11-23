import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';

export interface LiveResult<T> { data: T | undefined; loading: boolean; error: Error | null }

/** Minimal live Dexie query hook (re-runs when the underlying tables change). */
export function useLive<T>(query: () => Promise<T> | T, deps: unknown[]): LiveResult<T> {
  const [state, setState] = useState<LiveResult<T>>({ data: undefined, loading: true, error: null });
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    const sub = liveQuery(query).subscribe({
      next: (data) => setState({ data, loading: false, error: null }),
      error: (error) => setState({ data: undefined, loading: false, error: error instanceof Error ? error : new Error(String(error)) }),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

import { useDataset } from '@/data/dataset';

/** Locked weeks are read-only everywhere. */
export function useIsLocked(fw: number | undefined): boolean {
  const { data } = useDataset();
  return !!(fw && data?.weeks.get(fw)?.locked);
}

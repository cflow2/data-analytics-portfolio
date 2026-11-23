import { create } from 'zustand';
import { db } from '@/db/db';
import { DEFAULT_FY_START } from '@/lib/fiscal';
import { DEFAULT_BENCHMARK, DEFAULT_THRESHOLDS, type SampleThresholds } from '@/lib/ltr';
import type { ISODate } from '@/lib/dates';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  fyStart: ISODate;
  benchmark: number;
  thresholds: SampleThresholds;
  theme: ThemeMode;
  navCollapsed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  fyStart: DEFAULT_FY_START,
  benchmark: DEFAULT_BENCHMARK,
  thresholds: DEFAULT_THRESHOLDS,
  theme: 'system',
  navCollapsed: false,
};

const KEY = 'settings';

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const row = await db.kv.get(KEY);
    set({ ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}), loaded: true });
  },
  update: (patch) => {
    set(patch);
    const { fyStart, benchmark, thresholds, theme, navCollapsed } = { ...get(), ...patch };
    void db.kv.put({ key: KEY, value: { fyStart, benchmark, thresholds, theme, navCollapsed } });
  },
}));

export function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

import { create } from 'zustand';
import { db } from '@/db/db';
import { parseInWorker } from '@/ingest/client';
import { commitParsed } from '@/ingest/commit';
import { defaultTargetWeek } from '@/ingest/parse';
import { hashBytes } from '@/ingest/normalize';
import type { ParsedFile, ParseRequest, ValidationReport } from '@/ingest/types';
import type { Candidate, ColumnMapping } from '@/ingest/specs';
import { getRedactionRules, getRememberedMappings, getSalt, rememberMapping } from './privacy';
import { useSettings } from './settings';
import { todayISO } from '@/lib/dates';

export type StageStatus = 'parsing' | 'needs-mapping' | 'ready' | 'importing' | 'imported' | 'error';

export interface StagedFile {
  key: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
  status: StageStatus;
  parsed?: ParsedFile;
  targetWeek?: number;
  report?: ValidationReport;
  error?: string;
  previouslyImported?: string;
}

interface ImportState {
  files: StagedFile[];
  addFiles: (files: File[], selectedWeek?: number) => Promise<void>;
  reparse: (key: string, force?: ParseRequest['force'], remember?: { kind: string; mapping: ColumnMapping }) => Promise<void>;
  setTarget: (key: string, fw: number) => void;
  importOne: (key: string) => Promise<void>;
  importAll: () => Promise<void>;
  remove: (key: string) => void;
  clearFinished: () => void;
}

async function request(name: string, buffer: ArrayBuffer, force?: ParseRequest['force']): Promise<ParseRequest> {
  const [rules, salt, remembered] = await Promise.all([getRedactionRules(), getSalt(), getRememberedMappings()]);
  return { fileId: hashBytes(buffer), name, buffer: buffer.slice(0), fyStart: useSettings.getState().fyStart, rules, salt, remembered, force, today: todayISO() };
}

function statusFor(p: ParsedFile): StageStatus {
  if (p.error) return 'error';
  if (!p.build) return 'needs-mapping';
  return 'ready';
}

export const useImports = create<ImportState>((set, get) => {
  const patch = (key: string, p: Partial<StagedFile>) => set((s) => ({ files: s.files.map((f) => (f.key === key ? { ...f, ...p } : f)) }));
  let selected: number | undefined;

  const parse = async (key: string, force?: ParseRequest['force']) => {
    const f = get().files.find((x) => x.key === key);
    if (!f) return;
    patch(key, { status: 'parsing', error: undefined });
    const parsed = await parseInWorker(await request(f.name, f.buffer, force));
    const prev = await db.files.get(parsed.fileId);
    patch(key, {
      parsed, status: statusFor(parsed), error: parsed.error,
      targetWeek: parsed.build?.kind === 'loyalty-cases' ? defaultTargetWeek(parsed.build.report.weeks, selected) : undefined,
      previouslyImported: prev?.importedAt,
    });
  };

  return {
    files: [],
    addFiles: async (files, selectedWeek) => {
      selected = selectedWeek;
      const staged: StagedFile[] = await Promise.all(files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        return { key: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 7)}`, name: file.name, size: file.size, buffer, status: 'parsing' as const };
      }));
      set((s) => ({ files: [...staged, ...s.files] }));
      // Parse sequentially in the worker so the queue shows progress file by file.
      for (const f of staged) await parse(f.key);
    },
    reparse: async (key, force, remember) => {
      if (remember) await rememberMapping(remember.kind, remember.mapping);
      await parse(key, force);
    },
    setTarget: (key, fw) => patch(key, { targetWeek: fw }),
    importOne: async (key) => {
      const f = get().files.find((x) => x.key === key);
      if (!f?.parsed?.build) return;
      patch(key, { status: 'importing' });
      try {
        const report = await commitParsed(f.parsed, { targetWeek: f.targetWeek });
        patch(key, { status: 'imported', report });
      } catch (e) {
        patch(key, { status: 'error', error: (e as Error).message });
      }
    },
    importAll: async () => {
      // Tracker first so other sources can merge into it; store maps last.
      const order: Candidate['kind'][] = ['tracker', 'medallia-responses', 'commentary', 'medallia-analytics', 'loyalty-cases', 'followup', 'store-map'];
      const ready = get().files.filter((f) => f.status === 'ready')
        .sort((a, b) => order.indexOf(a.parsed!.candidate!.kind) - order.indexOf(b.parsed!.candidate!.kind));
      for (const f of ready) await get().importOne(f.key);
    },
    remove: (key) => set((s) => ({ files: s.files.filter((f) => f.key !== key) })),
    clearFinished: () => set((s) => ({ files: s.files.filter((f) => f.status !== 'imported') })),
  };
});

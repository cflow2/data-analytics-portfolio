import { db, DATA_TABLES, type HomeCareDB } from './db';

export const BACKUP_FORMAT = 'homecare-ltr-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(database: HomeCareDB = db): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const t of DATA_TABLES) tables[t] = await database.table(t).toArray();
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export async function importBackup(data: unknown, database: HomeCareDB = db): Promise<number> {
  const b = data as Partial<Backup>;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.tables !== 'object' || !b.tables) {
    throw new Error('Not a HomeCare+ backup file.');
  }
  let count = 0;
  await database.transaction('rw', DATA_TABLES.map((t) => database.table(t)), async () => {
    for (const t of DATA_TABLES) {
      await database.table(t).clear();
      const rows = (b.tables as Record<string, unknown[]>)[t] ?? [];
      await database.table(t).bulkPut(rows);
      count += rows.length;
    }
  });
  return count;
}

export async function clearAllData(database: HomeCareDB = db): Promise<void> {
  await database.transaction('rw', DATA_TABLES.map((t) => database.table(t)), async () => {
    for (const t of DATA_TABLES) await database.table(t).clear();
  });
}

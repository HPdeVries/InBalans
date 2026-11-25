import { db, stripLocal, SYNC_TABLES, type SyncTableName } from './db';
import { notifyLocalChange } from '../sync/events';
import { account } from '../sync/account';
import { assertWritable } from './repo';
import type { SyncMeta } from '../domain/types';

export const BACKUP_FORMAT = 'inbalans-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: Record<SyncTableName, SyncMeta[]>;
}

export async function exportBackup(): Promise<Backup> {
  const data = {} as Record<SyncTableName, SyncMeta[]>;
  for (const table of SYNC_TABLES) data[table] = (await db.table(table).toArray()).map(stripLocal);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Merge a backup into the local database. Per record the most recently
 * updated version wins (the same rule a future sync will use).
 */
export async function importBackup(input: unknown): Promise<ImportResult> {
  assertWritable();
  const backup = input as Partial<Backup>;
  if (backup?.format !== BACKUP_FORMAT || typeof backup.data !== 'object' || !backup.data) {
    throw new Error('invalid-backup');
  }
  if ((backup.version ?? 0) > BACKUP_VERSION) throw new Error('backup-too-new');

  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const table of SYNC_TABLES) {
      const records = backup.data![table] ?? [];
      for (const record of records) {
        if (!record?.id || !record.updatedAt) {
          result.skipped++;
          continue;
        }
        const existing: (SyncMeta & { _rev?: number | null }) | undefined = await db.table(table).get(record.id);
        // Imported records are local changes: they are pushed on the next sync.
        const local = { ...stripLocal(record), _dirty: 1, _rev: existing?._rev ?? null };
        if (!existing) {
          await db.table(table).put(local);
          result.added++;
        } else if (record.updatedAt > existing.updatedAt) {
          await db.table(table).put(local);
          result.updated++;
        } else {
          result.skipped++;
        }
      }
    }
  });
  if (result.added || result.updated) notifyLocalChange();
  return result;
}

export function downloadJson(filename: string, value: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  // Support looks along; it does not take copies of the administration.
  if (account?.support) {
    alert('Tijdens meekijken kunnen geen bestanden worden gedownload.');
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

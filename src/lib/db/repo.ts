import { db, type SyncTableName } from './db';
import type { BookDocument, Settings, SyncMeta } from '../domain/types';
import { isLocked } from '../domain/locking';

export function newId(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

/** Create a new record with fresh sync metadata. */
export function create<T extends SyncMeta>(fields: Omit<T, keyof SyncMeta>): T {
  const ts = now();
  return { ...fields, id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null } as T;
}

/** Insert or update a record, bumping `updatedAt`. */
export async function save<T extends SyncMeta>(table: SyncTableName, record: T): Promise<T> {
  const updated = { ...$snapshot(record), updatedAt: now() };
  await db.table(table).put(updated);
  return updated;
}

/** Soft delete: keeps a tombstone so the deletion can be synced. */
export async function remove(table: SyncTableName, id: string): Promise<void> {
  const ts = now();
  await db.table(table).update(id, { deletedAt: ts, updatedAt: ts });
}

/** Strip Svelte proxies / non-cloneable values before writing to IndexedDB. */
function $snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const SETTINGS_ID = 'settings';

export function emptySettings(): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
    businessName: '',
    ownerName: '',
    address: '',
    kvkNumber: '',
    vatId: '',
    iban: '',
    email: '',
    lockedThrough: null,
    archiveDownloads: {},
  };
}

export async function loadSettings(): Promise<Settings> {
  return { ...emptySettings(), ...(await db.settings.get(SETTINGS_ID)) };
}

/** Change some settings fields without overwriting the others. */
export async function updateSettings(patch: Partial<Omit<Settings, keyof SyncMeta>>): Promise<Settings> {
  return save('settings', { ...(await loadSettings()), ...patch });
}

export class PeriodLockedError extends Error {
  constructor() {
    super('period-locked');
  }
}

/**
 * Save a document, refusing changes to locked periods: neither the stored
 * version nor the new version may be dated in a locked period.
 */
export async function saveDocument(doc: BookDocument): Promise<BookDocument> {
  const { lockedThrough } = await loadSettings();
  const stored = await db.documents.get(doc.id);
  if (isLocked(doc.date, lockedThrough) || (stored && !stored.deletedAt && isLocked(stored.date, lockedThrough))) {
    throw new PeriodLockedError();
  }
  return save('documents', doc);
}

export async function removeDocument(id: string): Promise<void> {
  const { lockedThrough } = await loadSettings();
  const stored = await db.documents.get(id);
  if (stored && isLocked(stored.date, lockedThrough)) throw new PeriodLockedError();
  await remove('documents', id);
}

/** Suggest the next sales invoice number in the form YYYY-001. */
export function nextInvoiceNumber(documents: BookDocument[], year: number): string {
  const prefix = `${year}-`;
  let max = 0;
  for (const d of documents) {
    if (d.kind !== 'sale' || d.deletedAt || !d.number.startsWith(prefix)) continue;
    const n = Number(d.number.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

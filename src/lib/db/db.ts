import Dexie, { type DexieOptions, type Table } from 'dexie';
import type {
  BookDocument,
  Category,
  ManualAsset,
  Product,
  Settings,
  StockCount,
} from '../domain/types';
import { defaultCategories } from './seed';
import { account, LOCAL_DB_NAME, tenantDbName } from '../sync/account';

/** Sync state of this database (one row, key 'sync'). */
export interface SyncMetaRow {
  key: 'sync';
  deviceId: string;
  lastPulledRev: number;
  lastSyncAt: string | null;
}

export class InBalansDb extends Dexie {
  documents!: Table<BookDocument, string>;
  categories!: Table<Category, string>;
  manualAssets!: Table<ManualAsset, string>;
  stockCounts!: Table<StockCount, string>;
  settings!: Table<Settings, string>;
  products!: Table<Product, string>;
  syncMeta!: Table<SyncMetaRow, string>;

  constructor(name = LOCAL_DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      documents: 'id, kind, date, updatedAt',
      categories: 'id, kind, updatedAt',
      manualAssets: 'id, updatedAt',
      stockCounts: 'id, year, updatedAt',
      settings: 'id, updatedAt',
      products: 'id, updatedAt',
    });
    // Sync (docs/SYNC_DESIGN.md §3.3): every record gets `_dirty` (1 = local change not yet pushed)
    // and `_rev` (server revision last seen).
    this.version(2).stores({
      documents: 'id, kind, date, updatedAt, _dirty',
      categories: 'id, kind, updatedAt, _dirty',
      manualAssets: 'id, updatedAt, _dirty',
      stockCounts: 'id, year, updatedAt, _dirty',
      settings: 'id, updatedAt, _dirty',
      products: 'id, updatedAt, _dirty',
      syncMeta: 'key',
    });
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(defaultCategories());
    });
  }
}

export const SYNC_TABLES = [
  'documents',
  'categories',
  'manualAssets',
  'stockCounts',
  'settings',
  'products',
] as const;
export type SyncTableName = (typeof SYNC_TABLES)[number];

/** Local-only fields that are never synced or exported. */
export interface LocalSyncFields {
  _dirty?: 0 | 1;
  _rev?: number | null;
}

export function stripLocal<T extends object>(record: T): T {
  const { _dirty, _rev, ...rest } = record as T & LocalSyncFields;
  void _dirty;
  void _rev;
  return rest as T;
}

/**
 * Shared devices keep nothing on disk: the database lives in memory (§7.2).
 * Loaded only when needed, so own devices do not download it.
 */
async function memoryIndexedDb(): Promise<DexieOptions> {
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  return { indexedDB: new IDBFactory(), IDBKeyRange };
}

function openActiveDb(): InBalansDb | Promise<InBalansDb> {
  if (!account) return new InBalansDb(LOCAL_DB_NAME);
  const name = tenantDbName(account.tenantId);
  if (account.deviceMode === 'shared') return memoryIndexedDb().then((o) => new InBalansDb(name, o));
  return new InBalansDb(name);
}

/** The database of the active administration: the local one, or the one of the connected tenant. */
export const db: InBalansDb = await openActiveDb();

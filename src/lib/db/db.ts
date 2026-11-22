import Dexie, { type Table } from 'dexie';
import type {
  BookDocument,
  Category,
  ManualAsset,
  Product,
  Settings,
  StockCount,
} from '../domain/types';
import { defaultCategories } from './seed';

export class InBalansDb extends Dexie {
  documents!: Table<BookDocument, string>;
  categories!: Table<Category, string>;
  manualAssets!: Table<ManualAsset, string>;
  stockCounts!: Table<StockCount, string>;
  settings!: Table<Settings, string>;
  products!: Table<Product, string>;

  constructor(name = 'inbalans') {
    super(name);
    // Every table indexes `updatedAt` so a future sync can fetch changes since a timestamp.
    this.version(1).stores({
      documents: 'id, kind, date, updatedAt',
      categories: 'id, kind, updatedAt',
      manualAssets: 'id, updatedAt',
      stockCounts: 'id, year, updatedAt',
      settings: 'id, updatedAt',
      products: 'id, updatedAt',
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

export const db = new InBalansDb();

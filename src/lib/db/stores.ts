import { liveQuery } from 'dexie';
import { readable, type Readable } from 'svelte/store';
import { db } from './db';
import type { BookDocument, Category, ManualAsset, Settings, StockCount } from '../domain/types';
import { emptySettings, SETTINGS_ID } from './repo';

/** Wrap a Dexie live query in a Svelte store. */
export function live<T>(query: () => T | Promise<T>, initial: T): Readable<T> {
  return readable(initial, (set) => {
    const sub = liveQuery(query).subscribe({ next: set, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  });
}

const notDeleted = <T extends { deletedAt: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt);

/** Data volumes for a sole proprietor are small, so we keep everything in memory and filter there. */
export const documents = live<BookDocument[]>(
  async () => notDeleted(await db.documents.orderBy('date').reverse().toArray()),
  [],
);
export const categories = live<Category[]>(
  async () => notDeleted(await db.categories.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'nl')),
  [],
);
export const manualAssets = live<ManualAsset[]>(async () => notDeleted(await db.manualAssets.toArray()), []);
export const stockCounts = live<StockCount[]>(
  async () => notDeleted(await db.stockCounts.orderBy('year').reverse().toArray()),
  [],
);
export const settings = live<Settings>(
  async () => ({ ...emptySettings(), ...(await db.settings.get(SETTINGS_ID)) }),
  emptySettings(),
);

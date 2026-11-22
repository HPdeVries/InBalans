/**
 * Sync engine: pushes local changes (`_dirty`) and pulls changes from other devices.
 * See docs/SYNC_DESIGN.md §4. The core (`syncDatabase`) takes the database and transport
 * as arguments so it can be tested without a browser or server.
 */
import type { InBalansDb, LocalSyncFields, SyncMetaRow, SyncTableName } from '../db/db';
import { stripLocal, SYNC_TABLES } from '../db/db';
import { MAX_PUSH, type SyncChange, type SyncRecord, type SyncRequest, type SyncResponse } from './protocol';

export type Transport = (req: SyncRequest) => Promise<SyncResponse>;

type LocalRecord = { id: string; updatedAt: string; deletedAt: string | null } & LocalSyncFields & Record<string, unknown>;

export interface SyncResult {
  pushed: number;
  pulled: number;
  /** Records also changed on another device (§4 rule 2). */
  conflicts: number;
  /** Changes refused by the server, e.g. in a locked period. */
  rejected: number;
}

const MAX_ROUNDS = 100;

function isSyncTable(tbl: string): tbl is SyncTableName {
  return (SYNC_TABLES as readonly string[]).includes(tbl);
}

export async function getSyncMeta(db: InBalansDb): Promise<SyncMetaRow> {
  const meta = await db.syncMeta.get('sync');
  if (meta) return meta;
  const fresh: SyncMetaRow = { key: 'sync', deviceId: crypto.randomUUID(), lastPulledRev: 0, lastSyncAt: null };
  await db.syncMeta.put(fresh);
  return fresh;
}

/** Number of local changes not yet pushed. */
export async function countDirty(db: InBalansDb): Promise<number> {
  let n = 0;
  for (const t of SYNC_TABLES) n += await db.table(t).where('_dirty').equals(1).count();
  return n;
}

async function collectDirty(db: InBalansDb): Promise<SyncChange[]> {
  const changes: SyncChange[] = [];
  for (const tbl of SYNC_TABLES) {
    const rows: LocalRecord[] = await db.table(tbl).where('_dirty').equals(1).toArray();
    for (const r of rows) {
      changes.push({
        tbl,
        id: r.id,
        baseRev: r._rev ?? null,
        data: stripLocal(r),
        updatedAt: r.updatedAt,
        deletedAt: r.deletedAt ?? null,
      });
    }
  }
  // Oldest first, so e.g. locking a period and then booking (or the reverse) arrive in the right order.
  changes.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0));
  return changes.slice(0, MAX_PUSH);
}

/** One full sync: repeats push/pull rounds until nothing is left. */
export async function syncDatabase(db: InBalansDb, transport: Transport): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, rejected: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const meta = await getSyncMeta(db);
    const changes = await collectDirty(db);
    const res = await transport({ deviceId: meta.deviceId, since: meta.lastPulledRev, changes });
    await apply(db, changes, res, result);
    if (!res.more && changes.length < MAX_PUSH) break;
  }
  return result;
}

async function apply(db: InBalansDb, pushed: SyncChange[], res: SyncResponse, result: SyncResult): Promise<void> {
  const sent = new Map(pushed.map((c) => [`${c.tbl}\u0000${c.id}`, c]));
  const tables = [...SYNC_TABLES.map((t) => db.table(t)), db.syncMeta];

  await db.transaction('rw', tables, async () => {
    /** Whether the local record still is the version we pushed (not edited during the request). */
    const unchanged = (local: LocalRecord | undefined, tbl: string, id: string) =>
      !!local && local.updatedAt === sent.get(`${tbl}\u0000${id}`)?.updatedAt;

    /** Store a server version unless the record was edited locally in the meantime. */
    const putServer = async (rec: SyncRecord, local: LocalRecord | undefined, force: boolean) => {
      if (!isSyncTable(rec.tbl)) return; // table of a newer app version
      // Keep a newer local edit with its old base revision: the next push then
      // conflicts on the server and the conflict rule decides (§4 rule 2).
      if (local?._dirty === 1 && !force) return;
      await db.table(rec.tbl).put({ ...rec.data, _rev: rec.rev, _dirty: 0 });
    };

    for (const a of res.accepted) {
      if (!isSyncTable(a.tbl)) continue;
      const local: LocalRecord | undefined = await db.table(a.tbl).get(a.id);
      if (!local) continue;
      await db.table(a.tbl).update(a.id, unchanged(local, a.tbl, a.id) ? { _rev: a.rev, _dirty: 0 } : { _rev: a.rev });
      result.pushed++;
    }
    for (const c of res.conflicts) {
      if (!isSyncTable(c.tbl)) continue;
      const local: LocalRecord | undefined = await db.table(c.tbl).get(c.id);
      await putServer(c.winner, local, unchanged(local, c.tbl, c.id));
      result.conflicts++;
    }
    for (const r of res.rejected) {
      if (!isSyncTable(r.tbl)) continue;
      const local: LocalRecord | undefined = await db.table(r.tbl).get(r.id);
      if (!unchanged(local, r.tbl, r.id)) continue;
      // Restore the server version; without one, keep the local record but stop pushing it.
      if (r.current) await putServer(r.current, local, true);
      else await db.table(r.tbl).update(r.id, { _dirty: 0 });
      result.rejected++;
    }
    for (const rec of res.changes) {
      if (!isSyncTable(rec.tbl)) continue;
      const local: LocalRecord | undefined = await db.table(rec.tbl).get(rec.id);
      await putServer(rec, local, false);
      result.pulled++;
    }
    const meta = await getSyncMeta(db);
    await db.syncMeta.put({ ...meta, lastPulledRev: res.rev, lastSyncAt: new Date().toISOString() });
  });
}

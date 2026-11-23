/**
 * Sync rules of one tenant, independent of the Durable Object runtime so they
 * can be unit tested against any SQLite. See docs/SYNC_DESIGN.md §3.2 and §4.
 */
import {
  MAX_PULL,
  MAX_PUSH,
  type SyncChange,
  type SyncRecord,
  type SyncRequest,
  type SyncResponse,
} from '../../src/lib/sync/protocol';

/** Minimal SQL access, implemented by the Durable Object storage and by node:sqlite in tests. */
export interface Sql {
  all<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): T[];
  run(query: string, ...bindings: unknown[]): void;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE records (
     tbl TEXT NOT NULL,
     id TEXT NOT NULL,
     data TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     deleted_at TEXT,
     rev INTEGER NOT NULL,
     device_id TEXT NOT NULL,
     PRIMARY KEY (tbl, id)
   );
   CREATE INDEX records_rev ON records(rev);
   CREATE TABLE conflicts (tbl TEXT, id TEXT, data TEXT, device_id TEXT, at TEXT);
   CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);`,
];

/** Run pending schema migrations (lazily, on first access after a deploy). */
export function migrate(sql: Sql): void {
  sql.run('CREATE TABLE IF NOT EXISTS _schema (version INTEGER NOT NULL)');
  const row = sql.all<{ version: number }>('SELECT version FROM _schema')[0];
  let version = row?.version ?? 0;
  if (!row) sql.run('INSERT INTO _schema (version) VALUES (0)');
  while (version < MIGRATIONS.length) {
    for (const stmt of MIGRATIONS[version].split(';').map((s) => s.trim()).filter(Boolean)) sql.run(stmt);
    version++;
    sql.run('UPDATE _schema SET version = ?', version);
  }
}

interface Row {
  tbl: string;
  id: string;
  data: string;
  updated_at: string;
  deleted_at: string | null;
  rev: number;
  device_id: string;
}

const toRecord = (r: Row): SyncRecord => ({
  tbl: r.tbl,
  id: r.id,
  data: JSON.parse(r.data),
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  rev: r.rev,
});

function getMeta(sql: Sql, key: string): string | null {
  return sql.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)[0]?.value ?? null;
}

export function lastRev(sql: Sql): number {
  return Number(getMeta(sql, 'last_rev') ?? 0);
}

function getRow(sql: Sql, tbl: string, id: string): Row | undefined {
  return sql.all<Row>('SELECT * FROM records WHERE tbl = ? AND id = ?', tbl, id)[0];
}

/** JSON with sorted keys, to compare records regardless of key order. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_RECORD_BYTES = 256 * 1024;

function isValid(c: SyncChange): boolean {
  return (
    !!c &&
    typeof c.tbl === 'string' &&
    NAME.test(c.tbl) &&
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    c.id.length <= 100 &&
    typeof c.updatedAt === 'string' &&
    !!c.data &&
    typeof c.data === 'object' &&
    (c.baseRev === null || Number.isInteger(c.baseRev))
  );
}

/** Period locking (§10), enforced server side as well: mirrors saveDocument/removeDocument in the app. */
function violatesLock(sql: Sql, change: SyncChange, stored: Row | undefined): boolean {
  if (change.tbl !== 'documents') return false;
  const settings = getRow(sql, 'settings', 'settings');
  const lockedThrough = settings ? (JSON.parse(settings.data).lockedThrough as string | null | undefined) : null;
  if (!lockedThrough) return false;
  const locked = (date: unknown) => typeof date === 'string' && !!date && date <= lockedThrough;
  const storedData = stored ? JSON.parse(stored.data) : null;
  if (storedData && !stored!.deleted_at && locked(storedData.date)) {
    // Re-sending an identical version (e.g. after merging a device) is not a change.
    return canonical(storedData) !== canonical(change.data);
  }
  return !change.deletedAt && locked(change.data.date);
}

/**
 * Apply pushed changes and return what the device is missing.
 * Must run inside one storage transaction.
 */
export function sync(sql: Sql, req: SyncRequest, now = new Date().toISOString()): SyncResponse {
  if (!Array.isArray(req.changes) || req.changes.length > MAX_PUSH) throw new Error('too-many-changes');
  const since = Number.isInteger(req.since) && req.since > 0 ? req.since : 0;
  const res: SyncResponse = { accepted: [], conflicts: [], rejected: [], changes: [], rev: 0, more: false };
  const handled = new Set<string>();
  let rev = lastRev(sql);

  const write = (c: SyncChange): number => {
    rev++;
    sql.run(
      `INSERT INTO records (tbl, id, data, updated_at, deleted_at, rev, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (tbl, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at, rev = excluded.rev, device_id = excluded.device_id`,
      c.tbl, c.id, JSON.stringify(c.data), c.updatedAt, c.deletedAt ?? null, rev, req.deviceId,
    );
    return rev;
  };
  const keepLoser = (tbl: string, id: string, data: string, deviceId: string) =>
    sql.run('INSERT INTO conflicts (tbl, id, data, device_id, at) VALUES (?, ?, ?, ?, ?)', tbl, id, data, deviceId, now);

  for (const change of req.changes) {
    if (!isValid(change) || JSON.stringify(change.data).length > MAX_RECORD_BYTES) {
      if (change && typeof change.tbl === 'string' && typeof change.id === 'string') {
        res.rejected.push({ tbl: change.tbl, id: change.id, reason: 'invalid', current: null });
      }
      continue;
    }
    const key = `${change.tbl}\u0000${change.id}`;
    handled.add(key);
    const stored = getRow(sql, change.tbl, change.id);

    if (violatesLock(sql, change, stored)) {
      res.rejected.push({ tbl: change.tbl, id: change.id, reason: 'locked', current: stored ? toRecord(stored) : null });
      continue;
    }
    // Identical content: nothing to write, the device just learns the revision.
    if (stored && canonical(JSON.parse(stored.data)) === canonical(change.data)) {
      res.accepted.push({ tbl: change.tbl, id: change.id, rev: stored.rev });
      continue;
    }
    if (!stored || change.baseRev === stored.rev) {
      res.accepted.push({ tbl: change.tbl, id: change.id, rev: write(change) });
      continue;
    }
    // Conflict: the latest updatedAt wins; the stored version wins a tie. The loser is kept.
    if (change.updatedAt > stored.updated_at) {
      keepLoser(stored.tbl, stored.id, stored.data, stored.device_id);
      write(change);
      res.conflicts.push({ tbl: change.tbl, id: change.id, winner: toRecord(getRow(sql, change.tbl, change.id)!) });
    } else {
      keepLoser(change.tbl, change.id, JSON.stringify(change.data), req.deviceId);
      res.conflicts.push({ tbl: change.tbl, id: change.id, winner: toRecord(stored) });
    }
  }

  sql.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    'last_rev',
    String(rev),
  );

  const rows = sql.all<Row>('SELECT * FROM records WHERE rev > ? ORDER BY rev LIMIT ?', since, MAX_PULL + 1);
  res.more = rows.length > MAX_PULL;
  const page = rows.slice(0, MAX_PULL);
  res.changes = page.filter((r) => !handled.has(`${r.tbl}\u0000${r.id}`)).map(toRecord);
  res.rev = res.more ? page[page.length - 1].rev : rev;
  return res;
}

export function stats(sql: Sql): { records: number; rev: number; conflicts: number } {
  return {
    records: sql.all<{ n: number }>('SELECT COUNT(*) AS n FROM records')[0].n,
    rev: lastRev(sql),
    conflicts: sql.all<{ n: number }>('SELECT COUNT(*) AS n FROM conflicts')[0].n,
  };
}

/** Records and payload size per table (admin overview). */
export function tableStats(sql: Sql): { tbl: string; records: number; deleted: number; bytes: number }[] {
  return sql.all<{ tbl: string; records: number; deleted: number; bytes: number }>(
    `SELECT tbl, COUNT(*) AS records, SUM(deleted_at IS NOT NULL) AS deleted, SUM(LENGTH(data)) AS bytes
     FROM records GROUP BY tbl ORDER BY tbl`,
  );
}

export function lastChange(sql: Sql): string | null {
  return sql.all<{ at: string | null }>('SELECT MAX(updated_at) AS at FROM records')[0]?.at ?? null;
}

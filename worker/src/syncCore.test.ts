import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, sync, stats, type Sql } from './syncCore';
import type { SyncChange } from '../../src/lib/sync/protocol';

function memorySql(): Sql {
  const db = new DatabaseSync(':memory:');
  return {
    all: (q, ...b) => db.prepare(q).all(...(b as never[])) as never,
    run: (q, ...b) => void db.prepare(q).run(...(b as never[])),
  };
}

const doc = (id: string, fields: Record<string, unknown>, updatedAt: string, baseRev: number | null = null): SyncChange => ({
  tbl: 'documents',
  id,
  baseRev,
  data: { id, updatedAt, deletedAt: null, ...fields },
  updatedAt,
  deletedAt: null,
});

describe('tenant sync rules', () => {
  let sql: Sql;
  beforeEach(() => {
    sql = memorySql();
    migrate(sql);
    migrate(sql); // idempotent
  });

  it('accepts new records and pulls them on another device', () => {
    const a = sync(sql, { deviceId: 'A', since: 0, changes: [doc('d1', { date: '2026-01-05' }, 't1')] });
    expect(a.accepted).toEqual([{ tbl: 'documents', id: 'd1', rev: 1 }]);
    expect(a.changes).toEqual([]); // own change is not echoed back
    expect(a.rev).toBe(1);

    const b = sync(sql, { deviceId: 'B', since: 0, changes: [] });
    expect(b.changes.map((c) => c.id)).toEqual(['d1']);
    expect(b.changes[0].rev).toBe(1);
    expect(sync(sql, { deviceId: 'B', since: b.rev, changes: [] }).changes).toEqual([]);
  });

  it('accepts updates based on the latest revision', () => {
    sync(sql, { deviceId: 'A', since: 0, changes: [doc('d1', { n: 1 }, 't1')] });
    const res = sync(sql, { deviceId: 'B', since: 1, changes: [doc('d1', { n: 2 }, 't2', 1)] });
    expect(res.accepted[0].rev).toBe(2);
    expect(res.conflicts).toEqual([]);
  });

  it('resolves conflicts by latest updatedAt and keeps the losing version', () => {
    sync(sql, { deviceId: 'A', since: 0, changes: [doc('d1', { n: 1 }, 't1')] });
    sync(sql, { deviceId: 'A', since: 1, changes: [doc('d1', { n: 2 }, 't3', 1)] });

    // B edited an older version, earlier than A: A's version stays.
    const lost = sync(sql, { deviceId: 'B', since: 1, changes: [doc('d1', { n: 9 }, 't2', 1)] });
    expect(lost.conflicts[0].winner.data.n).toBe(2);
    expect(lost.conflicts[0].winner.rev).toBe(2);

    // B edited later than A: B wins with a new revision.
    const won = sync(sql, { deviceId: 'B', since: 1, changes: [doc('d1', { n: 10 }, 't4', 1)] });
    expect(won.conflicts[0].winner).toMatchObject({ rev: 3, data: { n: 10 } });
    expect(stats(sql).conflicts).toBe(2);
  });

  it('treats identical content as accepted without a new revision', () => {
    sync(sql, { deviceId: 'A', since: 0, changes: [doc('d1', { n: 1 }, 't1')] });
    const res = sync(sql, { deviceId: 'B', since: 0, changes: [doc('d1', { n: 1 }, 't1')] });
    expect(res.accepted).toEqual([{ tbl: 'documents', id: 'd1', rev: 1 }]);
    expect(stats(sql).rev).toBe(1);
  });

  it('rejects changes in locked periods', () => {
    sync(sql, { deviceId: 'A', since: 0, changes: [doc('old', { date: '2026-02-01' }, 't1')] });
    const settings: SyncChange = {
      tbl: 'settings', id: 'settings', baseRev: null, updatedAt: 't2', deletedAt: null,
      data: { id: 'settings', lockedThrough: '2026-03-31' },
    };
    sync(sql, { deviceId: 'A', since: 1, changes: [settings] });

    const res = sync(sql, {
      deviceId: 'B',
      since: 2,
      changes: [
        doc('old', { date: '2026-02-01', n: 2 }, 't3', 1), // edit in locked period
        doc('new', { date: '2026-03-15' }, 't3'), // new booking in locked period
        doc('moved', { date: '2026-04-02' }, 't3'), // open period: fine
      ],
    });
    expect(res.rejected.map((r) => [r.id, r.reason])).toEqual([['old', 'locked'], ['new', 'locked']]);
    expect(res.rejected[0].current?.rev).toBe(1);
    expect(res.accepted.map((a) => a.id)).toEqual(['moved']);
  });

  it('rejects invalid input and paginates large pulls', () => {
    const res = sync(sql, { deviceId: 'A', since: 0, changes: [{ ...doc('x', {}, 't1'), tbl: 'bad name' }] });
    expect(res.rejected[0].reason).toBe('invalid');

    const many = Array.from({ length: 500 }, (_, i) => doc(`d${i}`, {}, 't1'));
    sync(sql, { deviceId: 'A', since: 0, changes: many });
    sync(sql, { deviceId: 'A', since: 0, changes: [doc('last', {}, 't1')] });
    const first = sync(sql, { deviceId: 'B', since: 0, changes: [] });
    expect(first.more).toBe(true);
    expect(first.changes).toHaveLength(500);
    const second = sync(sql, { deviceId: 'B', since: first.rev, changes: [] });
    expect(second.more).toBe(false);
    expect(second.changes.map((c) => c.id)).toEqual(['last']);
  });
});

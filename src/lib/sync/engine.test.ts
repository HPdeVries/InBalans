/// <reference types="node" />
import 'fake-indexeddb/auto';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { InBalansDb } from '../db/db';
import { migrate, sync, type Sql } from '../../../worker/src/syncCore';
import { countDirty, syncDatabase, type Transport } from './engine';

function server(): Transport {
  const db = new DatabaseSync(':memory:');
  const sql: Sql = {
    all: (q, ...b) => db.prepare(q).all(...(b as never[])) as never,
    run: (q, ...b) => void db.prepare(q).run(...(b as never[])),
  };
  migrate(sql);
  // Round-trip through JSON like the real API.
  return async (req) => JSON.parse(JSON.stringify(sync(sql, JSON.parse(JSON.stringify(req)))));
}

let n = 0;
const device = () => new InBalansDb(`test-${n++}`);

const doc = (id: string, fields: Record<string, unknown>, updatedAt: string) => ({
  id, kind: 'sale', date: '2026-05-01', number: '', counterparty: '', counterpartyVatId: '', amountsInclVat: true,
  lines: [], notes: '', createdAt: updatedAt, updatedAt, deletedAt: null, _dirty: 1 as const, ...fields,
});

describe('sync engine', () => {
  it('syncs records and deletions between two devices', async () => {
    const transport = server();
    const a = device();
    const b = device();
    await a.table('documents').put(doc('d1', { notes: 'from A' }, '2026-05-01T10:00:00Z'));

    const ra = await syncDatabase(a, transport);
    // Seeded categories are not dirty, so only the document is pushed.
    expect(ra.pushed).toBe(1);
    expect(await countDirty(a)).toBe(0);

    const rb = await syncDatabase(b, transport);
    expect(rb.pulled).toBe(1);
    expect((await b.documents.get('d1'))?.notes).toBe('from A');
    expect((await b.documents.get('d1')) as unknown).toMatchObject({ _rev: 1, _dirty: 0 });

    // B deletes, A pulls the tombstone.
    await b.table('documents').update('d1', { deletedAt: '2026-05-02T10:00:00Z', updatedAt: '2026-05-02T10:00:00Z', _dirty: 1 });
    await syncDatabase(b, transport);
    await syncDatabase(a, transport);
    expect((await a.documents.get('d1'))?.deletedAt).toBe('2026-05-02T10:00:00Z');
  });

  it('resolves concurrent edits by the latest change and reports the conflict', async () => {
    const transport = server();
    const a = device();
    const b = device();
    await a.table('documents').put(doc('d1', { notes: 'v1' }, '2026-05-01T10:00:00Z'));
    await syncDatabase(a, transport);
    await syncDatabase(b, transport);

    await a.table('documents').update('d1', { notes: 'A edit', updatedAt: '2026-05-01T11:00:00Z', _dirty: 1 });
    await b.table('documents').update('d1', { notes: 'B edit (later)', updatedAt: '2026-05-01T12:00:00Z', _dirty: 1 });
    await syncDatabase(a, transport);
    const rb = await syncDatabase(b, transport);
    expect(rb.conflicts).toBe(1);
    await syncDatabase(a, transport);

    expect((await a.documents.get('d1'))?.notes).toBe('B edit (later)');
    expect((await b.documents.get('d1'))?.notes).toBe('B edit (later)');
    expect(await countDirty(a)).toBe(0);
    expect(await countDirty(b)).toBe(0);
  });

  it('pages through large uploads and downloads', async () => {
    const transport = server();
    const a = device();
    const b = device();
    await a.table('documents').bulkPut(Array.from({ length: 1200 }, (_, i) => doc(`d${i}`, {}, '2026-05-01T10:00:00Z')));
    expect((await syncDatabase(a, transport)).pushed).toBe(1200);
    expect((await syncDatabase(b, transport)).pulled).toBe(1200);
    expect(await b.documents.count()).toBe(1200);
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import { exportBackup, importBackup } from './backup';

describe('backup', () => {
  it('seeds categories and round-trips with last-write-wins', async () => {
    const backup = await exportBackup();
    expect(backup.data.categories.length).toBeGreaterThan(10);

    const cat = backup.data.categories[0] as { id: string; name?: string; updatedAt: string };
    await db.categories.update(cat.id, { name: 'Local', updatedAt: '2030-01-01T00:00:00.000Z' });
    const res = await importBackup(backup);
    expect(res.added).toBe(0);
    expect((await db.categories.get(cat.id))?.name).toBe('Local');

    const newer = structuredClone(backup);
    Object.assign(newer.data.categories[0], { name: 'Remote', updatedAt: '2031-01-01T00:00:00.000Z' });
    expect((await importBackup(newer)).updated).toBe(1);
    expect((await db.categories.get(cat.id))?.name).toBe('Remote');
  });

  it('rejects invalid files', async () => {
    await expect(importBackup({ foo: 1 })).rejects.toThrow('invalid-backup');
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from './db';
import { create, PeriodLockedError, removeDocument, saveDocument, updateSettings } from './repo';
import type { BookDocument } from '../domain/types';

const newDoc = (date: string) =>
  create<BookDocument>({
    kind: 'sale', date, number: '', counterparty: '', counterpartyVatId: '', amountsInclVat: true, lines: [], notes: '',
  });

describe('period locking in the repository', () => {
  it('blocks saving and deleting in a locked period', async () => {
    const open = await saveDocument(newDoc('2026-10-01'));
    const old = await saveDocument(newDoc('2026-08-01'));
    await updateSettings({ lockedThrough: '2026-09-30', businessName: 'X' });

    await expect(saveDocument(newDoc('2026-09-30'))).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(saveDocument({ ...old, notes: 'changed' })).rejects.toBeInstanceOf(PeriodLockedError);
    // Moving an open document into a locked period is not allowed either.
    await expect(saveDocument({ ...open, date: '2026-07-01' })).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(removeDocument(old.id)).rejects.toBeInstanceOf(PeriodLockedError);
    await expect(saveDocument({ ...open, notes: 'ok' })).resolves.toMatchObject({ notes: 'ok' });

    // updateSettings keeps fields that are not patched
    await updateSettings({ ownerName: 'Y' });
    expect((await db.settings.get('settings'))?.lockedThrough).toBe('2026-09-30');
    expect((await db.settings.get('settings'))?.businessName).toBe('X');
  });
});

import { describe, expect, it } from 'vitest';
import { isLocked, lockDateAfterReopen, quarterLockState, reversedLines } from './locking';
import { computeDocumentTotals } from './vat';
import { doc, line } from './testUtil';

describe('locking', () => {
  it('isLocked', () => {
    expect(isLocked('2026-09-30', '2026-09-30')).toBe(true);
    expect(isLocked('2026-10-01', '2026-09-30')).toBe(false);
    expect(isLocked('2020-01-01', null)).toBe(false);
    expect(isLocked('2020-01-01', undefined)).toBe(false);
  });

  it('quarter states', () => {
    expect(quarterLockState(2026, 3, '2026-09-30', '2026-11-22')).toBe('locked');
    expect(quarterLockState(2026, 2, '2026-09-30', '2026-11-22')).toBe('locked');
    expect(quarterLockState(2026, 3, '2026-06-30', '2026-11-22')).toBe('lockable');
    expect(quarterLockState(2026, 4, '2026-09-30', '2026-11-22')).toBe('open');
  });

  it('reopen moves the lock date to the previous quarter', () => {
    expect(lockDateAfterReopen(2026, 3)).toBe('2026-06-30');
    expect(lockDateAfterReopen(2026, 1)).toBe('2025-12-31');
  });

  it('reversed lines cancel the original', () => {
    const original = doc({
      amountsInclVat: true,
      lines: [
        line({ vatCode: 'S_HIGH', unitAmount: 12100 }),
        line({ vatCode: 'P_HIGH', unitAmount: 1210, vatOverride: 209, asset: { usefulLifeYears: 5, residualValue: 0, disposalDate: null } }),
      ],
    });
    const reversed = reversedLines(original);
    expect(reversed[0].id).not.toBe(original.lines[0].id);
    expect(reversed[1].asset).toBeNull();
    const a = computeDocumentTotals(original);
    const b = computeDocumentTotals({ ...original, lines: reversed });
    expect(b).toEqual({ net: -a.net, vat: -a.vat, gross: -a.gross });
  });
});

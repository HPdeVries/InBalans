import { newLineId } from './ids';
import { quarterPeriod } from './period';
import type { BookDocument, DocumentLine, IsoDate } from './types';

/** Whether a booking date falls in a locked (closed) period. */
export function isLocked(date: IsoDate, lockedThrough: IsoDate | null | undefined): boolean {
  return !!lockedThrough && !!date && date <= lockedThrough;
}

export type QuarterLockState = 'locked' | 'lockable' | 'open';

/**
 * Locking is cumulative: locking a quarter also locks everything before it.
 * A quarter can only be locked once it has ended.
 */
export function quarterLockState(
  year: number,
  quarter: number,
  lockedThrough: IsoDate | null | undefined,
  today: IsoDate,
): QuarterLockState {
  const { to } = quarterPeriod(year, quarter);
  if (isLocked(to, lockedThrough)) return 'locked';
  return to < today ? 'lockable' : 'open';
}

/** The lock date after reopening a quarter: the end of the quarter before it. */
export function lockDateAfterReopen(year: number, quarter: number): IsoDate | null {
  if (year < 1900) return null;
  return quarter === 1 ? `${year - 1}-12-31` : quarterPeriod(year, quarter - 1).to;
}

/**
 * Lines that reverse a document: same treatment, negated amounts.
 * Used to correct a booking in a locked period with a new booking in an open period.
 */
export function reversedLines(doc: BookDocument): DocumentLine[] {
  return doc.lines.map((l) => ({
    ...structuredClone(l),
    id: newLineId(),
    unitAmount: -l.unitAmount,
    vatOverride: l.vatOverride === null ? null : -l.vatOverride,
    // A correction never creates or disposes an asset on its own.
    asset: null,
  }));
}

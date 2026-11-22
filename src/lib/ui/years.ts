import type { BookDocument } from '../domain/types';

/** Years that have bookings, plus the current year, newest first. */
export function availableYears(documents: BookDocument[]): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const d of documents) years.add(Number(d.date.slice(0, 4)));
  return [...years].filter((y) => y > 1900).sort((a, b) => b - a);
}

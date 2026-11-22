import type { IsoDate } from './types';

export interface Period {
  from: IsoDate;
  to: IsoDate;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): IsoDate {
  return toIsoDate(new Date());
}

export function quarterOf(date: IsoDate): number {
  return Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;
}

export function quarterPeriod(year: number, quarter: number): Period {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
}

export function yearPeriod(year: number): Period {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function inPeriod(date: IsoDate, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

/** Number of months from the month of `start` up to and including the month of `end`. */
export function monthsInclusive(start: IsoDate, end: IsoDate): number {
  if (end < start) return 0;
  const y1 = Number(start.slice(0, 4));
  const m1 = Number(start.slice(5, 7));
  const y2 = Number(end.slice(0, 4));
  const m2 = Number(end.slice(5, 7));
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

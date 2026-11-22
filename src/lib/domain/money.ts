/**
 * Money is always stored as an integer number of euro cents.
 * Never use floating point euros for stored amounts.
 */
export type Cents = number;

/** Round half away from zero (commercial rounding, symmetric for credit notes). */
export function roundHalfAwayFromZero(value: number): number {
  const sign = value < 0 ? -1 : 1;
  // Small epsilon guards against binary artifacts like 1.005 * 100 = 100.49999...
  return sign * Math.round(Math.abs(value) + 1e-9);
}

/**
 * Parse user input into cents. Accepts Dutch ("1.234,56") and plain ("1234.56") notation.
 * Rules: if a comma is present it is the decimal separator and dots are thousand separators.
 * Without a comma, dots are thousand separators when every group after a dot has exactly
 * three digits ("2.420", "1.234.567"); otherwise a single dot is the decimal separator ("12.50").
 * Returns null for empty or invalid input.
 */
export function parseMoney(input: string): Cents | null {
  let s = input.trim().replace(/[€\s]/g, '');
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!/^\d*(\.\d*)?$/.test(s) || s === '.' ) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  const cents = roundHalfAwayFromZero(value * 100);
  return negative ? -cents : cents;
}

const eurFormatter = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
const plainFormatter = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeFormatter = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

/** "€ 1.234,56" */
export function formatMoney(cents: Cents): string {
  return eurFormatter.format(cents / 100);
}

/** "1.234,56" (for input fields) */
export function formatMoneyPlain(cents: Cents): string {
  return plainFormatter.format(cents / 100);
}

/** Whole euros, e.g. for the VAT return: "1.234" */
export function formatWholeEuros(euros: number): string {
  return wholeFormatter.format(euros);
}

/** Truncate cents to whole euros towards zero ("afronden in uw voordeel" for amounts owed). */
export function floorEuros(cents: Cents): number {
  return Math.trunc(cents / 100);
}

/** Round cents up to whole euros (away from zero), used for deductible VAT. */
export function ceilEuros(cents: Cents): number {
  return cents >= 0 ? Math.ceil(cents / 100) : -Math.ceil(-cents / 100);
}

export function sum(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

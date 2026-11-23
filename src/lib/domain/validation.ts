/** Light checks for business details. Used as hints: they never block saving. */

const compact = (v: string) => v.replace(/[\s.-]/g, '').toUpperCase();

/** IBAN with a valid ISO 13616 checksum (mod 97). */
export function isValidIban(value: string): boolean {
  const iban = compact(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  return rest === 1;
}

/** Dutch Chamber of Commerce number: 8 digits. */
export function isValidKvk(value: string): boolean {
  return /^\d{8}$/.test(compact(value));
}

/** Dutch VAT identification number (btw-id): NL + 9 digits + B + 2 digits. Other EU formats are accepted. */
export function isValidVatId(value: string): boolean {
  const v = compact(value);
  if (v.startsWith('NL')) return /^NL\d{9}B\d{2}$/.test(v);
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(v);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Normalised forms for storage. */
export function formatIban(value: string): string {
  return compact(value).replace(/(.{4})/g, '$1 ').trim();
}

export function formatVatId(value: string): string {
  return compact(value);
}

import { describe, expect, it } from 'vitest';
import { formatIban, isValidEmail, isValidIban, isValidKvk, isValidVatId } from './validation';

describe('business detail checks', () => {
  it('checks IBAN checksums', () => {
    expect(isValidIban('NL91 ABNA 0417 1643 00')).toBe(true);
    expect(isValidIban('nl91abna0417164300')).toBe(true);
    expect(isValidIban('NL91 ABNA 0417 1643 01')).toBe(false);
    expect(isValidIban('NL91')).toBe(false);
    expect(formatIban('nl91abna0417164300')).toBe('NL91 ABNA 0417 1643 00');
  });
  it('checks KvK, VAT id and e-mail', () => {
    expect(isValidKvk('12345678')).toBe(true);
    expect(isValidKvk('1234567')).toBe(false);
    expect(isValidVatId('NL000099998B57')).toBe(true);
    expect(isValidVatId('nl 0000.99998.b57')).toBe(true);
    expect(isValidVatId('NL123')).toBe(false);
    expect(isValidVatId('DE123456789')).toBe(true);
    expect(isValidEmail('a@b.nl')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

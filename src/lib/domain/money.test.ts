import { describe, expect, it } from 'vitest';
import { ceilEuros, floorEuros, parseMoney } from './money';

describe('parseMoney', () => {
  it.each([
    ['12,50', 1250],
    ['12.50', 1250],
    ['1.234,56', 123456],
    ['1.234.567', 123456700],
    ['€ 99', 9900],
    ['-10,005', -1001],
    ['0,1', 10],
    [',5', 50],
  ])('%s -> %d', (input, expected) => expect(parseMoney(input)).toBe(expected));

  it.each(['', 'abc', '1,2,3', '.'])('rejects %s', (input) => expect(parseMoney(input)).toBeNull());
});

describe('whole euro rounding', () => {
  it('floors and ceils', () => {
    expect(floorEuros(12399)).toBe(123);
    expect(ceilEuros(12301)).toBe(124);
    expect(ceilEuros(12300)).toBe(123);
  });
});

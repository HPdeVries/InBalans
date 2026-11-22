import { describe, expect, it } from 'vitest';
import { computeDocumentTotals, computeLine, rateFor } from './vat';
import { line } from './testUtil';

describe('rateFor', () => {
  it('uses the rate valid on the date', () => {
    expect(rateFor('low', '2018-12-31')).toBe(600);
    expect(rateFor('low', '2019-01-01')).toBe(900);
    expect(rateFor('high', '2026-05-01')).toBe(2100);
  });
});

describe('computeLine', () => {
  const d = '2026-03-01';
  it('excl. VAT', () => {
    expect(computeLine(line({ vatCode: 'S_HIGH', unitAmount: 10000 }), false, d)).toMatchObject({
      net: 10000, vat: 2100, gross: 12100,
    });
  });
  it('incl. VAT', () => {
    expect(computeLine(line({ vatCode: 'P_LOW', unitAmount: 10900 }), true, d)).toMatchObject({
      net: 10000, vat: 900, gross: 10900,
    });
  });
  it('manual VAT override', () => {
    expect(computeLine(line({ vatCode: 'P_HIGH', unitAmount: 1210, vatOverride: 209 }), true, d)).toMatchObject({
      net: 1001, vat: 209, gross: 1210,
    });
  });
  it('quantity', () => {
    expect(computeLine(line({ vatCode: 'S_HIGH', quantity: 3, unitAmount: 1000 }), false, d).gross).toBe(3630);
  });
  it('reverse charge: self-assessed VAT, nothing on invoice', () => {
    expect(computeLine(line({ vatCode: 'P_EU_HIGH', unitAmount: 10000 }), true, d)).toMatchObject({
      net: 10000, vat: 2100, gross: 10000,
    });
  });
  it('foreign VAT is cost', () => {
    expect(computeLine(line({ vatCode: 'P_FOREIGN_VAT', unitAmount: 11900 }), true, d)).toMatchObject({
      net: 11900, vat: 0, gross: 11900,
    });
  });
  it('credit note', () => {
    expect(computeLine(line({ vatCode: 'S_HIGH', unitAmount: -12100 }), true, d)).toMatchObject({
      net: -10000, vat: -2100,
    });
  });
});

describe('computeDocumentTotals', () => {
  it('sums mixed rates and excludes self-assessed VAT', () => {
    const totals = computeDocumentTotals({
      date: '2026-01-10',
      amountsInclVat: false,
      lines: [
        line({ vatCode: 'P_HIGH', unitAmount: 10000 }),
        line({ vatCode: 'P_LOW', unitAmount: 10000 }),
        line({ vatCode: 'P_EU_HIGH', unitAmount: 10000 }),
      ],
    });
    expect(totals).toEqual({ net: 30000, vat: 3000, gross: 33000 });
  });
});

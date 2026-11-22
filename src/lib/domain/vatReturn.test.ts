import { describe, expect, it } from 'vitest';
import { quarterPeriod } from './period';
import { doc, line } from './testUtil';
import { computeVatReturn } from './vatReturn';

describe('computeVatReturn', () => {
  const docs = [
    doc({ kind: 'sale', date: '2026-01-15', lines: [
      line({ vatCode: 'S_HIGH', unitAmount: 100050 }),
      line({ vatCode: 'S_LOW', unitAmount: 20000 }),
      line({ vatCode: 'S_EU', unitAmount: 50000 }),
    ] }),
    doc({ kind: 'purchase', date: '2026-02-01', amountsInclVat: true, lines: [
      line({ vatCode: 'P_HIGH', unitAmount: 12100 }),
    ] }),
    doc({ kind: 'purchase', date: '2026-03-31', lines: [
      line({ vatCode: 'P_EU_HIGH', unitAmount: 10000 }),
      line({ vatCode: 'P_NON_EU_HIGH', unitAmount: 5000 }),
    ] }),
    doc({ kind: 'sale', date: '2026-04-01', lines: [line({ vatCode: 'S_HIGH', unitAmount: 99900 })] }),
    doc({ kind: 'sale', date: '2026-02-01', deletedAt: 'x', lines: [line({ vatCode: 'S_HIGH', unitAmount: 99900 })] }),
  ];
  const r = computeVatReturn(docs, quarterPeriod(2026, 1));

  it('fills the boxes', () => {
    expect(r.boxes['1a']).toEqual({ base: 100050, vat: 21011 });
    expect(r.boxes['1b']).toEqual({ base: 20000, vat: 1800 });
    expect(r.boxes['3b']).toEqual({ base: 50000, vat: 0 });
    expect(r.boxes['4b']).toEqual({ base: 10000, vat: 2100 });
    expect(r.boxes['4a']).toEqual({ base: 5000, vat: 1050 });
    expect(r.documentCount).toBe(3);
  });
  it('computes totals', () => {
    expect(r.outputVat).toBe(21011 + 1800 + 2100 + 1050);
    expect(r.inputVat).toBe(2100 + 2100 + 1050);
    expect(r.balance).toBe(r.outputVat - r.inputVat);
    expect(r.icpRequired).toBe(true);
  });
  it('rounds in whole euros', () => {
    expect(r.rounded.boxes['1a']).toEqual({ base: 1000, vat: 210 });
    expect(r.rounded.outputVat).toBe(210 + 18 + 21 + 10);
    expect(r.rounded.inputVat).toBe(53);
  });
});

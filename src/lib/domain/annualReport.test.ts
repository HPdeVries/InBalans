import { describe, expect, it } from 'vitest';
import { computeAnnualReport } from './annualReport';
import { doc, line } from './testUtil';
import type { Category, StockCount } from './types';

const meta = { createdAt: '', updatedAt: '', deletedAt: null };
const cats: Category[] = [
  { ...meta, id: 'rev', name: 'Omzet', kind: 'income', group: 'revenue', defaultVatCode: 'S_HIGH', archived: false },
  { ...meta, id: 'mat', name: 'Stoffen', kind: 'expense', group: 'costOfSales', defaultVatCode: 'P_HIGH', archived: false },
  { ...meta, id: 'rent', name: 'Huur', kind: 'expense', group: 'housing', defaultVatCode: 'P_HIGH', archived: false },
  { ...meta, id: 'inv', name: 'Investeringen', kind: 'asset', group: 'investment', defaultVatCode: 'P_HIGH', archived: false },
];
const stock = (year: number, value: number): StockCount => ({ ...meta, id: `s${year}`, year, value, note: '' });

describe('computeAnnualReport', () => {
  const r = computeAnnualReport({
    year: 2026,
    categories: cats,
    manualAssets: [],
    stockCounts: [stock(2025, 100000), stock(2026, 150000)],
    documents: [
      doc({ kind: 'sale', date: '2026-05-01', lines: [line({ categoryId: 'rev', vatCode: 'S_HIGH', unitAmount: 5000000 })] }),
      doc({ kind: 'purchase', date: '2026-06-01', lines: [
        line({ categoryId: 'mat', vatCode: 'P_HIGH', unitAmount: 1000000 }),
        line({ categoryId: 'rent', vatCode: 'P_NONE', unitAmount: 600000 }),
        line({ categoryId: 'inv', vatCode: 'P_HIGH', unitAmount: 240000, asset: { usefulLifeYears: 5, residualValue: 0, disposalDate: null } }),
      ] }),
      doc({ kind: 'sale', date: '2025-12-31', lines: [line({ categoryId: 'rev', unitAmount: 999 })] }),
    ],
  });

  it('computes profit', () => {
    expect(r.groupTotals.revenue).toBe(5000000);
    expect(r.stockChange).toBe(50000);
    expect(r.groupTotals.costOfSales).toBe(950000);
    expect(r.groupTotals.housing).toBe(600000);
    expect(r.depreciationTotal).toBe(28000); // 7 months of 48000/yr
    expect(r.investmentsTotal).toBe(240000);
    expect(r.profit).toBe(5000000 - 950000 - 600000 - 28000);
  });
});

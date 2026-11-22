import { describe, expect, it } from 'vitest';
import { accumulatedDepreciation, bookValue, depreciationForYear, disposalBookValue, type Asset } from './depreciation';

const asset: Asset = {
  id: 'a', source: 'manual', sourceId: 'a', description: 'Naaimachine',
  acquisitionDate: '2025-04-20', cost: 300000, residualValue: 0, usefulLifeYears: 5, disposalDate: null,
};

describe('depreciation', () => {
  it('is pro rata from the month of acquisition', () => {
    expect(depreciationForYear(asset, 2025)).toBe(45000); // 9 months of 60000/yr
    expect(depreciationForYear(asset, 2026)).toBe(60000);
    expect(depreciationForYear(asset, 2030)).toBe(15000);
    expect(depreciationForYear(asset, 2031)).toBe(0);
  });
  it('sums to depreciable amount', () => {
    let total = 0;
    for (let y = 2025; y <= 2031; y++) total += depreciationForYear({ ...asset, cost: 100001, residualValue: 1000 }, y);
    expect(total).toBe(99001);
  });
  it('book value and disposal', () => {
    expect(bookValue(asset, '2025-12-31')).toBe(255000);
    const sold = { ...asset, disposalDate: '2026-06-15' };
    expect(depreciationForYear(sold, 2026)).toBe(30000);
    expect(accumulatedDepreciation(sold, '2027-12-31')).toBe(75000);
    expect(disposalBookValue(sold, 2026)).toBe(225000);
    expect(bookValue(sold, '2026-12-31')).toBe(0);
  });
});

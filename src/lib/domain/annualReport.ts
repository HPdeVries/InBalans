import {
  assetsFromDocuments,
  assetsFromManual,
  bookValue,
  DEPRECIATION_THRESHOLD,
  depreciationForYear,
  disposalBookValue,
  type Asset,
} from './depreciation';
import type { Cents } from './money';
import { inPeriod, yearPeriod } from './period';
import type { BookDocument, Category, ManualAsset, ReportGroup, StockCount } from './types';
import { computeLine } from './vat';

export interface CategoryTotal {
  categoryId: string;
  name: string;
  group: ReportGroup;
  amount: Cents;
}

export interface AssetLine {
  asset: Asset;
  depreciation: Cents;
  bookValueStart: Cents;
  bookValueEnd: Cents;
  disposalBookValue: Cents;
}

export const INCOME_GROUPS: readonly ReportGroup[] = ['revenue', 'otherIncome'];
export const EXPENSE_GROUPS: readonly ReportGroup[] = [
  'costOfSales',
  'personnel',
  'transport',
  'housing',
  'maintenance',
  'salesCosts',
  'otherCosts',
  'interest',
];

export interface AnnualReport {
  year: number;
  income: CategoryTotal[];
  expenses: CategoryTotal[];
  /** Totals per report group, after stock adjustment for cost of sales. */
  groupTotals: Record<ReportGroup, Cents>;
  openingStock: Cents;
  closingStock: Cents;
  /** Closing minus opening stock; an increase lowers the cost of sales. */
  stockChange: Cents;
  closingStockMissing: boolean;
  assets: AssetLine[];
  depreciationTotal: Cents;
  disposalTotal: Cents;
  /** Investments acquired this year at or above the depreciation threshold. */
  investmentsTotal: Cents;
  totalIncome: Cents;
  totalExpenses: Cents;
  profit: Cents;
}

const UNKNOWN_CATEGORY = (kind: 'sale' | 'purchase'): Pick<Category, 'name' | 'group'> =>
  kind === 'sale'
    ? { name: '?', group: 'revenue' }
    : { name: '?', group: 'otherCosts' };

export function computeAnnualReport(input: {
  year: number;
  documents: BookDocument[];
  categories: Category[];
  manualAssets: ManualAsset[];
  stockCounts: StockCount[];
}): AnnualReport {
  const { year } = input;
  const period = yearPeriod(year);
  const categories = new Map(input.categories.map((c) => [c.id, c]));
  const incomeMap = new Map<string, CategoryTotal>();
  const expenseMap = new Map<string, CategoryTotal>();

  for (const doc of input.documents) {
    if (doc.deletedAt || !inPeriod(doc.date, period)) continue;
    for (const line of doc.lines) {
      if (line.asset) continue; // investments are depreciated, not expensed
      const cat = categories.get(line.categoryId) ?? UNKNOWN_CATEGORY(doc.kind);
      if (cat.group === 'investment') continue;
      const net = computeLine(line, doc.amountsInclVat, doc.date).net;
      const isIncome = INCOME_GROUPS.includes(cat.group);
      // A purchase in an income category (or vice versa) is treated as a correction of that category.
      const sign = (doc.kind === 'sale') === isIncome ? 1 : -1;
      const map = isIncome ? incomeMap : expenseMap;
      const entry = map.get(line.categoryId) ?? {
        categoryId: line.categoryId,
        name: cat.name,
        group: cat.group,
        amount: 0,
      };
      entry.amount += sign * net;
      map.set(line.categoryId, entry);
    }
  }

  const live = input.stockCounts.filter((s) => !s.deletedAt);
  const openingStock = live.find((s) => s.year === year - 1)?.value ?? 0;
  const closing = live.find((s) => s.year === year);
  const closingStock = closing?.value ?? openingStock;
  const stockChange = closingStock - openingStock;

  const allAssets = [
    ...assetsFromDocuments(input.documents),
    ...assetsFromManual(input.manualAssets),
  ];
  const yearStart = `${year - 1}-12-31`;
  const yearEnd = period.to;
  const assets: AssetLine[] = allAssets
    .filter((a) => a.acquisitionDate <= yearEnd)
    .map((asset) => ({
      asset,
      depreciation: depreciationForYear(asset, year),
      bookValueStart: bookValue(asset, yearStart),
      bookValueEnd: bookValue(asset, yearEnd),
      disposalBookValue: disposalBookValue(asset, year),
    }))
    .filter((l) => l.depreciation !== 0 || l.bookValueStart !== 0 || l.bookValueEnd !== 0 || l.disposalBookValue !== 0);

  const depreciationTotal = assets.reduce((s, l) => s + l.depreciation, 0);
  const disposalTotal = assets.reduce((s, l) => s + l.disposalBookValue, 0);
  const investmentsTotal = allAssets
    .filter((a) => inPeriod(a.acquisitionDate, period) && a.cost >= DEPRECIATION_THRESHOLD)
    .reduce((s, a) => s + a.cost, 0);

  const groupTotals = Object.fromEntries(
    [...INCOME_GROUPS, ...EXPENSE_GROUPS, 'investment'].map((g) => [g, 0]),
  ) as Record<ReportGroup, Cents>;
  for (const e of [...incomeMap.values(), ...expenseMap.values()]) groupTotals[e.group] += e.amount;
  groupTotals.costOfSales -= stockChange;

  const totalIncome = INCOME_GROUPS.reduce((s, g) => s + groupTotals[g], 0);
  const totalExpenses =
    EXPENSE_GROUPS.reduce((s, g) => s + groupTotals[g], 0) + depreciationTotal + disposalTotal;

  const byName = (a: CategoryTotal, b: CategoryTotal) => a.name.localeCompare(b.name, 'nl');
  return {
    year,
    income: [...incomeMap.values()].sort(byName),
    expenses: [...expenseMap.values()].sort(byName),
    groupTotals,
    openingStock,
    closingStock,
    stockChange,
    closingStockMissing: !closing,
    assets,
    depreciationTotal,
    disposalTotal,
    investmentsTotal,
    totalIncome,
    totalExpenses,
    profit: totalIncome - totalExpenses,
  };
}

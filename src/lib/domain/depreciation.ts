import { roundHalfAwayFromZero, type Cents } from './money';
import { monthsInclusive } from './period';
import type { BookDocument, IsoDate, ManualAsset } from './types';
import { computeLine } from './vat';

/** Investments below this amount (excl. VAT) may be expensed directly. */
export const DEPRECIATION_THRESHOLD: Cents = 45000;
/** Fiscal maximum depreciation is 20% per year, i.e. a minimum useful life of 5 years. */
export const MIN_USEFUL_LIFE_YEARS = 5;

/** Unified view of an asset, either derived from a purchase line or entered manually. */
export interface Asset {
  id: string;
  source: 'document' | 'manual';
  /** Document id or manual asset id. */
  sourceId: string;
  description: string;
  acquisitionDate: IsoDate;
  cost: Cents;
  residualValue: Cents;
  usefulLifeYears: number;
  disposalDate: IsoDate | null;
}

export function assetsFromDocuments(documents: BookDocument[]): Asset[] {
  const assets: Asset[] = [];
  for (const doc of documents) {
    if (doc.deletedAt || doc.kind !== 'purchase') continue;
    for (const line of doc.lines) {
      if (!line.asset) continue;
      const amounts = computeLine(line, doc.amountsInclVat, doc.date);
      assets.push({
        id: `${doc.id}:${line.id}`,
        source: 'document',
        sourceId: doc.id,
        description: line.description || doc.counterparty,
        acquisitionDate: doc.date,
        // Non-deductible VAT is part of the cost; amounts.net already reflects that.
        cost: amounts.net,
        residualValue: line.asset.residualValue,
        usefulLifeYears: line.asset.usefulLifeYears,
        disposalDate: line.asset.disposalDate,
      });
    }
  }
  return assets;
}

export function assetsFromManual(manual: ManualAsset[]): Asset[] {
  return manual
    .filter((m) => !m.deletedAt)
    .map((m) => ({
      id: m.id,
      source: 'manual' as const,
      sourceId: m.id,
      description: m.description,
      acquisitionDate: m.acquisitionDate,
      cost: m.cost,
      residualValue: m.residualValue,
      usefulLifeYears: m.usefulLifeYears,
      disposalDate: m.disposalDate,
    }));
}

/**
 * Straight-line depreciation, pro rata per month, starting in the month of acquisition.
 * Computed cumulatively so yearly amounts never drift due to rounding.
 */
export function accumulatedDepreciation(asset: Asset, upTo: IsoDate): Cents {
  const end = asset.disposalDate && asset.disposalDate < upTo ? asset.disposalDate : upTo;
  const totalMonths = Math.max(1, Math.round(asset.usefulLifeYears * 12));
  const months = Math.min(monthsInclusive(asset.acquisitionDate, end), totalMonths);
  const depreciable = asset.cost - asset.residualValue;
  return roundHalfAwayFromZero((depreciable * months) / totalMonths);
}

export function depreciationForYear(asset: Asset, year: number): Cents {
  return (
    accumulatedDepreciation(asset, `${year}-12-31`) - accumulatedDepreciation(asset, `${year - 1}-12-31`)
  );
}

/** Book value at a date; zero once the asset has been disposed of. */
export function bookValue(asset: Asset, at: IsoDate): Cents {
  if (asset.acquisitionDate > at) return 0;
  if (asset.disposalDate && asset.disposalDate <= at) return 0;
  return asset.cost - accumulatedDepreciation(asset, at);
}

/** Remaining book value written off when an asset is disposed of in the given year. */
export function disposalBookValue(asset: Asset, year: number): Cents {
  if (!asset.disposalDate || Number(asset.disposalDate.slice(0, 4)) !== year) return 0;
  return asset.cost - accumulatedDepreciation(asset, asset.disposalDate);
}

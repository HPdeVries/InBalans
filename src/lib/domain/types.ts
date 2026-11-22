import type { Cents } from './money';
import type { VatCode } from './vat';

/** ISO date string, "YYYY-MM-DD". */
export type IsoDate = string;
/** ISO timestamp string. */
export type IsoTimestamp = string;

/**
 * Metadata present on every synced record. Records are never hard-deleted
 * locally; `deletedAt` marks a tombstone so deletions can be synced later.
 */
export interface SyncMeta {
  id: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  deletedAt: IsoTimestamp | null;
}

export type DocumentKind = 'sale' | 'purchase';

/** Depreciation parameters for a purchase line booked as an investment (asset). */
export interface AssetParams {
  usefulLifeYears: number;
  residualValue: Cents;
  /** Date the asset was sold / discarded; depreciation stops after this month. */
  disposalDate: IsoDate | null;
}

export interface DocumentLine {
  id: string;
  description: string;
  categoryId: string;
  vatCode: VatCode;
  /** Quantity, defaults to 1. Prepared for future product sales. */
  quantity: number;
  /** Amount per unit as entered, either incl. or excl. VAT (see BookDocument.amountsInclVat). */
  unitAmount: Cents;
  /** Manually entered VAT amount for the whole line ("btw los opvoeren"); null = calculated. */
  vatOverride: Cents | null;
  /** Reserved for future product/stock management. */
  productId?: string | null;
  /** Present when the line is an investment that must be depreciated. */
  asset?: AssetParams | null;
}

/** A sales invoice or a purchase invoice/receipt. Credit notes use negative amounts. */
export interface BookDocument extends SyncMeta {
  kind: DocumentKind;
  date: IsoDate;
  /** Invoice number for sales, supplier reference for purchases. */
  number: string;
  counterparty: string;
  /** Customer/supplier VAT id, needed for intra-EU transactions. */
  counterpartyVatId: string;
  /** Whether entered line amounts include VAT. */
  amountsInclVat: boolean;
  lines: DocumentLine[];
  notes: string;
}

export type CategoryKind = 'income' | 'expense' | 'asset';

/**
 * Report groups follow the profit & loss headings of the Dutch income tax return
 * (winst-en-verliesrekening in de aangifte inkomstenbelasting).
 */
export type ReportGroup =
  | 'revenue'
  | 'otherIncome'
  | 'costOfSales'
  | 'personnel'
  | 'transport'
  | 'housing'
  | 'maintenance'
  | 'salesCosts'
  | 'otherCosts'
  | 'interest'
  | 'investment';

export interface Category extends SyncMeta {
  name: string;
  kind: CategoryKind;
  group: ReportGroup;
  defaultVatCode: VatCode;
  archived: boolean;
}

/** Asset not originating from a purchase in the app (e.g. bought before using InBalans). */
export interface ManualAsset extends SyncMeta {
  description: string;
  acquisitionDate: IsoDate;
  cost: Cents;
  residualValue: Cents;
  usefulLifeYears: number;
  disposalDate: IsoDate | null;
}

/** Year-end stock count of consumables / materials, entered manually. */
export interface StockCount extends SyncMeta {
  year: number;
  value: Cents;
  note: string;
}

export interface Settings extends SyncMeta {
  businessName: string;
  ownerName: string;
  address: string;
  kvkNumber: string;
  vatId: string;
  iban: string;
  email: string;
}

/** Reserved for future product sales with purchase/sales prices. Not used in the UI yet. */
export interface Product extends SyncMeta {
  name: string;
  sku: string;
  purchasePrice: Cents;
  salesPrice: Cents;
  vatCode: VatCode;
  trackStock: boolean;
}

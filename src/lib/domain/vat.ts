import { roundHalfAwayFromZero, type Cents } from './money';
import type { DocumentKind, DocumentLine, IsoDate } from './types';

/** Rates are expressed in basis points: 2100 = 21%. */
export type BasisPoints = number;
export type VatRateKind = 'high' | 'low' | 'zero' | 'none';

/** Boxes ("rubrieken") of the Dutch VAT return that hold amounts. */
export type VatBox = '1a' | '1b' | '1c' | '1d' | '1e' | '2a' | '3a' | '3b' | '3c' | '4a' | '4b';

/** Dutch VAT rate history, newest last. */
const RATE_HISTORY: Record<'high' | 'low', { from: IsoDate; rate: BasisPoints }[]> = {
  high: [
    { from: '1992-10-01', rate: 1750 },
    { from: '2001-01-01', rate: 1900 },
    { from: '2012-10-01', rate: 2100 },
  ],
  low: [
    { from: '1986-10-01', rate: 600 },
    { from: '2019-01-01', rate: 900 },
  ],
};

export function rateFor(kind: VatRateKind, date: IsoDate): BasisPoints {
  if (kind === 'zero' || kind === 'none') return 0;
  const history = RATE_HISTORY[kind];
  let rate = history[0].rate;
  for (const entry of history) if (entry.from <= date) rate = entry.rate;
  return rate;
}

export type VatCode =
  // Sales
  | 'S_HIGH'
  | 'S_LOW'
  | 'S_ZERO'
  | 'S_EXEMPT'
  | 'S_REVERSE_NL'
  | 'S_EU'
  | 'S_EXPORT'
  // Purchases
  | 'P_HIGH'
  | 'P_LOW'
  | 'P_NONE'
  | 'P_EU_HIGH'
  | 'P_EU_LOW'
  | 'P_NON_EU_HIGH'
  | 'P_NON_EU_LOW'
  | 'P_REVERSE_NL'
  | 'P_FOREIGN_VAT';

export interface VatCodeDef {
  code: VatCode;
  side: DocumentKind;
  rate: VatRateKind;
  /** VAT is charged on the invoice and part of the amount paid. */
  vatOnInvoice: boolean;
  /** VAT is self-assessed by the buyer (reverse charge / verlegd). */
  reverseCharge: boolean;
  /** Purchase VAT may be deducted (rubriek 5b). */
  deductible: boolean;
  /** Box where the base amount (and output/self-assessed VAT) is reported. */
  box: VatBox | null;
}

const defs: VatCodeDef[] = [
  { code: 'S_HIGH', side: 'sale', rate: 'high', vatOnInvoice: true, reverseCharge: false, deductible: false, box: '1a' },
  { code: 'S_LOW', side: 'sale', rate: 'low', vatOnInvoice: true, reverseCharge: false, deductible: false, box: '1b' },
  { code: 'S_ZERO', side: 'sale', rate: 'zero', vatOnInvoice: false, reverseCharge: false, deductible: false, box: '1e' },
  { code: 'S_EXEMPT', side: 'sale', rate: 'none', vatOnInvoice: false, reverseCharge: false, deductible: false, box: null },
  { code: 'S_REVERSE_NL', side: 'sale', rate: 'none', vatOnInvoice: false, reverseCharge: false, deductible: false, box: '1e' },
  { code: 'S_EU', side: 'sale', rate: 'none', vatOnInvoice: false, reverseCharge: false, deductible: false, box: '3b' },
  { code: 'S_EXPORT', side: 'sale', rate: 'none', vatOnInvoice: false, reverseCharge: false, deductible: false, box: '3a' },

  { code: 'P_HIGH', side: 'purchase', rate: 'high', vatOnInvoice: true, reverseCharge: false, deductible: true, box: null },
  { code: 'P_LOW', side: 'purchase', rate: 'low', vatOnInvoice: true, reverseCharge: false, deductible: true, box: null },
  { code: 'P_NONE', side: 'purchase', rate: 'none', vatOnInvoice: false, reverseCharge: false, deductible: false, box: null },
  { code: 'P_EU_HIGH', side: 'purchase', rate: 'high', vatOnInvoice: false, reverseCharge: true, deductible: true, box: '4b' },
  { code: 'P_EU_LOW', side: 'purchase', rate: 'low', vatOnInvoice: false, reverseCharge: true, deductible: true, box: '4b' },
  { code: 'P_NON_EU_HIGH', side: 'purchase', rate: 'high', vatOnInvoice: false, reverseCharge: true, deductible: true, box: '4a' },
  { code: 'P_NON_EU_LOW', side: 'purchase', rate: 'low', vatOnInvoice: false, reverseCharge: true, deductible: true, box: '4a' },
  { code: 'P_REVERSE_NL', side: 'purchase', rate: 'high', vatOnInvoice: false, reverseCharge: true, deductible: true, box: '2a' },
  // Foreign VAT (e.g. a hotel abroad) is not deductible in NL; the full amount is cost.
  { code: 'P_FOREIGN_VAT', side: 'purchase', rate: 'none', vatOnInvoice: false, reverseCharge: false, deductible: false, box: null },
];

export const VAT_CODES: Readonly<Record<VatCode, VatCodeDef>> = Object.fromEntries(
  defs.map((d) => [d.code, d]),
) as Record<VatCode, VatCodeDef>;

export function vatCodesFor(side: DocumentKind): VatCodeDef[] {
  return defs.filter((d) => d.side === side);
}

/** Whether a manual VAT amount makes sense for this code. */
export function hasVatAmount(code: VatCode): boolean {
  const def = VAT_CODES[code];
  return def.vatOnInvoice || def.reverseCharge;
}

export interface LineAmounts {
  /** Amount excluding VAT (the cost or revenue). */
  net: Cents;
  /** VAT amount: charged on invoice, or self-assessed for reverse charge. */
  vat: Cents;
  /** Amount actually paid / received for this line. */
  gross: Cents;
  rate: BasisPoints;
}

/** Calculate net/VAT/gross for one line. */
export function computeLine(
  line: Pick<DocumentLine, 'vatCode' | 'quantity' | 'unitAmount' | 'vatOverride'>,
  amountsInclVat: boolean,
  date: IsoDate,
): LineAmounts {
  const def = VAT_CODES[line.vatCode];
  const rate = rateFor(def.rate, date);
  const entered = roundHalfAwayFromZero((line.quantity ?? 1) * line.unitAmount);
  const override = line.vatOverride;

  if (def.vatOnInvoice) {
    if (amountsInclVat) {
      const vat = override ?? roundHalfAwayFromZero((entered * rate) / (10000 + rate));
      return { net: entered - vat, vat, gross: entered, rate };
    }
    const vat = override ?? roundHalfAwayFromZero((entered * rate) / 10000);
    return { net: entered, vat, gross: entered + vat, rate };
  }
  if (def.reverseCharge) {
    // No VAT on the invoice; buyer self-assesses VAT over the invoice amount.
    const vat = override ?? roundHalfAwayFromZero((entered * rate) / 10000);
    return { net: entered, vat, gross: entered, rate };
  }
  return { net: entered, vat: 0, gross: entered, rate };
}

export interface DocumentTotals {
  net: Cents;
  vat: Cents;
  gross: Cents;
}

export function computeDocumentTotals(doc: {
  lines: DocumentLine[];
  amountsInclVat: boolean;
  date: IsoDate;
}): DocumentTotals {
  const totals = { net: 0, vat: 0, gross: 0 };
  for (const line of doc.lines) {
    const a = computeLine(line, doc.amountsInclVat, doc.date);
    totals.net += a.net;
    // Self-assessed VAT is not part of what is paid; only show invoiced VAT here.
    if (VAT_CODES[line.vatCode].vatOnInvoice) totals.vat += a.vat;
    totals.gross += a.gross;
  }
  return totals;
}

import { ceilEuros, floorEuros, type Cents } from './money';
import { inPeriod, type Period } from './period';
import type { BookDocument } from './types';
import { computeLine, VAT_CODES, type VatBox } from './vat';

export interface BoxAmount {
  base: Cents;
  vat: Cents;
}

/** Boxes that only report a base amount (no VAT). */
export const BASE_ONLY_BOXES: readonly VatBox[] = ['1e', '3a', '3b', '3c'];
export const ALL_BOXES: readonly VatBox[] = ['1a', '1b', '1c', '1d', '1e', '2a', '3a', '3b', '3c', '4a', '4b'];

export interface VatReturn {
  period: Period;
  boxes: Record<VatBox, BoxAmount>;
  /** 5a: VAT owed (sum of VAT in 1 through 4). */
  outputVat: Cents;
  /** 5b: deductible input VAT (voorbelasting). */
  inputVat: Cents;
  /** 5c / 5g: to pay (positive) or to reclaim (negative). */
  balance: Cents;
  /** Same figures in whole euros, rounded the way the tax return expects. */
  rounded: {
    boxes: Record<VatBox, { base: number; vat: number }>;
    outputVat: number;
    inputVat: number;
    balance: number;
  };
  /** An ICP declaration (opgaaf intracommunautaire prestaties) is required. */
  icpRequired: boolean;
  documentCount: number;
}

function emptyBoxes(): Record<VatBox, BoxAmount> {
  return Object.fromEntries(ALL_BOXES.map((b) => [b, { base: 0, vat: 0 }])) as Record<
    VatBox,
    BoxAmount
  >;
}

export function computeVatReturn(documents: BookDocument[], period: Period): VatReturn {
  const boxes = emptyBoxes();
  let inputVat = 0;
  let documentCount = 0;

  for (const doc of documents) {
    if (doc.deletedAt || !inPeriod(doc.date, period)) continue;
    documentCount++;
    for (const line of doc.lines) {
      const def = VAT_CODES[line.vatCode];
      const amounts = computeLine(line, doc.amountsInclVat, doc.date);
      if (def.box) {
        boxes[def.box].base += amounts.net;
        if (!BASE_ONLY_BOXES.includes(def.box)) boxes[def.box].vat += amounts.vat;
      }
      if (def.side === 'purchase' && def.deductible) inputVat += amounts.vat;
    }
  }

  let outputVat = 0;
  for (const box of ALL_BOXES) outputVat += boxes[box].vat;

  // Tax return amounts are in whole euros: amounts owed rounded down, deductible VAT rounded up.
  const roundedBoxes = Object.fromEntries(
    ALL_BOXES.map((b) => [b, { base: floorEuros(boxes[b].base), vat: floorEuros(boxes[b].vat) }]),
  ) as Record<VatBox, { base: number; vat: number }>;
  const roundedOutput = ALL_BOXES.reduce((s, b) => s + roundedBoxes[b].vat, 0);
  const roundedInput = ceilEuros(inputVat);

  return {
    period,
    boxes,
    outputVat,
    inputVat,
    balance: outputVat - inputVat,
    rounded: {
      boxes: roundedBoxes,
      outputVat: roundedOutput,
      inputVat: roundedInput,
      balance: roundedOutput - roundedInput,
    },
    icpRequired: boxes['3b'].base !== 0,
    documentCount,
  };
}

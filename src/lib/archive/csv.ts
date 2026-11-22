import type { BookDocument, Category } from '../domain/types';
import { computeLine } from '../domain/vat';
import { t, type MessageKey } from '../i18n';

/** Amount for CSV: "1234,56" (Dutch decimal comma, no thousand separators). */
function amount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function cell(value: string | number): string {
  const s = String(value);
  return /[";\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const CSV_HEADER = [
  'Datum',
  'Soort',
  'Nummer',
  'Relatie',
  'Btw-id relatie',
  'Omschrijving',
  'Categorie',
  'Btw-behandeling',
  'Aantal',
  'Bedrag ingevoerd',
  'Ingevoerd incl. btw',
  'Netto',
  'Btw',
  'Bruto',
  'Notities',
];

/**
 * One row per booking line, semicolon separated with decimal commas so that
 * Dutch Excel opens it directly. Starts with a BOM for correct UTF-8 detection.
 */
export function bookingsCsv(documents: BookDocument[], categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const rows = [CSV_HEADER];
  const sorted = documents
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  for (const doc of sorted) {
    for (const line of doc.lines) {
      const a = computeLine(line, doc.amountsInclVat, doc.date);
      rows.push([
        doc.date,
        doc.kind === 'sale' ? t('doc.sale') : t('doc.purchase'),
        doc.number,
        doc.counterparty,
        doc.counterpartyVatId,
        line.description,
        names.get(line.categoryId) ?? '',
        t(`vat.${line.vatCode}` as MessageKey),
        String(line.quantity).replace('.', ','),
        amount(line.unitAmount),
        doc.amountsInclVat ? 'ja' : 'nee',
        amount(a.net),
        amount(a.vat),
        amount(a.gross),
        doc.notes,
      ]);
    }
  }
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

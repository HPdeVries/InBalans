import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildYearArchive } from './archive';
import { bookingsCsv } from './csv';
import { doc, line } from '../domain/testUtil';
import { defaultCategories } from '../db/seed';
import { emptySettings } from '../db/repo';

const documents = [
  doc({ kind: 'sale', date: '2026-02-03', number: '2026-001', counterparty: 'Anna; "de" Vries', amountsInclVat: true,
    lines: [line({ categoryId: 'cat-revenue', vatCode: 'S_HIGH', unitAmount: 242000, description: 'Bruidsjurk' })] }),
  doc({ kind: 'purchase', date: '2026-05-01', counterparty: 'Stoffen GmbH', counterpartyVatId: 'DE123',
    lines: [line({ categoryId: 'cat-materials', vatCode: 'P_EU_HIGH', unitAmount: 50000 })] }),
  doc({ kind: 'sale', date: '2025-12-31', lines: [line({ unitAmount: 100 })] }),
];

describe('bookingsCsv', () => {
  it('writes Dutch-Excel friendly CSV', () => {
    const csv = bookingsCsv(documents.slice(0, 2), defaultCategories());
    const rows = csv.replace('﻿', '').trim().split('\r\n');
    expect(rows).toHaveLength(3);
    expect(rows[0].startsWith('Datum;Soort')).toBe(true);
    expect(rows[1]).toContain('"Anna; ""de"" Vries"');
    expect(rows[1]).toContain(';2000,00;420,00;2420,00;');
    expect(rows[2]).toContain('Inkoop EU, verlegd 21%');
  });
});

describe('buildYearArchive', () => {
  it('contains all reports for the year', () => {
    const zip = buildYearArchive({
      year: 2026,
      documents,
      categories: defaultCategories(),
      manualAssets: [],
      stockCounts: [],
      settings: { ...emptySettings(), businessName: 'Atelier', lockedThrough: '2026-03-31' },
      backup: { format: 'inbalans-backup', version: 1, exportedAt: '', data: {} as never },
      printedOn: '2027-01-15',
    });
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      '01-jaaroverzicht-2026.pdf',
      '02-btw-aangifte-2026-Q1.pdf',
      '02-btw-aangifte-2026-Q2.pdf',
      '02-btw-aangifte-2026-Q3.pdf',
      '02-btw-aangifte-2026-Q4.pdf',
      '03-boekingen-2026.pdf',
      '04-boekingen-2026.csv',
      '05-inbalans-gegevens.json',
      'LEESMIJ.txt',
    ]);
    expect(strFromU8(files['01-jaaroverzicht-2026.pdf'].slice(0, 5))).toBe('%PDF-');
    // Only bookings of 2026 in the CSV
    expect(strFromU8(files['04-boekingen-2026.csv']).trim().split('\r\n')).toHaveLength(3);
    expect(strFromU8(files['LEESMIJ.txt'])).toContain('7 jaar');
  });
});

import { strToU8, zipSync } from 'fflate';
import { computeAnnualReport } from '../domain/annualReport';
import { isLocked } from '../domain/locking';
import { quarterPeriod, yearPeriod, inPeriod } from '../domain/period';
import type { BookDocument, Category, ManualAsset, Settings, StockCount } from '../domain/types';
import { computeVatReturn } from '../domain/vatReturn';
import type { Backup } from '../db/backup';
import { t } from '../i18n';
import { bookingsCsv } from './csv';
import { annualReportPdf, bookingsPdf, vatReturnPdf, type ReportContext } from './pdf';

export interface ArchiveInput {
  year: number;
  documents: BookDocument[];
  categories: Category[];
  manualAssets: ManualAsset[];
  stockCounts: StockCount[];
  settings: Settings;
  /** Full backup of all data, included so the archive can be restored into InBalans. */
  backup: Backup;
  printedOn: string;
}

export function archiveFileName(year: number): string {
  return `inbalans-jaararchief-${year}.zip`;
}

/** Build the yearly archive as a zip file (all generated on the device). */
export function buildYearArchive(input: ArchiveInput): Uint8Array {
  const { year } = input;
  const ctx: ReportContext = { settings: input.settings, printedOn: input.printedOn };
  const docsInYear = input.documents.filter((d) => !d.deletedAt && inPeriod(d.date, yearPeriod(year)));
  const files: Record<string, Uint8Array> = {};

  const annual = computeAnnualReport({ ...input, documents: input.documents });
  files[`01-jaaroverzicht-${year}.pdf`] = annualReportPdf(annual, ctx);
  for (const q of [1, 2, 3, 4]) {
    const period = quarterPeriod(year, q);
    const locked = isLocked(period.to, input.settings.lockedThrough);
    files[`02-btw-aangifte-${year}-Q${q}.pdf`] = vatReturnPdf(computeVatReturn(docsInYear, period), year, q, locked, ctx);
  }
  files[`03-boekingen-${year}.pdf`] = bookingsPdf(docsInYear, input.categories, year, ctx);
  files[`04-boekingen-${year}.csv`] = strToU8(bookingsCsv(docsInYear, input.categories));
  files[`05-inbalans-gegevens.json`] = strToU8(JSON.stringify(input.backup, null, 2));
  files['LEESMIJ.txt'] = strToU8(t('archive.readme', { year, date: input.printedOn }).replaceAll('\n', '\r\n'));

  return zipSync(files, { level: 6 });
}

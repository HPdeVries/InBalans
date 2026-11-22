import { jsPDF } from 'jspdf';
import { autoTable, type RowInput, type CellInput } from 'jspdf-autotable';
import type { AnnualReport } from '../domain/annualReport';
import { EXPENSE_GROUPS, INCOME_GROUPS } from '../domain/annualReport';
import { formatMoney, formatWholeEuros } from '../domain/money';
import type { BookDocument, Category, ReportGroup, Settings } from '../domain/types';
import { computeLine, VAT_CODES, type VatBox } from '../domain/vat';
import { BASE_ONLY_BOXES, type VatReturn } from '../domain/vatReturn';
import { formatDate, t, type MessageKey } from '../i18n';

const MARGIN = 15;
const ACCENT: [number, number, number] = [176, 58, 102];
const MUTED: [number, number, number] = [102, 112, 133];
const SECTION_FILL: [number, number, number] = [245, 246, 248];

export interface ReportContext {
  settings: Settings;
  /** Date shown as "afgedrukt op". */
  printedOn: string;
}

/** New A4 document with the business header; returns the y position below the header. */
function startDocument(title: string, subtitle: string, ctx: ReportContext, orientation: 'p' | 'l' = 'p') {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const s = ctx.settings;
  const details = [
    s.ownerName,
    s.address,
    s.kvkNumber && `${t('settings.kvk')} ${s.kvkNumber}`,
    s.vatId && `${t('settings.vatId')} ${s.vatId}`,
  ].filter(Boolean) as string[];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(s.businessName || s.ownerName || t('app.name'), MARGIN, MARGIN + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  details.forEach((d, i) => doc.text(d, MARGIN, MARGIN + 9 + i * 4));
  doc.text(t('print.printedOn', { date: formatDate(ctx.printedOn) }), width - MARGIN, MARGIN + 4, { align: 'right' });
  doc.text(t('print.generatedBy'), width - MARGIN, MARGIN + 8, { align: 'right' });

  let y = MARGIN + 9 + Math.max(details.length, 1) * 4 + 2;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, width - MARGIN, y);
  y += 10;
  doc.setTextColor(16, 24, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(title, MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(subtitle, MARGIN, y);
  doc.setTextColor(16, 24, 40);
  return { doc, y: y + 6 };
}

/** "Pagina x van y" on every page. */
function finish(doc: jsPDF): Uint8Array {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text(t('archive.page', { page: i, pages }), w - MARGIN, h - 8, { align: 'right' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

const baseTable = {
  margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 15 },
  theme: 'plain' as const,
  styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: [234, 236, 240] as [number, number, number], lineWidth: { bottom: 0.2 } },
  headStyles: { fontStyle: 'bold' as const, fontSize: 7.5, textColor: MUTED, fillColor: SECTION_FILL },
};

const section = (label: string, colSpan: number): RowInput => [
  { content: label, colSpan, styles: { fontStyle: 'bold', fillColor: SECTION_FILL } },
];
const right = (content: string, bold = false): CellInput => ({ content, styles: { halign: 'right', fontStyle: bold ? 'bold' : 'normal' } });

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function note(doc: jsPDF, text: string, y: number): number {
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - 2 * MARGIN);
  if (y + lines.length * 4 > doc.internal.pageSize.getHeight() - 15) {
    doc.addPage();
    y = MARGIN + 4;
  }
  doc.text(lines, MARGIN, y);
  doc.setTextColor(16, 24, 40);
  return y + lines.length * 4 + 2;
}

const euros = (n: number) => `€ ${formatWholeEuros(n)}`;

export function vatReturnPdf(r: VatReturn, year: number, quarter: number, locked: boolean, ctx: ReportContext): Uint8Array {
  const { doc, y } = startDocument(
    `${t('vatReturn.title')} Q${quarter} ${year}`,
    `${formatDate(r.period.from)} – ${formatDate(r.period.to)} · ${t('vatReturn.documents', { count: r.documentCount })} · ${locked ? t('archive.periodLocked') : t('archive.periodOpen')}`,
    ctx,
  );
  const sections: { title: MessageKey; boxes: VatBox[] }[] = [
    { title: 'vatReturn.section1', boxes: ['1a', '1b', '1c', '1d', '1e'] },
    { title: 'vatReturn.section2', boxes: ['2a'] },
    { title: 'vatReturn.section3', boxes: ['3a', '3b', '3c'] },
    { title: 'vatReturn.section4', boxes: ['4a', '4b'] },
  ];
  const body: RowInput[] = [];
  for (const s of sections) {
    body.push(section(t(s.title), 5));
    for (const box of s.boxes) {
      const baseOnly = BASE_ONLY_BOXES.includes(box);
      body.push([
        { content: box, styles: { fontStyle: 'bold' } },
        t(`vatReturn.${box}` as MessageKey),
        right(euros(r.rounded.boxes[box].base)),
        right(baseOnly ? '' : euros(r.rounded.boxes[box].vat)),
        { content: formatMoney(r.boxes[box].base) + (baseOnly ? '' : ` / ${formatMoney(r.boxes[box].vat)}`), styles: { halign: 'right', textColor: MUTED, fontSize: 8 } },
      ]);
    }
  }
  body.push(section(t('vatReturn.section5'), 5));
  body.push([{ content: '5a', styles: { fontStyle: 'bold' } }, t('vatReturn.5a'), '', right(euros(r.rounded.outputVat)), right(formatMoney(r.outputVat))]);
  body.push([{ content: '5b', styles: { fontStyle: 'bold' } }, t('vatReturn.5b'), '', right(euros(r.rounded.inputVat)), right(formatMoney(r.inputVat))]);
  body.push([
    { content: '5c', styles: { fontStyle: 'bold' } },
    { content: `${t('vatReturn.5c')} — ${r.rounded.balance >= 0 ? t('vatReturn.toPay') : t('vatReturn.toReclaim')}`, styles: { fontStyle: 'bold' } },
    '',
    right(euros(Math.abs(r.rounded.balance)), true),
    right(formatMoney(r.balance), true),
  ]);

  autoTable(doc, {
    ...baseTable,
    startY: y,
    head: [[t('vatReturn.box'), '', right(t('vatReturn.base')), right(t('vatReturn.vat')), right(t('vatReturn.exact'))]],
    body,
    columnStyles: { 0: { cellWidth: 17 }, 2: { cellWidth: 24 }, 3: { cellWidth: 22 }, 4: { cellWidth: 40 } },
  });
  let ny = lastY(doc) + 6;
  if (r.icpRequired) ny = note(doc, t('vatReturn.icp'), ny);
  note(doc, t('vatReturn.rounding'), ny);
  return finish(doc);
}

export function annualReportPdf(r: AnnualReport, ctx: ReportContext): Uint8Array {
  const { doc, y } = startDocument(
    `${t('annual.title')} ${r.year}`,
    `${formatDate(`${r.year}-01-01`)} – ${formatDate(`${r.year}-12-31`)}`,
    ctx,
  );
  const group = (g: ReportGroup) => t(`annual.group.${g}` as MessageKey);
  const lines = (g: ReportGroup) => [...r.income, ...r.expenses].filter((c) => c.group === g);
  const detail = (label: string, value: number): RowInput => [
    { content: label, styles: { textColor: MUTED, cellPadding: { left: 6, top: 1.2, bottom: 1.2, right: 2 } } },
    { content: formatMoney(value), styles: { halign: 'right', textColor: MUTED } },
  ];
  const sub = (label: string, value: number): RowInput => [{ content: label, styles: { fontStyle: 'bold' } }, right(formatMoney(value), true)];

  const body: RowInput[] = [section(t('annual.income'), 2)];
  for (const g of INCOME_GROUPS) {
    for (const c of lines(g)) body.push(detail(c.name, c.amount));
    body.push(sub(group(g), r.groupTotals[g]));
  }
  body.push(sub(`${t('common.total')} ${t('annual.income').toLowerCase()}`, r.totalIncome));
  body.push(section(t('annual.expenses'), 2));
  for (const g of EXPENSE_GROUPS) {
    const ls = lines(g);
    const stock = g === 'costOfSales' && r.stockChange !== 0;
    if (!ls.length && !stock && r.groupTotals[g] === 0) continue;
    for (const c of ls) body.push(detail(c.name, c.amount));
    if (stock) body.push(detail(t('annual.stockChange'), -r.stockChange));
    body.push(sub(group(g), r.groupTotals[g]));
  }
  if (r.depreciationTotal) body.push(sub(t('annual.depreciationTotal'), r.depreciationTotal));
  if (r.disposalTotal) body.push(sub(t('annual.disposal'), r.disposalTotal));
  body.push(sub(`${t('common.total')} ${t('annual.expenses').toLowerCase()}`, r.totalExpenses));
  body.push([
    { content: `${r.profit >= 0 ? t('annual.profit') : t('annual.loss')} ${r.year}`, styles: { fontStyle: 'bold', fontSize: 11, textColor: ACCENT } },
    { content: formatMoney(r.profit), styles: { halign: 'right', fontStyle: 'bold', fontSize: 11, textColor: ACCENT } },
  ]);
  autoTable(doc, { ...baseTable, startY: y, body, columnStyles: { 1: { cellWidth: 40 } } });

  autoTable(doc, {
    ...baseTable,
    startY: lastY(doc) + 8,
    head: [[t('annual.stock'), right('')]],
    body: [
      [t('annual.openingStock'), right(formatMoney(r.openingStock))],
      [t('annual.closingStock') + (r.closingStockMissing ? ` (${t('archive.notEntered')})` : ''), right(formatMoney(r.closingStock))],
      [t('annual.investments'), right(formatMoney(r.investmentsTotal))],
    ],
    columnStyles: { 1: { cellWidth: 40 } },
  });

  if (r.assets.length) {
    autoTable(doc, {
      ...baseTable,
      startY: lastY(doc) + 8,
      head: [[t('annual.asset'), right(t('annual.bookValueStart')), right(t('annual.depreciation')), right(t('annual.bookValueEnd'))]],
      body: r.assets.map((l) => [
        `${l.asset.description} (${formatDate(l.asset.acquisitionDate)})`,
        right(formatMoney(l.bookValueStart)),
        right(formatMoney(l.depreciation)),
        right(formatMoney(l.bookValueEnd)),
      ]),
    });
  }
  let ny = lastY(doc) + 6;
  if (r.investmentsTotal) ny = note(doc, t('annual.kiaHint'), ny);
  note(doc, t('annual.notes'), ny);
  return finish(doc);
}

export function bookingsPdf(documents: BookDocument[], categories: Category[], year: number, ctx: ReportContext): Uint8Array {
  const { doc, y } = startDocument(`${t('archive.bookingsTitle')} ${year}`, `${formatDate(`${year}-01-01`)} – ${formatDate(`${year}-12-31`)}`, ctx, 'l');
  const names = new Map(categories.map((c) => [c.id, c.name]));
  let startY = y;
  let hasReverse = false;
  for (const kind of ['sale', 'purchase'] as const) {
    const docs = documents
      .filter((d) => !d.deletedAt && d.kind === kind)
      .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
    const totals = { net: 0, vat: 0, gross: 0 };
    const body: RowInput[] = [];
    for (const d of docs) {
      d.lines.forEach((line, i) => {
        const a = computeLine(line, d.amountsInclVat, d.date);
        // Reverse-charged VAT is not on the invoice: show it in brackets, outside the totals.
        const reverse = VAT_CODES[line.vatCode].reverseCharge;
        if (reverse) hasReverse = true;
        totals.net += a.net;
        if (!reverse) totals.vat += a.vat;
        totals.gross += a.gross;
        body.push([
          i === 0 ? formatDate(d.date) : '',
          i === 0 ? d.number : '',
          i === 0 ? d.counterparty : '',
          line.description,
          names.get(line.categoryId) ?? '',
          t(`vat.${line.vatCode}` as MessageKey),
          right(formatMoney(a.net)),
          reverse ? { content: `(${formatMoney(a.vat)})`, styles: { halign: 'right', textColor: MUTED } } : right(formatMoney(a.vat)),
          right(formatMoney(a.gross)),
        ]);
      });
    }
    body.push([
      { content: t('common.total'), colSpan: 6, styles: { fontStyle: 'bold' } },
      right(formatMoney(totals.net), true),
      right(formatMoney(totals.vat), true),
      right(formatMoney(totals.gross), true),
    ]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(kind === 'sale' ? t('nav.sales') : t('nav.purchases'), MARGIN, startY + 4);
    autoTable(doc, {
      ...baseTable,
      startY: startY + 7,
      styles: { ...baseTable.styles, fontSize: 8 },
      head: [[
        t('common.date'), t('archive.number'), t('archive.counterparty'), t('common.description'), t('doc.category'), t('doc.vatCode'),
        right(t('common.net')), right(t('common.vat')), right(t('common.total')),
      ]],
      body,
      columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 20 }, 6: { cellWidth: 24 }, 7: { cellWidth: 22 }, 8: { cellWidth: 24 } },
    });
    startY = lastY(doc) + 10;
  }
  if (hasReverse) note(doc, t('archive.reverseChargeNote'), startY - 4);
  return finish(doc);
}

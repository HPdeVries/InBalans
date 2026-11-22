import type { Category, CategoryKind, ReportGroup } from '../domain/types';
import type { VatCode } from '../domain/vat';

const EPOCH = '2026-01-01T00:00:00.000Z';

/**
 * Default categories. Ids are stable so that seeded records from different
 * devices are the same record when syncing.
 */
export function defaultCategories(): Category[] {
  const c = (
    id: string,
    name: string,
    kind: CategoryKind,
    group: ReportGroup,
    defaultVatCode: VatCode,
  ): Category => ({
    id: `cat-${id}`,
    name,
    kind,
    group,
    defaultVatCode,
    archived: false,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    deletedAt: null,
  });
  return [
    c('revenue', 'Omzet', 'income', 'revenue', 'S_HIGH'),
    c('other-income', 'Overige opbrengsten', 'income', 'otherIncome', 'S_HIGH'),
    c('materials', 'Stoffen en fournituren', 'expense', 'costOfSales', 'P_HIGH'),
    c('goods', 'Inkoop handelsgoederen', 'expense', 'costOfSales', 'P_HIGH'),
    c('outsourcing', 'Uitbesteed werk', 'expense', 'costOfSales', 'P_HIGH'),
    c('rent', 'Huur', 'expense', 'housing', 'P_HIGH'),
    c('energy', 'Gas, water en licht', 'expense', 'housing', 'P_HIGH'),
    c('maintenance', 'Onderhoud en reparaties', 'expense', 'maintenance', 'P_HIGH'),
    c('transport', 'Vervoerskosten', 'expense', 'transport', 'P_HIGH'),
    c('marketing', 'Reclame en website', 'expense', 'salesCosts', 'P_HIGH'),
    c('small-equipment', 'Klein inventaris (< € 450)', 'expense', 'otherCosts', 'P_HIGH'),
    c('office', 'Kantoorkosten', 'expense', 'otherCosts', 'P_HIGH'),
    c('telecom', 'Telefoon en internet', 'expense', 'otherCosts', 'P_HIGH'),
    c('software', 'Software en abonnementen', 'expense', 'otherCosts', 'P_HIGH'),
    c('insurance', 'Verzekeringen', 'expense', 'otherCosts', 'P_NONE'),
    c('education', 'Opleiding en vakliteratuur', 'expense', 'otherCosts', 'P_HIGH'),
    c('bank', 'Bankkosten', 'expense', 'otherCosts', 'P_NONE'),
    c('other-costs', 'Overige kosten', 'expense', 'otherCosts', 'P_HIGH'),
    c('interest', 'Rente', 'expense', 'interest', 'P_NONE'),
    c('investment', 'Investeringen (inventaris, machines)', 'asset', 'investment', 'P_HIGH'),
  ];
}

import type { CategoryKind, ReportGroup } from '../domain/types';
import { EXPENSE_GROUPS, INCOME_GROUPS } from '../domain/annualReport';

export const GROUPS_BY_KIND: Record<CategoryKind, readonly ReportGroup[]> = {
  income: INCOME_GROUPS,
  expense: EXPENSE_GROUPS,
  asset: ['investment'],
};

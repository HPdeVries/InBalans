import type { BookDocument, DocumentLine } from './types';

let n = 0;
export function line(partial: Partial<DocumentLine>): DocumentLine {
  return {
    id: `l${++n}`,
    description: '',
    categoryId: 'cat',
    vatCode: 'S_HIGH',
    quantity: 1,
    unitAmount: 0,
    vatOverride: null,
    ...partial,
  };
}

export function doc(partial: Partial<BookDocument>): BookDocument {
  return {
    id: `d${++n}`,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    kind: 'sale',
    date: '2026-02-01',
    number: '',
    counterparty: '',
    counterpartyVatId: '',
    amountsInclVat: false,
    lines: [],
    notes: '',
    ...partial,
  };
}

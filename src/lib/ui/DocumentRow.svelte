<script lang="ts">
  import ReceiptEuro from '@lucide/svelte/icons/receipt-euro';
  import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import type { BookDocument } from '../domain/types';
  import { computeDocumentTotals } from '../domain/vat';
  import { formatMoney } from '../domain/money';
  import { formatDate } from '../i18n';

  let { doc, categoryName }: { doc: BookDocument; categoryName?: (id: string) => string | undefined } = $props();

  const totals = $derived(computeDocumentTotals(doc));
  const first = $derived(doc.lines[0]);
  const title = $derived(doc.counterparty || first?.description || doc.number || '—');
  const detail = $derived.by(() => {
    const parts: string[] = [];
    const what = first?.description && first.description !== title ? first.description : categoryName?.(first?.categoryId ?? '');
    if (what) parts.push(what + (doc.lines.length > 1 ? ` +${doc.lines.length - 1}` : ''));
    if (doc.number) parts.push(doc.number);
    return parts.join(' · ');
  });
</script>

<a class="row" href={`#/documents/${doc.id}`}>
  <span class="tile" class:sale={doc.kind === 'sale'}>
    {#if doc.kind === 'sale'}<ReceiptEuro size={18} />{:else}<ShoppingBag size={18} />{/if}
  </span>
  <span class="main">
    <span class="title">{title}</span>
    <span class="detail">{detail}</span>
  </span>
  <span class="right">
    <span class="amount" class:sale={doc.kind === 'sale'}>{formatMoney(totals.gross)}</span>
    <span class="date">{formatDate(doc.date)}</span>
  </span>
  <ChevronRight size={16} class="chev" />
</a>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    color: var(--text);
    text-decoration: none;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .row:last-child {
    border-bottom: 0;
  }
  .row:hover {
    background: var(--surface-2);
  }
  .tile {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--info-soft);
    color: var(--info);
    flex-shrink: 0;
  }
  .tile.sale {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .main,
  .right {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .main {
    flex: 1;
  }
  .title {
    font-weight: 550;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .detail,
  .date {
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .right {
    align-items: flex-end;
  }
  .amount {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .row :global(.chev) {
    color: var(--border-strong);
    flex-shrink: 0;
  }
</style>

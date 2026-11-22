<script lang="ts">
  import { documents, categories } from '../db/stores';
  import type { DocumentKind } from '../domain/types';
  import { computeDocumentTotals } from '../domain/vat';
  import { formatMoney } from '../domain/money';
  import { quarterOf } from '../domain/period';
  import { formatDate, t } from '../i18n';
  import { availableYears } from '../ui/years';

  let { kind }: { kind: DocumentKind } = $props();

  let year = $state<number | 'all'>(new Date().getFullYear());
  let search = $state('');

  const years = $derived(availableYears($documents));
  const categoryNames = $derived(new Map($categories.map((c) => [c.id, c.name])));

  const rows = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return $documents
      .filter((d) => d.kind === kind)
      .filter((d) => year === 'all' || d.date.startsWith(`${year}-`))
      .filter(
        (d) =>
          !q ||
          [d.counterparty, d.number, d.notes, ...d.lines.map((l) => l.description)]
            .join(' ')
            .toLowerCase()
            .includes(q),
      )
      .map((d) => ({ doc: d, totals: computeDocumentTotals(d) }));
  });

  const sumTotals = $derived(
    rows.reduce(
      (s, r) => ({ net: s.net + r.totals.net, vat: s.vat + r.totals.vat, gross: s.gross + r.totals.gross }),
      { net: 0, vat: 0, gross: 0 },
    ),
  );

  function summary(d: (typeof rows)[number]['doc']): string {
    const first = d.lines[0];
    if (!first) return '';
    return first.description || categoryNames.get(first.categoryId) || '';
  }
</script>

<div class="page-header">
  <h1>{kind === 'sale' ? t('nav.sales') : t('nav.purchases')}</h1>
  <a class="button primary" href={`#/documents/new?kind=${kind}`}>
    + {kind === 'sale' ? t('doc.newSale') : t('doc.newPurchase')}
  </a>
</div>

<div class="filters">
  <select bind:value={year} aria-label={t('common.year')}>
    {#each years as y}<option value={y}>{y}</option>{/each}
    <option value="all">{t('doc.allYears')}</option>
  </select>
  <input type="search" placeholder={t('common.search')} bind:value={search} />
</div>

{#if rows.length === 0}
  <p class="muted">{t('doc.list.empty')}</p>
{:else}
  <div class="card table-wrap">
    <table>
      <thead>
        <tr>
          <th>{t('common.date')}</th>
          <th class="hide-sm">{kind === 'sale' ? t('doc.numberSale') : t('doc.numberPurchase')}</th>
          <th>{kind === 'sale' ? t('doc.customer') : t('doc.supplier')}</th>
          <th class="num hide-sm">{t('common.exclVat')}</th>
          <th class="num hide-sm">{t('common.vat')}</th>
          <th class="num">{t('common.total')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as { doc, totals }, i (doc.id)}
          {#if i === 0 || quarterOf(rows[i - 1].doc.date) !== quarterOf(doc.date) || rows[i - 1].doc.date.slice(0, 4) !== doc.date.slice(0, 4)}
            <tr class="quarter"><td colspan="6">Q{quarterOf(doc.date)} {doc.date.slice(0, 4)}</td></tr>
          {/if}
          <tr class="clickable" onclick={() => (location.hash = `/documents/${doc.id}`)}>
            <td class="nowrap">{formatDate(doc.date)}</td>
            <td class="hide-sm">{doc.number}</td>
            <td>
              <div>{doc.counterparty}</div>
              <div class="muted small">{summary(doc)}{doc.lines.length > 1 ? ` (+${doc.lines.length - 1})` : ''}</div>
            </td>
            <td class="num hide-sm">{formatMoney(totals.net)}</td>
            <td class="num hide-sm">{formatMoney(totals.vat)}</td>
            <td class="num">{formatMoney(totals.gross)}</td>
          </tr>
        {/each}
        <tr class="total">
          <td>{t('common.total')}</td>
          <td class="hide-sm"></td>
          <td></td>
          <td class="num hide-sm">{formatMoney(sumTotals.net)}</td>
          <td class="num hide-sm">{formatMoney(sumTotals.vat)}</td>
          <td class="num">{formatMoney(sumTotals.gross)}</td>
        </tr>
      </tbody>
    </table>
  </div>
{/if}

<style>
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .filters select {
    width: auto;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover {
    background: var(--hover);
  }
  .nowrap {
    white-space: nowrap;
  }
  .quarter td {
    background: var(--hover);
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--muted);
  }
  @media (max-width: 600px) {
    .hide-sm {
      display: none;
    }
  }
</style>

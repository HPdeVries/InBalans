<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import Search from '@lucide/svelte/icons/search';
  import Inbox from '@lucide/svelte/icons/inbox';
  import { documents, categories } from '../db/stores';
  import type { BookDocument, DocumentKind } from '../domain/types';
  import { computeDocumentTotals } from '../domain/vat';
  import { formatMoney } from '../domain/money';
  import { quarterOf } from '../domain/period';
  import { t } from '../i18n';
  import { availableYears } from '../ui/years';
  import PageHeader from '../ui/PageHeader.svelte';
  import DocumentRow from '../ui/DocumentRow.svelte';

  let { kind }: { kind: DocumentKind } = $props();

  let year = $state<number | 'all'>(new Date().getFullYear());
  let search = $state('');

  const years = $derived(availableYears($documents));
  const categoryNames = $derived(new Map($categories.map((c) => [c.id, c.name])));

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return $documents
      .filter((d) => d.kind === kind)
      .filter((d) => year === 'all' || d.date.startsWith(`${year}-`))
      .filter(
        (d) =>
          !q ||
          [d.counterparty, d.number, d.notes, ...d.lines.map((l) => l.description)].join(' ').toLowerCase().includes(q),
      );
  });

  const groups = $derived.by(() => {
    const map = new Map<string, BookDocument[]>();
    for (const d of filtered) {
      const key = `Q${quarterOf(d.date)} ${d.date.slice(0, 4)}`;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return [...map.entries()];
  });

  const totals = $derived(
    filtered.reduce(
      (s, d) => {
        const x = computeDocumentTotals(d);
        return { net: s.net + x.net, vat: s.vat + x.vat, gross: s.gross + x.gross };
      },
      { net: 0, vat: 0, gross: 0 },
    ),
  );
</script>

<PageHeader title={kind === 'sale' ? t('nav.sales') : t('nav.purchases')}>
  {#snippet actions()}
    <a class="button primary" href={`#/documents/new?kind=${kind}`}>
      <Plus size={18} />{kind === 'sale' ? t('doc.newSale') : t('doc.newPurchase')}
    </a>
  {/snippet}
</PageHeader>

<div class="summary">
  <div><span class="label">{t('common.exclVat')}</span><span class="value">{formatMoney(totals.net)}</span></div>
  <div><span class="label">{t('common.vat')}</span><span class="value">{formatMoney(totals.vat)}</span></div>
  <div><span class="label">{t('common.total')} · {t('doc.count', { count: filtered.length })}</span><span class="value">{formatMoney(totals.gross)}</span></div>
</div>

<div class="filters">
  <select bind:value={year} aria-label={t('common.year')}>
    {#each years as y}<option value={y}>{y}</option>{/each}
    <option value="all">{t('doc.allYears')}</option>
  </select>
  <div class="search">
    <Search size={18} />
    <input type="search" placeholder={t('common.search')} bind:value={search} />
  </div>
</div>

{#if filtered.length === 0}
  <div class="card empty-state">
    <div class="empty-icon"><Inbox size={26} /></div>
    <h2>{t('doc.list.emptyTitle')}</h2>
    <p>{t('doc.list.empty')}</p>
    <a class="button primary" href={`#/documents/new?kind=${kind}`}>
      <Plus size={18} />{kind === 'sale' ? t('doc.newSale') : t('doc.newPurchase')}
    </a>
  </div>
{:else}
  {#each groups as [label, docs] (label)}
    <h3 class="group">{label}</h3>
    <section class="card flush">
      {#each docs as doc (doc.id)}
        <DocumentRow {doc} categoryName={(id) => categoryNames.get(id)} />
      {/each}
    </section>
  {/each}
{/if}

<style>
  .summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    margin-bottom: 16px;
  }
  .summary > div {
    display: flex;
    flex-direction: column;
    padding: 14px 18px;
    border-left: 1px solid var(--border);
    min-width: 0;
  }
  .summary > div:first-child {
    border-left: 0;
  }
  .summary .label {
    font-size: 0.8rem;
    color: var(--muted);
    font-weight: 500;
  }
  .summary .value {
    font-size: 1.15rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .filters select {
    width: auto;
  }
  .search {
    position: relative;
    flex: 1;
  }
  .search :global(svg) {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    pointer-events: none;
  }
  .search input {
    padding-left: 38px;
  }
  .group {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin: 20px 4px 8px;
  }
  @media (max-width: 600px) {
    .summary > div {
      padding: 10px 12px;
    }
    .summary .value {
      font-size: 0.95rem;
    }
    .summary .label {
      font-size: 0.72rem;
    }
  }
</style>

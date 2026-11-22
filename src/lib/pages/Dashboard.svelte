<script lang="ts">
  import { documents, categories, manualAssets, stockCounts } from '../db/stores';
  import { computeVatReturn } from '../domain/vatReturn';
  import { computeAnnualReport } from '../domain/annualReport';
  import { computeDocumentTotals } from '../domain/vat';
  import { quarterOf, quarterPeriod, today } from '../domain/period';
  import { formatMoney } from '../domain/money';
  import { formatDate, t } from '../i18n';

  const now = today();
  const year = Number(now.slice(0, 4));
  const quarter = quarterOf(now);

  const vat = $derived(computeVatReturn($documents, quarterPeriod(year, quarter)));
  const report = $derived(
    computeAnnualReport({
      year,
      documents: $documents,
      categories: $categories,
      manualAssets: $manualAssets,
      stockCounts: $stockCounts,
    }),
  );
  const recent = $derived(
    [...$documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8),
  );
</script>

<div class="page-header">
  <h1>{t('nav.dashboard')}</h1>
  <div class="toolbar">
    <a class="button primary" href="#/documents/new?kind=sale">+ {t('dashboard.newSale')}</a>
    <a class="button primary" href="#/documents/new?kind=purchase">+ {t('dashboard.newPurchase')}</a>
  </div>
</div>

{#if $documents.length === 0}
  <p class="notice">{t('dashboard.welcome')}</p>
{/if}

<div class="grid">
  <a class="card stat" href="#/vat">
    <div class="muted small">{t('dashboard.vatThisQuarter')} · Q{quarter} {year}</div>
    <div class="big">{formatMoney(Math.abs(vat.balance))}</div>
    <div class="small">{vat.balance >= 0 ? t('dashboard.toPay') : t('dashboard.toReclaim')}</div>
  </a>
  <a class="card stat" href="#/annual">
    <div class="muted small">{t('dashboard.revenue')} · {year}</div>
    <div class="big">{formatMoney(report.totalIncome)}</div>
    <div class="small muted">{t('dashboard.costs')}: {formatMoney(report.totalExpenses)}</div>
  </a>
  <a class="card stat" href="#/annual">
    <div class="muted small">{t('dashboard.profit')} · {year}</div>
    <div class="big" class:negative={report.profit < 0}>{formatMoney(report.profit)}</div>
    <div class="small muted">{t('dashboard.yearToDate')}</div>
  </a>
</div>

{#if recent.length}
  <section class="card">
    <h2>{t('dashboard.recent')}</h2>
    <table>
      <tbody>
        {#each recent as doc (doc.id)}
          <tr class="clickable" onclick={() => (location.hash = `/documents/${doc.id}`)}>
            <td class="muted small">{formatDate(doc.date)}</td>
            <td>
              <span class="tag" class:sale={doc.kind === 'sale'}>{doc.kind === 'sale' ? t('doc.sale') : t('doc.purchase')}</span>
              {doc.counterparty || doc.lines[0]?.description || doc.number}
            </td>
            <td class="num">{formatMoney(computeDocumentTotals(doc).gross)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .stat {
    color: inherit;
    text-decoration: none;
  }
  .stat:hover {
    border-color: var(--accent);
  }
  .big {
    font-size: 1.8rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin: 4px 0;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover {
    background: var(--hover);
  }
  .tag {
    display: inline-block;
    font-size: 0.75rem;
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--hover);
    margin-right: 6px;
  }
  .tag.sale {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>

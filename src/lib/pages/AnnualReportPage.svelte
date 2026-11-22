<script lang="ts">
  import { documents, categories, manualAssets, stockCounts } from '../db/stores';
  import { computeAnnualReport, EXPENSE_GROUPS, INCOME_GROUPS } from '../domain/annualReport';
  import { formatMoney } from '../domain/money';
  import type { ReportGroup } from '../domain/types';
  import { formatDate, t, type MessageKey } from '../i18n';
  import { availableYears } from '../ui/years';

  let year = $state(new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0));
  const years = $derived(availableYears($documents));

  const r = $derived(
    computeAnnualReport({
      year,
      documents: $documents,
      categories: $categories,
      manualAssets: $manualAssets,
      stockCounts: $stockCounts,
    }),
  );

  const groupLabel = (g: ReportGroup) => t(`annual.group.${g}` as MessageKey);
  const linesFor = (g: ReportGroup) => [...r.income, ...r.expenses].filter((c) => c.group === g);
</script>

<div class="page-header">
  <div>
    <h1>{t('annual.title')}</h1>
    <p class="muted">{t('annual.intro')}</p>
  </div>
  <div class="toolbar">
    <select bind:value={year} aria-label={t('common.year')}>
      {#each years as y}<option value={y}>{y}</option>{/each}
    </select>
    <button type="button" onclick={() => window.print()}>{t('common.print')}</button>
  </div>
</div>

{#if r.closingStockMissing}
  <p class="notice">{t('annual.stockMissing')} <a href="#/stock">{t('nav.stock')}</a></p>
{/if}

<section class="card table-wrap">
  <table>
    <tbody>
      <tr class="section"><td colspan="2">{t('annual.income')}</td></tr>
      {#each INCOME_GROUPS as g}
        {#each linesFor(g) as c}
          <tr class="detail"><td>{c.name}</td><td class="num">{formatMoney(c.amount)}</td></tr>
        {/each}
        <tr class="subtotal"><td>{groupLabel(g)}</td><td class="num">{formatMoney(r.groupTotals[g])}</td></tr>
      {/each}
      <tr class="subtotal"><td>{t('common.total')} {t('annual.income').toLowerCase()}</td><td class="num">{formatMoney(r.totalIncome)}</td></tr>

      <tr class="section"><td colspan="2">{t('annual.expenses')}</td></tr>
      {#each EXPENSE_GROUPS as g}
        {#if r.groupTotals[g] !== 0 || linesFor(g).length || (g === 'costOfSales' && r.stockChange !== 0)}
          {#each linesFor(g) as c}
            <tr class="detail"><td>{c.name}</td><td class="num">{formatMoney(c.amount)}</td></tr>
          {/each}
          {#if g === 'costOfSales' && r.stockChange !== 0}
            <tr class="detail"><td>{t('annual.stockChange')}</td><td class="num">{formatMoney(-r.stockChange)}</td></tr>
          {/if}
          <tr class="subtotal"><td>{groupLabel(g)}</td><td class="num">{formatMoney(r.groupTotals[g])}</td></tr>
        {/if}
      {/each}
      {#if r.depreciationTotal}
        <tr class="subtotal"><td>{t('annual.depreciationTotal')}</td><td class="num">{formatMoney(r.depreciationTotal)}</td></tr>
      {/if}
      {#if r.disposalTotal}
        <tr class="subtotal"><td>{t('annual.disposal')}</td><td class="num">{formatMoney(r.disposalTotal)}</td></tr>
      {/if}
      <tr class="subtotal"><td>{t('common.total')} {t('annual.expenses').toLowerCase()}</td><td class="num">{formatMoney(r.totalExpenses)}</td></tr>

      <tr class="total">
        <td>{r.profit >= 0 ? t('annual.profit') : t('annual.loss')} {year}</td>
        <td class="num">{formatMoney(r.profit)}</td>
      </tr>
    </tbody>
  </table>
</section>

<div class="grid">
  <section class="card">
    <h2>{t('annual.stock')}</h2>
    <table>
      <tbody>
        <tr><td>{t('annual.openingStock')}</td><td class="num">{formatMoney(r.openingStock)}</td></tr>
        <tr><td>{t('annual.closingStock')}</td><td class="num">{formatMoney(r.closingStock)}</td></tr>
      </tbody>
    </table>
  </section>
  <section class="card">
    <h2>{t('annual.investments')}</h2>
    <p class="big">{formatMoney(r.investmentsTotal)}</p>
    <p class="small muted">{t('annual.kiaHint')}</p>
  </section>
</div>

{#if r.assets.length}
  <section class="card table-wrap">
    <h2>{t('annual.assets')}</h2>
    <table>
      <thead>
        <tr>
          <th>{t('annual.asset')}</th>
          <th class="num">{t('annual.bookValueStart')}</th>
          <th class="num">{t('annual.depreciation')}</th>
          <th class="num">{t('annual.bookValueEnd')}</th>
        </tr>
      </thead>
      <tbody>
        {#each r.assets as l (l.asset.id)}
          <tr>
            <td>{l.asset.description} <span class="small muted">{formatDate(l.asset.acquisitionDate)}</span></td>
            <td class="num">{formatMoney(l.bookValueStart)}</td>
            <td class="num">{formatMoney(l.depreciation)}</td>
            <td class="num">{formatMoney(l.bookValueEnd)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<p class="small muted">{t('annual.notes')}</p>

<style>
  select {
    width: auto;
  }
  .section td {
    background: var(--hover);
    font-weight: 700;
  }
  .detail td:first-child {
    padding-left: 20px;
    color: var(--muted);
  }
  .detail td {
    border-bottom: 0;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .big {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 8px;
  }
</style>

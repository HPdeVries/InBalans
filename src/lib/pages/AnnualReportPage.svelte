<script lang="ts">
  import { documents, categories, manualAssets, stockCounts } from '../db/stores';
  import { computeAnnualReport, EXPENSE_GROUPS, INCOME_GROUPS } from '../domain/annualReport';
  import { formatMoney } from '../domain/money';
  import type { ReportGroup } from '../domain/types';
  import { formatDate, t, type MessageKey } from '../i18n';
  import { availableYears } from '../ui/years';
  import PageHeader from '../ui/PageHeader.svelte';
  import Printer from '@lucide/svelte/icons/printer';
  import Info from '@lucide/svelte/icons/info';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

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

<PageHeader title={t('annual.title')} subtitle={t('annual.intro')}>
  {#snippet actions()}
    <select bind:value={year} aria-label={t('common.year')}>
      {#each years as y}<option value={y}>{y}</option>{/each}
    </select>
    <button type="button" class="icon-button" title={t('common.print')} aria-label={t('common.print')} onclick={() => window.print()}><Printer size={18} /></button>
  {/snippet}
</PageHeader>

<div class="kpis">
  <div class="card kpi"><span class="label">{t('annual.income')}</span><strong>{formatMoney(r.totalIncome)}</strong></div>
  <div class="card kpi"><span class="label">{t('annual.expenses')}</span><strong>{formatMoney(r.totalExpenses)}</strong></div>
  <div class="card kpi highlight"><span class="label">{r.profit >= 0 ? t('annual.profit') : t('annual.loss')} {year}</span><strong>{formatMoney(r.profit)}</strong></div>
</div>

{#if r.closingStockMissing}
  <p class="notice"><TriangleAlert size={16} /><span>{t('annual.stockMissing')} <a href="#/stock">{t('nav.stock')} →</a></span></p>
{/if}

<section class="card flush table-wrap">
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
  <section class="card flush table-wrap">
    <h2 class="pad">{t('annual.assets')}</h2>
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

<p class="notice info small"><Info size={16} />{t('annual.notes')}</p>

<style>
  .kpis {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    margin: 0;
  }
  .kpi .label {
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 500;
  }
  .kpi strong {
    font-size: 1.5rem;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .kpi.highlight {
    background: var(--accent-soft);
    border-color: transparent;
  }
  .kpi.highlight strong {
    color: var(--accent);
  }
  .pad {
    padding: 16px 16px 4px;
  }
  .section td {
    background: var(--surface-2);
    font-weight: 700;
  }
  @media (max-width: 600px) {
    .kpis {
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .kpi.highlight {
      grid-column: 1 / -1;
    }
    .kpi strong {
      font-size: 1.2rem;
    }
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

<script lang="ts">
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import TrendingDown from '@lucide/svelte/icons/trending-down';
  import Wallet from '@lucide/svelte/icons/wallet';
  import Percent from '@lucide/svelte/icons/percent';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { documents, categories, manualAssets, stockCounts, settings } from '../db/stores';
  import { computeVatReturn } from '../domain/vatReturn';
  import { computeAnnualReport } from '../domain/annualReport';
  import { quarterOf, quarterPeriod, today } from '../domain/period';
  import { formatMoney } from '../domain/money';
  import { formatDate, t } from '../i18n';
  import PageHeader from '../ui/PageHeader.svelte';
  import QuickAddOptions from '../ui/QuickAddOptions.svelte';
  import DocumentRow from '../ui/DocumentRow.svelte';

  const now = today();
  const year = Number(now.slice(0, 4));
  const quarter = quarterOf(now);
  // VAT return is due at the end of the month following the quarter.
  const due = new Date(year, quarter * 3 + 1, 0);
  const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'dashboard.greetingMorning' : hour < 18 ? 'dashboard.greetingAfternoon' : 'dashboard.greetingEvening');
  const firstName = $derived($settings.ownerName.split(' ')[0]);

  const vat = $derived(computeVatReturn($documents, quarterPeriod(year, quarter)));
  const report = $derived(
    computeAnnualReport({ year, documents: $documents, categories: $categories, manualAssets: $manualAssets, stockCounts: $stockCounts }),
  );
  const categoryNames = $derived(new Map($categories.map((c) => [c.id, c.name])));
  const recent = $derived([...$documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6));
</script>

<PageHeader title={firstName ? `${greeting}, ${firstName}` : greeting} subtitle={t('dashboard.subtitle')} />

{#if $documents.length === 0}
  <section class="card welcome">
    <div class="welcome-icon"><Sparkles size={22} /></div>
    <h2>{t('dashboard.welcomeTitle')}</h2>
    <p class="muted">{t('dashboard.welcome')}</p>
    <QuickAddOptions />
  </section>
{/if}

<div class="stats">
  <a class="card stat" href="#/vat">
    <span class="stat-icon vat"><Percent size={18} /></span>
    <span class="label">{t('dashboard.nextVat', { quarter, year })} · {t('dashboard.soFar')}</span>
    <span class="value">{formatMoney(Math.abs(vat.balance))}</span>
    <span class="badge" class:negative={vat.balance > 0} class:positive={vat.balance < 0}>
      {vat.balance >= 0 ? t('dashboard.toPay') : t('dashboard.toReclaim')}
    </span>
    <span class="foot">{t('dashboard.dueBefore', { date: formatDate(dueIso) })}</span>
  </a>
  <a class="card stat" href="#/annual">
    <span class="stat-icon revenue"><TrendingUp size={18} /></span>
    <span class="label">{t('dashboard.revenue')} {year}</span>
    <span class="value">{formatMoney(report.totalIncome)}</span>
    <span class="foot">{t('common.exclVat')}</span>
  </a>
  <a class="card stat" href="#/annual">
    <span class="stat-icon costs"><TrendingDown size={18} /></span>
    <span class="label">{t('dashboard.costs')} {year}</span>
    <span class="value">{formatMoney(report.totalExpenses)}</span>
    <span class="foot">{t('common.exclVat')}</span>
  </a>
  <a class="card stat" href="#/annual">
    <span class="stat-icon profit"><Wallet size={18} /></span>
    <span class="label">{t('dashboard.profit')} {year}</span>
    <span class="value" class:negative={report.profit < 0}>{formatMoney(report.profit)}</span>
    <span class="foot">{t('dashboard.yearToDate')}</span>
  </a>
</div>

{#if recent.length}
  <section class="card flush">
    <div class="card-header pad">
      <h2>{t('dashboard.recent')}</h2>
    </div>
    {#each recent as doc (doc.id)}
      <DocumentRow {doc} categoryName={(id) => categoryNames.get(id)} />
    {/each}
  </section>
{/if}

<style>
  .welcome {
    padding: 24px;
  }
  .welcome-icon {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    margin-bottom: 12px;
  }
  .welcome :global(.options) {
    max-width: 480px;
    margin: 0 -12px;
  }
  .stats {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(4, 1fr);
    margin-bottom: 16px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin: 0;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .stat:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow);
  }
  .stat-icon {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    margin-bottom: 8px;
  }
  .stat-icon.vat {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .stat-icon.revenue,
  .stat-icon.profit {
    background: var(--positive-soft);
    color: var(--positive);
  }
  .stat-icon.costs {
    background: var(--info-soft);
    color: var(--info);
  }
  .label {
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 500;
  }
  .value {
    font-size: 1.6rem;
    font-weight: 650;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .foot {
    font-size: 0.8rem;
    color: var(--muted);
    margin-top: auto;
  }
  .pad {
    padding: 16px 16px 0;
    margin-bottom: 8px;
  }
  @media (max-width: 1200px) {
    .stats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 520px) {
    .stats {
      gap: 10px;
    }
    .stat {
      padding: 14px;
    }
    .stat:first-child {
      grid-column: 1 / -1;
    }
    .value {
      font-size: 1.25rem;
    }
    .stat-icon {
      width: 32px;
      height: 32px;
    }
  }
</style>

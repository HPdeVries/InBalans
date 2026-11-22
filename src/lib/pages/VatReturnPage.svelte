<script lang="ts">
  import { documents, settings } from '../db/stores';
  import { updateSettings } from '../db/repo';
  import { downloadBlob } from '../db/backup';
  import { lockDateAfterReopen, quarterLockState } from '../domain/locking';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import FileDown from '@lucide/svelte/icons/file-down';
  import { computeVatReturn, BASE_ONLY_BOXES } from '../domain/vatReturn';
  import { quarterOf, quarterPeriod, today } from '../domain/period';
  import { formatMoney, formatWholeEuros } from '../domain/money';
  import type { VatBox } from '../domain/vat';
  import { formatDate, t, type MessageKey } from '../i18n';
  import { availableYears } from '../ui/years';
  import PageHeader from '../ui/PageHeader.svelte';
  import PrintHeader from '../ui/PrintHeader.svelte';
  import Printer from '@lucide/svelte/icons/printer';
  import Info from '@lucide/svelte/icons/info';
  import CalendarRange from '@lucide/svelte/icons/calendar-range';

  // Default to the most recent quarter that has ended (the one you file now).
  const now = today();
  const currentQuarter = quarterOf(now);
  let year = $state(Number(now.slice(0, 4)) - (currentQuarter === 1 ? 1 : 0));
  let quarter = $state(currentQuarter === 1 ? 4 : currentQuarter - 1);

  const years = $derived(availableYears($documents));
  const period = $derived(quarterPeriod(year, quarter));
  const r = $derived(computeVatReturn($documents, period));
  const lockState = $derived(quarterLockState(year, quarter, $settings.lockedThrough, now));

  async function lockQuarter() {
    if (!confirm(t('lock.lockConfirm', { quarter, year, date: formatDate(period.to) }))) return;
    await updateSettings({ lockedThrough: period.to });
  }

  async function reopenQuarter() {
    if (!confirm(t('lock.reopenConfirm', { quarter, year }))) return;
    await updateSettings({ lockedThrough: lockDateAfterReopen(year, quarter) });
  }

  async function downloadPdf() {
    // Loaded on demand: the PDF library is only needed here.
    const { vatReturnPdf } = await import('../archive/pdf');
    const bytes = vatReturnPdf(r, year, quarter, lockState === 'locked', { settings: $settings, printedOn: now });
    downloadBlob(`btw-aangifte-${year}-Q${quarter}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  }

  const sections: { title: MessageKey; boxes: VatBox[] }[] = [
    { title: 'vatReturn.section1', boxes: ['1a', '1b', '1c', '1d', '1e'] },
    { title: 'vatReturn.section2', boxes: ['2a'] },
    { title: 'vatReturn.section3', boxes: ['3a', '3b', '3c'] },
    { title: 'vatReturn.section4', boxes: ['4a', '4b'] },
  ];
</script>

<PrintHeader title={`${t('vatReturn.title')} Q${quarter} ${year}`} />

<PageHeader title={t('vatReturn.title')} subtitle={t('vatReturn.intro')}>
  {#snippet actions()}
    <select bind:value={year} aria-label={t('common.year')}>
      {#each years as y}<option value={y}>{y}</option>{/each}
    </select>
    <div class="segmented" role="group" aria-label={t('common.quarter')}>
      {#each [1, 2, 3, 4] as q}
        <button type="button" class:selected={quarter === q} onclick={() => (quarter = q)}>Q{q}</button>
      {/each}
    </div>
    <button type="button" class="icon-button" title={t('lock.downloadPdf')} aria-label={t('lock.downloadPdf')} onclick={downloadPdf}><FileDown size={18} /></button>
    <button type="button" class="icon-button" title={t('common.print')} aria-label={t('common.print')} onclick={() => window.print()}><Printer size={18} /></button>
  {/snippet}
</PageHeader>

<div class="result card" class:pay={r.rounded.balance >= 0}>
  <div>
    <div class="period"><CalendarRange size={16} />{formatDate(period.from)} – {formatDate(period.to)}</div>
    <div class="muted small">{t('vatReturn.documents', { count: r.documentCount })}</div>
  </div>
  <div class="result-amount">
    <span class="badge" class:negative={r.rounded.balance > 0} class:positive={r.rounded.balance < 0}>
      {r.rounded.balance >= 0 ? t('vatReturn.toPay') : t('vatReturn.toReclaim')}
    </span>
    <strong>€ {formatWholeEuros(Math.abs(r.rounded.balance))}</strong>
  </div>
</div>

<div class="card lock no-print" class:locked={lockState === 'locked'}>
  <span class="lock-icon">{#if lockState === 'locked'}<Lock size={18} />{:else}<LockOpen size={18} />{/if}</span>
  <div class="lock-text">
    {#if lockState === 'locked'}
      <strong>{t('lock.lockedBadge')}</strong>
      <span class="muted small">{t('lock.lockedInfo', { date: formatDate($settings.lockedThrough ?? period.to) })}</span>
    {:else if lockState === 'lockable'}
      <strong>{t('lock.lockTitle')}</strong>
      <span class="muted small">{t('lock.lockIntro')}</span>
    {:else}
      <strong>{t('lock.openBadge')}</strong>
      <span class="muted small">{t('lock.notEnded', { date: formatDate(period.to) })}</span>
    {/if}
  </div>
  {#if lockState === 'locked'}
    <button type="button" class="ghost" onclick={reopenQuarter}>{t('lock.reopenButton')}</button>
  {:else if lockState === 'lockable'}
    <button type="button" class="primary" onclick={lockQuarter}><Lock size={16} />{t('lock.lockButton', { quarter, year })}</button>
  {/if}
</div>

{#if r.icpRequired}<p class="notice info"><Info size={16} />{t('vatReturn.icp')}</p>{/if}

<div class="card flush table-wrap">
  <table>
    <thead>
      <tr>
        <th>{t('vatReturn.box')}</th>
        <th class="num">{t('vatReturn.base')}</th>
        <th class="num">{t('vatReturn.vat')}</th>
        <th class="num hide-sm">{t('vatReturn.exact')}</th>
      </tr>
    </thead>
    <tbody>
      {#each sections as section}
        <tr class="section"><td colspan="4">{t(section.title)}</td></tr>
        {#each section.boxes as box}
          {@const has = r.boxes[box].base !== 0 || r.boxes[box].vat !== 0}
          <tr class:empty={!has}>
            <td><strong>{box}</strong> <span class="small">{t(`vatReturn.${box}` as MessageKey)}</span></td>
            <td class="num">€ {formatWholeEuros(r.rounded.boxes[box].base)}</td>
            <td class="num">{BASE_ONLY_BOXES.includes(box) ? '' : `€ ${formatWholeEuros(r.rounded.boxes[box].vat)}`}</td>
            <td class="num small muted hide-sm">
              {formatMoney(r.boxes[box].base)}{BASE_ONLY_BOXES.includes(box) ? '' : ` / ${formatMoney(r.boxes[box].vat)}`}
            </td>
          </tr>
        {/each}
      {/each}
      <tr class="section"><td colspan="4">{t('vatReturn.section5')}</td></tr>
      <tr>
        <td><strong>5a</strong> <span class="small">{t('vatReturn.5a')}</span></td>
        <td></td>
        <td class="num">€ {formatWholeEuros(r.rounded.outputVat)}</td>
        <td class="num small muted hide-sm">{formatMoney(r.outputVat)}</td>
      </tr>
      <tr>
        <td><strong>5b</strong> <span class="small">{t('vatReturn.5b')}</span></td>
        <td></td>
        <td class="num">€ {formatWholeEuros(r.rounded.inputVat)}</td>
        <td class="num small muted hide-sm">{formatMoney(r.inputVat)}</td>
      </tr>
      <tr class="total">
        <td>
          <strong>5c</strong> {t('vatReturn.5c')} —
          <span class={r.rounded.balance >= 0 ? 'negative' : 'positive'}>
            {r.rounded.balance >= 0 ? t('vatReturn.toPay') : t('vatReturn.toReclaim')}
          </span>
        </td>
        <td></td>
        <td class="num">€ {formatWholeEuros(Math.abs(r.rounded.balance))}</td>
        <td class="num small muted hide-sm">{formatMoney(r.balance)}</td>
      </tr>
    </tbody>
  </table>
</div>

<p class="small muted"><Info size={14} /> {t('vatReturn.rounding')}</p>

<style>
  .lock {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 14px;
  }
  .lock-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--hover);
    color: var(--muted);
    flex-shrink: 0;
  }
  .lock.locked .lock-icon {
    background: var(--positive-soft);
    color: var(--positive);
  }
  .lock-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 220px;
  }
  .result {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .period {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .result-amount {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .result-amount strong {
    font-size: 1.6rem;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .section td {
    background: var(--surface-2);
    font-weight: 600;
    font-size: 0.85rem;
  }
  tr.empty {
    color: var(--muted);
  }
  @media (max-width: 600px) {
    .hide-sm {
      display: none;
    }
  }
</style>

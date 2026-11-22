<script lang="ts">
  import { documents } from '../db/stores';
  import { computeVatReturn, BASE_ONLY_BOXES } from '../domain/vatReturn';
  import { quarterOf, quarterPeriod, today } from '../domain/period';
  import { formatMoney, formatWholeEuros } from '../domain/money';
  import type { VatBox } from '../domain/vat';
  import { formatDate, t, type MessageKey } from '../i18n';
  import { availableYears } from '../ui/years';

  // Default to the most recent quarter that has ended (the one you file now).
  const now = today();
  const currentQuarter = quarterOf(now);
  let year = $state(Number(now.slice(0, 4)) - (currentQuarter === 1 ? 1 : 0));
  let quarter = $state(currentQuarter === 1 ? 4 : currentQuarter - 1);

  const years = $derived(availableYears($documents));
  const period = $derived(quarterPeriod(year, quarter));
  const r = $derived(computeVatReturn($documents, period));

  const sections: { title: MessageKey; boxes: VatBox[] }[] = [
    { title: 'vatReturn.section1', boxes: ['1a', '1b', '1c', '1d', '1e'] },
    { title: 'vatReturn.section2', boxes: ['2a'] },
    { title: 'vatReturn.section3', boxes: ['3a', '3b', '3c'] },
    { title: 'vatReturn.section4', boxes: ['4a', '4b'] },
  ];
</script>

<div class="page-header">
  <div>
    <h1>{t('vatReturn.title')}</h1>
    <p class="muted">{t('vatReturn.intro')}</p>
  </div>
  <div class="toolbar">
    <select bind:value={year} aria-label={t('common.year')} class="year">
      {#each years as y}<option value={y}>{y}</option>{/each}
    </select>
    <div class="segmented" role="group" aria-label={t('common.quarter')}>
      {#each [1, 2, 3, 4] as q}
        <button type="button" class:selected={quarter === q} onclick={() => (quarter = q)}>Q{q}</button>
      {/each}
    </div>
    <button type="button" onclick={() => window.print()}>{t('common.print')}</button>
  </div>
</div>

<p class="muted small">
  {formatDate(period.from)} – {formatDate(period.to)} · {t('vatReturn.documents', { count: r.documentCount })}
</p>

{#if r.icpRequired}<p class="notice">{t('vatReturn.icp')}</p>{/if}

<div class="card table-wrap">
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

<p class="small muted">{t('vatReturn.rounding')}</p>

<style>
  .year {
    width: auto;
  }
  .section td {
    background: var(--hover);
    font-weight: 600;
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

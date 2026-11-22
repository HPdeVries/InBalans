<script lang="ts">
  import { documents, manualAssets } from '../db/stores';
  import { create, remove, save } from '../db/repo';
  import {
    assetsFromDocuments,
    assetsFromManual,
    bookValue,
    depreciationForYear,
    MIN_USEFUL_LIFE_YEARS,
  } from '../domain/depreciation';
  import { formatMoney } from '../domain/money';
  import { today } from '../domain/period';
  import type { ManualAsset } from '../domain/types';
  import { formatDate, t } from '../i18n';
  import { availableYears } from '../ui/years';
  import MoneyInput from '../ui/MoneyInput.svelte';
  import PageHeader from '../ui/PageHeader.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Layers from '@lucide/svelte/icons/layers';

  let year = $state(new Date().getFullYear());
  const years = $derived(availableYears($documents));
  const assets = $derived(
    [...assetsFromDocuments($documents), ...assetsFromManual($manualAssets)].sort((a, b) =>
      b.acquisitionDate.localeCompare(a.acquisitionDate),
    ),
  );

  let editing = $state<ManualAsset | null>(null);

  function startNew() {
    editing = create<ManualAsset>({
      description: '',
      acquisitionDate: today(),
      cost: 0,
      residualValue: 0,
      usefulLifeYears: MIN_USEFUL_LIFE_YEARS,
      disposalDate: null,
    });
  }

  function edit(id: string) {
    const found = $manualAssets.find((m) => m.id === id);
    if (found) editing = structuredClone($state.snapshot(found));
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!editing || !editing.description || !editing.acquisitionDate) return;
    await save('manualAssets', editing);
    editing = null;
  }

  async function del() {
    if (!editing || !confirm(t('common.confirmDelete'))) return;
    await remove('manualAssets', editing.id);
    editing = null;
  }
</script>

<PageHeader title={t('assets.title')} subtitle={t('assets.intro')}>
  {#snippet actions()}
    <select bind:value={year} aria-label={t('common.year')}>
      {#each years as y}<option value={y}>{y}</option>{/each}
    </select>
    <button type="button" onclick={startNew}><Plus size={18} />{t('assets.add')}</button>
  {/snippet}
</PageHeader>

{#if editing}
  <form class="card" onsubmit={submit}>
    <div class="form-grid">
      <label>{t('common.description')}<input bind:value={editing.description} required /></label>
      <label>{t('assets.acquisitionDate')}<input type="date" bind:value={editing.acquisitionDate} required /></label>
      <label>{t('assets.cost')}<MoneyInput bind:value={editing.cost} /></label>
      <label>{t('doc.assetResidual')}<MoneyInput bind:value={editing.residualValue} /></label>
      <label>{t('doc.assetLife')}<input type="number" min="1" step="1" bind:value={editing.usefulLifeYears} /></label>
      <label>
        {t('doc.assetDisposal')}
        <input type="date" value={editing.disposalDate ?? ''} onchange={(e) => (editing!.disposalDate = e.currentTarget.value || null)} />
      </label>
    </div>
    <div class="actions">
      <button type="submit" class="primary">{t('common.save')}</button>
      <button type="button" onclick={() => (editing = null)}>{t('common.cancel')}</button>
      {#if $manualAssets.some((m) => m.id === editing!.id)}
        <button type="button" class="danger" onclick={del}>{t('common.delete')}</button>
      {/if}
    </div>
  </form>
{/if}

{#if assets.length === 0}
  <div class="card empty-state">
    <div class="empty-icon"><Layers size={26} /></div>
    <p>{t('common.none')}</p>
  </div>
{:else}
  <div class="card flush table-wrap">
    <table>
      <thead>
        <tr>
          <th>{t('common.description')}</th>
          <th class="num">{t('assets.cost')}</th>
          <th class="num">{t('assets.depreciationYear', { year })}</th>
          <th class="num">{t('assets.bookValue', { year })}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each assets as a (a.id)}
          <tr>
            <td>
              {a.description}
              <div class="small muted">
                {formatDate(a.acquisitionDate)} · {a.usefulLifeYears} jr
                {#if a.disposalDate}· {t('assets.disposed')} {formatDate(a.disposalDate)}{/if}
              </div>
            </td>
            <td class="num">{formatMoney(a.cost)}</td>
            <td class="num">{formatMoney(depreciationForYear(a, year))}</td>
            <td class="num">{formatMoney(bookValue(a, `${year}-12-31`))}</td>
            <td class="num">
              {#if a.source === 'document'}
                <a href={`#/documents/${a.sourceId}`}>{t('assets.fromPurchase')}</a>
              {:else}
                <button type="button" class="ghost" onclick={() => edit(a.id)}>{t('common.edit')}</button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .actions .danger {
    margin-left: auto;
  }
</style>

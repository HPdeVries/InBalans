<script lang="ts">
  import { stockCounts } from '../db/stores';
  import { create, remove, save } from '../db/repo';
  import { formatMoney } from '../domain/money';
  import type { StockCount } from '../domain/types';
  import { t } from '../i18n';
  import MoneyInput from '../ui/MoneyInput.svelte';
  import PageHeader from '../ui/PageHeader.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Package from '@lucide/svelte/icons/package';

  let editing = $state<StockCount | null>(null);

  function startNew() {
    const years = new Set($stockCounts.map((s) => s.year));
    let year = new Date().getFullYear() - 1;
    if (years.has(year)) year++;
    editing = create<StockCount>({ year, value: 0, note: '' });
  }

  function edit(s: StockCount) {
    editing = structuredClone($state.snapshot(s));
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!editing) return;
    const duplicate = $stockCounts.find((s) => s.year === editing!.year && s.id !== editing!.id);
    if (duplicate) {
      // One count per year: update the existing record instead of creating a second one.
      editing = { ...duplicate, value: editing.value, note: editing.note };
    }
    await save('stockCounts', editing);
    editing = null;
  }

  async function del() {
    if (!editing || !confirm(t('common.confirmDelete'))) return;
    await remove('stockCounts', editing.id);
    editing = null;
  }
</script>

<PageHeader title={t('stock.title')} subtitle={t('stock.intro')}>
  {#snippet actions()}
    <button type="button" class="primary" onclick={startNew}><Plus size={18} />{t('stock.add')}</button>
  {/snippet}
</PageHeader>

{#if editing}
  <form class="card" onsubmit={submit}>
    <div class="form-grid">
      <label>{t('common.year')}<input type="number" step="1" bind:value={editing.year} required /></label>
      <label>{t('stock.value')}<MoneyInput bind:value={editing.value} /></label>
      <label>{t('common.note')}<input bind:value={editing.note} /></label>
    </div>
    <div class="actions">
      <button type="submit" class="primary">{t('common.save')}</button>
      <button type="button" onclick={() => (editing = null)}>{t('common.cancel')}</button>
      {#if $stockCounts.some((s) => s.id === editing!.id)}
        <button type="button" class="danger" onclick={del}>{t('common.delete')}</button>
      {/if}
    </div>
  </form>
{/if}

{#if $stockCounts.length === 0}
  <div class="card empty-state">
    <div class="empty-icon"><Package size={26} /></div>
    <p>{t('common.none')}</p>
  </div>
{:else}
  <div class="card flush">
    <table>
      <thead>
        <tr><th>{t('common.year')}</th><th class="num">{t('stock.value')}</th><th>{t('common.note')}</th><th></th></tr>
      </thead>
      <tbody>
        {#each $stockCounts as s (s.id)}
          <tr>
            <td>31-12-{s.year}</td>
            <td class="num">{formatMoney(s.value)}</td>
            <td class="muted">{s.note}</td>
            <td class="num"><button type="button" class="ghost" onclick={() => edit(s)}>{t('common.edit')}</button></td>
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

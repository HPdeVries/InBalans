<script lang="ts">
  import { onMount } from 'svelte';
  import { categories } from '../db/stores';
  import { db } from '../db/db';
  import { create, emptySettings, SETTINGS_ID, updateSettings, requestPersistentStorage, save } from '../db/repo';
  import { downloadJson, exportBackup, importBackup } from '../db/backup';
  import type { Category, CategoryKind, Settings } from '../domain/types';
  import { vatCodesFor, type VatCode } from '../domain/vat';
  import { today } from '../domain/period';
  import { t, type MessageKey } from '../i18n';
  import { GROUPS_BY_KIND } from '../ui/options';
  import PageHeader from '../ui/PageHeader.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Download from '@lucide/svelte/icons/download';
  import Upload from '@lucide/svelte/icons/upload';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';

  let form = $state<Settings>(emptySettings());
  let savedMessage = $state('');
  let importMessage = $state('');
  let persisted = $state<boolean | null>(null);

  async function loadSettings() {
    form = (await db.settings.get(SETTINGS_ID)) ?? emptySettings();
  }

  onMount(async () => {
    await loadSettings();
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  });

  async function saveSettings(e: SubmitEvent) {
    e.preventDefault();
    // Only the business details: locking and archive state are managed elsewhere.
    const { businessName, ownerName, address, kvkNumber, vatId, iban, email } = form;
    await updateSettings({ businessName, ownerName, address, kvkNumber, vatId, iban, email });
    savedMessage = t('common.saved');
    setTimeout(() => (savedMessage = ''), 2000);
  }

  async function updateCategory(c: Category, patch: Partial<Category>) {
    const next = { ...$state.snapshot(c), ...patch } as Category;
    if (patch.kind) {
      next.group = GROUPS_BY_KIND[patch.kind][0];
      next.defaultVatCode = patch.kind === 'income' ? 'S_HIGH' : 'P_HIGH';
    }
    await save('categories', next);
  }

  async function addCategory() {
    await save(
      'categories',
      create<Category>({ name: 'Nieuwe categorie', kind: 'expense', group: 'otherCosts', defaultVatCode: 'P_HIGH', archived: false }),
    );
  }

  async function doExport() {
    downloadJson(`inbalans-backup-${today()}.json`, await exportBackup());
  }

  async function doImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const res = await importBackup(JSON.parse(await file.text()));
      importMessage = t('settings.importDone', { ...res });
      await loadSettings();
    } catch {
      importMessage = t('settings.importError');
    }
    input.value = '';
  }

  async function requestPersist() {
    persisted = await requestPersistentStorage();
  }

  const kinds: CategoryKind[] = ['income', 'expense', 'asset'];
</script>

<PageHeader title={t('settings.title')} />

<form class="card" onsubmit={saveSettings}>
  <h2>{t('settings.business')}</h2>
  <div class="form-grid">
    <label>{t('settings.businessName')}<input bind:value={form.businessName} /></label>
    <label>{t('settings.ownerName')}<input bind:value={form.ownerName} /></label>
    <label>{t('settings.address')}<input bind:value={form.address} /></label>
    <label>{t('settings.kvk')}<input bind:value={form.kvkNumber} inputmode="numeric" /></label>
    <label>{t('settings.vatId')}<input bind:value={form.vatId} placeholder="NL000000000B01" /></label>
    <label>{t('settings.iban')}<input bind:value={form.iban} /></label>
    <label>{t('settings.email')}<input type="email" bind:value={form.email} /></label>
  </div>
  <div class="actions">
    <button type="submit" class="primary">{t('common.save')}</button>
    <span class="muted">{savedMessage}</span>
  </div>
</form>

<section class="card">
  <h2>{t('settings.categories')}</h2>
  <div class="table-wrap">
    <table class="categories">
      <thead>
        <tr>
          <th>{t('settings.categoryName')}</th>
          <th>{t('settings.categoryKind')}</th>
          <th>{t('settings.categoryGroup')}</th>
          <th>{t('settings.defaultVat')}</th>
          <th>{t('settings.archived')}</th>
        </tr>
      </thead>
      <tbody>
        {#each $categories as c (c.id)}
          <tr class:archived={c.archived}>
            <td><input value={c.name} onchange={(e) => updateCategory(c, { name: e.currentTarget.value })} /></td>
            <td>
              <select value={c.kind} onchange={(e) => updateCategory(c, { kind: e.currentTarget.value as CategoryKind })}>
                {#each kinds as k}<option value={k}>{t(`settings.kind.${k}` as MessageKey)}</option>{/each}
              </select>
            </td>
            <td>
              <select value={c.group} onchange={(e) => updateCategory(c, { group: e.currentTarget.value as Category['group'] })}>
                {#each GROUPS_BY_KIND[c.kind] as g}<option value={g}>{t(`annual.group.${g}` as MessageKey)}</option>{/each}
              </select>
            </td>
            <td>
              <select value={c.defaultVatCode} onchange={(e) => updateCategory(c, { defaultVatCode: e.currentTarget.value as VatCode })}>
                {#each vatCodesFor(c.kind === 'income' ? 'sale' : 'purchase') as o}
                  <option value={o.code}>{t(`vat.${o.code}` as MessageKey)}</option>
                {/each}
              </select>
            </td>
            <td class="center">
              <input type="checkbox" checked={c.archived} onchange={(e) => updateCategory(c, { archived: e.currentTarget.checked })} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <button type="button" onclick={addCategory}><Plus size={18} />{t('settings.addCategory')}</button>
</section>

<section class="card">
  <h2>{t('settings.backup')}</h2>
  <p class="muted">{t('settings.backupIntro')}</p>
  <div class="actions">
    <button type="button" class="primary" onclick={doExport}><Download size={18} />{t('settings.export')}</button>
    <label class="button file">
      <Upload size={18} />{t('settings.import')}
      <input type="file" accept="application/json,.json" onchange={doImport} />
    </label>
  </div>
  {#if importMessage}<p class="notice">{importMessage}</p>{/if}
</section>

<section class="card">
  <h2>{t('settings.storage')}</h2>
  {#if persisted}
    <p class="status ok"><ShieldCheck size={18} />{t('settings.storagePersisted')}</p>
  {:else}
    <p class="status"><ShieldAlert size={18} />{t('settings.storageNotPersisted')}</p>
    <button type="button" onclick={requestPersist}>{t('settings.storageRequest')}</button>
  {/if}
</section>

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }
  .file {
    flex-direction: row;
    font-size: 1rem;
    color: var(--text-2);
  }
  .status {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    color: var(--text-2);
  }
  .status :global(svg) {
    flex-shrink: 0;
    color: var(--warning);
  }
  .status.ok :global(svg) {
    color: var(--positive);
  }
  .file input {
    display: none;
  }
  .categories {
    min-width: 760px;
    margin-bottom: 12px;
  }
  .categories td {
    padding: 4px;
    border-bottom: 0;
  }
  .archived input:not([type='checkbox']),
  .archived select {
    opacity: 0.5;
  }
  .center {
    text-align: center;
    vertical-align: middle;
  }
</style>

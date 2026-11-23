<script lang="ts">
  import Trash from '@lucide/svelte/icons/trash-2';
  import Download from '@lucide/svelte/icons/download';
  import { t } from '../i18n';
  import Sheet from './Sheet.svelte';
  import { account } from '../sync/account';
  import { downloadJson, exportBackup } from '../db/backup';
  import { today } from '../domain/period';
  import { wipeDevice } from '../security/reset';

  let open = $state(false);
  let word = $state('');
  let busy = $state(false);
  const confirmed = $derived(word.trim().toUpperCase() === t('danger.confirmWord'));

  $effect(() => {
    if (open) word = '';
  });

  async function backup() {
    downloadJson(`inbalans-backup-${today()}.json`, await exportBackup());
  }

  async function wipe(e: SubmitEvent) {
    e.preventDefault();
    if (!confirmed) return;
    busy = true;
    await wipeDevice();
  }
</script>

<section class="card danger-zone">
  <h2>{t('danger.title')}</h2>
  <p class="muted">{t('danger.intro')}</p>
  <button class="danger" onclick={() => (open = true)}><Trash size={18} />{t('danger.button')}</button>
</section>

<Sheet bind:open title={t('danger.dialogTitle')}>
  <form onsubmit={wipe}>
    <p>{t('danger.what')}</p>
    <p class="notice">{account ? t('danger.sync') : t('danger.local')}</p>
    <button type="button" onclick={backup}><Download size={18} />{t('danger.backupFirst')}</button>
    <label>
      {t('danger.confirmLabel')}
      <input bind:value={word} autocomplete="off" autocapitalize="characters" spellcheck="false" />
    </label>
    <div class="actions">
      <button type="button" onclick={() => (open = false)}>{t('common.cancel')}</button>
      <button class="danger" disabled={!confirmed || busy}>
        {busy ? t('danger.busy') : t('danger.confirm')}
      </button>
    </div>
  </form>
</Sheet>

<style>
  .danger-zone {
    border-color: color-mix(in srgb, var(--negative) 35%, var(--border));
  }
  .danger-zone h2 {
    color: var(--negative);
  }
  form {
    display: grid;
    gap: 12px;
  }
  form p {
    margin: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>

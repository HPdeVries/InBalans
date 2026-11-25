<script lang="ts">
  import UserX from '@lucide/svelte/icons/user-x';
  import Download from '@lucide/svelte/icons/download';
  import { t } from '../i18n';
  import Sheet from './Sheet.svelte';
  import { account } from '../sync/account';
  import { api, ApiRequestError } from '../sync/api';
  import { deleteAccount, type AfterDeletion } from '../sync/session';
  import { downloadJson, exportBackup } from '../db/backup';
  import { today } from '../domain/period';

  const shared = account?.deviceMode === 'shared';
  let open = $state(false);
  let step = $state<'confirm' | 'code'>('confirm');
  let after = $state<AfterDeletion>('keepLocal');
  let word = $state('');
  let code = $state('');
  let devCode = $state('');
  let busy = $state(false);
  let error = $state('');
  const confirmed = $derived(word.trim().toUpperCase() === t('danger.confirmWord'));

  $effect(() => {
    if (open) {
      step = 'confirm';
      after = 'keepLocal';
      word = code = devCode = error = '';
    }
  });

  function message(e: unknown): string {
    const err = e instanceof ApiRequestError ? e : null;
    if (err?.offline) return t('danger.account.offline');
    if (err?.code === 'invalid_code') return t('danger.account.invalidCode');
    if (err?.code === 'code_expired') return t('danger.account.expired');
    return t('danger.account.failed');
  }

  async function backup() {
    downloadJson(`inbalans-backup-${today()}.json`, await exportBackup());
  }

  async function sendCode(e: SubmitEvent) {
    e.preventDefault();
    if (!confirmed || busy) return;
    busy = true;
    error = '';
    try {
      devCode = (await api.startAccountDeletion()).devCode ?? '';
      step = 'code';
    } catch (err) {
      error = message(err);
    } finally {
      busy = false;
    }
  }

  async function confirmDelete(e: SubmitEvent) {
    e.preventDefault();
    if (busy || !/^\d{6}$/.test(code.replace(/\s/g, ''))) return;
    busy = true;
    error = '';
    try {
      await deleteAccount(code.replace(/\s/g, ''), shared ? 'wipe' : after);
    } catch (err) {
      error = message(err);
      busy = false;
    }
  }
</script>

{#if account && !account.support}
  <section class="card danger-zone">
    <h2>{t('danger.account.title')}</h2>
    <p class="muted">{t('danger.account.intro')}</p>
    <button class="danger" onclick={() => (open = true)}><UserX size={18} />{t('danger.account.button')}</button>
  </section>

  <Sheet bind:open title={t('danger.account.dialogTitle')}>
    {#if step === 'confirm'}
      <form onsubmit={sendCode}>
        <p>{t('danger.account.what', { email: account.email })}</p>
        {#if shared}
          <p class="notice">{t('danger.account.sharedHint')}</p>
        {:else}
          <fieldset>
            <legend>{t('danger.account.afterLabel')}</legend>
            <label class="choice">
              <input type="radio" name="after" value="keepLocal" bind:group={after} />
              <span><strong>{t('danger.account.keepLocal')}</strong><small>{t('danger.account.keepLocalHint')}</small></span>
            </label>
            <label class="choice">
              <input type="radio" name="after" value="wipe" bind:group={after} />
              <span><strong>{t('danger.account.wipe')}</strong><small>{t('danger.account.wipeHint')}</small></span>
            </label>
          </fieldset>
          <button type="button" onclick={backup}><Download size={18} />{t('danger.backupFirst')}</button>
        {/if}
        <label>
          {t('danger.confirmLabel')}
          <input bind:value={word} autocomplete="off" autocapitalize="characters" spellcheck="false" />
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
          <button type="button" onclick={() => (open = false)}>{t('common.cancel')}</button>
          <button class="danger" disabled={!confirmed || busy}>{t('danger.account.sendCode')}</button>
        </div>
      </form>
    {:else}
      <form onsubmit={confirmDelete}>
        <p>{t('danger.account.codeSent', { email: account.email })}</p>
        {#if devCode}<p class="muted">{t('login.devCode', { code: devCode })}</p>{/if}
        <label>
          {t('danger.account.codeLabel')}
          <input bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="7" />
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
          <button type="button" onclick={() => (open = false)}>{t('common.cancel')}</button>
          <button class="danger" disabled={busy || !/^\d{6}$/.test(code.replace(/\s/g, ''))}>
            {busy ? t('danger.busy') : t('danger.account.confirm')}
          </button>
        </div>
      </form>
    {/if}
  </Sheet>
{/if}

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
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  legend {
    margin-bottom: 4px;
  }
  .choice {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .choice input {
    margin-top: 3px;
    width: auto;
  }
  .choice span {
    display: grid;
    gap: 2px;
  }
  .choice small {
    color: var(--muted, inherit);
  }
  .error {
    color: var(--negative);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>

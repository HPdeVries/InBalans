<script lang="ts">
  import Sheet from './Sheet.svelte';
  import { t } from '../i18n';
  import { api, ApiRequestError } from '../sync/api';
  import { account, connect, planConnect, type ConnectPlan } from '../sync/session';
  import { loginError } from '../sync/format';
  import { downloadJson, exportBackup } from '../db/backup';
  import { today } from '../domain/period';
  import type { DeviceMode } from '../sync/protocol';

  let { open = $bindable(false) }: { open: boolean } = $props();

  type Step = 'email' | 'code' | 'choice' | 'busy';
  let step = $state<Step>('email');
  let email = $state(account?.email ?? '');
  let code = $state('');
  let devCode = $state('');
  let deviceMode = $state<DeviceMode>(account?.deviceMode ?? 'own');
  let error = $state('');
  let busy = $state(false);
  let plan = $state<ConnectPlan | null>(null);

  $effect(() => {
    if (open) {
      step = 'email';
      code = devCode = error = '';
    }
  });

  function fail(e: unknown) {
    if (!(e instanceof ApiRequestError)) console.error(e);
    error = loginError(e instanceof ApiRequestError ? e.code : 'generic');
  }

  async function sendCode(e?: SubmitEvent) {
    e?.preventDefault();
    busy = true;
    error = '';
    try {
      const res = await api.startEmailLogin(email.trim());
      devCode = res.devCode ?? '';
      code = '';
      step = 'code';
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function verify(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const me = await api.verifyEmailLogin(email.trim(), code, deviceMode);
      plan = await planConnect(me, deviceMode);
      if (plan.remoteHasData && plan.localHasData) step = 'choice';
      else await finish('merge');
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function finish(choice: 'merge' | 'cloud') {
    if (!plan) return;
    step = 'busy';
    try {
      await connect(plan, choice); // reloads the app
    } catch (err) {
      step = 'code';
      fail(err);
    }
  }

  async function backup() {
    downloadJson(`inbalans-backup-${today()}.json`, await exportBackup());
  }
</script>

<Sheet bind:open title={step === 'choice' ? t('login.choiceTitle') : t('login.title')}>
  {#if step === 'email'}
    <form onsubmit={sendCode}>
      <label>
        {t('login.email')}
        <!-- svelte-ignore a11y_autofocus -->
        <input type="email" autocomplete="email" required bind:value={email} autofocus />
      </label>
      {#if error}<p class="notice">{error}</p>{/if}
      <button class="primary wide" disabled={busy}>{t('login.sendCode')}</button>
    </form>
  {:else if step === 'code'}
    <form onsubmit={verify}>
      <p class="muted">{t('login.codeSent', { email })}</p>
      {#if devCode}<p class="notice info">{t('login.devCode', { code: devCode })}</p>{/if}
      <label>
        {t('login.code')}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9 ]*"
          maxlength="7"
          required
          bind:value={code}
          autofocus
        />
      </label>
      <fieldset>
        <legend>{t('login.deviceMode')}</legend>
        {#each ['own', 'shared'] as const as mode}
          <label class="option" class:selected={deviceMode === mode}>
            <input type="radio" name="mode" value={mode} bind:group={deviceMode} />
            <span>
              <strong>{t(`login.mode.${mode}`)}</strong>
              <span class="muted small">{t(`login.mode.${mode}Hint`)}</span>
            </span>
          </label>
        {/each}
      </fieldset>
      {#if error}<p class="notice">{error}</p>{/if}
      <button class="primary wide" disabled={busy}>{t('login.verify')}</button>
      <div class="links">
        <button type="button" class="ghost" onclick={() => (step = 'email')}>{t('login.otherEmail')}</button>
        <button type="button" class="ghost" disabled={busy} onclick={() => sendCode()}>{t('login.resend')}</button>
      </div>
    </form>
  {:else if step === 'choice'}
    <p class="muted">{t('login.choiceIntro')}</p>
    <button class="option-button" onclick={() => finish('merge')}>
      <strong>{t('login.merge')}</strong><span class="muted small">{t('login.mergeHint')}</span>
    </button>
    <button class="option-button" onclick={() => finish('cloud')}>
      <strong>{t('login.cloud')}</strong><span class="muted small">{t('login.cloudHint')}</span>
    </button>
    <button class="ghost wide" onclick={backup}>{t('login.downloadBackup')}</button>
  {:else}
    <p class="muted">{t('login.connecting')}</p>
  {/if}
</Sheet>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wide {
    width: 100%;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  legend {
    font-weight: 500;
    margin-bottom: 6px;
  }
  .option {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .option.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .option input {
    flex: none;
    width: auto;
    min-height: 0;
    margin-top: 3px;
    box-shadow: none;
  }
  .option > span,
  .option-button {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .option-button {
    width: 100%;
    align-items: flex-start;
    text-align: left;
    height: auto;
    padding: 12px 14px;
    margin-bottom: 8px;
    /* Buttons do not wrap by default; these hold a sentence. */
    white-space: normal;
    font-weight: 400;
  }
  .option-button span {
    line-height: 1.4;
  }
  .links {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .notice {
    margin: 0;
  }
</style>

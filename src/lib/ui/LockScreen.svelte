<script lang="ts">
  import { onMount } from 'svelte';
  import Lock from '@lucide/svelte/icons/lock';
  import { t } from '../i18n';
  import { forgetPinAndWipe, throttle, unlock } from '../security/lock';
  import { account } from '../sync/account';

  let pin = $state('');
  let error = $state('');
  let busy = $state(false);
  let forgot = $state(false);
  let confirmWord = $state('');
  let input = $state<HTMLInputElement>();

  function waitMessage(until: number): string {
    const seconds = Math.ceil((until - Date.now()) / 1000);
    return seconds > 0 ? t('lock.wait', { seconds }) : '';
  }

  onMount(() => {
    error = waitMessage(throttle().blockedUntil);
    input?.focus();
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!pin) return;
    busy = true;
    const res = await unlock(pin);
    busy = false;
    if (res.ok) return;
    pin = '';
    error = waitMessage(res.blockedUntil) || t('lock.wrong');
    input?.focus();
  }

  async function wipe() {
    if (confirmWord.trim().toUpperCase() !== t('lock.forgotConfirmWord')) return;
    busy = true;
    await forgetPinAndWipe();
  }
</script>

<div class="screen">
  <div class="panel">
    <img src="./favicon.svg" alt="" width="48" height="48" />
    {#if !forgot}
      <h1><Lock size={20} />{t('lock.title')}</h1>
      <form onsubmit={submit}>
        <label>
          {t('lock.enterPin')}
          <input
            bind:this={input}
            type="password"
            inputmode="numeric"
            autocomplete="current-password"
            maxlength="8"
            bind:value={pin}
          />
        </label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <button class="primary" disabled={busy}>{t('lock.unlock')}</button>
      </form>
      <button class="ghost" onclick={() => (forgot = true)}>{t('lock.forgot')}</button>
    {:else}
      <h1>{t('lock.forgotTitle')}</h1>
      <p class="muted">{account ? t('lock.forgotSync') : t('lock.forgotLocal')}</p>
      <label>
        {t('lock.forgotConfirmLabel')}
        <input bind:value={confirmWord} autocomplete="off" />
      </label>
      <div class="actions">
        <button onclick={() => (forgot = false)}>{t('common.cancel')}</button>
        <button
          class="danger"
          disabled={busy || confirmWord.trim().toUpperCase() !== t('lock.forgotConfirmWord')}
          onclick={wipe}>{t('lock.forgotConfirm')}</button
        >
      </div>
    {/if}
  </div>
</div>

<style>
  .screen {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px 16px;
    background: var(--bg);
  }
  .panel {
    width: min(360px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 28px 24px;
    display: grid;
    gap: 14px;
    text-align: center;
  }
  .panel img {
    margin: 0 auto;
    border-radius: 12px;
  }
  h1 {
    font-size: 1.2rem;
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
  }
  form {
    display: grid;
    gap: 12px;
    text-align: left;
  }
  label {
    text-align: left;
  }
  input[type='password'] {
    font-size: 1.4rem;
    letter-spacing: 0.3em;
    text-align: center;
  }
  .error {
    color: var(--negative);
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
</style>

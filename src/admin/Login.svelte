<script lang="ts">
  import { adminApi, errorText } from './api';
  import type { AdminMe } from './protocol';

  let { onlogin, expired = false }: { onlogin: (me: AdminMe) => void; expired?: boolean } = $props();

  let step = $state<'email' | 'code'>('email');
  let email = $state('');
  let code = $state('');
  let devCode = $state('');
  let error = $state('');
  let busy = $state(false);

  async function send(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      devCode = (await adminApi.start(email.trim())).devCode ?? '';
      step = 'code';
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  async function verify(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      onlogin(await adminApi.verify(email.trim(), code));
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="screen">
  <div class="panel">
    <img src="./favicon.svg" alt="" width="44" height="44" />
    <h1>InBalans beheer</h1>
    {#if expired}<p class="notice info">Je sessie is verlopen. Log opnieuw in.</p>{/if}
    {#if step === 'email'}
      <form onsubmit={send}>
        <label>E-mailadres<input type="email" autocomplete="email" required bind:value={email} /></label>
        {#if error}<p class="error">{error}</p>{/if}
        <button class="primary" disabled={busy}>Stuur inlogcode</button>
      </form>
    {:else}
      <form onsubmit={verify}>
        <p class="muted small">Als dit adres toegang heeft, is er een code van 6 cijfers naar {email} gestuurd.</p>
        {#if devCode}<p class="notice info">Ontwikkelmodus — code: {devCode}</p>{/if}
        <label>
          Inlogcode
          <input inputmode="numeric" autocomplete="one-time-code" maxlength="7" required bind:value={code} />
        </label>
        {#if error}<p class="error">{error}</p>{/if}
        <button class="primary" disabled={busy}>Inloggen</button>
        <button type="button" class="ghost" onclick={() => (step = 'email')}>Ander e-mailadres</button>
      </form>
    {/if}
  </div>
</div>

<style>
  .screen {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px 16px;
  }
  .panel {
    width: min(380px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 28px 24px;
    display: grid;
    gap: 14px;
  }
  .panel img {
    border-radius: 12px;
  }
  h1 {
    font-size: 1.3rem;
    margin: 0;
  }
  form {
    display: grid;
    gap: 12px;
  }
  .error {
    color: var(--negative);
    margin: 0;
  }
  .notice {
    margin: 0;
  }
</style>

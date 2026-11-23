<script lang="ts">
  import { t } from '../i18n';
  import { AUTO_LOCK_OPTIONS, verifyPin } from '../security/pin';
  import { lockNow, pinConfig, removePin, setAutoLock, setPin } from '../security/lock';
  import PinSetup from './PinSetup.svelte';

  let mode = $state<'idle' | 'set' | 'change' | 'remove'>('idle');
  let current = $state('');
  let currentOk = $state(false);
  let error = $state('');
  let message = $state('');

  function reset(msg = '') {
    mode = 'idle';
    current = error = '';
    currentOk = false;
    message = msg;
  }

  async function checkCurrent(e: SubmitEvent) {
    e.preventDefault();
    const config = $pinConfig;
    if (!config) return;
    if (mode === 'remove') {
      if (await removePin(current)) reset(t('security.pinRemoved'));
      else error = t('pin.wrongCurrent');
      return;
    }
    currentOk = await verifyPin(current, config);
    error = currentOk ? '' : t('pin.wrongCurrent');
  }

  const label = (n: number) =>
    n === 0 ? t('security.autoLock.0') : n === 1 ? t('security.autoLock.1') : t('security.autoLock.n', { n });
</script>

<section class="card">
  <h2>{t('security.title')}</h2>
  <p class="muted">{t('security.intro')}</p>

  {#if $pinConfig}
    <p class="ok">{t('security.enabled')}</p>
    <label class="auto">
      {t('security.autoLock')}
      <select value={$pinConfig.autoLockMinutes} onchange={(e) => setAutoLock(Number(e.currentTarget.value))}>
        {#each AUTO_LOCK_OPTIONS as n}<option value={n}>{label(n)}</option>{/each}
      </select>
    </label>
  {/if}

  {#if mode === 'idle'}
    <div class="actions">
      {#if $pinConfig}
        <button onclick={lockNow}>{t('lock.lockNow')}</button>
        <button onclick={() => { reset(); mode = 'change'; }}>{t('security.changePin')}</button>
        <button class="ghost" onclick={() => { reset(); mode = 'remove'; }}>{t('security.removePin')}</button>
      {:else}
        <button class="primary" onclick={() => (mode = 'set')}>{t('security.setPin')}</button>
      {/if}
    </div>
  {:else if (mode === 'change' && !currentOk) || mode === 'remove'}
    <form class="current" onsubmit={checkCurrent}>
      <label>
        {t('pin.current')}
        <input type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" bind:value={current} />
      </label>
      {#if error}<p class="error">{error}</p>{/if}
      <div class="actions">
        <button class={mode === 'remove' ? 'danger' : 'primary'}>
          {mode === 'remove' ? t('security.removePin') : t('onboarding.next')}
        </button>
        <button type="button" onclick={() => reset()}>{t('common.cancel')}</button>
      </div>
    </form>
  {:else}
    <PinSetup submitLabel={t('common.save')} onsave={async (pin) => { await setPin(pin); reset(t('security.pinSaved')); }}>
      <button type="button" onclick={() => reset()}>{t('common.cancel')}</button>
    </PinSetup>
  {/if}

  {#if message}<p class="muted">{message}</p>{/if}
  <p class="muted small">{t('security.limit')}</p>
</section>

<style>
  .ok {
    color: var(--positive);
    font-weight: 500;
  }
  .auto {
    max-width: 320px;
    margin-bottom: 12px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .current {
    display: grid;
    gap: 12px;
    max-width: 320px;
  }
  .error {
    color: var(--negative);
    margin: 0;
  }
</style>

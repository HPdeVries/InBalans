<script lang="ts">
  import { onMount } from 'svelte';
  import Check from '@lucide/svelte/icons/check';
  import Upload from '@lucide/svelte/icons/upload';
  import { t, type MessageKey } from '../i18n';
  import { loadSettings, updateSettings } from '../db/repo';
  import { importBackup } from '../db/backup';
  import { setPin } from '../security/lock';
  import { formatIban, formatVatId, isValidEmail, isValidIban, isValidKvk, isValidVatId } from '../domain/validation';
  import PinSetup from '../ui/PinSetup.svelte';
  import { markOnboarded } from './state';

  let { ondone }: { ondone: () => void } = $props();

  const STEPS = ['welcome', 'you', 'business', 'pin', 'done'] as const;
  let step = $state(0);
  let restoreError = $state('');

  let ownerName = $state('');
  let email = $state('');
  let businessName = $state('');
  let address = $state('');
  let kvkNumber = $state('');
  let vatId = $state('');
  let iban = $state('');

  onMount(async () => {
    const s = await loadSettings();
    ({ ownerName, email, businessName, address, kvkNumber, vatId, iban } = s);
  });

  const hint = (value: string, valid: (v: string) => boolean, key: MessageKey) =>
    value.trim() && !valid(value) ? t(key) : '';

  async function saveDetails() {
    await updateSettings({
      ownerName: ownerName.trim(),
      email: email.trim(),
      businessName: businessName.trim(),
      address: address.trim(),
      kvkNumber: kvkNumber.replace(/\s/g, ''),
      vatId: vatId.trim() ? formatVatId(vatId) : '',
      iban: iban.trim() && isValidIban(iban) ? formatIban(iban) : iban.trim(),
    });
  }

  async function next(e?: SubmitEvent) {
    e?.preventDefault();
    if (STEPS[step] === 'you' || STEPS[step] === 'business') await saveDetails();
    step++;
  }

  function finish() {
    markOnboarded();
    ondone();
  }

  async function skip() {
    if (STEPS[step] === 'you' || STEPS[step] === 'business') await saveDetails();
    finish();
  }

  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importBackup(JSON.parse(await file.text()));
      finish();
    } catch {
      restoreError = t('settings.importError');
    }
    input.value = '';
  }
</script>

<div class="screen">
  <div class="panel">
    <header>
      <img src="./favicon.svg" alt="" width="36" height="36" />
      {#if step > 0 && step < STEPS.length - 1}
        <span class="muted small">{t('onboarding.step', { n: step, total: STEPS.length - 2 })}</span>
      {/if}
      {#if step < STEPS.length - 1}
        <button class="ghost skip" onclick={skip}>{t('onboarding.skip')}</button>
      {/if}
    </header>

    {#if STEPS[step] === 'welcome'}
      <h1>{t('onboarding.welcomeTitle')}</h1>
      <p>{t('onboarding.welcomeText')}</p>
      <ul class="points">
        {#each ['local', 'free', 'offline'] as k}
          <li><Check size={18} />{t(`onboarding.welcome.${k}` as MessageKey)}</li>
        {/each}
      </ul>
      {#if restoreError}<p class="notice">{restoreError}</p>{/if}
      <div class="actions">
        <button class="primary" onclick={() => next()}>{t('onboarding.start')}</button>
        <label class="button file">
          <Upload size={18} />{t('onboarding.restore')}
          <input type="file" accept="application/json,.json" onchange={restore} />
        </label>
      </div>
    {:else if STEPS[step] === 'you'}
      <h1>{t('onboarding.youTitle')}</h1>
      <p class="muted">{t('onboarding.youText')}</p>
      <form onsubmit={next}>
        <label>{t('settings.ownerName')}<input bind:value={ownerName} autocomplete="name" /></label>
        <label>
          {t('settings.email')}<input type="email" bind:value={email} autocomplete="email" />
          {#if hint(email, isValidEmail, 'onboarding.hint.email')}<span class="hint">{hint(email, isValidEmail, 'onboarding.hint.email')}</span>{/if}
        </label>
        <div class="actions">
          <button type="button" onclick={() => step--}>{t('onboarding.back')}</button>
          <button class="primary">{t('onboarding.next')}</button>
        </div>
      </form>
    {:else if STEPS[step] === 'business'}
      <h1>{t('onboarding.businessTitle')}</h1>
      <p class="muted">{t('onboarding.businessText')}</p>
      <form onsubmit={next}>
        <label>{t('settings.businessName')}<input bind:value={businessName} autocomplete="organization" /></label>
        <label>{t('settings.address')}<input bind:value={address} autocomplete="street-address" /></label>
        <div class="two">
          <label>
            {t('settings.kvk')}<input bind:value={kvkNumber} inputmode="numeric" />
            {#if hint(kvkNumber, isValidKvk, 'onboarding.hint.kvk')}<span class="hint">{t('onboarding.hint.kvk')}</span>{/if}
          </label>
          <label>
            {t('settings.vatId')}<input bind:value={vatId} placeholder="NL000000000B01" />
            {#if hint(vatId, isValidVatId, 'onboarding.hint.vatId')}<span class="hint">{t('onboarding.hint.vatId')}</span>{/if}
          </label>
        </div>
        <label>
          {t('settings.iban')}<input bind:value={iban} placeholder="NL00 BANK 0000 0000 00" />
          {#if hint(iban, isValidIban, 'onboarding.hint.iban')}<span class="hint">{t('onboarding.hint.iban')}</span>{/if}
        </label>
        <div class="actions">
          <button type="button" onclick={() => step--}>{t('onboarding.back')}</button>
          <button class="primary">{t('onboarding.next')}</button>
        </div>
      </form>
    {:else if STEPS[step] === 'pin'}
      <h1>{t('onboarding.pinTitle')}</h1>
      <p class="muted">{t('onboarding.pinText')}</p>
      <p class="muted small">{t('security.limit')}</p>
      <PinSetup submitLabel={t('security.setPin')} onsave={async (pin) => { await setPin(pin); step++; }}>
        <button type="button" onclick={() => step++}>{t('onboarding.pinSkip')}</button>
      </PinSetup>
    {:else}
      <h1>{t('onboarding.doneTitle')}</h1>
      <p>{t('onboarding.doneText')}</p>
      <ul class="points">
        <li><Check size={18} />{t('onboarding.tipBackup')}</li>
        <li><Check size={18} />{t('onboarding.tipInstall')}</li>
      </ul>
      <div class="actions">
        <button class="primary" onclick={finish}>{t('onboarding.finish')}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .screen {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: calc(24px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
    background: var(--bg);
  }
  .panel {
    width: min(520px, 100%);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    padding: 24px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  header img {
    border-radius: 10px;
  }
  .skip {
    margin-left: auto;
  }
  h1 {
    font-size: 1.4rem;
    margin: 0 0 8px;
  }
  form {
    display: grid;
    gap: 12px;
  }
  .two {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  .hint {
    color: var(--warning);
    font-size: 0.8rem;
    font-weight: 400;
  }
  .points {
    list-style: none;
    padding: 0;
    margin: 16px 0;
    display: grid;
    gap: 10px;
  }
  .points li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    color: var(--text-2);
  }
  .points :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--positive);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .file {
    flex-direction: row;
    font-size: 1rem;
    color: var(--text-2);
  }
  .file input {
    display: none;
  }
</style>

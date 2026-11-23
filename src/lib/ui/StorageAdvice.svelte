<script lang="ts">
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Download from '@lucide/svelte/icons/download';
  import { t, type MessageKey } from '../i18n';
  import {
    detectBrowser,
    installed,
    installPrompt,
    isInstalled,
    persisted,
    promptInstall,
    requestPersisted,
    storageSupported,
  } from '../platform/platform';

  /** `asked`: whether the user has asked in this screen; the advice shows once asked (or when `adviceAtStart`). */
  let { asked = $bindable(false), adviceAtStart = false }: { asked?: boolean; adviceAtStart?: boolean } = $props();

  const browser = detectBrowser();
  const runningAsApp = isInstalled();
  let busy = $state(false);

  async function ask() {
    busy = true;
    await requestPersisted();
    asked = true;
    busy = false;
  }

  const showAdvice = $derived($persisted !== true && (asked || adviceAtStart || !storageSupported));
  const advice = $derived.by((): string => {
    if (!storageSupported) return t('storage.unsupported');
    if (runningAsApp) return t('storage.installedDenied');
    if ($installed) return t('storage.justInstalled');
    return `${t(`storage.advice.${browser}` as MessageKey)} ${browser === 'firefox' ? '' : t('storage.afterInstall')}`;
  });
</script>

{#if $persisted === true}
  <p class="status ok"><ShieldCheck size={18} />{t('onboarding.storageGranted')}</p>
{:else if showAdvice}
  <div class="status warn">
    <ShieldAlert size={18} />
    <div>
      {#if storageSupported}<p><strong>{t('storage.denied')}</strong> {runningAsApp || browser === 'firefox' ? '' : t('storage.why')}</p>{/if}
      <p>{advice}</p>
    </div>
  </div>
{/if}

{#if $persisted !== true && storageSupported}
  <div class="actions">
    {#if $installPrompt && !runningAsApp}
      <button class="primary" onclick={promptInstall}><Download size={18} />{t('storage.install')}</button>
    {/if}
    <button class:primary={!showAdvice} disabled={busy} onclick={ask}>
      {showAdvice ? t('storage.retry') : t('settings.storageRequest')}
    </button>
  </div>
{/if}

<style>
  .status {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: var(--radius);
    font-size: 0.9rem;
    margin: 0 0 12px;
  }
  .status p {
    margin: 0 0 6px;
  }
  .status p:last-child {
    margin: 0;
  }
  .status :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
  }
  .ok {
    background: var(--positive-soft);
    color: var(--positive);
  }
  .warn {
    background: var(--warning-soft);
    color: var(--text-2);
  }
  .warn :global(svg) {
    color: var(--warning);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
</style>

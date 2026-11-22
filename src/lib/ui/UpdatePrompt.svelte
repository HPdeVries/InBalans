<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { t } from '../i18n';

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();

  // The "ready for offline use" message is informational only; hide it automatically.
  $effect(() => {
    if ($offlineReady) setTimeout(() => ($offlineReady = false), 4000);
  });
</script>

{#if $needRefresh || $offlineReady}
  <div class="toast" role="status">
    {#if $needRefresh}
      <span>{t('app.updateAvailable')}</span>
      <button class="primary" onclick={() => updateServiceWorker(true)}>{t('app.reload')}</button>
    {:else}
      <span>{t('app.offlineReady')}</span>
    {/if}
    <button onclick={() => ($needRefresh = $offlineReady = false)}>{t('common.close')}</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    right: 16px;
    bottom: calc(80px + env(safe-area-inset-bottom));
    z-index: 30;
    display: flex;
    gap: 10px;
    align-items: center;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    padding: 10px 14px;
    border-radius: 12px;
  }
  @media (min-width: 901px) {
    .toast {
      bottom: 16px;
    }
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import { t } from '../i18n';
  import { api } from '../sync/api';
  import { account } from '../sync/account';
  import type { SupportGrantInfo } from '../sync/protocol';

  let info = $state<SupportGrantInfo | null>(null);
  let busy = $state(false);
  let error = $state('');

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' });

  async function run(fn: () => Promise<SupportGrantInfo>) {
    busy = true;
    error = '';
    try {
      info = await fn();
    } catch {
      error = t('login.error.generic');
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (account) void run(() => api.supportStatus(account!.tenantId));
  });
</script>

{#if account && !account.support}
  <section class="card">
    <h2><LifeBuoy size={20} />{t('support.title')}</h2>
    <p class="muted">{t('support.intro')}</p>
    {#if info?.active}
      <p class="status on">{t('support.allowedUntil', { date: fmt(info.active.expiresAt) })}</p>
      <button disabled={busy} onclick={() => run(() => api.revokeSupport(account!.tenantId))}>{t('support.revoke')}</button>
    {:else if info}
      <p class="status">{t('support.notAllowed')}</p>
      <div class="actions">
        <span class="muted">{t('support.allowFor')}</span>
        {#each [24, 72, 168] as h}
          <button disabled={busy} onclick={() => run(() => api.allowSupport(account!.tenantId, h))}>{t(`support.h${h}` as 'support.h24')}</button>
        {/each}
      </div>
    {/if}
    {#if info?.lastViewedAt}<p class="muted small">{t('support.lastViewed', { date: fmt(info.lastViewedAt) })}</p>{/if}
    {#if error}<p class="notice">{error}</p>{/if}
  </section>
{/if}

<style>
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .status {
    font-weight: 500;
    color: var(--text-2);
  }
  .status.on {
    color: var(--accent);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import LogOut from '@lucide/svelte/icons/log-out';
  import Cloud from '@lucide/svelte/icons/cloud';
  import { t, formatDate } from '../i18n';
  import { api } from '../sync/api';
  import { account, signOut, syncAvailable, syncNow, syncStatus } from '../sync/session';
  import { ago, statusText } from '../sync/format';
  import { liveConnected } from '../sync/live';
  import { downloadJson, exportBackup } from '../db/backup';
  import { settings } from '../db/stores';
  import { today } from '../domain/period';
  import type { DeviceInfo } from '../sync/protocol';
  import LoginSheet from './LoginSheet.svelte';

  let loginOpen = $state(false);
  let devices = $state<DeviceInfo[]>([]);
  let pendingLogout = $state(0);

  async function loadDevices() {
    if (!account || account.support) return;
    devices = await api.devices().catch(() => devices);
  }

  onMount(() => {
    void loadDevices();
  });

  async function revoke(d: DeviceInfo) {
    if (!confirm(t('sync.revokeConfirm'))) return;
    await api.revokeDevice(d.id).catch(() => {});
    await loadDevices();
  }

  async function revokeOthers() {
    if (!confirm(t('sync.revokeConfirm'))) return;
    await api.revokeOtherDevices().catch(() => {});
    await loadDevices();
  }

  async function logout(force = false) {
    if (!force && !confirm(t('sync.logoutConfirm'))) return;
    const res = await signOut({ force });
    if (res === 'pending') pendingLogout = $syncStatus.pending;
  }

  async function backup() {
    downloadJson(`inbalans-backup-${today()}.json`, await exportBackup());
  }

  const dateTime = (iso: string) => `${formatDate(iso.slice(0, 10))} (${ago(iso)})`;
</script>

{#if !account && $syncAvailable}
<section class="card">
  <h2>{t('sync.offerTitle')}</h2>
  <p>{t('sync.intro')}</p>
  <ul class="points">
    <li>{t('sync.point.optional')}</li>
    <li><strong>{t('sync.point.paid')}</strong></li>
    <li>{t('sync.point.account')}</li>
  </ul>
  <button class="primary" onclick={() => (loginOpen = true)}><Cloud size={18} />{t('sync.activate')}</button>
</section>
{:else if account?.support}
<section class="card">
  <h2>{t('sync.title')}</h2>
  <p>{t('support.inSupport', { email: account.support.adminEmail })}</p>
  <button onclick={() => signOut()}><LogOut size={18} />{t('support.end')}</button>
</section>
{:else if account}
<section class="card">
  <h2>{t('sync.title')}</h2>

    <p>
      {t('sync.account', { email: account.email })}<br />
      <span class="muted">{t('sync.administration', { name: $settings.businessName || account.tenantName })}</span>
    </p>
    <p class="status" class:warn={$syncStatus.state === 'error' || $syncStatus.state === 'signedOut'}>
      {statusText($syncStatus)}
      {#if $liveConnected}<span class="muted small"> · {t('sync.live')}</span>{/if}
      {#if $syncStatus.pending > 0}<br /><span class="muted small">{t('sync.pending', { count: $syncStatus.pending })}</span>{/if}
    </p>

    {#if $syncStatus.state === 'signedOut'}
      <p class="notice">{t('sync.signedOutNotice')}</p>
      <button class="primary" onclick={() => (loginOpen = true)}>{t('sync.signInAgain')}</button>
    {:else}
      <button onclick={() => syncNow()} disabled={$syncStatus.state === 'syncing'}>
        <RefreshCw size={18} />{t('sync.syncNow')}
      </button>
    {/if}

    {#if devices.length}
      <h3>{t('sync.devices')}</h3>
      <ul class="devices">
        {#each devices as d (d.id)}
          <li>
            <span>
              <strong>{d.deviceName}</strong>
              {#if d.current}<span class="badge accent">{t('sync.thisDevice')}</span>{/if}
              <br />
              <span class="muted small">{t(`sync.mode.${d.deviceMode}`)} · {t('sync.lastSeen', { date: dateTime(d.lastSeenAt) })}</span>
            </span>
            {#if !d.current}<button class="ghost" onclick={() => revoke(d)}>{t('sync.revoke')}</button>{/if}
          </li>
        {/each}
      </ul>
      {#if devices.length > 1}
        <button class="ghost" onclick={revokeOthers}>{t('sync.revokeOthers')}</button>
      {/if}
    {/if}

    <div class="actions">
      <button onclick={() => logout()}><LogOut size={18} />{t('sync.logout')}</button>
    </div>
    {#if pendingLogout > 0}
      <div class="notice">
        <div>
          <p>{t('sync.logoutPending', { count: pendingLogout })}</p>
          <div class="actions">
            <button onclick={() => (pendingLogout = 0)}>{t('sync.logoutWait')}</button>
            <button onclick={backup}>{t('sync.logoutBackup')}</button>
            <button class="danger" onclick={() => logout(true)}>{t('sync.logoutAnyway')}</button>
          </div>
        </div>
      </div>
    {/if}
</section>
{/if}

<LoginSheet bind:open={loginOpen} />

<style>
  .points {
    margin: 0 0 16px;
    padding-left: 20px;
    color: var(--text-2);
  }
  .points li {
    margin-bottom: 6px;
  }
  .status {
    color: var(--positive);
    font-weight: 500;
  }
  .status.warn {
    color: var(--warning);
  }
  h3 {
    margin: 20px 0 8px;
    font-size: 0.95rem;
  }
  .devices {
    list-style: none;
    padding: 0;
    margin: 0 0 8px;
  }
  .devices li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .notice p {
    margin: 0;
  }
</style>

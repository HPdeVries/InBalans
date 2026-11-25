<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import HardDrive from '@lucide/svelte/icons/hard-drive';
  import Cloud from '@lucide/svelte/icons/cloud';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import X from '@lucide/svelte/icons/x';
  import { account, dismissNotices, signOut, syncStatus, takeWipeReason } from './lib/sync/session';
  import { statusText } from './lib/sync/format';
  import type { MessageKey } from './lib/i18n/nl';
  import { route } from './lib/router';
  import { t } from './lib/i18n';
  import { settings } from './lib/db/stores';
  import { NAV, type NavItem } from './lib/ui/nav';
  import Sheet from './lib/ui/Sheet.svelte';
  import QuickAddOptions from './lib/ui/QuickAddOptions.svelte';
  import Dashboard from './lib/pages/Dashboard.svelte';
  import DocumentList from './lib/pages/DocumentList.svelte';
  import DocumentForm from './lib/pages/DocumentForm.svelte';
  import VatReturnPage from './lib/pages/VatReturnPage.svelte';
  import AnnualReportPage from './lib/pages/AnnualReportPage.svelte';
  import AssetsPage from './lib/pages/AssetsPage.svelte';
  import StockPage from './lib/pages/StockPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import UpdatePrompt from './lib/ui/UpdatePrompt.svelte';
  import LockScreen from './lib/ui/LockScreen.svelte';
  import Onboarding from './lib/onboarding/Onboarding.svelte';
  import { isOnboarded, markOnboarded } from './lib/onboarding/state';
  import { locked } from './lib/security/lock';
  import { hasOwnData } from './lib/sync/session';
  import { db } from './lib/db/db';
  import { onMount } from 'svelte';
  import { APP_VERSION, versionTitle } from './version';

  let quickAddOpen = $state(false);
  let newMenuOpen = $state(false);
  let moreOpen = $state(false);

  const section = $derived('/' + ($route.path.split('/')[1] ?? ''));
  const isForm = $derived(section === '/documents');
  const formKind = $derived($route.params.get('kind'));

  function isActive(path: string): boolean {
    if (path === section) return true;
    if (!isForm) return false;
    // Highlight the list a document belongs to while editing it.
    return (path === '/sales' && formKind === 'sale') || (path === '/purchases' && formKind === 'purchase');
  }

  const [bookings, reports, manage] = NAV;
  const tabs: NavItem[] = [bookings.items[0], bookings.items[1]];
  const tabsRight: NavItem[] = [bookings.items[2]];
  const moreActive = $derived([...reports.items, ...manage.items].some((i) => isActive(i.path)));

  const wipeReason = takeWipeReason();
  let wipeNotice = $state(wipeReason ? t(`sync.wipe.${wipeReason}` as MessageKey) : '');
  // Refresh "2 min geleden" in the sidebar.
  let tick = $state(0);
  setInterval(() => tick++, 30_000);
  const syncText = $derived(tick >= 0 ? statusText($syncStatus) : "");
  const syncProblem = $derived(['offline', 'error', 'signedOut'].includes($syncStatus.state));

  // First start: show the wizard, unless this device already has data or is connected to an account.
  let onboarding = $state<boolean | null>(account || isOnboarded() ? false : null);
  onMount(async () => {
    if (onboarding !== null) return;
    if (await hasOwnData(db)) {
      markOnboarded();
      onboarding = false;
    } else {
      onboarding = true;
    }
  });

  function closeMenus() {
    quickAddOpen = newMenuOpen = moreOpen = false;
  }
</script>

<svelte:window onhashchange={closeMenus} />

{#if $locked}
  <LockScreen />
{:else if onboarding === null}
  <!-- checking for existing data -->
{:else if onboarding}
  <Onboarding ondone={() => (onboarding = false)} />
{:else}
<div class="layout" class:is-form={isForm}>
  <aside class="sidebar" aria-label="Menu">
    <a class="brand" href="#/">
      <img src="./favicon.svg" alt="" width="34" height="34" />
      <span>
        <strong>{t('app.name')}</strong>
        <span class="muted small">{$settings.businessName || t('app.tagline')}</span>
      </span>
    </a>

    <div class="new-wrap">
      <button class="primary new-button" onclick={() => (newMenuOpen = !newMenuOpen)} aria-expanded={newMenuOpen}>
        <Plus size={18} />{t('nav.new')}
      </button>
      {#if newMenuOpen}
        <div class="new-menu">
          <QuickAddOptions onselect={closeMenus} />
        </div>
      {/if}
    </div>

    <nav>
      {#each NAV as group}
        <div class="group-label">{t(group.label)}</div>
        {#each group.items as item}
          <a href={'#' + item.path} class="nav-link" class:active={isActive(item.path)}>
            <item.icon size={18} strokeWidth={isActive(item.path) ? 2.25 : 1.75} />
            {t(item.label)}
          </a>
        {/each}
      {/each}
    </nav>

    <a class="storage" class:problem={syncProblem} href="#/settings">
      {#if !account}<HardDrive size={16} />{:else if syncProblem}<CloudOff size={16} />{:else}<Cloud size={16} />{/if}
      <span>
        {account ? syncText : t('nav.localData')}
        <span class="muted">{account ? t('nav.syncHint') : t('nav.backupHint')} →</span>
      </span>
    </a>
    <div class="version" title={versionTitle()}>{t('app.version', { version: APP_VERSION })}</div>
  </aside>

  <main>
    {#if account?.support}
      <div class="notice support-banner">
        <span>{t('support.banner', { name: account.tenantName, time: new Date(account.support.expiresAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) })}</span>
        <button onclick={() => signOut()}>{t('support.end')}</button>
      </div>
    {:else if account?.deviceMode === 'shared'}
      <p class="notice info">{t('sync.sharedBanner')}</p>
    {/if}
    {#if wipeNotice}
      <p class="notice info banner">
        <span>{wipeNotice}</span>
        <button class="ghost icon-button" aria-label={t('common.close')} onclick={() => (wipeNotice = '')}><X size={18} /></button>
      </p>
    {/if}
    {#if $syncStatus.conflicts || $syncStatus.rejected}
      <div class="notice banner">
        <span>
          {#if $syncStatus.conflicts}{t('sync.conflicts', { count: $syncStatus.conflicts })}{/if}
          {#if $syncStatus.rejected}{t('sync.rejected', { count: $syncStatus.rejected })}{/if}
        </span>
        <button class="ghost icon-button" aria-label={t('common.close')} onclick={dismissNotices}><X size={18} /></button>
      </div>
    {/if}
    {#if $route.path === '/'}
      <Dashboard />
    {:else if $route.path === '/sales'}
      <DocumentList kind="sale" />
    {:else if $route.path === '/purchases'}
      <DocumentList kind="purchase" />
    {:else if isForm}
      {#key $route.path + $route.params.toString()}
        <DocumentForm
          id={$route.path.split('/')[2]}
          kind={formKind === 'purchase' ? 'purchase' : 'sale'}
          correctId={$route.params.get('correct')}
        />
      {/key}
    {:else if $route.path === '/vat'}
      <VatReturnPage />
    {:else if $route.path === '/annual'}
      <AnnualReportPage />
    {:else if $route.path === '/assets'}
      <AssetsPage />
    {:else if $route.path === '/stock'}
      <StockPage />
    {:else if $route.path === '/settings'}
      <SettingsPage />
    {:else}
      <Dashboard />
    {/if}
  </main>

  <nav class="tabbar" aria-label="Menu">
    {#each tabs as item}
      <a href={'#' + item.path} class:active={isActive(item.path)}>
        <item.icon size={22} strokeWidth={isActive(item.path) ? 2.25 : 1.75} /><span>{t(item.label)}</span>
      </a>
    {/each}
    <div class="fab-slot">
      <button class="fab" aria-label={t('nav.new')} onclick={() => (quickAddOpen = true)}><Plus size={26} strokeWidth={2.5} /></button>
    </div>
    {#each tabsRight as item}
      <a href={'#' + item.path} class:active={isActive(item.path)}>
        <item.icon size={22} strokeWidth={isActive(item.path) ? 2.25 : 1.75} /><span>{t(item.label)}</span>
      </a>
    {/each}
    <button class="tab-button" class:active={moreActive} onclick={() => (moreOpen = true)}>
      <Ellipsis size={22} /><span>{t('nav.more')}</span>
    </button>
  </nav>
</div>

<Sheet bind:open={quickAddOpen} title={t('quick.title')}>
  <QuickAddOptions onselect={closeMenus} />
</Sheet>

<Sheet bind:open={moreOpen} title={t('nav.more')}>
  {#each [reports, manage] as group}
    <div class="group-label">{t(group.label)}</div>
    <div class="more-grid">
      {#each group.items as item}
        <a href={'#' + item.path} class="more-item" class:active={isActive(item.path)}>
          <span class="more-icon"><item.icon size={22} /></span>
          {t(item.label)}
        </a>
      {/each}
    </div>
  {/each}
</Sheet>

{#if newMenuOpen}
  <div class="click-away" onclick={() => (newMenuOpen = false)} aria-hidden="true"></div>
{/if}
{/if}

<UpdatePrompt />

<style>
  .layout {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    min-height: 100dvh;
  }
  main {
    padding: 32px 40px 64px;
    max-width: 1160px;
    width: 100%;
    min-width: 0;
    margin: 0 auto;
  }

  /* ---------- Sidebar ---------- */
  .version {
    padding: 10px 8px 0;
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .sidebar {
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow-y: auto;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 20px 14px;
    display: flex;
    flex-direction: column;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 20px;
    color: var(--text);
    text-decoration: none;
  }
  .brand img {
    border-radius: 9px;
  }
  .brand > span {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }
  .brand strong {
    font-size: 1.05rem;
    letter-spacing: -0.01em;
  }
  .brand .muted {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .new-wrap {
    position: relative;
    margin-bottom: 12px;
  }
  .new-button {
    width: 100%;
  }
  .new-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 320px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow-lg);
    padding: 6px;
    z-index: 31;
  }
  .click-away {
    position: fixed;
    inset: 0;
    z-index: 30;
  }
  .group-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    padding: 16px 10px 6px;
  }
  .nav-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    margin-bottom: 2px;
    border-radius: 8px;
    color: var(--text-2);
    text-decoration: none;
    font-weight: 500;
  }
  .nav-link:hover {
    background: var(--hover);
    color: var(--text);
  }
  .nav-link.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .storage {
    margin-top: auto;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px;
    border-radius: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 500;
  }
  .storage > span {
    display: flex;
    flex-direction: column;
  }
  .storage :global(svg) {
    margin-top: 2px;
    color: var(--positive);
  }
  .storage.problem :global(svg) {
    color: var(--warning);
  }
  .banner {
    justify-content: space-between;
    align-items: center;
  }
  .support-banner {
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 500;
    position: sticky;
    top: 8px;
    z-index: 15;
  }

  /* ---------- Bottom tab bar (tablet & phone) ---------- */
  .tabbar {
    display: none;
  }
  .more-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .more-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 4px;
    border-radius: 14px;
    color: var(--text-2);
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 500;
    text-align: center;
  }
  .more-item:hover {
    background: var(--hover);
  }
  .more-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--hover);
  }
  .more-item.active {
    color: var(--accent);
  }
  .more-item.active .more-icon {
    background: var(--accent-soft);
  }

  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .sidebar {
      display: none;
    }
    main {
      padding: calc(20px + env(safe-area-inset-top)) 16px calc(var(--tabbar-height) + 32px + env(safe-area-inset-bottom));
    }
    .tabbar {
      display: flex;
      align-items: stretch;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: calc(var(--tabbar-height) + env(safe-area-inset-bottom));
      padding-bottom: env(safe-area-inset-bottom);
      background: color-mix(in srgb, var(--surface) 88%, transparent);
      backdrop-filter: saturate(180%) blur(16px);
      -webkit-backdrop-filter: saturate(180%) blur(16px);
      border-top: 1px solid var(--border);
      z-index: 20;
    }
    .tabbar > a,
    .tab-button {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 6px 2px;
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--muted);
      text-decoration: none;
      background: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      min-height: 0;
    }
    .tabbar > .active {
      color: var(--accent);
      font-weight: 600;
    }
    .fab-slot {
      flex: 1;
      display: grid;
      place-items: center;
    }
    .fab {
      width: 54px;
      height: 54px;
      border-radius: 18px;
      padding: 0;
      margin-top: -22px;
      background: var(--accent);
      border: 0;
      color: var(--accent-text);
      box-shadow: 0 8px 20px -4px color-mix(in srgb, var(--accent) 55%, transparent);
    }
    .fab:hover {
      background: var(--accent-hover);
    }
    /* While entering a document the form has its own action bar. */
    .is-form .tabbar {
      display: none;
    }
    .is-form main {
      padding-bottom: calc(120px + env(safe-area-inset-bottom));
    }
  }
</style>

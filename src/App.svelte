<script lang="ts">
  import { route } from './lib/router';
  import { t, type MessageKey } from './lib/i18n';
  import Dashboard from './lib/pages/Dashboard.svelte';
  import DocumentList from './lib/pages/DocumentList.svelte';
  import DocumentForm from './lib/pages/DocumentForm.svelte';
  import VatReturnPage from './lib/pages/VatReturnPage.svelte';
  import AnnualReportPage from './lib/pages/AnnualReportPage.svelte';
  import AssetsPage from './lib/pages/AssetsPage.svelte';
  import StockPage from './lib/pages/StockPage.svelte';
  import SettingsPage from './lib/pages/SettingsPage.svelte';
  import UpdatePrompt from './lib/ui/UpdatePrompt.svelte';

  interface NavItem {
    path: string;
    label: MessageKey;
    icon: string;
    primary?: boolean;
  }
  const nav: NavItem[] = [
    { path: '/', label: 'nav.dashboard', icon: '⌂', primary: true },
    { path: '/sales', label: 'nav.sales', icon: '↗', primary: true },
    { path: '/purchases', label: 'nav.purchases', icon: '↙', primary: true },
    { path: '/vat', label: 'nav.vat', icon: '%', primary: true },
    { path: '/annual', label: 'nav.annual', icon: '▤' },
    { path: '/assets', label: 'nav.assets', icon: '⟲' },
    { path: '/stock', label: 'nav.stock', icon: '▦' },
    { path: '/settings', label: 'nav.settings', icon: '⚙' },
  ];

  let moreOpen = $state(false);

  const section = $derived('/' + ($route.path.split('/')[1] ?? ''));
  const isActive = (path: string) =>
    path === section ||
    (section === '/documents' &&
      ((path === '/sales' && $route.params.get('kind') === 'sale') ||
        (path === '/purchases' && $route.params.get('kind') === 'purchase')));
  const moreActive = $derived(nav.some((n) => !n.primary && isActive(n.path)));
</script>

<div class="layout">
  <nav class="sidebar" aria-label="Menu">
    <div class="brand">{t('app.name')}</div>
    {#each nav as item}
      <a href={'#' + item.path} class:active={isActive(item.path)}>
        <span class="icon" aria-hidden="true">{item.icon}</span>{t(item.label)}
      </a>
    {/each}
  </nav>

  <main>
    {#if $route.path === '/'}
      <Dashboard />
    {:else if $route.path === '/sales'}
      <DocumentList kind="sale" />
    {:else if $route.path === '/purchases'}
      <DocumentList kind="purchase" />
    {:else if $route.path.startsWith('/documents/')}
      {#key $route.path + $route.params.toString()}
        <DocumentForm
          id={$route.path.split('/')[2]}
          kind={$route.params.get('kind') === 'purchase' ? 'purchase' : 'sale'}
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
    {#each nav.filter((n) => n.primary) as item}
      <a href={'#' + item.path} class:active={isActive(item.path)} onclick={() => (moreOpen = false)}>
        <span class="icon" aria-hidden="true">{item.icon}</span><span>{t(item.label)}</span>
      </a>
    {/each}
    <button class:active={moreActive || moreOpen} onclick={() => (moreOpen = !moreOpen)}>
      <span class="icon" aria-hidden="true">⋯</span><span>{t('nav.more')}</span>
    </button>
    {#if moreOpen}
      <div class="more-menu">
        {#each nav.filter((n) => !n.primary) as item}
          <a href={'#' + item.path} class:active={isActive(item.path)} onclick={() => (moreOpen = false)}>
            <span class="icon" aria-hidden="true">{item.icon}</span>{t(item.label)}
          </a>
        {/each}
      </div>
    {/if}
  </nav>
</div>

<UpdatePrompt />

<style>
  .layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100dvh;
  }
  main {
    padding: 24px 32px 48px;
    max-width: 1100px;
    width: 100%;
    min-width: 0;
  }
  .sidebar {
    position: sticky;
    top: 0;
    height: 100dvh;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 16px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .brand {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--accent);
    padding: 8px 12px 16px;
  }
  .sidebar a,
  .more-menu a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--text);
    text-decoration: none;
  }
  .sidebar a:hover {
    background: var(--hover);
  }
  .sidebar a.active,
  .more-menu a.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .icon {
    width: 1.4em;
    text-align: center;
    font-size: 1.1em;
  }
  .tabbar {
    display: none;
  }

  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .sidebar {
      display: none;
    }
    main {
      padding: 16px 16px calc(88px + env(safe-area-inset-bottom));
    }
    .tabbar {
      display: flex;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding-bottom: env(safe-area-inset-bottom);
      z-index: 20;
    }
    .tabbar > a,
    .tabbar > button {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 2px;
      font-size: 0.72rem;
      color: var(--muted);
      text-decoration: none;
      background: none;
      border: 0;
      min-height: 56px;
    }
    .tabbar > .active {
      color: var(--accent);
      font-weight: 600;
    }
    .tabbar .icon {
      font-size: 1.3rem;
    }
    .more-menu {
      position: absolute;
      bottom: 100%;
      right: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 6px;
      min-width: 220px;
    }
  }
</style>

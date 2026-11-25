<script lang="ts">
  import { onMount } from 'svelte';
  import LogOut from '@lucide/svelte/icons/log-out';
  import { adminApi, setSignedOutHandler } from './api';
  import type { AdminMe } from './protocol';
  import Login from './Login.svelte';
  import Overview from './Overview.svelte';
  import Users from './Users.svelte';
  import Tenants from './Tenants.svelte';
  import Invites from './Invites.svelte';
  import AuditLog from './AuditLog.svelte';

  const TABS = [
    { id: 'overview', label: 'Overzicht' },
    { id: 'users', label: 'Gebruikers' },
    { id: 'tenants', label: 'Administraties' },
    { id: 'invites', label: 'Uitnodigingen' },
    { id: 'audit', label: 'Logboek' },
  ] as const;
  type Tab = (typeof TABS)[number]['id'];

  let me = $state<AdminMe | null>(null);
  let checking = $state(true);
  let expired = $state(false);
  let tab = $state<Tab>(readTab());

  function readTab(): Tab {
    const id = location.hash.replace('#/', '');
    return (TABS.find((t) => t.id === id)?.id ?? 'overview') as Tab;
  }

  onMount(async () => {
    setSignedOutHandler(() => {
      me = null;
      expired = true;
    });
    me = await adminApi.me().catch(() => null);
    checking = false;
  });

  async function logout() {
    await adminApi.logout().catch(() => {});
    me = null;
  }
</script>

<svelte:window onhashchange={() => (tab = readTab())} />

{#if checking}
  <!-- checking the session -->
{:else if !me}
  <Login
    {expired}
    onlogin={(m) => {
      me = m;
      expired = false;
    }}
  />
{:else}
  <header>
    <div class="brand">
      <img src="./favicon.svg" alt="" width="30" height="30" />
      <strong>InBalans</strong><span class="badge accent">beheer</span>
    </div>
    <nav>
      {#each TABS as t}
        <a href={`#/${t.id}`} class:active={tab === t.id}>{t.label}</a>
      {/each}
    </nav>
    <div class="who">
      <span class="muted small">{me.email}</span>
      <button class="ghost" onclick={logout}><LogOut size={16} />Uitloggen</button>
    </div>
  </header>
  <main>
    {#if tab === 'overview'}
      <Overview />
    {:else if tab === 'users'}
      <Users />
    {:else if tab === 'tenants'}
      <Tenants />
    {:else if tab === 'invites'}
      <Invites />
    {:else}
      <AuditLog />
    {/if}
  </main>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding: 12px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .brand img {
    border-radius: 8px;
  }
  nav {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  nav a {
    padding: 6px 12px;
    border-radius: 8px;
    color: var(--text-2);
    text-decoration: none;
    font-weight: 500;
  }
  nav a:hover {
    background: var(--hover);
  }
  nav a.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .who {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 16px 64px;
  }
</style>

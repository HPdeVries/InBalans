<script lang="ts">
  import { onMount } from 'svelte';
  import Search from '@lucide/svelte/icons/search';
  import { adminApi, errorText } from './api';
  import type { AdminUser } from './protocol';
  import { ago, bytes, count, fmtDate } from './format';
  import UserDetail from './UserDetail.svelte';

  let users = $state<AdminUser[] | null>(null);
  let error = $state('');
  let search = $state('');
  let selected = $state<string | null>(null);

  async function load() {
    try {
      users = await adminApi.users();
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  const filtered = $derived(
    (users ?? []).filter((u) => {
      const q = search.trim().toLowerCase();
      return !q || u.email.includes(q) || (u.tenant?.name ?? '').toLowerCase().includes(q);
    }),
  );
</script>

<div class="head">
  <h1>Gebruikers</h1>
  <div class="search">
    <Search size={18} />
    <input type="search" placeholder="Zoek op e-mail of administratie" bind:value={search} />
  </div>
</div>
{#if error}<p class="notice">{error}</p>{/if}
{#if users}
  <section class="card flush">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>E-mail</th>
            <th>Administratie</th>
            <th>Laatst gezien</th>
            <th class="num">Apparaten</th>
            <th class="num">Records</th>
            <th class="num">Opslag</th>
            <th>Sinds</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as u (u.id)}
            <tr class="clickable" onclick={() => (selected = u.id)}>
              <td><button class="link" onclick={() => (selected = u.id)}>{u.email}</button></td>
              <td>{u.tenant?.name ?? '—'}</td>
              <td class="nowrap">{ago(u.lastSeenAt)}</td>
              <td class="num">{u.activeDevices}</td>
              <td class="num">{count(u.storage?.records)}</td>
              <td class="num nowrap">{bytes(u.storage?.databaseBytes)}</td>
              <td class="nowrap">{fmtDate(u.createdAt)}</td>
              <td>
                {#if u.blockedAt}<span class="badge negative">Geblokkeerd</span>{:else}<span class="badge positive">Actief</span>{/if}
              </td>
            </tr>
          {:else}
            <tr><td colspan="8" class="muted">Geen gebruikers gevonden.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{:else if !error}
  <p class="muted">Laden…</p>
{/if}

{#if selected}
  <UserDetail
    id={selected}
    onclose={() => (selected = null)}
    onchange={load}
  />
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
  }
  .search {
    position: relative;
    width: min(340px, 100%);
  }
  .search :global(svg) {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
  }
  .search input {
    padding-left: 38px;
  }
  .clickable {
    cursor: pointer;
  }
  .clickable:hover {
    background: var(--surface-2);
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    min-height: 0;
    box-shadow: none;
    color: var(--accent);
    font-weight: 550;
    text-align: left;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .nowrap {
    white-space: nowrap;
  }
</style>

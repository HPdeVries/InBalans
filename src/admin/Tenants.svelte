<script lang="ts">
  import { onMount } from 'svelte';
  import Search from '@lucide/svelte/icons/search';
  import { adminApi, errorText } from './api';
  import type { AdminTenant } from './protocol';
  import { ago, bytes, count, fmtDate, fmtDateTime } from './format';
  import TenantDetail from './TenantDetail.svelte';

  let tenants = $state<AdminTenant[] | null>(null);
  let error = $state('');
  let search = $state('');
  let selected = $state<string | null>(null);

  async function load() {
    try {
      tenants = await adminApi.tenants();
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  const filtered = $derived(
    (tenants ?? []).filter((t) => {
      const q = search.trim().toLowerCase();
      return !q || t.name.toLowerCase().includes(q) || (t.owner?.email ?? '').includes(q);
    }),
  );
</script>

<div class="head">
  <h1>Administraties</h1>
  <div class="search">
    <Search size={18} />
    <input type="search" placeholder="Zoek op naam of eigenaar" bind:value={search} />
  </div>
</div>
<p class="muted">Gesynchroniseerde administraties. Alleen aantallen en grootte; inhoud is alleen zichtbaar via meekijken met toestemming van de eigenaar.</p>
{#if error}<p class="notice">{error}</p>{/if}
{#if tenants}
  <section class="card flush">
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Administratie</th>
            <th>Eigenaar</th>
            <th class="num">Records</th>
            <th class="num">Database</th>
            <th>Laatste wijziging</th>
            <th>Sinds</th>
            <th>Meekijken</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as t (t.id)}
            <tr class="clickable" onclick={() => (selected = t.id)}>
              <td><button class="link" onclick={() => (selected = t.id)}>{t.name}</button></td>
              <td>{t.owner?.email ?? '—'}</td>
              <td class="num">{count(t.storage?.records)}</td>
              <td class="num nowrap">{bytes(t.storage?.databaseBytes)}</td>
              <td class="nowrap">{ago(t.storage?.lastChange)}</td>
              <td class="nowrap">{fmtDate(t.createdAt)}</td>
              <td>
                {#if t.supportUntil}<span class="badge accent" title={`tot ${fmtDateTime(t.supportUntil)}`}>Toegestaan</span>{:else}<span class="muted small">—</span>{/if}
              </td>
            </tr>
          {:else}
            <tr><td colspan="7" class="muted">Nog geen administraties.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{:else if !error}
  <p class="muted">Laden…</p>
{/if}

{#if selected}
  <TenantDetail id={selected} onclose={() => (selected = null)} />
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 4px;
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

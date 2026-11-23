<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, errorText } from './api';
  import type { AdminOverview } from './protocol';
  import { bytes, count } from './format';
  import AuditTable from './AuditTable.svelte';

  let data = $state<AdminOverview | null>(null);
  let error = $state('');

  onMount(async () => {
    try {
      data = await adminApi.overview();
    } catch (e) {
      error = errorText(e);
    }
  });
</script>

<h1>Overzicht</h1>
{#if error}<p class="notice">{error}</p>{/if}
{#if data}
  <div class="tiles">
    <div class="tile"><span class="label">Gebruikers</span><span class="value">{count(data.users)}</span><span class="sub">{data.blocked} geblokkeerd</span></div>
    <div class="tile"><span class="label">Actief laatste 7 dagen</span><span class="value">{count(data.active7)}</span><span class="sub">{data.active30} in 30 dagen</span></div>
    <div class="tile"><span class="label">Actieve apparaten</span><span class="value">{count(data.activeDevices)}</span><span class="sub">ingelogde sessies</span></div>
    <div class="tile"><span class="label">Open uitnodigingen</span><span class="value">{count(data.invitesOpen)}</span><span class="sub">nog geen account</span></div>
    <div class="tile"><span class="label">Records in de cloud</span><span class="value">{count(data.records)}</span><span class="sub">{data.tenants} administraties</span></div>
    <div class="tile"><span class="label">Totale opslag</span><span class="value">{bytes(data.databaseBytes)}</span><span class="sub">database per administratie</span></div>
  </div>
  <section class="card flush">
    <h2 class="pad">Recente activiteit</h2>
    <AuditTable entries={data.recent} />
  </section>
{:else if !error}
  <p class="muted">Laden…</p>
{/if}

<style>
  h1 {
    margin: 0 0 16px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 14px 16px;
  }
  .label {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .value {
    font-size: 1.6rem;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .pad {
    padding: 16px 16px 4px;
    margin: 0;
  }
</style>

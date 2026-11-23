<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, errorText } from './api';
  import type { AuditEntry } from './protocol';
  import AuditTable from './AuditTable.svelte';

  let entries = $state<AuditEntry[] | null>(null);
  let error = $state('');
  onMount(async () => {
    try {
      entries = await adminApi.audit();
    } catch (e) {
      error = errorText(e);
    }
  });
</script>

<h1>Logboek</h1>
<p class="muted">De laatste 200 gebeurtenissen: inloggen, afmelden en acties in het beheer.</p>
{#if error}<p class="notice">{error}</p>{/if}
{#if entries}
  <section class="card flush"><AuditTable {entries} /></section>
{/if}

<style>
  h1 {
    margin: 0 0 4px;
  }
</style>

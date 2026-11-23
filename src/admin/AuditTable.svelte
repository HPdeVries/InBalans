<script lang="ts">
  import type { AuditEntry } from './protocol';
  import { actionText, detailText, fmtDateTime } from './format';

  let { entries, showUser = true }: { entries: AuditEntry[]; showUser?: boolean } = $props();
</script>

{#if entries.length === 0}
  <p class="muted pad">Nog geen activiteit.</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Wanneer</th>
          <th>Actie</th>
          {#if showUser}<th>Gebruiker</th>{/if}
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {#each entries as e (e.id)}
          <tr>
            <td class="nowrap">{fmtDateTime(e.at)}</td>
            <td>{actionText(e.action)}</td>
            {#if showUser}<td>{e.userEmail?.endsWith('@deleted.invalid') ? 'Verwijderd account' : (e.userEmail ?? '—')}</td>{/if}
            <td class="muted small">{detailText(e.detail)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .nowrap {
    white-space: nowrap;
  }
  .pad {
    padding: 8px 16px 16px;
  }
</style>

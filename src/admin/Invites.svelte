<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, errorText } from './api';
  import type { Invite } from './protocol';
  import { fmtDate } from './format';

  let invites = $state<Invite[] | null>(null);
  let error = $state('');
  let email = $state('');
  let note = $state('');
  let busy = $state(false);

  async function load() {
    try {
      invites = await adminApi.invites();
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  async function add(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await adminApi.invite(email.trim(), note.trim());
      email = note = '';
      await load();
    } catch (err) {
      error = errorText(err);
    } finally {
      busy = false;
    }
  }

  async function remove(i: Invite) {
    if (!confirm(`Uitnodiging voor ${i.email} intrekken?${i.registered ? ' Het bestaande account blijft werken.' : ''}`)) return;
    await adminApi.uninvite(i.email).catch((e) => (error = errorText(e)));
    await load();
  }
</script>

<h1>Uitnodigingen</h1>
<p class="muted">
  Synchronisatie is alleen beschikbaar op uitnodiging. Een uitgenodigd adres kan in de app een account aanmaken met een
  inlogcode. Er wordt geen e-mail verstuurd: laat de persoon zelf weten dat hij kan inloggen.
</p>

<form class="card add" onsubmit={add}>
  <label>E-mailadres<input type="email" required bind:value={email} /></label>
  <label>Notitie (optioneel)<input bind:value={note} placeholder="bijv. testgebruiker" maxlength="200" /></label>
  <button class="primary" disabled={busy}>Uitnodigen</button>
</form>
{#if error}<p class="notice">{error}</p>{/if}

{#if invites}
  <section class="card flush">
    <div class="table-wrap">
      <table>
        <thead><tr><th>E-mail</th><th>Notitie</th><th>Uitgenodigd</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {#each invites as i (i.email)}
            <tr>
              <td>{i.email}</td>
              <td class="muted">{i.note ?? ''}</td>
              <td>{fmtDate(i.createdAt)}</td>
              <td>{#if i.registered}<span class="badge positive">Account actief</span>{:else}<span class="badge">Nog niet ingelogd</span>{/if}</td>
              <td class="right"><button class="ghost danger" onclick={() => remove(i)}>Intrekken</button></td>
            </tr>
          {:else}
            <tr><td colspan="5" class="muted">Nog geen uitnodigingen.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  h1 {
    margin: 0 0 4px;
  }
  .add {
    display: grid;
    grid-template-columns: 2fr 2fr auto;
    gap: 12px;
    align-items: end;
    margin-top: 16px;
  }
  @media (max-width: 700px) {
    .add {
      grid-template-columns: 1fr;
    }
  }
  .right {
    text-align: right;
  }
</style>

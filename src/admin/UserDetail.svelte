<script lang="ts">
  import { onMount } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { adminApi, errorText } from './api';
  import type { AdminUserDetail } from './protocol';
  import { ago, bytes, count, fmtDateTime, TABLE_NAMES } from './format';
  import AuditTable from './AuditTable.svelte';

  let { id, onclose, onchange }: { id: string; onclose: () => void; onchange: () => void } = $props();

  let user = $state<AdminUserDetail | null>(null);
  let error = $state('');
  let message = $state('');
  let busy = $state(false);
  let confirmDelete = $state(false);
  let confirmEmail = $state('');

  async function load() {
    try {
      user = await adminApi.user(id);
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  async function act(fn: () => Promise<unknown>, done: string, after?: () => void) {
    busy = true;
    error = message = '';
    try {
      await fn();
      message = done;
      onchange();
      if (after) after();
      else await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  function signOutAll() {
    if (!confirm('Alle apparaten van deze gebruiker afmelden? De gegevens op die apparaten worden gewist bij hun volgende contact; in de cloud blijft alles bewaard.')) return;
    void act(() => adminApi.signOutAll(id), 'Alle apparaten zijn afgemeld.');
  }
  function block() {
    if (!confirm('Account blokkeren? Alle apparaten worden afgemeld (zonder hun gegevens te wissen) en inloggen wordt geweigerd tot je deblokkeert.')) return;
    void act(() => adminApi.block(id), 'Account geblokkeerd.');
  }
  function unblock() {
    void act(() => adminApi.unblock(id), 'Account gedeblokkeerd. De gebruiker kan weer inloggen.');
  }
  function remove(e: SubmitEvent) {
    e.preventDefault();
    void act(() => adminApi.deleteUser(id, confirmEmail), 'Account verwijderd.', onclose);
  }

  const modeText = (m: string) => (m === 'own' ? 'eigen apparaat' : m === 'shared' ? 'gedeeld apparaat' : m);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<div class="drawer" role="dialog" aria-modal="true" aria-label="Gebruiker">
  <div class="top">
    <h2>{user?.email ?? 'Gebruiker'}</h2>
    <button class="ghost icon-button" aria-label="Sluiten" onclick={onclose}><X size={20} /></button>
  </div>

  {#if error}<p class="notice">{error}</p>{/if}
  {#if message}<p class="notice info">{message}</p>{/if}

  {#if user}
    <dl class="facts">
      <dt>Status</dt>
      <dd>{#if user.blockedAt}<span class="badge negative">Geblokkeerd sinds {fmtDateTime(user.blockedAt)}</span>{:else}<span class="badge positive">Actief</span>{/if}</dd>
      <dt>Account sinds</dt><dd>{fmtDateTime(user.createdAt)}</dd>
      <dt>Laatst gezien</dt><dd>{fmtDateTime(user.lastSeenAt)} ({ago(user.lastSeenAt)})</dd>
      <dt>Inlogmethoden</dt><dd>{user.identities.map((i) => i.provider).join(', ') || '—'}</dd>
      <dt>Administratie</dt><dd>{user.tenant?.name ?? '—'}</dd>
      <dt>Laatste wijziging</dt><dd>{fmtDateTime(user.storage?.lastChange)}</dd>
      <dt>Opslag</dt><dd>{bytes(user.storage?.databaseBytes)} · {count(user.storage?.records)} records · revisie {count(user.storage?.rev)}</dd>
      <dt>Conflicten bewaard</dt><dd>{count(user.storage?.conflicts)}</dd>
    </dl>

    <h3>Opslag per soort</h3>
    {#if user.tables.length}
      <table>
        <thead><tr><th>Soort</th><th class="num">Records</th><th class="num">Verwijderd</th><th class="num">Grootte</th></tr></thead>
        <tbody>
          {#each user.tables as t}
            <tr>
              <td>{TABLE_NAMES[t.tbl] ?? t.tbl}</td>
              <td class="num">{count(t.records)}</td>
              <td class="num">{count(t.deleted)}</td>
              <td class="num">{bytes(t.bytes)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Nog niets gesynchroniseerd.</p>
    {/if}

    <h3>Apparaten</h3>
    {#if user.devices.length}
      <table>
        <thead><tr><th>Apparaat</th><th>Soort</th><th>Laatst gezien</th><th>Status</th></tr></thead>
        <tbody>
          {#each user.devices as d (d.id)}
            <tr>
              <td>{d.deviceName}</td>
              <td>{modeText(d.deviceMode)}</td>
              <td class="nowrap">{ago(d.lastSeenAt)}</td>
              <td>
                {#if d.revokedAt}<span class="badge">{d.revokedReason === 'blocked' ? 'geblokkeerd' : 'afgemeld'}</span>
                {:else if Date.parse(d.expiresAt) < Date.now()}<span class="badge">verlopen</span>
                {:else}<span class="badge positive">actief</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Geen apparaten.</p>
    {/if}

    <h3>Acties</h3>
    <div class="actions">
      <button disabled={busy || !user.activeDevices} onclick={signOutAll}>Alle apparaten afmelden</button>
      {#if user.blockedAt}
        <button disabled={busy} onclick={unblock}>Deblokkeren</button>
      {:else}
        <button disabled={busy} onclick={block}>Blokkeren</button>
      {/if}
      <button class="danger" disabled={busy} onclick={() => (confirmDelete = true)}>Account verwijderen</button>
    </div>

    {#if confirmDelete}
      <form class="delete" onsubmit={remove}>
        <p>
          <strong>Definitief verwijderen.</strong> De boekhoudgegevens in de cloud worden gewist, alle apparaten worden afgemeld en
          wissen hun kopie bij het volgende contact. Dit kan niet ongedaan worden gemaakt.
        </p>
        <label>Typ het e-mailadres van de gebruiker ter bevestiging<input bind:value={confirmEmail} autocomplete="off" /></label>
        <div class="actions">
          <button type="button" onclick={() => (confirmDelete = false)}>Annuleren</button>
          <button class="danger" disabled={busy || confirmEmail.trim().toLowerCase() !== user.email}>Definitief verwijderen</button>
        </div>
      </form>
    {/if}

    <h3>Activiteit</h3>
    <AuditTable entries={user.audit} showUser={false} />
  {:else if !error}
    <p class="muted">Laden…</p>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(16, 24, 40, 0.4);
    z-index: 40;
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(720px, 100vw);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    z-index: 41;
    overflow-y: auto;
    padding: 20px 24px 48px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h2 {
    margin: 0;
    word-break: break-all;
  }
  h3 {
    margin: 24px 0 8px;
    font-size: 0.95rem;
  }
  .facts {
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 6px 12px;
    margin: 16px 0 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .nowrap {
    white-space: nowrap;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .delete {
    margin-top: 12px;
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--negative) 35%, var(--border));
    border-radius: var(--radius);
    background: var(--negative-soft);
  }
  .delete p {
    margin: 0;
  }
  @media (max-width: 600px) {
    .facts {
      grid-template-columns: 1fr;
    }
    dt {
      margin-top: 6px;
    }
  }
</style>

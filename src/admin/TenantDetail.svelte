<script lang="ts">
  import { onMount } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import Eye from '@lucide/svelte/icons/eye';
  import { adminApi, errorText } from './api';
  import type { AdminTenantDetail } from './protocol';
  import { ago, bytes, count, fmtDate, fmtDateTime, TABLE_NAMES } from './format';
  import AuditTable from './AuditTable.svelte';

  let { id, onclose }: { id: string; onclose: () => void } = $props();

  let t = $state<AdminTenantDetail | null>(null);
  let error = $state('');
  let busy = $state(false);

  async function load() {
    try {
      t = await adminApi.tenant(id);
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  /** Bookings per year: { year, sale, purchase } */
  const years = $derived.by(() => {
    const map = new Map<string, { year: string; sale: number; purchase: number }>();
    for (const b of t?.metrics?.bookings ?? []) {
      const row = map.get(b.year) ?? { year: b.year, sale: 0, purchase: 0 };
      if (b.kind === 'sale') row.sale += b.count;
      else row.purchase += b.count;
      map.set(b.year, row);
    }
    return [...map.values()];
  });

  async function lookAlong() {
    // Open the window first (popup blockers allow it only directly on the click), then send it to the app.
    const win = window.open('about:blank', '_blank');
    busy = true;
    error = '';
    try {
      const { url } = await adminApi.startSupport(id);
      if (win) {
        win.opener = null;
        win.location.href = url;
      }
      else location.href = url;
      await load();
    } catch (e) {
      win?.close();
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const modeText = (m: string) => (m === 'own' ? 'eigen apparaat' : m === 'shared' ? 'gedeeld apparaat' : m);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<div class="drawer" role="dialog" aria-modal="true" aria-label="Administratie">
  <div class="top">
    <h2>{t?.name ?? 'Administratie'}</h2>
    <button class="ghost icon-button" aria-label="Sluiten" onclick={onclose}><X size={20} /></button>
  </div>
  {#if error}<p class="notice">{error}</p>{/if}

  {#if t}
    <section class="support" class:allowed={!!t.supportUntil}>
      {#if t.supportUntil}
        <p><strong>Meekijken toegestaan</strong> tot {fmtDateTime(t.supportUntil)}.</p>
        <p class="muted small">Opent de app in een nieuw venster, alleen-lezen. De eigenaar krijgt hiervan een e-mail.</p>
        <button class="primary" disabled={busy} onclick={lookAlong}><Eye size={18} />Meekijken</button>
      {:else}
        <p><strong>Meekijken niet toegestaan.</strong> De eigenaar kan dit in de app aanzetten via Instellingen → Ondersteuning op afstand.</p>
      {/if}
      {#if t.supportLastViewedAt}<p class="muted small">Laatst meegekeken: {fmtDateTime(t.supportLastViewedAt)}</p>{/if}
    </section>

    <dl class="facts">
      <dt>Eigenaar</dt><dd>{t.owner?.email ?? '—'}</dd>
      <dt>Aangemaakt</dt><dd>{fmtDateTime(t.createdAt)}</dd>
      <dt>Status</dt><dd>{t.status}</dd>
      <dt>Database</dt><dd>{bytes(t.storage?.databaseBytes)}</dd>
      <dt>Records</dt><dd>{count(t.storage?.records)} · revisie {count(t.storage?.rev)}</dd>
      <dt>Conflicten bewaard</dt><dd>{count(t.storage?.conflicts)}</dd>
      <dt>Laatste wijziging</dt><dd>{fmtDateTime(t.storage?.lastChange)} ({ago(t.storage?.lastChange)})</dd>
      <dt>Laatste boeking</dt><dd>{fmtDate(t.metrics?.lastBookingDate)}</dd>
      <dt>Afgesloten t/m</dt><dd>{fmtDate(t.metrics?.lockedThrough)}</dd>
      <dt>Jaararchief gedownload</dt><dd>{t.metrics?.archiveYears.join(', ') || '—'}</dd>
      <dt>Overig</dt>
      <dd>
        {count(t.metrics?.categories)} categorieën · {count(t.metrics?.manualAssets)} activa · {count(t.metrics?.stockCounts)} voorraadtellingen ·
        {count(t.metrics?.cashBookings)} boekingen via kas
      </dd>
    </dl>

    <h3>Boekingen per jaar</h3>
    {#if years.length}
      <table>
        <thead><tr><th>Jaar</th><th class="num">Verkopen</th><th class="num">Inkopen</th><th class="num">Totaal</th></tr></thead>
        <tbody>
          {#each years as y}
            <tr><td>{y.year}</td><td class="num">{count(y.sale)}</td><td class="num">{count(y.purchase)}</td><td class="num">{count(y.sale + y.purchase)}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Nog geen boekingen.</p>
    {/if}

    <h3>Opslag per soort</h3>
    {#if t.tables.length}
      <table>
        <thead><tr><th>Soort</th><th class="num">Records</th><th class="num">Verwijderd</th><th class="num">Grootte</th></tr></thead>
        <tbody>
          {#each t.tables as tb}
            <tr><td>{TABLE_NAMES[tb.tbl] ?? tb.tbl}</td><td class="num">{count(tb.records)}</td><td class="num">{count(tb.deleted)}</td><td class="num">{bytes(tb.bytes)}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Nog niets gesynchroniseerd.</p>
    {/if}

    <h3>Gekoppelde apparaten</h3>
    {#if t.devices.length}
      <table>
        <thead><tr><th>Apparaat</th><th>Soort</th><th>Laatst gezien</th></tr></thead>
        <tbody>
          {#each t.devices as d (d.id)}
            <tr><td>{d.deviceName}</td><td>{modeText(d.deviceMode)}</td><td>{ago(d.lastSeenAt)}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">Geen actieve apparaten.</p>
    {/if}

    <h3>Activiteit</h3>
    <AuditTable entries={t.audit} />
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
    width: min(760px, 100vw);
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
  }
  h2 {
    margin: 0;
  }
  h3 {
    margin: 24px 0 8px;
    font-size: 0.95rem;
  }
  .support {
    margin: 16px 0 0;
    padding: 14px;
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .support.allowed {
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  }
  .support p {
    margin: 0 0 8px;
  }
  .facts {
    display: grid;
    grid-template-columns: 190px 1fr;
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
  @media (max-width: 600px) {
    .facts {
      grid-template-columns: 1fr;
    }
  }
</style>

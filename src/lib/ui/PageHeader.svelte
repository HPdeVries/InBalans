<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import { t } from '../i18n';

  let {
    title,
    subtitle,
    backHref,
    actions,
  }: { title: string; subtitle?: string; backHref?: string; actions?: Snippet } = $props();
</script>

<header class="page-header">
  <div class="titles">
    {#if backHref}
      <a class="back" href={backHref}><ChevronLeft size={18} />{t('common.back')}</a>
    {/if}
    <h1>{title}</h1>
    {#if subtitle}<p class="muted">{subtitle}</p>{/if}
  </div>
  {#if actions}
    <div class="page-actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .page-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px 16px;
    margin-bottom: 24px;
  }
  .titles {
    min-width: 0;
  }
  .titles p {
    margin: 4px 0 0;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin: 0 0 8px -4px;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .back:hover {
    color: var(--text);
  }
  .page-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .page-actions :global(select) {
    width: auto;
  }
</style>

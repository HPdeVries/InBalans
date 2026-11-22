<script lang="ts">
  import type { Snippet } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import { fade, fly } from 'svelte/transition';
  import { t } from '../i18n';

  let {
    open = $bindable(false),
    title,
    children,
  }: { open: boolean; title?: string; children: Snippet } = $props();

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <div class="backdrop" transition:fade={{ duration: 150 }} onclick={() => (open = false)} aria-hidden="true"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title} transition:fly={{ y: 40, duration: 200 }}>
    <div class="handle" aria-hidden="true"></div>
    <div class="head">
      {#if title}<h2>{title}</h2>{/if}
      <button class="ghost icon-button" aria-label={t('common.close')} onclick={() => (open = false)}><X size={20} /></button>
    </div>
    {@render children()}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(16, 24, 40, 0.4);
    backdrop-filter: blur(2px);
    z-index: 40;
  }
  .sheet {
    position: fixed;
    z-index: 41;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, calc(100vw - 32px));
    background: var(--surface);
    border-radius: 20px;
    box-shadow: var(--shadow-lg);
    padding: 16px 20px 20px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .head h2 {
    margin: 0;
  }
  .handle {
    display: none;
  }
  @media (max-width: 900px) {
    .sheet {
      top: auto;
      bottom: 0;
      left: 0;
      transform: none;
      width: 100%;
      border-radius: 20px 20px 0 0;
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
    }
    .handle {
      display: block;
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--border-strong);
      margin: 0 auto 8px;
    }
  }
</style>

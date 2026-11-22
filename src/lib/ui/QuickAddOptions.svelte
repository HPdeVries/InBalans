<script lang="ts">
  import ReceiptEuro from '@lucide/svelte/icons/receipt-euro';
  import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { t } from '../i18n';

  let { onselect }: { onselect?: () => void } = $props();
</script>

<div class="options">
  <a href="#/documents/new?kind=sale" onclick={onselect}>
    <span class="tile sale"><ReceiptEuro size={22} /></span>
    <span class="text"><strong>{t('quick.sale')}</strong><span class="muted small">{t('quick.saleHint')}</span></span>
    <ChevronRight size={18} class="chev" />
  </a>
  <a href="#/documents/new?kind=purchase" onclick={onselect}>
    <span class="tile purchase"><ShoppingBag size={22} /></span>
    <span class="text"><strong>{t('quick.purchase')}</strong><span class="muted small">{t('quick.purchaseHint')}</span></span>
    <ChevronRight size={18} class="chev" />
  </a>
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  a {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px;
    border-radius: 12px;
    color: var(--text);
    text-decoration: none;
  }
  a:hover {
    background: var(--hover);
  }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .tile {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    flex-shrink: 0;
  }
  .tile.sale {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .tile.purchase {
    background: var(--info-soft);
    color: var(--info);
  }
  a :global(.chev) {
    color: var(--muted);
  }
</style>

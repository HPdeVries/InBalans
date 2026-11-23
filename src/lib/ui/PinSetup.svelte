<script lang="ts">
  import { t } from '../i18n';
  import { PIN_PATTERN } from '../security/pin';

  let {
    submitLabel,
    onsave,
    children,
  }: { submitLabel: string; onsave: (pin: string) => Promise<void> | void; children?: import('svelte').Snippet } = $props();

  let pin = $state('');
  let repeat = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!PIN_PATTERN.test(pin)) return void (error = t('pin.invalid'));
    if (pin !== repeat) return void (error = t('pin.mismatch'));
    error = '';
    busy = true;
    try {
      await onsave(pin);
      pin = repeat = '';
    } finally {
      busy = false;
    }
  }
</script>

<form class="pin-setup" onsubmit={submit}>
  <label>
    {t('pin.new')}
    <input type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" bind:value={pin} />
  </label>
  <label>
    {t('pin.repeat')}
    <input type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" bind:value={repeat} />
  </label>
  {#if error}<p class="error">{error}</p>{/if}
  <div class="actions">
    <button class="primary" disabled={busy}>{submitLabel}</button>
    {@render children?.()}
  </div>
</form>

<style>
  .pin-setup {
    display: grid;
    gap: 12px;
    max-width: 320px;
  }
  .error {
    color: var(--negative);
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>

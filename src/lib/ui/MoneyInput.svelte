<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { formatMoneyPlain, parseMoney, type Cents } from '../domain/money';

  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    value: Cents | null;
    /** When true an empty field yields null instead of 0. */
    nullable?: boolean;
  }
  let { value = $bindable(), nullable = false, ...rest }: Props = $props();

  const format = (v: Cents | null) => (v == null ? '' : formatMoneyPlain(v));
  let focused = $state(false);
  let text = $state(format(value));

  // Reformat whenever the value changes from outside, or when leaving the field.
  $effect(() => {
    const v = value;
    if (!focused) text = format(v);
  });

  function oninput() {
    const parsed = parseMoney(text);
    value = parsed ?? (nullable ? null : 0);
  }
</script>

<input
  {...rest}
  type="text"
  inputmode="decimal"
  autocomplete="off"
  class="money"
  bind:value={text}
  {oninput}
  onfocus={(e) => {
    focused = true;
    e.currentTarget.select();
  }}
  onblur={() => (focused = false)}
/>

<style>
  .money {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>

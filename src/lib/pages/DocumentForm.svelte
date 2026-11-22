<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../db/db';
  import { categories, documents } from '../db/stores';
  import { create, newId, nextInvoiceNumber, remove, save } from '../db/repo';
  import type { BookDocument, Category, DocumentKind, DocumentLine } from '../domain/types';
  import {
    computeDocumentTotals,
    computeLine,
    hasVatAmount,
    VAT_CODES,
    vatCodesFor,
    type VatCode,
  } from '../domain/vat';
  import { formatMoney } from '../domain/money';
  import { today } from '../domain/period';
  import { DEPRECIATION_THRESHOLD, MIN_USEFUL_LIFE_YEARS } from '../domain/depreciation';
  import { t, type MessageKey } from '../i18n';
  import { navigate } from '../router';
  import MoneyInput from '../ui/MoneyInput.svelte';

  let { id, kind: kindParam }: { id: string; kind: DocumentKind } = $props();

  let draft = $state<BookDocument | null>(null);
  let isNew = $state(false);
  let error = $state('');
  let notFound = $state(false);

  const kind = $derived(draft?.kind ?? kindParam);
  const listPath = $derived(kind === 'sale' ? '/sales' : '/purchases');

  const usableCategories = $derived(
    $categories.filter((c) => (kind === 'sale' ? c.kind === 'income' : c.kind !== 'income')),
  );
  const vatOptions = $derived(vatCodesFor(kind));
  const counterparties = $derived(
    [...new Set($documents.filter((d) => d.kind === kind).map((d) => d.counterparty).filter(Boolean))].sort(),
  );
  const needsVatId = $derived(
    !!draft?.lines.some((l) => ['S_EU', 'P_EU_HIGH', 'P_EU_LOW'].includes(l.vatCode)) || !!draft?.counterpartyVatId,
  );
  const totals = $derived(draft ? computeDocumentTotals(draft) : null);
  const selfAssessedVat = $derived(
    draft
      ? draft.lines
          .filter((l) => VAT_CODES[l.vatCode].reverseCharge)
          .reduce((s, l) => s + computeLine(l, draft!.amountsInclVat, draft!.date).vat, 0)
      : 0,
  );

  function categoryById(categoryId: string): Category | undefined {
    return $categories.find((c) => c.id === categoryId);
  }

  function defaultCategory(k: DocumentKind, cats: Category[]): Category | undefined {
    const preferred = k === 'sale' ? 'cat-revenue' : 'cat-materials';
    return (
      cats.find((c) => c.id === preferred && !c.archived) ??
      cats.find((c) => !c.archived && (k === 'sale' ? c.kind === 'income' : c.kind === 'expense'))
    );
  }

  function newLine(k: DocumentKind, cats: Category[]): DocumentLine {
    const cat = defaultCategory(k, cats);
    return {
      id: newId(),
      description: '',
      categoryId: cat?.id ?? '',
      vatCode: cat?.defaultVatCode ?? (k === 'sale' ? 'S_HIGH' : 'P_HIGH'),
      quantity: 1,
      unitAmount: 0,
      vatOverride: null,
      productId: null,
      asset: null,
    };
  }

  onMount(async () => {
    const cats = await db.categories.toArray();
    if (id === 'new') {
      const date = today();
      const sales = await db.documents.where('kind').equals('sale').toArray();
      isNew = true;
      draft = create<BookDocument>({
        kind: kindParam,
        date,
        number: kindParam === 'sale' ? nextInvoiceNumber(sales, Number(date.slice(0, 4))) : '',
        counterparty: '',
        counterpartyVatId: '',
        amountsInclVat: true,
        lines: [newLine(kindParam, cats)],
        notes: '',
      });
    } else {
      const doc = await db.documents.get(id);
      if (!doc || doc.deletedAt) notFound = true;
      else draft = doc;
    }
  });

  function onCategoryChange(line: DocumentLine) {
    const cat = categoryById(line.categoryId);
    if (!cat) return;
    line.vatCode = cat.defaultVatCode;
    line.vatOverride = null;
    line.asset =
      cat.kind === 'asset'
        ? (line.asset ?? { usefulLifeYears: MIN_USEFUL_LIFE_YEARS, residualValue: 0, disposalDate: null })
        : null;
  }

  function onVatCodeChange(line: DocumentLine) {
    if (!hasVatAmount(line.vatCode)) line.vatOverride = null;
  }

  function toggleManualVat(line: DocumentLine, on: boolean) {
    line.vatOverride = on ? computeLine({ ...line, vatOverride: null }, draft!.amountsInclVat, draft!.date).vat : null;
  }

  function addLine() {
    if (!draft) return;
    const last = draft.lines.at(-1);
    const line = newLine(draft.kind, $categories);
    if (last) {
      // Most receipts repeat the category and VAT of the previous line.
      line.categoryId = last.categoryId;
      line.vatCode = last.vatCode;
    }
    draft.lines.push(line);
  }

  function removeLine(index: number) {
    draft?.lines.splice(index, 1);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!draft) return;
    const lines = draft.lines.filter((l) => l.unitAmount !== 0 || l.description.trim() !== '');
    if (!draft.date || lines.length === 0 || lines.every((l) => l.unitAmount === 0)) {
      error = t('doc.invalid');
      return;
    }
    draft.lines = lines;
    await save('documents', draft);
    navigate(listPath);
  }

  async function del() {
    if (!draft || !confirm(t('common.confirmDelete'))) return;
    await remove('documents', draft.id);
    navigate(listPath);
  }

  const vatLabel = (code: VatCode) => t(`vat.${code}` as MessageKey);
</script>

{#if notFound}
  <p class="muted">404</p>
{:else if draft}
  <form onsubmit={submit} novalidate>
    <div class="page-header">
      <h1>
        {#if isNew}{kind === 'sale' ? t('doc.newSale') : t('doc.newPurchase')}
        {:else}{kind === 'sale' ? t('doc.editSale') : t('doc.editPurchase')}{/if}
      </h1>
    </div>

    <section class="card">
      <div class="form-grid">
        <label>
          {t('common.date')}
          <input type="date" bind:value={draft.date} required />
        </label>
        <label>
          {kind === 'sale' ? t('doc.customer') : t('doc.supplier')}
          <input list="counterparties" bind:value={draft.counterparty} autocomplete="off" />
          <datalist id="counterparties">
            {#each counterparties as c}<option value={c}></option>{/each}
          </datalist>
        </label>
        <label>
          {kind === 'sale' ? t('doc.numberSale') : t('doc.numberPurchase')}
          <input bind:value={draft.number} />
        </label>
        {#if needsVatId}
          <label>
            {t('doc.vatId')}
            <input bind:value={draft.counterpartyVatId} placeholder="DE123456789" />
            <span class="small muted">{t('doc.vatIdHint')}</span>
          </label>
        {/if}
      </div>
    </section>

    <section class="card">
      <div class="lines-header">
        <h2>{t('doc.lines')}</h2>
        <div class="amounts-mode">
          <span class="small muted">{t('doc.amountsAre')}</span>
          <div class="segmented" role="group">
            <button type="button" class:selected={draft.amountsInclVat} onclick={() => (draft!.amountsInclVat = true)}>
              {t('common.inclVat')}
            </button>
            <button type="button" class:selected={!draft.amountsInclVat} onclick={() => (draft!.amountsInclVat = false)}>
              {t('common.exclVat')}
            </button>
          </div>
        </div>
      </div>

      {#each draft.lines as line, i (line.id)}
        {@const amounts = computeLine(line, draft.amountsInclVat, draft.date)}
        {@const def = VAT_CODES[line.vatCode]}
        <div class="line">
          <label class="desc">
            {t('common.description')}
            <input bind:value={line.description} />
          </label>
          <label class="cat">
            {t('doc.category')}
            <select bind:value={line.categoryId} onchange={() => onCategoryChange(line)}>
              {#each usableCategories.filter((c) => !c.archived || c.id === line.categoryId) as c}
                <option value={c.id}>{c.name}</option>
              {/each}
            </select>
          </label>
          <label class="vat">
            {t('doc.vatCode')}
            <select bind:value={line.vatCode} onchange={() => onVatCodeChange(line)}>
              {#each vatOptions as o}<option value={o.code}>{vatLabel(o.code)}</option>{/each}
            </select>
          </label>
          <label class="qty">
            {t('doc.quantity')}
            <input type="number" inputmode="decimal" step="any" bind:value={line.quantity} />
          </label>
          <label class="amount">
            {t('doc.unitAmount')}
            {def.vatOnInvoice ? (draft.amountsInclVat ? t('common.inclVat') : t('common.exclVat')) : ''}
            <MoneyInput bind:value={line.unitAmount} />
          </label>
          <button type="button" class="icon-button remove" title={t('doc.removeLine')} aria-label={t('doc.removeLine')} onclick={() => removeLine(i)}>✕</button>

          <div class="line-footer">
            {#if hasVatAmount(line.vatCode)}
              <label class="inline small">
                <input type="checkbox" checked={line.vatOverride !== null} onchange={(e) => toggleManualVat(line, e.currentTarget.checked)} />
                {t('doc.manualVat')}
              </label>
              {#if line.vatOverride !== null}
                <div class="vat-override"><MoneyInput bind:value={line.vatOverride} aria-label={t('doc.vatAmount')} /></div>
              {/if}
            {/if}
            <span class="line-amounts small muted">
              {t('common.net')} {formatMoney(amounts.net)} · {def.reverseCharge ? t('doc.reverseChargeVat') : t('common.vat')} {formatMoney(amounts.vat)}
              {#if def.vatOnInvoice}· {t('common.total')} {formatMoney(amounts.gross)}{/if}
            </span>
          </div>

          {#if line.asset}
            <div class="asset">
              <strong class="small">{t('doc.asset')}</strong>
              <div class="form-grid">
                <label>
                  {t('doc.assetLife')}
                  <input type="number" min="1" max="50" step="1" bind:value={line.asset.usefulLifeYears} />
                </label>
                <label>
                  {t('doc.assetResidual')}
                  <MoneyInput bind:value={line.asset.residualValue} />
                </label>
                <label>
                  {t('doc.assetDisposal')}
                  <input type="date" value={line.asset.disposalDate ?? ''} onchange={(e) => (line.asset!.disposalDate = e.currentTarget.value || null)} />
                </label>
              </div>
              {#if amounts.net < DEPRECIATION_THRESHOLD}<p class="small notice">{t('doc.assetBelowThreshold')}</p>{/if}
              {#if line.asset.usefulLifeYears < MIN_USEFUL_LIFE_YEARS}<p class="small notice">{t('doc.assetMinLife')}</p>{/if}
            </div>
          {/if}
        </div>
      {/each}

      <button type="button" onclick={addLine}>+ {t('doc.addLine')}</button>

      {#if totals}
        <table class="totals">
          <tbody>
            <tr><td>{t('common.exclVat')}</td><td class="num">{formatMoney(totals.net)}</td></tr>
            <tr><td>{t('common.vat')}</td><td class="num">{formatMoney(totals.vat)}</td></tr>
            {#if selfAssessedVat}
              <tr><td class="muted">{t('doc.reverseChargeVat')}</td><td class="num muted">{formatMoney(selfAssessedVat)}</td></tr>
            {/if}
            <tr class="total"><td>{t('common.total')}</td><td class="num">{formatMoney(totals.gross)}</td></tr>
          </tbody>
        </table>
      {/if}
    </section>

    <section class="card">
      <label>
        {t('doc.notes')}
        <textarea rows="2" bind:value={draft.notes}></textarea>
      </label>
    </section>

    {#if error}<p class="notice">{error}</p>{/if}

    <div class="actions">
      <button type="submit" class="primary">{t('common.save')}</button>
      <a class="button" href={'#' + listPath}>{t('common.cancel')}</a>
      {#if !isNew}<button type="button" class="danger" onclick={del}>{t('common.delete')}</button>{/if}
    </div>
  </form>
{/if}

<style>
  .lines-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .lines-header h2 {
    margin: 0;
  }
  .amounts-mode {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .line {
    display: grid;
    grid-template-columns: 2fr 1.6fr 1.6fr 0.6fr 1.1fr auto;
    gap: 8px;
    align-items: end;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
  }
  .line-footer {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }
  .vat-override {
    width: 130px;
  }
  .line-amounts {
    margin-left: auto;
  }
  .asset {
    grid-column: 1 / -1;
    background: var(--hover);
    border-radius: 8px;
    padding: 10px;
  }
  .asset .notice {
    margin: 8px 0 0;
  }
  .totals {
    margin-left: auto;
    margin-top: 16px;
    max-width: 360px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions .danger {
    margin-left: auto;
  }

  /* Tablet portrait: two rows per line */
  @media (max-width: 1100px) {
    .line {
      grid-template-columns: 1fr 1fr 90px 140px auto;
    }
    .desc {
      grid-column: 1 / -1;
    }
    .remove {
      grid-row: 1;
      grid-column: -2;
    }
    .desc {
      grid-column: 1 / -2;
    }
  }
  /* Phone: stacked */
  @media (max-width: 600px) {
    .line {
      grid-template-columns: 1fr 1fr auto;
    }
    .desc {
      grid-column: 1 / 3;
    }
    .remove {
      grid-column: 3;
    }
    .cat,
    .vat {
      grid-column: 1 / -1;
    }
    .amount {
      grid-column: 2 / -1;
    }
    .line-amounts {
      margin-left: 0;
    }
  }
</style>

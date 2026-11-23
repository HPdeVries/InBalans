<script lang="ts">
  import { onMount } from 'svelte';
  import { db } from '../db/db';
  import { categories, documents, settings } from '../db/stores';
  import { create, newId, nextInvoiceNumber, PeriodLockedError, removeDocument, saveDocument } from '../db/repo';
  import { isLocked, reversedLines } from '../domain/locking';
  import type { BookDocument, Category, DocumentKind, DocumentLine } from '../domain/types';
  import { paymentMethodOf } from '../domain/types';
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
  import { formatDate, t, type MessageKey } from '../i18n';
  import { navigate } from '../router';
  import MoneyInput from '../ui/MoneyInput.svelte';
  import PageHeader from '../ui/PageHeader.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import X from '@lucide/svelte/icons/x';
  import Layers from '@lucide/svelte/icons/layers';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Lock from '@lucide/svelte/icons/lock';
  import Undo2 from '@lucide/svelte/icons/undo-2';

  let {
    id,
    kind: kindParam,
    correctId,
  }: { id: string; kind: DocumentKind; correctId?: string | null } = $props();

  let draft = $state<BookDocument | null>(null);
  let isNew = $state(false);
  /** Date as stored, used to decide whether an existing booking is locked. */
  let storedDate = $state('');
  let error = $state('');
  let notFound = $state(false);

  const kind = $derived(draft?.kind ?? kindParam);
  const lockedThrough = $derived($settings.lockedThrough ?? null);
  const locked = $derived(!isNew && isLocked(storedDate, lockedThrough));
  const dateInLockedPeriod = $derived(!locked && !!draft && isLocked(draft.date, lockedThrough));
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
    if (id === 'new' && correctId) {
      const source = await db.documents.get(correctId);
      if (!source) {
        notFound = true;
        return;
      }
      const date = today();
      const sales = await db.documents.where('kind').equals('sale').toArray();
      isNew = true;
      draft = create<BookDocument>({
        kind: source.kind,
        date,
        number: source.kind === 'sale' ? nextInvoiceNumber(sales, Number(date.slice(0, 4))) : source.number,
        counterparty: source.counterparty,
        counterpartyVatId: source.counterpartyVatId,
        amountsInclVat: source.amountsInclVat,
        paymentMethod: paymentMethodOf(source),
        lines: reversedLines(source),
        notes: t('lock.correctionOf', { ref: source.number || formatDate(source.date) }),
      });
    } else if (id === 'new') {
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
        paymentMethod: 'bank',
        lines: [newLine(kindParam, cats)],
        notes: '',
      });
    } else {
      const doc = await db.documents.get(id);
      if (!doc || doc.deletedAt) notFound = true;
      else {
        draft = doc;
        storedDate = doc.date;
      }
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
    if (dateInLockedPeriod) {
      error = t('lock.dateLocked', { date: formatDate(lockedThrough!) });
      return;
    }
    draft.lines = lines;
    try {
      await saveDocument(draft);
      navigate(listPath);
    } catch (err) {
      if (!(err instanceof PeriodLockedError)) throw err;
      error = t('lock.dateLocked', { date: formatDate(lockedThrough ?? '') });
    }
  }

  async function del() {
    if (!draft || !confirm(t('common.confirmDelete'))) return;
    try {
      await removeDocument(draft.id);
      navigate(listPath);
    } catch (err) {
      if (!(err instanceof PeriodLockedError)) throw err;
      error = t('lock.docLocked', { date: formatDate(lockedThrough ?? '') });
    }
  }

  function makeCorrection() {
    if (draft) navigate(`/documents/new?kind=${draft.kind}&correct=${draft.id}`);
  }

  const vatLabel = (code: VatCode) => t(`vat.${code}` as MessageKey);
</script>

{#if notFound}
  <div class="card empty-state"><h2>404</h2></div>
{:else if draft}
  <form onsubmit={submit} novalidate>
    <PageHeader
      backHref={'#' + listPath}
      title={isNew
        ? kind === 'sale' ? t('doc.newSale') : t('doc.newPurchase')
        : kind === 'sale' ? t('doc.editSale') : t('doc.editPurchase')}
    >
      {#snippet actions()}
        {#if !isNew && !locked}
          <button type="button" class="ghost danger" onclick={del}><Trash2 size={18} />{t('common.delete')}</button>
        {/if}
      {/snippet}
    </PageHeader>

    {#if locked}
      <div class="notice info locked-notice">
        <Lock size={16} />
        <span>{t('lock.docLocked', { date: formatDate(lockedThrough ?? '') })} <span class="muted">{t('lock.correctHint')}</span></span>
      </div>
    {/if}

    <fieldset class="plain" disabled={locked}>
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
        <div class="field">
          <span class="field-label">{kind === 'sale' ? t('doc.receivedVia') : t('doc.paidVia')}</span>
          <div class="segmented" role="group" aria-label={kind === 'sale' ? t('doc.receivedVia') : t('doc.paidVia')}>
            {#each ['bank', 'cash'] as const as method}
              <button
                type="button"
                class:selected={paymentMethodOf(draft) === method}
                aria-pressed={paymentMethodOf(draft) === method}
                onclick={() => (draft!.paymentMethod = method)}
              >
                {t(`doc.payment.${method}`)}
              </button>
            {/each}
          </div>
        </div>
        {#if needsVatId}
          <label>
            {t('doc.vatId')}
            <input bind:value={draft.counterpartyVatId} placeholder="DE123456789" />
            <span class="hint">{t('doc.vatIdHint')}</span>
          </label>
        {/if}
      </div>
    </section>

    <section class="card">
      <div class="card-header lines-header">
        <h2>{t('doc.lines')}</h2>
        <div class="segmented" role="group" aria-label={t('doc.amountsAre')}>
          <button type="button" class:selected={draft.amountsInclVat} onclick={() => (draft!.amountsInclVat = true)}>
            {t('common.inclVat')}
          </button>
          <button type="button" class:selected={!draft.amountsInclVat} onclick={() => (draft!.amountsInclVat = false)}>
            {t('common.exclVat')}
          </button>
        </div>
      </div>

      {#each draft.lines as line, i (line.id)}
        {@const amounts = computeLine(line, draft.amountsInclVat, draft.date)}
        {@const def = VAT_CODES[line.vatCode]}
        <div class="line">
          <div class="line-grid">
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
            {#if draft.lines.length > 1}
              <button type="button" class="ghost icon-button remove" title={t('doc.removeLine')} aria-label={t('doc.removeLine')} onclick={() => removeLine(i)}>
                <X size={18} />
              </button>
            {/if}
          </div>

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
            <span class="line-amounts">
              <span>{t('common.net')} <b>{formatMoney(amounts.net)}</b></span>
              <span>{def.reverseCharge ? t('doc.reverseChargeVat') : t('common.vat')} <b>{formatMoney(amounts.vat)}</b></span>
              {#if def.vatOnInvoice}<span>{t('common.total')} <b>{formatMoney(amounts.gross)}</b></span>{/if}
            </span>
          </div>

          {#if line.asset}
            <div class="asset">
              <div class="asset-title"><Layers size={16} />{t('doc.asset')}</div>
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
              {#if amounts.net < DEPRECIATION_THRESHOLD}<p class="notice"><TriangleAlert size={16} />{t('doc.assetBelowThreshold')}</p>{/if}
              {#if line.asset.usefulLifeYears < MIN_USEFUL_LIFE_YEARS}<p class="notice"><TriangleAlert size={16} />{t('doc.assetMinLife')}</p>{/if}
            </div>
          {/if}
        </div>
      {/each}

      <button type="button" class="add-line" onclick={addLine}><Plus size={18} />{t('doc.addLine')}</button>

      {#if totals}
        <dl class="totals">
          <dt>{t('common.exclVat')}</dt><dd>{formatMoney(totals.net)}</dd>
          <dt>{t('common.vat')}</dt><dd>{formatMoney(totals.vat)}</dd>
          {#if selfAssessedVat}
            <dt class="muted">{t('doc.reverseChargeVat')}</dt><dd class="muted">{formatMoney(selfAssessedVat)}</dd>
          {/if}
          <dt class="grand">{t('common.total')}</dt><dd class="grand">{formatMoney(totals.gross)}</dd>
        </dl>
      {/if}
    </section>

    <section class="card">
      <label>
        {t('doc.notes')}
        <textarea rows="2" bind:value={draft.notes}></textarea>
      </label>
    </section>

    </fieldset>

    {#if dateInLockedPeriod}
      <p class="notice"><TriangleAlert size={16} />{t('lock.dateLocked', { date: formatDate(lockedThrough ?? '') })}</p>
    {:else if error}<p class="notice"><TriangleAlert size={16} />{error}</p>{/if}

    <div class="action-bar">
      <div class="bar-total">
        <span class="muted small">{t('common.total')}</span>
        <strong>{formatMoney(totals?.gross ?? 0)}</strong>
      </div>
      {#if locked}
        <a class="button" href={'#' + listPath}>{t('common.back')}</a>
        <button type="button" class="primary" onclick={makeCorrection}><Undo2 size={18} />{t('lock.correct')}</button>
      {:else}
        <a class="button" href={'#' + listPath}>{t('common.cancel')}</a>
        <button type="submit" class="primary" disabled={dateInLockedPeriod}>{t('common.save')}</button>
      {/if}
    </div>
  </form>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .field-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-2);
  }
  .field .segmented {
    align-self: flex-start;
  }
  fieldset.plain {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  fieldset.plain:disabled :global(input),
  fieldset.plain:disabled :global(select),
  fieldset.plain:disabled :global(textarea) {
    background: var(--surface-2);
    color: var(--text-2);
    box-shadow: none;
  }
  fieldset.plain:disabled .add-line,
  fieldset.plain:disabled .remove {
    display: none;
  }
  .locked-notice span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hint {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--muted);
  }
  .lines-header {
    flex-wrap: wrap;
  }
  .line {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    margin-bottom: 12px;
  }
  .line-grid {
    display: grid;
    grid-template-columns: 2fr 1.6fr 1.6fr 0.6fr 1.1fr auto;
    gap: 10px;
    align-items: end;
  }
  .line-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin-top: 10px;
    min-height: 32px;
  }
  .vat-override {
    width: 130px;
  }
  .line-amounts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-left: auto;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .line-amounts b {
    color: var(--text-2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .asset {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed var(--border-strong);
  }
  .asset-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    font-size: 0.85rem;
    margin-bottom: 10px;
  }
  .asset .notice {
    margin: 10px 0 0;
  }
  .add-line {
    width: 100%;
    border-style: dashed;
    box-shadow: none;
    color: var(--muted);
  }
  .add-line:hover {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .totals {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 24px;
    margin: 20px 0 0 auto;
    max-width: 360px;
  }
  .totals dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .totals .grand {
    font-weight: 700;
    font-size: 1.1rem;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .action-bar {
    position: sticky;
    bottom: 16px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 12px 18px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }
  .bar-total {
    display: flex;
    flex-direction: column;
    margin-right: auto;
    line-height: 1.2;
  }
  .bar-total strong {
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }

  /* Tablet: two rows per line */
  @media (max-width: 1100px) {
    .line-grid {
      grid-template-columns: 1fr 1fr 90px 140px auto;
    }
    .desc {
      grid-column: 1 / -2;
    }
    .remove {
      grid-row: 1;
      grid-column: -2;
    }
  }
  /* Phone: stacked */
  @media (max-width: 600px) {
    .line {
      padding: 12px;
    }
    .line-grid {
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
    .action-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 0;
      border-width: 1px 0 0;
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
    }
  }
  @media (min-width: 601px) and (max-width: 900px) {
    .action-bar {
      bottom: calc(16px + env(safe-area-inset-bottom));
    }
  }
</style>

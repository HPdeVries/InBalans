<script lang="ts">
  import { settings } from '../db/stores';
  import { formatDate, t } from '../i18n';
  import { today } from '../domain/period';

  let { title }: { title: string } = $props();

  const details = $derived(
    [
      $settings.ownerName,
      $settings.address,
      $settings.kvkNumber && `${t('settings.kvk')} ${$settings.kvkNumber}`,
      $settings.vatId && `${t('settings.vatId')} ${$settings.vatId}`,
    ].filter(Boolean),
  );
</script>

<!-- Only visible when printing: identifies the business and the moment the report was made. -->
<div class="print-header">
  <div>
    <strong>{$settings.businessName || $settings.ownerName || t('app.name')}</strong>
    {#each details as d}<div>{d}</div>{/each}
  </div>
  <div class="right">
    <strong>{title}</strong>
    <div>{t('print.printedOn', { date: formatDate(today()) })}</div>
    <div>{t('print.generatedBy')}</div>
  </div>
</div>

<style>
  .print-header {
    display: none;
  }
  @media print {
    .print-header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      font-size: 9pt;
      line-height: 1.4;
      padding-bottom: 10px;
      margin-bottom: 16px;
      border-bottom: 1px solid #999;
    }
    .print-header strong {
      font-size: 11pt;
    }
    .right {
      text-align: right;
    }
  }
</style>

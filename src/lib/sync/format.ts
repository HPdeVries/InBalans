import { t, type MessageKey } from '../i18n';
import type { SyncStatus } from './session';

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return t('sync.justNow');
  if (min < 60) return t('sync.minutesAgo', { n: min });
  if (min < 48 * 60) return t('sync.hoursAgo', { n: Math.floor(min / 60) });
  return t('sync.daysAgo', { n: Math.floor(min / 1440) });
}

export function statusText(s: SyncStatus): string {
  if (s.state === 'idle' && s.lastSyncAt) return t('sync.status.idleAgo', { ago: ago(s.lastSyncAt) });
  return t(`sync.status.${s.state}` as MessageKey);
}

/** Dutch message for an API error code. */
export function loginError(code: string): string {
  const key = `login.error.${code}` as MessageKey;
  const text = t(key);
  return text === key ? t('login.error.generic') : text;
}

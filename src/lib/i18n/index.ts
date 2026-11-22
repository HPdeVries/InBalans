import { nl, type MessageKey } from './nl';

const messages: Record<MessageKey, string> = nl;

/** Translate a key, replacing `{name}` placeholders with params. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text: string = messages[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

const dateFormatter = new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormatter.format(new Date(y, m - 1, d));
}

export type { MessageKey };

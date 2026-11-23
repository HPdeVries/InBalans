const dateTime = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Amsterdam' });
const date = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeZone: 'Europe/Amsterdam' });

export function fmtDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function fmtDate(iso: string | null | undefined): string {
  return iso ? date.format(new Date(iso)) : '—';
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nooit';
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} uur geleden`;
  return `${Math.floor(min / 1440)} dagen geleden`;
}

export function bytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} kB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
}

export function count(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('nl-NL');
}

const ACTIONS: Record<string, string> = {
  login: 'Ingelogd',
  logout: 'Uitgelogd',
  tenant_created: 'Administratie aangemaakt',
  remote_signout: 'Apparaat afgemeld',
  remote_signout_all: 'Andere apparaten afgemeld',
  remote_signout_link: 'Afgemeld via e-maillink',
  admin_login: 'Beheerder ingelogd',
  admin_block: 'Geblokkeerd door beheer',
  admin_unblock: 'Gedeblokkeerd door beheer',
  admin_signout_all: 'Alle apparaten afgemeld door beheer',
  admin_delete_user: 'Account verwijderd door beheer',
  admin_invite: 'Uitgenodigd',
  admin_uninvite: 'Uitnodiging ingetrokken',
};

export function actionText(action: string): string {
  return ACTIONS[action] ?? action;
}

/** Readable summary of an audit detail (JSON). */
export function detailText(detail: string | null): string {
  if (!detail) return '';
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    return Object.entries(d)
      .filter(([k]) => k !== 'session')
      .map(([k, v]) => (k === 'admin' ? `door ${v}` : k === 'device' ? String(v) : k === 'email' ? String(v) : `${k}: ${v}`))
      .join(' · ');
  } catch {
    return detail;
  }
}

export const TABLE_NAMES: Record<string, string> = {
  documents: 'Boekingen',
  categories: 'Categorieën',
  manualAssets: 'Activa (handmatig)',
  stockCounts: 'Voorraadtellingen',
  settings: 'Instellingen',
  products: 'Producten',
};

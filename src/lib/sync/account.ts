import type { DeviceMode } from './protocol';

/**
 * The account this device is connected to. Own devices keep it in localStorage; shared devices in
 * sessionStorage, so closing the browser forgets it (docs/SYNC_DESIGN.md §7.2).
 */
export interface Account {
  userId: string;
  email: string;
  sessionId: string;
  tenantId: string;
  tenantName: string;
  deviceMode: DeviceMode;
  /** The pre-account local database still exists and is deleted after the first complete sync. */
  legacyPendingDelete?: boolean;
}

const KEY = 'inbalans.account';
export const LOCAL_DB_NAME = 'inbalans';

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage ?? null : globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function loadAccount(): Account | null {
  for (const kind of ['session', 'local'] as const) {
    const raw = storage(kind)?.getItem(KEY);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as Account;
    } catch {
      storage(kind)?.removeItem(KEY);
    }
  }
  return null;
}

export function saveAccount(account: Account): void {
  const kind = account.deviceMode === 'shared' ? 'session' : 'local';
  storage(kind === 'local' ? 'session' : 'local')?.removeItem(KEY);
  storage(kind)?.setItem(KEY, JSON.stringify(account));
}

export function clearAccount(): void {
  storage('local')?.removeItem(KEY);
  storage('session')?.removeItem(KEY);
}

export function tenantDbName(tenantId: string): string {
  return `inbalans-${tenantId}`;
}

/** Loaded once at startup; switching account reloads the app. */
export const account: Account | null = loadAccount();

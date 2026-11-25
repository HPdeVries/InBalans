/** Remove everything InBalans stored on this device: databases, local settings, offline app files. */
import { db } from '../db/db';
import { account, LOCAL_DB_NAME, tenantDbName } from '../sync/account';
import { api } from '../sync/api';
import { syncNow } from '../sync/session';

const PREFIX = 'inbalans';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function clearStorage(storage: Storage | undefined): void {
  try {
    if (!storage) return;
    for (const key of Object.keys(storage)) if (key.startsWith(`${PREFIX}.`)) storage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export async function wipeDevice(opts: { signOut?: boolean } = {}): Promise<void> {
  if (account && opts.signOut !== false) {
    // Push what is still pending, then end the session. Data in the account is not deleted.
    await syncNow().catch(() => {});
    await api.logout().catch(() => {});
  }
  db.close();

  const names = new Set<string>([LOCAL_DB_NAME]);
  if (account) names.add(tenantDbName(account.tenantId));
  try {
    for (const d of (await indexedDB.databases?.()) ?? []) if (d.name?.startsWith(PREFIX)) names.add(d.name);
  } catch {
    /* databases() not supported: delete the known names */
  }
  await Promise.all([...names].map(deleteDatabase));

  clearStorage(globalThis.localStorage);
  clearStorage(globalThis.sessionStorage);

  try {
    for (const key of (await caches?.keys()) ?? []) await caches.delete(key);
    for (const reg of (await navigator.serviceWorker?.getRegistrations()) ?? []) await reg.unregister();
  } catch {
    /* best effort */
  }
  location.replace(location.pathname);
}

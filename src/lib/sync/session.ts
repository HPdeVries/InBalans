/**
 * Account and sync lifecycle in the app: background sync, connecting this device to an account,
 * logging out, remote sign-out and the shared-device mode. See docs/SYNC_DESIGN.md §6 and §7.
 */
import Dexie from 'dexie';
import { writable } from 'svelte/store';
import { t } from '../i18n';
import { db, InBalansDb, stripLocal, SYNC_TABLES } from '../db/db';
import { SEED_TIMESTAMP } from '../db/seed';
import { downloadJson, exportBackup } from '../db/backup';
import { account, clearAccount, LOCAL_DB_NAME, saveAccount, tenantDbName, type Account } from './account';
import { api, ApiRequestError, setRevokedHandler } from './api';
import { countDirty, getSyncMeta, syncDatabase } from './engine';
import { onLocalChange } from './events';
import { startLive } from './live';
import type { DeviceMode, MeResponse } from './protocol';

export type SyncState = 'local' | 'idle' | 'syncing' | 'offline' | 'error' | 'signedOut';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  /** Local changes not yet pushed. */
  pending: number;
  /** Conflicts / refused changes in the last sync, shown once. */
  conflicts: number;
  rejected: number;
  error: string | null;
}

export const syncStatus = writable<SyncStatus>({
  state: account ? 'idle' : 'local',
  lastSyncAt: null,
  pending: 0,
  conflicts: 0,
  rejected: 0,
  error: null,
});

export { account };

/**
 * Whether this installation offers sync. The same build runs on a static host without API
 * (then sync stays invisible) and on the Worker. A connected device always shows it.
 */
export const syncAvailable = writable<boolean>(!!account);

export async function detectSyncAvailable(): Promise<void> {
  if (account) return;
  try {
    const config = await api.config();
    syncAvailable.set(!!config.sync?.available);
  } catch {
    syncAvailable.set(false);
  }
}

const SYNC_INTERVAL = 5 * 60_000;
/** Short pause after a local change, so a burst of edits goes out in one request. */
const CHANGE_DELAY = 800;
const SHARED_IDLE_TIMEOUT = 30 * 60_000;
const OWN_OFFLINE_LIMIT = 90 * 24 * 3600_000;

let running: Promise<void> | null = null;
let again = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;

function patch(p: Partial<SyncStatus>) {
  syncStatus.update((s) => ({ ...s, ...p }));
}

async function refreshPending() {
  patch({ pending: await countDirty(db) });
}

/** Run a sync now (or once more after the running one). */
export function syncNow(): Promise<void> {
  if (!account) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce(account!);
    } while (again);
  })().finally(() => (running = null));
  return running;
}

async function syncOnce(acc: Account): Promise<void> {
  clearTimeout(retryTimer);
  patch({ state: 'syncing', error: null });
  try {
    const res = await syncDatabase(db, (req) => api.sync(acc.tenantId, req));
    failures = 0;
    const meta = await getSyncMeta(db);
    const pending = await countDirty(db);
    syncStatus.update((s) => ({
      ...s,
      state: 'idle',
      lastSyncAt: meta.lastSyncAt,
      pending,
      conflicts: s.conflicts + res.conflicts,
      rejected: s.rejected + res.rejected,
    }));
    if (acc.legacyPendingDelete && pending === 0) await deleteLegacyDb(acc);
  } catch (e) {
    const err = e instanceof ApiRequestError ? e : null;
    if (err?.status === 401) return; // handled by the revoked handler
    failures++;
    patch({ state: err?.offline ? 'offline' : 'error', error: err?.code ?? 'error' });
    await refreshPending();
    // Back off: 30 s, 1 min, 2 min ... at most 5 min.
    retryTimer = setTimeout(() => void syncNow(), Math.min(30_000 * 2 ** (failures - 1), SYNC_INTERVAL));
  }
}

/** The data from before connecting is removed once everything has reached the server (§6). */
async function deleteLegacyDb(acc: Account) {
  await Dexie.delete(LOCAL_DB_NAME);
  const next = { ...acc, legacyPendingDelete: false };
  saveAccount(next);
  Object.assign(acc, next);
}

export function dismissNotices() {
  patch({ conflicts: 0, rejected: 0 });
}

/** Start background sync. Called once at app start. */
export async function startSync(): Promise<void> {
  if (!account) return;
  const acc = account;
  setRevokedHandler((wipe) => {
    if (acc.support) void wipeLocal('support');
    else if (wipe) void wipeLocal('revoked');
    else patch({ state: 'signedOut' });
  });

  const meta = await getSyncMeta(db);
  patch({ lastSyncAt: meta.lastSyncAt });
  // An own device that has not reached the server for 90 days is wiped (§7.3).
  if (acc.deviceMode === 'own' && meta.lastSyncAt && Date.now() - Date.parse(meta.lastSyncAt) > OWN_OFFLINE_LIMIT) {
    await wipeLocal('offline');
    return;
  }

  const delay = acc.deviceMode === 'shared' ? 0 : CHANGE_DELAY;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  onLocalChange(() => {
    void refreshPending();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => void syncNow(), delay);
  });
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('focus', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => void syncNow(), SYNC_INTERVAL);
  if (acc.deviceMode === 'shared') watchInactivity();
  await refreshPending();
  void syncNow();
  stopLive = startLive({
    tenantId: acc.tenantId,
    deviceId: meta.deviceId,
    support: !!acc.support,
    knownRev: async () => (await getSyncMeta(db)).lastPulledRev,
    onRemoteChange: () => void syncNow(),
  });
}

let stopLive: () => void = () => {};

/** Shared devices: log out after 30 minutes without use (§7.2). */
function watchInactivity() {
  let last = Date.now();
  const touch = () => (last = Date.now());
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.addEventListener(ev, touch, { passive: true });
  setInterval(() => {
    if (Date.now() - last > SHARED_IDLE_TIMEOUT) void signOut({ force: true, reason: 'idle' });
  }, 60_000);
}

const WIPE_REASON_KEY = 'inbalans.wipeReason';
export type WipeReason = 'revoked' | 'offline' | 'idle' | 'logout' | 'support' | 'deleted';

/** Why the previous session ended (shown once after the reload). */
export function takeWipeReason(): WipeReason | null {
  try {
    const r = sessionStorage.getItem(WIPE_REASON_KEY) as WipeReason | null;
    sessionStorage.removeItem(WIPE_REASON_KEY);
    return r;
  } catch {
    return null;
  }
}

/** Delete this tenant's local data and return to the start screen. */
async function wipeLocal(reason: WipeReason): Promise<void> {
  // Looking along ends with a plain page: this window is not the device's own app.
  if (account?.support) {
    db.close();
    clearAccount();
    document.body.innerHTML =
      '<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">' +
      `<h1>Meekijken beëindigd</h1><p>${t('sync.wipe.support')} Je kunt dit venster sluiten.</p></div>`;
    return;
  }
  // Unsynced changes are saved as a download first, so nothing is lost silently.
  if (reason !== 'logout' && (await countDirty(db).catch(() => 0)) > 0) {
    try {
      downloadJson(`inbalans-niet-gesynchroniseerd-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup());
    } catch {
      /* best effort */
    }
  }
  db.close();
  if (account?.deviceMode !== 'shared') await Dexie.delete(db.name);
  clearAccount();
  try {
    sessionStorage.setItem(WIPE_REASON_KEY, reason);
  } catch {
    /* ignore */
  }
  location.reload();
}

/**
 * Log out. Tries to push unsynced changes first; returns 'pending' (and does nothing)
 * when changes would be lost, unless `force` is set.
 */
export async function signOut(opts: { force?: boolean; reason?: WipeReason } = {}): Promise<'pending' | void> {
  if (!account) return;
  await syncNow().catch(() => {});
  if (account.support) {
    await api.endSupport().catch(() => {});
    await wipeLocal('support');
    return;
  }
  if (!opts.force && (await countDirty(db)) > 0) return 'pending';
  await api.logout().catch(() => {});
  await wipeLocal(opts.reason ?? 'logout');
}

// ---------- Deleting the account ----------

export type AfterDeletion = 'keepLocal' | 'wipe';

/**
 * Delete the account with the code from the e-mail. Afterwards this device either continues as a
 * local-only app with the data it has ('keepLocal'), or removes everything ('wipe').
 */
export async function deleteAccount(code: string, after: AfterDeletion): Promise<void> {
  if (!account || account.support) throw new Error('not-connected');
  const acc = account;
  // Push what is still pending, so a kept local copy matches the last state. Errors do not block deletion.
  await syncNow().catch(() => {});
  await api.deleteAccount(code);
  // From here the server answers 401: do not let background sync wipe the device on its own.
  setRevokedHandler(() => {});
  stopLive();
  if (after === 'wipe' || acc.deviceMode === 'shared') {
    const { wipeDevice } = await import('../security/reset');
    await wipeDevice({ signOut: false });
    return;
  }
  await keepAsLocal(acc);
  clearAccount();
  try {
    sessionStorage.setItem(WIPE_REASON_KEY, 'deleted');
  } catch {
    /* ignore */
  }
  location.reload();
}

/** Turn the connected database into the plain local database of an app without account. */
async function keepAsLocal(acc: Account): Promise<void> {
  const data = new Map<string, object[]>();
  for (const t of SYNC_TABLES) data.set(t, (await db.table(t).toArray()).map((r: object) => stripLocal(r)));
  db.close();
  await Dexie.delete(LOCAL_DB_NAME);
  const target = new InBalansDb(LOCAL_DB_NAME);
  await target.open();
  await target.transaction('rw', SYNC_TABLES.map((t) => target.table(t)), async () => {
    for (const t of SYNC_TABLES) {
      await target.table(t).clear(); // drop the seeded categories: the account's own categories come along
      await target.table(t).bulkPut(data.get(t)!);
    }
  });
  target.close();
  await Dexie.delete(tenantDbName(acc.tenantId));
}

// ---------- Connecting this device (§6) ----------

export interface ConnectPlan {
  me: MeResponse;
  deviceMode: DeviceMode;
  tenant: MeResponse['tenants'][number] | null;
  remoteHasData: boolean;
  localHasData: boolean;
}

/** Whether the local database holds anything the user entered (seeded categories do not count). */
export async function hasOwnData(source: InBalansDb): Promise<boolean> {
  for (const t of ['documents', 'manualAssets', 'stockCounts', 'products', 'settings'] as const) {
    if ((await source.table(t).count()) > 0) return true;
  }
  return (await source.categories.filter((c) => c.updatedAt !== SEED_TIMESTAMP).count()) > 0;
}

export async function planConnect(me: MeResponse, deviceMode: DeviceMode): Promise<ConnectPlan> {
  const tenant = me.tenants[0] ?? null;
  const remoteHasData = tenant ? (await api.tenantStats(tenant.id)).records > 0 : false;
  // A shared device never uploads what happens to be stored on it.
  const localHasData = deviceMode === 'own' && !account && (await hasOwnData(db));
  return { me, deviceMode, tenant, remoteHasData, localHasData };
}

/**
 * Connect: 'upload' / 'merge' copy the local data into the tenant (merge keeps the normal conflict rules),
 * 'cloud' starts from the server data only. The app reloads afterwards.
 */
export async function connect(plan: ConnectPlan, choice: 'merge' | 'cloud'): Promise<void> {
  // Re-login on a device that is already connected to this tenant (expired session): keep everything.
  if (account && plan.tenant?.id === account.tenantId) {
    saveAccount({ ...account, sessionId: plan.me.session.id, deviceMode: plan.me.session.deviceMode });
    location.reload();
    return;
  }
  if (account) throw new Error('already-connected');

  const settingsName = (await db.settings.get('settings'))?.businessName;
  const tenant = plan.tenant ?? (await api.createTenant(settingsName || 'Mijn administratie'));

  if (plan.deviceMode === 'own') {
    const name = tenantDbName(tenant.id);
    await Dexie.delete(name);
    if (choice === 'merge' && plan.localHasData) {
      const target = new InBalansDb(name);
      await target.open();
      await copyInto(db, target, plan.remoteHasData);
      target.close();
    }
  }
  saveAccount({
    userId: plan.me.user.id,
    email: plan.me.user.email,
    sessionId: plan.me.session.id,
    tenantId: tenant.id,
    tenantName: tenant.name,
    deviceMode: plan.deviceMode,
    legacyPendingDelete: plan.deviceMode === 'own',
  });
  location.reload();
}

/** Copy all records, marked for upload. Untouched seeded categories are skipped when the server has data already. */
async function copyInto(source: InBalansDb, target: InBalansDb, skipSeeds: boolean) {
  // Read everything first: a transaction on `target` ends when it awaits another database.
  const data = new Map<string, object[]>();
  for (const t of SYNC_TABLES) {
    const rows: { updatedAt: string }[] = await source.table(t).toArray();
    const keep = rows.filter((r) => !(skipSeeds && t === 'categories' && r.updatedAt === SEED_TIMESTAMP));
    data.set(t, keep.map((r) => ({ ...stripLocal(r), _dirty: 1, _rev: null })));
  }
  await target.transaction('rw', SYNC_TABLES.map((t) => target.table(t)), async () => {
    for (const t of SYNC_TABLES) await target.table(t).bulkPut(data.get(t)!);
  });
}

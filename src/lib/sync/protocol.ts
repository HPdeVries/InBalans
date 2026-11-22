/**
 * Wire format of the sync API, shared by the app and the Worker (types only).
 * See docs/SYNC_DESIGN.md §4.
 */

/** A record as stored on the server. `data` is the full record as the app stores it. */
export interface SyncRecord {
  tbl: string;
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
  deletedAt: string | null;
  rev: number;
}

/** A local change pushed by a device. */
export interface SyncChange {
  tbl: string;
  id: string;
  /** Server revision the device last saw for this record; null if never synced. */
  baseRev: number | null;
  data: Record<string, unknown>;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncRequest {
  deviceId: string;
  /** Highest server revision the device has pulled. */
  since: number;
  /** At most MAX_PUSH changes, ordered by updatedAt (oldest first). */
  changes: SyncChange[];
}

export interface SyncResponse {
  accepted: { tbl: string; id: string; rev: number }[];
  /** Another device changed the record in the meantime; `winner` is the version that is now current. */
  conflicts: { tbl: string; id: string; winner: SyncRecord }[];
  /** Refused, e.g. a change to a locked period; `current` is the server version (null if none). */
  rejected: { tbl: string; id: string; reason: 'locked' | 'invalid'; current: SyncRecord | null }[];
  /** Records changed by others since `since`. */
  changes: SyncRecord[];
  /** Pass as `since` next time. */
  rev: number;
  /** More changes are waiting: sync again with since = rev. */
  more: boolean;
}

export const MAX_PUSH = 500;
export const MAX_PULL = 500;

/** API error body. */
export interface ApiError {
  error: string;
  /** Set on 401 when the device must delete its local copy (remote sign-out). */
  wipe?: boolean;
}

export type DeviceMode = 'own' | 'shared';

export interface MeResponse {
  user: { id: string; email: string; name: string | null };
  session: { id: string; deviceMode: DeviceMode; expiresAt: string };
  tenants: { id: string; name: string; role: string; status: string }[];
}

export interface DeviceInfo {
  id: string;
  deviceName: string;
  deviceMode: DeviceMode;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

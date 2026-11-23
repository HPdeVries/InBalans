/** Wire format of the admin API (admin.inbalans.app), shared by the admin app and the Worker (types only). */

export interface AdminMe {
  email: string;
  expiresAt: string;
}

export interface TenantStorage {
  records: number;
  rev: number;
  conflicts: number;
  databaseBytes: number;
  lastChange: string | null;
}

export interface TableStats {
  tbl: string;
  records: number;
  deleted: number;
  bytes: number;
}

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSeenAt: string | null;
  activeDevices: number;
  blockedAt: string | null;
  tenant: { id: string; name: string; status: string } | null;
  storage: TenantStorage | null;
}

export interface AdminDevice {
  id: string;
  deviceName: string;
  deviceMode: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  tenantId: string | null;
  detail: string | null;
}

export interface AdminUserDetail extends AdminUser {
  identities: { provider: string; createdAt: string; lastUsedAt: string | null }[];
  devices: AdminDevice[];
  tables: TableStats[];
  audit: AuditEntry[];
}

export interface AdminOverview {
  users: number;
  active7: number;
  active30: number;
  blocked: number;
  tenants: number;
  invitesOpen: number;
  activeDevices: number;
  records: number;
  databaseBytes: number;
  recent: AuditEntry[];
}

export interface Invite {
  email: string;
  note: string | null;
  createdAt: string;
  /** The invited address has an account. */
  registered: boolean;
}

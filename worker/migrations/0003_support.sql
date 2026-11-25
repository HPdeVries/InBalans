-- Remote support: the owner of an administration allows support to look along, read-only, for a limited time.

CREATE TABLE support_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  granted_by TEXT NOT NULL,          -- user id of the owner who allowed it
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_viewed_at TEXT
);
CREATE INDEX support_grants_tenant ON support_grants(tenant_id, expires_at);

-- One-time hand-off from the admin environment to the app (valid 2 minutes, single use).
CREATE TABLE support_handoffs (
  code_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES support_grants(id),
  tenant_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- A read-only support session in the app, bound to one grant.
CREATE TABLE support_sessions (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES support_grants(id),
  tenant_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

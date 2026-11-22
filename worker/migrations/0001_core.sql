-- Central database `core`: everything that crosses tenants. See docs/SYNC_DESIGN.md §3.1.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE identities (
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,          -- email / google / apple
  subject TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities(user_id);

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',   -- active / read_only / pending_deletion
  delete_after TEXT
);

CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL,                       -- owner (accountant later)
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX memberships_tenant ON memberships(tenant_id);

-- One-time login codes, stored hashed; one active code per address.
CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                      -- public id (device list, remote sign-out)
  token_hash TEXT NOT NULL UNIQUE,          -- SHA-256 of the cookie value
  user_id TEXT NOT NULL REFERENCES users(id),
  device_name TEXT NOT NULL,
  device_mode TEXT NOT NULL,                -- own / shared
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Invite-only beta: only these addresses (and existing users) can sign in.
CREATE TABLE invites (
  email TEXT PRIMARY KEY,
  note TEXT,
  created_at TEXT NOT NULL
);

-- Fixed-window rate limiting.
CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL
);
CREATE INDEX audit_log_tenant ON audit_log(tenant_id, at);

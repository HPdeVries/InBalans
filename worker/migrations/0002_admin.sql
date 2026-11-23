-- Admin environment (admin.inbalans.app): blocking accounts and separate admin sessions.

-- Set when an admin blocks the account: devices are signed out (without wiping) and login is refused.
ALTER TABLE users ADD COLUMN blocked_at TEXT;

-- Why a session was revoked: NULL (logout / remote sign-out, device wipes its data) or 'blocked'.
ALTER TABLE sessions ADD COLUMN revoked_reason TEXT;

-- Admins are not app users: their sessions live apart from the users' sessions.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

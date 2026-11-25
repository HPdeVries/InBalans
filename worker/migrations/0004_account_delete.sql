-- Confirmation codes for deleting an account from the app (Settings → Gevarenzone).
CREATE TABLE account_delete_codes (
  user_id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

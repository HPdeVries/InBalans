/** E-mail code login, sessions and devices. See docs/SYNC_DESIGN.md §5 and §7. */
import type { DeviceInfo, DeviceMode, MeResponse } from '../../src/lib/sync/protocol';
import type { Env } from './env';
import { clearSessionCookie, clientIp, getCookie, HttpError, sessionCookie, SESSION_COOKIE } from './http';
import { loginCodeMail, mailer, newLoginMail } from './mail';
import { addMs, DAY, deviceName, HOUR, hmac, MINUTE, normalizeEmail, nowIso, randomCode, randomToken, safeEqual, sha256 } from './util';

const CODE_TTL = 10 * MINUTE;
const CODE_MAX_ATTEMPTS = 5;
const OWN_SESSION_TTL = 90 * DAY;
const SHARED_SESSION_TTL = 8 * HOUR;
const SHARED_IDLE_TIMEOUT = 30 * MINUTE;

export interface SessionRow {
  id: string;
  token_hash: string;
  user_id: string;
  device_name: string;
  device_mode: DeviceMode;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason?: string | null;
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthContext {
  session: SessionRow;
  user: UserRow;
  /** Set-Cookie value when the sliding session was extended. */
  refreshCookie: string | null;
}

/** Fixed-window rate limit; throws 429 when exceeded. */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<void> {
  const window = Math.floor(Date.now() / windowMs);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count`,
  )
    .bind(key, window)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, 'rate_limited');
}

export async function audit(env: Env, action: string, userId: string | null, tenantId: string | null, detail?: unknown) {
  await env.DB.prepare('INSERT INTO audit_log (tenant_id, user_id, action, detail, at) VALUES (?, ?, ?, ?, ?)')
    .bind(tenantId, userId, action, detail === undefined ? null : JSON.stringify(detail), nowIso())
    .run();
}

export const codeHash = (env: Env, email: string, code: string) => hmac(env.AUTH_SECRET, `login:${email}:${code}`);

/** Step 1: send a 6-digit code to an invited (or existing) address. */
export async function startEmailLogin(env: Env, request: Request, body: { email?: unknown }) {
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, 'invalid_email');
  await rateLimit(env, `ip:${clientIp(request)}:start`, 20, HOUR);
  await rateLimit(env, `email:${email}:start`, 5, HOUR);

  const allowed = await env.DB.prepare(
    'SELECT 1 FROM invites WHERE email = ?1 UNION SELECT 1 FROM users WHERE email = ?1 AND deleted_at IS NULL',
  )
    .bind(email)
    .first();
  if (!allowed) throw new HttpError(403, 'not_invited');
  if (await isBlocked(env, email)) throw new HttpError(403, 'blocked');

  const mail = mailer(env);
  if (!mail.configured) throw new HttpError(503, 'mail_not_configured');

  const code = randomCode();
  await env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, created_at = excluded.created_at`,
  )
    .bind(email, await codeHash(env, email, code), addMs(CODE_TTL), nowIso())
    .run();
  try {
    await mail.send(loginCodeMail(email, code, env.APP_ORIGIN));
  } catch {
    // The code is useless if it never arrives.
    await env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email).run();
    throw new HttpError(502, 'mail_failed');
  }
  return env.DEV_EXPOSE_LOGIN_CODE === 'true' ? { ok: true, devCode: code } : { ok: true };
}

/** Step 2: check the code, find or create the user, start a session. */
export async function verifyEmailLogin(
  env: Env,
  request: Request,
  ctx: ExecutionContext,
  body: { email?: unknown; code?: unknown; deviceMode?: unknown },
): Promise<{ me: MeResponse; cookie: string }> {
  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  const deviceMode: DeviceMode = body.deviceMode === 'shared' ? 'shared' : 'own';
  if (!email || !/^\d{6}$/.test(code)) throw new HttpError(400, 'invalid_code');
  await rateLimit(env, `ip:${clientIp(request)}:verify`, 30, HOUR);

  const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?')
    .bind(email)
    .first<{ code_hash: string; expires_at: string; attempts: number }>();
  if (!row || row.expires_at < nowIso() || row.attempts >= CODE_MAX_ATTEMPTS) throw new HttpError(400, 'code_expired');
  if (!safeEqual(row.code_hash, await codeHash(env, email, code))) {
    await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
    throw new HttpError(400, 'invalid_code');
  }
  await env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email).run();
  if (await isBlocked(env, email)) throw new HttpError(403, 'blocked');

  const user = await findOrCreateEmailUser(env, email);
  const { cookie, session } = await createSession(env, request, user.id, deviceMode);
  await audit(env, 'login', user.id, null, { method: 'email', device: session.device_name, mode: deviceMode });

  const mail = mailer(env);
  if (mail.configured) {
    const sig = await hmac(env.AUTH_SECRET, `signout:${session.id}`);
    const url = `${env.APP_ORIGIN}/api/sessions/${session.id}/signout?sig=${sig}`;
    ctx.waitUntil(mail.send(newLoginMail(email, session.device_name, session.created_at, url)).catch((e) => console.error(e)));
  }
  return { me: await me(env, user, session), cookie };
}

async function isBlocked(env: Env, email: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM users WHERE email = ? AND blocked_at IS NOT NULL AND deleted_at IS NULL')
    .bind(email)
    .first());
}

async function findOrCreateEmailUser(env: Env, email: string): Promise<UserRow> {
  const ts = nowIso();
  const byIdentity = await env.DB.prepare(
    `SELECT u.id, u.email, u.name FROM identities i JOIN users u ON u.id = i.user_id
     WHERE i.provider = 'email' AND i.subject = ? AND u.deleted_at IS NULL`,
  )
    .bind(email)
    .first<UserRow>();
  if (byIdentity) {
    await env.DB.prepare("UPDATE identities SET last_used_at = ? WHERE provider = 'email' AND subject = ?").bind(ts, email).run();
    return byIdentity;
  }
  // A verified e-mail address links to an existing user with the same verified address (§5 Linking accounts).
  const existing = await env.DB.prepare('SELECT id, email, name FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(email)
    .first<UserRow>();
  const user = existing ?? { id: crypto.randomUUID(), email, name: null };
  const stmts = [];
  if (!existing) {
    stmts.push(
      env.DB.prepare('INSERT INTO users (id, email, email_verified, name, created_at) VALUES (?, ?, 1, NULL, ?)').bind(user.id, email, ts),
    );
  } else {
    stmts.push(env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(user.id));
  }
  stmts.push(
    env.DB.prepare(
      "INSERT INTO identities (user_id, provider, subject, email, created_at, last_used_at) VALUES (?, 'email', ?, ?, ?, ?)",
    ).bind(user.id, email, email, ts, ts),
  );
  await env.DB.batch(stmts);
  return user;
}

async function createSession(env: Env, request: Request, userId: string, mode: DeviceMode) {
  const token = randomToken();
  const ts = nowIso();
  const session: SessionRow = {
    id: crypto.randomUUID(),
    token_hash: await sha256(token),
    user_id: userId,
    device_name: deviceName(request.headers.get('User-Agent')),
    device_mode: mode,
    created_at: ts,
    last_seen_at: ts,
    expires_at: addMs(mode === 'own' ? OWN_SESSION_TTL : SHARED_SESSION_TTL),
    revoked_at: null,
  };
  await env.DB.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, device_name, device_mode, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(session.id, session.token_hash, userId, session.device_name, mode, ts, ts, session.expires_at)
    .run();
  const cookie = sessionCookie(token, mode === 'own' ? OWN_SESSION_TTL / 1000 : null);
  return { session, cookie };
}

/**
 * Check the session cookie. A revoked session answers 401 with `wipe: true`
 * so the device deletes its local copy (§7.3).
 */
export async function authenticate(env: Env, request: Request): Promise<AuthContext> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) throw new HttpError(401, 'not_signed_in');
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<SessionRow>();
  // A blocked account keeps its data on the devices; any other revocation wipes it (§7.3).
  if (session?.revoked_at && session.revoked_reason === 'blocked') throw new HttpError(401, 'account_blocked', { wipe: false });
  if (!session || session.revoked_at) throw new HttpError(401, 'session_revoked', { wipe: true });

  const now = Date.now();
  const idle = session.device_mode === 'shared' && now - Date.parse(session.last_seen_at) > SHARED_IDLE_TIMEOUT;
  if (Date.parse(session.expires_at) <= now || idle) {
    throw new HttpError(401, 'session_expired', { wipe: session.device_mode === 'shared' });
  }

  const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(session.user_id)
    .first<UserRow>();
  if (!user) throw new HttpError(401, 'session_revoked', { wipe: true });

  // Sliding expiry for own devices (written at most hourly); activity tracking for shared devices.
  let refreshCookie: string | null = null;
  const sinceSeen = now - Date.parse(session.last_seen_at);
  if (session.device_mode === 'own' && sinceSeen > HOUR) {
    session.expires_at = addMs(OWN_SESSION_TTL, now);
    refreshCookie = sessionCookie(token, OWN_SESSION_TTL / 1000);
  }
  if (sinceSeen > (session.device_mode === 'own' ? HOUR : MINUTE)) {
    session.last_seen_at = new Date(now).toISOString();
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .bind(session.last_seen_at, session.expires_at, session.id)
      .run();
  }
  return { session, user, refreshCookie };
}

export async function me(env: Env, user: UserRow, session: SessionRow): Promise<MeResponse> {
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.name, m.role, t.status FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? AND t.status != 'pending_deletion' ORDER BY t.created_at`,
  )
    .bind(user.id)
    .all<{ id: string; name: string; role: string; status: string }>();
  return {
    user: { id: user.id, email: user.email, name: user.name },
    session: { id: session.id, deviceMode: session.device_mode, expiresAt: session.expires_at },
    tenants: results,
  };
}

export async function logout(env: Env, auth: AuthContext): Promise<string> {
  await revoke(env, auth.session.id);
  await audit(env, 'logout', auth.user.id, null, { device: auth.session.device_name });
  return clearSessionCookie();
}

export async function revoke(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(nowIso(), sessionId).run();
}

export async function listDevices(env: Env, auth: AuthContext): Promise<DeviceInfo[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, device_name, device_mode, created_at, last_seen_at FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`,
  )
    .bind(auth.user.id, nowIso())
    .all<Pick<SessionRow, 'id' | 'device_name' | 'device_mode' | 'created_at' | 'last_seen_at'>>();
  return results.map((r) => ({
    id: r.id,
    deviceName: r.device_name,
    deviceMode: r.device_mode,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    current: r.id === auth.session.id,
  }));
}

export async function revokeDevice(env: Env, auth: AuthContext, sessionId: string): Promise<void> {
  const res = await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL')
    .bind(nowIso(), sessionId, auth.user.id)
    .run();
  if (!res.meta.changes) throw new HttpError(404, 'not_found');
  await audit(env, 'remote_signout', auth.user.id, null, { session: sessionId });
}

export async function revokeOtherDevices(env: Env, auth: AuthContext): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL')
    .bind(nowIso(), auth.user.id, auth.session.id)
    .run();
  await audit(env, 'remote_signout_all', auth.user.id, null);
}

/** One-click sign-out from the new-login e-mail: the link is signed, so no login is needed. */
export async function checkSignOutLink(env: Env, sessionId: string, sig: string | null): Promise<boolean> {
  return !!sig && safeEqual(sig, await hmac(env.AUTH_SECRET, `signout:${sessionId}`));
}

export { clearSessionCookie };

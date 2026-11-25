/**
 * Admin environment on admin.inbalans.app: insight into users and storage, invites, blocking and deleting
 * accounts. Admins log in with an e-mail code; only addresses in the ADMIN_EMAILS secret get in.
 * Admin sessions are separate from user sessions: at most 8 hours, 30 minutes idle.
 */
import type {
  AdminDevice,
  AdminMe,
  AdminOverview,
  AdminTenant,
  AdminTenantDetail,
  TenantMetrics,
  AdminUser,
  AdminUserDetail,
  AuditEntry,
  Invite,
  TenantStorage,
} from '../../src/admin/protocol';
import { audit, codeHash, rateLimit } from './auth';
import type { Env } from './env';
import { clientIp, getCookie, HttpError, json, readJson } from './http';
import { loginCodeMail, mailer } from './mail';
import { startSupport } from './support';
import { purgeAccount } from './account';
import { addMs, DAY, HOUR, MINUTE, normalizeEmail, nowIso, randomCode, randomToken, safeEqual, sha256 } from './util';

export const ADMIN_COOKIE = '__Host-inbalans_admin';
const ADMIN_SESSION_TTL = 8 * HOUR;
const ADMIN_IDLE = 30 * MINUTE;
const CODE_TTL = 10 * MINUTE;

type Stub = {
  details(): Promise<TenantStorage & { tables: AdminUserDetail['tables'] }>;
  metrics(): Promise<TenantMetrics>;
  wipe(): Promise<void>;
};

export function adminEmails(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => normalizeEmail(e))
      .filter((e): e is string => !!e),
  );
}

function adminCookie(token: string | null): string {
  return token
    ? `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`
    : `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// ---------- Login ----------

async function startLogin(env: Env, request: Request, body: { email?: unknown }) {
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, 'invalid_email');
  await rateLimit(env, `ip:${clientIp(request)}:admin-start`, 10, HOUR);
  await rateLimit(env, `admin:${email}:start`, 5, HOUR);
  // Same answer for every address, so the admin list cannot be probed.
  if (!adminEmails(env).has(email)) return { ok: true };
  const mail = mailer(env);
  if (!mail.configured) throw new HttpError(503, 'mail_not_configured');
  const code = randomCode();
  const key = `admin:${email}`;
  await env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, created_at = excluded.created_at`,
  )
    .bind(key, await codeHash(env, key, code), addMs(CODE_TTL), nowIso())
    .run();
  const message = loginCodeMail(email, code, `https://${env.ADMIN_HOST}`);
  try {
    await mail.send({ ...message, subject: `${code} is je inlogcode voor InBalans beheer` });
  } catch {
    await env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(key).run();
    throw new HttpError(502, 'mail_failed');
  }
  return env.DEV_EXPOSE_LOGIN_CODE === 'true' ? { ok: true, devCode: code } : { ok: true };
}

async function verifyLogin(env: Env, request: Request, body: { email?: unknown; code?: unknown }) {
  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\s/g, '') : '';
  if (!email || !/^\d{6}$/.test(code)) throw new HttpError(400, 'invalid_code');
  await rateLimit(env, `ip:${clientIp(request)}:admin-verify`, 20, HOUR);
  const key = `admin:${email}`;
  const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?')
    .bind(key)
    .first<{ code_hash: string; expires_at: string; attempts: number }>();
  if (!row || row.expires_at < nowIso() || row.attempts >= 5) throw new HttpError(400, 'code_expired');
  if (!safeEqual(row.code_hash, await codeHash(env, key, code))) {
    await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?').bind(key).run();
    throw new HttpError(400, 'invalid_code');
  }
  await env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(key).run();
  if (!adminEmails(env).has(email)) throw new HttpError(403, 'not_admin');

  const token = randomToken();
  const ts = nowIso();
  const expiresAt = addMs(ADMIN_SESSION_TTL);
  await env.DB.prepare(
    'INSERT INTO admin_sessions (token_hash, email, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256(token), email, ts, ts, expiresAt)
    .run();
  await audit(env, 'admin_login', null, null, { admin: email });
  return { me: { email, expiresAt } satisfies AdminMe, cookie: adminCookie(token) };
}

interface AdminSession {
  token_hash: string;
  email: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

async function authenticateAdmin(env: Env, request: Request): Promise<AdminSession> {
  const token = getCookie(request, ADMIN_COOKIE);
  if (!token) throw new HttpError(401, 'not_signed_in');
  const s = await env.DB.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').bind(await sha256(token)).first<AdminSession>();
  const now = Date.now();
  if (!s || s.revoked_at || Date.parse(s.expires_at) <= now || now - Date.parse(s.last_seen_at) > ADMIN_IDLE) {
    throw new HttpError(401, 'session_expired');
  }
  // Removing an address from ADMIN_EMAILS ends its sessions immediately.
  if (!adminEmails(env).has(s.email)) throw new HttpError(401, 'not_admin');
  if (now - Date.parse(s.last_seen_at) > MINUTE) {
    await env.DB.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(nowIso(), s.token_hash).run();
  }
  return s;
}

// ---------- Data ----------

function tenantStub(env: Env, tenantId: string): Stub {
  const ns = env.DO_JURISDICTION ? env.TENANT.jurisdiction(env.DO_JURISDICTION as DurableObjectJurisdiction) : env.TENANT;
  return ns.get(ns.idFromName(tenantId)) as unknown as Stub;
}

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  blocked_at: string | null;
  last_seen_at: string | null;
  active_devices: number;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_status: string | null;
}

const USER_SELECT = `
  SELECT u.id, u.email, u.created_at, u.blocked_at,
    (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?1) AS active_devices,
    t.id AS tenant_id, t.name AS tenant_name, t.status AS tenant_status
  FROM users u
  LEFT JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
  LEFT JOIN tenants t ON t.id = m.tenant_id
  WHERE u.deleted_at IS NULL`;

async function storageOf(env: Env, tenantId: string | null) {
  if (!tenantId) return null;
  try {
    return await tenantStub(env, tenantId).details();
  } catch (e) {
    console.error('tenant details failed', e);
    return null;
  }
}

function toUser(r: UserRow, storage: (TenantStorage & { tables?: unknown }) | null): AdminUser {
  return {
    id: r.id,
    email: r.email,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    activeDevices: r.active_devices,
    blockedAt: r.blocked_at,
    tenant: r.tenant_id ? { id: r.tenant_id, name: r.tenant_name ?? '', status: r.tenant_status ?? '' } : null,
    storage: toStorage(storage),
  };
}

function toStorage(storage: (TenantStorage & { tables?: unknown }) | null): TenantStorage | null {
  return storage
    ? {
        records: storage.records,
        rev: storage.rev,
        conflicts: storage.conflicts,
        databaseBytes: storage.databaseBytes,
        lastChange: storage.lastChange,
      }
    : null;
}

async function listUsers(env: Env): Promise<AdminUser[]> {
  const { results } = await env.DB.prepare(`${USER_SELECT} ORDER BY last_seen_at DESC, u.created_at DESC`).bind(nowIso()).all<UserRow>();
  const storages = await Promise.all(results.map((r) => storageOf(env, r.tenant_id)));
  return results.map((r, i) => toUser(r, storages[i]));
}

async function userRow(env: Env, id: string): Promise<UserRow> {
  const r = await env.DB.prepare(`${USER_SELECT} AND u.id = ?2`).bind(nowIso(), id).first<UserRow>();
  if (!r) throw new HttpError(404, 'not_found');
  return r;
}

async function auditEntries(env: Env, where: string, bindings: unknown[], limit: number): Promise<AuditEntry[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.at, a.action, a.user_id, u.email AS user_email, a.tenant_id, a.detail
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ${where} ORDER BY a.id DESC LIMIT ${limit}`,
  )
    .bind(...bindings)
    .all<{ id: number; at: string; action: string; user_id: string | null; user_email: string | null; tenant_id: string | null; detail: string | null }>();
  return results.map((r) => ({
    id: r.id,
    at: r.at,
    action: r.action,
    userId: r.user_id,
    userEmail: r.user_email,
    tenantId: r.tenant_id,
    detail: r.detail,
  }));
}

async function userDetail(env: Env, id: string): Promise<AdminUserDetail> {
  const r = await userRow(env, id);
  const storage = await storageOf(env, r.tenant_id);
  const identities = await env.DB.prepare('SELECT provider, created_at, last_used_at FROM identities WHERE user_id = ?')
    .bind(id)
    .all<{ provider: string; created_at: string; last_used_at: string | null }>();
  const devices = await env.DB.prepare(
    `SELECT id, device_name, device_mode, created_at, last_seen_at, expires_at, revoked_at, revoked_reason
     FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 50`,
  )
    .bind(id)
    .all<{ id: string; device_name: string; device_mode: string; created_at: string; last_seen_at: string; expires_at: string; revoked_at: string | null; revoked_reason: string | null }>();
  return {
    ...toUser(r, storage),
    identities: identities.results.map((i) => ({ provider: i.provider, createdAt: i.created_at, lastUsedAt: i.last_used_at })),
    devices: devices.results.map(
      (d): AdminDevice => ({
        id: d.id,
        deviceName: d.device_name,
        deviceMode: d.device_mode,
        createdAt: d.created_at,
        lastSeenAt: d.last_seen_at,
        expiresAt: d.expires_at,
        revokedAt: d.revoked_at,
        revokedReason: d.revoked_reason,
      }),
    ),
    tables: storage?.tables ?? [],
    audit: await auditEntries(env, 'WHERE a.user_id = ?', [id], 50),
  };
}

async function overview(env: Env): Promise<AdminOverview> {
  const users = await listUsers(env);
  const now = Date.now();
  const activeWithin = (days: number) => users.filter((u) => u.lastSeenAt && now - Date.parse(u.lastSeenAt) <= days * DAY).length;
  const invites = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM invites i WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.email = i.email AND u.deleted_at IS NULL)',
  ).first<{ n: number }>();
  return {
    users: users.length,
    active7: activeWithin(7),
    active30: activeWithin(30),
    blocked: users.filter((u) => u.blockedAt).length,
    tenants: users.filter((u) => u.tenant).length,
    invitesOpen: invites?.n ?? 0,
    activeDevices: users.reduce((s, u) => s + u.activeDevices, 0),
    records: users.reduce((s, u) => s + (u.storage?.records ?? 0), 0),
    databaseBytes: users.reduce((s, u) => s + (u.storage?.databaseBytes ?? 0), 0),
    recent: await auditEntries(env, '', [], 25),
  };
}

// ---------- Administrations ----------

interface TenantRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  owner_id: string | null;
  owner_email: string | null;
  active_devices: number;
  support_until: string | null;
  support_viewed: string | null;
}

const TENANT_SELECT = `
  SELECT t.id, t.name, t.status, t.created_at, u.id AS owner_id, u.email AS owner_email,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ?1) AS active_devices,
    (SELECT MAX(g.expires_at) FROM support_grants g WHERE g.tenant_id = t.id AND g.revoked_at IS NULL AND g.expires_at > ?1) AS support_until,
    (SELECT MAX(g.last_viewed_at) FROM support_grants g WHERE g.tenant_id = t.id) AS support_viewed
  FROM tenants t
  LEFT JOIN memberships m ON m.tenant_id = t.id AND m.role = 'owner'
  LEFT JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL`;

function toTenant(r: TenantRow, storage: Awaited<ReturnType<typeof storageOf>>): AdminTenant {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    createdAt: r.created_at,
    owner: r.owner_id && r.owner_email ? { id: r.owner_id, email: r.owner_email } : null,
    activeDevices: r.active_devices,
    storage: toStorage(storage),
    supportUntil: r.support_until,
    supportLastViewedAt: r.support_viewed,
  };
}

async function listTenants(env: Env): Promise<AdminTenant[]> {
  const { results } = await env.DB.prepare(`${TENANT_SELECT} ORDER BY t.created_at DESC`).bind(nowIso()).all<TenantRow>();
  const storages = await Promise.all(results.map((r) => storageOf(env, r.id)));
  return results.map((r, i) => toTenant(r, storages[i]));
}

async function tenantDetail(env: Env, id: string): Promise<AdminTenantDetail> {
  const r = await env.DB.prepare(`${TENANT_SELECT} WHERE t.id = ?2`).bind(nowIso(), id).first<TenantRow>();
  if (!r) throw new HttpError(404, 'not_found');
  const storage = await storageOf(env, id);
  const metrics = await tenantStub(env, id).metrics().catch((e) => (console.error(e), null));
  const devices = r.owner_id
    ? (
        await env.DB.prepare(
          `SELECT id, device_name, device_mode, created_at, last_seen_at, expires_at, revoked_at, revoked_reason
           FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC`,
        )
          .bind(r.owner_id, nowIso())
          .all<{ id: string; device_name: string; device_mode: string; created_at: string; last_seen_at: string; expires_at: string; revoked_at: string | null; revoked_reason: string | null }>()
      ).results
    : [];
  return {
    ...toTenant(r, storage),
    tables: storage?.tables ?? [],
    metrics,
    devices: devices.map((d) => ({
      id: d.id,
      deviceName: d.device_name,
      deviceMode: d.device_mode,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
      expiresAt: d.expires_at,
      revokedAt: d.revoked_at,
      revokedReason: d.revoked_reason,
    })),
    audit: await auditEntries(env, 'WHERE a.tenant_id = ?', [id], 50),
  };
}

// ---------- Actions ----------

async function signOutAll(env: Env, id: string, reason: 'blocked' | null) {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(nowIso(), reason, id)
    .run();
}

async function block(env: Env, admin: string, id: string) {
  await userRow(env, id);
  await env.DB.prepare('UPDATE users SET blocked_at = ? WHERE id = ?').bind(nowIso(), id).run();
  await signOutAll(env, id, 'blocked');
  await audit(env, 'admin_block', id, null, { admin });
}

async function unblock(env: Env, admin: string, id: string) {
  await userRow(env, id);
  await env.DB.prepare('UPDATE users SET blocked_at = NULL WHERE id = ?').bind(id).run();
  await audit(env, 'admin_unblock', id, null, { admin });
}

/** Delete an account for good (see purgeAccount). The admin confirms by typing the e-mail address. */
async function deleteUser(env: Env, admin: string, id: string, confirmEmail: unknown) {
  const r = await userRow(env, id);
  if (typeof confirmEmail !== 'string' || normalizeEmail(confirmEmail) !== r.email) throw new HttpError(400, 'confirm_mismatch');
  const tenants = await purgeAccount(env, id, r.email);
  await audit(env, 'admin_delete_user', id, tenants[0] ?? null, { admin, tenants: tenants.length });
}

async function listInvites(env: Env): Promise<Invite[]> {
  const { results } = await env.DB.prepare(
    `SELECT i.email, i.note, i.created_at,
       EXISTS (SELECT 1 FROM users u WHERE u.email = i.email AND u.deleted_at IS NULL) AS registered
     FROM invites i ORDER BY i.created_at DESC`,
  ).all<{ email: string; note: string | null; created_at: string; registered: number }>();
  return results.map((r) => ({ email: r.email, note: r.note, createdAt: r.created_at, registered: !!r.registered }));
}

async function addInvite(env: Env, admin: string, body: { email?: unknown; note?: unknown }) {
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, 'invalid_email');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null;
  await env.DB.prepare('INSERT INTO invites (email, note, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO UPDATE SET note = excluded.note')
    .bind(email, note, nowIso())
    .run();
  await audit(env, 'admin_invite', null, null, { admin, email });
}

async function removeInvite(env: Env, admin: string, email: string) {
  const normalized = normalizeEmail(decodeURIComponent(email));
  if (!normalized) throw new HttpError(400, 'invalid_email');
  await env.DB.prepare('DELETE FROM invites WHERE email = ?').bind(normalized).run();
  await audit(env, 'admin_uninvite', null, null, { admin, email: normalized });
}

// ---------- Router ----------

export async function handleAdminApi(request: Request, env: Env, path: string): Promise<Response> {
  const method = request.method;
  if (path === '/api/admin/auth/start' && method === 'POST') return json(await startLogin(env, request, await readJson(request, 10_000)));
  if (path === '/api/admin/auth/verify' && method === 'POST') {
    const { me, cookie } = await verifyLogin(env, request, await readJson(request, 10_000));
    const res = json(me);
    res.headers.append('Set-Cookie', cookie);
    return res;
  }

  const session = await authenticateAdmin(env, request);
  const admin = session.email;

  if (path === '/api/admin/me' && method === 'GET') return json({ email: admin, expiresAt: session.expires_at } satisfies AdminMe);
  if (path === '/api/admin/auth/logout' && method === 'POST') {
    await env.DB.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ?').bind(nowIso(), session.token_hash).run();
    const res = json({ ok: true });
    res.headers.append('Set-Cookie', adminCookie(null));
    return res;
  }
  if (path === '/api/admin/overview' && method === 'GET') return json(await overview(env));
  if (path === '/api/admin/users' && method === 'GET') return json(await listUsers(env));
  if (path === '/api/admin/invites' && method === 'GET') return json(await listInvites(env));
  if (path === '/api/admin/invites' && method === 'POST') {
    await addInvite(env, admin, await readJson(request, 10_000));
    return json({ ok: true });
  }
  if (path === '/api/admin/audit' && method === 'GET') return json(await auditEntries(env, '', [], 200));
  if (path === '/api/admin/tenants' && method === 'GET') return json(await listTenants(env));
  const tenant = path.match(/^\/api\/admin\/tenants\/([\w-]+)(?:\/(support))?$/);
  if (tenant && !tenant[2] && method === 'GET') return json(await tenantDetail(env, tenant[1]));
  if (tenant && tenant[2] && method === 'POST') return json(await startSupport(env, null, admin, tenant[1]));

  const invite = path.match(/^\/api\/admin\/invites\/([^/]+)$/);
  if (invite && method === 'DELETE') {
    await removeInvite(env, admin, invite[1]);
    return json({ ok: true });
  }

  const user = path.match(/^\/api\/admin\/users\/([\w-]+)(?:\/([\w-]+))?$/);
  if (user) {
    const [, id, action] = user;
    if (!action && method === 'GET') return json(await userDetail(env, id));
    if (!action && method === 'DELETE') {
      const body = await readJson<{ confirmEmail?: unknown }>(request, 10_000);
      await deleteUser(env, admin, id, body.confirmEmail);
      return json({ ok: true });
    }
    if (method === 'POST' && action === 'signout-all') {
      await userRow(env, id);
      await signOutAll(env, id, null);
      await audit(env, 'admin_signout_all', id, null, { admin });
      return json({ ok: true });
    }
    if (method === 'POST' && action === 'block') {
      await block(env, admin, id);
      return json({ ok: true });
    }
    if (method === 'POST' && action === 'unblock') {
      await unblock(env, admin, id);
      return json({ ok: true });
    }
  }
  throw new HttpError(404, 'not_found');
}

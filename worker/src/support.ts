/**
 * Remote support: the owner allows support to look along in an administration, read-only, for 24 hours,
 * 3 or 7 days. The admin environment hands a one-time code to the app, which exchanges it for a
 * support session that may only pull data. Revoking or expiry ends running sessions immediately.
 */
import type { SupportGrantInfo, SupportSessionInfo } from '../../src/lib/sync/protocol';
import { audit } from './auth';
import type { Env } from './env';
import { getCookie, HttpError } from './http';
import { mailer, supportViewMail } from './mail';
import { addMs, HOUR, MINUTE, nowIso, randomToken, sha256 } from './util';

export const SUPPORT_COOKIE = '__Host-inbalans_support';
export const SUPPORT_DURATIONS_HOURS = [24, 72, 168] as const;
const HANDOFF_TTL = 2 * MINUTE;
const SESSION_TTL = 2 * HOUR;

interface GrantRow {
  id: string;
  tenant_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
}

/** The grant that is active now, if any. */
export async function activeGrant(env: Env, tenantId: string): Promise<GrantRow | null> {
  return env.DB.prepare(
    'SELECT * FROM support_grants WHERE tenant_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(tenantId, nowIso())
    .first<GrantRow>();
}

export async function grantInfo(env: Env, tenantId: string): Promise<SupportGrantInfo> {
  const grant = await activeGrant(env, tenantId);
  const viewed = await env.DB.prepare('SELECT MAX(last_viewed_at) AS at FROM support_grants WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ at: string | null }>();
  return {
    active: grant ? { createdAt: grant.created_at, expiresAt: grant.expires_at } : null,
    lastViewedAt: viewed?.at ?? null,
  };
}

/** Owner: allow support for 24, 72 or 168 hours. Replaces a running grant. */
export async function grantSupport(env: Env, userId: string, tenantId: string, hours: unknown): Promise<SupportGrantInfo> {
  if (!SUPPORT_DURATIONS_HOURS.includes(hours as 24)) throw new HttpError(400, 'invalid_duration');
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE support_grants SET revoked_at = ? WHERE tenant_id = ? AND revoked_at IS NULL').bind(ts, tenantId),
    env.DB.prepare(
      'INSERT INTO support_grants (id, tenant_id, granted_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), tenantId, userId, ts, addMs((hours as number) * HOUR)),
  ]);
  await audit(env, 'support_granted', userId, tenantId, { hours });
  return grantInfo(env, tenantId);
}

/** Owner: withdraw permission; running support sessions end at their next request. */
export async function revokeSupport(env: Env, userId: string, tenantId: string): Promise<SupportGrantInfo> {
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE support_grants SET revoked_at = ? WHERE tenant_id = ? AND revoked_at IS NULL').bind(ts, tenantId),
    env.DB.prepare('UPDATE support_sessions SET revoked_at = ? WHERE tenant_id = ? AND revoked_at IS NULL').bind(ts, tenantId),
  ]);
  await audit(env, 'support_revoked', userId, tenantId);
  return grantInfo(env, tenantId);
}

/** Admin: start looking along. Returns a one-time code for the app; the owner is e-mailed. */
export async function startSupport(env: Env, ctx: ExecutionContext | null, admin: string, tenantId: string): Promise<{ url: string }> {
  const grant = await activeGrant(env, tenantId);
  if (!grant) throw new HttpError(403, 'support_not_allowed');
  const tenant = await env.DB.prepare('SELECT name FROM tenants WHERE id = ?').bind(tenantId).first<{ name: string }>();
  if (!tenant) throw new HttpError(404, 'not_found');
  const code = randomToken();
  await env.DB.prepare(
    'INSERT INTO support_handoffs (code_hash, grant_id, tenant_id, admin_email, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256(code), grant.id, tenantId, admin, addMs(HANDOFF_TTL))
    .run();
  const ts = nowIso();
  await env.DB.prepare('UPDATE support_grants SET last_viewed_at = ? WHERE id = ?').bind(ts, grant.id).run();
  await audit(env, 'support_started', null, tenantId, { admin });

  const mail = mailer(env);
  if (mail.configured) {
    const { results: owners } = await env.DB.prepare(
      `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = ? AND m.role = 'owner' AND u.deleted_at IS NULL`,
    )
      .bind(tenantId)
      .all<{ email: string }>();
    const sends = owners.map((o) =>
      mail.send(supportViewMail(o.email, tenant.name, ts, `${env.APP_ORIGIN}/#/settings`)).catch((e) => console.error(e)),
    );
    if (ctx) ctx.waitUntil(Promise.all(sends));
    else await Promise.all(sends);
  }
  return { url: `${env.APP_ORIGIN}/#/support?code=${code}` };
}

/** App: exchange the one-time code for a read-only support session. */
export async function redeemSupport(env: Env, body: { code?: unknown }): Promise<{ info: SupportSessionInfo; cookie: string }> {
  if (typeof body.code !== 'string' || body.code.length > 100) throw new HttpError(400, 'invalid_code');
  const hash = await sha256(body.code);
  const handoff = await env.DB.prepare('SELECT * FROM support_handoffs WHERE code_hash = ?')
    .bind(hash)
    .first<{ grant_id: string; tenant_id: string; admin_email: string; expires_at: string; used_at: string | null }>();
  if (!handoff || handoff.used_at || handoff.expires_at < nowIso()) throw new HttpError(400, 'code_expired');
  await env.DB.prepare('UPDATE support_handoffs SET used_at = ? WHERE code_hash = ?').bind(nowIso(), hash).run();
  const grant = await activeGrant(env, handoff.tenant_id);
  if (!grant || grant.id !== handoff.grant_id) throw new HttpError(403, 'support_not_allowed');
  const tenant = await env.DB.prepare('SELECT name FROM tenants WHERE id = ?').bind(handoff.tenant_id).first<{ name: string }>();

  const token = randomToken();
  const ts = nowIso();
  const expiresAt = new Date(Math.min(Date.parse(grant.expires_at), Date.now() + SESSION_TTL)).toISOString();
  await env.DB.prepare(
    `INSERT INTO support_sessions (token_hash, grant_id, tenant_id, admin_email, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(await sha256(token), grant.id, handoff.tenant_id, handoff.admin_email, ts, ts, expiresAt)
    .run();
  return {
    info: { tenantId: handoff.tenant_id, tenantName: tenant?.name ?? '', adminEmail: handoff.admin_email, expiresAt },
    // Browser-session cookie: closing the window ends looking along.
    cookie: `${SUPPORT_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  };
}

export interface SupportAuth {
  tokenHash: string;
  tenantId: string;
  adminEmail: string;
  expiresAt: string;
}

/** Valid support session with a still active grant; otherwise 401 support_ended (the app wipes its in-memory copy). */
export async function authenticateSupport(env: Env, request: Request): Promise<SupportAuth> {
  const token = getCookie(request, SUPPORT_COOKIE);
  if (!token) throw new HttpError(401, 'support_ended', { wipe: true });
  const s = await env.DB.prepare('SELECT * FROM support_sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ token_hash: string; grant_id: string; tenant_id: string; admin_email: string; expires_at: string; revoked_at: string | null }>();
  const grant = s ? await activeGrant(env, s.tenant_id) : null;
  if (!s || s.revoked_at || s.expires_at <= nowIso() || !grant || grant.id !== s.grant_id) {
    throw new HttpError(401, 'support_ended', { wipe: true });
  }
  return { tokenHash: s.token_hash, tenantId: s.tenant_id, adminEmail: s.admin_email, expiresAt: s.expires_at };
}

export async function endSupport(env: Env, auth: SupportAuth): Promise<string> {
  await env.DB.prepare('UPDATE support_sessions SET revoked_at = ? WHERE token_hash = ?').bind(nowIso(), auth.tokenHash).run();
  await audit(env, 'support_ended', null, auth.tenantId, { admin: auth.adminEmail });
  return `${SUPPORT_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

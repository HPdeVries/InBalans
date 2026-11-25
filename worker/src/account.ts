/**
 * Deleting an account: by the user (Settings → Gevarenzone, confirmed with an e-mail code)
 * or by an admin. Both end in `purgeAccount`.
 */
import type { Env } from './env';
import { audit, rateLimit, type AuthContext } from './auth';
import { HttpError } from './http';
import { accountDeletedMail, deleteCodeMail, mailer } from './mail';
import { addMs, hmac, MINUTE, HOUR, nowIso, randomCode, safeEqual } from './util';

const CODE_TTL = 10 * MINUTE;
const CODE_MAX_ATTEMPTS = 5;

async function wipeTenant(env: Env, tenantId: string): Promise<void> {
  const ns = env.DO_JURISDICTION ? env.TENANT.jurisdiction(env.DO_JURISDICTION as DurableObjectJurisdiction) : env.TENANT;
  await ns.get(ns.idFromName(tenantId)).wipe();
}

/**
 * Delete an account for good: the tenant data in the Durable Object is wiped, sessions are revoked
 * (devices wipe their copy at the next contact), identities, memberships, tenants and invite are removed.
 * The user row is kept anonymised so revoked devices still get the wipe signal; it holds no e-mail address.
 * Returns the ids of the deleted tenants.
 */
export async function purgeAccount(env: Env, userId: string, email: string): Promise<string[]> {
  const { results: owned } = await env.DB.prepare("SELECT tenant_id FROM memberships WHERE user_id = ? AND role = 'owner'")
    .bind(userId)
    .all<{ tenant_id: string }>();
  for (const t of owned) await wipeTenant(env, t.tenant_id);
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?), revoked_reason = NULL WHERE user_id = ?').bind(ts, userId),
    ...owned.flatMap((t) => [
      env.DB.prepare('DELETE FROM support_sessions WHERE grant_id IN (SELECT id FROM support_grants WHERE tenant_id = ?)').bind(t.tenant_id),
      env.DB.prepare('DELETE FROM support_handoffs WHERE grant_id IN (SELECT id FROM support_grants WHERE tenant_id = ?)').bind(t.tenant_id),
      env.DB.prepare('DELETE FROM support_grants WHERE tenant_id = ?').bind(t.tenant_id),
      env.DB.prepare('DELETE FROM memberships WHERE tenant_id = ?').bind(t.tenant_id),
      env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(t.tenant_id),
    ]),
    env.DB.prepare('DELETE FROM memberships WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM identities WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email),
    env.DB.prepare('DELETE FROM account_delete_codes WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM invites WHERE email = ?').bind(email),
    env.DB.prepare(
      "UPDATE users SET email = 'deleted-' || id || '@deleted.invalid', name = NULL, blocked_at = NULL, deleted_at = ? WHERE id = ?",
    ).bind(ts, userId),
  ]);
  return owned.map((t) => t.tenant_id);
}

const deleteCodeHash = (env: Env, userId: string, code: string) => hmac(env.AUTH_SECRET, `delete:${userId}:${code}`);

/** Step 1: mail a confirmation code to the account's address. */
export async function startAccountDeletion(env: Env, auth: AuthContext): Promise<{ ok: true; devCode?: string }> {
  await rateLimit(env, `user:${auth.user.id}:delete`, 5, HOUR);
  const mail = mailer(env);
  if (!mail.configured) throw new HttpError(503, 'mail_not_configured');
  const code = randomCode();
  await env.DB.prepare(
    `INSERT INTO account_delete_codes (user_id, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, created_at = excluded.created_at`,
  )
    .bind(auth.user.id, await deleteCodeHash(env, auth.user.id, code), addMs(CODE_TTL), nowIso())
    .run();
  try {
    await mail.send(deleteCodeMail(auth.user.email, code));
  } catch {
    await env.DB.prepare('DELETE FROM account_delete_codes WHERE user_id = ?').bind(auth.user.id).run();
    throw new HttpError(502, 'mail_failed');
  }
  await audit(env, 'account_delete_requested', auth.user.id, null, { device: auth.session.device_name });
  return env.DEV_EXPOSE_LOGIN_CODE === 'true' ? { ok: true, devCode: code } : { ok: true };
}

/** Step 2: check the code and delete the account with all its data. */
export async function confirmAccountDeletion(env: Env, ctx: ExecutionContext, auth: AuthContext, body: { code?: unknown }) {
  const code = typeof body?.code === 'string' ? body.code.replace(/\s/g, '') : '';
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'invalid_code');
  const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM account_delete_codes WHERE user_id = ?')
    .bind(auth.user.id)
    .first<{ code_hash: string; expires_at: string; attempts: number }>();
  if (!row || row.expires_at < nowIso() || row.attempts >= CODE_MAX_ATTEMPTS) throw new HttpError(400, 'code_expired');
  if (!safeEqual(row.code_hash, await deleteCodeHash(env, auth.user.id, code))) {
    await env.DB.prepare('UPDATE account_delete_codes SET attempts = attempts + 1 WHERE user_id = ?').bind(auth.user.id).run();
    throw new HttpError(400, 'invalid_code');
  }
  const email = auth.user.email;
  const tenants = await purgeAccount(env, auth.user.id, email);
  await audit(env, 'account_deleted', auth.user.id, tenants[0] ?? null, { tenants: tenants.length, device: auth.session.device_name });
  const mail = mailer(env);
  if (mail.configured) ctx.waitUntil(mail.send(accountDeletedMail(email, nowIso())).catch((e) => console.error(e)));
  return { ok: true as const };
}

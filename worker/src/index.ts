/**
 * InBalans Worker: serves the app (static assets) and the API under /api on the same origin.
 * See docs/SYNC_DESIGN.md.
 */
import type { ServerConfig, SyncRequest } from '../../src/lib/sync/protocol';
import {
  audit,
  authenticate,
  checkSignOutLink,
  listDevices,
  logout,
  me,
  revoke,
  revokeDevice,
  revokeOtherDevices,
  startEmailLogin,
  verifyEmailLogin,
  type AuthContext,
} from './auth';
import type { Env } from './env';
import { errorResponse, HttpError, json, readJson } from './http';
import { nowIso } from './util';

export { TenantStore } from './tenant';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e);
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * State-changing requests must come from our own origin. Together with SameSite=Lax cookies and
 * the custom header (which a cross-site form cannot send) this prevents CSRF.
 */
function checkOrigin(request: Request, url: URL): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin');
  if (request.headers.get('X-InBalans') !== '1') throw new HttpError(403, 'bad_request');
}

function withCookie(response: Response, cookie: string | null): Response {
  if (cookie) response.headers.append('Set-Cookie', cookie);
  return response;
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // One-click sign-out link from the new-login e-mail (no session needed, the link is signed).
  const signOut = path.match(/^\/api\/sessions\/([\w-]+)\/signout$/);
  if (signOut) return signOutPage(request, env, signOut[1], url);

  // Tells the app whether this installation offers sync (the same build also runs without API, e.g. on Pages).
  if (path === '/api/config' && method === 'GET') {
    return json({ sync: { available: env.SYNC_AVAILABLE !== 'false', beta: true } } satisfies ServerConfig);
  }

  checkOrigin(request, url);

  if (path === '/api/auth/email/start' && method === 'POST') {
    return json(await startEmailLogin(env, request, await readJson(request, 10_000)));
  }
  if (path === '/api/auth/email/verify' && method === 'POST') {
    const { me: body, cookie } = await verifyEmailLogin(env, request, ctx, await readJson(request, 10_000));
    return withCookie(json(body), cookie);
  }

  const auth = await authenticate(env, request);
  const respond = (body: unknown, status = 200) => withCookie(json(body, status), auth.refreshCookie);

  if (path === '/api/me' && method === 'GET') return respond(await me(env, auth.user, auth.session));
  if (path === '/api/auth/logout' && method === 'POST') return withCookie(json({ ok: true }), await logout(env, auth));
  if (path === '/api/sessions' && method === 'GET') return respond(await listDevices(env, auth));
  if (path === '/api/sessions/revoke-others' && method === 'POST') {
    await revokeOtherDevices(env, auth);
    return respond({ ok: true });
  }
  const session = path.match(/^\/api\/sessions\/([\w-]+)$/);
  if (session && method === 'DELETE') {
    await revokeDevice(env, auth, session[1]);
    return respond({ ok: true });
  }

  if (path === '/api/tenants' && method === 'POST') {
    const body = await readJson<{ name?: unknown }>(request, 10_000);
    return respond(await createTenant(env, auth, body.name), 201);
  }
  const tenantPath = path.match(/^\/api\/tenants\/([\w-]+)$/);
  if (tenantPath && method === 'GET') {
    await tenantAccess(env, auth, tenantPath[1]);
    return respond(await tenantStub(env, tenantPath[1]).stats());
  }
  const syncPath = path.match(/^\/api\/tenants\/([\w-]+)\/sync$/);
  if (syncPath && method === 'POST') {
    return respond(await syncTenant(env, auth, syncPath[1], await readJson<SyncRequest>(request, 20_000_000)));
  }
  throw new HttpError(404, 'not_found');
}

async function createTenant(env: Env, auth: AuthContext, name: unknown) {
  // Beta: one administration per user.
  const owned = await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE user_id = ? AND role = 'owner'")
    .bind(auth.user.id)
    .first<{ n: number }>();
  if ((owned?.n ?? 0) >= 1) throw new HttpError(409, 'tenant_limit');
  const tenant = {
    id: crypto.randomUUID(),
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : 'Mijn administratie',
    role: 'owner',
    status: 'active',
  };
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO tenants (id, name, created_at, status) VALUES (?, ?, ?, 'active')").bind(tenant.id, tenant.name, ts),
    env.DB.prepare("INSERT INTO memberships (user_id, tenant_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(auth.user.id, tenant.id, ts),
  ]);
  await audit(env, 'tenant_created', auth.user.id, tenant.id);
  return tenant;
}

export function tenantStub(env: Env, tenantId: string) {
  const ns = env.DO_JURISDICTION ? env.TENANT.jurisdiction(env.DO_JURISDICTION as DurableObjectJurisdiction) : env.TENANT;
  return ns.get(ns.idFromName(tenantId));
}

/** Session → membership → tenant status (§5 Sessions). Returns the tenant status. */
async function tenantAccess(env: Env, auth: AuthContext, tenantId: string): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT t.status FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = ? AND m.tenant_id = ?',
  )
    .bind(auth.user.id, tenantId)
    .first<{ status: string }>();
  if (!row || row.status === 'pending_deletion') throw new HttpError(404, 'not_found');
  return row.status;
}

async function syncTenant(env: Env, auth: AuthContext, tenantId: string, body: SyncRequest) {
  const status = await tenantAccess(env, auth, tenantId);
  if (typeof body?.deviceId !== 'string' || body.deviceId.length > 100 || !Array.isArray(body.changes)) {
    throw new HttpError(400, 'invalid_request');
  }
  if (status === 'read_only' && body.changes.length) throw new HttpError(403, 'read_only');
  try {
    return await tenantStub(env, tenantId).sync({ deviceId: body.deviceId, since: body.since, changes: body.changes });
  } catch (e) {
    if (e instanceof Error && e.message === 'too-many-changes') throw new HttpError(413, 'too_many_changes');
    throw e;
  }
}

async function signOutPage(request: Request, env: Env, sessionId: string, url: URL): Promise<Response> {
  const sig = url.searchParams.get('sig');
  const page = (body: string, status = 200) =>
    new Response(
      `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>InBalans</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">${body}</body></html>`,
      { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  if (!(await checkSignOutLink(env, sessionId, sig))) return page('<p>Deze link is ongeldig.</p>', 400);
  // GET only shows a button: mail scanners that open links must not sign the device out.
  if (request.method !== 'POST') {
    return page(
      `<h1>Apparaat afmelden</h1><p>Wil je dit apparaat afmelden bij InBalans? De gegevens op dat apparaat worden verwijderd zodra het weer verbinding maakt.</p>` +
        `<form method="post"><button style="font-size:1rem;padding:.6rem 1rem">Afmelden</button></form>`,
    );
  }
  await revoke(env, sessionId);
  await audit(env, 'remote_signout_link', null, null, { session: sessionId });
  return page('<h1>Afgemeld</h1><p>Het apparaat is afgemeld.</p>');
}

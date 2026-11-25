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
import { handleAdminApi } from './admin';
import { authenticateSupport, endSupport, grantInfo, grantSupport, redeemSupport, revokeSupport } from './support';
import type { Env } from './env';
import { errorResponse, HttpError, json, readJson } from './http';
import { nowIso } from './util';

export { TenantStore } from './tenant';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const admin = url.hostname === env.ADMIN_HOST;
    if (!url.pathname.startsWith('/api/')) return admin ? adminAssets(request, env, url) : appAssets(request, env, url);
    try {
      if (admin) {
        if (!url.pathname.startsWith('/api/admin/')) throw new HttpError(404, 'not_found');
        checkOrigin(request, url);
        return await handleAdminApi(request, env, url.pathname.replace(/\/+$/, ''));
      }
      if (url.pathname.startsWith('/api/admin/')) throw new HttpError(404, 'not_found');
      return await handleApi(request, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return errorResponse(e);
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

/** The app: everything except the admin page. */
function appAssets(request: Request, env: Env, url: URL): Promise<Response> | Response {
  if (url.pathname === '/admin' || url.pathname === '/admin.html') return new Response('Not found', { status: 404 });
  return env.ASSETS.fetch(request);
}

/**
 * The admin host serves only the admin page and its static files (never the app or its service worker),
 * with strict headers: no framing, no indexing, no caching of the page.
 */
async function adminAssets(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname.startsWith('/assets/') || url.pathname === '/favicon.svg') return env.ASSETS.fetch(request);
  if (url.pathname !== '/') return Response.redirect(new URL('/', url).toString(), 302);
  const page = await env.ASSETS.fetch(new Request(new URL('/admin', url), request));
  const res = new Response(page.body, page);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

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

  // Remote support: a one-time code from the admin environment becomes a read-only support session.
  if (path === '/api/support/redeem' && method === 'POST') {
    const { info, cookie } = await redeemSupport(env, await readJson(request, 10_000));
    return withCookie(json(info), cookie);
  }
  if (request.headers.get('X-InBalans-Support') === '1') return handleSupport(request, env, path);

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
  const supportPath = path.match(/^\/api\/tenants\/([\w-]+)\/support$/);
  if (supportPath) {
    const tenantId = supportPath[1];
    await ownerAccess(env, auth, tenantId);
    if (method === 'GET') return respond(await grantInfo(env, tenantId));
    if (method === 'POST') {
      const body = await readJson<{ hours?: unknown }>(request, 10_000);
      return respond(await grantSupport(env, auth.user.id, tenantId, body.hours));
    }
    if (method === 'DELETE') return respond(await revokeSupport(env, auth.user.id, tenantId));
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

/**
 * Requests of a read-only support session (header X-InBalans-Support: 1). Only pulling data is allowed;
 * any change is refused, also when the app would try.
 */
async function handleSupport(request: Request, env: Env, path: string): Promise<Response> {
  const auth = await authenticateSupport(env, request);
  if (path === '/api/support/me' && request.method === 'GET') {
    const tenant = await env.DB.prepare('SELECT name FROM tenants WHERE id = ?').bind(auth.tenantId).first<{ name: string }>();
    return json({ tenantId: auth.tenantId, tenantName: tenant?.name ?? '', adminEmail: auth.adminEmail, expiresAt: auth.expiresAt });
  }
  if (path === '/api/support/end' && request.method === 'POST') return withCookie(json({ ok: true }), await endSupport(env, auth));
  const syncPath = path.match(/^\/api\/tenants\/([\w-]+)\/sync$/);
  if (syncPath && request.method === 'POST') {
    if (syncPath[1] !== auth.tenantId) throw new HttpError(403, 'forbidden');
    const body = await readJson<SyncRequest>(request, 20_000_000);
    if (!Array.isArray(body?.changes) || body.changes.length) throw new HttpError(403, 'read_only');
    return json(await tenantStub(env, auth.tenantId).sync({ deviceId: `support:${auth.adminEmail}`, since: body.since, changes: [] }));
  }
  throw new HttpError(403, 'read_only');
}

async function followBusinessName(env: Env, tenantId: string, name: string | null): Promise<void> {
  const trimmed = name?.trim().slice(0, 100);
  if (!trimmed) return;
  await env.DB.prepare('UPDATE tenants SET name = ? WHERE id = ? AND name != ?').bind(trimmed, tenantId, trimmed).run();
}

/** Only the owner manages remote support. */
async function ownerAccess(env: Env, auth: AuthContext, tenantId: string): Promise<void> {
  const row = await env.DB.prepare("SELECT 1 FROM memberships WHERE user_id = ? AND tenant_id = ? AND role = 'owner'")
    .bind(auth.user.id, tenantId)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
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
    const stub = tenantStub(env, tenantId);
    const result = await stub.sync({ deviceId: body.deviceId, since: body.since, changes: body.changes });
    // The administration is named after the business: follow changes of the business name.
    if (body.changes.some((c) => c?.tbl === 'settings')) await followBusinessName(env, tenantId, await stub.businessName());
    return result;
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

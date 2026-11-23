import type { AdminMe, AdminOverview, AdminUser, AdminUserDetail, AuditEntry, Invite } from './protocol';

export class AdminApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Called when the admin session ended (expired, idle or revoked). */
let onSignedOut: (() => void) | null = null;
export function setSignedOutHandler(fn: () => void): void {
  onSignedOut = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { 'X-InBalans': '1' } : { 'Content-Type': 'application/json', 'X-InBalans': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AdminApiError(0, 'offline');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const err = new AdminApiError(res.status, data.error ?? 'error');
    if (res.status === 401 && path !== '/me') onSignedOut?.();
    throw err;
  }
  return data;
}

export const adminApi = {
  start: (email: string) => request<{ ok: true; devCode?: string }>('POST', '/auth/start', { email }),
  verify: (email: string, code: string) => request<AdminMe>('POST', '/auth/verify', { email, code }),
  me: () => request<AdminMe>('GET', '/me'),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  overview: () => request<AdminOverview>('GET', '/overview'),
  users: () => request<AdminUser[]>('GET', '/users'),
  user: (id: string) => request<AdminUserDetail>('GET', `/users/${id}`),
  signOutAll: (id: string) => request<{ ok: true }>('POST', `/users/${id}/signout-all`),
  block: (id: string) => request<{ ok: true }>('POST', `/users/${id}/block`),
  unblock: (id: string) => request<{ ok: true }>('POST', `/users/${id}/unblock`),
  deleteUser: (id: string, confirmEmail: string) => request<{ ok: true }>('DELETE', `/users/${id}`, { confirmEmail }),
  invites: () => request<Invite[]>('GET', '/invites'),
  invite: (email: string, note: string) => request<{ ok: true }>('POST', '/invites', { email, note }),
  uninvite: (email: string) => request<{ ok: true }>('DELETE', `/invites/${encodeURIComponent(email)}`),
  audit: () => request<AuditEntry[]>('GET', '/audit'),
};

const ERRORS: Record<string, string> = {
  invalid_email: 'Vul een geldig e-mailadres in.',
  invalid_code: 'Deze code klopt niet.',
  code_expired: 'Deze code is verlopen of te vaak fout ingevuld. Vraag een nieuwe code aan.',
  rate_limited: 'Te veel pogingen. Probeer het later opnieuw.',
  mail_failed: 'De e-mail kon niet worden verstuurd.',
  mail_not_configured: 'E-mail is niet ingesteld.',
  not_admin: 'Dit adres heeft geen toegang tot het beheer.',
  confirm_mismatch: 'Het ingevulde e-mailadres komt niet overeen.',
  offline: 'Geen verbinding.',
  not_found: 'Niet gevonden.',
};

export function errorText(e: unknown): string {
  return (e instanceof AdminApiError && ERRORS[e.code]) || 'Er ging iets mis. Probeer het opnieuw.';
}

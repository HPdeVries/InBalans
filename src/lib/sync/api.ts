import type { ApiError, ServerConfig, DeviceInfo, DeviceMode, MeResponse, SyncRequest, SyncResponse } from './protocol';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    public wipe = false,
  ) {
    super(code);
  }
  /** No connection (or the server could not be reached). */
  get offline(): boolean {
    return this.status === 0;
  }
}

/** Called when the server says this device was signed out remotely (§7.3). */
let onRevoked: ((wipe: boolean) => void) | null = null;
export function setRevokedHandler(fn: (wipe: boolean) => void): void {
  onRevoked = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { 'X-InBalans': '1' } : { 'Content-Type': 'application/json', 'X-InBalans': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, 'offline');
  }
  const type = res.headers.get('Content-Type') ?? '';
  // Without the Worker (e.g. a plain static host or `vite dev`) /api returns the app's HTML.
  if (!type.includes('application/json')) throw new ApiRequestError(res.ok ? 503 : res.status, 'no_api');
  const data = (await res.json()) as T & Partial<ApiError>;
  if (!res.ok) {
    const err = new ApiRequestError(res.status, data.error ?? 'error', !!data.wipe);
    if (res.status === 401 && onRevoked && (err.code === 'session_revoked' || err.code === 'session_expired')) {
      onRevoked(err.wipe);
    }
    throw err;
  }
  return data;
}

export const api = {
  config: () => request<ServerConfig>('GET', '/config'),
  startEmailLogin: (email: string) => request<{ ok: true; devCode?: string }>('POST', '/auth/email/start', { email }),
  verifyEmailLogin: (email: string, code: string, deviceMode: DeviceMode) =>
    request<MeResponse>('POST', '/auth/email/verify', { email, code, deviceMode }),
  me: () => request<MeResponse>('GET', '/me'),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  devices: () => request<DeviceInfo[]>('GET', '/sessions'),
  revokeDevice: (id: string) => request<{ ok: true }>('DELETE', `/sessions/${encodeURIComponent(id)}`),
  revokeOtherDevices: () => request<{ ok: true }>('POST', '/sessions/revoke-others'),
  createTenant: (name: string) => request<MeResponse['tenants'][number]>('POST', '/tenants', { name }),
  tenantStats: (tenantId: string) =>
    request<{ records: number; rev: number; conflicts: number }>('GET', `/tenants/${encodeURIComponent(tenantId)}`),
  sync: (tenantId: string, body: SyncRequest) =>
    request<SyncResponse>('POST', `/tenants/${encodeURIComponent(tenantId)}/sync`, body),
};

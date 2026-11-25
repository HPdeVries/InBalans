/**
 * Live updates: while the app is open it keeps a WebSocket to its administration. The server only
 * sends the latest revision; when it is newer than what this device has, a normal sync follows.
 * Without a connection the app falls back to syncing on focus, on changes and every few minutes.
 */
import { writable } from 'svelte/store';

export const liveConnected = writable(false);

const PING_INTERVAL = 30_000;
const MAX_BACKOFF = 60_000;

export interface LiveOptions {
  tenantId: string;
  deviceId: string;
  support: boolean;
  /** Last revision this device pulled. */
  knownRev: () => Promise<number>;
  onRemoteChange: () => void;
}

export function startLive(opts: LiveOptions): () => void {
  if (typeof WebSocket === 'undefined') return () => {};
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const url = () => {
    const u = new URL(`/api/tenants/${encodeURIComponent(opts.tenantId)}/live`, location.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('device', opts.deviceId);
    if (opts.support) u.searchParams.set('support', '1');
    return u.toString();
  };

  function connect() {
    clearTimeout(reconnectTimer);
    if (stopped || ws || !navigator.onLine) return;
    const socket = new WebSocket(url());
    ws = socket;
    socket.onopen = () => {
      attempts = 0;
      liveConnected.set(true);
      pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('ping'), PING_INTERVAL);
    };
    socket.onmessage = async (ev) => {
      if (ev.data === 'pong') return;
      try {
        const msg = JSON.parse(String(ev.data)) as { type?: string; rev?: number };
        if (msg.type === 'rev' && typeof msg.rev === 'number' && msg.rev !== (await opts.knownRev())) opts.onRemoteChange();
      } catch {
        /* ignore malformed messages */
      }
    };
    socket.onclose = (ev) => {
      clearInterval(pingTimer);
      if (ws === socket) ws = null;
      liveConnected.set(false);
      if (stopped) return;
      // The administration was deleted or access ended: a sync gets the server's answer (e.g. wipe).
      if (ev.code === 4000) opts.onRemoteChange();
      attempts++;
      const delay = Math.min(1000 * 2 ** Math.min(attempts - 1, 6), MAX_BACKOFF);
      reconnectTimer = setTimeout(connect, delay * (0.75 + Math.random() / 2));
    };
  }

  const reconnectNow = () => {
    attempts = 0;
    connect();
  };
  const onVisible = () => document.visibilityState === 'visible' && reconnectNow();
  window.addEventListener('online', reconnectNow);
  document.addEventListener('visibilitychange', onVisible);
  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    window.removeEventListener('online', reconnectNow);
    document.removeEventListener('visibilitychange', onVisible);
    ws?.close(1000, 'stopped');
    ws = null;
    liveConnected.set(false);
  };
}

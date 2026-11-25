import { DurableObject } from 'cloudflare:workers';
import type { SyncRequest, SyncResponse } from '../../src/lib/sync/protocol';
import type { Env } from './env';
import { businessName, lastChange, lastRev, migrate, stats, sync, tableStats, tenantMetrics, type Sql } from './syncCore';

/**
 * The bookkeeping data of one tenant (SQLite-backed Durable Object, EU jurisdiction).
 * Only reachable through the Worker, which checks session, membership and tenant status first.
 * Requests are handled one at a time, so sync rounds never race.
 */
export class TenantStore extends DurableObject<Env> {
  private sql: Sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const storage = ctx.storage.sql;
    this.sql = {
      all: (q, ...b) => storage.exec(q, ...b).toArray() as never,
      run: (q, ...b) => void storage.exec(q, ...b),
    };
    ctx.blockConcurrencyWhile(async () => migrate(this.sql));
    // Keep-alive pings are answered without waking the object (WebSocket hibernation).
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async sync(req: SyncRequest): Promise<SyncResponse> {
    const before = lastRev(this.sql);
    const res = this.ctx.storage.transactionSync(() => sync(this.sql, req));
    const now = lastRev(this.sql);
    if (now !== before) this.notify(now, req.deviceId);
    return res;
  }

  /**
   * Live updates: open devices keep a WebSocket to their administration. After a change only the new
   * revision is sent; devices then sync as usual, so access checks stay with the sync request.
   * The Worker checks session and membership before forwarding the upgrade here.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const deviceId = new URL(request.url).searchParams.get('device')?.slice(0, 100) || 'unknown';
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [deviceId]);
    server.send(JSON.stringify({ type: 'rev', rev: lastRev(this.sql) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(): Promise<void> {
    // Devices only listen; anything other than the auto-answered ping is ignored.
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, 'closed');
    } catch {
      /* already closed */
    }
  }

  private notify(rev: number, fromDevice: string): void {
    const message = JSON.stringify({ type: 'rev', rev });
    for (const ws of this.ctx.getWebSockets()) {
      if (this.ctx.getTags(ws).includes(fromDevice)) continue;
      try {
        ws.send(message);
      } catch {
        /* closing */
      }
    }
  }

  async stats() {
    return stats(this.sql);
  }

  /** Storage details for the admin environment. */
  async details() {
    return {
      ...stats(this.sql),
      databaseBytes: this.ctx.storage.sql.databaseSize,
      lastChange: lastChange(this.sql),
      tables: tableStats(this.sql),
    };
  }

  async businessName(): Promise<string | null> {
    return businessName(this.sql);
  }

  /** Key figures (counts and dates only) for the admin environment. */
  async metrics() {
    return tenantMetrics(this.sql);
  }

  /** Delete all data of this tenant (end of the read-only period, or account deletion). */
  async wipe(): Promise<void> {
    // Open devices reconnect, sync and get the wipe signal from the server.
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4000, 'deleted');
      } catch {
        /* already closed */
      }
    }
    await this.ctx.storage.deleteAll();
  }
}

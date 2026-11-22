import { DurableObject } from 'cloudflare:workers';
import type { SyncRequest, SyncResponse } from '../../src/lib/sync/protocol';
import type { Env } from './env';
import { migrate, stats, sync, type Sql } from './syncCore';

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
  }

  async sync(req: SyncRequest): Promise<SyncResponse> {
    return this.ctx.storage.transactionSync(() => sync(this.sql, req));
  }

  async stats() {
    return stats(this.sql);
  }

  /** Delete all data of this tenant (end of the read-only period, or account deletion). */
  async wipe(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

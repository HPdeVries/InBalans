import type { TenantStore } from './tenant';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TENANT: DurableObjectNamespace<TenantStore>;
  /** Origin of the app, e.g. https://mijn.inbalans.app (used in e-mails and the Origin check). */
  APP_ORIGIN: string;
  /** "eu" in production; empty for local development. */
  DO_JURISDICTION?: string;
  /** Which e-mail provider sends login codes: "resend", "console" (development only) or "none". */
  MAIL_PROVIDER?: string;
  MAIL_FROM?: string;
  /** Resend API key (wrangler secret put RESEND_API_KEY). */
  RESEND_API_KEY?: string;
  /** Secret pepper for hashing login codes and signing links (wrangler secret). */
  AUTH_SECRET: string;
  /** "false" hides sync in the app (e.g. while the e-mail provider is not set up). */
  SYNC_AVAILABLE?: string;
  /** Development only: return the login code in the API response. Never set in production. */
  DEV_EXPOSE_LOGIN_CODE?: string;
}

# Status and next steps

Last updated: 2026-11-23.

## Live

- **https://mijn.inbalans.app** runs as Cloudflare Worker `inbalans` with the app only
  (`wrangler.static.jsonc`, Workers Builds from `main`). No API, so sync is hidden: local use only.
- Features since phase 0: first-start wizard (with a required persistent-storage step and per-browser
  install advice), PIN screen lock, danger zone (wipe this device), Bank/Kas per booking.

## Built, not live: sync (phase 1)

Code is on `main` (`worker/`, `src/lib/sync/`, `wrangler.jsonc`) and tested locally (`npm run dev:worker`).
E-mail provider: **Resend** (`MAIL_PROVIDER = "resend"`, secret `RESEND_API_KEY`).

### Resend

- Domain `inbalans.app` created in Resend, region **eu-west-1 (Ireland)**, open/click tracking off.
  Status: **DNS records not yet added, not verified.**
- DNS records to add in Cloudflare (zone `inbalans.app`, DNS only / grey cloud):

  | Type | Name | Value | Priority |
  | --- | --- | --- | --- |
  | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCYNx+PDe11qTiYq2tEXpRJTrD5Yh2m5avYvqIs4zOUJyQ0y7eT/o8g2bWySBkWRFGJ6R4c70swVBtNnAyK8hN4Iqb1IS7vT0AQ49WU00SNOE6I2YLSSQJY7K/57I79vYySlzYd8Hc0SKhrZTjQ+8Gdm0Ldjm1FopXb+r1o4nIrJQIDAQAB` | |
  | MX | `send` | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
  | TXT | `send` | `v=spf1 include:amazonses.com ~all` | |
  | CNAME | `rsend` | `send.forge.rmta.net` | |

  Recommended as well: TXT `_dmarc` = `v=DMARC1; p=none;` (tighten later).

### Steps to go live

1. Add the DNS records above, then verify the domain in Resend (Resend connector: `verify-domain`).
2. Create a Resend API key with **sending access** for `inbalans.app` only.
3. Create the EU database and set the secrets:
   ```bash
   npx wrangler d1 create inbalans-core --jurisdiction=eu   # put the database_id in wrangler.jsonc
   npx wrangler secret put AUTH_SECRET                       # long random value
   npx wrangler secret put RESEND_API_KEY
   npx wrangler d1 execute DB --remote --command "INSERT INTO invites (email, created_at) VALUES ('<you>', datetime('now'))"
   ```
4. In Workers Builds change the deploy command to
   `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` (same Worker, same domain).
5. Test login, sync between two devices, remote sign-out, on real iOS/Android/Windows devices.

Tools: the Resend connector works in Claude sessions. For DNS and Worker secrets, connect the
Cloudflare API connector (`https://mcp.cloudflare.com/mcp`); the older Workers-bindings connector
cannot edit DNS or create EU-jurisdiction D1 databases.

## Open decisions

- Payment provider: Mollie or Stripe (phase 2).
- Pricing and trial length of InBalans Sync.

## Backlog

- Phase 1 follow-up: sign in with Google and Apple.
- Phase 2: subscriptions, read-only after cancellation and deletion after 1 year, account deletion (GDPR),
  terms / privacy statement / processing agreement, public website on `inbalans.app`.
- Phase 3: instant updates (WebSocket), passkeys, receipt images in R2, accountant access.
- Ideas: cash book report (opening balance, running cash balance); payment method in the archive CSV/PDF;
  unlock with Face ID / Touch ID / Windows Hello.

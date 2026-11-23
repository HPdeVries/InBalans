# Status and next steps

Last updated: 2026-11-23.

## Live

- **https://mijn.inbalans.app** runs as Cloudflare Worker `inbalans` with app **and** API (`wrangler.jsonc`).
  Workers Builds from `main`: build `npm run build`, deploy
  `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.
- Sync is live as an **invite-only beta** (since 2026-11-23). Settings shows the opt-in card *InBalans Sync*.
- Features since phase 0: first-start wizard (required persistent-storage step, per-browser install advice),
  PIN screen lock, danger zone (wipe this device), Bank/Kas per booking, sync (phase 1).

### Infrastructure

| Item | Value |
| --- | --- |
| D1 | `inbalans-core`, jurisdiction **eu**, id `d243000c-05e5-4e4a-9b35-e21e77dff525` |
| Durable Objects | `TenantStore`, placed with `DO_JURISDICTION = "eu"` |
| Worker secrets | `AUTH_SECRET` (generated inside Cloudflare), `RESEND_API_KEY` |
| Resend | domain `inbalans.app` verified, region eu-west-1, tracking off; API key `inbalans-worker`, sending access for this domain only |
| DNS (Cloudflare, DNS only) | `resend._domainkey` TXT, `send` MX + TXT, `rsend` CNAME, `_dmarc` TXT `v=DMARC1; p=none;` |
| Invites | table `invites` in D1; first invite: the owner's address |

Lessons learned: deploying with the static config (`wrangler.static.jsonc`, no `main`) removed the Worker's
secrets. Do not switch back to it without setting the secrets again afterwards.

Invite someone:
```sql
INSERT INTO invites (email, note, created_at) VALUES ('name@example.com', 'beta', datetime('now'));
```
(D1 console in the dashboard, `npx wrangler d1 execute DB --remote --command "..."`, or the Cloudflare connector.)

### Next

1. Test on real devices: log in (code e-mail arrives?), connect this device, second device, conflict notice,
   remote sign-out, shared-device mode, iOS/Android/Windows.
2. Tighten DMARC to `p=quarantine` once mail flows without problems.
3. Optionally rotate the Resend key (it was shown once in a Claude session when it was created).

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

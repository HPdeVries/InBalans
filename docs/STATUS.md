# Status and next steps

Last updated: 2026-11-23.

## Live

- **https://mijn.inbalans.app** runs as Cloudflare Worker `inbalans` with app **and** API (`wrangler.jsonc`).
  Workers Builds from `main`: build `npm run build`, deploy
  `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.
- Sync is live as an **invite-only beta** (since 2026-11-23). Settings shows the opt-in card *InBalans Sync*.
- Features since phase 0: first-start wizard (required persistent-storage step, per-browser install advice),
  PIN screen lock, danger zone (wipe this device), Bank/Kas per booking, sync (phase 1).

### Admin environment (admin.inbalans.app)

Same Worker, host-based: `admin.inbalans.app` serves `admin.html` and `/api/admin/*` only (strict headers, no
service worker, not indexed). Login with an e-mail code, only for addresses in the Worker secret `ADMIN_EMAILS`
(comma-separated); other addresses get the same answer but no code. Admin sessions are separate
(`admin_sessions`, max 8 h, 30 min idle, cookie `__Host-inbalans_admin`, SameSite=Strict).

- **Overzicht**: users, active 7/30 days, blocked, active devices, open invites, records and storage, recent activity.
- **Gebruikers**: e-mail, administration, last seen, devices, records, storage; detail with storage per table,
  devices and activity.
- **Acties**: sign out all devices (devices wipe their copy), block / unblock (devices signed out without
  wiping, login refused: `account_blocked`), delete account (type the e-mail to confirm; tenant data wiped,
  sessions revoked so devices wipe, identities/memberships/tenant/invite removed, user row anonymised).
- **Uitnodigingen**: add (with note) and revoke; no e-mail is sent.
- **Logboek**: last 200 audit entries; every admin action is logged with the admin's address.

Live since 2026-11-23 (migration 0002 applied, custom domain active, `ADMIN_EMAILS` = the owner's address).
Add or remove an admin: change the secret `ADMIN_EMAILS` on Worker `inbalans` (takes effect immediately; removed
admins lose their sessions).

### Infrastructure

| Item | Value |
| --- | --- |
| D1 | `inbalans-core`, jurisdiction **eu**, id `d243000c-05e5-4e4a-9b35-e21e77dff525` |
| Durable Objects | `TenantStore`, placed with `DO_JURISDICTION = "eu"` |
| Worker secrets | `AUTH_SECRET` (generated inside Cloudflare), `RESEND_API_KEY`, `ADMIN_EMAILS` |
| Domains | `mijn.inbalans.app` (app + API), `admin.inbalans.app` (admin), both custom domains of Worker `inbalans` |
| Resend | domain `inbalans.app` verified, region eu-west-1, tracking off; API key `inbalans-worker`, sending access for this domain only |
| DNS (Cloudflare, DNS only) | `resend._domainkey` TXT, `send` MX + TXT, `rsend` CNAME, `_dmarc` TXT `v=DMARC1; p=none;` |
| Invites | table `invites` in D1; first invite: the owner's address |

Lessons learned: the first RESEND_API_KEY was stored truncated (one character short), which Resend answers with
401 "API key is invalid" and the app shows as `mail_failed`; the Worker logs (observability) show the cause.
Deploying with the static config (`wrangler.static.jsonc`, no `main`) removed the Worker's
secrets. Do not switch back to it without setting the secrets again afterwards.

Invite someone:
```sql
INSERT INTO invites (email, note, created_at) VALUES ('name@example.com', 'beta', datetime('now'));
```
(D1 console in the dashboard, `npx wrangler d1 execute DB --remote --command "..."`, or the Cloudflare connector.)

### Test checklist (sync beta)

| # | Test | Expected | Result |
| --- | --- | --- | --- |
| 1 | Log in with e-mail code | Code e-mail arrives (Resend), code accepted | ✅ 2026-11-23, iPhone |
| 2 | Connect a device that has data ("eigen apparaat") | Data uploaded; sidebar shows "Gesynchroniseerd" | |
| 3 | Log in on a second device | Data appears; with local data there: choice *Samenvoegen* / *Gegevens van de cloud gebruiken* | |
| 4 | Change something on device A | Device B picks it up on focus or via *Nu synchroniseren* | |
| 5 | Edit the same booking on two devices while offline, then sync | Latest change wins, conflict notice shown | |
| 6 | Remote sign-out from *Apparaten* | Signed-out device wipes its data and shows a notice | |
| 7 | New-login e-mail | "Nieuwe aanmelding op …" arrives; sign-out link works (button page, then *Afgemeld*) | |
| 8 | Shared-device mode | Nothing stored on disk; logged out after 30 min idle or closing the browser | |
| 9 | Log out with unsynced changes offline | Warning with *Wachten*, *Back-up downloaden*, *Toch uitloggen* | |
| 10 | Locked period | Change to a locked booking from another device is refused, notice shown | |
| 12 | Admin: log in on admin.inbalans.app, overview, user detail, invite, block/unblock | Works; blocked app shows login refused | |
| 11 | Platforms | iOS (installed app), Android, Windows (Edge/Chrome) | iOS login ✅ |

### Next

1. Run the test checklist above.
2. ~~Remove the old *atelier* app~~ — done 2026-11-23: Pages `atelierinbalans-app` (with `atelier.inbalans.app`),
   Pages `atelierinbalans-admin` and DNS CNAME `atelier` deleted. Cloudflare Access rules (if any) were not visible
   to check.
3. Tighten DMARC to `p=quarantine` once mail flows without problems.
4. Optionally rotate the Resend key (it was shown once in a Claude session when it was created).

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

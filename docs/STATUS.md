# Status and next steps

Last updated: 2026-11-25.

## Live

- **https://mijn.inbalans.app** runs as Cloudflare Worker `inbalans` with app **and** API (`wrangler.jsonc`).
  Workers Builds from `main`: build `npm run build`, deploy
  `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.
- Sync is live as an **invite-only beta** (since 2026-11-23). Settings shows the opt-in card *InBalans Sync*.
- Features since phase 0: first-start wizard (required persistent-storage step, per-browser install advice),
  PIN screen lock, danger zone (wipe this device), Bank/Kas per booking, sync (phase 1).
- **Live sync** (WebSocket): open devices keep a connection to their administration's Durable Object
  (`GET /api/tenants/:id/live`, hibernatable, Origin checked, session + membership checked by the Worker).
  After a change the server sends only the new revision; devices then run a normal sync. Local changes go out
  0.8 s after editing. Without a connection the app falls back to focus / online / every 5 minutes. Settings
  shows *live verbonden*.
- **Account verwijderen** (Settings → Gevarenzone): type VERWIJDER, then a 6-digit code mailed to the account
  (10 min, migration 0004 `account_delete_codes`). The user chooses: keep the data on this device as a local
  app without account, or wipe this device too (shared devices always wipe). Server: tenant data wiped,
  WebSockets closed, sessions revoked (other devices wipe), support grants/memberships/tenant/identities/invite
  removed, user row anonymised, confirmation e-mail sent. Admin deletion uses the same code path.

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
- **Administraties**: list of synced administrations (owner, records, database size, last change, support status);
  detail with key figures — bookings per year and kind, last booking date, locked-through date, archive years,
  counts of categories/assets/stock counts/cash bookings, storage per table, devices, activity. Counts and dates
  only: no amounts, names or descriptions.
- **Meekijken (remote support)**: the owner allows it in the app (Settings → *Ondersteuning op afstand*) for
  24 hours, 3 or 7 days, and can revoke it any time. The admin opens *Meekijken* on the administration: a one-time
  code (2 min, single use) opens the real app in a new window with a read-only support session (in memory only,
  max 2 h, browser-session cookie `__Host-inbalans_support`, header `X-InBalans-Support`). The server refuses every
  change; the app blocks saving, downloads and destructive actions. Revoking or expiry ends the session at the
  next request. The owner gets an e-mail when looking along starts and sees *Laatst meegekeken* in the app.
  Everything is in the audit log (migration 0003: `support_grants`, `support_handoffs`, `support_sessions`).
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
| 2 | Connect a device that has data ("eigen apparaat") | Data uploaded; sidebar shows "Gesynchroniseerd" | ✅ 2026-11-25 |
| 3 | Log in on a second device | Data appears; with local data there: choice *Samenvoegen* / *Gegevens van de cloud gebruiken* | ✅ 2026-11-25 |
| 4 | Change something on device A | Device B picks it up on focus or via *Nu synchroniseren* | ✅ 2026-11-25 |
| 5 | Edit the same booking on two devices while offline, then sync | Latest change wins, conflict notice shown | ✅ 2026-11-25 (conflict kept on server) |
| 6 | Remote sign-out from *Apparaten* | Signed-out device wipes its data and shows a notice | ✅ 2026-11-25 |
| 7 | New-login e-mail | "Nieuwe aanmelding op …" arrives; sign-out link works (button page, then *Afgemeld*) | ✅ 2026-11-25 |
| 8 | Shared-device mode | Nothing stored on disk; logged out after 30 min idle or closing the browser | |
| 9 | Log out with unsynced changes offline | Warning with *Wachten*, *Back-up downloaden*, *Toch uitloggen* | |
| 10 | Locked period | Change to a locked booking from another device is refused, notice shown | |
| 13 | Remote support: owner allows 24 h, admin *Meekijken* opens read-only app, owner gets e-mail, revoke ends it | Read-only, saving refused, notice on end | ✅ 2026-11-25 |
| 12 | Admin: log in on admin.inbalans.app, overview, user detail, invite, block/unblock | Works; blocked app shows login refused | ✅ 2026-11-25 |
| 14 | Live sync: device B open on another screen, change on A | B shows it within a few seconds without focus | |
| 15 | Delete account, *Bewaren op dit apparaat* | Code e-mail, data stays here without account, other devices wiped, confirmation e-mail | |
| 16 | Delete account, *Ook van dit apparaat verwijderen* | App starts with the wizard | |
| 11 | Platforms | iOS (installed app), Android, Windows (Edge/Chrome) | ✅ 2026-11-25: iOS, Android, Windows |

### Next

1. Finish the test checklist: shared-device mode (8), log out with unsynced changes (9), locked period (10),
   live sync (14), account deletion (15, 16).
2. Order agreed: first functionally complete, then a test round with invited users, then subscriptions.
3. ~~Remove the old *atelier* app~~ — done 2026-11-23: Pages `atelierinbalans-app` (with `atelier.inbalans.app`),
   Pages `atelierinbalans-admin` and DNS CNAME `atelier` deleted. Cloudflare Access rules (if any) were not visible
   to check.
4. Tighten DMARC to `p=quarantine` once mail flows without problems.
5. Optionally rotate the Resend key (it was shown once in a Claude session when it was created).

## Open decisions

- Payment provider: Mollie or Stripe (phase 2).
- Pricing and trial length of InBalans Sync.

## Backlog

- Phase 1 follow-up: sign in with Google and Apple.
- Conflicts: show kept losing versions to the user (with full content, to compare or restore); admin keeps
  only the count.
- Phase 2: subscriptions, read-only after cancellation and deletion after 1 year, data export on request (GDPR),
  terms / privacy statement / processing agreement, public website on `inbalans.app`.
- Phase 3: passkeys, receipt images in R2, accountant access.
- Ideas: cash book report (opening balance, running cash balance); payment method in the archive CSV/PDF;
  unlock with Face ID / Touch ID / Windows Hello.

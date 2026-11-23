# InBalans

Simple, offline-first bookkeeping for Dutch sole proprietors (*eenmanszaak* / zzp).
InBalans is a Progressive Web App: it installs on a laptop, tablet or phone and all data
stays on the device. Optional cloud sync between devices (invite-only beta) runs on a Cloudflare Worker,
see [docs/SYNC_DESIGN.md](docs/SYNC_DESIGN.md). Current state and next steps: [docs/STATUS.md](docs/STATUS.md).

The UI is in Dutch; code and documentation are in English.

## Features

- **Sales and purchases** with multiple lines, each with its own category and VAT treatment.
- **Amounts incl. or excl. VAT**, per document; VAT can be overridden per line ("btw zelf invullen").
- **VAT treatments**: 21%, 9%, 0%, exempt, domestic reverse charge, intra-EU and non-EU
  purchases (reverse charge, boxes 4a/4b), intra-EU sales (3b), export (3a) and non-deductible foreign VAT.
- **Quarterly VAT return** (*btw-aangifte*), box by box, rounded to whole euros as the tax office expects.
- **Annual overview** for income tax (*winst uit onderneming*), grouped like the IB return.
- **Depreciation** of investments (straight line, pro rata per month), including assets bought before using the app.
- **Year-end stock** entered manually; the stock change adjusts the cost of sales.
- **Period locking**: close a quarter after filing the VAT return; locked bookings are read-only and are corrected
  with a reversing booking in an open period.
- **Yearly archive**: a zip with the annual overview, the four VAT returns and all bookings (PDF and CSV) plus a full
  backup, with a year-end checklist and reminders. The statutory 7-year retention stays with the entrepreneur.
- **Backup / restore** as a JSON file (merge, last change wins).
- **First-start wizard**: welcome, owner and business details (with IBAN/KvK/btw-id checks), optional PIN; can be skipped
  or used to restore a backup. Not shown on devices that already have data.
- **PIN screen lock** per device (PBKDF2 hash, never synced), auto-lock after 0/1/5/15/60 minutes, throttling after
  wrong attempts. A screen lock, not encryption. Forgotten PIN: wipe this device, then restore a backup or log in again.
- Works offline, installable, responsive: sidebar on laptop/tablet landscape, bottom tab bar with a quick-add button on tablet portrait and phone. Dark mode follows the system.

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev       # development server
npm test          # unit tests (domain logic, backup)
npm run check     # type checking
npm run build     # production build in dist/
npm run preview   # serve the production build
npm run dev:worker  # app + API on http://localhost:8787 (local D1 and Durable Objects)
```

With `npm run dev:worker`, login codes are printed in the terminal and shown in the login screen
(development only). Invite an address first:

```bash
npx wrangler d1 execute DB --local --env dev --command "INSERT INTO invites (email, created_at) VALUES ('you@example.com', datetime('now'))"
```

`npm run dev` (Vite only) has no API: the app works, sync reports that it is unavailable.

The build uses a relative base path and hash routing, so `dist/` can be hosted on any static host
(GitHub Pages, Netlify, a plain web server). HTTPS is required for the service worker (except on localhost).

## Deployment

Production runs at **https://mijn.inbalans.app** (website: `inbalans.app`).

**Use only `mijn.inbalans.app`.** Browser data (IndexedDB) is stored per domain: data entered on another
address (such as `*.pages.dev`) is not visible on `mijn.inbalans.app` and vice versa. Never change this domain once in use.

### Worker with app and API

Production is Cloudflare Worker `inbalans` (`wrangler.jsonc`), deployed by Workers Builds from `main`:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |

Resources (all EU): D1 `inbalans-core` (jurisdiction `eu`), Durable Objects with `DO_JURISDICTION = "eu"`,
Resend domain `inbalans.app` (eu-west-1). Secrets on the Worker: `AUTH_SECRET`, `RESEND_API_KEY`.
Sync is invite-only: add addresses to the `invites` table. Details and current state: [docs/STATUS.md](docs/STATUS.md).

`wrangler.static.jsonc` deploys the app without API (sync hidden). It removes the Worker's secrets when used,
so only use it deliberately and set the secrets again afterwards.

## Project structure

```
src/
  lib/domain/   Pure TypeScript: money, VAT, VAT return, depreciation, annual report (unit tested)
  lib/db/       IndexedDB via Dexie: schema, seed data, repository, live stores, backup
  lib/i18n/     UI strings (nl) and formatting helpers
  lib/archive/  Yearly archive: PDF reports (jsPDF, loaded on demand), CSV export, zip (fflate)
  lib/sync/     Sync engine, account/session lifecycle, API client, shared wire protocol
  lib/pages/    Svelte pages
  lib/ui/       Shared UI components
worker/
  src/          Cloudflare Worker: API, login, sessions, tenant Durable Object, sync rules
  migrations/   D1 schema
```

## Disclaimer

InBalans helps you prepare your tax returns but is not tax advice. Check the figures before filing.

# InBalans

Simple, offline-first bookkeeping for Dutch sole proprietors (*eenmanszaak* / zzp).
InBalans is a Progressive Web App: it installs on a laptop, tablet or phone and all data
stays on the device. Cloud sync is planned (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

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
```

The build uses a relative base path and hash routing, so `dist/` can be hosted on any static host
(GitHub Pages, Netlify, a plain web server). HTTPS is required for the service worker (except on localhost).

## Deployment

Production runs on Cloudflare Pages at **https://mijn.inbalans.app** (website: `inbalans.app`).

Cloudflare Pages settings (connected to this GitHub repository, production branch `main`):

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22` |

Custom domain: in the Pages project open *Custom domains* → *Set up a custom domain* → `mijn.inbalans.app`.
If `inbalans.app` uses Cloudflare DNS the record is created automatically; otherwise add a `CNAME` record
`mijn` → `<project>.pages.dev` at the DNS provider.

**Use only `mijn.inbalans.app`.** Browser data (IndexedDB) is stored per domain: data entered on the
`*.pages.dev` address is not visible on `mijn.inbalans.app` and vice versa. Never change this domain once in use.

## Project structure

```
src/
  lib/domain/   Pure TypeScript: money, VAT, VAT return, depreciation, annual report (unit tested)
  lib/db/       IndexedDB via Dexie: schema, seed data, repository, live stores, backup
  lib/i18n/     UI strings (nl) and formatting helpers
  lib/archive/  Yearly archive: PDF reports (jsPDF, loaded on demand), CSV export, zip (fflate)
  lib/pages/    Svelte pages
  lib/ui/       Shared UI components
```

## Disclaimer

InBalans helps you prepare your tax returns but is not tax advice. Check the figures before filing.

# Architecture and design notes

## Stack

- **Svelte 5 + TypeScript + Vite**: a small, fast single-page app.
- **vite-plugin-pwa** (Workbox): precaches the app shell for offline use; the user is prompted on updates.
- **Dexie (IndexedDB)**: local database. Live queries feed Svelte stores, so the UI updates automatically.
- **Hash routing**: no server rewrites are needed, so the app works on any static host and offline.

## Principles

1. **Domain logic is pure** (`src/lib/domain`). No UI or storage dependencies, fully unit tested.
   Reports are *derived* from the documents on demand; nothing computed is stored.
2. **Money is integer cents**. Rates are basis points (2100 = 21%). Rounding is half away from zero, per line.
3. **VAT rates depend on the date**. `vat.ts` holds the rate history, so a rate change only needs a new entry.
4. **VAT codes** (`VatCode`) describe the treatment of a line: rate, whether VAT is on the invoice,
   reverse charge, deductibility and the box of the VAT return. Adding a treatment = adding a code.
5. **Single source of truth for assets**: investments are purchase lines with `asset` parameters;
   the asset register is derived from them. Only assets from before using the app are stored separately (`manualAssets`).

## Data model

| Table          | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `documents`    | Sales and purchase documents with their lines (lines are embedded)   |
| `categories`   | Income / expense / investment categories, mapped to IB report groups |
| `manualAssets` | Assets acquired before using InBalans                                 |
| `stockCounts`  | Year-end stock value, one per year                                    |
| `settings`     | Business details (single record)                                      |
| `products`     | Reserved for product sales (not used yet)                             |

Document lines already carry `quantity`, `unitAmount` and an optional `productId`, so product sales
with purchase/sales prices can be added without changing the document structure.

## Sync readiness

Every record has `id` (UUID), `createdAt`, `updatedAt` and `deletedAt`:

- Records are never hard-deleted; `deletedAt` is a tombstone that can be synced.
- `updatedAt` is indexed on each table, so changes since the last sync can be queried.
- Seeded categories have stable ids, so they are the same record on every device.
- The backup import already merges using *last write wins* per record, the same rule a simple sync would use.

The planned design (Cloudflare Worker, D1 for accounts, one Durable Object per tenant) is described in
[SYNC_DESIGN.md](SYNC_DESIGN.md).

## Tax rules implemented (Netherlands)

- VAT return boxes 1a–1e, 2a, 3a–3c, 4a/4b, 5a–5c. Whole euros: turnover and VAT due rounded down,
  input VAT rounded up. ICP reminder when box 3b is used.
- Depreciation: straight line, monthly pro rata from the month of acquisition, residual value,
  disposal stops depreciation and writes off the remaining book value. Warnings for < € 450 and < 5 years.
- Annual overview: revenue and costs per category and IB group, stock change on cost of sales,
  depreciation, investments total (KIA hint).

Not (yet) implemented: KOR (small business scheme), private use, mixed costs (e.g. representation),
entrepreneur deductions, KIA calculation, mileage, attachments (receipt photos), invoice generation, sync.

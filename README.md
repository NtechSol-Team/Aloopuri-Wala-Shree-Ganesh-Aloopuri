# Surat Food Chain — Management System

Full-stack food manufacturing + franchise management: production (godown), inventory,
inter-branch transfers, franchise stock ordering, billing, payments (Razorpay + cash),
expenses, POS (with offline), and analytics.

> **Stack:** Next.js 14 · TypeScript · Tailwind · shadcn/ui · Zustand · React Query ·
> Express · Prisma · PostgreSQL 15 · Socket.IO (PG LISTEN/NOTIFY) · pg-boss · node-cache ·
> JWT · Razorpay · PDFKit. **No Redis** — Postgres is the only infrastructure dependency.

---

## Monorepo layout

```
/                            npm workspaces root
├── apps/api                 Express + Prisma backend  (@scfc/api)
├── apps/web                 Next.js 14 frontend       (@scfc/web)   ← built next
├── apps/android-print-bridge  Android WebView wrapper — Bluetooth ESC/POS
│                            receipt printing on tablets (see its README)
├── docker-compose.yml       Postgres 15 only
└── .env                     single source of truth (gitignored)
```

> **Printing:** Windows tills keep using the browser print dialog. Android tablets
> print receipts over Bluetooth — either through the Print Bridge app
> (`apps/android-print-bridge`, works with every ESC/POS printer) or Web Bluetooth
> for BLE-capable printers. Configure per till in **POS → printer icon**.

---

## Prerequisites

- **Node ≥ 20**, **npm ≥ 10**
- **Docker + Docker Compose** (for Postgres)

---

## Quick start

```bash
# 1. Install all workspace dependencies
npm install

# 2. Copy env template and review values (real .env already present for local dev)
cp .env.example .env        # skip if you already have .env

# 3. Start Postgres
npm run db:up

# 4. Apply migrations (schema + audit triggers + materialized views)
npm run prisma:migrate      # or: npm run -w @scfc/api prisma:deploy

# 5. Seed realistic sample data
npm run db:seed

# 6. Run the API (and web, once built)
npm run api:dev             # API at http://localhost:4000
# npm run dev               # API + web together (after web is scaffolded)
```

One-shot bootstrap: `npm run bootstrap` (install → db:up → migrate → seed).

---

## Seed login credentials

| Role          | Email / User ID                              | Password      |
|---------------|----------------------------------------------|---------------|
| Super Admin   | `admin@suratfood.com` · `ADMIN001`           | `Admin@123`   |
| Godown Manager| `godown@suratfood.com` · `GODOWN001`         | `Godown@123`  |
| Franchise Owner| `owner.adajan@suratfood.com` · `OWNER001`   | `Owner@123`   |
| Cashier       | `cashier.adajan@suratfood.com` · `CASH001`   | `Cashier@123` |

Login accepts **either** the email **or** the user ID in a single field.

---

## Environment variables

All config lives in the root `.env` (consumed by docker-compose, the API via `dotenv`,
and the web app). Validated at API startup with Zod — the server refuses to boot on
invalid config. See [.env.example](.env.example) for the full list. Key ones:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | token signing (access 15m, refresh 30d) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | payments |
| `WEB_ORIGIN` | CORS + Socket.IO origin |
| `KPI_CACHE_TTL_SECONDS` | node-cache TTL for dashboard KPIs |
| `MATERIALIZED_VIEW_REFRESH_CRON` | pg-boss schedule for analytics refresh |

---

## API conventions

- **Base URL:** `http://localhost:4000/api/v1`
- **Success envelope:** `{ success: true, data, message, meta? }`
- **Error envelope:** `{ success: false, error: { code, message, field? } }`
- **Auth:** `Authorization: Bearer <accessToken>`; rotate via `POST /auth/refresh`.
- **Pagination:** `?page=&limit=` (default 25, max 100); `meta` carries totals.
- **Rate limits:** auth endpoints 5/min, write endpoints 30/min per IP.

### API surface (all under `/api/v1`)

| Group | Key routes | Notes |
|-------|-----------|-------|
| `/auth` | login (email/user ID), refresh (rotation + reuse detection), logout, me, sessions | |
| `/users` | CRUD + reset-password | super admin |
| `/categories`, `/products`, `/raw-materials` | catalog CRUD, `/products/:id/bom`, `/products/:id/photo` | trigram search; stock ledgers auto-created |
| `/production` | `batches` (BOM auto-deduct), `intake` (weighted-avg cost), `godown-stock` | godown + admin |
| `/transfers` | create + `:id/status` (Draft→Dispatched→Received) | moves godown→main on receive |
| `/orders` | create + `:id/{confirm,dispatch,deliver,cancel}` | dispatch auto-bills; deliver moves main→outlet; realtime |
| `/billing` | list (filters/sort/overdue), `:id`, `:id/pdf` | outlet-scoped; async PDF |
| `/payments` | `cash`, `razorpay/order`, `razorpay/verify`, `webhook`, `summary` | insert-only; aging report |
| `/expenses` | CRUD, `categories`, `summary` | by category/location |
| `/pos` | `sessions[/current,/:id/close,/:id/summary]`, `transactions[,/:id/void]`, `products` | offline-idempotent on `clientUuid` |
| `/analytics` | `dashboard`, `sales/trend`, `sales/top-products`, `financial`, `outlets`, `inventory` | KPIs cached; P&L from matview |

---

## Database design highlights

- UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at`, soft delete (`is_deleted`),
  `created_by` on every domain table. **No hard deletes** in this financial system.
- Money as `DECIMAL(12,2)`; tax rate `DECIMAL(5,2)`; fractional quantities `DECIMAL(12,4)`.
- Composite indexes on hot paths (`outlet_id+status`, `status+due_date`, …) and
  **trigram GIN** indexes for fuzzy product/SKU search (`pg_trgm`).
- **Shadow audit tables** for bills, payments, stock transfers, production batches —
  populated by DB triggers (`fn_record_audit`). The acting user is read from the
  transaction-local GUC `app.user_id`.
- **Materialized views** `mv_monthly_pl` and `mv_outlet_sales`, refreshed every 15 min by
  a pg-boss scheduled job (`refresh_analytics_views()`).
- Atomic, year-prefixed document numbers (`BL-2025-00001`, …) via `document_counters`.

### Migrations

```bash
npm run -w @scfc/api prisma:migrate   # dev: create + apply
npm run -w @scfc/api prisma:deploy    # prod: apply pending
npm run -w @scfc/api prisma:reset     # drop + re-migrate + re-seed (dev only)
npm run -w @scfc/api prisma:studio    # browse data
```

Advanced objects (triggers, materialized views, refresh function) live in
`apps/api/prisma/migrations/*_audit_and_views/migration.sql`.

---

## Real-time + background jobs (no Redis)

- **Real-time:** app writes call `pg_notify('scfc_events', …)`; a dedicated pg client
  `LISTEN`s and relays to Socket.IO rooms (`role:admin`, `outlet:<id>`). Events:
  `new_order`, `order_status_changed`, `payment_received`, `stock_low`, `bill_generated`,
  `transfer_status_changed`, `pos_sale`, `report_ready`.
- **Jobs:** pg-boss runs the analytics refresh schedule and async bill-PDF generation.

---

## Build status — feature-complete

All modules are implemented (API + UI) and exercised against the running stack:

1. ✅ **Auth & Users** — login by email/user ID, refresh rotation + reuse detection, PG sessions, RBAC
2. ✅ **Products & Raw Materials** — catalog, pricing, photo upload, BOM, trigram search
3. ✅ **Production** — batch logging with BOM auto-deduction, intake (weighted-avg cost), godown stock
4. ✅ **Stock Transfers** — Draft→Dispatched→Received state machine, godown→main movement
5. ✅ **Outlet Orders** — franchise ordering, confirm/dispatch/deliver, realtime, deliver moves main→outlet
6. ✅ **Billing** — auto-generated on dispatch, immutable locked line items, async PDF, overdue flagging
7. ✅ **Payments** — Razorpay (live test order + signature verify + webhook) and cash (partial), aging dashboard
8. ✅ **Expenses** — entry by category/location, category & monthly summaries
9. ✅ **POS** — full-screen 3-panel, cash/card/UPI/split, hold, void+restock, EOD, offline queue (idempotent sync)
10. ✅ **Analytics** — dashboard KPIs, revenue trend, top products, outlet performance, inventory, monthly P&L

Verified behaviours include: BOM deduction & weighted-average costing, transfer/order state machines with
stock movement, auto-billing on dispatch + background PDF, payment reconciliation with over-pay guards and
DB audit triggers, POS stock decrement + offline idempotency, and role scoping (e.g. a franchise owner sees
only their own outlet). The Next.js app builds cleanly for production (17 routes).

> **Notes / future polish:** POS offline persistence uses a `localStorage` queue keyed by an idempotent
> `clientUuid` (a service worker for full asset-level offline is a future add). Materialized-view-backed
> analytics (P&L, outlet totals) refresh every 15 min via pg-boss, so they are eventually consistent.

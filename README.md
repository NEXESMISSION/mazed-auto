# Mazed Auto

Paid classifieds marketplace for Tunisia — **cars and spare parts** at fixed
prices, where the buyer contacts the seller directly and the only money the
platform takes is the publication fee.

Stack: **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase
(Postgres + Auth + Storage + Realtime) · next-intl (fr)**.

> **This is v3.** The platform used to run auctions (deposits, bidding, escrow,
> KYC). That model is being retired — see [`PIVOT-PLAN.md`](./PIVOT-PLAN.md) for
> the full migration, what is done, and what is left. If something in the code
> looks auction-shaped, check the plan before building on it.

---

## Dev quickstart

```bash
pnpm install
cp .env.example .env.local        # fill in Supabase keys
node scripts/apply-migrations.mjs --commit 0153 0154   # or `supabase db push`
pnpm dev                          # http://localhost:3000
```

Migrations are numbered files under `supabase/migrations/`.
`scripts/apply-migrations.mjs` applies named ones in order, each in its own
transaction. Use it — the repo previously had no runner, which is how four
migrations ended up written but never applied while the code needing them
shipped.

---

## How the product works

**Publishing.** A seller picks a category (Voitures … Pièces de rechange >
Freinage …), fills the attributes that category defines, adds photos and a phone
number, signs an accuracy attestation, and pays — either by spending a
publication from a pack they bought, or with a one-off fee for that category.
Every listing is then moderated before it goes live, for 30 days, and can be
renewed.

**Buying.** There is no bidding and no escrow. A buyer browses `/annonces`,
filters (for parts: *compatible avec* make / model / year), and clicks to reveal
the seller's number. **The number is never in the page** — `contact_phone` is
granted to `service_role` alone, and the reveal endpoint logs each request with
a salted IP hash and rate-limits it. That is what stops the catalog being
harvested.

**Money.** Everything purchasable is a row in `products`: annonce à l'unité
(priced per category), packs, abonnements, mises en avant, the *Vendeur vérifié*
badge, renouvellement. Prices are edited in `/admin/pricing` — never in code.
Packs become `seller_credits`, spent through `consume_listing_credit()` and
recorded in an append-only `credit_ledger`.

**Trust.** No KYC. A verified phone, moderation of every listing, the seller's
signed attestation, the *Diagnostic Mazed* sheet (our own inspection, published
from the admin), and a paid badge an admin grants by hand and can revoke.

Payments are gateway-free: the seller transfers by bank wire or D17, uploads a
receipt, and an admin captures it under `/admin/payments`. Payee details live in
`app_settings`; prices live in `products`.

---

## Surfaces

| Path | What it is |
|---|---|
| `/annonces` | The catalog — category switch, filters, fitment search |
| `/annonces/[id]` | One listing + contact reveal |
| `/annonces/nouvelle` | The 4-step sell wizard |
| `/account/listings` | Mes annonces — status, renew, forfait |
| `/admin/annonces` | Moderation queue |
| `/admin/pricing` | Tarifs — every price, no deploy needed |
| `/admin/sellers` | Forfaits & badges |
| `/admin/properties`, `/auctions/[id]` | **v2, retiring.** Live only while the last auctions close. |

---

## Docs

- [`PIVOT-PLAN.md`](./PIVOT-PLAN.md) — the v2 → v3 migration, phase by phase,
  with a progress log. **Start here.**
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — data model and request flow.
- [`RUNBOOK.md`](./RUNBOOK.md) — operations: crons, drains, incidents.

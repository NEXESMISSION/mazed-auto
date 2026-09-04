# Admin console — full rebuild plan

Written 2026-09-04. Companion to `PIVOT-PLAN.md`, which covers the whole v2→v3
pivot; this document covers **only the admin console** and goes to the level of
individual files, screens and acceptance criteria.

The short version: the admin is not badly built, it is **half-migrated**. It was
designed for an auction house that no longer exists, then v3 screens were bolted
on beside the old ones instead of replacing them. Two thirds of what the sidebar
offers points at tables that now hold **zero rows**, and the screens that serve
the real business are the ones missing features. That is why it feels heavy,
looks inconsistent, and why "so much stuff doesn't work" — most of it genuinely
doesn't, because there is nothing behind it.

---

## 0. TL;DR

| | Today | After |
|---|---|---|
| Sidebar entries | 24 links across 5 groups | **6** |
| Admin code | 16 243 lines | ~7 000 (target) |
| Screens serving empty tables | 8 of 20 | 0 |
| Sources of truth for a price | 2 (`products` **and** `app_settings`) | 1 |
| Shared list/table component | none — every page reinvents it | 1 |
| Off-token colours (light-mode classes on a dark theme) | 84 | 0 |
| Broken nav targets | 2 (`/admin/kyc-queue`, characteristics→dead table) | 0 |

Estimated **10–11 working days**, in 9 phases, each independently shippable.

---

## 1. What I measured

Not opinions — these are counts from the repo and from a read-only query against
the live Supabase project (`jxwsbmniubiuujeblwbt`) on 2026-09-04.

### 1.1 Live row counts

```
listings              66  (all published)      products              9
listing_photos       468                       categories           17
profiles              23  (5 admin,            category_attributes  90
                           15 individual,      credit_ledger        18
                           3 agency)           payments              4
activity_log      17 034                       notifications        61

auctions               0    properties            0    bids               0
auction_deposits       0    seller_payouts        0    inspectors         0
sixth_offers           0    inspections           0    watchlist          0
waitlist               0    seller_credits        0    seller_badges      0
property_photos        0    property_documents    0    kyc_submissions    2
```

**The auction data is already gone.** `PIVOT-PLAN.md` §0 says Phase 6b is
"BLOCKED until 2026-09-11 — 60 lots still open". That is no longer true: every
auction table reads 0. Nothing is blocking the demolition any more.

### 1.2 Code volume

```
src/app/[locale]/admin/**    10 871 lines   (20 sections, 58 files)
src/app/api/admin/**          3 378 lines   (22 routes)
src/components/admin/**       1 876 lines   (14 components)
src/lib/admin/**                118 lines
                             ─────────────
                             16 243 lines
```

The five largest files are `AdminNotificationsClient.tsx` (1 226),
`PopupForm.tsx` (785), `properties/page.tsx` (656), `PaymentsQueueList.tsx`
(510) and `properties/[id]/page.tsx` (505). Three of those five drive dead
tables.

### 1.3 What each sidebar entry actually does

| Sidebar entry | Backing table | Rows | Verdict |
|---|---|---|---|
| Annonces | `listings` | 66 | **Live — the whole product** |
| Anciennes annonces | `properties` | 0 | Dead |
| Paiements | `payments` grouped by `auctions` | 0 auctions | **Broken** — see §2.2 |
| Remboursements | `auction_deposits` | 0 | Dead |
| Tarifs | `products` | 9 | Live |
| Forfaits & badges | `products` + `seller_badges` | 9 / 0 | Live, nothing sellable yet |
| Paiements vendeurs | `seller_payouts` | 0 | Dead |
| Paiement manuel | `auctions` + `auction_deposits` | 0 | Dead |
| Utilisateurs | `profiles` | 23 | Live |
| Inspecteurs | `inspectors` | 0 | Dead (already hidden behind `false`) |
| Réglages | `app_settings` | 20 | **Half-lying** — see §2.3 |
| Accueil | `listings` | 66 | Live |
| Documents | `legal_doc_kinds` | 32 | Live |
| Caractéristiques | `property_attribute_kinds` | 64 (dead table) | **Broken** — see §2.4 |
| Diffusions | `notifications` | 61 | Live |
| Popups | `popups` | 1 | Live |
| Liste d'attente | `waitlist` | 0 | Dead (launch is over) |
| Journal d'activité | `activity_log` | 17 034 | **Drowned** — see §2.5 |
| *(dashboard tile)* KYC | `/admin/kyc-queue` | — | **404** — page was deleted |
| Signaux de fraude | none | — | Roadmap placeholder about bids and KYC |

**8 of 20 sections have no data path at all. 4 more are broken or lying.**

---

## 2. The real bugs (not cosmetic)

These are the "doesn't even work" items, each verified.

### 2.1 The dashboard links to a page that was deleted
`src/app/[locale]/admin/page.tsx:70` renders a KYC tile pointing at
`/admin/kyc-queue`. That route was deleted in Phase 6a. It counts
`kyc_submissions` (2 rows of dead data), shows "2", and 404s — well, 308s to
`/account` — when clicked.

### 2.2 The payments queue cannot show the payments you actually have
`/admin/payments` calls `admin_payment_boxes`, which **groups receipts by
auction**. `auctions` is empty, so the query returns nothing, forever. Meanwhile
`payments` holds 3 real `listing_fee` rows — including one in `pending_review`,
i.e. **a customer's receipt is sitting unreviewed and is invisible in the
admin.** The v3 money queue does not exist; what exists is the v2 one, and it
returns an empty list by construction.

### 2.3 Two admin screens set the price of publishing, and they disagree
- `/admin/pricing` writes the `products` table → read by
  `src/lib/products.ts`, used by `/api/annonces/[id]/submit`, `/renew`,
  `/annonces/nouvelle`, `/pricing`, `/account/listings`. **This is the live
  path.**
- `/admin/settings` writes `app_settings.fee_listing_direct` /
  `fee_listing_auction` / `promo_*` → read by `src/lib/pricing.ts`, used only by
  the legacy `/api/listings/[id]/initiate-payment`.

Right now they hold different numbers (`app_settings` says 20 TND, `products`
says 15 TND for `annonce-standard`, 0 for `annonce-piece`). An admin who changes
the fee in Réglages changes nothing a seller will ever see. `PIVOT-PLAN.md` §2.2
says every price lives in `products`; the settings screen never got the memo.

### 2.4 Caractéristiques edits a table nothing reads
The editor and `/api/admin/characteristics` read and write
`property_attribute_kinds` (64 rows, keyed to the dead `properties` table). The
live attribute definitions are in `category_attributes` (90 rows), which
**has no admin screen at all**. So: the screen you have does nothing, and the
thing it should do is impossible.

### 2.5 The activity journal is 99 % page views
Of 17 034 rows, **16 836 have `action = null`** — they are `type='page_view'`
telemetry. The actual audit trail (`admin.listing.approve` ×12,
`payment.captured` ×9, `user.admin_update` ×7…) is 198 rows buried under them,
and the table grows without a retention policy. The journal is unusable as an
audit log, which is the only reason to have one.

### 2.6 Wrong brand on the payment instructions
`app_settings.payee_name` = **"Batta Tunisia SARL"** — leaked from the twin
real-estate repo. This is the beneficiary name shown to a customer making a bank
transfer to Mazed Auto. (Not an admin-UI bug, but it surfaces through
`/admin/settings` and should be fixed in the same pass.)

### 2.7 Products that cannot be sold
`pack-5-annonces`, `pack-20-annonces` and `badge-verifie` are all
`price = 0.00, is_active = false`. The packs-and-badge business — the point of
§4 of the pivot plan — has a UI and no configured product behind it.

---

## 3. Why it *looks* awful

1. **Light-mode colours on a dark theme.** 84 hardcoded Tailwind palette classes
   across admin files — `bg-red-50`, `bg-emerald-50`, `bg-amber-50`,
   `ring-red-200` — glowing white-ish blocks on `#0a0a0a`. The theme has
   `--success / --warning / --danger / --info` tokens that nothing uses.
2. **A leftover blue from the twin repo.** The dashboard tiles hover with
   `rgba(30,58,138,.35)` — that is Batta navy, not Mazed gold.
3. **No shared list component.** 20 sections, 20 different layouts: 2 use
   `<table>`, the rest invent cards, boxes or grids. Column alignment, row
   height, hover, empty state and pagination differ on every screen.
4. **Primitives exist but are optional.** `AdminQueryBar`, `AdminPager` and
   `AdminButton` are each used by only 8–9 of 20 sections.
5. **A 421-line creation form is stapled on top of the moderation queue.**
   `/admin/annonces` renders `ManualListingForm` above the list, so the queue you
   came for starts below a full-height form.
6. **Every page loads everything.** `/admin/annonces` fetches all profiles, all
   categories, all attributes and 120 listings with photos on every visit, with
   no pagination.
7. **Five nav groups for six real jobs.** "Catalogue / Enchères (v2) / Argent /
   Personnes / Système" — the second group is entirely dead, and "Système"
   is a drawer of nine unrelated things.
8. **Ten hand-rolled `fetch` + error + toast blocks**, each with its own error
   shape and its own idea of what a failure looks like.

---

## 4. The target: six screens

One rule drives the whole design: **a screen exists only if there is data behind
it and a decision to make about that data.**

```
┌─ Tableau de bord ──── what needs a decision right now
├─ Annonces ─────────── moderate · create · diagnostic · feature · expire
├─ Paiements ────────── receipts to validate · revenue
├─ Offres & prix ────── products, packs, promos, badge  (the ONLY price store)
├─ Vendeurs ─────────── users · roles · badges · credits · bans
├─ Catalogue ────────── categories tree + attributes per category
└─ Site ─────────────── accueil · popups · documents · diffusions · réglages · journal
```

Six sidebar entries. `Site` is one route with six tabs, not six sidebar links —
those are things you touch once a month, and they should not compete for
attention with the queue you open every morning.

### 4.1 Screen specs

#### `/admin` — Tableau de bord
**Purpose:** answer "what is waiting on me?" in under two seconds.

- Three KPI tiles: **À valider** (listings `pending_review` + payments
  `pending_review`), **En retard > 48 h**, **Publié aujourd'hui**.
- Queue cards, one per real queue only: Annonces à valider · Reçus à valider ·
  Annonces qui expirent sous 7 j · Badges à accorder. Each links to the
  pre-filtered list.
- A "derniers gestes" strip: the last 8 rows of the audit log
  (`type <> 'page_view'`), with who did what.
- Every number a `head: true` COUNT. No list fetching. No tile for a queue that
  cannot receive work.

#### `/admin/annonces` — the core console
**Purpose:** everything that can happen to a listing, in one place.

- Toolbar: search (title / seller / phone / id) · status tabs
  (**À valider** · Publiées · Expirent bientôt · Expirées · Refusées ·
  Brouillons · Toutes) · category filter · sort.
- One `DataTable`: photo thumb · titre · catégorie · vendeur (+ phone) · prix ·
  statut · âge · badges (payée / offerte / diagnostic / en vedette).
- Row click → **side panel** (not a page navigation): photo gallery, full
  attributes, seller card, payment/credit provenance, diagnostic editor,
  activity for this listing.
- Actions in the panel: **Approuver · Refuser (motif) · Marquer payée ·
  Offrir la publication · Modifier · Mettre en vedette · Prolonger 30 j ·
  Marquer vendue · Archiver · Supprimer**.
  Today only approve / reject / mark_paid / waive_fee / archive exist —
  edit, feature-from-here, extend, mark-sold and delete are new.
- Bulk selection: approve, archive, extend on a multi-select.
- **Créer une annonce** moves to its own route `/admin/annonces/nouvelle`,
  reusing the existing `ManualListingForm` (which works well — the
  `fee_waived_by` / `v1-admin` attestation decisions in it are correct and stay).
- Server-side pagination, 25/page.

#### `/admin/paiements` — money in
**Purpose:** validate receipts. This screen is being **built, not moved** — the
current one cannot work (§2.2).

- Flat queue over `payments`, no auction grouping. Tabs: **À valider** ·
  Validés · Refusés · Tous. Filter by kind
  (`listing_fee · listing_pack · promo · badge · renewal · subscription`).
- Row: date · vendeur · kind · montant · méthode (D17 / virement / manuel) ·
  annonce liée · statut.
- Row click → panel with the receipt image (`ReceiptPreview` exists, 87 lines,
  keep) and **Valider / Refuser (motif)**. Validating a `listing_fee` publishes
  the linked listing; validating a `listing_pack` credits `seller_credits` and
  writes `credit_ledger`.
- A "Recettes" strip: this month / last month / by kind, from `payments`
  where `status='captured'`.
- **Enregistrer un paiement manuel** button (replaces the whole
  `/admin/manual-payment` section) — for a seller who paid in cash at the desk.

#### `/admin/offres` — Offres & prix
**Purpose:** the single price store. Replaces `/admin/pricing` **and** the
pricing half of `/admin/settings`.

- One table over `products`, grouped by kind, with inline edit: nom · prix ·
  catégorie (null = toutes) · quota · durée · actif · ordre.
- Create/duplicate/deactivate. Never delete a product that a payment references
  — deactivate instead.
- A warning banner when an active `listing_single` has no price for a category
  that has published listings.
- On landing: migrate `app_settings.fee_listing_*` / `promo_*` into `products`
  and delete those keys (§7.2).

#### `/admin/vendeurs` — people
**Purpose:** merges today's `/admin/users` + `/admin/sellers`.

- Table over `profiles`: nom · téléphone (verified?) · rôle · annonces
  (published/total) · crédits restants · badge · inscrit le · statut.
- Row → panel: change role (`individual · agency · admin` only — `bank`,
  `bailiff`, `inspector` are dropped), **accorder / révoquer le badge vérifié**
  with a duration, **créditer un pack manuellement**, ban/unban, and their
  listing + payment history.

#### `/admin/catalogue` — categories & attributes
**Purpose:** the screen that should have replaced Caractéristiques.

- Left: the `categories` tree (17 rows, Véhicules / Pièces), drag to reorder,
  toggle active, rename, add child.
- Right: `category_attributes` for the selected category (90 rows total) —
  field_key · label · type · options · unité · requis · filtrable · ordre.
- Guard: refuse to delete an attribute that appears in any published listing's
  `attributes` jsonb; offer "hide instead".

#### `/admin/site` — one route, six tabs
`Accueil` (existing `HomeCurator`, 191 l — keep) · `Popups` (existing, keep,
trim `PopupForm` from 785 l) · `Documents` (existing `LegalDocsEditor`, keep) ·
`Diffusions` (existing notifications client — **1 226 l, split into
list + composer, target ~500**) · `Réglages` (non-price only: RIB/D17 payee,
listing lifetime, expiry notice days, contact) · `Journal` (audit log with
`type <> 'page_view'` as the default filter).

---

## 5. The foundation (build this first)

One folder, `src/components/admin/kit/`, and every screen is assembled from it.
This is what makes twenty screens look like one product.

| Component | Job | Replaces |
|---|---|---|
| `AdminShell` | sidebar + mobile drawer + content frame | `AdminSidebar` (244 l), rewritten to 6 entries |
| `PageHeader` | eyebrow · title · description · right-side actions | `AdminPageHeader` (37 l), extended |
| `Toolbar` | search + tabs + filters + result count, all URL-state | `AdminQueryBar` (90 l) |
| `DataTable` | columns, sticky header, row click, selection, empty state, loading skeleton, pagination | 20 bespoke layouts |
| `SidePanel` | right drawer for detail + actions, Esc/overlay close, focus trap | full-page detail routes |
| `StatusPill` | one `status → tone` map for every enum in the app | 84 ad-hoc colour classes |
| `Confirm` | destructive-action dialog with typed reason | 4 inline confirm patterns |
| `Field` | `Text · Number · Money · Select · Toggle · Textarea · Photo` | forms duplicated across 6 screens |
| `useAdminAction()` | POST/PATCH → pending state → toast → error mapping → `router.refresh()` | 10 hand-rolled fetch blocks |
| `EmptyState` | icon + line + optional CTA | nothing (blank screens today) |

**Colour rule, enforced by lint:** no `bg-*-50…900` Tailwind palette class inside
`src/**/admin*`. Tones come from `--success / --warning / --danger / --info /
--gold` with the existing `batta-tone-*` helpers. One ESLint `no-restricted-syntax`
rule keeps it that way.

**Density rule:** 40 px rows, 13 px text, tabular numerals for money and counts,
one accent colour per screen. The console should read like a spreadsheet, not
like the marketing site.

**Data rule:** every list is server-rendered with server-side filter + sort +
`range()` pagination. No page fetches more than 25 rows or a full table of
profiles again.

---

## 6. What gets deleted

Verified against live row counts — every one of these serves an empty table.

### Delete outright — ~4 750 lines

| Path | Lines | Why |
|---|---|---|
| `admin/properties/**` | 1 306 | `properties` = 0 rows |
| `admin/auctions/**` | 429 | `auctions` = 0 |
| `admin/deposits/**` | 434 | `auction_deposits` = 0 |
| `admin/payouts/**` | 640 | `seller_payouts` = 0 |
| `admin/manual-payment/**` | 404 | auction-scoped; reborn as a button in Paiements |
| `admin/inspectors/**` | 157 | `inspectors` = 0, already hidden |
| `admin/fraud/**` | 44 | placeholder about bids and KYC |
| `admin/waitlist/**` | 77 | `waitlist` = 0, launch is over |
| `api/admin/properties/**` | 185 | |
| `api/admin/deposits/**` | 152 | |
| `api/admin/payouts/**` | 110 | |
| `api/admin/manual-payment/**` | 299 | |
| `components/admin/RejectPropertyForm.tsx` | 305 | |
| `components/admin/ApprovePropertyButtons.tsx` | 123 | |
| `components/admin/ReviewKycButtons.tsx` | 53 | KYC is gone |
| `components/admin/ApproveInspectorButton.tsx` | 37 | |

All deleted routes get a `308` to their replacement (or `/admin`) in
`next.config.ts`, so a bookmark never lands on a 404.

### Rewrite

| Path | Lines | Becomes |
|---|---|---|
| `admin/payments/**` + `api/admin/payments` | 1 011 | `/admin/paiements`, flat, listing-fee-first |
| `admin/characteristics/**` + api | 755 | `/admin/catalogue`, on `category_attributes` |
| `admin/notifications/AdminNotificationsClient.tsx` | 1 226 | split list/composer, ~500 |
| `admin/settings/**` | 492 | non-price settings only, ~200 |
| `admin/users` + `admin/sellers` + apis | 852 | one `/admin/vendeurs`, ~450 |
| `components/admin/AdminSidebar.tsx` | 244 | 6 entries, ~150 |
| `admin/page.tsx` | 138 | real queues only |

### Keep as-is
`ManualListingForm` (421) · `HomeCurator` (191) · `LegalDocsEditor` (347) ·
`DiagnosticEditor` (480, retarget `property_id`→`listing_id`) ·
`ReceiptPreview` (87) · `lib/admin/guard.ts` · `lib/products.ts` ·
`PricingManager` (389, folded into `/admin/offres`).

`lib/admin/claim.ts` (67 l) covers `kyc_submissions` and `seller_payouts` —
both dead. It goes unless you want claiming on the listing queue; with one
admin working at a time, you don't.

---

## 7. Server-side work

### 7.1 API surface
22 routes → about 10. Everything moves to one shape:

```ts
export const POST = adminRoute(async ({ supabase, user, body }) => { … });
```

`adminRoute()` wraps `requireAdmin` (already good, keep it), parses the body,
maps thrown errors to a consistent `{ error, detail }`, and writes the
`activity_log` audit row automatically — so an admin action can never land
without an audit trail, which is the case for several of them today.

### 7.2 Migrations needed

| # | What |
|---|---|
| 0172 | Move `app_settings.fee_listing_*`, `promo_*_tnd`, `promo_*` into `products`; delete those keys. Fix `payee_name` to the real Mazed Auto entity. |
| 0173 | `activity_log`: index on `(type, created_at desc)`, and a retention job dropping `type='page_view'` older than 30 days (16 836 rows today). |
| 0174 | Drop the dead admin RPCs: `admin_payment_boxes`, `admin_set_payout_status`, `request_payout`, `admin_set_kyc_status`, `review_kyc`. |
| 0175 | *(optional, your call — see §10 D1)* drop the auction/KYC tables, enums and the 20 remaining auction functions. |

Migrations 0172–0174 are **safe now**; 0175 is the irreversible one and stays
behind an explicit decision.

### 7.3 Products seed
Give `pack-5-annonces`, `pack-20-annonces` and `badge-verifie` real prices and
activate them, or delete the rows. A product with `price = 0, is_active = false`
is a screen with nothing behind it — the same disease as the dead queues.

---

## 8. Phases

Each phase leaves the console working and shippable. No phase mixes a migration
with a UI rewrite.

| # | Phase | Days | Ships |
|---|---|---|---|
| **0** | **Freeze & decide** | ½ | Answers to §10. Branch `admin-v3`. Snapshot of current admin for before/after. |
| **1** | **Foundation** | 2 | `admin/kit/**`, the new 6-entry shell, the colour lint rule. Old pages keep working inside the new shell. Nothing user-visible breaks. |
| **2** | **Annonces** | 2 | The core console: table, side panel, all 10 actions, bulk ops, `/annonces/nouvelle` split out, server pagination. |
| **3** | **Paiements** | 1½ | The queue that can finally see the 3 real payments. Receipt panel, validate/reject, manual entry, revenue strip. |
| **4** | **Offres & prix** | 1 | `/admin/offres` + migration 0172. **One** price store. |
| **5** | **Catalogue** | 1 | `/admin/catalogue` on `category_attributes`. Old Caractéristiques deleted. |
| **6** | **Vendeurs** | 1 | Users + badges + credits merged. |
| **7** | **Site** | 1½ | Six tabs, notifications client split, settings trimmed, journal filtered (+ migration 0173). |
| **8** | **Demolition** | ½ | Delete §6 list, 308 redirects, migration 0174. `tsc` + ESLint + tests clean. |
| **9** | **Polish & verify** | 1 | Empty states, keyboard nav, mobile pass at 375 px, focus/a11y, `pnpm install --frozen-lockfile && pnpm build` from a clean `.next`. |

**Total: 11 days.** Phases 0–3 alone (5 days) fix everything that is actually
broken; 4–9 are what make it feel like one product.

### Acceptance criteria per phase

- **P1** — every existing admin page renders inside the new shell with no
  visual regression; zero Tailwind palette classes remain in `admin/kit`.
- **P2** — a listing can be created, approved, rejected with a motif, edited,
  featured, extended, marked sold and deleted, each writing an `activity_log`
  row; the queue loads in one round trip with 25 rows.
- **P3** — the `pending_review` `listing_fee` payment that exists today appears,
  its receipt renders, validating it publishes the linked listing.
- **P4** — changing a price in `/admin/offres` changes what `/annonces/nouvelle`
  charges; `app_settings` contains no price key.
- **P5** — adding an attribute to a category makes it appear in the sell wizard
  and in the admin creation form.
- **P6** — granting a badge sets `seller_badges` with an expiry and shows on the
  public listing; revoking removes it.
- **P7** — the journal shows admin decisions, not page views.
- **P8** — `rg "properties|auctions|auction_deposits|seller_payouts|inspectors|kyc_submissions" src/app/[locale]/admin src/app/api/admin` returns nothing.
- **P9** — the console is usable at 375 px; every list has an empty state;
  `pnpm install --frozen-lockfile` then `pnpm build` passes from clean.

---

## 9. Risks

1. **Deleting a screen someone still uses.** Mitigated by row counts — a table
   with 0 rows has no user. The one to double-check is `/admin/payments`:
   it is dead *as built*, but the payments **data** is live and its replacement
   must land in the same pass (P3), not later.
2. **Migration 0172 moving prices.** If a price is mis-mapped, publishing costs
   the wrong amount. Mitigation: the migration only inserts/updates `products`
   rows and deletes `app_settings` keys — write it with an explicit before/after
   table in the migration comment, and verify `/annonces/nouvelle` quotes the
   right number before deleting the old keys.
3. **`DiagnosticEditor` is keyed on `property_id`.** Migration 0165 made both
   columns nullable, but the editor component still passes `propertyId`, and
   `/api/admin/diagnostics/[propertyId]` is named for it. Retarget in P2 or the
   diagnostic panel breaks when `properties` goes.
4. **The lockfile rule.** `PIVOT-PLAN.md` §0 records eight silent failed deploys
   because `package.json` moved without `pnpm-lock.yaml`. This rebuild adds no
   dependencies by design — if that changes, the lockfile moves in the same
   commit, and verification is `pnpm install --frozen-lockfile`, not `npm run
   build` against warm `node_modules`.
5. **Scope creep into the public app.** The sell wizard, checkout and catalog are
   out of scope here. Where the admin needs a shared primitive (the field
   renderers in `src/components/listing/fields.tsx`), reuse it — do not fork it.

---

## 10. Decisions I need from you

| # | Question | My recommendation |
|---|---|---|
| **D1** | The auction tables are empty. Drop them (and the 20 leftover DB functions, `auction_status`/`kyc_status` enums, the `kyc` storage bucket) in migration 0175, or leave them sitting there? | **Drop them, after `scripts/purge-kyc-data.mjs --export`.** The admin rebuild does not require it — I will simply stop referencing them — but leaving 15 empty tables and 20 dead functions is how this mess started. |
| **D2** | Rebuild **in place** (each phase replaces a section, `/admin` is always the real console) or **side-by-side** (`/admin/v3/**`, switch at the end)? | **In place.** Side-by-side means maintaining two consoles for two weeks, and you are the only admin — there is nobody to protect from a mid-rebuild screen. |
| **D3** | API routes or **Server Actions** for admin mutations? | **Server Actions** for everything the admin console does. It deletes the fetch/JSON/error-mapping layer entirely — roughly 800 lines of the 3 378 in `api/admin`. Keep real routes only where something external calls them. |
| **D4** | `kyc_submissions` still holds 2 rows: CIN photos and selfies of real people, plus 8 objects in the private `kyc` bucket. | **Export and purge.** The script is written and dry-run by default; it needs your word. Holding ID photographs for a product that no longer verifies identity is a liability with no upside. |
| **D5** | Packs and the verified badge: price them now, or delete the rows until you sell them? | **Price them now** (P4). They are the revenue model in `PIVOT-PLAN.md` §4, and a 0 TND inactive product is another dead screen. |
| **D6** | Do you want **bulk actions** and **keyboard navigation** (j/k, Enter to open, A to approve) in the annonces queue? | **Yes.** At 66 listings it is a nicety; at 600 it is the difference between the console working and not. It is ~half a day inside P2, and expensive to retrofit. |

---

## 11. First commit if you say go

Phase 1, in order:

1. `src/components/admin/kit/` — `StatusPill`, `EmptyState`, `PageHeader`,
   `Toolbar`, `DataTable`, `SidePanel`, `Confirm`, `Field`, `useAdminAction`.
2. `AdminShell` with the six entries; `AdminSidebar.tsx` deleted.
3. The ESLint rule banning raw palette classes under `admin/**`.
4. Every existing page re-parented into the new shell, untouched otherwise.

That is one day of work that changes nothing functionally and makes every
following phase a deletion rather than an addition.

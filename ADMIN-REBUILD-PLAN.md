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

## Progress log

Newest first. Append as phases land.

### Phases 3–8 — the rest of the console · **DONE** 2026-09-04

Every remaining screen rebuilt on the flat split-pane kit, and the dead ones
deleted. The console is now **13 sections instead of 20**, six of them
reachable from the rail.

**Paiements** (`/admin/paiements`) — replaces `/admin/payments`. The old screen
could not work: it called `admin_payment_boxes`, which groups receipts *by
auction*, and `auctions` has held zero rows since the pivot, so it returned an
empty list forever while **three real `listing_fee` receipts sat in
`pending_review`**. Two things found while building it:

- **The database RPC could not have saved it either.**
  `accept_listing_payment` requires `payments.property_id is not null`, and
  every v3 fee carries its subject in `metadata.listing_id` instead — it raises
  `payment_missing_property` on all of them. So accepting is a plain status
  write, and the existing `_listing_fee_captured` trigger does the cascade it
  already knows how to do: move the listing to `pending_review`, notify the
  seller.
- **Rejection goes through `reject_listing_payment`**, which writes the
  notification and enforces a real motif — but it is SECURITY DEFINER checking
  `is_admin()` against `auth.uid()`, so it must be called with the *admin's*
  client, never the service client (which has no `auth.uid()` and is refused).

Accepting a `listing_pack` now creates the `seller_credits` row and a `badge`
payment creates the `seller_badges` row: nothing in the database did that, so a
pack would have been paid for and granted nothing.

**Offres & prix** (`/admin/offres`) — products CRUD, grouped by kind, with the
warning that actually matters: *N offres en vente sans prix configuré*. The
existing `/api/admin/products` route was already good and is reused unchanged.

**Vendeurs** (`/admin/vendeurs`) — merges `/admin/users` (a role dropdown) and
`/admin/sellers` (packs and badges), which were two screens answering one
question. One consolidated API replaces both, with two guards worth naming: an
admin cannot remove their own admin role (locking themselves out of the console
with no way back), and cannot suspend their own account.

**Catalogue** (`/admin/catalogue`) — the screen `/admin/characteristics` was
supposed to be. That one wrote `property_attribute_kinds`: 64 rows keyed to
`properties`, a dead table nothing reads. The live definitions are
`category_attributes` — 90 rows across 17 categories — and they had **no admin
screen at all**, so the seller's form could only be changed by a developer.
Two guards: `field_key` is never patched on an existing attribute (it is the
jsonb key already written into every listing in that category), and deleting an
attribute is refused while any listing still carries a value under it —
otherwise the values survive with nothing left to say what they mean.

**Réglages** stripped to the payee block. It used to write
`fee_listing_auction`, `fee_listing_direct`, `promo_*`, `deposit`, `commission`
and `final_payment_days` — all prices or auction machinery, and the price half
was the split brain: `app_settings` said 20 TND while `products` said 15, and
only `products` is read by the sell flow. The screen now warns when
`payee_name` still reads "Batta Tunisia SARL" — the twin project's name, on the
bank details a buyer copies into their banking app.

**Journal** defaults to `action is not null`. Page views are still reachable in
their own tab, just no longer the 98.8 % of rows you have to dig through.

**Site** is six tabs rather than six sidebar entries.

**Deleted** (Phase 8): 13 page sections, 8 API route groups and 6 components —
`properties`, `auctions`, `deposits`, `payouts`, `manual-payment`,
`inspectors`, `fraud`, `waitlist`, plus the renamed `payments`, `pricing`,
`users`, `sellers`, `characteristics`. Every old path redirects in
`next.config.ts` — 308 where it was a rename, 307 where the feature itself is
gone — so a bookmark never lands on "page not found".

**Totals:** 16 243 → **14 111 lines**, and the remaining count is misleading in
the right direction: ~2 000 of it is the not-yet-rebuilt Diffusions and Popups
forms. Palette warnings 37 → **18**, all in those same two screens. `tsc`
clean · ESLint **0 errors** · 199 tests pass · `next build` compiles.

**Still on the old design:** Diffusions (1 226 l), Popups (785 l), Accueil and
Documents. They work, they sit inside the new shell and inherit the flat
buttons and pills, but their internals are untouched.

### Redesign + performance · **DONE** 2026-09-04

Two complaints, one session: *"everything should be completely different — the
boxes, the buttons, the workflow"*, and *"routing is super slow and feels like
it's not working right"*. They turned out to be unrelated problems.

#### The slowness was measured, not guessed

The database is **~75 ms per round trip** from here (measured: `select 1`
twice, 75 / 70 ms). What mattered was how many round trips a single admin
navigation made, and how many of them were serialized:

| | Before | After |
|---|---|---|
| Annonces tab counts | 7 head-only COUNTs, **499 ms** median | 1 query, **111 ms** median |
| Layout badge counts | 199 ms, *after* the gate | 199 ms, *overlapping* the gate |
| Identity check | `getUser()` in middleware **and** again in the layout, then a profile row — all sequential | one memoized resolution per request |
| `activity_log` write | one INSERT per admin click | none |

- **`src/lib/admin/session.ts`** wraps the gate in React's `cache()`, so the
  layout and the page it wraps share one `auth.getUser()` + profile lookup.
  It is a per-*request* memo, not a cross-request cache — a revoked session is
  still caught on the next navigation, which is the property that matters.
  `getUser()` stays (it validates the token with the auth server rather than
  trusting a cookie); deduplicating it is safe, skipping it would not be.
- **The layout fires its badge counts before awaiting the gate**, against the
  service client, so they overlap the ~225 ms identity check instead of
  queueing behind it. A non-admin simply gets two discarded COUNTs.
- **Seven tab counts became one query.** Selecting `status, expires_at` for the
  matching rows and tallying them in JS is one round trip instead of seven —
  measured 499 ms → 111 ms, and that cost was paid on every tab click and
  every keystroke of the debounced search. The ceiling is real but distant:
  past ~50 000 listings this wants a `group by` RPC.
- **Admin navigation no longer writes `page_view` rows.** It was a DB write on
  the critical path of every click, and it is the same thing that made the
  audit journal unreadable (16 836 of 17 034 rows). Admin *actions* are still
  logged deliberately, by the routes that perform them.

**"Feels like it's not working" was a separate bug: nothing moved on click.**
Every admin route is `force-dynamic`, so a click is a full server render, and
for all of it the old page just sat there — the natural read is that the click
did not register, and the natural response is to click again. `useLinkStatus`
now drives a spinner on the nav item or row that was clicked
(`kit/LinkPending.tsx`).

**Still outstanding, and it is a judgement call, not a bug:**
`next.config.ts` sets `staleTimes: { dynamic: 30 }`, added deliberately for the
public catalog ("open a car, decide, come back"). It also means going Annonces
→ Paiements → Annonces inside 30 s serves the *cached* Annonces — so an
annonce you just approved can still look pending. Mutations call
`router.refresh()`, which covers the current page but not that path. The knob
is global; lowering it fixes the console and un-tunes the catalog.

#### The redesign: split-pane inbox, flat

Chosen from three directions offered. **No cards, no rounded tiles, no
shadows, no filled panels anywhere** — structure comes from 1px rules and
spacing. Gold is spent in exactly two places: the row you are on, and the one
primary action on screen.

- **`kit/surface.ts`** is the contract — the rules, row states and pane
  behaviour every screen shares.
- **The shell is an application viewport**, not a document: `h-dvh`,
  `overflow-hidden`, and scrolling happens inside panes. That is what lets the
  annonces list keep its scroll position while the detail beside it changes.
  Document-shaped screens opt into a measure with `<AdminPage>`; the annonces
  console cancels the shell padding with `<FullBleed>`.
- **`/admin/annonces` is now two panes**: a dense queue on the left (360–400 px),
  the selected annonce always open on the right. The drawer is gone —
  a drawer covers the list it came from, so every decision cost an open and a
  close. Below `lg` there is no room for two, so the list hands over full-width
  and a back link returns.
- **Status became a dot**, not a filled pill: twenty-five coloured rectangles
  down a list is twenty-five competing blocks and the eye has nowhere to rest.
- **One filled button per screen.** The old set had seven filled variants, so a
  screen with four actions had four competing blocks of colour and no way to
  tell which one to press. Legacy variant names (`success`, `dangerSoft`,
  `ghost`…) still resolve, so un-rebuilt screens compile and inherit the flat
  look.
- **Selection is off by default and toggled on.** A moderator's normal loop is
  "read one, decide, next"; a column of empty checkboxes down the left of that
  is noise for the common case.
- The dashboard and `/admin/site` lost their card grids for figures-and-rules
  and a plain list.

Deleted as superseded: `ListingPanel.tsx`, `kit/Selection.tsx`.

Verified: `tsc` clean · ESLint **0 errors** · 199 tests pass · `next build`
compiles. **Not yet seen in a browser** — the dev session on :3001 expired and
I will not type credentials; the anonymous render was checked instead and
leaks nothing (RLS returns empty, and the payload carries the redirect to
`/fr/login`).

### Phase 2 — Annonces console · **DONE** 2026-09-04

The core screen. `ListingQueue.tsx` (352 l) is gone; the queue is now a
`DataTable` with server-side tabs, search and paging, and a drawer.

**Seven tabs, ordered by what the work costs us**, not by enum order:
À valider · Paiement attendu · En ligne · **Expirent bientôt** · Expirées ·
Refusées · Toutes. "Expirent bientôt" (published, `expires_at` inside 7 days)
is new and is the one with money in it — an annonce that lapses unnoticed is a
renewal nobody was offered.

**Paging is real.** The old page fetched 120 rows with every photo joined, on
every visit, plus every profile and every category attribute for the creation
form sitting on top of it. It now takes 25 rows, and the drawer fetches the
one open annonce's attributes and payment separately.

**Five actions that did not exist** — the queue could only approve, reject,
mark-paid, waive and archive:

- `republish` — an expired or archived annonce had **no way back online**. The
  only publishing path required `pending_review`, so a seller ringing to say
  "it's still for sale" had to recreate the whole thing.
- `extend` — counted from the later of *now* and the current expiry, so
  prolonging an annonce with a week left adds to it rather than quietly
  shortening it to today + 30.
- `feature` / `unfeature` — writes `featured_rank` + `featured_until`
  (migration 0171), so a home-page placement lapses on its own instead of
  freezing the home page in whatever month someone last touched it.
- `mark_sold` — deliberately distinct from archived: "vendue" is the outcome
  the platform exists to produce, and counting it is how we ever answer
  "does this work?".
- `edit` — a short allow-list (titre, prix, négociable, prix sur demande,
  téléphone, nom, description). Category and attributes are **not** editable
  here: those change what the annonce *is*, and belong in the seller's form.
- `delete` — guarded twice. A **published** annonce must be archived first
  (deleting one breaks links a buyer may hold); one whose fee was actually
  **captured** is never deletable at all, because the payment row would point
  at nothing and that is the record we need most when a seller asks what they
  paid for. Storage objects are left in place: orphaned bytes are cheap, and a
  delete that also wipes files cannot be undone.

**Bulk actions** (`POST /api/admin/annonces/bulk`, max 50). Approve, extend and
archive only — **reject and delete are deliberately not bulk actions**: a
refusal needs a motif written for that seller, and a delete is irreversible.
It returns per-row outcomes rather than a boolean, so the operator sees
"18 publiées, 2 sans numéro" instead of a success toast that silently skipped
two. Selection state clears whenever the filter or page changes, since a
selection that outlives its rows acts on rows you can no longer see.

**Keyboard**: `j`/`k` and arrows move between rows, Enter opens — free, because
a `DataTable` row *is* a link. It reads the DOM (`data-row-id`) rather than a
prop, so it keeps working across filtering and paging, and it never fires while
the operator is typing in the search box.

**Creation moved** to `/admin/annonces/nouvelle`. `ManualListingForm` gained a
`standalone` prop and is otherwise untouched — its decisions were right and
were verified against the live database (annonce belongs to the seller,
`fee_waived_by` records who comped it, attestation stamped `v1-admin`).

**Two type problems worth remembering.** `applyTab(query, tab)` as a generic
over the PostgREST builder makes TypeScript re-infer the builder at every
chained call until it gives up (TS2589, "type instantiation is excessively
deep"); describing the filters as data and applying them in a plain loop keeps
one shared definition and compiles. And `category_attributes.data_type` is a
free-text column feeding a closed union — unrecognised values now degrade to a
text box instead of failing the build.

Verified: `tsc` clean · ESLint **0 errors** · 199 tests pass · `next build`
completes with `/admin/annonces`, `/admin/annonces/nouvelle` and
`/api/admin/annonces/bulk` registered.

**Not yet visually verified**: the dev session on :3001 expired mid-pass and I
cannot sign in. Needs one look at the queue, the drawer and a bulk approve.

### Phase 1 — Foundation · **DONE** 2026-09-04

The kit exists and the console has six entries instead of twenty-four.

**New — `src/components/admin/kit/`** (10 files): `tones.ts` (the single
status → label → colour map), `StatusPill`, `EmptyState`, `PageHeader`,
`DataTable` + `Stacked`, `Toolbar`, `SidePanel` + `PanelRow`/`PanelSection`,
`Confirm`, `Field` (Text / Textarea / Number / Select / Toggle / FieldGrid),
`useAdminAction`.

Three decisions worth recording:

- **`DataTable` is a grid, not a `<table>`.** The whole row has to be
  clickable and an anchor cannot wrap a `<tr>`; a CSS grid lets each row *be*
  the link — one tab stop, one focus ring — with ARIA roles carrying the table
  semantics. It also stays a **server** component: cells arrive as rendered
  `ReactNode`s and rows carry an `href`, so no callback crosses the
  server/client boundary and no queue needs `"use client"` just to list things.
- **Detail opens from the URL** (`?panel=<id>`), read by the server. Back
  closes the panel, and a half-reviewed row is a link you can send to someone.
- **`NumberField` reports an empty box as `null`, never `0`.** `lib/products.ts`
  already carries a test for exactly this — "no price configured" must not
  resolve to free — and a field that coerces `""` to `0` is how a paid product
  silently becomes free.

**Nav: 24 → 6 (+ Site).** `AdminSidebar.tsx` (244 l) deleted, replaced by
`AdminShell.tsx`. The eight dead-table entries and the KYC tile are gone from
the menu; their routes still exist and still work — Phase 8 deletes them with
redirects. `/admin/site` is a new hub over the six monthly screens (accueil,
popups, documents, diffusions, réglages, journal), which becomes tabs in
Phase 7. The rail carries live badge counts for annonces and paiements, as
head-only COUNTs in the layout.

**The dashboard was rebuilt** because it could not be left alone: five of its
six tiles counted empty tables and the sixth linked to `/admin/kyc-queue`,
deleted in Phase 6a — a live-looking "2" pointing at a 404. It now counts four
real queues, and carries an eight-row audit strip filtered to
`action is not null` (16 836 of the 17 034 rows in `activity_log` are page
views; without that filter the journal shows nothing an admin did).

**Contrast fixes, beyond the console.** `.batta-tone-warn` was `#b45309`
(amber-700) and `.batta-tone-bad` was `--accent-deep` (red-700) — dark text on
a `#0a0a0a` ground, inherited from the light-mode twin repo. Both were
unreadable, and they are used **108 times across the app**, not just in the
admin: account, sell, auctions, partners. Fixed at the token, so every surface
improves. `AdminButton`'s `dangerSoft`/`warnSoft` carried the same bug in
arbitrary values and were fixed with them; `primary` now uses black-on-gold,
which passes where white-on-gold did not.

**The lint rule is in, staged.** `no-restricted-syntax` bans Tailwind's
light-mode palette classes (`bg-red-50`, `text-amber-700`, …) under the admin.
It is an **error** in the kit, `AdminShell`, the dashboard and `/admin/site` —
which start clean and stay clean — and a **warning** across the legacy console,
where the AST rule currently flags **37** occurrences. Each phase removes a
batch with the screen that carried them; Phase 8 promotes the second block to
`error` when the count reaches zero.

Verified: `tsc` clean · ESLint 0 errors · **199 unit tests pass** · `next build`
compiles · dashboard, `/admin/site` and the legacy `/admin/annonces` all render
correctly inside the new shell at 1440 px and at phone width.

**Not done, deliberately:** nothing was deleted except the superseded sidebar,
no migration was written, and no data was touched. D1 (drop the empty auction
tables) and D4 (purge the two KYC rows) are still yours to authorise.

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

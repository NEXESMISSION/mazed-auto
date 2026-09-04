# Mazed v3 — from auction house to paid classifieds

**Status:** proposed, not started · **Written:** 2026-09-01 · **Owner:** Saif

The platform stops being an auction house. It becomes a **paid listings
marketplace** for cars *and* spare parts, where we are the middleman that
publishes and vouches — not the party that holds the money for the sale.

This document is the single source of truth for that migration. Anything not
written here is not in scope; anything dropped is dropped on purpose and the
reason is recorded.

---

## 0. Progress log

Append here as phases land. Newest first.

### Nothing had actually deployed since 2 September · **FIXED** 2026-09-04

Eight production deploys in a row failed on Vercel, each in about five
seconds — every commit from `be8e63e` (the KYC deletion) onward. Five seconds
is too fast to be a compile error: they never reached the build.

`be8e63e` dropped `@vladmandic/face-api` from package.json and left
`pnpm-lock.yaml` untouched. Vercel installs with `--frozen-lockfile`, which
refuses outright when the lockfile and the manifest disagree
(ERR_PNPM_OUTDATED_LOCKFILE). So a fortnight of work — the free parts pricing,
the catalog paging, the image optimisation, the content rewrite, the new
publish flow — was sitting on main and running nowhere.

**Why the local checks missed it.** Every "build is clean" in this log was
`npm run build` against node_modules that were already installed. Nothing in
that path reads the pnpm lockfile, so the one file the deploy checks first was
the one file never verified. This project is pnpm; the verification has to be
`pnpm install --frozen-lockfile` and then `pnpm run build`, from a clean
`.next`, or it is not testing what Vercel runs.

**Rule from here on:** a change to `package.json` is not finished until
`pnpm-lock.yaml` moves with it in the same commit.


### Images, back-navigation, Favoris, and the copy sweep · **DONE** 2026-09-02

**Images were sixty times too big.** Measured before changing anything:
1280px webp files decoded into 166px boxes, ~79KB each, about 2MB for one
screen of cards. The files were fine — the v3 surfaces used raw `<img>`, which
goes straight to Supabase for the original and skips the image optimizer the
logo three lines away was already using. `ListingImage` routes them through
next/image with the real display width, so the same photo now costs 3,323
bytes at 200px instead of 37,958. Nothing changed in storage, and nothing
changes for a seller uploading a photo.

**Back always landed at the top.** `/annonces` is force-dynamic, so going back
refetched the whole payload and the browser restored scroll against a page
with no content yet. `staleTimes` keeps a visited page in the client router
cache for 30 seconds — long enough for "open a car, decide, come back".

**Favoris replaced Activité** in the fourth tab. Activité pointed at
/account/listings while its own page is the auction one (bids, watchlist,
wins), and v3 has none of that. Saved annonces are what a buyer returns for.

**The copy sweep found the product still selling itself as an auction house.**
Counting only visible text, not the messages bundle: /help had 37 mentions of
enchères, caution, KYC and inspecteurs — a FAQ instructing sellers to complete
a KYC and buyers to pay a caution, both of which were deleted. /how-it-works
had 12 and described a five-step auction listing flow. /about had 5. Worse,
**`/sell` was still live** — the entire v2 auction form, forty-odd mentions of
enchère, mise à prix, caution — and the account page linked to it as "Tableau
du vendeur". It now redirects to /annonces/nouvelle. All three content pages
were rewritten for the marketplace we run; the remaining hits are my own copy
saying there is no enchère.

**Fourteen annonces were invisible to the governorate filter.** The imports
carried whatever the source site had in its location field — "Sahloul",
"La Marsa", "Cité Ennasr 2", "Boumhel" — and `/annonces` filters against the
24 real governorates, so a car in Sahloul could not be found under Sousse.
`scripts/normalize-governorates.mjs` maps only unambiguous towns (each sits in
exactly one governorate); two rows saying "Tunisie" were left alone and
reported, because inventing a location for a car sends a buyer on a drive.
Ben Arous went from 5 matches to 10, Ariana from 1 to 3.


### The home page lost its cover, and parts are now free · **DONE** 2026-09-02

**The cover.** Reported as *"the top thing was nice and felt alive, now it
looks awful — get the cover back"*, and it was a hole I made. Both heroes were
built on auctions: `PromoHero` cycled slides about bidding, a refundable
deposit and KYC over auction photos, and `DesktopHero` rendered countdowns and
bid counts linking to `/auctions/[id]`. Putting the auction blocks behind
`AUCTIONS_VISIBLE` took the hero with them, so the home page opened straight
onto a rail of cards with nothing above it.

`AnnonceHero` restores the same two layouts from the catalog we actually have:
the cycling cover on mobile, the magazine spread (featured annonce + up to
three runners) on desktop. One `cache`d read serves both trees, and it renders
nothing when no published annonce has a photo — a hero is not worth a grey box.
The slides say what is true now: the price is shown, you call the seller, we
diagnose the car, and publishing a part is free.

**Parts are free (0167).** A decision expressed as a `products` row like every
other price, not a special case in code — an admin can start charging for them
from /admin/pricing without a deploy. It is scoped to the « Pièces de rechange »
PARENT category, and `resolveListingFee` now falls back to the parent, so:
one row instead of nine identical ones on the sub-categories that would drift
apart the first time one was edited, and a sub-category added next month
inherits free rather than silently falling through to the 15 TND catch-all.

Zero had to be taught to mean something. The submit route would have created a
payment for 0 TND and parked the annonce in `pending_payment`, waiting for a
seller to upload a receipt for nothing — so a zero fee now skips payment
entirely and goes straight to the queue. Renewal follows: a category that
publishes for free renews for free, because charging 15 TND to keep a free
annonce alive is a trap. `isFree` keeps that distinct from *unpriced*, which
still refuses to publish — collapsing the two would either charge for a part
or give away a car. Six tests pin it.

**On the errors while adding a listing:** the logged failures at that time were
mine — `TAB_HREFS is not defined` and `isActivityPath is not defined`, thrown
by the dev server between two of my saves while the nav fix was half-applied.
They are gone. No failure was logged against the publish flow itself.


### The « Activité » tab never lit up · **DONE** 2026-09-02

Pivot fallout, and a good illustration of why both halves of a rule belong in
one place. The tab was repointed to `/account/listings` when « Mes enchères »
became « Mes annonces », but its matcher was left testing the old
`/account/activity` — so it navigated somewhere it did not recognise and never
highlighted, while the Compte tab's `startsWith("/account/")` quietly claimed
the highlight instead. Tapping Activité lit Compte.

The rule now lives in `src/lib/nav/tabs.ts` as a pure function over the
pathname, next to the hrefs it matches, and both navs use it — the desktop
header had drifted the same way, lighting « Parcourir » and « Vendre » together
on the sell wizard. The matchers are disjoint by construction rather than by
array order.

Six tests pin the two invariants that were violated: every tab lights for its
own destination, and no path lights two. Both failed on the first run against
the new module and caught overlaps I had left in it.


### The catalog was empty because 62 cars were one column short · **DONE** 2026-09-02

Reported as *"I don't like how it's empty, I want it full of cars"*, and the
cause was not missing data. 0155 migrated **all 62 auction properties into
`listings` with their 462 photos, titles, prices and specs intact** — then left
every one of them as `draft`, because the backfill had no contact number to
give them and the table refuses to publish a row nobody can call:

    check (status <> 'published' or contact_phone is not null)

So the entire inventory sat one column away from being visible while the
catalog showed almost nothing. `scripts/publish-legacy-listings.mjs` publishes
it: seller's own number where there is one, `fee_waived_by` on our own migrated
stock, attestation marked `v1-admin` (nobody signed for these — we listed them
ourselves), and publication dates spread over three weeks so "les plus
récentes" has something real to sort by.

The three sellers are seeded demo agencies with no phone. Rather than invent
plausible Tunisian mobiles — which would send buyers to whichever stranger owns
them — each carries a placeholder in the unassigned +216 71 000 xxx range.
**These must be replaced with the real showroom numbers before the catalog is
used to reach a seller**; grep `SAFE_PLACEHOLDER`.

Filling the catalog then exposed a second bug that had been invisible while it
was nearly empty: `/annonces` read `.limit(60)` and printed `rows.length` as the
total. With 64 published, it under-reported the count **and four cars were
unreachable, because nothing linked past the sixtieth**. The page now pages
properly — exact count, 24 per page, filters carried through, and an
out-of-range page (a stale bookmark, or narrowing a filter while on page 3)
clamps to the last real page instead of claiming nothing matched. That last
case needs a separate count read: PostgREST answers an out-of-range slice with
no rows *and* no count, so the first attempt at the clamp silently did nothing.

Verified through the running site: 64 annonces across 3 pages (24/24/16, no
overlap), `?page=99` lands on page 3, `?gov=Tunis&page=2` falls back to its
single page of 9 rather than reading "aucune annonce", and the filters report
exact totals.

Still thin: **the pièces catalog holds 1 listing.** Filling it with invented
parts would mean invented photos, and a car photo on a brake-pad listing is
worse than an empty shelf — the new admin panel is the way to add real ones.


### Admin manual listing creation · **DONE** 2026-09-02

**This was recorded as delivered in Phase 3 and had never been built.** The
plan's own acceptance line — *"an admin publishes one manually"* — was ticked
against a queue that could only approve, reject and archive what a seller had
already submitted. Found by re-reading the plan against the code rather than by
anything failing, which is the point of keeping the plan.

It matters because it is half the brief: *"ou on l'ajoute manuellement depuis
l'admin"*. A seller who rings up, walks in, or sends photos on WhatsApp is a
real way listings arrive here, and until now the only answer was to ask them to
go and do it themselves.

`POST /api/admin/annonces` creates the annonce **on behalf of** the seller and
publishes it straight away — the admin filling it in is the moderation. Three
decisions worth recording:

- **The annonce belongs to the seller, not the admin.** `seller_id` is theirs,
  the phone on it is theirs, it appears in their « Mes annonces » and they can
  renew it. Anything else would leave them unable to touch their own car.
- **`fee_waived_by` records who comped it.** No credit is consumed and no
  payment is attached, so the revenue reporting shows the gap instead of hiding
  a free publication among the paid ones.
- **The attestation is stamped `v1-admin`, not `v1`.** `v1` means the seller
  personally ticked the sworn accuracy statement. Here they did not — someone
  typed the car in from a phone call. Writing `v1` would be a false record of
  precisely the thing the attestation exists to prove.

The panel sits at the top of `/admin/annonces`: seller search, category with
its own attributes, price or "sur demande", photos through the same compression
pipeline as the seller wizard, and fitments when the category is a part. The
field primitives moved to `src/components/listing/fields.tsx` so the two forms
render a category attribute the same way instead of drifting.

Verified against the live database: the row inserts past the publish guard, the
attestation trigger stamps the moment, `seller_credit_id` and `fee_payment_id`
stay null, photos and fitments attach, the seller's notification enqueues, and
the row deletes cleanly afterwards. Test row removed.


### Gaps closed + Phase 7 · **DONE** 2026-09-02

Three things the earlier phases left behind, found by re-reading the plan
rather than by anything breaking.

**The diagnostic could not reach the catalog (0165).** 0148 keyed
`vehicle_diagnostics` to `property_id` — the only object a car could be at the
time. Nothing a seller publishes today is a property, so the sheet behind the
"Vérifié et approuvé" badge **could not be attached to a single v3 annonce**.
With KYC gone, the diagnostic and the paid badge are the two things separating
us from a free listings board, so this was not a small gap. Both columns are now
nullable with `num_nonnulls(property_id, listing_id) = 1`, so a row points at
exactly one subject and can never disagree with itself. The admin writes it from
a panel on each row of the annonces queue — the moment someone is already
looking at the photos is the moment to write down what they saw — and the sheet
renders on the public page. Verified: a published diagnostic shows its verdict,
headline, sections and per-item notes on a live annonce, and a row naming both
subjects is refused.

**Favourites could not point at an annonce (0166).** `watchlist` was keyed to
`auction_id`, so the heart on a listing card had nowhere to write. Same shape as
the fix above; the old composite primary key became partial unique indexes so
"saved twice" is still impossible on either subject. Optimistic button, and a
logged-out visitor is sent to sign in with `next` pointing back at the annonce
they were saving.

**Phase 7 — tests and seed.**

- `src/lib/fitment.ts` — the "compatible avec" rule extracted from the catalog
  page and unit-tested (12 cases): accent folding, model matching in either
  direction (a seller writes "Clio 5 Business", a buyer types "Clio 5"),
  open-ended year ranges, and *returning nothing rather than everything* when
  nothing fits. The page now calls it instead of carrying its own copy — two
  places deciding what "compatible" means is how a buyer ends up with parts for
  another car. Verified through the real page: `RENAULT/2020` hits,
  `Clio/2018` (outside the range) does not, `toyota` does not.
- `src/lib/products.test.ts` — 13 cases over the pricing rules, including the
  two that are quietly expensive to get wrong: a category price must beat the
  global one (D4), and "no price configured" must return **null, not free**.
- `scripts/seed-v3.mjs` — 3 cars + 3 parts with real fitments, reusing existing
  photo objects. Separate from `scripts/seed.mjs`, which seeds auctions and dies
  with them. It carries the same live-database guard, and it does **not** invent
  pack or badge prices.

Totals now: **179 unit tests**, `tsc` clean, ESLint 0 errors, build clean.

### Phase 6a — KYC and the inspector network deleted · **DONE** 2026-09-02

Not disabled, not flagged — **deleted**. A flag guarding dead code is a lie
about what the product can do.

**5 455 lines across 48 files**, plus `@vladmandic/face-api` (~2 MB out of the
browser bundle) and its model weights. Gone: the whole `/kyc` funnel, the
liveness check, the admin review queue, the nudge modal, the KYC cron, the
inspector workspace, the apply/book pages, the inspector API, and every gate,
import and dead branch that referenced them. `KYC_ENABLED` and
`INSPECTIONS_ENABLED` are gone with the code they guarded; `AUCTIONS_VISIBLE`
is the last flag of the pivot.

Old links do not 404: `/kyc/*` and the admin queue now **308** to `/account`,
the inspector paths **307** to home. A bookmark or an old e-mail that lands on
"page not found" reads as a broken site rather than a retired step.

**Migration 0164** drops the 8 KYC functions and the 4 triggers on
`kyc_submissions` — machinery firing on a table nothing writes to any more.

**What it deliberately does NOT delete: the data.** `kyc_submissions` (2 rows)
and the private `kyc` bucket (8 objects) hold CIN photographs and selfies of
real people. That deletion is irreversible and is a data-protection decision,
not an engineering one. `scripts/purge-kyc-data.mjs` is ready and **dry-run by
default**: it exports the rows and downloads every object first, refuses to
delete without `--export`, and prints the final DDL. It needs the owner's word,
not a commit.

### Phase 6b — auctions · **BLOCKED until 2026-09-11**

60 lots are still open (10 scheduled, 50 live), the last ending **11 Sept**.
Deleting the auction code or redirecting `/auctions/*` today would break lots
people can still bid in. Nothing in the app links to them; they finish, then
the code, the tables, the enums and the 301s go in one pass.

### Phase 7 — Docs · **PARTLY DONE** 2026-09-02

`README.md` rewritten for what the product now is — publishing, buying, money,
trust, the surface map, and a pointer to this plan. `ARCHITECTURE.md`,
`RUNBOOK.md` and `WEBAPP-GUIDE.md` carry a v3 banner rather than a rewrite:
their content is still largely accurate, and a stale rewrite would be worse
than an honest pointer. They get rewritten when Phase 6b lands and the auction
half can be cut rather than annotated.

Still to do: reseed `scripts/seed.mjs` for listings/parts/products, and tests
for fee resolution and fitment matching.

### Phase 5 — Account + notifications · **DONE** 2026-09-02

**Renewal closes the expiry loop.** Expiry is what keeps the catalog honest
(D2); renewal is the other half of that bargain. `POST /api/annonces/[id]/renew`
follows the same order as `/submit` — credit first, payment otherwise, and
**never straight to published**: a renewed annonce is re-checked, because being
looked at is what makes a paid listing worth more than a free one. Priced by the
`renewal` product when the admin has set one, otherwise by that category's
ordinary fee, since a renewal *is* a publication.

The button in *Mes annonces* says which way it will be paid **before** it is
pressed — "1 publication du forfait" or the price. A "Renouveler" that silently
spends one of five prepaid publications is exactly the surprise that becomes a
support message.

Verified live: published → past its date → `expire_listings()` takes it down →
renew spends a credit (`remaining: 4`) → back in the queue with
`renewed_count: 1` → published again for 30 days, and the J-3 warning flag is
cleared so the next cycle warns properly.

**Notifications trimmed to the v3 lifecycle.** `SMS_KINDS` now texts what a
seller who is *not* on the site needs to hear: published, refused, expiring,
expired, fee received, forfait credited/expired, badge granted/revoked, payment
verdicts. The auction kinds stay only while the last lots close.

Dropped: every `kyc_*` (the feature is gone), `payout_*` (went with escrow),
`sixth_offer_*`, and the inspection kinds. `listing_submitted` stays in-app
only — it acknowledges something the seller just did, and the verdict that
follows carries the news; texting both meant two SMS for one thing.

**The invariants test was rewritten, not deleted.** It asserted that
`kyc_verified`, `payout_paid` and `sixth_offer_awarded` must always SMS —
i.e. that removed features still text people. It now guards the v3 list, and a
new case asserts the removed kinds are *absent*, so nobody re-adds a text
pointing at a screen that no longer exists.

### Phase 5 (brought forward) — the app stops looking like an auction house · **DONE** 2026-09-02

Two problems reported together: "the PWA still looks old, nothing changed" and
"make sure I don't see anything related to auction any more".

**The PWA was serving the old app, and the cause was ours.** `sw.js` carries a
`VERSION` string, and the activate handler deletes every cache whose key does
not start with it. That string had not changed since v8 — so a returning
visitor's browser fetched a byte-identical worker, no update event fired, and
the old shell kept being served no matter what we deployed. Fixed three ways:
the version is now `mazed-v3-1` (which evicts everything older), the register
calls `update()` immediately instead of waiting on the browser's 24-hour check,
and a `controllerchange` listener reloads **once** when a new worker takes over
— otherwise the page you are looking at was already rendered from the old cache,
which is exactly what "nothing changed" looks like.

**Auctions are out of sight, behind `AUCTIONS_VISIBLE = false`.** What went:

- the home hero, live ticker, every bid rail, "Enchères en cours", "Les plus
  disputées", "Sélection VIP", the ending-soon carousel, the activity feed and
  the sold-lot proof strip — on **both** the mobile and desktop trees
- `/properties`, the v2 explore grid, now redirects to `/annonces`
- the nav: Parcourir → `/annonces`, the centre button → `/annonces/nouvelle`,
  Activité → `/account/listings`, "Mes enchères" → "Mes annonces"
- the copy: 15 strings that still sold an auction ("Verrouillez la caution puis
  enchérissez", "Une enchère pensée pour vous protéger", "Enchérisseurs
  vérifiés") now describe a marketplace where you contact the seller

Measured on the rendered page, scripts stripped: **0 auction words** on the
home page, `/annonces` and `/account` — down from 54.

**What deliberately still works:** `/auctions/<id>` for the 60 lots still
running, and the admin's "Enchères (v2)" group. Nothing in the app links there
any more. Phase 6 deletes the routes and adds the 301s once the last lot settles.

### Phase 4 — Public surfaces · **DONE** 2026-09-02

The catalog is browsable and a buyer can reach a seller. Home rails, the
/auctions → /annonces redirects and the sitemap/JSON-LD switch are still to do.

**Done**

| Piece | What it does |
|---|---|
| `/annonces` | The catalog: Véhicules ⇄ Pièces switch first (a buyer wants one or the other, never both), then search, category, gouvernorat, prix max — and for parts, **"compatible avec mon véhicule"**. |
| `/annonces/[id]` | Gallery, price, category-labelled specs (not a jsonb dump), fitments, the verified badge, and an honest line saying we do not touch the transaction. |
| `POST /api/annonces/[id]/contact` | The reveal. Logs to `contact_reveals` with a **salted IP hash**, rate-limited to 40/hour per address. |
| 0163 | Fix: the reveal counter never incremented (below). |

**Verified against real published listings** (one car, one part, seeded for the
purpose):

- `/annonces` shows both · `?kind=part` shows only the part
- **`?make=Renault&model=Clio 5&year=2020` returns the brake pads** — the query
  a parts marketplace lives on, answered by `listing_fitments` rather than by
  hoping the words appear in a description
- **the phone number does not appear in the page HTML at all** (`grep` count: 0)
  — it arrives only from the reveal endpoint, and the reveal is logged with a
  hashed IP and a null user for an anonymous visitor

**A bug this phase found and fixed (0163).** The reveal endpoint bumped its
display counter through an RPC that did not exist, with a read-modify-write in
the rejection handler. supabase-js does not *reject* on a missing function — it
*resolves* with `{ error }` — so the fallback never ran, and the counter sat at
0 while `contact_reveals` filled up correctly. Now one atomic statement, with
the failure logged rather than swallowed, and the existing rows backfilled.
Counter and log now agree (2 = 2).

**Home now leads with the catalog.** Two rails — *Voitures à prix fixe* and
*Pièces disponibles* — sit above the auction blocks, each rendering nothing when
its side of the catalog is empty, so the section grows in as sellers publish
instead of showing an empty shelf. The auction blocks stay below while 60 lots
are still running and retire with them in Phase 6. "Vendre" now points at the v3
wizard. Verified: both rails render the seeded car and part.

**Sitemap + structured data.** `/fr/annonces` and every published annonce are in
the sitemap; the listing page emits a plain `Offer` (price, condition,
availability, area, validity) rather than the auction-shaped Product the v2
pages use. **The phone number is deliberately absent from the JSON-LD** — it is
the easiest thing on a page to scrape.

**The `/auctions/*` → `/annonces` 301s are deliberately NOT done yet.** The plan
put them here, but 60 lots are still live: redirecting their pages today would
break auctions people are actively bidding in. They move with the auction
decommission in Phase 6, which is where they belong.

### Phase 3 — Selling + moderation · **DONE** 2026-09-02

The whole publish path exists and is proven end to end. What is missing is the
seller-facing wizard that drives it — the next thing to build.

**Done**

| Piece | What it does |
|---|---|
| `POST /api/annonces` | Create/update a draft: category (must be a leaf), price or "sur demande", attributes, contact, photos, fitments. The server owns `seller_id`, `status` and the attestation timestamp. |
| `POST /api/annonces/[id]/submit` | **The one place that decides how a publication is paid for.** Credit if the seller has one → straight to review; otherwise a `listing_fee` payment at *this category's* price → checkout. Refuses to submit without a phone, an attestation and a photo. |
| `POST /api/admin/annonces/[id]` | approve (publishes for the duration the product paid for) · reject (**returns the credit**) · archive. |
| 0160 | Capturing a `listing_fee` moves its listing to `pending_review` — in the DB, so it holds for every capture path, not just the one screen we wired. |
| 0161 | Fix: the publish guard locked out the database owner (below). |
| 0162 | Fix: attestation stamping on `listings` (below). |
| `/admin/annonces` | The v3 moderation queue: photos first, sorted by what is waiting on us, approve/reject/archive inline. Rejection demands a reason. |
| Sidebar | Leads with **Catalogue → Annonces**; the auction group is now "Enchères (v2)". |

**Proven against the live DB, in one run:**

1. draft created, attestation stamped by the server
2. submit with no pack → `{ok:false, reason:"no_credit"}`
3. submit with a pack → spent, `remaining: 4`
4. moderation refuses → **credit returned**, quota back to 0
5. approve → published with a 30-day expiry
6. anon reads title and price; `contact_phone` still blocked
7. **fitment search works**: "Clio 5, 2020" finds the brake pads
8. paid path: fee captured → listing moves to `pending_review`, seller notified

**Two bugs this phase found and fixed.**

- **0161 — the publish guard locked out the database.** 0154 allowed the
  publish transition for `service_role` and admins only, which also excluded the
  role migrations and the SQL editor run as. Any future migration that publishes
  rows would have failed with `publication_requires_payment` — a baffling thing
  to be told while holding the database password. 0155 only escaped it by
  accident (every backfilled row landed in `draft`). Superusers can disable a
  trigger anyway, so the guard was never a boundary against them; the boundary
  that matters — a seller cannot publish their own listing — is unchanged.
- **0162 — the attestation was never timestamped on listings.** 0147/0151 gave
  `properties` the columns *and* the trigger; `listings` copied only the
  columns, so `/api/annonces` wrote the version and nothing stamped the moment.
  The end-to-end run printed `stamped: false` and gave it away. A signature with
  no timestamp is not evidence of anything, which is the entire point of the
  attestation. Now stamped server-side, and nothing enters review unsigned.

**The sell wizard shipped** — `/annonces/nouvelle`, four steps in the order a
seller thinks: catégorie → détails (+ the attributes *that* category defines, and
"compatible avec" for a part) → photos → contact + attestation. The draft is
saved server-side at every step, so a dropped connection at the photo stage never
costs the details typed two screens earlier. Photos upload as they are picked,
through the existing compression pipeline.

The last screen states plainly which way it will be paid — "1 / 5 de votre
forfait" or the category's price — but does not decide it: `/submit` does, on the
server. A credit path ends on a confirmation with the remaining count; a paid one
redirects to the existing receipt checkout.

`/account/listings` ("Mes annonces") ships with it, because every notification
the v3 flow sends points there — a notification that leads to a 404 is worse than
no notification.

**`next build` is clean**: compiled successfully, 0 errors, 103 static pages
generated, and all nine new routes present —
`/annonces/nouvelle`, `/account/listings`, `/admin/annonces`, `/admin/pricing`,
`/admin/sellers`, `/api/annonces`, `/api/annonces/[id]/submit`,
`/api/admin/annonces/[id]`, `/api/admin/products`, `/api/admin/sellers/[id]`.

### Phase 2 — Pricing engine · **DONE** 2026-09-02

Packs, prices and the badge are now data an admin edits, not code.

| Migration | What landed |
|---|---|
| 0157 | `products` — one row per purchasable thing, seeded from the existing `app_settings` fees so nothing changed commercially |
| 0158 | `seller_credits` · `credit_ledger` (append-only) · `seller_badges` · `consume_listing_credit()` · `return_listing_credit()` · `has_verified_badge()` · `expire_credits_and_badges()` + daily cron · new `payment_kind` values |
| 0159 | Fix: the ledger's own FKs made it impossible to delete a listing (below) |

App:

- `src/lib/products.ts` — the single place that answers "what does this cost?",
  with category-specific prices beating the global one (D4).
- `/api/admin/products` (list · create · update · deactivate — never hard-delete,
  because sellers hold credits bought under a row) and
  `/api/admin/sellers/[id]` (grant credits · grant badge · revoke badge).
- **Tarifs** (`/admin/pricing`) — every price, grouped by kind, edited in place.
  New products are created *inactive*: nothing goes on sale at a price nobody
  chose.
- **Forfaits & badges** (`/admin/sellers`) — search a seller, credit a pack,
  grant or pull the badge. Revoking demands a reason; the API refuses without one.
- Both screens added to the admin sidebar under *Argent*.

**Verified against the live DB:**

- Spend → exhaust → refuse, and the ledger records each movement.
- Return on rejection puts the credit back and reopens an exhausted pack.
- **Double-spend is impossible.** Two concurrent transactions publishing on a
  1-credit pack: one got `{ok:true, remaining:0}`, the other `{ok:false,
  reason:"no_credit"}`, `quota_used` = 1. That is the whole reason consumption
  is a `SECURITY DEFINER` function with `SELECT … FOR UPDATE SKIP LOCKED`.
- The ledger refuses UPDATE and DELETE (`credit_ledger_is_append_only`).
- Badge: granted → `has_verified_badge()` true; revoked → false, live, with no
  cached flag anywhere to go stale.
- Seeded products render on `/admin/pricing` (Annonce standard, Pack 5, Badge).

**A bug this phase found and fixed (0159).** `credit_ledger` was created
append-only *and* with FKs (`listing_id … on delete set null`). Deleting a
listing therefore made Postgres run `UPDATE credit_ledger SET listing_id = NULL`,
which the append-only trigger rejected — **a listing that had spent a credit
could never be deleted**, and neither could a seller_credit or the profile above
it. A ledger records what happened; it cannot hold live references to things
that may be removed. The columns stay, the FKs are gone.

**Packs and the badge ship INACTIVE at price 0.** A pack sold at a number a
migration invented would be worse than no pack. Set the prices in *Tarifs* and
switch them on — that is the first thing to do when you next open the admin.

### Phase 1 — Schema foundation · **DONE** 2026-09-02

The new model exists and is populated. No UI reads it yet — that is Phase 3-4,
exactly as planned.

| Migration | What landed |
|---|---|
| 0153 | `listing_status` enum · `categories` (17 seeded: 5 vehicle + 10 part branches) · `category_attributes` (90 seeded — vehicle attributes lifted from the admin's existing `property_attribute_kinds` so nothing they configured is lost) |
| 0154 | `listings` · `listing_photos` · `listing_fitments` · `contact_reveals` + indexes, RLS, grants, publish guard |
| 0155 | Backfill: 62 properties → listings, 454 photos copied |
| 0156 | `expire_listings()` + hourly pg_cron job (`7 * * * *`), J-3 warning then published → expired |

Rollback: `supabase/rollback/0153_0156_listings_down.sql`.

**Verified against the live DB, not assumed:**

- **The phone number is unreadable by users.** `contact_phone` /
  `contact_whatsapp` are granted to `service_role` only — `select contact_phone`
  as *anon* AND as *authenticated* both fail with `permission denied`, while the
  public columns read fine. One PostgREST request can no longer walk the catalog
  for numbers; the reveal endpoint (Phase 4) reads them server-side and logs to
  `contact_reveals`.
- **A seller cannot publish themselves** → `publication_requires_payment`.
  Publication is the product; an owner UPDATE can't hand it out for free.
- **Every RLS policy is self-contained.** This is the bug that made the auction
  price un-pollable for logged-out visitors (the `auctions` policy reads
  `properties`, which anon can't). Policies here test their own row or call the
  SECURITY DEFINER `is_admin()`; the photo/fitment policies only read
  `listings.id/status`, both granted to anon.
- `expire_listings()` runs clean: `{"ok":true,"warned":0,"expired":0}`.

**⚠ All 62 backfilled listings are in `draft`, not `published`.** The rule in
0154 is that a published listing must carry a phone number — a listing nobody
can call is worthless in a model where the buyer calls the seller. All 62 belong
to the three seed agency accounts (Auto Deal · Tunis 22, Mega Motors · Sousse
20, Premium Cars · Sfax 20) and **none of those profiles has a phone**. I did
not invent one.

To publish them, give those profiles a number and then:

```sql
update listings l set contact_phone = pr.phone, contact_whatsapp = pr.phone,
       status = 'published', published_at = now(), expires_at = now() + interval '30 days'
  from profiles pr
 where pr.id = l.seller_id and pr.phone is not null and l.status = 'draft';
```

If they are only demo data, leave them — Phase 3 will fill the catalog with real
listings anyway.

### Phase 0 — Freeze · **DONE** 2026-09-02

Applied to the live database (via the new `scripts/apply-migrations.mjs`,
which this repo previously lacked — that is how 0145-0148 ended up
written-but-never-run while the code needing them shipped):

| Migration | Effect | Verified |
|---|---|---|
| 0145 | `receipts` owner-delete policy | policy present — orphan cleanup finally works |
| 0146 | caution becomes one flat amount | `deposit = {"amount":500}` |
| 0147 | seller-attestation **columns** | 2 columns on `properties` |
| 0148 | `vehicle_diagnostics` table | table present |
| 0152 | **auction creation frozen** | INSERT as `authenticated` → `auctions_closed`; the 60 live/scheduled lots keep running |

**Deliberately NOT applied: 0151** (attestation *enforcement*). 0147 was split
in two: the columns are safe on any build, but the trigger refuses every listing
that arrives without a signature — under an older deploy that is every listing.
Apply 0151 the moment the build that fills the column is live.

Code:

- `KYC_ENABLED = false` in `src/lib/features.ts`, and every gate follows it:
  middleware bounces `/kyc/*` + `/admin/kyc-queue` → `/account` (verified: 307),
  the account row, settings row, home step and nudge modal are gone, the admin
  sidebar entry is gone, and the auction identity checks (bid page, detail page,
  `deposit`, `buy-now`) now pass for everyone — so the lots still running stay
  biddable for people who never verified.
- The sell form no longer offers "Enchère". New listings are fixed-price
  annonces; a seller editing one of the 60 legacy auctions sees a read-only
  note instead of a type picker, so their live lot can't be flipped under them.
  The dead `ListingTypeOption` component (72 lines) went with it.

Checks: `tsc` clean · ESLint 0 errors · 153 unit tests pass · home, explore and
auction pages all 200.

**⚠ Conflict to resolve before Phase 1.** A second session has been building
spare parts on the OLD model — `0149_spare_parts_category.sql` adds
`'spare_part'` to the `property_type` enum and its header says parts "reuse"
KYC and the auction-era checkout. That is the opposite of §2.1 and §5. It is
**not applied** to the database. Decide: adopt this plan and drop 0149, or keep
0149 and rewrite this plan around `property_type`. Do not build both.

---

## 1. The change, in one page

| | Today (v2) | After (v3) |
|---|---|---|
| Core object | Auction on a property | **Listing (annonce)** |
| Price discovery | Bidding, proxy bids, anti-snipe, 6th offer | Seller sets a price. Negotiable flag. No bidding. |
| Who talks to whom | Platform brokers everything, identities hidden | **Buyer contacts seller directly** (phone / WhatsApp on the listing) |
| Money we touch | Caution + buy-now + final payment + payouts + commission | **Publication only** — per listing, or from a pack the seller bought. We never hold sale money. |
| Catalog | Cars only | **Cars + spare parts (pièces de rechange)**, one category tree |
| Who can publish | Seller, after review | Seller after paying + review, **or an admin publishes manually** (fee waived) |
| Identity | KYC (CIN + selfie + liveness), mandatory to bid | **No KYC at all.** Verified phone + a **paid "Vendeur vérifié" badge** we grant by hand |
| Trust | Escrow, deposits, KYC gate | Moderation + **Diagnostic Mazed** + the paid badge |
| Pricing control | Fees hardcoded in `app_settings` blobs | **Every price, pack and add-on managed in the admin** |

Consequence to keep in mind at every step: **we stop being a payment
intermediary for the sale.** Every feature that exists to protect a sale we
custody — deposits, refunds, forfeits, settlement, payouts, clawbacks — loses
its reason to exist.

---

## 2. Two settled calls

These were open questions; they are now decided and drive the schema.

### 2.1 KYC is removed, not demoted

Not disabled behind a flag, not kept "for later" — **deleted**. Reasons it can
go: nothing in v3 depends on a verified identity (we never hold the money), and
the cost is real — ~3 640 lines across 25 files, 93 files referencing it, 47
migrations, a private storage bucket of ID photos, and the whole
`@vladmandic/face-api` liveness stack (~2 MB pulled into the browser).

Deleting it also **deletes a liability**: we stop storing CIN images and selfies
of Tunisian citizens, which is the most sensitive data in the system and the
hardest to justify holding once there is no transaction to protect.

What replaces it, in order of strength:
1. **Verified phone** (already built, keep) — the real identity anchor here.
2. **Moderation** of every listing before it goes public.
3. **The seller attestation** (migration 0147) — signed, timestamped, per listing.
4. **The paid "Vendeur vérifié" badge** — see §4. We check the seller ourselves,
   they pay for it, we can revoke it.

### 2.2 Every price lives in the admin

No fee, pack, add-on or badge price is ever written in code again. One admin
screen, one `products` table, one ledger. Adding a "3 annonces pour 50 TND"
offer must be a form, not a deploy.

---

## 3. Remaining decisions

| # | Question | Recommendation |
|---|---|---|
| D2 | Do listings expire? | **Yes — 30 days**, then auto-archived with a renewal offer. Without expiry the catalog rots and there is no repeat revenue. |
| D4 | Same fee for a car and a brake pad? | **No.** Price per category. A 200 TND part cannot carry a car's fee. |
| D5 | What happens to the 677 auctions / 63 bids / 32 deposits? | **Archive, don't delete.** Move to an `archive` schema, read-only for a quarter, then drop. |
| D6 | Keep the professional roles (agency / bank / bailiff)? | **Keep agency**, drop bank + bailiff. Agencies are the pack customers. |
| D7 | On-platform messaging? | **Not in v3.** Contact is phone/WhatsApp. Messaging is a product in itself. |
| D8 | Are parts priced, or "on request"? | **Priced**, with a `negotiable` flag and an optional "prix sur demande". |
| D9 | Do pack credits expire? | **Yes — 12 months.** Prepaid credits with no expiry are an open-ended liability. |
| D10 | How long does the verified badge last? | **12 months, renewable.** Admin-set duration per product; revocable at any time. |
| D11 | Can a pack be restricted to one category? | **Not in v3.** One credit = one listing, any category. Category-scoped packs are a `products` column away when you want them. |
| D12 | Refund rule for unused credits? | **No cash refunds; credits are transferable to another listing.** Written into the CGU before the first pack is sold. |

---

## 4. Pricing, packs and the badge

This is the commercial heart of v3 and the part that must be soft (admin-driven)
from day one.

### 4.1 One product table

```
products
  id, slug, kind, name_fr, name_ar, description,
  price,                       -- TND
  category_id      NULL,       -- null = applies to every category
  listing_quota    NULL,       -- packs: how many listings it grants
  duration_days    NULL,       -- listing lifetime / badge validity / promo run
  is_active, sort_order, created_by, created_at, updated_at

  kind ∈ ( 'listing_single'    -- one publication, priced per category (D4)
         | 'listing_pack'      -- N publications, prepaid  (the "many cars" case)
         | 'subscription'      -- unlimited-ish for a period, for agencies
         | 'promo'             -- home feature / top of search / banner
         | 'badge_verified'    -- the paid trust badge
         | 'renewal' )         -- re-publish an expired listing
```

Everything the seller can buy is a row here. The admin screen is a CRUD over
this table — create a pack, change a price, deactivate an offer, all without a
deploy. Prices are never read from code; `app_settings` keeps only non-price
settings.

### 4.2 Credits ledger

```
seller_credits                 -- what a seller owns right now
  id, seller_id, product_id, payment_id,
  quota_total, quota_used, expires_at,        -- D9: 12 months
  status('active'|'exhausted'|'expired'|'revoked'), created_at

credit_ledger                  -- append-only, every movement
  id, seller_credit_id, listing_id NULL, delta, reason, actor_id, created_at
```

**Publication rule**, in order:
1. Seller has an active pack/subscription with quota left → consume 1 credit,
   listing goes to review immediately, no payment step.
2. Otherwise → a `listing_single` payment for that category, existing receipt
   flow (RIB / D17), publish on capture.
3. Admin publishes manually → `fee_waived_by` set, no credit, no payment.

The ledger is append-only so "where did my 5 annonces go?" is always answerable
— that question *will* be asked, and a `quota_used` counter alone cannot answer
it.

### 4.3 The verified badge

```
seller_badges
  id, seller_id, kind('verified'), product_id, payment_id,
  granted_by, granted_at, expires_at, revoked_at, revoke_reason, note
```

- The seller buys it (price from `products`, admin-controlled).
- **An admin grants it by hand** after whatever check we decide to run — papers,
  a phone call, a visit. The check is a human process, not a code path, which is
  exactly why removing KYC costs us nothing here.
- It renders on the listing, the seller card and search results.
- It **expires** (D10) and can be **revoked** instantly with a reason.
- Revocation is loud: the badge disappears everywhere it is rendered, because
  every surface reads `seller_badges` and not a cached boolean on `profiles`.

---

## 5. Target data model

Naming: `listings` replaces `properties` + `auctions`. A car and a brake pad are
the same object with a different category and different attributes. Do **not**
model parts as a second table — that duplicates search, moderation, payment,
photos and favourites forever.

### New tables

```
categories                -- tree, seeded (see §5.1)
  id, parent_id, slug, label_fr, label_ar, kind('vehicle'|'part'|'other'),
  icon, sort_order, is_active

category_attributes       -- replaces property_attribute_kinds, per category
  id, category_id, field_key, label, data_type, options jsonb, unit,
  required, filterable, sort_order

listings                  -- replaces properties + auctions
  id, seller_id, category_id, title, description,
  price, negotiable, price_on_request, condition('new'|'used'|'refurbished'),
  governorate, delegation, lat, lng,
  attributes jsonb,                       -- validated against category_attributes
  contact_name, contact_phone, contact_whatsapp, show_phone,
  status('draft'|'pending_payment'|'pending_review'|'published'|'rejected'
         |'expired'|'archived'|'sold'),
  rejection_reason, reviewed_by, reviewed_at,
  fee_payment_id, seller_credit_id, fee_waived_by,
  published_at, expires_at, renewed_count,
  seller_attestation_version, seller_attestation_at,   -- from 0147
  view_count, contact_reveal_count,
  search_text, created_at, updated_at

listing_photos            -- rename of property_photos (same shape)
listing_fitments          -- parts only: which vehicles a part fits
  id, listing_id, make, model, year_from, year_to, engine
contact_reveals           -- one row per "afficher le numéro" click
  id, listing_id, user_id NULL, ip_hash, created_at

products                  -- §4.1
seller_credits            -- §4.2
credit_ledger             -- §4.2
seller_badges             -- §4.3
```

### Kept as-is

`profiles` (minus `kyc_status`), `payments`, `notifications`, `app_settings`
(non-price settings only), `activity_log`, `legal_doc_kinds`, `popups`,
`watchlist` (favourites on listings), `rate_limits`, `auth_attempts`,
`phone_otps`, `cron_heartbeat`, `vehicle_diagnostics` (→ `listing_diagnostics`).

### Dropped (auctions archived first, per D5)

`auctions`, `bids`, `bid_private`, `bid_events`, `auction_deposits`,
`auction_presence`, `sixth_offers`, `seller_payouts`, `inspections`,
`inspectors`, `properties`, `property_attribute_kinds`, `property_documents`,
**`kyc_submissions`** (and the private `kyc` storage bucket — purge the objects,
don't just orphan them).

### Enums

- `payment_kind`: **`listing_fee`, `listing_pack`, `subscription`, `promo`,
  `badge`, `renewal`** — one per product kind, so revenue is queryable by line.
  Retire `deposit_lock`, `deposit_release`, `buy_now`, `final_payment`,
  `commission`, `inspection_fee`.
- `property_status` → `listing_status` (values above).
- Delete `auction_status`, `auction_type`, `inspection_status`, **`kyc_status`**.
- `property_type` → replaced by `categories`.
- `user_role`: drop `bank`, `bailiff`, `inspector` (D6).

### DB functions to delete

Auctions: `place_bid`, `place_sixth_offer`, `tick_auctions(_cron)`,
`process_bid_events`, `bids_maintain_count`, `bid_increment`,
`dutch_current_price`, `close_auction_on_purchase`, `cancel_auction_safe`,
`_release_deposits_on_close`, `_reject_banned_bid`, `_reject_banned_deposit`,
`_validate_auction_insert`, `_guard_auction_type_enabled`,
`_on_auction_insert_reset_unscheduled`, `_on_sixth_offer_placed`,
`_stamp_final_payment_due`, `final_payment_interval`,
`process_final_payment_defaults`, `notify_final_payment_due(_cron)`,
`notify_auctions_ending_soon(_cron)`, `am_i_winner`, `is_winner_of`,
`seller_earnings`, `seller_balance`, `request_payout`, `admin_set_payout_status`,
`reverse_settlement`, `batta_commission_rate`.

KYC: `review_kyc`, `admin_set_kyc_status`, `_mirror_kyc_submission`,
`_guard_kyc_submission_self_update`, `_notify_admins_kyc_submitted`,
`_on_kyc_decision_clear_claim`, `_on_kyc_status_change_reset_reminder`,
`notify_kyc_pending_reminder`.

New: `consume_listing_credit(seller, listing)` — atomic, `FOR UPDATE`, writes
the ledger row. This is the one piece of the pricing engine that must be a DB
function: two tabs publishing at once must not spend the same credit twice.

### Cron after the cut

Delete: `tick_auctions`, `process_bid_events`, `batta-ending-soon`,
`batta-final-payment-due`, `process_final_payment_defaults`,
`notify_kyc_pending_reminder`.
Keep: notification drains, cleanups, prunes, `expire_listing_promotions`.
Add: **`expire_listings`** (hourly) — published → expired at `expires_at`, plus a
J-3 notice; **`expire_credits`** (daily, D9); **`expire_badges`** (daily, D10).

---

### 5.1 Category seed

```
Véhicules
  Voitures · Utilitaires · Motos · Camions · Engins
Pièces de rechange
  Moteur · Boîte & transmission · Freinage · Suspension & direction
  Électricité & batterie · Carrosserie & optique · Intérieur
  Pneus & jantes · Filtration & entretien · Accessoires
```

Parts get `condition` (neuf / occasion / reconditionné), `reference` (OEM),
`brand`, and **fitments** (make/model/year range) — the single most important
filter for a parts marketplace, and the reason `listing_fitments` is a table and
not a jsonb blob.

---

## 6. Code inventory

Sizes measured 2026-09-01: 408 files, 61 288 lines, 150 migrations.

### Delete outright (~11 900 lines)

| Path | Lines | Note |
|---|---|---|
| `src/components/auction/**` | 5 658 | BidComposer (1 496), DirectSalePanel, AuctionTerms, SixthOfferForm, PreBidGate… |
| `src/app/[locale]/auctions/**` | 1 835 | detail + bid pages |
| `src/app/api/auctions/**` | 853 | bid, buy-now, deposit, cancel, ics |
| **`src/components/auction/LivenessCheck.tsx`** | **1 121** | KYC liveness — takes `@vladmandic/face-api` (~2 MB) out of the bundle with it |
| **`src/app/[locale]/kyc/**`** | **1 109** | start · id-front · id-back · selfie · processing · status |
| **`src/app/[locale]/admin/kyc-queue/**`** | **733** | |
| **`src/components/kyc/**`, `KYCShell`, `NativeCapture`, `api/admin/kyc`** | **676** | |
| `src/components/inspector/**`, `inspector` pages + API | ~800 | superseded by Diagnostic Mazed |
| `account/{bids,wins}`, `PayoutRequestModal`, `CancelAuctionButton` | ~600 | |
| cron: auctions tick, ending-soon, final-payment-due, kyc-pending | ~300 | |

93 files mention `kyc` — most are a single gate line to delete
(`kycVerified &&`, `kyc_status !== 'verified'`). 47 migrations touch it; they
stay in history, a new migration drops the objects.

Salvage before deleting: `Countdown` (reusable for "expire dans 3 j") and the
shared realtime store in `LiveAuctionFigures` (reusable for live view counts).

### Rewrite

| Area | Today | v3 |
|---|---|---|
| `src/components/sell/SellForm.tsx` (1 959 l) | 2-step property wizard | **catégorie → détails → photos → contact + attestation → publication** (credit or payment). Keep the photo pipeline, resume-on-retry, attestation. Delete every KYC gate. |
| `payment/checkout/**` | 4 payment kinds | Product-driven: single, pack, subscription, promo, badge, renewal. The receipt rail (RIB / D17) is untouched — it becomes the whole business. |
| `src/app/[locale]/admin/**` (9 779 l) | 12 queues | **Add: pricing/products manager, packs, badge grants + revocation, manual listing creation, categories & attributes.** Delete: enchères, cautions, payouts, inspecteurs, KYC queue. |
| `src/components/explore/**` (1 018 l) | car filters | Category switch (Véhicules ⇄ Pièces) + fitment search |
| `(home)/page.tsx` | auction rails | Two rails, categories grid, "récemment publiées" |
| Notifications | 40+ kinds | ~14: listing submitted/approved/rejected/published/expiring/expired/renewed, payment accepted/rejected, pack purchased/low/exhausted, badge granted/expiring/revoked |

### Keep, unchanged

Auth + phone OTP, payments/receipts, notification drains (incl. the new
one-SMS-per-thread rule), popups, legal docs, rate limiting, activity log, admin
shell, image pipeline, `vehicle_diagnostics`, i18n, observability, PWA.

---

## 7. Phases

Each phase is independently shippable and leaves the site working. No phase
mixes schema work with UI work — that is what makes migrations unreviewable.

### Phase 0 — Freeze (½ day)
- No new auctions (UI + DB guard). Existing lots run out or are cancelled.
- **Turn off every KYC gate** so nothing new enters the queue (the code goes in
  Phase 6; the gate goes now).
- Apply the pending migrations **0145–0148** — written but never run.
- ✅ No new auction, no new KYC submission, prod green.

### Phase 1 — Schema foundation (2–3 days)
- Migrations: `categories`, `category_attributes`, `listings`, `listing_photos`,
  `listing_fitments`, `contact_reveals`, enums, RLS, indexes, `expire_listings`,
  category seed.
- Backfill the 62 properties → `listings`.
- No UI change.
- ✅ Every current listing exists in `listings`; RLS proven by a test (anon sees
  published only); rollback script exists.

### Phase 2 — Pricing engine (2–3 days)
- `products`, `seller_credits`, `credit_ledger`, `seller_badges` +
  `consume_listing_credit()` + expiry crons.
- Admin: **Tarifs** screen (CRUD over products: single fees per category, packs,
  subscriptions, promos, badge price), **Crédits** (per seller, ledger view),
  **Badges** (grant / revoke / expiry).
- Seed the current fees as `products` rows so nothing changes commercially on
  the day it ships.
- ✅ An admin can create a "5 annonces / 120 TND" pack and see it priced in the
  DB; a credit can be consumed and the ledger shows it.

### Phase 3 — Selling + moderation (3–4 days)
- New sell wizard on `listings`, consuming a credit when one exists, otherwise
  routing to checkout for a `listing_single`.
- Admin annonces queue + **manual listing creation** (fee waived) — the queue
  shipped with Phase 3; manual creation only landed on 2026-09-02, see the
  progress log.
- ✅ A seller publishes a car AND a part end-to-end, once by paying and once
  from a pack; an admin publishes one manually.

### Phase 4 — Public surfaces (3–4 days)
- `/annonces` (list, filters, fitment search) and `/annonces/[id]` (gallery,
  price, specs, **contact reveal**, diagnostic sheet, seller card + badge,
  report).
- Home rebuilt around the two rails.
- 301s from `/auctions/*`; sitemap + JSON-LD switched to plain offers.
- ✅ A logged-out visitor finds a part by fitment and reaches the seller's
  number; no dead internal links.

### Phase 5 — Account + notifications (2 days)
- "Mes annonces" (active / expiring / expired) with renew; **"Mon forfait"**
  (credits left, expiry, purchase history); badge status.
- Favourites on listings.
- Notification set trimmed to §6.
- ✅ J-3 expiry notice fires on a seeded listing; renewing produces a payment or
  spends a credit; a seller sees their remaining quota.

### Phase 6 — Decommission (2 days)
- Auction tables → `archive` schema; drop auction + KYC functions, triggers,
  cron, enums; **purge the `kyc` storage bucket**.
- Delete the code in §6 (auctions, KYC, inspectors); drop
  `@vladmandic/face-api` from `package.json`.
- ✅ `rg -i "auction|bid|kyc"` returns only archive/migration history; the app
  builds without those directories; the bundle is ~2 MB lighter.

### Phase 7 — Cleanup (1 day)
- Rewrite README, ARCHITECTURE, RUNBOOK, WEBAPP-GUIDE; strip auction and KYC
  chapters. Update the CGU for §4 (credits, no cash refunds, badge revocation).
- Reseed `scripts/seed.mjs` with listings, parts, products.
- Tests: fee resolution, credit consumption (concurrency), fitment matching,
  expiry.

**Total: ~16–20 working days**, excluding decisions and review latency.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| **Removing KYC removes our identity signal.** | Phone verification stays mandatory; every listing is moderated; the attestation (0147) is signed per listing; the paid badge is granted by a human and revocable; a report button ships in Phase 4. |
| **Prepaid credits are a liability.** A seller with 5 unused credits has a claim on us. | Credits expire (D9), the ledger is append-only and auditable, the refund rule (D12) is in the CGU before the first pack is sold. |
| **Double-spend on credits** — two tabs publishing at once. | `consume_listing_credit()` is a `SECURITY DEFINER` function with `SELECT … FOR UPDATE`; never decrement from the client. |
| **The badge becomes meaningless** if it is only a purchase. | It is *sold* but not *granted* by payment: an admin grants it after a real check, and revokes it on the first complaint. Every surface reads `seller_badges` live, never a cached flag. |
| **Silent money paths.** `payments` still accepts retired kinds. | Phase 6 adds a CHECK on `payment_kind`; checkout already redirects unknown kinds. |
| **Contact scraping.** Published phone numbers invite harvesting. | Reveal-on-click + `contact_reveals` log + per-IP rate limit; never render the number in SSR HTML or JSON-LD. |
| **SEO loss** on `/auctions` URLs. | 301s the same day as Phase 4; sitemap regenerated; ids preserved. |
| **Data loss in the backfill.** | Phase 1 is additive; old tables live until Phase 6; every migration ships its rollback. |
| **Two agents in one checkout.** A second Claude session is editing this repo. | Phases are file-scoped; announce the phase in flight; commit before switching. |
| **Migrations 0145–0148 unapplied.** Code already expects `seller_attestation_version` and `vehicle_diagnostics`. | Phase 0 applies them first. |
| **Deleting KYC data is irreversible.** | Export `kyc_submissions` + bucket to cold storage before Phase 6, keep it as long as the law requires, then destroy it deliberately. |

---

## 9. What we keep from v2

- **Manual receipt payments** (RIB + D17 + receipt upload + admin capture) — the
  real payment rail in Tunisia, and it already works. It now carries packs and
  badges too.
- **Diagnostic Mazed** — a better fit for classifieds than for auctions: with
  KYC gone it is one of the two things (with the badge) that separate us from a
  free listings board.
- **Moderation queue + rejection reasons + the seller attestation.**
- **The notification/SMS pipeline** (outbox, drains, per-thread dedupe, caps).
- **The image pipeline** (client compression, HEIC) — parts photos come from the
  same phones.
- **Phone OTP verification** — now the only identity check, so it stays strict.
- **Popups, waitlist, activity log, rate limits, admin shell.**

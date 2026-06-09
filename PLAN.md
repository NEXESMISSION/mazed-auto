# PLAN — Mazed Auto v2 (Car Auctions on the Land Engine)

> Goal: a complete, production-grade **car-auction** platform, built by taking the
> battle-tested **mazed land** codebase as the base and re-skinning its domain from
> real-estate to vehicles — while keeping the black + gold design you love.
>
> Status legend: ☐ todo · ◐ in progress · ☑ done

---

## 0. Why this approach (the reasoning)

- **The engine is the hard part, and land already has it.** mazed land = **120 DB
  migrations**, a tested per-minute auction state machine (scheduled → live →
  extending → ended/sold), proxy bidding, anti-snipe, deposit lock/release, atomic
  close (no double-winners), payments, KYC, notifications, cron, RLS on every table,
  unit tests, and CI. mazed auto = **1 migration** and ~5 API routes — a beautiful
  shell. So we move the *easy* thing (the look) onto the *strong* thing.
- **The design is already in the base.** land's landing page is literally documented
  as *"design language ported from the mazed-auto home feed"* — same black+gold, Plus
  Jakarta Sans, `gradient-gold-text`, `batta-*` tokens. The thing you're attached to
  already lives here.
- **The data model was built to be re-skinned.** A generic `Auction` + a `Property`
  entity whose specs live in an admin-editable `attributes` JSONB (`AttributeKind`
  catalog). Converting to cars = swap the entity + seed data, not rewrite the engine.
- **Your auto translations are a gift.** auto ships `fr.json` **and** `ar.json`, both
  already car-domain. land has only `fr.json` (land-domain). We mine auto's copy.

**Base repo:** mazed land · **Workspace:** `mazed auto v2` (this folder) · **Originals:** untouched.

---

## 1. Workspace & safety setup  ☐

The riskiest mistake here is touching **land's live Supabase DB**. Everything below
makes the new app fully independent first.

1. ☑ Copy land → `mazed auto v2` (excluded `node_modules`, `.next`, `.git`, `.env.local`).
2. ☐ `pnpm install` to heal `node_modules` (pnpm symlinks don't survive a copy).
3. ☐ Fresh `git init` + first commit (new history; land's repo stays the reference).
4. ☐ **Provision a SEPARATE Supabase project for cars** — new project ref, new keys.
   *Decision needed (see §9): do you create it, or do I create it via the Management
   API token in memory?* Until this exists, do **not** run any migration/seed.
5. ☐ Write `.env.local` pointing at the **new** Supabase project (copy shape from
   `.env.example`).
6. ☐ Apply land's 120 migrations to the new (empty) DB → clean schema, zero data.
7. ☐ Gate: `pnpm typecheck`, `pnpm lint`, `pnpm dev` all green on the *unmodified*
   land code before changing a single domain line. This proves the base runs in the
   new environment; every later change is measured against this baseline.

**Working convention:** this is Next.js **16.2.4** (App Router, React 19) — APIs differ
from older Next. Consult `node_modules/next/dist/docs/` before writing framework code.

---

## 2. Data model: Property → Vehicle  ☐

**Decision (see §9): keep DB table names (`properties`, `property_photos`,
`property_attribute_kinds`…) and re-skin only the TS/UI layer, OR do a clean DB rename
to `vehicles`.** Recommendation: **keep table names for now** (a global rename across
120 migrations + RPCs + RLS policy names is high-risk for little near-term gain);
rename the *type and component* layer to `Vehicle`/`VehicleCard`. Revisit a clean DB
rename later as optional polish.

Tasks (assuming the recommended pragmatic path):

1. ☐ `src/lib/types.ts`: `PropertyType` → `VehicleCategory`
   (`sedan|suv|hatchback|pickup|van|coupe|convertible|wagon`); add `FuelType`,
   `Transmission`, `VehicleCondition`. Rename `Property` type → `Vehicle`, keeping the
   same DB column shape; repurpose fields:
   - `type` → `category`
   - keep `attributes` JSONB (now holds make, model, year, mileage, fuel, transmission,
     color, condition, features)
   - `area_sqm/rooms/bathrooms/floor/year_built` → keep columns but stop using them, or
     repoint `year_built`→model year; prefer driving specs through `attributes`.
   - `governorate` → semantic "region" (label only; mechanism unchanged); `address` →
     where the car is.
   - `AuctionWithProperty` → `AuctionWithVehicle` (alias `property`→`vehicle` accessor).
2. ☐ Seed the **car `AttributeKind` catalog** (the admin `/admin/characteristics`
   system already supports this with **no code change**): make (text), model (text),
   year (number), mileage (number, km), fuel (select), transmission (select), color
   (text), condition (select), body type (select), doors, drivetrain, VIN, accident
   history, service records (bool). Source field list from auto's `Vehicle` type.
3. ☐ Replace land's property-type seed (apartment/villa/land…) with vehicle categories
   wherever it's hard-coded (home type pills, sell wizard, filters).
4. ☐ Update `getHomeFeed` / selects in `src/lib/home/feed.ts` to read the vehicle shape.

---

## 3. Auction engine — keep, with small policy tweaks  ☐

Keep verbatim: english/sealed/dutch types, anti-snipe extension, deposit lock/release,
atomic close RPC, cron tick, realtime bid feed, RLS. Only policy knobs change:

1. ☐ **Sixth-offer window ("1/6 surenchère").** This is Tunisian *real-estate auction
   law* — not standard for cars. *Decision (see §9): drop it for cars, or keep behind a
   market flag.* Recommendation: feature-gate OFF for cars (the `sixth_offer_window`
   status + `minSixthOffer` stay in code, just never triggered).
2. ☐ **Deposit %.** land uses 10% (Tunisian property law); auto's model assumes ~5%
   participation deposit. Pick the car-market number and set it in one place.
3. ☐ Re-check bid-increment ladder defaults for car price ranges (cheaper than land).

---

## 4. Land-only features → car equivalents  ☐

| land feature | car mapping | effort |
|---|---|---|
| Inspectors (architect / civil engineer / property lawyer / RE expert) | Vehicle inspectors / certified mechanics; "title lawyer" → registration checker | medium — swap role/speciality enums + copy, flow stays |
| Inspections (standard/full/virtual_live, PDF report) | Pre-sale mechanical inspection / condition report | low — relabel report kinds |
| Legal docs (`titre foncier`, `plan de bornage`, `permis de bâtir`…) | Carte grise / registration, insurance, technical-visit cert, service history, lien check | medium — replace the per-type doc catalog (`/admin/legal-docs`) |
| Partners (banks / agencies / bailiffs) | Dealerships / fleet & leasing / insurance salvage / repo & court sales | low — swap institutional copy + commission tiers |
| KYC (ID + financial proof) | Keep ID verification; "financial proof" → optional, or pre-approval | low–medium |
| `governorate` coverage map | Region/wilaya where the car is located | low — relabel |

---

## 5. Components: Property → Vehicle UI  ☐

1. ☐ `src/components/property/PropertyCard.tsx` → `VehicleCard` (photo, title =
   `year make model`, mileage chip, fuel/transmission badges, price, watchlist heart).
2. ☐ Auction detail page (`/auctions/[id]`): property spec block → vehicle spec block
   (make/model/year/mileage/fuel/transmission/color/condition + features list + photos).
3. ☐ Sell flow (`/sell`, `/sell/[id]/edit`, `/sell/[id]/schedule`): property fields →
   vehicle fields, driven by the new `AttributeKind` catalog.
4. ☐ Explore/listing page (`/properties` → consider routing to `/cars` or `/vehicles`;
   or keep the path and just relabel — *minor decision*), filters (category, make,
   year, mileage, fuel, transmission, price).
5. ☐ Admin: properties queue → vehicles queue (mostly relabel; the moderation flow is
   generic). `/admin/characteristics` already works for car specs.

---

## 6. Landing / home page  ☐

The structure + design are already ported. Work is re-skin, not rebuild:

1. ☐ Swap `PropertyCard` → `VehicleCard` in the home rails.
2. ☐ Replace `PROPERTY_TYPES` pills (apartment/villa/land…) with car categories.
3. ☐ Re-skin copy (hero, how-it-works, trust pillars) from real-estate to cars.
4. ☐ **Optional richer home:** auto has rails land lacks — `HotNowRail`, `VipRail`,
   `ProSellersRail`, `RecommendedRail`, `BudgetTiers`, `CategoryStrip`,
   `ContinueBiddingRail`, `LiveActivityTicker`. *Decision (see §9): port these in, or
   ship land's current (already-good) home first and add rails later.*

---

## 7. Copy / i18n  ☐

1. ☐ Bring auto's `fr.json` + `ar.json` in as the **car-copy source of truth**.
2. ☐ Reconcile against land's message-key namespaces (keys differ; map, don't blind-copy).
3. ☐ Keep land's i18n framework + RTL (Arabic) — already wired.
4. ☐ English (`en.json`): defer unless you want it now (*decision §9*).

---

## 8. Verify & ship  ☐

1. ☐ `pnpm typecheck` + `pnpm lint` clean.
2. ☐ `pnpm test` (vitest unit — money math, guards) + `pnpm test:security`.
3. ☐ `pnpm build` succeeds.
4. ☐ `pnpm dev` + browser-verify: home renders, browse → detail → bid → deposit flow,
   sell wizard, admin queue, KYC. Capture screenshots as proof.

---

## 9. Open decisions for you (blockers marked ★)

1. ★ **Supabase project for cars** — you create it and paste keys, or I provision it via
   the Management API token (in memory)? *(Nothing runs against a DB until this is set.)*
2. **DB table rename** — keep `properties`/etc. and re-skin in code (recommended, fast,
   low-risk), or clean-rename to `vehicles` in the schema (slower, riskier, cleaner)?
3. **Sixth-offer (surenchère)** — drop for cars (recommended) or keep behind a flag?
4. **Deposit %** — what deposit do you want buyers to lock (land=10%, auto assumed ~5%)?
5. **Home richness** — ship land's current home re-skinned first, or also port auto's
   extra rails (VIP / ProSellers / Recommended / BudgetTiers) now?
6. **English** — add `en.json` now, or French + Arabic first?
7. **Listing route name** — keep `/properties`, or rename to `/cars`?

---

## Suggested execution order

§1 (setup + green baseline) → §2 (data model) → §5 (core components) → §6 (home) →
§3 + §4 (engine policy + land-only features) → §7 (copy) → §8 (verify). Each phase ends
on a green typecheck so we never stack breakage.

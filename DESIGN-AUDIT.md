# Mazed Auto v2 — Design Audit (2026-06)

Full audit of design/consistency issues after the land→car re-skin + black+gold theme flip.
Organized into 5 fix-batches (each maps to one of the 5 prompts).

---

## BATCH 1 — Theme color consistency (kill light/blue remnants)

The theme is black+gold via tokens in `src/app/globals.css`. ~34 files still hardcode
light/blue/gray Tailwind classes that bypass tokens and render wrong on dark.

**Replacement mapping:**
- `bg-white` → `bg-surface` · `bg-white/90|85` → `bg-surface/80` · `bg-white/15|40` → `bg-gold/15`
- `bg-zinc-50|100` / `bg-gray-100` → `bg-surface-2` · `bg-zinc-200` → `bg-surface-3`
- `text-black` / `text-zinc-800|900` → `text-foreground` · `text-zinc-500|600|700` → `text-muted`
- `border-zinc-*` / `border-gray-*` / `border-black/[0.07]` → `border-border`
- `bg-blue-*` → `bg-gold` (or class `batta-gold-fill`) · `text-blue-*` → `text-gold`
- inline hex: `#3b82f6`/`#6366f1`/`#0ea5e9`/`#8b5cf6` (auth avatars) → gold/neutral; `#0d1b3d` → `var(--surface)`; `#c9a227` (global-error btn) → `#d4af37`
- KEEP `text-white` on gold/red fills; KEEP `bg-black`/`text-white` in image/lightbox overlays.

**High-priority (visible) files:**
- `src/components/auction/AuctionDesktop.tsx:29` — `CARD = "...border-black/[0.07] bg-white"` → `bg-surface border-border`. **Systematic: every card on the auction detail page uses this.**
- `src/components/layout/TopBar.tsx:65` `bg-white` → `bg-background`
- `src/components/layout/DesktopNav.tsx:72` `bg-white` → `bg-background`
- `src/components/layout/BottomTabBar.tsx:86` `bg-white/90` → `bg-surface/80`
- `src/components/layout/KYCShell.tsx:76` `bg-white/90` → `bg-surface/80`
- `src/components/landing/HeroBanner.tsx:219,228,248` arrows/dots `bg-black/45 ... ring-white/15`, `bg-white/40` → gold/border
- `src/components/landing/TrendingRail.tsx:120,129` `bg-white/90` scroll btns → `bg-surface border border-gold-soft`
- `src/components/landing/HeroShowcase.tsx:128` active dot `bg-white shadow ...255,255,255` → `bg-gold shadow ...212,175,55`
- `src/components/landing/LiveCountdown.tsx:63` broken class `bg-batta-surface-2 text-batta-gold` → `bg-surface-2 text-gold`
- `src/components/auction/PreBidGate.tsx:78` `bg-white` → `bg-surface`
- `src/components/auction/AuctionTerms.tsx:73` `bg-white` → `bg-surface`/`bg-surface-2`
- `src/components/auth/AuthHeroPanel.tsx:64,68` blue hex avatars + `ring-[#0d1b3d]` → gold/border
- `src/components/ui/Pagination.tsx:141,180` `bg-white` → `bg-surface`
- `src/components/property/PropertyMap.tsx:43` `bg-white` footer → `bg-surface`
- `src/app/global-error.tsx:84` btn `#c9a227` → `#d4af37`
- Plus sweep: SellForm (11), ExploreGrid (10), DocumentViewerModal (3), sell/page (5), admin pages, account pages, payment pages. Grep the full set with the BATCH-1 pattern below.

**Grep pattern:** `bg-white|bg-zinc-|bg-gray-|bg-slate-|bg-neutral-|text-zinc-[5-9]|text-gray-[5-9]|bg-blue-[4-9]|text-blue-[5-9]|border-zinc-|text-black|border-black/`

---

## BATCH 2 — Branding & copy (Batta→Mazed Auto, real-estate→car)

~65 user-visible stale strings. Brand mapping: `Batta`→`Mazed Auto`, `batta.tn`→`mazed.tn`,
`immobilier/immobilière`→`automobile`, `bien(s)`→`voiture(s)`, `Agences immobilières`→`Concessionnaires`.

- **Metadata:** `src/app/[locale]/properties/page.tsx:9-15` ("Biens immobiliers aux enchères" → "Voitures aux enchères"; desc lists appartements/villas/terrains → berlines/SUV/citadines); `src/app/[locale]/auctions/[id]/page.tsx:83-84,405` ("Enchère immobilière" → "Enchère automobile").
- **Alt/aria:** `DesktopNav.tsx:76,79` and `SplashScreen.tsx:79` `Batta`→`Mazed Auto`.
- **messages/fr.json (user-visible):** `nav.properties` "Biens"→"Voitures" (10); `pageTitles.properties` (34); `watchlistPage.empty/browseCta` (50,52); `home.guestTitle` (55); `landing.heroTitle/heroSubtitle/trustBar` (71,72,75); `audienceTitle` (108); `home.heroBrandTitle` (192) "enchères immobilières"→"enchères automobiles"; `home.trustEyebrow` "Pourquoi Batta"→"Pourquoi Mazed Auto" (206); `steps.s1Title` (87); `auctionTypesTitle` (96); `buyersBody` (111); `search.placeholder` "Rechercher un bien…"→"…une voiture…" (218); `account.myListingsBody` (277). LEAVE `property.types.*` keys (DB-mapped) — they already have car labels added.
- **Legal:** `contact/page.tsx:6,13` (title + contact@batta.tn); `terms/page.tsx:6`; `privacy/page.tsx:6`; `components/legal/LegalContent.tsx:27,58` ("Batta.tn ... ventes immobilières" → "Mazed Auto ... enchères automobiles").
- **Email/SMS:** `src/app/api/cron/notify-email/route.ts:67,81,85,89,175`; `src/app/api/auth/phone/send/route.ts:111`; `src/lib/email.ts:12` (EMAIL_FROM).
- **Other UI:** `KYCNudgeModal.tsx:99,111,132`; `sell/page.tsx:308` ("Commission Batta"); `partners/page.tsx:45,105`; `admin/AdminSidebar.tsx:72` ("Batta"→"Mazed"); admin notif strings (`manual-payment/route.ts:223`, `inspectors/[id]/approve/route.ts:42`, `admin/payouts/page.tsx:120`, `RejectPaymentForm.tsx:24`); `api/auctions/[id]/ics/route.ts:90,109,125` (UIDs/PRODID).
- LEAVE: DB table `properties`, code identifiers, legal entity "Batta Tunisia SARL", test fixtures.

---

## BATCH 3 — Car domain on the transactional pages

Listing entity = `properties` table (cars); specs in `properties.attributes` (make/model/year/
mileage/fuel/transmission/color/condition). `type` = body category. `governorate` = car's city.

- **Auction detail** `src/components/auction/AuctionDesktop.tsx:110-113,468-486`: spec block shows `Surface`(area_sqm)/`Pièces`(rooms)/`SdB`(bathrooms) with Ruler/BedDouble/Bath icons. → show **year / mileage(km) / fuel / transmission** from `attributes` with car icons (Gauge=mileage, Fuel=fuel, Cog/Settings=transmission, Calendar=year). Update breadcrumb (line 121) and inspection CTA copy (449-453).
- **Sell form** `src/components/sell/SellForm.tsx:35,40`: `TYPES = [apartment,house,villa,land,...]` → car categories `[sedan,suv,hatchback,pickup,van,coupe,convertible,wagon]`; `CANONICAL_KEYS = [area_sqm,rooms,bathrooms,floor,year_built]` → drive car fields via attributes (make/model/year/mileage/fuel/transmission). Add VIN. Relabel governorate field as the car's location/region.
- **Explore** `src/app/[locale]/properties/page.tsx` (metadata) + `src/components/explore/ExploreGrid.tsx:36-45,73-82,111`: `PROPERTY_TYPES` labels apartment/villa… → car body labels; filters `minArea/minRooms` → `minMileage/minYear/fuel/transmission`; facts "Pièces/SdB" → year/mileage/fuel. Update `/api/explore` to accept car filter params.
- **Characteristics admin** `src/app/[locale]/admin/characteristics/CharacteristicsEditor.tsx:35-44` `TYPE_LABELS_FR` → car body labels; the seeded attribute catalog should be the car set (see migration to seed `property_attribute_kinds` for car categories + delete the real-estate rows).

---

## BATCH 4 — Land-only features → car equivalents

- **Inspectors → mechanics** `src/app/[locale]/inspectors/**` + `components/inspector/*`: `InspectorApplyForm` SPECIALITIES `[architect,civil_engineer,real_estate_expert,property_lawyer]` → `[mechanic,diagnostic_center,certified_appraiser,body_shop]`; `BookInspectionForm` KIND_FEES copy ("appartement/villa") → car diagnostics ("OBD/visuel", "mécanique/électrique/carrosserie"); page titles "Inspecteurs agréés" → "Mécaniciens / Centres de diagnostic agréés". (Keep table/route names; change labels + enums.)
- **Legal docs** admin `LegalDocsEditor.tsx`: per-type docs (titre foncier / permis de bâtir / plan de bornage) → car docs (carte grise [req], quitus fiscal/quittance, visite technique, assurance). Seed via migration.
- **Partners** `src/app/[locale]/partners/page.tsx:45,52,67,82,90,105`: "Agences immobilières"→"Concessionnaires & flottes"; "Huissiers" (bailiff/judicial) → remove or → "Organismes de crédit / reprises"; remove the "+1/6 surenchère" perk (line 90).
- **Sixth-offer (surenchère)** — Tunisian real-estate law, N/A to cars. Feature-gate OFF: in `AuctionDesktop.tsx:335-344` + `SixthOfferForm` + bid page, hide the surenchère CTA/section for car listings; auctions go scheduled→live→ended_sold/unsold. Update `AuctionTerms` copy.
- **KYC** stays (domain-neutral). Bank partner track may stay (fleet liquidation) with car copy.

---

## BATCH 5 — Home layout to match the OLD design

OLD home (`mazed auto/web/src/app/[locale]/page.tsx` + `src/components/home/`) is a curated,
rail-heavy editorial layout. NEW (`mazed auto v2/src/app/[locale]/(home)/page.tsx` +
`src/components/landing/`) is a leaner carousel/trending layout. To match OLD:

1. **Section dividers** — recreate `HomeSectionDivider` with live/sold tones (gradient hairline + icon chip + eyebrow/title); group the feed into "Enchères en direct" vs "Récemment vendues".
2. **Restore rails** (port from OLD `components/home/`, feed with v2 data): NewestRibbon (lead), HotNowRail (🔥 most-bid), EndingSoonRail, ProSellersRail, VipRail, RecommendedRail, RecentlyEndedRail.
3. **BrandSlider** — make/brand logo grid after the sold rail.
4. **Desktop hero** — replace HeroShowcase with a DesktopHero-style magazine spread (1 featured 16/10 + 3 runners) on lg+.
5. **CategoryStrip + BudgetTiers** — swap the BrowseByType/BrowseByPrice pill rails for OLD's visual body-type carousel + price-tier cards.
6. **WhyMazed** trust grid (6 pillars) + **DesktopFinalCta** twin buyer/seller pillars.
7. **LiveActivityTicker** as a rich card list (vs the current marquee).
Order to match OLD: hero → NewestRibbon → [LIVE divider] HotNow→EndingSoon→ProSellers→VIP→Recommended→Ticker → [SOLD divider] RecentlyEnded → BrandSlider → Category/Budget → WhyMazed → HowItWorks → DesktopFinalCta → footer.

# The Complete Workflows Guide — Mazed Auto / Batta Land

> Every role, every screen, every button, every state. Verified against the code on 2026-06-12.
> The two twin apps (Mazed Auto = cars, Batta Land = real estate) share the exact same engine;
> only the domain wording differs (carte grise ↔ titre foncier, véhicule ↔ bien, etc.).

---

## 0. The platform in one paragraph

A French-language Tunisian auction marketplace (PWA, mobile-first with separate desktop layouts).
Sellers list items, admin moderates everything, buyers must verify identity (KYC) and lock a
refundable deposit (caution) before bidding. Three auction formats exist (English always on;
Dutch/Sealed admin-toggleable) plus fixed-price direct sales and buy-now. Money never moves
automatically: every payment is a bank transfer or D17 transfer with a receipt photo that an
admin verifies by hand. The platform earns: listing fees, promo placements, inspection fees,
and a commission on sales. A cron "robot" runs the auction state machine every minute.

**Roles:** visitor (anon) → `individual` (default after signup) → optionally elevated to
`agency` / `bank` / `bailiff` (partners), `inspector`, or `admin`. Elevation is server-side only.

---

## 1. Casual visitor (not logged in)

**Homepage `/`** — mobile: hero carousel (5 trending lots + brand slide), live ticker, stats bar,
VIP rail, trending/hot/direct-offers/new/recently-sold rails, browse-by-type and browse-by-price
pills, "how it works" (3 steps), 4 trust pillars, browse-by-make, final CTA. Desktop: magazine
hero (1 large + 3 stacked cards) and 4-column grids. Static + ISR 60s; hearts/login state hydrate
client-side. Every card → `/auctions/[id]`; every pill → pre-filtered `/properties`.

**Explore `/properties`** — debounced search (350ms), segment pills (Tous | Enchères | Direct),
filters: type (8), governorate (24), min/max price, fuel, condition, year range, max km
(land: surface, pièces). 12 per page, numbered pagination. All public.

**Auction detail `/auctions/[id]`** — gallery, price card (current bid / sale price + countdown +
required caution), specs from the admin-defined catalog, description, anonymized seller trust card
("Karim B. · Vendeur professionnel · membre depuis…"), map, share, calendar (.ics), inspection CTA,
legal documents (locked behind KYC + deposit). The main CTA adapts: anon → login; logged-in
non-KYC → /kyc; KYC'd without caution → checkout; registered → bid room.

**Content pages:** /about, /help (6 FAQ sections), /how-it-works, /pricing, /contact, /partners,
/inspectors, /privacy, /terms, /offline (PWA fallback).

**Auth:** /login (email+password OR phone+password via E.164), /signup (full name, email,
password, phone +216, governorate, terms+privacy modals; optional SMS OTP step). Every new
account
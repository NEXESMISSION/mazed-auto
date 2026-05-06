# Mazed Auto

La plateforme intelligente d'enchères automobiles pour la Tunisie. Next.js 16 (App Router, Turbopack) + Supabase + Tailwind v4. Mobile-first, dark + gold, French (fr-TN).

---

## Local development

```bash
pnpm install
cp .env.example .env.local       # fill in your Supabase keys
pnpm dev                         # http://localhost:3000
```

`.env.local` requires three keys (see `.env.example`):

| Key | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key — bypasses RLS, never expose |

Optional: `NEXT_PUBLIC_SITE_URL` for absolute OG/Twitter URLs (Vercel falls back to `VERCEL_URL`).

---

## Database

The Supabase schema, RLS policies, and seed data live in `supabase/`:

```bash
# In Supabase SQL Editor, run in order:
supabase/schema.sql
supabase/migrate-*.sql            # any migrations
supabase/seed.sql                 # 14 sellers, 22 auctions, ~75 bids
```

For programmatic seeding (bypasses RLS via service-role key):

```bash
node scripts/seed.mjs             # smaller subset, idempotent
```

---

## Deploy to Vercel

1. **Import the repo** on https://vercel.com/new — select this Git repository.
2. **Root Directory**: leave blank if the repo root is this `web/` folder; otherwise set it to `web`.
3. **Framework preset**: Next.js (auto-detected).
4. **Environment variables**: copy each from `.env.example` and paste your real Supabase values.
   - Mark `SUPABASE_SERVICE_ROLE_KEY` as a **Secret**.
5. **Build & Output**: Vercel uses the defaults from `package.json` — no extra config needed.
6. Click **Deploy**.

After the first deploy, set `NEXT_PUBLIC_SITE_URL` to your Vercel domain (or custom domain) so `metadataBase` resolves canonical URLs correctly.

---

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server with Turbopack on port 3000 (header limit raised to 64KB to tolerate fat dev cookie sets) |
| `pnpm dev:webpack` | Same but with webpack instead of Turbopack |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build locally |
| `pnpm lint` | ESLint |

---

## Stack

- **Next.js 16** — App Router, Turbopack, React 19
- **Supabase** — Postgres, Auth, RLS, Realtime
- **Tailwind v4** — utility-first styling, custom `--gold`/`--surface` token system
- **Lucide** — icons
- **Cairo** — display font (good for both Latin and Arabic glyphs)

---

## Project structure

```
src/
  app/           # Next.js App Router pages
    auctions/
    auctions/[id]/
    auctions/[id]/bid/
    sellers/
    profile/
    ...
  components/
    auction/     # AuctionCard, BidComposer, HeroCarousel, etc.
    home/        # Hero, RecommendedRail, FeaturedSellers
    layout/      # AppShell, ScreenHeader, BottomTabBar, AuthShell, KYCShell
    ui/          # Button, Input, Modal, Toast, Avatar, Badge
  lib/
    supabase/    # SSR + client wrappers
    types.ts     # shared types
    db.ts        # query helpers
    format.ts    # fr-TN locale formatters
supabase/        # schema + migrations + seed
public/          # static assets, sw.js, icons
scripts/         # seed.mjs runner
```

---

© 2026 Mazed Auto.

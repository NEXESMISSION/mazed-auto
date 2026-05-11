-- ============================================================
-- Tiered fixed-amount entry deposit (PLAN §X — replaces 5%-of-starting).
--
-- New rule per product owner:
--   starting < 20 000 DT   → 500 DT
--   starting < 100 000 DT  → 1 000 DT
--   otherwise              → 2 000 DT
--
-- The tiers live in platform_settings so admins can tune them from
-- the Admin → Settings panel without a deploy. Stored as JSON: an
-- ordered array of { max: number | null, deposit: number }. The seller
-- wizard + server-side `pickDeposit()` helper walk the list in order
-- and stop at the first tier whose `max` exceeds the starting price
-- (or has max=null for the top tier).
--
-- Safe to run multiple times — the upsert only inserts on conflict.
-- ============================================================

insert into public.platform_settings
  (key, value, type, category, description, sensitive, requires_approval)
values
  (
    'auction.deposit.tiers',
    '[
      { "max": 20000,  "deposit": 500  },
      { "max": 100000, "deposit": 1000 },
      { "max": null,   "deposit": 2000 }
    ]'::jsonb,
    'json',
    'auction',
    'Tiered fixed-amount entry deposit, picked by starting price. ' ||
    'Each tier = { max (exclusive ceiling, null = top tier), deposit in DT }. ' ||
    'Walked in order — first matching tier wins. ' ||
    'Replaces the legacy auction.deposit.starting_pct percentage rule.',
    false,
    false
  )
on conflict (key) do nothing;

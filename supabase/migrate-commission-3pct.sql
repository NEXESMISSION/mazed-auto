-- ============================================================
-- Drop the seller commission from 7% to 3% (product owner decision).
--
-- Idempotent — re-running on a DB that's already at 0.03 is a no-op.
-- We *do not* touch the cap (15 000 DT) or the buyer-side rate (0%);
-- those numbers stay as configured.
-- ============================================================

update public.platform_settings
   set value       = '0.03'::jsonb,
       description = 'Seller commission as a fraction (0.03 = 3%)',
       updated_at  = now()
 where key   = 'auction.commission.seller_pct'
   and value <> '0.03'::jsonb;

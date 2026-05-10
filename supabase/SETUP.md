# Supabase setup — apply migrations cleanly

If you've lost track of which migrations you've run, the safest path is to **re-run them all**. Every migration in this folder is idempotent (`create table if not exists`, `create or replace function`, `on conflict do nothing`) — running twice is a no-op.

---

## Option A — one-paste apply (recommended)

1. Open **Supabase SQL editor** for project `erosazbplfhelvxweeyz`.
2. Open `web/supabase/_apply-all.sql` in your editor.
3. Copy the whole file (~240 KB).
4. Paste into a new SQL editor query.
5. Click **Run**.

That's it. The file concatenates every migration in correct dependency order, separated by header comments so you can find where each one starts in the editor if anything errors.

If you add a new `migrate-*.sql` later, regenerate the bundle:

```powershell
pwsh ./web/supabase/_build-apply-all.ps1
```

(Edit the `$order` array in `_build-apply-all.ps1` first to insert the new file at the right position.)

---

## Option B — diagnostic-first

If you'd rather see what's already there before touching anything:

1. Open the SQL editor.
2. Open `web/supabase/_diagnostic.sql`, copy, paste, run.
3. You'll get a list of features with `✓` or `✗ MISSING`.
4. Re-run `_apply-all.sql` (Option A). Re-run the diagnostic to confirm everything is `✓`.

---

## Option C — psql (if you have it installed)

```powershell
$env:PGPASSWORD = "<your-supabase-db-password>"
psql "host=db.erosazbplfhelvxweeyz.supabase.co user=postgres dbname=postgres sslmode=require" `
  -f web/supabase/_apply-all.sql
```

---

## What the bundle includes (in order)

**Pre-existing (19 files):**

```
migrate-platform-settings.sql        — platform_settings table + 27 seed rows
migrate-bid-rules.sql                — handle_new_bid trigger
migrate-bid-rules-config.sql         — bid rules read from settings
migrate-auction-lifecycle.sql        — finalize_auction, end_expired_auctions
migrate-proxy-bid.sql                — auto_bids table + place_auto_bid RPC
migrate-trust-score.sql              — trust score auto-bumps on sale/rating
migrate-kyc-submissions.sql          — kyc_submissions table + review_kyc RPC
migrate-rls-fixes.sql                — RLS adjustments
migrate-rls-admin-fix.sql            — public.is_admin() helper
migrate-admin-trust-override.sql     — admin_adjust_trust RPC + trust_adjustments
migrate-seller-decision.sql          — pending_seller_decision flow
migrate-seller-decision-always.sql   — confirms always-on seller decision
migrate-winner-forfeit.sql           — auction_forfeits + 70/30 split
migrate-messaging.sql                — conversations + messages + RLS
migrate-home-hot-rail.sql            — home rail materialised view
migrate-real-features.sql            — storage bucket + small fixes
migrate-user-activity.sql            — user_activity_log + 4 triggers
migrate-fixes.sql                    — catch-all fixes
migrate-missing.sql                  — catch-all missing pieces
```

**This overhaul (15 files):**

```
migrate-admin-foundations.sql        — 5-role RBAC, admin_audit_log, admin_sessions
migrate-admin-actions.sql            — warnings, bans, edit-requests, broadcasts, contact + 18 RPCs
migrate-admin-financial.sql          — payouts table + 3 RPCs
migrate-admin-users-list.sql         — admin_list_users(), admin_get_user()
migrate-cms.sql                      — pages/faqs/promos/brands/features/cities/notif templates
migrate-notifications-expansion.sql  — kind CHECK widening + user_notification_prefs
migrate-notif-helper.sql             — notify_with_template() helper
migrate-settings-approval.sql        — propose/approve/reject sensitive settings
migrate-admin-team.sql               — admin_list_admins() RPC
migrate-admin-messaging.sql          — read-any-conversation moderation RPCs
migrate-ownership-review.sql         — auctions.ownership_exception column
migrate-fraud-signals.sql            — 4 fraud RPCs
migrate-analytics-rpcs.sql           — funnel, top sellers/bidders, hourly heatmap
migrate-additional-settings.sql      — 17 new platform_settings keys
migrate-admin-sprint-a.sql           — auction_status_log, edit_auction, bulk RPCs, dm, refund
```

---

## After applying — promote your admin

The first admin user is bootstrapped via SQL (no UI for it yet — by design).

```sql
update auth.users
   set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || '{"role":"admin","adminRole":"super_admin"}'::jsonb
 where email = 'YOUR_EMAIL@example.com';
```

Then **sign out and back in** so the JWT picks up the new metadata. Without re-auth, `is_admin()` returns false because the JWT cache hasn't refreshed.

---

## When something errors halfway through

The bundle is built so each `create or replace` / `if not exists` is independent. If one migration errors:

1. Look at the section header right before the error in the SQL editor (`-- File: migrate-XXX.sql`).
2. The error tells you what's wrong (missing column, conflicting type, etc.).
3. Fix the underlying issue (most often: a previous migration didn't run yet, so a referenced object is missing).
4. Re-run the whole bundle. Already-applied migrations skip silently.

If you want to nuke and start over (dev only):

```sql
\i web/supabase/reset.sql
```

Then re-run the bundle.

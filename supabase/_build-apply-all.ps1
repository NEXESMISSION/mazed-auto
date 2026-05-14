# Mazed Auto — generate _apply-all.sql
# Concatenates every migration in dependency order so it can be
# pasted into the Supabase SQL editor in one shot.
#
# Run from the repo root:
#   pwsh ./web/supabase/_build-apply-all.ps1
# Or by double-clicking from File Explorer.

$base = $PSScriptRoot

$order = @(
  # ---------- Pre-existing migrations ----------
  "migrate-platform-settings.sql",
  "migrate-bid-rules.sql",
  "migrate-bid-rules-config.sql",
  "migrate-auction-lifecycle.sql",
  "migrate-proxy-bid.sql",
  "migrate-trust-score.sql",
  "migrate-kyc-submissions.sql",
  "migrate-rls-fixes.sql",
  "migrate-rls-admin-fix.sql",
  "migrate-admin-trust-override.sql",
  "migrate-seller-decision.sql",
  "migrate-seller-decision-always.sql",
  "migrate-winner-forfeit.sql",
  "migrate-messaging.sql",
  "migrate-home-hot-rail.sql",
  "migrate-real-features.sql",
  "migrate-user-activity.sql",
  "migrate-fixes.sql",
  "migrate-missing.sql",
  # ---------- This overhaul (strict dependency order) ----------
  "migrate-admin-foundations.sql",
  "migrate-admin-actions.sql",
  "migrate-admin-financial.sql",
  "migrate-admin-users-list.sql",
  "migrate-cms.sql",
  "migrate-notifications-expansion.sql",
  "migrate-notif-helper.sql",
  "migrate-settings-approval.sql",
  "migrate-admin-team.sql",
  "migrate-admin-messaging.sql",
  "migrate-ownership-review.sql",
  "migrate-fraud-signals.sql",
  "migrate-analytics-rpcs.sql",
  "migrate-additional-settings.sql",
  "migrate-admin-sprint-a.sql",
  "migrate-cms-categories.sql",
  "migrate-admin-forfeits.sql",
  "migrate-cms-plans.sql",
  "migrate-pricing-spec.sql",
  "migrate-cms-plans-v2.sql",
  "migrate-subscription-extras.sql",
  "migrate-subscription-payments.sql",
  "migrate-subscription-public-perks.sql",
  "migrate-auctions-public-rls.sql",
  # ---------- Hot-fixes / config tweaks (post-subscription) ----------
  "migrate-settings-admin-write.sql",
  "migrate-commission-3pct.sql",
  "migrate-deposit-tiers.sql",
  "migrate-remove-toyota-yaris.sql",
  # ---------- Rounds 12-20 hardening passes (chronological) ----------
  # Each addresses a finding from the running deep-audit cycle.
  # Order matters where later migrations reference helpers from earlier
  # ones (e.g. kyc-bid-gate uses is_kyc_verified, notif-kinds-wiring
  # rewires review_kyc which the lifecycle migration then extends).
  "migrate-admin-rbac-hardening.sql",     # round 12 — admin_users table
  "migrate-perf-indexes.sql",             # round 13 — bid/watchlist/auction idx
  "migrate-bid-buynow-hardening.sql",     # round 14 — buy_now race fix + outbid dedup
  "migrate-publish-quota-atomic.sql",     # round 15 — BEFORE INSERT trigger
  "migrate-notif-sub-fixes.sql",          # round 16 — notif RLS + dedup helper
  "migrate-kyc-bid-gate.sql",             # round 17 — is_kyc_verified() pre-check
  "migrate-notif-kinds-wiring.sql",       # round 18 — kyc_approved / rejected / blocked / payment_received
  "migrate-notif-lifecycle-kinds.sql",    # round 19 — reserve_not_met / deposit_refunded / forfeited
  "migrate-notif-final-kinds.sql",        # round 20 — auction_extended / new_report / rating_request
  "migrate-rpc-auth-hardening.sql",       # round 21 — buy_now/forfeit IDOR + bids privacy
  "migrate-admin-role-app-metadata.sql",  # round 22 — admin role into app_metadata + tx privacy
  "migrate-search-path-hardening.sql",    # round 25 — SECURITY DEFINER search_path + auto-bid log
  "migrate-perf-indexes-2.sql",           # round 25 — notifications/tx/messages/kyc FK idx
  "migrate-rls-recursion-fix.sql",        # round 26 — break auctions↔bids RLS cycle
  "migrate-cms-brand-logos.sql",          # round 27 — brand logo upload bucket
  "migrate-manual-payments.sql",          # round 28 — bank-transfer / D17 + admin verify
  "migrate-advisor-security-fixes.sql",   # round 29 — fix 5 Supabase Advisor CRITICALs
  "migrate-auction-publish-gaps.sql"      # round 30 — top_of_search + carte grise URL columns
)

$out = Join-Path $base "_apply-all.sql"
$header = @"
-- ============================================================
-- Mazed Auto - apply-all (generated)
--
-- Concatenation of every migration in correct dependency order.
-- Paste this whole file into the Supabase SQL editor and run.
-- All migrations are idempotent - safe to re-run any time.
-- Regenerate with: pwsh ./web/supabase/_build-apply-all.ps1
-- ============================================================

"@
$header | Set-Content -Path $out -Encoding UTF8

$missing = @()
foreach ($f in $order) {
  $p = Join-Path $base $f
  if (-not (Test-Path $p)) {
    Write-Host "MISSING: $f" -ForegroundColor Red
    $missing += $f
    continue
  }
  $sep = "`n-- ---------------------------------------------------------`n-- File: $f`n-- ---------------------------------------------------------`n"
  Add-Content -Path $out -Value $sep -Encoding UTF8
  Get-Content -Path $p -Raw | Add-Content -Path $out -Encoding UTF8
  Write-Host "OK $f"
}

if ($missing.Count -gt 0) {
  Write-Host ""
  Write-Host "WARNING: $($missing.Count) file(s) missing - bundle is incomplete." -ForegroundColor Yellow
}

$kb = [math]::Round((Get-Item $out).Length / 1024, 1)
Write-Host ""
Write-Host "Wrote $out ($kb KB)" -ForegroundColor Green

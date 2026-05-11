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
  "migrate-auctions-public-rls.sql"
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

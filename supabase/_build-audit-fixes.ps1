# Mazed Auto — generate _audit-fixes.sql
#
# Concatenates ONLY the security/audit hardening migrations from rounds
# 21–25 into a single small file. Use this when you've already applied
# the main bundle previously and just need to ship the latest fixes
# without re-pasting 410 KB into the Supabase SQL editor.
#
# Each migration is idempotent so re-running this file on a database
# that already has all of it is a no-op.
#
# Run from the repo root:
#   pwsh ./web/supabase/_build-audit-fixes.ps1

$base = $PSScriptRoot

$order = @(
  "migrate-rpc-auth-hardening.sql",        # round 21 — buy_now/forfeit IDOR + bids privacy
  "migrate-admin-role-app-metadata.sql",   # round 22 — admin role into app_metadata + tx privacy + settings cap
  "migrate-search-path-hardening.sql",     # round 25 — SECURITY DEFINER search_path
  "migrate-perf-indexes-2.sql"             # round 25 — additional FK indexes
)

$out = Join-Path $base "_audit-fixes.sql"
$header = @"
-- ============================================================
-- Mazed Auto - audit fixes (generated)
--
-- Bundles the security/audit hardening migrations from rounds 21-25
-- into one file. Paste into the Supabase SQL editor and run once.
-- Idempotent - safe to re-run any time.
-- Regenerate with: pwsh ./web/supabase/_build-audit-fixes.ps1
--
-- What this includes:
--   round 21 - buy_now / forfeit_winner_deposit IDOR fixes,
--              bids.user_id privacy (public_bids view +
--              is_top_bidder RPC).
--   round 22 - admin role mirrored into app_metadata,
--              tx_demo_public_read dropped (platform-side
--              transactions no longer publicly readable),
--              settings input length capped server-side.
--   round 25 - SECURITY DEFINER search_path pinning,
--              additional foreign-key indexes for hot queries.
--
-- Prerequisites: the main migration bundle (_apply-all.sql) must
-- already be applied. These are layered fixes on top of the existing
-- schema; they assume admin_users, transactions, bids, etc. exist.
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

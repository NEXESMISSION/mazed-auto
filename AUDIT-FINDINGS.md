# Mazed Auto — Deep Audit Findings (2026-05-11)

Comprehensive security/correctness sweep of the full codebase (Next.js +
Supabase + SQL migrations). Findings are ordered by severity. Every
exploitable bug includes the attack path and a concrete fix.

Legend
- **CRITICAL** — directly exploitable from any authenticated client, causes financial loss or account compromise. Fix immediately.
- **HIGH** — privacy/integrity issue, exploitable but limited impact.
- **MEDIUM** — auth bypass that doesn't reach destructive actions, or correctness bug.
- **LOW** — defensive hardening, residue, dead code.
- **COSMETIC** — style/maintainability.

---

## CRITICAL

### C-1 — `buy_now()` accepts spoofed buyer id (IDOR)

**File:** `supabase/migrate-bid-buynow-hardening.sql` (line 22)
**Function:** `public.buy_now(p_auction_id uuid, p_buyer_id uuid)`

The function is `SECURITY DEFINER` and callable by any authenticated client
via PostgREST RPC. It accepts `p_buyer_id` as a parameter but never checks
`auth.uid() = p_buyer_id`. The only buyer-related check is
`v_seller = p_buyer_id` (prevents the *seller* spoofing themselves), which
doesn't help.

**Attack:**
```js
// Any signed-in user runs this in the browser console:
await supabase.rpc('buy_now', {
  p_auction_id: '<live-auction-uuid>',
  p_buyer_id:   '<victim-uuid>',
});
```
Result: auction closes at buy-now price with the victim recorded as winner.
They now owe a final payment, and their deposit is at risk via the forfeit
deadline. Severe DoS against any live "buy now" listing.

**Fix:** Add an `auth.uid()` guard at the top of the function.

### C-2 — `forfeit_winner_deposit()` accepts spoofed user id (IDOR)

**File:** `supabase/migrate-winner-forfeit.sql` (line 86)
**Function:** `public.forfeit_winner_deposit(p_auction_id, p_user_id, p_reason)`

Same shape as C-1. The function checks the bidder *is* the current top
bidder, but never that the caller *is* `p_user_id`. Any authenticated user
can voluntarily forfeit any other user's deposit, splitting it to the seller
and the platform. The function also writes a notification, an audit row,
and two ledger entries — there's no graceful undo.

**Attack:**
```js
await supabase.rpc('forfeit_winner_deposit', {
  p_auction_id: '<ended-auction>',
  p_user_id:    '<victim-winner-uuid>',
  p_reason:     'voluntary',
});
```
Result: victim loses their deposit, trust score takes a hit, the auction
advances to the next bidder (re-offered). Direct financial loss for the
victim.

**Fix:**
- For `p_reason = 'voluntary'`: require `auth.uid() = p_user_id`.
- For `p_reason = 'payment_deadline_expired'`: only the system sweep
  (`process_expired_payment_deadlines`) should be allowed. Easiest: gate on
  `public.is_admin() OR auth.uid() = p_user_id`, and have the sweep run as
  an explicit admin/service identity (it already runs under `SECURITY
  DEFINER`, but `auth.uid()` inside is still the original caller). Cleaner:
  factor out `_forfeit_internal()` as the unguarded core and have both the
  public RPC and the sweep call it.

---

## HIGH

### H-1 — Bids table leaks `user_id` to anonymous viewers (privacy)

**File:** `supabase/schema.sql` line 268
```sql
create policy "bids_public_read" on public.bids for select using (true);
```

`bids.user_id` is therefore world-readable. Anyone can join `bids` with
sellers/profiles to deanonymise bidders. Mazed Auto's "anonymity" promise
(buyers should not be able to identify sellers, and per-platform-product
the same is implicitly true the other way) is broken.

**Fix:** Replace the policy with a column-aware view or split the SELECT:
- Authenticated user OR seller of the auction → see `user_id`.
- Anonymous / other users → see only `bidder_label, amount, placed_at, auction_id`.

Easiest is a public view `public_bids` that omits `user_id`, plus a tighter
policy on `bids` (owner + seller + admin only).

---

## MEDIUM

### M-1 — Admin gate trusts client-modifiable `user_metadata`

**Files:**
- `src/lib/supabase/proxy.ts:101-117` (middleware admin gate)
- `src/lib/admin.ts:126-137` (`getAdminRole` reads `user_metadata.adminRole`)

Supabase `user_metadata` is **client-modifiable** — any authenticated user
can run `supabase.auth.updateUser({ data: { adminRole: 'super_admin' } })`
from the browser. They will then pass:
1. The Next.js middleware admin gate (renders /admin/* pages).
2. Any server action that uses `getAdminRole(user) + hasCapability(...)`
   to authorize before performing DB work.

**Why this isn't CRITICAL today:** every destructive DB action is further
gated by RLS using the SQL `is_admin()` function, which reads from the
`admin_users` table (server-only). So writes still fail at the DB level —
the attacker sees the admin UI rendered with errors when they try anything.

But the attack surface is real: the attacker can browse the admin UI,
potentially exposing internal labels/structure, and any server action that
*reads* through the cookie-bound client could leak data.

**Fix:** Move `adminRole` to `app_metadata` (only the service role can
write it — already done in `admin_set_role()` migration). Update the
middleware and `getAdminRole()` to read `app_metadata.adminRole`. Drop the
`user_metadata.adminRole` mirror or treat it strictly as a non-auth UI hint.

### M-2 — Demo `tx_demo_public_read` policy on transactions

**File:** `supabase/schema.sql` line ~278
```sql
create policy "tx_demo_public_read" on public.transactions ...
-- demo/system rows (user_id is null) are publicly readable
```

Platform-side rows (`forfeit_fee`, platform commissions, payouts with
`user_id is null` indicating Mazed Auto itself) are world-readable. This
leaks aggregate financial flow and per-auction commission amounts.

**Fix:** Drop the demo policy. Replace with an admin-only SELECT on
`user_id IS NULL` rows.

### M-3 — Settings server action input is unbounded

**File:** `src/app/[locale]/admin/settings/actions.ts`

`rawValue: string` parameter has no length cap. With the admin gate bypass
in M-1, an attacker who reaches `updateSettingAction` could try to push a
multi-MB string — even if RLS blocks the final UPDATE, the parse path runs
first. Low real impact today because RLS blocks the write, but worth a
size cap (1024 chars).

---

## LOW

### L-1 — `console.log` residue in production-bundled modules

Twelve files contain `console.log/.warn/.error` outside an `IS_DEV` guard.
Most are intentional error reporting (`db.ts`, `error.tsx` boundaries),
but the following could be silenced or gated:
- `src/lib/imageCompress.ts` lines 7, 17
- `src/lib/kycDraft.ts` line 12
- `src/lib/upload.ts` lines 9, 19
- `src/components/auction/NativeCapture.tsx` lines 15, 25
- `src/components/auction/LivenessCheck.tsx` lines 23, 33, 43
- `src/components/layout/PullToRefresh.tsx` line 11
- `src/components/layout/SideSwipeNav.tsx` line 10

Most are already wrapped in dev-mode guards; sweep to confirm.

### L-2 — Stale TODO markers (3)

- `src/lib/payments/index.ts:65` — Clictopay (STB) provider stub.
- `src/app/[locale]/verify-phone/page.tsx:140` — simulation placeholder.
- `src/app/[locale]/admin/settings/actions.ts:28` — internal audit note,
  already resolved (the very TODO it references). Drop the stale comment.

### L-3 — `payment/record` route trusts amount from client

**File:** `src/app/api/payment/record/route.ts`

The route does validate amount range (1..10M DT) and type enum — that's
good. But the **canonical amount** for a deposit/final payment lives on
the auction row and is never cross-checked. A buyer who is supposed to pay
the participation deposit (e.g. 1000 DT) could send `{ amount: 1 }` and
the ledger would record 1 DT.

This is "by design" today because the fake-card UI is honour-system, but
once Konnect goes live the webhook also doesn't cross-check. Worth a
follow-up to derive `amount` server-side from the auction/plan and ignore
the client value.

### L-4 — Idempotency `ref` accepted from client

Same file. The client picks the `ref` — if a malicious client picks an
existing ref from a different user (somehow obtained), they'd hit the
"ref belongs to a different user" 409 branch, which is fine. But the
unique index on `ref` will eventually be a hot row of conflicts if a
malicious client floods random refs. Worth a server-derived ref
(`gen_random_uuid()`) and using the client ref only as an idempotency
*hint*.

---

## COSMETIC

### X-1 — Stale comment in `migrate-settings-admin-write.sql`
Says "Without this, the admin settings panel doesn't work." The bug it
references is fixed; the comment is now historical context, which is OK.
No action.

### X-2 — Header in `_apply-all.sql` uses straight dashes
The generated bundle is fine; this is just a docs nit.

---

## Items audited and CLEAN

- **RLS coverage** — 0 tables found with no `enable row level security`.
- **Service-role clients** — 3 routes (`/api/dev/verify-phone`,
  `/api/payment/record`, `/api/payments/konnect/webhook`) all guard with
  `getUser()` first or use Konnect signature verification.
- **Swallowed errors** — every catch block either logs or returns a
  structured error.
- **`dangerouslySetInnerHTML`** — no instances with user input.
- **SQL `is_admin()` / `admin_role()`** — read from `admin_users` table
  (not metadata) so the SQL authorization layer is secure.
- **Anti-sniping race** — `handle_new_bid` uses `select … for update` row
  lock, no double-extend race.
- **`buy_now` double-fire** — fixed in round 14 (already has status guard).
- **Subscription state machine** — `pending_payment → active` transition
  is gated by Konnect webhook signature; simulation path is dev-only.

---

## Suggested commit order

1. **Fix C-1 + C-2** — single migration `migrate-rpc-auth-hardening.sql`
   gating `buy_now` and `forfeit_winner_deposit` on `auth.uid()`. (This commit.)
2. **Fix H-1** — migration `migrate-bid-privacy.sql` replacing
   `bids_public_read` with an owner/seller/admin policy + `public_bids` view.
3. **Fix M-1** — refactor admin gate to read `app_metadata`, add SQL
   `is_admin()` server-call as a backstop.
4. **Fix M-2, M-3** — settings hardening + tx privacy policy.
5. **L-1 through L-4** — cleanup pass.

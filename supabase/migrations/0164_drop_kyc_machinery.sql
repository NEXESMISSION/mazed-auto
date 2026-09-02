-- ============================================================================
-- v3 PHASE 6 — remove the KYC machinery, keep the evidence.
--
-- The code is gone (this migration ships with the commit that deletes ~3 640
-- lines and the face-api bundle). What remains in the database is the machinery
-- that acted on it: 8 functions and 4 triggers that fire on a table nothing
-- writes to any more, and an admin RPC that grants a status nothing reads.
-- Dead machinery is worse than no machinery: it looks live to the next person
-- who greps for it.
--
-- ── WHAT THIS DELETES ──
--   * the 8 kyc_* functions and the 4 triggers on kyc_submissions
--   * nothing else
--
-- ── WHAT THIS DELIBERATELY LEAVES ALONE ──
--   * `kyc_submissions` (2 rows) and the private `kyc` bucket (8 objects)
--   * `profiles.kyc_status` and the `kyc_status` enum
--
-- Those hold CIN images and selfies of real people. Deleting them is
-- irreversible, it is a data-protection decision rather than an engineering
-- one, and PIVOT-PLAN.md says to export to cold storage first and destroy
-- deliberately. `scripts/purge-kyc-data.mjs` does exactly that, dry-run by
-- default — it is one command away when the owner says so.
--
-- Dropping the functions first is safe on its own: with the triggers gone, the
-- rows simply sit there, readable by admins, writable by nobody.
-- ============================================================================

drop trigger if exists guard_kyc_submission_self_update on public.kyc_submissions;
drop trigger if exists kyc_decision_clear_claim        on public.kyc_submissions;
drop trigger if exists mirror_kyc_submission           on public.kyc_submissions;
drop trigger if exists on_kyc_submitted_admin          on public.kyc_submissions;

drop function if exists public._guard_kyc_submission_self_update()   cascade;
drop function if exists public._mirror_kyc_submission()              cascade;
drop function if exists public._notify_admins_kyc_submitted()        cascade;
drop function if exists public._on_kyc_decision_clear_claim()        cascade;
drop function if exists public._on_kyc_status_change_reset_reminder() cascade;
drop function if exists public.admin_set_kyc_status(uuid, text)      cascade;
drop function if exists public.notify_kyc_pending_reminder()         cascade;
drop function if exists public.review_kyc(uuid, text, text)          cascade;

-- The reminder cron, if it was ever scheduled under either name.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname)
      from cron.job
     where command ilike '%kyc%';
  end if;
end $$;

comment on table public.kyc_submissions is
  'RETIRED (v3). Nothing reads or writes this. Kept only until the owner decides to destroy the ID images it points at — see scripts/purge-kyc-data.mjs.';

notify pgrst, 'reload schema';

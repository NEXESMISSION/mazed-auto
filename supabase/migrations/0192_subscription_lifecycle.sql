-- ============================================================================
-- What happens as time passes: periods end, grace runs out, plans shrink,
-- boosts lapse. Nothing is ever deleted (recette 7).
--
-- `expire_subscriptions()`, hourly:
--   * J-7 and J-1 — the owner is told, once each, when the shop's LAST period
--     is about to end (a period already bought to follow it means no warning);
--   * ends_at reached → 'grace': the annonces stay up, nothing new goes out
--     (`shop_current_subscription` already ignores a period past its end);
--   * grace_ends_at reached → 'expired', and if no later period exists the
--     shop's live annonces are PAUSED — `status = 'paused'`, why
--     (`paused_reason = 'subscription_expired'`) and from what
--     (`paused_from`). They keep everything; a new paid period brings them
--     back (0191, `_resume_shop_listings`);
--   * a shop whose CURRENT period allows fewer live annonces than it has —
--     the plan was changed for a smaller one — has the oldest surplus paused
--     (`over_limit`). The owner then picks which to keep from the dashboard:
--     pausing one frees a place, resuming another takes it.
--
-- `expire_boosts()`, every 15 minutes: a boost past its 7 days ends and the
-- annonce loses « Sponsorisé » (recette 11).
--
-- `pause_shop_listing()` / `resume_shop_listing()` are the owner's two moves,
-- called by /api/pro/listings/[id]/pause|resume after the route has checked
-- membership. Resuming goes through the quota trigger like any publication.
-- ============================================================================

alter table public.subscriptions
  add column if not exists warned_7d_at timestamptz,
  add column if not exists warned_1d_at timestamptz;

create or replace function public.expire_subscriptions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r          record;
  v_owner    uuid;
  v_warned   int := 0;
  v_grace    int := 0;
  v_expired  int := 0;
  v_paused   int := 0;
  v_live     int;
  v_limit    int;
  v_bucket   text;
begin
  -- ── Warnings: the shop's last period, 7 days and 1 day before its end ──
  for r in
    select s.*
      from public.subscriptions s
     where s.status = 'active'
       and s.ends_at > now()
       and s.ends_at <= now() + interval '7 days'
       and not exists (
         select 1 from public.subscriptions n
          where n.shop_id = s.shop_id and n.id <> s.id
            and n.status in ('active', 'grace') and n.ends_at > s.ends_at
       )
     for update of s skip locked
  loop
    select owner_id into v_owner from public.shops where id = r.shop_id;
    if r.ends_at <= now() + interval '1 day' and r.warned_1d_at is null then
      perform public.enqueue_notification(v_owner, 'subscription_ending', 'Votre abonnement se termine demain',
        'Renouvelez-le pour que vos annonces restent en ligne et que vous puissiez en publier de nouvelles.',
        '/pro/dashboard/abonnement');
      update public.subscriptions set warned_1d_at = now(), warned_7d_at = coalesce(warned_7d_at, now()) where id = r.id;
      v_warned := v_warned + 1;
    elsif r.warned_7d_at is null then
      perform public.enqueue_notification(v_owner, 'subscription_ending', 'Votre abonnement se termine dans 7 jours',
        format('Il prend fin le %s. Renouvelez-le depuis votre espace pro.', to_char(r.ends_at, 'DD/MM/YYYY')),
        '/pro/dashboard/abonnement');
      update public.subscriptions set warned_7d_at = now() where id = r.id;
      v_warned := v_warned + 1;
    end if;
  end loop;

  -- ── End of period → grace ──
  update public.subscriptions set status = 'grace'
   where status = 'active' and ends_at <= now();
  get diagnostics v_grace = row_count;

  -- ── End of grace → expired, and the shop's annonces paused ──
  for r in
    select s.*
      from public.subscriptions s
     where s.status = 'grace' and s.grace_ends_at <= now()
     for update skip locked
  loop
    update public.subscriptions set status = 'expired' where id = r.id;
    v_expired := v_expired + 1;

    if not exists (
      select 1 from public.subscriptions n
       where n.shop_id = r.shop_id and n.status in ('active', 'grace') and n.grace_ends_at > now()
    ) then
      with paused as (
        update public.listings
           set paused_from   = status::text,
               status        = 'paused',
               paused_reason = 'subscription_expired',
               paused_at     = now()
         where shop_id = r.shop_id
           and status in ('published', 'pending_review')
        returning 1
      )
      select count(*) into v_live from paused;
      v_paused := v_paused + v_live;

      select owner_id into v_owner from public.shops where id = r.shop_id;
      perform public.enqueue_notification(v_owner, 'subscription_expired', 'Abonnement expiré',
        format('%s annonce(s) de votre boutique sont en pause. Rien n''est supprimé : elles reviennent dès le renouvellement.', v_live),
        '/pro/dashboard/abonnement');
    end if;
  end loop;

  -- ── A current period smaller than what is live → pause the oldest surplus ──
  for r in
    select sh.id as shop_id, sh.activity_type, sub.limits
      from public.shops sh
      join lateral (
        select s.limits from public.subscriptions s
         where s.shop_id = sh.id and s.status in ('active', 'grace')
           and s.starts_at <= now() and now() < s.ends_at
         order by (s.limits ->> 'vehicles')::int desc limit 1
      ) sub on true
     where sh.status = 'active'
  loop
    v_bucket := case when r.activity_type = 'pieces_auto' then 'parts' else 'vehicles' end;
    v_limit := coalesce((r.limits ->> v_bucket)::int, 0);
    select count(*) into v_live
      from public.listings
     where shop_id = r.shop_id and status in ('published', 'pending_review');
    if v_live > v_limit then
      with surplus as (
        select id from public.listings
         where shop_id = r.shop_id and status in ('published', 'pending_review')
         order by coalesce(published_at, created_at) asc
         limit v_live - v_limit
      )
      update public.listings l
         set paused_from = l.status::text, status = 'paused',
             paused_reason = 'over_limit', paused_at = now()
        from surplus where l.id = surplus.id;
      v_paused := v_paused + (v_live - v_limit);
    end if;
  end loop;

  return jsonb_build_object('warned', v_warned, 'grace', v_grace, 'expired', v_expired, 'paused', v_paused);
end;
$$;

revoke all on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;

create or replace function public.expire_boosts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.boosts set status = 'expired'
   where status = 'active' and ends_at <= now();
  get diagnostics v_n = row_count;
  update public.listings set sponsored_until = null
   where sponsored_until is not null and sponsored_until <= now();
  return v_n;
end;
$$;

revoke all on function public.expire_boosts() from public, anon, authenticated;
grant execute on function public.expire_boosts() to service_role;

-- ── The owner's two moves ───────────────────────────────────────────────────

create or replace function public.pause_shop_listing(p_listing uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.listings
     set paused_from   = status::text,
         status        = 'paused',
         paused_reason = 'owner',
         paused_at     = now()
   where id = p_listing
     and status in ('published', 'pending_review');
  get diagnostics v_n = row_count;
  return case when v_n > 0 then 'paused' else 'not_pausable' end;
end;
$$;

create or replace function public.resume_shop_listing(p_listing uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.listings;
begin
  select * into v_l from public.listings where id = p_listing for update;
  if v_l.id is null or v_l.status <> 'paused' then
    return 'not_paused';
  end if;
  -- The quota trigger decides; its refusal reaches the route as an error.
  update public.listings
     set status        = case
                           when v_l.paused_from = 'published' and coalesce(v_l.expires_at > now(), false)
                             then 'published'::listing_status
                           when v_l.paused_from = 'published' then 'expired'::listing_status
                           else 'pending_review'::listing_status
                         end,
         paused_reason = null,
         paused_at     = null,
         paused_from   = null
   where id = p_listing;
  return 'resumed';
end;
$$;

revoke all on function public.pause_shop_listing(uuid) from public, anon, authenticated;
revoke all on function public.resume_shop_listing(uuid) from public, anon, authenticated;
grant execute on function public.pause_shop_listing(uuid) to service_role;
grant execute on function public.resume_shop_listing(uuid) to service_role;

-- ── Schedules ───────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('expire_subscriptions')
      where exists (select 1 from cron.job where jobname = 'expire_subscriptions');
    perform cron.schedule('expire_subscriptions', '5 * * * *', 'select public.expire_subscriptions();');
    perform cron.unschedule('expire_boosts')
      where exists (select 1 from cron.job where jobname = 'expire_boosts');
    perform cron.schedule('expire_boosts', '*/15 * * * *', 'select public.expire_boosts();');
  end if;
end $$;

notify pgrst, 'reload schema';

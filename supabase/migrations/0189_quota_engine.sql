-- ============================================================================
-- How many annonces may be live at once — enforced by the database.
--
-- THE RULE (D-P1, the brief).
--   A person, for their own annonces: 1 vehicle and 5 parts at a time, free.
--   A shop: what its current subscription period allows, in the bucket of its
--   activity — vehicles for vente_auto / location_auto, parts for pieces_auto.
--   Both numbers live in data: `app_settings.personal_limits` and the period's
--   copy of its plan's `limits`.
--
-- WHAT "LIVE" MEANS. An annonce draws on the quota while it is
-- 'pending_review' or 'published'. Drafts, unpaid, rejected, expired,
-- archived, paused and sold annonces do not — a shop can prepare a hundred
-- drafts on a ten-annonce plan; it cannot have eleven in front of buyers.
-- Counting 'pending_review' is not optional: otherwise anyone could queue
-- unlimited annonces and let moderation publish them past the limit.
--
-- WHERE. `_listings_quota`, a trigger, on every transition INTO a live state
-- and on every move of a live annonce between personal and shop. Not in the
-- routes: since lot 0 every write path ends at this table, and a rule kept in
-- one route is a rule the next route forgets. The routes read
-- `listing_quota_status()` first only to answer with a sentence instead of an
-- error code.
--
-- Concurrency: the check and the write happen under an advisory lock on the
-- seller (personal) or the shop, so two submissions arriving together cannot
-- both take the last place.
--
-- Not re-checked: annonces already live when this lands. The trigger looks at
-- transitions, so nothing published today is pulled down by a rule that did
-- not exist when it was published.
--
-- Exempt: annonces an admin published by hand (`fee_waived_by`), and admins.
--
-- Also here, the D-P1 switch: `personal_limits.free`. While it is true a
-- personal annonce within its limit is published for nothing; set it to false
-- and the routes go back to the per-annonce fee, limits still applying. That
-- is why the per-annonce products are deactivated rather than deleted.
-- ============================================================================

insert into public.app_settings (key, value, description)
values
  ('personal_limits', '{"vehicles": 1, "parts": 5, "free": true}',
   'Annonces personnelles en ligne à la fois (en vérification ou publiées), et si elles sont gratuites. D-P1.'),
  ('pro_grace_days', '7',
   'Jours de grâce après la fin d''un abonnement : les annonces restent en ligne, rien de nouveau ne part.'),
  ('pro_shops', '{"enabled": false}',
   'Interrupteur général des pages boutiques et de l''espace pro. Les données existent même éteint.')
on conflict (key) do nothing;

-- Publishing a personal annonce is free now (D-P1), so the per-annonce prices
-- would only mislead on /tarifs. Deactivated, not deleted: switching
-- `personal_limits.free` off brings the fee path back once these are re-enabled
-- in /admin/offres.
update public.products
   set is_active = false
 where slug in ('annonce-standard', 'renouvellement')
   and is_active;

-- ── The count ───────────────────────────────────────────────────────────────

create or replace function public.listing_quota_status(
  p_seller       uuid,
  p_shop         uuid,
  p_listing_type text,
  p_exclude      uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts  boolean := p_listing_type = 'pieces_auto';
  v_bucket text    := case when p_listing_type = 'pieces_auto' then 'parts' else 'vehicles' end;
  v_cfg    jsonb;
  v_sub    public.subscriptions;
  v_limit  int;
  v_used   int;
begin
  if p_shop is null then
    select value into v_cfg from public.app_settings where key = 'personal_limits';
    v_limit := greatest(coalesce((v_cfg ->> v_bucket)::int, case when v_parts then 5 else 1 end), 0);
    select count(*) into v_used
      from public.listings
     where seller_id = p_seller
       and shop_id is null
       and status in ('pending_review', 'published')
       and (listing_type = 'pieces_auto') = v_parts
       and id is distinct from p_exclude;
    return jsonb_build_object(
      'scope', 'personal', 'bucket', v_bucket,
      'limit', v_limit, 'used', v_used, 'remaining', greatest(v_limit - v_used, 0),
      'free', coalesce((v_cfg ->> 'free')::boolean, true)
    );
  end if;

  v_sub := public.shop_current_subscription(p_shop);
  v_limit := greatest(coalesce((v_sub.limits ->> v_bucket)::int, 0), 0);
  select count(*) into v_used
    from public.listings
   where shop_id = p_shop
     and status in ('pending_review', 'published')
     and (listing_type = 'pieces_auto') = v_parts
     and id is distinct from p_exclude;
  return jsonb_build_object(
    'scope', 'shop', 'bucket', v_bucket,
    'limit', v_limit, 'used', v_used, 'remaining', greatest(v_limit - v_used, 0),
    'has_subscription', v_sub.id is not null,
    'subscription_ends_at', v_sub.ends_at
  );
end;
$$;

revoke all on function public.listing_quota_status(uuid, uuid, text, uuid) from public;
grant execute on function public.listing_quota_status(uuid, uuid, text, uuid) to service_role;

-- ── The check ───────────────────────────────────────────────────────────────

create or replace function public._listings_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live     boolean := new.status in ('pending_review', 'published');
  v_entering boolean;
  v_moving   boolean;
  v_shop     text;
  v_q        jsonb;
begin
  if not v_live then
    return new;
  end if;
  v_entering := tg_op = 'INSERT' or old.status not in ('pending_review', 'published');
  v_moving   := tg_op = 'UPDATE' and not v_entering
                and (new.shop_id is distinct from old.shop_id
                     or new.listing_type is distinct from old.listing_type);
  if not (v_entering or v_moving) then
    return new;
  end if;

  if new.fee_waived_by is not null or public.is_admin() then
    return new;   -- published by hand by an admin
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('listing-quota:' || coalesce(new.shop_id, new.seller_id)::text, 0)
  );

  if new.shop_id is not null then
    select status into v_shop from public.shops where id = new.shop_id;
    if v_shop is distinct from 'active' then
      raise exception 'shop_not_active'
        using errcode = 'P0001', hint = 'The shop must be active to put annonces online.';
    end if;
  end if;

  v_q := public.listing_quota_status(new.seller_id, new.shop_id, new.listing_type, new.id);

  if new.shop_id is not null and not coalesce((v_q ->> 'has_subscription')::boolean, false) then
    raise exception 'subscription_required'
      using errcode = 'P0001', detail = v_q::text,
            hint = 'The shop has no current subscription period.';
  end if;

  if (v_q ->> 'used')::int >= (v_q ->> 'limit')::int then
    raise exception 'quota_exceeded'
      using errcode = 'P0001', detail = v_q::text,
            hint = format('Limit of %s live %s reached.', v_q ->> 'limit', v_q ->> 'bucket');
  end if;

  return new;
end;
$$;

drop trigger if exists _listings_quota on public.listings;
create trigger _listings_quota
  before insert or update on public.listings
  for each row execute function public._listings_quota();

notify pgrst, 'reload schema';

-- ============================================================================
-- The three `agency` accounts become shops (D-P4).
--
-- Today they hold every vehicle on the site — 62 live annonces, 20 to 22 each —
-- as personal annonces. Under 0189 a person may have one live vehicle, so
-- without this they could not renew a single car on 1 November, when all 62
-- expire. Each account gets:
--
--   * a `vente_auto` shop, ACTIVE (it is already trading on the site) and
--     UNVERIFIED — no badge until an admin has checked the business; the
--     badge is earned, never granted by migration;
--   * its owner as member;
--   * a Business period of 90 days, given (`reason = 'migration'`), so nothing
--     goes offline and nobody pays while shops are being built;
--   * its vehicle annonces attached to the shop. Status, dates and paid
--     duration are untouched; only `shop_id` changes. Part annonces stay
--     personal: a car-sales shop publishes vehicles.
--
-- Written as a function and called once below, so it can be re-run safely (an
-- account that already has a shop is skipped) and exercised by the tests.
-- Every shop and period lands in audit_logs through their triggers.
-- ============================================================================

create or replace function public.backfill_agency_shops()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  v_name    text;
  v_gov     text;
  v_base    text;
  v_slug    text;
  v_n       int;
  v_shop    uuid;
  v_plan    public.products;
  v_grace   int;
  v_created int := 0;
begin
  select * into v_plan from public.products where plan_code = 'business';
  if v_plan.id is null then
    raise exception 'business_plan_missing' using errcode = 'P0002';
  end if;
  select coalesce((value #>> '{}')::int, 7) into v_grace from public.app_settings where key = 'pro_grace_days';
  v_grace := coalesce(v_grace, 7);

  for r in
    select p.id, p.full_name, p.phone, p.governorate
      from public.profiles p
     where p.role = 'agency'
       and p.deleted_at is null
       and not exists (
         select 1 from public.shops s where s.owner_id = p.id and s.status <> 'closed'
       )
     order by p.created_at
  loop
    v_name := coalesce(nullif(btrim(r.full_name), ''), 'Boutique');

    -- « Auto Deal · Tunis » names its town after the dot. Otherwise the
    -- profile's governorate, otherwise where most of its annonces are.
    v_gov := nullif(btrim(split_part(v_name, '·', 2)), '');
    v_gov := coalesce(
      v_gov,
      nullif(btrim(r.governorate), ''),
      (select l.governorate from public.listings l
        where l.seller_id = r.id and l.governorate <> 'Tunisie'
        group by l.governorate order by count(*) desc, l.governorate limit 1),
      'Tunis'
    );

    -- A slug from the name: accents folded, everything else a hyphen.
    v_base := lower(translate(v_name,
      'ÀÂÄÁÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝàâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
      'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy'));
    v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
    v_base := left(v_base, 50);
    v_base := btrim(v_base, '-');
    if length(v_base) < 3 then
      v_base := 'boutique-' || left(replace(r.id::text, '-', ''), 8);
    end if;
    v_slug := v_base;
    v_n := 1;
    while exists (select 1 from public.shops where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;

    insert into public.shops
      (owner_id, activity_type, slug, name, governorate, phone, status, verification_status)
    values
      (r.id, 'vente_auto', v_slug, v_name, v_gov, r.phone, 'active', 'unverified')
    returning id into v_shop;

    insert into public.shop_members (shop_id, user_id, role)
    values (v_shop, r.id, 'owner');

    insert into public.subscriptions
      (shop_id, product_id, limits, status, starts_at, ends_at, grace_ends_at, reason)
    values
      (v_shop, v_plan.id, v_plan.limits, 'active', now(), now() + interval '90 days',
       now() + interval '90 days' + make_interval(days => v_grace), 'migration');

    -- `updated_at` is left alone, as in 0187: this is bookkeeping, not the
    -- seller editing 22 annonces today.
    alter table public.listings disable trigger _touch_listings;
    update public.listings
       set shop_id = v_shop
     where seller_id = r.id
       and shop_id is null
       and listing_type = 'vente_auto';
    alter table public.listings enable trigger _touch_listings;

    insert into public.audit_logs (entity, entity_id, action, after, reason)
    values ('shop', v_shop, 'migrated_from_agency',
            jsonb_build_object('owner_id', r.id, 'slug', v_slug, 'plan', 'business', 'days', 90),
            'D-P4 : compte agence converti en boutique, 90 jours Business offerts');

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.backfill_agency_shops() from public;

select public.backfill_agency_shops();

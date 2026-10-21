-- ============================================================================
-- `reveal_listing_contact()` gets the protections of the route it stands in for.
--
-- 0180 gave the native app a way to the seller's number without granting the
-- column, and it is executable by `anon` — it has to be, the app browses
-- signed out. But it skipped everything `/api/annonces/[id]/contact` does
-- around the disclosure:
--
--   * no rate limit. Published ids are public, so a loop over the catalogue
--     with the anon key from the app bundle returned every number on the site,
--     which is precisely what the column revoke and the route's limit exist to
--     prevent;
--   * no `show_phone` check. A seller who chose to hide their number still had
--     it handed out;
--   * no `contact_reveals` row, so a harvest through this door left no trace
--     in the very table the admin watches for one.
--
-- Now it limits per client IP (40 an hour — the route's number) and per signed-
-- in user, refuses hidden numbers, and logs the reveal.
--
-- THE IP. PostgREST exposes the request headers to SQL. `cf-connecting-ip` is
-- set by Supabase's edge and cannot be supplied by the client; otherwise the
-- LAST `x-forwarded-for` hop is the one the proxy appended. The first hop is
-- never used: it is whatever the client chose to send, and keying a limit on it
-- lets a scraper rotate a fake value per request. (Same reasoning as
-- src/lib/clientIp.ts.)
--
-- The IP is hashed with a random salt kept in Vault, never stored raw. The salt
-- is created here on first run and not otherwise reachable.
-- ============================================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'reveal_ip_salt') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'reveal_ip_salt',
      'Salt for hashing client IPs in reveal_listing_contact (0184). Rotating it only resets rate-limit buckets.'
    );
  end if;
end
$$;

create or replace function public.reveal_listing_contact(p_listing uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers  json;
  v_ip       text;
  v_salt     text;
  v_ip_hash  text;
  v_uid      uuid := auth.uid();
  v_name     text;
  v_phone    text;
  v_whatsapp text;
  v_show     boolean;
begin
  -- Who is asking. Missing or unparsable headers (a direct SQL call) fall back
  -- to one shared bucket rather than to no limit at all.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(v_headers ->> 'cf-connecting-ip'), '');
  if v_ip is null then
    v_ip := nullif(trim(regexp_replace(coalesce(v_headers ->> 'x-forwarded-for', ''), '^.*,', '')), '');
  end if;

  select decrypted_secret into v_salt
    from vault.decrypted_secrets
   where name = 'reveal_ip_salt';
  v_ip_hash := left(
    encode(sha256(convert_to(coalesce(v_salt, '') || ':' || coalesce(v_ip, 'unknown'), 'UTF8')), 'hex'),
    32
  );

  -- Counted before the listing is even looked up, so probing ids costs the
  -- same as reading numbers.
  if public.check_rate_limit('reveal-rpc:ip:' || v_ip_hash, 40, 3600) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  if v_uid is not null
     and public.check_rate_limit('reveal-rpc:user:' || v_uid::text, 40, 3600) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select contact_name, contact_phone, contact_whatsapp, show_phone
    into v_name, v_phone, v_whatsapp, v_show
    from public.listings
   where id = p_listing
     and status = 'published';

  if not found then
    -- The same answer for "no such listing" and "not published", so the
    -- function cannot be used to discover which drafts exist.
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  if not coalesce(v_show, false) or v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'hidden');
  end if;

  -- Best effort: a log or counter that fails must never cost the buyer the
  -- number they asked for.
  begin
    insert into public.contact_reveals (listing_id, user_id, ip_hash)
    values (p_listing, v_uid, v_ip_hash);
    update public.listings
       set contact_reveal_count = coalesce(contact_reveal_count, 0) + 1
     where id = p_listing;
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'name', v_name, 'phone', v_phone, 'whatsapp', v_whatsapp);
end;
$$;

revoke all on function public.reveal_listing_contact(uuid) from public;
grant execute on function public.reveal_listing_contact(uuid) to anon, authenticated, service_role;

comment on function public.reveal_listing_contact(uuid) is
  'Seller name, phone and WhatsApp for a PUBLISHED annonce whose seller shows their number. Rate-limited per client IP and per user (40/h), logged in contact_reveals. Returns {ok:false, reason} = not_available | hidden | rate_limited.';

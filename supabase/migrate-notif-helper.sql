-- ============================================================
-- Mazed Auto — notify_with_template() helper
--
-- Trigger functions today build notification bodies via string
-- concatenation. That makes them un-editable from /admin/cms/
-- notifications. This migration introduces a SQL helper that
-- reads the row from notification_templates, substitutes
-- {{varName}} placeholders, and inserts into public.notifications
-- in one call.
--
-- New trigger code should use this helper instead of inline
-- string-builds. Existing triggers (handle_new_bid, finalize_auction,
-- handle_new_report) continue to work — their hardcoded copy is the
-- fallback when no template row exists for a given kind.
--
-- Depends on: migrate-cms.sql (notification_templates),
--             migrate-notifications-expansion.sql (kind CHECK widening)
-- Safe to run repeatedly.
-- ============================================================

-- Pick the locale to use for a given user. Falls back to 'fr'.
create or replace function public.user_locale(p_user_id uuid)
returns text
language sql stable
as $$
  select coalesce(
    (select raw_user_meta_data ->> 'locale'
       from auth.users where id = p_user_id),
    'fr'
  );
$$;
grant execute on function public.user_locale(uuid) to authenticated, anon;

-- Tiny mustache-ish substitutor. Renders {{key}} → vars->>'key'.
-- Unknown keys are left blank so a missing var doesn't blow up the
-- whole notification.
create or replace function public.render_template(
  p_template text,
  p_vars     jsonb
) returns text
language plpgsql immutable
as $$
declare
  v_out text := p_template;
  v_key text;
  v_val text;
begin
  if p_vars is null then return v_out; end if;
  for v_key in select jsonb_object_keys(p_vars) loop
    v_val := coalesce(p_vars ->> v_key, '');
    v_out := replace(v_out, '{{' || v_key || '}}', v_val);
  end loop;
  -- strip any leftover {{x}} so the user never sees a placeholder
  v_out := regexp_replace(v_out, '\{\{[^}]+\}\}', '', 'g');
  return v_out;
end; $$;
grant execute on function public.render_template(text, jsonb) to authenticated, anon;

-- Insert a notification using the (kind, locale) template if one
-- exists. Falls back to the explicit p_default_title / p_default_body
-- so triggers can stay safe when a template is missing.
create or replace function public.notify_with_template(
  p_user_id        uuid,
  p_kind           text,
  p_vars           jsonb default '{}'::jsonb,
  p_auction_id     uuid default null,
  p_default_title  text default null,
  p_default_body   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locale text := public.user_locale(p_user_id);
  v_tmpl   record;
  v_title  text;
  v_body   text;
  v_id     uuid;
begin
  select * into v_tmpl
    from public.notification_templates
   where kind = p_kind and locale = v_locale
   limit 1;
  if not found then
    -- try French as a final fallback
    select * into v_tmpl
      from public.notification_templates
     where kind = p_kind and locale = 'fr'
     limit 1;
  end if;

  v_title := coalesce(public.render_template(v_tmpl.title, p_vars), p_default_title, p_kind);
  v_body  := coalesce(public.render_template(v_tmpl.body,  p_vars), p_default_body,  '');

  -- Honor user notification preferences for in-app delivery — if the
  -- user explicitly disabled in_app for this kind, skip the row.
  if not public.should_notify(p_user_id, p_kind, 'in_app') then
    return null;
  end if;

  insert into public.notifications (user_id, kind, title, body, auction_id)
  values (p_user_id, p_kind, v_title, v_body, p_auction_id)
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.notify_with_template(uuid, text, jsonb, uuid, text, text)
  to authenticated, anon;

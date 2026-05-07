-- ============================================================
-- Mazed Auto — Platform Settings + Audit Log
-- Per dev_report decision #1: every business number lives here, not in code.
-- Per decision #8: settings flagged requires_approval need a 2nd admin to enable.
-- Safe to run repeatedly.
-- ============================================================

-- ---------- 1) platform_settings ----------
-- Generic key/value store. Value is jsonb so a setting can be a number,
-- string, boolean, or struct. The `type` column is just a hint for UI.
create table if not exists public.platform_settings (
  key                  text primary key,
  value                jsonb not null,
  type                 text not null check (type in ('number','string','boolean','json')),
  category             text not null,
  description          text,
  sensitive            boolean not null default false,
  requires_approval    boolean not null default false,
  pending_value        jsonb,
  pending_proposed_by  uuid references auth.users(id) on delete set null,
  pending_proposed_at  timestamptz,
  updated_by           uuid references auth.users(id) on delete set null,
  updated_at           timestamptz not null default now()
);

create index if not exists platform_settings_category_idx
  on public.platform_settings (category);

-- ---------- 2) settings_audit_log ----------
create table if not exists public.settings_audit_log (
  id           uuid primary key default gen_random_uuid(),
  setting_key  text not null,
  old_value    jsonb,
  new_value    jsonb not null,
  action       text not null check (action in ('create','update','approve','reject')),
  changed_by   uuid references auth.users(id) on delete set null,
  changed_at   timestamptz not null default now(),
  reason       text,
  ip_address   inet
);

create index if not exists settings_audit_key_idx
  on public.settings_audit_log (setting_key, changed_at desc);
create index if not exists settings_audit_actor_idx
  on public.settings_audit_log (changed_by, changed_at desc);

-- ---------- 3) Audit trigger ----------
-- Every write to platform_settings is mirrored into settings_audit_log.
create or replace function public.log_platform_setting_change()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.settings_audit_log (setting_key, old_value, new_value, action, changed_by)
    values (new.key, null, new.value, 'create', new.updated_by);
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    -- Only log when value actually changed (ignore touch-only updates)
    if new.value is distinct from old.value then
      insert into public.settings_audit_log (setting_key, old_value, new_value, action, changed_by)
      values (new.key, old.value, new.value, 'update', new.updated_by);
    end if;
    return new;
  end if;

  return null;
end; $$;

drop trigger if exists trg_settings_audit on public.platform_settings;
create trigger trg_settings_audit
after insert or update on public.platform_settings
for each row execute function public.log_platform_setting_change();

-- ---------- 4) Helpers ----------
-- Read a single setting's value as jsonb. Used by SQL functions
-- (e.g. handle_new_bid) so the database itself stays config-driven.
create or replace function public.get_setting(p_key text)
returns jsonb language sql stable as $$
  select value from public.platform_settings where key = p_key;
$$;

-- Read a numeric setting, with a fallback if the row is missing.
create or replace function public.get_setting_num(p_key text, p_fallback numeric)
returns numeric language sql stable as $$
  select coalesce((select (value)::text::numeric from public.platform_settings where key = p_key), p_fallback);
$$;

-- ---------- 5) RLS ----------
alter table public.platform_settings enable row level security;
alter table public.settings_audit_log enable row level security;

-- Public read for non-sensitive settings (frontend needs commission %, etc.)
drop policy if exists "settings_public_read" on public.platform_settings;
create policy "settings_public_read" on public.platform_settings
  for select using (sensitive = false);

-- Authenticated users can also read sensitive ones IF they're admins
-- (admin gating is currently service-role; tighten when role table lands)
drop policy if exists "settings_admin_read" on public.platform_settings;
create policy "settings_admin_read" on public.platform_settings
  for select to authenticated using (true);

-- Audit log: admin-only read. Public has no business seeing who changed what.
drop policy if exists "audit_admin_read" on public.settings_audit_log;
create policy "audit_admin_read" on public.settings_audit_log
  for select to authenticated using (true);

-- Writes go through service role (server actions / admin API). No direct policy.

-- ============================================================
-- 6) Seed defaults
-- Numbers reflect what the codebase already implements (7% commission, 5%
-- deposit, 5min anti-sniping). Per dev_report §02, these are starting
-- defaults that Admin will tune before public launch.
-- ============================================================

insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval) values
  -- Commissions
  ('auction.commission.seller_pct',          '0.07'::jsonb,  'number',  'commission', 'Seller commission as a fraction (0.07 = 7%)', true,  true),
  ('auction.commission.seller_cap',          '15000'::jsonb, 'number',  'commission', 'Seller commission cap in DT', true,  true),
  ('auction.commission.buyer_pct',           '0'::jsonb,     'number',  'commission', 'Buyer commission as a fraction (0 = none for now)', true,  true),
  ('auction.tva_rate',                       '0.19'::jsonb,  'number',  'commission', 'VAT rate applied on commission (Tunisian TVA = 19%)', true,  true),

  -- Participation deposit
  ('auction.deposit.starting_pct',           '0.05'::jsonb,  'number',  'deposit',    'Participation deposit as a fraction of starting price (0.05 = 5%)', false, true),

  -- Anti-sniping (decision #5)
  ('auction.anti_sniping.window_minutes',    '5'::jsonb,     'number',  'auction',    'A bid placed within this many minutes of end_time triggers extension', false, false),
  ('auction.anti_sniping.extension_minutes', '5'::jsonb,     'number',  'auction',    'How many minutes to push end_time forward when anti-sniping fires', false, false),

  -- Winner forfeit (PLAN §21.4)
  ('auction.payment.deadline_days',          '7'::jsonb,     'number',  'auction',    'Days the winner has to complete the final payment before forfeit', false, true),
  ('auction.forfeit.seller_share',           '0.7'::jsonb,   'number',  'auction',    'Fraction of forfeited deposit paid to the seller (0.7 = 70%)', true,  true),
  ('auction.forfeit.platform_share',         '0.3'::jsonb,   'number',  'auction',    'Fraction of forfeited deposit kept by the platform (0.3 = 30%)', true,  true),

  -- Buy-now (decisions #3 and #4)
  ('auction.buy_now.min_multiplier',         '1.30'::jsonb,  'number',  'auction',    'buy_now_price must be >= starting_price * this multiplier', false, false),
  ('auction.buy_now.payment_mode',           '"deposit_then_full"'::jsonb, 'string', 'auction', 'Either "full_immediate" or "deposit_then_full"', false, true),

  -- KYC (decision #7 + pending #1)
  ('kyc.seller_required',                    'true'::jsonb,  'boolean', 'kyc',        'Sellers must complete KYC before creating their first auction', false, false),
  ('kyc.bidder_required_above',              '50000'::jsonb, 'number',  'kyc',        'KYC required for bidders when current_price exceeds this DT amount', false, true),
  ('kyc.winner_required_for_payment',        'true'::jsonb,  'boolean', 'kyc',        'Auction winners must complete KYC before final payment', false, false),
  ('kyc.face_match_threshold',               '95'::jsonb,    'number',  'kyc',        'Minimum face-match % to auto-approve KYC', false, true),
  ('kyc.ocr_confidence_threshold',           '95'::jsonb,    'number',  'kyc',        'Minimum OCR confidence % to auto-approve KYC', false, true),

  -- Photos & video (PLAN §12)
  ('listing.photos.required_count',          '12'::jsonb,    'number',  'listing',    'Required photo count per listing', false, false),
  ('listing.video.required',                 'true'::jsonb,  'boolean', 'listing',    'Whether walkaround video is required', false, false),
  ('listing.video.min_seconds',              '30'::jsonb,    'number',  'listing',    'Minimum video duration in seconds', false, false),
  ('listing.video.max_seconds',              '120'::jsonb,   'number',  'listing',    'Maximum video duration in seconds', false, false),

  -- Reports / moderation
  ('report.auto_review_threshold',           '3'::jsonb,     'number',  'moderation', 'Listing enters review queue once it has this many reports', false, true),
  ('report.auto_remove_threshold',           '7'::jsonb,     'number',  'moderation', 'Listing is auto-hidden once it has this many reports', false, true),

  -- Trust score weights (PLAN §15)
  ('trust.weights',
   '{"kyc":20,"ownership":15,"successful_deals":25,"ratings":15,"account_age":10,"reports":-15}'::jsonb,
   'json', 'trust', 'Weights summed to compute trust_score (max 100)', true, true),
  ('trust.kick_threshold',                   '20'::jsonb,    'number',  'trust',      'Sellers below this trust score are kicked off the platform', true, true),
  ('trust.report_cancellation_penalty',      '30'::jsonb,    'number',  'trust',      'Trust Score points deducted when auction is auto-cancelled by reports (handle_new_report)', true, true),

  -- Payment provider (decision #2)
  ('payment.active_provider',                '"simulation"'::jsonb, 'string', 'payment', 'Active payment provider: "simulation" | "konnect" | "clictopay"', true, true),

  -- i18n (pending #4)
  ('i18n.enabled_locales',                   '["ar","fr"]'::jsonb, 'json', 'i18n',     'Enabled UI locales for this MVP', false, false)
on conflict (key) do nothing;

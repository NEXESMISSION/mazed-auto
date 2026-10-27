-- ============================================================================
-- 0197 — Keys set in the back office, and the settings of lot B (D-B2…D-B5).
--
-- APP SECRETS (D-B2). The online-payment key (Konnect) is typed in « Moyens
-- de paiement » instead of being a Vercel variable. It is never stored as
-- typed: the application encrypts it (AES-256-GCM) with a key that lives in
-- Vercel only (`SETTINGS_SECRET_KEY`), the same scheme as the social tokens
-- (0195, D-S3). A copy of the database alone yields no usable key.
--   * one row per secret, its name from a closed list;
--   * `last4` is all a screen ever shows (« •••• 1234 »): the form is
--     write-only, nothing reads a key back out to a browser;
--   * no grant and no policy for anon or authenticated — not even admins
--     through their own session: only the server (service role) reads or
--     writes here, after its own admin check.
--
-- SETTINGS (D-B3, D-B4, D-B5). Three `app_settings` keys, seeded with what the
-- site does today so nothing changes until the back office says so:
--   listing_rules          how long an annonce stays online, how many photos
--   site_contact           the e-mail / phone / WhatsApp / address the contact
--                          and help pages print
--   notification_channels  whether the notification jobs send SMS and e-mails
--                          (the sign-in code is never affected)
-- None is in the public-read policy: the server reads them with the service
-- role and prints what it must.
-- ============================================================================

create table if not exists public.app_secrets (
  key         text primary key check (key in ('konnect_api_key')),
  -- "v1:" + base64(iv · tag · ciphertext); see src/lib/secrets.ts.
  ciphertext  text not null check (ciphertext like 'v1:%'),
  last4       text not null default '' check (char_length(last4) <= 4),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from public, anon, authenticated;
grant all on public.app_secrets to service_role;

comment on table public.app_secrets is
  'Keys typed in the back office, encrypted by the application (SETTINGS_SECRET_KEY, never in the database). Service role only.';

insert into public.app_settings (key, value, description) values
  ('listing_rules', '{"validity_days": 30, "max_photos": 12}',
   'Annonces : jours en ligne après publication (7–180) et photos au plus (1–24).'),
  ('site_contact', '{"email": "contact@mazedauto.com", "phone": "+216 98 120 622", "whatsapp": "", "address": ""}',
   'Coordonnées affichées sur les pages Contact et Aide.'),
  ('notification_channels', '{"sms": true, "email": true}',
   'Notifications envoyées par SMS / par e-mail (le code de connexion n''est jamais concerné).')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ============================================================
-- Mazed Auto — additional platform_settings
--
-- Numbers / lists that today live in client-side TypeScript but
-- a non-engineer admin should be able to tune. Adding them here
-- so /admin/settings can edit them; the seller wizard reads them
-- via lib/config.ts (TS) or get_setting() (SQL).
--
-- Safe to run repeatedly.
-- ============================================================

insert into public.platform_settings (key, value, type, category, description, sensitive, requires_approval) values
  -- Listing wizard tunables
  ('listing.duration_options',       '[3, 7, 14]'::jsonb,
   'json',  'listing', 'Auction durations the seller can pick (days)', false, false),

  ('listing.bid_increment_tiers',
   '[{"max":30000,"increment":250},{"max":100000,"increment":500},{"max":null,"increment":1000}]'::jsonb,
   'json',  'listing',
   'Bid increment tiers — first matching row wins. max=null means open-ended top tier.',
   false, true),

  -- Photo slots & video script — tunable but rarely changed.
  ('listing.photos.required_slots',
   '["front","rear","right_side","left_side","dashboard","odometer","front_seats","rear_seats","engine","trunk","tires","vin"]'::jsonb,
   'json', 'listing',
   'Identifiers of the 12 mandatory photo angles. Editing this changes step-2 of the seller wizard.',
   false, true),

  ('listing.video.script',
   '[{"from":0,"to":20,"label":"360° autour"},{"from":20,"to":35,"label":"Portes ouvertes"},{"from":35,"to":45,"label":"Capot ouvert"},{"from":45,"to":55,"label":"Démarrage"},{"from":55,"to":60,"label":"Plaque"}]'::jsonb,
   'json', 'listing',
   'Video checklist segments shown in step-3 of the seller wizard.',
   false, false),

  -- Trust score tier thresholds — UI label cutoffs.
  ('trust.tier_thresholds',
   '{"new":0,"low":42,"trusted":96,"very_trusted":156,"verified_pro":268}'::jsonb,
   'json', 'trust',
   'Lower bound (inclusive) for each trust tier. The matching tier name is the highest threshold ≤ current score.',
   false, true),

  -- Image processing pipeline
  ('media.image.max_edge_px',          '1920'::jsonb,  'number', 'media',
   'Maximum image edge in pixels for client-side compression', false, false),
  ('media.image.jpeg_quality',         '0.85'::jsonb,  'number', 'media',
   'JPEG compression quality (0–1)', false, false),
  ('media.image.skip_threshold_bytes', '204800'::jsonb,'number', 'media',
   'Files smaller than this many bytes skip client-side compression', false, false),
  ('media.thumb.width_px',             '600'::jsonb,   'number', 'media',
   'Default thumbnail width', false, false),
  ('media.thumb.quality',              '70'::jsonb,    'number', 'media',
   'Default thumbnail quality (0–100)', false, false),

  -- Public contact information (used by /contact, /help, /payment/failed)
  ('support.email',                    '"support@mazedauto.tn"'::jsonb, 'string', 'support',
   'Public support email address', false, true),
  ('support.phone',                    '"+216 70 100 200"'::jsonb,      'string', 'support',
   'Public support phone number', false, true),
  ('support.address',                  '"Avenue de la Liberté, 1002 Tunis Capitale"'::jsonb,
   'string', 'support', 'Public office address', false, false),
  ('support.hours',                    '"9h - 18h, 7j/7"'::jsonb, 'string', 'support',
   'Live support hours (free-text)', false, false),

  -- Forfeit penalty for renouncing a win (PLAN §21.4)
  ('auction.forfeit.ban_days',         '30'::jsonb,   'number', 'auction',
   'How many days a winner who voluntarily forfeits is banned from new bids', false, true),
  ('auction.forfeit.trust_penalty',    '40'::jsonb,   'number', 'auction',
   'Trust score points deducted on voluntary forfeit', true, true),

  -- KYC validity
  ('kyc.validity_days',                '365'::jsonb,  'number', 'kyc',
   'How long a KYC verification stays valid before re-verification is required', false, true),
  ('kyc.expiry_warning_days',          '30'::jsonb,   'number', 'kyc',
   'Warn the user this many days before KYC expires', false, false),

  -- Payment provider / simulation
  ('payment.simulation.failure_rate',  '0'::jsonb,    'number', 'payment',
   'Probability (0–1) that the simulated payment processor fails. Useful for QA.',
   false, false)
on conflict (key) do nothing;

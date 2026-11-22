-- ============================================================================
-- WONDERMC — Migration 001: Schema Alignment
-- ============================================================================
-- Purpose: Align the live Supabase schema with the TypeScript domain models
-- used by the application. All changes are ADDITIVE and IDEMPOTENT:
--   CREATE TABLE IF NOT EXISTS
--   ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- No existing data is modified, truncated, or deleted.
--
-- Safe to re-run. Review before applying to production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure all core tables exist (schema.sql baseline already covers most;
--    these IF NOT EXISTS guards make the migration self-contained).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  is_staff BOOLEAN DEFAULT FALSE,
  staff_role TEXT,
  staff_id TEXT,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  brand TEXT,
  brand_upper TEXT,
  store_name TEXT,
  tagline TEXT,
  description TEXT,
  server_ip TEXT,
  bedrock_port TEXT,
  server_name TEXT,
  website TEXT,
  discord_url TEXT,
  upi_id TEXT,
  upi_payee_name TEXT,
  custom_qr_url TEXT,
  qr_mode TEXT DEFAULT 'dynamic',
  whatsapp_url TEXT,
  instagram_url TEXT,
  youtube_url TEXT,
  telegram_url TEXT,
  copyright TEXT,
  server_tagline TEXT,
  show_server_tagline BOOLEAN DEFAULT TRUE,
  announcements JSONB DEFAULT '[]'::jsonb,
  show_announcements BOOLEAN DEFAULT TRUE,
  announcement_speed TEXT DEFAULT 'normal',
  discord_webhook_url TEXT,
  discord_webhook_enabled BOOLEAN DEFAULT FALSE,
  discord_bot_name TEXT,
  discord_avatar_url TEXT,
  discord_ping_role TEXT,
  discord_notify_on_payment BOOLEAN DEFAULT FALSE,
  discord_notify_on_ticket BOOLEAN DEFAULT FALSE,
  store_theme TEXT DEFAULT 'default',
  lifesteal_bg_url TEXT,
  practice_bg_url TEXT,
  lifesteal_icon_type TEXT,
  lifesteal_icon_value TEXT,
  practice_icon_type TEXT,
  practice_icon_value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  game_mode TEXT,
  description TEXT,
  image_url TEXT,
  icon TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  theme TEXT DEFAULT 'auto',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.store_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  discount_percent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.theme_settings (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  start_date TEXT,
  end_date TEXT,
  banner_url TEXT,
  floating_emojis_enabled BOOLEAN DEFAULT TRUE,
  floating_emojis JSONB DEFAULT '[]'::jsonb,
  floating_emoji_density TEXT DEFAULT 'normal',
  floating_emoji_speed TEXT DEFAULT 'normal',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.click_animations (
  theme_id TEXT PRIMARY KEY,
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gamemode_visuals (
  id TEXT PRIMARY KEY DEFAULT 'default',
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'normal',
  discount_type TEXT DEFAULT 'percentage',
  discount_value NUMERIC(10,2),
  expiry_date TEXT,
  usage_limit INTEGER,
  used_count INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  percent INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sale_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  pill TEXT,
  highlight TEXT,
  text TEXT,
  percent INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.staff_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  avatar_url TEXT,
  description TEXT,
  discord_id TEXT,
  discord_username TEXT,
  discord_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subadmin_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,                          -- legacy plaintext (migration target)
  password_hash TEXT,                              -- NEW: bcrypt/argon2 hash
  active BOOLEAN DEFAULT TRUE,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  admin_name TEXT,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  type TEXT
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT UNIQUE,
  user_id TEXT NOT NULL,
  username TEXT,
  user_email TEXT,
  ign TEXT,
  contact TEXT,
  discord_contact TEXT,
  category TEXT,
  priority TEXT DEFAULT 'normal',
  subject TEXT NOT NULL,
  description TEXT,
  screenshot_url TEXT,
  status TEXT DEFAULT 'open',
  assigned_staff_id TEXT,
  assigned_staff_name TEXT,
  assigned_staff_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_reply_at TIMESTAMPTZ,
  last_reply_by_role TEXT,
  unread_by_user INTEGER DEFAULT 0,
  unread_by_staff INTEGER DEFAULT 0,
  attachments_count INTEGER DEFAULT 0,
  rating_submitted BOOLEAN DEFAULT FALSE,
  admin_note TEXT,
  staff_notes TEXT
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  ticket_owner_id TEXT,
  sender_id TEXT,
  sender_name TEXT,
  sender_role TEXT,
  sender_staff_title TEXT,
  message TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  attachment_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_attachments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  ticket_owner_id TEXT,
  message_id TEXT,
  uploader_id TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  data_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_ratings (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_staff_permissions (
  id TEXT PRIMARY KEY,
  staff_id TEXT,
  name TEXT,                                       -- NEW: staff display name
  role_title TEXT,                                 -- NEW: role title
  passkey_hash TEXT,                               -- NEW: bcrypt/argon2 hash of staff passkey
  email TEXT,
  active BOOLEAN DEFAULT TRUE,
  can_view_all_tickets BOOLEAN DEFAULT FALSE,
  can_reply BOOLEAN DEFAULT TRUE,
  can_assign BOOLEAN DEFAULT FALSE,
  can_change_status BOOLEAN DEFAULT TRUE,
  can_add_internal_notes BOOLEAN DEFAULT TRUE,
  can_delete_tickets BOOLEAN DEFAULT FALSE,
  permissions JSONB DEFAULT '[]'::jsonb,           -- NEW: admin tab permissions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  staff_id TEXT,
  recipient_type TEXT DEFAULT 'staff',
  recipient_id TEXT,
  type TEXT,
  title TEXT,
  message TEXT,
  ticket_id TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ticket_history (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  action TEXT,
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  email TEXT,
  balance NUMERIC(12,2) DEFAULT 0,
  total_credited NUMERIC(12,2) DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0,
  total_credits_added NUMERIC(12,2) DEFAULT 0,     -- NEW alias
  total_credits_spent NUMERIC(12,2) DEFAULT 0,     -- NEW alias
  total_refunds NUMERIC(12,2) DEFAULT 0,           -- NEW
  total_promotional_credits NUMERIC(12,2) DEFAULT 0, -- NEW
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_ref TEXT,                            -- NEW
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  previous_balance NUMERIC(12,2),                  -- NEW
  balance_after NUMERIC(12,2),                     -- legacy
  updated_balance NUMERIC(12,2),                   -- NEW alias
  description TEXT,
  related_order_id TEXT,
  payment_id TEXT,
  status TEXT DEFAULT 'successful',
  admin_id TEXT,                                   -- NEW
  admin_name TEXT,                                 -- NEW
  reason TEXT,                                     -- NEW
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_recharges (
  id TEXT PRIMARY KEY,
  recharge_ref TEXT,                               -- NEW
  user_id TEXT NOT NULL,
  username TEXT,                                   -- NEW
  email TEXT,                                      -- NEW
  amount NUMERIC(12,2) NOT NULL,
  credits NUMERIC(12,2),                           -- NEW
  payment_method TEXT,                             -- NEW
  payment_gateway TEXT,                            -- NEW
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  payment_id TEXT,                                 -- NEW
  status TEXT DEFAULT 'pending',
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,
  transaction_id TEXT,
  order_id TEXT,
  user_id TEXT,
  username TEXT,
  email TEXT,
  product_name TEXT,
  amount NUMERIC(12,2) NOT NULL,
  wallet_amount NUMERIC(12,2),
  online_amount NUMERIC(12,2),
  online_transaction_id TEXT,
  payment_method TEXT,
  payment_gateway TEXT,
  payment_type TEXT,
  status TEXT DEFAULT 'pending',
  gateway_order_id TEXT,
  gateway_reference TEXT,
  verified_by_backend BOOLEAN DEFAULT FALSE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id TEXT PRIMARY KEY,
  refund_ref TEXT,
  payment_id TEXT,
  order_id TEXT,
  user_id TEXT,
  total_refund_amount NUMERIC(12,2),
  wallet_refund_amount NUMERIC(12,2),
  online_refund_amount NUMERIC(12,2),
  gateway_refund_id TEXT,
  wallet_transaction_id TEXT,
  reason TEXT,
  admin_id TEXT,
  admin_name TEXT,
  status TEXT DEFAULT 'successful',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,                               -- NEW
  user_id TEXT,
  username TEXT,
  email TEXT,
  ign TEXT,                                        -- NEW
  items JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2),
  currency TEXT DEFAULT 'INR',                     -- NEW
  wallet_used NUMERIC(12,2),
  online_paid NUMERIC(12,2),
  payment_type TEXT,
  payment_id TEXT,
  status TEXT DEFAULT 'pending',
  utr TEXT,
  screenshot_url TEXT,
  edition TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  reward_amount NUMERIC(12,2) NOT NULL,
  coupon_type TEXT DEFAULT 'multi_use',
  total_limit INTEGER,
  per_user_limit INTEGER DEFAULT 1,
  redeemed_count INTEGER DEFAULT 0,
  start_date TEXT,
  expiry_date TEXT,
  status TEXT DEFAULT 'active',
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL,
  coupon_code TEXT,                                -- NEW
  user_id TEXT NOT NULL,
  username TEXT,                                   -- NEW
  user_email TEXT,                                 -- NEW
  wallet_id TEXT,                                  -- NEW
  wallet_transaction_id TEXT,                      -- NEW
  amount NUMERIC(12,2),                            -- legacy
  reward_amount NUMERIC(12,2),                     -- NEW
  previous_balance NUMERIC(12,2),                  -- NEW
  new_balance NUMERIC(12,2),                       -- NEW
  status TEXT DEFAULT 'successful',
  error_message TEXT,                              -- NEW
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payment_gateway_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  razorpay_enabled BOOLEAN DEFAULT FALSE,
  razorpay_mode TEXT DEFAULT 'test',
  razorpay_key_id TEXT,
  razorpay_key_secret TEXT,
  webhook_secret TEXT,
  upi_qr_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.donation_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  reference_number TEXT,                           -- NEW
  username TEXT,
  edition TEXT,
  amount NUMERIC(12,2) NOT NULL,
  utr TEXT,
  screenshot_url TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  admin_remarks TEXT,
  reward_id TEXT,
  reward_name TEXT,
  reward_category TEXT,
  reward_status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE TABLE IF NOT EXISTS public.donation_rewards (
  id TEXT PRIMARY KEY,
  min_amount NUMERIC(12,2),
  name TEXT,                                       -- NEW
  description TEXT,                                -- NEW
  category TEXT,                                   -- NEW
  badge_label TEXT,                                -- NEW
  enabled BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,                 -- NEW
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.donation_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN DEFAULT TRUE,
  leaderboard_enabled BOOLEAN DEFAULT TRUE,
  rewards_enabled BOOLEAN DEFAULT TRUE,
  upi_id TEXT,
  upi_payee_name TEXT,
  qr_mode TEXT DEFAULT 'dynamic',
  custom_qr_url TEXT,
  instructions TEXT,
  min_amount NUMERIC(12,2) DEFAULT 0,
  thank_you_message TEXT,
  rewards_banner_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.donation_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT,
  actor TEXT,
  target_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vote_links (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT,
  url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.rules_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  rules JSONB DEFAULT '[]'::jsonb,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.server_updates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  image_urls JSONB DEFAULT '[]'::jsonb,
  author TEXT,
  tag TEXT,
  pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.leaderboard (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  total_spent NUMERIC(12,2) DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.connection_guide (
  id TEXT PRIMARY KEY DEFAULT 'default',
  java_title TEXT,
  java_description TEXT,
  java_steps JSONB DEFAULT '[]'::jsonb,
  bedrock_title TEXT,
  bedrock_description TEXT,
  bedrock_steps JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. Additive column alignment for tables that already exist.
--    CREATE TABLE IF NOT EXISTS (section 1) is a no-op on an existing table: it
--    does NOT add the new columns below. Every column introduced by this
--    migration must therefore be added explicitly. ADD COLUMN IF NOT EXISTS
--    keeps this idempotent and never modifies or drops existing data.
-- ----------------------------------------------------------------------------

ALTER TABLE public.subadmin_keys
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.support_staff_permissions
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS role_title TEXT,
  ADD COLUMN IF NOT EXISTS passkey_hash TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_view_all_tickets BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_reply BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_assign BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_change_status BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_add_internal_notes BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_delete_tickets BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.support_notifications
  ADD COLUMN IF NOT EXISTS recipient_type TEXT DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS recipient_id TEXT;

ALTER TABLE public.ticket_history
  ADD COLUMN IF NOT EXISTS actor_role TEXT;

ALTER TABLE public.user_wallets
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS total_credits_added NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credits_spent NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunds NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_promotional_credits NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS transaction_ref TEXT,
  ADD COLUMN IF NOT EXISTS previous_balance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS updated_balance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_id TEXT,
  ADD COLUMN IF NOT EXISTS admin_id TEXT,
  ADD COLUMN IF NOT EXISTS admin_name TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE public.wallet_recharges
  ADD COLUMN IF NOT EXISTS recharge_ref TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS credits NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT,
  ADD COLUMN IF NOT EXISTS payment_id TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS ign TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR';

ALTER TABLE public.wallet_coupons
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.wallet_coupon_redemptions
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS wallet_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS reward_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS previous_balance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS new_balance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'successful',
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE public.donation_requests
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS edition TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS admin_remarks TEXT,
  ADD COLUMN IF NOT EXISTS reward_id TEXT,
  ADD COLUMN IF NOT EXISTS reward_name TEXT,
  ADD COLUMN IF NOT EXISTS reward_category TEXT,
  ADD COLUMN IF NOT EXISTS reward_status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE public.donation_rewards
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS badge_label TEXT,
  ADD COLUMN IF NOT EXISTS reward_description TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.donation_audit_logs
  ADD COLUMN IF NOT EXISTS target_id TEXT;

-- ----------------------------------------------------------------------------
-- 3. Indexes (idempotent)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON public.support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON public.support_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_notifications_recipient ON public.support_notifications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON public.ticket_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_recharges_user ON public.wallet_recharges(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_recharges_status ON public.wallet_recharges(status);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_order ON public.payments(gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON public.payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_wallet_coupons_code ON public.wallet_coupons(code);
CREATE INDEX IF NOT EXISTS idx_wallet_coupon_redemptions_user ON public.wallet_coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_donation_requests_status ON public.donation_requests(status);
CREATE INDEX IF NOT EXISTS idx_donation_requests_user ON public.donation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_store_items_category ON public.store_items(category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON public.activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_subadmin_keys_active ON public.subadmin_keys(active);
CREATE INDEX IF NOT EXISTS idx_support_staff_permissions_active ON public.support_staff_permissions(active);

-- ----------------------------------------------------------------------------
-- 4. Seed defaults (idempotent — do not overwrite existing rows)
-- ----------------------------------------------------------------------------
INSERT INTO public.store_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sale_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.donation_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.payment_gateway_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.connection_guide (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- Migration note: schema alignment — additive column/table/index additions only. No data modification.

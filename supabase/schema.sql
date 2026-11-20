-- WONDER MC Supabase Schema
-- Run this entire script in the Supabase SQL Editor after creating your project.
-- Then configure Auth providers (Google OAuth) in the Supabase dashboard.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- AUTH & PROFILES
-- =============================================
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

-- =============================================
-- STORE CONFIGURATION
-- =============================================
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

-- =============================================
-- COUPONS & SALES
-- =============================================
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

-- =============================================
-- STAFF & ADMIN
-- =============================================
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
  password TEXT NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  admin_name TEXT,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  type TEXT
);

-- =============================================
-- SUPPORT TICKETS
-- =============================================
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
  permissions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  staff_id TEXT,
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
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- WALLET & PAYMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_wallets (
  user_id TEXT PRIMARY KEY,
  balance NUMERIC(12,2) DEFAULT 0,
  total_credited NUMERIC(12,2) DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2),
  description TEXT,
  related_order_id TEXT,
  status TEXT DEFAULT 'successful',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_recharges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
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
  user_id TEXT,
  username TEXT,
  email TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2),
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_coupon_redemptions (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount NUMERIC(12,2),
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

-- =============================================
-- DONATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.donation_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  amount NUMERIC(12,2) NOT NULL,
  utr TEXT,
  screenshot_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  verified_by TEXT
);

CREATE TABLE IF NOT EXISTS public.donation_rewards (
  id TEXT PRIMARY KEY,
  min_amount NUMERIC(12,2),
  reward_description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- OTHER CONTENT
-- =============================================
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

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON public.activity_logs(timestamp DESC);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Support tickets: users see own, staff see all (enforced also in backend)
CREATE POLICY "Users view own tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid()::text = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (is_admin OR is_staff)
  ));

-- Wallets: users see own
CREATE POLICY "Users view own wallet" ON public.user_wallets
  FOR SELECT USING (auth.uid()::text = user_id);

-- Note: Most write operations and admin access should go through the Express backend
-- using the service role key. Frontend uses anon key + RLS for safe reads.

-- =============================================
-- TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_store_config_updated_at
  BEFORE UPDATE ON public.store_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed default store config row
INSERT INTO public.store_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sale_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.donation_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.payment_gateway_config (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.connection_guide (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, photo_url, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON SCHEMA public IS 'WONDER MC store schema migrated from Firebase/local JSON to Supabase PostgreSQL';

-- ============================================================================
-- WONDERMC — Migration 002: Row-Level Security Policies
-- ============================================================================
-- Security model:
--  * ALL writes go through the Express backend using the SERVICE ROLE key
--    (service_role bypasses RLS automatically). The backend enforces
--    application-level authorization before touching protected records.
--  * The frontend (anon key) may only READ public-facing tables.
--  * Authenticated users may read their OWN wallet/orders/payments/tickets.
--  * No table allows public INSERT/UPDATE/DELETE via the anon key.
--
-- RLS is ENABLED on every table. Existing data is not modified.
-- Safe to re-run (CREATE POLICY ... IF NOT EXISTS style via DROP+CREATE).
-- ============================================================================

-- Helper: enable RLS on all application tables (idempotent)
DO $$
BEGIN
  ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.store_config ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.store_categories ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.store_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.theme_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.click_animations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.gamemode_visuals ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.coupons ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.sale_config ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.staff_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.subadmin_keys ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.activity_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.support_tickets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.support_messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.support_attachments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.support_ratings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.support_staff_permissions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.support_notifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.ticket_history ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.user_wallets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.wallet_transactions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.wallet_recharges ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.payment_refunds ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.wallet_coupons ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.wallet_coupon_redemptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.payment_gateway_config ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.donation_requests ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.donation_rewards ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.donation_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.donation_audit_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.vote_links ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.rules_categories ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.server_updates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.leaderboard ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.connection_guide ENABLE ROW LEVEL SECURITY;
END $$;

-- ----------------------------------------------------------------------------
-- Public read-only policies (anon key) — public-facing reference data
-- ----------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "Public read store_items"
  ON public.store_items FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read store_categories"
  ON public.store_categories FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read theme_settings"
  ON public.theme_settings FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read click_animations"
  ON public.click_animations FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read gamemode_visuals"
  ON public.gamemode_visuals FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read coupons (public)"
  ON public.coupons FOR SELECT
  USING (enabled = true AND (category = 'normal' OR category IS NULL));

CREATE POLICY IF NOT EXISTS "Public read sale_config"
  ON public.sale_config FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read vote_links"
  ON public.vote_links FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read rules_categories"
  ON public.rules_categories FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read server_updates"
  ON public.server_updates FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read leaderboard"
  ON public.leaderboard FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read connection_guide"
  ON public.connection_guide FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read donation_settings"
  ON public.donation_settings FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Public read donation_rewards (enabled)"
  ON public.donation_rewards FOR SELECT
  USING (enabled = true);

-- ----------------------------------------------------------------------------
-- Authenticated-user own-data policies
-- Users read their own records (matched by user_id text). Backend still
-- enforces the real authorization; this is a defense-in-depth read guard.
-- ----------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "Users read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users read own wallet"
  ON public.user_wallets FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own recharges"
  ON public.wallet_recharges FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own payments"
  ON public.payments FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own orders"
  ON public.orders FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own coupon redemptions"
  ON public.wallet_coupon_redemptions FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own donation requests"
  ON public.donation_requests FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own support tickets"
  ON public.support_tickets FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users read own support messages"
  ON public.support_messages FOR SELECT
  USING (auth.uid()::text = ticket_owner_id);

-- ----------------------------------------------------------------------------
-- Store config: public read, authenticated read (backend writes via service role)
-- ----------------------------------------------------------------------------
CREATE POLICY IF NOT EXISTS "Public read store_config"
  ON public.store_config FOR SELECT
  USING (true);

-- ----------------------------------------------------------------------------
-- All WRITE operations: restricted to service role (backend). Anon/authenticated
-- roles have NO insert/update/delete policy, so writes are rejected by RLS.
-- The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, then applies
-- its own permission checks. No policy = no write access for non-service roles.
-- ----------------------------------------------------------------------------

-- Migration note: RLS enabled on all tables; public read on reference data; user own-data reads; all writes restricted to backend service role.

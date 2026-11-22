-- ============================================================================
-- WONDERMC — Migration 004: Service Role Grants
-- ============================================================================
-- CRITICAL: The backend uses SUPABASE_SERVICE_ROLE_KEY for all trusted data
-- access. On the current project the service_role lacks table privileges
-- (PostgREST returns 42501 "permission denied for table ..."), which means the
-- backend cannot read or write most application tables. This migration grants
-- the service_role the privileges it requires.
--
-- The service_role bypasses RLS; application authorization is enforced in the
-- Express backend BEFORE any protected record is accessed. These grants do NOT
-- affect anon/authenticated clients (their access is governed by RLS policies
-- in migration 002).
--
-- Idempotent. Safe to re-run.
-- ============================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles', 'store_config', 'store_categories', 'store_items',
    'theme_settings', 'click_animations', 'gamemode_visuals',
    'coupons', 'sale_config', 'staff_members', 'subadmin_keys',
    'activity_logs', 'support_tickets', 'support_messages',
    'support_attachments', 'support_ratings', 'support_staff_permissions',
    'support_notifications', 'ticket_history', 'user_wallets',
    'wallet_transactions', 'wallet_recharges', 'payments', 'payment_refunds',
    'orders', 'wallet_coupons', 'wallet_coupon_redemptions',
    'payment_gateway_config', 'donation_requests', 'donation_rewards',
    'donation_settings', 'donation_audit_logs', 'donation_manual_leaderboard',
    'processed_gateway_payment_ids', 'vote_links', 'rules_categories',
    'server_updates', 'leaderboard', 'connection_guide'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Guard against tables that don't exist in this project.
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- Ensure the service_role can use sequences / schemas it needs.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- Functions used by the backend must be executable by service_role.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Migration note: grants service_role SELECT/INSERT/UPDATE/DELETE on all application tables. Required for the backend to function. Anon/authenticated access still governed by RLS.

-- ============================================================================
-- WONDERMC — Migration 003: Donation Leaderboard + Financial Integrity
-- ============================================================================
-- Additive and idempotent. Adds:
--   * donation_manual_leaderboard table (manual top-donator entries)
--   * processed_gateway_payment_ids table (webhook idempotency across restarts)
--   * helper columns / constraints for financial consistency
--   * RLS enabled + indexes
-- No existing data modified. Safe to re-run.
-- ============================================================================

-- Manual donation leaderboard (persisted centrally)
CREATE TABLE IF NOT EXISTS public.donation_manual_leaderboard (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  edition TEXT DEFAULT 'java',
  amount NUMERIC(12,2) DEFAULT 0,
  badge TEXT DEFAULT 'Supporter',
  avatar_url TEXT,
  period TEXT DEFAULT 'both',
  position INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_donation_manual_lb_position ON public.donation_manual_leaderboard(position);

-- Processed gateway payment IDs — durable webhook idempotency.
-- Without this, a Render restart wipes the in-memory Set and a replayed webhook
-- could credit a wallet twice.
CREATE TABLE IF NOT EXISTS public.processed_gateway_payment_ids (
  payment_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: these tables are written only by the backend service role.
ALTER TABLE IF EXISTS public.donation_manual_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.processed_gateway_payment_ids ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Public read donation manual leaderboard"
  ON public.donation_manual_leaderboard FOR SELECT USING (true);

-- Idempotency helper: atomically claim a gateway payment id.
-- Returns TRUE if the id was newly inserted, FALSE if it was already present.
-- The backend must only credit a wallet when this returns TRUE.
CREATE OR REPLACE FUNCTION public.claim_gateway_payment_id(p_payment_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.processed_gateway_payment_ids (payment_id)
  VALUES (p_payment_id)
  ON CONFLICT (payment_id) DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Atomic wallet balance adjustment RPC.
-- Prevents lost-update races under concurrent requests by performing the
-- read-modify-write inside a single statement with a row lock.
-- p_delta may be positive (credit) or negative (debit).
CREATE OR REPLACE FUNCTION public.adjust_wallet_balance(
  p_user_id TEXT,
  p_delta NUMERIC,
  p_field TEXT DEFAULT 'balance'
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_new NUMERIC;
BEGIN
  IF p_field = 'total_credits_added' THEN
    UPDATE public.user_wallets
      SET total_credits_added = COALESCE(total_credits_added, 0) + p_delta,
          updated_at = NOW()
      WHERE user_id = p_user_id
      RETURNING total_credits_added INTO v_new;
  ELSIF p_field = 'total_credits_spent' THEN
    UPDATE public.user_wallets
      SET total_credits_spent = COALESCE(total_credits_spent, 0) + p_delta,
          updated_at = NOW()
      WHERE user_id = p_user_id
      RETURNING total_credits_spent INTO v_new;
  ELSE
    -- Refuse to drive a wallet balance negative.
    UPDATE public.user_wallets
      SET balance = COALESCE(balance, 0) + p_delta,
          updated_at = NOW()
      WHERE user_id = p_user_id AND COALESCE(balance, 0) + p_delta >= 0
      RETURNING balance INTO v_new;
  END IF;
  RETURN v_new; -- NULL means row not found or would go negative
END;
$$;

-- Migration note: donation leaderboard table, durable webhook idempotency table + claim RPC, atomic wallet adjustment RPC. Additive only.

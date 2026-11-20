/**
 * Supabase admin client for the Express backend.
 * Uses the service role key — NEVER expose this to the frontend.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url || !serviceRoleKey) {
    console.warn('[Supabase Admin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

export const supabaseAdmin = getSupabaseAdmin();

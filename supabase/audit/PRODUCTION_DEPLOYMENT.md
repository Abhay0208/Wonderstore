# WONDERMC — Production Deployment Instructions (Render)

## 1. Supabase setup (one-time)

1. In the Supabase SQL Editor, run the migrations **in order**:
   - `supabase/schema.sql` (baseline schema — review against the live project first)
   - `supabase/migrations/001_schema_alignment.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_financial_and_leaderboard.sql`
   - `supabase/migrations/004_service_role_grants.sql`  ← **required** so the
     backend service-role can read/write tables (fixes `42501 permission denied`)
2. Enable Google OAuth in Supabase Auth (if used) and set the site/redirect URLs.
3. Create sub-admin/staff accounts through the admin panel (passwords are hashed
   with scrypt on creation). Do **not** import legacy plaintext passwords.

## 2. Data migration (optional, report-first)

```bash
# 1) Dry-run report — compares local JSON with Supabase, detects conflicts,
#    writes nothing. Review the output.
npm run migrate

# 2) Only AFTER review and explicit approval, apply:
npx tsx scripts/migrate-to-supabase.ts --execute
```

Migration safety rules enforced by the script:
- Never overwrites existing primary keys / wallet balances.
- Never truncates or deletes tables.
- Detects duplicate IDs, duplicate coupon codes, conflicting usernames.
- Skips private gateway secrets (they must stay in environment variables).
- Idempotent: safe to re-run.

## 3. Environment variables (Render → Environment)

Set these in the Render service (never commit to Git):

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
ADMIN_SECURITY_KEY
SUPPORT_SESSION_SECRET        # >=32 chars, STABLE across deploys
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
GATEWAY_SIGNING_SECRET
RAZORPAY_MODE=test
DISCORD_WEBHOOK_URL           # optional
DISCORD_SUPPORT_WEBHOOK_URL   # optional
APP_URL=https://your-domain
PORT=10000                    # Render injects this; server honors process.env.PORT
NODE_ENV=production
```

**Never** expose `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`,
`ADMIN_SECURITY_KEY`, or `SUPPORT_SESSION_SECRET` via `VITE_` variables.

## 4. Build & start commands

- Build: `npm run build`
- Start: `npm start` (runs `node dist/server.cjs`)
- The server binds to `0.0.0.0` and listens on `process.env.PORT`.

## 5. Stability notes

- All shared data now lives in Supabase; Render's ephemeral filesystem is only a
  local backup cache, not the source of truth. Restarting/redeploying does not
  reset data.
- On startup the server hydrates support, wallet, site and donation caches from
  Supabase before accepting requests.
- Session tokens are signed with `SUPPORT_SESSION_SECRET` from the environment;
  they remain valid across restarts (no ephemeral key file).
- `unhandledRejection` / `uncaughtException` handlers log safely without leaking
  secrets.
- `/api/health` reports Supabase dependency status.

## 6. Verification

1. `npm run lint` → no errors
2. `npm test` → all tests pass
3. Deploy, then open `https://your-domain/api/health` → `ok: true`
4. Owner login → add product → change price → create category → change store
   config → create update → save leaderboard entry → restart Render → verify all
   changes persist → open in a different browser → verify the same shared data.
5. Never use real payment transactions for tests; use the built-in test sandbox.

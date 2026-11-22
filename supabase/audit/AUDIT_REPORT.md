# WONDERMC — COMPLETE SYSTEM AUDIT REPORT

**Date:** 2026-11-22  
**Repository:** Wonder-mc-server--main (branch: main)  
**Status:** Production-not-ready — critical security and persistence defects found.

---

## 1. EXISTING ARCHITECTURE

### Stack
- **Frontend:** React 19 + Vite 6 + Tailwind CSS, SPA, single `index.html`
- **Backend:** Express 4 + tsx (dev) / esbuild bundle (prod), `server.ts` entry
- **Database:** Supabase PostgreSQL (project `raiyjdekkmqvhjijaygb`), schema in `supabase/schema.sql`
- **Auth:** Supabase Auth (Google OAuth + email/password) via `src/lib/firebase.ts` (rewrapped Supabase); admin/support sessions via custom HMAC tokens in `server/supportDb.ts`
- **Payments:** Razorpay gateway (test/live), server-signed test sandbox, UPI QR manual
- **Deployment:** Render (implied), `npm start` -> `node dist/server.cjs`; PORT hardcoded to 3000 in server.ts

### Data storage layers (inconsistent)
| Layer | Purpose | Problem |
|-------|---------|---------|
| `data/*.json` (support_db, wallet_db, site_db, gateway_secrets, session_secret.key) | Primary read source for Db classes | Ephemeral on Render; lost on rebuild/restart |
| `store_backend.json` (root) | Legacy store catalog (items, categories, coupons, staff, leaderboard, orders, config, votes, rules, connection guide, sub-admin keys) | Not read by server at all; frontend reads it? No — frontend uses `storageAdapter` (localStorage) |
| Browser `localStorage` / `sessionStorage` | Primary source of truth for shared store data | Per-browser, per-device; not shared; empty storage can overwrite Supabase data |
| Supabase (service-role backend writes) | "Primary" per code comments | Writes are **fire-and-forget** (`.then(...)` only, not awaited); errors silently swallowed; many tables never written |

### Key files
- `server.ts` — Express app, all API routes, auth middleware (`requireAdminModule`, `requireSupportSession`, `requireStaffOrAdminSession`)
- `server/supportDb.ts` — Support tickets, staff auth, session signing (HMAC SHA256), local JSON + background Supabase upsert
- `server/walletDb.ts` — Wallets, recharges, payments, orders, coupons, refunds; local JSON + background Supabase upsert
- `server/siteDb.ts` — Categories, theme settings, click animations, gamemode visuals; local JSON + background Supabase upsert
- `server/donationDb.ts` — Donations, leaderboard, rewards, settings; local JSON + background Supabase upsert
- `server/paymentGateway.ts` — Razorpay config, secrets in `data/gateway_secrets.json`
- `server/supportDiscord.ts` — Discord webhook config in `data/support_discord_config.json`
- `server/supabaseAdmin.ts` — Service-role Supabase client singleton
- `src/context/*` — React providers (Auth, StoreConfig, Wallet, Ticket, Order, Cart, Sale, Toast)
- `src/services/storageAdapter.ts` — localStorage adapter used as **source of truth** by App.tsx
- `src/services/supportService.ts`, `walletService.ts`, `donationService.ts` — API clients
- `src/components/AdminLoginModal.tsx`, `AdminPanelModal.tsx` — Admin auth + panel
- `supabase/schema.sql` — Target schema (40 tables/objects)

---

## 2. DISCOVERED VULNERABILITIES (CRITICAL)

### V1 — Hardcoded owner password (backend & frontend)
- `server.ts:82`: `MASTER_OWNER_PASSKEY = process.env.ADMIN_SECURITY_KEY || 'vQ7!mZ2#L9@xR4$kT8^pN6&yW3'` — hardcoded fallback
- `src/components/AdminLoginModal.tsx:10`: `const ADMIN_SECURITY_KEY = 'vQ7!mZ2#L9@xR4$kT8^pN6&yW3'` — **bundled in frontend**
- `server/supportDb.ts:96-97`: `DEFAULT_OWNER_PASSKEY` same hardcoded value
- `.env` (local, gitignored): `ADMIN_SECURITY_KEY=vQ7!mZ2#L9@xR4$kT8^pN6&yW3`

### V2 — Frontend independently verifies owner password
`AdminLoginModal.handleLogin` compares `cleanPass === ADMIN_SECURITY_KEY` entirely client-side, sets `sessionStorage.setItem('wondermc_admin_auth_token', cleanPass)` — the raw password becomes the session token.

### V3 — Frontend independently verifies sub-admin passwords
`AdminLoginModal` iterates `subAdminKeys.find(k => k.password.trim() === cleanPass)` client-side and trusts the result.

### V4 — Frontend sends custom sub-admin credentials to backend
`loginStaffSession(passkey, subAdminKeys)` sends the full sub-admin key list (including plaintext passwords) to `/api/support/auth/staff-login`.

### V5 — Backend trusts submitted sub-admin lists
`supportDb.authenticateStaffOrAdmin(passkey, customSubAdminKeys)` authenticates against a caller-supplied list of `{id, name, password, permissions}` — any caller can forge admin permissions.

### V6 — Raw passwords stored in sessionStorage as tokens
- `wondermc_admin_auth_token` = raw owner/sub-admin password
- Staff token = raw staff passkey
- Violates requirement: "Store tokens rather than passwords in browser storage."

### V7 — `x-admin-key` auth bypass
`server.ts:98`: `req.headers["x-admin-key"] === MASTER_OWNER_PASSKEY` grants owner session. Raw password accepted as authorization header.

### V8 — Incomplete backend permission coverage
`requireAdminModule` only covers 9 module perms (`wallet`, `payment_management`, `orders`, `coupon_management`, `donations`, `categories`, `themes`, `click_animations`, `settings`). Admin tabs `users`, `staff`, `supporters`, `discounts`, `tickets`, `updates`, `vote`, `payment`, `passwords`, `guide`, `rules`, `activity_log` have **no backend authorization** — enforced only by frontend UI (`allowedTabs`), which is bypassable.

### V9 — Ephemeral session signing secret
`supportDb.loadOrCreateSessionSecret()` falls back to writing/reading `data/session_secret.key` on Render's ephemeral filesystem. On Render rebuild/restart the file is lost → all existing session tokens invalidated; worse, a newly generated secret means tokens issued before restart are unverifiable, and the secret differs per Render instance if multiple replicas existed.

### V10 — No rate limiting on login endpoints
`/api/support/auth/staff-login`, `/api/support/auth/user-session` have no rate limiting → brute-forceable.

### V11 — Fire-and-forget Supabase writes (silent failures)
All `admin.from(...).upsert(...).then(({error}) => console.error(...))` calls in `supportDb.write`, `walletDb.write`, `siteDb.save`, `donationDb.save` are **not awaited**. The server reports success to the client before/without confirming the DB write. If Supabase is unreachable, data is lost silently.

### V12 — Secrets in publicly writable/readable locations
- `data/gateway_secrets.json` contains Razorpay key secret + webhook secret (ephemeral disk)
- `data/support_discord_config.json` contains Discord webhook URL
- `data/session_secret.key` contains signing secret

### V13 — Inconsistent schema vs. code types
`supabase/schema.sql` `support_staff_permissions(id, staff_id, permissions)` does NOT match `SupportStaffPermission` type (passkey, name, roleTitle, active, canViewAllTickets, etc.). `wallet_coupon_redemptions`, `user_wallets`, `wallet_transactions`, `payments` columns also mismatch the TypeScript models.

### V14 — No input sanitization / SQL injection risk via Supabase client (mitigated by parameterized client, but unsanitized echo of user input into logs possible)

### V15 — No CSRF protection on state-changing endpoints

### V16 — Credentials may be logged
Error paths echo `data.error` which could contain raw input; no explicit redaction of secrets in logs.

---

## 3. MISSING DATABASE INTEGRATIONS

Tables defined in `schema.sql` but **never written/read** by the corresponding server code:
- `store_items` — no CRUD API; products managed only in localStorage
- `sale_config` — no API; sale managed in `SaleContext` localStorage
- `payment_gateway_config` — gateway config kept in `data/gateway_secrets.json` only
- `donation_rewards` — rewards kept in `donations_db.json` / memory only
- `staff_members` — store staff kept in localStorage only
- `subadmin_keys` — kept in `store_backend.json` + localStorage only
- `activity_logs` — kept in localStorage only
- `server_updates` — kept in localStorage only
- `vote_links` — kept in localStorage only
- `rules_categories` — kept in localStorage only
- `connection_guide` — kept in localStorage only
- `leaderboard` — kept in localStorage only
- `theme_settings`, `click_animations`, `gamemode_visuals` — partially written (background upsert, not awaited)
- `support_staff_permissions`, `support_notifications`, `ticket_history`, `support_ratings`, `support_attachments`, `support_staff_assignments` — partially written (background upsert, not awaited)

No dedicated Supabase tables or APIs exist for: store coupons (distinct from wallet coupons), store products, sale config, store activity logs.

---

## 4. INCOMPLETE API IMPLEMENTATIONS

Endpoints that exist but do **not** actually persist to backend reliably:
- `PUT /api/admin/store-categories/sync` — writes to siteDb (background Supabase upsert, not awaited)
- `PUT/POST /api/admin/theme-settings`, `click-animations`, `floating-emojis`, `gamemode-visuals` — same fire-and-forget issue
- `handleSaveLeaderboardToBackend` (App.tsx:246) — writes only to localStorage despite name
- `handleSaveStaffToBackend` (App.tsx:208) — writes only to localStorage
- All `*Db.write`/`save` methods — Supabase upserts fire-and-forget

Missing CRUD APIs entirely:
- `GET/POST/PUT/DELETE /api/store/items` (products)
- `GET/POST/PUT/DELETE /api/store/categories` (only sync PUT exists)
- `GET/POST/PUT/DELETE /api/store/coupons` (store coupons)
- `GET/POST/PUT/DELETE /api/store/leaderboard`
- `GET/POST/PUT/DELETE /api/store/staff`
- `GET/POST/PUT/DELETE /api/store/subadmin-keys`
- `GET/POST/PUT/DELETE /api/store/activity-logs`
- `GET/POST/PUT/DELETE /api/store/updates`
- `GET/POST/PUT/DELETE /api/store/vote-links`
- `GET/POST/PUT/DELETE /api/store/rules`
- `GET/POST/PUT/DELETE /api/store/connection-guide`
- `GET/POST /api/store/sale-config`
- `GET/POST /api/store/config` (store_config full CRUD)
- `GET/POST /api/admin/gateway-config` (payment gateway secrets — protected)

---

## 5. DATA PERSISTENCE PROBLEMS

1. **localStorage is the source of truth** for shared data (App.tsx reads `STORAGE_KEYS.*` on init; every mutation writes localStorage). Different browsers/devices see different data.
2. **Empty browser storage overwrites Supabase data** — no "fetch on load, merge; never write empty" guard.
3. **Supabase writes not awaited** — success reported before DB confirmation; data lost on Supabase outage.
4. **Render ephemeral disk** — `data/*.json` lost on rebuild; `data/session_secret.key` lost on restart.
5. **Wallet mismatch** — local `wallet_db.json` has 1 wallet; Supabase has 2 user_wallets. Blind overwrite of Supabase with local data would destroy a wallet.
6. **No transactional financial operations** — wallet credit/debit + transaction + order updates are in-memory sequential, not DB transactions.

---

## 6. AUTHENTICATION PROBLEMS

| Issue | Location |
|-------|----------|
| Hardcoded owner password fallback | `server.ts:82`, `AdminLoginModal.tsx:10`, `supportDb.ts:96` |
| Frontend verifies owner password | `AdminLoginModal.tsx:157` |
| Frontend verifies sub-admin password | `AdminLoginModal.tsx:171` |
| Frontend sends sub-admin list + passwords to backend | `supportService.loginStaffSession`, `supportDb.authenticateStaffOrAdmin` |
| Backend trusts caller-supplied sub-admin permissions | `supportDb.authenticateStaffOrAdmin` customSubAdminKeys branch |
| Raw password as session token (sessionStorage) | `supportService.setStoredStaffSession`, `AdminLoginModal` |
| `x-admin-key` accepts raw password | `server.ts:98` |
| Session secret from ephemeral file | `supportDb.loadOrCreateSessionSecret` |
| No token expiration enforcement on admin panel | Admin panel trusts `activeSession` in memory only |
| No logout invalidation server-side | Tokens are stateless HMAC; no revocation list |

---

## 7. PAYMENT AND WALLET RISKS

1. Razorpay webhook `/api/payments/razorpay/webhook` trusts `x-razorpay-signature` — verified, OK, but webhook idempotency relies on in-memory `processedGatewayPaymentIds` (lost on restart → double credit possible after restart).
2. Wallet balance updates not in DB transactions.
3. `recordManualUpiCheckout` allows `guest_` userId without token — unauthenticated order creation.
4. Frontend calculates `finalTotal`, coupon discount, wallet split client-side (CartContext) — backend recomputes, but checkout `totalAmount` is trusted from client in several paths.
5. No idempotency key on checkout/payment initiation; duplicate submits possible.

---

## 8. BUILD AND DEPLOYMENT PROBLEMS

1. `npm run lint` (`tsc --noEmit`) has **5 pre-existing type errors**:
   - `server/donationDb.ts`: `userId`, `verifiedAt`, `verifiedBy` not on `DonationRequest`
   - `server/walletDb.ts`: `totalCredited`, `totalSpent` (should be `totalCreditsAdded`/`totalCreditsSpent`), `balanceAfter` (should be `updatedBalance`)
2. `server.ts:23`: `PORT = 3000` hardcoded — must use `process.env.PORT` for Render.
3. No health-check dependency validation (`/api/health` returns static `ok: true`).
4. No unhandled-promise-rejection handler.
5. No `npm test` script defined (test files use `node:test` but no runner configured).
6. `.env` contains real secrets locally (gitignored, OK) but no `.env.production` template with empty values for required secrets.
7. `vercel.json` present but project targets Render — config mismatch, harmless.

---

## 9. EXACT FILES REQUIRING MODIFICATION

### Backend
- `server.ts` — PORT env, auth middleware, permission middleware for all admin modules, CRUD routes, session secret from env only, rate limiting, health check, error handling
- `server/supportDb.ts` — Remove hardcoded passwords, Supabase-primary reads/writes (awaited), sub-admin auth from Supabase with password hashes, staff auth from Supabase, session tokens signed with `SUPPORT_SESSION_SECRET` env
- `server/walletDb.ts` — Awaited Supabase writes, DB transactions for financial ops, idempotency, remove ephemeral dependency
- `server/siteDb.ts` — Awaited Supabase writes, full category/item/config CRUD
- `server/donationDb.ts` — Fix type mismatches, awaited Supabase writes
- `server/supabaseAdmin.ts` — Keep (service-role client)
- `server/paymentGateway.ts` — Move secrets to env/protected storage, not JSON file
- `server/supportDiscord.ts` — Move webhook config to Supabase/protected storage

### Frontend
- `src/components/AdminLoginModal.tsx` — Remove hardcoded password, backend-only verification, store token not password
- `src/components/AdminPanelModal.tsx` — Backend permission enforcement, fetch data from APIs
- `src/App.tsx` — Fetch shared data from backend APIs, remove localStorage-as-source-of-trust
- `src/context/StoreConfigContext.tsx` — Fetch config/theme from backend
- `src/context/OrderContext.tsx` — Fetch orders from backend
- `src/context/CartContext.tsx` — Keep localStorage only for cart (acceptable), coupons from backend
- `src/services/storageAdapter.ts` — Downgrade to cache-only
- `src/services/supportService.ts` — Add owner/sub-admin login endpoints
- `src/lib/firebase.ts` — Keep Supabase Auth for users

### New files
- `supabase/migrations/001_*.sql` through `00N_*.sql` — versioned migrations
- `scripts/migrate-to-supabase.ts` — safe, idempotent, report-only migration script
- `server/middleware/auth.ts` — centralized auth + permission middleware
- `server/services/` — reusable backend services (optional refactor)

### Config
- `.env.example` — add all required vars with empty values
- `package.json` — add `test` script, optionally `bcrypt`/`argon2` dependency

---

## 10. ENVIRONMENT VARIABLES REQUIRED (production)

| Variable | Source | Notes |
|----------|--------|-------|
| `SUPABASE_URL` | Backend only | Already in `.env.example` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only | Already in `.env.example` |
| `VITE_SUPABASE_URL` | Frontend | Already in `.env.example` |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Already in `.env.example` |
| `ADMIN_SECURITY_KEY` | Backend only | Owner verification secret |
| `SUPPORT_SESSION_SECRET` | Backend only | Session signing secret (strong, stable) |
| `RAZORPAY_KEY_ID` | Backend only | Payment gateway |
| `RAZORPAY_KEY_SECRET` | Backend only | Payment gateway |
| `RAZORPAY_WEBHOOK_SECRET` | Backend only | Webhook signature |
| `GATEWAY_SIGNING_SECRET` | Backend only | Sandbox challenge signing |
| `DISCORD_WEBHOOK_URL` | Backend only | Optional |
| `PORT` | Backend | Render injects |

**Never expose** `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `ADMIN_SECURITY_KEY`, `SUPPORT_SESSION_SECRET` via `VITE_` or frontend code.

---

## 11. ACCEPTANCE CRITERIA STATUS (pre-work)

| Criterion | Status |
|-----------|--------|
| Owner login works securely | ❌ Hardcoded password, frontend verification |
| Sub-admin login works securely | ❌ Frontend trusts submitted list/passwords |
| Staff login works securely | ❌ Hardcoded default passkey |
| Backend permissions enforced | ❌ Only 9 of ~21 modules authorized |
| Raw passwords never used as session tokens | ❌ `wondermc_admin_auth_token` = raw password |
| No hardcoded production credentials | ❌ Multiple |
| All shared store data persists in Supabase | ❌ localStorage primary |
| Wallet/payment records safe and consistent | ❌ Fire-and-forget writes, no transactions |
| Support data persists in Supabase | ❌ Background upserts only |
| Donation data persists in Supabase | ❌ Background upserts only |
| Admin settings persist in Supabase | ❌ localStorage primary |
| Existing DB records intact | N/A (not yet migrated) |
| Data survives restarts/Render redeploys | ❌ Ephemeral JSON + session secret file |
| Different browsers see same shared data | ❌ localStorage per-browser |
| Build and tests pass | ❌ lint errors; no test script |
| Existing functionality intact | N/A |

---

**END OF AUDIT**

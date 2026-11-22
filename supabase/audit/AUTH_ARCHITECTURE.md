# WONDERMC — Authentication & Authorization Architecture

## Overview

All credential verification happens **exclusively on the backend**. The frontend
never verifies a password and never grants itself permissions. Only a signed,
expiring session **token** is stored in browser `sessionStorage` — never a raw
password.

## Roles

| Role | Credential store | Verification | Permissions |
|------|------------------|--------------|-------------|
| **Owner** | `ADMIN_SECURITY_KEY` env var | Constant-time comparison in `handleOwnerLogin` | All admin permissions |
| **Sub-admin** | Supabase `subadmin_keys.password_hash` (scrypt) | `verifyPassword` in `handleSubAdminLogin` | Only explicitly assigned `permissions` |
| **Support staff** | Supabase `support_staff_permissions.passkey_hash` (scrypt) | `verifyPassword` in `handleStaffLogin` | Support ticket permissions |
| **Customer (user)** | Supabase Auth (`auth.users`) | Supabase Auth SDK (`src/lib/firebase.ts`) | Own data only |

## Login endpoints

- `POST /api/admin/auth/owner-login` → `{ passkey }`
- `POST /api/admin/auth/subadmin-login` → `{ id, password }`
- `POST /api/support/auth/staff-login` → `{ passkey }`
- `POST /api/support/auth/user-session` → `{ uid, email, displayName }` (issues a user-scoped session token for support/wallet APIs; the uid comes from the authenticated Supabase Auth session)

All login endpoints are rate-limited (10 attempts/minute, 15-minute block).

## Password hashing

Node's built-in `crypto.scrypt` (N=2^15, 64-byte key, random 16-byte salt) produces
`scryptv1$<salt>$<hash>` strings. Verification uses `crypto.timingSafeEqual`.
No plaintext credential is ever stored in Supabase or the browser.

## Session tokens

- Format: `base64url(JSON payload).base64url(HMAC-SHA256 signature)`
- Signing key: `SUPPORT_SESSION_SECRET` (environment variable, >=32 chars, stable across deploys — **never a local file**)
- Payload: `{ kind, uid, email?, name, isAdmin, isOwner, staffId?, roleTitle?, subPermissions?, exp }`
- TTL: 12 hours
- Verified on **every** protected request: signature (constant-time) + expiration + required fields. Malformed/expired tokens are rejected.

## Token storage

`sessionStorage` keys (set in `src/services/supportService.ts`):
- `wondermc_support_staff_token` — staff/admin signed token
- `wondermc_support_staff_session` — staff/admin session metadata
- `wondermc_support_user_token` — customer support/wallet signed token

**No** raw password is ever stored. Logout clears these keys and the in-memory session.

## Authorization middleware (`server/middleware/auth.ts`)

- `requireSupportSession` — any valid token
- `requireStaffSession` — staff/admin kind
- `requirePermission(perm)` — server-side check of a specific admin tab permission (owner/admin always pass; sub-admin/staff need the permission explicitly)
- `requireOwnerOrAdmin` — owner/admin only

Every admin CRUD route in `server.ts` uses these middleware guards. Frontend
UI restrictions (`allowedTabs`) are convenience only and never substitute for
backend authorization.

## Permission set

`dashboard, users, staff, supporters, categories, themes, click_animations,
products, orders, wallet, payment_management, coupon_management, discounts,
tickets, updates, vote, payment, passwords, settings, activity_log, guide,
rules, donations`.

Owner receives all. Sub-admins receive only their assigned subset. Legacy alias
behavior is preserved via `PERMISSION_ALIASES` (e.g. `wallet` → `coupon_management`,
`themes` ↔ `click_animations`, `categories` → `settings`).

## Removed vulnerabilities

- Hardcoded owner password (backend + frontend bundle) — removed
- Hardcoded default staff passkey (`supportpass123`) — removed
- Frontend owner/sub-admin verification — removed
- Frontend sending sub-admin lists/passwords to backend — removed
- Backend trusting caller-supplied permissions — removed
- Raw password used as session token / `x-admin-key` — removed
- Ephemeral `session_secret.key` file — removed
- Missing backend permission coverage — all admin routes guarded

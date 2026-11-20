# WONDER MC – Migration from Firebase to Supabase

This document describes the completed migration of the WONDER MC storefront from Firebase Authentication + Firestore + local JSON/localStorage to **Supabase Authentication + PostgreSQL**.

## What Changed

- **Authentication**: Firebase Auth replaced with Supabase Auth (Google OAuth + email/password).
- **Database**: All persistent data (tickets, wallets, payments, orders, donations, site config, etc.) now stored in Supabase PostgreSQL.
- **Frontend persistence**: `localStorage` is retained only as a short-lived cache. Source of truth is the Express backend writing to Supabase.
- **Removed**: `firebase` package, `firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.rules`, Firestore error handlers, and all direct Firestore client writes.
- **Added**: `@supabase/supabase-js`, `src/lib/supabase.ts`, `server/supabaseAdmin.ts`, `supabase/schema.sql`.

## Required Environment Variables

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The **service role key must only be used on the server**. Never commit it or expose it to the browser.

## Supabase Project Setup

1. Create a new project at [https://supabase.com](https://supabase.com).
2. Go to **SQL Editor** and paste the entire contents of `supabase/schema.sql`. Run it.
3. Go to **Authentication → Providers → Google** and enable Google.
   - Create OAuth credentials in Google Cloud Console.
   - Add the authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
   - Paste Client ID and Client Secret into Supabase.
4. In **Authentication → URL Configuration**, add your site URL and redirect URLs (e.g. `http://localhost:3000`, your production domain).
5. Copy the Project URL, anon key, and service role key into your `.env`.

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project → **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Authorized redirect URIs:
   - `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
5. Copy Client ID and Client Secret into Supabase Auth Google provider settings.
6. Enable the Google provider in Supabase.

## Backend Notes

- The Express server (`server.ts` + `server/*Db.ts`) now writes to Supabase via the service role client when the environment variables are present.
- Local JSON files in `data/` remain as an emergency fallback only.
- Session tokens for support/admin continue to work as before; user identity now comes from Supabase Auth.

## Frontend Notes

- `src/lib/firebase.ts` still exists for import compatibility but now implements Supabase Auth.
- Auth state, Google login, and email/password login go through Supabase.
- Contexts (`StoreConfigContext`, `OrderContext`, `WalletContext`, `TicketContext`, etc.) continue to work; they load from backend APIs that persist to Supabase.

## Build & Test

```bash
npm install
npm run build
npm start
```

After setting environment variables:

- Test Google login and email/password registration/login.
- Create a support ticket and verify it appears in the `support_tickets` table.
- Perform a wallet recharge or order and verify rows in `user_wallets`, `payments`, `orders`.
- Confirm admin/staff permissions still restrict sensitive endpoints.

## Remaining Work / Recommendations

- Convert the large `*Db.ts` classes from synchronous in-memory + background upsert to fully async Supabase queries for better scalability.
- Add more granular RLS policies if direct client access is expanded.
- Remove the legacy local JSON fallback once Supabase is confirmed stable in production.
- Rename `src/lib/firebase.ts` → `src/lib/auth.ts` and update imports when convenient.

## Files Removed

- `firebase-applet-config.json`
- `firebase-blueprint.json`
- `firestore.rules`
- `.firestore_quota.json`
- Firebase dependency and `@firebase/eslint-plugin-security-rules`

## Files Added / Modified

- `supabase/schema.sql` (new)
- `src/lib/supabase.ts` (new)
- `server/supabaseAdmin.ts` (new)
- `src/lib/firebase.ts` (rewritten for Supabase Auth)
- `server/siteDb.ts`, `server/supportDb.ts`, `server/walletDb.ts`, `server/donationDb.ts` (persistence updated)
- `src/services/supportService.ts` (Firestore mirroring removed)
- `package.json`, `.env.example`, `eslint.config.js`
- `src/services/storageAdapter.ts` (comments updated)

All existing UI, admin panel, wallet, support tickets, payments, donations, and store features remain intact.

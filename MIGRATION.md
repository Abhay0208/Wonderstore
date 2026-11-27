# WonderMC Database & Authentication Status

## Current verified architecture

This project currently has a mixed persistence architecture:

- Firebase Authentication is used by the frontend for Google sign-in and optional email/password sign-in.
- The frontend can write a verified user's profile to Firestore.
- The Express backend's main support, wallet, donation, and site configuration modules still use local JSON files under `data/`.
- `server/firebase.ts` initializes the Firebase Admin SDK for server-side token verification and future Firestore operations.
- Supabase-related files are still present as legacy code. They are not the active source of truth for the main database modules.

**Firestore is not yet the source of truth for all application data.** Do not delete the local `data/` directory or assume that wallet, payment, donation, support-ticket, or site configuration records have been migrated.

## Firebase environment

Create `.env.local` from `.env.example` and set the values from your Firebase project.

Frontend Firebase Web SDK values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIRESTORE_DATABASE_ID` (only if using a named Firestore database)

Server-only Firebase Admin values:

- `FIREBASE_PROJECT_ID`
- `GOOGLE_APPLICATION_CREDENTIALS`

Place the downloaded service-account JSON at the configured path. Keep it out of ZIP uploads, Git, and browser code.

Authentication secrets:

- `ADMIN_SECURITY_KEY` — owner passkey; use a strong unique value.
- `SUPPORT_SESSION_SECRET` — at least 32 random bytes, stored only on the server.

Never expose these server secrets through variables prefixed with `VITE_`.

## Authentication hardening included in this source

- Staff passkeys are stored as salted scrypt hashes.
- Legacy plaintext staff passkeys are invalidated and the affected staff account is disabled while its profile and permissions are retained.
- The support database performs the credential migration during server startup.
- Staff passkeys are never returned by the staff listing or save APIs.
- A disabled staff account without a valid hash cannot be reactivated until a new passkey is set.
- Staff login is rate-limited.
- User support sessions must be minted from a verified Firebase ID token. A browser-supplied UID is not trusted.
- Legacy local-fallback account passwords are migrated from plaintext to salted PBKDF2 hashes on the account's next successful login.
- A corrupt support database is not silently replaced with an empty database.

## Firestore migration still required

The next database phase must migrate these backend JSON stores to Firestore:

- `data/site_db.json`
- `data/support_db.json`
- `data/wallet_db.json`
- `data/donations_db.json`

That migration must include:

1. A verified export/backup of each JSON database.
2. A documented Firestore collection/document schema.
3. A one-time import script with idempotent writes and validation.
4. Backend read/write changes so Firestore becomes the source of truth.
5. Server-side authorization for every read and write.
6. Tests for ticket ownership, staff permissions, wallet balance integrity, payment idempotency, and donation records.
7. A rollback procedure that preserves the original JSON files until production verification is complete.

Do not treat a successful Firebase connection test as proof that the main application databases have migrated.

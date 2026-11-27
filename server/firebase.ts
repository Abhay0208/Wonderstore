import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import path from 'node:path';
import {
  cert,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import {
  getAuth,
  type DecodedIdToken,
} from 'firebase-admin/auth';
import {
  getFirestore,
  type Firestore,
} from 'firebase-admin/firestore';

let adminApp: App | null = null;

function getFirebaseAdminApp(): App | null {
  if (adminApp) return adminApp;

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const credentialsPath = (
    process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
  ).trim();

  if (!projectId || !credentialsPath) {
    console.warn(
      '[Firebase Admin] FIREBASE_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS is missing.'
    );
    return null;
  }

  try {
    const existing = getApps().find(
      (app) => app.name === '[DEFAULT]'
    );

    adminApp =
      existing ||
      initializeApp({
        credential: cert(path.resolve(credentialsPath)),
        projectId,
      });

    return adminApp;
  } catch (error) {
    console.error(
      '[Firebase Admin] Initialization failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return null;
  }
}

export async function verifyFirebaseIdToken(
  token: string
): Promise<DecodedIdToken | null> {
  const app = getFirebaseAdminApp();

  if (!app || !token || token.length > 12000) {
    return null;
  }

  try {
    return await getAuth(app).verifyIdToken(token, true);
  } catch {
    return null;
  }
}

/**
 * Returns the configured Firestore database.
 * If FIRESTORE_DATABASE_ID is omitted, the default database is used.
 */
export function getFirestoreAdmin(): Firestore | null {
  const app = getFirebaseAdminApp();

  if (!app) return null;

  try {
    const databaseId = (
      process.env.FIRESTORE_DATABASE_ID || ''
    ).trim();

    return databaseId
      ? getFirestore(app, databaseId)
      : getFirestore(app);
  } catch (error) {
    console.error(
      '[Firestore] Database initialization failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return null;
  }
}

/**
 * Use this in database modules.
 * Throws a clear error instead of silently operating without Firestore.
 */
export function getFirestoreAdminOrThrow(): Firestore {
  const db = getFirestoreAdmin();

  if (!db) {
    throw new Error(
      'Firestore is unavailable. Check FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS and FIRESTORE_DATABASE_ID.'
    );
  }

  return db;
}

/**
 * Backwards-compatible export.
 * New database modules should use getFirestoreAdminOrThrow().
 */
export const firestore = getFirestoreAdmin();

export default firestore;

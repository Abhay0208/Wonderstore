import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import path from 'node:path';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let adminApp: App | null = null;
let adminInitAttempted = false;

function getFirebaseAdminApp(): App | null {
  if (adminApp) return adminApp;
  if (adminInitAttempted) return null;
  adminInitAttempted = true;

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  const credentialsPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

  if (!projectId || !credentialsPath) {
    console.warn('[Firebase Admin] Firebase Admin credentials are not configured.');
    return null;
  }

  try {
    const existing = getApps().find((app) => app.name === '[DEFAULT]');
    adminApp = existing || initializeApp({
      credential: cert(path.resolve(credentialsPath)),
      projectId,
    });
    return adminApp;
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export async function verifyFirebaseIdToken(token: string): Promise<DecodedIdToken | null> {
  const app = getFirebaseAdminApp();
  if (!app || !token || token.length > 12000) return null;
  try {
    return await getAuth(app).verifyIdToken(token, true);
  } catch {
    return null;
  }
}

export function getFirestoreAdmin(): Firestore | null {
  const app = getFirebaseAdminApp();
  return app ? getFirestore(app) : null;
}

export const firestore = getFirestoreAdmin();
export default firestore;

import dotenv from 'dotenv';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  dotenv.config({ path: '.env.local' });

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!projectId || !credentialsPath) {
    throw new Error('Firebase environment settings are missing');
  }

  const fullPath = path.resolve(credentialsPath);
  const serviceAccount = JSON.parse(readFileSync(fullPath, 'utf8'));

  if (serviceAccount.project_id !== projectId) {
    throw new Error('Firebase Project ID does not match service account');
  }

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId,
  });

  const db = getFirestore(app);
  const ref = db.collection('_connection_tests')
    .doc(`test_${Date.now()}`);

  try {
    await ref.set({
      test: true,
      message: 'WonderSt Firestore connection verified',
      createdAt: new Date().toISOString(),
    });

    const snapshot = await ref.get();

    if (!snapshot.exists || snapshot.data()?.test !== true) {
      throw new Error('Firestore read verification failed');
    }

    console.log('FIRESTORE WRITE: SUCCESS');
    console.log('FIRESTORE READ: SUCCESS');

    await ref.delete();
    console.log('TEST DOCUMENT CLEANUP: SUCCESS');
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error('FIRESTORE TEST FAILED:', error.message);
  process.exitCode = 1;
});

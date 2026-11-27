import {
  FieldValue,
  type CollectionReference,
  type DocumentData,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import { getFirestoreAdminOrThrow } from './firebase';

export function getDatabase(): Firestore {
  return getFirestoreAdminOrThrow();
}

export function getCollection(
  name: string
): CollectionReference {
  return getDatabase().collection(name);
}

export async function getDocument<T = Record<string, unknown>>(
  collectionName: string,
  documentId: string
): Promise<(T & { id: string }) | null> {
  const snapshot = await getCollection(collectionName)
    .doc(documentId)
    .get();

  if (!snapshot.exists) return null;

  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as T & { id: string };
}

export async function setDocument(
  collectionName: string,
  documentId: string,
  data: object,
  merge = true
): Promise<void> {
  await getCollection(collectionName)
    .doc(documentId)
    .set(data as DocumentData, { merge });
}

export async function deleteDocument(
  collectionName: string,
  documentId: string
): Promise<void> {
  await getCollection(collectionName)
    .doc(documentId)
    .delete();
}

export async function runFirestoreTransaction<T>(
  callback: (
    transaction: Transaction,
    database: Firestore
  ) => Promise<T>,
  maxAttempts = 5
): Promise<T> {
  const database = getDatabase();

  return database.runTransaction(
    (transaction) => callback(transaction, database),
    { maxAttempts }
  );
}

export const firestoreValues = {
  serverTimestamp: () => FieldValue.serverTimestamp(),
  increment: (amount: number) => FieldValue.increment(amount),
  deleteField: () => FieldValue.delete(),
};

/**
 * Modular Authentication & Firestore Client Adapter.
 *
 * Uses Firebase Authentication (`firebase/auth`) for Google Sign-In (`signInWithPopup`)
 * and Email/Password auth (with seamless fallback to local account store when the remote
 * Email/Password provider is disabled), and connects Firestore (`db`) to database
 * `ai-studio-wonder-aa667724-25f3-407f-b7d7-4569f0df30ac` for verified Firebase users.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDocFromServer,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
  firestoreDatabaseId: import.meta.env.VITE_FIRESTORE_DATABASE_ID || '',
};
import {
  CustomUser,
  normalizeEmail,
  validateAuthInputs,
  shouldFallbackToLocalEmailAuth,
  reconcileAuthState,
} from '../utils/authHelpers';

export type { CustomUser };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

const CUSTOM_USERS_KEY = 'wondermc_custom_users_v1';
const ACTIVE_LOCAL_USER_KEY = 'wondermc_active_user';
const AUTH_CHANGE_EVENT = 'wondermc:auth-change';

interface StoredLocalAccount {
  email: string;
  passHash?: string;
  /** Legacy plaintext field; removed after the account's next successful login. */
  pass?: string;
  user: CustomUser;
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;

try {
  if (firebaseConfig?.apiKey && firebaseConfig?.authDomain && firebaseConfig?.projectId) {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firestoreDb = firebaseConfig.firestoreDatabaseId
      ? getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId)
      : getFirestore(firebaseApp);
  }
} catch (err) {
  console.warn('[Firebase Init] Firebase initialization warning:', err);
}

export const db = firestoreDb;
export const firebaseAuthInstance = firebaseAuth;

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const fbUser = firebaseAuth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: fbUser?.uid,
      email: fbUser?.email,
      emailVerified: fbUser?.emailVerified,
      isAnonymous: fbUser?.isAnonymous,
      providerInfo:
        fbUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
  };
  console.warn('[Firestore Diagnostic]', JSON.stringify(errInfo));
  return errInfo;
}

// Validate Firestore connection on client boot without blocking UI
if (firestoreDb) {
  const testRef = doc(firestoreDb, 'test', 'connection');
  getDocFromServer(testRef).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('client is offline')) {
      console.warn('[Firestore Boot] Client offline or Firestore unavailable; API backend remains active.');
    }
  });
}

// Safely sync verified Firebase customer profile to /users/{uid}
export async function syncFirebaseUserProfile(user: FirebaseUser): Promise<void> {
  if (!firestoreDb || !user.emailVerified) return;
  try {
    await setDoc(
      doc(firestoreDb, 'users', user.uid),
      {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Player'),
        photoURL: user.photoURL || '',
        role: 'player',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }
}

export const auth = {
  currentUser: null as CustomUser | null,
};

function createAuthError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

const getCustomUsers = (): StoredLocalAccount[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredLocalAccount[]) : [];
  } catch {
    return [];
  }
};

const saveCustomUsers = (users: StoredLocalAccount[]) => {
  try {
    localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore storage quota limits
  }
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function hashLocalPassword(password: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw createAuthError('auth/operation-not-supported', 'Secure local authentication is unavailable in this browser.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    key,
    256,
  ));
  return `pbkdf2v1$${bytesToHex(salt)}$${bytesToHex(derived)}`;
}

async function verifyLocalPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'pbkdf2v1') return false;
    const saltHex = parts[1];
    const expectedHex = parts[2];
    if (!/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{64}$/i.test(expectedHex)) return false;

    const actual = await hashLocalPasswordWithSalt(password, saltHex);
    if (actual.length !== expectedHex.length) return false;
    let difference = 0;
    for (let i = 0; i < actual.length; i += 1) {
      difference |= actual.charCodeAt(i) ^ expectedHex.toLowerCase().charCodeAt(i);
    }
    return difference === 0;
  } catch {
    return false;
  }
}

async function hashLocalPasswordWithSalt(password: string, saltHex: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return '';
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    key,
    256,
  ));
  return bytesToHex(derived);
}

export function mapFirebaseUser(user: FirebaseUser | CustomUser): CustomUser {
  if ('providerData' in user) {
    return {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Player'),
      photoURL: user.photoURL || null,
      emailVerified: user.emailVerified,
      isLocalFallback: false,
    };
  }
  return user;
}

export const getLocalActiveUser = (): CustomUser | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_LOCAL_USER_KEY);
    const parsed = raw ? (JSON.parse(raw) as CustomUser) : null;
    if (parsed) {
      auth.currentUser = parsed;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const setLocalActiveUser = (user: CustomUser | null) => {
  auth.currentUser = user;
  try {
    if (user) {
      localStorage.setItem(ACTIVE_LOCAL_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(ACTIVE_LOCAL_USER_KEY);
    }
    window.dispatchEvent(new CustomEvent<CustomUser | null>(AUTH_CHANGE_EVENT, { detail: user }));
  } catch {
    // ignore
  }
};

export const signInWithGoogle = async (): Promise<CustomUser> => {
  if (!firebaseAuth) {
    throw createAuthError(
      'auth/configuration-not-found',
      'Google Sign-In is not configured. Please check Firebase authentication settings.'
    );
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(firebaseAuth, provider);
  void syncFirebaseUserProfile(result.user);
  const mapped = mapFirebaseUser(result.user);
  setLocalActiveUser(mapped);
  return mapped;
};

async function registerLocalAccount(
  cleanEmail: string,
  cleanPassword: string,
  cleanName: string
): Promise<CustomUser> {
  const users = getCustomUsers();
  const existing = users.find((u) => normalizeEmail(u.email) === cleanEmail);
  if (existing) {
    throw createAuthError(
      'auth/email-already-in-use',
      'An account with this email address already exists.'
    );
  }

  const customUser: CustomUser = {
    uid: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    email: cleanEmail,
    displayName: cleanName,
    photoURL: null,
    emailVerified: true,
    isLocalFallback: true,
  };

  const passHash = await hashLocalPassword(cleanPassword);
  users.push({ email: cleanEmail, passHash, user: customUser });
  saveCustomUsers(users);
  setLocalActiveUser(customUser);
  return customUser;
}

async function loginLocalAccount(cleanEmail: string, cleanPassword: string): Promise<CustomUser> {
  const users = getCustomUsers();
  const match = users.find((u) => normalizeEmail(u.email) === cleanEmail);
  if (!match) {
    throw createAuthError('auth/user-not-found', 'Invalid email or password.');
  }
  let passwordValid = false;
  if (match.passHash) {
    passwordValid = await verifyLocalPassword(cleanPassword, match.passHash);
    if (passwordValid && typeof match.pass === 'string') {
      const migrated = users.map((account) => {
        if (normalizeEmail(account.email) !== cleanEmail) return account;
        const { pass: _legacyPlaintext, ...safeAccount } = account;
        return safeAccount;
      });
      saveCustomUsers(migrated);
    }
  } else if (typeof match.pass === 'string' && match.pass === cleanPassword) {
    // One-time migration of legacy localStorage plaintext credentials.
    passwordValid = true;
    const passHash = await hashLocalPassword(cleanPassword);
    const migrated = users.map((account) => {
      if (normalizeEmail(account.email) !== cleanEmail) return account;
      const { pass: _legacyPlaintext, ...safeAccount } = account;
      return { ...safeAccount, passHash };
    });
    saveCustomUsers(migrated);
  }
  if (!passwordValid) {
    throw createAuthError('auth/wrong-password', 'Invalid email or password.');
  }
  const activeUser: CustomUser = { ...match.user, isLocalFallback: true };
  setLocalActiveUser(activeUser);
  return activeUser;
}

const REMOTE_EMAIL_AUTH_ENABLED =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_FIREBASE_EMAIL_AUTH === 'true';
const EMAIL_PROVIDER_DISABLED_KEY = 'wondermc_remote_email_auth_disabled';

function isRemoteEmailAuthDisabled(): boolean {
  if (!REMOTE_EMAIL_AUTH_ENABLED) return true;
  try {
    return sessionStorage.getItem(EMAIL_PROVIDER_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function markRemoteEmailAuthDisabled() {
  try {
    sessionStorage.setItem(EMAIL_PROVIDER_DISABLED_KEY, '1');
  } catch {
    // ignore
  }
}

export const registerWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<CustomUser> => {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = password.trim();
  const cleanName = displayName?.trim() || cleanEmail.split('@')[0] || 'Player';

  const validationError = validateAuthInputs({
    mode: 'register',
    email: cleanEmail,
    password: cleanPassword,
    displayName,
  });
  if (validationError) {
    const code = validationError.toLowerCase().includes('password')
      ? 'auth/weak-password'
      : 'auth/invalid-email';
    throw createAuthError(code, validationError);
  }

  const existingLocal = getCustomUsers().find((u) => normalizeEmail(u.email) === cleanEmail);
  if (existingLocal) {
    throw createAuthError(
      'auth/email-already-in-use',
      'An account with this email address already exists.'
    );
  }

  if (firebaseAuth && !isRemoteEmailAuthDisabled()) {
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, cleanPassword);
      if (cleanName && cred.user.displayName !== cleanName) {
        await updateProfile(cred.user, { displayName: cleanName }).catch(() => undefined);
      }
      const mapped: CustomUser = {
        ...mapFirebaseUser(cred.user),
        displayName: cleanName,
      };
      setLocalActiveUser(mapped);
      return mapped;
    } catch (err) {
      if (!shouldFallbackToLocalEmailAuth(err)) {
        throw err;
      }
      markRemoteEmailAuthDisabled();
    }
  }

  return registerLocalAccount(cleanEmail, cleanPassword, cleanName);
};

export const loginWithEmail = async (
  email: string,
  password: string
): Promise<CustomUser> => {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = password.trim();

  const validationError = validateAuthInputs({
    mode: 'login',
    email: cleanEmail,
    password: cleanPassword,
  });
  if (validationError) {
    const code = validationError.toLowerCase().includes('password')
      ? 'auth/invalid-credential'
      : 'auth/invalid-email';
    throw createAuthError(code, validationError);
  }

  const localMatch = getCustomUsers().find((u) => normalizeEmail(u.email) === cleanEmail);
  if (localMatch) {
    return loginLocalAccount(cleanEmail, cleanPassword);
  }

  if (firebaseAuth && !isRemoteEmailAuthDisabled()) {
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, cleanPassword);
      const mapped = mapFirebaseUser(cred.user);
      setLocalActiveUser(mapped);
      return mapped;
    } catch (err: any) {
      if (!shouldFallbackToLocalEmailAuth(err)) {
        throw err;
      }
      markRemoteEmailAuthDisabled();
    }
  }

  return loginLocalAccount(cleanEmail, cleanPassword);
};

export const signOutUser = async (): Promise<void> => {
  if (firebaseAuth) {
    await signOut(firebaseAuth).catch(() => undefined);
  }
  setLocalActiveUser(null);
};

export function onAuthStateChanged(
  _authRef: typeof auth,
  callback: (user: CustomUser | null) => void
): () => void {
  const notify = () => {
    const fbUser = firebaseAuth?.currentUser ? mapFirebaseUser(firebaseAuth.currentUser) : null;
    const localUser = getLocalActiveUser();
    const resolved = reconcileAuthState(fbUser, localUser);
    auth.currentUser = resolved;
    callback(resolved);
  };

  const initialLocal = getLocalActiveUser();
  if (!firebaseAuth || initialLocal?.isLocalFallback === true) {
    notify();
  }

  const unsubscribeFirebase = firebaseAuth
    ? firebaseOnAuthStateChanged(firebaseAuth, (fbUser) => {
        if (fbUser) {
          void syncFirebaseUserProfile(fbUser);
        }
        const mapped = fbUser ? mapFirebaseUser(fbUser) : null;
        const localUser = getLocalActiveUser();
        const resolved = reconcileAuthState(mapped, localUser);
        if (mapped) {
          auth.currentUser = mapped;
          try {
            localStorage.setItem(ACTIVE_LOCAL_USER_KEY, JSON.stringify(mapped));
          } catch {
            // ignore
          }
        } else {
          auth.currentUser = resolved;
          if (localUser && localUser.isLocalFallback !== true) {
            try {
              localStorage.removeItem(ACTIVE_LOCAL_USER_KEY);
            } catch {
              // ignore
            }
          }
        }
        callback(resolved);
      })
    : () => undefined;

  const handleLocalChange = () => {
    notify();
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_LOCAL_USER_KEY) {
      notify();
    }
  };

  window.addEventListener(AUTH_CHANGE_EVENT, handleLocalChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    unsubscribeFirebase();
    window.removeEventListener(AUTH_CHANGE_EVENT, handleLocalChange);
    window.removeEventListener('storage', handleStorage);
  };
}

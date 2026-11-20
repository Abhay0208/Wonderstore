/**
 * Authentication adapter using Supabase Auth.
 *
 * Supports:
 * - Google OAuth
 * - Email/password registration and login
 * - Session persistence
 * - Logout
 * - Profile synchronization
 *
 * Replaces the previous Firebase Authentication implementation.
 */

import { getSupabase } from './supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  CustomUser,
  normalizeEmail,
  validateAuthInputs,
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

const ACTIVE_LOCAL_USER_KEY = 'wondermc_active_user';
const AUTH_CHANGE_EVENT = 'wondermc:auth-change';

export const auth = {
  currentUser: null as CustomUser | null,
};

function createAuthError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function mapSupabaseUser(user: SupabaseUser | null): CustomUser | null {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    uid: user.id,
    email: user.email || '',
    displayName:
      meta.display_name ||
      meta.full_name ||
      meta.name ||
      (user.email ? user.email.split('@')[0] : 'Player'),
    photoURL: meta.avatar_url || meta.picture || null,
    emailVerified: !!user.email_confirmed_at,
    isLocalFallback: false,
  };
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
  const sb = getSupabase();
  if (!sb) {
    throw createAuthError(
      'auth/configuration-not-found',
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) {
    throw createAuthError(error.name || 'auth/oauth-error', error.message);
  }

  // OAuth redirects; the session will be picked up by onAuthStateChanged after redirect.
  // For popup-style UX we still return a placeholder; real user comes from session.
  const session = await sb.auth.getSession();
  const mapped = mapSupabaseUser(session.data.session?.user || null);
  if (mapped) {
    setLocalActiveUser(mapped);
    return mapped;
  }

  throw createAuthError('auth/popup-closed-by-user', 'Google sign-in was cancelled or redirected.');
};

export const registerWithEmail = async (
  email: string,
  password: string,
  displayName?: string
): Promise<CustomUser> => {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = password.trim();
  const cleanName = (displayName || '').trim() || cleanEmail.split('@')[0] || 'Player';

  const validationError = validateAuthInputs({
    mode: 'register',
    email: cleanEmail,
    password: cleanPassword,
    displayName: cleanName,
  });
  if (validationError) {
    const code = validationError.toLowerCase().includes('password')
      ? 'auth/weak-password'
      : 'auth/invalid-email';
    throw createAuthError(code, validationError);
  }

  const sb = getSupabase();
  if (!sb) {
    throw createAuthError('auth/configuration-not-found', 'Supabase is not configured.');
  }

  const { data, error } = await sb.auth.signUp({
    email: cleanEmail,
    password: cleanPassword,
    options: {
      data: { display_name: cleanName },
    },
  });

  if (error) {
    throw createAuthError(error.name || 'auth/signup-error', error.message);
  }

  const mapped = mapSupabaseUser(data.user);
  if (mapped) {
    setLocalActiveUser(mapped);
    return mapped;
  }

  throw createAuthError('auth/signup-error', 'Account created but no user returned.');
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

  const sb = getSupabase();
  if (!sb) {
    throw createAuthError('auth/configuration-not-found', 'Supabase is not configured.');
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email: cleanEmail,
    password: cleanPassword,
  });

  if (error) {
    throw createAuthError(error.name || 'auth/invalid-credential', error.message);
  }

  const mapped = mapSupabaseUser(data.user);
  if (mapped) {
    setLocalActiveUser(mapped);
    return mapped;
  }

  throw createAuthError('auth/invalid-credential', 'Invalid email or password.');
};

export const signOutUser = async (): Promise<void> => {
  const sb = getSupabase();
  if (sb) {
    await sb.auth.signOut();
  }
  setLocalActiveUser(null);
};

export function onAuthStateChanged(
  _auth: typeof auth,
  callback: (user: CustomUser | null) => void
): () => void {
  const sb = getSupabase();
  if (!sb) {
    // Fallback to local only
    const local = getLocalActiveUser();
    callback(local);
    return () => {};
  }

  const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
    const mapped = mapSupabaseUser(session?.user || null);
    setLocalActiveUser(mapped);
    callback(mapped);
  });

  // Also emit current session immediately
  sb.auth.getSession().then(({ data }) => {
    const mapped = mapSupabaseUser(data.session?.user || null);
    if (mapped) {
      setLocalActiveUser(mapped);
      callback(mapped);
    }
  });

  return () => {
    listener.subscription.unsubscribe();
  };
}

// Compatibility stubs so existing imports do not break immediately
export const firestore = null;
export const db = null;

export function handleFirestoreError(_err: unknown, _op: OperationType, _path: string | null) {
  // No-op: Firestore removed
}

export async function syncUserProfile(_user: CustomUser) {
  // Profile is created via database trigger on auth.users insert
}

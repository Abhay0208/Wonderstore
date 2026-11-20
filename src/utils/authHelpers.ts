export interface CustomUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  emailVerified?: boolean;
  isLocalFallback?: boolean;
}

export type AuthMode = 'login' | 'register';
export type AuthContextAction = AuthMode | 'google';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function validateAuthInputs(params: {
  mode: AuthMode;
  email: string;
  password: string;
  displayName?: string;
}): string | null {
  const cleanEmail = normalizeEmail(params.email);
  const cleanPassword = params.password.trim();

  if (!cleanEmail) {
    return 'Please enter your email address.';
  }
  if (!EMAIL_REGEX.test(cleanEmail)) {
    return 'Please enter a valid email address.';
  }
  if (!cleanPassword) {
    return 'Please enter your password.';
  }
  if (params.mode === 'register' && cleanPassword.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  if (params.mode === 'register' && params.displayName && params.displayName.trim().length > 60) {
    return 'Display name must be 60 characters or fewer.';
  }
  return null;
}

export function shouldFallbackToLocalEmailAuth(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
  return (
    code === 'auth/operation-not-allowed' ||
    code === 'auth/admin-restricted-operation' ||
    code === 'auth/configuration-not-found' ||
    code === 'auth/app-not-authorized'
  );
}

export function getFriendlyAuthError(err: unknown, action: AuthContextAction): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
  const msg = err instanceof Error ? err.message : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled before completing.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window is already open.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'Google Sign-In is not authorized for this domain. Open the hosted app URL or add this domain in Firebase Console → Authentication → Settings → Authorized domains, or sign in with Email & Password.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.';
    case 'auth/operation-not-allowed':
      return action === 'google'
        ? 'Google Sign-In is not enabled in Firebase Authentication.'
        : 'Email/Password sign-in is disabled on the remote server.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please log in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please check your credentials.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to authentication service. Check your connection and retry.';
    default:
      if (msg && !msg.includes('Firebase:')) {
        return msg;
      }
      if (action === 'google') return 'Failed to log in with Google. Please try again.';
      return action === 'register' ? 'Failed to create account. Please try again.' : 'Failed to sign in. Please try again.';
  }
}

export function isExpectedAuthError(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
  return (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/email-already-in-use' ||
    code === 'auth/invalid-email' ||
    code === 'auth/weak-password' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/popup-blocked' ||
    code === 'auth/unauthorized-domain'
  );
}

export function reconcileAuthState(
  firebaseUser: CustomUser | null,
  localUser: CustomUser | null
): CustomUser | null {
  if (firebaseUser) {
    return firebaseUser;
  }
  if (localUser && localUser.isLocalFallback === true) {
    return localUser;
  }
  return null;
}

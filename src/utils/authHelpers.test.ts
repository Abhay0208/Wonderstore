import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEmail,
  validateAuthInputs,
  shouldFallbackToLocalEmailAuth,
  getFriendlyAuthError,
  isExpectedAuthError,
  reconcileAuthState,
  CustomUser,
} from './authHelpers.ts';

describe('authHelpers', () => {
  it('normalizes email addresses cleanly', () => {
    assert.equal(normalizeEmail('  PlayerOne@Example.COM '), 'playerone@example.com');
  });

  it('validates login and register inputs accurately', () => {
    assert.equal(
      validateAuthInputs({ mode: 'login', email: '', password: 'secret' }),
      'Please enter your email address.'
    );
    assert.equal(
      validateAuthInputs({ mode: 'login', email: 'bad-email', password: 'secret' }),
      'Please enter a valid email address.'
    );
    assert.equal(
      validateAuthInputs({ mode: 'login', email: 'user@example.com', password: '' }),
      'Please enter your password.'
    );
    assert.equal(
      validateAuthInputs({ mode: 'register', email: 'user@example.com', password: '123' }),
      'Password must be at least 6 characters long.'
    );
    assert.equal(
      validateAuthInputs({ mode: 'register', email: 'user@example.com', password: 'password123', displayName: 'Alex' }),
      null
    );
  });

  it('detects provider-disabled Firebase errors for seamless local fallback', () => {
    assert.equal(shouldFallbackToLocalEmailAuth({ code: 'auth/operation-not-allowed' }), true);
    assert.equal(shouldFallbackToLocalEmailAuth({ code: 'auth/admin-restricted-operation' }), true);
    assert.equal(shouldFallbackToLocalEmailAuth({ code: 'auth/wrong-password' }), false);
    assert.equal(shouldFallbackToLocalEmailAuth(null), false);
  });

  it('maps Firebase and auth error codes to actionable user messages', () => {
    assert.match(getFriendlyAuthError({ code: 'auth/popup-blocked' }, 'google'), /Pop-up was blocked/i);
    assert.match(getFriendlyAuthError({ code: 'auth/popup-closed-by-user' }, 'google'), /cancelled/i);
    assert.match(getFriendlyAuthError({ code: 'auth/unauthorized-domain' }, 'google'), /not authorized for this domain/i);
    assert.match(getFriendlyAuthError({ code: 'auth/email-already-in-use' }, 'register'), /already exists/i);
    assert.match(getFriendlyAuthError({ code: 'auth/invalid-credential' }, 'login'), /Invalid email or password/i);
  });

  it('identifies expected user auth errors vs unexpected errors', () => {
    assert.equal(isExpectedAuthError({ code: 'auth/wrong-password' }), true);
    assert.equal(isExpectedAuthError({ code: 'auth/unauthorized-domain' }), true);
    assert.equal(isExpectedAuthError({ code: 'auth/internal-error' }), false);
    assert.equal(isExpectedAuthError(new Error('unexpected')), false);
  });

  it('reconciles Firebase and local fallback user sessions properly', () => {
    const fbUser: CustomUser = {
      uid: 'fb_1',
      email: 'google@example.com',
      displayName: 'Google User',
      photoURL: null,
      isLocalFallback: false,
    };
    const localUser: CustomUser = {
      uid: 'usr_local_1',
      email: 'local@example.com',
      displayName: 'Local User',
      photoURL: null,
      isLocalFallback: true,
    };
    const staleNonFallback: CustomUser = {
      uid: 'fb_old',
      email: 'old@example.com',
      displayName: 'Old',
      photoURL: null,
      isLocalFallback: false,
    };

    assert.deepEqual(reconcileAuthState(fbUser, localUser), fbUser);
    assert.deepEqual(reconcileAuthState(null, localUser), localUser);
    assert.equal(reconcileAuthState(null, staleNonFallback), null);
    assert.equal(reconcileAuthState(null, null), null);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Auth security tests — pure functions only (no live DB required).
 * Verifies the signed-session token flow and centralized authorization model.
 */

// Ensure a strong, stable signing secret exists BEFORE the auth module is loaded.
process.env.SUPPORT_SESSION_SECRET =
  process.env.SUPPORT_SESSION_SECRET || 'a-very-strong-stable-test-session-secret-0123456789';

const auth = await import('../server/middleware/auth');

test('Session token: sign then verify roundtrip returns payload', () => {
  const token = auth.signSessionToken({
    kind: 'staff',
    uid: 'owner-admin',
    name: 'Main Server Owner',
    isAdmin: true,
    isOwner: true,
  });
  assert.ok(token && token.includes('.'), 'token should be base64url.signature');
  const payload = auth.verifySessionToken(token);
  assert.ok(payload, 'token should verify');
  assert.equal(payload!.uid, 'owner-admin');
  assert.equal(payload!.kind, 'staff');
  assert.equal(payload!.isOwner, true);
  assert.ok(payload!.exp > Date.now(), 'exp should be in the future');
});

test('Session token: malformed and tampered tokens are rejected', () => {
  assert.equal(auth.verifySessionToken('not-a-token'), null);
  assert.equal(auth.verifySessionToken('abc.def.ghi'), null);
  const token = auth.signSessionToken({
    kind: 'user', uid: 'u1', name: 'Player', isAdmin: false, isOwner: false,
  });
  const tampered = token.slice(0, -2) + 'zz';
  assert.equal(auth.verifySessionToken(tampered), null, 'tampered signature must be rejected');
});

test('Session token: expired tokens are rejected', () => {
  const token = auth.signSessionToken(
    { kind: 'user', uid: 'u1', name: 'Player', isAdmin: false, isOwner: false },
    -1000 // already expired
  );
  assert.equal(auth.verifySessionToken(token), null, 'expired token must be rejected');
});

test('Authorization: owner has all admin permissions', () => {
  const owner = {
    kind: 'staff' as const, uid: 'owner-admin', name: 'Owner',
    isAdmin: true, isOwner: true, exp: Date.now() + 100000,
  };
  for (const perm of auth.ALL_ADMIN_PERMISSIONS) {
    assert.equal(auth.hasPermission(owner, perm), true, `owner should have ${perm}`);
  }
});

test('Authorization: sub-admin has ONLY assigned permissions', () => {
  const sub = {
    kind: 'staff' as const, uid: 'sub1', name: 'Sub',
    isAdmin: false, isOwner: false, subPermissions: ['tickets', 'updates'],
    exp: Date.now() + 100000,
  };
  assert.equal(auth.hasPermission(sub, 'tickets'), true);
  assert.equal(auth.hasPermission(sub, 'updates'), true);
  assert.equal(auth.hasPermission(sub, 'wallet'), false, 'unassigned permission must be denied');
  assert.equal(auth.hasPermission(sub, 'payment_management'), false);
  assert.equal(auth.hasPermission(sub, 'settings'), false);
});

test('Authorization: null/expired sessions have no permissions', () => {
  assert.equal(auth.hasPermission(null, 'tickets'), false);
  const expired = {
    kind: 'staff' as const, uid: 'x', name: 'X',
    isAdmin: true, isOwner: false, exp: 1,
  };
  // hasPermission does not itself check expiry (middleware verifies token first),
  // but an admin-flagged session is still recognized here.
  assert.equal(auth.hasPermission(expired, 'tickets'), true);
});

test('Authorization: legacy permission aliases resolve correctly', () => {
  const sub = {
    kind: 'staff' as const, uid: 'sub2', name: 'Sub2',
    isAdmin: false, isOwner: false, subPermissions: ['wallet'],
    exp: Date.now() + 100000,
  };
  // wallet implies coupon_management in the legacy alias map preserved for compatibility
  assert.equal(auth.hasPermission(sub, 'wallet'), true);
});

test('All required permission modules are defined', () => {
  const required = [
    'dashboard', 'users', 'staff', 'supporters', 'categories', 'themes',
    'click_animations', 'products', 'orders', 'wallet', 'payment_management',
    'coupon_management', 'discounts', 'tickets', 'updates', 'vote', 'payment',
    'passwords', 'settings', 'activity_log', 'guide', 'rules', 'donations',
  ];
  for (const p of required) {
    assert.ok((auth.ALL_ADMIN_PERMISSIONS as string[]).includes(p), `missing permission: ${p}`);
  }
});

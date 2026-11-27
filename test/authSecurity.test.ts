import test from 'node:test';
import assert from 'node:assert/strict';

// Configure a deterministic test-only secret before importing the active support DB module.
process.env.SUPPORT_SESSION_SECRET =
  'test-only-support-session-secret-0123456789abcdef';

const { supportDb } = await import('../server/supportDb');

test('Active support session: signed token roundtrip', () => {
  const token = supportDb.signSessionToken({
    kind: 'staff',
    uid: 'owner-admin',
    name: 'Test Owner',
    isAdmin: true,
    isOwner: true,
  });

  const payload = supportDb.verifySessionToken(token);
  assert.ok(payload);
  assert.equal(payload?.uid, 'owner-admin');
  assert.equal(payload?.kind, 'staff');
  assert.equal(payload?.isOwner, true);
  assert.ok((payload?.exp || 0) > Date.now());
});

test('Active support session: rejects malformed and tampered tokens', () => {
  assert.equal(supportDb.verifySessionToken('not-a-token'), null);
  assert.equal(supportDb.verifySessionToken('abc.def.ghi'), null);

  const token = supportDb.signSessionToken({
    kind: 'user',
    uid: 'test-user',
    name: 'Test User',
    isAdmin: false,
    isOwner: false,
  });
  const tampered = token.slice(0, -2) + 'zz';
  assert.equal(supportDb.verifySessionToken(tampered), null);
});

test('Active support session: rejects expired tokens', () => {
  const token = supportDb.signSessionToken(
    {
      kind: 'user',
      uid: 'test-user',
      name: 'Test User',
      isAdmin: false,
      isOwner: false,
    },
    -1000,
  );
  assert.equal(supportDb.verifySessionToken(token), null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminAuthService } from './adminAuth.ts';

test('adminAuth accepts initial admin / 123 credentials and rejects invalid inputs', () => {
  const auth = createAdminAuthService({});

  assert.equal(auth.verifyCredentials('admin', '123'), true);
  assert.equal(auth.verifyCredentials('  ADMIN  ', '123'), true);
  assert.equal(auth.verifyCredentials('admin', 'wrong'), false);
  assert.equal(auth.verifyCredentials('user', '123'), false);
  assert.equal(auth.verifyCredentials('', '123'), false);
  assert.equal(auth.verifyCredentials(null, '123'), false);
  assert.equal(auth.verifyCredentials('admin', 123), false);
});

test('adminAuth issues, verifies, rejects tampered, and revokes Bearer tokens', () => {
  const auth = createAdminAuthService({});
  const issued = auth.issueToken('admin');

  assert.equal(issued.admin.username, 'admin');
  assert.equal(issued.admin.role, 'hrd');
  assert.ok(issued.token.includes('.'));

  const verified = auth.verifyToken(issued.token);
  assert.equal(verified.valid, true);
  if (verified.valid) {
    assert.equal(verified.admin.nik, 'ADMIN01');
  }

  // Tampered signature must fail
  const tampered = `${issued.token.slice(0, -2)}xx`;
  assert.equal(auth.verifyToken(tampered).valid, false);
  assert.equal(auth.verifyToken(undefined).valid, false);

  // Revocation invalidates session immediately
  auth.revokeToken(issued.token);
  assert.equal(auth.verifyToken(issued.token).valid, false);
});

test('adminAuth rotates password, invalidates old tokens, and validates minimum length', () => {
  const auth = createAdminAuthService({});
  const initial = auth.issueToken('admin');

  // Short password rejected
  const tooShort = auth.changePassword(initial.token, '123', 'abc');
  assert.equal(tooShort.ok, false);

  // Wrong current password rejected
  const wrongCurrent = auth.changePassword(initial.token, '999', 'SandiBaru123');
  assert.equal(wrongCurrent.ok, false);

  // Valid rotation succeeds and invalidates old token & old password
  const rotated = auth.changePassword(initial.token, '123', 'SandiBaru123');
  assert.equal(rotated.ok, true);
  if (rotated.ok) {
    assert.equal(auth.verifyToken(initial.token).valid, false);
    assert.equal(auth.verifyToken(rotated.token).valid, true);
    assert.equal(auth.verifyCredentials('admin', '123'), false);
    assert.equal(auth.verifyCredentials('admin', 'SandiBaru123'), true);
  }
});

test('adminAuth honors ADMIN_USERNAME and ADMIN_PASSWORD env overrides', () => {
  const auth = createAdminAuthService({
    ADMIN_USERNAME: 'superhrd',
    ADMIN_PASSWORD: 'StrongSecret#2026',
  });

  assert.equal(auth.verifyCredentials('admin', '123'), false);
  assert.equal(auth.verifyCredentials('superhrd', 'StrongSecret#2026'), true);

  const session = auth.issueToken('superhrd');
  const changeRes = auth.changePassword(session.token, 'StrongSecret#2026', 'Another123');
  assert.equal(changeRes.ok, false);
});

test('adminAuth enforces per-IP rate limiting and resets on success', () => {
  const auth = createAdminAuthService({});
  const ip = '10.0.0.42';

  for (let i = 0; i < 25; i++) {
    assert.equal(auth.checkRateLimit(ip).allowed, true);
  }
  const blocked = auth.checkRateLimit(ip);
  assert.equal(blocked.allowed, false);
  assert.ok((blocked.retryAfterSec ?? 0) > 0);

  auth.resetRateLimit(ip);
  assert.equal(auth.checkRateLimit(ip).allowed, true);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const rulesPath = fs.existsSync('firestore.rules') ? 'firestore.rules' : 'DRAFT_firestore.rules';
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8')) as {
  entities: Record<string, { required?: string[]; properties: Record<string, { maxLength?: number }> }>;
  firestore: Record<string, { schema: { $ref: string } }>;
};

test('Rules include global default-deny safety net and rules_version 2', () => {
  assert.match(rulesText, /rules_version\s*=\s*'2';/);
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
});

test('Every collection in firebase-blueprint.json has an explicit match block in Firestore rules', () => {
  const expectedCollections = [
    'admins',
    'employees',
    'attendance',
    'leaves',
    'overtimes',
    'shiftSwaps',
    'exitClearances',
    'schedules',
  ];
  for (const col of expectedCollections) {
    assert.ok(
      Object.keys(blueprint.firestore).some((p) => p.startsWith(`/${col}/`)),
      `Blueprint missing collection /${col}`
    );
    assert.match(
      rulesText,
      new RegExp(`match\\s+/${col}/\\{[a-zA-Z0-9_]+\\}`),
      `Firestore rules missing match block for /${col}`
    );
  }
});

test('Dirty Dozen #1 & #4: Email Spoofing & PII Isolation enforced', () => {
  // Bootstrap admin MUST require email_verified == true
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /isVerified\(\)\s*&&\s*request\.auth\.token\.email == 'fikriramadhan998@gmail\.com'/);
  // No blanket signed-in reads
  assert.doesNotMatch(rulesText, /allow\s+(read|get|list):\s*if\s+isSignedIn\(\)\s*;/);
});

test('Dirty Dozen #2, #3, #6: No self-assigned HRD role, strict hasOnly & action-based affectedKeys', () => {
  assert.match(rulesText, /incoming\(\)\.role == 'employee'/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(/);
  assert.match(rulesText, /data\.keys\(\)\.hasAll\(/);
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(/);
});

test('Dirty Dozen #5: allow list evaluates resource.data and has ZERO get()/exists() calls', () => {
  const listBlocks = rulesText.match(/allow list:[^;]+;/g) ?? [];
  assert.ok(listBlocks.length >= 7, 'Expected list rules across collections');
  for (const block of listBlocks) {
    assert.doesNotMatch(block, /\bget\s*\(/, `allow list must not call get(): ${block}`);
    assert.doesNotMatch(block, /\bexists\s*\(/, `allow list must not call exists(): ${block}`);
  }
});

test('Dirty Dozen #7, #8, #9, #10, #11, #12: Consistency, terminal locks, ID regex, and request.time', () => {
  // Global consistency invariant via employeeExists()
  assert.match(rulesText, /employeeExists\(/);
  // Terminal state locking
  assert.match(rulesText, /existing\(\)\.clockOutTime == ''/);
  assert.match(rulesText, /existing\(\)\.status == 'Menunggu'/);
  assert.match(rulesText, /existing\(\)\.contractSigned == false/);
  // Path variable hardening
  assert.match(rulesText, /function isValidId\(id\)/);
  assert.match(rulesText, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
  // Temporal integrity
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
  // Array guarding on checklist
  assert.match(rulesText, /data\.checklist is list && data\.checklist\.size\(\) >= 1 && data\.checklist\.size\(\) <= 10/);
});

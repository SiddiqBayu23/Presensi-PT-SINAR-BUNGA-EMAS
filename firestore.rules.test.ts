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

test('3-role supervisor routing: validasi atasan, tier review, dan batas payroll', () => {
  // Whitelist 3 peran; HRD wajib berada di divisi HRD.
  assert.match(rulesText, /data\.role in \['hrd', 'supervisor', 'employee'\]/);
  assert.match(rulesText, /data\.role != 'hrd' \|\| data\.division == 'HRD'/);

  // supervisorUid harus supervisor aktif di divisi yang sama (get()/exists() hanya di create/update).
  assert.match(rulesText, /function isValidSupervisorAssignment\(data\)/);
  assert.match(rulesText, /\.data\.role == 'supervisor' &&/);
  const assignmentChecks = rulesText.match(/isValidSupervisorAssignment\(incoming\(\)\)/g) ?? [];
  assert.ok(
    assignmentChecks.length >= 4,
    `Empat koleksi pengajuan wajib memvalidasi supervisorUid saat create/update (ditemukan ${assignmentChecks.length})`
  );

  // Tier update supervisor (4 koleksi) + jalur get (4 koleksi) yang dirutekan ke dirinya.
  const updateTiers = rulesText.match(/routedToSupervisor\(existing\(\)\)\s*&&/g) ?? [];
  assert.equal(updateTiers.length, 4);
  // Jalur baca: 4 allow get via routedToSupervisor() + 6 allow list via field supervisorUid
  // (employees, attendance, dan 4 koleksi pengajuan).
  const getPaths = rulesText.match(/routedToSupervisor\(existing\(\)\)\s*\);/g) ?? [];
  assert.equal(getPaths.length, 4);
  const listPaths = rulesText.match(/resource\.data\.supervisorUid == request\.auth\.uid/g) ?? [];
  assert.equal(listPaths.length, 6);

  // Absen masuk memaku supervisorUid ke atasan pada profil karyawan sendiri.
  assert.match(
    rulesText,
    /incoming\(\)\.get\('supervisorUid', ''\) == get\(\/databases\/\$\(database\)\/documents\/employees\/\$\(request\.auth\.uid\)\)\.data\.get\('supervisorUid', ''\)/
  );




  // Supervisor tidak boleh menyetujui pengajuannya sendiri.
  assert.match(rulesText, /existing\(\)\.uid != request\.auth\.uid/);

  // Supervisor hanya boleh menurunkan kuota cuti & mengubah shift bawahan — bukan payroll/role.
  assert.match(rulesText, /function isSupervisor\(\)/);
  assert.match(rulesText, /incoming\(\)\.leaveQuota <= existing\(\)\.leaveQuota/);
  assert.match(
    rulesText,
    /isSupervisor\(\)\s*&&\s*existing\(\)\.get\('supervisorUid', ''\) == request\.auth\.uid/
  );
});

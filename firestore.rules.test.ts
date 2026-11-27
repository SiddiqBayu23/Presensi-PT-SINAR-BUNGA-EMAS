import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildShiftCode } from './src/utils/hrisLogic';

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
    'employeeProfiles',
    'employeeDocuments',
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
  // Jalur baca: 4 allow get via routedToSupervisor() + 7 allow list via field supervisorUid
  // (employees, attendance, 4 koleksi pengajuan, dan schedules).
  const getPaths = rulesText.match(/routedToSupervisor\(existing\(\)\)\s*\);/g) ?? [];
  assert.equal(getPaths.length, 4);
  const listPaths = rulesText.match(/resource\.data\.supervisorUid == request\.auth\.uid/g) ?? [];
  assert.equal(listPaths.length, 7);
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
  assert.match(rulesText, /function isScheduleSupervisor\(uid\)/);
  assert.match(rulesText, /isScheduleSupervisor\(incoming\(\)\.uid\)/);
  assert.match(rulesText, /isScheduleSupervisor\(existing\(\)\.uid\)/);
  assert.match(rulesText, /\(resource == null && isVerified\(\)\)/);
});

test('Gerbang nonaktif: setiap jalur tulis mandiri karyawan dijaga isActiveEmployee()', () => {
  // Helper wajib menolak secara default: `active` tidak ada -> false (jangan pakai != false),
  // dan tetap memverifikasi identitas pemanggil + keberadaan dokumen kepegawaiannya.
  assert.match(
    rulesText,
    /function isActiveEmployee\(\)\s*\{\s*return isVerified\(\)\s*&&\s*employeeExists\(request\.auth\.uid\)\s*&&\s*get\(\/databases\/\$\(database\)\/documents\/employees\/\$\(request\.auth\.uid\)\)\.data\.active == true;\s*\}/
  );

  const lines = rulesText.split(/\r?\n/);
  const selfService = ['employees', 'attendance', 'leaves', 'overtimes', 'shiftSwaps', 'exitClearances', 'schedules'];
  for (const collection of selfService) {
    const start = lines.findIndex((line) => new RegExp(`^    match /${collection}/\\{`).test(line));
    assert.ok(start >= 0, `match block /${collection} tidak ditemukan`);
    const end = lines.findIndex((line, index) => index > start && line === '    }');
    assert.ok(end > start, `match block /${collection} tidak tertutup`);
    const block = lines.slice(start, end + 1).join('\n');
    assert.match(
      block,
      /isActiveEmployee\(\)/,
      `Jalur tulis mandiri /${collection} tidak dijaga isActiveEmployee() — karyawan nonaktif (active: false) bisa menulis`
    );
  }
});

test('Gerbang shift menerima kode katalog buatan HRD, bukan hanya 5 shift bawaan', () => {
  const body = rulesText.match(/function isValidShift\(shift\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(body, 'function isValidShift tidak ditemukan di firestore.rules');
  const source = body![1];

  // Kode shift kustom dibuat buildShiftCode() (huruf besar/angka/underscore) — pola wajib,
  // bukan daftar tertutup, supaya shift baru tidak ditolak produksi sebelum sempat dipakai.
  assert.doesNotMatch(source, /shift in \[/, 'isValidShift masih memakai daftar tertutup');
  assert.match(source, /shift\.size\(\) >= 2 && shift\.size\(\) <= 16/, 'batas panjang shift hilang');
  const pattern = source.match(/shift\.matches\('([^']+)'\)/);
  assert.ok(pattern, 'pola kode shift tidak ditemukan di isValidShift');
  const regex = new RegExp(pattern![1].replace(/\\\\/g, '\\'));
  // isValidShift = batas panjang (`size()`) DAN pola; keduanya wajib dievaluasi bersama.
  const accepts = (code: string) => code.length >= 2 && code.length <= 16 && regex.test(code);

  const accepted = [
    'REGULER',
    'PAGI',
    'SIANG',
    'MALAM',
    'SECURITY24',
    'SHIFT_SORE',
    'SHIFT_2',
    'A1',
    'JAGA_MALAM_2026',
  ];
  for (const code of accepted) {
    assert.ok(accepts(code), `kode shift "${code}" ditolak oleh isValidShift`);
  }

  const rejected = [
    'A', // terlalu pendek
    'SHIFT_', // underscore di akhir
    'SHIFT SORE', // spasi
    'shift_sore', // huruf kecil
    'SHIFT-SORE', // tanda hubung
    'SHIFT_SORE_1234567', // > 16 karakter
    "REGULER' OR 1==1",
  ];
  for (const code of rejected) {
    assert.ok(!accepts(code), `kode shift tidak sah "${code}" diterima isValidShift`);
  }

  // Kode hasil buildShiftCode untuk nama bebas HRD wajib lolos pola yang sama.
  for (const name of ['Shift Sore', 'Jaga Malam 2', 'IT Support', 'Shift Jumat Pendek']) {
    const code = buildShiftCode(name, []);
    assert.ok(accepts(code), `hasil buildShiftCode("${name}") = "${code}" ditolak isValidShift`);
  }
});

test('Data pribadi karyawan tinggal di /employeeProfiles dan dapat ditulis pemilik atau HRD', () => {
  const personalKeys = [
    'ktpNumber',
    'kkNumber',
    'fullNameKtp',
    'birthPlace',
    'birthDate',
    'ktpAddress',
    'gender',
    'motherName',
    'workRegion',
    'maritalStatus',
    'childrenCount',
    'bankName',
    'bankAccountNumber',
    'bankAccountName',
    'emergencyContactName',
    'emergencyContactPhone',
    'lastEducation',
  ];

  // /employees bebas PII: anggaran 1000 ekspresi rule per request sudah penuh tanpa
  // kolom pribadi, dan dokumen ini juga dibaca supervisor untuk roster tim.
  const employeeValidator = rulesText.match(/function isValidEmployee\(data\) \{([\s\S]*?)\n    \}/);
  assert.ok(employeeValidator, 'function isValidEmployee tidak ditemukan');
  for (const key of personalKeys) {
    assert.ok(
      !employeeValidator![1].includes(`'${key}'`),
      `kolom PII '${key}' tidak boleh lagi ada di isValidEmployee`
    );
  }

  const profileValidator = rulesText.match(
    /function isValidEmployeeProfile\(data\) \{([\s\S]*?)\n    \}/
  );
  assert.ok(profileValidator, 'function isValidEmployeeProfile tidak ditemukan');
  for (const key of personalKeys) {
    assert.ok(
      profileValidator![1].includes(`'${key}'`),
      `hasOnly isValidEmployeeProfile tidak memuat '${key}'`
    );
  }

  // NIK/KK wajib tepat 16 digit atau kosong; tanggal lahir wajib ISO; enum tertutup.
  const sixteenDigits = rulesText.match(/function isOptionalSixteenDigits\(value\) \{([\s\S]*?)\n    \}/);
  assert.ok(sixteenDigits, 'function isOptionalSixteenDigits tidak ditemukan');
  assert.match(sixteenDigits![1], /value\.size\(\) == 16/);
  assert.match(sixteenDigits![1], /value\.matches\('\^\[0-9\]\+\$'\)/);
  assert.match(profileValidator![1], /isOptionalSixteenDigits\(data\.get\('ktpNumber', ''\)\)/);
  assert.match(profileValidator![1], /isOptionalSixteenDigits\(data\.get\('kkNumber', ''\)\)/);
  assert.match(
    profileValidator![1],
    /isOptionalEnum\(data\.get\('gender', ''\), \['', 'Laki-laki', 'Perempuan'\]\)/
  );
  assert.match(profileValidator![1], /'Cerai Hidup', 'Cerai Mati'\]\)/);
  assert.match(profileValidator![1], /'SMA\/SMK', 'D3', 'S1', 'S2', 'S3'\]\)/);
  assert.match(profileValidator![1], /data\.get\('childrenCount', 0\) is int/);
  assert.match(profileValidator![1], /isValidIsoDate\(data\.get\('birthDate', ''\)\)/);

  const block = rulesText.match(/match \/employeeProfiles\/\{employeeId\} \{([\s\S]*?)\n    \}/);
  assert.ok(block, 'match block /employeeProfiles tidak ditemukan');
  const source = block![1];
  assert.doesNotMatch(source, /allow (read|write)\b/, 'dilarang ada allow read/write menyeluruh');
  assert.match(source, /allow get: if isValidId\(employeeId\) && \(isOwner\(employeeId\) \|\| isAdmin\(\)\);/);
  assert.match(
    source,
    /allow list: if isVerified\(\) &&\s*\(resource\.data\.uid == request\.auth\.uid \|\| isBootstrapAdmin\(\)\);/
  );
  assert.match(source, /\(isAdmin\(\) \|\| isOwner\(employeeId\)\)/);
  assert.match(source, /incoming\(\)\.uid == employeeId/);
  assert.match(source, /incoming\(\)\.uid == existing\(\)\.uid/);
  assert.match(source, /isValidEmployeeProfile\(incoming\(\)\)/);
  assert.match(source, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(source, /allow delete: if false;/);

  // Tier HRD pada /employees tidak lagi memuat kolom PII.
  const hrdTier = rulesText.match(
    /isAdmin\(\)\s*&&\s*isValidSupervisorAssignment\(incoming\(\)\)\s*&&\s*incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/
  );
  assert.ok(hrdTier, 'tier HRD pada rule update employees tidak ditemukan');
  for (const key of personalKeys) {
    assert.ok(
      !hrdTier![1].includes(`'${key}'`),
      `affectedKeys tier HRD masih memuat kolom PII '${key}'`
    );
  }
});
test('Scan KTP/KK: pemilik atau HRD dapat mengelola dokumen pada id "{uid}_{kind}"', () => {
  const block = rulesText.match(/match \/employeeDocuments\/\{documentId\} \{([\s\S]*?)\n    \}/);
  assert.ok(block, 'match block /employeeDocuments tidak ditemukan');
  const source = block![1];

  assert.doesNotMatch(source, /allow (read|write)\b/, 'dilarang ada allow read/write menyeluruh');
  assert.match(source, /allow get: if isValidId\(documentId\) &&\s*\(isOwner\(existing\(\)\.uid\) \|\| isAdmin\(\)\);/);
  assert.match(
    source,
    /allow list: if isVerified\(\) &&\s*\(resource\.data\.uid == request\.auth\.uid \|\| isBootstrapAdmin\(\)\);/
  );
  assert.match(source, /documentId == incoming\(\)\.uid \+ '_' \+ incoming\(\)\.kind/);
  assert.match(source, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(source, /\(isAdmin\(\) \|\| isOwner\(incoming\(\)\.uid\)\)/);
  assert.match(source, /allow delete: if isValidId\(documentId\) &&\s*\(isAdmin\(\) \|\| isOwner\(existing\(\)\.uid\)\);/);

  const validator = rulesText.match(/function isValidEmployeeDocument\(data\) \{([\s\S]*?)\n    \}/);
  assert.ok(validator, 'function isValidEmployeeDocument tidak ditemukan');
  assert.match(validator![1], /dataUrl\.size\(\) <= 700000/);
  assert.match(validator![1], /dataUrl\.matches\('\^data:image\/jpeg;base64,'\)/);
  assert.match(validator![1], /data\.kind in \['ktp', 'kk'\]/);
  assert.match(validator![1], /hasOnly\(\['uid', 'kind', 'dataUrl', 'createdAt', 'updatedAt'\]\)/);
});

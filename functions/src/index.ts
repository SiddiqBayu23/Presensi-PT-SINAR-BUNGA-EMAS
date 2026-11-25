/**
 * Backend Firebase PT Sinar Bunga Mas (One Stop Business Services).
 *
 * Fungsi di sini menggantikan operasi istimewa yang sebelumnya dijalankan di klien
 * (`provisionEmployeeAccount` di src/firebase.ts memakai createUserWithEmailAndPassword,
 * sehingga siapa pun yang memegang apiKey publik bisa mendaftar sendiri).
 *
 * Sumber otoritas hak akses tetap dokumen Firestore `admins/{uid}` dan `employees/{uid}`
 * supaya `firestore.rules` (dan firestore.rules.test.ts) tidak perlu diubah. Fungsi
 * trigger menerjemahkannya menjadi klaim kustom `role` agar `storage.rules` — yang tidak
 * bisa membaca Firestore — punya sumber kebenaran yang sama.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

/** Database bernama (bukan `(default)`) — sama dengan firestoreDatabaseId di firebase-applet-config.json. */
const DATABASE_ID = 'ai-studio-ptsinarbungamasa-df6f62f5-f72a-4811-b3c7-0e5c822f6913';

const app = initializeApp();
const db = getFirestore(app, DATABASE_ID);
const auth = getAuth(app);

setGlobalOptions({ region: 'asia-southeast2', maxInstances: 10 });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firebaseCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return '';
}

/** Baca satu field string dari `request.data` tanpa mengasumsikan bentuknya. */
function readString(source: unknown, key: string): string {
  if (source === null || typeof source !== 'object') return '';
  const value: unknown = Reflect.get(source, key);
  return typeof value === 'string' ? value : '';
}

/** Hanya administrator HRD terverifikasi (dokumen `admins/{uid}`) yang boleh memanggil. */
async function assertAdmin(request: CallableRequest): Promise<string> {
  const caller = request.auth;
  if (!caller) {
    throw new HttpsError('unauthenticated', 'Anda harus login terlebih dahulu.');
  }
  if (caller.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Verifikasi email akun Anda terlebih dahulu.');
  }
  const grant = await db.doc(`admins/${caller.uid}`).get();
  if (!grant.exists) {
    throw new HttpsError('permission-denied', 'Akun ini bukan administrator HRD.');
  }
  return caller.uid;
}

/**
 * Membuat akun login karyawan dan mengembalikan uid-nya (uid = id dokumen `employees/{uid}`,
 * yang ditulis klien HRD setelah fungsi ini sukses).
 * Karyawan memverifikasi emailnya lewat layar "Verifikasi email" di aplikasi
 * (`resendVerificationEmail`), jadi tidak perlu layanan email tambahan.
 */
export const provisionEmployee = onCall(async (request) => {
  await assertAdmin(request);

  const email = readString(request.data, 'email').trim().toLowerCase();
  const password = readString(request.data, 'password');
  const displayName = readString(request.data, 'displayName').trim();

  if (!EMAIL_PATTERN.test(email) || email.length > 120) {
    throw new HttpsError('invalid-argument', 'Format email tidak valid.');
  }
  if (password.length < 6 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'Kata sandi awal harus 6–128 karakter.');
  }
  if (displayName.length < 2 || displayName.length > 100) {
    throw new HttpsError('invalid-argument', 'Nama karyawan harus 2–100 karakter.');
  }

  try {
    const created = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
      disabled: false,
    });
    return { uid: created.uid };
  } catch (error) {
    if (firebaseCode(error) === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Email ini sudah terdaftar.');
    }
    throw new HttpsError('internal', 'Gagal membuat akun karyawan.');
  }
});

/** Klaim `role` diturunkan dari dokumen sumber; dipakai `storage.rules`. */
async function syncRoleClaims(uid: string): Promise<void> {
  const [adminDoc, employeeDoc] = await Promise.all([
    db.doc(`admins/${uid}`).get(),
    db.doc(`employees/${uid}`).get(),
  ]);

  const employeeRole = employeeDoc.exists ? String(employeeDoc.get('role') ?? '') : '';
  const role = adminDoc.exists ? 'hrd' : employeeRole;

  try {
    await auth.setCustomUserClaims(uid, role ? { role } : null);
  } catch (error) {
    // Dokumen yatim (tidak ada akun Auth-nya) bukan kegagalan yang perlu diulang.
    if (firebaseCode(error) !== 'auth/user-not-found') throw error;
  }
}

export const onAdminGrantWritten = onDocumentWritten(
  { document: 'admins/{uid}', database: DATABASE_ID },
  async (event) => {
    await syncRoleClaims(event.params.uid);
  }
);

export const onEmployeeWritten = onDocumentWritten(
  { document: 'employees/{uid}', database: DATABASE_ID },
  async (event) => {
    await syncRoleClaims(event.params.uid);
  }
);

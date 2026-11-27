import { deleteApp, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  updateProfile,
} from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';

/** Region Cloud Functions (functions/src/index.ts memakai setGlobalOptions yang sama). */
const FUNCTIONS_REGION = 'asia-southeast2';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

/**
 * Mode emulator lokal untuk pengujian alur HRD/absensi tanpa menyentuh data produksi.
 * Hanya aktif saat `vite dev` dijalankan dengan VITE_FIREBASE_EMULATOR=true
 * (lihat firebase.json `emulators`); build produksi tidak pernah memakai jalur ini.
 */
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const provisionEmployeeCallable = httpsCallable<
  { email: string; password: string; displayName: string },
  { uid: string }
>(functions, 'provisionEmployee');

/**
 * Membuat akun login karyawan. Jalur utama adalah Cloud Function `provisionEmployee`
 * (memverifikasi pemanggil adalah HRD terverifikasi), yang hanya bisa dipasang pada
 * project ber-Blaze.
 *
 * Selama fungsi belum terpasang (project Spark tanpa Cloud Functions), akun dibuat dari
 * klien lewat instance app sekunder agar sesi Admin HRD tidak terganggu. Pengaman datanya
 * tetap `firestore.rules`: dokumen `employees/{uid}` hanya bisa ditulis HRD. Kalau fungsi
 * nanti sudah di-deploy, jalur klien otomatis tidak lagi dipakai.
 */
export async function provisionEmployeeAccount(
  email: string,
  password: string,
  displayName: string
): Promise<string> {
  try {
    const result = await provisionEmployeeCallable({ email, password, displayName });
    return result.data.uid;
  } catch (error) {
    if (!isCallableUnreachable(error)) throw error;
    console.warn(
      'Cloud Function provisionEmployee tidak dapat dihubungi; memakai provisi sisi klien.',
      error
    );
    return provisionEmployeeOnClient(email, password, displayName);
  }
}

/** Galat yang berarti "fungsi tidak tersedia/tidak terpasang" — bukan "pemanggil ditolak". */
const CALLABLE_UNREACHABLE: Record<string, true> = {
  'functions/not-found': true,
  'functions/unavailable': true,
  'functions/internal': true,
  'functions/deadline-exceeded': true,
};

function isCallableUnreachable(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) return false;
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' && CALLABLE_UNREACHABLE[code] === true;
}

const setEmployeeActiveCallable = httpsCallable<
  { uid: string; active: boolean },
  { uid: string; active: boolean }
>(functions, 'setEmployeeActive');

/**
 * Mengunci (atau membuka) akun login karyawan lewat Cloud Function `setEmployeeActive`, yang
 * mematikan akunnya di Firebase Auth — jadi login ditolak server, bukan hanya oleh aplikasi.
 *
 * Mengembalikan `false` bila fungsi belum terpasang (project Spark): akun masih bisa `signIn`,
 * tetapi `firestore.rules` menolak seluruh akses self-service karyawan nonaktif dan gerbang
 * sesi di aplikasi langsung menutup loginnya. Galat lain (mis. pemanggil bukan HRD) dilempar.
 */
export async function setEmployeeActiveAccount(uid: string, active: boolean): Promise<boolean> {
  try {
    await setEmployeeActiveCallable({ uid, active });
    return true;
  } catch (error) {
    if (!isCallableUnreachable(error)) throw error;
    console.warn(
      'Cloud Function setEmployeeActive tidak dapat dihubungi; akun login karyawan belum dikunci.',
      error
    );
    return false;
  }
}

async function provisionEmployeeOnClient(
  email: string,
  password: string,
  displayName: string
): Promise<string> {
  const secondaryApp = initializeApp(firebaseConfig, `provision-${Date.now()}`);
  try {
    const credential = await createUserWithEmailAndPassword(
      getAuth(secondaryApp),
      email,
      password
    );
    await updateProfile(credential.user, { displayName });
    return credential.user.uid;
  } finally {
    await deleteApp(secondaryApp).catch(() => undefined);
  }
}

/**
 * Batas panjang foto absensi yang disimpan di dokumen Firestore (karakter data URL).
 * Firestore membatasi 1 MiB per dokumen; dua foto @ ±30 KB tetap jauh di bawahnya.
 */
export const PHOTO_MAX_CHARS = 40000;

/** Sisi terpanjang foto yang disimpan (px) — membatasi jumlah piksel sehingga ukuran byte terbatas. */
const PHOTO_MAX_SIDE = 360;

/**
 * Batas panjang data URL scan dokumen karyawan (KTP/KK) di `employeeDocuments`.
 * Satu gambar per dokumen, jadi masih jauh di bawah batas 1 MiB per dokumen Firestore.
 */
export const EMPLOYEE_DOC_MAX_CHARS = 640000;

/**
 * Menyiapkan gambar untuk disimpan langsung sebagai data URL di dokumen Firestore
 * (project Spark tidak punya Cloud Storage). Gambar diperkecil sampai sisi terpanjang
 * `maxSide` (tidak pernah diperbesar), lalu kualitas JPEG diturunkan — dan bila perlu
 * diperkecil lagi sampai 44% `maxSide` — hingga panjang data URL ≤ `maxChars`.
 */
export async function compressImageForFirestore(
  dataUrl: string,
  options: { maxChars: number; maxSide: number }
): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D tidak tersedia di peramban ini.');

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Gambar tidak memiliki ukuran.');

  const sourceMaxSide = Math.max(sourceWidth, sourceHeight);
  const minSide = Math.max(96, Math.round(options.maxSide * 0.44));
  let maxSide = Math.min(sourceMaxSide, options.maxSide);
  for (;;) {
    const scale = maxSide / sourceMaxSide;
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (let quality = 0.8; quality >= 0.3; quality -= 0.1) {
      const encoded = canvas.toDataURL('image/jpeg', quality);
      if (encoded.length <= options.maxChars) return encoded;
    }
    if (maxSide <= minSide) return canvas.toDataURL('image/jpeg', 0.3);
    maxSide = Math.max(minSide, Math.round(maxSide * 0.75));
  }
}

/**
 * Foto absensi ber-watermark: 360 px, ≤ `PHOTO_MAX_CHARS` karakter (aman untuk rules).
 * Foto resolusi penuh tetap dipakai UI dari salinan sessionStorage.
 */
export function compressPhotoForFirestore(dataUrl: string): Promise<string> {
  return compressImageForFirestore(dataUrl, {
    maxChars: PHOTO_MAX_CHARS,
    maxSide: PHOTO_MAX_SIDE,
  });
}

// Bentuk executor dipakai (bukan Promise.withResolvers) karena lib ES2022 dan WebView
// Android lama belum menyediakan Promise.withResolvers.
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Foto absensi tidak dapat dibaca.'));
    image.src = dataUrl;
  });
}

export const BOOTSTRAP_ADMIN_EMAIL = 'fikriramadhan998@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

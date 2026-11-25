import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref, uploadString } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

/** Region Cloud Functions (functions/src/index.ts memakai setGlobalOptions yang sama). */
const FUNCTIONS_REGION = 'asia-southeast2';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const provisionEmployeeCallable = httpsCallable<
  { email: string; password: string; displayName: string },
  { uid: string }
>(functions, 'provisionEmployee');

/**
 * Membuat akun login karyawan lewat Cloud Function `provisionEmployee`.
 * Sebelumnya memakai `createUserWithEmailAndPassword` di klien — artinya siapa pun yang
 * memegang apiKey publik (yang memang tertanam di bundel) bisa mendaftar sendiri.
 * Fungsi ini memverifikasi pemanggil adalah HRD terverifikasi (`admins/{uid}`).
 * Mengembalikan uid; uid = id dokumen `employees/{uid}`.
 */
export async function provisionEmployeeAccount(
  email: string,
  password: string,
  displayName: string
): Promise<string> {
  const result = await provisionEmployeeCallable({ email, password, displayName });
  return result.data.uid;
}

/**
 * Mengunggah foto absensi ber-watermark GPS + WIB ke Cloud Storage.
 * Path: `attendance/{uid}/{yyyy-mm-dd}/{in|out}.jpg` — dijaga `storage.rules`.
 * Mengembalikan URL unduhan yang disimpan pada dokumen `attendance`.
 */
export async function uploadAttendancePhoto(
  uid: string,
  date: string,
  kind: 'in' | 'out',
  jpegDataUrl: string
): Promise<string> {
  const objectRef = ref(storage, `attendance/${uid}/${date}/${kind}.jpg`);
  await uploadString(objectRef, jpegDataUrl, 'data_url');
  return getDownloadURL(objectRef);
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

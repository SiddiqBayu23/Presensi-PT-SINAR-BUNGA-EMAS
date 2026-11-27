import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  EMPLOYEE_DOC_MAX_CHARS,
  OperationType,
  auth,
  compressPhotoForFirestore,
  db,
  googleProvider,
  handleFirestoreError,
  provisionEmployeeAccount,
  setEmployeeActiveAccount,
} from '../firebase';
import { EDUCATION_LEVELS, GENDERS, MARITAL_STATUSES } from '../types/hris';
import type {
  ApprovalStatus,
  AttendanceRecord,
  Division,
  DivisionShiftRule,
  EducationLevel,
  Employee,
  EmployeeDocumentKind,
  EmployeeGender,
  EmployeePersonalData,
  EmployeeProfile,
  ExitClearanceRequest,
  HrdEditableEmployeeFields,
  LeaveRequest,
  MaritalStatus,
  OvertimeRequest,
  PayrollSettings,
  PayslipComponent,
  ScheduleEntry,
  ShiftCode,
  ShiftSwapRequest,
  ShiftTemplate,
  ShiftTemplateInput,
  ShiftTolerance,
  UserPayrollConfig,
  UserRole,
  ThemeMode,
  TodoTask,
  TodoStatus,
  ReportType,
  WibComponents,
} from '../types/hris';
import {
  DEFAULT_PAYROLL_SETTINGS,
  DEFAULT_SHIFT_TOLERANCE,
  DEFAULT_WORK_DAYS_TARGET,
  SHIFT_TEMPLATES,
  allShiftTemplates,
  buildShiftTemplate,
  calculateInclusiveDays,
  calculateLateMinutes,
  calculateOvertimeEstimate,
  calculateWorkMinutes,
  defaultShiftForDivision,
  effectiveShiftForDate,
  findApprovedLeaveOnDate,
  findScheduleConflict,
  findShiftTemplate,
  generateEmployeeNik,
  getDivisionCompensationDefaults,
  getWibComponents,
  isShiftAllowedForDivision,
  isSixteenDigits,
  isValidEmailAddress,
  isValidIsoDateString,
  normalizeCustomShiftTemplates,
  normalizeShiftTime,
  registerHiddenShiftTemplates,
  registerShiftTemplates,
  resolveDivisionShiftRule,
  resolveShiftTemplate,
  sanitizeSixteenDigits,
  sanitizeString,
  schedulesMirroringProfileShift,
  shiftTemplateForDivision,
  shiftTemplateName,
  validateClockIn,
  validateClockOut,
  validateShiftSwap,
} from '../utils/hrisLogic';

const LOCAL_PHOTO_KEY = 'sbum_local_watermark_photos_v2';
const LOCAL_DIVISIONS_KEY = 'sbum_hris_divisions_v1';
const LOCAL_TODOS_KEY = 'sbum_hris_todos_v1';
const LOCAL_DIVISION_SHIFT_RULES_KEY = 'sbum_hris_division_shift_rules_v1';
/** Katalog shift buatan HRD (nama, jam masuk/pulang, toleransi) — dipakai lintas divisi. */
const LOCAL_SHIFT_TEMPLATES_KEY = 'sbum_hris_shift_templates_v1';
/** Kode shift bawaan yang dihapus HRD dari katalog (bisa dipulihkan). */
const LOCAL_HIDDEN_SHIFT_TEMPLATES_KEY = 'sbum_hris_hidden_shift_templates_v1';
const LOCAL_PAYSLIP_COMPONENTS_KEY = 'sbum_hris_payslip_components_v1';
const LOCAL_PAYROLL_SETTINGS_KEY = 'sbum_hris_payroll_settings_v1';
const LOCAL_USER_PAYROLL_CONFIGS_KEY = 'sbum_hris_user_payroll_configs_v1';

/** Preferensi tema tampilan (terang/gelap) yang dipilih user; bertahan lintas sesi. */
const LOCAL_THEME_KEY = 'sbum_theme_v1';

/** Baca tema tersimpan; jatuh ke preferensi sistem bila belum pernah dipilih. */
function loadStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(LOCAL_THEME_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    // Abaikan storage yang tidak tersedia.
  }
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Nilai enum opsional: dipakai bila cocok, selain itu string kosong (aman untuk rules). */
function sanitizeEnum<T extends string>(value: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

function loadStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveStoredJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota / privacy errors
  }
}

function loadStoredArray<T>(key: string, fallback: T[]): T[] {
  const parsed = loadStoredJson<unknown>(key, null);
  return Array.isArray(parsed) ? (parsed as T[]) : fallback;
}

function loadStoredRecord<T extends object>(key: string, fallback: T): T {
  const parsed = loadStoredJson<unknown>(key, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...fallback, ...(parsed as T) };
  }
  return fallback;
}

/** Salinan map per-shift tanpa satu kode (membersihkan jam/toleransi shift yang dihapus). */
function omitShiftKey<T>(
  record: Partial<Record<ShiftCode, T>> | undefined,
  code: ShiftCode
): Partial<Record<ShiftCode, T>> | undefined {
  if (!record || !(code in record)) return record;
  const next = { ...record };
  delete next[code];
  return next;
}

/** Muat aturan shift per divisi tersimpan; bila kosong atau belum ada tetap [] (mulai bersih). */
function loadDivisionShiftRules(): DivisionShiftRule[] {
  const parsed = loadStoredJson<unknown>(LOCAL_DIVISION_SHIFT_RULES_KEY, null);
  return Array.isArray(parsed) ? (parsed as DivisionShiftRule[]) : [];
}

/** Komponen gaji contoh agar fitur payroll per divisi/karyawan langsung dapat diuji. */


/** Todo contoh: satu format, dua format, dan tiga format untuk menguji laporan multi-format. */




export interface HrdAddEmployeeInput {
  role?: UserRole;
  supervisorUid?: string;
  email: string;
  name: string;
  position: string;
  division: Division;
  shiftCode: ShiftCode;
  /** Kata sandi awal akun login karyawan (wajib saat sinkron Firebase). */
  initialPassword?: string;
}

export interface ClockPayload {
  photoDataUrl: string;
  lat: number;
  lng: number;
  address: string;
  distanceMeters: number;
}

type AsyncResult<T = void> = Promise<
  (T extends void ? { ok: true } : { ok: true } & T) | { ok: false; error: string }
>;

/** Cakupan data Firestore per role: HRD semua, supervisor sendiri+bawahan, karyawan sendiri. */
type CollectionScope = 'all' | 'own' | 'supervised';

/** Hasil operasi katalog shift: kode shift terkait atau pesan galat siap tampil. */
type ShiftTemplateResult = { ok: true; code: ShiftCode } | { ok: false; error: string };

interface HrisContextValue {
  authReady: boolean;
  firebaseUser: User | null;
  isFirebaseSynced: boolean;
  needsEmailVerification: boolean;
  /**
   * Pesan bila akun yang baru login ternyata sudah dinonaktifkan HRD di menu Data Karyawan:
   * sesi Firebase ditutup dan LoginView menampilkan alasan ini.
   */
  accountDisabledNotice: string | null;
  employees: Employee[];
  currentUser: Employee | null;
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  overtimes: OvertimeRequest[];
  shiftSwaps: ShiftSwapRequest[];
  exitClearances: ExitClearanceRequest[];
  schedules: ScheduleEntry[];
  localPhotos: Record<string, { in?: string; out?: string }>;
  wibNow: WibComponents;
  /** Tema tampilan aktif: 'light' (terang) atau 'dark' (gelap). */
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  loginWithEmail: (email: string, password: string) => AsyncResult;
  loginWithGoogle: () => AsyncResult;
  sendResetPassword: (email: string) => AsyncResult;
  resendVerificationEmail: () => AsyncResult;
  refreshAuthUser: () => AsyncResult<{ verified: boolean }>;
  changePassword: (newPassword: string) => AsyncResult;
  /**
   * Reset kata sandi karyawan oleh Admin HRD: tautan reset dikirim ke email
   * karyawan karena mengubah sandi user lain butuh Firebase Admin SDK.
   */
  resetUserPassword: (uid: string) => AsyncResult<{ username: string }>;
  logout: () => Promise<void>;
  /** Hak persetujuan pengajuan: HRD semua; supervisor hanya pengajuan yang dirutekan ke dirinya (supervisorUid). */
  canReview: (ownerUid: string, routedSupervisorUid?: string) => boolean;
  addEmployeeByHrd: (input: HrdAddEmployeeInput) => AsyncResult<{ employee: Employee }>;
  updateEmployeeProfile: (
    uid: string,
    updates: Partial<HrdEditableEmployeeFields>
  ) => Promise<{ syncedSchedules: number }>;
  /**
   * Dokumen gambar karyawan (scan KTP/KK) per uid, isi = data URL JPEG hasil kompresi klien.
   * HRD membaca semuanya; karyawan hanya dokumennya sendiri.
   */
  employeeDocuments: Record<string, Partial<Record<EmployeeDocumentKind, string>>>;
  saveEmployeeDocument: (
    uid: string,
    kind: EmployeeDocumentKind,
    dataUrl: string
  ) => Promise<void>;
  deleteEmployeeDocument: (uid: string, kind: EmployeeDocumentKind) => Promise<void>;
  signContract: (uid: string) => Promise<void>;
  recordClockIn: (payload: ClockPayload) => AsyncResult<{ record: AttendanceRecord }>;
  recordClockOut: (payload: ClockPayload) => AsyncResult<{ record: AttendanceRecord }>;
  submitLeave: (input: {
    type: LeaveRequest['type'];
    startDate: string;
    endDate: string;
    reason: string;
  }) => AsyncResult;
  submitOvertime: (input: {
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
  }) => AsyncResult;
  submitShiftSwap: (input: {
    date: string;
    toShift: ShiftCode;
    reason: string;
    targetUid?: string;
    targetShiftCode?: ShiftCode;
  }) => AsyncResult;
  reviewShiftSwapPeer: (id: string, action: 'Disetujui' | 'Ditolak') => Promise<{ ok: boolean; error?: string }>;
  submitExitClearance: (input: {
    lastWorkingDate: string;
    reason: string;
  }) => AsyncResult;
  toggleExitChecklistItem: (
    requestId: string,
    department: ExitClearanceRequest['checklist'][number]['department']
  ) => Promise<void>;
  togglePatrolComplete: (scheduleId: string) => Promise<void>;
  reviewLeave: (id: string, status: ApprovalStatus) => Promise<void>;
  reviewOvertime: (id: string, status: ApprovalStatus) => Promise<void>;
  reviewShiftSwap: (id: string, status: ApprovalStatus) => Promise<{ ok: boolean; error?: string }>;
  reviewExitClearance: (id: string, status: ApprovalStatus) => Promise<void>;
  // Todo List management
  todos: TodoTask[];
  addTodoTask: (task: Omit<TodoTask, 'id' | 'createdAt' | 'status'>) => Promise<void>;
  submitTodoReport: (
    taskId: string,
    report: {
      text?: string;
      photoName?: string;
      photoUrl?: string;
      documentName?: string;
      documentUrl?: string;
    }
  ) => Promise<void>;
  reviewTodoTask: (taskId: string, status: TodoStatus, notes?: string) => Promise<void>;
  /** Hapus satu atau lebih tugas todo (khusus HRD & Supervisor). */
  deleteTodoTasks: (
    taskIds: readonly string[]
  ) => Promise<{ ok: boolean; error?: string; deleted: number }>;
  // Divisi management
  divisions: string[];
  addDivision: (name: string) => Promise<{ ok: boolean; error?: string }>;
  /** Hapus satu divisi beserta aturan jam kerjanya. Karyawan tetap menyimpan nama divisinya sebagai label. */
  deleteDivision: (division: Division) => Promise<{ ok: boolean; error?: string }>;
  /** Hapus semua divisi beserta seluruh aturan jam kerjanya. */
  clearAllDivisions: () => Promise<{ ok: boolean; error?: string }>;
  /** Aturan jam kerja (shift) per divisi: Security 24 jam, divisi lain sesuai kebijakan. */
  divisionShiftRules: DivisionShiftRule[];
  updateDivisionShiftRule: (
    division: Division,
    patch: {
      allowedShiftCodes: ShiftCode[];
      defaultShiftCode: ShiftCode;
      /** Jam masuk/pulang khusus divisi ini per shift; kode di luar allowed diabaikan. */
      shiftTimes?: Partial<Record<ShiftCode, { startTime: string; endTime: string }>>;
      /** Toleransi absensi (menit) per shift; kode di luar allowed diabaikan. */
      shiftTolerances?: Partial<Record<ShiftCode, ShiftTolerance>>;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Template shift (jam masuk/pulang) untuk divisi tertentu; tanpa divisi memakai jam bawaan. */
  shiftTemplateFor: (code: ShiftCode, division?: Division | null) => ShiftTemplate;
  // Katalog shift
  /** Shift yang tampil di katalog: shift bawaan yang belum dihapus + shift buatan HRD. */
  shiftTemplates: ShiftTemplate[];
  /** Kode shift bawaan yang sudah dihapus HRD (disembunyikan dari katalog & pilihan divisi). */
  hiddenShiftCodes: ShiftCode[];
  /** Tambah shift baru (nama, jam masuk/pulang, toleransi telat & pulang) ke katalog shift. */
  addShiftTemplate: (input: ShiftTemplateInput) => ShiftTemplateResult;
  /** Ubah nama/jam/toleransi shift buatan HRD; kode shift tidak berubah. */
  updateShiftTemplate: (code: ShiftCode, input: ShiftTemplateInput) => ShiftTemplateResult;
  /** Hapus shift dari katalog (bawaan = disembunyikan); ditolak selama masih dipakai karyawan. */
  deleteShiftTemplate: (code: ShiftCode) => ShiftTemplateResult;
  /** Pulihkan shift bawaan yang sudah dihapus agar bisa dipakai lagi. */
  restoreShiftTemplate: (code: ShiftCode) => ShiftTemplateResult;
  /** Simpan seluruh penugasan jaga shift (staf utama 1 atau lebih, serta 1 orang backup cadangan). */
  saveShiftRoster: (input: {
    date: string;
    division: Division;
    shiftCode: ShiftCode;
    primaryUids: string[];
    backupUid?: string;
    location?: string;
    notes?: string;
  }) => Promise<{ ok: boolean; error?: string; created?: number }>;
  deleteScheduleEntry: (scheduleId: string) => Promise<void>;
  /** Hapus seluruh baris jadwal (semua karyawan & divisi). */
  clearAllSchedules: () => Promise<{ ok: boolean; error?: string; deleted: number }>;
  // Komponen gaji & pengaturan payroll (dapat diset global / per divisi / per karyawan)
  payslipComponents: PayslipComponent[];
  addPayslipComponent: (
    input: Omit<PayslipComponent, 'id' | 'createdAt'>
  ) => Promise<{ ok: boolean; error?: string }>;
  updatePayslipComponent: (
    id: string,
    updates: Partial<Omit<PayslipComponent, 'id'>>
  ) => Promise<{ ok: boolean; error?: string }>;
  deletePayslipComponent: (id: string) => Promise<void>;
  payrollSettings: PayrollSettings;
  updatePayrollSettings: (patch: Partial<PayrollSettings>) => Promise<{ ok: boolean; error?: string }>;
  userPayrollConfigs: Record<string, UserPayrollConfig>;
  updateUserPayrollConfig: (
    uid: string,
    patch: Partial<UserPayrollConfig>
  ) => Promise<{ ok: boolean; error?: string }>;
  approvedLeaveFor: (uid: string, isoDate: string) => LeaveRequest | null;
  currentLeaveToday: LeaveRequest | null;
  // Validasi absensi & Kuota cuti
  validateAttendance: (recordId: string, status: 'Valid' | 'Ditolak', notes?: string) => Promise<void>;
  updateLeaveQuota: (uid: string, newQuota: number) => Promise<void>;
  /**
   * Nonaktifkan/aktifkan akun karyawan: menulis `active` di Firestore dan mengunci akun
   * Firebase Auth lewat Cloud Function `setEmployeeActive`. `authLocked: false` berarti fungsi
   * belum di-deploy, sehingga yang berlaku hanya blokir Firestore + gerbang sesi aplikasi.
   */
  toggleEmployeeActive: (uid: string, active: boolean) => AsyncResult<{ authLocked: boolean }>;
  /** Menghapus seluruh data operasional & karyawan non-admin dari Firestore + perangkat, menyisakan Admin saja. */
  resetAllDataKeepAdminOnly: () => Promise<{ ok: boolean; deletedDocs: number; error?: string }>;
}

const HrisContext = createContext<HrisContextValue | null>(null);





/** Kode error Firebase (Auth maupun Functions) tanpa mengasumsikan bentuk objeknya. */
function firebaseErrorCode(err: unknown): string {
  if (err !== null && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return '';
}

function mapFirebaseAuthError(err: unknown): string {
  const code = firebaseErrorCode(err);
  switch (code) {
    case 'functions/not-found':
    case 'functions/unimplemented':
      return 'Cloud Function belum terpasang di project Firebase ini. Jalankan "firebase deploy --only functions" lebih dulu.';
    case 'functions/permission-denied':
      return 'Hanya HRD terverifikasi yang boleh membuat akun karyawan.';
    case 'functions/unauthenticated':
      return 'Sesi login berakhir. Silakan masuk kembali.';
    case 'functions/already-exists':
    case 'functions/invalid-argument':
    case 'functions/internal':
      return err instanceof Error ? err.message : 'Cloud Function menolak permintaan.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau kata sandi tidak sesuai. Periksa kembali akun Anda.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah terdaftar. Silakan langsung masuk menggunakan email tersebut.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/popup-closed-by-user':
      return 'Jendela masuk Google ditutup sebelum selesai.';
    case 'auth/configuration-not-found':
      return 'Authentication belum diaktifkan untuk project Firebase ini. Buka Firebase Console → Authentication → "Mulai/Get started", lalu aktifkan penyedia Email/Password dan Google.';
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password). Gunakan tombol "Masuk dengan Google" atau aktifkan penyedia Email/Password di Firebase Console.';
    case 'auth/requires-recent-login':
      return 'Demi keamanan, silakan keluar lalu masuk kembali sebelum mengubah kata sandi.';
    case 'auth/network-request-failed':
      return 'Tidak dapat terhubung ke Firebase. Periksa koneksi internet Anda lalu coba lagi.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
    default:
      return err instanceof Error ? err.message : 'Gagal memproses autentikasi Firebase.';
  }
}

/**
 * Menyiapkan foto absensi untuk dokumen Firestore (best-effort).
 * Kegagalan kompresi tidak boleh menggagalkan absensi: salinan lokal (sessionStorage)
 * tetap dipakai UI, dan nilai kosong menandai foto belum terarsip.
 */
async function photoForFirestore(dataUrl: string): Promise<string> {
  try {
    return await compressPhotoForFirestore(dataUrl);
  } catch (error) {
    console.warn('Kompresi foto absensi gagal; absensi dicatat tanpa foto.', error);
    return '';
  }
}

function loadLocalPhotos(): Record<string, { in?: string; out?: string }> {
  try {
    const raw = sessionStorage.getItem(LOCAL_PHOTO_KEY);
    if (raw) return JSON.parse(raw) as Record<string, { in?: string; out?: string }>;
  } catch {
    // ignore storage errors
  }
  return {};
}

export function HrisProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [accountDisabledNotice, setAccountDisabledNotice] = useState<string | null>(null);
  const [selfRole, setSelfRole] = useState<UserRole | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [shiftSwaps, setShiftSwaps] = useState<ShiftSwapRequest[]>([]);
  const [exitClearances, setExitClearances] = useState<ExitClearanceRequest[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [employeeDocuments, setEmployeeDocuments] = useState<
    Record<string, Partial<Record<EmployeeDocumentKind, string>>>
  >({});
  const [employeePersonal, setEmployeePersonal] = useState<Record<string, EmployeePersonalData>>({});
  const [localPhotos, setLocalPhotos] = useState<Record<string, { in?: string; out?: string }>>(
    loadLocalPhotos
  );
  const [wibNow, setWibNow] = useState(() => getWibComponents(new Date()));
  // Tema tampilan global (terang/gelap) — tersimpan lintas sesi.
  const [theme, setThemeState] = useState<ThemeMode>(loadStoredTheme);

  // Divisi dikelola oleh HRD (mulai kosong hingga HRD menambahkannya)
  const [divisions, setDivisions] = useState<string[]>(() =>
    loadStoredArray<string>(LOCAL_DIVISIONS_KEY, [])
  );

  // Jam kerja (shift) per divisi: Security 24 jam, Cleaning Service hanya sampai sore, dll.
  const [divisionShiftRules, setDivisionShiftRules] = useState<DivisionShiftRule[]>(loadDivisionShiftRules);

  // Katalog shift buatan HRD (di luar 5 shift bawaan). Dimuat lebih dulu ke modul hrisLogic
  // supaya perhitungan jam kerja/telat pada render pertama sudah memakai shift kustom.
  const [customShiftTemplates, setCustomShiftTemplates] = useState<ShiftTemplate[]>(() => {
    const stored = normalizeCustomShiftTemplates(loadStoredJson<unknown>(LOCAL_SHIFT_TEMPLATES_KEY, []));
    registerShiftTemplates(stored);
    return stored;
  });

  // Shift bawaan selain REGULER disembunyikan secara bawaan; HRD bisa memulihkan kapan saja.
  const [hiddenShiftCodes, setHiddenShiftCodes] = useState<ShiftCode[]>(() => {
    const raw = loadStoredJson<unknown>(LOCAL_HIDDEN_SHIFT_TEMPLATES_KEY, null);
    const defaultHidden: ShiftCode[] = ['PAGI', 'SIANG', 'MALAM', 'SECURITY24'];
    const stored = (Array.isArray(raw) ? raw : defaultHidden).filter(
      (code): code is ShiftCode => typeof code === 'string' && Boolean(findShiftTemplate(code))
    );
    registerHiddenShiftTemplates(stored);
    return stored;
  });

  // Komponen gaji yang dapat diset global / per divisi / per karyawan
  const [payslipComponents, setPayslipComponents] = useState<PayslipComponent[]>(() =>
    loadStoredArray<PayslipComponent>(LOCAL_PAYSLIP_COMPONENTS_KEY, [])
  );

  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(() =>
    loadStoredRecord<PayrollSettings>(LOCAL_PAYROLL_SETTINGS_KEY, DEFAULT_PAYROLL_SETTINGS)
  );

  const [userPayrollConfigs, setUserPayrollConfigs] = useState<Record<string, UserPayrollConfig>>(
    () => loadStoredRecord<Record<string, UserPayrollConfig>>(LOCAL_USER_PAYROLL_CONFIGS_KEY, {})
  );
  // Todo list tasks created by Supervisor / HRD
  const [todos, setTodos] = useState<TodoTask[]>(() => loadStoredArray<TodoTask>(LOCAL_TODOS_KEY, []));

  const saveLocalPhoto = useCallback((recordId: string, kind: 'in' | 'out', dataUrl: string) => {
    setLocalPhotos((prev) => {
      const next = {
        ...prev,
        [recordId]: { ...(prev[recordId] ?? {}), [kind]: dataUrl },
      };
      try {
        sessionStorage.setItem(LOCAL_PHOTO_KEY, JSON.stringify(next));
      } catch {
        // Ignore sessionStorage quota limits
      }
      return next;
    });
  }, []);

  // Terapkan tema ke <html> (kelas .dark) dan simpan agar bertahan setelah refresh.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(LOCAL_THEME_KEY, theme);
    } catch {
      // Abaikan storage yang tidak tersedia.
    }
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => setThemeState(mode), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  );

  // Live WIB Clock
  useEffect(() => {
    const timer = window.setInterval(() => {
      setWibNow(getWibComponents(new Date()));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user || !user.emailVerified) {
        setProfileReady(false);
      }
    });
    return () => unsub();
  }, []);

  const isFirebaseSynced = Boolean(firebaseUser && firebaseUser.emailVerified);
  const isBootstrapAdmin = Boolean(
    isFirebaseSynced && firebaseUser?.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()
  );

  // Kosongkan data HRIS saat tidak ada sesi Firebase terverifikasi (mis. setelah logout).
  useEffect(() => {
    if (!isFirebaseSynced) {
      setEmployees([]);
      setAttendance([]);
      setLeaves([]);
      setOvertimes([]);
      setShiftSwaps([]);
      setExitClearances([]);
      setSchedules([]);
    }
  }, [isFirebaseSynced]);

  /**
   * "Nonaktifkan" di menu Data Karyawan menulis `active: false` pada dokumen kepegawaian,
   * sedangkan akun Firebase Auth-nya tetap hidup. Gerbang ini menutup sesi karyawan nonaktif
   * dan menyimpan alasannya untuk ditampilkan LoginView.
   */
  const closeDeactivatedSession = useCallback(async (employeeName?: string) => {
    setAccountDisabledNotice(
      `Akun${employeeName ? ` ${employeeName}` : ' ini'} dinonaktifkan oleh Admin HRD, jadi tidak bisa dipakai masuk. Hubungi Admin HRD untuk mengaktifkan kembali.`
    );
    setProfileReady(false);
    if (auth.currentUser) await signOut(auth);
  }, []);

  // Ensure Firestore employee profile exists on first verified Firebase login
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) return;

    let cancelled = false;
    const ensureProfile = async () => {
      const empPath = `employees/${firebaseUser.uid}`;
      const empRef = doc(db, 'employees', firebaseUser.uid);
      try {
        const snap = await getDoc(empRef);
        if (snap.exists() && (snap.data() as Employee).active === false) {
          await closeDeactivatedSession((snap.data() as Employee).name);
          return;
        }
        if (!snap.exists()) {
          const nowWib = getWibComponents(new Date());
          const division: Division = isBootstrapAdmin ? 'HRD' : 'Operasional';
          const shiftCode: ShiftCode = 'REGULER';
          const email = sanitizeString(firebaseUser.email || 'user@sinarbungamas.co.id', 120);
          const fallbackName = email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Karyawan SBM';
          const rawName = firebaseUser.displayName || fallbackName;
          const name = sanitizeString(rawName.length >= 2 ? rawName : 'Karyawan SBM', 100);
          const position = sanitizeString(
            isBootstrapAdmin ? 'HR Manager' : `Staff ${division}`,
            80
          );
          const comp = getDivisionCompensationDefaults(division);
          const nik = isBootstrapAdmin ? 'ADMIN01' : generateEmployeeNik(division, firebaseUser.uid);
          const contractEnd = `${nowWib.year + 1}-${String(nowWib.month + 1).padStart(2, '0')}-${String(nowWib.day).padStart(2, '0')}`;

          await setDoc(empRef, {
            uid: firebaseUser.uid,
            nik,
            name,
            position,
            division,
            role: isBootstrapAdmin ? 'hrd' : 'employee',
            supervisorUid: '',
            shiftCode,
            email,
            phone: '',
            address: 'Jakarta',
            joinDate: nowWib.isoDate,
            contractType: comp.contractType,
            contractEnd,
            contractSigned: false,
            contractSignedAt: '',
            baseSalary: comp.baseSalary,
            positionAllowance: comp.positionAllowance,
            mealTransportAllowance: comp.mealTransportAllowance,
            leaveQuota: 12,
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (!isBootstrapAdmin) {
            const schId = `sch_${firebaseUser.uid.slice(0, 12)}_${nowWib.isoDate.replace(/-/g, '')}`;
            await setDoc(doc(db, 'schedules', schId), {
              uid: firebaseUser.uid,
              nik,
              date: nowWib.isoDate,
              shiftCode,
              location: 'Kantor Pusat PT Sinar Bunga Mas',
              notes: 'Jadwal kerja aktif karyawan',
              patrolCompleted: false,
              supervisorUid: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
        if (!cancelled) setProfileReady(true);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, empPath);
      }
    };

    void ensureProfile();
    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseUser, isBootstrapAdmin, closeDeactivatedSession]);

  // Attach Firestore real-time listeners strictly after Firebase Auth + profile are ready
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified || !profileReady) return;

    const uid = firebaseUser.uid;
    const unsubs: Array<() => void> = [];

    if (isBootstrapAdmin) {
      setSelfRole('hrd');
      unsubs.push(
        onSnapshot(
          collection(db, 'employees'),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as Employee);
            list.sort((a, b) => a.nik.localeCompare(b.nik));
            setEmployees(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
        )
      );
    } else {
      // Supervisor: profil sendiri + profil bawahan langsung (supervisorUid == uid) untuk roster tim.
      let self: Employee | null = null;
      const reports = new Map<string, Employee>();
      const publishEmployees = () => {
        const list = self ? [self, ...Array.from(reports.values())] : Array.from(reports.values());
        const byUid = new Map(list.map((e) => [e.uid, e]));
        const merged = Array.from(byUid.values()).sort((a, b) => a.nik.localeCompare(b.nik));
        setEmployees(merged);
      };
      unsubs.push(
        onSnapshot(
          doc(db, 'employees', uid),
          (snap) => {
            const data = snap.exists() ? (snap.data() as Employee) : null;
            if (data && data.active === false) {
              // HRD menonaktifkan akun ini selagi aplikasinya terbuka: sesi langsung ditutup.
              void closeDeactivatedSession(data.name);
              return;
            }
            self = data;
            setSelfRole(self?.role ?? 'employee');
            publishEmployees();
          },
          (err) => handleFirestoreError(err, OperationType.GET, `employees/${uid}`)
        )
      );
      if (selfRole === 'supervisor') {
        unsubs.push(
          onSnapshot(
            query(collection(db, 'employees'), where('supervisorUid', '==', uid)),
            (snap) => {
              reports.clear();
              snap.docs.forEach((d) => {
                const emp = d.data() as Employee;
                reports.set(emp.uid, emp);
              });
              publishEmployees();
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
          )
        );
      }
    }

    // 'all' = HRD, 'own' = karyawan, 'supervised' = pengajuan sendiri + pengajuan bawahan se-divisi
    const scope: CollectionScope = isBootstrapAdmin
      ? 'all'
      : selfRole === 'supervisor'
        ? 'supervised'
        : 'own';

    const mergeById = <T extends { id: string }>(lists: T[][]): T[] => {
      const byId = new Map<string, T>();
      for (const list of lists) {
        for (const item of list) byId.set(item.id, item);
      }
      return Array.from(byId.values());
    };

    const bindCollection = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortFn: (a: T, b: T) => number,
      supervised = false
    ) => {
      const readAll = (snap: { docs: Array<{ id: string; data: () => unknown }> }) =>
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
      const emit = (lists: T[][]) => {
        const items = mergeById(lists);
        items.sort(sortFn);
        setter(items);
      };
      const onError = (err: unknown) => handleFirestoreError(err, OperationType.LIST, colName);

      if (scope === 'all') {
        unsubs.push(onSnapshot(collection(db, colName), (snap) => emit([readAll(snap)]), onError));
        return;
      }

      if (scope === 'own' || !supervised) {
        unsubs.push(
          onSnapshot(query(collection(db, colName), where('uid', '==', uid)), (snap) => emit([readAll(snap)]), onError)
        );
        return;
      }

      // Supervisor: gabungkan pengajuan sendiri + pengajuan yang dirutekan kepada dirinya.
      const parts = new Map<string, T[]>();
      const track = (key: string) => (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
        parts.set(key, readAll(snap));
        emit(Array.from(parts.values()));
      };
      unsubs.push(
        onSnapshot(query(collection(db, colName), where('uid', '==', uid)), track('own'), onError)
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, colName), where('supervisorUid', '==', uid)),
          track('supervised'),
          onError
        )
      );
    };

    bindCollection<AttendanceRecord>(
      'attendance',
      setAttendance,
      (a, b) => `${b.date} ${b.clockInTime}`.localeCompare(`${a.date} ${a.clockInTime}`),
      true
    );
    bindCollection<LeaveRequest>(
      'leaves',
      setLeaves,
      (a, b) => b.createdLabel.localeCompare(a.createdLabel),
      true
    );
    bindCollection<OvertimeRequest>(
      'overtimes',
      setOvertimes,
      (a, b) => b.createdLabel.localeCompare(a.createdLabel),
      true
    );
    bindCollection<ShiftSwapRequest>(
      'shiftSwaps',
      setShiftSwaps,
      (a, b) => b.createdLabel.localeCompare(a.createdLabel),
      true
    );
    bindCollection<ExitClearanceRequest>(
      'exitClearances',
      setExitClearances,
      (a, b) => b.createdLabel.localeCompare(a.createdLabel),
      true
    );
    bindCollection<ScheduleEntry>(
      'schedules',
      setSchedules,
      (a, b) => b.date.localeCompare(a.date),
      true
    );
    // Dokumen gambar (KTP/KK): HRD memuat semuanya, karyawan hanya miliknya sendiri.
    const readDocuments = (snap: { docs: Array<{ data: () => unknown }> }) => {
      const next: Record<string, Partial<Record<EmployeeDocumentKind, string>>> = {};
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as {
          uid?: string;
          kind?: EmployeeDocumentKind;
          dataUrl?: string;
        };
        if (!data.uid || (data.kind !== 'ktp' && data.kind !== 'kk') || !data.dataUrl) continue;
        next[data.uid] = { ...next[data.uid], [data.kind]: data.dataUrl };
      }
      setEmployeeDocuments(next);
    };
    unsubs.push(
      onSnapshot(
        scope === 'all'
          ? collection(db, 'employeeDocuments')
          : query(collection(db, 'employeeDocuments'), where('uid', '==', uid)),
        readDocuments,
        (err) => handleFirestoreError(err, OperationType.LIST, 'employeeDocuments')
      )
    );

    // Data pribadi (KTP/KK, bank, kontak darurat): HRD memuat semuanya, karyawan hanya miliknya.
    const readProfiles = (snap: { docs: Array<{ id: string; data: () => unknown }> }) => {
      const next: Record<string, EmployeePersonalData> = {};
      for (const docSnap of snap.docs) {
        const { uid: profileUid, updatedAt, ...personal } = docSnap.data() as EmployeeProfile;
        next[profileUid ?? docSnap.id] = personal;
      }
      setEmployeePersonal(next);
    };
    unsubs.push(
      onSnapshot(
        scope === 'all'
          ? collection(db, 'employeeProfiles')
          : query(collection(db, 'employeeProfiles'), where('uid', '==', uid)),
        readProfiles,
        (err) => handleFirestoreError(err, OperationType.LIST, 'employeeProfiles')
      )
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, firebaseUser, profileReady, isBootstrapAdmin, selfRole, closeDeactivatedSession]);

  const currentUser = useMemo(() => {
    if (!isFirebaseSynced || !firebaseUser) return null;
    return employees.find((e) => e.uid === firebaseUser.uid) ?? null;
  }, [employees, firebaseUser, isFirebaseSynced]);

  // Gabungkan PII (/employeeProfiles) ke objek karyawan: UI & ekspor tetap membaca `employee.<kolom>`.
  const employeesView = useMemo(() => {
    if (Object.keys(employeePersonal).length === 0) return employees;
    return employees.map((emp) =>
      employeePersonal[emp.uid] ? { ...emp, ...employeePersonal[emp.uid] } : emp
    );
  }, [employees, employeePersonal]);

  const canReview: HrisContextValue['canReview'] = (ownerUid, routedSupervisorUid) => {
    if (!currentUser || ownerUid === currentUser.uid) return false;
    if (currentUser.role === 'hrd') return true;
    return currentUser.role === 'supervisor' && routedSupervisorUid === currentUser.uid;
  };

  // Auth actions
  const loginWithEmail: HrisContextValue['loginWithEmail'] = async (email, password) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { ok: false, error: 'Masukkan email atau username Anda.' };
    }
    if (!password) {
      return { ok: false, error: 'Kata sandi wajib diisi.' };
    }
    try {
      setAccountDisabledNotice(null);
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  // Sesi login dipulihkan otomatis oleh Firebase Auth (onAuthStateChanged).

  

  const loginWithGoogle: HrisContextValue['loginWithGoogle'] = async () => {
    try {
      setAccountDisabledNotice(null);
      await signInWithPopup(auth, googleProvider);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  const sendResetPassword: HrisContextValue['sendResetPassword'] = async (email) => {
    const cleanEmail = email.trim();
    if (!isValidEmailAddress(cleanEmail)) {
      return { ok: false, error: 'Masukkan alamat email yang terdaftar untuk reset kata sandi.' };
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  const resendVerificationEmail: HrisContextValue['resendVerificationEmail'] = async () => {
    if (!auth.currentUser) return { ok: false, error: 'Sesi akun tidak ditemukan.' };
    try {
      await sendEmailVerification(auth.currentUser);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  const refreshAuthUser: HrisContextValue['refreshAuthUser'] = async () => {
    if (!auth.currentUser) return { ok: false, error: 'Sesi akun tidak ditemukan.' };
    try {
      await reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
      const updated = auth.currentUser;
      setFirebaseUser({ ...updated } as User);
      return { ok: true, verified: updated.emailVerified };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  const changePassword: HrisContextValue['changePassword'] = async (newPassword) => {
    if (!auth.currentUser) return { ok: false, error: 'Sesi Firebase tidak aktif.' };
    if (newPassword.length < 6) {
      return { ok: false, error: 'Kata sandi baru minimal 6 karakter.' };
    }
    try {
      await updatePassword(auth.currentUser, newPassword);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  

  const resetUserPassword: HrisContextValue['resetUserPassword'] = async (uid) => {
    if (!currentUser || currentUser.role !== 'hrd') {
      return { ok: false, error: 'Hanya Admin HRD yang dapat mereset kata sandi karyawan.' };
    }
    const emp = employees.find((e) => e.uid === uid);
    if (!emp) {
      return { ok: false, error: 'Karyawan tidak ditemukan pada direktori.' };
    }
    const username = emp.email.split('@')[0].trim().toLowerCase();
    if (!emp.email.includes('@')) {
      return { ok: false, error: `Email karyawan ${emp.name} tidak valid untuk mereset akun.` };
    }

    // Mengubah sandi user lain butuh Admin SDK: kirim tautan reset ke email karyawan.
    try {
      await sendPasswordResetEmail(auth, emp.email);
      return { ok: true, username };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  const logout = async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  // HRD Admin creating a directory employee record by email
  const addEmployeeByHrd: HrisContextValue['addEmployeeByHrd'] = async (input) => {
    const cleanEmail = sanitizeString(input.email, 120).toLowerCase();
    const cleanName = sanitizeString(input.name, 100);
    if (!isValidEmailAddress(cleanEmail) || cleanName.length < 2) {
      return { ok: false, error: 'Email valid dan Nama Lengkap wajib diisi.' };
    }
    if (employees.some((e) => e.email.toLowerCase() === cleanEmail)) {
      return { ok: false, error: `Email ${cleanEmail} sudah terdaftar di direktori karyawan.` };
    }

    const role: UserRole = input.role ?? (input.division === 'HRD' ? 'hrd' : 'employee');
    if (role === 'hrd' && input.division !== 'HRD') {
      return { ok: false, error: 'Role HRD hanya berlaku untuk divisi HRD.' };
    }
    // Hanya karyawan (employee) yang memiliki atasan langsung supervisor di divisi yang sama.
    const supervisorUid = role === 'employee' ? (input.supervisorUid ?? '') : '';
    if (supervisorUid) {
      const supervisor = employees.find((e) => e.uid === supervisorUid);
      if (!supervisor || supervisor.role !== 'supervisor' || supervisor.division !== input.division) {
        return { ok: false, error: 'Atasan langsung harus supervisor aktif di divisi yang sama.' };
      }
    }
    if (!divisions.includes(input.division)) {
      return {
        ok: false,
        error: `Divisi ${input.division} belum terdaftar. Tambahkan divisi terlebih dahulu.`,
      };
    }
    const shiftCode = input.shiftCode ?? defaultShiftForDivision(input.division, divisionShiftRules);
    if (!isShiftAllowedForDivision(input.division, shiftCode, divisionShiftRules)) {
      const rule = resolveDivisionShiftRule(input.division, divisionShiftRules);
      const allowedLabels = rule.allowedShiftCodes
        .map((code) => shiftTemplateForDivision(code, input.division, divisionShiftRules).label ?? code)
        .join(' | ');
      return {
        ok: false,
        error: `Shift untuk divisi ${input.division} harus salah satu dari: ${allowedLabels}.`,
      };
    }

    const nowWib = getWibComponents(new Date());
    const initialPassword = input.initialPassword ?? '';
    if (initialPassword.length < 6) {
      return {
        ok: false,
        error: 'Kata sandi awal minimal 6 karakter untuk membuat akun login karyawan.',
      };
    }
    let empUid = `emp_${Date.now()}`;

    // Akun login dibuat lebih dulu agar uid Auth = id dokumen employees/{uid}.
    try {
      empUid = await provisionEmployeeAccount(cleanEmail, initialPassword, cleanName);
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }

    const nik = generateEmployeeNik(input.division, empUid);
    const comp = getDivisionCompensationDefaults(input.division);
    const contractEnd = `${nowWib.year + 1}-${String(nowWib.month + 1).padStart(2, '0')}-${String(nowWib.day).padStart(2, '0')}`;

    const newEmp: Employee = {
      uid: empUid,
      nik,
      name: cleanName,
      position: sanitizeString(input.position || `Staff ${input.division}`, 80),
      division: input.division,
      role,
      supervisorUid,
      shiftCode,
      email: cleanEmail,
      phone: '',
      address: 'Jakarta',
      joinDate: nowWib.isoDate,
      contractType: comp.contractType,
      contractEnd,
      contractSigned: false,
      contractSignedAt: '',
      baseSalary: comp.baseSalary,
      positionAllowance: comp.positionAllowance,
      mealTransportAllowance: comp.mealTransportAllowance,
      leaveQuota: 12,
      active: true,
    };

    const newSchedule: ScheduleEntry = {
      id: `sch_${empUid}_${nowWib.isoDate.replace(/-/g, '')}`,
      uid: empUid,
      nik,
      date: nowWib.isoDate,
      shiftCode: newEmp.shiftCode,
      location: 'Kantor Pusat PT Sinar Bunga Mas',
      notes: 'Penugasan awal karyawan baru',
      patrolCompleted: false,
    };

    if (!isFirebaseSynced) {
      setEmployees((prev) => [...prev, newEmp]);
      setSchedules((prev) => [newSchedule, ...prev]);
      return { ok: true, employee: newEmp };
    }

    const empPath = `employees/${empUid}`;
    try {
      await setDoc(doc(db, 'employees', empUid), {
        ...newEmp,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'schedules', newSchedule.id), {
        uid: newSchedule.uid,
        nik: newSchedule.nik,
        date: newSchedule.date,
        shiftCode: newSchedule.shiftCode,
        location: newSchedule.location,
        notes: newSchedule.notes,
        patrolCompleted: false,
        supervisorUid: newEmp.supervisorUid ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { ok: true, employee: newEmp };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, empPath);
    }
  };

  const updateEmployeeProfile: HrisContextValue['updateEmployeeProfile'] = async (uid, updates) => {
    // PII ditulis ke /employeeProfiles/{uid}; kolom kepegawaian tetap di /employees/{uid}.
    const cleanUpdates: Partial<Employee> = {};
    const cleanPersonal: EmployeePersonalData = {};
    if (updates.phone !== undefined) cleanUpdates.phone = sanitizeString(updates.phone, 30);
    if (updates.address !== undefined) cleanUpdates.address = sanitizeString(updates.address, 240);
    if (updates.shiftCode !== undefined) cleanUpdates.shiftCode = updates.shiftCode;
    if (updates.division !== undefined) cleanUpdates.division = updates.division;
    if (updates.position !== undefined) cleanUpdates.position = sanitizeString(updates.position, 80);
    if (updates.role !== undefined) cleanUpdates.role = updates.role;
    if (updates.supervisorUid !== undefined) cleanUpdates.supervisorUid = updates.supervisorUid;
    if (updates.active !== undefined) cleanUpdates.active = updates.active;
    if (currentUser?.role === 'hrd') {
      const sanitizeMoney = (raw: unknown, max: number) => {
        const num = Math.round(Number(raw));
        return Number.isFinite(num) ? Math.min(max, Math.max(0, num)) : null;
      };
      if (updates.baseSalary !== undefined) {
        const val = sanitizeMoney(updates.baseSalary, 500_000_000);
        if (val !== null) cleanUpdates.baseSalary = val;
      }
      if (updates.positionAllowance !== undefined) {
        const val = sanitizeMoney(updates.positionAllowance, 200_000_000);
        if (val !== null) cleanUpdates.positionAllowance = val;
      }
      if (updates.mealTransportAllowance !== undefined) {
        const val = sanitizeMoney(updates.mealTransportAllowance, 100_000_000);
        if (val !== null) cleanUpdates.mealTransportAllowance = val;
      }
    }
    if (updates.photoUrl !== undefined) {
      // Hanya terima data URL gambar (hasil crop kanvas); tolak skema lain demi keamanan.
      const value = updates.photoUrl;
      cleanUpdates.photoUrl =
        value.startsWith('data:image/') && value.length <= 400000 ? value : '';
    }
    if (updates.ktpNumber !== undefined) cleanPersonal.ktpNumber = sanitizeSixteenDigits(updates.ktpNumber);
    if (updates.kkNumber !== undefined) cleanPersonal.kkNumber = sanitizeSixteenDigits(updates.kkNumber);
    if (updates.fullNameKtp !== undefined) {
      cleanPersonal.fullNameKtp = sanitizeString(updates.fullNameKtp, 100);
    }
    if (updates.birthPlace !== undefined) {
      cleanPersonal.birthPlace = sanitizeString(updates.birthPlace, 80);
    }
    if (updates.birthDate !== undefined) {
      const value = updates.birthDate.trim();
      cleanPersonal.birthDate = isValidIsoDateString(value) ? value : '';
    }
    if (updates.ktpAddress !== undefined) {
      cleanPersonal.ktpAddress = sanitizeString(updates.ktpAddress, 240);
    }
    if (updates.gender !== undefined) cleanPersonal.gender = sanitizeEnum(updates.gender, GENDERS);
    if (updates.motherName !== undefined) {
      cleanPersonal.motherName = sanitizeString(updates.motherName, 100);
    }
    if (updates.workRegion !== undefined) {
      cleanPersonal.workRegion = sanitizeString(updates.workRegion, 80);
    }
    if (updates.maritalStatus !== undefined) {
      cleanPersonal.maritalStatus = sanitizeEnum(updates.maritalStatus, MARITAL_STATUSES);
    }
    if (updates.childrenCount !== undefined) {
      const value = Math.trunc(Number(updates.childrenCount));
      cleanPersonal.childrenCount = Number.isFinite(value) ? Math.min(20, Math.max(0, value)) : 0;
    }
    if (updates.bankName !== undefined) cleanPersonal.bankName = sanitizeString(updates.bankName, 60);
    if (updates.bankAccountNumber !== undefined) {
      cleanPersonal.bankAccountNumber = updates.bankAccountNumber.replace(/[^0-9]/g, '').slice(0, 30);
    }
    if (updates.bankAccountName !== undefined) {
      cleanPersonal.bankAccountName = sanitizeString(updates.bankAccountName, 100);
    }
    if (updates.emergencyContactName !== undefined) {
      cleanPersonal.emergencyContactName = sanitizeString(updates.emergencyContactName, 100);
    }
    if (updates.emergencyContactPhone !== undefined) {
      cleanPersonal.emergencyContactPhone = sanitizeString(
        updates.emergencyContactPhone,
        30
      ).replace(/[^0-9+\- ]/g, '');
    }
    if (updates.lastEducation !== undefined) {
      cleanPersonal.lastEducation = sanitizeEnum(updates.lastEducation, EDUCATION_LEVELS);
    }

    // Shift harus sesuai divisi: bila divisi berubah (atau shift tak diizinkan), pakai shift bawaan divisi.
    const target = employees.find((e) => e.uid === uid);
    // Atasan langsung wajib di divisi yang sama: jika divisi pindah atau peran bukan karyawan, bersihkan supervisorUid.
    if (updates.division && updates.division !== target?.division && cleanUpdates.supervisorUid === undefined) {
      cleanUpdates.supervisorUid = '';
    }
    if (cleanUpdates.role && cleanUpdates.role !== 'employee') {
      cleanUpdates.supervisorUid = '';
    }
    const nextDivision = updates.division ?? target?.division;
    const nextShift = updates.shiftCode ?? target?.shiftCode;
    if (
      target &&
      nextDivision &&
      nextShift &&
      !isShiftAllowedForDivision(nextDivision, nextShift, divisionShiftRules)
    ) {
      cleanUpdates.shiftCode = defaultShiftForDivision(nextDivision, divisionShiftRules);
    }

    // Absensi mengikuti jadwal harian (`effectiveShiftForDate`), bukan hanya profil: baris jadwal
    // hari ini & ke depan yang masih memakai shift profil lama (mis. penugasan awal otomatis)
    // ikut dipindah, supaya shift baru benar-benar terpakai saat absen.
    const mirroredShift = cleanUpdates.shiftCode;
    const mirroredSchedules = schedulesMirroringProfileShift({
      uid,
      previousShift: target?.shiftCode,
      nextShift: mirroredShift,
      fromDate: getWibComponents(new Date()).isoDate,
      schedules,
    });

    if (!isFirebaseSynced) {
      if (Object.keys(cleanUpdates).length > 0) {
        setEmployees((prev) => prev.map((e) => (e.uid === uid ? { ...e, ...cleanUpdates } : e)));
      }
      if (Object.keys(cleanPersonal).length > 0) {
        setEmployeePersonal((prev) => ({
          ...prev,
          [uid]: { ...prev[uid], ...cleanPersonal },
        }));
      }
      if (mirroredShift) {
        const mirroredIds = new Set(mirroredSchedules.map((sch) => sch.id));
        setSchedules((prev) =>
          prev.map((sch) => (mirroredIds.has(sch.id) ? { ...sch, shiftCode: mirroredShift } : sch))
        );
      }
      return { syncedSchedules: mirroredSchedules.length };
    }

    if (Object.keys(cleanUpdates).length > 0) {
      const path = `employees/${uid}`;
      try {
        await updateDoc(doc(db, 'employees', uid), {
          ...cleanUpdates,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }

    if (Object.keys(cleanPersonal).length > 0) {
      const profilePath = `employeeProfiles/${uid}`;
      try {
        await setDoc(
          doc(db, 'employeeProfiles', uid),
          { ...cleanPersonal, uid, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, profilePath);
      }
    }

    const nextSupervisorUid = updates.supervisorUid !== undefined ? cleanUpdates.supervisorUid ?? '' : null;
    if (mirroredShift || nextSupervisorUid !== null) {
      const mirroredIds = new Set(mirroredSchedules.map((sch) => sch.id));
      const rowsToSync =
        nextSupervisorUid !== null
          ? schedules.filter((sch) => sch.uid === uid)
          : mirroredSchedules;
      for (const sch of rowsToSync) {
        const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (mirroredShift && mirroredIds.has(sch.id)) patch.shiftCode = mirroredShift;
        if (nextSupervisorUid !== null) patch.supervisorUid = nextSupervisorUid;
        if (Object.keys(patch).length <= 1) continue;
        try {
          await updateDoc(doc(db, 'schedules', sch.id), patch);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `schedules/${sch.id}`);
        }
      }
    }

    return { syncedSchedules: mirroredSchedules.length };
  };

  /** Menimpa/menghapus satu dokumen gambar karyawan di state (dipakai mode lokal & pantulan sesudah tulis). */
  const applyEmployeeDocument = (
    uid: string,
    kind: EmployeeDocumentKind,
    dataUrl: string | null
  ) => {
    setEmployeeDocuments((prev) => {
      const next = { ...prev };
      const kinds: Partial<Record<EmployeeDocumentKind, string>> = { ...next[uid] };
      if (dataUrl) kinds[kind] = dataUrl;
      else delete kinds[kind];
      if (kinds.ktp || kinds.kk) next[uid] = kinds;
      else delete next[uid];
      return next;
    });
  };

  const saveEmployeeDocument: HrisContextValue['saveEmployeeDocument'] = async (
    uid,
    kind,
    dataUrl
  ) => {
    if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > EMPLOYEE_DOC_MAX_CHARS) {
      throw new Error('Dokumen harus berupa JPEG terkompresi di bawah 640 KB.');
    }
    if (!isFirebaseSynced) {
      applyEmployeeDocument(uid, kind, dataUrl);
      return;
    }
    const documentId = `${uid}_${kind}`;
    try {
      // Satu dokumen per (karyawan, jenis): unggah ulang menimpa gambar lama tanpa riwayat.
      await setDoc(doc(db, 'employeeDocuments', documentId), {
        uid,
        kind,
        dataUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      applyEmployeeDocument(uid, kind, dataUrl);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `employeeDocuments/${documentId}`);
    }
  };

  const deleteEmployeeDocument: HrisContextValue['deleteEmployeeDocument'] = async (
    uid,
    kind
  ) => {
    if (!isFirebaseSynced) {
      applyEmployeeDocument(uid, kind, null);
      return;
    }
    const documentId = `${uid}_${kind}`;
    try {
      await deleteDoc(doc(db, 'employeeDocuments', documentId));
      applyEmployeeDocument(uid, kind, null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `employeeDocuments/${documentId}`);
    }
  };

  const signContract = async (uid: string) => {
    const nowWib = getWibComponents(new Date());
    const signedAt = sanitizeString(`${nowWib.isoDate} ${nowWib.timeShort} WIB`, 40);

    if (!isFirebaseSynced) {
      setEmployees((prev) =>
        prev.map((e) => (e.uid === uid ? { ...e, contractSigned: true, contractSignedAt: signedAt } : e))
      );
      return;
    }

    const path = `employees/${uid}`;
    try {
      await updateDoc(doc(db, 'employees', uid), {
        contractSigned: true,
        contractSignedAt: signedAt,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const recordClockIn: HrisContextValue['recordClockIn'] = async (payload) => {
    if (!currentUser) return { ok: false, error: 'Anda belum login.' };
    const nowWib = getWibComponents(new Date());
    // Izin/cuti disetujui otomatis memblokir absensi pada tanggal tersebut.
    const activeLeave = findApprovedLeaveOnDate(leaves, currentUser.uid, nowWib.isoDate);
    if (activeLeave) {
      return {
        ok: false,
        error: `Anda tercatat ${activeLeave.type} disetujui (${activeLeave.startDate} s/d ${activeLeave.endDate}), sehingga tidak dapat melakukan absensi.`,
      };
    }
    const existingToday = attendance.find(
      (a) => a.uid === currentUser.uid && a.date === nowWib.isoDate
    );
    if (existingToday?.clockInTime) {
      return { ok: false, error: 'Anda sudah melakukan Absen Masuk hari ini.' };
    }

    // Shift absensi mengikuti jadwal hari ini (hasil penugasan/tukar shift), bukan hanya profil.
    const todayShift = effectiveShiftForDate(
      currentUser.uid,
      nowWib.isoDate,
      schedules,
      currentUser.shiftCode
    );
    const todayRule = resolveDivisionShiftRule(currentUser.division, divisionShiftRules);
    const gate = validateClockIn(nowWib.timeFull, todayShift, todayRule);
    if (!gate.ok) {
      return { ok: false, error: gate.error };
    }
    const lateMinutes = calculateLateMinutes(nowWib.timeFull, todayShift, todayRule);
    const id = `att_${currentUser.uid.slice(0, 12)}_${nowWib.isoDate.replace(/-/g, '')}`;
    const record: AttendanceRecord = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      date: nowWib.isoDate,
      shiftCode: todayShift,
      clockInTime: nowWib.timeFull,
      clockInPhotoVerified: true,
      clockInLat: Number(payload.lat.toFixed(6)),
      clockInLng: Number(payload.lng.toFixed(6)),
      clockInAddress: sanitizeString(payload.address, 200),
      clockInDistanceMeters: Math.max(0, Math.round(payload.distanceMeters)),
      lateMinutes,
      clockOutTime: '',
      clockOutPhotoVerified: false,
      clockOutLat: 0,
      clockOutLng: 0,
      clockOutAddress: '',
      workMinutes: 0,
      status: lateMinutes > 0 ? 'Terlambat' : 'Tepat Waktu',
      supervisorUid: currentUser.supervisorUid ?? '',
      clockInPhotoUrl: '',
      adminValidationStatus: 'Menunggu',
    };

    if (!isFirebaseSynced) {
      setAttendance((prev) => [record, ...prev]);
      if (payload.photoDataUrl) saveLocalPhoto(id, 'in', payload.photoDataUrl);
      return { ok: true, record };
    }

    // Foto dikompres lebih dulu agar bisa ikut tersimpan di dokumen absensi.
    const photoInUrl = payload.photoDataUrl ? await photoForFirestore(payload.photoDataUrl) : '';

    const {
      id: _docId,
      clockOutPhotoUrl: _photoOut,
      adminValidationStatus: _avStatus,
      adminValidationNotes: _avNotes,
      validatedBy: _valBy,
      validatedAt: _valAt,
      ...firestoreBody
    } = { ...record, clockInPhotoUrl: photoInUrl };
    const path = `attendance/${id}`;
    try {
      await setDoc(doc(db, 'attendance', id), {
        ...firestoreBody,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (payload.photoDataUrl) {
        saveLocalPhoto(id, 'in', payload.photoDataUrl);
      }
      return { ok: true, record: { ...record, clockInPhotoUrl: photoInUrl } };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const recordClockOut: HrisContextValue['recordClockOut'] = async (payload) => {
    if (!currentUser) return { ok: false, error: 'Anda belum login.' };
    const nowWib = getWibComponents(new Date());
    const existingToday = attendance.find(
      (a) => a.uid === currentUser.uid && a.date === nowWib.isoDate
    );
    if (!existingToday || !existingToday.clockInTime) {
      return { ok: false, error: 'Anda belum melakukan Absen Masuk hari ini.' };
    }
    if (existingToday.clockOutTime) {
      return { ok: false, error: 'Anda sudah melakukan Absen Pulang hari ini.' };
    }
    const outRule = resolveDivisionShiftRule(existingToday.division, divisionShiftRules);
    const outGate = validateClockOut(nowWib.timeFull, existingToday.shiftCode, outRule);
    if (!outGate.ok) {
      return { ok: false, error: outGate.error };
    }

    const workMinutes = calculateWorkMinutes(
      existingToday.clockInTime,
      nowWib.timeFull,
      existingToday.shiftCode
    );
    const status = existingToday.lateMinutes > 0 ? 'Terlambat' : 'Selesai';
    const updatedRecord: AttendanceRecord = {
      ...existingToday,
      clockOutTime: nowWib.timeFull,
      clockOutPhotoVerified: true,
      clockOutLat: Number(payload.lat.toFixed(6)),
      clockOutLng: Number(payload.lng.toFixed(6)),
      clockOutAddress: sanitizeString(payload.address, 200),
      workMinutes,
      status,
      clockOutPhotoUrl: existingToday.clockOutPhotoUrl || '',
    };

    if (!isFirebaseSynced) {
      setAttendance((prev) => prev.map((a) => (a.id === existingToday.id ? updatedRecord : a)));
      if (payload.photoDataUrl) saveLocalPhoto(existingToday.id, 'out', payload.photoDataUrl);
      return { ok: true, record: updatedRecord };
    }

    const path = `attendance/${existingToday.id}`;
    const photoOutUrl = payload.photoDataUrl
      ? await photoForFirestore(payload.photoDataUrl)
      : existingToday.clockOutPhotoUrl ?? '';
    try {
      await updateDoc(doc(db, 'attendance', existingToday.id), {
        clockOutTime: updatedRecord.clockOutTime,
        clockOutPhotoVerified: true,
        clockOutLat: updatedRecord.clockOutLat,
        clockOutLng: updatedRecord.clockOutLng,
        clockOutAddress: updatedRecord.clockOutAddress,
        clockOutPhotoUrl: photoOutUrl,
        workMinutes,
        status,
        updatedAt: serverTimestamp(),
      });
      if (payload.photoDataUrl) {
        saveLocalPhoto(existingToday.id, 'out', payload.photoDataUrl);
      }
      return { ok: true, record: { ...updatedRecord, clockOutPhotoUrl: photoOutUrl } };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const submitLeave: HrisContextValue['submitLeave'] = async (input) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.' };
    const days = calculateInclusiveDays(input.startDate, input.endDate);
    if (days <= 0) {
      return { ok: false, error: 'Tanggal selesai harus sama atau setelah tanggal mulai.' };
    }
    const reason = sanitizeString(input.reason, 500);
    if (reason.length < 3) {
      return { ok: false, error: 'Alasan izin / cuti minimal 3 karakter.' };
    }

    // Validasi kuota izin/cuti (default 12 hari per tahun)
    const quota = currentUser.leaveQuota ?? 12;
    const usedDays = leaves
      .filter((l) => l.uid === currentUser.uid && l.type === input.type && l.status !== 'Ditolak')
      .reduce((sum, l) => sum + l.days, 0);
    if (input.type === 'Cuti Tahunan' && usedDays + days > quota) {
      const sisa = Math.max(0, quota - usedDays);
      return {
        ok: false,
        error: `Kuota izin/cuti tahunan tidak mencukupi (Tersisa: ${sisa} hari dari kuota ${quota} hari).`,
      };
    }

    const nowWib = getWibComponents(new Date());
    const id = `lv_${Date.now()}`;
    const item: LeaveRequest = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      supervisorUid: currentUser.supervisorUid ?? '',
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      days: Math.min(60, days),
      reason,
      status: 'Menunggu',
      createdLabel: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
      reviewedBy: '',
      supervisorStatus: 'Menunggu',
      hrdStatus: 'Menunggu',
    };

    if (!isFirebaseSynced) {
      setLeaves((prev) => [item, ...prev]);
      return { ok: true };
    }

    const path = `leaves/${id}`;
    try {
      const {
        id: _id,
        supervisorStatus: _supStatus,
        supervisorReviewedBy: _supBy,
        supervisorReviewedAt: _supAt,
        hrdStatus: _hrdStatus,
        hrdReviewedBy: _hrdBy,
        hrdReviewedAt: _hrdAt,
        ...body
      } = item;
      await setDoc(doc(db, 'leaves', id), {
        ...body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const submitOvertime: HrisContextValue['submitOvertime'] = async (input) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.' };
    const reason = sanitizeString(input.reason, 500);
    if (!input.date || !input.startTime || !input.endTime || reason.length < 3) {
      return { ok: false, error: 'Semua kolom pengajuan lembur wajib diisi (alasan min. 3 karakter).' };
    }
    const { hours, estimatedPay } = calculateOvertimeEstimate(
      input.startTime,
      input.endTime,
      currentUser.baseSalary
    );
    if (hours < 0.5 || hours > 12) {
      return {
        ok: false,
        error: 'Durasi lembur minimal 0,5 jam (30 menit) dan maksimal 12 jam per pengajuan.',
      };
    }
    const nowWib = getWibComponents(new Date());
    const id = `ot_${Date.now()}`;
    const item: OvertimeRequest = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      supervisorUid: currentUser.supervisorUid ?? '',
      date: input.date,
      startTime: sanitizeString(input.startTime, 8),
      endTime: sanitizeString(input.endTime, 8),
      hours,
      estimatedPay,
      reason,
      status: 'Menunggu',
      createdLabel: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
      reviewedBy: '',
    };

    if (!isFirebaseSynced) {
      setOvertimes((prev) => [item, ...prev]);
      return { ok: true };
    }

    const path = `overtimes/${id}`;
    try {
      const { id: _id, ...body } = item;
      await setDoc(doc(db, 'overtimes', id), {
        ...body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const submitShiftSwap: HrisContextValue['submitShiftSwap'] = async (input) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.' };
    const reason = sanitizeString(input.reason, 500);
    if (!input.date || reason.length < 3) {
      return { ok: false, error: 'Tanggal dan alasan tukar shift wajib diisi (min. 3 karakter).' };
    }
    // Shift asal = shift efektif pada tanggal tersebut (jadwal/tukar shift sebelumnya), bukan hanya profil.
    const fromShift = effectiveShiftForDate(
      currentUser.uid,
      input.date,
      schedules,
      currentUser.shiftCode
    );
    if (input.toShift === fromShift) {
      return { ok: false, error: 'Pilih shift tujuan yang berbeda dari shift Anda saat ini.' };
    }
    // Tukar shift tidak boleh bertabrakan dengan shift terjadwal / shift hasil tukar yang belum ditolak.
    const swapCheck = validateShiftSwap({
      uid: currentUser.uid,
      division: currentUser.division,
      date: input.date,
      fromShift,
      toShift: input.toShift,
      schedules,
      shiftSwaps,
      rules: divisionShiftRules,
      onApprovedLeave: Boolean(
        findApprovedLeaveOnDate(leaves, currentUser.uid, input.date)
      ),
    });
    if (!swapCheck.ok) {
      return { ok: false, error: swapCheck.error ?? 'Tukar shift tidak dapat diajukan.' };
    }
    const nowWib = getWibComponents(new Date());
    const id = `sw_${Date.now()}`;

    let targetEmployeeName: string | undefined;
    let targetShiftCode: ShiftCode | undefined = input.targetShiftCode;
    let peerStatus: 'Menunggu' | 'Disetujui' = 'Disetujui';

    if (input.targetUid) {
      const targetEmp = employees.find((e) => e.uid === input.targetUid);
      if (targetEmp) {
        targetEmployeeName = targetEmp.name;
        targetShiftCode =
          targetShiftCode ||
          effectiveShiftForDate(targetEmp.uid, input.date, schedules, targetEmp.shiftCode);
        peerStatus = 'Menunggu';
      }
    }

    const item: ShiftSwapRequest = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      supervisorUid: currentUser.supervisorUid ?? '',
      date: input.date,
      fromShift,
      toShift: input.toShift,
      reason,
      status: 'Menunggu',
      createdLabel: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
      reviewedBy: '',
      targetUid: input.targetUid,
      targetEmployeeName,
      targetShiftCode,
      peerStatus,
    };

    if (!isFirebaseSynced) {
      setShiftSwaps((prev) => [item, ...prev]);
      return { ok: true };
    }

    const path = `shiftSwaps/${id}`;
    try {
      const { id: _id, ...body } = item;
      await setDoc(doc(db, 'shiftSwaps', id), {
        ...body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
      return { ok: false, error: 'Gagal mengajukan tukar shift.' };
    }
  };

  const reviewShiftSwapPeer: HrisContextValue['reviewShiftSwapPeer'] = async (id, action) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.' };
    const target = shiftSwaps.find((s) => s.id === id);
    if (!target) return { ok: false, error: 'Pengajuan tukar shift tidak ditemukan.' };
    if (target.targetUid && target.targetUid !== currentUser.uid) {
      return {
        ok: false,
        error: 'Hanya rekan yang diajak tukar yang dapat memutuskan tahap ini.',
      };
    }
    const nowWib = getWibComponents(new Date());
    const peerReviewedAt = `${nowWib.isoDate} ${nowWib.timeShort} WIB`;

    if (action === 'Ditolak') {
      const updateData = {
        peerStatus: 'Ditolak' as const,
        peerReviewedAt,
        status: 'Ditolak' as const,
        reviewedBy: sanitizeString(`Ditolak oleh rekan (${currentUser.name})`, 100),
      };
      if (!isFirebaseSynced) {
        setShiftSwaps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updateData } : s)));
        return { ok: true };
      }
      try {
        await updateDoc(doc(db, 'shiftSwaps', id), {
          ...updateData,
          updatedAt: serverTimestamp(),
        });
        return { ok: true };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `shiftSwaps/${id}`);
        return { ok: false, error: 'Gagal menolak pengajuan tukar shift.' };
      }
    } else {
      const updateData = {
        peerStatus: 'Disetujui' as const,
        peerReviewedAt,
        status: 'Menunggu' as const,
      };
      if (!isFirebaseSynced) {
        setShiftSwaps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updateData } : s)));
        return { ok: true };
      }
      try {
        await updateDoc(doc(db, 'shiftSwaps', id), {
          ...updateData,
          updatedAt: serverTimestamp(),
        });
        return { ok: true };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `shiftSwaps/${id}`);
        return { ok: false, error: 'Gagal menyetujui pengajuan tukar shift.' };
      }
    }
  };

  const submitExitClearance: HrisContextValue['submitExitClearance'] = async (input) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.' };
    const reason = sanitizeString(input.reason, 500);
    if (!input.lastWorkingDate || reason.length < 3) {
      return { ok: false, error: 'Tanggal kerja terakhir dan alasan wajib diisi (min. 3 karakter).' };
    }
    const nowWib = getWibComponents(new Date());
    const id = `ex_${Date.now()}`;
    const item: ExitClearanceRequest = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      position: sanitizeString(currentUser.position, 80),
      division: currentUser.division,
      supervisorUid: currentUser.supervisorUid ?? '',
      lastWorkingDate: input.lastWorkingDate,
      reason,
      checklist: [
        { department: 'HRD', task: 'Pengembalian ID Card & dokumen kepegawaian', cleared: false },
        { department: 'Operasional', task: 'Serah terima tugas & berita acara area', cleared: false },
        { department: 'IT & Aset', task: 'Pengembalian seragam/perangkat & akses akun', cleared: false },
        { department: 'Keuangan', task: 'Verifikasi kasbon & pelunasan hak akhir', cleared: false },
      ],
      status: 'Menunggu',
      createdLabel: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
      reviewedBy: '',
    };

    if (!isFirebaseSynced) {
      setExitClearances((prev) => [item, ...prev]);
      return { ok: true };
    }

    const path = `exitClearances/${id}`;
    try {
      const { id: _id, ...body } = item;
      await setDoc(doc(db, 'exitClearances', id), {
        ...body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const toggleExitChecklistItem: HrisContextValue['toggleExitChecklistItem'] = async (
    requestId,
    department
  ) => {
    const target = exitClearances.find((e) => e.id === requestId);
    if (!target) return;
    if (target.status !== 'Menunggu' && currentUser?.role !== 'hrd') return;
    const nextChecklist = target.checklist.map((item) =>
      item.department === department ? { ...item, cleared: !item.cleared } : item
    );

    if (!isFirebaseSynced) {
      setExitClearances((prev) =>
        prev.map((e) => (e.id === requestId ? { ...e, checklist: nextChecklist } : e))
      );
      return;
    }

    const path = `exitClearances/${requestId}`;
    try {
      await updateDoc(doc(db, 'exitClearances', requestId), {
        checklist: nextChecklist,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const togglePatrolComplete = async (scheduleId: string) => {
    const target = schedules.find((s) => s.id === scheduleId);
    if (!target) return;

    if (!isFirebaseSynced) {
      setSchedules((prev) =>
        prev.map((s) => (s.id === scheduleId ? { ...s, patrolCompleted: !s.patrolCompleted } : s))
      );
      return;
    }

    const path = `schedules/${scheduleId}`;
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), {
        patrolCompleted: !target.patrolCompleted,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const reviewLeave = async (id: string, status: ApprovalStatus) => {
    const target = leaves.find((l) => l.id === id);
    if (!target || !canReview(target.uid, target.supervisorUid)) return;
    const nowWib = getWibComponents(new Date());
    const isSup = currentUser?.role === 'supervisor';
    const isHrd = currentUser?.role === 'hrd';

    let supervisorStatus = target.supervisorStatus;
    let supervisorReviewedBy = target.supervisorReviewedBy;
    let supervisorReviewedAt = target.supervisorReviewedAt;
    let hrdStatus = target.hrdStatus;
    let hrdReviewedBy = target.hrdReviewedBy;
    let hrdReviewedAt = target.hrdReviewedAt;
    let overallStatus: ApprovalStatus = target.status;

    if (isSup) {
      supervisorStatus = status;
      supervisorReviewedBy = currentUser?.name;
      supervisorReviewedAt = `${nowWib.isoDate} ${nowWib.timeShort} WIB`;
      if (status === 'Ditolak') {
        overallStatus = 'Ditolak';
      } else {
        // Jika disetujui supervisor, status tetap Menunggu sampai ACC HRD (atau jika tanpa atasan)
        overallStatus = 'Menunggu';
      }
    } else if (isHrd) {
      hrdStatus = status;
      hrdReviewedBy = currentUser?.name;
      hrdReviewedAt = `${nowWib.isoDate} ${nowWib.timeShort} WIB`;
      overallStatus = status;
    }

    const reviewer = sanitizeString(
      `${currentUser?.name ?? 'Reviewer'} (${isHrd ? 'HRD Admin' : 'Supervisor'})`,
      100
    );

    const updatedItem: Partial<LeaveRequest> = {
      status: overallStatus,
      reviewedBy: reviewer,
      supervisorStatus,
      supervisorReviewedBy,
      supervisorReviewedAt,
      hrdStatus,
      hrdReviewedBy,
      hrdReviewedAt,
    };

    if (!isFirebaseSynced) {
      setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, ...updatedItem } : l)));
      if (target && target.status !== 'Disetujui' && overallStatus === 'Disetujui') {
        if (target.type === 'Cuti Tahunan') {
          setEmployees((prev) =>
            prev.map((e) =>
              e.uid === target.uid ? { ...e, leaveQuota: Math.max(0, e.leaveQuota - target.days) } : e
            )
          );
        }

        // Alihkan tugas ke staf backup yang tersedia pada rentang cuti
        const daysCount = calculateInclusiveDays(target.startDate, target.endDate);
        const startDt = new Date(`${target.startDate}T00:00:00`);
        setSchedules((prev) => {
          let updated = [...prev];
          for (let i = 0; i < daysCount; i += 1) {
            const cursor = new Date(startDt.getTime() + i * 86_400_000);
            const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
              cursor.getDate()
            ).padStart(2, '0')}`;

            const dutyEntry = updated.find((s) => s.uid === target.uid && s.date === iso && !s.isBackup);
            if (!dutyEntry) continue;

            const backupEntry = updated.find((s) => {
              if (s.date !== iso || !s.isBackup) return false;
              const emp = employees.find((e) => e.uid === s.uid);
              return emp && emp.division === target.division;
            });

            if (backupEntry) {
              const backupEmp = employees.find((e) => e.uid === backupEntry.uid);
              updated = updated.map((s) => {
                if (s.id === backupEntry.id) {
                  return {
                    ...s,
                    isBackup: false,
                    replacedUid: target.uid,
                    replacedName: target.employeeName,
                    notes: sanitizeString(
                      `[PENGGANTI CUTI] Menggantikan ${target.employeeName} (${target.type})`,
                      300
                    ),
                  };
                }
                if (s.id === dutyEntry.id) {
                  return {
                    ...s,
                    notes: sanitizeString(
                      `[CUTI DISETUJUI] Tugas dialihkan ke backup: ${backupEmp?.name ?? 'petugas cadangan'}`,
                      300
                    ),
                  };
                }
                return s;
              });
            }
          }
          return updated;
        });
      }
      return;
    }

    const path = `leaves/${id}`;
    try {
      await updateDoc(doc(db, 'leaves', id), {
        status: overallStatus,
        reviewedBy: reviewer,
        updatedAt: serverTimestamp(),
      });
      if (target && target.status !== 'Disetujui' && overallStatus === 'Disetujui') {
        if (target.type === 'Cuti Tahunan') {
          const emp = employees.find((e) => e.uid === target.uid);
          if (emp) {
            await updateDoc(doc(db, 'employees', emp.uid), {
              leaveQuota: Math.max(0, emp.leaveQuota - target.days),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // Di Firebase: aktifkan backup jika tersedia
        const daysCount = calculateInclusiveDays(target.startDate, target.endDate);
        const startDt = new Date(`${target.startDate}T00:00:00`);
        for (let i = 0; i < daysCount; i += 1) {
          const cursor = new Date(startDt.getTime() + i * 86_400_000);
          const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
            cursor.getDate()
          ).padStart(2, '0')}`;

          const dutyEntry = schedules.find((s) => s.uid === target.uid && s.date === iso && !s.isBackup);
          if (!dutyEntry) continue;

          const backupEntry = schedules.find((s) => {
            if (s.date !== iso || !s.isBackup) return false;
            const emp = employees.find((e) => e.uid === s.uid);
            return emp && emp.division === target.division;
          });

          if (backupEntry) {
            const backupEmp = employees.find((e) => e.uid === backupEntry.uid);
            await updateDoc(doc(db, 'schedules', backupEntry.id), {
              isBackup: false,
              replacedUid: target.uid,
              replacedName: target.employeeName,
              notes: sanitizeString(
                `[PENGGANTI CUTI] Menggantikan ${target.employeeName} (${target.type})`,
                300
              ),
              updatedAt: serverTimestamp(),
            });
            await updateDoc(doc(db, 'schedules', dutyEntry.id), {
              notes: sanitizeString(
                `[CUTI DISETUJUI] Tugas dialihkan ke backup: ${backupEmp?.name ?? 'petugas cadangan'}`,
                300
              ),
              updatedAt: serverTimestamp(),
            });
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const reviewOvertime = async (id: string, status: ApprovalStatus) => {
    const target = overtimes.find((o) => o.id === id);
    if (!target || !canReview(target.uid, target.supervisorUid)) return;
    const reviewer = sanitizeString(currentUser?.name ?? 'HRD', 100);

    if (!isFirebaseSynced) {
      setOvertimes((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status, reviewedBy: reviewer } : o))
      );
      return;
    }

    const path = `overtimes/${id}`;
    try {
      await updateDoc(doc(db, 'overtimes', id), {
        status,
        reviewedBy: reviewer,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const reviewShiftSwap = async (
    id: string,
    status: ApprovalStatus
  ): Promise<{ ok: boolean; error?: string }> => {
    const target = shiftSwaps.find((s) => s.id === id);
    if (!target) return { ok: false, error: 'Pengajuan tukar shift tidak ditemukan.' };
    if (!canReview(target.uid, target.supervisorUid)) {
      return { ok: false, error: 'Anda tidak berhak memutuskan pengajuan ini.' };
    }
    const reviewer = sanitizeString(currentUser?.name ?? 'HRD', 100);

    if (status === 'Disetujui' && target.targetUid && target.peerStatus === 'Menunggu') {
      return {
        ok: false,
        error: `Pengajuan ini belum disetujui oleh rekan (${target.targetEmployeeName ?? 'rekan kerja'}). Rekan harus menyetujui terlebih dahulu.`,
      };
    }

    // Tukar shift hanya berlaku pada tanggal pengajuan: shift profil karyawan tidak diubah.
    const scheduleId = `sch_${target.uid}_${target.date.replace(/-/g, '')}`;
    const employee = employees.find((e) => e.uid === target.uid);

    if (status === 'Disetujui') {
      if (!employee) {
        return { ok: false, error: 'Karyawan pengaju sudah tidak terdaftar.' };
      }
      const conflict = findScheduleConflict({
        uid: target.uid,
        date: target.date,
        shiftCode: target.toShift,
        schedules,
        ignoreId: scheduleId,
      });
      if (conflict) {
        return {
          ok: false,
          error: `Tukar shift bentrok dengan jadwal ${conflict.shiftCode} pada ${conflict.date}.`,
        };
      }
    }

    const applyApprovedSwap = async () => {
      if (status !== 'Disetujui' || !employee) return;
      const existingEntry = schedules.find((s) => s.id === scheduleId);
      const entry: ScheduleEntry = {
        id: scheduleId,
        uid: target.uid,
        nik: target.nik,
        date: target.date,
        shiftCode: target.toShift,
        location: existingEntry?.location ?? 'Kantor PT Sinar Bunga Mas',
        notes: `Tukar shift ${target.fromShift} → ${target.toShift} (disetujui ${reviewer})`,
        patrolCompleted: false,
      };

      let partnerEntry: ScheduleEntry | null = null;
      if (target.targetUid) {
        const targetEmp = employees.find((e) => e.uid === target.targetUid);
        if (targetEmp) {
          const targetSchId = `sch_${target.targetUid}_${target.date.replace(/-/g, '')}`;
          const existingTargetEntry = schedules.find((s) => s.id === targetSchId);
          partnerEntry = {
            id: targetSchId,
            uid: target.targetUid,
            nik: targetEmp.nik,
            date: target.date,
            shiftCode: target.fromShift,
            location: existingTargetEntry?.location ?? 'Kantor PT Sinar Bunga Mas',
            notes: `Tukar shift ${target.toShift} → ${target.fromShift} dengan ${target.employeeName} (disetujui ${reviewer})`,
            patrolCompleted: false,
          };
        }
      }

      if (!isFirebaseSynced) {
        const replaceIds = new Set([scheduleId, ...(partnerEntry ? [partnerEntry.id] : [])]);
        const next = [entry, ...(partnerEntry ? [partnerEntry] : [])];
        setSchedules((prev) => [...next, ...prev.filter((s) => !replaceIds.has(s.id))]);
        return;
      }
      const writeSwappedEntry = async (item: ScheduleEntry) => {
        const fields = {
          uid: item.uid,
          nik: item.nik,
          date: item.date,
          shiftCode: item.shiftCode,
          location: item.location,
          notes: item.notes,
          patrolCompleted: item.patrolCompleted,
        };
        if (schedules.some((sch) => sch.id === item.id)) {
          await updateDoc(doc(db, 'schedules', item.id), {
            ...fields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'schedules', item.id), {
            ...fields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      };
      await writeSwappedEntry(entry);
      if (partnerEntry) await writeSwappedEntry(partnerEntry);
    };

    if (!isFirebaseSynced) {
      setShiftSwaps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, reviewedBy: reviewer } : s))
      );
      await applyApprovedSwap();
      return { ok: true };
    }

    const path = `shiftSwaps/${id}`;
    try {
      await updateDoc(doc(db, 'shiftSwaps', id), {
        status,
        reviewedBy: reviewer,
        updatedAt: serverTimestamp(),
      });
      await applyApprovedSwap();
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
      return { ok: false, error: 'Gagal menyimpan keputusan tukar shift.' };
    }
  };

  const reviewExitClearance = async (id: string, status: ApprovalStatus) => {
    const target = exitClearances.find((e) => e.id === id);
    if (!target || !canReview(target.uid, target.supervisorUid)) return;
    const reviewer = sanitizeString(currentUser?.name ?? 'HRD', 100);
    const nextChecklist =
      status === 'Disetujui'
        ? target.checklist.map((item) => ({ ...item, cleared: true }))
        : target.checklist;

    if (!isFirebaseSynced) {
      setExitClearances((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status, reviewedBy: reviewer, checklist: nextChecklist } : e
        )
      );
      return;
    }

    const path = `exitClearances/${id}`;
    try {
      await updateDoc(doc(db, 'exitClearances', id), {
        status,
        reviewedBy: reviewer,
        checklist: nextChecklist,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Validasi Absensi oleh HRD/Admin (Foto & GPS)
  const validateAttendance: HrisContextValue['validateAttendance'] = async (recordId, status, notes) => {
    if (!currentUser || currentUser.role !== 'hrd') return;
    const nowWib = getWibComponents(new Date());
    setAttendance((prev) =>
      prev.map((a) =>
        a.id === recordId
          ? {
              ...a,
              adminValidationStatus: status,
              adminValidationNotes: notes ?? '',
              validatedBy: currentUser.name,
              validatedAt: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
            }
          : a
      )
    );
    if (isFirebaseSynced) {
      try {
        await updateDoc(doc(db, 'attendance', recordId), {
          adminValidationStatus: status,
          adminValidationNotes: notes ?? '',
          validatedBy: currentUser.name,
          validatedAt: serverTimestamp(),
        });
      } catch {
        // ignore
      }
    }
  };

  // Pengaturan Kuota Izin / Cuti oleh HRD
  const updateLeaveQuota: HrisContextValue['updateLeaveQuota'] = async (uid, newQuota) => {
    if (!currentUser || currentUser.role !== 'hrd') return;
    const cleanQuota = Math.max(0, Math.floor(newQuota));
    setEmployees((prev) =>
      prev.map((e) => (e.uid === uid ? { ...e, leaveQuota: cleanQuota } : e))
    );
    if (isFirebaseSynced) {
      try {
        await updateDoc(doc(db, 'employees', uid), {
          leaveQuota: cleanQuota,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // ignore
      }
    }
  };

  // Menonaktifkan / Mengaktifkan Karyawan oleh HRD
  const toggleEmployeeActive: HrisContextValue['toggleEmployeeActive'] = async (uid, active) => {
    if (!currentUser || currentUser.role !== 'hrd') {
      return { ok: false, error: 'Hanya Admin HRD yang dapat mengubah status akun karyawan.' };
    }
    if (uid === firebaseUser?.uid) {
      return { ok: false, error: 'Akun Anda sendiri tidak bisa dinonaktifkan.' };
    }
    const emp = employees.find((e) => e.uid === uid);
    if (!emp) {
      return { ok: false, error: 'Karyawan tidak ditemukan pada direktori.' };
    }

    if (!isFirebaseSynced) {
      setEmployees((prev) => prev.map((e) => (e.uid === uid ? { ...e, active } : e)));
      return { ok: true, authLocked: false };
    }

    try {
      await updateDoc(doc(db, 'employees', uid), { active, updatedAt: serverTimestamp() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `employees/${uid}`);
    }
    setEmployees((prev) => prev.map((e) => (e.uid === uid ? { ...e, active } : e)));

    // Kunci akun login (Firebase Auth). `false` = Cloud Function belum di-deploy: blokir
    // Firestore + gerbang sesi di aplikasi tetap berlaku, tapi akun masih bisa `signIn`.
    const authLocked = await setEmployeeActiveAccount(uid, active);
    return { ok: true, authLocked };
  };

  // Tambah Divisi Baru oleh HRD
  const addDivision: HrisContextValue['addDivision'] = async (name) => {
    const clean = name.trim();
    if (clean.length < 2) {
      return { ok: false, error: 'Nama divisi minimal 2 karakter.' };
    }
    if (divisions.some((d) => d.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: 'Divisi dengan nama tersebut sudah ada.' };
    }
    const next = [...divisions, clean];
    setDivisions(next);
    saveStoredJson(LOCAL_DIVISIONS_KEY, next);
    // Divisi baru langsung punya aturan jam kerja (shift) sehingga bisa dipakai saat menambah karyawan.
    setDivisionShiftRules((prev) => {
      const nextRules = prev.some((rule) => rule.division === clean)
        ? prev
        : [...prev, resolveDivisionShiftRule(clean, prev)];
      saveStoredJson(LOCAL_DIVISION_SHIFT_RULES_KEY, nextRules);
      return nextRules;
    });
    return { ok: true };
  };

  /** Aturan jam kerja per divisi: mis. Security 24 jam, Cleaning Service hanya sampai sore. */
  const updateDivisionShiftRule: HrisContextValue['updateDivisionShiftRule'] = async (
    division,
    patch
  ) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.' };
    const isHrd = currentUser.role === 'hrd';
    const isSupervisor = currentUser.role === 'supervisor';
    if (!isHrd && (!isSupervisor || currentUser.division !== division)) {
      return {
        ok: false,
        error: `Hanya HRD atau Supervisor divisi ${division} yang berhak mengubah jam operasional divisi ini.`,
      };
    }

    const allowed = patch.allowedShiftCodes.filter(
      (code) => Boolean(findShiftTemplate(code)) && !hiddenShiftCodes.includes(code)
    );
    if (allowed.length === 0) {
      return { ok: false, error: 'Pilih minimal satu shift untuk divisi ini.' };
    }
    if (!allowed.includes(patch.defaultShiftCode)) {
      return { ok: false, error: 'Shift bawaan harus termasuk shift yang diizinkan.' };
    }
    const nowWib = getWibComponents(new Date());
    // shiftTimes tidak dikirim = jam lama dipertahankan; dikirim = diganti (hanya shift allowed & jam valid).
    let shiftTimes: DivisionShiftRule['shiftTimes'];
    if (patch.shiftTimes === undefined) {
      shiftTimes = divisionShiftRules.find((rule) => rule.division === division)?.shiftTimes;
    } else {
      const clean: NonNullable<DivisionShiftRule['shiftTimes']> = {};
      for (const code of allowed) {
        const startTime = normalizeShiftTime(patch.shiftTimes[code]?.startTime);
        const endTime = normalizeShiftTime(patch.shiftTimes[code]?.endTime);
        if (!startTime || !endTime) continue;
        clean[code] = { startTime, endTime };
      }
      shiftTimes = clean;
    }
    // shiftTolerances tidak dikirim = toleransi lama dipertahankan.
    let shiftTolerances: DivisionShiftRule['shiftTolerances'];
    if (patch.shiftTolerances === undefined) {
      shiftTolerances = divisionShiftRules.find((rule) => rule.division === division)?.shiftTolerances;
    } else {
      const clean: NonNullable<DivisionShiftRule['shiftTolerances']> = {};
      for (const code of allowed) {
        const raw = patch.shiftTolerances[code];
        if (!raw) continue;
        const toMinutes = (value: unknown, fallback: number) =>
          typeof value === 'number' && Number.isFinite(value)
            ? Math.min(720, Math.max(0, Math.round(value)))
            : fallback;
        clean[code] = {
          earlyInMinutes: toMinutes(raw.earlyInMinutes, DEFAULT_SHIFT_TOLERANCE.earlyInMinutes),
          lateInMinutes: toMinutes(raw.lateInMinutes, 10),
          earlyOutMinutes: toMinutes(raw.earlyOutMinutes, DEFAULT_SHIFT_TOLERANCE.earlyOutMinutes),
          lateOutMinutes: toMinutes(raw.lateOutMinutes, DEFAULT_SHIFT_TOLERANCE.lateOutMinutes),
        };
      }
      shiftTolerances = clean;
    }
    const updated: DivisionShiftRule = {
      division,
      allowedShiftCodes: allowed,
      defaultShiftCode: patch.defaultShiftCode,
      shiftTimes: shiftTimes ?? {},
      shiftTolerances: shiftTolerances ?? {},
      updatedAt: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
    };
    setDivisionShiftRules((prev) => {
      const nextRules = prev.some((rule) => rule.division === division)
        ? prev.map((rule) => (rule.division === division ? updated : rule))
        : [...prev, updated];
      saveStoredJson(LOCAL_DIVISION_SHIFT_RULES_KEY, nextRules);
      return nextRules;
    });
    return { ok: true };
  };

  /** Template shift efektif sebuah divisi: jam khusus divisi bila HRD sudah mengubahnya. */
  const shiftTemplateFor: HrisContextValue['shiftTemplateFor'] = (code, division) =>
    division
      ? shiftTemplateForDivision(code, division, divisionShiftRules)
      : resolveShiftTemplate(code);

  /** Simpan katalog shift kustom: state → localStorage → modul hrisLogic. */
  const persistShiftTemplates = (next: ShiftTemplate[]) => {
    registerShiftTemplates(next);
    saveStoredJson(LOCAL_SHIFT_TEMPLATES_KEY, next);
    setCustomShiftTemplates(next);
  };

  const requireHrd = (): { ok: false; error: string } | null =>
    currentUser?.role === 'hrd'
      ? null
      : { ok: false, error: 'Hanya Admin HRD yang dapat mengubah katalog shift.' };

  /** Tambah shift baru (mis. "Shift Sore 13:00-21:00") ke katalog shift. */
  const addShiftTemplate: HrisContextValue['addShiftTemplate'] = (input) => {
    const denied = requireHrd();
    if (denied) return denied;
    const built = buildShiftTemplate(
      input,
      customShiftTemplates.map((template) => template.code)
    );
    if (!built.ok) return built;
    persistShiftTemplates([...customShiftTemplates, built.template]);
    return { ok: true, code: built.template.code };
  };

  /** Ubah nama/jam/toleransi shift buatan HRD; kode shift tetap supaya data lama tidak putus. */
  const updateShiftTemplate: HrisContextValue['updateShiftTemplate'] = (code, input) => {
    const denied = requireHrd();
    if (denied) return denied;
    if (!customShiftTemplates.some((template) => template.code === code)) {
      return {
        ok: false,
        error: 'Shift bawaan tidak diubah dari katalog. Ubah jamnya per divisi di kartu divisi.',
      };
    }
    const built = buildShiftTemplate(
      input,
      customShiftTemplates.map((template) => template.code),
      code
    );
    if (!built.ok) return built;
    persistShiftTemplates(
      customShiftTemplates.map((template) => (template.code === code ? built.template : template))
    );
    return { ok: true, code };
  };

  /** Buang satu kode shift dari aturan jam kerja seluruh divisi (shift dianggap tidak ada lagi). */
  const detachShiftFromDivisionRules = (code: ShiftCode) => {
    // Kandidat pengganti: shift yang masih ada di katalog setelah shift ini dibuang.
    const catalogCodes = allShiftTemplates().map((template) => template.code);
    const remainingCodes = catalogCodes.length > 0 ? catalogCodes : ['REGULER'];
    setDivisionShiftRules((prevRules) => {
      let changed = false;
      const nextRules = prevRules.map((rule) => {
        if (!rule.allowedShiftCodes.includes(code)) return rule;
        changed = true;
        let allowedShiftCodes = rule.allowedShiftCodes.filter((item) => item !== code);
        if (allowedShiftCodes.length === 0) allowedShiftCodes = [...remainingCodes];
        return {
          ...rule,
          allowedShiftCodes,
          defaultShiftCode: allowedShiftCodes.includes(rule.defaultShiftCode)
            ? rule.defaultShiftCode
            : (allowedShiftCodes[0] ?? rule.defaultShiftCode),
          shiftTimes: omitShiftKey(rule.shiftTimes, code),
          shiftTolerances: omitShiftKey(rule.shiftTolerances, code),
        };
      });
      if (changed) saveStoredJson(LOCAL_DIVISION_SHIFT_RULES_KEY, nextRules);
      return changed ? nextRules : prevRules;
    });
  };

  /**
   * Hapus shift dari katalog. Shift buatan HRD benar-benar dibuang; shift bawaan hanya
   * disembunyikan (template tetap dipakai absensi/jadwal lama). Keduanya ditolak selama
   * masih ada karyawan yang memakainya, lalu dibersihkan dari aturan jam kerja tiap divisi.
   */
  const deleteShiftTemplate: HrisContextValue['deleteShiftTemplate'] = (code) => {
    const denied = requireHrd();
    if (denied) return denied;
    const custom = customShiftTemplates.find((template) => template.code === code);
    const builtin = SHIFT_TEMPLATES[code];
    if (!custom && !builtin) return { ok: false, error: 'Shift tidak ditemukan di katalog.' };
    if (!custom && hiddenShiftCodes.includes(code)) {
      return { ok: false, error: 'Shift bawaan ini sudah dihapus dari katalog.' };
    }
    const name = custom?.name ?? builtin.name;
    const remainingCatalog = allShiftTemplates().filter((tpl) => tpl.code !== code);
    if (remainingCatalog.length === 0) {
      return {
        ok: false,
        error: 'Katalog harus menyisakan minimal satu shift. Tambah shift lain lebih dulu.',
      };
    }
    const users = employees.filter((emp) => emp.shiftCode === code);
    if (users.length > 0) {
      const names = users.slice(0, 3).map((emp) => emp.name).join(', ');
      return {
        ok: false,
        error: `Shift "${name}" masih dipakai ${users.length} karyawan (${names}${
          users.length > 3 ? ', dll' : ''
        }). Pindahkan mereka ke shift lain lebih dulu.`,
      };
    }
    if (custom) {
      persistShiftTemplates(customShiftTemplates.filter((template) => template.code !== code));
    } else {
      const nextHidden = [...hiddenShiftCodes, code];
      registerHiddenShiftTemplates(nextHidden);
      saveStoredJson(LOCAL_HIDDEN_SHIFT_TEMPLATES_KEY, nextHidden);
      setHiddenShiftCodes(nextHidden);
    }
    detachShiftFromDivisionRules(code);
    return { ok: true, code };
  };

  /** Pulihkan shift bawaan yang dihapus HRD agar muncul lagi di katalog & pilihan divisi. */
  const restoreShiftTemplate: HrisContextValue['restoreShiftTemplate'] = (code) => {
    const denied = requireHrd();
    if (denied) return denied;
    if (!hiddenShiftCodes.includes(code)) {
      return { ok: false, error: 'Hanya shift bawaan yang dihapus yang bisa dipulihkan.' };
    }
    const nextHidden = hiddenShiftCodes.filter((item) => item !== code);
    registerHiddenShiftTemplates(nextHidden);
    saveStoredJson(LOCAL_HIDDEN_SHIFT_TEMPLATES_KEY, nextHidden);
    setHiddenShiftCodes(nextHidden);
    return { ok: true, code };
  };

  /** Hapus satu divisi beserta aturan jam kerjanya. Label divisi pada karyawan lama tidak ikut diubah. */
  const deleteDivision: HrisContextValue['deleteDivision'] = async (division) => {
    const same = (value: Division) => value.trim().toLowerCase() === division.trim().toLowerCase();
    if (!divisions.some(same)) {
      return { ok: false, error: `Divisi "${division}" tidak ditemukan.` };
    }
    const next = divisions.filter((item) => !same(item));
    setDivisions(next);
    saveStoredJson(LOCAL_DIVISIONS_KEY, next);
    setDivisionShiftRules((prevRules) => {
      const nextRules = prevRules.filter((rule) => !same(rule.division));
      saveStoredJson(LOCAL_DIVISION_SHIFT_RULES_KEY, nextRules);
      return nextRules;
    });
    return { ok: true };
  };

  /** Hapus semua divisi beserta seluruh aturan jam kerjanya. */
  const clearAllDivisions: HrisContextValue['clearAllDivisions'] = async () => {
    setDivisions([]);
    saveStoredJson(LOCAL_DIVISIONS_KEY, []);
    setDivisionShiftRules([]);
    saveStoredJson(LOCAL_DIVISION_SHIFT_RULES_KEY, []);
    return { ok: true };
  };

  const saveShiftRoster: HrisContextValue['saveShiftRoster'] = async (input) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.' };
    const isSup = currentUser.role === 'supervisor';
    const isHrd = currentUser.role === 'hrd';

    if (!isSup && !isHrd) {
      return { ok: false, error: 'Hanya HRD dan Supervisor yang dapat mengatur jadwal.' };
    }
    if (isSup && input.division !== currentUser.division) {
      return {
        ok: false,
        error: `Supervisor hanya dapat mengatur jadwal untuk divisi ${currentUser.division}.`,
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      return { ok: false, error: 'Tanggal jadwal tidak valid.' };
    }
    if (!isShiftAllowedForDivision(input.division, input.shiftCode, divisionShiftRules)) {
      return {
        ok: false,
        error: `Shift ${shiftTemplateName(input.shiftCode)} tidak berlaku untuk divisi ${input.division}.`,
      };
    }
    if (input.primaryUids.length === 0) {
      return { ok: false, error: 'Pilih minimal 1 staf untuk bertugas jaga.' };
    }
    if (input.backupUid && input.primaryUids.includes(input.backupUid)) {
      return {
        ok: false,
        error: 'Staf cadangan (backup) tidak boleh sama dengan staf yang bertugas jaga utama.',
      };
    }

    const loc = sanitizeString(input.location || 'Kantor PT Sinar Bunga Mas', 160);
    const userNotes = sanitizeString(input.notes ?? '', 200);
    const entriesToSave: ScheduleEntry[] = [];

    // Tambah / perbarui entri staf jaga utama
    for (const uid of input.primaryUids) {
      const emp = employees.find((e) => e.uid === uid);
      if (!emp) continue;
      const id = `sch_${emp.uid}_${input.date.replace(/-/g, '')}`;
      entriesToSave.push({
        id,
        uid: emp.uid,
        nik: emp.nik,
        date: input.date,
        shiftCode: input.shiftCode,
        location: loc,
        notes: userNotes,
        patrolCompleted: false,
        supervisorUid: emp.supervisorUid ?? '',
        isBackup: false,
      });
    }

    // Tambah / perbarui entri staf backup (1 orang cadangan)
    if (input.backupUid) {
      const emp = employees.find((e) => e.uid === input.backupUid);
      if (emp) {
        const id = `sch_${emp.uid}_${input.date.replace(/-/g, '')}`;
        entriesToSave.push({
          id,
          uid: emp.uid,
          nik: emp.nik,
          date: input.date,
          shiftCode: input.shiftCode,
          location: loc,
          notes: sanitizeString(`[Petugas Cadangan / Backup] ${userNotes}`.trim(), 300),
          patrolCompleted: false,
          supervisorUid: emp.supervisorUid ?? '',
          isBackup: true,
        });
      }
    }

    if (!isFirebaseSynced) {
      const ids = new Set(entriesToSave.map((e) => e.id));
      setSchedules((prev) => [...entriesToSave, ...prev.filter((e) => !ids.has(e.id))]);
      return { ok: true, created: entriesToSave.length };
    }

    try {
      for (const entry of entriesToSave) {
        const fields = {
          uid: entry.uid,
          nik: entry.nik,
          date: entry.date,
          shiftCode: entry.shiftCode,
          location: entry.location,
          notes: entry.notes,
          patrolCompleted: entry.patrolCompleted,
          supervisorUid: entry.supervisorUid ?? '',
          isBackup: Boolean(entry.isBackup),
        };
        // Jadwal tanggal & karyawan yang sama sudah ada → perbarui tanpa menyentuh createdAt
        // (rules menolak createdAt yang berubah saat update). Cek juga Firestore bila belum termuat di state.
        const docRef = doc(db, 'schedules', entry.id);
        const alreadyExists =
          schedules.some((item) => item.id === entry.id) || (await getDoc(docRef)).exists();
        if (alreadyExists) {
          await updateDoc(docRef, {
            ...fields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(docRef, {
            ...fields,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
      return { ok: true, created: entriesToSave.length };
    } catch (err) {
      console.error('Firestore Error (saveShiftRoster):', err);
      return { ok: false, error: 'Gagal menyimpan penugasan shift. Periksa koneksi lalu coba lagi.' };
    }
  };

  const deleteScheduleEntry: HrisContextValue['deleteScheduleEntry'] = async (scheduleId) => {
    if (!isFirebaseSynced) {
      setSchedules((prev) => prev.filter((item) => item.id !== scheduleId));
      return;
    }
    try {
      await deleteDoc(doc(db, 'schedules', scheduleId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `schedules/${scheduleId}`);
    }
  };

  /** Hapus seluruh baris jadwal: mode konsol dari state, mode Firebase sekaligus dari Firestore. */
  const clearAllSchedules: HrisContextValue['clearAllSchedules'] = async () => {
    const entries = schedules;
    if (isFirebaseSynced && entries.length > 0) {
      const results = await Promise.allSettled(
        entries.map((entry) => deleteDoc(doc(db, 'schedules', entry.id)))
      );
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) {
        setSchedules([]);
        return {
          ok: false,
          error: `${failed} dari ${entries.length} jadwal gagal dihapus. Periksa koneksi lalu coba lagi.`,
          deleted: entries.length - failed,
        };
      }
    }
    setSchedules([]);
    return { ok: true, deleted: entries.length };
  };

  // Komponen gaji (BPJS, tunjangan, kasbon) — dapat diset global, per divisi, atau per karyawan
  const addPayslipComponent: HrisContextValue['addPayslipComponent'] = async (input) => {
    const name = sanitizeString(input.name, 80);
    if (name.length < 3) {
      return { ok: false, error: 'Nama komponen minimal 3 karakter.' };
    }
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      return { ok: false, error: 'Nominal komponen tidak valid.' };
    }
    if (input.basis === 'persenGajiPokok' && input.amount > 100) {
      return { ok: false, error: 'Persentase gaji pokok maksimal 100%.' };
    }
    if (input.scope === 'division' && !input.division) {
      return { ok: false, error: 'Pilih divisi untuk komponen ini.' };
    }
    if (input.scope === 'employee' && !input.employeeUid) {
      return { ok: false, error: 'Pilih karyawan untuk komponen ini.' };
    }
    const nowWib = getWibComponents(new Date());
    const component: PayslipComponent = {
      ...input,
      name,
      id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      active: input.active ?? true,
      createdAt: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
    };
    setPayslipComponents((prev) => {
      const next = [component, ...prev];
      saveStoredJson(LOCAL_PAYSLIP_COMPONENTS_KEY, next);
      return next;
    });
    return { ok: true };
  };

  const updatePayslipComponent: HrisContextValue['updatePayslipComponent'] = async (id, updates) => {
    if (updates.amount !== undefined && (!Number.isFinite(updates.amount) || updates.amount < 0)) {
      return { ok: false, error: 'Nominal komponen tidak valid.' };
    }
    if (updates.name !== undefined && sanitizeString(updates.name, 80).length < 3) {
      return { ok: false, error: 'Nama komponen minimal 3 karakter.' };
    }
    setPayslipComponents((prev) => {
      const next = prev.map((item) =>
        item.id === id
          ? { ...item, ...updates, name: updates.name ? sanitizeString(updates.name, 80) : item.name }
          : item
      );
      saveStoredJson(LOCAL_PAYSLIP_COMPONENTS_KEY, next);
      return next;
    });
    return { ok: true };
  };

  const deletePayslipComponent: HrisContextValue['deletePayslipComponent'] = async (id) => {
    setPayslipComponents((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveStoredJson(LOCAL_PAYSLIP_COMPONENTS_KEY, next);
      return next;
    });
  };

  const updatePayrollSettings: HrisContextValue['updatePayrollSettings'] = async (patch) => {
    const next: PayrollSettings = { ...payrollSettings, ...patch };
    const bounded: Array<[keyof PayrollSettings, number, number, string]> = [
      ['bpjsKesehatanRate', 0, 100, 'Persentase BPJS Kesehatan 0-100%.'],
      ['bpjsKetenagakerjaanRate', 0, 100, 'Persentase BPJS Ketenagakerjaan 0-100%.'],
      ['lateDeductionPerMinute', 0, 1_000_000, 'Potongan keterlambatan per menit 0-1.000.000.'],
      ['overtimeHourlyMultiplier', 0, 10, 'Pengali upah lembur per jam 0-10.'],
      ['overtimeSessionRate', 0, 10_000_000, 'Tarif lembur per sesi 0-10.000.000.'],
    ];
    for (const [key, min, max, message] of bounded) {
      const value = next[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        return { ok: false, error: message };
      }
    }
    if (next.overtimeRateMode !== 'perJam' && next.overtimeRateMode !== 'perSesi') {
      return { ok: false, error: 'Mode lembur tidak dikenal.' };
    }
    setPayrollSettings(next);
    saveStoredJson(LOCAL_PAYROLL_SETTINGS_KEY, next);
    return { ok: true };
  };

  const updateUserPayrollConfig: HrisContextValue['updateUserPayrollConfig'] = async (
    uid,
    patch
  ) => {
    const prev = userPayrollConfigs[uid] ?? { workDaysTarget: DEFAULT_WORK_DAYS_TARGET };
    const next: UserPayrollConfig = {
      ...prev,
      ...patch,
      workDaysTarget: Math.min(
        31,
        Math.max(1, Math.round(Number(patch.workDaysTarget ?? prev.workDaysTarget ?? DEFAULT_WORK_DAYS_TARGET)))
      ),
      updatedAt: `${getWibComponents(new Date()).isoDate} ${getWibComponents(new Date()).timeShort} WIB`,
    };
    if (!Number.isFinite(next.workDaysTarget) || next.workDaysTarget < 1 || next.workDaysTarget > 31) {
      return { ok: false, error: 'Target hari kerja harus antara 1 sampai 31 hari.' };
    }
    const boundedRates: Array<[number | undefined, number, number, string]> = [
      [next.bpjsKesehatanRate, 0, 1, 'BPJS Kesehatan harus 0–100%.'],
      [next.bpjsKetenagakerjaanRate, 0, 1, 'BPJS Ketenagakerjaan harus 0–100%.'],
      [next.lateDeductionPerMinute, 0, 1_000_000, 'Potongan telat per menit tidak valid.'],
      [next.overtimeHourlyMultiplier, 0, 10, 'Pengali lembur per jam harus 0–10.'],
      [next.overtimeSessionRate, 0, 10_000_000, 'Tarif lembur per sesi tidak valid.'],
    ];
    for (const [val, min, max, msg] of boundedRates) {
      if (val !== undefined && (!Number.isFinite(val) || val < min || val > max)) {
        return { ok: false, error: msg };
      }
    }
    setUserPayrollConfigs((curr) => {
      const updated = { ...curr, [uid]: next };
      saveStoredJson(LOCAL_USER_PAYROLL_CONFIGS_KEY, updated);
      return updated;
    });
    return { ok: true };
  };

  const resetAllDataKeepAdminOnly: HrisContextValue['resetAllDataKeepAdminOnly'] = async () => {
    if (!currentUser || currentUser.role !== 'hrd') {
      return { ok: false, deletedDocs: 0, error: 'Hanya Admin HRD yang dapat mereset semua data.' };
    }

    const defaultHidden: ShiftCode[] = ['PAGI', 'SIANG', 'MALAM', 'SECURITY24'];
    let deletedDocs = 0;
    const failedCollections: string[] = [];

    if (isFirebaseSynced) {
      const wipeCollection = async (
        name: string,
        fallbackIds: string[],
        keepId?: string
      ) => {
        let ids = fallbackIds;
        try {
          const snap = await getDocs(collection(db, name));
          ids = snap.docs.map((d) => d.id);
        } catch {
          // Pakai daftar ID dari state bila query list dibatasi rules.
        }
        const targetIds = ids.filter((id) => id && id !== keepId);
        if (targetIds.length === 0) return;
        const results = await Promise.allSettled(
          targetIds.map((id) => deleteDoc(doc(db, name, id)))
        );
        for (const r of results) {
          if (r.status === 'fulfilled') deletedDocs += 1;
          else if (!failedCollections.includes(name)) failedCollections.push(name);
        }
      };

      await wipeCollection('attendance', attendance.map((a) => a.id));
      await wipeCollection('leaves', leaves.map((l) => l.id));
      await wipeCollection('overtimes', overtimes.map((o) => o.id));
      await wipeCollection('shiftSwaps', shiftSwaps.map((s) => s.id));
      await wipeCollection('exitClearances', exitClearances.map((e) => e.id));
      await wipeCollection('schedules', schedules.map((s) => s.id));
      const docIds = Object.entries(employeeDocuments).flatMap(([uid, kinds]) =>
        (['ktp', 'kk'] as const).filter((k) => Boolean(kinds[k])).map((k) => `${uid}_${k}`)
      );
      await wipeCollection('employeeDocuments', docIds);
      await wipeCollection(
        'employees',
        employees.map((e) => e.uid),
        currentUser.uid
      );
      if (isBootstrapAdmin) {
        await wipeCollection('admins', [], currentUser.uid);
      }
      try {
        await updateDoc(doc(db, 'employees', currentUser.uid), {
          division: 'HRD',
          role: 'hrd',
          shiftCode: 'REGULER',
          supervisorUid: '',
          active: true,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Abaikan bila dokumen admin sudah sesuai.
      }
    }

    saveStoredJson(LOCAL_DIVISIONS_KEY, []);
    saveStoredJson(LOCAL_DIVISION_SHIFT_RULES_KEY, []);
    saveStoredJson(LOCAL_SHIFT_TEMPLATES_KEY, []);
    saveStoredJson(LOCAL_HIDDEN_SHIFT_TEMPLATES_KEY, defaultHidden);
    saveStoredJson(LOCAL_PAYSLIP_COMPONENTS_KEY, []);
    saveStoredJson(LOCAL_USER_PAYROLL_CONFIGS_KEY, {});
    saveStoredJson(LOCAL_TODOS_KEY, []);
    try {
      localStorage.removeItem(LOCAL_PAYROLL_SETTINGS_KEY);
      sessionStorage.removeItem(LOCAL_PHOTO_KEY);
    } catch {
      // Abaikan storage yang tidak tersedia.
    }

    setDivisions([]);
    setDivisionShiftRules([]);
    persistShiftTemplates([]);
    registerHiddenShiftTemplates(defaultHidden);
    setHiddenShiftCodes(defaultHidden);
    setPayslipComponents([]);
    setPayrollSettings(DEFAULT_PAYROLL_SETTINGS);
    setUserPayrollConfigs({});
    setTodos([]);
    setLocalPhotos({});
    setAttendance([]);
    setLeaves([]);
    setOvertimes([]);
    setShiftSwaps([]);
    setExitClearances([]);
    setSchedules([]);
    setEmployeeDocuments({});
    setEmployees((prev) =>
      prev
        .filter((e) => e.uid === currentUser.uid)
        .map((e) => ({
          ...e,
          division: 'HRD',
          role: 'hrd',
          shiftCode: 'REGULER',
          supervisorUid: '',
          active: true,
        }))
    );

    if (failedCollections.length > 0) {
      return {
        ok: false,
        deletedDocs,
        error: `Sebagian data (${failedCollections.join(', ')}) belum terhapus oleh rules Firestore (pastikan login sebagai Bootstrap Admin).`,
      };
    }
    return { ok: true, deletedDocs };
  };

  const approvedLeaveFor = useCallback(
    (uid: string, isoDate: string) => findApprovedLeaveOnDate(leaves, uid, isoDate),
    [leaves]
  );

  const currentLeaveToday = useMemo(
    () => (currentUser ? findApprovedLeaveOnDate(leaves, currentUser.uid, wibNow.isoDate) : null),
    [currentUser, leaves, wibNow.isoDate]
  );

  // Input Todo List oleh Supervisor / Admin
  const addTodoTask: HrisContextValue['addTodoTask'] = async (taskInput) => {
    const nowWib = getWibComponents(new Date());
    const id = `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newTask: TodoTask = {
      ...taskInput,
      id,
      status: 'Belum Dikerjakan',
      createdAt: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
    };
    setTodos((prev) => {
      const next = [newTask, ...prev];
      try {
        localStorage.setItem('sbum_hris_todos_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Karyawan Mengirim Laporan Todo List
  const submitTodoReport: HrisContextValue['submitTodoReport'] = async (taskId, report) => {
    const nowWib = getWibComponents(new Date());
    setTodos((prev) => {
      const next = prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'Menunggu Review' as TodoStatus,
              reportText: report.text ?? t.reportText,
              reportPhotoName: report.photoName ?? t.reportPhotoName,
              reportPhotoUrl: report.photoUrl ?? t.reportPhotoUrl,
              reportDocumentName: report.documentName ?? t.reportDocumentName,
              reportDocumentUrl: report.documentUrl ?? t.reportDocumentUrl,
              submittedAt: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
            }
          : t
      );
      try {
        localStorage.setItem('sbum_hris_todos_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Supervisor / Admin Mereview Tugas Todo List
  const reviewTodoTask: HrisContextValue['reviewTodoTask'] = async (taskId, status, notes) => {
    if (!currentUser) return;
    const nowWib = getWibComponents(new Date());
    setTodos((prev) => {
      const next = prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status,
              reviewNotes: notes ?? t.reviewNotes,
              reviewedBy: `${currentUser.name} (${currentUser.role})`,
              reviewedAt: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
            }
          : t
      );
      try {
        localStorage.setItem('sbum_hris_todos_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Hapus satu atau beberapa tugas Todo List oleh HRD / Supervisor
  const deleteTodoTasks: HrisContextValue['deleteTodoTasks'] = async (taskIds) => {
    if (!currentUser) return { ok: false, error: 'Sesi tidak aktif.', deleted: 0 };
    if (currentUser.role !== 'hrd' && currentUser.role !== 'supervisor') {
      return { ok: false, error: 'Hanya HRD atau Supervisor yang dapat menghapus tugas.', deleted: 0 };
    }
    const idSet = new Set(taskIds);
    const targets = todos.filter((t) => idSet.has(t.id));
    if (targets.length === 0) {
      return { ok: false, error: 'Tugas tidak ditemukan.', deleted: 0 };
    }
    if (currentUser.role === 'supervisor') {
      const unauthorized = targets.some((target) => {
        const assignee = employees.find((e) => e.uid === target.assignedToUid);
        return !(
          target.assignedByUid === currentUser.uid ||
          target.assignedToUid === currentUser.uid ||
          assignee?.supervisorUid === currentUser.uid ||
          target.assignedToDivision === currentUser.division
        );
      });
      if (unauthorized) {
        return { ok: false, error: 'Tidak dapat menghapus tugas di luar tim Anda.', deleted: 0 };
      }
    }
    const removeIds = new Set(targets.map((t) => t.id));
    setTodos((prev) => {
      const next = prev.filter((t) => !removeIds.has(t.id));
      saveStoredJson(LOCAL_TODOS_KEY, next);
      return next;
    });
    return { ok: true, deleted: targets.length };
  };
  const value: HrisContextValue = {
    authReady,
    firebaseUser,
    isFirebaseSynced,
    needsEmailVerification: Boolean(firebaseUser && !firebaseUser.emailVerified),
    accountDisabledNotice,
    employees: employeesView,
    currentUser,
    attendance,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    schedules,
    localPhotos,
    wibNow,
    theme,
    setTheme,
    toggleTheme,
    loginWithEmail,
    loginWithGoogle,
    sendResetPassword,
    resendVerificationEmail,
    refreshAuthUser,
    changePassword,
    resetUserPassword,
    logout,
    canReview,
    addEmployeeByHrd,
    updateEmployeeProfile,
    employeeDocuments,
    saveEmployeeDocument,
    deleteEmployeeDocument,
    signContract,
    recordClockIn,
    recordClockOut,
    submitLeave,
    submitOvertime,
    submitShiftSwap,
    reviewShiftSwapPeer,
    submitExitClearance,
    toggleExitChecklistItem,
    togglePatrolComplete,
    reviewLeave,
    reviewOvertime,
    reviewShiftSwap,
    reviewExitClearance,
    todos,
    deleteTodoTasks,
    divisions,
    addDivision,
    deleteDivision,
    clearAllDivisions,
    divisionShiftRules,
    updateDivisionShiftRule,
    shiftTemplateFor,
    shiftTemplates: allShiftTemplates(),
    hiddenShiftCodes,
    addShiftTemplate,
    updateShiftTemplate,
    deleteShiftTemplate,
    restoreShiftTemplate,
    saveShiftRoster,
    deleteScheduleEntry,
    clearAllSchedules,
    payslipComponents,
    addPayslipComponent,
    updatePayslipComponent,
    deletePayslipComponent,
    payrollSettings,
    updatePayrollSettings,
    userPayrollConfigs,
    updateUserPayrollConfig,
    resetAllDataKeepAdminOnly,
    approvedLeaveFor,
    currentLeaveToday,
    addTodoTask,
    submitTodoReport,
    reviewTodoTask,
    validateAttendance,
    updateLeaveQuota,
    toggleEmployeeActive,
  };

  return <HrisContext.Provider value={value}>{children}</HrisContext.Provider>;
}

export function useHris() {
  const ctx = useContext(HrisContext);
  if (!ctx) throw new Error('useHris must be used within HrisProvider');
  return ctx;
}

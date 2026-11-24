import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  OperationType,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
} from '../firebase';
import type {
  ApprovalStatus,
  AttendanceRecord,
  Division,
  Employee,
  ExitClearanceRequest,
  LeaveRequest,
  OvertimeRequest,
  ScheduleEntry,
  ShiftCode,
  ShiftSwapRequest,
} from '../types/hris';
import {
  calculateInclusiveDays,
  calculateLateMinutes,
  calculateOvertimeEstimate,
  calculateWorkMinutes,
  generateEmployeeNik,
  getDivisionCompensationDefaults,
  getWibComponents,
  isValidEmailAddress,
  sanitizeString,
} from '../utils/hrisLogic';

const ONBOARDING_DRAFT_KEY = 'sbum_onboarding_draft_v2';
const LOCAL_PHOTO_KEY = 'sbum_local_watermark_photos_v2';

interface OnboardingDraft {
  name: string;
  division: Division;
  shiftCode: ShiftCode;
  position: string;
}

export interface EmailRegisterInput {
  email: string;
  password: string;
  name: string;
  division: Division;
  shiftCode: ShiftCode;
  position?: string;
}

export interface HrdAddEmployeeInput {
  email: string;
  name: string;
  position: string;
  division: Division;
  shiftCode: ShiftCode;
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

export interface AdminSessionInfo {
  username: string;
  name: string;
  nik: string;
  role: 'hrd';
}

interface HrisContextValue {
  authReady: boolean;
  firebaseUser: User | null;
  adminSession: AdminSessionInfo | null;
  isAdminSession: boolean;
  isFirebaseSynced: boolean;
  needsEmailVerification: boolean;
  employees: Employee[];
  currentUser: Employee | null;
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  overtimes: OvertimeRequest[];
  shiftSwaps: ShiftSwapRequest[];
  exitClearances: ExitClearanceRequest[];
  schedules: ScheduleEntry[];
  localPhotos: Record<string, { in?: string; out?: string }>;
  wibNow: ReturnType<typeof getWibComponents>;
  loginWithEmail: (email: string, password: string) => AsyncResult;
  loginAsAdmin: (username: string, password: string) => AsyncResult;
  registerWithEmail: (input: EmailRegisterInput) => AsyncResult<{ needsVerification: boolean }>;
  loginWithGoogle: () => AsyncResult;
  sendResetPassword: (email: string) => AsyncResult;
  resendVerificationEmail: () => AsyncResult;
  refreshAuthUser: () => AsyncResult<{ verified: boolean }>;
  changePassword: (newPassword: string) => AsyncResult;
  changeAdminPassword: (currentPassword: string, newPassword: string) => AsyncResult;
  logout: () => Promise<void>;
  addEmployeeByHrd: (input: HrdAddEmployeeInput) => AsyncResult<{ employee: Employee }>;
  updateEmployeeProfile: (
    uid: string,
    updates: Partial<Pick<Employee, 'phone' | 'address' | 'shiftCode' | 'division' | 'position' | 'active'>>
  ) => Promise<void>;
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
  }) => AsyncResult;
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
  reviewShiftSwap: (id: string, status: ApprovalStatus) => Promise<void>;
  reviewExitClearance: (id: string, status: ApprovalStatus) => Promise<void>;
}

const HrisContext = createContext<HrisContextValue | null>(null);

function createAdminConsoleProfile(admin: AdminSessionInfo): Employee {
  const nowWib = getWibComponents(new Date());
  const contractEnd = `${nowWib.year + 2}-${String(nowWib.month + 1).padStart(2, '0')}-${String(nowWib.day).padStart(2, '0')}`;
  return {
    uid: 'admin_console',
    nik: admin.nik,
    name: admin.name,
    position: 'HRD & System Administrator',
    division: 'HRD',
    role: 'hrd',
    shiftCode: 'REGULER',
    email: BOOTSTRAP_ADMIN_EMAIL,
    phone: '0812-8800-1100',
    address: 'Kantor Pusat PT Sinar Bunga Mas, Jakarta',
    joinDate: nowWib.isoDate,
    contractType: 'PKWTT',
    contractEnd,
    contractSigned: true,
    contractSignedAt: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
    baseSalary: 8500000,
    positionAllowance: 1500000,
    mealTransportAllowance: 1000000,
    leaveQuota: 12,
    active: true,
  };
}

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
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
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password). Gunakan tombol "Masuk / Daftar dengan Google" atau aktifkan penyedia Email/Password di Firebase Console.';
    case 'auth/requires-recent-login':
      return 'Demi keamanan, silakan keluar lalu masuk kembali sebelum mengubah kata sandi.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa saat.';
    default:
      return err instanceof Error ? err.message : 'Gagal memproses autentikasi Firebase.';
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

  // Server-verified Admin Bearer token held strictly in JS/React memory (never localStorage/sessionStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSessionInfo | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [shiftSwaps, setShiftSwaps] = useState<ShiftSwapRequest[]>([]);
  const [exitClearances, setExitClearances] = useState<ExitClearanceRequest[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [localPhotos, setLocalPhotos] = useState<Record<string, { in?: string; out?: string }>>(
    loadLocalPhotos
  );
  const [wibNow, setWibNow] = useState(() => getWibComponents(new Date()));

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
  const isAdminSession = Boolean(adminSession && adminToken);
  const isBootstrapAdmin = Boolean(
    isFirebaseSynced && firebaseUser?.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()
  );

  // Clear HRIS arrays when neither Firebase Auth nor Admin session is active
  useEffect(() => {
    if (!isFirebaseSynced && !isAdminSession) {
      setEmployees([]);
      setAttendance([]);
      setLeaves([]);
      setOvertimes([]);
      setShiftSwaps([]);
      setExitClearances([]);
      setSchedules([]);
    }
  }, [isFirebaseSynced, isAdminSession]);

  // Ensure Firestore employee profile exists on first verified Firebase login
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) return;

    let cancelled = false;
    const ensureProfile = async () => {
      const empPath = `employees/${firebaseUser.uid}`;
      const empRef = doc(db, 'employees', firebaseUser.uid);
      try {
        const snap = await getDoc(empRef);
        if (!snap.exists()) {
          let draft: OnboardingDraft | null = null;
          try {
            const rawDraft = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
            if (rawDraft) {
              draft = JSON.parse(rawDraft) as OnboardingDraft;
              sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
            }
          } catch {
            // ignore
          }

          const nowWib = getWibComponents(new Date());
          const division: Division = isBootstrapAdmin
            ? 'HRD'
            : draft?.division && draft.division !== 'HRD'
              ? draft.division
              : 'Operasional';
          const shiftCode: ShiftCode = draft?.shiftCode ?? 'REGULER';
          const email = sanitizeString(firebaseUser.email || 'user@sinarbungamas.co.id', 120);
          const fallbackName = email.split('@')[0]?.replace(/[._-]+/g, ' ') || 'Karyawan SBM';
          const rawName = draft?.name || firebaseUser.displayName || fallbackName;
          const name = sanitizeString(rawName.length >= 2 ? rawName : 'Karyawan SBM', 100);
          const position = sanitizeString(
            isBootstrapAdmin ? 'HR Manager' : draft?.position || `Staff ${division}`,
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

          const schId = `sch_${firebaseUser.uid.slice(0, 12)}_${nowWib.isoDate.replace(/-/g, '')}`;
          await setDoc(doc(db, 'schedules', schId), {
            uid: firebaseUser.uid,
            nik,
            date: nowWib.isoDate,
            shiftCode,
            location: 'Kantor Pusat PT Sinar Bunga Mas',
            notes: 'Jadwal kerja aktif karyawan',
            patrolCompleted: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
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
  }, [authReady, firebaseUser, isBootstrapAdmin]);

  // Attach Firestore real-time listeners strictly after Firebase Auth + profile are ready
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified || !profileReady) return;

    const uid = firebaseUser.uid;
    const unsubs: Array<() => void> = [];

    if (isBootstrapAdmin) {
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
      unsubs.push(
        onSnapshot(
          doc(db, 'employees', uid),
          (snap) => {
            setEmployees(snap.exists() ? [snap.data() as Employee] : []);
          },
          (err) => handleFirestoreError(err, OperationType.GET, `employees/${uid}`)
        )
      );
    }

    const bindCollection = <T extends { id: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortFn: (a: T, b: T) => number
    ) => {
      const ref = isBootstrapAdmin
        ? collection(db, colName)
        : query(collection(db, colName), where('uid', '==', uid));
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T);
          items.sort(sortFn);
          setter(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, colName)
      );
      unsubs.push(unsub);
    };

    bindCollection<AttendanceRecord>('attendance', setAttendance, (a, b) =>
      `${b.date} ${b.clockInTime}`.localeCompare(`${a.date} ${a.clockInTime}`)
    );
    bindCollection<LeaveRequest>('leaves', setLeaves, (a, b) =>
      b.createdLabel.localeCompare(a.createdLabel)
    );
    bindCollection<OvertimeRequest>('overtimes', setOvertimes, (a, b) =>
      b.createdLabel.localeCompare(a.createdLabel)
    );
    bindCollection<ShiftSwapRequest>('shiftSwaps', setShiftSwaps, (a, b) =>
      b.createdLabel.localeCompare(a.createdLabel)
    );
    bindCollection<ExitClearanceRequest>('exitClearances', setExitClearances, (a, b) =>
      b.createdLabel.localeCompare(a.createdLabel)
    );
    bindCollection<ScheduleEntry>('schedules', setSchedules, (a, b) =>
      b.date.localeCompare(a.date)
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, firebaseUser, profileReady, isBootstrapAdmin]);

  const currentUser = useMemo(() => {
    if (isFirebaseSynced && firebaseUser) {
      return employees.find((e) => e.uid === firebaseUser.uid) ?? null;
    }
    if (isAdminSession && adminSession) {
      return (
        employees.find((e) => e.uid === 'admin_console') ?? createAdminConsoleProfile(adminSession)
      );
    }
    return null;
  }, [employees, firebaseUser, isFirebaseSynced, isAdminSession, adminSession]);

  // Auth actions
  const loginWithEmail: HrisContextValue['loginWithEmail'] = async (email, password) => {
    const cleanEmail = email.trim();
    if (!isValidEmailAddress(cleanEmail)) {
      return { ok: false, error: 'Masukkan alamat email yang valid.' };
    }
    if (!password) {
      return { ok: false, error: 'Kata sandi wajib diisi.' };
    }
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  const loginAsAdmin: HrisContextValue['loginAsAdmin'] = async (username, password) => {
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      return { ok: false, error: 'Username dan kata sandi admin wajib diisi.' };
    }
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        token?: string;
        admin?: AdminSessionInfo;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.token || !data.admin) {
        return {
          ok: false,
          error: data.error || 'Username atau kata sandi admin tidak sesuai.',
        };
      }
      setAdminToken(data.token);
      setAdminSession(data.admin);
      if (!isFirebaseSynced) {
        const adminProfile = createAdminConsoleProfile(data.admin);
        setEmployees((prev) =>
          prev.some((e) => e.uid === 'admin_console') ? prev : [adminProfile, ...prev]
        );
        const nowWib = getWibComponents(new Date());
        setSchedules((prev) =>
          prev.length > 0
            ? prev
            : [
                {
                  id: `sch_admin_${nowWib.isoDate.replace(/-/g, '')}`,
                  uid: adminProfile.uid,
                  nik: adminProfile.nik,
                  date: nowWib.isoDate,
                  shiftCode: 'REGULER',
                  location: 'Kantor Pusat PT Sinar Bunga Mas',
                  notes: 'Monitoring operasional & persetujuan HRD harian',
                  patrolCompleted: false,
                },
              ]
        );
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Tidak dapat terhubung ke server autentikasi admin. Coba beberapa saat lagi.',
      };
    }
  };

  const registerWithEmail: HrisContextValue['registerWithEmail'] = async (input) => {
    const cleanEmail = sanitizeString(input.email, 120);
    const cleanName = sanitizeString(input.name, 100);
    if (!isValidEmailAddress(cleanEmail)) {
      return { ok: false, error: 'Masukkan alamat email aktif yang valid.' };
    }
    if (cleanName.length < 2) {
      return { ok: false, error: 'Nama lengkap minimal 2 karakter.' };
    }
    if (input.password.length < 6) {
      return { ok: false, error: 'Kata sandi minimal 6 karakter.' };
    }

    try {
      const draft: OnboardingDraft = {
        name: cleanName,
        division: input.division,
        shiftCode: input.shiftCode,
        position: sanitizeString(input.position || `Staff ${input.division}`, 80),
      };
      sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
      await updateProfile(cred.user, { displayName: cleanName });
      await sendEmailVerification(cred.user);
      return { ok: true, needsVerification: !cred.user.emailVerified };
    } catch (err) {
      return { ok: false, error: mapFirebaseAuthError(err) };
    }
  };

  const loginWithGoogle: HrisContextValue['loginWithGoogle'] = async () => {
    try {
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

  const changeAdminPassword: HrisContextValue['changeAdminPassword'] = async (
    currentPassword,
    newPassword
  ) => {
    if (!adminToken) {
      return { ok: false, error: 'Sesi login admin tidak aktif.' };
    }
    if (newPassword.length < 6) {
      return { ok: false, error: 'Kata sandi admin baru minimal 6 karakter.' };
    }
    try {
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await response.json()) as { ok?: boolean; token?: string; error?: string };
      if (!response.ok || !data.ok || !data.token) {
        return { ok: false, error: data.error || 'Gagal memperbarui kata sandi admin.' };
      }
      setAdminToken(data.token);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Gagal menghubungi server untuk memperbarui kata sandi admin.' };
    }
  };

  const logout = async () => {
    if (adminToken) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        });
      } catch {
        // Ignore network error during logout cleanup
      }
      setAdminToken(null);
      setAdminSession(null);
    }
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

    const nowWib = getWibComponents(new Date());
    const empUid = `emp_${Date.now()}`;
    const nik = generateEmployeeNik(input.division, empUid);
    const comp = getDivisionCompensationDefaults(input.division);
    const contractEnd = `${nowWib.year + 1}-${String(nowWib.month + 1).padStart(2, '0')}-${String(nowWib.day).padStart(2, '0')}`;

    const newEmp: Employee = {
      uid: empUid,
      nik,
      name: cleanName,
      position: sanitizeString(input.position || `Staff ${input.division}`, 80),
      division: input.division,
      role: input.division === 'HRD' ? 'hrd' : 'employee',
      shiftCode: input.shiftCode,
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
      id: `sch_${empUid}`,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { ok: true, employee: newEmp };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, empPath);
    }
  };

  const updateEmployeeProfile: HrisContextValue['updateEmployeeProfile'] = async (uid, updates) => {
    const cleanUpdates: Partial<Employee> = {};
    if (updates.phone !== undefined) cleanUpdates.phone = sanitizeString(updates.phone, 30);
    if (updates.address !== undefined) cleanUpdates.address = sanitizeString(updates.address, 240);
    if (updates.shiftCode !== undefined) cleanUpdates.shiftCode = updates.shiftCode;
    if (updates.division !== undefined) cleanUpdates.division = updates.division;
    if (updates.position !== undefined) cleanUpdates.position = sanitizeString(updates.position, 80);
    if (updates.active !== undefined) cleanUpdates.active = updates.active;

    if (!isFirebaseSynced) {
      setEmployees((prev) => prev.map((e) => (e.uid === uid ? { ...e, ...cleanUpdates } : e)));
      return;
    }

    const path = `employees/${uid}`;
    try {
      await updateDoc(doc(db, 'employees', uid), {
        ...cleanUpdates,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
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
    const existingToday = attendance.find(
      (a) => a.uid === currentUser.uid && a.date === nowWib.isoDate
    );
    if (existingToday?.clockInTime) {
      return { ok: false, error: 'Anda sudah melakukan Absen Masuk hari ini.' };
    }

    const lateMinutes = calculateLateMinutes(nowWib.timeFull, currentUser.shiftCode);
    const id = `att_${currentUser.uid.slice(0, 12)}_${nowWib.isoDate.replace(/-/g, '')}`;
    const record: AttendanceRecord = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      date: nowWib.isoDate,
      shiftCode: currentUser.shiftCode,
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
    };

    if (!isFirebaseSynced) {
      setAttendance((prev) => [record, ...prev]);
      if (payload.photoDataUrl) saveLocalPhoto(id, 'in', payload.photoDataUrl);
      return { ok: true, record };
    }

    const { id: _docId, ...firestoreBody } = record;
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
      return { ok: true, record };
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

    const workMinutes = calculateWorkMinutes(existingToday.clockInTime, nowWib.timeFull);
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
    };

    if (!isFirebaseSynced) {
      setAttendance((prev) => prev.map((a) => (a.id === existingToday.id ? updatedRecord : a)));
      if (payload.photoDataUrl) saveLocalPhoto(existingToday.id, 'out', payload.photoDataUrl);
      return { ok: true, record: updatedRecord };
    }

    const path = `attendance/${existingToday.id}`;
    try {
      await updateDoc(doc(db, 'attendance', existingToday.id), {
        clockOutTime: updatedRecord.clockOutTime,
        clockOutPhotoVerified: true,
        clockOutLat: updatedRecord.clockOutLat,
        clockOutLng: updatedRecord.clockOutLng,
        clockOutAddress: updatedRecord.clockOutAddress,
        workMinutes,
        status,
        updatedAt: serverTimestamp(),
      });
      if (payload.photoDataUrl) {
        saveLocalPhoto(existingToday.id, 'out', payload.photoDataUrl);
      }
      return { ok: true, record: updatedRecord };
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
    const nowWib = getWibComponents(new Date());
    const id = `lv_${Date.now()}`;
    const item: LeaveRequest = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      days: Math.min(60, days),
      reason,
      status: 'Menunggu',
      createdLabel: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
      reviewedBy: '',
    };

    if (!isFirebaseSynced) {
      setLeaves((prev) => [item, ...prev]);
      return { ok: true };
    }

    const path = `leaves/${id}`;
    try {
      const { id: _id, ...body } = item;
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
    if (hours <= 0) {
      return { ok: false, error: 'Durasi lembur harus lebih dari 0 jam.' };
    }
    const nowWib = getWibComponents(new Date());
    const id = `ot_${Date.now()}`;
    const item: OvertimeRequest = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      date: input.date,
      startTime: sanitizeString(input.startTime, 8),
      endTime: sanitizeString(input.endTime, 8),
      hours: Math.min(24, hours),
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
    if (input.toShift === currentUser.shiftCode) {
      return { ok: false, error: 'Pilih shift tujuan yang berbeda dari shift Anda saat ini.' };
    }
    const nowWib = getWibComponents(new Date());
    const id = `sw_${Date.now()}`;
    const item: ShiftSwapRequest = {
      id,
      uid: currentUser.uid,
      nik: currentUser.nik,
      employeeName: sanitizeString(currentUser.name, 100),
      division: currentUser.division,
      date: input.date,
      fromShift: currentUser.shiftCode,
      toShift: input.toShift,
      reason,
      status: 'Menunggu',
      createdLabel: `${nowWib.isoDate} ${nowWib.timeShort} WIB`,
      reviewedBy: '',
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
    const reviewer = sanitizeString(currentUser?.name ?? 'HRD', 100);

    if (!isFirebaseSynced) {
      setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status, reviewedBy: reviewer } : l)));
      if (target && target.status !== 'Disetujui' && status === 'Disetujui' && target.type === 'Cuti Tahunan') {
        setEmployees((prev) =>
          prev.map((e) =>
            e.uid === target.uid ? { ...e, leaveQuota: Math.max(0, e.leaveQuota - target.days) } : e
          )
        );
      }
      return;
    }

    const path = `leaves/${id}`;
    try {
      await updateDoc(doc(db, 'leaves', id), {
        status,
        reviewedBy: reviewer,
        updatedAt: serverTimestamp(),
      });
      if (target && target.status !== 'Disetujui' && status === 'Disetujui' && target.type === 'Cuti Tahunan') {
        const emp = employees.find((e) => e.uid === target.uid);
        if (emp) {
          await updateDoc(doc(db, 'employees', emp.uid), {
            leaveQuota: Math.max(0, emp.leaveQuota - target.days),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const reviewOvertime = async (id: string, status: ApprovalStatus) => {
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

  const reviewShiftSwap = async (id: string, status: ApprovalStatus) => {
    const target = shiftSwaps.find((s) => s.id === id);
    const reviewer = sanitizeString(currentUser?.name ?? 'HRD', 100);

    if (!isFirebaseSynced) {
      setShiftSwaps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, reviewedBy: reviewer } : s))
      );
      if (target && status === 'Disetujui') {
        setEmployees((prev) =>
          prev.map((e) => (e.uid === target.uid ? { ...e, shiftCode: target.toShift } : e))
        );
      }
      return;
    }

    const path = `shiftSwaps/${id}`;
    try {
      await updateDoc(doc(db, 'shiftSwaps', id), {
        status,
        reviewedBy: reviewer,
        updatedAt: serverTimestamp(),
      });
      if (target && status === 'Disetujui') {
        await updateDoc(doc(db, 'employees', target.uid), {
          shiftCode: target.toShift,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const reviewExitClearance = async (id: string, status: ApprovalStatus) => {
    const target = exitClearances.find((e) => e.id === id);
    if (!target) return;
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

  const value: HrisContextValue = {
    authReady,
    firebaseUser,
    adminSession,
    isAdminSession,
    isFirebaseSynced,
    needsEmailVerification: Boolean(firebaseUser && !firebaseUser.emailVerified && !isAdminSession),
    employees,
    currentUser,
    attendance,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    schedules,
    localPhotos,
    wibNow,
    loginWithEmail,
    loginAsAdmin,
    registerWithEmail,
    loginWithGoogle,
    sendResetPassword,
    resendVerificationEmail,
    refreshAuthUser,
    changePassword,
    changeAdminPassword,
    logout,
    addEmployeeByHrd,
    updateEmployeeProfile,
    signContract,
    recordClockIn,
    recordClockOut,
    submitLeave,
    submitOvertime,
    submitShiftSwap,
    submitExitClearance,
    toggleExitChecklistItem,
    togglePatrolComplete,
    reviewLeave,
    reviewOvertime,
    reviewShiftSwap,
    reviewExitClearance,
  };

  return <HrisContext.Provider value={value}>{children}</HrisContext.Provider>;
}

export function useHris() {
  const ctx = useContext(HrisContext);
  if (!ctx) throw new Error('useHris must be used within HrisProvider');
  return ctx;
}

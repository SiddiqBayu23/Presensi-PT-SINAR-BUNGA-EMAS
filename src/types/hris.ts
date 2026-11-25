export type UserRole = 'hrd' | 'supervisor' | 'employee';

export type StandardDivision = 'HRD' | 'Security' | 'Cleaning Service' | 'Operasional' | 'Keuangan';
export type Division = StandardDivision | string;

export type ShiftCode = 'REGULER' | 'PAGI' | 'SIANG' | 'MALAM' | 'SECURITY24';

/** Komponen tanggal & waktu WIB (UTC+7) yang dipakai seluruh modul absensi dan jadwal. */
export interface WibComponents {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hours: number;
  minutes: number;
  seconds: number;
  timeFull: string;
  timeShort: string;
  isoDate: string;
  fullIndonesianDate: string;
  periodKey: string;
  periodLabel: string;
}

export interface ShiftTemplate {
  code: ShiftCode;
  name: string;
  label: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  toleranceMinutes: number;
}

/** Jam masuk/pulang khusus divisi untuk satu shift (HH:mm). */
export interface DivisionShiftTime {
  startTime: string;
  endTime: string;
}

/**
 * Toleransi waktu absensi satu shift (dalam menit):
 * - earlyInMinutes: absen masuk dibuka sejak berapa menit sebelum jam masuk.
 * - lateInMinutes: keterlambatan yang masih dianggap tepat waktu (setelah jam masuk).
 * - earlyOutMinutes: absen pulang dibuka sejak berapa menit sebelum jam pulang.
 * Absen pulang setelah jam pulang tidak dibatasi (tidak terbatas).
 */
export interface ShiftTolerance {
  earlyInMinutes: number;
  lateInMinutes: number;
  earlyOutMinutes: number;
}

/**
 * Aturan jam kerja per divisi: daftar shift yang boleh dipakai, shift bawaan,
 * serta total jam kerja terjadwal per shift. Dipakai untuk penjadwalan karyawan
 * (mis. Security 24 jam, Cleaning Service hanya sampai sore). HRD juga dapat
 * mengubah jam masuk/pulang tiap shift untuk divisi ini (shiftTimes).
 */
export interface DivisionShiftRule {
  division: Division;
  /** Shift yang tersedia untuk divisi ini (urut sesuai tampilan). */
  allowedShiftCodes: ShiftCode[];
  /** Shift bawaan saat karyawan divisi ini ditambahkan. */
  defaultShiftCode: ShiftCode;
  /**
   * Jam masuk/pulang khusus divisi ini per shift. Shift yang tidak diisi
   * (atau jamnya tidak valid) memakai jam bawaan SHIFT_TEMPLATES.
   */
  shiftTimes?: Partial<Record<ShiftCode, DivisionShiftTime>>;
  /**
   * Toleransi absensi khusus divisi ini per shift (menit). Shift yang tidak
   * diisi memakai toleransi bawaan (masuk awal 60 menit, terlambat 10/15 menit,
   * pulang awal 15 menit).
   */
  shiftTolerances?: Partial<Record<ShiftCode, ShiftTolerance>>;
  updatedAt?: string;
}

export interface Employee {
  uid: string;
  nik: string;
  name: string;
  position: string;
  division: Division;
  role: UserRole;
  /** uid atasan langsung (role 'supervisor' pada divisi yang sama); '' bila tanpa atasan. */
  supervisorUid?: string;
  shiftCode: ShiftCode;
  email: string;
  phone: string;
  address: string;
  joinDate: string; // YYYY-MM-DD
  contractType: 'PKWT' | 'PKO' | 'PKWTT';
  contractEnd: string; // YYYY-MM-DD
  contractSigned: boolean;
  contractSignedAt: string;
  baseSalary: number;
  positionAllowance: number;
  mealTransportAllowance: number;
  leaveQuota: number;
  active: boolean;
  /**
   * Foto profil persegi (data URL hasil crop 1:1, mis. `data:image/jpeg;base64,...`).
   * Diperbarui oleh pemilik akun lewat menu Pengaturan; '' bila belum diatur.
   */
  photoUrl?: string;
}

export interface AttendanceRecord {
  id: string;
  uid: string;
  nik: string;
  employeeName: string;
  division: Division;
  date: string; // YYYY-MM-DD (WIB)
  shiftCode: ShiftCode;
  clockInTime: string; // HH:mm:ss
  clockInPhotoVerified: boolean;
  clockInLat: number;
  clockInLng: number;
  clockInAddress: string;
  clockInDistanceMeters: number;
  lateMinutes: number;
  clockOutTime: string; // HH:mm:ss or ''
  clockOutPhotoVerified: boolean;
  clockOutLat: number;
  clockOutLng: number;
  clockOutAddress: string;
  workMinutes: number;
  status: 'Tepat Waktu' | 'Terlambat' | 'Selesai' | 'Belum Pulang';
  /** Atasan langsung saat absen dicatat (untuk scoping baca supervisor). */
  supervisorUid?: string;
  /** Foto selfie absensi (data URL / thumbnail) */
  clockInPhotoUrl?: string;
  clockOutPhotoUrl?: string;
  /** Validasi kehadiran oleh HRD / Admin */
  adminValidationStatus?: 'Menunggu' | 'Valid' | 'Ditolak';
  adminValidationNotes?: string;
  validatedBy?: string;
  validatedAt?: string;
}

export type ApprovalStatus = 'Menunggu' | 'Disetujui' | 'Ditolak';

export interface LeaveRequest {
  id: string;
  uid: string;
  nik: string;
  employeeName: string;
  division: Division;
  /** uid atasan langsung pengaju; '' bila diajukan tanpa atasan (langsung ke HRD). */
  supervisorUid?: string;
  type: 'Cuti Tahunan' | 'Izin Sakit' | 'Izin Khusus' | 'Izin Pribadi';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: ApprovalStatus;
  createdLabel: string;
  reviewedBy: string;
  /** Tahap validasi supervisor & HRD */
  supervisorStatus?: ApprovalStatus;
  supervisorReviewedBy?: string;
  supervisorReviewedAt?: string;
  hrdStatus?: ApprovalStatus;
  hrdReviewedBy?: string;
  hrdReviewedAt?: string;
}

export type ReportType = 'gambar' | 'dokumen' | 'pesan' | 'semua';
export type TodoStatus = 'Belum Dikerjakan' | 'Sedang Dikerjakan' | 'Menunggu Review' | 'Selesai' | 'Ditolak';

export interface TodoTask {
  id: string;
  title: string;
  description: string;
  assignedToUid: string;
  assignedToName: string;
  assignedToDivision: Division;
  assignedByUid: string;
  assignedByName: string;
  assignedByRole: UserRole;
  dueDate: string; // YYYY-MM-DD
  /** Format laporan yang diminta (kompatibilitas lama: satu format). */
  reportTypeRequired: ReportType; // 'gambar' | 'dokumen' | 'pesan' | 'semua'
  /** Format laporan yang diwajibkan; bisa lebih dari satu (mis. gambar + dokumen). */
  reportTypes?: ReportType[];
  status: TodoStatus;
  createdAt: string;
  // Laporan pengerjaan oleh penanggung jawab
  reportText?: string;
  /** Bukti gambar/foto (data URL) beserta nama file. */
  reportPhotoName?: string;
  reportPhotoUrl?: string;
  /** Bukti dokumen/berkas (data URL) beserta nama file. */
  reportDocumentName?: string;
  reportDocumentUrl?: string;
  submittedAt?: string;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface OvertimeRequest {
  id: string;
  uid: string;
  nik: string;
  employeeName: string;
  division: Division;
  /** uid atasan langsung pengaju; '' bila diajukan tanpa atasan (langsung ke HRD). */
  supervisorUid?: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  estimatedPay: number;
  reason: string;
  status: ApprovalStatus;
  createdLabel: string;
  reviewedBy: string;
}

export interface ShiftSwapRequest {
  id: string;
  uid: string;
  nik: string;
  employeeName: string;
  division: Division;
  /** uid atasan langsung pengaju; '' bila diajukan tanpa atasan (langsung ke HRD). */
  supervisorUid?: string;
  date: string;
  fromShift: ShiftCode;
  toShift: ShiftCode;
  reason: string;
  status: ApprovalStatus;
  createdLabel: string;
  reviewedBy: string;
}

export interface ExitClearanceItem {
  department: 'HRD' | 'Operasional' | 'IT & Aset' | 'Keuangan';
  task: string;
  cleared: boolean;
}

export interface ExitClearanceRequest {
  id: string;
  uid: string;
  nik: string;
  employeeName: string;
  position: string;
  division: Division;
  /** uid atasan langsung pengaju; '' bila diajukan tanpa atasan (langsung ke HRD). */
  supervisorUid?: string;
  lastWorkingDate: string;
  reason: string;
  checklist: ExitClearanceItem[];
  status: ApprovalStatus;
  createdLabel: string;
  reviewedBy: string;
}

export interface ScheduleEntry {
  id: string;
  uid: string;
  nik: string;
  date: string; // YYYY-MM-DD
  shiftCode: ShiftCode;
  location: string;
  notes: string;
  patrolCompleted: boolean;
}

export interface PayslipBreakdown {
  periodLabel: string;
  periodKey: string; // YYYY-MM
  baseSalary: number;
  positionAllowance: number;
  mealTransportAllowance: number;
  overtimeHours: number;
  overtimePay: number;
  grossPay: number;
  bpjsKesehatan: number;
  bpjsKetenagakerjaan: number;
  lateMinutesTotal: number;
  lateDeduction: number;
  totalDeductions: number;
  netPay: number;
  attendanceDays: number;
  /** Rincian penerimaan (gaji pokok, tunjangan, lembur, komponen tambahan). */
  earnings: PayslipLineItem[];
  /** Rincian potongan (BPJS, keterlambatan, komponen pengurang). */
  deductions: PayslipLineItem[];
  /** Mode perhitungan insentif lembur yang dipakai saat slip dihitung. */
  overtimeRateMode: OvertimeRateMode;
}

/** Satu baris rincian slip gaji (penerimaan atau potongan). */
export interface PayslipLineItem {
  code: string;
  label: string;
  amount: number;
  kind: 'earning' | 'deduction';
}

export type PayslipComponentKind = 'earning' | 'deduction';
/** Dasar perhitungan komponen: nominal tetap atau persen gaji pokok. */
export type PayslipComponentBasis = 'nominal' | 'persenGajiPokok';
export type PayslipComponentScope = 'global' | 'division' | 'employee';

/**
 * Komponen gaji yang dikelola Admin HRD (mis. BPJS, uang makan, kasbon).
 * Dapat berlaku global, per divisi, atau per karyawan; bisa menambah atau mengurangi.
 */
export interface PayslipComponent {
  id: string;
  name: string;
  kind: PayslipComponentKind;
  basis: PayslipComponentBasis;
  /** Nominal Rp, tarif per jam/sesi, atau persen gaji pokok (mis. 1 = 1%). */
  amount: number;
  scope: PayslipComponentScope;
  division?: Division;
  employeeUid?: string;
  active: boolean;
  createdAt?: string;
}

export type OvertimeRateMode = 'perJam' | 'perSesi';

/** Pengaturan payroll global yang dapat diubah Admin HRD. */
export interface PayrollSettings {
  /** Potongan BPJS Kesehatan sebagai fraksi gaji pokok (0 = nonaktif). */
  bpjsKesehatanRate: number;
  /** Potongan BPJS Ketenagakerjaan (JHT) sebagai fraksi gaji pokok. */
  bpjsKetenagakerjaanRate: number;
  /** Denda keterlambatan per menit (Rp). */
  lateDeductionPerMinute: number;
  /** Insentif lembur dihitung per jam atau per sesi pengajuan. */
  overtimeRateMode: OvertimeRateMode;
  /** Pengali tarif per jam lembur (mis. 1.5) dari gaji pokok / 173. */
  overtimeHourlyMultiplier: number;
  /** Nominal insentif per sesi lembur saat mode 'perSesi'. */
  overtimeSessionRate: number;
  updatedAt?: string;
}

/** Mode tampilan aplikasi: terang (light) atau gelap (dark). */
export type ThemeMode = 'light' | 'dark';

export type MainTab =
  | 'beranda'
  | 'presensi'
  | 'schedule'
  | 'pengajuan'
  | 'dokumen'
  | 'hrd'
  | 'pengaturan';
export type SubmissionSubTab = 'izin' | 'lembur' | 'shift' | 'exit';
export type DocumentSubTab = 'slip' | 'pkwt' | 'profil';

export type UserRole = 'hrd' | 'employee';

export type Division = 'HRD' | 'Security' | 'Cleaning Service' | 'Operasional' | 'Keuangan';

export type ShiftCode = 'REGULER' | 'PAGI' | 'SIANG' | 'MALAM';

export interface ShiftTemplate {
  code: ShiftCode;
  name: string;
  label: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  toleranceMinutes: number;
}

export interface Employee {
  uid: string;
  nik: string;
  name: string;
  position: string;
  division: Division;
  role: UserRole;
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
}

export type ApprovalStatus = 'Menunggu' | 'Disetujui' | 'Ditolak';

export interface LeaveRequest {
  id: string;
  uid: string;
  nik: string;
  employeeName: string;
  division: Division;
  type: 'Cuti Tahunan' | 'Izin Sakit' | 'Izin Khusus' | 'Izin Pribadi';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: ApprovalStatus;
  createdLabel: string;
  reviewedBy: string;
}

export interface OvertimeRequest {
  id: string;
  uid: string;
  nik: string;
  employeeName: string;
  division: Division;
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
}

export type MainTab = 'beranda' | 'schedule' | 'pengajuan' | 'dokumen' | 'hrd';
export type SubmissionSubTab = 'izin' | 'lembur' | 'shift' | 'exit';
export type DocumentSubTab = 'slip' | 'pkwt' | 'profil';
export type LoginIntent = 'none' | 'clock-in' | 'clock-out' | 'history' | 'profile';

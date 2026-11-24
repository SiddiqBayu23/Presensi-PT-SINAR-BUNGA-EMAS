import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  AttendanceRecord,
  Employee,
  ExitClearanceRequest,
  LeaveRequest,
  OvertimeRequest,
  ScheduleEntry,
  ShiftSwapRequest,
} from '../types/hris';
import {
  buildAttendanceCsvWithBom,
  buildEmployeesCsv,
  buildExcelWorkbookXml,
  buildExitClearancesCsv,
  buildFullJsonExport,
  buildLeavesCsv,
  buildOvertimesCsv,
  buildPayrollRecapCsv,
  buildSchedulesCsv,
  buildShiftSwapsCsv,
  type FullExportDataset,
} from './exportUtils';

const sampleEmployees: Employee[] = [
  {
    uid: 'uid_admin_01',
    nik: 'ADMIN01',
    name: 'HRD Administrator',
    position: 'HR Manager',
    division: 'HRD',
    role: 'hrd',
    shiftCode: 'REGULER',
    email: 'fikriramadhan998@gmail.com',
    phone: '0812-8800-1100',
    address: 'Jakarta Selatan',
    joinDate: '2026-01-10',
    contractType: 'PKWTT',
    contractEnd: '2028-01-10',
    contractSigned: true,
    contractSignedAt: '2026-01-10 08:00 WIB',
    baseSalary: 8500000,
    positionAllowance: 1500000,
    mealTransportAllowance: 1000000,
    leaveQuota: 12,
    active: true,
  },
  {
    uid: 'uid_sec_01',
    nik: 'SEC-0001',
    name: 'Budi Santoso',
    position: 'Staff Security',
    division: 'Security',
    role: 'employee',
    shiftCode: 'PAGI',
    email: 'budi@sinarbungamas.co.id',
    phone: '0813-9900-2211',
    address: 'Jakarta Timur',
    joinDate: '2026-02-01',
    contractType: 'PKO',
    contractEnd: '2027-02-01',
    contractSigned: false,
    contractSignedAt: '',
    baseSalary: 5400000,
    positionAllowance: 600000,
    mealTransportAllowance: 750000,
    leaveQuota: 12,
    active: true,
  },
];

const sampleAttendance: AttendanceRecord[] = [
  {
    id: 'att_sec_20261124',
    uid: 'uid_sec_01',
    nik: 'SEC-0001',
    employeeName: 'Budi Santoso',
    division: 'Security',
    date: '2026-11-24',
    shiftCode: 'PAGI',
    clockInTime: '06:58:00',
    clockInPhotoVerified: true,
    clockInLat: -6.208763,
    clockInLng: 106.845599,
    clockInAddress: 'Kantor Pusat SBM',
    clockInDistanceMeters: 18,
    clockOutTime: '15:02:00',
    clockOutPhotoVerified: true,
    clockOutLat: -6.208763,
    clockOutLng: 106.845599,
    clockOutAddress: 'Kantor Pusat SBM',
    lateMinutes: 0,
    workMinutes: 484,
    status: 'Selesai',
  },
];

const sampleLeaves: LeaveRequest[] = [
  {
    id: 'lv_1',
    uid: 'uid_sec_01',
    nik: 'SEC-0001',
    employeeName: 'Budi Santoso',
    division: 'Security',
    type: 'Cuti Tahunan',
    startDate: '2026-11-28',
    endDate: '2026-11-29',
    days: 2,
    reason: 'Keperluan keluarga',
    status: 'Menunggu',
    createdLabel: '2026-11-24 09:00 WIB',
    reviewedBy: '',
  },
];

const sampleOvertimes: OvertimeRequest[] = [
  {
    id: 'ot_1',
    uid: 'uid_sec_01',
    nik: 'SEC-0001',
    employeeName: 'Budi Santoso',
    division: 'Security',
    date: '2026-11-24',
    startTime: '15:00',
    endTime: '18:00',
    hours: 3,
    estimatedPay: 140462,
    reason: 'Pengamanan acara kantor',
    status: 'Disetujui',
    createdLabel: '2026-11-24 14:30 WIB',
    reviewedBy: 'HRD Administrator',
  },
];

const sampleShiftSwaps: ShiftSwapRequest[] = [
  {
    id: 'sw_1',
    uid: 'uid_sec_01',
    nik: 'SEC-0001',
    employeeName: 'Budi Santoso',
    division: 'Security',
    date: '2026-11-26',
    fromShift: 'PAGI',
    toShift: 'SIANG',
    reason: 'Keperluan kontrol kesehatan pagi',
    status: 'Menunggu',
    createdLabel: '2026-11-24 09:15 WIB',
    reviewedBy: '',
  },
];

const sampleExits: ExitClearanceRequest[] = [
  {
    id: 'ex_1',
    uid: 'uid_sec_01',
    nik: 'SEC-0001',
    employeeName: 'Budi Santoso',
    position: 'Staff Security',
    division: 'Security',
    lastWorkingDate: '2026-12-31',
    reason: 'Akhir kontrak',
    checklist: [
      { department: 'HRD', task: 'Pengembalian ID Card', cleared: true },
      { department: 'Operasional', task: 'Serah terima area', cleared: true },
      { department: 'IT & Aset', task: 'Pengembalian seragam', cleared: false },
      { department: 'Keuangan', task: 'Verifikasi kasbon', cleared: false },
    ],
    status: 'Menunggu',
    createdLabel: '2026-11-24 09:20 WIB',
    reviewedBy: '',
  },
];

const sampleSchedules: ScheduleEntry[] = [
  {
    id: 'sch_1',
    uid: 'uid_sec_01',
    nik: 'SEC-0001',
    date: '2026-11-24',
    shiftCode: 'PAGI',
    location: 'Kantor Pusat SBM',
    notes: 'Jaga lobby depan',
    patrolCompleted: true,
  },
];

const sampleDataset: FullExportDataset = {
  exportedAtWib: '2026-11-24 09:30 WIB',
  periodKey: '2026-11',
  periodLabel: 'November 2026',
  scopeLabel: 'Seluruh Perusahaan (HRD)',
  employees: sampleEmployees,
  attendance: sampleAttendance,
  leaves: sampleLeaves,
  overtimes: sampleOvertimes,
  shiftSwaps: sampleShiftSwaps,
  exitClearances: sampleExits,
  schedules: sampleSchedules,
};

test('CSV builders include UTF-8 BOM and exclude QR/PIN fields', () => {
  const empCsv = buildEmployeesCsv(sampleEmployees);
  assert.ok(empCsv.startsWith('\uFEFF'), 'Employee CSV must start with UTF-8 BOM');
  assert.ok(empCsv.includes('ADMIN01'));
  assert.ok(empCsv.includes('budi@sinarbungamas.co.id'));
  assert.equal(empCsv.toLowerCase().includes('qr'), false);

  const attCsv = buildAttendanceCsvWithBom(sampleAttendance);
  assert.ok(attCsv.startsWith('\uFEFF'));
  assert.ok(attCsv.includes('Kantor Pusat SBM'));
  assert.equal(attCsv.toLowerCase().includes('qr'), false);

  const leaveCsv = buildLeavesCsv(sampleLeaves);
  assert.ok(leaveCsv.includes('Cuti Tahunan'));

  const otCsv = buildOvertimesCsv(sampleOvertimes);
  assert.ok(otCsv.includes('SEC-0001'));

  const swapCsv = buildShiftSwapsCsv(sampleShiftSwaps);
  assert.ok(swapCsv.includes('PAGI'));

  const exitCsv = buildExitClearancesCsv(sampleExits);
  assert.ok(exitCsv.includes('2/4'));

  const schCsv = buildSchedulesCsv(sampleSchedules);
  assert.ok(schCsv.includes('Kantor Pusat SBM'));

  const payrollCsv = buildPayrollRecapCsv(
    sampleEmployees,
    '2026-11',
    'November 2026',
    sampleAttendance,
    sampleOvertimes
  );
  assert.ok(payrollCsv.includes('Take Home Pay'));
  assert.ok(payrollCsv.includes('HRD Administrator'));
});

test('buildExcelWorkbookXml generates valid 7-sheet SpreadsheetML workbook without QR sheet', () => {
  const xml = buildExcelWorkbookXml(sampleDataset);
  assert.ok(xml.includes('<?mso-application progid="Excel.Sheet"?>'));
  for (const sheetName of [
    'Absensi',
    'Karyawan',
    'Rekap Gaji',
    'Izin dan Cuti',
    'Lembur',
    'Tukar Shift',
    'Exit Clearance',
  ]) {
    assert.ok(xml.includes(`<Worksheet ss:Name="${sheetName}">`), `Missing sheet ${sheetName}`);
  }
  assert.equal(xml.includes('QR Pos Area'), false, 'Excel export must not contain QR sheet');
});

test('buildFullJsonExport includes all totals and payroll summary without QR or PIN', () => {
  const raw = buildFullJsonExport(sampleDataset);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.totals.employees, sampleEmployees.length);
  assert.equal(parsed.totals.attendance, sampleAttendance.length);
  assert.equal('qrCheckpoints' in parsed.totals, false);
  assert.equal(parsed.data.payrollSummary.length, sampleEmployees.length);
  assert.equal('pin' in parsed.data.employees[0], false);
});

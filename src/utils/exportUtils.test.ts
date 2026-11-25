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
  buildAttendanceExcel,
  buildEmployeesExcel,
  buildExcelWorkbookXml,
  buildExitClearancesExcel,
  buildFullJsonExport,
  buildLeavesExcel,
  buildOvertimesExcel,
  buildPayrollRecapExcel,
  buildSchedulesExcel,
  buildShiftSwapsExcel,
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

test('per-table Excel builders emit single-sheet SpreadsheetML without QR/PIN fields', () => {
  const empXls = buildEmployeesExcel(sampleEmployees);
  assert.ok(empXls.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(empXls.includes('<?mso-application progid="Excel.Sheet"?>'));
  assert.ok(empXls.includes('<Worksheet ss:Name="Karyawan">'));
  assert.equal(empXls.match(/<Worksheet /g)?.length, 1, 'Employee export must hold exactly 1 sheet');
  assert.ok(empXls.includes('SEC-0001'));
  assert.ok(empXls.includes('budi@sinarbungamas.co.id'));
  assert.ok(empXls.includes('<Data ss:Type="Number">5400000</Data>'), 'Salary must stay numeric');
  assert.equal(empXls.toLowerCase().includes('qr'), false);

  const attXls = buildAttendanceExcel(sampleAttendance);
  assert.ok(attXls.includes('<Worksheet ss:Name="Absensi">'));
  assert.ok(attXls.includes('Kantor Pusat SBM'));
  assert.ok(attXls.includes('Terverifikasi'));
  assert.ok(attXls.includes('-6.20876'), 'GPS coordinates must be exported');
  assert.equal(attXls.toLowerCase().includes('qr'), false);

  const leaveXls = buildLeavesExcel(sampleLeaves);
  assert.ok(leaveXls.includes('<Worksheet ss:Name="Izin dan Cuti">'));
  assert.ok(leaveXls.includes('Cuti Tahunan'));

  const otXls = buildOvertimesExcel(sampleOvertimes);
  assert.ok(otXls.includes('<Worksheet ss:Name="Lembur">'));
  assert.ok(otXls.includes('<Data ss:Type="Number">140462</Data>'));

  const swapXls = buildShiftSwapsExcel(sampleShiftSwaps);
  assert.ok(swapXls.includes('<Worksheet ss:Name="Tukar Shift">'));
  assert.ok(swapXls.includes('SIANG'));

  const exitXls = buildExitClearancesExcel(sampleExits);
  assert.ok(exitXls.includes('<Worksheet ss:Name="Exit Clearance">'));
  assert.ok(exitXls.includes('2/4'));

  const schXls = buildSchedulesExcel(sampleSchedules);
  assert.ok(schXls.includes('<Worksheet ss:Name="Jadwal">'));
  assert.ok(schXls.includes('Jaga lobby depan'));

  const payrollXls = buildPayrollRecapExcel(
    sampleEmployees,
    '2026-11',
    'November 2026',
    sampleAttendance,
    sampleOvertimes
  );
  assert.ok(payrollXls.includes('<Worksheet ss:Name="Rekap Gaji">'));
  assert.ok(payrollXls.includes('Take Home Pay'));
  assert.ok(payrollXls.includes('HRD Administrator'));
});

test('every Excel export escapes XML control characters in free text', () => {
  const tricky = {
    ...sampleLeaves[0],
    reason: 'Izin <mendesak> & "penting"',
  };
  const xml = buildLeavesExcel([tricky]);
  assert.ok(xml.includes('Izin &lt;mendesak&gt; &amp; &quot;penting&quot;'));
  assert.equal(xml.includes('<mendesak>'), false);
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

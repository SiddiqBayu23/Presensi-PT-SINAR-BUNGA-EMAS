import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAttendanceCsv,
  calculateDistanceMeters,
  calculateInclusiveDays,
  calculateLateMinutes,
  calculateOvertimeEstimate,
  calculatePayslip,
  calculateWorkMinutes,
  formatRupiah,
  generateEmployeeNik,
  getDivisionCompensationDefaults,
  getWibComponents,
  isValidEmailAddress,
  sanitizeString,
} from './hrisLogic';
import type { AttendanceRecord, Employee, OvertimeRequest } from '../types/hris';

const sampleEmployee: Employee = {
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
};

test('sanitizeString, isValidEmailAddress, generateEmployeeNik, and division defaults', () => {
  assert.equal(sanitizeString('  Halo Dunia  ', 4), 'Halo');
  assert.equal(isValidEmailAddress('karyawan@sinarbungamas.co.id'), true);
  assert.equal(isValidEmailAddress('bukan-email'), false);
  assert.equal(isValidEmailAddress('a@b'), false);

  const secNik = generateEmployeeNik('Security', 'firebaseUid98ab');
  assert.equal(secNik, 'SEC-98AB');
  assert.match(secNik, /^[A-Z0-9-]+$/);

  const clnNik = generateEmployeeNik('Cleaning Service', 'uid_1234');
  assert.equal(clnNik, 'CLN-1234');

  const secComp = getDivisionCompensationDefaults('Security');
  assert.equal(secComp.contractType, 'PKO');
  assert.ok(secComp.baseSalary > 0);

  const hrdComp = getDivisionCompensationDefaults('HRD');
  assert.equal(hrdComp.contractType, 'PKWTT');
});

test('calculateDistanceMeters computes accurate Haversine distance', () => {
  assert.equal(calculateDistanceMeters(-6.208763, 106.845599, -6.208763, 106.845599), 0);
  const dist = calculateDistanceMeters(-6.208763, 106.845599, -6.209763, 106.845599);
  assert.ok(dist > 100 && dist < 120, `Expected ~111m, got ${dist}`);
});

test('calculateLateMinutes respects 10-minute tolerance on shift start', () => {
  assert.equal(calculateLateMinutes('07:55:00', 'REGULER'), 0);
  assert.equal(calculateLateMinutes('08:10:00', 'REGULER'), 0);
  assert.equal(calculateLateMinutes('08:25:00', 'REGULER'), 25);
  assert.equal(calculateLateMinutes('07:15:00', 'PAGI'), 15);
});

test('calculateWorkMinutes supports standard and overnight shifts', () => {
  assert.equal(calculateWorkMinutes('08:00:00', '17:00:00'), 540);
  assert.equal(calculateWorkMinutes('23:00:00', '07:00:00'), 480);
});

test('calculateInclusiveDays and calculateOvertimeEstimate compute accurately', () => {
  assert.equal(calculateInclusiveDays('2026-11-24', '2026-11-26'), 3);
  assert.equal(calculateInclusiveDays('2026-11-26', '2026-11-24'), 0);
  const ot = calculateOvertimeEstimate('17:00', '20:00', 5190000);
  assert.equal(ot.hours, 3);
  assert.equal(ot.estimatedPay, 135000);
});

test('calculatePayslip sums allowances, approved overtime, and deductions by UID', () => {
  const attendance: AttendanceRecord[] = [
    {
      id: 'att-1',
      uid: 'uid_admin_01',
      nik: 'ADMIN01',
      employeeName: 'HRD Administrator',
      division: 'HRD',
      date: '2026-11-24',
      shiftCode: 'REGULER',
      clockInTime: '08:20:00',
      clockInPhotoVerified: true,
      clockInLat: -6.208763,
      clockInLng: 106.845599,
      clockInAddress: 'Kantor Pusat SBM',
      clockInDistanceMeters: 12,
      clockOutTime: '17:05:00',
      clockOutPhotoVerified: true,
      clockOutLat: -6.208763,
      clockOutLng: 106.845599,
      clockOutAddress: 'Kantor Pusat SBM',
      lateMinutes: 20,
      workMinutes: 525,
      status: 'Terlambat',
    },
  ];
  const overtime: OvertimeRequest[] = [
    {
      id: 'ot-1',
      uid: 'uid_admin_01',
      nik: 'ADMIN01',
      employeeName: 'HRD Administrator',
      division: 'HRD',
      date: '2026-11-24',
      startTime: '17:30',
      endTime: '19:30',
      hours: 2,
      estimatedPay: 147399,
      reason: 'Audit payroll',
      status: 'Disetujui',
      createdLabel: '2026-11-24 10:00 WIB',
      reviewedBy: 'HRD Administrator',
    },
    {
      id: 'ot-2',
      uid: 'uid_admin_01',
      nik: 'ADMIN01',
      employeeName: 'HRD Administrator',
      division: 'HRD',
      date: '2026-11-25',
      startTime: '17:30',
      endTime: '19:30',
      hours: 2,
      estimatedPay: 147399,
      reason: 'Pending overtime should not be paid yet',
      status: 'Menunggu',
      createdLabel: '2026-11-25 10:00 WIB',
      reviewedBy: '',
    },
  ];

  const slip = calculatePayslip(sampleEmployee, '2026-11', 'November 2026', attendance, overtime);
  assert.equal(slip.overtimeHours, 2);
  assert.equal(slip.overtimePay, 147399);
  assert.equal(slip.lateDeduction, 20000);
  assert.equal(slip.bpjsKesehatan, 85000);
  assert.equal(slip.bpjsKetenagakerjaan, 170000);
  assert.equal(slip.netPay, slip.grossPay - slip.totalDeductions);
  assert.equal(formatRupiah(1500000), 'Rp 1.500.000');
});

test('buildAttendanceCsv and getWibComponents produce GPS-only formats without QR columns', () => {
  const wib = getWibComponents(new Date('2026-11-24T01:54:23.000Z'));
  assert.equal(wib.timeFull, '08:54:23');
  assert.equal(wib.isoDate, '2026-11-24');
  assert.equal(wib.fullIndonesianDate, 'Selasa, 24 November 2026');

  const csv = buildAttendanceCsv([
    {
      id: 'att-1',
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
      clockInAddress: 'Kantor Pusat PT Sinar Bunga Mas',
      clockInDistanceMeters: 15,
      clockOutTime: '',
      clockOutPhotoVerified: false,
      clockOutLat: 0,
      clockOutLng: 0,
      clockOutAddress: '',
      lateMinutes: 0,
      workMinutes: 0,
      status: 'Tepat Waktu',
    },
  ]);
  assert.ok(csv.includes('SEC-0001'));
  assert.ok(csv.includes('Terverifikasi'));
  assert.ok(csv.includes('-6.20876'));
  assert.equal(csv.toLowerCase().includes('qr'), false, 'CSV must not contain QR columns');
});


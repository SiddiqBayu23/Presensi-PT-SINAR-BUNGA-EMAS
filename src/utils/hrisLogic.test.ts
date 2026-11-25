import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DIVISION_SHIFT_RULES,
  DEFAULT_PAYROLL_SETTINGS,
  FALLBACK_DIVISION_SHIFT_CODES,
  SHIFT_TEMPLATES,
  calculateDistanceMeters,
  calculateInclusiveDays,
  calculateLateMinutes,
  calculateOvertimeEstimate,
  calculateOvertimePayForRequest,
  calculatePayslip,
  calculateWorkMinutes,
  effectiveShiftForDate,
  findScheduleConflict,
  formatReportTypesLabel,
  formatRupiah,
  generateEmployeeNik,
  getDivisionCompensationDefaults,
  getWibComponents,
  isValidEmailAddress,
  requiredReportFormats,
  resolveDivisionShiftRule,
  resolveShiftTolerance,
  shiftsConflictOnDates,
  resolvePayslipComponentAmount,
  sanitizeString,
  validateClockIn,
  validateClockOut,
  validateShiftSwap,
} from './hrisLogic';
import type { ShiftSwapValidationInput } from './hrisLogic';
import type {
  AttendanceRecord,
  Division,
  Employee,
  OvertimeRequest,
  ShiftCode,
  ShiftSwapRequest,
} from '../types/hris';

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

test('resolveShiftTolerance uses defaults and per-division overrides', () => {
  assert.deepEqual(resolveShiftTolerance('REGULER'), {
    earlyInMinutes: 60,
    lateInMinutes: 10,
    earlyOutMinutes: 15,
  });
  const override = {
    division: 'Operasional',
    allowedShiftCodes: ['REGULER'] as ShiftCode[],
    defaultShiftCode: 'REGULER' as ShiftCode,
    shiftTolerances: { REGULER: { earlyInMinutes: 120, lateInMinutes: 30, earlyOutMinutes: 5 } },
  };
  assert.deepEqual(resolveShiftTolerance('REGULER', override), {
    earlyInMinutes: 120,
    lateInMinutes: 30,
    earlyOutMinutes: 5,
  });
});

test('validateClockIn blocks only before the early window', () => {
  // Jam masuk 08:00, toleransi masuk awal 60 menit → dibuka 07:00.
  assert.equal(validateClockIn('07:00:00', 'REGULER').ok, true);
  assert.equal(validateClockIn('06:59:00', 'REGULER').ok, false);
  // Terlambat tidak diblokir, hanya tercatat.
  assert.equal(validateClockIn('09:30:00', 'REGULER').ok, true);
  // Shift malam 23:00 dengan clock-in lewat tengah malam tetap diterima.
  assert.equal(validateClockIn('00:30:00', 'MALAM').ok, true);
});

test('validateClockOut blocks only before the early window, late is unlimited', () => {
  // Jam pulang 17:00, toleransi pulang awal 15 menit → dibuka 16:45.
  assert.equal(validateClockOut('16:45:00', 'REGULER').ok, true);
  assert.equal(validateClockOut('16:44:00', 'REGULER').ok, false);
  assert.equal(validateClockOut('23:00:00', 'REGULER').ok, true);
  // Shift malam 23:00-07:00: pulang 06:50 masih dalam toleransi 15 menit.
  assert.equal(validateClockOut('06:50:00', 'MALAM').ok, true);
  assert.equal(validateClockOut('06:40:00', 'MALAM').ok, false);
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

test('resolveDivisionShiftRule enforces 24-hour Security and short Cleaning Service windows', () => {
  const security = resolveDivisionShiftRule('Security');
  assert.deepEqual(security.allowedShiftCodes, ['SECURITY24', 'PAGI', 'SIANG', 'MALAM']);
  assert.equal(security.defaultShiftCode, 'SECURITY24');

  const cleaning = resolveDivisionShiftRule('Cleaning Service');
  assert.deepEqual(cleaning.allowedShiftCodes, ['PAGI']);
  assert.equal(SHIFT_TEMPLATES.PAGI.endTime < '18:00', true);

  // Divisi buatan HRD tanpa aturan khusus memakai fallback, bukan aturan Security.
  const custom = resolveDivisionShiftRule('Gudang');
  assert.deepEqual(custom.allowedShiftCodes, FALLBACK_DIVISION_SHIFT_CODES);
});

test('validateShiftSwap rejects overlaps, disallowed shifts, leave, and duplicates', () => {
  const base: ShiftSwapValidationInput = {
    uid: 'uid_sec_01',
    division: 'Security' as Division,
    date: '2026-11-25',
    fromShift: 'PAGI' as ShiftCode,
    toShift: 'SIANG' as ShiftCode,
    schedules: [],
    rules: DEFAULT_DIVISION_SHIFT_RULES,
    shiftSwaps: [] as ShiftSwapRequest[],
  };

  assert.deepEqual(validateShiftSwap(base), { ok: true });

  const overlapping = validateShiftSwap({
    ...base,
    schedules: [
      {
        id: 'sch-1',
        uid: base.uid,
        nik: 'SEC-0001',
        date: base.date,
        shiftCode: 'SECURITY24',
        location: 'Pos Utama',
        notes: '',
        patrolCompleted: false,
      },
    ],
  });
  assert.equal(overlapping.ok, false);

  const disallowed = validateShiftSwap({ ...base, division: 'Cleaning Service' });
  assert.equal(disallowed.ok, false);

  const onLeave = validateShiftSwap({ ...base, onApprovedLeave: true });
  assert.equal(onLeave.ok, false);

  const duplicated = validateShiftSwap({
    ...base,
    shiftSwaps: [
      {
        id: 'swap-1',
        uid: base.uid,
        nik: 'SEC-0001',
        employeeName: 'Petugas',
        division: base.division,
        date: base.date,
        fromShift: base.fromShift,
        toShift: base.toShift,
        reason: 'Keperluan keluarga',
        status: 'Menunggu',
        createdLabel: '2026-11-24 09:00 WIB',
        reviewedBy: '',
      },
    ],
  });
  assert.equal(duplicated.ok, false);
});

test('requiredReportFormats supports multi-format tasks and legacy single format', () => {
  assert.deepEqual(requiredReportFormats({ reportTypeRequired: 'gambar' }), ['gambar']);
  assert.deepEqual(requiredReportFormats({ reportTypeRequired: 'semua' }), [
    'pesan',
    'gambar',
    'dokumen',
  ]);
  assert.deepEqual(
    requiredReportFormats({ reportTypeRequired: 'gambar', reportTypes: ['dokumen', 'gambar'] }),
    ['gambar', 'dokumen']
  );
  assert.deepEqual(requiredReportFormats({ reportTypeRequired: 'pesan', reportTypes: ['semua'] }), [
    'pesan',
    'gambar',
    'dokumen',
  ]);
  assert.equal(formatReportTypesLabel(['gambar', 'dokumen']), 'Gambar + Dokumen');
});

test('overtime pay modes and payroll component basis compute per employee', () => {
  const perJam = calculateOvertimePayForRequest({ hours: 2 }, 3460000, {
    ...DEFAULT_PAYROLL_SETTINGS,
    overtimeRateMode: 'perJam',
    overtimeHourlyMultiplier: 1.5,
  });
  assert.equal(perJam, Math.round(2 * (3460000 / 173) * 1.5));

  const perSesi = calculateOvertimePayForRequest({ hours: 5 }, 3460000, {
    ...DEFAULT_PAYROLL_SETTINGS,
    overtimeRateMode: 'perSesi',
    overtimeSessionRate: 75000,
  });
  assert.equal(perSesi, 75000);

  const bpjs = resolvePayslipComponentAmount(
    {
      id: 'pc-1',
      name: 'BPJS Kesehatan',
      kind: 'deduction',
      basis: 'persenGajiPokok',
      amount: 1,
      scope: 'employee',
      employeeUid: sampleEmployee.uid,
      active: true,
      createdAt: '2026-01-01 08:00 WIB',
    },
    sampleEmployee
  );
  assert.equal(bpjs, 85000);
});

test('getWibComponents produces stable WIB date and time labels', () => {
  const wib = getWibComponents(new Date('2026-11-24T01:54:23.000Z'));
  assert.equal(wib.timeFull, '08:54:23');
  assert.equal(wib.isoDate, '2026-11-24');
  assert.equal(wib.fullIndonesianDate, 'Selasa, 24 November 2026');
});


test('shift conflicts are detected across midnight (night/24-hour shifts)', () => {
  // MALAM (23:00-07:00) hari ini vs PAGI (07:00-15:00) besok: bersambung, bukan bentrok.
  assert.equal(
    shiftsConflictOnDates(
      { shiftCode: 'MALAM', date: '2026-11-24' },
      { shiftCode: 'PAGI', date: '2026-11-25' },
      '2026-11-24'
    ),
    false
  );
  // SECURITY24 (07:00-07:00) menutup seluruh hari, jadi PAGI pada tanggal yang sama bentrok.
  assert.equal(
    shiftsConflictOnDates(
      { shiftCode: 'SECURITY24', date: '2026-11-24' },
      { shiftCode: 'PAGI', date: '2026-11-24' },
      '2026-11-24'
    ),
    true
  );
  // SECURITY24 kemarin sudah selesai 07:00 hari ini: SIANG hari ini aman.
  assert.equal(
    shiftsConflictOnDates(
      { shiftCode: 'SECURITY24', date: '2026-11-23' },
      { shiftCode: 'SIANG', date: '2026-11-24' },
      '2026-11-24'
    ),
    false
  );
  // SIANG (15:00-23:00) hari ini bertabrakan dengan MALAM (23:00) hari yang sama? tidak.
  assert.equal(
    shiftsConflictOnDates(
      { shiftCode: 'SIANG', date: '2026-11-24' },
      { shiftCode: 'MALAM', date: '2026-11-24' },
      '2026-11-24'
    ),
    false
  );
});

test('findScheduleConflict ignores the row being replaced and unrelated employees', () => {
  const schedules = [
    {
      id: 'sch_a_20261124',
      uid: 'uid_a',
      nik: 'SEC-0001',
      date: '2026-11-24',
      shiftCode: 'SECURITY24' as ShiftCode,
      location: 'Pos Utama',
      notes: '',
      patrolCompleted: false,
    },
    {
      id: 'sch_b_20261124',
      uid: 'uid_b',
      nik: 'SEC-0002',
      date: '2026-11-24',
      shiftCode: 'PAGI' as ShiftCode,
      location: 'Pos Utama',
      notes: '',
      patrolCompleted: false,
    },
  ];

  // Mengganti baris itu sendiri tidak dianggap bentrok.
  assert.equal(
    findScheduleConflict({
      uid: 'uid_a',
      date: '2026-11-24',
      shiftCode: 'MALAM',
      schedules,
      ignoreId: 'sch_a_20261124',
    }),
    null
  );

  // Karyawan lain tidak memengaruhi pemeriksaan.
  assert.equal(
    findScheduleConflict({ uid: 'uid_c', date: '2026-11-24', shiftCode: 'PAGI', schedules }),
    null
  );

  // Tanpa ignoreId, shift 24 jam milik karyawan yang sama pada tanggal sama tetap bentrok.
  const conflict = findScheduleConflict({
    uid: 'uid_a',
    date: '2026-11-24',
    shiftCode: 'PAGI',
    schedules,
  });
  assert.equal(conflict?.id, 'sch_a_20261124');
});

test('effectiveShiftForDate prefers the schedule entry over the profile shift', () => {
  const schedules = [
    {
      id: 'sch_a_20261125',
      uid: 'uid_a',
      nik: 'SEC-0001',
      date: '2026-11-25',
      shiftCode: 'SIANG' as ShiftCode,
      location: 'Pos Utama',
      notes: '',
      patrolCompleted: false,
    },
  ];
  assert.equal(effectiveShiftForDate('uid_a', '2026-11-25', schedules, 'PAGI'), 'SIANG');
  assert.equal(effectiveShiftForDate('uid_a', '2026-11-26', schedules, 'PAGI'), 'PAGI');
});

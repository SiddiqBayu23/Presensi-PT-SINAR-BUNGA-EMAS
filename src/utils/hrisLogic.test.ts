import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DIVISION_SHIFT_RULES,
  DEFAULT_PAYROLL_SETTINGS,
  FALLBACK_DIVISION_SHIFT_CODES,
  SHIFT_TEMPLATES,
  allShiftTemplates,
  buildShiftTemplate,
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
  formatThousands,
  generateEmployeeNik,
  getDivisionCompensationDefaults,
  getWibComponents,
  isValidEmailAddress,
  requiredReportFormats,
  registerHiddenShiftTemplates,
  registerShiftTemplates,
  resolveDivisionShiftRule,
  resolveShiftTolerance,
  shiftsConflictOnDates,
  resolvePayslipComponentAmount,
  sanitizeString,
  schedulesMirroringProfileShift,
  validateClockIn,
  validateClockOut,
  validateShiftSwap,
  getStaffDutyInfo,
  getShiftRostersForDate,
  checkScheduleGaps,
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
    lateOutMinutes: 15,
  });
  const override = {
    division: 'Operasional',
    allowedShiftCodes: ['REGULER'] as ShiftCode[],
    defaultShiftCode: 'REGULER' as ShiftCode,
    shiftTolerances: {
      REGULER: { earlyInMinutes: 120, lateInMinutes: 30, earlyOutMinutes: 5, lateOutMinutes: 20 },
    },
  };
  assert.deepEqual(resolveShiftTolerance('REGULER', override), {
    earlyInMinutes: 120,
    lateInMinutes: 30,
    earlyOutMinutes: 5,
    lateOutMinutes: 20,
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

test('validateClockOut enforces early and late clock-out tolerance windows', () => {
  // Jam pulang 17:00, toleransi pulang awal 15 menit (16:45) & telat pulang 15 menit (17:15).
  assert.equal(validateClockOut('16:45:00', 'REGULER').ok, true);
  assert.equal(validateClockOut('16:44:00', 'REGULER').ok, false);
  assert.equal(validateClockOut('17:15:00', 'REGULER').ok, true);
  assert.equal(validateClockOut('17:16:00', 'REGULER').ok, false);
  assert.equal(validateClockOut('23:00:00', 'REGULER').ok, false);
  // Shift malam 23:00-07:00: pulang 06:45-07:15 diterima, di luar rentang ditolak.
  assert.equal(validateClockOut('06:50:00', 'MALAM').ok, true);
  assert.equal(validateClockOut('06:40:00', 'MALAM').ok, false);
  assert.equal(validateClockOut('07:15:00', 'MALAM').ok, true);
  assert.equal(validateClockOut('07:16:00', 'MALAM').ok, false);
  // Override divisi bisa memperpanjang batas waktu pulang.
  const extendedOut = {
    division: 'Operasional',
    allowedShiftCodes: ['REGULER'] as ShiftCode[],
    defaultShiftCode: 'REGULER' as ShiftCode,
    shiftTolerances: {
      REGULER: { earlyInMinutes: 60, lateInMinutes: 10, earlyOutMinutes: 15, lateOutMinutes: 45 },
    },
  };
  assert.equal(validateClockOut('17:45:00', 'REGULER', extendedOut).ok, true);
  assert.equal(validateClockOut('17:46:00', 'REGULER', extendedOut).ok, false);
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
  assert.equal(formatThousands(5_000_000), '5.000.000');
  assert.equal(formatThousands('005000000'), '5.000.000');
  assert.equal(formatThousands(''), '');
});

test('calculatePayslip membayar gaji berdasar jumlah absen hadir (contoh 26 hari kerja = 5 juta)', () => {
  const staff: Employee = {
    ...sampleEmployee,
    uid: 'uid_staff_5jt',
    baseSalary: 5_000_000,
    positionAllowance: 0,
    mealTransportAllowance: 0,
  };

  // 0 hari hadir -> gaji hadir Rp 0 dan tidak ada potongan BPJS negatif
  const zeroSlip = calculatePayslip(staff, '2026-11', 'November 2026', [], []);
  assert.equal(zeroSlip.dailyBaseRate, 192308);
  assert.equal(zeroSlip.workDaysTarget, 26);
  assert.equal(zeroSlip.earnedBasePay, 0);
  assert.equal(zeroSlip.netPay, 0);

  // 1 hari hadir -> 5.000.000 / 26 = Rp 192.308
  const oneDayAtt: AttendanceRecord[] = [
    {
      id: 'att-1',
      uid: staff.uid,
      nik: staff.nik,
      employeeName: staff.name,
      division: staff.division,
      date: '2026-11-02',
      shiftCode: 'REGULER',
      clockInTime: '08:00:00',
      clockInPhotoVerified: true,
      clockInLat: 0,
      clockInLng: 0,
      clockInAddress: 'Kantor',
      clockInDistanceMeters: 5,
      lateMinutes: 0,
      clockOutTime: '17:00:00',
      clockOutPhotoVerified: true,
      clockOutLat: 0,
      clockOutLng: 0,
      clockOutAddress: 'Kantor',
      workMinutes: 540,
      status: 'Selesai',
    },
  ];
  const oneSlip = calculatePayslip(staff, '2026-11', 'November 2026', oneDayAtt, []);
  assert.equal(oneSlip.earnedBasePay, 192308);

  // 26 hari hadir penuh -> pas Rp 5.000.000 dikurangi BPJS (1% + 2% = Rp 150.000) -> Rp 4.850.000
  const fullAtt: AttendanceRecord[] = Array.from({ length: 26 }, (_, i) => ({
    ...oneDayAtt[0],
    id: `att-${i}`,
    date: `2026-11-${String(i + 1).padStart(2, '0')}`,
  }));
  const fullSlip = calculatePayslip(staff, '2026-11', 'November 2026', fullAtt, []);
  assert.equal(fullSlip.earnedBasePay, 5_000_000);
  assert.equal(fullSlip.bpjsKesehatan, 50_000);
  assert.equal(fullSlip.bpjsKetenagakerjaan, 100_000);
  assert.equal(fullSlip.netPay, 4_850_000);
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

test('shift bawaan yang dihapus hilang dari katalog & pilihan divisi, lalu pulih lagi', () => {
  registerHiddenShiftTemplates([]);
  assert.equal(allShiftTemplates().some((tpl) => tpl.code === 'PAGI'), true);

  registerHiddenShiftTemplates(['PAGI']);
  // Hilang dari katalog...
  assert.equal(allShiftTemplates().some((tpl) => tpl.code === 'PAGI'), false);
  // ...dan tidak lagi ditawarkan ke divisi yang memakainya (Cleaning Service hanya PAGI).
  const cleaning = resolveDivisionShiftRule('Cleaning Service');
  assert.equal(cleaning.allowedShiftCodes.includes('PAGI'), false);
  assert.equal(cleaning.allowedShiftCodes.length > 0, true);
  // Template tetap bisa di-resolve supaya absensi/jadwal lama tidak kehilangan jam kerja.
  assert.equal(SHIFT_TEMPLATES.PAGI.startTime, '07:00');
  // Security: PAGI dibuang, sisa shift lain tetap urut.
  assert.deepEqual(resolveDivisionShiftRule('Security').allowedShiftCodes, [
    'SECURITY24',
    'SIANG',
    'MALAM',
  ]);

  registerHiddenShiftTemplates([]);
  assert.deepEqual(resolveDivisionShiftRule('Security').allowedShiftCodes, [
    'SECURITY24',
    'PAGI',
    'SIANG',
    'MALAM',
  ]);
});

test('toleransi pulang shift tersimpan di katalog dan jadi default divisi', () => {
  registerHiddenShiftTemplates([]);
  const built = buildShiftTemplate(
    {
      name: 'Shift Sore',
      startTime: '13:00',
      endTime: '21:00',
      toleranceMinutes: 10,
      earlyOutMinutes: 25,
      lateOutMinutes: 30,
    },
    []
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.template.earlyOutMinutes, 25);
  assert.equal(built.template.lateOutMinutes, 30);
  registerShiftTemplates([built.template]);

  // Tanpa override divisi: toleransi pulang mengikuti katalog shift (bukan 15 menit hardcode).
  assert.equal(resolveShiftTolerance('SHIFT_SORE').earlyOutMinutes, 25);
  assert.equal(resolveShiftTolerance('SHIFT_SORE').lateOutMinutes, 30);
  // Override divisi tetap menang.
  assert.equal(
    resolveShiftTolerance('SHIFT_SORE', {
      division: 'Operasional',
      allowedShiftCodes: ['SHIFT_SORE'],
      defaultShiftCode: 'SHIFT_SORE',
      shiftTolerances: {
        SHIFT_SORE: { earlyInMinutes: 60, lateInMinutes: 10, earlyOutMinutes: 5, lateOutMinutes: 12 },
      },
    }).lateOutMinutes,
    12
  );
  // Bawaan aplikasi tetap 15 menit saat katalog tidak menyebut nilai.
  assert.equal(resolveShiftTolerance('REGULER').earlyOutMinutes, 15);
  assert.equal(resolveShiftTolerance('REGULER').lateOutMinutes, 15);

  registerShiftTemplates([]);
  registerHiddenShiftTemplates([]);
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

test('schedulesMirroringProfileShift moves only today/upcoming rows that follow the old profile shift', () => {
  const row = (id: string, uid: string, date: string, shiftCode: ShiftCode) => ({
    id,
    uid,
    nik: 'SEC-0001',
    date,
    shiftCode,
    location: 'Pos Utama',
    notes: '',
    patrolCompleted: false,
  });
  const schedules = [
    row('sch_a_today', 'uid_a', '2026-11-26', 'PAGI'),
    row('sch_a_tomorrow', 'uid_a', '2026-11-27', 'PAGI'),
    row('sch_a_past', 'uid_a', '2026-11-25', 'PAGI'),
    row('sch_a_other_shift', 'uid_a', '2026-11-28', 'SIANG'),
    row('sch_b_today', 'uid_b', '2026-11-26', 'PAGI'),
  ];

  // Shift profil PAGI → MALAM: jadwal hari ini & ke depan yang masih PAGI ikut pindah,
  // jadwal lampau, shift lain, dan karyawan lain tidak tersentuh.
  const mirrored = schedulesMirroringProfileShift({
    uid: 'uid_a',
    previousShift: 'PAGI',
    nextShift: 'MALAM',
    fromDate: '2026-11-26',
    schedules,
  });
  assert.deepEqual(
    mirrored.map((sch) => sch.id),
    ['sch_a_today', 'sch_a_tomorrow']
  );

  // Tidak ada perubahan / karyawan belum punya shift profil: tidak ada yang dipindah.
  assert.deepEqual(
    schedulesMirroringProfileShift({
      uid: 'uid_a',
      previousShift: 'PAGI',
      nextShift: 'PAGI',
      fromDate: '2026-11-26',
      schedules,
    }),
    []
  );
  assert.deepEqual(
    schedulesMirroringProfileShift({
      uid: 'uid_a',
      previousShift: undefined,
      nextShift: 'MALAM',
      fromDate: '2026-11-26',
      schedules,
    }),
    []
  );
});

test('getStaffDutyInfo and getShiftRostersForDate accurately compute duty partners and backup staff', () => {
  const dummyEmployees = [
    { uid: 'u1', name: 'Budi Santoso', nik: 'SEC-01', division: 'Security', active: true, shiftCode: 'PAGI' } as Employee,
    { uid: 'u2', name: 'Anton Wijaya', nik: 'SEC-02', division: 'Security', active: true, shiftCode: 'PAGI' } as Employee,
    { uid: 'u3', name: 'Caca Backup', nik: 'SEC-03', division: 'Security', active: true, shiftCode: 'PAGI' } as Employee,
  ];

  const dummySchedules = [
    { id: 's1', uid: 'u1', nik: 'SEC-01', date: '2026-11-28', shiftCode: 'PAGI' as ShiftCode, location: 'Pos 1', notes: '', patrolCompleted: false, isBackup: false },
    { id: 's2', uid: 'u2', nik: 'SEC-02', date: '2026-11-28', shiftCode: 'PAGI' as ShiftCode, location: 'Pos 1', notes: '', patrolCompleted: false, isBackup: false },
    { id: 's3', uid: 'u3', nik: 'SEC-03', date: '2026-11-28', shiftCode: 'PAGI' as ShiftCode, location: 'Pos 1', notes: '', patrolCompleted: false, isBackup: true },
  ];

  const budiDuty = getStaffDutyInfo({
    uid: 'u1',
    date: '2026-11-28',
    schedules: dummySchedules,
    employees: dummyEmployees,
    fallbackShift: 'PAGI',
  });

  assert.equal(budiDuty.isBackup, false);
  assert.equal(budiDuty.dutyPartners.length, 1);
  assert.equal(budiDuty.dutyPartners[0].uid, 'u2');
  assert.equal(budiDuty.backupStaff?.uid, 'u3');

  const cacaDuty = getStaffDutyInfo({
    uid: 'u3',
    date: '2026-11-28',
    schedules: dummySchedules,
    employees: dummyEmployees,
    fallbackShift: 'PAGI',
  });
  assert.equal(cacaDuty.isBackup, true);

  const rosters = getShiftRostersForDate({
    date: '2026-11-28',
    division: 'Security',
    schedules: dummySchedules,
    employees: dummyEmployees,
  });
  assert.equal(rosters.length, 1);
  assert.equal(rosters[0].primaryStaff.length, 2);
  assert.equal(rosters[0].backupStaff?.uid, 'u3');
});

test('checkScheduleGaps detects dates with missing schedule or missing backup', () => {
  const dummyEmployees = [
    { uid: 'u1', name: 'Budi', nik: 'SEC-01', division: 'Security', active: true, shiftCode: 'PAGI' } as Employee,
  ];

  const gapsNoSched = checkScheduleGaps({
    divisions: ['Security'],
    employees: dummyEmployees,
    schedules: [],
    startDate: '2026-11-28',
    daysCount: 1,
  });
  assert.equal(gapsNoSched.length, 1);
  assert.equal(gapsNoSched[0].type, 'no_schedule');

  const gapsNoBackup = checkScheduleGaps({
    divisions: ['Security'],
    employees: dummyEmployees,
    schedules: [
      { id: 's1', uid: 'u1', nik: 'SEC-01', date: '2026-11-28', shiftCode: 'PAGI' as ShiftCode, location: '', notes: '', patrolCompleted: false, isBackup: false },
    ],
    startDate: '2026-11-28',
    daysCount: 1,
  });
  assert.equal(gapsNoBackup.length, 1);
  assert.equal(gapsNoBackup[0].type, 'no_backup');
});

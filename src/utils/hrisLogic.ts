import type {
  AttendanceRecord,
  Division,
  DivisionShiftRule,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayslipBreakdown,
  PayslipComponent,
  PayslipLineItem,
  PayrollSettings,
  ReportType,
  ScheduleEntry,
  ShiftCode,
  ShiftSwapRequest,
  ShiftTemplate,
  ShiftTolerance,
  TodoTask,
  WibComponents,
} from '../types/hris';

export const OFFICE_COORDS = {
  lat: -6.208763,
  lng: 106.845599,
  name: 'Kantor Pusat PT Sinar Bunga Mas, Jakarta',
  maxRadiusMeters: 500,
};

export const SHIFT_TEMPLATES: Record<ShiftCode, ShiftTemplate> = {
  REGULER: {
    code: 'REGULER',
    name: 'Reguler (Default)',
    label: 'REGULER (DEFAULT) (08:00-17:00)',
    startTime: '08:00',
    endTime: '17:00',
    toleranceMinutes: 10,
  },
  PAGI: {
    code: 'PAGI',
    name: 'Shift Pagi',
    label: 'SHIFT PAGI (07:00-15:00)',
    startTime: '07:00',
    endTime: '15:00',
    toleranceMinutes: 10,
  },
  SIANG: {
    code: 'SIANG',
    name: 'Shift Siang',
    label: 'SHIFT SIANG (15:00-23:00)',
    startTime: '15:00',
    endTime: '23:00',
    toleranceMinutes: 10,
  },
  MALAM: {
    code: 'MALAM',
    name: 'Shift Malam',
    label: 'SHIFT MALAM (23:00-07:00)',
    startTime: '23:00',
    endTime: '07:00',
    toleranceMinutes: 10,
  },
  SECURITY24: {
    code: 'SECURITY24',
    name: 'Security 24 Jam',
    label: 'SHIFT SECURITY 24 JAM (07:00-07:00)',
    startTime: '07:00',
    endTime: '07:00',
    toleranceMinutes: 15,
  },
};

/**
 * Jam kerja bawaan per divisi. Security bekerja 24 jam, Cleaning Service hanya
 * sampai sore (07:00-15:00), sementara divisi kantor memakai shift reguler.
 */
export const DEFAULT_DIVISION_SHIFT_RULES: DivisionShiftRule[] = [
  { division: 'HRD', allowedShiftCodes: ['REGULER'], defaultShiftCode: 'REGULER' },
  {
    division: 'Security',
    allowedShiftCodes: ['SECURITY24', 'PAGI', 'SIANG', 'MALAM'],
    defaultShiftCode: 'SECURITY24',
  },
  { division: 'Cleaning Service', allowedShiftCodes: ['PAGI'], defaultShiftCode: 'PAGI' },
  {
    division: 'Operasional',
    allowedShiftCodes: ['REGULER', 'PAGI', 'SIANG'],
    defaultShiftCode: 'REGULER',
  },
  { division: 'Keuangan', allowedShiftCodes: ['REGULER', 'PAGI'], defaultShiftCode: 'REGULER' },
];

/** Divisi buatan HRD yang belum punya aturan khusus memakai semua shift standar. */
export const FALLBACK_DIVISION_SHIFT_CODES: ShiftCode[] = ['REGULER', 'PAGI', 'SIANG', 'MALAM'];

/**
 * Toleransi waktu absensi bawaan: absen masuk dibuka 60 menit sebelum jam masuk,
 * terlambat dianggap tepat waktu sesuai toleransi shift, dan absen pulang dibuka
 * 15 menit sebelum jam pulang (setelahnya tidak dibatasi).
 */
export const DEFAULT_SHIFT_TOLERANCE: Omit<ShiftTolerance, 'lateInMinutes'> = {
  earlyInMinutes: 60,
  earlyOutMinutes: 15,
};

/** Batas wajar nilai toleransi (menit) agar angka ekstrem tidak merusak logika. */
const MAX_TOLERANCE_MINUTES = 720;

/** Normalisasi nilai menit toleransi: angka bulat 0..720, jatuh ke `fallback` bila tidak valid. */
function normalizeToleranceMinutes(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_TOLERANCE_MINUTES, Math.max(0, Math.round(parsed)));
}

const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/**
 * Truncates and trims outgoing string fields to stay strictly synchronized with firebase-blueprint.json maxLength.
 */
export function sanitizeString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

/**
 * Validates standard email format for admin-provisioned employee accounts.
 */
export function isValidEmailAddress(email: string): boolean {
  const clean = email.trim();
  if (clean.length < 5 || clean.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

/**
 * Generates a clean, uppercase alphanumeric NIK matching ^[A-Z0-9\-]+$ from division and UID/seed.
 */
export function generateEmployeeNik(division: Division, seed: string): string {
  const prefixMap: Record<Division, string> = {
    HRD: 'HRD',
    Security: 'SEC',
    'Cleaning Service': 'CLN',
    Operasional: 'OPS',
    Keuangan: 'FIN',
  };
  const prefix = prefixMap[division] ?? 'SBM';
  const cleanSeed = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (cleanSeed.slice(-4) || String(Date.now()).slice(-4)).padStart(4, '0');
  return `${prefix}-${suffix}`;
}

/**
 * Default compensation and contract structure by division.
 */
export function getDivisionCompensationDefaults(division: Division): {
  contractType: 'PKWT' | 'PKO' | 'PKWTT';
  baseSalary: number;
  positionAllowance: number;
  mealTransportAllowance: number;
} {
  if (division === 'HRD') {
    return {
      contractType: 'PKWTT',
      baseSalary: 8500000,
      positionAllowance: 1500000,
      mealTransportAllowance: 1000000,
    };
  }
  if (division === 'Security' || division === 'Cleaning Service') {
    return {
      contractType: 'PKO',
      baseSalary: 5400000,
      positionAllowance: 600000,
      mealTransportAllowance: 750000,
    };
  }
  return {
    contractType: 'PKWT',
    baseSalary: 6200000,
    positionAllowance: 800000,
    mealTransportAllowance: 900000,
  };
}

/**
 * Converts a Date to Asia/Jakarta (WIB, UTC+7) calendar components deterministically.
 */
export function getWibComponents(date: Date = new Date()): WibComponents {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  const wibDate = new Date(utcMs + 7 * 3600_000);
  const year = wibDate.getFullYear();
  const month = wibDate.getMonth();
  const day = wibDate.getDate();
  const dayOfWeek = wibDate.getDay();
  const hours = wibDate.getHours();
  const minutes = wibDate.getMinutes();
  const seconds = wibDate.getSeconds();

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeFull = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  const timeShort = `${pad(hours)}:${pad(minutes)}`;
  const isoDate = `${year}-${pad(month + 1)}-${pad(day)}`;
  const fullIndonesianDate = `${INDONESIAN_DAYS[dayOfWeek]}, ${day} ${INDONESIAN_MONTHS[month]} ${year}`;
  const periodKey = `${year}-${pad(month + 1)}`;
  const periodLabel = `${INDONESIAN_MONTHS[month]} ${year}`;

  return {
    year,
    month,
    day,
    dayOfWeek,
    hours,
    minutes,
    seconds,
    timeFull,
    timeShort,
    isoDate,
    fullIndonesianDate,
    periodKey,
    periodLabel,
  };
}

export function formatIndonesianDateFromIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  return `${INDONESIAN_DAYS[dt.getDay()]}, ${d} ${INDONESIAN_MONTHS[m - 1]} ${y}`;
}

export function formatRupiah(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const absStr = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${absStr}`;
}

/**
 * Haversine distance between two WGS84 coordinates in meters.
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Converts HH:mm or HH:mm:ss to minutes from midnight.
 */
export function timeToMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  return h * 60 + m;
}

/** Normalisasi "H:mm"/"HH:mm" menjadi "HH:mm" (null bila tidak valid). */
export function normalizeShiftTime(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** Label shift dengan jam terbaru, mis. "SHIFT PAGI (08:00-16:00)". */
function labelWithTimes(base: ShiftTemplate, startTime: string, endTime: string): string {
  const times = `(${startTime}-${endTime})`;
  const pattern = /\([0-2]\d:[0-5]\d-[0-2]\d:[0-5]\d\)$/;
  return pattern.test(base.label) ? base.label.replace(pattern, times) : `${base.label} ${times}`;
}

/**
 * Template shift efektif: jam bawaan SHIFT_TEMPLATES, atau jam khusus divisi
 * (rule.shiftTimes) bila HRD sudah mengubahnya. Jam tidak valid diabaikan.
 */
export function resolveShiftTemplate(
  code: ShiftCode,
  rule?: DivisionShiftRule | null
): ShiftTemplate {
  const base = SHIFT_TEMPLATES[code] ?? SHIFT_TEMPLATES.REGULER;
  const custom = rule?.shiftTimes?.[code];
  if (!custom) return base;
  const startTime = normalizeShiftTime(custom.startTime);
  const endTime = normalizeShiftTime(custom.endTime);
  if (!startTime || !endTime) return base;
  if (startTime === base.startTime && endTime === base.endTime) return base;
  return { ...base, startTime, endTime, label: labelWithTimes(base, startTime, endTime) };
}

/** Template shift menurut aturan jam kerja divisi karyawan. */
export function shiftTemplateForDivision(
  code: ShiftCode,
  division: Division,
  rules: DivisionShiftRule[] = DEFAULT_DIVISION_SHIFT_RULES
): ShiftTemplate {
  return resolveShiftTemplate(code, resolveDivisionShiftRule(division, rules));
}

/**
 * Toleransi absensi efektif sebuah shift: nilai khusus divisi bila HRD
 * mengubahnya, selain itu bawaan (masuk awal 60 menit, terlambat sesuai
 * toleransi shift, pulang awal 15 menit).
 */
export function resolveShiftTolerance(
  code: ShiftCode,
  rule?: DivisionShiftRule | null
): ShiftTolerance {
  const base = SHIFT_TEMPLATES[code] ?? SHIFT_TEMPLATES.REGULER;
  const custom = rule?.shiftTolerances?.[code];
  return {
    earlyInMinutes: normalizeToleranceMinutes(custom?.earlyInMinutes, DEFAULT_SHIFT_TOLERANCE.earlyInMinutes),
    lateInMinutes: normalizeToleranceMinutes(custom?.lateInMinutes, base.toleranceMinutes),
    earlyOutMinutes: normalizeToleranceMinutes(custom?.earlyOutMinutes, DEFAULT_SHIFT_TOLERANCE.earlyOutMinutes),
  };
}

/** Menit dari tengah malam menjadi label "HH:mm" (bisa melewati 24 jam). */
export function minutesToTimeLabel(minutes: number): string {
  const dayMinutes = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(dayMinutes / 60);
  const m = dayMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Selisih menit `to - from` yang dipetakan ke rentang -720..720 sehingga
 * shift lintas tengah malam tetap terhitung benar (negatif = lebih awal).
 */
function clockDeltaMinutes(from: number, to: number): number {
  let diff = to - from;
  while (diff > 720) diff -= 1440;
  while (diff < -720) diff += 1440;
  return diff;
}

export type ClockGateResult = { ok: true } | { ok: false; error: string };

/**
 * Validasi waktu absen masuk: ditolak bila lebih awal dari toleransi masuk
 * (mis. jam masuk 08:00 dengan toleransi 60 menit → dibuka sejak 07:00).
 * Keterlambatan tidak memblokir absen, hanya dicatat pada lateMinutes.
 */
export function validateClockIn(
  clockInTime: string,
  shiftCode: ShiftCode,
  rule?: DivisionShiftRule | null
): ClockGateResult {
  const template = resolveShiftTemplate(shiftCode, rule);
  const tolerance = resolveShiftTolerance(shiftCode, rule);
  const start = timeToMinutes(template.startTime);
  const delta = clockDeltaMinutes(start, timeToMinutes(clockInTime));
  if (-delta > tolerance.earlyInMinutes) {
    const opensAt = minutesToTimeLabel(start - tolerance.earlyInMinutes);
    return {
      ok: false,
      error: `Absen masuk dibuka mulai ${opensAt} (maksimal ${tolerance.earlyInMinutes} menit sebelum jam masuk ${template.startTime}).`,
    };
  }
  return { ok: true };
}

/**
 * Validasi waktu absen pulang: ditolak bila lebih awal dari toleransi pulang
 * (mis. jam pulang 17:00 dengan toleransi 15 menit → dibuka sejak 16:45).
 * Absen pulang setelah jam pulang tidak dibatasi.
 */
export function validateClockOut(
  clockOutTime: string,
  shiftCode: ShiftCode,
  rule?: DivisionShiftRule | null
): ClockGateResult {
  const tolerance = resolveShiftTolerance(shiftCode, rule);
  const { end } = shiftWindowMinutes(shiftCode, rule);
  const delta = clockDeltaMinutes(end, timeToMinutes(clockOutTime));
  if (-delta > tolerance.earlyOutMinutes) {
    const opensAt = minutesToTimeLabel(end - tolerance.earlyOutMinutes);
    return {
      ok: false,
      error: `Absen pulang dibuka mulai ${opensAt} (maksimal ${tolerance.earlyOutMinutes} menit sebelum jam pulang ${minutesToTimeLabel(end)}).`,
    };
  }
  return { ok: true };
}

/**
 * Calculates lateness in minutes relative to shift start + tolerance.
 */
export function calculateLateMinutes(
  clockInTime: string,
  shiftCode: ShiftCode,
  rule?: DivisionShiftRule | null
): number {
  const shift = resolveShiftTemplate(shiftCode, rule);
  const tolerance = resolveShiftTolerance(shiftCode, rule);
  const actual = timeToMinutes(clockInTime);
  const scheduled = timeToMinutes(shift.startTime);
  const diff = actual - scheduled;
  if (diff <= tolerance.lateInMinutes) return 0;
  return diff;
}

/**
 * Calculates work duration in minutes (handles overnight shifts cleanly).
 * Untuk shift 24 jam (SECURITY24) jam masuk = jam pulang, sehingga durasi dipatok 24 jam.
 */
export function calculateWorkMinutes(
  clockInTime: string,
  clockOutTime: string,
  shiftCode?: ShiftCode
): number {
  const inMin = timeToMinutes(clockInTime);
  let outMin = timeToMinutes(clockOutTime);
  if (outMin < inMin) {
    outMin += 24 * 60;
  }
  const minutes = outMin - inMin;
  if (minutes === 0 && shiftCode === 'SECURITY24') return 24 * 60;
  return Math.max(0, minutes);
}

/** Rentang menit shift dari tengah malam (shift malam/24 jam melintasi hari berikutnya). */
export function shiftWindowMinutes(
  code: ShiftCode,
  rule?: DivisionShiftRule | null
): { start: number; end: number } {
  const template = resolveShiftTemplate(code, rule);
  const start = timeToMinutes(template.startTime);
  let end = timeToMinutes(template.endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

/** Dua shift bertabrakan bila rentang jamnya beririsan. */
export function shiftsOverlap(
  a: ShiftCode,
  b: ShiftCode,
  rule?: DivisionShiftRule | null
): boolean {
  const wa = shiftWindowMinutes(a, rule);
  const wb = shiftWindowMinutes(b, rule);
  return wa.start < wb.end && wb.start < wa.end;
}

/** Jarak hari kalender antara dua tanggal YYYY-MM-DD. */
function dayOffset(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Rentang absolut (menit dari 00:00 tanggal acuan) sebuah shift pada tanggal tertentu.
 * Shift malam/24 jam yang melewati tengah malam otomatis memanjang ke hari berikutnya,
 * sehingga tabrakan lintas hari (mis. MALAM kemarin vs PAGI hari ini) ikut terdeteksi.
 */
export function shiftWindowOnDate(
  code: ShiftCode,
  isoDate: string,
  referenceDate: string,
  rule?: DivisionShiftRule | null
): { start: number; end: number } {
  const base = dayOffset(referenceDate, isoDate) * 24 * 60;
  const { start, end } = shiftWindowMinutes(code, rule);
  return { start: base + start, end: base + end };
}

/** Dua jadwal shift pada tanggal masing-masing bertabrakan (termasuk lintas hari). */
export function shiftsConflictOnDates(
  a: { shiftCode: ShiftCode; date: string },
  b: { shiftCode: ShiftCode; date: string },
  referenceDate: string,
  rule?: DivisionShiftRule | null
): boolean {
  const wa = shiftWindowOnDate(a.shiftCode, a.date, referenceDate, rule);
  const wb = shiftWindowOnDate(b.shiftCode, b.date, referenceDate, rule);
  return wa.start < wb.end && wb.start < wa.end;
}

/**
 * Shift efektif karyawan pada satu tanggal: jadwal khusus (hasil penugasan /
 * tukar shift disetujui) bila ada, selain itu shift bawaan profil.
 */
export function effectiveShiftForDate(
  uid: string,
  isoDate: string,
  schedules: ScheduleEntry[],
  fallbackShift: ShiftCode
): ShiftCode {
  const entry = schedules.find((sch) => sch.uid === uid && sch.date === isoDate);
  return entry?.shiftCode ?? fallbackShift;
}

/**
 * Jadwal lain milik karyawan yang bertabrakan dengan shift yang akan dipasang
 * pada tanggal tertentu (termasuk shift malam/24 jam lintas hari).
 */
export function findScheduleConflict(params: {
  uid: string;
  date: string;
  shiftCode: ShiftCode;
  schedules: ScheduleEntry[];
  /** Baris jadwal yang sedang diganti/dihapus (diabaikan saat pemeriksaan). */
  ignoreId?: string;
  /** Aturan jam kerja karyawan (jam shift khusus divisi) bila ada. */
  rule?: DivisionShiftRule | null;
}): ScheduleEntry | null {
  const candidate = { shiftCode: params.shiftCode, date: params.date };
  for (const schedule of params.schedules) {
    if (schedule.uid !== params.uid) continue;
    if (params.ignoreId && schedule.id === params.ignoreId) continue;
    if (Math.abs(dayOffset(params.date, schedule.date)) > 1) continue;
    if (shiftsConflictOnDates(schedule, candidate, params.date, params.rule)) return schedule;
  }
  return null;
}

/** Label jam kerja shift, mis. "07:00 - 07:00 (24 jam)". */
export function formatShiftWindow(
  code: ShiftCode,
  rule?: DivisionShiftRule | null
): string {
  const template = resolveShiftTemplate(code, rule);
  const { start, end } = shiftWindowMinutes(code, rule);
  const total = end - start;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const dur = m === 0 ? `${h} jam` : `${h} jam ${m} menit`;
  return `${template.startTime} - ${template.endTime} (${dur})`;
}

/** Shift yang diizinkan untuk divisi tertentu (aturan bawaan bila belum diatur HRD). */
export function resolveDivisionShiftRule(
  division: Division,
  rules: DivisionShiftRule[] = DEFAULT_DIVISION_SHIFT_RULES
): DivisionShiftRule {
  const found = rules.find((rule) => rule.division === division);
  if (found && found.allowedShiftCodes.length > 0) return found;
  return {
    division,
    allowedShiftCodes: FALLBACK_DIVISION_SHIFT_CODES,
    defaultShiftCode: 'REGULER',
  };
}

export function isShiftAllowedForDivision(
  division: Division,
  code: ShiftCode,
  rules: DivisionShiftRule[] = DEFAULT_DIVISION_SHIFT_RULES
): boolean {
  return resolveDivisionShiftRule(division, rules).allowedShiftCodes.includes(code);
}

/** Shift bawaan divisi, dengan pengaman bila aturan divisi tidak menyertakannya. */
export function defaultShiftForDivision(
  division: Division,
  rules: DivisionShiftRule[] = DEFAULT_DIVISION_SHIFT_RULES
): ShiftCode {
  const rule = resolveDivisionShiftRule(division, rules);
  return rule.allowedShiftCodes.includes(rule.defaultShiftCode)
    ? rule.defaultShiftCode
    : (rule.allowedShiftCodes[0] ?? 'REGULER');
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0j 0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}j ${m}m`;
}

/**
 * Calculates inclusive calendar days between two YYYY-MM-DD dates.
 */
export function calculateInclusiveDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000) + 1;
}

/** Apakah tanggal YYYY-MM-DD berada di dalam rentang izin/cuti. */
export function isIsoDateWithinRange(isoDate: string, startDate: string, endDate: string): boolean {
  if (!isoDate || !startDate || !endDate) return false;
  return isoDate >= startDate && isoDate <= endDate;
}

/**
 * Izin/cuti yang sudah DISETUJUI dan mencakup tanggal tertentu.
 * Karyawan dengan izin/cuti disetujui otomatis tidak dapat melakukan absensi.
 */
export function findApprovedLeaveOnDate(
  leaves: LeaveRequest[],
  uid: string,
  isoDate: string
): LeaveRequest | null {
  return (
    leaves.find(
      (leave) =>
        leave.uid === uid &&
        leave.status === 'Disetujui' &&
        isIsoDateWithinRange(isoDate, leave.startDate, leave.endDate)
    ) ?? null
  );
}

/** Jam kerja efektif yang ditanggung izin/cuti pada rentang tanggal. */
export function formatLeaveRange(leave: Pick<LeaveRequest, 'startDate' | 'endDate' | 'days'>): string {
  if (leave.startDate === leave.endDate) return `${leave.startDate} (${leave.days} hari)`;
  return `${leave.startDate} s/d ${leave.endDate} (${leave.days} hari)`;
}

export const TODO_REPORT_TYPE_LABELS: Record<ReportType, string> = {
  gambar: 'Gambar (Foto)',
  dokumen: 'Dokumen (File)',
  pesan: 'Pesan Teks',
  semua: 'Semua Format',
};

/**
 * Format laporan yang diwajibkan untuk sebuah tugas. Mendukung lebih dari satu
 * format sekaligus (mis. gambar + dokumen) dengan fallback data lama.
 */
export function resolveTodoReportTypes(
  task: Pick<TodoTask, 'reportTypes' | 'reportTypeRequired'>
): ReportType[] {
  const explicit = (task.reportTypes ?? []).filter((type) => type !== 'semua');
  if (explicit.length > 0) return Array.from(new Set(explicit));
  if (task.reportTypeRequired && task.reportTypeRequired !== 'semua') {
    return [task.reportTypeRequired];
  }
  return ['gambar', 'dokumen', 'pesan'];
}

export function formatTodoReportTypes(
  task: Pick<TodoTask, 'reportTypes' | 'reportTypeRequired'>
): string {
  return resolveTodoReportTypes(task)
    .map((type) => TODO_REPORT_TYPE_LABELS[type])
    .join(' + ');
}

export interface ShiftSwapValidationInput {
  date: string;
  fromShift: ShiftCode;
  toShift: ShiftCode;
  uid: string;
  division: Division;
  schedules: ScheduleEntry[];
  shiftSwaps: ShiftSwapRequest[];
  rules?: DivisionShiftRule[];
  /** Karyawan sedang izin/cuti disetujui pada tanggal tersebut. */
  onApprovedLeave?: boolean;
}

/**
 * Validasi tukar shift agar tidak bertabrakan: shift tujuan harus tersedia untuk
 * divisi, tidak bentrok jam dengan jadwal lain pada hari yang sama, tidak
 * menggandakan pengajuan, dan tidak dilakukan saat sedang izin/cuti.
 */
export function validateShiftSwap(
  input: ShiftSwapValidationInput
): { ok: true } | { ok: false; error: string } {
  const toShiftName = SHIFT_TEMPLATES[input.toShift]?.name ?? input.toShift;
  if (input.toShift === input.fromShift) {
    return { ok: false, error: 'Pilih shift tujuan yang berbeda dari shift Anda saat ini.' };
  }
  const rule = resolveDivisionShiftRule(input.division, input.rules);
  if (!rule.allowedShiftCodes.includes(input.toShift)) {
    const allowed = rule.allowedShiftCodes.map((code) => SHIFT_TEMPLATES[code]?.name ?? code);
    return {
      ok: false,
      error: `Shift ${toShiftName} tidak tersedia untuk divisi ${input.division}. Pilihan: ${allowed.join(', ')}.`,
    };
  }
  if (input.onApprovedLeave) {
    return {
      ok: false,
      error: 'Anda sedang menjalani izin/cuti yang disetujui pada tanggal tersebut, tukar shift tidak dapat diajukan.',
    };
  }

  // Jadwal ±1 hari ikut diperiksa agar shift malam/24 jam yang melewati tengah malam
  // tidak bertabrakan dengan shift tujuan.
  const nearby = input.schedules.filter(
    (s) => s.uid === input.uid && Math.abs(dayOffset(input.date, s.date)) <= 1
  );
  for (const schedule of nearby) {
    // Jadwal pada tanggal yang sama dengan shift asal = shift yang digantikan.
    if (schedule.date === input.date && schedule.shiftCode === input.fromShift) continue;
    if (
      shiftsConflictOnDates(
        { shiftCode: schedule.shiftCode, date: schedule.date },
        { shiftCode: input.toShift, date: input.date },
        input.date,
        rule
      )
    ) {
      return {
        ok: false,
        error: `Shift ${toShiftName} bertabrakan dengan jadwal ${schedule.shiftCode} Anda pada ${schedule.date}.`,
      };
    }
  }

  const duplicated = input.shiftSwaps.find(
    (swap) =>
      swap.uid === input.uid &&
      swap.date === input.date &&
      swap.status !== 'Ditolak' &&
      swap.toShift === input.toShift
  );
  if (duplicated) {
    return {
      ok: false,
      error: `Pengajuan tukar shift ke ${toShiftName} pada ${input.date} sudah ada (status: ${duplicated.status}).`,
    };
  }

  return { ok: true };
}

/**
 * Calculates overtime hours and estimated Rupiah pay (Indonesian Depnaker formula approximation: baseSalary / 173 * 1.5).
 */
export function calculateOvertimeEstimate(
  startTime: string,
  endTime: string,
  baseSalary: number
): { hours: number; estimatedPay: number } {
  const mins = calculateWorkMinutes(startTime, endTime);
  const hours = Math.round((mins / 60) * 10) / 10;
  const hourlyRate = baseSalary / 173;
  const estimatedPay = Math.round(hours * hourlyRate * 1.5);
  return { hours, estimatedPay };
}

/** Nilai bawaan pengaturan payroll (identik dengan perhitungan lama). */
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  bpjsKesehatanRate: 0.01,
  bpjsKetenagakerjaanRate: 0.02,
  lateDeductionPerMinute: 1000,
  overtimeRateMode: 'perJam',
  overtimeHourlyMultiplier: 1.5,
  overtimeSessionRate: 50000,
};

/** Insentif lembur satu pengajuan sesuai mode per jam / per sesi. */
export function calculateOvertimePayForRequest(
  request: Pick<OvertimeRequest, 'hours'>,
  baseSalary: number,
  settings: PayrollSettings = DEFAULT_PAYROLL_SETTINGS
): number {
  if (settings.overtimeRateMode === 'perSesi') {
    return Math.max(0, Math.round(settings.overtimeSessionRate));
  }
  const hourlyRate = baseSalary / 173;
  return Math.round(request.hours * hourlyRate * settings.overtimeHourlyMultiplier);
}

/**
 * Format laporan yang wajib dikirim karyawan untuk satu tugas.
 * Mendukung lebih dari satu format sekaligus (mis. gambar + dokumen).
 */
export function requiredReportFormats(
  task: Pick<TodoTask, 'reportTypeRequired' | 'reportTypes'>
): Array<'pesan' | 'gambar' | 'dokumen'> {
  const raw =
    task.reportTypes && task.reportTypes.length > 0 ? task.reportTypes : [task.reportTypeRequired];
  if (raw.includes('semua')) return ['pesan', 'gambar', 'dokumen'];
  const chosen = new Set(raw);
  return (['pesan', 'gambar', 'dokumen'] as const).filter((format) => chosen.has(format));
}

/** Label manusiawi untuk daftar format laporan, mis. "Gambar + Dokumen". */
export function formatReportTypesLabel(formats: Array<'pesan' | 'gambar' | 'dokumen'>): string {
  const LABELS: Record<'pesan' | 'gambar' | 'dokumen', string> = {
    pesan: 'Pesan',
    gambar: 'Gambar',
    dokumen: 'Dokumen',
  };
  return formats.map((format) => LABELS[format]).join(' + ');
}

/** Nilai nominal satu komponen gaji untuk karyawan tertentu. */
export function resolvePayslipComponentAmount(
  component: PayslipComponent,
  employee: Employee
): number {
  if (component.basis === 'persenGajiPokok') {
    return Math.round((employee.baseSalary * component.amount) / 100);
  }
  return Math.round(component.amount);
}

/** Label ringkas basis komponen, mis. "1.5% gaji pokok" atau "Rp 250.000". */
export function formatPayslipComponentBasis(component: PayslipComponent): string {
  if (component.basis === 'persenGajiPokok') {
    const pct = Number(component.amount.toFixed(2));
    return `${pct}% gaji pokok`;
  }
  return formatRupiah(component.amount);
}

/**
 * Komponen gaji yang berlaku untuk seorang karyawan: global, divisi karyawan,
 * dan komponen khusus karyawan tersebut. Komponen nonaktif diabaikan.
 */
export function resolvePayslipComponents(
  employee: Employee,
  components: PayslipComponent[] = []
): { earnings: PayslipLineItem[]; deductions: PayslipLineItem[] } {
  const earnings: PayslipLineItem[] = [];
  const deductions: PayslipLineItem[] = [];

  for (const component of components) {
    if (!component.active) continue;
    if (component.scope === 'employee' && component.employeeUid !== employee.uid) continue;
    if (component.scope === 'division' && component.division !== employee.division) continue;

    const amount = resolvePayslipComponentAmount(component, employee);
    if (amount === 0) continue;
    const line: PayslipLineItem = {
      code: component.id,
      label: component.name,
      amount,
      kind: component.kind,
    };
    if (component.kind === 'earning') earnings.push(line);
    else deductions.push(line);
  }

  return { earnings, deductions };
}

/** Persentase potongan BPJS untuk label rincian slip. */
function formatRatePercent(rate: number): string {
  const percent = rate * 100;
  return `${Number(percent.toFixed(2))}%`;
}

/**
 * Computes monthly payslip breakdown from employee profile, attendance logs,
 * approved overtime, and HRD-configured payroll components/settings.
 */
export function calculatePayslip(
  employee: Employee,
  periodKey: string,
  periodLabel: string,
  attendanceRecords: AttendanceRecord[],
  overtimeRequests: OvertimeRequest[],
  components: PayslipComponent[] = [],
  settings: PayrollSettings = DEFAULT_PAYROLL_SETTINGS
): PayslipBreakdown {
  const empAttendance = attendanceRecords.filter(
    (r) => r.uid === employee.uid && r.date.startsWith(periodKey)
  );
  const empOvertime = overtimeRequests.filter(
    (o) => o.uid === employee.uid && o.status === 'Disetujui' && o.date.startsWith(periodKey)
  );

  const overtimeHours = empOvertime.reduce((sum, item) => sum + item.hours, 0);
  const overtimePay = empOvertime.reduce(
    (sum, item) => sum + calculateOvertimePayForRequest(item, employee.baseSalary, settings),
    0
  );
  const lateMinutesTotal = empAttendance.reduce((sum, item) => sum + (item.lateMinutes || 0), 0);

  const lateDeduction = lateMinutesTotal * settings.lateDeductionPerMinute;
  const bpjsKesehatan = Math.round(employee.baseSalary * settings.bpjsKesehatanRate);
  const bpjsKetenagakerjaan = Math.round(employee.baseSalary * settings.bpjsKetenagakerjaanRate);
  const { earnings: extraEarnings, deductions: extraDeductions } = resolvePayslipComponents(
    employee,
    components
  );

  const earnings: PayslipLineItem[] = [
    { code: 'BASE', label: 'Gaji Pokok', amount: employee.baseSalary, kind: 'earning' },
    {
      code: 'POSITION',
      label: 'Tunjangan Jabatan',
      amount: employee.positionAllowance,
      kind: 'earning',
    },
    {
      code: 'MEAL',
      label: 'Tunjangan Makan & Transport',
      amount: employee.mealTransportAllowance,
      kind: 'earning',
    },
  ];
  if (overtimePay > 0) {
    earnings.push({
      code: 'OVERTIME',
      label:
        settings.overtimeRateMode === 'perSesi'
          ? `Insentif Lembur (${empOvertime.length} sesi)`
          : `Insentif Lembur (${overtimeHours} jam)`,
      amount: overtimePay,
      kind: 'earning',
    });
  }
  earnings.push(...extraEarnings);

  const deductions: PayslipLineItem[] = [];
  if (bpjsKesehatan > 0) {
    deductions.push({
      code: 'BPJS_KES',
      label: `BPJS Kesehatan (${formatRatePercent(settings.bpjsKesehatanRate)})`,
      amount: bpjsKesehatan,
      kind: 'deduction',
    });
  }
  if (bpjsKetenagakerjaan > 0) {
    deductions.push({
      code: 'BPJS_TK',
      label: `BPJS Ketenagakerjaan (${formatRatePercent(settings.bpjsKetenagakerjaanRate)})`,
      amount: bpjsKetenagakerjaan,
      kind: 'deduction',
    });
  }
  if (lateDeduction > 0) {
    deductions.push({
      code: 'LATE',
      label: `Potongan Keterlambatan (${lateMinutesTotal} menit)`,
      amount: lateDeduction,
      kind: 'deduction',
    });
  }
  deductions.push(...extraDeductions);

  const grossPay = earnings.reduce((sum, line) => sum + line.amount, 0);
  const totalDeductions = deductions.reduce((sum, line) => sum + line.amount, 0);
  const netPay = Math.max(0, grossPay - totalDeductions);

  return {
    periodLabel,
    periodKey,
    baseSalary: employee.baseSalary,
    positionAllowance: employee.positionAllowance,
    mealTransportAllowance: employee.mealTransportAllowance,
    overtimeHours,
    overtimePay,
    grossPay,
    bpjsKesehatan,
    bpjsKetenagakerjaan,
    lateMinutesTotal,
    lateDeduction,
    totalDeductions,
    netPay,
    attendanceDays: empAttendance.length,
    earnings,
    deductions,
    overtimeRateMode: settings.overtimeRateMode,
  };
}

/**
 * Renders a GPS + Timestamp watermarked attendance snapshot onto an HTMLCanvasElement.
 */
export function renderWatermarkedPhoto(params: {
  video?: HTMLVideoElement | null;
  employeeName: string;
  nik: string;
  division: string;
  mode: 'MASUK' | 'PULANG';
  timestampLabel: string;
  lat: number;
  lng: number;
  locationLabel: string;
}): string {
  const canvas = document.createElement('canvas');
  const width = 640;
  const height = 480;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const hasLiveVideo =
    params.video && params.video.readyState >= 2 && params.video.videoWidth > 0;

  if (hasLiveVideo && params.video) {
    ctx.drawImage(params.video, 0, 0, width, height);
  } else {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0B2453');
    grad.addColorStop(0.6, '#163A7A');
    grad.addColorStop(1, '#1E293B');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(226, 179, 60, 0.16)';
    ctx.beginPath();
    ctx.arc(width / 2, 178, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#D4A017';
    ctx.lineWidth = 3;
    ctx.stroke();

    const initials = params.employeeName
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 46px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials || 'SB', width / 2, 180);

    ctx.fillStyle = '#E2B33C';
    ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('VERIFIKASI KAMERA LIVE • PT SINAR BUNGA MAS', width / 2, 278);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.fillStyle = 'rgba(11, 36, 83, 0.85)';
  ctx.fillRect(16, 16, 250, 34);
  ctx.fillStyle = '#E2B33C';
  ctx.fillRect(16, 16, 5, 34);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`SBUM LIVE • ABSEN ${params.mode}`, 30, 38);

  const scrimY = height - 134;
  const scrimGrad = ctx.createLinearGradient(0, scrimY - 20, 0, height);
  scrimGrad.addColorStop(0, 'rgba(6, 18, 43, 0)');
  scrimGrad.addColorStop(0.2, 'rgba(6, 18, 43, 0.86)');
  scrimGrad.addColorStop(1, 'rgba(6, 18, 43, 0.96)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, scrimY - 20, width, 154);

  ctx.fillStyle = '#D4A017';
  ctx.fillRect(20, scrimY + 8, width - 40, 2);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${params.employeeName} (${params.nik})`, 20, scrimY + 34);

  ctx.fillStyle = '#E2B33C';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText(`WIB: ${params.timestampLabel}`, 20, scrimY + 58);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText(`GPS: ${params.lat.toFixed(6)}, ${params.lng.toFixed(6)}`, 20, scrimY + 80);

  ctx.font = '13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Lokasi: ${params.locationLabel}`, 20, scrimY + 102);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Divisi: ${params.division} • PT Sinar Bunga Mas`, 20, scrimY + 122);

  return canvas.toDataURL('image/jpeg', 0.84);
}

/**
 * Mengubah gambar sumber menjadi data URL JPEG persegi (crop tengah 1:1)
 * berukuran `size`px. Dipakai untuk foto profil karyawan agar selalu kotak
 * dan ukurannya kecil (aman disimpan pada dokumen Firestore).
 */
export function renderSquareAvatar(image: HTMLImageElement, size = 256): string {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const side = Math.min(srcW, srcH);
  if (!side) throw new Error('Ukuran gambar tidak valid.');

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia di peramban ini.');

  const sx = (srcW - side) / 2;
  const sy = (srcH - side) / 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.82);
}

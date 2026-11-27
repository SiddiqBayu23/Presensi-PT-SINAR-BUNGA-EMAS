import type {
  AttendanceRecord,
  BuiltinShiftCode,
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
  UserPayrollConfig,
  ShiftCode,
  ShiftSwapRequest,
  ShiftTemplate,
  ShiftTemplateInput,
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
    earlyOutMinutes: 15,
    lateOutMinutes: 15,
  },
  PAGI: {
    code: 'PAGI',
    name: 'Shift Pagi',
    label: 'SHIFT PAGI (07:00-15:00)',
    startTime: '07:00',
    endTime: '15:00',
    toleranceMinutes: 10,
    earlyOutMinutes: 15,
    lateOutMinutes: 15,
  },
  SIANG: {
    code: 'SIANG',
    name: 'Shift Siang',
    label: 'SHIFT SIANG (15:00-23:00)',
    startTime: '15:00',
    endTime: '23:00',
    toleranceMinutes: 10,
    earlyOutMinutes: 15,
    lateOutMinutes: 15,
  },
  MALAM: {
    code: 'MALAM',
    name: 'Shift Malam',
    label: 'SHIFT MALAM (23:00-07:00)',
    startTime: '23:00',
    endTime: '07:00',
    toleranceMinutes: 10,
    earlyOutMinutes: 15,
    lateOutMinutes: 15,
  },
  SECURITY24: {
    code: 'SECURITY24',
    name: 'Security 24 Jam',
    label: 'SHIFT SECURITY 24 JAM (07:00-07:00)',
    startTime: '07:00',
    endTime: '07:00',
    toleranceMinutes: 15,
    earlyOutMinutes: 15,
    lateOutMinutes: 15,
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

/** Urutan tampil shift bawaan di seluruh layar. */
export const BUILTIN_SHIFT_CODES: BuiltinShiftCode[] = ['REGULER', 'PAGI', 'SIANG', 'MALAM', 'SECURITY24'];

/** Batas panjang kode shift — sama dengan `isValidShift` di firestore.rules. */
export const SHIFT_CODE_MAX_LENGTH = 16;

/** Batas panjang nama shift yang bisa diisi HRD. */
export const SHIFT_NAME_MAX_LENGTH = 32;

/**
 * Katalog shift buatan HRD yang aktif pada sesi ini (tersimpan di localStorage, dimuat
 * HrisContext saat aplikasi dibuka). Modul-level karena jam kerja shift dipakai juga oleh
 * fungsi murni di luar React (perhitungan telat, validasi absen, label jadwal).
 */
let customShiftTemplates: ShiftTemplate[] = [];

/**
 * Shift bawaan yang disembunyikan HRD dari katalog ("hapus shift"). Template tetap
 * bisa di-resolve lewat `findShiftTemplate` supaya absensi/jadwal lama tidak kehilangan
 * jam kerjanya — hanya tidak lagi ditawarkan untuk divisi/karyawan baru.
 */
let hiddenBuiltinShiftCodes: ShiftCode[] = [];

/** Daftarkan katalog shift buatan HRD (dipanggil HrisContext setiap katalog berubah). */
export function registerShiftTemplates(templates: readonly ShiftTemplate[]): void {
  customShiftTemplates = templates
    .filter(
      (template) =>
        Boolean(template) &&
        typeof template.code === 'string' &&
        template.code !== '' &&
        !SHIFT_TEMPLATES[template.code]
    )
    .map((template) => ({
      ...template,
      earlyOutMinutes: normalizeToleranceMinutes(
        template.earlyOutMinutes,
        DEFAULT_SHIFT_TOLERANCE.earlyOutMinutes
      ),
      lateOutMinutes: normalizeToleranceMinutes(
        template.lateOutMinutes,
        DEFAULT_SHIFT_TOLERANCE.lateOutMinutes
      ),
      custom: true,
    }));
}

/** Daftarkan shift bawaan yang disembunyikan HRD (dipanggil HrisContext saat katalog berubah). */
export function registerHiddenShiftTemplates(codes: readonly string[]): void {
  hiddenBuiltinShiftCodes = Array.from(new Set(codes)).filter(
    (code): code is BuiltinShiftCode => Boolean(SHIFT_TEMPLATES[code])
  );
}

/** Apakah shift bawaan ini sudah dihapus (disembunyikan) HRD dari katalog. */
export function isBuiltinShiftHidden(code: ShiftCode | null | undefined): boolean {
  return typeof code === 'string' && hiddenBuiltinShiftCodes.includes(code);
}

/** Seluruh shift yang bisa dipakai karyawan: shift bawaan lebih dulu, lalu buatan HRD. */
export function allShiftTemplates(): ShiftTemplate[] {
  return [
    ...BUILTIN_SHIFT_CODES.filter((code) => !hiddenBuiltinShiftCodes.includes(code)).map(
      (code) => SHIFT_TEMPLATES[code]
    ),
    ...customShiftTemplates,
  ];
}

/** Template satu kode shift, atau null bila kode tidak ada di katalog. */
export function findShiftTemplate(code: ShiftCode | null | undefined): ShiftTemplate | null {
  if (typeof code !== 'string' || code === '') return null;
  return customShiftTemplates.find((template) => template.code === code) ?? SHIFT_TEMPLATES[code] ?? null;
}

/** Template shift tanpa aturan divisi; kode tak dikenal jatuh ke REGULER. */
export function shiftTemplate(code: ShiftCode | null | undefined): ShiftTemplate {
  return findShiftTemplate(code) ?? SHIFT_TEMPLATES.REGULER;
}

/** Nama tampilan shift; kode tak dikenal dikembalikan apa adanya agar tidak menyesatkan. */
export function shiftTemplateName(code: ShiftCode | null | undefined): string {
  const found = findShiftTemplate(code);
  if (found) return found.name;
  return typeof code === 'string' && code !== '' ? code : SHIFT_TEMPLATES.REGULER.name;
}

/** Kode shift dari nama, mis. "Shift Malam 2" → "SHIFT_MALAM_2" (unik, maks. 16 karakter). */
export function buildShiftCode(name: string, taken: readonly string[]): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, SHIFT_CODE_MAX_LENGTH);
  const seed = slug.length >= 2 ? slug : 'SHIFT';
  if (!taken.includes(seed)) return seed;
  for (let suffix = 2; suffix <= 99; suffix++) {
    const tail = `_${suffix}`;
    const candidate = `${seed.slice(0, SHIFT_CODE_MAX_LENGTH - tail.length)}${tail}`;
    if (!taken.includes(candidate)) return candidate;
  }
  // Praktis tak tercapai (butuh 99 shift bernama sama); tetap harus menghasilkan kode unik.
  let fallback = '';
  do {
    fallback = `SHIFT_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  } while (taken.includes(fallback));
  return fallback;
}

/**
 * Template baru/terubah dari isian form HRD. Jam, nama, dan toleransi divalidasi supaya
 * nilai tidak masuk akal (mis. "25:00") tidak pernah ikut tersimpan.
 */
export function buildShiftTemplate(
  input: ShiftTemplateInput,
  taken: readonly string[],
  code?: ShiftCode
): { ok: true; template: ShiftTemplate } | { ok: false; error: string } {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return { ok: false, error: 'Nama shift minimal 2 karakter.' };
  if (name.length > SHIFT_NAME_MAX_LENGTH) {
    return { ok: false, error: `Nama shift maksimal ${SHIFT_NAME_MAX_LENGTH} karakter.` };
  }
  const startTime = normalizeShiftTime(input.startTime);
  const endTime = normalizeShiftTime(input.endTime);
  if (!startTime || !endTime) {
    return { ok: false, error: 'Jam shift harus format HH:mm, mis. 08:00 dan 17:00.' };
  }
  const toleranceMinutes = Number(input.toleranceMinutes);
  if (
    !Number.isFinite(toleranceMinutes) ||
    toleranceMinutes < 0 ||
    toleranceMinutes > MAX_TOLERANCE_MINUTES
  ) {
    return { ok: false, error: `Toleransi telat harus 0-${MAX_TOLERANCE_MINUTES} menit.` };
  }
  const rawEarlyOut = input.earlyOutMinutes;
  const earlyOutMinutes =
    rawEarlyOut === undefined || rawEarlyOut === null || (rawEarlyOut as unknown) === ''
      ? DEFAULT_SHIFT_TOLERANCE.earlyOutMinutes
      : Number(rawEarlyOut);
  if (
    !Number.isFinite(earlyOutMinutes) ||
    earlyOutMinutes < 0 ||
    earlyOutMinutes > MAX_TOLERANCE_MINUTES
  ) {
    return { ok: false, error: `Toleransi pulang harus 0-${MAX_TOLERANCE_MINUTES} menit.` };
  }
  const rawLateOut = input.lateOutMinutes;
  const lateOutMinutes =
    rawLateOut === undefined || rawLateOut === null || (rawLateOut as unknown) === ''
      ? DEFAULT_SHIFT_TOLERANCE.lateOutMinutes
      : Number(rawLateOut);
  if (
    !Number.isFinite(lateOutMinutes) ||
    lateOutMinutes < 0 ||
    lateOutMinutes > MAX_TOLERANCE_MINUTES
  ) {
    return { ok: false, error: `Toleransi telat pulang harus 0-${MAX_TOLERANCE_MINUTES} menit.` };
  }
  const shiftCode = code ?? buildShiftCode(name, taken);
  if (shiftCode !== code && taken.includes(shiftCode)) {
    return { ok: false, error: `Kode shift ${shiftCode} sudah dipakai shift lain.` };
  }
  return {
    ok: true,
    template: {
      code: shiftCode,
      name,
      label: `${name.toUpperCase()} (${startTime}-${endTime})`,
      startTime,
      endTime,
      toleranceMinutes: Math.round(toleranceMinutes),
      earlyOutMinutes: Math.round(earlyOutMinutes),
      lateOutMinutes: Math.round(lateOutMinutes),
      custom: true,
    },
  };
}

/** Muat ulang katalog shift kustom dari penyimpanan; entri rusak/duplikat dibuang. */
export function normalizeCustomShiftTemplates(raw: unknown): ShiftTemplate[] {
  if (!Array.isArray(raw)) return [];
  const templates: ShiftTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Partial<ShiftTemplateInput> & { code?: unknown };
    if (typeof record.name !== 'string') continue;
    const code = typeof record.code === 'string' ? record.code : undefined;
    if (code && (templates.some((template) => template.code === code) || SHIFT_TEMPLATES[code])) continue;
    const built = buildShiftTemplate(
      {
        name: record.name,
        startTime: typeof record.startTime === 'string' ? record.startTime : '',
        endTime: typeof record.endTime === 'string' ? record.endTime : '',
        toleranceMinutes: Number(record.toleranceMinutes ?? 0),
        earlyOutMinutes:
          record.earlyOutMinutes === undefined || record.earlyOutMinutes === null
            ? undefined
            : Number(record.earlyOutMinutes),
        lateOutMinutes:
          record.lateOutMinutes === undefined || record.lateOutMinutes === null
            ? undefined
            : Number(record.lateOutMinutes),
      },
      templates.map((template) => template.code),
      code
    );
    if (built.ok) templates.push(built.template);
  }
  return templates;
}

/**
 * Toleransi waktu absensi bawaan: absen masuk dibuka 60 menit sebelum jam masuk,
 * terlambat dianggap tepat waktu sesuai toleransi shift, absen pulang dibuka
 * 15 menit sebelum jam pulang, dan batas waktu absen pulang 15 menit setelah jam pulang.
 */
export const DEFAULT_SHIFT_TOLERANCE: Omit<ShiftTolerance, 'lateInMinutes'> = {
  earlyInMinutes: 60,
  earlyOutMinutes: 15,
  lateOutMinutes: 15,
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

/** True hanya untuk tepat 16 digit angka (NIK pada KTP / nomor Kartu Keluarga). */
export function isSixteenDigits(value: string): boolean {
  return /^[0-9]{16}$/.test(value.trim());
}

/**
 * Menyaring masukan NIK KTP / nomor KK: buang spasi dan tanda hubung, terima hanya
 * bila hasilnya tepat 16 digit — selain itu '' (agar rules Firestore tetap lolos).
 */
export function sanitizeSixteenDigits(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  return isSixteenDigits(digits) ? digits : '';
}

/**
 * Validasi ketat `YYYY-MM-DD`: format benar dan tanggalnya ada di kalender
 * (mis. `2026-02-30` ditolak), sehingga usia tidak pernah dihitung dari tanggal palsu.
 */
export function isValidIsoDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Usia penuh dalam tahun dari tanggal lahir `YYYY-MM-DD` terhadap `todayIso`.
 * `null` bila tanggal lahir tidak valid atau masih di masa depan.
 */
export function calculateAge(birthDate: string, todayIso: string): number | null {
  if (!isValidIsoDateString(birthDate) || !isValidIsoDateString(todayIso)) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.trim().split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayIso.trim().split('-').map(Number);
  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) age -= 1;
  return age < 0 ? null : age;
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

/** Memformat angka/string digit dengan pemisah ribuan titik (mis. "5000000" -> "5.000.000") untuk input nominal. */
export function formatThousands(value: number | string): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '0';
    return Math.max(0, Math.round(value))
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '';
  const normalized = digits.replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
  const base = shiftTemplate(code);
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
 * toleransi shift, pulang awal dan telat pulang sesuai toleransi shift).
 */
export function resolveShiftTolerance(
  code: ShiftCode,
  rule?: DivisionShiftRule | null
): ShiftTolerance {
  const base = shiftTemplate(code);
  const custom = rule?.shiftTolerances?.[code];
  return {
    earlyInMinutes: normalizeToleranceMinutes(custom?.earlyInMinutes, DEFAULT_SHIFT_TOLERANCE.earlyInMinutes),
    lateInMinutes: normalizeToleranceMinutes(custom?.lateInMinutes, base.toleranceMinutes),
    earlyOutMinutes: normalizeToleranceMinutes(
      custom?.earlyOutMinutes,
      normalizeToleranceMinutes(base.earlyOutMinutes, DEFAULT_SHIFT_TOLERANCE.earlyOutMinutes)
    ),
    lateOutMinutes: normalizeToleranceMinutes(
      custom?.lateOutMinutes,
      normalizeToleranceMinutes(base.lateOutMinutes, DEFAULT_SHIFT_TOLERANCE.lateOutMinutes)
    ),
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
 * Validasi waktu absen pulang: ditolak bila lebih awal dari toleransi pulang awal
 * (mis. jam pulang 17:00 dengan toleransi 15 menit → dibuka sejak 16:45) atau
 * melewati toleransi batas waktu pulang (mis. 15 menit setelah 17:00 → ditutup setelah 17:15).
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
  if (delta > tolerance.lateOutMinutes) {
    const closesAt = minutesToTimeLabel(end + tolerance.lateOutMinutes);
    return {
      ok: false,
      error: `Batas waktu absen pulang berakhir pada ${closesAt} (maksimal ${tolerance.lateOutMinutes} menit setelah jam pulang ${minutesToTimeLabel(end)}).`,
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
 * Jadwal harian pada/atau setelah `fromDate` yang masih memakai shift profil lama.
 * Absensi mengikuti jadwal harian (`effectiveShiftForDate`), jadi saat HRD mengganti
 * shift profil, baris jadwal yang hanya mengikuti shift bawaan lama ikut dipindah —
 * kalau tidak, shift baru tidak akan pernah terpakai untuk absen.
 */
export function schedulesMirroringProfileShift(params: {
  uid: string;
  previousShift?: ShiftCode | null;
  nextShift?: ShiftCode | null;
  fromDate: string;
  schedules: ScheduleEntry[];
}): ScheduleEntry[] {
  const { uid, previousShift, nextShift, fromDate, schedules } = params;
  if (!previousShift || !nextShift || previousShift === nextShift) return [];
  return schedules.filter(
    (sch) => sch.uid === uid && sch.shiftCode === previousShift && sch.date >= fromDate
  );
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
  const source =
    found && found.allowedShiftCodes.length > 0
      ? found.allowedShiftCodes
      : FALLBACK_DIVISION_SHIFT_CODES;
  // Shift yang sudah dihapus HRD berhenti ditawarkan untuk divisi ini.
  const allowedShiftCodes = source.filter((code) => !isBuiltinShiftHidden(code));
  if (found && allowedShiftCodes.length === source.length) return found;
  if (allowedShiftCodes.length === 0) {
    // Semua shift divisi sudah dihapus HRD: pakai shift yang masih ada di katalog.
    const remaining = allShiftTemplates().map((template) => template.code);
    return {
      division,
      allowedShiftCodes: remaining,
      defaultShiftCode: remaining[0] ?? 'REGULER',
      shiftTimes: found?.shiftTimes,
      shiftTolerances: found?.shiftTolerances,
    };
  }
  return {
    division,
    allowedShiftCodes,
    defaultShiftCode:
      found && allowedShiftCodes.includes(found.defaultShiftCode)
        ? found.defaultShiftCode
        : allowedShiftCodes[0],
    shiftTimes: found?.shiftTimes,
    shiftTolerances: found?.shiftTolerances,
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
  const toShiftName = shiftTemplateName(input.toShift);
  if (input.toShift === input.fromShift) {
    return { ok: false, error: 'Pilih shift tujuan yang berbeda dari shift Anda saat ini.' };
  }
  const rule = resolveDivisionShiftRule(input.division, input.rules);
  if (!rule.allowedShiftCodes.includes(input.toShift)) {
    const allowed = rule.allowedShiftCodes.map((code) => shiftTemplateName(code));
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

/** Jumlah hari kerja standar per bulan untuk membagi target gaji bulanan menjadi gaji per absen. */
export const DEFAULT_WORK_DAYS_TARGET = 26;

/** Menghasilkan daftar periode slip gaji terbaru (bulan berjalan + beberapa bulan sebelumnya). */
export function buildRecentPayslipPeriods(
  year: number,
  month: number,
  count = 6
): Array<{ key: string; label: string }> {
  const list: Array<{ key: string; label: string }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const d = new Date(Date.UTC(year, month - 1 - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    list.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: `${INDONESIAN_MONTHS[m - 1]} ${y}`,
    });
  }
  return list;
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

/** Menggabungkan pengaturan payroll global dengan override khusus satu karyawan. */
export function resolveEffectivePayrollSettings(
  globalSettings: PayrollSettings = DEFAULT_PAYROLL_SETTINGS,
  userConfig?: Partial<UserPayrollConfig>
): { settings: PayrollSettings; workDaysTarget: number } {
  const rawTarget = Math.round(Number(userConfig?.workDaysTarget ?? DEFAULT_WORK_DAYS_TARGET));
  const workDaysTarget =
    Number.isFinite(rawTarget) && rawTarget >= 1 && rawTarget <= 31
      ? rawTarget
      : DEFAULT_WORK_DAYS_TARGET;
  return {
    workDaysTarget,
    settings: {
      bpjsKesehatanRate: userConfig?.bpjsKesehatanRate ?? globalSettings.bpjsKesehatanRate,
      bpjsKetenagakerjaanRate:
        userConfig?.bpjsKetenagakerjaanRate ?? globalSettings.bpjsKetenagakerjaanRate,
      lateDeductionPerMinute:
        userConfig?.lateDeductionPerMinute ?? globalSettings.lateDeductionPerMinute,
      overtimeRateMode: userConfig?.overtimeRateMode ?? globalSettings.overtimeRateMode,
      overtimeHourlyMultiplier:
        userConfig?.overtimeHourlyMultiplier ?? globalSettings.overtimeHourlyMultiplier,
      overtimeSessionRate: userConfig?.overtimeSessionRate ?? globalSettings.overtimeSessionRate,
    },
  };
}

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

/** Menghitung nilai proporsional berdasar kehadiran: 0 bila tidak hadir, penuh bila tepat target. */
function prorateByAttendance(
  monthlyAmount: number,
  attendanceDays: number,
  workDaysTarget: number
): number {
  if (attendanceDays <= 0 || monthlyAmount <= 0) return 0;
  if (attendanceDays === workDaysTarget) return Math.round(monthlyAmount);
  return Math.round((monthlyAmount * attendanceDays) / workDaysTarget);
}

/**
 * Menghitung rincian slip gaji bulanan berdasarkan kehadiran aktual karyawan di kantor
 * (proporsional per absen terhadap target hari kerja, bawaan 26 hari), lembur disetujui,
 * potongan BPJS, keterlambatan, serta komponen khusus per karyawan.
 */
export function calculatePayslip(
  employee: Employee,
  periodKey: string,
  periodLabel: string,
  attendanceRecords: AttendanceRecord[],
  overtimeRequests: OvertimeRequest[],
  components: PayslipComponent[] = [],
  settings: PayrollSettings = DEFAULT_PAYROLL_SETTINGS,
  userConfig?: Partial<UserPayrollConfig>
): PayslipBreakdown {
  const { settings: effectiveSettings, workDaysTarget } = resolveEffectivePayrollSettings(
    settings,
    userConfig
  );
  const empAttendance = attendanceRecords.filter(
    (r) => r.uid === employee.uid && r.date.startsWith(periodKey)
  );
  const empOvertime = overtimeRequests.filter(
    (o) => o.uid === employee.uid && o.status === 'Disetujui' && o.date.startsWith(periodKey)
  );

  const attendanceDays = empAttendance.length;
  const dailyBaseRate = Math.round(employee.baseSalary / workDaysTarget);
  const dailyTotalRate = Math.round(
    (employee.baseSalary + employee.positionAllowance + employee.mealTransportAllowance) /
      workDaysTarget
  );
  const earnedBasePay = prorateByAttendance(employee.baseSalary, attendanceDays, workDaysTarget);
  const earnedPositionAllowance = prorateByAttendance(
    employee.positionAllowance,
    attendanceDays,
    workDaysTarget
  );
  const earnedMealAllowance = prorateByAttendance(
    employee.mealTransportAllowance,
    attendanceDays,
    workDaysTarget
  );

  const overtimeHours = empOvertime.reduce((sum, item) => sum + item.hours, 0);
  const overtimePay = empOvertime.reduce(
    (sum, item) => sum + calculateOvertimePayForRequest(item, employee.baseSalary, effectiveSettings),
    0
  );
  const lateMinutesTotal = empAttendance.reduce((sum, item) => sum + (item.lateMinutes || 0), 0);

  const lateDeduction = lateMinutesTotal * effectiveSettings.lateDeductionPerMinute;
  const hasActivity = attendanceDays > 0 || overtimePay > 0;
  const bpjsKesehatan = hasActivity
    ? Math.round(employee.baseSalary * effectiveSettings.bpjsKesehatanRate)
    : 0;
  const bpjsKetenagakerjaan = hasActivity
    ? Math.round(employee.baseSalary * effectiveSettings.bpjsKetenagakerjaanRate)
    : 0;
  const { earnings: extraEarnings, deductions: extraDeductions } = resolvePayslipComponents(
    employee,
    components
  );

  const earnings: PayslipLineItem[] = [
    {
      code: 'BASE',
      label: `Gaji Kehadiran (${attendanceDays}/${workDaysTarget} hari • ${formatRupiah(dailyBaseRate)}/hadir)`,
      amount: earnedBasePay,
      kind: 'earning',
    },
    {
      code: 'POSITION',
      label: `Tunjangan Jabatan (${attendanceDays}/${workDaysTarget} hari)`,
      amount: earnedPositionAllowance,
      kind: 'earning',
    },
    {
      code: 'MEAL',
      label: `Tunjangan Makan & Transport (${attendanceDays}/${workDaysTarget} hari)`,
      amount: earnedMealAllowance,
      kind: 'earning',
    },
  ];
  if (overtimePay > 0) {
    earnings.push({
      code: 'OVERTIME',
      label:
        effectiveSettings.overtimeRateMode === 'perSesi'
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
      label: `BPJS Kesehatan (${formatRatePercent(effectiveSettings.bpjsKesehatanRate)})`,
      amount: bpjsKesehatan,
      kind: 'deduction',
    });
  }
  if (bpjsKetenagakerjaan > 0) {
    deductions.push({
      code: 'BPJS_TK',
      label: `BPJS Ketenagakerjaan (${formatRatePercent(effectiveSettings.bpjsKetenagakerjaanRate)})`,
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
    workDaysTarget,
    dailyBaseRate,
    dailyTotalRate,
    earnedBasePay,
    earnedPositionAllowance,
    earnedMealAllowance,
    overtimeHours,
    overtimePay,
    grossPay,
    bpjsKesehatan,
    bpjsKetenagakerjaan,
    lateMinutesTotal,
    lateDeduction,
    totalDeductions,
    netPay,
    attendanceDays,
    earnings,
    deductions,
    overtimeRateMode: effectiveSettings.overtimeRateMode,
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

export interface StaffDutyInfo {
  mySchedule: ScheduleEntry | null;
  shiftCode: ShiftCode;
  isBackup: boolean;
  replacedName?: string;
  dutyPartners: Employee[];
  backupStaff: Employee | null;
}

/**
 * Mencari informasi tugas jaga untuk staf tertentu pada suatu tanggal:
 * - Rekan kerja yang bertugas bersama di shift yang sama.
 * - Staf cadangan (backup) untuk shift tersebut.
 * - Status apakah staf login bertugas sebagai staf utama atau backup.
 */
export function getStaffDutyInfo(params: {
  uid: string;
  date: string;
  schedules: ScheduleEntry[];
  employees: Employee[];
  fallbackShift: ShiftCode;
}): StaffDutyInfo {
  const { uid, date, schedules, employees, fallbackShift } = params;
  const user = employees.find((e) => e.uid === uid);
  const mySchedule = schedules.find((s) => s.uid === uid && s.date === date) ?? null;
  const shiftCode = mySchedule?.shiftCode ?? fallbackShift;
  const isBackup = Boolean(mySchedule?.isBackup);
  const division = user?.division;

  // Jadwal di shift & tanggal yang sama (divisi sama jika ada)
  const sameShiftSchedules = schedules.filter((s) => {
    if (s.date !== date || s.shiftCode !== shiftCode) return false;
    if (division) {
      const emp = employees.find((e) => e.uid === s.uid);
      if (emp && emp.division !== division) return false;
    }
    return true;
  });

  const dutyPartners: Employee[] = [];
  let backupStaff: Employee | null = null;

  for (const s of sameShiftSchedules) {
    const emp = employees.find((e) => e.uid === s.uid);
    if (!emp) continue;
    if (s.isBackup) {
      if (!backupStaff) backupStaff = emp;
    } else {
      if (s.uid !== uid) {
        dutyPartners.push(emp);
      }
    }
  }

  return {
    mySchedule,
    shiftCode,
    isBackup,
    replacedName: mySchedule?.replacedName,
    dutyPartners,
    backupStaff,
  };
}

export interface ShiftRoster {
  shiftCode: ShiftCode;
  division: string;
  primaryStaff: Employee[];
  backupStaff: Employee | null;
  entries: ScheduleEntry[];
}

/**
 * Mengelompokkan seluruh penugasan jaga pada suatu tanggal per shift & divisi.
 */
export function getShiftRostersForDate(params: {
  date: string;
  division?: string;
  schedules: ScheduleEntry[];
  employees: Employee[];
}): ShiftRoster[] {
  const { date, division, schedules, employees } = params;
  const relevant = schedules.filter((s) => {
    if (s.date !== date) return false;
    if (division) {
      const emp = employees.find((e) => e.uid === s.uid);
      if (emp && emp.division !== division) return false;
    }
    return true;
  });

  const groups = new Map<string, { shiftCode: ShiftCode; division: string; entries: ScheduleEntry[] }>();

  for (const s of relevant) {
    const emp = employees.find((e) => e.uid === s.uid);
    const div = emp?.division || division || 'Umum';
    const key = `${div}__${s.shiftCode}`;
    if (!groups.has(key)) {
      groups.set(key, { shiftCode: s.shiftCode, division: div, entries: [] });
    }
    groups.get(key)!.entries.push(s);
  }

  const rosters: ShiftRoster[] = [];
  for (const group of groups.values()) {
    const primaryStaff: Employee[] = [];
    let backupStaff: Employee | null = null;
    for (const ent of group.entries) {
      const emp = employees.find((e) => e.uid === ent.uid);
      if (!emp) continue;
      if (ent.isBackup) {
        if (!backupStaff) backupStaff = emp;
      } else {
        primaryStaff.push(emp);
      }
    }
    rosters.push({
      shiftCode: group.shiftCode,
      division: group.division,
      primaryStaff,
      backupStaff,
      entries: group.entries,
    });
  }

  return rosters;
}

export interface ScheduleGapWarning {
  date: string;
  division: string;
  shiftCode?: ShiftCode;
  type: 'no_schedule' | 'no_backup';
  message: string;
}

/**
 * Memeriksa peringatan bila ada jadwal yang belum dibuat atau belum ada staf backup:
 * - Divisi tidak memiliki satupun jadwal kerja pada tanggal tertentu.
 * - Shift pada tanggal tertentu memiliki staf jaga tetapi belum ada staf backup (cadangan).
 */
export function checkScheduleGaps(params: {
  divisions: string[];
  employees: Employee[];
  schedules: ScheduleEntry[];
  startDate: string; // YYYY-MM-DD
  daysCount?: number; // bawaan: 7 hari ke depan
}): ScheduleGapWarning[] {
  const { divisions, employees, schedules, startDate, daysCount = 7 } = params;
  const warnings: ScheduleGapWarning[] = [];
  const start = new Date(`${startDate}T00:00:00`);

  for (let i = 0; i < daysCount; i += 1) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

    for (const div of divisions) {
      const activeDivEmployees = employees.filter((e) => e.division === div && e.active);
      if (activeDivEmployees.length === 0) continue;

      const divSchedulesOnDate = schedules.filter((s) => {
        if (s.date !== isoDate) return false;
        const emp = employees.find((e) => e.uid === s.uid);
        return emp && emp.division === div;
      });

      if (divSchedulesOnDate.length === 0) {
        warnings.push({
          date: isoDate,
          division: div,
          type: 'no_schedule',
          message: `Divisi ${div} belum memiliki jadwal kerja untuk ${isoDate}.`,
        });
      } else {
        // Cek apakah ada shift yang tidak memiliki backup
        const shiftMap = new Map<ShiftCode, ScheduleEntry[]>();
        for (const s of divSchedulesOnDate) {
          if (!shiftMap.has(s.shiftCode)) shiftMap.set(s.shiftCode, []);
          shiftMap.get(s.shiftCode)!.push(s);
        }
        for (const [code, entries] of shiftMap.entries()) {
          const hasBackup = entries.some((e) => e.isBackup === true);
          if (!hasBackup) {
            warnings.push({
              date: isoDate,
              division: div,
              shiftCode: code,
              type: 'no_backup',
              message: `Jadwal shift ${code} divisi ${div} pada ${isoDate} belum memiliki staf backup (cadangan).`,
            });
          }
        }
      }
    }
  }

  return warnings;
}

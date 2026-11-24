import type {
  AttendanceRecord,
  Division,
  Employee,
  OvertimeRequest,
  PayslipBreakdown,
  ShiftCode,
  ShiftTemplate,
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
};

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
 * Validates standard email format for simplified email-based employee onboarding.
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
export function getWibComponents(date: Date = new Date()) {
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

/**
 * Calculates lateness in minutes relative to shift start + tolerance.
 */
export function calculateLateMinutes(clockInTime: string, shiftCode: ShiftCode): number {
  const shift = SHIFT_TEMPLATES[shiftCode] ?? SHIFT_TEMPLATES.REGULER;
  const actual = timeToMinutes(clockInTime);
  const scheduled = timeToMinutes(shift.startTime);
  const diff = actual - scheduled;
  if (diff <= shift.toleranceMinutes) return 0;
  return diff;
}

/**
 * Calculates work duration in minutes (handles overnight shifts cleanly).
 */
export function calculateWorkMinutes(clockInTime: string, clockOutTime: string): number {
  const inMin = timeToMinutes(clockInTime);
  let outMin = timeToMinutes(clockOutTime);
  if (outMin < inMin) {
    outMin += 24 * 60;
  }
  return Math.max(0, outMin - inMin);
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

/**
 * Computes monthly payslip breakdown from employee profile, attendance logs, and approved overtime.
 */
export function calculatePayslip(
  employee: Employee,
  periodKey: string,
  periodLabel: string,
  attendanceRecords: AttendanceRecord[],
  overtimeRequests: OvertimeRequest[]
): PayslipBreakdown {
  const empAttendance = attendanceRecords.filter(
    (r) => r.uid === employee.uid && r.date.startsWith(periodKey)
  );
  const empOvertime = overtimeRequests.filter(
    (o) => o.uid === employee.uid && o.status === 'Disetujui' && o.date.startsWith(periodKey)
  );

  const overtimeHours = empOvertime.reduce((sum, item) => sum + item.hours, 0);
  const overtimePay = empOvertime.reduce((sum, item) => sum + item.estimatedPay, 0);
  const lateMinutesTotal = empAttendance.reduce((sum, item) => sum + (item.lateMinutes || 0), 0);

  const lateDeduction = lateMinutesTotal * 1000;
  const bpjsKesehatan = Math.round(employee.baseSalary * 0.01);
  const bpjsKetenagakerjaan = Math.round(employee.baseSalary * 0.02);

  const grossPay =
    employee.baseSalary +
    employee.positionAllowance +
    employee.mealTransportAllowance +
    overtimePay;
  const totalDeductions = bpjsKesehatan + bpjsKetenagakerjaan + lateDeduction;
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
  };
}

/**
 * Builds a clean CSV export string for HRD attendance recap (GPS & Live Camera verified).
 */
export function buildAttendanceCsv(records: AttendanceRecord[]): string {
  const headers = [
    'Tanggal',
    'NIK',
    'Nama Karyawan',
    'Divisi',
    'Shift',
    'Jam Masuk',
    'Jam Pulang',
    'Terlambat (Menit)',
    'Durasi Kerja (Menit)',
    'Status',
    'Kamera Live',
    'Lokasi Masuk',
    'Koordinat Masuk',
  ];
  const escape = (val: string | number | undefined) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = records.map((r) => [
    r.date,
    r.nik,
    r.employeeName,
    r.division,
    r.shiftCode,
    r.clockInTime || '-',
    r.clockOutTime || '-',
    r.lateMinutes,
    r.workMinutes,
    r.status,
    r.clockInPhotoVerified ? 'Terverifikasi' : '-',
    r.clockInAddress || '-',
    `${r.clockInLat.toFixed(5)}, ${r.clockInLng.toFixed(5)}`,
  ]);
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
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

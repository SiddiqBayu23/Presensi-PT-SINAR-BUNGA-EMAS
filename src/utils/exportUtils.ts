import type {
  AttendanceRecord,
  Employee,
  ExitClearanceRequest,
  LeaveRequest,
  OvertimeRequest,
  PayrollSettings,
  PayslipComponent,
  ScheduleEntry,
  ShiftSwapRequest,
  UserRole,
} from '../types/hris';
import { DEFAULT_PAYROLL_SETTINGS, calculatePayslip, formatRupiah } from './hrisLogic';

/** MIME SpreadsheetML; dipakai semua unduhan agar Excel langsung membuka berkas .xls. */
export const EXCEL_MIME = 'application/vnd.ms-excel;charset=utf-8;';

/** Label peran pada berkas ekspor (3 peran aplikasi). */
const ROLE_EXPORT_LABELS: Record<UserRole, string> = {
  hrd: 'HRD Admin',
  supervisor: 'Supervisor',
  employee: 'Karyawan',
};

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

function xmlEscape(val: string | number | boolean | undefined | null): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderExcelWorksheet(sheet: ExcelSheet): string {
  const safeName = xmlEscape(sheet.name.slice(0, 31));
  const headerCells = sheet.headers
    .map((h) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`)
    .join('');
  const bodyRows = sheet.rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          const isNum = typeof cell === 'number' && Number.isFinite(cell);
          return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('\n');

  return `<Worksheet ss:Name="${safeName}">
<Table>
<Row>${headerCells}</Row>
${bodyRows}
</Table>
</Worksheet>`;
}

/**
 * Membungkus satu atau beberapa worksheet menjadi workbook SpreadsheetML (.xls)
 * yang dapat dibuka Microsoft Excel / Google Sheets tanpa dialog impor.
 */
export function renderExcelWorkbook(sheets: ExcelSheet[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Header">
    <Font ss:Bold="1" ss:Color="#FFFFFF"/>
    <Interior ss:Color="#0B2453" ss:Pattern="Solid"/>
  </Style>
</Styles>
${sheets.map(renderExcelWorksheet).join('\n')}
</Workbook>`;
}

export function buildAttendanceExcel(records: AttendanceRecord[]): string {
  return renderExcelWorkbook([
    {
      name: 'Absensi',
      headers: [
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
      ],
      rows: records.map((r) => [
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
      ]),
    },
  ]);
}

export function buildEmployeesExcel(employees: Employee[]): string {
  return renderExcelWorkbook([
    {
      name: 'Karyawan',
      headers: [
        'NIK',
        'Nama Lengkap',
        'Jabatan',
        'Divisi',
        'Peran',
        'Shift',
        'Email',
        'No HP',
        'Tanggal Gabung',
        'Jenis Kontrak',
        'Akhir Kontrak',
        'Kontrak Ditandatangani',
        'Gaji Pokok',
        'Tunjangan Jabatan',
        'Tunjangan Makan & Transport',
        'Sisa Cuti',
        'Status Aktif',
      ],
      rows: employees.map((e) => [
        e.nik,
        e.name,
        e.position,
        e.division,
        ROLE_EXPORT_LABELS[e.role] ?? 'Karyawan',
        e.shiftCode,
        e.email,
        e.phone,
        e.joinDate,
        e.contractType,
        e.contractEnd,
        e.contractSigned ? 'Sudah' : 'Belum',
        e.baseSalary,
        e.positionAllowance,
        e.mealTransportAllowance,
        e.leaveQuota,
        e.active ? 'Aktif' : 'Nonaktif',
      ]),
    },
  ]);
}

export function buildLeavesExcel(leaves: LeaveRequest[]): string {
  return renderExcelWorkbook([
    {
      name: 'Izin dan Cuti',
      headers: [
        'ID',
        'NIK',
        'Nama Karyawan',
        'Divisi',
        'Jenis',
        'Tanggal Mulai',
        'Tanggal Selesai',
        'Jumlah Hari',
        'Alasan',
        'Status',
        'Diajukan Pada',
        'Diproses Oleh',
      ],
      rows: leaves.map((l) => [
        l.id,
        l.nik,
        l.employeeName,
        l.division,
        l.type,
        l.startDate,
        l.endDate,
        l.days,
        l.reason,
        l.status,
        l.createdLabel,
        l.reviewedBy || '-',
      ]),
    },
  ]);
}

export function buildOvertimesExcel(overtimes: OvertimeRequest[]): string {
  return renderExcelWorkbook([
    {
      name: 'Lembur',
      headers: [
        'ID',
        'NIK',
        'Nama Karyawan',
        'Divisi',
        'Tanggal',
        'Jam Mulai',
        'Jam Selesai',
        'Durasi (Jam)',
        'Estimasi Insentif (Rp)',
        'Uraian Pekerjaan',
        'Status',
        'Diproses Oleh',
      ],
      rows: overtimes.map((o) => [
        o.id,
        o.nik,
        o.employeeName,
        o.division,
        o.date,
        o.startTime,
        o.endTime,
        o.hours,
        o.estimatedPay,
        o.reason,
        o.status,
        o.reviewedBy || '-',
      ]),
    },
  ]);
}

export function buildShiftSwapsExcel(swaps: ShiftSwapRequest[]): string {
  return renderExcelWorkbook([
    {
      name: 'Tukar Shift',
      headers: [
        'ID',
        'NIK',
        'Nama Karyawan',
        'Divisi',
        'Tanggal Efektif',
        'Shift Asal',
        'Shift Tujuan',
        'Alasan',
        'Status',
        'Diajukan Pada',
        'Diproses Oleh',
      ],
      rows: swaps.map((s) => [
        s.id,
        s.nik,
        s.employeeName,
        s.division,
        s.date,
        s.fromShift,
        s.toShift,
        s.reason,
        s.status,
        s.createdLabel,
        s.reviewedBy || '-',
      ]),
    },
  ]);
}

export function buildExitClearancesExcel(exits: ExitClearanceRequest[]): string {
  return renderExcelWorkbook([
    {
      name: 'Exit Clearance',
      headers: [
        'ID',
        'NIK',
        'Nama Karyawan',
        'Jabatan',
        'Divisi',
        'Hari Kerja Terakhir',
        'Alasan',
        'Checklist Selesai',
        'Status',
        'Diajukan Pada',
        'Diproses Oleh',
      ],
      rows: exits.map((ex) => {
        const done = ex.checklist.filter((c) => c.cleared).length;
        return [
          ex.id,
          ex.nik,
          ex.employeeName,
          ex.position,
          ex.division,
          ex.lastWorkingDate,
          ex.reason,
          `${done}/${ex.checklist.length}`,
          ex.status,
          ex.createdLabel,
          ex.reviewedBy || '-',
        ];
      }),
    },
  ]);
}

export function buildSchedulesExcel(schedules: ScheduleEntry[]): string {
  return renderExcelWorkbook([
    {
      name: 'Jadwal',
      headers: ['ID', 'NIK', 'Tanggal', 'Shift', 'Lokasi Penugasan', 'Catatan', 'Status Tugas'],
      rows: schedules.map((s) => [
        s.id,
        s.nik,
        s.date,
        s.shiftCode,
        s.location,
        s.notes || '-',
        s.patrolCompleted ? 'Selesai' : 'Terjadwal',
      ]),
    },
  ]);
}

export function buildPayrollRecapExcel(
  employees: Employee[],
  periodKey: string,
  periodLabel: string,
  attendance: AttendanceRecord[],
  overtimes: OvertimeRequest[],
  components: PayslipComponent[] = [],
  settings: PayrollSettings = DEFAULT_PAYROLL_SETTINGS
): string {
  return renderExcelWorkbook([
    {
      name: 'Rekap Gaji',
      headers: [
        'Periode',
        'NIK',
        'Nama Karyawan',
        'Divisi',
        'Hari Hadir',
        'Gaji Pokok',
        'Tunjangan Jabatan',
        'Tunjangan Makan & Transport',
        'Jam Lembur Disetujui',
        'Insentif Lembur',
        'Total Penerimaan',
        'BPJS Kesehatan (1%)',
        'BPJS TK JHT (2%)',
        'Potongan Terlambat',
        'Total Potongan',
        'Take Home Pay',
      ],
      rows: employees.map((emp) => {
        const slip = calculatePayslip(
          emp,
          periodKey,
          periodLabel,
          attendance,
          overtimes,
          components,
          settings
        );
        return [
          slip.periodLabel,
          emp.nik,
          emp.name,
          emp.division,
          slip.attendanceDays,
          slip.baseSalary,
          slip.positionAllowance,
          slip.mealTransportAllowance,
          slip.overtimeHours,
          slip.overtimePay,
          slip.grossPay,
          slip.bpjsKesehatan,
          slip.bpjsKetenagakerjaan,
          slip.lateDeduction,
          slip.totalDeductions,
          slip.netPay,
        ];
      }),
    },
  ]);
}

export interface FullExportDataset {
  exportedAtWib: string;
  periodKey: string;
  periodLabel: string;
  scopeLabel: string;
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  overtimes: OvertimeRequest[];
  shiftSwaps: ShiftSwapRequest[];
  exitClearances: ExitClearanceRequest[];
  schedules: ScheduleEntry[];
  /** Komponen gaji buatan HRD (BPJS, kasbon, tunjangan) agar rekap sama dengan slip karyawan. */
  payslipComponents?: PayslipComponent[];
  payrollSettings?: PayrollSettings;
}

/**
 * Generates a single Microsoft Excel SpreadsheetML (.xls) workbook containing
 * ALL HRIS & Attendance result tables across 7 dedicated worksheets.
 */
export function buildExcelWorkbookXml(data: FullExportDataset): string {
  const payrollRows = data.employees.map((emp) => {
    const slip = calculatePayslip(
      emp,
      data.periodKey,
      data.periodLabel,
      data.attendance,
      data.overtimes,
      data.payslipComponents ?? [],
      data.payrollSettings ?? DEFAULT_PAYROLL_SETTINGS
    );
    return [
      slip.periodLabel,
      emp.nik,
      emp.name,
      emp.division,
      slip.attendanceDays,
      slip.baseSalary,
      slip.positionAllowance,
      slip.mealTransportAllowance,
      slip.overtimeHours,
      slip.overtimePay,
      slip.grossPay,
      slip.totalDeductions,
      slip.netPay,
      formatRupiah(slip.netPay),
    ];
  });

  const sheets: ExcelSheet[] = [
    {
      name: 'Absensi',
      headers: [
        'Tanggal',
        'NIK',
        'Nama',
        'Divisi',
        'Shift',
        'Jam Masuk',
        'Jam Pulang',
        'Terlambat (Mnt)',
        'Durasi Kerja (Mnt)',
        'Status',
        'Kamera Live',
        'Lokasi Masuk',
      ],
      rows: data.attendance.map((r) => [
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
      ]),
    },
    {
      name: 'Karyawan',
      headers: [
        'NIK',
        'Nama',
        'Jabatan',
        'Divisi',
        'Shift',
        'Kontrak',
        'Tanggal Gabung',
        'Sisa Cuti',
        'Gaji Pokok',
        'Email',
        'No HP',
      ],
      rows: data.employees.map((e) => [
        e.nik,
        e.name,
        e.position,
        e.division,
        e.shiftCode,
        e.contractType,
        e.joinDate,
        e.leaveQuota,
        e.baseSalary,
        e.email,
        e.phone,
      ]),
    },
    {
      name: 'Rekap Gaji',
      headers: [
        'Periode',
        'NIK',
        'Nama',
        'Divisi',
        'Hari Hadir',
        'Gaji Pokok',
        'Tunj. Jabatan',
        'Tunj. Makan/Transp',
        'Lembur (Jam)',
        'Insentif Lembur',
        'Gaji Kotor',
        'Total Potongan',
        'Take Home Pay',
        'Format Rupiah',
      ],
      rows: payrollRows,
    },
    {
      name: 'Izin dan Cuti',
      headers: ['ID', 'NIK', 'Nama', 'Divisi', 'Jenis', 'Mulai', 'Selesai', 'Hari', 'Alasan', 'Status'],
      rows: data.leaves.map((l) => [
        l.id,
        l.nik,
        l.employeeName,
        l.division,
        l.type,
        l.startDate,
        l.endDate,
        l.days,
        l.reason,
        l.status,
      ]),
    },
    {
      name: 'Lembur',
      headers: ['ID', 'NIK', 'Nama', 'Divisi', 'Tanggal', 'Mulai', 'Selesai', 'Jam', 'Insentif (Rp)', 'Alasan', 'Status'],
      rows: data.overtimes.map((o) => [
        o.id,
        o.nik,
        o.employeeName,
        o.division,
        o.date,
        o.startTime,
        o.endTime,
        o.hours,
        o.estimatedPay,
        o.reason,
        o.status,
      ]),
    },
    {
      name: 'Tukar Shift',
      headers: ['ID', 'NIK', 'Nama', 'Divisi', 'Tanggal', 'Dari Shift', 'Ke Shift', 'Alasan', 'Status'],
      rows: data.shiftSwaps.map((s) => [
        s.id,
        s.nik,
        s.employeeName,
        s.division,
        s.date,
        s.fromShift,
        s.toShift,
        s.reason,
        s.status,
      ]),
    },
    {
      name: 'Exit Clearance',
      headers: ['ID', 'NIK', 'Nama', 'Divisi', 'Hari Terakhir', 'Checklist', 'Alasan', 'Status'],
      rows: data.exitClearances.map((ex) => [
        ex.id,
        ex.nik,
        ex.employeeName,
        ex.division,
        ex.lastWorkingDate,
        `${ex.checklist.filter((c) => c.cleared).length}/${ex.checklist.length}`,
        ex.reason,
        ex.status,
      ]),
    },
  ];

  return renderExcelWorkbook(sheets);
}

/**
 * Generates a complete JSON export archive of all HRIS records and payroll recap.
 */
export function buildFullJsonExport(data: FullExportDataset): string {
  const payrollSummary = data.employees.map((emp) => ({
    nik: emp.nik,
    name: emp.name,
    division: emp.division,
    ...calculatePayslip(
      emp,
      data.periodKey,
      data.periodLabel,
      data.attendance,
      data.overtimes,
      data.payslipComponents ?? [],
      data.payrollSettings ?? DEFAULT_PAYROLL_SETTINGS
    ),
  }));

  const payload = {
    company: 'PT Sinar Bunga Mas (One Stop Business Services)',
    exportedAtWib: data.exportedAtWib,
    scope: data.scopeLabel,
    payrollPeriod: data.periodLabel,
    totals: {
      employees: data.employees.length,
      attendance: data.attendance.length,
      leaves: data.leaves.length,
      overtimes: data.overtimes.length,
      shiftSwaps: data.shiftSwaps.length,
      exitClearances: data.exitClearances.length,
      schedules: data.schedules.length,
    },
    data: {
      employees: data.employees,
      attendance: data.attendance,
      leaves: data.leaves,
      overtimes: data.overtimes,
      shiftSwaps: data.shiftSwaps,
      exitClearances: data.exitClearances,
      schedules: data.schedules,
      payrollSummary,
    },
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Triggers a browser file download cleanly for any text/XML/CSV/JSON export.
 */
export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
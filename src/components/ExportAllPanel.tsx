import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Printer,
  Timer,
  Users,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
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
  downloadTextFile,
  type FullExportDataset,
} from '../utils/exportUtils';
import { calculatePayslip, formatRupiah } from '../utils/hrisLogic';

interface ExportAllPanelProps {
  scope: 'all' | 'self';
  onExportDone?: (message: string) => void;
}

const EXPORT_PERIODS = [
  { key: '2026-11', label: 'November 2026' },
  { key: '2026-10', label: 'Oktober 2026' },
  { key: '2026-09', label: 'September 2026' },
];

export function ExportAllPanel({ scope, onExportDone }: ExportAllPanelProps) {
  const {
    currentUser,
    employees,
    attendance,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    schedules,
    wibNow,
  } = useHris();

  const [period, setPeriod] = useState(EXPORT_PERIODS[0]);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const dataset = useMemo<FullExportDataset>(() => {
    const isSelf = scope === 'self' && currentUser;
    const scopedEmployees = isSelf ? [currentUser] : employees;
    const scopedAttendance = isSelf
      ? attendance.filter((a) => a.uid === currentUser.uid)
      : attendance;
    const scopedLeaves = isSelf ? leaves.filter((l) => l.uid === currentUser.uid) : leaves;
    const scopedOvertimes = isSelf
      ? overtimes.filter((o) => o.uid === currentUser.uid)
      : overtimes;
    const scopedShiftSwaps = isSelf
      ? shiftSwaps.filter((s) => s.uid === currentUser.uid)
      : shiftSwaps;
    const scopedExits = isSelf
      ? exitClearances.filter((e) => e.uid === currentUser.uid)
      : exitClearances;
    const scopedSchedules = isSelf
      ? schedules.filter((s) => s.uid === currentUser.uid)
      : schedules;

    return {
      exportedAtWib: `${wibNow.isoDate} ${wibNow.timeFull} WIB`,
      periodKey: period.key,
      periodLabel: period.label,
      scopeLabel: isSelf
        ? `Data Pribadi — ${currentUser.name} (${currentUser.nik})`
        : 'Seluruh Perusahaan (HRD PT Sinar Bunga Mas)',
      employees: scopedEmployees,
      attendance: scopedAttendance,
      leaves: scopedLeaves,
      overtimes: scopedOvertimes,
      shiftSwaps: scopedShiftSwaps,
      exitClearances: scopedExits,
      schedules: scopedSchedules,
    };
  }, [
    attendance,
    currentUser,
    employees,
    exitClearances,
    leaves,
    overtimes,
    period.key,
    period.label,
    schedules,
    scope,
    shiftSwaps,
    wibNow.isoDate,
    wibNow.timeFull,
  ]);

  const payrollPreview = useMemo(
    () =>
      dataset.employees.map((emp) => ({
        emp,
        slip: calculatePayslip(
          emp,
          dataset.periodKey,
          dataset.periodLabel,
          dataset.attendance,
          dataset.overtimes
        ),
      })),
    [dataset]
  );

  const notify = (msg: string) => {
    setLastExport(msg);
    onExportDone?.(msg);
  };

  const prefix =
    scope === 'self' && currentUser ? `sbum-${currentUser.nik.toLowerCase()}` : 'sbum-semua';

  const handleExportAllExcel = () => {
    const xml = buildExcelWorkbookXml(dataset);
    const filename = `${prefix}-laporan-lengkap-${wibNow.isoDate}.xls`;
    downloadTextFile(filename, xml, 'application/vnd.ms-excel;charset=utf-8;');
    notify(`Berhasil export semua hasil ke Excel (${filename} • 7 sheet).`);
  };

  const handleExportAllJson = () => {
    const json = buildFullJsonExport(dataset);
    const filename = `${prefix}-backup-lengkap-${wibNow.isoDate}.json`;
    downloadTextFile(filename, json, 'application/json;charset=utf-8;');
    notify(`Berhasil export arsip lengkap JSON (${filename}).`);
  };

  const handlePrintPdf = () => {
    notify('Membuka dialog cetak / simpan PDF laporan lengkap...');
    window.print();
  };

  const individualModules: Array<{
    id: string;
    title: string;
    countLabel: string;
    description: string;
    icon: React.ReactNode;
    onExport: () => void;
  }> = [
    {
      id: 'absensi',
      title: 'Rekap Absensi',
      countLabel: `${dataset.attendance.length} catatan`,
      description: 'Jam masuk/pulang, GPS, verifikasi kamera live, dan status keterlambatan',
      icon: <ClipboardCheck className="w-4 h-4 text-[#0B2453]" />,
      onExport: () => {
        const file = `${prefix}-absensi-${wibNow.isoDate}.csv`;
        downloadTextFile(
          file,
          buildAttendanceCsvWithBom(dataset.attendance),
          'text/csv;charset=utf-8;'
        );
        notify(`CSV Rekap Absensi diunduh (${file}).`);
      },
    },
    {
      id: 'payroll',
      title: `Rekap Gaji (${period.label})`,
      countLabel: `${dataset.employees.length} karyawan`,
      description: 'Gaji pokok, tunjangan, lembur disetujui, BPJS, potongan, Take Home Pay',
      icon: <Banknote className="w-4 h-4 text-emerald-700" />,
      onExport: () => {
        const file = `${prefix}-payroll-${period.key}.csv`;
        downloadTextFile(
          file,
          buildPayrollRecapCsv(
            dataset.employees,
            dataset.periodKey,
            dataset.periodLabel,
            dataset.attendance,
            dataset.overtimes
          ),
          'text/csv;charset=utf-8;'
        );
        notify(`CSV Rekap Gaji ${period.label} diunduh (${file}).`);
      },
    },
    {
      id: 'karyawan',
      title: 'Data Karyawan',
      countLabel: `${dataset.employees.length} profil`,
      description: 'NIK, email akun, jabatan, divisi, shift, kontrak PKO/PKWT, dan sisa cuti',
      icon: <Users className="w-4 h-4 text-[#0B2453]" />,
      onExport: () => {
        const file = `${prefix}-karyawan-${wibNow.isoDate}.csv`;
        downloadTextFile(file, buildEmployeesCsv(dataset.employees), 'text/csv;charset=utf-8;');
        notify(`CSV Data Karyawan diunduh (${file}).`);
      },
    },
    {
      id: 'izin',
      title: 'Pengajuan Izin & Cuti',
      countLabel: `${dataset.leaves.length} pengajuan`,
      description: 'Cuti tahunan, izin sakit, rentang tanggal, alasan, dan status approval',
      icon: <FileText className="w-4 h-4 text-sky-700" />,
      onExport: () => {
        const file = `${prefix}-izin-cuti-${wibNow.isoDate}.csv`;
        downloadTextFile(file, buildLeavesCsv(dataset.leaves), 'text/csv;charset=utf-8;');
        notify(`CSV Izin & Cuti diunduh (${file}).`);
      },
    },
    {
      id: 'lembur',
      title: 'Pengajuan Lembur (SPL)',
      countLabel: `${dataset.overtimes.length} pengajuan`,
      description: 'Tanggal, jam lembur, durasi, estimasi insentif Rp, dan status',
      icon: <Timer className="w-4 h-4 text-indigo-700" />,
      onExport: () => {
        const file = `${prefix}-lembur-${wibNow.isoDate}.csv`;
        downloadTextFile(file, buildOvertimesCsv(dataset.overtimes), 'text/csv;charset=utf-8;');
        notify(`CSV Lembur diunduh (${file}).`);
      },
    },
    {
      id: 'shift',
      title: 'Tukar Shift & Jadwal',
      countLabel: `${dataset.shiftSwaps.length} tukar · ${dataset.schedules.length} jadwal`,
      description: 'Riwayat pengajuan tukar shift dan jadwal penugasan harian',
      icon: <CalendarDays className="w-4 h-4 text-amber-700" />,
      onExport: () => {
        const file = `${prefix}-tukar-shift-${wibNow.isoDate}.csv`;
        downloadTextFile(file, buildShiftSwapsCsv(dataset.shiftSwaps), 'text/csv;charset=utf-8;');
        const schFile = `${prefix}-jadwal-${wibNow.isoDate}.csv`;
        downloadTextFile(schFile, buildSchedulesCsv(dataset.schedules), 'text/csv;charset=utf-8;');
        notify(`CSV Tukar Shift & Jadwal diunduh.`);
      },
    },
    {
      id: 'exit',
      title: 'Exit Clearance',
      countLabel: `${dataset.exitClearances.length} dokumen`,
      description: 'Tanggal kerja terakhir, progres checklist departemen, dan status final',
      icon: <FileText className="w-4 h-4 text-rose-700" />,
      onExport: () => {
        const file = `${prefix}-exit-clearance-${wibNow.isoDate}.csv`;
        downloadTextFile(
          file,
          buildExitClearancesCsv(dataset.exitClearances),
          'text/csv;charset=utf-8;'
        );
        notify(`CSV Exit Clearance diunduh (${file}).`);
      },
    },
  ];

  return (
    <div className="space-y-5">
      {/* All-in-One Master Export Card */}
      <section
        aria-labelledby="export-all-heading"
        className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/80 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2
                id="export-all-heading"
                className="text-base sm:text-lg font-extrabold text-[#0B2453]"
              >
                {scope === 'all'
                  ? 'Export Semua Hasil & Laporan HRIS'
                  : 'Export Semua Data Pribadi Anda'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Cakupan: <strong className="text-[#0B2453]">{dataset.scopeLabel}</strong> &bull;
              Siap dibuka di Microsoft Excel, Google Sheets, atau arsip PDF/JSON.
            </p>
          </div>

          <div className="no-print flex items-center gap-2 shrink-0">
            <label htmlFor="export-period-select" className="text-xs font-bold text-slate-600">
              Periode Gaji:
            </label>
            <select
              id="export-period-select"
              value={period.key}
              onChange={(e) => {
                const found = EXPORT_PERIODS.find((p) => p.key === e.target.value);
                if (found) setPeriod(found);
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B2453] focus:border-[#0B2453] focus:outline-none"
            >
              {EXPORT_PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3 Primary All-in-One Export Actions */}
        <div className="no-print grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={handleExportAllExcel}
            className="h-12 px-4 rounded-2xl bg-gradient-to-r from-[#0B2453] to-[#163A7A] hover:brightness-110 text-white text-xs sm:text-sm font-extrabold shadow-md inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#F3CA62] shrink-0" />
            <span className="whitespace-nowrap">Export Semua (Excel 7 Sheet)</span>
          </button>

          <button
            type="button"
            onClick={handleExportAllJson}
            className="h-12 px-4 rounded-2xl bg-gradient-to-r from-[#D4A424] to-[#A6760B] hover:brightness-105 text-white text-xs sm:text-sm font-extrabold shadow-md inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <FileJson className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Export Semua (JSON Backup)</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="h-12 px-4 rounded-2xl border border-[#0B2453]/25 bg-[#F8FAFD] hover:bg-[#EEF4FC] text-[#0B2453] text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Cetak / Simpan PDF</span>
          </button>
        </div>

        {lastExport && (
          <div
            role="status"
            data-testid="export-status-banner"
            className="no-print rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{lastExport}</span>
          </div>
        )}
      </section>

      {/* Per-Module Individual CSV Exports */}
      <section
        aria-label="Export CSV Per Modul"
        className="no-print rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
            Export CSV Per Kategori
          </h3>
          <span className="text-xs text-slate-500">UTF-8 Excel Ready</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {individualModules.map((mod) => (
            <div
              key={mod.id}
              className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-3.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  {mod.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="text-xs sm:text-sm font-bold text-[#0B2453]">{mod.title}</span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      &bull; {mod.countLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{mod.description}</p>
                </div>
              </div>

              <button
                type="button"
                aria-label={`Unduh CSV ${mod.title}`}
                onClick={mod.onExport}
                className="shrink-0 h-9 px-3 rounded-xl bg-white hover:bg-[#0B2453] hover:text-white border border-slate-200 text-[#0B2453] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Printable Executive Summary */}
      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
              Ringkasan Laporan Payroll &amp; Kehadiran ({dataset.periodLabel})
            </h3>
            <p className="text-[11px] text-slate-500 font-mono tabular-nums">
              PT Sinar Bunga Mas &bull; Dicetak {dataset.exportedAtWib}
            </p>
          </div>
          <div className="text-xs font-extrabold text-[#0B2453] font-mono tabular-nums">
            Total Take Home Pay:{' '}
            <span className="text-emerald-700">
              {formatRupiah(payrollPreview.reduce((sum, p) => sum + p.slip.netPay, 0))}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 whitespace-nowrap">NIK</th>
                <th className="py-2 pr-3 whitespace-nowrap">Nama &amp; Divisi</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Hadir</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Lembur</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Potongan</th>
                <th className="py-2 text-right whitespace-nowrap">Take Home Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payrollPreview.map(({ emp, slip }) => (
                <tr key={emp.uid}>
                  <td className="py-2.5 pr-3 font-mono font-bold text-[#0B2453] whitespace-nowrap">
                    {emp.nik}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-bold text-slate-900">{emp.name}</span>
                    <span className="text-slate-500"> &bull; {emp.division}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                    {slip.attendanceDays} hr
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                    {formatRupiah(slip.overtimePay)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                    {formatRupiah(slip.totalDeductions)}
                  </td>
                  <td className="py-2.5 text-right font-mono font-extrabold text-[#0B2453] tabular-nums whitespace-nowrap">
                    {formatRupiah(slip.netPay)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

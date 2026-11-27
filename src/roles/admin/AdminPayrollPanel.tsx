import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import { EmployeeAvatar } from '../../shared/EmployeeAvatar';
import { EXCEL_MIME, buildPayrollRecapExcel, downloadTextFile } from '../../utils/exportUtils';
import {
  buildRecentPayslipPeriods,
  calculatePayslip,
  formatRupiah,
} from '../../utils/hrisLogic';
import { AdminUserPayrollDetailPage } from './AdminUserPayrollDetailPage';

interface AdminPayrollPanelProps {
  onShowToast: (message: string) => void;
}

/**
 * Halaman Daftar Slip Gaji Admin: menampilkan seluruh karyawan dengan gaji per
 * absen, kehadiran, lembur, potongan BPJS, dan total yang harus dibayarkan.
 * Klik salah satu user membuka halaman detail khusus user tersebut.
 */
export function AdminPayrollPanel({ onShowToast }: AdminPayrollPanelProps) {
  const {
    employees,
    divisions,
    attendance,
    overtimes,
    payslipComponents,
    payrollSettings,
    userPayrollConfigs,
    wibNow,
  } = useHris();

  const periods = useMemo(
    () => buildRecentPayslipPeriods(wibNow.year, wibNow.month),
    [wibNow.year, wibNow.month]
  );
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(periods[0].key);
  const selectedPeriod =
    periods.find((p) => p.key === selectedPeriodKey) ?? {
      key: wibNow.periodKey,
      label: wibNow.periodLabel,
    };

  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'inactive'>('active');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  const selectedEmployee = selectedUid
    ? employees.find((emp) => emp.uid === selectedUid) ?? null
    : null;

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .filter((emp) => {
        if (statusFilter === 'active' && !emp.active) return false;
        if (statusFilter === 'inactive' && emp.active) return false;
        if (divisionFilter !== 'ALL' && emp.division !== divisionFilter) return false;
        if (!q) return true;
        return (
          emp.name.toLowerCase().includes(q) ||
          emp.nik.toLowerCase().includes(q) ||
          emp.position.toLowerCase().includes(q) ||
          emp.division.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, search, divisionFilter, statusFilter]);

  const rowsWithSlip = useMemo(() => {
    return filteredEmployees.map((emp) => ({
      emp,
      slip: calculatePayslip(
        emp,
        selectedPeriod.key,
        selectedPeriod.label,
        attendance,
        overtimes,
        payslipComponents,
        payrollSettings,
        userPayrollConfigs[emp.uid]
      ),
    }));
  }, [
    filteredEmployees,
    selectedPeriod.key,
    selectedPeriod.label,
    attendance,
    overtimes,
    payslipComponents,
    payrollSettings,
    userPayrollConfigs,
  ]);

  const totals = useMemo(() => {
    return rowsWithSlip.reduce(
      (acc, { slip }) => {
        acc.attendancePay +=
          slip.earnedBasePay + slip.earnedPositionAllowance + slip.earnedMealAllowance;
        acc.overtimePay += slip.overtimePay;
        acc.deductions += slip.totalDeductions;
        acc.netPay += slip.netPay;
        return acc;
      },
      { attendancePay: 0, overtimePay: 0, deductions: 0, netPay: 0 }
    );
  }, [rowsWithSlip]);

  if (selectedEmployee) {
    return (
      <AdminUserPayrollDetailPage
        employee={selectedEmployee}
        initialPeriodKey={selectedPeriod.key}
        onBack={() => setSelectedUid(null)}
        onShowToast={onShowToast}
      />
    );
  }

  const handleExportRecap = () => {
    const xml = buildPayrollRecapExcel(
      filteredEmployees,
      selectedPeriod.key,
      selectedPeriod.label,
      attendance,
      overtimes,
      payslipComponents,
      payrollSettings,
      userPayrollConfigs
    );
    downloadTextFile(`rekap-gaji-sbum-${selectedPeriod.key}.xls`, xml, EXCEL_MIME);
    onShowToast(
      `Rekap gaji periode ${selectedPeriod.label} (${filteredEmployees.length} karyawan) diunduh.`
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Ringkasan Total yang Harus Dibayarkan */}
      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-2xl bg-[#EEF3FA] border border-slate-200 grid place-items-center shrink-0">
              <Wallet className="w-5 h-5 text-[#C69214]" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453]">
                Slip Gaji &amp; Pembayaran Per Karyawan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Gaji dihitung per kehadiran di kantor ditambah lembur dan dikurangi potongan BPJS.
                Klik salah satu karyawan untuk mengatur nominal &amp; melihat rincian detailnya.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="Pilih periode slip gaji"
              value={selectedPeriod.key}
              onChange={(e) => setSelectedPeriodKey(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B2453] focus:border-[#0B2453] focus:outline-none"
            >
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  Periode: {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportRecap}
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#C69214] to-[#A6760B] text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs hover:brightness-105 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Rekap Excel</span>
            </button>
          </div>
        </div>

        {/* Kartu Ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-[#FFF8E6] border border-[#F3D88B] p-3.5 col-span-2 lg:col-span-1">
            <div className="text-[11px] font-bold text-[#9B710D]">
              Total Harus Dibayarkan ({selectedPeriod.label})
            </div>
            <div className="mt-1 text-xl sm:text-2xl font-extrabold font-mono text-[#9B710D] tabular-nums truncate">
              {formatRupiah(totals.netPay)}
            </div>
            <div className="text-[11px] text-[#9B710D]/80 mt-0.5">
              Untuk {rowsWithSlip.length} karyawan
            </div>
          </div>

          <div className="rounded-2xl bg-[#F9FBFE] border border-slate-200/80 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#0B2453]" />
              <span>Gaji Kehadiran + Tunj.</span>
            </div>
            <div className="mt-1 text-base sm:text-xl font-extrabold font-mono text-[#0B2453] tabular-nums truncate">
              {formatRupiah(totals.attendancePay)}
            </div>
          </div>

          <div className="rounded-2xl bg-[#F9FBFE] border border-slate-200/80 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">Total Insentif Lembur</div>
            <div className="mt-1 text-base sm:text-xl font-extrabold font-mono text-emerald-700 tabular-nums truncate">
              +{formatRupiah(totals.overtimePay)}
            </div>
          </div>

          <div className="rounded-2xl bg-[#F9FBFE] border border-slate-200/80 p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Total Potongan (BPJS &amp; Telat)
            </div>
            <div className="mt-1 text-base sm:text-xl font-extrabold font-mono text-rose-700 tabular-nums truncate">
              −{formatRupiah(totals.deductions)}
            </div>
          </div>
        </div>

        {/* Filter Pencarian */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, NIK, jabatan, atau divisi karyawan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-xl border border-slate-200 pl-9 pr-3 text-xs sm:text-sm focus:border-[#0B2453] focus:outline-none"
            />
          </div>
          <select
            aria-label="Filter divisi gaji"
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B2453]"
          >
            <option value="ALL">Semua Divisi</option>
            {divisions.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter status karyawan"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'active' | 'all' | 'inactive')}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B2453]"
          >
            <option value="active">Karyawan Aktif</option>
            <option value="all">Semua Status</option>
            <option value="inactive">Non-Aktif</option>
          </select>
        </div>
      </section>

      {/* Daftar User — Klik Detail untuk Membuka Halaman Penggajian User */}
      {rowsWithSlip.length === 0 ? (
        <section className="rounded-3xl bg-white p-8 border border-slate-200/80 text-center text-sm text-slate-500">
          Tidak ada karyawan yang sesuai dengan filter saat ini.
        </section>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {rowsWithSlip.map(({ emp, slip }) => (
            <button
              key={emp.uid}
              type="button"
              onClick={() => setSelectedUid(emp.uid)}
              className="text-left rounded-3xl bg-white p-4 sm:p-5 border border-slate-200/80 hover:border-[#C69214] shadow-xs transition-all cursor-pointer space-y-3.5 group"
            >
              {/* Header User */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <EmployeeAvatar
                    name={emp.name}
                    photoUrl={emp.photoUrl}
                    className="w-11 h-11"
                    textClassName="text-xs"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm sm:text-base font-extrabold text-[#0B2453] truncate">
                        {emp.name}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {emp.nik}
                      </span>
                      {!emp.active && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          Non-Aktif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5">
                      {emp.position} &bull; {emp.division}
                    </div>
                  </div>
                </div>

                <span className="shrink-0 h-8 px-2.5 rounded-xl bg-[#EEF3FA] group-hover:bg-[#0B2453] text-[#0B2453] group-hover:text-white text-[11px] font-extrabold inline-flex items-center gap-1 transition-colors">
                  <span>Detail</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>

              {/* Ringkasan Angka Per User */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded-xl bg-[#F9FBFE] border border-slate-200/70 p-2.5">
                  <div className="text-slate-500">Gaji / Absen</div>
                  <div className="font-mono font-extrabold text-[#0B2453] mt-0.5 truncate">
                    {formatRupiah(slip.dailyBaseRate)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    /{slip.workDaysTarget}h ({formatRupiah(slip.baseSalary)})
                  </div>
                </div>

                <div className="rounded-xl bg-[#F9FBFE] border border-slate-200/70 p-2.5">
                  <div className="text-slate-500">Hadir</div>
                  <div className="font-mono font-extrabold text-[#0B2453] mt-0.5">
                    {slip.attendanceDays} / {slip.workDaysTarget} hari
                  </div>
                  <div className="text-[10px] text-emerald-700 font-mono truncate">
                    {formatRupiah(slip.earnedBasePay)}
                  </div>
                </div>

                <div className="rounded-xl bg-[#F9FBFE] border border-slate-200/70 p-2.5">
                  <div className="text-slate-500">Lembur</div>
                  <div className="font-mono font-extrabold text-emerald-700 mt-0.5 truncate">
                    {slip.overtimePay > 0 ? `+${formatRupiah(slip.overtimePay)}` : 'Rp 0'}
                  </div>
                  <div className="text-[10px] text-slate-500">{slip.overtimeHours} jam</div>
                </div>

                <div className="rounded-xl bg-[#F9FBFE] border border-slate-200/70 p-2.5">
                  <div className="text-slate-500">Potongan</div>
                  <div className="font-mono font-extrabold text-rose-700 mt-0.5 truncate">
                    −{formatRupiah(slip.totalDeductions)}
                  </div>
                  <div className="text-[10px] text-slate-500">BPJS &amp; telat</div>
                </div>
              </div>

              {/* Footer: Total yang Harus Dibayarkan */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-600">
                  Total yang Harus Dibayarkan
                </span>
                <span className="text-base sm:text-lg font-extrabold font-mono text-[#0B2453] tabular-nums">
                  {formatRupiah(slip.netPay)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

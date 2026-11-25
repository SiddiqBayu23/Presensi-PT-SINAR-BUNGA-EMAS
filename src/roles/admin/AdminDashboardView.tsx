import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  CloudOff,
  FileSpreadsheet,
  MapPin,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import type { Division, MainTab, ShiftCode } from '../../types/hris';
import {
  SHIFT_TEMPLATES,
  calculatePayslip,
  defaultShiftForDivision,
  formatDuration,
  formatRupiah,
  resolveDivisionShiftRule,
} from '../../utils/hrisLogic';
import type { HrdSubTab } from './HrdView';
import { DashboardCalendar } from '../../shared/DashboardCalendar';
import { EmployeeAvatar } from '../../shared/EmployeeAvatar';
import { TodoListWidget } from '../../shared/TodoListWidget';

interface AdminDashboardViewProps {
  onOpenAttendance: (mode: 'in' | 'out') => void;
  onNavigateTab: (tab: MainTab) => void;
  onOpenHrdSubTab: (subTab: HrdSubTab) => void;
  /** Buka Data Karyawan dengan kata kunci pencarian terisi (akses cepat per karyawan). */
  onOpenEmployeeDirectory: (searchTerm: string) => void;
  onShowToast: (message: string) => void;
}

export function AdminDashboardView({
  onOpenAttendance,
  onNavigateTab,
  onOpenHrdSubTab,
  onOpenEmployeeDirectory,
  onShowToast,
}: AdminDashboardViewProps) {
  const {
    currentUser,
    isFirebaseSynced,
    employees,
    attendance,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    wibNow,
    loginWithGoogle,
    addEmployeeByHrd,
    reviewLeave,
    reviewOvertime,
    reviewShiftSwap,
    reviewExitClearance,
    divisions,
    divisionShiftRules,
    payslipComponents,
    payrollSettings,
    addDivision,
    shiftTemplateFor,
  } = useHris();

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [syncingFirebase, setSyncingFirebase] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [addingEmp, setAddingEmp] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryDivision, setDirectoryDivision] = useState<string>('ALL');
  const [empForm, setEmpForm] = useState({
    email: '',
    name: '',
    position: '',
    division: 'Security' as Division,
    shiftCode: 'PAGI' as ShiftCode,
    initialPassword: '0909',
  });

  const todayAttendance = useMemo(
    () => attendance.filter((a) => a.date === wibNow.isoDate),
    [attendance, wibNow.isoDate]
  );

  const pendingLeaves = useMemo(() => leaves.filter((l) => l.status === 'Menunggu'), [leaves]);
  const pendingOvertimes = useMemo(
    () => overtimes.filter((o) => o.status === 'Menunggu'),
    [overtimes]
  );
  const pendingSwaps = useMemo(
    () => shiftSwaps.filter((s) => s.status === 'Menunggu'),
    [shiftSwaps]
  );
  const pendingExits = useMemo(
    () => exitClearances.filter((e) => e.status === 'Menunggu'),
    [exitClearances]
  );

  const totalPending =
    pendingLeaves.length + pendingOvertimes.length + pendingSwaps.length + pendingExits.length;

  const totalPayrollThisMonth = useMemo(() => {
    return employees.reduce((sum, emp) => {
      const slip = calculatePayslip(
        emp,
        wibNow.periodKey,
        wibNow.periodLabel,
        attendance,
        overtimes,
        payslipComponents,
        payrollSettings
      );
      return sum + slip.netPay;
    }, 0);
  }, [
    employees,
    attendance,
    overtimes,
    payslipComponents,
    payrollSettings,
    wibNow.periodKey,
    wibNow.periodLabel,
  ]);

  /** Akses cepat semua karyawan: filter nama/NIK/divisi langsung dari beranda admin. */
  const quickDirectory = useMemo(() => {
    const q = directoryQuery.trim().toLowerCase();
    return employees
      .filter((emp) => {
        const matchDivision = directoryDivision === 'ALL' || emp.division === directoryDivision;
        const matchQuery =
          !q ||
          emp.name.toLowerCase().includes(q) ||
          emp.nik.toLowerCase().includes(q) ||
          emp.email.toLowerCase().includes(q) ||
          emp.position.toLowerCase().includes(q);
        return matchDivision && matchQuery;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, directoryQuery, directoryDivision]);

  const divisionBreakdown = useMemo(() => {
    const total = Math.max(1, employees.length);
    return divisions.map((div) => {
      const count = employees.filter((e) => e.division === div).length;
      return {
        division: div,
        count,
        pct: Math.round((count / total) * 100),
      };
    });
  }, [employees, divisions]);

  if (!currentUser) return null;

  const handleSyncCloud = async () => {
    setSyncError(null);
    setSyncingFirebase(true);
    const res = await loginWithGoogle();
    setSyncingFirebase(false);
    if (!res.ok) {
      setSyncError(res.error);
      return;
    }
    onShowToast('Berhasil terhubung ke Cloud Firestore PT Sinar Bunga Mas.');
  };

  const handleQuickAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingEmp(true);
    try {
      const res = await addEmployeeByHrd(empForm);
      if (!res.ok) {
        onShowToast(res.error);
        return;
      }
      setEmpForm({
        email: '',
        name: '',
        position: '',
        division: 'Security',
        shiftCode: 'PAGI',
        initialPassword: '0909',
      });
      setShowQuickAdd(false);
      onShowToast(`Karyawan ${res.employee.name} (${res.employee.nik}) berhasil ditambahkan.`);
    } finally {
      setAddingEmp(false);
    }
  };

  const quickActions = [
    {
      label: 'Persetujuan',
      sub: `${totalPending} menunggu`,
      icon: <ClipboardCheck className="w-5 h-5 text-[#0B2453]" />,
      accent: 'bg-amber-50 border-amber-200/80',
      onClick: () => onOpenHrdSubTab('persetujuan'),
    },
    {
      label: 'Data Karyawan',
      sub: `${employees.length} terdaftar`,
      icon: <Users className="w-5 h-5 text-[#0B2453]" />,
      accent: 'bg-slate-50 border-slate-200/80',
      onClick: () => onOpenHrdSubTab('karyawan'),
    },
    {
      label: 'Rekap Absensi',
      sub: `${todayAttendance.length} hadir hari ini`,
      icon: <Camera className="w-5 h-5 text-emerald-700" />,
      accent: 'bg-emerald-50/70 border-emerald-200/80',
      onClick: () => onOpenHrdSubTab('absensi'),
    },
    {
      label: 'Export Semua',
      sub: 'Excel 7 Sheet & per kategori',
      icon: <FileSpreadsheet className="w-5 h-5 text-[#9B710D]" />,
      accent: 'bg-[#FFF8E6] border-[#F3D88B]',
      onClick: () => onOpenHrdSubTab('export'),
    },
    {
      label: 'Jadwal Shift',
      sub: 'Kelola penugasan',
      icon: <CalendarClock className="w-5 h-5 text-sky-700" />,
      accent: 'bg-sky-50/70 border-sky-200/80',
      onClick: () => onNavigateTab('schedule'),
    },
    {
      label: 'Slip & Dokumen',
      sub: 'Payroll & PKO/PKWT',
      icon: <Banknote className="w-5 h-5 text-indigo-700" />,
      accent: 'bg-indigo-50/70 border-indigo-200/80',
      onClick: () => onNavigateTab('dokumen'),
    },
  ];

  const onTimeCount = todayAttendance.filter((a) => a.lateMinutes === 0).length;
  const lateCount = todayAttendance.filter((a) => a.lateMinutes > 0).length;

  return (
    <div className="space-y-5">
      {/* Executive Beranda Admin Hero */}
      <section
        aria-labelledby="beranda-admin-heading"
        className="rounded-3xl bg-gradient-to-br from-[#0A1E46] via-[#122D65] to-[#0B2250] p-5 sm:p-7 text-white shadow-[0_10px_30px_rgba(11,36,83,0.18)] border-b-4 border-[#C69214]"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#F3CA62]">
              <ShieldCheck className="w-4 h-4" />
              <span>Beranda Admin &bull; Pusat Kendali HRIS</span>
            </div>
            <h1
              id="beranda-admin-heading"
              className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight"
            >
              Selamat Datang, {currentUser.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-200/90 max-w-2xl leading-relaxed">
              Pantau kehadiran GPS &amp; Kamera Live, proses persetujuan karyawan, kelola direktori
              email karyawan, dan export laporan lengkap PT Sinar Bunga Mas dari satu halaman.
            </p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-1 shrink-0 rounded-2xl bg-white/10 border border-white/15 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">
              Waktu Server WIB
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight text-white">
              {wibNow.timeFull}
            </div>
            <div className="text-xs font-medium text-slate-200">{wibNow.fullIndonesianDate}</div>
          </div>
        </div>

        {/* Hero Action Bar + Cloud Sync Status */}
        <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowQuickAdd((v) => !v)}
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#D4A424] to-[#B6810C] hover:brightness-105 text-[#0A1E46] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah Karyawan</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenHrdSubTab('export')}
              className="h-10 px-4 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#F3CA62]" />
              <span>Export Semua</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAttendance('in')}
              className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-slate-100 text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4 text-emerald-300" />
              <span>Absen Pribadi</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isFirebaseSynced ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 rounded-xl px-3 py-2">
                <Cloud className="w-4 h-4" />
                <span>Cloud Firebase Tersinkron</span>
              </span>
            ) : (
              <button
                type="button"
                disabled={syncingFirebase}
                onClick={() => void handleSyncCloud()}
                className="h-10 px-3.5 rounded-xl bg-white text-[#0B2453] hover:bg-amber-50 text-xs font-extrabold inline-flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-60"
              >
                <CloudOff className="w-4 h-4 text-[#C69214]" />
                <span>{syncingFirebase ? 'Menghubungkan...' : 'Hubungkan Cloud Firebase (Google)'}</span>
              </button>
            )}
          </div>
        </div>

        {syncError && (
          <div className="mt-3 rounded-xl bg-red-500/20 border border-red-300/40 px-3.5 py-2 text-xs font-semibold text-red-100">
            {syncError}
          </div>
        )}
      </section>

      {/* Inline Quick Add Employee Drawer */}
      {showQuickAdd && (
        <section
          aria-label="Tambah Karyawan Cepat"
          className="rounded-3xl bg-white p-5 shadow-sm border border-[#C69214]/45 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
                Tambah Karyawan Baru Pakai Email
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickAdd(false)}
              aria-label="Tutup form tambah karyawan"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form
            onSubmit={(e) => void handleQuickAddEmployee(e)}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            <input
              type="email"
              required
              placeholder="Email Aktif (mis. sari@gmail.com)"
              value={empForm.email}
              onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
              className="h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="Nama Lengkap Karyawan"
              value={empForm.name}
              onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
              className="h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
            />
            <input
              type="text"
              placeholder="Jabatan (opsional)"
              value={empForm.position}
              onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })}
              className="h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
            />
            <input
              type="password"
              minLength={6}
              placeholder="Kata Sandi Awal (min. 6)"
              aria-label="Kata sandi awal akun login karyawan"
              value={empForm.initialPassword}
              onChange={(e) => setEmpForm({ ...empForm, initialPassword: e.target.value })}
              className="h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
            />
            <select
              aria-label="Divisi karyawan baru"
              value={empForm.division}
              onChange={(e) => {
                const nextDivision = e.target.value as Division;
                setEmpForm({
                  ...empForm,
                  division: nextDivision,
                  shiftCode: defaultShiftForDivision(nextDivision, divisionShiftRules),
                });
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {divisions.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
            <select
              aria-label="Shift karyawan baru"
              value={empForm.shiftCode}
              onChange={(e) => setEmpForm({ ...empForm, shiftCode: e.target.value as ShiftCode })}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {resolveDivisionShiftRule(empForm.division, divisionShiftRules).allowedShiftCodes.map(
                (code) => {
                  const tpl = shiftTemplateFor(code, empForm.division);
                  return (
                    <option key={code} value={code}>
                      {tpl.name} ({tpl.startTime}–{tpl.endTime})
                    </option>
                  );
                }
              )}
            </select>
            <button
              type="submit"
              disabled={addingEmp}
              className="h-11 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-sm font-bold cursor-pointer disabled:opacity-60"
            >
              {addingEmp ? 'Menyimpan...' : 'Simpan Karyawan'}
            </button>
          </form>
        </section>
      )}

      {/* 4 Executive KPI Cards */}
      <section aria-label="Ringkasan KPI Admin" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Total Karyawan Aktif</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-[#0B2453] tabular-nums">
            {employees.filter((e) => e.active).length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Dari {employees.length} akun terdaftar
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Hadir Hari Ini</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-emerald-700 tabular-nums">
            {todayAttendance.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {onTimeCount} tepat waktu &bull; {lateCount} terlambat
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Menunggu Persetujuan</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-[#C69214] tabular-nums">
            {totalPending}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Izin, lembur, shift &amp; exit clear
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">
            Estimasi Payroll ({wibNow.periodLabel})
          </div>
          <div className="mt-1.5 text-lg sm:text-2xl font-extrabold text-[#0B2453] font-mono tabular-nums truncate">
            {formatRupiah(totalPayrollThisMonth)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Total Take Home Pay</div>
        </div>
      </section>

      {/* Menu Kendali Admin (6 Quick Tiles) */}
      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453]">Menu Kendali Admin</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((act) => (
            <button
              key={act.label}
              type="button"
              onClick={act.onClick}
              className={`rounded-2xl border p-3.5 text-left hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${act.accent}`}
            >
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shadow-2xs">
                {act.icon}
              </div>
              <div>
                <div className="text-xs sm:text-sm font-extrabold text-[#0B2453]">{act.label}</div>
                <div className="text-[11px] font-medium text-slate-600 mt-0.5">{act.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Akses Cepat Semua Karyawan (item 10) */}
      <section
        aria-labelledby="akses-cepat-karyawan-heading"
        className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <h2
              id="akses-cepat-karyawan-heading"
              className="text-base sm:text-lg font-extrabold text-[#0B2453]"
            >
              Akses Cepat Semua Karyawan
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={directoryQuery}
                onChange={(e) => setDirectoryQuery(e.target.value)}
                placeholder="Cari nama, NIK, atau email..."
                aria-label="Cari karyawan untuk akses cepat"
                className="h-10 w-full sm:w-64 rounded-xl border border-slate-200 pl-9 pr-3 text-xs focus:border-[#0B2453] focus:outline-none"
              />
            </div>
            <select
              aria-label="Filter divisi akses cepat"
              value={directoryDivision}
              onChange={(e) => setDirectoryDivision(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B2453]"
            >
              <option value="ALL">Semua Divisi</option>
              {divisions.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onOpenHrdSubTab('karyawan')}
              className="h-10 px-3.5 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>Kelola Data Karyawan</span>
            </button>
          </div>
        </div>

        {/* Tombol per divisi */}
        <div className="flex flex-wrap gap-1.5">
          {divisions.map((div) => {
            const count = employees.filter((emp) => emp.division === div && emp.active).length;
            return (
              <button
                key={div}
                type="button"
                onClick={() => {
                  setDirectoryDivision(div);
                  setDirectoryQuery('');
                }}
                className={`h-8 px-2.5 rounded-lg border text-[11px] font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  directoryDivision === div
                    ? 'bg-[#0B2453] text-white border-[#0B2453]'
                    : 'bg-[#F8FAFD] text-[#0B2453] border-slate-200 hover:border-[#B6810C]'
                }`}
              >
                <Building2 className="w-3 h-3" />
                <span>{div}</span>
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {quickDirectory.length === 0 ? (
          <p className="text-xs text-slate-500 py-2">Tidak ada karyawan yang cocok dengan filter.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[26rem] overflow-y-auto pr-1">
            {quickDirectory.map((emp) => {
              const today = todayAttendance.find((rec) => rec.uid === emp.uid);
              return (
                <button
                  key={emp.uid}
                  type="button"
                  onClick={() => onOpenEmployeeDirectory(emp.nik)}
                  className="text-left rounded-2xl border border-slate-200 bg-[#F9FBFE] hover:border-[#B6810C] hover:bg-[#FFFBEB] p-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-2.5">
                    <EmployeeAvatar
                      name={emp.name}
                      photoUrl={emp.photoUrl}
                      className="w-9 h-9"
                      textClassName="text-[11px]"
                    />
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#0B2453] truncate">{emp.name}</span>
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${
                          emp.active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {emp.active ? 'Aktif' : 'Non-Aktif'}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">{emp.nik}</div>
                  <div className="text-[10px] text-slate-600 truncate">
                    {emp.division} &bull; {emp.position}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-mono font-bold text-slate-700">
                      {SHIFT_TEMPLATES[emp.shiftCode]?.name ?? emp.shiftCode}
                    </span>
                    <span
                      className={`font-bold ${
                        today ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {today ? `Hadir ${today.clockInTime.slice(0, 5)}` : 'Belum absen'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-Column Operations Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Quick Approval Queue */}
        <section className="lg:col-span-7 rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">
                Antrian Persetujuan Cepat ({totalPending})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenHrdSubTab('persetujuan')}
              className="text-xs font-bold text-[#0B2453] hover:text-[#C69214] inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Kelola Semua</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {totalPending === 0 ? (
            <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200/80 p-5 text-center space-y-1.5">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="text-sm font-extrabold text-emerald-900">
                Semua Pengajuan Sudah Diproses
              </div>
              <p className="text-xs text-emerald-800/80">
                Tidak ada pengajuan izin, cuti, lembur, atau tukar shift yang menunggu persetujuan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingLeaves.slice(0, 3).map((lv) => (
                <div
                  key={lv.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-extrabold text-[#C69214] uppercase">
                      {lv.type}
                    </div>
                    <div className="text-sm font-bold text-[#0B2453]">
                      {lv.employeeName} ({lv.nik})
                    </div>
                    <div className="text-xs text-slate-600">
                      {lv.startDate} s/d {lv.endDate} ({lv.days} hr) &bull; {lv.reason}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void reviewLeave(lv.id, 'Disetujui').then(() =>
                          onShowToast(`Izin/Cuti ${lv.employeeName} disetujui.`)
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void reviewLeave(lv.id, 'Ditolak').then(() =>
                          onShowToast(`Izin/Cuti ${lv.employeeName} ditolak.`)
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" /> Tolak
                    </button>
                  </div>
                </div>
              ))}

              {pendingOvertimes.slice(0, 2).map((ot) => (
                <div
                  key={ot.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-extrabold text-indigo-700 uppercase">Lembur</div>
                    <div className="text-sm font-bold text-[#0B2453]">
                      {ot.employeeName} ({ot.nik})
                    </div>
                    <div className="text-xs text-slate-600 font-mono tabular-nums">
                      {ot.date} &bull; {ot.startTime}-{ot.endTime} ({ot.hours}j) &bull;{' '}
                      {formatRupiah(ot.estimatedPay)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void reviewOvertime(ot.id, 'Disetujui').then(() =>
                          onShowToast(`Lembur ${ot.employeeName} disetujui.`)
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void reviewOvertime(ot.id, 'Ditolak').then(() =>
                          onShowToast(`Lembur ${ot.employeeName} ditolak.`)
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" /> Tolak
                    </button>
                  </div>
                </div>
              ))}

              {pendingSwaps.slice(0, 2).map((sw) => (
                <div
                  key={sw.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-extrabold text-sky-700 uppercase">Tukar Shift</div>
                    <div className="text-sm font-bold text-[#0B2453]">
                      {sw.employeeName} ({sw.nik})
                    </div>
                    <div className="text-xs text-slate-600">
                      {sw.date} &bull; {sw.fromShift} &rarr; {sw.toShift}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void reviewShiftSwap(sw.id, 'Disetujui').then((res) =>
                          onShowToast(
                            res.ok
                              ? `Tukar shift ${sw.employeeName} disetujui untuk ${sw.date}.`
                              : (res.error ?? 'Tukar shift gagal disetujui.')
                          )
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void reviewShiftSwap(sw.id, 'Ditolak').then((res) =>
                          onShowToast(
                            res.ok
                              ? `Tukar shift ${sw.employeeName} ditolak.`
                              : (res.error ?? 'Tukar shift gagal ditolak.')
                          )
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" /> Tolak
                    </button>
                  </div>
                </div>
              ))}

              {pendingExits.slice(0, 1).map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-extrabold text-rose-700 uppercase">
                      Exit Clearance
                    </div>
                    <div className="text-sm font-bold text-[#0B2453]">
                      {ex.employeeName} ({ex.nik})
                    </div>
                    <div className="text-xs text-slate-600">
                      Hari kerja terakhir: {ex.lastWorkingDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void reviewExitClearance(ex.id, 'Disetujui').then(() =>
                        onShowToast(`Exit Clearance ${ex.employeeName} difinalisasi.`)
                      )
                    }
                    className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" /> Finalisasi
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Division Distribution & Latest Attendance */}
        <section className="lg:col-span-5 space-y-5">
          <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
                Sebaran Karyawan per Divisi
              </h2>
              <span className="text-xs font-bold text-slate-500 tabular-nums">
                {employees.length} orang
              </span>
            </div>
            <div className="space-y-2.5">
              {divisionBreakdown.map((item) => (
                <div key={item.division} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{item.division}</span>
                    <span className="font-mono font-bold text-[#0B2453] tabular-nums">
                      {item.count} ({item.pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0B2453] to-[#C69214]"
                      style={{ width: `${Math.max(item.count > 0 ? 8 : 0, item.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
                Absensi Terbaru (GPS &amp; Kamera)
              </h2>
              <button
                type="button"
                onClick={() => onOpenHrdSubTab('absensi')}
                className="text-xs font-bold text-[#0B2453] hover:text-[#C69214] cursor-pointer"
              >
                Lihat Rekap
              </button>
            </div>

            {attendance.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Belum ada catatan absensi masuk hari ini.
              </p>
            ) : (
              <div className="space-y-2.5">
                {attendance.slice(0, 4).map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-3 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#0B2453] truncate">
                        {rec.employeeName} ({rec.nik})
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 truncate">
                        <MapPin className="w-3 h-3 text-[#C69214] shrink-0" />
                        <span className="truncate">{rec.clockInAddress || 'GPS Terverifikasi'}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div className="font-bold text-[#0B2453]">
                        {rec.clockInTime || '--:--'}
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          rec.lateMinutes > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {rec.workMinutes > 0 ? formatDuration(rec.workMinutes) : rec.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Todo List & Penugasan Operasional */}
      <TodoListWidget role="hrd" onShowToast={onShowToast} />

      {/* Kalender Kerja & Izin Karyawan */}
      <DashboardCalendar role="hrd" />
    </div>
  );
}

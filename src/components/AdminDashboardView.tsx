import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  CloudOff,
  FileSpreadsheet,
  MapPin,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { Division, MainTab, ShiftCode } from '../types/hris';
import { SHIFT_TEMPLATES, calculatePayslip, formatDuration, formatRupiah } from '../utils/hrisLogic';
import type { HrdSubTab } from './HrdView';

interface AdminDashboardViewProps {
  onOpenAttendance: (mode: 'in' | 'out') => void;
  onNavigateTab: (tab: MainTab) => void;
  onOpenHrdSubTab: (subTab: HrdSubTab) => void;
  onShowToast: (message: string) => void;
}

const DIVISIONS: Division[] = ['HRD', 'Security', 'Cleaning Service', 'Operasional', 'Keuangan'];

export function AdminDashboardView({
  onOpenAttendance,
  onNavigateTab,
  onOpenHrdSubTab,
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
  } = useHris();

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [syncingFirebase, setSyncingFirebase] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [addingEmp, setAddingEmp] = useState(false);
  const [empForm, setEmpForm] = useState({
    email: '',
    name: '',
    position: '',
    division: 'Security' as Division,
    shiftCode: 'PAGI' as ShiftCode,
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
        overtimes
      );
      return sum + slip.netPay;
    }, 0);
  }, [employees, attendance, overtimes, wibNow.periodKey, wibNow.periodLabel]);

  const divisionBreakdown = useMemo(() => {
    const total = Math.max(1, employees.length);
    return DIVISIONS.map((div) => {
      const count = employees.filter((e) => e.division === div).length;
      return {
        division: div,
        count,
        pct: Math.round((count / total) * 100),
      };
    });
  }, [employees]);

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
      sub: 'Excel 7 Sheet & CSV',
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
            <select
              aria-label="Divisi karyawan baru"
              value={empForm.division}
              onChange={(e) => setEmpForm({ ...empForm, division: e.target.value as Division })}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="Security">Security</option>
              <option value="Cleaning Service">Cleaning Service</option>
              <option value="Operasional">Operasional</option>
              <option value="Keuangan">Keuangan</option>
              <option value="HRD">HRD</option>
            </select>
            <select
              aria-label="Shift karyawan baru"
              value={empForm.shiftCode}
              onChange={(e) => setEmpForm({ ...empForm, shiftCode: e.target.value as ShiftCode })}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {Object.values(SHIFT_TEMPLATES).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
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
                        void reviewShiftSwap(sw.id, 'Disetujui').then(() =>
                          onShowToast(`Tukar shift ${sw.employeeName} disetujui.`)
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Setujui
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void reviewShiftSwap(sw.id, 'Ditolak').then(() =>
                          onShowToast(`Tukar shift ${sw.employeeName} ditolak.`)
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
    </div>
  );
}

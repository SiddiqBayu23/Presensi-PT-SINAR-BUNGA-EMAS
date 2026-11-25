import React, { useMemo } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import type { MainTab, ShiftCode, SubmissionSubTab } from '../../types/hris';
import { DashboardCalendar } from '../../shared/DashboardCalendar';
import { TodoListWidget } from '../../shared/TodoListWidget';

interface SupervisorDashboardViewProps {
  /** Buka panel persetujuan tim (tab 'hrd'). */
  onOpenPanel: () => void;
  onNavigateTab: (tab: MainTab) => void;
  onNavigateSubmission: (subTab: SubmissionSubTab) => void;
  onOpenAttendance: (mode: 'in' | 'out') => void;
}

/**
 * Beranda supervisor: ringkasan tim sendiri (bawahan langsung), tanpa data
 * penggajian/PII seluruh perusahaan.
 */
export function SupervisorDashboardView({
  onOpenPanel,
  onNavigateTab,
  onNavigateSubmission,
  onOpenAttendance,
}: SupervisorDashboardViewProps) {
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
    shiftTemplateFor,
  } = useHris();

  const meUid = currentUser?.uid ?? '';

  const team = useMemo(
    () => employees.filter((emp) => emp.supervisorUid === meUid),
    [employees, meUid]
  );
  const teamUids = useMemo(() => new Set(team.filter((e) => e.active).map((e) => e.uid)), [team]);

  const todayAttendance = useMemo(
    () => attendance.filter((rec) => teamUids.has(rec.uid) && rec.date === wibNow.isoDate),
    [attendance, teamUids, wibNow.isoDate]
  );

  const teamShiftToday = useMemo(() => {
    const map = new Map<string, ShiftCode>();
    schedules
      .filter((s) => teamUids.has(s.uid) && s.date === wibNow.isoDate)
      .forEach((s) => map.set(s.uid, s.shiftCode));
    return map;
  }, [schedules, teamUids, wibNow.isoDate]);

  const isRoutedToMe = (rec: { uid: string; supervisorUid?: string }) =>
    rec.uid !== meUid && rec.supervisorUid === meUid;

  const teamPending =
    leaves.filter((l) => isRoutedToMe(l) && l.status === 'Menunggu').length +
    overtimes.filter((o) => isRoutedToMe(o) && o.status === 'Menunggu').length +
    shiftSwaps.filter((s) => isRoutedToMe(s) && s.status === 'Menunggu').length +
    exitClearances.filter((e) => isRoutedToMe(e) && e.status === 'Menunggu').length;

  const myPending =
    leaves.filter((l) => l.uid === meUid && l.status === 'Menunggu').length +
    overtimes.filter((o) => o.uid === meUid && o.status === 'Menunggu').length +
    shiftSwaps.filter((s) => s.uid === meUid && s.status === 'Menunggu').length +
    exitClearances.filter((e) => e.uid === meUid && e.status === 'Menunggu').length;

  if (!currentUser) return null;

  const quickActions: Array<{
    label: string;
    sub: string;
    icon: React.ReactNode;
    accent: string;
    onClick: () => void;
  }> = [
    {
      label: 'Persetujuan Tim',
      sub: `${teamPending} menunggu`,
      icon: <ClipboardCheck className="w-5 h-5 text-[#0B2453]" />,
      accent: 'bg-amber-50 border-amber-200/80',
      onClick: onOpenPanel,
    },
    {
      label: 'Jadwal Saya',
      sub: currentUser.shiftCode,
      icon: <CalendarDays className="w-5 h-5 text-[#0B2453]" />,
      accent: 'bg-slate-50 border-slate-200/80',
      onClick: () => onNavigateTab('schedule'),
    },
    {
      label: 'Ajukan Izin',
      sub: 'Cuti, sakit, izin',
      icon: <ClipboardList className="w-5 h-5 text-emerald-700" />,
      accent: 'bg-emerald-50/70 border-emerald-200/80',
      onClick: () => onNavigateSubmission('izin'),
    },
    {
      label: 'Lembur',
      sub: 'Pengajuan lembur',
      icon: <Clock3 className="w-5 h-5 text-[#9B710D]" />,
      accent: 'bg-[#FFF8E6] border-[#F3D88B]',
      onClick: () => onNavigateSubmission('lembur'),
    },
    {
      label: 'Dokumen Saya',
      sub: 'Slip gaji & PKWT',
      icon: <FileText className="w-5 h-5 text-[#0B2453]" />,
      accent: 'bg-white border-slate-200/80',
      onClick: () => onNavigateTab('dokumen'),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 grid place-items-center">
              <ShieldCheck className="w-5 h-5 text-[#0B2453]" />
            </span>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-[#0B2453]">
                Beranda Supervisor
              </h1>
              <p className="text-xs text-slate-600">
                {wibNow.fullIndonesianDate} &bull; {currentUser.name} &bull; Divisi{' '}
                {currentUser.division}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenAttendance('in')}
              className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Camera className="w-3.5 h-3.5" /> Absen Masuk
            </button>
            <button
              type="button"
              onClick={() => onOpenAttendance('out')}
              className="h-9 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Camera className="w-3.5 h-3.5" /> Absen Pulang
            </button>
            <button
              type="button"
              onClick={onOpenPanel}
              className="shrink-0 h-9 px-3.5 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              Panel Tim <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      <section aria-label="Ringkasan tim supervisor" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Anggota Tim</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-[#0B2453] tabular-nums">
            {team.filter((e) => e.active).length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Bawahan langsung aktif</div>
        </div>
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Hadir Hari Ini</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-emerald-700 tabular-nums">
            {todayAttendance.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {todayAttendance.filter((r) => r.status === 'Terlambat').length} terlambat
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Persetujuan Tim</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-[#C69214] tabular-nums">
            {teamPending}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Menunggu keputusan Anda</div>
        </div>
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Pengajuan Saya</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-slate-700 tabular-nums">
            {myPending}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">Menunggu persetujuan HRD</div>
        </div>
      </section>

      <section aria-label="Aksi cepat supervisor" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {quickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={`text-left rounded-2xl border p-3.5 shadow-xs hover:shadow-sm transition-shadow cursor-pointer ${action.accent}`}
          >
            {action.icon}
            <div className="mt-2 text-sm font-extrabold text-[#0B2453]">{action.label}</div>
            <div className="text-[11px] text-slate-600">{action.sub}</div>
          </button>
        ))}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <Users className="w-4 h-4 text-[#0B2453]" />
            <h2 className="text-sm sm:text-base font-extrabold text-[#0B2453]">Tim Saya</h2>
          </div>
          <button
            type="button"
            onClick={onOpenPanel}
            className="text-xs font-bold text-[#0B2453] hover:text-[#163A7A] inline-flex items-center gap-1 cursor-pointer"
          >
            Kelola persetujuan <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {team.length === 0 ? (
          <p className="text-xs text-slate-500">
            Belum ada karyawan yang menunjuk Anda sebagai atasan langsung. Minta HRD mengisi kolom
            &quot;Atasan Langsung&quot; pada data karyawan agar pengajuan mereka masuk ke panel Anda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3 font-bold">Nama</th>
                  <th className="py-2 pr-3 font-bold">Jabatan</th>
                  <th className="py-2 pr-3 font-bold">Shift Hari Ini</th>
                  <th className="py-2 pr-3 font-bold">Absen</th>
                  <th className="py-2 font-bold text-right">Sisa Cuti</th>
                </tr>
              </thead>
              <tbody>
                {team.map((emp) => {
                  const rec = todayAttendance.find((r) => r.uid === emp.uid);
                  const shiftCode = teamShiftToday.get(emp.uid) ?? emp.shiftCode;
                  return (
                    <tr key={emp.uid} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-bold text-[#0B2453]">{emp.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {emp.nik} &bull; {emp.division}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-slate-700">{emp.position}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1 font-bold text-[#0B2453]">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {shiftTemplateFor(shiftCode, emp.division).label}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {rec ? (
                          <span
                            className={`font-bold ${
                              rec.status === 'Terlambat' ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {rec.clockInTime.slice(0, 5)}
                            {rec.clockOutTime ? ` - ${rec.clockOutTime.slice(0, 5)}` : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400">Belum absen</span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {emp.leaveQuota} hari
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Todo List & Penugasan Tim */}
      <TodoListWidget role="supervisor" />

      {/* Kalender Kerja Tim */}
      <DashboardCalendar role="supervisor" />
    </div>
  );
}

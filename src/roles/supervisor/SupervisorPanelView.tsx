import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  DoorOpen,
  History,
  RefreshCcw,
  ShieldCheck,
  Timer,
  Users,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import { ApprovalCard } from '../../shared/ApprovalCard';
import type { ApprovalStatus } from '../../types/hris';
import { formatRupiah, isIsoDateWithinRange } from '../../utils/hrisLogic';

interface SupervisorPanelViewProps {
  /** Opsional: pakai toast global App bila disediakan. */
  onShowToast?: (message: string) => void;
  /**
   * Opsional: tampilkan panel milik supervisor tertentu (dipakai Admin HRD untuk
   * memantau/memutuskan antrean tiap supervisor). Default: pengguna yang login.
   */
  supervisorUid?: string;
}

interface SupervisedItem {
  uid: string;
  status: ApprovalStatus;
  supervisorUid?: string;
}

/** Hanya pengajuan yang dirutekan ke supervisor pemanggil (bukan pengajuan rekan lain). */
function partitionSupervised<T extends SupervisedItem>(items: T[], meUid: string) {
  const team = items.filter(
    (item) => item.uid !== meUid && item.supervisorUid === meUid
  );
  return {
    team,
    pending: team.filter((item) => item.status === 'Menunggu'),
    decided: team.filter((item) => item.status !== 'Menunggu'),
  };
}

function SectionHeader({
  icon,
  title,
  count,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
        <span className="text-[#0B2453]">{icon}</span>
        <h2 className="text-sm sm:text-base font-extrabold text-[#0B2453]">{title}</h2>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-extrabold text-[#0B2453] tabular-nums">{count} menunggu</div>
        <div className="text-[11px] text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

/**
 * Panel supervisor: hanya persetujuan pengajuan bawahan yang dirutekan ke dirinya
 * (data sudah dibatasi Firestore rules: sendiri + bawahan se-divisi). Tanpa akses
 * data penggajian/PII seluruh perusahaan seperti panel HRD.
 */
export function SupervisorPanelView({ onShowToast, supervisorUid }: SupervisorPanelViewProps) {
  const {
    currentUser,
    employees,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    reviewLeave,
    reviewOvertime,
    reviewShiftSwap,
    reviewExitClearance,
    wibNow,
  } = useHris();

  const meUid = supervisorUid ?? currentUser?.uid ?? '';
  /** Profil supervisor yang panelnya sedang dibuka (bisa berbeda dari pengguna login). */
  const panelOwner =
    employees.find((emp) => emp.uid === meUid) ?? (supervisorUid ? null : currentUser);
  const isOwnPanel = Boolean(currentUser) && meUid === currentUser?.uid;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const queue = useMemo(() => {
    const countOwnPending = (items: SupervisedItem[]) =>
      items.filter((item) => item.uid === meUid && item.status === 'Menunggu').length;
    return {
      izin: partitionSupervised(leaves, meUid),
      lembur: partitionSupervised(overtimes, meUid),
      shift: partitionSupervised(shiftSwaps, meUid),
      exit: partitionSupervised(exitClearances, meUid),
      ownPending:
        countOwnPending(leaves) +
        countOwnPending(overtimes) +
        countOwnPending(shiftSwaps) +
        countOwnPending(exitClearances),
    };
  }, [leaves, overtimes, shiftSwaps, exitClearances, meUid]);

  const teamMembers = useMemo(
    () => employees.filter((emp) => emp.supervisorUid === meUid && emp.active),
    [employees, meUid]
  );

  /** Bawahan (dan diri sendiri) yang izin/cuti disetujui mencakup hari ini. */
  const teamOnLeaveToday = useMemo(
    () =>
      leaves.filter(
        (leave) =>
          leave.status === 'Disetujui' &&
          isIsoDateWithinRange(wibNow.isoDate, leave.startDate, leave.endDate) &&
          (leave.uid === meUid ||
            leave.supervisorUid === meUid ||
            teamMembers.some((emp) => emp.uid === leave.uid))
      ),
    [leaves, wibNow.isoDate, meUid, teamMembers]
  );

  if (!panelOwner) return null;

  const pendingTotal =
    queue.izin.pending.length +
    queue.lembur.pending.length +
    queue.shift.pending.length +
    queue.exit.pending.length;

  const notify = (message: string) => {
    if (onShowToast) {
      onShowToast(message);
      return;
    }
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  const runReview = async (
    key: string,
    label: string,
    action: (id: string, status: ApprovalStatus) => Promise<void | { ok: boolean; error?: string }>,
    id: string,
    status: ApprovalStatus
  ) => {
    setBusyKey(`${key}:${status}`);
    try {
      const result = await action(id, status);
      if (result && !result.ok) {
        notify(result.error ?? 'Keputusan gagal disimpan.');
        return;
      }
      notify(`${label} ${status === 'Disetujui' ? 'disetujui' : 'ditolak'}.`);
    } catch {
      notify('Gagal menyimpan keputusan. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusyKey(null);
    }
  };

  const decided = [
    ...queue.izin.decided.map((item) => ({ id: `izin-${item.id}`, label: 'Izin/Cuti', item })),
    ...queue.lembur.decided.map((item) => ({ id: `lembur-${item.id}`, label: 'Lembur', item })),
    ...queue.shift.decided.map((item) => ({ id: `shift-${item.id}`, label: 'Tukar Shift', item })),
    ...queue.exit.decided.map((item) => ({ id: `exit-${item.id}`, label: 'Exit Clearance', item })),
  ].slice(0, 8);

  const emptyHint = 'Tidak ada pengajuan bawahan yang perlu diputuskan.';

  return (
    <div className="space-y-4 no-print">
      {toast && (
        <div
          role="status"
          className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm font-bold text-emerald-800 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{toast}</span>
        </div>
      )}

      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 grid place-items-center">
              <ShieldCheck className="w-5 h-5 text-[#0B2453]" />
            </span>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-[#0B2453]">
                Panel Persetujuan Tim
              </h1>
              <p className="text-xs text-slate-600">
                {panelOwner.name} &bull; {panelOwner.position} &bull; Divisi {panelOwner.division}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-md bg-blue-500 px-2 py-1 text-[10px] font-extrabold tracking-wider text-white uppercase">
            Supervisor
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-[#F9FBFE] border border-slate-200 p-3.5">
            <div className="text-xs font-semibold text-slate-500">Anggota Tim</div>
            <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
              {teamMembers.length}
            </div>
            <div className="text-[11px] text-slate-500">Bawahan langsung aktif</div>
          </div>
          <div className="rounded-2xl bg-[#FFF8E6] border border-[#F3D88B] p-3.5">
            <div className="text-xs font-semibold text-[#9B710D]">Menunggu Persetujuan</div>
            <div className="mt-1 text-2xl font-extrabold text-[#9B710D] tabular-nums">
              {pendingTotal}
            </div>
            <div className="text-[11px] text-[#9B710D]/80">Pengajuan bawahan</div>
          </div>
          <div className="rounded-2xl bg-[#F9FBFE] border border-slate-200 p-3.5">
            <div className="text-xs font-semibold text-slate-500">Sudah Diputuskan</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-700 tabular-nums">
              {queue.izin.decided.length +
                queue.lembur.decided.length +
                queue.shift.decided.length +
                queue.exit.decided.length}
            </div>
            <div className="text-[11px] text-slate-500">Riwayat tim</div>
          </div>
          <div className="rounded-2xl bg-[#F9FBFE] border border-slate-200 p-3.5">
            <div className="text-xs font-semibold text-slate-500">
              {isOwnPanel ? 'Pengajuan Saya' : 'Pengajuan Supervisor Ini'}
            </div>
            <div className="mt-1 text-2xl font-extrabold text-slate-700 tabular-nums">
              {queue.ownPending}
            </div>
            <div className="text-[11px] text-slate-500">Diputuskan HRD</div>
          </div>
        </div>
      </section>

      {/* Tim izin/cuti hari ini — tidak bisa absen */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <SectionHeader
          icon={<CalendarClock className="w-4 h-4" />}
          title="Tim Izin/Cuti Hari Ini"
          count={teamOnLeaveToday.length}
          hint="Absensi otomatis diblokir"
        />
        {teamOnLeaveToday.length === 0 ? (
          <p className="text-xs text-slate-500">Semua anggota tim tercatat hadir / tidak ada izin aktif hari ini.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {teamOnLeaveToday.map((leave) => (
              <div
                key={leave.id}
                className="rounded-2xl bg-amber-50/70 border border-amber-300 p-3 text-[11px] space-y-0.5"
              >
                <div className="font-extrabold text-slate-900 truncate">{leave.employeeName}</div>
                <div className="text-slate-600">
                  {leave.division} &bull; {leave.type} &bull; {leave.days} hari
                </div>
                <div className="font-semibold text-amber-800">
                  {leave.startDate === leave.endDate
                    ? leave.startDate
                    : `${leave.startDate} s/d ${leave.endDate}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Izin & Cuti */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <SectionHeader
          icon={<Clock3 className="w-4 h-4" />}
          title="Izin & Cuti"
          count={queue.izin.pending.length}
          hint="Bawahan langsung"
        />
        {queue.izin.pending.length === 0 ? (
          <p className="text-xs text-slate-500">{emptyHint}</p>
        ) : (
          <div className="space-y-2.5">
            {queue.izin.pending.map((item) => {
              const emp = employees.find((e) => e.uid === item.uid);
              return (
                <ApprovalCard
                  key={item.id}
                  title={`${item.employeeName} (${item.nik})`}
                  meta={`${item.type} • ${item.startDate} s/d ${item.endDate} • ${item.days} hari • Sisa Kuota: ${emp?.leaveQuota ?? 12} hari • diajukan ${item.createdLabel}`}
                  status={item.status}
                  statusBadge={
                    <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                      Menunggu Validasi Anda (Supervisor)
                    </span>
                  }
                  reason={item.reason}
                  approveLabel={busyKey === `${item.id}:Disetujui` ? 'Menyimpan...' : 'Validasi & ACC'}
                  onApprove={
                    busyKey
                      ? undefined
                      : () => void runReview(item.id, `Izin ${item.employeeName}`, reviewLeave, item.id, 'Disetujui')
                  }
                  onReject={
                    busyKey
                      ? undefined
                      : () => void runReview(item.id, `Izin ${item.employeeName}`, reviewLeave, item.id, 'Ditolak')
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Lembur */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <SectionHeader
          icon={<Timer className="w-4 h-4" />}
          title="Lembur"
          count={queue.lembur.pending.length}
          hint="Estimasi upah lembur"
        />
        {queue.lembur.pending.length === 0 ? (
          <p className="text-xs text-slate-500">{emptyHint}</p>
        ) : (
          <div className="space-y-2.5">
            {queue.lembur.pending.map((item) => (
              <ApprovalCard
                key={item.id}
                title={`${item.employeeName} (${item.nik})`}
                meta={`${item.date} • ${item.startTime}-${item.endTime} • ${item.hours} jam • estimasi ${formatRupiah(item.estimatedPay)}`}
                status={item.status}
                reason={item.reason}
                approveLabel={busyKey === `${item.id}:Disetujui` ? 'Menyimpan...' : 'Setujui'}
                onApprove={
                  busyKey
                    ? undefined
                    : () => void runReview(item.id, `Lembur ${item.employeeName}`, reviewOvertime, item.id, 'Disetujui')
                }
                onReject={
                  busyKey
                    ? undefined
                    : () => void runReview(item.id, `Lembur ${item.employeeName}`, reviewOvertime, item.id, 'Ditolak')
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Tukar Shift */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <SectionHeader
          icon={<RefreshCcw className="w-4 h-4" />}
          title="Tukar Shift"
          count={queue.shift.pending.length}
          hint="Perubahan jadwal tim"
        />
        {queue.shift.pending.length === 0 ? (
          <p className="text-xs text-slate-500">{emptyHint}</p>
        ) : (
          <div className="space-y-2.5">
            {queue.shift.pending.map((item) => (
              <ApprovalCard
                key={item.id}
                title={`${item.employeeName} (${item.nik})`}
                meta={`${item.date} • ${item.fromShift} → ${item.toShift}`}
                status={item.status}
                reason={item.reason}
                approveLabel={busyKey === `${item.id}:Disetujui` ? 'Menyimpan...' : 'Setujui'}
                onApprove={
                  busyKey
                    ? undefined
                    : () => void runReview(item.id, `Tukar shift ${item.employeeName}`, reviewShiftSwap, item.id, 'Disetujui')
                }
                onReject={
                  busyKey
                    ? undefined
                    : () => void runReview(item.id, `Tukar shift ${item.employeeName}`, reviewShiftSwap, item.id, 'Ditolak')
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Exit Clearance */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <SectionHeader
          icon={<DoorOpen className="w-4 h-4" />}
          title="Exit Clearance"
          count={queue.exit.pending.length}
          hint="Serah terima & checklist"
        />
        {queue.exit.pending.length === 0 ? (
          <p className="text-xs text-slate-500">{emptyHint}</p>
        ) : (
          <div className="space-y-2.5">
            {queue.exit.pending.map((item) => {
              const cleared = item.checklist.filter((c) => c.cleared).length;
              return (
                <ApprovalCard
                  key={item.id}
                  title={`${item.employeeName} (${item.nik})`}
                  meta={`${item.position} • hari kerja terakhir ${item.lastWorkingDate} • checklist ${cleared}/${item.checklist.length}`}
                  status={item.status}
                  reason={item.reason}
                  approveLabel={busyKey === `${item.id}:Disetujui` ? 'Menyimpan...' : 'Setujui'}
                  onApprove={
                    busyKey
                      ? undefined
                      : () => void runReview(item.id, `Exit clearance ${item.employeeName}`, reviewExitClearance, item.id, 'Disetujui')
                  }
                  onReject={
                    busyKey
                      ? undefined
                      : () => void runReview(item.id, `Exit clearance ${item.employeeName}`, reviewExitClearance, item.id, 'Ditolak')
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Riwayat keputusan tim */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <SectionHeader
          icon={<History className="w-4 h-4" />}
          title="Riwayat Keputusan Tim"
          count={0}
          hint="8 terbaru"
        />
        {decided.length === 0 ? (
          <p className="text-xs text-slate-500">Belum ada pengajuan bawahan yang diputuskan.</p>
        ) : (
          <ul className="space-y-2">
            {decided.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#F9FBFE] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0B2453] truncate">
                    {entry.item.employeeName} &bull; {entry.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {'date' in entry.item
                      ? `${entry.item.date}${entry.item.reviewedBy ? ` • oleh ${entry.item.reviewedBy}` : ''}`
                      : entry.item.reviewedBy
                        ? `oleh ${entry.item.reviewedBy}`
                        : ''}
                  </div>
                </div>
                <span
                  className={`text-xs font-extrabold shrink-0 ${
                    entry.item.status === 'Disetujui' ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {entry.item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Anggota tim */}
      <section className="rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-3">
        <SectionHeader
          icon={<Users className="w-4 h-4" />}
          title="Anggota Tim"
          count={0}
          hint={`${teamMembers.length} bawahan langsung`}
        />
        {teamMembers.length === 0 ? (
          <p className="text-xs text-slate-500">
            Belum ada karyawan yang menunjuk Anda sebagai atasan langsung.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teamMembers.map((emp) => (
              <div
                key={emp.uid}
                className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 space-y-1"
              >
                <div className="text-sm font-extrabold text-[#0B2453] truncate">{emp.name}</div>
                <div className="text-[11px] text-slate-600 truncate">
                  {emp.nik} &bull; {emp.position}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="w-3.5 h-3.5" /> {emp.shiftCode}
                  </span>
                  <span className="tabular-nums">Cuti {emp.leaveQuota} hari</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

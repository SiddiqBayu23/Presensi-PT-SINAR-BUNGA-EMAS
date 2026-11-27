import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  CheckSquare,
  DoorOpen,
  FileText,
  Square,
  Timer,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import type { LeaveRequest, ShiftCode, SubmissionSubTab } from '../../types/hris';
import {
  calculateInclusiveDays,
  calculateOvertimeEstimate,
  effectiveShiftForDate,
  formatRupiah,
  resolveDivisionShiftRule,
  shiftTemplateName,
} from '../../utils/hrisLogic';

interface SubmissionsViewProps {
  activeSubTab: SubmissionSubTab;
  onChangeSubTab: (sub: SubmissionSubTab) => void;
}

export function SubmissionsView({ activeSubTab, onChangeSubTab }: SubmissionsViewProps) {
  const {
    currentUser,
    employees,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    wibNow,
    submitLeave,
    submitOvertime,
    submitShiftSwap,
    reviewShiftSwapPeer,
    submitExitClearance,
    toggleExitChecklistItem,
    divisionShiftRules,
    schedules,
    shiftTemplateFor,
  } = useHris();

  const [leaveType, setLeaveType] = useState<LeaveRequest['type']>('Cuti Tahunan');
  const [leaveStart, setLeaveStart] = useState(wibNow.isoDate);
  const [leaveEnd, setLeaveEnd] = useState(wibNow.isoDate);
  const [leaveReason, setLeaveReason] = useState('');

  const [otDate, setOtDate] = useState(wibNow.isoDate);
  const [otStart, setOtStart] = useState('17:00');
  const [otEnd, setOtEnd] = useState('19:00');
  const [otReason, setOtReason] = useState('');

  const [swDate, setSwDate] = useState(wibNow.isoDate);
  const [swToShift, setSwToShift] = useState<ShiftCode>('SIANG');
  const [swTargetUid, setSwTargetUid] = useState<string>('');
  const [swReason, setSwReason] = useState('');
  const [peerBusyId, setPeerBusyId] = useState<string | null>(null);

  const [exDate, setExDate] = useState('2026-12-31');
  const [exReason, setExReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!currentUser) return null;

  const myLeaves = leaves.filter((l) => l.uid === currentUser.uid);
  const myOvertimes = overtimes.filter((o) => o.uid === currentUser.uid);
  const myShiftSwaps = shiftSwaps.filter((s) => s.uid === currentUser.uid);
  const myExits = exitClearances.filter((e) => e.uid === currentUser.uid);

  // Rekan satu divisi yang bisa diajak bertukar jadwal
  const divisionColleagues = useMemo(() => {
    return employees.filter(
      (e) => e.division === currentUser.division && e.uid !== currentUser.uid && e.active
    );
  }, [employees, currentUser.division, currentUser.uid]);

  // Permintaan tukar shift yang masuk dari rekan kepada saya
  const incomingShiftSwaps = useMemo(() => {
    return shiftSwaps.filter((s) => s.targetUid === currentUser.uid);
  }, [shiftSwaps, currentUser.uid]);

  // Shift efektif pada tanggal pengajuan (jadwal/tukar shift sebelumnya) & shift yang boleh dipakai divisi.
  const effectiveShift = effectiveShiftForDate(
    currentUser.uid,
    swDate,
    schedules,
    currentUser.shiftCode
  );
  const allowedShiftCodes = resolveDivisionShiftRule(
    currentUser.division,
    divisionShiftRules
  ).allowedShiftCodes;
  // Shift tujuan yang valid harus berbeda dari shift efektif pada tanggal tersebut.
  const availableShiftCodes = useMemo(
    () => allowedShiftCodes.filter((code) => code !== effectiveShift),
    [allowedShiftCodes, effectiveShift]
  );

  useEffect(() => {
    if (availableShiftCodes.length > 0 && !availableShiftCodes.includes(swToShift)) {
      setSwToShift(availableShiftCodes[0]);
    }
  }, [availableShiftCodes, swToShift]);

  const previewLeaveDays = calculateInclusiveDays(leaveStart, leaveEnd);
  const previewOt = calculateOvertimeEstimate(otStart, otEnd, currentUser.baseSalary);

  const statusTextClass = (status: string) => {
    if (status === 'Disetujui') return 'text-emerald-700';
    if (status === 'Ditolak') return 'text-red-700';
    return 'text-amber-700';
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await submitLeave({
      type: leaveType,
      startDate: leaveStart,
      endDate: leaveEnd,
      reason: leaveReason,
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    setLeaveReason('');
    setFeedback({ type: 'ok', text: 'Pengajuan Izin/Cuti berhasil disimpan ke Firebase.' });
  };

  const handleOvertimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await submitOvertime({
      date: otDate,
      startTime: otStart,
      endTime: otEnd,
      reason: otReason,
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    setOtReason('');
    setFeedback({ type: 'ok', text: 'Pengajuan Lembur berhasil disimpan ke Firebase.' });
  };

  const handleShiftSwapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await submitShiftSwap({
      date: swDate,
      toShift: swToShift,
      reason: swReason,
      targetUid: swTargetUid || undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    setSwReason('');
    setSwTargetUid('');
    setFeedback({
      type: 'ok',
      text: swTargetUid
        ? 'Pengajuan Tukar Shift berhasil dikirim ke rekan untuk persetujuan awal (Tahap 1).'
        : 'Pengajuan Tukar Shift berhasil dikirim ke Atasan / HRD.',
    });
  };

  const handlePeerReview = async (id: string, action: 'Disetujui' | 'Ditolak') => {
    setPeerBusyId(id);
    const res = await reviewShiftSwapPeer(id, action);
    setPeerBusyId(null);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error ?? 'Gagal memproses keputusan.' });
    } else {
      setFeedback({
        type: 'ok',
        text: `Permintaan tukar shift berhasil ${
          action === 'Disetujui'
            ? 'disetujui. Pengajuan kini diteruskan ke Atasan / HRD.'
            : 'ditolak.'
        }`,
      });
    }
  };

  const handleExitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await submitExitClearance({
      lastWorkingDate: exDate,
      reason: exReason,
    });
    setSubmitting(false);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error });
      return;
    }
    setExReason('');
    setFeedback({ type: 'ok', text: 'Pengajuan Exit Clearance berhasil disimpan ke Firebase.' });
  };

  const subTabs: Array<{ id: SubmissionSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'izin', label: 'Izin / Cuti', icon: <FileText className="w-4 h-4" /> },
    { id: 'lembur', label: 'Lembur', icon: <Timer className="w-4 h-4" /> },
    { id: 'shift', label: 'Tukar Shift', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { id: 'exit', label: 'Exit Clear', icon: <DoorOpen className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Segmented Sub-Tab Bar */}
      <div className="rounded-2xl bg-white p-1.5 shadow-sm border border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {subTabs.map((tab) => {
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setFeedback(null);
                onChangeSubTab(tab.id);
              }}
              className={`h-11 rounded-xl px-3 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-[#0B2453] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#0B2453]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl px-4 py-3 text-xs sm:text-sm font-semibold flex items-center gap-2 border ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* TAB 1: IZIN / CUTI */}
      {activeSubTab === 'izin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-5 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
                <h2 className="text-base font-extrabold text-[#0B2453]">Ajukan Izin / Cuti</h2>
              </div>
              <span className="text-xs font-bold text-[#9A6F0B] tabular-nums">
                Sisa Cuti: {currentUser.leaveQuota} hari
              </span>
            </div>

            <form onSubmit={handleLeaveSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="leave-type" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Jenis Pengajuan
                </label>
                <select
                  id="leave-type"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveRequest['type'])}
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none"
                >
                  <option value="Cuti Tahunan">Cuti Tahunan</option>
                  <option value="Izin Sakit">Izin Sakit</option>
                  <option value="Izin Khusus">Izin Khusus</option>
                  <option value="Izin Pribadi">Izin Pribadi</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="leave-start" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Tanggal Mulai
                  </label>
                  <input
                    id="leave-start"
                    type="date"
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B2453] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="leave-end" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Tanggal Selesai
                  </label>
                  <input
                    id="leave-end"
                    type="date"
                    value={leaveEnd}
                    onChange={(e) => setLeaveEnd(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B2453] focus:outline-none"
                  />
                </div>
              </div>

              <div className="text-xs font-semibold text-slate-600 tabular-nums">
                Durasi pengajuan: <strong className="text-[#0B2453]">{previewLeaveDays} hari</strong>
              </div>

              <div>
                <label htmlFor="leave-reason" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Alasan / Keterangan *
                </label>
                <textarea
                  id="leave-reason"
                  rows={3}
                  maxLength={500}
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Tuliskan alasan izin atau cuti Anda..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || availableShiftCodes.length === 0}
                className="w-full h-11 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Kirim Pengajuan Izin / Cuti'}
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">Riwayat Izin &amp; Cuti Anda</h2>
            </div>
            {myLeaves.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada pengajuan izin atau cuti.</p>
            ) : (
              <div className="space-y-3">
                {myLeaves.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#0B2453]">{item.type}</span>
                      <span className={`text-xs font-extrabold ${statusTextClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-600 tabular-nums">
                      {item.startDate} s/d {item.endDate} ({item.days} hari)
                    </div>
                    <p className="text-xs text-slate-600">{item.reason}</p>
                    <div className="text-[11px] text-slate-400">
                      Diajukan {item.createdLabel}
                      {item.reviewedBy ? ` • Diproses oleh ${item.reviewedBy}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: LEMBUR */}
      {activeSubTab === 'lembur' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-5 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">Ajukan Lembur (SPL)</h2>
            </div>

            <form onSubmit={handleOvertimeSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="ot-date" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Tanggal Lembur
                </label>
                <input
                  id="ot-date"
                  type="date"
                  value={otDate}
                  onChange={(e) => setOtDate(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ot-start" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Jam Mulai
                  </label>
                  <input
                    id="ot-start"
                    type="time"
                    value={otStart}
                    onChange={(e) => setOtStart(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-mono focus:border-[#0B2453] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="ot-end" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Jam Selesai
                  </label>
                  <input
                    id="ot-end"
                    type="time"
                    value={otEnd}
                    onChange={(e) => setOtEnd(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-mono focus:border-[#0B2453] focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-[#FFFBEB] border border-[#F5D686] p-3 text-xs text-[#784B08] flex items-center justify-between tabular-nums">
                <span>Estimasi ({previewOt.hours} jam)</span>
                <strong className="font-mono text-sm text-[#0B2453]">
                  {formatRupiah(previewOt.estimatedPay)}
                </strong>
              </div>

              <div>
                <label htmlFor="ot-reason" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Uraian Pekerjaan Lembur *
                </label>
                <textarea
                  id="ot-reason"
                  rows={3}
                  maxLength={500}
                  value={otReason}
                  onChange={(e) => setOtReason(e.target.value)}
                  placeholder="Jelaskan tugas yang dikerjakan saat lembur..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || availableShiftCodes.length === 0}
                className="w-full h-11 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Kirim Pengajuan Lembur'}
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">Riwayat Lembur Anda</h2>
            </div>
            {myOvertimes.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada pengajuan lembur.</p>
            ) : (
              <div className="space-y-3">
                {myOvertimes.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-4 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#0B2453] font-mono tabular-nums">
                        {item.date} &bull; {item.startTime}–{item.endTime} ({item.hours} jam)
                      </span>
                      <span className={`text-xs font-extrabold ${statusTextClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-emerald-700 font-mono tabular-nums">
                      Estimasi Insentif: {formatRupiah(item.estimatedPay)}
                    </div>
                    <p className="text-xs text-slate-600">{item.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: TUKAR SHIFT */}
      {activeSubTab === 'shift' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-5 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">Pengajuan Tukar Shift</h2>
            </div>

            <form onSubmit={handleShiftSwapSubmit} className="space-y-3.5">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs">
                Shift pada {swDate}:{' '}
                <strong className="text-[#0B2453]">
                  {shiftTemplateFor(effectiveShift, currentUser.division).label}
                </strong>
                <span className="block text-[11px] text-slate-500 mt-0.5">
                  Shift tersedia untuk divisi {currentUser.division}:{' '}
                  {allowedShiftCodes.map((code) => shiftTemplateName(code)).join(' • ')}
                </span>
              </div>

              <div>
                <label htmlFor="sw-date" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Tanggal Efektif
                </label>
                <input
                  id="sw-date"
                  type="date"
                  value={swDate}
                  onChange={(e) => setSwDate(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              {/* Pemilihan Rekan yang Diajak Tukar Shift */}
              <div>
                <label htmlFor="sw-partner" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Rekan yang Diajak Tukar Jadwal (Satu Divisi)
                </label>
                <select
                  id="sw-partner"
                  value={swTargetUid}
                  onChange={(e) => setSwTargetUid(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none font-medium"
                >
                  <option value="">-- Tanpa Rekan Spesifik (Langsung ke Atasan) --</option>
                  {divisionColleagues.map((colleague) => (
                    <option key={colleague.uid} value={colleague.uid}>
                      {colleague.name} ({colleague.position})
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-slate-500 leading-relaxed bg-blue-50/60 border border-blue-200/60 p-2 rounded-lg">
                  💡 <strong>Alur 2 Tahap:</strong> Bila memilih rekan, rekan Anda harus
                  menyetujui terlebih dahulu (Tahap 1). Setelah rekan setuju, pengajuan otomatis
                  diteruskan ke Supervisor / HRD (Tahap 2).
                </div>
              </div>

              {availableShiftCodes.length === 0 ? (
                <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-xs text-amber-900 leading-relaxed">
                  Divisi <strong>{currentUser.division}</strong> saat ini hanya memiliki 1 aturan shift (
                  {shiftTemplateName(effectiveShift)}), sehingga belum ada shift alternatif
                  lain untuk ditukar. Hubungi Admin HRD untuk menambah shift divisi.
                </div>
              ) : (
                <div>
                  <label htmlFor="sw-target" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Shift Tujuan Anda
                  </label>
                  <select
                    id="sw-target"
                    value={swToShift}
                    onChange={(e) => setSwToShift(e.target.value as ShiftCode)}
                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none"
                  >
                    {availableShiftCodes.map((code) => {
                      const tpl = shiftTemplateFor(code, currentUser.division);
                      return (
                        <option key={code} value={code}>
                          {tpl.name} ({tpl.startTime}-{tpl.endTime})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="sw-reason" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Alasan Perubahan Shift *
                </label>
                <textarea
                  id="sw-reason"
                  rows={3}
                  maxLength={500}
                  value={swReason}
                  onChange={(e) => setSwReason(e.target.value)}
                  placeholder="Tuliskan alasan perubahan shift..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || availableShiftCodes.length === 0}
                className="w-full h-11 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Kirim Pengajuan Tukar Shift'}
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 space-y-5">
            {/* Permintaan Tukar Shift Masuk dari Rekan (Tahap 1) */}
            {incomingShiftSwaps.length > 0 && (
              <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-amber-300 bg-amber-50/20 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-amber-500" aria-hidden="true" />
                  <h2 className="text-base font-extrabold text-[#0B2453]">
                    Permintaan Masuk dari Rekan ({incomingShiftSwaps.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {incomingShiftSwaps.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-amber-200 bg-white p-4 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-extrabold text-[#0B2453]">
                            {item.employeeName} ({item.nik})
                          </div>
                          <div className="text-xs font-semibold text-slate-600 mt-0.5">
                            Mengajukan tukar shift pada <strong>{item.date}</strong>: ingin beralih
                            ke shift <strong>{item.toShift}</strong> (shift asal: {item.fromShift})
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            item.peerStatus === 'Disetujui'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.peerStatus === 'Ditolak'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.peerStatus === 'Disetujui'
                            ? 'Anda Setujui'
                            : item.peerStatus === 'Ditolak'
                              ? 'Anda Tolak'
                              : 'Menunggu Respon Anda'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        &quot;{item.reason}&quot;
                      </p>

                      {item.peerStatus === 'Menunggu' && item.status === 'Menunggu' && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled={peerBusyId === item.id}
                            onClick={() => void handlePeerReview(item.id, 'Disetujui')}
                            className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition-colors"
                          >
                            {peerBusyId === item.id ? 'Memproses...' : 'Setujui Tukar Jadwal'}
                          </button>
                          <button
                            type="button"
                            disabled={peerBusyId === item.id}
                            onClick={() => void handlePeerReview(item.id, 'Ditolak')}
                            className="flex-1 h-9 rounded-xl bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs cursor-pointer disabled:opacity-50 transition-colors"
                          >
                            Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Riwayat Pengajuan Saya */}
            <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
                <h2 className="text-base font-extrabold text-[#0B2453]">Riwayat Pengajuan Saya</h2>
              </div>
              {myShiftSwaps.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada pengajuan tukar shift.</p>
              ) : (
                <div className="space-y-3">
                  {myShiftSwaps.map((item) => {
                    const hasPeer = Boolean(item.targetEmployeeName);
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-4 space-y-2"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <span className="text-sm font-bold text-[#0B2453]">
                            {item.fromShift} &rarr; {item.toShift} ({item.date})
                          </span>
                          <span className={`text-xs font-extrabold ${statusTextClass(item.status)}`}>
                            {item.status}
                          </span>
                        </div>

                        {hasPeer && (
                          <div className="text-[11px] font-medium text-slate-600 bg-white p-2 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-1">
                            <span>Diajak tukar: <strong>{item.targetEmployeeName}</strong></span>
                            <span
                              className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                item.peerStatus === 'Disetujui'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : item.peerStatus === 'Ditolak'
                                    ? 'bg-rose-50 text-rose-800'
                                    : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              Tahap 1 Rekan: {item.peerStatus ?? 'Menunggu'}
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-slate-600">{item.reason}</p>
                        {item.reviewedBy && (
                          <p className="text-[11px] text-slate-400">
                            Diputuskan oleh: {item.reviewedBy}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: EXIT CLEARANCE */}
      {activeSubTab === 'exit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <section className="lg:col-span-5 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">
                Pengajuan Exit Clearance
              </h2>
            </div>

            <form onSubmit={handleExitSubmit} className="space-y-3.5">
              <div>
                <label htmlFor="ex-date" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Hari Kerja Terakhir
                </label>
                <input
                  id="ex-date"
                  type="date"
                  value={exDate}
                  onChange={(e) => setExDate(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="ex-reason" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Alasan Pengunduran Diri / Akhir Kontrak *
                </label>
                <textarea
                  id="ex-reason"
                  rows={3}
                  maxLength={500}
                  value={exReason}
                  onChange={(e) => setExReason(e.target.value)}
                  placeholder="Tuliskan alasan dan catatan serah terima..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-[#C69214] to-[#A6760B] text-white text-sm font-bold hover:brightness-105 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Mengirim...' : 'Ajukan Exit Clearance'}
              </button>
            </form>
          </section>

          <section className="lg:col-span-7 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">
                Checklist Exit Clearance Anda
              </h2>
            </div>

            {myExits.length === 0 ? (
              <p className="text-sm text-slate-500">
                Tidak ada proses Exit Clearance yang sedang berjalan.
              </p>
            ) : (
              <div className="space-y-4">
                {myExits.map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-[#0B2453]">
                          Hari Terakhir: {ex.lastWorkingDate}
                        </div>
                        <div className="text-xs text-slate-600">{ex.reason}</div>
                      </div>
                      <span className={`text-xs font-extrabold ${statusTextClass(ex.status)}`}>
                        {ex.status}
                      </span>
                    </div>

                    <div className="space-y-2 pt-1">
                      {ex.checklist.map((chk) => (
                        <button
                          key={chk.department}
                          type="button"
                          disabled={ex.status !== 'Menunggu'}
                          onClick={() => void toggleExitChecklistItem(ex.id, chk.department)}
                          className="w-full text-left rounded-xl bg-white border border-slate-200 px-3 py-2.5 flex items-center gap-2.5 hover:border-[#0B2453]/30 disabled:opacity-70 transition-colors cursor-pointer"
                        >
                          {chk.cleared ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-[#0B2453]">
                              {chk.department}:
                            </span>{' '}
                            <span className="text-xs text-slate-600">{chk.task}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

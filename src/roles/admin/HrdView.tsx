import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  IdCard,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import { ApprovalCard } from '../../shared/ApprovalCard';
import { EmployeeAvatar } from '../../shared/EmployeeAvatar';
import { ScheduleCalendarView } from '../../shared/ScheduleCalendarView';
import { useSlidingIndicator } from '../../shared/useSlidingIndicator';
import {
  ROLE_LABELS,
  type Division,
  type ShiftCode,
  type UserRole,
} from '../../types/hris';
import { EXCEL_MIME, buildAttendanceExcel, downloadTextFile } from '../../utils/exportUtils';
import {
  defaultShiftForDivision,
  formatDuration,
  formatRupiah,
  isIsoDateWithinRange,
  resolveDivisionShiftRule,
  shiftTemplateName,
} from '../../utils/hrisLogic';
import { AdminPayrollPanel } from './AdminPayrollPanel';
import { EmployeeDetailPage } from './EmployeeDetailPage';
import { ExportAllPanel } from './ExportAllPanel';
import { DivisiShiftPanel } from './DivisiShiftPanel';
import { JadwalShiftPanel } from './JadwalShiftPanel';
import { SupervisorPanelView } from '../supervisor/SupervisorPanelView';

export type HrdSubTab =
  | 'persetujuan'
  | 'karyawan'
  | 'absensi'
  | 'jadwal'
  | 'payroll'
  | 'divisi'
  | 'supervisor'
  | 'export';

interface HrdViewProps {
  activeSubTab?: HrdSubTab;
  onChangeSubTab?: (tab: HrdSubTab) => void;
  /** Kata kunci awal untuk tabel Data Karyawan (dipakai tombol akses cepat dari beranda admin). */
  employeeSearchSeed?: string;
  /** uid karyawan yang halaman detailnya dibuka (null = tabel Data Karyawan). */
  detailUid?: string | null;
  onOpenDetail?: (uid: string) => void;
  onCloseDetail?: () => void;
}

export function HrdView({
  activeSubTab,
  onChangeSubTab,
  employeeSearchSeed = '',
  detailUid = null,
  onOpenDetail,
  onCloseDetail,
}: HrdViewProps = {}) {
  const {
    currentUser,
    employees,
    attendance,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    localPhotos,
    divisions,
    validateAttendance,
    wibNow,
    reviewLeave,
    reviewOvertime,
    reviewShiftSwap,
    reviewExitClearance,
    addEmployeeByHrd,
    isFirebaseSynced,
    divisionShiftRules,
    shiftTemplateFor,
  } = useHris();

  const [internalSubTab, setInternalSubTab] = useState<HrdSubTab>('persetujuan');
  const subTab = activeSubTab ?? internalSubTab;
  const setSubTab = (tab: HrdSubTab) => {
    setInternalSubTab(tab);
    onChangeSubTab?.(tab);
  };
  const { containerRef: subNavRef, rect: subNavPill } = useSlidingIndicator([subTab]);
  const [searchEmp, setSearchEmp] = useState(employeeSearchSeed);
  const appliedSearchSeed = useRef(employeeSearchSeed);
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingEmp, setSubmittingEmp] = useState(false);

  // Panel supervisor yang sedang dipantau Admin HRD (kosong = supervisor pertama)
  const [panelSupervisorUid, setPanelSupervisorUid] = useState<string>('');

  // Photo modal preview
  const [photoPreview, setPhotoPreview] = useState<{ url: string; title: string } | null>(null);

  // Attendance validation status filter
  const [attendanceValidationFilter, setAttendanceValidationFilter] = useState<
    'ALL' | 'Menunggu' | 'Valid' | 'Ditolak'
  >('ALL');

  // Simple Email-Based Add Employee form state
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empForm, setEmpForm] = useState({
    email: '',
    name: '',
    position: '',
    division: (divisions[0] ?? '') as Division,
    shiftCode: defaultShiftForDivision(divisions[0] ?? 'HRD', divisionShiftRules),
    role: 'employee' as UserRole,
    supervisorUid: '',
    initialPassword: '',
  });

  // Tombol akses cepat karyawan mengisi kolom pencarian tabel data karyawan.
  useEffect(() => {
    if (employeeSearchSeed === appliedSearchSeed.current) return;
    appliedSearchSeed.current = employeeSearchSeed;
    if (employeeSearchSeed) setSearchEmp(employeeSearchSeed);
  }, [employeeSearchSeed]);

  /** Shift yang diizinkan untuk satu divisi (aturan jam kerja per divisi). */
  const allowedShiftCodesFor = (division: Division): ShiftCode[] =>
    resolveDivisionShiftRule(division, divisionShiftRules).allowedShiftCodes;

  const showToast = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2800);
  };

  const filteredEmployees = useMemo(() => {
    const q = searchEmp.trim().toLowerCase();
    return employees.filter((e) => {
      const matchDiv = divisionFilter === 'ALL' || e.division === divisionFilter;
      const matchQ =
        !q ||
        e.nik.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q);
      return matchDiv && matchQ;
    });
  }, [employees, searchEmp, divisionFilter]);

  /** Keterangan atasan langsung pengaju (routing persetujuan). */
  const routingLabel = (supervisorUid: string) => {
    if (!supervisorUid) return ' • langsung ke HRD';
    const supervisor = employees.find((e) => e.uid === supervisorUid);
    return supervisor ? ` • atasan: ${supervisor.name}` : ' • langsung ke HRD';
  };

  /** Supervisor aktif pada satu divisi (kandidat atasan langsung). */
  const divisionSupervisors = (division: Division) =>
    employees.filter((e) => e.role === 'supervisor' && e.division === division);

  /** Semua supervisor untuk pemantauan panel oleh Admin HRD. */
  const supervisors = useMemo(
    () => employees.filter((e) => e.role === 'supervisor'),
    [employees]
  );
  const activeSupervisorUid = panelSupervisorUid || supervisors[0]?.uid || '';

  if (!currentUser || currentUser.role !== 'hrd') return null;

  const pendingLeaves = leaves.filter((l) => l.status === 'Menunggu');
  const pendingOvertimes = overtimes.filter((o) => o.status === 'Menunggu');
  const pendingSwaps = shiftSwaps.filter((s) => s.status === 'Menunggu');
  const pendingExits = exitClearances.filter((e) => e.status === 'Menunggu');
  const totalPending =
    pendingLeaves.length + pendingOvertimes.length + pendingSwaps.length + pendingExits.length;
  const presentToday = attendance.filter((a) => a.date === wibNow.isoDate).length;

  /** Izin/cuti disetujui yang mencakup hari ini: karyawannya tidak bisa absen. */
  const leavesToday = useMemo(
    () =>
      leaves.filter(
        (leave) =>
          leave.status === 'Disetujui' &&
          isIsoDateWithinRange(wibNow.isoDate, leave.startDate, leave.endDate)
      ),
    [leaves, wibNow.isoDate]
  );

  const handleExportExcel = () => {
    const xml = buildAttendanceExcel(attendance);
    downloadTextFile(
      `rekap-absensi-sbum-${wibNow.isoDate}.xls`,
      xml,
      EXCEL_MIME
    );
    showToast(`File Excel rekap absensi (${attendance.length} baris) berhasil diunduh.`);
  };

  const activeFormDivision = divisions.includes(empForm.division)
    ? empForm.division
    : (divisions[0] ?? '');

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingEmp(true);
    try {
      const res = await addEmployeeByHrd({
        ...empForm,
        division: activeFormDivision,
      });
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      const nextDiv = divisions[0] ?? '';
      setShowAddEmp(false);
      setEmpForm({
        email: '',
        name: '',
        position: '',
        division: nextDiv,
        shiftCode: defaultShiftForDivision(nextDiv || 'HRD', divisionShiftRules),
        role: 'employee',
        supervisorUid: '',
        initialPassword: '',
      });
      showToast(
        isFirebaseSynced
          ? `Karyawan ${res.employee.name} (${res.employee.nik}) dibuat. Akun login aktif setelah email verifikasi diklik karyawan.`
          : `Karyawan ${res.employee.name} (${res.employee.nik}) ditambahkan ke direktori (mode demo, belum ada akun Firebase).`
      );
    } finally {
      setSubmittingEmp(false);
    }
  };

  const detailEmployee = detailUid ? employees.find((emp) => emp.uid === detailUid) ?? null : null;

  /** Nama atasan langsung; kosong berarti pengajuan langsung ke HRD. */
  const supervisorNameOf = (uid: string) =>
    employees.find((emp) => emp.uid === uid)?.name ?? 'Langsung ke HRD';

  if (detailEmployee) {
    return (
      <EmployeeDetailPage
        employee={detailEmployee}
        onBack={() => onCloseDetail?.()}
        onShowToast={showToast}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI Summary Strip */}
      <div className="no-print grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Total Karyawan</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {employees.length}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Hadir Hari Ini</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-700 tabular-nums">
            {presentToday}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Menunggu Approval</div>
          <div className="mt-1 text-2xl font-extrabold text-[#C69214] tabular-nums">
            {totalPending}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Total Absensi</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {attendance.length}
          </div>
        </div>
      </div>

      {/* HRD Sub-Tab Navigation */}
      <div
        ref={subNavRef}
        className="no-print relative rounded-2xl bg-white p-1.5 shadow-sm border border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5"
      >
        {subNavPill && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-xl bg-[#0B2453] shadow-sm transition-[left,top,width,height] duration-300 ease-out"
            style={{
              left: subNavPill.left,
              top: subNavPill.top,
              width: subNavPill.width,
              height: subNavPill.height,
            }}
          />
        )}
        {(
          [
            {
              id: 'persetujuan',
              label: `Persetujuan (${totalPending})`,
              icon: <ClipboardCheck className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'karyawan',
              label: 'Data Karyawan',
              icon: <Users className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'absensi',
              label: 'Validasi Absensi',
              icon: <Camera className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'jadwal',
              label: 'Jadwal & Shift',
              icon: <CalendarDays className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'payroll',
              label: 'Slip Gaji',
              icon: <Wallet className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'divisi',
              label: 'Kelola Divisi',
              icon: <Building2 className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'supervisor',
              label: 'Supervisor',
              icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
            },
            {
              id: 'export',
              label: 'Export Semua',
              icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
            },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            data-nav-active={subTab === t.id ? 'true' : undefined}
            onClick={() => setSubTab(t.id)}
            className={`relative z-10 h-11 rounded-xl px-3 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors duration-200 whitespace-nowrap cursor-pointer ${
              subTab === t.id
                ? 'text-white'
                : t.id === 'export'
                  ? 'bg-[#FFF8E6] text-[#8E6307] hover:bg-[#FCEEC5]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#0B2453]'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className="no-print rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm font-semibold text-emerald-800 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* SUBTAB 1: PERSETUJUAN */}
      {subTab === 'persetujuan' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Izin & Cuti Approvals */}
          <section className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-[#0B2453]">Persetujuan Izin &amp; Cuti</h2>
              <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                {pendingLeaves.length} menunggu
              </span>
            </div>
            {leaves.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada pengajuan izin/cuti.</p>
            ) : (
              <div className="space-y-2.5">
                {leaves.map((lv) => {
                  const emp = employees.find((e) => e.uid === lv.uid);
                  const sup = lv.supervisorUid ? employees.find((e) => e.uid === lv.supervisorUid) : null;
                  const isSupPending = lv.supervisorUid && lv.supervisorStatus !== 'Disetujui';

                  let statusBadgeText = 'Menunggu';
                  let statusBadgeClass = 'bg-amber-100 text-amber-800';

                  if (lv.status === 'Disetujui') {
                    statusBadgeText = '✅ ACC Lengkap (Disetujui)';
                    statusBadgeClass = 'bg-emerald-100 text-emerald-800';
                  } else if (lv.status === 'Ditolak') {
                    statusBadgeText = `❌ Ditolak (${lv.reviewedBy || 'Atasan'})`;
                    statusBadgeClass = 'bg-rose-100 text-rose-800';
                  } else if (isSupPending) {
                    statusBadgeText = `⏳ Belum ACC: Supervisor (${sup?.name || 'Supervisor'})`;
                    statusBadgeClass = 'bg-amber-50 text-amber-800 border border-amber-300';
                  } else {
                    statusBadgeText = `⏳ Menunggu ACC Final: Admin HRD`;
                    statusBadgeClass = 'bg-blue-50 text-blue-800 border border-blue-300';
                  }

                  return (
                    <ApprovalCard
                      key={lv.id}
                      title={`${lv.employeeName} (${lv.nik})`}
                      meta={`${lv.type} • ${lv.startDate} s/d ${lv.endDate} • ${lv.days} hari • ${lv.division}${routingLabel(lv.supervisorUid ?? '')} • Sisa Kuota: ${emp?.leaveQuota ?? 12} hari`}
                      status={lv.status}
                      statusBadge={
                        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${statusBadgeClass}`}>
                          {statusBadgeText}
                        </span>
                      }
                      reason={lv.reason}
                      approveLabel="ACC &amp; Setujui Final"
                      onApprove={() => {
                        void reviewLeave(lv.id, 'Disetujui').then(() =>
                          showToast(`Izin/Cuti ${lv.employeeName} disetujui (ACC Final HRD).`)
                        );
                      }}
                      onReject={() => {
                        void reviewLeave(lv.id, 'Ditolak').then(() =>
                          showToast(`Izin/Cuti ${lv.employeeName} ditolak.`)
                        );
                      }}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Lembur + Shift Swap + Exit Approvals */}
          <section className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200/80 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-[#0B2453]">
                  Persetujuan Lembur, Shift &amp; Exit Clear
                </h2>
                <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                  {pendingOvertimes.length + pendingSwaps.length + pendingExits.length} menunggu
                </span>
              </div>

              {overtimes.length === 0 && shiftSwaps.length === 0 && exitClearances.length === 0 && (
                <p className="text-xs text-slate-500">
                  Belum ada pengajuan lembur, tukar shift, atau exit clearance.
                </p>
              )}

              {overtimes.map((ot) => (
                <ApprovalCard
                  key={ot.id}
                  title={`Lembur: ${ot.employeeName} (${ot.nik})`}
                  meta={`${ot.date} • ${ot.startTime}-${ot.endTime} • ${ot.hours} jam • ${formatRupiah(ot.estimatedPay)} • ${ot.division}${routingLabel(ot.supervisorUid ?? '')}`}
                  status={ot.status}
                  reason={ot.reason}
                  onApprove={() => {
                    void reviewOvertime(ot.id, 'Disetujui').then(() =>
                      showToast(`Lembur ${ot.employeeName} disetujui.`)
                    );
                  }}
                  onReject={() => {
                    void reviewOvertime(ot.id, 'Ditolak').then(() =>
                      showToast(`Lembur ${ot.employeeName} ditolak.`)
                    );
                  }}
                />
              ))}

              {shiftSwaps.map((sw) => {
                const peerNeedsApproval = Boolean(sw.targetUid && sw.peerStatus === 'Menunggu');
                const peerApproved = sw.targetUid && sw.peerStatus === 'Disetujui';

                return (
                  <div key={sw.id} className="space-y-1.5">
                    {peerNeedsApproval && (
                      <div className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>
                          Tahap 1: Menunggu konfirmasi rekan (
                          <strong>{sw.targetEmployeeName ?? 'rekan kerja'}</strong>) terlebih dahulu
                          sebelum dapat disetujui HRD.
                        </span>
                      </div>
                    )}
                    {peerApproved && (
                      <div className="text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>
                          Tahap 1 Selesai: Rekan (<strong>{sw.targetEmployeeName}</strong>) telah
                          menyetujui pertukaran ini. Siap disetujui HRD.
                        </span>
                      </div>
                    )}
                    <ApprovalCard
                      title={`Tukar Shift: ${sw.employeeName} (${sw.nik}) ${
                        sw.targetEmployeeName ? `↔ ${sw.targetEmployeeName}` : ''
                      }`}
                      meta={`${sw.date} • ${sw.fromShift} → ${sw.toShift} • ${sw.division}${routingLabel(
                        sw.supervisorUid ?? ''
                      )}`}
                      status={sw.status}
                      reason={sw.reason}
                      approveLabel={peerNeedsApproval ? 'Menunggu Rekan' : 'Setujui'}
                      onApprove={
                        peerNeedsApproval
                          ? undefined
                          : () => {
                              void reviewShiftSwap(sw.id, 'Disetujui').then((res) =>
                                showToast(
                                  res.ok
                                    ? `Tukar shift ${sw.employeeName} disetujui untuk ${sw.date}.`
                                    : res.error ?? 'Tukar shift gagal disetujui.'
                                )
                              );
                            }
                      }
                      onReject={() => {
                        void reviewShiftSwap(sw.id, 'Ditolak').then((res) =>
                          showToast(
                            res.ok
                              ? `Tukar shift ${sw.employeeName} ditolak.`
                              : res.error ?? 'Tukar shift gagal ditolak.'
                          )
                        );
                      }}
                    />
                  </div>
                );
              })}

              {exitClearances.map((ex) => (
                <ApprovalCard
                  key={ex.id}
                  title={`Exit Clear: ${ex.employeeName} (${ex.nik})`}
                  meta={`Hari terakhir: ${ex.lastWorkingDate} • ${ex.position} • checklist ${ex.checklist.filter((c) => c.cleared).length}/${ex.checklist.length}${routingLabel(ex.supervisorUid ?? '')}`}
                  status={ex.status}
                  reason={ex.reason}
                  approveLabel="Finalisasi Exit Clear"
                  onApprove={() => {
                    void reviewExitClearance(ex.id, 'Disetujui').then(() =>
                      showToast(`Exit Clearance ${ex.employeeName} disetujui.`)
                    );
                  }}
                  onReject={
                    ex.status === 'Menunggu'
                      ? () => {
                          void reviewExitClearance(ex.id, 'Ditolak').then(() =>
                            showToast(`Exit Clearance ${ex.employeeName} ditolak.`)
                          );
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* SUBTAB 2: DATA KARYAWAN */}
      {subTab === 'karyawan' && (
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Cari karyawan"
                  value={searchEmp}
                  onChange={(e) => setSearchEmp(e.target.value)}
                  placeholder="Cari NIK, email, nama, atau jabatan..."
                  className="w-full h-10 rounded-xl border border-slate-200 pl-9 pr-3 text-xs sm:text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>
              <select
                aria-label="Filter divisi"
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
            </div>

            <button
              type="button"
              onClick={() => setShowAddEmp((v) => !v)}
              className="h-10 px-4 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Karyawan (Email)</span>
            </button>
          </div>

          {showAddEmp && (
            <form
              onSubmit={(e) => void handleAddEmployee(e)}
              className="rounded-2xl border border-[#C69214]/40 bg-[#FFFBEB]/60 p-4 space-y-3"
            >
              <p className="text-xs font-semibold text-[#784B08]">
                Cukup masukkan email aktif, kata sandi awal, dan data dasar karyawan. NIK dibuat
                otomatis berdasarkan divisi, dan email verifikasi dikirim ke karyawan tersebut.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="email"
                  required
                  placeholder="Email Aktif (mis. budi@gmail.com)"
                  value={empForm.email}
                  onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Kata Sandi Awal (min. 6 karakter)"
                  aria-label="Kata sandi awal akun login karyawan"
                  value={empForm.initialPassword}
                  onChange={(e) => setEmpForm({ ...empForm, initialPassword: e.target.value })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Nama Lengkap"
                  value={empForm.name}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                />
                <input
                  type="text"
                  placeholder="Jabatan (opsional)"
                  value={empForm.position}
                  onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                />
                <select
                  aria-label="Pilih divisi karyawan baru"
                  value={activeFormDivision}
                  onChange={(e) => {
                    const nextDivision = e.target.value as Division;
                    setEmpForm({
                      ...empForm,
                      division: nextDivision,
                      supervisorUid: '',
                      role:
                        nextDivision === 'HRD' || empForm.role !== 'hrd' ? empForm.role : 'employee',
                      shiftCode: defaultShiftForDivision(nextDivision, divisionShiftRules),
                    });
                  }}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                >
                  {divisions.length === 0 ? (
                    <option value="">-- Buat divisi dulu di Kelola Divisi --</option>
                  ) : (
                    divisions.map((div) => (
                      <option key={div} value={div}>
                        {div}
                      </option>
                    ))
                  )}
                </select>
                <select
                  aria-label="Pilih peran karyawan baru"
                  value={empForm.role}
                  onChange={(e) =>
                    setEmpForm({ ...empForm, role: e.target.value as UserRole, supervisorUid: '' })
                  }
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                >
                  <option value="employee">Karyawan</option>
                  <option value="supervisor">Supervisor</option>
                  {activeFormDivision === 'HRD' && <option value="hrd">Admin HRD</option>}
                </select>
                <select
                  aria-label="Pilih atasan langsung karyawan baru"
                  value={empForm.supervisorUid}
                  onChange={(e) => setEmpForm({ ...empForm, supervisorUid: e.target.value })}
                  disabled={empForm.role !== 'employee'}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">Tanpa atasan (langsung HRD)</option>
                  {divisionSupervisors(activeFormDivision).map((sup) => (
                    <option key={sup.uid} value={sup.uid}>
                      {sup.name} — {sup.position}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Pilih shift karyawan baru"
                  value={empForm.shiftCode}
                  onChange={(e) => setEmpForm({ ...empForm, shiftCode: e.target.value as ShiftCode })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                >
                  {allowedShiftCodesFor(activeFormDivision || 'HRD').map((code) => {
                    const tpl = shiftTemplateFor(code, activeFormDivision || 'HRD');
                    return (
                      <option key={code} value={code}>
                        {tpl.name} ({tpl.startTime}–{tpl.endTime})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="submit"
                  disabled={submittingEmp || divisions.length === 0 || !activeFormDivision}
                  className="h-10 rounded-xl bg-[#0B2453] text-white text-xs font-bold hover:bg-[#163A7A] cursor-pointer disabled:opacity-60"
                >
                  {submittingEmp ? 'Menyimpan...' : 'Buat Akun & Simpan'}
                </button>
              </div>
            </form>
          )}

          {filteredEmployees.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-1">
              <p className="text-xs font-bold text-slate-600">Tidak ada karyawan yang cocok.</p>
              <p className="text-[11px] text-slate-500">
                Ubah kata kunci pencarian atau pilih divisi lain.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500 font-bold">
                  <th className="py-2.5 px-3">NIK</th>
                  <th className="py-2.5 px-3">Karyawan</th>
                  <th className="py-2.5 px-3">Divisi</th>
                  <th className="py-2.5 px-3">Peran</th>
                  <th className="py-2.5 px-3">Atasan Langsung</th>
                  <th className="py-2.5 px-3">Shift</th>
                  <th className="py-2.5 px-3 text-center">Kuota Izin</th>
                  <th className="py-2.5 px-3">Status Akun</th>
                  <th className="py-2.5 px-3">Kontrak</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.uid} className="hover:bg-slate-50/70 align-middle">
                    <td className="py-3 px-3 font-mono font-bold text-[#0B2453] whitespace-nowrap">
                      {emp.nik}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <EmployeeAvatar
                          name={emp.name}
                          photoUrl={emp.photoUrl}
                          className="w-9 h-9"
                          textClassName="text-[11px]"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {emp.position} &bull; {emp.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                        {emp.division}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          emp.role === 'hrd'
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : emp.role === 'supervisor'
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                              : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        {ROLE_LABELS[emp.role]}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {emp.role === 'employee' ? (
                        <span className="text-[11px] font-semibold text-slate-700">
                          {emp.supervisorUid ? supervisorNameOf(emp.supervisorUid) : 'Langsung ke HRD'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {emp.role === 'supervisor' ? 'Menerima pengajuan bawahan' : 'Akses penuh HRD'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="text-[11px] font-semibold text-slate-700">
                        {shiftTemplateName(emp.shiftCode)}
                      </div>
                      <div className="text-[10px] text-slate-500 tabular-nums">
                        {shiftTemplateFor(emp.shiftCode, emp.division).startTime}–
                        {shiftTemplateFor(emp.shiftCode, emp.division).endTime}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      <span className="font-mono font-bold text-slate-900">
                        {emp.leaveQuota ?? 12}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold"> hari</span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          emp.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {emp.active ? 'Aktif' : 'Non-Aktif'}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="text-[11px] font-bold text-[#0B2453]">{emp.contractType}</div>
                      <div
                        className={`text-[10px] font-semibold ${
                          emp.contractSigned ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {emp.contractSigned ? 'TTD Digital' : 'Belum TTD'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenDetail?.(emp.uid)}
                        title={`Buka data pribadi, KTP/KK, bank, dan jabatan ${emp.name}`}
                        aria-label={`Detail karyawan ${emp.name}`}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-extrabold bg-[#0B2453] text-white hover:bg-[#163A7A] transition-all cursor-pointer"
                      >
                        <IdCard className="w-3 h-3" />
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 3: VALIDASI ABSENSI & FOTO/GPS */}
      {subTab === 'absensi' && (
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[#0B2453]">
                Validasi Kehadiran &amp; Absensi GPS/Foto
              </h2>
              <p className="text-xs text-slate-500">
                Verifikasi foto selfie dan koordinat GPS absensi masuk dan pulang karyawan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#C69214] to-[#A6760B] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Excel</span>
              </button>
            </div>
          </div>

          {/* Karyawan izin/cuti hari ini: tidak bisa absen */}
          {leavesToday.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-3.5 space-y-2">
              <div className="text-xs font-extrabold text-amber-900 inline-flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>Karyawan Izin/Cuti Hari Ini ({leavesToday.length}) — absensi diblokir</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {leavesToday.map((leave) => (
                  <div
                    key={leave.id}
                    className="rounded-xl bg-white border border-amber-200 px-3 py-2 text-[11px]"
                  >
                    <div className="font-bold text-slate-900 truncate">{leave.employeeName}</div>
                    <div className="text-slate-500">
                      {leave.division} &bull; {leave.type}
                    </div>
                    <div className="text-amber-800 font-semibold">
                      {leave.startDate === leave.endDate
                        ? leave.startDate
                        : `${leave.startDate} s/d ${leave.endDate}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold pt-1">
            <button
              type="button"
              onClick={() => setAttendanceValidationFilter('ALL')}
              className={`h-8 px-3 rounded-lg transition-all cursor-pointer ${
                attendanceValidationFilter === 'ALL'
                  ? 'bg-[#0B2453] text-[#F4CE6A]'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({attendance.length})
            </button>
            <button
              type="button"
              onClick={() => setAttendanceValidationFilter('Menunggu')}
              className={`h-8 px-3 rounded-lg transition-all cursor-pointer ${
                attendanceValidationFilter === 'Menunggu'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Menunggu Validasi (
              {attendance.filter((a) => !a.adminValidationStatus || a.adminValidationStatus === 'Menunggu').length}
              )
            </button>
            <button
              type="button"
              onClick={() => setAttendanceValidationFilter('Valid')}
              className={`h-8 px-3 rounded-lg transition-all cursor-pointer ${
                attendanceValidationFilter === 'Valid'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Valid ({attendance.filter((a) => a.adminValidationStatus === 'Valid').length})
            </button>
            <button
              type="button"
              onClick={() => setAttendanceValidationFilter('Ditolak')}
              className={`h-8 px-3 rounded-lg transition-all cursor-pointer ${
                attendanceValidationFilter === 'Ditolak'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              Ditolak ({attendance.filter((a) => a.adminValidationStatus === 'Ditolak').length})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 pr-3 font-bold">Tanggal</th>
                  <th className="py-2.5 pr-3 font-bold">Karyawan</th>
                  <th className="py-2.5 pr-3 font-bold">Jam Kerja</th>
                  <th className="py-2.5 pr-3 font-bold">Foto Selfie</th>
                  <th className="py-2.5 pr-3 font-bold">Lokasi GPS &amp; Peta</th>
                  <th className="py-2.5 pr-3 font-bold">Status Validasi</th>
                  <th className="py-2.5 text-right font-bold">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      Belum ada data absensi tercatat.
                    </td>
                  </tr>
                ) : (
                  attendance
                    .filter((rec) => {
                      if (attendanceValidationFilter === 'ALL') return true;
                      if (attendanceValidationFilter === 'Menunggu') {
                        return !rec.adminValidationStatus || rec.adminValidationStatus === 'Menunggu';
                      }
                      return rec.adminValidationStatus === attendanceValidationFilter;
                    })
                    .map((rec) => {
                      const photos = localPhotos[rec.id];
                      const inPhoto = rec.clockInPhotoUrl || photos?.in;
                      const outPhoto = rec.clockOutPhotoUrl || photos?.out;
                      const valStatus = rec.adminValidationStatus || 'Menunggu';

                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {rec.date}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="font-bold text-[#0B2453]">{rec.employeeName}</div>
                            <div className="text-[11px] text-slate-500">
                              {rec.nik} &bull; {rec.division}
                            </div>
                          </td>
                          <td className="py-3 pr-3 font-mono tabular-nums whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {rec.clockInTime || '--:--'} - {rec.clockOutTime || '--:--'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {rec.workMinutes > 0 ? formatDuration(rec.workMinutes) : rec.status}
                            </div>
                          </td>

                          {/* Foto Selfie Masuk & Pulang */}
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-1.5">
                              {inPhoto ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPhotoPreview({
                                      url: inPhoto,
                                      title: `Selfie Masuk - ${rec.employeeName} (${rec.clockInTime} WIB)`,
                                    })
                                  }
                                  className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:border-[#C69214] transition-all cursor-pointer shrink-0"
                                  title="Klik untuk perbesar"
                                >
                                  <img
                                    src={inPhoto}
                                    alt="Foto Masuk"
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ) : (
                                <span className="w-10 h-10 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-[9px] text-slate-400">
                                  No In
                                </span>
                              )}

                              {outPhoto ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPhotoPreview({
                                      url: outPhoto,
                                      title: `Selfie Pulang - ${rec.employeeName} (${rec.clockOutTime} WIB)`,
                                    })
                                  }
                                  className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:border-[#C69214] transition-all cursor-pointer shrink-0"
                                  title="Klik untuk perbesar"
                                >
                                  <img
                                    src={outPhoto}
                                    alt="Foto Pulang"
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ) : (
                                <span className="w-10 h-10 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-[9px] text-slate-400">
                                  No Out
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Lokasi GPS & Link Maps */}
                          <td className="py-3 pr-3 max-w-[200px]">
                            <div className="text-slate-700 truncate font-medium">
                              {rec.clockInAddress || 'Area Kantor Pusat'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                              <span>
                                {rec.clockInLat.toFixed(4)}, {rec.clockInLng.toFixed(4)} ({rec.clockInDistanceMeters}m)
                              </span>
                              {rec.clockInLat !== 0 && (
                                <a
                                  href={`https://www.google.com/maps?q=${rec.clockInLat},${rec.clockInLng}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                                >
                                  <span>Maps</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Status Validasi */}
                          <td className="py-3 pr-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                                valStatus === 'Valid'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : valStatus === 'Ditolak'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {valStatus === 'Valid'
                                ? `✔ Valid (${rec.validatedBy || 'Admin'})`
                                : valStatus === 'Ditolak'
                                  ? '✖ Ditolak'
                                  : '⏳ Menunggu'}
                            </span>
                          </td>

                          {/* Aksi Validasi Admin */}
                          <td className="py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  void validateAttendance(rec.id, 'Valid').then(() =>
                                    showToast(`Absensi ${rec.employeeName} divalidasi Valid.`)
                                  );
                                }}
                                className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3" /> Valid
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void validateAttendance(rec.id, 'Ditolak', 'Foto atau GPS tidak sesuai').then(() =>
                                    showToast(`Absensi ${rec.employeeName} ditolak.`)
                                  );
                                }}
                                className="h-7 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3 h-3" /> Tolak
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 4: JADWAL & SHIFT PER DIVISI */}
      {subTab === 'jadwal' && (<JadwalShiftPanel onShowToast={showToast} onOpenDivisiTab={() => setSubTab('divisi')} />)}

      {/* SUBTAB 5: SLIP GAJI PER KARYAWAN */}
      {subTab === 'payroll' && <AdminPayrollPanel onShowToast={showToast} />}

      {/* SUBTAB 5: KELOLA DIVISI */}
      {subTab === 'divisi' && (<DivisiShiftPanel onShowToast={showToast} />)}

      {/* SUBTAB 5: PANEL SUPERVISOR */}
      {subTab === 'supervisor' && (
        <section className="space-y-4">
          <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-[#0B2453]">
                  Panel Supervisor per Divisi
                </h2>
                <p className="text-xs text-slate-500">
                  Pantau dan putuskan antrean pengajuan bawahan milik tiap supervisor
                </p>
              </div>
              <div className="text-xs font-bold text-slate-500">
                {supervisors.length} supervisor aktif
              </div>
            </div>

            {supervisors.length === 0 ? (
              <p className="text-xs text-slate-500">
                Belum ada supervisor. Ubah peran karyawan menjadi Supervisor di tab Data
                Karyawan.
              </p>
            ) : (
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold pt-1">
                {supervisors.map((spv) => (
                  <button
                    key={spv.uid}
                    type="button"
                    onClick={() => setPanelSupervisorUid(spv.uid)}
                    className={`h-9 px-3 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                      spv.uid === activeSupervisorUid
                        ? 'bg-[#0B2453] text-[#F4CE6A]'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {spv.name.replace(' (Supervisor)', '')} &bull; {spv.division}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeSupervisorUid && (
            <SupervisorPanelView supervisorUid={activeSupervisorUid} onShowToast={showToast} />
          )}
        </section>
      )}

      {/* SUBTAB 6: EXPORT SEMUA */}
      {subTab === 'export' && <ExportAllPanel scope="all" onExportDone={showToast} />}


      {/* Modal Preview Foto Selfie */}
      {photoPreview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 space-y-3">
            <div className="bg-[#0B2453] p-4 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold truncate pr-2">{photoPreview.title}</h3>
              <button
                type="button"
                onClick={() => setPhotoPreview(null)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 text-center">
              <img
                src={photoPreview.url}
                alt="Foto Selfie"
                className="max-h-80 w-auto rounded-2xl mx-auto object-contain border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

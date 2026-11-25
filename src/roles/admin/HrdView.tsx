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
  MapPin,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import { ApprovalCard } from '../../shared/ApprovalCard';
import { EmployeeAvatar } from '../../shared/EmployeeAvatar';
import { useSlidingIndicator } from '../../shared/useSlidingIndicator';
import type {
  Division,
  Employee,
  PayrollSettings,
  PayslipComponent,
  ShiftCode,
  ShiftTolerance,
  UserRole,
} from '../../types/hris';
import { EXCEL_MIME, buildAttendanceExcel, downloadTextFile } from '../../utils/exportUtils';
import {
  SHIFT_TEMPLATES,
  calculatePayslip,
  defaultShiftForDivision,
  formatDuration,
  formatRupiah,
  isIsoDateWithinRange,
  resolveDivisionShiftRule,
  resolveShiftTolerance,
} from '../../utils/hrisLogic';
import { ExportAllPanel } from './ExportAllPanel';
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

const ALL_SHIFT_CODES: ShiftCode[] = ['REGULER', 'PAGI', 'SIANG', 'MALAM', 'SECURITY24'];

const ROLE_LABELS: Record<UserRole, string> = {
  hrd: 'Admin HRD',
  supervisor: 'Supervisor',
  employee: 'Karyawan',
};

interface HrdViewProps {
  activeSubTab?: HrdSubTab;
  onChangeSubTab?: (tab: HrdSubTab) => void;
  /** Kata kunci awal untuk tabel Data Karyawan (dipakai tombol akses cepat dari beranda admin). */
  employeeSearchSeed?: string;
}

export function HrdView({
  activeSubTab,
  onChangeSubTab,
  employeeSearchSeed = '',
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
    addDivision,
    deleteDivision,
    clearAllDivisions,
    validateAttendance,
    updateLeaveQuota,
    toggleEmployeeActive,
    wibNow,
    reviewLeave,
    reviewOvertime,
    reviewShiftSwap,
    reviewExitClearance,
    addEmployeeByHrd,
    updateEmployeeProfile,
    isFirebaseSynced,
    divisionShiftRules,
    updateDivisionShiftRule,
    shiftTemplateFor,
    addScheduleEntry,
    addScheduleEntriesBulk,
    deleteScheduleEntry,
    clearAllSchedules,
    payslipComponents,
    addPayslipComponent,
    updatePayslipComponent,
    deletePayslipComponent,
    payrollSettings,
    updatePayrollSettings,
    schedules,
    resetUserPassword,
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
  /** uid karyawan yang sedang diproses reset kata sandinya (menonaktifkan tombolnya). */
  const [resettingUid, setResettingUid] = useState<string | null>(null);

  // Panel supervisor yang sedang dipantau Admin HRD (kosong = supervisor pertama)
  const [panelSupervisorUid, setPanelSupervisorUid] = useState<string>('');

  // New division form state
  const [newDivName, setNewDivName] = useState('');
  const [submittingDiv, setSubmittingDiv] = useState(false);

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
    division: 'Security' as Division,
    shiftCode: 'PAGI' as ShiftCode,
    role: 'employee' as UserRole,
    supervisorUid: '',
    initialPassword: '',
  });

  // Jadwal kerja per divisi
  const [scheduleForm, setScheduleForm] = useState({
    uid: '',
    date: '',
    shiftCode: 'REGULER' as ShiftCode,
    location: 'Kantor Pusat PT Sinar Bunga Mas',
    notes: '',
  });
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  // Jadwal massal satu divisi (jam kerja berbeda per divisi)
  const [bulkForm, setBulkForm] = useState({
    division: 'Security' as Division,
    startDate: '',
    endDate: '',
    shiftCode: 'SECURITY24' as ShiftCode,
    location: 'Kantor Pusat PT Sinar Bunga Mas',
  });
  const [submittingBulk, setSubmittingBulk] = useState(false);

  // Pengaturan komponen gaji
  const [componentForm, setComponentForm] = useState({
    name: '',
    kind: 'deduction' as PayslipComponent['kind'],
    basis: 'nominal' as PayslipComponent['basis'],
    amount: 0,
    scope: 'global' as PayslipComponent['scope'],
    division: '' as Division | '',
    employeeUid: '',
  });
  const [submittingComponent, setSubmittingComponent] = useState(false);

  // Draft pengaturan payroll global
  const [settingsDraft, setSettingsDraft] = useState<PayrollSettings>(payrollSettings);
  const [submittingSettings, setSubmittingSettings] = useState(false);

  // Tombol akses cepat karyawan mengisi kolom pencarian tabel data karyawan.
  useEffect(() => {
    if (employeeSearchSeed === appliedSearchSeed.current) return;
    appliedSearchSeed.current = employeeSearchSeed;
    if (employeeSearchSeed) setSearchEmp(employeeSearchSeed);
  }, [employeeSearchSeed]);

  /** Shift yang diizinkan untuk satu divisi (aturan jam kerja per divisi). */
  const allowedShiftCodesFor = (division: Division): ShiftCode[] =>
    resolveDivisionShiftRule(division, divisionShiftRules).allowedShiftCodes;

  const employeeByUid = (uid: string) => employees.find((emp) => emp.uid === uid) ?? null;

  /** Divisi efektif pada form jadwal (karyawan belum dipilih → divisi pertama). */
  const divisionForEmployeeUid = (uid: string): Division =>
    employeeByUid(uid)?.division ?? divisions[0] ?? 'HRD';

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

  /** Admin HRD mengirim tautan reset kata sandi ke email karyawan. */
  const handleResetPassword = async (emp: Employee) => {
    const confirmed = window.confirm(
      `Kirim tautan reset kata sandi ke email ${emp.email}?`
    );
    if (!confirmed) return;
    setResettingUid(emp.uid);
    try {
      const res = await resetUserPassword(emp.uid);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      showToast(`Tautan reset kata sandi dikirim ke ${emp.email}.`);
    } finally {
      setResettingUid(null);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingEmp(true);
    try {
      const res = await addEmployeeByHrd(empForm);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      setShowAddEmp(false);
      setEmpForm({
        email: '',
        name: '',
        position: '',
        division: 'Security',
        shiftCode: 'PAGI',
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

              {shiftSwaps.map((sw) => (
                <ApprovalCard
                  key={sw.id}
                  title={`Tukar Shift: ${sw.employeeName} (${sw.nik})`}
                  meta={`${sw.date} • ${sw.fromShift} → ${sw.toShift} • ${sw.division}${routingLabel(sw.supervisorUid ?? '')}`}
                  status={sw.status}
                  reason={sw.reason}
                  onApprove={() => {
                    void reviewShiftSwap(sw.id, 'Disetujui').then((res) =>
                      showToast(
                        res.ok
                          ? `Tukar shift ${sw.employeeName} disetujui untuk ${sw.date}.`
                          : (res.error ?? 'Tukar shift gagal disetujui.')
                      )
                    );
                  }}
                  onReject={() => {
                    void reviewShiftSwap(sw.id, 'Ditolak').then((res) =>
                      showToast(
                        res.ok
                          ? `Tukar shift ${sw.employeeName} ditolak.`
                          : (res.error ?? 'Tukar shift gagal ditolak.')
                      )
                    );
                  }}
                />
              ))}

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
                  value={empForm.division}
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
                  {divisions.map((div) => (
                    <option key={div} value={div}>
                      {div}
                    </option>
                  ))}
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
                  {empForm.division === 'HRD' && <option value="hrd">Admin HRD</option>}
                </select>
                <select
                  aria-label="Pilih atasan langsung karyawan baru"
                  value={empForm.supervisorUid}
                  onChange={(e) => setEmpForm({ ...empForm, supervisorUid: e.target.value })}
                  disabled={empForm.role !== 'employee'}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <option value="">Tanpa atasan (langsung HRD)</option>
                  {divisionSupervisors(empForm.division).map((sup) => (
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
                  {allowedShiftCodesFor(empForm.division).map((code) => {
                    const tpl = shiftTemplateFor(code, empForm.division);
                    return (
                      <option key={code} value={code}>
                        {tpl.name} ({tpl.startTime}–{tpl.endTime})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="submit"
                  disabled={submittingEmp}
                  className="h-10 rounded-xl bg-[#0B2453] text-white text-xs font-bold hover:bg-[#163A7A] cursor-pointer disabled:opacity-60"
                >
                  {submittingEmp ? 'Menyimpan...' : 'Buat Akun & Simpan'}
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs">
                  <th className="py-2.5 pr-3">NIK</th>
                  <th className="py-2.5 pr-3">Nama &amp; Email</th>
                  <th className="py-2.5 pr-3">Divisi</th>
                  <th className="py-2.5 pr-3">Peran</th>
                  <th className="py-2.5 pr-3">Atasan Langsung</th>
                  <th className="py-2.5 pr-3">Shift</th>
                  <th className="py-2.5 pr-3">Kuota Izin</th>
                  <th className="py-2.5 pr-3">Status Akun</th>
                  <th className="py-2.5 text-right">Status Kontrak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.uid} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-3 font-mono font-bold text-[#0B2453] whitespace-nowrap">
                      {emp.nik}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <EmployeeAvatar
                          name={emp.name}
                          photoUrl={emp.photoUrl}
                          className="w-9 h-9"
                          textClassName="text-[11px]"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">{emp.name}</div>
                          <div className="text-xs text-slate-500">
                            {emp.position} &bull; {emp.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                      {emp.division}
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        aria-label={`Ubah peran ${emp.name}`}
                        value={emp.role}
                        onChange={(e) => {
                          const nextRole = e.target.value as UserRole;
                          if (nextRole === 'hrd' && emp.division !== 'HRD') {
                            showToast('Peran Admin HRD hanya berlaku untuk divisi HRD.');
                            return;
                          }
                          void updateEmployeeProfile(emp.uid, {
                            role: nextRole,
                            ...(nextRole === 'employee' ? {} : { supervisorUid: '' }),
                          })
                            .then(() =>
                              showToast(
                                nextRole === 'supervisor'
                                  ? `Peran ${emp.name} diubah ke Supervisor. Bawahannya kini bisa dirutekan ke dirinya.`
                                  : `Peran ${emp.name} diubah ke ${ROLE_LABELS[nextRole]}.`
                              )
                            )
                            .catch(() => showToast('Gagal mengubah peran. Periksa koneksi lalu coba lagi.'));
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                      >
                        <option value="employee">Karyawan</option>
                        <option value="supervisor">Supervisor</option>
                        {emp.division === 'HRD' && <option value="hrd">Admin HRD</option>}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      {emp.role === 'employee' ? (
                        <select
                          aria-label={`Ubah atasan langsung ${emp.name}`}
                          value={emp.supervisorUid}
                          onChange={(e) => {
                            const nextSupervisorUid = e.target.value;
                            void updateEmployeeProfile(emp.uid, { supervisorUid: nextSupervisorUid })
                              .then(() =>
                                showToast(
                                  nextSupervisorUid
                                    ? `Atasan langsung ${emp.name} diperbarui.`
                                    : `Pengajuan ${emp.name} dialihkan langsung ke HRD.`
                                )
                              )
                              .catch(() => showToast('Gagal mengubah atasan langsung.'));
                          }}
                          className="h-8 max-w-[180px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                        >
                          <option value="">Langsung ke HRD</option>
                          {divisionSupervisors(emp.division)
                            .filter((sup) => sup.uid !== emp.uid)
                            .map((sup) => (
                              <option key={sup.uid} value={sup.uid}>
                                {sup.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {emp.role === 'supervisor' ? 'Menerima pengajuan bawahan' : 'Akses penuh HRD'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        aria-label={`Ubah shift ${emp.name}`}
                        value={emp.shiftCode}
                        onChange={(e) => {
                          const nextShift = e.target.value as ShiftCode;
                          void updateEmployeeProfile(emp.uid, { shiftCode: nextShift }).then(() =>
                            showToast(
                              `Shift ${emp.name} diubah ke ${SHIFT_TEMPLATES[nextShift]?.name ?? nextShift}.`
                            )
                          );
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                      >
                        {allowedShiftCodesFor(emp.division).map((code) => (
                          <option key={code} value={code}>
                            {SHIFT_TEMPLATES[code].name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={60}
                          key={`quota_${emp.uid}_${emp.leaveQuota ?? 12}`}
                          defaultValue={emp.leaveQuota ?? 12}
                          onBlur={(e) => {
                            const val = Number(e.target.value);
                            if (!isNaN(val) && val >= 0) {
                              void updateLeaveQuota(emp.uid, val).then(() =>
                                showToast(`Kuota izin ${emp.name} diatur menjadi ${val} hari.`)
                              );
                            }
                          }}
                          className="w-12 h-8 text-center font-bold font-mono text-xs rounded-lg border border-slate-300 bg-white"
                        />
                        <span className="text-[10px] text-slate-500 font-bold">hari</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            emp.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {emp.active ? 'Aktif' : 'Non-Aktif'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextState = !emp.active;
                            void toggleEmployeeActive(emp.uid, nextState).then(() =>
                              showToast(
                                nextState
                                  ? `Akun ${emp.name} berhasil diaktifkan.`
                                  : `Akun ${emp.name} dinonaktifkan (tidak bisa login).`
                              )
                            );
                          }}
                          className={`h-7 px-2 rounded-lg text-[10px] font-extrabold border transition-all cursor-pointer ${
                            emp.active
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {emp.active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResetPassword(emp)}
                          disabled={resettingUid === emp.uid}
                          title={`Kirim tautan reset kata sandi ${emp.name} ke email`}
                          className="h-7 px-2 rounded-lg text-[10px] font-extrabold border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 transition-all disabled:opacity-60 cursor-pointer"
                        >
                          {resettingUid === emp.uid ? 'Memproses...' : 'Reset Sandi'}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="text-xs font-bold text-[#0B2453]">{emp.contractType}</div>
                      <div
                        className={`text-[11px] font-semibold ${
                          emp.contractSigned ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {emp.contractSigned ? 'TTD Digital' : 'Belum TTD'}
                      </div>
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
      {subTab === 'jadwal' && (
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453] flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-[#C69214]" />
                <span>Jadwal Kerja &amp; Shift per Divisi</span>
              </h2>
              <p className="text-xs text-slate-500">
                Setiap divisi punya jam kerja sendiri: Security 24 jam, Cleaning Service hanya
                sampai sore, dan seterusnya.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
                {schedules.length} Baris Jadwal
              </div>
              <button
                type="button"
                disabled={schedules.length === 0}
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Hapus SEMUA ${schedules.length} baris jadwal? Tindakan ini tidak bisa dibatalkan.`
                    )
                  ) {
                    return;
                  }
                  const res = await clearAllSchedules();
                  showToast(
                    res.ok
                      ? `${res.deleted} baris jadwal dihapus.`
                      : res.error ?? 'Gagal menghapus jadwal.'
                  );
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-extrabold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Semua Jadwal</span>
              </button>
            </div>
          </div>

          {/* Ringkasan jam kerja tiap divisi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {divisions.map((div) => {
              const rule = resolveDivisionShiftRule(div, divisionShiftRules);
              return (
                <div
                  key={div}
                  className="rounded-2xl border border-slate-200/80 bg-[#F8FAFD] p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#0B2453] truncate">{div}</span>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Bawaan: {shiftTemplateFor(rule.defaultShiftCode, div).label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rule.allowedShiftCodes.map((code) => {
                      const tpl = shiftTemplateFor(code, div);
                      return (
                        <span
                          key={code}
                          className="text-[10px] font-semibold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md whitespace-nowrap"
                        >
                          {tpl.name} ({tpl.startTime}–{tpl.endTime})
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubTab('divisi')}
                    className="text-[10px] font-extrabold text-[#0B2453] hover:text-[#163A7A] underline cursor-pointer"
                  >
                    Ubah jam kerja divisi ini
                  </button>
                </div>
              );
            })}
          </div>

          {/* Jadwal massal per divisi: jam kerja tiap divisi berbeda (Security 24 jam, Cleaning sampai sore) */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!bulkForm.startDate || !bulkForm.endDate) {
                showToast('Isi tanggal mulai dan tanggal selesai jadwal divisi.');
                return;
              }
              setSubmittingBulk(true);
              const res = await addScheduleEntriesBulk(bulkForm);
              setSubmittingBulk(false);
              if (!res.ok) {
                showToast(res.error);
                return;
              }
              showToast(
                `${res.created} jadwal divisi ${bulkForm.division} dibuat` +
                  (res.skipped > 0 ? `, ${res.skipped} dilewati karena bentrok.` : '.')
              );
            }}
            className="rounded-2xl border border-[#C69214]/45 bg-[#FFFBEB]/50 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold text-[#0B2453]">
                  Jadwal Massal per Divisi
                </div>
                <p className="text-[11px] text-slate-600">
                  Pasang satu shift untuk semua karyawan aktif di divisi terpilih, sekaligus untuk
                  rentang tanggal. Shift mengikuti aturan jam kerja divisi.
                </p>
              </div>
              <CalendarDays className="w-5 h-5 text-[#C69214] shrink-0" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <select
                aria-label="Divisi jadwal massal"
                value={bulkForm.division}
                onChange={(e) => {
                  const nextDivision = e.target.value as Division;
                  setBulkForm({
                    ...bulkForm,
                    division: nextDivision,
                    shiftCode: defaultShiftForDivision(nextDivision, divisionShiftRules),
                  });
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              >
                {divisions.map((div) => (
                  <option key={div} value={div}>
                    {div}
                  </option>
                ))}
              </select>
              <select
                aria-label="Shift jadwal massal"
                value={bulkForm.shiftCode}
                onChange={(e) =>
                  setBulkForm({ ...bulkForm, shiftCode: e.target.value as ShiftCode })
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              >
                {allowedShiftCodesFor(bulkForm.division).map((code) => {
                  const tpl = shiftTemplateFor(code, bulkForm.division);
                  return (
                    <option key={code} value={code}>
                      {tpl.name} ({tpl.startTime}–{tpl.endTime})
                    </option>
                  );
                })}
              </select>
              <input
                type="date"
                required
                aria-label="Tanggal mulai jadwal massal"
                value={bulkForm.startDate}
                onChange={(e) => setBulkForm({ ...bulkForm, startDate: e.target.value })}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              />
              <input
                type="date"
                required
                aria-label="Tanggal selesai jadwal massal"
                value={bulkForm.endDate}
                onChange={(e) => setBulkForm({ ...bulkForm, endDate: e.target.value })}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              />
              <button
                type="submit"
                disabled={submittingBulk}
                className="h-10 rounded-xl bg-gradient-to-r from-[#C69214] to-[#A6760B] text-white text-xs font-extrabold hover:brightness-105 cursor-pointer disabled:opacity-60"
              >
                {submittingBulk ? 'Menyimpan…' : 'Buat Jadwal Divisi'}
              </button>
            </div>
          </form>

          {/* Form tambah jadwal karyawan */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!scheduleForm.uid || !scheduleForm.date) {
                showToast('Pilih karyawan dan tanggal jadwal lebih dulu.');
                return;
              }
              setSubmittingSchedule(true);
              const res = await addScheduleEntry({
                uid: scheduleForm.uid,
                date: scheduleForm.date,
                shiftCode: scheduleForm.shiftCode,
                location: scheduleForm.location,
                notes: scheduleForm.notes,
              });
              setSubmittingSchedule(false);
              if (!res.ok) {
                showToast(res.error);
                return;
              }
              setScheduleForm({ ...scheduleForm, notes: '' });
              showToast('Jadwal karyawan disimpan.');
            }}
            className="rounded-2xl border border-slate-200 bg-[#F8FAFD] p-4 space-y-3"
          >
            <div className="text-xs font-bold text-[#0B2453]">Tambah Jadwal Karyawan</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <select
                aria-label="Pilih karyawan untuk dijadwalkan"
                required
                value={scheduleForm.uid}
                onChange={(e) => {
                  const uid = e.target.value;
                  const emp = employeeByUid(uid);
                  setScheduleForm({
                    ...scheduleForm,
                    uid,
                    shiftCode: emp
                      ? defaultShiftForDivision(emp.division, divisionShiftRules)
                      : scheduleForm.shiftCode,
                  });
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              >
                <option value="">Pilih Karyawan…</option>
                {divisions.map((div) => {
                  const members = employees.filter((emp) => emp.division === div && emp.active);
                  if (members.length === 0) return null;
                  return (
                    <optgroup key={div} label={div}>
                      {members.map((emp) => (
                        <option key={emp.uid} value={emp.uid}>
                          {emp.name} — {emp.nik}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <input
                type="date"
                required
                aria-label="Tanggal jadwal"
                value={scheduleForm.date}
                onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              />
              <select
                aria-label="Pilih shift jadwal"
                value={scheduleForm.shiftCode}
                onChange={(e) =>
                  setScheduleForm({ ...scheduleForm, shiftCode: e.target.value as ShiftCode })
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              >
                {allowedShiftCodesFor(divisionForEmployeeUid(scheduleForm.uid)).map((code) => {
                  const tpl = shiftTemplateFor(code, divisionForEmployeeUid(scheduleForm.uid));
                  return (
                    <option key={code} value={code}>
                      {tpl.name} ({tpl.startTime}–{tpl.endTime})
                    </option>
                  );
                })}
              </select>
              <input
                type="text"
                aria-label="Lokasi kerja"
                placeholder="Lokasi kerja (mis. Pos Gerbang Utama)"
                value={scheduleForm.location}
                onChange={(e) => setScheduleForm({ ...scheduleForm, location: e.target.value })}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs sm:col-span-2"
              />
              <input
                type="text"
                aria-label="Catatan jadwal"
                placeholder="Catatan (opsional)"
                value={scheduleForm.notes}
                onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              />
              <button
                type="submit"
                disabled={submittingSchedule}
                className="h-10 rounded-xl bg-[#0B2453] text-white text-xs font-bold hover:bg-[#163A7A] cursor-pointer disabled:opacity-60 sm:col-span-2 lg:col-span-1"
              >
                {submittingSchedule ? 'Menyimpan…' : 'Simpan Jadwal'}
              </button>
            </div>
          </form>

          {/* Daftar jadwal */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs">
                  <th className="py-2.5 pr-3">Tanggal</th>
                  <th className="py-2.5 pr-3">Karyawan</th>
                  <th className="py-2.5 pr-3">Divisi</th>
                  <th className="py-2.5 pr-3">Shift</th>
                  <th className="py-2.5 pr-3">Lokasi</th>
                  <th className="py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...schedules]
                  .sort((a, b) => b.date.localeCompare(a.date) || a.uid.localeCompare(b.uid))
                  .slice(0, 200)
                  .map((sch) => {
                    const emp = employeeByUid(sch.uid);
                    const tpl = shiftTemplateFor(sch.shiftCode, emp?.division ?? null);
                    return (
                      <tr key={sch.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-3 font-mono font-bold text-[#0B2453] whitespace-nowrap">
                          {sch.date}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-bold text-slate-900">
                            {emp?.name ?? '(karyawan dihapus)'}
                          </div>
                          <div className="text-[11px] text-slate-500">{emp?.nik ?? sch.uid}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700">
                          {emp?.division ?? '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                          <span className="font-bold text-[#0B2453]">{tpl?.name ?? sch.shiftCode}</span>
                          <span className="text-slate-500">
                            {' '}
                            {tpl?.startTime}–{tpl?.endTime}
                          </span>
                          {sch.shiftCode === 'SECURITY24' && (
                            <span className="ml-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                              24 jam
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600">
                          {sch.location}
                          {sch.notes ? (
                            <span className="block text-[11px] text-slate-400">{sch.notes}</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            aria-label={`Hapus jadwal ${emp?.name ?? sch.uid} tanggal ${sch.date}`}
                            onClick={() => {
                              void deleteScheduleEntry(sch.id).then(() =>
                                showToast('Jadwal dihapus.')
                              );
                            }}
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[10px] font-extrabold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                {schedules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-slate-500">
                      Belum ada jadwal. Tambahkan jadwal karyawan di atas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 5: SLIP GAJI & KOMPONEN PAYROLL */}
      {subTab === 'payroll' && (
        <div className="space-y-5">
          {/* A. Pengaturan potongan & insentif lembur */}
          <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453] flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#C69214]" />
                <span>Pengaturan Gaji, Potongan &amp; Lembur</span>
              </h2>
              <p className="text-xs text-slate-500">
                Pengaturan ini dipakai untuk seluruh slip gaji: BPJS, denda keterlambatan, dan
                insentif lembur per jam atau per sesi.
              </p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSubmittingSettings(true);
                const res = await updatePayrollSettings(settingsDraft);
                setSubmittingSettings(false);
                showToast(res.ok ? 'Pengaturan payroll disimpan.' : res.error ?? 'Gagal menyimpan.');
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            >
              <label className="text-[11px] font-bold text-slate-600 space-y-1">
                <span>BPJS Kesehatan (% gaji pokok)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={Math.round(settingsDraft.bpjsKesehatanRate * 10000) / 100}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      bpjsKesehatanRate: Number(e.target.value) / 100 || 0,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-600 space-y-1">
                <span>BPJS Ketenagakerjaan (% gaji pokok)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={Math.round(settingsDraft.bpjsKetenagakerjaanRate * 10000) / 100}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      bpjsKetenagakerjaanRate: Number(e.target.value) / 100 || 0,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-600 space-y-1">
                <span>Potongan terlambat (Rp / menit)</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={settingsDraft.lateDeductionPerMinute}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      lateDeductionPerMinute: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-600 space-y-1">
                <span>Mode insentif lembur</span>
                <select
                  value={settingsDraft.overtimeRateMode}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      overtimeRateMode: e.target.value as PayrollSettings['overtimeRateMode'],
                    })
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"
                >
                  <option value="perJam">Per jam (pengali × upah/jam)</option>
                  <option value="perSesi">Per sesi (nominal tetap)</option>
                </select>
              </label>
              <label className="text-[11px] font-bold text-slate-600 space-y-1">
                <span>Pengali upah lembur per jam</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={settingsDraft.overtimeHourlyMultiplier}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      overtimeHourlyMultiplier: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                />
              </label>
              <label className="text-[11px] font-bold text-slate-600 space-y-1">
                <span>Tarif lembur per sesi (Rp)</span>
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={settingsDraft.overtimeSessionRate}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      overtimeSessionRate: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold"
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-slate-500">
                  Contoh: pengali 1,5 = (gaji pokok ÷ 173) × 1,5 per jam lembur.
                </p>
                <button
                  type="submit"
                  disabled={submittingSettings}
                  className="h-10 px-5 rounded-xl bg-[#0B2453] text-white text-xs font-bold hover:bg-[#163A7A] cursor-pointer disabled:opacity-60"
                >
                  {submittingSettings ? 'Menyimpan…' : 'Simpan Pengaturan'}
                </button>
              </div>
            </form>
          </section>

          {/* B. Komponen gaji: bisa per karyawan / per divisi, tambah atau kurang */}
          <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-[#0B2453]">
                Komponen Gaji (Tambah / Kurangi)
              </h2>
              <p className="text-xs text-slate-500">
                Berlaku untuk semua karyawan, satu divisi, atau satu karyawan. Bisa bersifat
                penerimaan (mis. tunjangan) atau potongan (mis. BPJS, kasbon).
              </p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSubmittingComponent(true);
                const res = await addPayslipComponent({
                  name: componentForm.name,
                  kind: componentForm.kind,
                  basis: componentForm.basis,
                  amount: componentForm.amount,
                  scope: componentForm.scope,
                  active: true,
                  ...(componentForm.scope === 'division' && componentForm.division
                    ? { division: componentForm.division }
                    : {}),
                  ...(componentForm.scope === 'employee' && componentForm.employeeUid
                    ? { employeeUid: componentForm.employeeUid }
                    : {}),
                });
                setSubmittingComponent(false);
                if (!res.ok) {
                  showToast(res.error ?? 'Gagal menambah komponen.');
                  return;
                }
                showToast(`Komponen "${componentForm.name}" ditambahkan.`);
                setComponentForm({ ...componentForm, name: '', amount: 0 });
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
            >
              <input
                type="text"
                required
                placeholder="Nama komponen (mis. BPJS Kesehatan)"
                value={componentForm.name}
                onChange={(e) => setComponentForm({ ...componentForm, name: e.target.value })}
                className="h-10 rounded-xl border border-slate-200 px-3 text-xs lg:col-span-2"
              />
              <select
                aria-label="Jenis komponen"
                value={componentForm.kind}
                onChange={(e) =>
                  setComponentForm({
                    ...componentForm,
                    kind: e.target.value as PayslipComponent['kind'],
                  })
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              >
                <option value="deduction">Potongan (−)</option>
                <option value="earning">Penerimaan (+)</option>
              </select>
              <select
                aria-label="Dasar perhitungan"
                value={componentForm.basis}
                onChange={(e) =>
                  setComponentForm({
                    ...componentForm,
                    basis: e.target.value as PayslipComponent['basis'],
                  })
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              >
                <option value="nominal">Nominal Rp</option>
                <option value="persenGajiPokok">% Gaji Pokok</option>
              </select>
              <input
                type="number"
                required
                min={0}
                step={componentForm.basis === 'persenGajiPokok' ? 0.1 : 1000}
                placeholder={componentForm.basis === 'persenGajiPokok' ? 'Persen' : 'Nominal Rp'}
                value={componentForm.amount || ''}
                onChange={(e) =>
                  setComponentForm({ ...componentForm, amount: Number(e.target.value) })
                }
                className="h-10 rounded-xl border border-slate-200 px-3 text-xs"
              />
              <select
                aria-label="Cakupan komponen"
                value={componentForm.scope}
                onChange={(e) =>
                  setComponentForm({
                    ...componentForm,
                    scope: e.target.value as PayslipComponent['scope'],
                  })
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
              >
                <option value="global">Semua karyawan</option>
                <option value="division">Per divisi</option>
                <option value="employee">Per karyawan</option>
              </select>
              {componentForm.scope === 'division' && (
                <select
                  aria-label="Divisi komponen"
                  value={componentForm.division}
                  onChange={(e) =>
                    setComponentForm({ ...componentForm, division: e.target.value as Division })
                  }
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs lg:col-span-2"
                >
                  <option value="">Pilih Divisi…</option>
                  {divisions.map((div) => (
                    <option key={div} value={div}>
                      {div}
                    </option>
                  ))}
                </select>
              )}
              {componentForm.scope === 'employee' && (
                <select
                  aria-label="Karyawan komponen"
                  value={componentForm.employeeUid}
                  onChange={(e) =>
                    setComponentForm({ ...componentForm, employeeUid: e.target.value })
                  }
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs lg:col-span-2"
                >
                  <option value="">Pilih Karyawan…</option>
                  {employees.map((emp) => (
                    <option key={emp.uid} value={emp.uid}>
                      {emp.name} — {emp.division}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={submittingComponent}
                className="h-10 rounded-xl bg-[#0B2453] text-white text-xs font-bold hover:bg-[#163A7A] cursor-pointer disabled:opacity-60 lg:col-span-2"
              >
                {submittingComponent ? 'Menyimpan…' : 'Tambah Komponen Gaji'}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3">Komponen</th>
                    <th className="py-2.5 pr-3">Jenis</th>
                    <th className="py-2.5 pr-3">Nilai</th>
                    <th className="py-2.5 pr-3">Cakupan</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payslipComponents.map((comp) => {
                    const target =
                      comp.scope === 'division'
                        ? comp.division ?? '—'
                        : comp.scope === 'employee'
                          ? (employeeByUid(comp.employeeUid ?? '')?.name ?? '—')
                          : 'Semua karyawan';
                    return (
                      <tr key={comp.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 pr-3 font-bold text-slate-900">{comp.name}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              comp.kind === 'earning'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {comp.kind === 'earning' ? 'Penerimaan (+)' : 'Potongan (−)'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono font-bold text-[#0B2453] whitespace-nowrap">
                          {comp.basis === 'persenGajiPokok'
                            ? `${comp.amount}% gaji pokok`
                            : formatRupiah(comp.amount)}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">
                          <div className="font-semibold">
                            {comp.scope === 'global'
                              ? 'Global'
                              : comp.scope === 'division'
                                ? 'Per divisi'
                                : 'Per karyawan'}
                          </div>
                          <div className="text-[11px] text-slate-500">{target}</div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            onClick={() =>
                              void updatePayslipComponent(comp.id, {
                                active: !comp.active,
                              }).then((res) =>
                                showToast(
                                  res.ok
                                    ? `Komponen ${comp.name} ${comp.active ? 'dinonaktifkan' : 'diaktifkan'}.`
                                    : res.error ?? 'Gagal memperbarui komponen.'
                                )
                              )
                            }
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border cursor-pointer ${
                              comp.active
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {comp.active ? 'Aktif' : 'Non-Aktif'}
                          </button>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            aria-label={`Hapus komponen ${comp.name}`}
                            onClick={() =>
                              void deletePayslipComponent(comp.id).then(() =>
                                showToast('Komponen dihapus.')
                              )
                            }
                            className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[10px] font-extrabold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {payslipComponents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500">
                        Belum ada komponen tambahan. Slip gaji memakai gaji pokok, tunjangan,
                        BPJS, dan potongan keterlambatan bawaan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* C. Pratinjau slip gaji bulan berjalan */}
          <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-[#0B2453]">Pratinjau Slip Gaji</h2>
                <p className="text-xs text-slate-500">
                  Perhitungan otomatis periode {wibNow.periodLabel} dari absensi &amp; lembur
                  disetujui.
                </p>
              </div>
              <div className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
                {employees.filter((emp) => emp.active).length} Karyawan Aktif
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3">Karyawan</th>
                    <th className="py-2.5 pr-3">Divisi</th>
                    <th className="py-2.5 pr-3 text-right">Penerimaan</th>
                    <th className="py-2.5 pr-3 text-right">Potongan</th>
                    <th className="py-2.5 pr-3 text-right">Lembur</th>
                    <th className="py-2.5 text-right">Terima Bersih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees
                    .filter((emp) => emp.active)
                    .map((emp) => {
                      const slip = calculatePayslip(
                        emp,
                        wibNow.periodKey,
                        wibNow.periodLabel,
                        attendance,
                        overtimes,
                        payslipComponents,
                        payrollSettings
                      );
                      return (
                        <tr key={emp.uid} className="hover:bg-slate-50/70">
                          <td className="py-2.5 pr-3">
                            <div className="font-bold text-slate-900">{emp.name}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{emp.nik}</div>
                          </td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-700">
                            {emp.division}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-emerald-700 whitespace-nowrap">
                            {formatRupiah(slip.grossPay)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-rose-700 whitespace-nowrap">
                            −{formatRupiah(slip.totalDeductions)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-slate-700 whitespace-nowrap">
                            {slip.overtimeHours > 0
                              ? `${formatRupiah(slip.overtimePay)} (${slip.overtimeHours} jam)`
                              : '—'}
                          </td>
                          <td className="py-2.5 text-right font-mono font-extrabold text-[#0B2453] whitespace-nowrap">
                            {formatRupiah(slip.netPay)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* SUBTAB 5: KELOLA DIVISI */}
      {subTab === 'divisi' && (
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#C69214]" />
                <span>Kelola Divisi Perusahaan</span>
              </h2>
              <p className="text-xs text-slate-500">
                Tambah divisi baru dan pantau distribusi tenaga kerja PT Sinar Bunga Mas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
                Total: {divisions.length} Divisi Aktif
              </div>
              <button
                type="button"
                disabled={divisions.length === 0}
                onClick={async () => {
                  const assigned = employees.filter((emp) =>
                    divisions.some((div) => div.toLowerCase() === emp.division.toLowerCase())
                  ).length;
                  const warn =
                    assigned > 0
                      ? `\n\nPerhatian: ${assigned} karyawan masih memakai divisi ini. Label divisi mereka tetap tersimpan, tetapi menambah/memindah karyawan perlu divisi baru.`
                      : '';
                  if (
                    !window.confirm(
                      `Hapus SEMUA ${divisions.length} divisi beserta aturan jam kerjanya?${warn}`
                    )
                  ) {
                    return;
                  }
                  const res = await clearAllDivisions();
                  showToast(
                    res.ok
                      ? `Semua divisi (${divisions.length}) beserta aturan shift dihapus.`
                      : res.error ?? 'Gagal menghapus divisi.'
                  );
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-extrabold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Semua Divisi</span>
              </button>
            </div>
          </div>

          {/* Form Tambah Divisi Baru */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newDivName.trim()) return;
              setSubmittingDiv(true);
              const res = await addDivision(newDivName.trim());
              setSubmittingDiv(false);
              if (!res.ok) {
                showToast(res.error || 'Gagal menambahkan divisi.');
                return;
              }
              const created = newDivName.trim();
              setNewDivName('');
              // Divisi baru langsung siap dipakai: form tambah karyawan terbuka dengan divisi tersebut.
              setEmpForm((prev) => ({
                ...prev,
                division: created,
                supervisorUid: '',
                shiftCode: defaultShiftForDivision(created, divisionShiftRules),
              }));
              setShowAddEmp(true);
              setSubTab('karyawan');
              showToast(
                `Divisi "${created}" ditambahkan. Form tambah karyawan dibuka untuk divisi ini.`
              );
            }}
            className="p-4 rounded-2xl bg-[#F8FAFD] border border-slate-200 space-y-3"
          >
            <div className="text-xs font-bold text-[#0B2453]">Tambah Divisi Baru</div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={newDivName}
                onChange={(e) => setNewDivName(e.target.value)}
                placeholder="Masukkan nama divisi baru (misal: Logistik & Gudang, IT Support, dll)"
                className="w-full sm:flex-1 h-10 rounded-xl border border-slate-300 px-3 text-xs bg-white focus:border-[#0B2453] focus:ring-1 focus:ring-[#0B2453]"
              />
              <button
                type="submit"
                disabled={submittingDiv || !newDivName.trim()}
                className="w-full sm:w-auto h-10 px-5 rounded-xl bg-[#0B2453] hover:bg-[#143B7F] text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4 text-[#F4CE6A]" />
                <span>{submittingDiv ? 'Menyimpan...' : 'Tambah Divisi'}</span>
              </button>
            </div>
          </form>

          {/* Daftar Divisi Grid + Aturan Jam Kerja */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {divisions.map((div) => {
              const memberCount = employees.filter(
                (e) => e.division.toLowerCase() === div.toLowerCase()
              ).length;
              const rule = resolveDivisionShiftRule(div, divisionShiftRules);
              return (
                <div
                  key={div}
                  className="p-4 rounded-2xl border border-slate-200/80 bg-white hover:border-[#C69214] transition-all space-y-3 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-[#B6810C]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-[#0B2453] truncate">{div}</div>
                        <div className="text-[11px] text-slate-500">
                          {memberCount} karyawan terdaftar
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap">
                        Aktif
                      </span>
                      <button
                        type="button"
                        aria-label={`Hapus divisi ${div}`}
                        onClick={async () => {
                          const warn =
                            memberCount > 0
                              ? `\n\nPerhatian: ${memberCount} karyawan masih terdaftar di divisi ini. Label divisi mereka tetap tersimpan.`
                              : '';
                          if (
                            !window.confirm(
                              `Hapus divisi "${div}" beserta aturan jam kerjanya?${warn}`
                            )
                          ) {
                            return;
                          }
                          const res = await deleteDivision(div);
                          showToast(
                            res.ok
                              ? `Divisi "${div}" dihapus.`
                              : res.error ?? 'Gagal menghapus divisi.'
                          );
                        }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#F8FAFD] border border-slate-200 p-2.5 space-y-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Aturan Jam Kerja
                    </div>
                    <div className="space-y-1.5">
                      {ALL_SHIFT_CODES.map((code) => {
                        const base = SHIFT_TEMPLATES[code];
                        const tpl = shiftTemplateFor(code, div);
                        const checked = rule.allowedShiftCodes.includes(code);
                        const isCustom =
                          tpl.startTime !== base.startTime || tpl.endTime !== base.endTime;
                        const saveShiftTime = async (startTime: string, endTime: string) => {
                          const res = await updateDivisionShiftRule(div, {
                            allowedShiftCodes: rule.allowedShiftCodes,
                            defaultShiftCode: rule.defaultShiftCode,
                            shiftTimes: { ...rule.shiftTimes, [code]: { startTime, endTime } },
                          });
                          showToast(
                            res.ok
                              ? `Jam ${base.name} divisi ${div}: ${startTime}–${endTime}.`
                              : res.error ?? 'Gagal menyimpan jam shift.'
                          );
                        };
                        const tolerance = resolveShiftTolerance(code, rule);
                        const saveTolerance = async (patch: Partial<ShiftTolerance>) => {
                          const res = await updateDivisionShiftRule(div, {
                            allowedShiftCodes: rule.allowedShiftCodes,
                            defaultShiftCode: rule.defaultShiftCode,
                            shiftTolerances: {
                              ...rule.shiftTolerances,
                              [code]: { ...tolerance, ...patch },
                            },
                          });
                          showToast(
                            res.ok
                              ? `Toleransi ${base.name} divisi ${div} disimpan.`
                              : res.error ?? 'Gagal menyimpan toleransi absensi.'
                          );
                        };
                        return (
                          <div
                            key={code}
                            className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer min-w-0">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={async () => {
                                    const nextAllowed = checked
                                      ? rule.allowedShiftCodes.filter((c) => c !== code)
                                      : [...rule.allowedShiftCodes, code];
                                    const nextDefault = nextAllowed.includes(rule.defaultShiftCode)
                                      ? rule.defaultShiftCode
                                      : (nextAllowed[0] ?? rule.defaultShiftCode);
                                    const res = await updateDivisionShiftRule(div, {
                                      allowedShiftCodes: nextAllowed,
                                      defaultShiftCode: nextDefault,
                                    });
                                    if (!res.ok)
                                      showToast(res.error ?? 'Gagal menyimpan aturan shift.');
                                  }}
                                  className="w-3.5 h-3.5 accent-[#0B2453]"
                                />
                                <span className="font-bold truncate">{base.name}</span>
                              </label>
                              {!checked && (
                                <span className="text-slate-400 font-mono text-[10px] shrink-0">
                                  {base.startTime}–{base.endTime}
                                </span>
                              )}
                            </div>
                            {checked && (
                              <div className="space-y-2 border-t border-dashed border-slate-200 pt-2">
                                <div className="flex items-center gap-2">
                                  <span className="w-[56px] shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                    Jam kerja
                                  </span>
                                  <input
                                    type="time"
                                    aria-label={`Jam masuk ${base.name} divisi ${div}`}
                                    value={tpl.startTime}
                                    onChange={(e) => {
                                      if (e.target.value) void saveShiftTime(e.target.value, tpl.endTime);
                                    }}
                                    className="h-7 w-[80px] rounded-lg border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-bold text-slate-700"
                                  />
                                  <span className="text-[10px] text-slate-400">s/d</span>
                                  <input
                                    type="time"
                                    aria-label={`Jam pulang ${base.name} divisi ${div}`}
                                    value={tpl.endTime}
                                    onChange={(e) => {
                                      if (e.target.value) void saveShiftTime(tpl.startTime, e.target.value);
                                    }}
                                    className="h-7 w-[80px] rounded-lg border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-bold text-slate-700"
                                  />
                                  {isCustom && (
                                    <button
                                      type="button"
                                      aria-label={`Kembalikan jam bawaan ${base.name} divisi ${div}`}
                                      title="Kembalikan jam bawaan"
                                      onClick={() => void saveShiftTime(base.startTime, base.endTime)}
                                      className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Toleransi absensi
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      pulang setelah shift: bebas
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <label className="block">
                                      <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                                        Masuk awal <span className="font-normal text-slate-400">(mnt)</span>
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={720}
                                        defaultValue={tolerance.earlyInMinutes}
                                        aria-label={`Toleransi masuk awal ${base.name} divisi ${div}`}
                                        onBlur={(e) => void saveTolerance({ earlyInMinutes: Number(e.target.value) })}
                                        className="h-7 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                                        Telat <span className="font-normal text-slate-400">(mnt)</span>
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={720}
                                        defaultValue={tolerance.lateInMinutes}
                                        aria-label={`Toleransi keterlambatan ${base.name} divisi ${div}`}
                                        onBlur={(e) => void saveTolerance({ lateInMinutes: Number(e.target.value) })}
                                        className="h-7 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                                        Pulang awal <span className="font-normal text-slate-400">(mnt)</span>
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={720}
                                        defaultValue={tolerance.earlyOutMinutes}
                                        aria-label={`Toleransi pulang awal ${base.name} divisi ${div}`}
                                        onBlur={(e) => void saveTolerance({ earlyOutMinutes: Number(e.target.value) })}
                                        className="h-7 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <label className="block text-[10px] font-bold text-slate-500 space-y-1">
                      <span>Shift bawaan divisi</span>
                      <select
                        aria-label={`Shift bawaan divisi ${div}`}
                        value={rule.defaultShiftCode}
                        onChange={async (e) => {
                          const nextDefault = e.target.value as ShiftCode;
                          const res = await updateDivisionShiftRule(div, {
                            allowedShiftCodes: rule.allowedShiftCodes,
                            defaultShiftCode: nextDefault,
                          });
                          if (!res.ok) showToast(res.error ?? 'Gagal menyimpan aturan shift.');
                          else
                            showToast(
                              `Shift bawaan ${div}: ${SHIFT_TEMPLATES[nextDefault]?.name ?? nextDefault}.`
                            );
                        }}
                        className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold"
                      >
                        {rule.allowedShiftCodes.map((code) => (
                          <option key={code} value={code}>
                            {SHIFT_TEMPLATES[code].name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

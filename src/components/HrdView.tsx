import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { Division, ShiftCode } from '../types/hris';
import { buildAttendanceCsvWithBom, downloadTextFile } from '../utils/exportUtils';
import { SHIFT_TEMPLATES, formatDuration, formatRupiah } from '../utils/hrisLogic';
import { ExportAllPanel } from './ExportAllPanel';

export type HrdSubTab = 'persetujuan' | 'karyawan' | 'absensi' | 'export';

interface HrdViewProps {
  activeSubTab?: HrdSubTab;
  onChangeSubTab?: (tab: HrdSubTab) => void;
}

export function HrdView({ activeSubTab, onChangeSubTab }: HrdViewProps = {}) {
  const {
    currentUser,
    employees,
    attendance,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    wibNow,
    reviewLeave,
    reviewOvertime,
    reviewShiftSwap,
    reviewExitClearance,
    addEmployeeByHrd,
    updateEmployeeProfile,
  } = useHris();

  const [internalSubTab, setInternalSubTab] = useState<HrdSubTab>('persetujuan');
  const subTab = activeSubTab ?? internalSubTab;
  const setSubTab = (tab: HrdSubTab) => {
    setInternalSubTab(tab);
    onChangeSubTab?.(tab);
  };
  const [searchEmp, setSearchEmp] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [notice, setNotice] = useState<string | null>(null);
  const [submittingEmp, setSubmittingEmp] = useState(false);

  // Simple Email-Based Add Employee form state
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empForm, setEmpForm] = useState({
    email: '',
    name: '',
    position: '',
    division: 'Security' as Division,
    shiftCode: 'PAGI' as ShiftCode,
  });

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

  if (!currentUser) return null;

  // Non-HRD Employee Portal View
  if (currentUser.role !== 'hrd') {
    const myPending =
      leaves.filter((l) => l.uid === currentUser.uid && l.status === 'Menunggu').length +
      overtimes.filter((o) => o.uid === currentUser.uid && o.status === 'Menunggu').length +
      shiftSwaps.filter((s) => s.uid === currentUser.uid && s.status === 'Menunggu').length;

    return (
      <div className="space-y-5">
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <h1 className="text-lg font-extrabold text-[#0B2453]">Layanan &amp; Informasi HRD</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Anda masuk sebagai <strong>{currentUser.name}</strong> ({currentUser.division}). Panel
            persetujuan penuh khusus akun HRD Administrator.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-4">
              <div className="text-xs text-slate-500">Pengajuan Menunggu</div>
              <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
                {myPending}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-4">
              <div className="text-xs text-slate-500">Sisa Cuti Tahunan</div>
              <div className="mt-1 text-2xl font-extrabold text-emerald-700 tabular-nums">
                {currentUser.leaveQuota} hari
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-4">
              <div className="text-xs text-slate-500">Kontrak Aktif</div>
              <div className="mt-1 text-2xl font-extrabold text-[#B6810C]">
                {currentUser.contractType}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#FFFBEB] border border-[#F5D686] p-4 space-y-2 text-xs text-[#784B08]">
            <div className="font-extrabold text-[#0B2453] text-sm">Kontak Helpdesk HRD SBM</div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Phone className="w-3.5 h-3.5" /> (021) 5500-8899 / WA 0812-8800-1101
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Mail className="w-3.5 h-3.5" /> hrd@sinarbungamas.co.id
              </span>
            </div>
          </div>
        </section>

        <ExportAllPanel scope="self" />
      </div>
    );
  }

  const pendingLeaves = leaves.filter((l) => l.status === 'Menunggu');
  const pendingOvertimes = overtimes.filter((o) => o.status === 'Menunggu');
  const pendingSwaps = shiftSwaps.filter((s) => s.status === 'Menunggu');
  const pendingExits = exitClearances.filter((e) => e.status === 'Menunggu');
  const totalPending =
    pendingLeaves.length + pendingOvertimes.length + pendingSwaps.length + pendingExits.length;
  const presentToday = attendance.filter((a) => a.date === wibNow.isoDate).length;

  const handleExportCsv = () => {
    const csv = buildAttendanceCsvWithBom(attendance);
    downloadTextFile(
      `rekap-absensi-sbum-${wibNow.isoDate}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
    showToast('File CSV rekap absensi berhasil diunduh.');
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
      });
      showToast(`Karyawan ${res.employee.name} (${res.employee.nik}) berhasil ditambahkan ke Firebase.`);
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
      <div className="no-print rounded-2xl bg-white p-1.5 shadow-sm border border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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
              label: 'Rekap Absensi',
              icon: <Download className="w-4 h-4 shrink-0" />,
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
            onClick={() => setSubTab(t.id)}
            className={`h-11 rounded-xl px-3 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
              subTab === t.id
                ? 'bg-[#0B2453] text-white'
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
            <h2 className="text-base font-extrabold text-[#0B2453]">Persetujuan Izin &amp; Cuti</h2>
            {leaves.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada pengajuan izin/cuti.</p>
            ) : (
              leaves.map((lv) => (
                <div
                  key={lv.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#0B2453]">
                        {lv.employeeName} ({lv.nik})
                      </div>
                      <div className="text-xs text-slate-600">
                        {lv.type} &bull; {lv.startDate} s/d {lv.endDate} ({lv.days} hr)
                      </div>
                    </div>
                    <span
                      className={`text-xs font-extrabold ${
                        lv.status === 'Disetujui'
                          ? 'text-emerald-700'
                          : lv.status === 'Ditolak'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {lv.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{lv.reason}</p>
                  {lv.status === 'Menunggu' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          void reviewLeave(lv.id, 'Disetujui').then(() =>
                            showToast(`Izin/Cuti ${lv.employeeName} disetujui.`)
                          );
                        }}
                        className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void reviewLeave(lv.id, 'Ditolak').then(() =>
                            showToast(`Izin/Cuti ${lv.employeeName} ditolak.`)
                          );
                        }}
                        className="h-9 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Tolak
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Lembur + Shift Swap + Exit Approvals */}
          <section className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200/80 space-y-4">
            <div className="space-y-3">
              <h2 className="text-base font-extrabold text-[#0B2453]">
                Persetujuan Lembur, Shift &amp; Exit Clear
              </h2>

              {overtimes.length === 0 && shiftSwaps.length === 0 && exitClearances.length === 0 && (
                <p className="text-xs text-slate-500">
                  Belum ada pengajuan lembur, tukar shift, atau exit clearance.
                </p>
              )}

              {overtimes.map((ot) => (
                <div
                  key={ot.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#0B2453]">
                        Lembur: {ot.employeeName} ({ot.nik})
                      </div>
                      <div className="text-xs text-slate-600 font-mono tabular-nums">
                        {ot.date} &bull; {ot.startTime}-{ot.endTime} ({ot.hours}j) &bull;{' '}
                        {formatRupiah(ot.estimatedPay)}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-extrabold ${
                        ot.status === 'Disetujui'
                          ? 'text-emerald-700'
                          : ot.status === 'Ditolak'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {ot.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{ot.reason}</p>
                  {ot.status === 'Menunggu' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void reviewOvertime(ot.id, 'Disetujui').then(() =>
                            showToast(`Lembur ${ot.employeeName} disetujui.`)
                          );
                        }}
                        className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void reviewOvertime(ot.id, 'Ditolak').then(() =>
                            showToast(`Lembur ${ot.employeeName} ditolak.`)
                          );
                        }}
                        className="h-9 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Tolak
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {shiftSwaps.map((sw) => (
                <div
                  key={sw.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#0B2453]">
                        Tukar Shift: {sw.employeeName} ({sw.nik})
                      </div>
                      <div className="text-xs text-slate-600">
                        {sw.date} &bull; {sw.fromShift} &rarr; {sw.toShift}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-extrabold ${
                        sw.status === 'Disetujui'
                          ? 'text-emerald-700'
                          : sw.status === 'Ditolak'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {sw.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{sw.reason}</p>
                  {sw.status === 'Menunggu' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void reviewShiftSwap(sw.id, 'Disetujui').then(() =>
                            showToast(`Tukar shift ${sw.employeeName} disetujui.`)
                          );
                        }}
                        className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void reviewShiftSwap(sw.id, 'Ditolak').then(() =>
                            showToast(`Tukar shift ${sw.employeeName} ditolak.`)
                          );
                        }}
                        className="h-9 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Tolak
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {exitClearances.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-[#0B2453]">
                        Exit Clear: {ex.employeeName} ({ex.nik})
                      </div>
                      <div className="text-xs text-slate-600">
                        Hari terakhir: {ex.lastWorkingDate} &bull; {ex.division}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-extrabold ${
                        ex.status === 'Disetujui'
                          ? 'text-emerald-700'
                          : ex.status === 'Ditolak'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {ex.status}
                    </span>
                  </div>
                  {ex.status === 'Menunggu' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void reviewExitClearance(ex.id, 'Disetujui').then(() =>
                            showToast(`Exit Clearance ${ex.employeeName} disetujui.`)
                          );
                        }}
                        className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Finalisasi Exit Clear
                      </button>
                    </div>
                  )}
                </div>
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
                <option value="HRD">HRD</option>
                <option value="Security">Security</option>
                <option value="Cleaning Service">Cleaning Service</option>
                <option value="Operasional">Operasional</option>
                <option value="Keuangan">Keuangan</option>
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
                Cukup masukkan alamat email aktif dan data dasar karyawan. NIK dibuat otomatis berdasarkan divisi.
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
                  onChange={(e) => setEmpForm({ ...empForm, division: e.target.value as Division })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                >
                  <option value="Security">Security</option>
                  <option value="Cleaning Service">Cleaning Service</option>
                  <option value="Operasional">Operasional</option>
                  <option value="Keuangan">Keuangan</option>
                  <option value="HRD">HRD</option>
                </select>
                <select
                  aria-label="Pilih shift karyawan baru"
                  value={empForm.shiftCode}
                  onChange={(e) => setEmpForm({ ...empForm, shiftCode: e.target.value as ShiftCode })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"
                >
                  {Object.values(SHIFT_TEMPLATES).map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={submittingEmp}
                  className="h-10 rounded-xl bg-[#0B2453] text-white text-xs font-bold hover:bg-[#163A7A] cursor-pointer disabled:opacity-60"
                >
                  {submittingEmp ? 'Menyimpan...' : 'Simpan ke Firebase'}
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
                  <th className="py-2.5 pr-3">Shift</th>
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
                      <div className="font-bold text-slate-900">{emp.name}</div>
                      <div className="text-xs text-slate-500">
                        {emp.position} &bull; {emp.email}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                      {emp.division}
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        aria-label={`Ubah shift ${emp.name}`}
                        value={emp.shiftCode}
                        onChange={(e) => {
                          const nextShift = e.target.value as ShiftCode;
                          void updateEmployeeProfile(emp.uid, { shiftCode: nextShift }).then(() =>
                            showToast(`Shift ${emp.name} diubah ke ${nextShift}.`)
                          );
                        }}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                      >
                        {Object.values(SHIFT_TEMPLATES).map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.name}
                          </option>
                        ))}
                      </select>
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

      {/* SUBTAB 3: REKAP ABSENSI & CSV EXPORT */}
      {subTab === 'absensi' && (
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[#0B2453]">
                Rekap Absensi Seluruh Karyawan
              </h2>
              <p className="text-xs text-slate-500">
                Total {attendance.length} catatan kehadiran terverifikasi GPS &amp; Kamera Live.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#C69214] to-[#A6760B] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Rekap CSV</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-3">Tanggal</th>
                  <th className="py-2.5 pr-3">Karyawan</th>
                  <th className="py-2.5 pr-3">Masuk / Pulang</th>
                  <th className="py-2.5 pr-3">Lokasi GPS &amp; Kamera</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      Belum ada data absensi tercatat di Firebase.
                    </td>
                  </tr>
                ) : (
                  attendance.map((rec) => (
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
                        <div>
                          {rec.clockInTime || '--:--'} / {rec.clockOutTime || '--:--'}
                        </div>
                        {rec.workMinutes > 0 && (
                          <div className="text-[11px] text-slate-500">
                            {formatDuration(rec.workMinutes)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-[#C69214] shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {rec.clockInAddress || '-'}
                          </span>
                        </div>
                        {rec.clockInPhotoVerified && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <Camera className="w-3 h-3" />
                            <span>Kamera Live Terverifikasi</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 font-bold whitespace-nowrap">
                        <span
                          className={rec.lateMinutes > 0 ? 'text-amber-700' : 'text-emerald-700'}
                        >
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 4: EXPORT SEMUA */}
      {subTab === 'export' && <ExportAllPanel scope="all" onExportDone={showToast} />}
    </div>
  );
}

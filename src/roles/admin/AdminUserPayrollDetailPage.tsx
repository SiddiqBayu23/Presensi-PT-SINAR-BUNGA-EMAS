import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Banknote,
  Calculator,
  CalendarCheck2,
  Clock3,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import { EmployeeAvatar } from '../../shared/EmployeeAvatar';
import { SbumBadgeIcon } from '../../shared/SbumLogo';
import type {
  Employee,
  OvertimeRateMode,
  PayslipComponent,
  UserPayrollConfig,
} from '../../types/hris';
import {
  DEFAULT_WORK_DAYS_TARGET,
  buildRecentPayslipPeriods,
  calculateOvertimePayForRequest,
  calculatePayslip,
  formatPayslipComponentBasis,
  formatRupiah,
  formatThousands,
  resolveEffectivePayrollSettings,
} from '../../utils/hrisLogic';

interface AdminUserPayrollDetailPageProps {
  employee: Employee;
  initialPeriodKey: string;
  onBack: () => void;
  onShowToast: (message: string) => void;
}

function parseDigits(raw: string, max: number): number {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return 0;
  const n = Math.round(Number(digits));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

function parseDecimal(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Halaman detail penggajian per user: mengatur gaji bulanan, target hari kerja
 * (default 26 hari → otomatis menghitung gaji per 1x absen hadir), potongan BPJS &
 * terlambat, tarif lembur, komponen khusus user, simulasi, dan cetak slip gaji.
 */
export function AdminUserPayrollDetailPage({
  employee,
  initialPeriodKey,
  onBack,
  onShowToast,
}: AdminUserPayrollDetailPageProps) {
  const {
    attendance,
    overtimes,
    payslipComponents,
    addPayslipComponent,
    updatePayslipComponent,
    deletePayslipComponent,
    payrollSettings,
    userPayrollConfigs,
    updateEmployeeProfile,
    updateUserPayrollConfig,
    wibNow,
  } = useHris();

  const periods = useMemo(
    () => buildRecentPayslipPeriods(wibNow.year, wibNow.month),
    [wibNow.year, wibNow.month]
  );
  const [periodKey, setPeriodKey] = useState(initialPeriodKey);
  const selectedPeriod =
    periods.find((p) => p.key === periodKey) ?? {
      key: wibNow.periodKey,
      label: wibNow.periodLabel,
    };

  const savedConfig = userPayrollConfigs[employee.uid];
  const { settings: savedEffectiveSettings, workDaysTarget: savedWorkDays } = useMemo(
    () => resolveEffectivePayrollSettings(payrollSettings, savedConfig),
    [payrollSettings, savedConfig]
  );

  const [baseSalaryInput, setBaseSalaryInput] = useState(String(employee.baseSalary ?? 0));
  const [positionAllowanceInput, setPositionAllowanceInput] = useState(
    String(employee.positionAllowance ?? 0)
  );
  const [mealAllowanceInput, setMealAllowanceInput] = useState(
    String(employee.mealTransportAllowance ?? 0)
  );
  const [workDaysInput, setWorkDaysInput] = useState(String(savedWorkDays));
  const [bpjsKesPercent, setBpjsKesPercent] = useState(
    String(Math.round(savedEffectiveSettings.bpjsKesehatanRate * 10000) / 100)
  );
  const [bpjsTkPercent, setBpjsTkPercent] = useState(
    String(Math.round(savedEffectiveSettings.bpjsKetenagakerjaanRate * 10000) / 100)
  );
  const [latePerMinuteInput, setLatePerMinuteInput] = useState(
    String(savedEffectiveSettings.lateDeductionPerMinute)
  );
  const [overtimeMode, setOvertimeMode] = useState<OvertimeRateMode>(
    savedEffectiveSettings.overtimeRateMode
  );
  const [overtimeMultiplierInput, setOvertimeMultiplierInput] = useState(
    String(savedEffectiveSettings.overtimeHourlyMultiplier)
  );
  const [overtimeSessionRateInput, setOvertimeSessionRateInput] = useState(
    String(savedEffectiveSettings.overtimeSessionRate)
  );

  // Sinkron ulang bila berpindah user lain
  useEffect(() => {
    setBaseSalaryInput(String(employee.baseSalary ?? 0));
    setPositionAllowanceInput(String(employee.positionAllowance ?? 0));
    setMealAllowanceInput(String(employee.mealTransportAllowance ?? 0));
    setWorkDaysInput(String(savedWorkDays));
    setBpjsKesPercent(String(Math.round(savedEffectiveSettings.bpjsKesehatanRate * 10000) / 100));
    setBpjsTkPercent(
      String(Math.round(savedEffectiveSettings.bpjsKetenagakerjaanRate * 10000) / 100)
    );
    setLatePerMinuteInput(String(savedEffectiveSettings.lateDeductionPerMinute));
    setOvertimeMode(savedEffectiveSettings.overtimeRateMode);
    setOvertimeMultiplierInput(String(savedEffectiveSettings.overtimeHourlyMultiplier));
    setOvertimeSessionRateInput(String(savedEffectiveSettings.overtimeSessionRate));
  }, [employee, savedWorkDays, savedEffectiveSettings]);

  const [saving, setSaving] = useState(false);

  // Komponen tambahan khusus user ini (mis. BPJS tambahan, kasbon, bonus)
  const [extraName, setExtraName] = useState('');
  const [extraKind, setExtraKind] = useState<PayslipComponent['kind']>('deduction');
  const [extraBasis, setExtraBasis] = useState<PayslipComponent['basis']>('nominal');
  const [extraAmount, setExtraAmount] = useState('');
  const [addingExtra, setAddingExtra] = useState(false);

  const draftBaseSalary = parseDigits(baseSalaryInput, 500_000_000);
  const draftPositionAllowance = parseDigits(positionAllowanceInput, 200_000_000);
  const draftMealAllowance = parseDigits(mealAllowanceInput, 100_000_000);
  const draftWorkDays = Math.min(
    31,
    Math.max(1, parseDigits(workDaysInput, 31) || DEFAULT_WORK_DAYS_TARGET)
  );

  const draftUserConfig: UserPayrollConfig = {
    workDaysTarget: draftWorkDays,
    bpjsKesehatanRate: parseDecimal(bpjsKesPercent, 0, 100, 1) / 100,
    bpjsKetenagakerjaanRate: parseDecimal(bpjsTkPercent, 0, 100, 2) / 100,
    lateDeductionPerMinute: parseDigits(latePerMinuteInput, 1_000_000),
    overtimeRateMode: overtimeMode,
    overtimeHourlyMultiplier: parseDecimal(overtimeMultiplierInput, 0, 10, 1.5),
    overtimeSessionRate: parseDigits(overtimeSessionRateInput, 10_000_000),
  };

  const draftEmployee: Employee = {
    ...employee,
    baseSalary: draftBaseSalary,
    positionAllowance: draftPositionAllowance,
    mealTransportAllowance: draftMealAllowance,
  };

  const slip = useMemo(
    () =>
      calculatePayslip(
        draftEmployee,
        selectedPeriod.key,
        selectedPeriod.label,
        attendance,
        overtimes,
        payslipComponents,
        payrollSettings,
        draftUserConfig
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      employee.uid,
      employee.division,
      draftBaseSalary,
      draftPositionAllowance,
      draftMealAllowance,
      draftWorkDays,
      bpjsKesPercent,
      bpjsTkPercent,
      latePerMinuteInput,
      overtimeMode,
      overtimeMultiplierInput,
      overtimeSessionRateInput,
      selectedPeriod.key,
      selectedPeriod.label,
      attendance,
      overtimes,
      payslipComponents,
      payrollSettings,
    ]
  );

  const dailyRateInputVal = Math.round(draftBaseSalary / draftWorkDays);
  const dailyAllowanceRate = Math.round(
    (draftPositionAllowance + draftMealAllowance) / draftWorkDays
  );
  const hourlyOvertimePay = useMemo(() => {
    const { settings } = resolveEffectivePayrollSettings(payrollSettings, draftUserConfig);
    return calculateOvertimePayForRequest({ hours: 1 }, draftBaseSalary, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftBaseSalary,
    overtimeMode,
    overtimeMultiplierInput,
    overtimeSessionRateInput,
    payrollSettings,
  ]);

  const isDirty =
    draftBaseSalary !== employee.baseSalary ||
    draftPositionAllowance !== employee.positionAllowance ||
    draftMealAllowance !== employee.mealTransportAllowance ||
    draftWorkDays !== savedWorkDays ||
    Math.abs(
      (draftUserConfig.bpjsKesehatanRate ?? 0) - savedEffectiveSettings.bpjsKesehatanRate
    ) > 0.0001 ||
    Math.abs(
      (draftUserConfig.bpjsKetenagakerjaanRate ?? 0) -
        savedEffectiveSettings.bpjsKetenagakerjaanRate
    ) > 0.0001 ||
    draftUserConfig.lateDeductionPerMinute !== savedEffectiveSettings.lateDeductionPerMinute ||
    draftUserConfig.overtimeRateMode !== savedEffectiveSettings.overtimeRateMode ||
    Math.abs(
      (draftUserConfig.overtimeHourlyMultiplier ?? 0) -
        savedEffectiveSettings.overtimeHourlyMultiplier
    ) > 0.001 ||
    draftUserConfig.overtimeSessionRate !== savedEffectiveSettings.overtimeSessionRate;

  // Simulasi cepat kehadiran & lembur
  const [simDaysInput, setSimDaysInput] = useState(String(draftWorkDays));
  const [simOvertimeHoursInput, setSimOvertimeHoursInput] = useState('0');
  const simDays = Math.min(31, Math.max(0, parseDigits(simDaysInput, 31)));
  const simOvertimeHours = parseDecimal(simOvertimeHoursInput, 0, 200, 0);

  const simPreview = useMemo(() => {
    const fakeAttendance = Array.from({ length: simDays }, (_, idx) => ({
      id: `sim_att_${idx}`,
      uid: employee.uid,
      nik: employee.nik,
      employeeName: employee.name,
      division: employee.division,
      date: `${selectedPeriod.key}-${String(Math.min(28, idx + 1)).padStart(2, '0')}`,
      shiftCode: employee.shiftCode,
      clockInTime: '08:00:00',
      clockInPhotoVerified: true,
      clockInLat: 0,
      clockInLng: 0,
      clockInAddress: '',
      clockInDistanceMeters: 0,
      lateMinutes: 0,
      clockOutTime: '17:00:00',
      clockOutPhotoVerified: true,
      clockOutLat: 0,
      clockOutLng: 0,
      clockOutAddress: '',
      workMinutes: 540,
      status: 'Selesai' as const,
    }));
    const fakeOvertime =
      simOvertimeHours > 0
        ? [
            {
              id: 'sim_ot',
              uid: employee.uid,
              nik: employee.nik,
              employeeName: employee.name,
              division: employee.division,
              date: `${selectedPeriod.key}-01`,
              startTime: '17:00',
              endTime: '19:00',
              hours: simOvertimeHours,
              estimatedPay: 0,
              reason: 'Simulasi',
              status: 'Disetujui' as const,
              createdLabel: '',
              reviewedBy: '',
            },
          ]
        : [];
    return calculatePayslip(
      draftEmployee,
      selectedPeriod.key,
      selectedPeriod.label,
      fakeAttendance,
      fakeOvertime,
      payslipComponents,
      payrollSettings,
      draftUserConfig
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    simDays,
    simOvertimeHours,
    draftBaseSalary,
    draftPositionAllowance,
    draftMealAllowance,
    draftWorkDays,
    bpjsKesPercent,
    bpjsTkPercent,
    overtimeMode,
    overtimeMultiplierInput,
    overtimeSessionRateInput,
    selectedPeriod.key,
    selectedPeriod.label,
    payslipComponents,
    payrollSettings,
    employee.uid,
  ]);

  // Log aktual kehadiran & lembur di periode ini
  const periodAttendance = useMemo(
    () =>
      attendance
        .filter((r) => r.uid === employee.uid && r.date.startsWith(selectedPeriod.key))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [attendance, employee.uid, selectedPeriod.key]
  );
  const periodOvertimes = useMemo(
    () =>
      overtimes
        .filter((o) => o.uid === employee.uid && o.date.startsWith(selectedPeriod.key))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [overtimes, employee.uid, selectedPeriod.key]
  );

  const userSpecificComponents = useMemo(
    () =>
      payslipComponents.filter(
        (c) => c.scope === 'employee' && c.employeeUid === employee.uid
      ),
    [payslipComponents, employee.uid]
  );

  const handleDailyRateEdit = (raw: string) => {
    const perDay = parseDigits(raw, 50_000_000);
    const totalMonthly = Math.min(500_000_000, perDay * draftWorkDays);
    setBaseSalaryInput(String(totalMonthly));
  };

  const handleResetDraft = () => {
    setBaseSalaryInput(String(employee.baseSalary ?? 0));
    setPositionAllowanceInput(String(employee.positionAllowance ?? 0));
    setMealAllowanceInput(String(employee.mealTransportAllowance ?? 0));
    setWorkDaysInput(String(savedWorkDays));
    setBpjsKesPercent(String(Math.round(savedEffectiveSettings.bpjsKesehatanRate * 10000) / 100));
    setBpjsTkPercent(
      String(Math.round(savedEffectiveSettings.bpjsKetenagakerjaanRate * 10000) / 100)
    );
    setLatePerMinuteInput(String(savedEffectiveSettings.lateDeductionPerMinute));
    setOvertimeMode(savedEffectiveSettings.overtimeRateMode);
    setOvertimeMultiplierInput(String(savedEffectiveSettings.overtimeHourlyMultiplier));
    setOvertimeSessionRateInput(String(savedEffectiveSettings.overtimeSessionRate));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateEmployeeProfile(employee.uid, {
        baseSalary: draftBaseSalary,
        positionAllowance: draftPositionAllowance,
        mealTransportAllowance: draftMealAllowance,
      });
      const cfgRes = await updateUserPayrollConfig(employee.uid, draftUserConfig);
      if (!cfgRes.ok) {
        onShowToast(cfgRes.error ?? 'Gagal menyimpan pengaturan hari kerja/potongan.');
        return;
      }
      onShowToast(
        `Gaji & aturan payroll ${employee.name} disimpan (${formatRupiah(
          Math.round(draftBaseSalary / draftWorkDays)
        )}/absen).`
      );
    } catch {
      onShowToast(`Gagal menyimpan gaji ${employee.name}. Periksa koneksi lalu coba lagi.`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddExtraComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingExtra) return;
    const amt = parseDecimal(extraAmount, 0, 500_000_000, 0);
    setAddingExtra(true);
    const res = await addPayslipComponent({
      name: extraName,
      kind: extraKind,
      basis: extraBasis,
      amount: amt,
      scope: 'employee',
      employeeUid: employee.uid,
      active: true,
    });
    setAddingExtra(false);
    if (!res.ok) {
      onShowToast(res.error ?? 'Gagal menambah item.');
      return;
    }
    onShowToast(`Item "${extraName.trim()}" ditambahkan untuk ${employee.name}.`);
    setExtraName('');
    setExtraAmount('');
  };

  return (
    <div className="space-y-5">
      {/* Bar Navigasi Kembali & Pilih Periode */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-extrabold text-[#0B2453] inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Slip Gaji</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Pilih periode slip gaji karyawan"
            value={selectedPeriod.key}
            onChange={(e) => setPeriodKey(e.target.value)}
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
            onClick={() => window.print()}
            className="h-10 px-4 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak / PDF</span>
          </button>
        </div>
      </div>

      {/* Hero Identitas User & Total yang Harus Dibayarkan */}
      <section className="rounded-3xl bg-gradient-to-br from-[#0A1E46] via-[#122D65] to-[#0B2250] p-5 sm:p-6 text-white shadow-[0_10px_30px_rgba(11,36,83,0.18)] border-b-4 border-[#C69214] space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <EmployeeAvatar
              name={employee.name}
              photoUrl={employee.photoUrl}
              className="w-14 h-14"
              textClassName="text-base"
            />
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#F3CA62]">
                Rincian Gaji &amp; Kehadiran Karyawan
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold truncate">{employee.name}</h2>
              <p className="text-xs text-slate-200 truncate">
                {employee.nik} &bull; {employee.position} &bull; {employee.division} &bull;{' '}
                {employee.contractType}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 border border-white/15 px-4 py-3 text-left lg:text-right shrink-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-200">
              Total yang Harus Dibayarkan ({selectedPeriod.label})
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#F5D36C] mt-0.5">
              {formatRupiah(slip.netPay)}
            </div>
            <div className="text-[11px] text-slate-200 mt-0.5">
              {isDirty ? 'Pratinjau perubahan belum disimpan' : 'Sesuai absensi & aturan tersimpan'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 text-xs">
          <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2">
            <div className="text-[10px] text-slate-300 uppercase font-bold">Gaji / 1x Absen</div>
            <div className="font-mono font-extrabold text-white mt-0.5">
              {formatRupiah(slip.dailyBaseRate)}
            </div>
            <div className="text-[10px] text-amber-200">
              Target {slip.workDaysTarget} hari = {formatRupiah(draftBaseSalary)}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2">
            <div className="text-[10px] text-slate-300 uppercase font-bold">Kehadiran Kantor</div>
            <div className="font-mono font-extrabold text-emerald-300 mt-0.5">
              {slip.attendanceDays} / {slip.workDaysTarget} hari
            </div>
            <div className="text-[10px] text-slate-200">
              Gaji hadir: {formatRupiah(slip.earnedBasePay)}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2">
            <div className="text-[10px] text-slate-300 uppercase font-bold">Lembur Disetujui</div>
            <div className="font-mono font-extrabold text-[#F4CE6A] mt-0.5">
              {formatRupiah(slip.overtimePay)}
            </div>
            <div className="text-[10px] text-slate-200">
              {slip.overtimeHours > 0
                ? `${slip.overtimeHours} jam (${formatRupiah(hourlyOvertimePay)}/jam)`
                : `Tarif ${formatRupiah(hourlyOvertimePay)}/jam`}
            </div>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2">
            <div className="text-[10px] text-slate-300 uppercase font-bold">Total Potongan</div>
            <div className="font-mono font-extrabold text-[#FCA5A5] mt-0.5">
              −{formatRupiah(slip.totalDeductions)}
            </div>
            <div className="text-[10px] text-slate-200">BPJS, telat &amp; potongan user</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Kolom Kiri (7/12): Editor Gaji, BPJS, Lembur, & Potongan Khusus User */}
        <div className="xl:col-span-7 space-y-5 no-print">
          {/* 1. Editor Gaji & Target Absen */}
          <section className="rounded-3xl bg-white p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#0B2453]">
                  1. Pengaturan Gaji &amp; Hitungan Per Absen
                </h3>
                <p className="text-xs text-slate-500">
                  Gaji dibayarkan sesuai jumlah kehadiran di kantor. Ubah target bulanan atau tarif
                  per absen untuk user ini.
                </p>
              </div>
              {isDirty && (
                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-[#FFF8E6] text-[#9B710D] border border-[#F3D88B]">
                  Ada Perubahan
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 block">
                  Target Gaji Bulanan (Rp)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Target gaji bulanan"
                  value={formatThousands(baseSalaryInput)}
                  onChange={(e) => setBaseSalaryInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold text-slate-900 focus:border-[#0B2453] focus:outline-none"
                />
                <span className="text-[10px] font-mono text-slate-500 block">
                  {formatRupiah(draftBaseSalary)}
                </span>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 block">
                  Target Hari Kerja / Bulan
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  aria-label="Target hari kerja per bulan"
                  value={workDaysInput}
                  onChange={(e) => setWorkDaysInput(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold text-slate-900 focus:border-[#0B2453] focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 block">Bawaan: 26 hari kerja</span>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-[#0B2453] block">
                  Gaji per 1x Absen Hadir (Rp)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Gaji per satu kali absen"
                  value={formatThousands(dailyRateInputVal)}
                  onChange={(e) => handleDailyRateEdit(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#C69214] bg-[#FFFBEB] px-3 text-sm font-mono font-extrabold text-[#0B2453] focus:border-[#0B2453] focus:outline-none"
                />
                <span className="text-[10px] font-mono text-[#9B710D] block">
                  {formatRupiah(dailyRateInputVal)} / hadir
                </span>
              </label>
            </div>

            <div className="rounded-2xl bg-[#EEF3FA] border border-blue-200/80 px-4 py-3 text-xs text-[#0B2453] space-y-1">
              <div className="font-extrabold">
                Rumus Kehadiran {employee.name}:
              </div>
              <p className="leading-relaxed">
                Target <strong>{draftWorkDays} hari kerja</strong> ={' '}
                <strong className="font-mono">{formatRupiah(draftBaseSalary)}</strong> &rarr;
                setiap absen hadir mendapat{' '}
                <strong className="font-mono">{formatRupiah(dailyRateInputVal)}</strong>
                {dailyAllowanceRate > 0 && (
                  <>
                    {' '}
                    (+ tunjangan <strong className="font-mono">{formatRupiah(dailyAllowanceRate)}</strong>/hadir,
                    total <strong className="font-mono">{formatRupiah(slip.dailyTotalRate)}</strong>/hadir)
                  </>
                )}
                .
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Tunjangan Jabatan / Bulan (Rp)</span>
                  <span className="font-mono text-[#0B2453]">
                    {formatRupiah(Math.round(draftPositionAllowance / draftWorkDays))}/hadir
                  </span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Tunjangan jabatan"
                  value={formatThousands(positionAllowanceInput)}
                  onChange={(e) => setPositionAllowanceInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold text-slate-900 focus:border-[#0B2453] focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Tunjangan Makan &amp; Transport / Bulan (Rp)</span>
                  <span className="font-mono text-[#0B2453]">
                    {formatRupiah(Math.round(draftMealAllowance / draftWorkDays))}/hadir
                  </span>
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Tunjangan makan dan transport"
                  value={formatThousands(mealAllowanceInput)}
                  onChange={(e) => setMealAllowanceInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold text-slate-900 focus:border-[#0B2453] focus:outline-none"
                />
              </label>
            </div>
          </section>

          {/* 2. Potongan BPJS, Keterlambatan, & Lembur Khusus User */}
          <section className="rounded-3xl bg-white p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-[#0B2453]">
                2. Potongan BPJS, Keterlambatan &amp; Tarif Lembur User
              </h3>
              <p className="text-xs text-slate-500">
                Pengaturan ini berlaku khusus untuk {employee.name} (dapat berbeda antar karyawan).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>BPJS Kesehatan (%)</span>
                  <span className="font-mono text-rose-700">
                    {formatRupiah(
                      Math.round(draftBaseSalary * (draftUserConfig.bpjsKesehatanRate ?? 0))
                    )}
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={bpjsKesPercent}
                  onChange={(e) => setBpjsKesPercent(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold focus:border-[#0B2453] focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>BPJS TK / JHT (%)</span>
                  <span className="font-mono text-rose-700">
                    {formatRupiah(
                      Math.round(draftBaseSalary * (draftUserConfig.bpjsKetenagakerjaanRate ?? 0))
                    )}
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={bpjsTkPercent}
                  onChange={(e) => setBpjsTkPercent(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold focus:border-[#0B2453] focus:outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 block">
                  Denda Telat (Rp / menit)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatThousands(latePerMinuteInput)}
                  onChange={(e) => setLatePerMinuteInput(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold focus:border-[#0B2453] focus:outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 block">
                  Mode Insentif Lembur
                </span>
                <select
                  value={overtimeMode}
                  onChange={(e) => setOvertimeMode(e.target.value as OvertimeRateMode)}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold focus:border-[#0B2453] focus:outline-none"
                >
                  <option value="perJam">Per Jam (pengali × upah/jam)</option>
                  <option value="perSesi">Per Sesi (nominal tetap)</option>
                </select>
              </label>

              {overtimeMode === 'perJam' ? (
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    Pengali Lembur / Jam
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={overtimeMultiplierInput}
                    onChange={(e) => setOvertimeMultiplierInput(e.target.value)}
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold focus:border-[#0B2453] focus:outline-none"
                  />
                </label>
              ) : (
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    Tarif Lembur / Sesi (Rp)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatThousands(overtimeSessionRateInput)}
                    onChange={(e) =>
                      setOvertimeSessionRateInput(e.target.value.replace(/[^0-9]/g, ''))
                    }
                    className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-mono font-bold focus:border-[#0B2453] focus:outline-none"
                  />
                </label>
              )}

              <div className="rounded-xl bg-[#F8FAFD] border border-slate-200 px-3 py-2 flex flex-col justify-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">
                  {overtimeMode === 'perJam' ? 'Nilai 1 Jam Lembur' : 'Nilai 1 Sesi Lembur'}
                </div>
                <div className="text-sm font-extrabold font-mono text-emerald-700 mt-0.5">
                  {formatRupiah(hourlyOvertimePay)}
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100">
              {isDirty && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleResetDraft}
                  className="h-10 px-4 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="h-10 px-5 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs"
              >
                <Save className="w-4 h-4 text-[#F4CE6A]" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Gaji User'}</span>
              </button>
            </div>
          </section>

          {/* 3. Potongan / Bonus Tambahan Khusus User Ini */}
          <section className="rounded-3xl bg-white p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-[#0B2453]">
                3. Potongan &amp; Tunjangan Tambahan Khusus {employee.name}
              </h3>
              <p className="text-xs text-slate-500">
                Tambahkan potongan khusus (mis. BPJS Pensiun, Kasbon, Iuran) atau bonus tambahan
                yang hanya berlaku untuk karyawan ini.
              </p>
            </div>

            <form
              onSubmit={handleAddExtraComponent}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
            >
              <input
                type="text"
                required
                placeholder="Nama item (mis. BPJS Pensiun / Kasbon)"
                value={extraName}
                onChange={(e) => setExtraName(e.target.value)}
                className="h-10 rounded-xl border border-slate-300 px-3 text-xs sm:col-span-4 focus:border-[#0B2453] focus:outline-none"
              />
              <select
                aria-label="Jenis item tambahan"
                value={extraKind}
                onChange={(e) => setExtraKind(e.target.value as PayslipComponent['kind'])}
                className="h-10 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold sm:col-span-3"
              >
                <option value="deduction">Potongan (−)</option>
                <option value="earning">Penerimaan (+)</option>
              </select>
              <select
                aria-label="Dasar perhitungan item"
                value={extraBasis}
                onChange={(e) => {
                  const nextBasis = e.target.value as PayslipComponent['basis'];
                  setExtraBasis(nextBasis);
                  if (nextBasis === 'nominal') {
                    setExtraAmount((prev) => prev.replace(/[^0-9]/g, ''));
                  }
                }}
                className="h-10 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-semibold sm:col-span-2"
              >
                <option value="nominal">Nominal Rp</option>
                <option value="persenGajiPokok">% Gaji</option>
              </select>
              {extraBasis === 'nominal' ? (
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="Rp"
                  value={formatThousands(extraAmount)}
                  onChange={(e) => setExtraAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  className="h-10 rounded-xl border border-slate-300 px-3 text-xs font-mono font-bold sm:col-span-2 focus:border-[#0B2453] focus:outline-none"
                />
              ) : (
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  step={0.1}
                  placeholder="%"
                  value={extraAmount}
                  onChange={(e) => setExtraAmount(e.target.value)}
                  className="h-10 rounded-xl border border-slate-300 px-3 text-xs font-mono font-bold sm:col-span-2 focus:border-[#0B2453] focus:outline-none"
                />
              )}
              <button
                type="submit"
                disabled={addingExtra}
                aria-label="Tambah item gaji khusus user"
                className="h-10 px-3 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer sm:col-span-1 disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {userSpecificComponents.length === 0 ? (
              <p className="text-xs text-slate-500">
                Belum ada potongan/tunjangan tambahan khusus untuk {employee.name}.
              </p>
            ) : (
              <div className="space-y-2">
                {userSpecificComponents.map((comp) => (
                  <div
                    key={comp.id}
                    className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          comp.kind === 'earning'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {comp.kind === 'earning' ? 'Tambah (+)' : 'Potong (−)'}
                      </span>
                      <span className="font-bold text-[#0B2453] truncate">{comp.name}</span>
                      <span className="font-mono font-bold text-slate-600">
                        {formatPayslipComponentBasis(comp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void updatePayslipComponent(comp.id, { active: !comp.active })
                        }
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border cursor-pointer ${
                          comp.active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {comp.active ? 'Aktif' : 'Non-Aktif'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus ${comp.name}`}
                        onClick={() =>
                          void deletePayslipComponent(comp.id).then(() =>
                            onShowToast(`Item "${comp.name}" dihapus.`)
                          )
                        }
                        className="h-7 w-7 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 inline-flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Kolom Kanan (5/12): Slip Gaji Periode + Kalkulator Simulasi + Log Hadir/Lembur */}
        <div className="xl:col-span-5 space-y-5">
          {/* Rincian Slip Gaji (juga tampil saat Print/PDF) */}
          <section className="rounded-3xl bg-white p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <SbumBadgeIcon className="w-9 h-9" />
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
                    Rincian Slip Gaji
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {employee.name} &bull; {selectedPeriod.label}
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-[#EEF3FA] text-[#0B2453]">
                {slip.attendanceDays}/{slip.workDaysTarget} hadir
              </span>
            </div>

            {slip.attendanceDays === 0 && slip.overtimePay === 0 && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  User belum memiliki absensi masuk pada periode <strong>{selectedPeriod.label}</strong>,
                  sehingga gaji kehadiran bulan ini masih <strong>Rp 0</strong>.
                </span>
              </div>
            )}

            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200/80 p-3.5 space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700 flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5" />
                  <span>Penerimaan</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {slip.earnings.map((line) => (
                    <div key={line.code} className="flex justify-between gap-2">
                      <span className="text-slate-600">{line.label}</span>
                      <span className="font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatRupiah(line.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-[#0B2453]">
                    <span>Total Penerimaan</span>
                    <span className="font-mono">{formatRupiah(slip.grossPay)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 p-3.5 space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-rose-700">
                  Potongan (BPJS, Telat &amp; Lainnya)
                </div>
                <div className="space-y-1.5 text-xs">
                  {slip.deductions.length === 0 ? (
                    <p className="text-slate-500">Tidak ada potongan pada periode ini.</p>
                  ) : (
                    slip.deductions.map((line) => (
                      <div key={line.code} className="flex justify-between gap-2">
                        <span className="text-slate-600">{line.label}</span>
                        <span className="font-mono font-bold text-rose-700 whitespace-nowrap">
                          −{formatRupiah(line.amount)}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-rose-700">
                    <span>Total Potongan</span>
                    <span className="font-mono">{formatRupiah(slip.totalDeductions)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-r from-[#0B2453] to-[#163A7A] p-4 text-white flex items-center justify-between gap-3 border-b-4 border-[#C69214]">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                    Total yang Harus Dibayarkan
                  </div>
                  <div className="text-[11px] text-slate-200">Take Home Pay</div>
                </div>
                <div className="text-xl font-extrabold font-mono tabular-nums text-[#F5D36C]">
                  {formatRupiah(slip.netPay)}
                </div>
              </div>
            </div>
          </section>

          {/* Simulasi Cepat (mis. 26 hari kerja + lembur) */}
          <section className="no-print rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#C69214]" />
              <h3 className="text-sm font-extrabold text-[#0B2453]">
                Simulasi Gaji (Hadir &amp; Lembur)
              </h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Uji perhitungan bila user hadir sejumlah hari tertentu atau lembur (tidak mengubah
              data absensi asli).
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600">Simulasi Hari Hadir</span>
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={simDaysInput}
                  onChange={(e) => setSimDaysInput(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-300 px-3 text-xs font-mono font-bold focus:border-[#0B2453] focus:outline-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600">Simulasi Jam Lembur</span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={0.5}
                  value={simOvertimeHoursInput}
                  onChange={(e) => setSimOvertimeHoursInput(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-300 px-3 text-xs font-mono font-bold focus:border-[#0B2453] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[0, 1, Math.floor(draftWorkDays / 2), draftWorkDays].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSimDaysInput(String(d))}
                  className="h-7 px-2.5 rounded-lg bg-[#EEF3FA] hover:bg-[#DDE7F6] text-[11px] font-bold text-[#0B2453] cursor-pointer"
                >
                  {d === draftWorkDays ? `${d} hari (penuh)` : `${d} hari`}
                </button>
              ))}
            </div>

            <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/80 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">
                  Gaji Hadir ({simDays}/{draftWorkDays} hari)
                </span>
                <span className="font-mono font-bold text-[#0B2453]">
                  {formatRupiah(simPreview.earnedBasePay)}
                </span>
              </div>
              {simPreview.earnedPositionAllowance + simPreview.earnedMealAllowance > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Tunjangan Proporsional</span>
                  <span className="font-mono font-bold text-[#0B2453]">
                    {formatRupiah(
                      simPreview.earnedPositionAllowance + simPreview.earnedMealAllowance
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Lembur ({simOvertimeHours} jam)</span>
                <span className="font-mono font-bold text-emerald-700">
                  +{formatRupiah(simPreview.overtimePay)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Potongan BPJS &amp; Tambahan</span>
                <span className="font-mono font-bold text-rose-700">
                  −{formatRupiah(simPreview.totalDeductions)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-[#0B2453]">
                <span>Estimasi Dibayarkan</span>
                <span className="font-mono text-sm">{formatRupiah(simPreview.netPay)}</span>
              </div>
            </div>
          </section>

          {/* Log Kehadiran & Lembur Periode Ini */}
          <section className="no-print rounded-3xl bg-white p-5 border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0B2453] flex items-center gap-2">
                <CalendarCheck2 className="w-4 h-4 text-[#C69214]" />
                <span>Log Absensi &amp; Lembur ({selectedPeriod.label})</span>
              </h3>
              <span className="text-[11px] font-mono font-bold text-slate-500">
                {periodAttendance.length} hadir &bull; {periodOvertimes.length} lembur
              </span>
            </div>

            {periodAttendance.length === 0 && periodOvertimes.length === 0 ? (
              <p className="text-xs text-slate-500">
                Belum ada catatan absensi atau pengajuan lembur pada periode ini.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 text-xs">
                {periodAttendance.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-xl bg-[#F9FBFE] border border-slate-200/80 px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-[#0B2453] font-mono">{rec.date}</div>
                      <div className="text-[11px] text-slate-500">
                        Masuk {rec.clockInTime || '--:--'} &bull; Pulang{' '}
                        {rec.clockOutTime || '--:--'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          rec.lateMinutes > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {rec.lateMinutes > 0 ? `Telat ${rec.lateMinutes}m` : 'Tepat Waktu'}
                      </span>
                    </div>
                  </div>
                ))}
                {periodOvertimes.map((ot) => (
                  <div
                    key={ot.id}
                    className="rounded-xl bg-[#FFFBEB] border border-[#F3D88B] px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-[#0B2453] flex items-center gap-1.5">
                        <Clock3 className="w-3.5 h-3.5 text-[#C69214] shrink-0" />
                        <span className="font-mono">{ot.date}</span>
                        <span>({ot.hours} jam)</span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">{ot.reason}</div>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        ot.status === 'Disetujui'
                          ? 'bg-emerald-100 text-emerald-800'
                          : ot.status === 'Ditolak'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {ot.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

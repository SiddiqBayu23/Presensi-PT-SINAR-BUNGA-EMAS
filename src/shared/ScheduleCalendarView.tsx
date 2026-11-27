import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { DivisionOperatingHoursEditor } from './DivisionOperatingHoursEditor';
import { useHris } from '../context/HrisContext';
import type { Division, ShiftCode } from '../types/hris';
import {
  checkScheduleGaps,
  formatIndonesianDateFromIso,
  getShiftRostersForDate,
  resolveDivisionShiftRule,
} from '../utils/hrisLogic';

interface ScheduleCalendarViewProps {
  /** Jika diberikan, batasi divisi ke divisi ini (untuk peran supervisor). HRD dapat memilih semua. */
  forcedDivision?: Division;
  onShowToast?: (msg: string) => void;
}

export function ScheduleCalendarView({ forcedDivision, onShowToast }: ScheduleCalendarViewProps) {
  const {
    currentUser,
    divisions,
    employees,
    schedules,
    divisionShiftRules,
    shiftTemplateFor,
    wibNow,
    saveShiftRoster,
    deleteScheduleEntry,
  } = useHris();

  const isHrd = currentUser?.role === 'hrd';
  const supervisorDivision = forcedDivision ?? (currentUser?.role === 'supervisor' ? currentUser.division : undefined);

  // Filter divisi: jika supervisor terkunci ke divisinya, jika HRD bisa 'all' atau per divisi
  const [selectedDivision, setSelectedDivision] = useState<string>(
    supervisorDivision ?? 'all'
  );

  // Navigasi kalender bulanan
  const [currentYear, setCurrentYear] = useState<number>(() => {
    const [y] = wibNow.isoDate.split('-').map(Number);
    return y;
  });
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    const [, m] = wibNow.isoDate.split('-').map(Number);
    return m; // 1-12
  });

  // Tanggal yang dipilih untuk melihat detail & input tugas
  const [selectedDate, setSelectedDate] = useState<string>(wibNow.isoDate);

  // Form input jadwal shift untuk tanggal terpilih
  const [formShiftCode, setFormShiftCode] = useState<ShiftCode>('PAGI');
  const [formPrimaryUids, setFormPrimaryUids] = useState<string[]>([]);
  const [formBackupUid, setFormBackupUid] = useState<string>('');
  /** Rincian peringatan jadwal dibuka manual agar banner tidak menutupi kalender. */
  const [showGapWarnings, setShowGapWarnings] = useState(false);
  const [editingRoster, setEditingRoster] = useState<{
    date: string;
    division: Division;
    shiftCode: ShiftCode;
    entryIdsByUid: Record<string, string>;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const rosterFormRef = useRef<HTMLElement | null>(null);
  // Divisi efektif saat menambah jadwal: jika dipilih spesifik atau default divisi pertama
  const effectiveDivisionForForm = useMemo(() => {
    if (supervisorDivision) return supervisorDivision;
    if (selectedDivision !== 'all') return selectedDivision;
    return divisions[0] ?? 'HRD';
  }, [supervisorDivision, selectedDivision, divisions]);

  // Daftar shift yang diizinkan untuk divisi form
  const allowedShifts = useMemo(() => {
    return resolveDivisionShiftRule(effectiveDivisionForForm, divisionShiftRules).allowedShiftCodes;
  }, [effectiveDivisionForForm, divisionShiftRules]);

  // Shift terpilih bisa saja sudah dihapus HRD dari divisi ini; pakai shift pertama yang valid.
  const activeFormShiftCode: ShiftCode = allowedShifts.includes(formShiftCode)
    ? formShiftCode
    : (allowedShifts[0] ?? formShiftCode);

  // Karyawan aktif di divisi form
  const eligibleStaff = useMemo(() => {
    return employees.filter(
      (e) => e.division === effectiveDivisionForForm && e.active
    );
  }, [employees, effectiveDivisionForForm]);

  // Hitung peringatan jadwal kosong / belum ada backup untuk 14 hari ke depan
  const gapWarnings = useMemo(() => {
    const divList = supervisorDivision ? [supervisorDivision] : divisions;
    return checkScheduleGaps({
      divisions: divList,
      employees,
      schedules,
      startDate: wibNow.isoDate,
      daysCount: 14,
    });
  }, [supervisorDivision, divisions, employees, schedules, wibNow.isoDate]);

  // Hari-hari dalam bulan yang sedang dibuka
  const monthDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const totalDays = lastDay.getDate();
    // 0 = Minggu, ubah agar Senin = 0 s/d Minggu = 6
    let startingDayOfWeek = firstDay.getDay() - 1;
    if (startingDayOfWeek < 0) startingDayOfWeek = 6;

    const days: Array<{
      dayNumber: number;
      isoDate: string;
      isCurrentMonth: boolean;
    }> = [];

    // Hari padding dari bulan sebelumnya
    const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i -= 1) {
      const d = prevMonthLastDay - i;
      const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
      days.push({
        dayNumber: d,
        isoDate: `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isCurrentMonth: false,
      });
    }

    // Hari bulan ini
    for (let d = 1; d <= totalDays; d += 1) {
      days.push({
        dayNumber: d,
        isoDate: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isCurrentMonth: true,
      });
    }

    // Padding penutup s/d kelipatan 7
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      const nextM = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextY = currentMonth === 12 ? currentYear + 1 : currentYear;
      for (let d = 1; d <= remaining; d += 1) {
        days.push({
          dayNumber: d,
          isoDate: `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          isCurrentMonth: false,
        });
      }
    }

    return days;
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    const [y, m] = wibNow.isoDate.split('-').map(Number);
    setCurrentYear(y);
    setCurrentMonth(m);
    setSelectedDate(wibNow.isoDate);
    setEditingRoster(null);
  };
  const togglePrimaryStaff = (uid: string) => {
    setFormPrimaryUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      // Jika dijadikan staf jaga, lepaskan dari backup bila sebelumnya dipilih
      if (formBackupUid === uid) {
        setFormBackupUid('');
      }
      return [...prev, uid];
    });
  };

  const startEditRoster = (roster: (typeof rostersOnSelectedDate)[number]) => {
    if (isHrd && !forcedDivision) {
      setSelectedDivision(roster.division);
    }
    setFormShiftCode(roster.shiftCode);
    setFormPrimaryUids(roster.primaryStaff.map((s) => s.uid));
    setFormBackupUid(roster.backupStaff?.uid ?? '');
    setEditingRoster({
      date: selectedDate,
      division: roster.division,
      shiftCode: roster.shiftCode,
      entryIdsByUid: Object.fromEntries(roster.entries.map((e) => [e.uid, e.id])),
    });
    rosterFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const cancelEditRoster = () => {
    setEditingRoster(null);
    setFormPrimaryUids([]);
    setFormBackupUid('');
  };

  const handleSaveRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formPrimaryUids.length === 0) {
      onShowToast?.('Pilih minimal 1 staf untuk bertugas jaga.');
      return;
    }
    if (!formBackupUid) {
      const confirmNoBackup = window.confirm(
        'Perhatian: Anda belum memilih staf cadangan (backup). Apakah tetap ingin menyimpan?'
      );
      if (!confirmNoBackup) return;
    }

    setIsSaving(true);
    const res = await saveShiftRoster({
      date: selectedDate,
      division: effectiveDivisionForForm,
      shiftCode: activeFormShiftCode,
      primaryUids: formPrimaryUids,
      backupUid: formBackupUid || undefined,
    });

    if (res.ok && editingRoster && editingRoster.date === selectedDate) {
      const keptUids = new Set([...formPrimaryUids, ...(formBackupUid ? [formBackupUid] : [])]);
      const removedIds = Object.entries(editingRoster.entryIdsByUid)
        .filter(([uid]) => !keptUids.has(uid))
        .map(([, entryId]) => entryId);
      for (const entryId of removedIds) {
        await deleteScheduleEntry(entryId);
      }
    }
    setIsSaving(false);

    if (res.ok) {
      const actionLabel = editingRoster ? 'diperbarui' : 'disimpan';
      onShowToast?.(
        `Jadwal shift ${activeFormShiftCode} tanggal ${selectedDate} berhasil ${actionLabel} (${res.created} staf).`
      );
      setEditingRoster(null);
      setFormPrimaryUids([]);
      setFormBackupUid('');
    } else {
      onShowToast?.(res.error ?? 'Gagal menyimpan jadwal.');
    }
  };
  // Roster pada tanggal yang dipilih
  const rostersOnSelectedDate = useMemo(() => {
    return getShiftRostersForDate({
      date: selectedDate,
      division: selectedDivision !== 'all' ? selectedDivision : undefined,
      schedules,
      employees,
    });
  }, [selectedDate, selectedDivision, schedules, employees]);

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  return (
    <div className="space-y-5">
      {/* HEADER SECTION: Judul & Filter Kalender */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <h1 className="text-base sm:text-lg font-extrabold text-[#0B2453] flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#C69214]" />
              <span>Kalender Jadwal Kerja &amp; Shift</span>
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {isHrd
              ? 'Kelola jadwal seluruh divisi: tentukan staf jaga (bisa 2 orang atau lebih) dan 1 staf backup cadangan.'
              : `Atur jadwal shift khusus Divisi ${supervisorDivision ?? currentUser?.division}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filter Divisi (hanya untuk HRD) */}
          {isHrd && !forcedDivision && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-500">Divisi:</span>
              <select
                aria-label="Filter Divisi Kalender"
                value={selectedDivision}
                onChange={(e) => {
                  setSelectedDivision(e.target.value);
                  setEditingRoster(null);
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 font-semibold text-[#0B2453] text-xs focus:border-[#0B2453] focus:outline-none"
              >
                <option value="all">Semua Divisi ({divisions.length})</option>
                {divisions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          {supervisorDivision && (
            <span className="px-3 py-1 rounded-xl bg-blue-50 border border-blue-200 text-[#0B2453] text-xs font-bold">
              Divisi: {supervisorDivision}
            </span>
          )}

          {/* Kontrol Navigasi Bulan */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Bulan sebelumnya"
              className="p-1.5 rounded-lg hover:bg-white text-slate-700 cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold font-mono text-[#0B2453]">
              {monthNames[currentMonth - 1]} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Bulan berikutnya"
              className="p-1.5 rounded-lg hover:bg-white text-slate-700 cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoToday}
            className="h-9 px-3 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold cursor-pointer transition-colors"
          >
            Hari Ini
          </button>
        </div>
      </div>

      {/* WARNING BANNER: Jadwal Belum Dibuat / Belum Ada Backup (Requirement 9) */}
      {gapWarnings.length > 0 && (
        <section
          aria-label="Peringatan Jadwal Kerja"
          className="rounded-3xl border border-amber-300 bg-amber-50/70 p-4 sm:p-5 text-amber-950 shadow-xs space-y-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-amber-900">
                  {gapWarnings.length} jadwal belum lengkap (14 hari ke depan)
                </h2>
                <p className="text-[11px] text-amber-800">
                  {gapWarnings.filter((w) => w.type === 'no_schedule').length} tanggal tanpa jadwal •{' '}
                  {gapWarnings.filter((w) => w.type === 'no_backup').length} shift tanpa staf backup
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={showGapWarnings}
              onClick={() => setShowGapWarnings((open) => !open)}
              className="shrink-0 h-8 px-3 rounded-lg bg-white/90 border border-amber-300 text-[11px] font-extrabold text-amber-900 hover:bg-white cursor-pointer"
            >
              {showGapWarnings ? 'Sembunyikan' : 'Lihat rincian'}
            </button>
          </div>
          {showGapWarnings && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
              {gapWarnings.map((warn, idx) => (
                <button
                  key={`${warn.date}-${warn.division}-${warn.shiftCode ?? ''}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedDate(warn.date);
                    const [y, m] = warn.date.split('-').map(Number);
                    setCurrentYear(y);
                    setCurrentMonth(m);
                  }}
                  className="text-left p-2.5 rounded-xl bg-white/90 border border-amber-200 hover:border-amber-400 hover:bg-white transition-all text-xs cursor-pointer shadow-2xs space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-1 font-bold">
                    <span className="text-[#0B2453]">{formatIndonesianDateFromIso(warn.date)}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${
                        warn.type === 'no_schedule'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {warn.type === 'no_schedule' ? 'Kosong' : 'Tanpa Backup'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-1">{warn.message}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Jam operasional: supervisor mengatur divisinya di sini; HRD memakainya dari tab Kelola Divisi. */}
      {!isHrd && (
        <DivisionOperatingHoursEditor
          division={effectiveDivisionForForm}
          onShowToast={onShowToast}
        />
      )}

      {/* KALENDER GRID */}
      <section className="rounded-3xl bg-white p-4 sm:p-6 shadow-xs border border-slate-200/80">
        {/* Nama-nama hari */}
        <div className="grid grid-cols-7 text-center font-bold text-xs text-slate-500 mb-2 border-b border-slate-100 pb-2">
          {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Kotak-kotak tanggal */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {monthDays.map((cell) => {
            const isToday = cell.isoDate === wibNow.isoDate;
            const isSelected = cell.isoDate === selectedDate;

            // Roster jadwal di hari ini
            const cellRosters = getShiftRostersForDate({
              date: cell.isoDate,
              division: selectedDivision !== 'all' ? selectedDivision : undefined,
              schedules,
              employees,
            });

            // Cek apakah tanggal ini ada warning gap
            const hasGap = gapWarnings.some((w) => w.date === cell.isoDate);

            return (
              <button
                key={cell.isoDate}
                type="button"
                onClick={() => {
                  setSelectedDate(cell.isoDate);
                  setEditingRoster(null);
                }}
                className={`min-h-[90px] sm:min-h-[115px] p-1.5 sm:p-2 rounded-2xl text-left flex flex-col justify-between transition-all cursor-pointer border ${
                  isSelected
                    ? 'border-[#0B2453] bg-blue-50/50 shadow-sm ring-2 ring-[#0B2453]/20'
                    : isToday
                      ? 'border-[#C69214] bg-[#FFFBEB]/40'
                      : cell.isCurrentMonth
                        ? 'border-slate-200/80 bg-white hover:bg-slate-50'
                        : 'border-slate-100 bg-slate-50/50 opacity-50'
                }`}
              >
                {/* Header sel: tanggal & badge gap */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-bold ${
                      isToday
                        ? 'bg-[#C69214] text-white'
                        : isSelected
                          ? 'bg-[#0B2453] text-white'
                          : 'text-slate-700'
                    }`}
                  >
                    {cell.dayNumber}
                  </span>
                  {hasGap && cell.isCurrentMonth && (
                    <span
                      title="Ada jadwal yang belum lengkap / belum ada backup"
                      className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
                    />
                  )}
                </div>

                {/* Konten jadwal ringkas di dalam sel kalender */}
                <div className="mt-1 flex-1 space-y-1 overflow-hidden w-full">
                  {cellRosters.length === 0 ? (
                    cell.isCurrentMonth && (
                      <span className="text-[10px] text-slate-300 block mt-1">—</span>
                    )
                  ) : (
                    cellRosters.slice(0, 2).map((rost, idx) => (
                      <div
                        key={`${rost.division}-${rost.shiftCode}-${idx}`}
                        className="rounded-md bg-slate-100 p-1 text-[10px] leading-tight space-y-0.5"
                      >
                        <div className="flex items-center justify-between gap-1 text-[#0B2453] font-extrabold">
                          <span className="truncate">
                            {shiftTemplateFor(rost.shiftCode, rost.division).name}
                          </span>
                          <span className="text-[9px] text-slate-500 shrink-0">
                            {rost.primaryStaff.length}
                          </span>
                        </div>
                        <div className="text-slate-600 truncate font-medium">
                          {rost.primaryStaff.map((s) => s.name.split(' ')[0]).join(', ')}
                        </div>
                        {rost.backupStaff && (
                          <div className="text-[9px] text-amber-800 font-bold flex items-center gap-0.5 truncate">
                            <Shield className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                            <span>Bkp: {rost.backupStaff.name.split(' ')[0]}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {cellRosters.length > 2 && (
                    <span className="text-[9px] font-bold text-slate-500 block text-right">
                      +{cellRosters.length - 2} shift lagi
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* DETAIL DAN FORM PENJADWALAN TANGGAL TERPILIH */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Kolom Kiri: Daftar Roster Jadwal yang Sudah Dibuat pada Tanggal Ini */}
        <section className="lg:col-span-6 rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Jadwal Tanggal Terpilih
              </div>
              <h2 className="text-base font-extrabold text-[#0B2453]">
                {formatIndonesianDateFromIso(selectedDate)}
              </h2>
            </div>
            <div className="text-xs font-bold text-[#0B2453] bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
              {rostersOnSelectedDate.length} Shift Terjadwal
            </div>
          </div>

          {rostersOnSelectedDate.length === 0 ? (
            <div className="py-8 text-center text-slate-500 space-y-2">
              <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs sm:text-sm font-medium">
                Belum ada jadwal yang dibuat pada tanggal ini.
              </p>
              <p className="text-[11px] text-slate-400">
                Gunakan formulir di samping untuk menentukan staf jaga dan staf backup.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rostersOnSelectedDate.map((roster, idx) => {
                const tpl = shiftTemplateFor(roster.shiftCode, roster.division);
                const isEditingThis =
                  editingRoster?.date === selectedDate &&
                  editingRoster.division === roster.division &&
                  editingRoster.shiftCode === roster.shiftCode;
                return (
                  <div
                    key={`${roster.division}-${roster.shiftCode}-${idx}`}
                    className={`rounded-2xl border p-4 space-y-3 transition-all ${
                      isEditingThis
                        ? 'border-[#C69214] bg-amber-50/30 ring-2 ring-[#C69214]/25'
                        : 'border-slate-200 bg-[#F9FBFE]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#C69214]" />
                        <span className="text-sm font-extrabold text-[#0B2453]">
                          {roster.shiftCode} ({tpl.startTime}–{tpl.endTime} WIB)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
                          Divisi: {roster.division}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEditRoster(roster)}
                          aria-label={`Edit jadwal ${roster.shiftCode} divisi ${roster.division}`}
                          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-extrabold border cursor-pointer transition-colors ${
                            isEditingThis
                              ? 'bg-[#0B2453] text-white border-[#0B2453]'
                              : 'bg-white text-[#0B2453] border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{isEditingThis ? 'Sedang Diedit' : 'Edit'}</span>
                        </button>
                      </div>
                    </div>
                    {/* Staf Jaga Utama (2 orang atau lebih) */}
                    <div>
                      <div className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#0B2453]" />
                        <span>Petugas Jaga ({roster.primaryStaff.length} Staf):</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {roster.primaryStaff.map((staff) => {
                          const entry = roster.entries.find((e) => e.uid === staff.uid);
                          return (
                            <div
                              key={staff.uid}
                              className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 text-xs"
                            >
                              <div className="space-y-0.5">
                                <span className="font-extrabold text-[#0B2453]">{staff.name}</span>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  {staff.nik}
                                </div>
                                {entry?.notes && (
                                  <div className="text-[10px] text-amber-700 italic">
                                    {entry.notes}
                                  </div>
                                )}
                              </div>
                              {entry && (
                                <button
                                  type="button"
                                  title="Hapus dari jadwal"
                                  onClick={async () => {
                                    if (window.confirm(`Hapus jadwal ${staff.name}?`)) {
                                      await deleteScheduleEntry(entry.id);
                                      onShowToast?.(`Jadwal ${staff.name} dihapus.`);
                                    }
                                  }}
                                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Staf Cadangan / Backup (1 orang) */}
                    <div>
                      <div className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-amber-600" />
                        <span>Petugas Cadangan (Backup 1 Orang):</span>
                      </div>
                      {roster.backupStaff ? (
                        <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                          <div>
                            <span className="font-extrabold text-amber-950">
                              {roster.backupStaff.name}
                            </span>
                            <span className="ml-2 text-[10px] font-mono text-amber-800">
                              ({roster.backupStaff.nik})
                            </span>
                            <div className="text-[10px] text-amber-800">
                              Siap otomatis aktif bila ada staf jaga yang cuti/izin.
                            </div>
                          </div>
                          {(() => {
                            const bEntry = roster.entries.find((e) => e.uid === roster.backupStaff?.uid);
                            return (
                              bEntry && (
                                <button
                                  type="button"
                                  title="Hapus backup"
                                  onClick={async () => {
                                    if (window.confirm(`Hapus status backup ${roster.backupStaff?.name}?`)) {
                                      await deleteScheduleEntry(bEntry.id);
                                      onShowToast?.(`Backup dihapus.`);
                                    }
                                  }}
                                  className="p-1 text-amber-600 hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                            <span>
                              Belum ada staf backup pada shift ini! Tentukan backup agar otomatis aktif bila ada yang cuti.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => startEditRoster(roster)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 text-[11px] font-extrabold shrink-0 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Tambah Backup</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Kolom Kanan: Form Input Staf Jaga + 1 Backup (Requirement 6, 7, 8) */}
        <section
          ref={rosterFormRef}
          className="lg:col-span-6 rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-[#0B2453]" />
              <h2 className="text-base font-extrabold text-[#0B2453] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#C69214]" />
                <span>
                  {editingRoster ? 'Edit Jadwal Staf & Backup' : 'Input Jadwal Staf & Backup'}
                </span>
              </h2>
            </div>
            {editingRoster && (
              <button
                type="button"
                onClick={cancelEditRoster}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[11px] font-bold cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Batal</span>
              </button>
            )}
          </div>

          {editingRoster && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900 font-semibold">
              Mengubah jadwal shift <strong>{editingRoster.shiftCode}</strong> divisi{' '}
              <strong>{editingRoster.division}</strong> ({formatIndonesianDateFromIso(editingRoster.date)}).
              Ubah petugas jaga atau pilih 1 staf backup, lalu simpan.
            </div>
          )}
          <form onSubmit={handleSaveRoster} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  Tanggal Penugasan
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setEditingRoster(null);
                  }}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  Pilih Shift
                </label>
                <select
                  value={activeFormShiftCode}
                  onChange={(e) => setFormShiftCode(e.target.value as ShiftCode)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold focus:border-[#0B2453] focus:outline-none"
                >
                  {allowedShifts.map((code) => {
                    const tpl = shiftTemplateFor(code, effectiveDivisionForForm);
                    return (
                      <option key={code} value={code}>
                        {tpl.name} ({tpl.startTime}–{tpl.endTime})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Pemilihan Staf Jaga Utama (Checklist: Bisa 2 orang atau lebih) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#0B2453]">
                  1. Pilih Staf Jaga Utama (Bisa 2 Orang atau Lebih) *
                </label>
                <span className="text-[11px] font-bold text-slate-500">
                  {formPrimaryUids.length} dipilih
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1 bg-slate-50/50">
                {eligibleStaff.length === 0 ? (
                  <p className="text-xs text-slate-500 p-2">
                    Belum ada staf aktif pada divisi {effectiveDivisionForForm}.
                  </p>
                ) : (
                  eligibleStaff.map((staff) => {
                    const isChecked = formPrimaryUids.includes(staff.uid);
                    return (
                      <label
                        key={staff.uid}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-blue-100/70 border border-blue-300 font-bold text-[#0B2453]'
                            : 'bg-white hover:bg-slate-100 border border-slate-200/70 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePrimaryStaff(staff.uid)}
                            className="rounded text-[#0B2453] focus:ring-[#0B2453] w-4 h-4 cursor-pointer"
                          />
                          <span>{staff.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {staff.position}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Pemilihan Staf Cadangan / Backup (1 Orang) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-600" />
                <span>2. Tambahkan Backup (1 Orang Cadangan)</span>
              </label>
              <select
                value={formBackupUid}
                onChange={(e) => setFormBackupUid(e.target.value)}
                className="w-full h-10 rounded-xl border border-amber-300 bg-amber-50/50 px-3 text-xs font-bold text-amber-950 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Pilih 1 Staf Cadangan (Backup) --</option>
                {eligibleStaff
                  .filter((s) => !formPrimaryUids.includes(s.uid))
                  .map((staff) => (
                    <option key={staff.uid} value={staff.uid}>
                      {staff.name} ({staff.position})
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Jika staf jaga tiba-tiba mengajukan cuti dan disetujui, staf backup ini akan langsung
                dialihkan menjadi petugas jaga utama.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSaving || formPrimaryUids.length === 0}
              className="w-full h-11 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
            >
              <UserCheck className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Menyimpan...'
                  : editingRoster
                    ? 'Simpan Perubahan Jadwal'
                    : 'Simpan Jadwal Staf & Backup'}
              </span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

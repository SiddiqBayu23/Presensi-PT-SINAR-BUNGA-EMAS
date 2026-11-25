import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  ListTodo,
  Palmtree,
  UserCheck,
  Users,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { Division, LeaveRequest, ShiftCode, TodoTask } from '../types/hris';

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

interface DashboardCalendarProps {
  /** Mode tampilan kalender sesuai role pemanggil */
  role: 'hrd' | 'supervisor' | 'employee';
  onSelectTodoTask?: (task: TodoTask) => void;
}

export function DashboardCalendar({ role, onSelectTodoTask }: DashboardCalendarProps) {
  const { currentUser, employees, leaves, schedules, todos, wibNow } = useHris();

  // Selected viewing month/year
  const [viewYear, setViewYear] = useState(wibNow.year);
  const [viewMonth, setViewMonth] = useState(wibNow.month); // 0-indexed (0 = Jan)

  // Selected date on calendar (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(wibNow.isoDate);

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleJumpToday = () => {
    setViewYear(wibNow.year);
    setViewMonth(wibNow.month);
    setSelectedDate(wibNow.isoDate);
  };

  // Team scope for supervisor
  const teamUids = useMemo(() => {
    if (role !== 'supervisor' || !currentUser) return null;
    return new Set(employees.filter((e) => e.supervisorUid === currentUser.uid).map((e) => e.uid));
  }, [role, currentUser, employees]);

  // Filtered leaves according to role
  const relevantLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (l.status === 'Ditolak') return false;
      if (role === 'hrd') return true;
      if (role === 'supervisor') {
        if (!teamUids) return false;
        return teamUids.has(l.uid) || l.uid === currentUser?.uid;
      }
      return l.uid === currentUser?.uid;
    });
  }, [leaves, role, teamUids, currentUser]);

  // Filtered todos according to role
  const relevantTodos = useMemo(() => {
    return todos.filter((t) => {
      if (role === 'hrd') return true;
      if (role === 'supervisor') {
        if (!teamUids) return t.assignedByUid === currentUser?.uid;
        return teamUids.has(t.assignedToUid) || t.assignedByUid === currentUser?.uid;
      }
      return t.assignedToUid === currentUser?.uid;
    });
  }, [todos, role, teamUids, currentUser]);

  // Calendar day cells computation
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun

  const calendarDays = useMemo(() => {
    const list: { dayNum: number; isoDate: string; isCurrentMonth: boolean }[] = [];

    // Prev month padding
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = viewMonth === 0 ? 12 : viewMonth;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      list.push({ dayNum: d, isoDate: iso, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      list.push({ dayNum: d, isoDate: iso, isCurrentMonth: true });
    }

    // Next month padding to fill complete grid rows (multiple of 7)
    const remaining = 7 - (list.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = viewMonth === 11 ? 1 : viewMonth + 2;
        const y = viewMonth === 11 ? viewYear + 1 : viewYear;
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        list.push({ dayNum: d, isoDate: iso, isCurrentMonth: false });
      }
    }

    return list;
  }, [viewYear, viewMonth, daysInMonth, firstDayOfWeek]);

  // Map of data per date for indicators
  const eventsByDate = useMemo(() => {
    const map = new Map<
      string,
      {
        leaves: LeaveRequest[];
        todos: TodoTask[];
      }
    >();

    relevantLeaves.forEach((lv) => {
      // Check every day between startDate and endDate
      const start = new Date(lv.startDate);
      const end = new Date(lv.endDate);
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
        const iso = dt.toISOString().slice(0, 10);
        const existing = map.get(iso) || { leaves: [], todos: [] };
        existing.leaves.push(lv);
        map.set(iso, existing);
      }
    });

    relevantTodos.forEach((td) => {
      const existing = map.get(td.dueDate) || { leaves: [], todos: [] };
      existing.todos.push(td);
      map.set(td.dueDate, existing);
    });

    return map;
  }, [relevantLeaves, relevantTodos]);

  // Selected date details
  const selectedDateEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) || { leaves: [], todos: [] };
  }, [eventsByDate, selectedDate]);

  // Formatted date label for selected date
  const selectedDateLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    if (!y || !m || !d) return selectedDate;
    const dt = new Date(y, m - 1, d);
    const dayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dt.getDay()];
    return `${dayName}, ${d} ${INDONESIAN_MONTHS[m - 1]} ${y}`;
  }, [selectedDate]);

  return (
    <div className="rounded-3xl bg-white border border-slate-200/80 shadow-[0_6px_24px_rgba(11,36,83,0.06)] overflow-hidden">
      {/* Calendar Header with Navigation */}
      <div className="bg-gradient-to-r from-[#0B2453] via-[#12316C] to-[#0B2453] p-4 sm:p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CalendarIcon className="w-5 h-5 text-[#F4CE6A]" />
          <div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
              Kalender Kerja &amp; Agenda
            </h2>
            <p className="text-[11px] text-slate-300">
              {role === 'hrd'
                ? 'Pantau perizinan karyawan & penugasan seluruh tim'
                : role === 'supervisor'
                  ? 'Pantau perizinan tim bawahan & jadwal tugas'
                  : 'Pantau jadwal shift, izin, dan tugas kerja Anda'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleJumpToday}
            className="h-8 px-3 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-xs font-bold transition-all cursor-pointer"
          >
            Hari Ini
          </button>
          <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1 border border-white/15">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Bulan sebelumnya"
              className="p-1.5 rounded-lg hover:bg-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold px-2 whitespace-nowrap tabular-nums">
              {INDONESIAN_MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Bulan berikutnya"
              className="p-1.5 rounded-lg hover:bg-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Calendar Day Header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
          {DAY_NAMES.map((d, idx) => (
            <div
              key={d}
              className={`text-[11px] font-extrabold py-1 ${
                idx === 0 || idx === 6 ? 'text-amber-600' : 'text-slate-500'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid Cells */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {calendarDays.map((cell) => {
            const isToday = cell.isoDate === wibNow.isoDate;
            const isSelected = cell.isoDate === selectedDate;
            const ev = eventsByDate.get(cell.isoDate);
            const hasLeaves = Boolean(ev && ev.leaves.length > 0);
            const hasTodos = Boolean(ev && ev.todos.length > 0);

            return (
              <button
                key={cell.isoDate}
                type="button"
                onClick={() => setSelectedDate(cell.isoDate)}
                className={`relative min-h-[58px] sm:min-h-[68px] p-1.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'border-[#0B2453] bg-[#EEF4FF] shadow-xs ring-2 ring-[#0B2453]/20'
                    : isToday
                      ? 'border-[#C69214] bg-[#FFFBF0]'
                      : cell.isCurrentMonth
                        ? 'border-slate-100 bg-[#FBFDFF] hover:bg-slate-50'
                        : 'border-slate-100/50 bg-slate-50/50 text-slate-300 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-extrabold tabular-nums ${
                      isToday
                        ? 'bg-[#C69214] text-white shadow-xs'
                        : isSelected
                          ? 'bg-[#0B2453] text-[#F4CE6A]'
                          : cell.isCurrentMonth
                            ? 'text-slate-800'
                            : 'text-slate-400'
                    }`}
                  >
                    {cell.dayNum}
                  </span>

                  {isToday && (
                    <span className="hidden sm:inline-block text-[9px] font-extrabold text-[#B6810C] uppercase tracking-wider">
                      Hari ini
                    </span>
                  )}
                </div>

                {/* Event Indicator Pills */}
                <div className="mt-1 flex flex-col gap-0.5">
                  {hasLeaves && (
                    <div className="inline-flex items-center gap-1 rounded-md bg-amber-100/90 text-amber-800 px-1 py-0.5 text-[9px] font-extrabold truncate">
                      <Palmtree className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">
                        {role === 'employee' ? 'Izin' : `${ev!.leaves.length} Izin`}
                      </span>
                    </div>
                  )}
                  {hasTodos && (
                    <div className="inline-flex items-center gap-1 rounded-md bg-indigo-100/90 text-indigo-800 px-1 py-0.5 text-[9px] font-extrabold truncate">
                      <ListTodo className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{ev!.todos.length} Tugas</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail Panel of Selected Date */}
        <div className="mt-5 rounded-2xl bg-[#F8FAFD] border border-slate-200/90 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 rounded-full bg-[#C69214]" />
              <h3 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
                Agenda Tanggal: <span className="text-[#B6810C]">{selectedDateLabel}</span>
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Palmtree className="w-3.5 h-3.5 text-amber-600" />
                {selectedDateEvents.leaves.length} Izin
              </span>
              <span>&bull;</span>
              <span className="inline-flex items-center gap-1">
                <ListTodo className="w-3.5 h-3.5 text-indigo-600" />
                {selectedDateEvents.todos.length} Tugas
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Bagian 1: Karyawan Izin / Cuti pada Hari Ini */}
            <div className="rounded-xl bg-white border border-slate-200/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0B2453]">
                  <Palmtree className="w-4 h-4 text-amber-600" />
                  <span>
                    {role === 'hrd'
                      ? 'Karyawan Izin / Cuti (Seluruh Divisi)'
                      : role === 'supervisor'
                        ? 'Anggota Tim Izin / Cuti'
                        : 'Status Izin Pribadi'}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  {selectedDateEvents.leaves.length} Terdaftar
                </span>
              </div>

              {selectedDateEvents.leaves.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">
                  Tidak ada karyawan yang izin atau cuti pada tanggal ini.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedDateEvents.leaves.map((lv) => (
                    <div
                      key={lv.id}
                      className="rounded-lg border border-slate-100 bg-[#F9FBFE] p-2.5 flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-extrabold text-[#0B2453]">
                          {lv.employeeName} ({lv.nik})
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lv.division} &bull; <span className="font-semibold text-amber-700">{lv.type}</span> ({lv.days} hari)
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 italic">
                          &quot;{lv.reason}&quot;
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${
                          lv.status === 'Disetujui'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {lv.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bagian 2: Daftar Todo List / Tugas pada Hari Ini */}
            <div className="rounded-xl bg-white border border-slate-200/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0B2453]">
                  <ListTodo className="w-4 h-4 text-indigo-600" />
                  <span>Daftar Tugas / Todo List</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {selectedDateEvents.todos.length} Tugas
                </span>
              </div>

              {selectedDateEvents.todos.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">
                  Tidak ada tenggat tugas pada tanggal ini.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedDateEvents.todos.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => onSelectTodoTask?.(t)}
                      className="rounded-lg border border-slate-100 bg-[#F9FBFE] p-2.5 hover:bg-indigo-50/40 transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-extrabold text-[#0B2453]">{t.title}</div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            t.status === 'Selesai'
                              ? 'bg-emerald-50 text-emerald-700'
                              : t.status === 'Menunggu Review'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 line-clamp-1">{t.description}</div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                        <span>Pekerja: <strong>{t.assignedToName}</strong></span>
                        <span className="uppercase font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          Laporan: {t.reportTypeRequired}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

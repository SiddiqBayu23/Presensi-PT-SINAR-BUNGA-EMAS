import { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import { ScheduleCalendarView } from '../../shared/ScheduleCalendarView';
import {
  formatIndonesianDateFromIso,
  formatShiftWindow,
  resolveDivisionShiftRule,
} from '../../utils/hrisLogic';

interface JadwalShiftPanelProps {
  onShowToast: (message: string) => void;
  onOpenDivisiTab: () => void;
}

const RANGE_OPTIONS = [
  { value: 'upcoming', label: '7 hari ke depan' },
  { value: 'all', label: 'Semua tanggal' },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]['value'];

/**
 * Tab "Jadwal & Shift": ringkasan jam kerja tiap divisi, kalender penugasan
 * (staf jaga + backup), dan daftar baris jadwal yang bisa dicari/difilter.
 */
export function JadwalShiftPanel({ onShowToast, onOpenDivisiTab }: JadwalShiftPanelProps) {
  const {
    employees,
    divisions,
    schedules,
    divisionShiftRules,
    shiftTemplateFor,
    deleteScheduleEntry,
    clearAllSchedules,
    wibNow,
  } = useHris();

  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string>('ALL');
  const [range, setRange] = useState<RangeValue>('all');

  const employeeByUid = (uid: string) => employees.find((emp) => emp.uid === uid) ?? null;

  /** Batas akhir 7 hari ke depan (YYYY-MM-DD) dari hari ini WIB. */
  const weekEndIso = useMemo(() => {
    const [y, m, d] = wibNow.isoDate.split('-').map(Number);
    const end = new Date(Date.UTC(y, m - 1, d) + 6 * 86_400_000);
    return end.toISOString().slice(0, 10);
  }, [wibNow.isoDate]);

  const filteredSchedules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules
      .filter((sch) => {
        const emp = employees.find((item) => item.uid === sch.uid);
        if (divisionFilter !== 'ALL' && emp?.division !== divisionFilter) return false;
        if (range === 'upcoming' && (sch.date < wibNow.isoDate || sch.date > weekEndIso)) {
          return false;
        }
        if (!q) return true;
        return (
          (emp?.name.toLowerCase().includes(q) ?? false) ||
          sch.nik.toLowerCase().includes(q) ||
          sch.location.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.uid.localeCompare(b.uid));
  }, [schedules, employees, divisionFilter, range, search, wibNow.isoDate, weekEndIso]);

  const todayCount = schedules.filter((sch) => sch.date === wibNow.isoDate).length;
  const weekCount = schedules.filter(
    (sch) => sch.date >= wibNow.isoDate && sch.date <= weekEndIso
  ).length;

  return (
    <div className="space-y-5">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Total Baris Jadwal</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {schedules.length}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Bertugas Hari Ini</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-700 tabular-nums">
            {todayCount}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">7 Hari ke Depan</div>
          <div className="mt-1 text-2xl font-extrabold text-[#C69214] tabular-nums">
            {weekCount}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Divisi Berjam Kerja</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {divisions.length}
          </div>
        </div>
      </div>

      {/* Jam kerja per divisi */}
      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#0B2453] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#C69214]" />
              <span>Jam Kerja per Divisi</span>
            </h2>
            <p className="text-xs text-slate-500">
              Setiap divisi punya shift sendiri: Security bisa 24 jam, Cleaning Service sampai sore,
              divisi kantor memakai shift reguler.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDivisiTab}
            className="h-9 px-3.5 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-extrabold shrink-0 self-start cursor-pointer"
          >
            Atur Jam Kerja Divisi
          </button>
        </div>

        {divisions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
            Belum ada divisi. Tambahkan divisi di tab Kelola Divisi.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {divisions.map((div) => {
              const rule = resolveDivisionShiftRule(div, divisionShiftRules);
              const defaultTpl = shiftTemplateFor(rule.defaultShiftCode, div);
              return (
                <div
                  key={div}
                  className="rounded-2xl border border-slate-200/80 bg-[#F8FAFD] p-3.5 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-extrabold text-[#0B2453] truncate">{div}</span>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Bawaan {defaultTpl.name}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {rule.allowedShiftCodes.map((code) => {
                      const tpl = shiftTemplateFor(code, div);
                      const isDefault = code === rule.defaultShiftCode;
                      return (
                        <div
                          key={code}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[11px] ${
                            isDefault
                              ? 'bg-white border-[#C69214]/60 font-bold text-[#0B2453]'
                              : 'bg-white/70 border-slate-200 text-slate-600'
                          }`}
                        >
                          <span className="truncate">{tpl.name}</span>
                          <span className="font-mono tabular-nums shrink-0">
                            {tpl.startTime}–{tpl.endTime}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 inline-flex items-center gap-1 pt-1 border-t border-slate-100 w-full">
                    <Clock className="w-3 h-3" />
                    {rule.allowedShiftCodes.length} shift aktif
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Kalender & input penugasan */}
      <ScheduleCalendarView onShowToast={onShowToast} />

      {/* Daftar baris jadwal */}
      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-[#0B2453] flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#C69214]" />
              <span>Daftar Jadwal</span>
            </h2>
            <p className="text-xs text-slate-500">
              {filteredSchedules.length} baris ditampilkan dari total {schedules.length} baris.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Cari jadwal karyawan"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, NIK, lokasi…"
                className="h-9 w-[200px] rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs"
              />
            </div>
            <select
              aria-label="Filter divisi jadwal"
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold"
            >
              <option value="ALL">Semua divisi</option>
              {divisions.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
            <select
              aria-label="Rentang tanggal jadwal"
              value={range}
              onChange={(e) => setRange(e.target.value as RangeValue)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
                onShowToast(
                  res.ok
                    ? `${res.deleted} baris jadwal dihapus.`
                    : res.error ?? 'Gagal menghapus jadwal.'
                );
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-extrabold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>Hapus Semua</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3">Tanggal</th>
                <th className="py-2.5 pr-3">Karyawan</th>
                <th className="py-2.5 pr-3">Divisi</th>
                <th className="py-2.5 pr-3">Shift</th>
                <th className="py-2.5 pr-3">Lokasi</th>
                <th className="py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSchedules.slice(0, 200).map((sch) => {
                const emp = employeeByUid(sch.uid);
                const division = emp?.division ?? null;
                return (
                  <tr key={sch.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <div className="font-bold text-[#0B2453]">
                        {formatIndonesianDateFromIso(sch.date)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">{sch.date}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 truncate">
                          {emp?.name ?? '(karyawan dihapus)'}
                        </span>
                        {sch.isBackup && (
                          <span className="shrink-0 text-[9px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                            <Shield className="w-2.5 h-2.5" />
                            Backup
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{emp?.nik ?? sch.nik}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs font-semibold text-slate-700 whitespace-nowrap">
                      {division ?? '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                      <div className="font-bold text-[#0B2453]">
                        {shiftTemplateFor(sch.shiftCode, division).name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {formatShiftWindow(
                          sch.shiftCode,
                          division ? resolveDivisionShiftRule(division, divisionShiftRules) : null
                        )}
                      </div>
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
                            onShowToast('Jadwal dihapus.')
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
              {filteredSchedules.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    <CheckCircle2 className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                    Tidak ada jadwal pada filter ini. Buat penugasan lewat kalender di atas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

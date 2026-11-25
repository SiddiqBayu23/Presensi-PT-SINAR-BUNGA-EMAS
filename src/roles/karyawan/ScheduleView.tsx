import React from 'react';
import {
  ArrowLeftRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import type { SubmissionSubTab } from '../../types/hris';
import {
  effectiveShiftForDate,
  formatIndonesianDateFromIso,
  resolveDivisionShiftRule,
} from '../../utils/hrisLogic';

interface ScheduleViewProps {
  onOpenShiftSwap: (sub: SubmissionSubTab) => void;
}

export function ScheduleView({ onOpenShiftSwap }: ScheduleViewProps) {
  const {
    currentUser,
    schedules,
    togglePatrolComplete,
    divisionShiftRules,
    shiftTemplateFor,
    wibNow,
  } = useHris();

  if (!currentUser) return null;

  const mySchedules = schedules
    .filter((s) => s.uid === currentUser.uid)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Shift aktif hari ini mengikuti jadwal (hasil penugasan/tukar shift), bukan hanya profil.
  const todayShiftCode = effectiveShiftForDate(
    currentUser.uid,
    wibNow.isoDate,
    schedules,
    currentUser.shiftCode
  );
  const currentShift = shiftTemplateFor(todayShiftCode, currentUser.division);
  // Hanya shift yang memang berlaku untuk divisi karyawan ini.
  const divisionShiftCodes = resolveDivisionShiftRule(
    currentUser.division,
    divisionShiftRules
  ).allowedShiftCodes;

  return (
    <div className="space-y-5">
      {/* Shift Banner & Action */}
      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h1 className="text-lg font-extrabold text-[#0B2453]">Schedule &amp; Jadwal Shift</h1>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Shift Aktif Hari Ini:{' '}
              <strong className="text-[#0B2453]">{currentShift.label}</strong> &bull; Toleransi{' '}
              {currentShift.toleranceMinutes} menit
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Jam kerja divisi {currentUser.division}:{' '}
              {divisionShiftCodes
                .map((code) => {
                  const tpl = shiftTemplateFor(code, currentUser.division);
                  return `${tpl.startTime}–${tpl.endTime}`;
                })
                .join(' • ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenShiftSwap('shift')}
            className="h-11 px-4 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Ajukan Tukar Shift</span>
          </button>
        </div>

        {/* All Shift Templates */}
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {divisionShiftCodes.map((code) => {
            const tpl = shiftTemplateFor(code, currentUser.division);
            const isMine = code === todayShiftCode;
            return (
              <div
                key={tpl.code}
                className={`rounded-2xl p-3.5 border transition-colors ${
                  isMine
                    ? 'border-[#C69214] bg-[#FFFBEB]'
                    : 'border-slate-200/80 bg-[#F8FAFD]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-extrabold text-[#0B2453]">{tpl.name}</span>
                  {isMine && (
                    <span className="text-[10px] font-extrabold text-[#9A6F0B] uppercase">
                      Aktif
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-sm font-bold font-mono tabular-nums text-slate-800">
                  {tpl.startTime} – {tpl.endTime} WIB
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Jadwal Kerja Mingguan */}
        <section className="lg:col-span-8 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-[#0B2453]">Jadwal Penugasan Anda</h2>
          </div>

          {mySchedules.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada jadwal penugasan khusus.</p>
          ) : (
            <div className="space-y-3">
              {mySchedules.map((sch) => {
                const tpl = shiftTemplateFor(sch.shiftCode, currentUser.division);
                return (
                  <div
                    key={sch.id}
                    className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-bold text-[#0B2453]">
                        <CalendarDays className="w-4 h-4 text-[#C69214]" />
                        <span>{formatIndonesianDateFromIso(sch.date)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-slate-800">
                          <Clock className="w-3.5 h-3.5 text-[#0B2453]" />
                          {tpl.name} ({tpl.startTime}-{tpl.endTime})
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {sch.location}
                        </span>
                      </div>
                      {sch.notes && <p className="text-xs text-slate-500">{sch.notes}</p>}
                    </div>

                    <button
                      type="button"
                      onClick={() => void togglePatrolComplete(sch.id)}
                      className={`shrink-0 h-10 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        sch.patrolCompleted
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-white text-[#0B2453] border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {sch.patrolCompleted ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Tugas Selesai</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-4 h-4 text-slate-400" />
                          <span>Tandai Selesai</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Standar Kehadiran & Verifikasi GPS (replaces old QR checkpoint card) */}
        <section className="lg:col-span-4 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-[#0B2453]">Ketentuan Kehadiran</h2>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-3.5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0B2453]/10 text-[#0B2453] flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#0B2453]">Verifikasi GPS Otomatis</div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Koordinat lokasi dikunci otomatis saat Absen Masuk &amp; Pulang tanpa perlu scan barcode.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-3.5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-[#B6810C] flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#0B2453]">Kamera Live Timestamp WIB</div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Setiap kehadiran dilengkapi cap waktu WIB dan koordinat GPS secara langsung.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-3.5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#0B2453]">Toleransi Keterlambatan</div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Toleransi 10 menit dari jam mulai shift. Pengajuan tukar shift dapat dilakukan sebelum hari H.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

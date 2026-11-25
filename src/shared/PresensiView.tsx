import React, { useMemo } from 'react';
import {
  AlertCircle,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import {
  effectiveShiftForDate,
  formatDuration,
  minutesToTimeLabel,
  resolveDivisionShiftRule,
  resolveShiftTemplate,
  resolveShiftTolerance,
  shiftTemplateForDivision,
  shiftWindowMinutes,
} from '../utils/hrisLogic';

interface PresensiViewProps {
  onOpenAttendance: (mode: 'in' | 'out') => void;
}

export function PresensiView({ onOpenAttendance }: PresensiViewProps) {
  const {
    currentUser,
    attendance,
    localPhotos,
    wibNow,
    currentLeaveToday,
    schedules,
    divisionShiftRules,
  } = useHris();

  // Shift info of current user
  // Shift hari ini = jadwal efektif (penugasan/tukar shift disetujui), fallback ke profil.
  const shiftInfo = useMemo(() => {
    if (!currentUser) return resolveShiftTemplate('REGULER');
    const code = effectiveShiftForDate(
      currentUser.uid,
      wibNow.isoDate,
      schedules,
      currentUser.shiftCode ?? 'REGULER'
    );
    // Jam masuk/pulang mengikuti pengaturan jam divisi karyawan bila HRD mengubahnya.
    return shiftTemplateForDivision(code, currentUser.division, divisionShiftRules);
  }, [currentUser, schedules, wibNow.isoDate, divisionShiftRules]);

  // Rentang waktu absen (toleransi) hari ini: kapan absen masuk/pulang dibuka.
  const absenWindow = useMemo(() => {
    if (!currentUser) return null;
    const code = effectiveShiftForDate(
      currentUser.uid,
      wibNow.isoDate,
      schedules,
      currentUser.shiftCode ?? 'REGULER'
    );
    const rule = resolveDivisionShiftRule(currentUser.division, divisionShiftRules);
    const tolerance = resolveShiftTolerance(code, rule);
    const { start, end } = shiftWindowMinutes(code, rule);
    return {
      inOpensAt: minutesToTimeLabel(start - tolerance.earlyInMinutes),
      lateInMinutes: tolerance.lateInMinutes,
      outOpensAt: minutesToTimeLabel(end - tolerance.earlyOutMinutes),
    };
  }, [currentUser, schedules, wibNow.isoDate, divisionShiftRules]);

  // Today's attendance record
  const todayRecord = useMemo(() => {
    if (!currentUser) return null;
    return attendance.find((a) => a.uid === currentUser.uid && a.date === wibNow.isoDate);
  }, [attendance, currentUser, wibNow.isoDate]);

  // Personal attendance history (sorted newest first)
  const myHistory = useMemo(() => {
    if (!currentUser) return [];
    return attendance
      .filter((a) => a.uid === currentUser.uid)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, currentUser]);

  const todayPhotos = todayRecord ? localPhotos[todayRecord.id] : undefined;
  const inPhoto = todayRecord?.clockInPhotoUrl || todayPhotos?.in;
  const outPhoto = todayRecord?.clockOutPhotoUrl || todayPhotos?.out;

  const hasClockedIn = Boolean(todayRecord?.clockInTime);
  const hasClockedOut = Boolean(todayRecord?.clockOutTime);

  return (
    <div className="space-y-6">
      {/* Top Banner / Role Identity */}
      <div className="rounded-3xl bg-gradient-to-r from-[#0B2453] via-[#143B80] to-[#0B2453] text-white p-5 sm:p-6 shadow-md border-b-[3px] border-[#C69214]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <Camera className="w-6 h-6 text-[#F4CE6A]" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#F4CE6A]">
                Portal Presensi Digital
              </div>
              <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight">
                Presensi Kehadiran &amp; Absensi GPS
              </h1>
              <p className="text-xs text-slate-200 mt-0.5">
                Pengguna: <strong>{currentUser?.name}</strong> ({currentUser?.nik}) &bull;{' '}
                <span className="capitalize">{currentUser?.role === 'hrd' ? 'HRD Admin' : currentUser?.role}</span> &bull; {currentUser?.division}
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right bg-white/10 rounded-2xl p-3 border border-white/15">
            <div className="text-xs font-bold text-slate-300">Waktu Indonesia Barat (WIB)</div>
            <div className="text-2xl sm:text-3xl font-mono font-extrabold text-[#F4CE6A] tabular-nums">
              {wibNow.timeFull}
            </div>
            <div className="text-[11px] text-slate-300 font-medium">{wibNow.fullIndonesianDate}</div>
          </div>
        </div>
      </div>

      {/* Main Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Card: Clock In / Out Action */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-3xl bg-white border border-slate-200/80 shadow-[0_6px_24px_rgba(11,36,83,0.06)] p-5 sm:p-6 text-center space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EEF3FA] text-[#0B2453] text-xs font-extrabold">
              <Clock className="w-3.5 h-3.5 text-[#C69214]" />
              <span>Shift: {shiftInfo.label} ({shiftInfo.startTime} - {shiftInfo.endTime})</span>
            </div>

            {absenWindow && (
              <div className="text-[11px] text-slate-500 leading-relaxed">
                Toleransi absensi: <strong>masuk</strong> dibuka mulai {absenWindow.inOpensAt} (telat ≤ {absenWindow.lateInMinutes} menit masih tepat waktu) &bull;{' '}
                <strong>pulang</strong> dibuka mulai {absenWindow.outOpensAt}, setelah jam pulang bebas (tidak terbatas).
              </div>
            )}

            <div className="text-xs text-slate-500 max-w-sm mx-auto">
              Presensi wajib menyertakan <strong>foto selfie live</strong> dan <strong>titik koordinat GPS</strong> yang terverifikasi dalam radius lokasi kerja.
            </div>

            {currentLeaveToday && (
              <div className="rounded-2xl bg-amber-50 border border-amber-300 p-3.5 text-left text-xs text-amber-900 space-y-1">
                <div className="font-extrabold inline-flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span>Anda sedang {currentLeaveToday.type} (disetujui)</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Periode {currentLeaveToday.startDate} s/d {currentLeaveToday.endDate}. Absensi
                  masuk dinonaktifkan otomatis selama izin/cuti berlangsung.
                </p>
              </div>
            )}

            {/* Tombol Absen Masuk & Pulang */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={hasClockedIn || Boolean(currentLeaveToday)}
                onClick={() => onOpenAttendance('in')}
                className={`h-14 rounded-2xl text-xs sm:text-sm font-extrabold shadow-md transition-all inline-flex items-center justify-center gap-2 px-3 cursor-pointer ${
                  hasClockedIn || currentLeaveToday
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:brightness-110 active:scale-[0.98] text-white shadow-emerald-700/20'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-emerald-300 shrink-0" />
                <span>
                  {currentLeaveToday ? 'Sedang Izin/Cuti' : hasClockedIn ? 'Sudah Masuk' : 'Absen Masuk'}
                </span>
              </button>

              <button
                type="button"
                disabled={!hasClockedIn || hasClockedOut || Boolean(currentLeaveToday)}
                onClick={() => onOpenAttendance('out')}
                className={`h-14 rounded-2xl text-xs sm:text-sm font-extrabold shadow-md transition-all inline-flex items-center justify-center gap-2 px-3 cursor-pointer ${
                  !hasClockedIn || hasClockedOut || currentLeaveToday
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:brightness-110 active:scale-[0.98] text-white shadow-amber-700/20'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-amber-300 shrink-0" />
                <span>
                  {currentLeaveToday ? 'Tidak Perlu Absen' : hasClockedOut ? 'Sudah Pulang' : 'Absen Pulang'}
                </span>
              </button>
            </div>

            {/* Status Geofence / Kantor */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-[#0B2453]">
                <MapPin className="w-4 h-4 text-[#C69214]" />
                <span>Titik Absensi Pusat:</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Kantor Pusat PT Sinar Bunga Mas (Radius toleransi GPS: 500 meter).
              </p>
            </div>
          </div>

          {/* Today's Verification Status Card */}
          <div className="rounded-3xl bg-white border border-slate-200/80 shadow-[0_6px_24px_rgba(11,36,83,0.06)] p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-[#0B2453] flex items-center justify-between">
              <span>Status Kehadiran Hari Ini</span>
              <span className="text-xs font-mono font-bold text-slate-500">{wibNow.isoDate}</span>
            </h3>

            {todayRecord ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-[#F8FAFD] border border-slate-200">
                    <div className="text-slate-500 text-[11px]">Jam Masuk</div>
                    <div className="text-base font-extrabold text-[#0B2453] font-mono tabular-nums">
                      {todayRecord.clockInTime || '--:--'}
                    </div>
                    <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                      {todayRecord.lateMinutes > 0
                        ? `Terlambat ${todayRecord.lateMinutes} menit`
                        : 'Tepat Waktu'}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8FAFD] border border-slate-200">
                    <div className="text-slate-500 text-[11px]">Jam Pulang</div>
                    <div className="text-base font-extrabold text-[#0B2453] font-mono tabular-nums">
                      {todayRecord.clockOutTime || '--:--'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                      {todayRecord.workMinutes > 0 ? formatDuration(todayRecord.workMinutes) : 'Belum absen pulang'}
                    </div>
                  </div>
                </div>

                {/* Validasi Admin Badge */}
                <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-amber-900">
                    <ShieldCheck className="w-4 h-4 text-[#C69214]" />
                    <span>Validasi HRD / Admin:</span>
                  </div>
                  <span
                    className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                      todayRecord.adminValidationStatus === 'Valid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : todayRecord.adminValidationStatus === 'Ditolak'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {todayRecord.adminValidationStatus || 'Menunggu'}
                  </span>
                </div>

                {/* Foto Selfie Absen Hari Ini */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 mb-1">Foto Masuk</div>
                    {inPhoto ? (
                      <img
                        src={inPhoto}
                        alt="Selfie Masuk"
                        className="w-full h-24 object-cover rounded-xl border border-slate-200 bg-slate-100"
                      />
                    ) : (
                      <div className="w-full h-24 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-[10px]">
                        Foto terverifikasi
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] font-bold text-slate-500 mb-1">Foto Pulang</div>
                    {outPhoto ? (
                      <img
                        src={outPhoto}
                        alt="Selfie Pulang"
                        className="w-full h-24 object-cover rounded-xl border border-slate-200 bg-slate-100"
                      />
                    ) : (
                      <div className="w-full h-24 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-[10px]">
                        {hasClockedOut ? 'Foto terverifikasi' : 'Belum absen'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                Anda belum melakukan absensi masuk hari ini.
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Personal Attendance History Table */}
        <div className="lg:col-span-7">
          <div className="rounded-3xl bg-white border border-slate-200/80 shadow-[0_6px_24px_rgba(11,36,83,0.06)] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[#0B2453]">
                  Riwayat Kehadiran Pribadi
                </h2>
                <p className="text-xs text-slate-500">
                  Total {myHistory.length} catatan kehadiran terdaftar
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 pr-3 font-bold">Tanggal</th>
                    <th className="py-2.5 pr-3 font-bold">Masuk / Pulang</th>
                    <th className="py-2.5 pr-3 font-bold">Lokasi GPS</th>
                    <th className="py-2.5 pr-3 font-bold">Durasi</th>
                    <th className="py-2.5 font-bold text-right">Validasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Belum ada riwayat kehadiran tercatat.
                      </td>
                    </tr>
                  ) : (
                    myHistory.map((rec) => {
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/70">
                          <td className="py-3 pr-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {rec.date}
                          </td>
                          <td className="py-3 pr-3 font-mono whitespace-nowrap">
                            <span className="font-bold text-[#0B2453]">{rec.clockInTime}</span>
                            <span className="text-slate-400"> - </span>
                            <span className="font-semibold text-slate-600">
                              {rec.clockOutTime || '--:--'}
                            </span>
                          </td>
                          <td className="py-3 pr-3 max-w-[160px] truncate text-slate-600">
                            {rec.clockInAddress || 'Area Kantor Pusat'}
                          </td>
                          <td className="py-3 pr-3 font-mono whitespace-nowrap text-slate-600">
                            {rec.workMinutes > 0 ? formatDuration(rec.workMinutes) : '-'}
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                rec.adminValidationStatus === 'Valid'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : rec.adminValidationStatus === 'Ditolak'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {rec.adminValidationStatus || 'Menunggu'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

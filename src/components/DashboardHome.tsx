import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  DoorOpen,
  Download,
  FileBadge2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  Shield,
  ShieldCheck,
  Timer,
  User,
  X,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type {
  AttendanceRecord,
  DocumentSubTab,
  MainTab,
  SubmissionSubTab,
} from '../types/hris';
import { buildAttendanceCsvWithBom, downloadTextFile } from '../utils/exportUtils';
import {
  SHIFT_TEMPLATES,
  formatDuration,
  formatIndonesianDateFromIso,
} from '../utils/hrisLogic';

interface DashboardHomeProps {
  onOpenAttendance: (mode: 'in' | 'out') => void;
  onNavigateTab: (tab: MainTab) => void;
  onNavigateSubmission: (sub: SubmissionSubTab) => void;
  onNavigateDocument: (sub: DocumentSubTab) => void;
  onOpenExportAll?: () => void;
}

export function DashboardHome({
  onOpenAttendance,
  onNavigateTab,
  onNavigateSubmission,
  onNavigateDocument,
  onOpenExportAll,
}: DashboardHomeProps) {
  const { currentUser, attendance, leaves, overtimes, localPhotos, wibNow } = useHris();
  const [refreshing, setRefreshing] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [previewRecord, setPreviewRecord] = useState<AttendanceRecord | null>(null);

  const myAttendance = useMemo(
    () => (currentUser ? attendance.filter((a) => a.uid === currentUser.uid) : []),
    [attendance, currentUser]
  );

  const todayRecord = useMemo(
    () => myAttendance.find((a) => a.date === wibNow.isoDate) ?? null,
    [myAttendance, wibNow.isoDate]
  );

  if (!currentUser) return null;

  const shiftInfo = SHIFT_TEMPLATES[currentUser.shiftCode] ?? SHIFT_TEMPLATES.REGULER;
  const myPendingRequests =
    leaves.filter((l) => l.uid === currentUser.uid && l.status === 'Menunggu').length +
    overtimes.filter((o) => o.uid === currentUser.uid && o.status === 'Menunggu').length;

  const handleRefresh = () => {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 450);
  };

  const handleExportMyAttendance = () => {
    const file = `absensi-${currentUser.nik.toLowerCase()}-${wibNow.isoDate}.csv`;
    downloadTextFile(file, buildAttendanceCsvWithBom(myAttendance), 'text/csv;charset=utf-8;');
    setExportNotice(`CSV riwayat absensi (${myAttendance.length} baris) diunduh: ${file}`);
    window.setTimeout(() => setExportNotice(null), 3200);
  };

  const quickMenuItems: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    iconBg: string;
    onClick: () => void;
  }> = [
    {
      id: 'schedule',
      label: 'Schedule',
      icon: <Shield className="w-6 h-6 text-[#2563EB]" />,
      iconBg: 'bg-sky-50',
      onClick: () => onNavigateTab('schedule'),
    },
    {
      id: 'izin',
      label: 'Izin/Cuti',
      icon: <FileText className="w-6 h-6 text-slate-500" />,
      iconBg: 'bg-slate-100',
      onClick: () => onNavigateSubmission('izin'),
    },
    {
      id: 'lembur',
      label: 'Lembur',
      icon: <Timer className="w-6 h-6 text-[#6D28D9]" />,
      iconBg: 'bg-indigo-50',
      onClick: () => onNavigateSubmission('lembur'),
    },
    {
      id: 'shift',
      label: 'Shift',
      icon: <CalendarDays className="w-6 h-6 text-[#0284C7]" />,
      iconBg: 'bg-blue-50',
      onClick: () => onNavigateSubmission('shift'),
    },
    {
      id: 'slip',
      label: 'Slip Gaji',
      icon: <Banknote className="w-6 h-6 text-emerald-600" />,
      iconBg: 'bg-emerald-50',
      onClick: () => onNavigateDocument('slip'),
    },
    {
      id: 'pkwt',
      label: 'PKO/PKWT',
      icon: <FileBadge2 className="w-6 h-6 text-rose-500" />,
      iconBg: 'bg-rose-50',
      onClick: () => onNavigateDocument('pkwt'),
    },
    {
      id: 'exit',
      label: 'Exit Clear',
      icon: <DoorOpen className="w-6 h-6 text-amber-700" />,
      iconBg: 'bg-amber-50',
      onClick: () => onNavigateSubmission('exit'),
    },
    {
      id: 'profil',
      label: 'Profil Saya',
      icon: <User className="w-6 h-6 text-[#0B2453]" />,
      iconBg: 'bg-sky-50',
      onClick: () => onNavigateDocument('profil'),
    },
  ];

  const previewPhotos = previewRecord ? localPhotos[previewRecord.id] : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
      {/* Left Column on Desktop (Full Width on Mobile): Live Clock + Riwayat Absensi */}
      <div className="lg:col-span-7 space-y-4 lg:space-y-5">
        {/* Live Clock & Clock-In/Out Card */}
        <section
          aria-label="Absensi Harian"
          className="rounded-3xl bg-white p-4 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70 text-center"
        >
          <div
            data-testid="live-wib-clock"
            className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#0B2453] font-mono tabular-nums"
          >
            {wibNow.timeFull}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-600">{wibNow.fullIndonesianDate}</p>

          <div className="mt-3 inline-flex items-center justify-center rounded-full bg-[#EEF3FA] px-4 py-1.5 text-[11px] sm:text-xs font-extrabold tracking-wide text-[#0B2453]">
            SHIFT: {shiftInfo.label}
          </div>

          {/* Primary Absen Masuk & Absen Pulang Buttons */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onOpenAttendance('in')}
              className="h-13 sm:h-14 rounded-2xl bg-gradient-to-b from-[#163878] to-[#0B2250] text-white text-sm sm:text-base font-extrabold shadow-md hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2.5 px-3 cursor-pointer"
            >
              <span
                className="w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(255,255,255,0.2)] shrink-0"
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">Absen Masuk</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAttendance('out')}
              className="h-13 sm:h-14 rounded-2xl bg-gradient-to-b from-[#D4A424] to-[#A6780C] text-white text-sm sm:text-base font-extrabold shadow-md hover:brightness-105 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2.5 px-3 cursor-pointer"
            >
              <span
                className="w-3.5 h-3.5 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(255,255,255,0.25)] shrink-0"
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">Absen Pulang</span>
            </button>
          </div>

          {/* Jam Masuk & Jam Pulang Summary */}
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 divide-x divide-slate-100">
            <div className="px-2">
              <div className="text-xs font-medium text-slate-500">Jam Masuk</div>
              <div
                data-testid="today-clock-in"
                className="mt-1 text-xl sm:text-2xl font-extrabold text-[#0B2453] font-mono tabular-nums"
              >
                {todayRecord?.clockInTime ? todayRecord.clockInTime.slice(0, 5) : '--:--'}
              </div>
              {todayRecord?.clockInTime && (
                <div
                  className={`mt-0.5 text-[11px] font-bold ${
                    todayRecord.lateMinutes > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {todayRecord.lateMinutes > 0
                    ? `Terlambat ${todayRecord.lateMinutes}m`
                    : 'Tepat Waktu'}
                </div>
              )}
            </div>

            <div className="px-2">
              <div className="text-xs font-medium text-slate-500">Jam Pulang</div>
              <div
                data-testid="today-clock-out"
                className="mt-1 text-xl sm:text-2xl font-extrabold text-[#9A6F0B] font-mono tabular-nums"
              >
                {todayRecord?.clockOutTime ? todayRecord.clockOutTime.slice(0, 5) : '--:--'}
              </div>
              {todayRecord?.clockOutTime && (
                <div className="mt-0.5 text-[11px] font-bold text-slate-600">
                  Durasi {formatDuration(todayRecord.workMinutes)}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Menu Cepat on Mobile */}
        <section
          aria-labelledby="menu-cepat-mobile-heading"
          className="lg:hidden rounded-3xl bg-white p-4 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70"
        >
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <h2 id="menu-cepat-mobile-heading" className="text-base font-extrabold text-[#0B2453]">
              Menu Cepat
            </h2>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {quickMenuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-[#F8FAFD] hover:bg-[#EEF4FC] hover:border-[#0B2453]/25 px-1.5 py-2.5 text-center transition-all active:scale-[0.97] min-h-[74px] cursor-pointer"
              >
                <div
                  className={`w-9 h-9 rounded-xl ${item.iconBg} flex items-center justify-center mb-1`}
                >
                  {item.icon}
                </div>
                <span className="text-[11px] font-bold text-[#0B2453] leading-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Riwayat Absensi Anda Card */}
        <section
          aria-labelledby="riwayat-absensi-heading"
          className="rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70"
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 id="riwayat-absensi-heading" className="text-base font-extrabold text-[#0B2453]">
                Riwayat Absensi Anda
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportMyAttendance}
                aria-label="Export CSV Riwayat Absensi"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#EEF3FA] hover:bg-[#DDE7F6] text-[#0B2453] px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#FDF5DC] hover:bg-[#FAEBC0] text-[#8E6307] px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Muat Ulang</span>
              </button>
            </div>
          </div>

          {exportNotice && (
            <div
              role="status"
              className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 flex items-center gap-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
              <span>{exportNotice}</span>
            </div>
          )}

          {myAttendance.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">Belum ada absensi.</p>
          ) : (
            <div className="space-y-3">
              {myAttendance.slice(0, 8).map((rec) => {
                const cached = localPhotos[rec.id];
                return (
                  <div
                    key={rec.id}
                    className="rounded-2xl border border-slate-200/80 bg-[#F9FBFE] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#0B2453]">
                          {formatIndonesianDateFromIso(rec.date)}
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            rec.lateMinutes > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          &bull; {rec.status}
                          {rec.lateMinutes > 0 ? ` (${rec.lateMinutes}m)` : ''}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-emerald-600" />
                          Masuk: <strong className="text-slate-900">{rec.clockInTime || '--:--'}</strong>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#C69214]" />
                          Pulang: <strong className="text-slate-900">{rec.clockOutTime || '--:--'}</strong>
                        </span>
                        {rec.workMinutes > 0 && <span>({formatDuration(rec.workMinutes)})</span>}
                      </div>

                      {rec.clockInAddress && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{rec.clockInAddress}</span>
                        </div>
                      )}
                      {rec.clockInPhotoVerified && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>GPS &amp; Kamera Live Terverifikasi</span>
                        </div>
                      )}
                    </div>

                    {cached?.in && (
                      <button
                        type="button"
                        aria-label={`Lihat bukti foto absensi ${rec.date}`}
                        onClick={() => setPreviewRecord(rec)}
                        className="shrink-0 self-start sm:self-center inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:border-[#0B2453]/40 p-1.5 pr-3 transition-colors cursor-pointer"
                      >
                        <img
                          src={cached.in}
                          alt={`Bukti absensi ${rec.date}`}
                          className="w-11 h-9 rounded-lg object-cover"
                        />
                        <span className="text-[11px] font-bold text-[#0B2453] inline-flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          Lihat Bukti
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Right Column on Desktop: Menu Cepat + Ringkasan Status Karyawan */}
      <div className="hidden lg:block lg:col-span-5 space-y-5">
        <section
          aria-labelledby="menu-cepat-desktop-heading"
          className="rounded-3xl bg-white p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70"
        >
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
            <h2 id="menu-cepat-desktop-heading" className="text-base font-extrabold text-[#0B2453]">
              Menu Cepat
            </h2>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {quickMenuItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-[#F8FAFD] hover:bg-[#EEF4FC] hover:border-[#0B2453]/30 px-2 py-4 text-center transition-all active:scale-[0.97] cursor-pointer"
              >
                <div
                  className={`w-11 h-11 rounded-xl ${item.iconBg} flex items-center justify-center mb-2`}
                >
                  {item.icon}
                </div>
                <span className="text-xs font-bold text-[#0B2453] leading-tight whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Employee Quick Status Summary on Desktop */}
        <section
          aria-label="Ringkasan Akun Karyawan"
          className="rounded-3xl bg-white p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">Status Kepegawaian</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateDocument('profil')}
              className="text-xs font-bold text-[#C69214] hover:text-[#0B2453] transition-colors cursor-pointer"
            >
              Lihat Profil &rarr;
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-3">
              <div className="text-[11px] font-semibold text-slate-500">Sisa Cuti</div>
              <div className="mt-1 text-xl font-extrabold text-[#0B2453] tabular-nums">
                {currentUser.leaveQuota} hr
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-3">
              <div className="text-[11px] font-semibold text-slate-500">Total Absen</div>
              <div className="mt-1 text-xl font-extrabold text-[#0B2453] tabular-nums">
                {myAttendance.length}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-3">
              <div className="text-[11px] font-semibold text-slate-500">Pengajuan</div>
              <div className="mt-1 text-xl font-extrabold text-[#B6810C] tabular-nums">
                {myPendingRequests}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-3.5 text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span>Divisi</span>
              <span className="font-bold text-[#0B2453]">{currentUser.division}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Kontrak Kerja</span>
              <span className="font-bold text-[#0B2453] inline-flex items-center gap-1">
                {currentUser.contractType}
                {currentUser.contractSigned && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Email Akun</span>
              <span className="font-bold text-[#0B2453] truncate max-w-[200px]">
                {currentUser.email}
              </span>
            </div>
          </div>

          {currentUser.role === 'hrd' && onOpenExportAll && (
            <button
              type="button"
              onClick={onOpenExportAll}
              className="w-full h-11 rounded-2xl bg-gradient-to-r from-[#0B2453] to-[#163A7A] hover:brightness-110 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#F3CA62]" />
              <span>Export Semua Hasil (Excel / CSV / PDF)</span>
            </button>
          )}
        </section>
      </div>

      {/* Watermark Photo Lightbox */}
      {previewRecord && previewPhotos && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bukti Foto Absensi GPS Watermark"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white overflow-hidden shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between bg-[#0B2453] px-5 py-3.5 text-white border-b-2 border-[#C69214]">
              <div>
                <h3 className="text-sm font-bold">Bukti Foto GPS Timestamp</h3>
                <p className="text-[11px] text-amber-200">
                  {formatIndonesianDateFromIso(previewRecord.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                aria-label="Tutup pratinjau foto"
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {previewPhotos.in && (
                <div>
                  <div className="text-xs font-bold text-[#0B2453] mb-1.5">
                    Foto Absen Masuk ({previewRecord.clockInTime} WIB)
                  </div>
                  <img
                    src={previewPhotos.in}
                    alt="Foto Absen Masuk ber-watermark"
                    className="w-full rounded-2xl border border-slate-200"
                  />
                </div>
              )}
              {previewPhotos.out && (
                <div>
                  <div className="text-xs font-bold text-[#9A6F0B] mb-1.5">
                    Foto Absen Pulang ({previewRecord.clockOutTime} WIB)
                  </div>
                  <img
                    src={previewPhotos.out}
                    alt="Foto Absen Pulang ber-watermark"
                    className="w-full rounded-2xl border border-slate-200"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

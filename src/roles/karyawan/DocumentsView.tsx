import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  FileBadge2,
  PenTool,
  Printer,
  Save,
  User,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import type { DocumentSubTab } from '../../types/hris';
import {
  calculatePayslip,
  formatRupiah,
} from '../../utils/hrisLogic';
import { SbumBadgeIcon } from '../../shared/SbumLogo';

interface DocumentsViewProps {
  activeSubTab: DocumentSubTab;
  onChangeSubTab: (sub: DocumentSubTab) => void;
}

const PAYSLIP_PERIODS = [
  { key: '2026-11', label: 'November 2026' },
  { key: '2026-10', label: 'Oktober 2026' },
  { key: '2026-09', label: 'September 2026' },
];

export function DocumentsView({ activeSubTab, onChangeSubTab }: DocumentsViewProps) {
  const {
    currentUser,
    attendance,
    overtimes,
    payslipComponents,
    payrollSettings,
    signContract,
    updateEmployeeProfile,
    shiftTemplateFor,
  } = useHris();

  const [selectedPeriod, setSelectedPeriod] = useState(PAYSLIP_PERIODS[0]);
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [address, setAddress] = useState(currentUser?.address ?? '');
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setPhone(currentUser.phone ?? '');
    setAddress(currentUser.address ?? '');
  }, [currentUser]);

  const payslip = useMemo(() => {
    if (!currentUser) return null;
    return calculatePayslip(
      currentUser,
      selectedPeriod.key,
      selectedPeriod.label,
      attendance,
      overtimes,
      payslipComponents,
      payrollSettings
    );
  }, [
    currentUser,
    selectedPeriod,
    attendance,
    overtimes,
    payslipComponents,
    payrollSettings,
  ]);

  if (!currentUser || !payslip) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateEmployeeProfile(currentUser.uid, {
        phone: phone.trim(),
        address: address.trim() || currentUser.address,
      });
      setSavedMsg('Profil kontak berhasil disimpan ke Firebase.');
      window.setTimeout(() => setSavedMsg(null), 2600);
    } finally {
      setSaving(false);
    }
  };

  const handleSignContract = async () => {
    setSigning(true);
    try {
      await signContract(currentUser.uid);
    } finally {
      setSigning(false);
    }
  };

  const subTabs: Array<{ id: DocumentSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'slip', label: 'Slip Gaji', icon: <Banknote className="w-4 h-4" /> },
    { id: 'pkwt', label: 'PKO / PKWT', icon: <FileBadge2 className="w-4 h-4" /> },
    { id: 'profil', label: 'Profil Karyawan', icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Segmented Sub-Tab Bar */}
      <div className="no-print rounded-2xl bg-white p-1.5 shadow-sm border border-slate-200/80 grid grid-cols-3 gap-1.5">
        {subTabs.map((tab) => {
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeSubTab(tab.id)}
              className={`h-11 rounded-xl px-3 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-[#0B2453] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-[#0B2453]'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SLIP GAJI */}
      {activeSubTab === 'slip' && (
        <section className="rounded-3xl bg-white p-5 sm:p-7 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <SbumBadgeIcon className="w-11 h-11" />
              <div>
                <h1 className="text-base sm:text-lg font-extrabold text-[#0B2453]">
                  Slip Gaji Karyawan
                </h1>
                <p className="text-xs text-slate-500">
                  PT Sinar Bunga Mas &bull; Periode {payslip.periodLabel}
                </p>
              </div>
            </div>

            <div className="no-print flex items-center gap-2">
              <select
                aria-label="Pilih periode slip gaji"
                value={selectedPeriod.key}
                onChange={(e) => {
                  const found = PAYSLIP_PERIODS.find((p) => p.key === e.target.value);
                  if (found) setSelectedPeriod(found);
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B2453] focus:border-[#0B2453] focus:outline-none"
              >
                {PAYSLIP_PERIODS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
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

          {/* Employee Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-[#F8FAFD] border border-slate-200/70 p-4 text-xs">
            <div>
              <div className="text-slate-500">Nama</div>
              <div className="font-bold text-[#0B2453] mt-0.5">{currentUser.name}</div>
            </div>
            <div>
              <div className="text-slate-500">NIK / ID</div>
              <div className="font-mono font-bold text-[#0B2453] mt-0.5">{currentUser.nik}</div>
            </div>
            <div>
              <div className="text-slate-500">Jabatan / Divisi</div>
              <div className="font-bold text-[#0B2453] mt-0.5">
                {currentUser.position} ({currentUser.division})
              </div>
            </div>
            <div>
              <div className="text-slate-500">Kehadiran Tercatat</div>
              <div className="font-mono font-bold text-[#0B2453] mt-0.5 tabular-nums">
                {payslip.attendanceDays} hari &bull; Lembur {payslip.overtimeHours}j
              </div>
            </div>
          </div>

          {/* Earnings & Deductions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2.5">
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
                Penerimaan (Earnings)
              </h2>
              <div className="space-y-2 text-xs sm:text-sm">
                {payslip.earnings.map((line) => (
                  <div key={line.code} className="flex justify-between gap-3">
                    <span className="text-slate-600">{line.label}</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatRupiah(line.amount)}
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-[#0B2453]">
                  <span>Total Penerimaan</span>
                  <span className="font-mono tabular-nums">{formatRupiah(payslip.grossPay)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 p-4 space-y-2.5">
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-rose-700">
                Potongan (Deductions)
              </h2>
              <div className="space-y-2 text-xs sm:text-sm">
                {payslip.deductions.length === 0 ? (
                  <p className="text-xs text-slate-500">Tidak ada potongan pada periode ini.</p>
                ) : (
                  payslip.deductions.map((line) => (
                    <div key={line.code} className="flex justify-between gap-3">
                      <span className="text-slate-600">{line.label}</span>
                      <span className="font-mono font-bold text-rose-700 tabular-nums whitespace-nowrap">
                        −{formatRupiah(line.amount)}
                      </span>
                    </div>
                  ))
                )}
                <div className="pt-2 border-t border-slate-200 flex justify-between font-extrabold text-rose-700">
                  <span>Total Potongan</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(payslip.totalDeductions)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Take Home Pay Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-[#0B2453] to-[#163A7A] p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-4 border-[#C69214]">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-200">
                Take Home Pay (Gaji Bersih Diterima)
              </div>
              <div className="text-[11px] text-slate-200">
                Transfer Payroll Otomatis &bull; PT Sinar Bunga Mas
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#F5D36C]">
              {formatRupiah(payslip.netPay)}
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: PKO / PKWT CONTRACT */}
      {activeSubTab === 'pkwt' && (
        <section className="rounded-3xl bg-white p-5 sm:p-7 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-[#0B2453]">
                Dokumen Perjanjian Kerja ({currentUser.contractType})
              </h1>
              <p className="text-xs text-slate-500">
                No. SBM/HRD/{currentUser.contractType}/{currentUser.nik}/2026
              </p>
            </div>
            <div className="no-print flex items-center gap-2">
              {!currentUser.contractSigned && (
                <button
                  type="button"
                  disabled={signing}
                  onClick={() => void handleSignContract()}
                  className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#C69214] to-[#A6760B] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <PenTool className="w-4 h-4" />
                  <span>{signing ? 'Menyimpan...' : 'Tanda Tangani Digital'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="h-10 px-4 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Kontrak</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#FAFBFD] p-5 space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed">
            <div className="text-center pb-3 border-b border-slate-200">
              <div className="text-sm sm:text-base font-extrabold text-[#0B2453]">
                PERJANJIAN KERJA {currentUser.contractType === 'PKO' ? 'OPERASIONAL (PKO)' : 'WAKTU TERTENTU (PKWT)'}
              </div>
              <div className="text-xs font-semibold text-[#9A6F0B]">
                PT SINAR BUNGA MAS — ONE STOP BUSINESS SERVICES
              </div>
            </div>

            <p>
              Pada hari ini dibuat kesepakatan hubungan kerja antara{' '}
              <strong className="text-[#0B2453]">PT Sinar Bunga Mas</strong> (Pihak Pertama) dengan
              karyawan di bawah ini (Pihak Kedua):
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white rounded-xl border border-slate-200 p-4 text-xs">
              <div>
                <span className="text-slate-500">Nama Lengkap:</span>{' '}
                <strong className="text-[#0B2453]">{currentUser.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">NIK / ID Karyawan:</span>{' '}
                <strong className="font-mono text-[#0B2453]">{currentUser.nik}</strong>
              </div>
              <div>
                <span className="text-slate-500">Email Akun:</span>{' '}
                <strong className="text-[#0B2453]">{currentUser.email}</strong>
              </div>
              <div>
                <span className="text-slate-500">Jabatan / Divisi:</span>{' '}
                <strong className="text-[#0B2453]">
                  {currentUser.position} — {currentUser.division}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Shift Penempatan:</span>{' '}
                <strong className="text-[#0B2453]">
                  {shiftTemplateFor(currentUser.shiftCode, currentUser.division).label}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Masa Kontrak:</span>{' '}
                <strong className="font-mono text-[#0B2453]">
                  {currentUser.joinDate} s/d {currentUser.contractEnd}
                </strong>
              </div>
            </div>

            <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>
                Pihak Kedua wajib mematuhi SOP kehadiran digital PT Sinar Bunga Mas menggunakan
                Kamera Live ber-watermark GPS Timestamp sesuai jadwal shift yang ditetapkan.
              </li>
              <li>
                Kompensasi bulanan terdiri dari Gaji Pokok sebesar{' '}
                <strong className="font-mono">{formatRupiah(currentUser.baseSalary)}</strong> serta
                tunjangan jabatan dan operasional sesuai peraturan perusahaan.
              </li>
              <li>
                Hak cuti tahunan diberikan sebesar {currentUser.leaveQuota} hari kerja per tahun
                setelah memenuhi masa kerja ketentuan peraturan ketenagakerjaan.
              </li>
            </ol>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#0B2453]">Status Tanda Tangan Digital</div>
                {currentUser.contractSigned ? (
                  <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Telah Ditandatangani secara elektronik ({currentUser.contractSignedAt || 'Tercatat'})
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs font-bold text-amber-700">
                    Menunggu tanda tangan elektronik karyawan.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: PROFIL KARYAWAN */}
      {activeSubTab === 'profil' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Digital ID Card */}
          <section className="lg:col-span-5 rounded-3xl bg-gradient-to-br from-[#0A1E46] via-[#122D65] to-[#0B2250] p-6 text-white shadow-lg border-b-4 border-[#C69214] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <SbumBadgeIcon className="w-10 h-10" />
                  <div>
                    <div className="text-sm font-extrabold">PT Sinar Bunga Mas</div>
                    <div className="text-[10px] tracking-widest uppercase text-[#F1C75B]">
                      Kartu Identitas Karyawan
                    </div>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-emerald-300">AKTIF</span>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F3D16A] to-[#B6810C] text-[#0B2453] flex items-center justify-center text-xl font-extrabold shrink-0">
                  {currentUser.name
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold truncate">{currentUser.name}</h2>
                  <p className="text-xs font-semibold text-[#F3CA62]">{currentUser.position}</p>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">
                    NIK: {currentUser.nik} &bull; {currentUser.division}
                  </p>
                  <p className="text-[11px] text-slate-300 truncate mt-0.5">{currentUser.email}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/15 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-slate-300 text-[11px]">Kontrak</div>
                <div className="font-bold">{currentUser.contractType}</div>
              </div>
              <div>
                <div className="text-slate-300 text-[11px]">Bergabung</div>
                <div className="font-mono font-bold">{currentUser.joinDate}</div>
              </div>
            </div>
          </section>

          {/* Editable Contact Info */}
          <section className="lg:col-span-7 rounded-3xl bg-white p-5 sm:p-6 shadow-[0_6px_24px_rgba(11,36,83,0.06)] border border-slate-200/70">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-[#0B2453]">Data Kontak Karyawan</h2>
            </div>

            {savedMsg && (
              <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{savedMsg}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-4">
              <div>
                <label htmlFor="prof-email" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Email Akun Login (Firebase)
                </label>
                <input
                  id="prof-email"
                  type="email"
                  readOnly
                  value={currentUser.email}
                  className="w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-600 cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Email terhubung langsung dengan akun autentikasi Firebase Anda.
                </p>
              </div>

              <div>
                <label htmlFor="prof-phone" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Nomor HP / WhatsApp
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  placeholder="Contoh: 0812-8800-1100"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="prof-addr" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Alamat Domisili
                </label>
                <textarea
                  id="prof-addr"
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="h-11 px-5 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan Profil'}</span>
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

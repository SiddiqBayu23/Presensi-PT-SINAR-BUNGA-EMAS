import React, { useState } from 'react';
import {
  ArrowLeft,
  IdCard,
  ImagePlus,
  KeyRound,
  Save,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import { EmployeeAvatar } from '../../shared/EmployeeAvatar';
import { EMPLOYEE_DOC_MAX_CHARS, compressImageForFirestore } from '../../firebase';
import {
  EDUCATION_LEVELS,
  GENDERS,
  MARITAL_STATUSES,
  ROLE_LABELS,
  type Division,
  type EducationLevel,
  type Employee,
  type EmployeeDocumentKind,
  type EmployeeGender,
  type HrdEditableEmployeeFields,
  type MaritalStatus,
  type ShiftCode,
  type UserRole,
} from '../../types/hris';
import {
  calculateAge,
  formatRupiah,
  formatThousands,
  isSixteenDigits,
  resolveDivisionShiftRule,
  sanitizeSixteenDigits,
  shiftTemplateName,
} from '../../utils/hrisLogic';

/** Batas unggahan mentah sebelum dikompres (foto kamera ponsel ±3-8 MB). */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const PROFILE_PHOTO_MAX_CHARS = 300000;
const DOC_IMAGE_MAX_SIDE = 1200;

const BANK_SUGGESTIONS = ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Permata', 'BTN'];

interface DetailForm {
  position: string;
  ktpNumber: string;
  kkNumber: string;
  fullNameKtp: string;
  birthPlace: string;
  birthDate: string;
  ktpAddress: string;
  gender: string;
  motherName: string;
  workRegion: string;
  maritalStatus: string;
  childrenCount: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  lastEducation: string;
  phone: string;
  address: string;
  baseSalary: string;
  positionAllowance: string;
  mealTransportAllowance: string;
}

/** Penanda operasi kepegawaian yang tersimpan langsung (menonaktifkan kontrolnya saat berjalan). */
type ApplyTag = 'division' | 'role' | 'supervisor' | 'shift' | 'quota' | 'active' | null;

function initialForm(employee: Employee): DetailForm {
  return {
    position: employee.position,
    ktpNumber: employee.ktpNumber ?? '',
    kkNumber: employee.kkNumber ?? '',
    fullNameKtp: employee.fullNameKtp ?? '',
    birthPlace: employee.birthPlace ?? '',
    birthDate: employee.birthDate ?? '',
    ktpAddress: employee.ktpAddress ?? '',
    gender: employee.gender ?? '',
    motherName: employee.motherName ?? '',
    workRegion: employee.workRegion ?? '',
    maritalStatus: employee.maritalStatus ?? '',
    childrenCount: String(employee.childrenCount ?? 0),
    bankName: employee.bankName ?? '',
    bankAccountNumber: employee.bankAccountNumber ?? '',
    bankAccountName: employee.bankAccountName ?? '',
    emergencyContactName: employee.emergencyContactName ?? '',
    emergencyContactPhone: employee.emergencyContactPhone ?? '',
    lastEducation: employee.lastEducation ?? '',
    phone: employee.phone,
    address: employee.address,
    baseSalary: String(employee.baseSalary ?? 0),
    positionAllowance: String(employee.positionAllowance ?? 0),
    mealTransportAllowance: String(employee.mealTransportAllowance ?? 0),
  };
}

/** Pesan galat siap tampil: galat Firestore (JSON) diganti kalimat yang bisa dibaca HRD. */
function friendlyError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.toLowerCase().includes('permission')) {
    return 'Ditolak server: hanya Admin HRD yang boleh mengubah data karyawan.';
  }
  return message.startsWith('{') || !message ? fallback : message;
}

/** Membaca berkas gambar menjadi data URL; menolak non-gambar dan berkas terlalu besar. */
function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Berkas harus berupa gambar (JPG atau PNG).'));
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.reject(new Error('Ukuran gambar maksimal 10 MB.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
    reader.readAsDataURL(file);
  });
}

const inputClass =
  'w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none';
const selectClass = `${inputClass} font-semibold`;

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-slate-600 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-xs border border-slate-200/80 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{title}</h4>
        {hint && <span className="text-[10px] font-bold text-slate-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

interface EmployeeDetailPageProps {
  employee: Employee;
  onBack: () => void;
  onShowToast: (message: string) => void;
}

/**
 * Halaman Detail Karyawan (bukan modal): satu tempat untuk data pribadi (KTP/KK,
 * kelahiran, keluarga, rekening, kontak darurat, pendidikan), data kepegawaian
 * (divisi, peran, atasan langsung, shift, kuota izin), status akun, dan unggah
 * dokumen gambar (foto profil, scan KTP, scan KK).
 */
export function EmployeeDetailPage({ employee, onBack, onShowToast }: EmployeeDetailPageProps) {
  const {
    currentUser,
    employees,
    divisions,
    divisionShiftRules,
    employeeDocuments,
    updateEmployeeProfile,
    saveEmployeeDocument,
    deleteEmployeeDocument,
    updateLeaveQuota,
    toggleEmployeeActive,
    resetUserPassword,
    wibNow,
  } = useHris();

  const [form, setForm] = useState<DetailForm>(() => initialForm(employee));
  const [saving, setSaving] = useState(false);
  const [busyImage, setBusyImage] = useState<'photo' | EmployeeDocumentKind | null>(null);
  const [applying, setApplying] = useState<ApplyTag>(null);
  const [resetting, setResetting] = useState(false);

  const setValue = (key: keyof DetailForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const documents = employeeDocuments[employee.uid] ?? {};
  const age = calculateAge(form.birthDate, wibNow.isoDate);
  const allowedShiftCodes = resolveDivisionShiftRule(
    employee.division,
    divisionShiftRules
  ).allowedShiftCodes;
  const supervisorCandidates = employees.filter(
    (emp) => emp.role === 'supervisor' && emp.division === employee.division && emp.uid !== employee.uid
  );
  const isSelf = currentUser?.uid === employee.uid;

  /** Perubahan kepegawaian tersimpan langsung; kontrol dinonaktifkan selama operasi berjalan. */
  const applyNow = async (tag: ApplyTag, task: () => Promise<void>) => {
    if (applying) return;
    setApplying(tag);
    try {
      await task();
    } catch {
      onShowToast('Gagal menyimpan perubahan. Periksa koneksi lalu coba lagi.');
    } finally {
      setApplying(null);
    }
  };
  const handleDivisionChange = (nextDivision: Division) => {
    if (nextDivision === employee.division) return;
    if (employee.role === 'hrd' && nextDivision !== 'HRD') {
      onShowToast(
        'Peran Admin HRD hanya berlaku di divisi HRD. Ubah perannya ke Karyawan/Supervisor lebih dulu.'
      );
      return;
    }
    void applyNow('division', async () => {
      const { syncedSchedules } = await updateEmployeeProfile(employee.uid, {
        division: nextDivision,
      });
      onShowToast(
        `Divisi ${employee.name} diubah ke ${nextDivision}.${
          employee.supervisorUid
            ? ' Atasan langsung dikosongkan karena atasan wajib satu divisi.'
            : ''
        }${syncedSchedules > 0 ? ` ${syncedSchedules} jadwal harian ikut disesuaikan.` : ''}`
      );
    });
  };

  const handleRoleChange = (nextRole: UserRole) => {
    if (nextRole === employee.role) return;
    if (nextRole === 'hrd' && employee.division !== 'HRD') {
      onShowToast('Peran Admin HRD hanya berlaku untuk divisi HRD.');
      return;
    }
    void applyNow('role', async () => {
      await updateEmployeeProfile(employee.uid, {
        role: nextRole,
        ...(nextRole === 'employee' ? {} : { supervisorUid: '' }),
      });
      onShowToast(
        nextRole === 'supervisor'
          ? `Peran ${employee.name} diubah ke Supervisor. Bawahannya kini bisa dirutekan ke dirinya.`
          : `Peran ${employee.name} diubah ke ${ROLE_LABELS[nextRole]}.`
      );
    });
  };

  const handleSupervisorChange = (nextSupervisorUid: string) => {
    if (nextSupervisorUid === employee.supervisorUid) return;
    void applyNow('supervisor', async () => {
      await updateEmployeeProfile(employee.uid, { supervisorUid: nextSupervisorUid });
      onShowToast(
        nextSupervisorUid
          ? `Atasan langsung ${employee.name} diperbarui.`
          : `Pengajuan ${employee.name} dialihkan langsung ke HRD.`
      );
    });
  };

  const handleShiftChange = (nextShift: ShiftCode) => {
    if (nextShift === employee.shiftCode) return;
    void applyNow('shift', async () => {
      const { syncedSchedules } = await updateEmployeeProfile(employee.uid, {
        shiftCode: nextShift,
      });
      onShowToast(
        `Shift ${employee.name} diubah ke ${shiftTemplateName(nextShift)}.${
          syncedSchedules > 0
            ? ` ${syncedSchedules} jadwal harian yang masih memakai shift lama ikut disesuaikan.`
            : ''
        }`
      );
    });
  };

  const handleQuotaCommit = (raw: string) => {
    const value = Number(raw);
    if (Number.isNaN(value) || value < 0 || value === (employee.leaveQuota ?? 12)) return;
    void applyNow('quota', async () => {
      await updateLeaveQuota(employee.uid, value);
      onShowToast(`Kuota izin ${employee.name} diatur menjadi ${value} hari.`);
    });
  };

  const handleToggleActive = () => {
    if (isSelf) {
      onShowToast('Akun Anda sendiri tidak bisa dinonaktifkan.');
      return;
    }
    const nextState = !employee.active;
    void applyNow('active', async () => {
      const res = await toggleEmployeeActive(employee.uid, nextState);
      if (!res.ok) {
        onShowToast(res.error);
        return;
      }
      onShowToast(
        nextState
          ? `Akun ${employee.name} diaktifkan kembali.`
          : res.authLocked
            ? `Akun ${employee.name} dinonaktifkan: tidak bisa login lagi.`
            : `Akun ${employee.name} dinonaktifkan di data kepegawaian. Kunci login di Firebase Auth baru berlaku setelah Cloud Function setEmployeeActive di-deploy.`
      );
    });
  };

  /** Admin HRD mengirim tautan reset kata sandi ke email karyawan. */
  const handleResetPassword = async () => {
    if (resetting) return;
    const confirmed = window.confirm(`Kirim tautan reset kata sandi ke email ${employee.email}?`);
    if (!confirmed) return;
    setResetting(true);
    try {
      const res = await resetUserPassword(employee.uid);
      onShowToast(res.ok ? `Tautan reset kata sandi dikirim ke ${employee.email}.` : res.error);
    } finally {
      setResetting(false);
    }
  };

  const handleUpload = async (target: 'photo' | EmployeeDocumentKind, file: File | undefined) => {
    if (!file || busyImage) return;
    setBusyImage(target);
    try {
      const raw = await readImageFile(file);
      if (target === 'photo') {
        const dataUrl = await compressImageForFirestore(raw, {
          maxChars: PROFILE_PHOTO_MAX_CHARS,
          maxSide: 640,
        });
        await updateEmployeeProfile(employee.uid, { photoUrl: dataUrl });
        onShowToast('Foto profil diperbarui.');
      } else {
        const dataUrl = await compressImageForFirestore(raw, {
          maxChars: EMPLOYEE_DOC_MAX_CHARS,
          maxSide: DOC_IMAGE_MAX_SIDE,
        });
        await saveEmployeeDocument(employee.uid, target, dataUrl);
        onShowToast(target === 'ktp' ? 'Foto KTP tersimpan.' : 'Foto KK tersimpan.');
      }
    } catch (err) {
      onShowToast(friendlyError(err, 'Gagal mengunggah gambar. Periksa koneksi lalu coba lagi.'));
    } finally {
      setBusyImage(null);
    }
  };

  const handleDeleteDocument = async (target: 'photo' | EmployeeDocumentKind) => {
    if (busyImage) return;
    setBusyImage(target);
    try {
      if (target === 'photo') {
        await updateEmployeeProfile(employee.uid, { photoUrl: '' });
        onShowToast('Foto profil dihapus.');
      } else {
        await deleteEmployeeDocument(employee.uid, target);
        onShowToast(target === 'ktp' ? 'Foto KTP dihapus.' : 'Foto KK dihapus.');
      }
    } catch (err) {
      onShowToast(friendlyError(err, 'Gagal menghapus gambar. Periksa koneksi lalu coba lagi.'));
    } finally {
      setBusyImage(null);
    }
  };

  /** Simpan formulir: jabatan + data pribadi. Data kepegawaian lain tersimpan otomatis. */
  const handleSave = async () => {
    if (saving) return;
    const position = form.position.trim();
    if (position.length < 2) {
      onShowToast('Jabatan minimal 2 karakter.');
      return;
    }
    const ktpNumber = sanitizeSixteenDigits(form.ktpNumber);
    const kkNumber = sanitizeSixteenDigits(form.kkNumber);
    if (form.ktpNumber.replace(/[^0-9]/g, '').length > 0 && !isSixteenDigits(ktpNumber)) {
      onShowToast('NIK KTP harus tepat 16 digit angka.');
      return;
    }
    if (form.kkNumber.replace(/[^0-9]/g, '').length > 0 && !isSixteenDigits(kkNumber)) {
      onShowToast('Nomor Kartu Keluarga harus tepat 16 digit angka.');
      return;
    }
    if (form.birthDate && form.birthDate > wibNow.isoDate) {
      onShowToast('Tanggal lahir tidak boleh di masa depan.');
      return;
    }
    const childrenCount = Math.trunc(Number(form.childrenCount || '0'));
    if (!Number.isFinite(childrenCount) || childrenCount < 0 || childrenCount > 20) {
      onShowToast('Jumlah anak harus 0 sampai 20.');
      return;
    }
    const bankAccountNumber = form.bankAccountNumber.replace(/[^0-9]/g, '').slice(0, 30);

    const next: Partial<HrdEditableEmployeeFields> = {};
    const text = (value: string) => value.trim();
    if (position !== employee.position) next.position = position;
    if (ktpNumber !== (employee.ktpNumber ?? '')) next.ktpNumber = ktpNumber;
    if (kkNumber !== (employee.kkNumber ?? '')) next.kkNumber = kkNumber;
    if (text(form.fullNameKtp) !== (employee.fullNameKtp ?? '')) next.fullNameKtp = text(form.fullNameKtp);
    if (text(form.birthPlace) !== (employee.birthPlace ?? '')) next.birthPlace = text(form.birthPlace);
    if (form.birthDate !== (employee.birthDate ?? '')) next.birthDate = form.birthDate;
    if (text(form.ktpAddress) !== (employee.ktpAddress ?? '')) next.ktpAddress = text(form.ktpAddress);
    if (form.gender !== (employee.gender ?? '')) next.gender = form.gender as EmployeeGender | '';
    if (text(form.motherName) !== (employee.motherName ?? '')) next.motherName = text(form.motherName);
    if (text(form.workRegion) !== (employee.workRegion ?? '')) next.workRegion = text(form.workRegion);
    if (form.maritalStatus !== (employee.maritalStatus ?? '')) {
      next.maritalStatus = form.maritalStatus as MaritalStatus | '';
    }
    if (childrenCount !== (employee.childrenCount ?? 0)) next.childrenCount = childrenCount;
    if (text(form.bankName) !== (employee.bankName ?? '')) next.bankName = text(form.bankName);
    if (bankAccountNumber !== (employee.bankAccountNumber ?? '')) {
      next.bankAccountNumber = bankAccountNumber;
    }
    if (text(form.bankAccountName) !== (employee.bankAccountName ?? '')) {
      next.bankAccountName = text(form.bankAccountName);
    }
    if (text(form.emergencyContactName) !== (employee.emergencyContactName ?? '')) {
      next.emergencyContactName = text(form.emergencyContactName);
    }
    if (text(form.emergencyContactPhone) !== (employee.emergencyContactPhone ?? '')) {
      next.emergencyContactPhone = text(form.emergencyContactPhone);
    }
    if (form.lastEducation !== (employee.lastEducation ?? '')) {
      next.lastEducation = form.lastEducation as EducationLevel | '';
    }
    if (text(form.phone) !== employee.phone) next.phone = text(form.phone);
    if (text(form.address) !== employee.address) next.address = text(form.address);
    const parseMoney = (raw: string, max: number) => {
      const digits = raw.replace(/[^0-9]/g, '');
      if (!digits) return 0;
      const n = Math.round(Number(digits));
      return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
    };
    const nextBase = parseMoney(form.baseSalary, 500_000_000);
    const nextPositionAllowance = parseMoney(form.positionAllowance, 200_000_000);
    const nextMealAllowance = parseMoney(form.mealTransportAllowance, 100_000_000);
    if (nextBase !== employee.baseSalary) next.baseSalary = nextBase;
    if (nextPositionAllowance !== employee.positionAllowance) {
      next.positionAllowance = nextPositionAllowance;
    }
    if (nextMealAllowance !== employee.mealTransportAllowance) {
      next.mealTransportAllowance = nextMealAllowance;
    }
    if (Object.keys(next).length === 0) {
      onShowToast('Tidak ada perubahan data untuk disimpan.');
      return;
    }

    setSaving(true);
    try {
      await updateEmployeeProfile(employee.uid, next);
      onShowToast(`Data ${employee.name} diperbarui.`);
    } catch (err) {
      onShowToast(friendlyError(err, 'Gagal menyimpan data. Periksa koneksi lalu coba lagi.'));
    } finally {
      setSaving(false);
    }
  };
  const renderUploadRow = (
    target: 'photo' | EmployeeDocumentKind,
    title: string,
    description: string,
    current: string | undefined
  ) => {
    const busy = busyImage === target;
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#0B2453]">{title}</p>
            <p className="text-[11px] text-slate-500">{description}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label
              className={`h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 ${
                busy ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{busy ? 'Memproses...' : current ? 'Ganti' : 'Unggah'}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleUpload(target, file);
                }}
              />
            </label>
            {current && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDeleteDocument(target)}
                className="h-8 px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-bold text-rose-700 inline-flex items-center gap-1.5 hover:bg-rose-100 disabled:opacity-60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            )}
          </div>
        </div>
        {current ? (
          <img
            src={current}
            alt={title}
            className="w-full h-40 object-contain rounded-lg bg-white border border-slate-200"
          />
        ) : (
          <div className="w-full h-24 rounded-lg border border-dashed border-slate-300 bg-white text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
            <ImagePlus className="w-4 h-4" />
            <span>Belum ada gambar</span>
          </div>
        )}
      </div>
    );
  };

  const chip =
    'text-[10px] font-extrabold px-2 py-0.5 rounded-full border';

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#0B2453] text-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Kembali ke Data Karyawan"
              className="h-9 w-9 shrink-0 rounded-xl bg-white/10 hover:bg-white/20 inline-flex items-center justify-center cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <EmployeeAvatar
              name={employee.name}
              photoUrl={employee.photoUrl}
              className="w-14 h-14 shrink-0"
              textClassName="text-base"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#C69214]">
                Detail Karyawan
              </p>
              <h2 className="text-lg font-extrabold truncate">{employee.name}</h2>
              <p className="text-[11px] text-white/70 truncate">
                {employee.nik} &bull; {employee.position} &bull; {employee.email}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`${chip} bg-white/10 border-white/20 text-white`}>
                  {ROLE_LABELS[employee.role]}
                </span>
                <span
                  className={`${chip} ${
                    employee.active
                      ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-100'
                      : 'bg-rose-400/15 border-rose-300/40 text-rose-100'
                  }`}
                >
                  {employee.active ? 'Aktif' : 'Non-Aktif'}
                </span>
                <span className={`${chip} bg-white/10 border-white/20 text-white`}>
                  {employee.contractType}
                </span>
                <span
                  className={`${chip} ${
                    employee.contractSigned
                      ? 'bg-emerald-400/15 border-emerald-300/40 text-emerald-100'
                      : 'bg-amber-400/15 border-amber-300/40 text-amber-100'
                  }`}
                >
                  {employee.contractSigned ? 'TTD Digital' : 'Belum TTD'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleResetPassword()}
              disabled={resetting}
              title={`Kirim tautan reset kata sandi ke ${employee.email}`}
              className="h-10 px-3 rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 text-xs font-bold text-white inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{resetting ? 'Memproses...' : 'Reset Sandi'}</span>
            </button>
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={isSelf || applying === 'active'}
              title={isSelf ? 'Akun Anda sendiri tidak bisa dinonaktifkan.' : undefined}
              className={`h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer ${
                employee.active
                  ? 'border-rose-300/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-50'
                  : 'border-emerald-300/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-50'
              }`}
            >
              {employee.active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
              <span>{employee.active ? 'Nonaktifkan' : 'Aktifkan'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-10 px-4 rounded-xl bg-[#C69214] hover:bg-[#a87a0c] text-[#0B2453] text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Data'}</span>
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4">
          <Section title="Identitas sesuai KTP">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="detail-fullname" label="Nama Lengkap Sesuai KTP">
                <input
                  id="detail-fullname"
                  type="text"
                  maxLength={100}
                  value={form.fullNameKtp}
                  onChange={(e) => setValue('fullNameKtp', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="detail-ktp" label="NIK KTP" hint="Tepat 16 digit angka.">
                <input
                  id="detail-ktp"
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={form.ktpNumber}
                  onChange={(e) => setValue('ktpNumber', e.target.value.replace(/[^0-9]/g, ''))}
                  className={inputClass}
                  placeholder="16 digit"
                />
              </Field>
              <Field id="detail-kk" label="Nomor Kartu Keluarga" hint="Tepat 16 digit angka.">
                <input
                  id="detail-kk"
                  type="text"
                  inputMode="numeric"
                  maxLength={16}
                  value={form.kkNumber}
                  onChange={(e) => setValue('kkNumber', e.target.value.replace(/[^0-9]/g, ''))}
                  className={inputClass}
                  placeholder="16 digit"
                />
              </Field>
              <Field id="detail-email" label="Alamat Email" hint="Mengikuti akun login Firebase.">
                <input
                  id="detail-email"
                  type="email"
                  readOnly
                  value={employee.email}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 cursor-not-allowed"
                />
              </Field>
              <Field id="detail-birthplace" label="Tempat Lahir">
                <input
                  id="detail-birthplace"
                  type="text"
                  maxLength={80}
                  value={form.birthPlace}
                  onChange={(e) => setValue('birthPlace', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                id="detail-birthdate"
                label="Tanggal Lahir"
                hint={age === null ? 'Usia dihitung otomatis.' : `Usia: ${age} tahun.`}
              >
                <input
                  id="detail-birthdate"
                  type="date"
                  max={wibNow.isoDate}
                  value={form.birthDate}
                  onChange={(e) => setValue('birthDate', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="detail-gender" label="Jenis Kelamin">
                <select
                  id="detail-gender"
                  value={form.gender}
                  onChange={(e) => setValue('gender', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Belum diisi</option>
                  {GENDERS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="detail-mother" label="Nama Ibu Kandung">
                <input
                  id="detail-mother"
                  type="text"
                  maxLength={100}
                  value={form.motherName}
                  onChange={(e) => setValue('motherName', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="detail-education" label="Pendidikan Terakhir">
                <select
                  id="detail-education"
                  value={form.lastEducation}
                  onChange={(e) => setValue('lastEducation', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Belum diisi</option>
                  {EDUCATION_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="detail-region" label="Wilayah Penempatan">
                <input
                  id="detail-region"
                  type="text"
                  maxLength={80}
                  value={form.workRegion}
                  onChange={(e) => setValue('workRegion', e.target.value)}
                  className={inputClass}
                  placeholder="mis. Jakarta Selatan"
                />
              </Field>
            </div>
          </Section>

          <Section title="Kontak & Domisili">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="detail-phone" label="Nomor HP / WhatsApp">
                <input
                  id="detail-phone"
                  type="tel"
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) => setValue('phone', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="detail-domicile" label="Alamat Domisili Saat Ini">
                <textarea
                  id="detail-domicile"
                  rows={3}
                  maxLength={240}
                  value={form.address}
                  onChange={(e) => setValue('address', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field id="detail-ktpaddress" label="Alamat Lengkap Sesuai KTP">
                  <textarea
                    id="detail-ktpaddress"
                    rows={3}
                    maxLength={240}
                    value={form.ktpAddress}
                    onChange={(e) => setValue('ktpAddress', e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm focus:border-[#0B2453] focus:outline-none"
                  />
                </Field>
              </div>
            </div>
          </Section>
          <Section title="Keluarga">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="detail-marital" label="Status Pernikahan">
                <select
                  id="detail-marital"
                  value={form.maritalStatus}
                  onChange={(e) => setValue('maritalStatus', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Belum diisi</option>
                  {MARITAL_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="detail-children" label="Jumlah Anak" hint="0 sampai 20.">
                <input
                  id="detail-children"
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  value={form.childrenCount}
                  onChange={(e) => setValue('childrenCount', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Section>

          <Section title="Rekening Bank" hint="Untuk transfer gaji">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field id="detail-bank" label="Bank">
                <input
                  id="detail-bank"
                  type="text"
                  maxLength={60}
                  list="detail-bank-options"
                  value={form.bankName}
                  onChange={(e) => setValue('bankName', e.target.value)}
                  className={inputClass}
                  placeholder="mis. BCA"
                />
                <datalist id="detail-bank-options">
                  {BANK_SUGGESTIONS.map((bank) => (
                    <option key={bank} value={bank} />
                  ))}
                </datalist>
              </Field>
              <Field id="detail-account" label="Nomor Rekening">
                <input
                  id="detail-account"
                  type="text"
                  inputMode="numeric"
                  maxLength={30}
                  value={form.bankAccountNumber}
                  onChange={(e) =>
                    setValue('bankAccountNumber', e.target.value.replace(/[^0-9]/g, ''))
                  }
                  className={inputClass}
                />
              </Field>
              <Field id="detail-account-name" label="Atas Nama">
                <input
                  id="detail-account-name"
                  type="text"
                  maxLength={100}
                  value={form.bankAccountName}
                  onChange={(e) => setValue('bankAccountName', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Section>

          <Section title="Kontak Darurat">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="detail-emergency-name" label="Nama">
                <input
                  id="detail-emergency-name"
                  type="text"
                  maxLength={100}
                  value={form.emergencyContactName}
                  onChange={(e) => setValue('emergencyContactName', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field id="detail-emergency-phone" label="Nomor Telepon">
                <input
                  id="detail-emergency-phone"
                  type="tel"
                  maxLength={30}
                  value={form.emergencyContactPhone}
                  onChange={(e) => setValue('emergencyContactPhone', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </Section>

          <Section title="Kompensasi & Slip Gaji" hint="Disimpan lewat tombol Simpan Data">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field
                id="detail-base-salary"
                label="Gaji Pokok (Rp)"
                hint={formatRupiah(Number(form.baseSalary.replace(/[^0-9]/g, '') || 0))}
              >
                <input
                  id="detail-base-salary"
                  type="text"
                  inputMode="numeric"
                  value={formatThousands(form.baseSalary)}
                  onChange={(e) =>
                    setValue('baseSalary', e.target.value.replace(/[^0-9]/g, ''))
                  }
                  className={`${inputClass} font-mono font-bold`}
                />
              </Field>
              <Field
                id="detail-position-allowance"
                label="Tunjangan Jabatan (Rp)"
                hint={formatRupiah(Number(form.positionAllowance.replace(/[^0-9]/g, '') || 0))}
              >
                <input
                  id="detail-position-allowance"
                  type="text"
                  inputMode="numeric"
                  value={formatThousands(form.positionAllowance)}
                  onChange={(e) =>
                    setValue('positionAllowance', e.target.value.replace(/[^0-9]/g, ''))
                  }
                  className={`${inputClass} font-mono font-bold`}
                />
              </Field>
              <Field
                id="detail-meal-allowance"
                label="Tunjangan Makan & Transport (Rp)"
                hint={formatRupiah(
                  Number(form.mealTransportAllowance.replace(/[^0-9]/g, '') || 0)
                )}
              >
                <input
                  id="detail-meal-allowance"
                  type="text"
                  inputMode="numeric"
                  value={formatThousands(form.mealTransportAllowance)}
                  onChange={(e) =>
                    setValue('mealTransportAllowance', e.target.value.replace(/[^0-9]/g, ''))
                  }
                  className={`${inputClass} font-mono font-bold`}
                />
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Kepegawaian & Akun" hint="Tersimpan otomatis">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field id="detail-division" label="Divisi">
                <select
                  id="detail-division"
                  aria-label={`Ubah divisi ${employee.name}`}
                  value={employee.division}
                  disabled={applying !== null}
                  onChange={(e) => handleDivisionChange(e.target.value as Division)}
                  className={selectClass}
                >
                  {(divisions.includes(employee.division)
                    ? divisions
                    : [employee.division, ...divisions]
                  ).map((div) => (
                    <option key={div} value={div}>
                      {div}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="detail-role" label="Peran">
                <select
                  id="detail-role"
                  aria-label={`Ubah peran ${employee.name}`}
                  value={employee.role}
                  disabled={applying !== null}
                  onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                  className={selectClass}
                >
                  <option value="employee">Karyawan</option>
                  <option value="supervisor">Supervisor</option>
                  {employee.division === 'HRD' && <option value="hrd">Admin HRD</option>}
                </select>
              </Field>
              <Field
                id="detail-supervisor"
                label="Atasan Langsung"
                hint={
                  employee.role === 'employee'
                    ? 'Wajib satu divisi; kosong berarti langsung ke HRD.'
                    : `${ROLE_LABELS[employee.role]} tidak memakai atasan langsung.`
                }
              >
                <select
                  id="detail-supervisor"
                  aria-label={`Ubah atasan langsung ${employee.name}`}
                  value={employee.supervisorUid}
                  disabled={employee.role !== 'employee' || applying !== null}
                  onChange={(e) => handleSupervisorChange(e.target.value)}
                  className={`${selectClass} disabled:bg-slate-100 disabled:text-slate-400`}
                >
                  <option value="">Langsung ke HRD</option>
                  {supervisorCandidates.map((sup) => (
                    <option key={sup.uid} value={sup.uid}>
                      {sup.name} — {sup.position}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="detail-shift" label="Shift Kerja">
                <select
                  id="detail-shift"
                  aria-label={`Ubah shift ${employee.name}`}
                  value={employee.shiftCode}
                  disabled={applying !== null}
                  onChange={(e) => handleShiftChange(e.target.value as ShiftCode)}
                  className={selectClass}
                >
                  {allowedShiftCodes.map((code) => (
                    <option key={code} value={code}>
                      {shiftTemplateName(code)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="detail-quota" label="Kuota Izin Tahunan" hint="0 sampai 60 hari.">
                <input
                  id="detail-quota"
                  type="number"
                  min={0}
                  max={60}
                  key={`quota_${employee.uid}_${employee.leaveQuota ?? 12}`}
                  defaultValue={employee.leaveQuota ?? 12}
                  disabled={applying === 'quota'}
                  onBlur={(e) => handleQuotaCommit(e.target.value)}
                  className={`${inputClass} font-bold font-mono`}
                />
              </Field>
              <Field
                id="detail-position"
                label="Jabatan / Posisi"
                hint="Disimpan lewat tombol Simpan Data."
              >
                <input
                  id="detail-position"
                  type="text"
                  maxLength={80}
                  value={form.position}
                  onChange={(e) => setValue('position', e.target.value)}
                  className={inputClass}
                  placeholder="mis. Supervisor Operasional"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span
                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                  employee.active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {employee.active ? 'Akun Aktif' : 'Akun Non-Aktif'}
              </span>
              <span className="text-[11px] text-slate-500">
                {employee.active
                  ? 'Karyawan bisa login dan mengajukan izin.'
                  : 'Karyawan tidak bisa mengajukan izin atau absen.'}
              </span>
            </div>
          </Section>

          <Section title="Dokumen Gambar" hint="Terenkripsi di Firestore">
            <div className="space-y-3">
              {renderUploadRow(
                'photo',
                'Foto Profil',
                'Tampil di kartu karyawan.',
                employee.photoUrl
              )}
              {renderUploadRow('ktp', 'Scan KTP', 'Terbaca jelas, maks. 640 KB.', documents.ktp)}
              {renderUploadRow('kk', 'Scan KK', 'Terbaca jelas, maks. 640 KB.', documents.kk)}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start gap-2">
              <IdCard className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
              <span>
                Gambar diperkecil &amp; dikompres otomatis di peramban sebelum disimpan
                terenkripsi di Firestore. Hanya Admin HRD dan karyawan bersangkutan yang bisa
                membuka dokumen ini.
              </span>
            </p>
          </Section>
        </div>
      </div>

      <div className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-3 flex items-center justify-between gap-3 shadow-lg">
        <p className="hidden sm:block text-[11px] text-slate-500">
          Kartu Kepegawaian &amp; Akun tersimpan otomatis; tombol Simpan Data menyimpan jabatan
          dan data pribadi.
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onBack}
            className="h-10 px-4 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Kembali
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="h-10 px-4 rounded-xl bg-[#0B2453] text-white text-xs font-bold hover:bg-[#163A7A] disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Data'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}


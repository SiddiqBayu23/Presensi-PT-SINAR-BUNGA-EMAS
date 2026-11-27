import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImagePlus, KeyRound, Loader2, Moon, Palette, Save, ShieldCheck, Sun, Trash2, Upload } from 'lucide-react';
import { useHris } from '../context/HrisContext';
import { EMPLOYEE_DOC_MAX_CHARS, compressImageForFirestore } from '../firebase';
import { EDUCATION_LEVELS, GENDERS, MARITAL_STATUSES, ROLE_LABELS } from '../types/hris';
import type { EducationLevel, EmployeeDocumentKind, EmployeeGender, HrdEditableEmployeeFields, MaritalStatus } from '../types/hris';
import { renderSquareAvatar } from '../utils/hrisLogic';
import { ChangePasswordForm } from './ChangePasswordForm';
import { EmployeeAvatar } from './EmployeeAvatar';

/** Mengubah berkas gambar menjadi data URL persegi (crop tengah 1:1) siap simpan. */
async function toSquareAvatarDataUrl(file: File, size = 256): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return renderSquareAvatar(image, size);
  } catch {
    throw new Error('Berkas bukan gambar yang valid.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
const DOCUMENT_IMAGE_MAX_SIDE = 1200;

function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Berkas harus berupa gambar (JPG, PNG, atau WebP).'));
  }
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    return Promise.reject(new Error('Ukuran gambar maksimal 10 MB.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Menu Pengaturan untuk seluruh peran: profil, data pribadi, scan KTP/KK,
 * mode tampilan, dan ubah kata sandi.
 */
export function SettingsView() {
  const {
    currentUser,
    theme,
    setTheme,
    updateEmployeeProfile,
    employeeDocuments,
    saveEmployeeDocument,
    deleteEmployeeDocument,
    resetAllDataKeepAdminOnly,
  } = useHris();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const documentInputRefs: Record<EmployeeDocumentKind, React.RefObject<HTMLInputElement | null>> = {
    ktp: useRef<HTMLInputElement>(null),
    kk: useRef<HTMLInputElement>(null),
  };
  const [busyDocument, setBusyDocument] = useState<EmployeeDocumentKind | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentNotice, setDocumentNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<{
    phone: string;
    address: string;
    fullNameKtp: string;
    birthPlace: string;
    birthDate: string;
    ktpAddress: string;
    gender: EmployeeGender | '';
    motherName: string;
    workRegion: string;
    maritalStatus: MaritalStatus | '';
    childrenCount: number;
    bankName: string;
    bankAccountNumber: string;
    bankAccountName: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    lastEducation: EducationLevel | '';
  }>({
    phone: '',
    address: '',
    fullNameKtp: '',
    birthPlace: '',
    birthDate: '',
    ktpAddress: '',
    gender: '',
    motherName: '',
    workRegion: '',
    maritalStatus: '',
    childrenCount: 0,
    bankName: '',
    bankAccountNumber: '',
    bankAccountName: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    lastEducation: '',
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setProfile({
      phone: currentUser.phone ?? '', address: currentUser.address ?? '',
      fullNameKtp: currentUser.fullNameKtp ?? '', birthPlace: currentUser.birthPlace ?? '',
      birthDate: currentUser.birthDate ?? '', ktpAddress: currentUser.ktpAddress ?? '',
      gender: currentUser.gender ?? '', motherName: currentUser.motherName ?? '',
      workRegion: currentUser.workRegion ?? '', maritalStatus: currentUser.maritalStatus ?? '',
      childrenCount: currentUser.childrenCount ?? 0, bankName: currentUser.bankName ?? '',
      bankAccountNumber: currentUser.bankAccountNumber ?? '', bankAccountName: currentUser.bankAccountName ?? '',
      emergencyContactName: currentUser.emergencyContactName ?? '',
      emergencyContactPhone: currentUser.emergencyContactPhone ?? '', lastEducation: currentUser.lastEducation ?? '',
    });
  }, [currentUser]);

  const updateProfileField = (field: keyof typeof profile, value: string | number) =>
    setProfile((prev) => ({ ...prev, [field]: value }));

  const profileInput = (field: keyof typeof profile, label: string, type = 'text') => (
    <label className="space-y-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type={type}
        value={String(profile[field])}
        onChange={(event) => updateProfileField(field, event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-xs transition-colors placeholder:text-slate-400 focus:border-[#0B2453] focus:outline-none focus:ring-2 focus:ring-[#0B2453]/10"
      />
    </label>
  );

  const handleProfileSave = async () => {
    if (!currentUser) return;
    setProfileBusy(true); setProfileError(null); setProfileNotice(null);
    try {
      await updateEmployeeProfile(currentUser.uid, profile as Partial<HrdEditableEmployeeFields>);
      setProfileNotice('Data pribadi berhasil diperbarui.');
    } catch {
      setProfileError('Gagal memperbarui data pribadi. Periksa koneksi lalu coba lagi.');
    } finally { setProfileBusy(false); }
  };

  if (!currentUser) return null;

  const isHrd = currentUser.role === 'hrd';

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Pilih berkas gambar (JPG, PNG, atau WebP).');
      setPhotoNotice(null);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setPhotoError('Ukuran gambar maksimal 8 MB.');
      setPhotoNotice(null);
      return;
    }

    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoNotice(null);
    try {
      const photoUrl = await toSquareAvatarDataUrl(file, 256);
      await updateEmployeeProfile(currentUser.uid, { photoUrl });
      setPhotoNotice('Foto profil berhasil diperbarui.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Gagal memperbarui foto profil.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = async () => {
    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoNotice(null);
    try {
      await updateEmployeeProfile(currentUser.uid, { photoUrl: '' });
      setPhotoNotice('Foto profil dihapus.');
    } catch {
      setPhotoError('Gagal menghapus foto profil. Periksa koneksi lalu coba lagi.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleDocumentSelected = async (kind: EmployeeDocumentKind, file: File | undefined) => {
    if (!file || busyDocument) return;
    setBusyDocument(kind);
    setDocumentError(null);
    setDocumentNotice(null);
    try {
      const raw = await readImageFile(file);
      const dataUrl = await compressImageForFirestore(raw, {
        maxChars: EMPLOYEE_DOC_MAX_CHARS,
        maxSide: DOCUMENT_IMAGE_MAX_SIDE,
      });
      await saveEmployeeDocument(currentUser.uid, kind, dataUrl);
      setDocumentNotice(kind === 'ktp' ? 'Scan KTP berhasil disimpan.' : 'Scan KK berhasil disimpan.');
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : 'Gagal mengunggah dokumen.');
    } finally {
      setBusyDocument(null);
    }
  };

  const handleDocumentDelete = async (kind: EmployeeDocumentKind) => {
    if (busyDocument) return;
    setBusyDocument(kind);
    setDocumentError(null);
    setDocumentNotice(null);
    try {
      await deleteEmployeeDocument(currentUser.uid, kind);
      setDocumentNotice(kind === 'ktp' ? 'Scan KTP dihapus.' : 'Scan KK dihapus.');
    } catch {
      setDocumentError('Gagal menghapus dokumen. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusyDocument(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
      {/* Kartu Profil */}
      <section
        aria-labelledby="settings-profile-heading"
        className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-[#F8FAFD] p-5 shadow-xs sm:p-6"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
          <h2 id="settings-profile-heading" className="text-base sm:text-lg font-extrabold text-[#0B2453]">
            Profil Akun
          </h2>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <EmployeeAvatar
              name={currentUser.name}
              photoUrl={currentUser.photoUrl}
              className="w-24 h-24"
              textClassName="text-2xl"
            />
            <div className="flex items-center gap-1.5">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handlePhotoSelected(event)}
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                className="h-8 px-2.5 rounded-lg bg-[#0B2453] text-[#F3CA62] text-[11px] font-bold inline-flex items-center gap-1.5 hover:bg-[#132f63] disabled:opacity-60 disabled:cursor-wait transition-colors cursor-pointer"
              >
                {photoBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                <span>{photoBusy ? 'Memproses…' : currentUser.photoUrl ? 'Ganti Foto' : 'Unggah Foto'}</span>
              </button>
              {currentUser.photoUrl && !photoBusy && (
                <button
                  type="button"
                  onClick={() => void handlePhotoRemove()}
                  className="h-8 px-2 rounded-lg border border-slate-300 bg-white text-slate-600 text-[11px] font-bold inline-flex items-center gap-1 hover:border-rose-300 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus</span>
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-500 text-center max-w-[9rem]">
              Foto otomatis dipotong persegi.
            </p>
            {photoError && (
              <p role="alert" className="text-[10px] font-semibold text-rose-600 text-center max-w-[11rem]">
                {photoError}
              </p>
            )}
            {photoNotice && (
              <p role="status" className="text-[10px] font-semibold text-emerald-600 text-center max-w-[11rem]">
                {photoNotice}
              </p>
            )}
          </div>
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-slate-100 bg-white/80 p-4 text-xs shadow-xs sm:text-sm">
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Nama</dt>
              <dd className="font-bold text-slate-900 truncate">{currentUser.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">NIK</dt>
              <dd className="font-mono font-bold text-[#0B2453]">{currentUser.nik}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Jabatan</dt>
              <dd className="font-semibold text-slate-700 truncate">{currentUser.position}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Divisi</dt>
              <dd className="font-semibold text-slate-700">
                {currentUser.division} &bull; {ROLE_LABELS[currentUser.role] ?? currentUser.role}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-extrabold text-[#0B2453] sm:text-lg">Data Pribadi Saya</h2>
            <p className="mt-1 text-xs text-slate-500">Kelola informasi kontak, identitas, keluarga, dan rekening Anda.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleProfileSave()}
            disabled={profileBusy}
            className="h-10 shrink-0 rounded-xl bg-[#0B2453] px-4 text-xs font-bold text-white inline-flex items-center justify-center gap-1.5 transition-colors hover:bg-[#163A7A] disabled:cursor-wait disabled:opacity-60 cursor-pointer"
          >
            {profileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {profileBusy ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </div>
        {(profileError || profileNotice) && (
          <p role={profileError ? 'alert' : 'status'} className={`mt-4 rounded-xl border px-3 py-2 text-xs font-semibold ${profileError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {profileError ?? profileNotice}
          </p>
        )}
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <legend className="px-1 text-xs font-extrabold text-[#0B2453]">Kontak</legend>
            {profileInput('phone', 'Nomor HP', 'tel')}
            {profileInput('address', 'Alamat Domisili')}
            {profileInput('emergencyContactName', 'Nama Kontak Darurat')}
            {profileInput('emergencyContactPhone', 'Telepon Darurat', 'tel')}
          </fieldset>
          <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <legend className="px-1 text-xs font-extrabold text-[#0B2453]">Identitas &amp; Keluarga</legend>
            {profileInput('fullNameKtp', 'Nama Sesuai KTP')}
            <div className="grid grid-cols-2 gap-3">
              {profileInput('birthPlace', 'Tempat Lahir')}
              {profileInput('birthDate', 'Tanggal Lahir', 'date')}
            </div>
            {profileInput('ktpAddress', 'Alamat Sesuai KTP')}
            {profileInput('motherName', 'Nama Ibu Kandung')}
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Jenis Kelamin</span><select value={profile.gender} onChange={(event) => updateProfileField('gender', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none"><option value="">Pilih</option>{GENDERS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Jumlah Anak</span><input type="number" min={0} max={20} value={profile.childrenCount} onChange={(event) => updateProfileField('childrenCount', Number(event.target.value))} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none" /></label>
            </div>
          </fieldset>
          <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <legend className="px-1 text-xs font-extrabold text-[#0B2453]">Kerja &amp; Rekening</legend>
            {profileInput('workRegion', 'Wilayah Kerja')}
            <label className="space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status Pernikahan</span><select value={profile.maritalStatus} onChange={(event) => updateProfileField('maritalStatus', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none"><option value="">Pilih</option>{MARITAL_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pendidikan Terakhir</span><select value={profile.lastEducation} onChange={(event) => updateProfileField('lastEducation', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-[#0B2453] focus:outline-none"><option value="">Pilih</option>{EDUCATION_LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            {profileInput('bankName', 'Nama Bank')}
            {profileInput('bankAccountNumber', 'Nomor Rekening')}
            {profileInput('bankAccountName', 'Nama Pemilik Rekening')}
          </fieldset>
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex items-center gap-2.5">
          <ImagePlus className="w-5 h-5 text-[#C69214]" />
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453]">Dokumen Identitas</h2>
            <p className="text-xs text-slate-500 mt-1">Unggah scan atau foto KTP dan Kartu Keluarga milik Anda.</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">JPG, PNG, atau WebP; maksimal 10 MB. Dokumen dikompres sebelum disimpan dan hanya dapat diakses oleh Anda serta Admin HRD.</p>
        {documentError && <p role="alert" className="text-xs font-semibold text-rose-600">{documentError}</p>}
        {documentNotice && <p role="status" className="text-xs font-semibold text-emerald-600">{documentNotice}</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(['ktp', 'kk'] as const).map((kind) => {
            const dataUrl = employeeDocuments[currentUser.uid]?.[kind];
            const title = kind === 'ktp' ? 'Kartu Tanda Penduduk (KTP)' : 'Kartu Keluarga (KK)';
            const busy = busyDocument === kind;
            return (
              <article key={kind} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition-shadow hover:shadow-sm">
                {dataUrl ? (
                  <img src={dataUrl} alt={`Scan ${title}`} className="h-52 w-full object-contain bg-slate-100" />
                ) : (
                  <div className="h-52 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <ImagePlus className="w-8 h-8" />
                    <span className="text-xs font-semibold">Belum diunggah</span>
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <h3 className="text-xs font-extrabold text-[#0B2453]">{title}</h3>
                  <input ref={documentInputRefs[kind]} type="file" accept="image/*" className="hidden"
                    onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void handleDocumentSelected(kind, file); }} />
                  <div className="flex gap-2">
                    <button type="button" disabled={busyDocument !== null} onClick={() => documentInputRefs[kind].current?.click()}
                      className="h-8 px-2.5 rounded-lg bg-[#0B2453] text-[#F3CA62] text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-60 cursor-pointer">
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {busy ? 'Memproses…' : dataUrl ? 'Ganti' : 'Unggah'}
                    </button>
                    {dataUrl && !busy && <button type="button" onClick={() => void handleDocumentDelete(kind)} className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-slate-600 text-[11px] font-bold inline-flex items-center gap-1 hover:border-rose-300 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Hapus</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Mode Tampilan */}
      <section
        aria-labelledby="settings-theme-heading"
        className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <Palette className="w-5 h-5 text-[#C69214]" />
          <h2 id="settings-theme-heading" className="text-base sm:text-lg font-extrabold text-[#0B2453]">
            Mode Tampilan
          </h2>
        </div>
        <p className="text-xs text-slate-600">
          Pilih tema terang atau gelap. Pilihan disimpan di perangkat ini dan langsung berlaku.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
            className={`h-14 px-4 rounded-2xl border-2 text-sm font-extrabold inline-flex items-center gap-3 transition-colors cursor-pointer ${
              theme === 'light'
                ? 'border-[#C69214] bg-[#FFFBEB] text-[#0B2453]'
                : 'border-slate-200 bg-[#F9FBFE] text-slate-600 hover:border-slate-300'
            }`}
          >
            <Sun className="w-5 h-5 text-[#C69214]" />
            <span>Terang (Light)</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={`h-14 px-4 rounded-2xl border-2 text-sm font-extrabold inline-flex items-center gap-3 transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'border-[#C69214] bg-[#FFFBEB] text-[#0B2453]'
                : 'border-slate-200 bg-[#F9FBFE] text-slate-600 hover:border-slate-300'
            }`}
          >
            <Moon className={`w-5 h-5 ${theme === 'dark' ? 'text-[#C69214]' : 'text-slate-500'}`} />
            <span>Gelap (Dark)</span>
          </button>
        </div>
      </section>

      {/* Ubah Kata Sandi */}
      <section
        aria-labelledby="settings-password-heading"
        className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <KeyRound className="w-5 h-5 text-[#0B2453]" />
          <h2
            id="settings-password-heading"
            className="text-base sm:text-lg font-extrabold text-[#0B2453]"
          >
            Ubah Kata Sandi
          </h2>
        </div>
        <p className="text-xs text-slate-600">
          Gunakan minimal 6 karakter. Setelah disimpan, sesi lain otomatis keluar.
        </p>
        <div className="max-w-none sm:max-w-xl">
          <ChangePasswordForm />
        </div>
      </section>

      {isHrd && (
        <section className="rounded-3xl bg-[#F9FBFE] p-5 sm:p-6 border border-slate-200/80 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">
            <strong className="text-[#0B2453]">Reset sandi karyawan:</strong> buka menu{' '}
            <em>Panel HRD &rarr; Data Karyawan</em> lalu tekan tombol <strong>Reset Sandi</strong> pada
            baris karyawan yang lupa kata sandinya. Kata sandi akan dikembalikan ke bawaan{' '}
            <span className="font-mono font-bold">090909</span>.
          </p>
        </section>
      )}

      {isHrd && (
        <section className="rounded-3xl bg-rose-50/20 p-5 sm:p-6 border border-rose-200 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h2 className="text-sm sm:text-base font-extrabold text-rose-800">
                Mulai Ulang dari Awal (Sisakan Admin Saja)
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Menghapus seluruh data karyawan non-admin, divisi, aturan shift, presensi, izin,
                lembur, tukar shift, exit clearance, jadwal kerja, komponen gaji, serta todo list.
                Hanya akun Admin HRD Anda yang tersisa.
              </p>
            </div>
          </div>
          {(resetError || resetNotice) && (
            <p
              role={resetError ? 'alert' : 'status'}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                resetError
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {resetError ?? resetNotice}
            </p>
          )}
          <button
            type="button"
            disabled={resetBusy}
            onClick={async () => {
              const confirmed = window.confirm(
                'HAPUS SEMUA DATA aplikasi (divisi, shift, karyawan lain, presensi, pengajuan, jadwal, komponen gaji, dan todo list) dan sisakan Admin saja?\n\nTindakan ini tidak dapat dibatalkan.'
              );
              if (!confirmed) return;
              setResetBusy(true);
              setResetError(null);
              setResetNotice(null);
              const res = await resetAllDataKeepAdminOnly();
              setResetBusy(false);
              if (!res.ok) {
                setResetError(res.error ?? 'Sebagian data gagal dihapus.');
              } else {
                setResetNotice(
                  `Semua data berhasil dihapus (${res.deletedDocs} dokumen Firestore dibersihkan). Aplikasi kini dimulai bersih hanya dengan akun Admin.`
                );
              }
            }}
            className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {resetBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>{resetBusy ? 'Menghapus Semua Data...' : 'Hapus Semua Data (Sisakan Admin)'}</span>
          </button>
        </section>
      )}
    </div>
  );
}

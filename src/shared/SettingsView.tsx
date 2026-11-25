import React, { useRef, useState } from 'react';
import { Camera, KeyRound, Loader2, Moon, Palette, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { useHris } from '../context/HrisContext';
import { renderSquareAvatar } from '../utils/hrisLogic';
import { ChangePasswordForm } from './ChangePasswordForm';
import { EmployeeAvatar } from './EmployeeAvatar';

const ROLE_LABELS: Record<string, string> = {
  hrd: 'Admin HRD',
  supervisor: 'Supervisor',
  employee: 'Karyawan',
};

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

/**
 * Menu Pengaturan untuk seluruh peran: foto profil persegi, mode tampilan
 * (terang/gelap), dan ubah kata sandi. Admin HRD melihat catatan bahwa reset
 * sandi karyawan ada di Panel HRD → Data Karyawan.
 */
export function SettingsView() {
  const { currentUser, theme, setTheme, updateEmployeeProfile } = useHris();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);

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

  return (
    <div className="space-y-5">
      {/* Kartu Profil */}
      <section
        aria-labelledby="settings-profile-heading"
        className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
          <h2 id="settings-profile-heading" className="text-base sm:text-lg font-extrabold text-[#0B2453]">
            Profil Akun
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
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
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs sm:text-sm min-w-0 flex-1">
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

      {/* Mode Tampilan */}
      <section
        aria-labelledby="settings-theme-heading"
        className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
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
            <Moon className="w-5 h-5 text-[#0B2453]" />
            <span>Gelap (Dark)</span>
          </button>
        </div>
      </section>

      {/* Ubah Kata Sandi */}
      <section
        aria-labelledby="settings-password-heading"
        className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4"
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
        <div className="max-w-xl">
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
    </div>
  );
}

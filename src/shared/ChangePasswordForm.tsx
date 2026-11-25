import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useHris } from '../context/HrisContext';

interface ChangePasswordFormProps {
  /** Dipanggil setelah kata sandi berhasil diperbarui (setelah pesan sukses tampil). */
  onSuccess?: () => void;
  /** Bila diisi, tombol "Batal" ditampilkan dan memanggil callback ini. */
  onCancel?: () => void;
  submitLabel?: string;
}

/**
 * Form ubah kata sandi untuk semua peran. Sesi Firebase sudah terautentikasi,
 * jadi cukup kata sandi baru.
 */
export function ChangePasswordForm({
  onSuccess,
  onCancel,
  submitLabel = 'Simpan Sandi',
}: ChangePasswordFormProps) {
  const { changePassword } = useHris();
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const resetFeedback = () => {
    setPwdError(null);
    setPwdSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (newPwd !== confirmPwd) {
      setPwdError('Konfirmasi kata sandi baru tidak sama.');
      return;
    }
    setSavingPwd(true);
    const res = await changePassword(newPwd);
    setSavingPwd(false);
    if (!res.ok) {
      setPwdError(res.error);
      return;
    }
    setPwdSuccess(true);
    setNewPwd('');
    setConfirmPwd('');
    window.setTimeout(() => {
      setPwdSuccess(false);
      onSuccess?.();
    }, 1000);
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {pwdError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-700">
          {pwdError}
        </div>
      )}
      {pwdSuccess && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Kata sandi berhasil diperbarui!</span>
        </div>
      )}

      <div>
        <label htmlFor="new-pwd" className="block text-xs font-bold text-[#0B2453] mb-1">
          Kata Sandi Baru
        </label>
        <input
          id="new-pwd"
          type="password"
          required
          minLength={6}
          value={newPwd}
          onChange={(e) => {
            setNewPwd(e.target.value);
            resetFeedback();
          }}
          placeholder="Minimal 6 karakter"
          className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="confirm-pwd" className="block text-xs font-bold text-[#0B2453] mb-1">
          Konfirmasi Kata Sandi Baru
        </label>
        <input
          id="confirm-pwd"
          type="password"
          required
          minLength={6}
          value={confirmPwd}
          onChange={(e) => {
            setConfirmPwd(e.target.value);
            resetFeedback();
          }}
          placeholder="Ulangi kata sandi baru"
          className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
        />
      </div>

      <div className="flex justify-end gap-2.5 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
        )}
        <button
          type="submit"
          disabled={savingPwd}
          className="h-11 px-5 rounded-xl bg-[#0B2453] text-white text-sm font-bold hover:bg-[#143470] disabled:opacity-60 cursor-pointer"
        >
          {savingPwd ? 'Menyimpan...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import { SbumFullLogo } from './SbumLogo';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

type LoginMode = 'form' | 'reset';

/**
 * Login satu pintu: Firebase Auth (email + kata sandi atau Google).
 * Akun karyawan dibuat Admin HRD lewat menu Data Karyawan, bukan didaftarkan sendiri.
 */
export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const {
    firebaseUser,
    needsEmailVerification,
    loginWithEmail,
    loginWithGoogle,
    sendResetPassword,
    resendVerificationEmail,
    refreshAuthUser,
  } = useHris();

  const [mode, setMode] = useState<LoginMode>('form');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setError(null);
    setInfoMsg(null);
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    if (!identifier.trim() || !password) {
      setError('Masukkan email dan kata sandi Anda.');
      return;
    }
    setSubmitting(true);
    const res = await loginWithEmail(identifier, password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPassword('');
    onLoginSuccess();
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setInfoMsg(null);
    setSubmitting(true);
    const res = await loginWithGoogle();
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    if (!identifier.trim()) {
      setError('Masukkan email akun Anda.');
      return;
    }
    setSubmitting(true);
    const res = await sendResetPassword(identifier);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInfoMsg(`Tautan reset kata sandi dikirim ke ${identifier.trim()}. Periksa kotak masuk email.`);
  };

  const handleResendVerification = async () => {
    setError(null);
    setInfoMsg(null);
    setResending(true);
    const res = await resendVerificationEmail();
    setResending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInfoMsg('Email verifikasi dikirim ulang. Klik tautannya, lalu tekan "Saya sudah verifikasi".');
  };

  const handleRefreshVerification = async () => {
    setError(null);
    setInfoMsg(null);
    setRefreshing(true);
    const res = await refreshAuthUser();
    setRefreshing(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!res.verified) {
      setError('Email belum diverifikasi. Buka tautan di email Anda terlebih dahulu.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F7FB] flex items-center justify-center p-3 sm:p-6 lg:p-8 selection:bg-[#0B2453] selection:text-white">
      <main className="w-full max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
          {/* Brand panel */}
          <section className="lg:col-span-7 rounded-3xl bg-gradient-to-br from-[#0B2453] via-[#12305F] to-[#0B2453] text-white p-7 sm:p-9 flex flex-col justify-between gap-8 shadow-xl">
            <div className="space-y-5">
              <SbumFullLogo className="items-start" />
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight">
                  Absensi &amp; HRIS Terpadu
                </h1>
                <p className="text-sm text-white/70 max-w-md">
                  Presensi GPS + kamera live ber-watermark, QR pos/area, dan pengelolaan HR
                  dalam satu aplikasi untuk PT Sinar Bunga Mas.
                </p>
              </div>
            </div>

            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-[#C69214] shrink-0" />
                <span className="text-white/80">Data karyawan &amp; absensi terpusat di Firebase.</span>
              </li>
              <li className="flex items-start gap-3">
                <KeyRound className="w-4 h-4 mt-0.5 text-[#C69214] shrink-0" />
                <span className="text-white/80">Satu akun email untuk Admin HRD, Supervisor, dan Karyawan.</span>
              </li>
              <li className="flex items-start gap-3">
                <Zap className="w-4 h-4 mt-0.5 text-[#C69214] shrink-0" />
                <span className="text-white/80">Pengajuan izin, lembur, dan tukar shift langsung disetujui atasan.</span>
              </li>
            </ul>

            <div className="text-[11px] text-white/40">
              PT Sinar Bunga Mas &bull; One Stop Business Services
            </div>
          </section>

          {/* Auth card */}
          <section className="lg:col-span-5 rounded-3xl bg-white p-6 sm:p-8 shadow-xl border border-slate-100 flex flex-col">
            {needsEmailVerification && firebaseUser ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-amber-700" />
                  </div>
                  <div>
                    <h2 className="text-lg font-extrabold text-[#0B2453]">Verifikasi Email</h2>
                    <p className="text-xs text-slate-500 truncate max-w-[220px]">{firebaseUser.email}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Akun Anda terdaftar. Buka tautan verifikasi yang dikirim ke email tersebut,
                  lalu tekan tombol di bawah untuk masuk.
                </p>
                {error && <Banner tone="error" text={error} />}
                {infoMsg && <Banner tone="info" text={infoMsg} />}
                <button
                  type="button"
                  onClick={() => void handleRefreshVerification()}
                  disabled={refreshing}
                  className="w-full h-11 rounded-xl bg-[#0B2453] text-white text-sm font-bold hover:bg-[#143470] disabled:opacity-60 cursor-pointer"
                >
                  {refreshing ? 'Memeriksa...' : 'Saya sudah verifikasi'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  disabled={resending}
                  className="w-full h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${resending ? 'animate-spin' : ''}`} />
                  {resending ? 'Mengirim...' : 'Kirim ulang email verifikasi'}
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-extrabold text-[#0B2453]">
                    {mode === 'form' ? 'Masuk Aplikasi' : 'Lupa Kata Sandi'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {mode === 'form'
                      ? 'Gunakan email dan kata sandi akun Anda'
                      : 'Kami akan mengirim tautan reset ke email Anda'}
                  </p>
                </div>

                {error && <Banner tone="error" text={error} />}
                {infoMsg && <Banner tone="info" text={infoMsg} />}

                <form
                  onSubmit={(e) => void (mode === 'form' ? handleEmailLogin(e) : handleResetPassword(e))}
                  className="space-y-4"
                >
                  <div>
                    <label htmlFor="login-email" className="block text-xs font-bold text-[#0B2453] mb-1">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="login-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="nama@sinarbungamas.co.id"
                        className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
                      />
                    </div>
                  </div>

                  {mode === 'form' && (
                    <div>
                      <label htmlFor="login-password" className="block text-xs font-bold text-[#0B2453] mb-1">
                        Kata Sandi
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="login-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Kata sandi Anda"
                          className="w-full h-11 rounded-xl border border-slate-200 pl-10 pr-11 text-sm focus:border-[#0B2453] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-11 rounded-xl bg-[#0B2453] text-white text-sm font-bold hover:bg-[#143470] disabled:opacity-60 cursor-pointer"
                  >
                    {submitting
                      ? 'Memproses...'
                      : mode === 'form'
                        ? 'Masuk'
                        : 'Kirim Tautan Reset'}
                  </button>
                </form>

                {mode === 'form' ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="h-px bg-slate-100 flex-1" />
                      <span className="text-[11px] font-semibold text-slate-400">atau</span>
                      <div className="h-px bg-slate-100 flex-1" />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleGoogleLogin()}
                      disabled={submitting}
                      className="w-full h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <GoogleGlyph />
                      Masuk dengan Google
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="w-full text-xs font-semibold text-[#0B2453] hover:underline cursor-pointer"
                    >
                      Lupa kata sandi?
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchMode('form')}
                    className="w-full text-xs font-semibold text-[#0B2453] hover:underline cursor-pointer"
                  >
                    Kembali ke halaman masuk
                  </button>
                )}

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                  Belum punya akun? Minta Admin HRD membuatkannya lewat menu{' '}
                  <strong className="text-slate-600">Data Karyawan</strong>.
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Banner({ tone, text }: { tone: 'error' | 'info'; text: string }) {
  const isError = tone === 'error';
  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 text-xs font-semibold flex items-start gap-2 ${
        isError
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}
    >
      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isError ? 'hidden' : ''}`} />
      <span>{text}</span>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.4 21.4 7.4 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}
import React, { useState } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  DoorOpen,
  Eye,
  EyeOff,
  History,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { Division, LoginIntent, ShiftCode } from '../types/hris';
import { SbumFullLogo } from './SbumLogo';

interface LoginViewProps {
  onLoginSuccess: (intent: LoginIntent) => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const {
    firebaseUser,
    needsEmailVerification,
    loginWithEmail,
    loginAsAdmin,
    registerWithEmail,
    loginWithGoogle,
    sendResetPassword,
    resendVerificationEmail,
    refreshAuthUser,
    logout,
    wibNow,
  } = useHris();

  const [loginMode, setLoginMode] = useState<'employee' | 'admin'>('employee');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [intent, setIntent] = useState<LoginIntent>('none');
  const [intentBanner, setIntentBanner] = useState<string | null>(null);

  // Simple Email Registration Modal ("Daftar Karyawan Baru pakai Email")
  const [showRegister, setShowRegister] = useState(false);
  const [regForm, setRegForm] = useState({
    email: '',
    name: '',
    password: '',
    division: 'Operasional' as Division,
    shiftCode: 'REGULER' as ShiftCode,
  });
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);

  const handleQuickTile = (selectedIntent: LoginIntent, label: string) => {
    setIntent(selectedIntent);
    setIntentBanner(`Silakan masuk terlebih dahulu untuk membuka menu ${label}.`);
    const emailInput = document.getElementById('login-email-input');
    emailInput?.focus();
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);
    const trimmedIdentifier = email.trim();
    if (!trimmedIdentifier || !password) {
      setError(
        loginMode === 'admin'
          ? 'Masukkan username dan kata sandi admin.'
          : 'Masukkan email / username dan kata sandi Anda.'
      );
      return;
    }

    setSubmitting(true);
    const useAdminAuth = loginMode === 'admin' || !trimmedIdentifier.includes('@');
    const res = useAdminAuth
      ? await loginAsAdmin(trimmedIdentifier, password)
      : await loginWithEmail(trimmedIdentifier, password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLoginSuccess(useAdminAuth ? 'none' : intent);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMsg(null);
    setSubmitting(true);
    const res = await loginWithGoogle();
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLoginSuccess(intent);
  };

  const handleResetPassword = async () => {
    setError(null);
    setInfoMsg(null);
    const res = await sendResetPassword(email);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInfoMsg(`Tautan reset kata sandi telah dikirim ke ${email.trim()}. Periksa kotak masuk Anda.`);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);
    setRegSubmitting(true);
    const res = await registerWithEmail(regForm);
    setRegSubmitting(false);
    if (!res.ok) {
      setRegError(res.error);
      return;
    }
    setEmail(regForm.email.trim());
    setRegSuccess(
      'Akun berhasil dibuat! Link verifikasi telah dikirim ke email Anda. Klik link tersebut lalu tekan "Saya Sudah Verifikasi".'
    );
    window.setTimeout(() => {
      setShowRegister(false);
      setRegSuccess(null);
    }, 1200);
  };

  const handleCheckVerified = async () => {
    setError(null);
    setInfoMsg(null);
    setSubmitting(true);
    const res = await refreshAuthUser();
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!res.verified) {
      setError('Email belum terverifikasi. Buka inbox/spam email Anda dan klik tautan verifikasi terlebih dahulu.');
    } else {
      onLoginSuccess(intent);
    }
  };

  const handleResendVerification = async () => {
    setError(null);
    setInfoMsg(null);
    const res = await resendVerificationEmail();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInfoMsg('Email verifikasi baru telah dikirim ulang. Periksa folder Inbox atau Spam Anda.');
  };

  const quickTiles: Array<{
    key: LoginIntent;
    title: string;
    subtitle: string;
    variant: 'navy' | 'gold';
    icon: React.ReactNode;
  }> = [
    {
      key: 'clock-in',
      title: 'Absen\nMasuk',
      subtitle: 'Absen Masuk',
      variant: 'navy',
      icon: <Camera className="w-6 h-6 text-slate-100" />,
    },
    {
      key: 'clock-out',
      title: 'Absen\nPulang',
      subtitle: 'Absen Pulang',
      variant: 'gold',
      icon: <DoorOpen className="w-6 h-6 text-amber-50" />,
    },
    {
      key: 'history',
      title: 'Riwayat\nAbsensi',
      subtitle: 'Riwayat Absensi',
      variant: 'navy',
      icon: <History className="w-6 h-6 text-sky-200" />,
    },
    {
      key: 'profile',
      title: 'Profil\nKaryawan',
      subtitle: 'Profil Karyawan',
      variant: 'gold',
      icon: <User className="w-6 h-6 text-amber-50" />,
    },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#F4F7FB] flex flex-col justify-center">
      {/* Top-Left Signature Navy & Gold Curved Corner */}
      <svg
        aria-hidden="true"
        viewBox="0 0 260 150"
        className="pointer-events-none fixed top-0 left-0 w-32 sm:w-52 lg:w-72 h-auto z-0"
      >
        <path d="M0,0 L215,0 C175,78 96,122 0,136 Z" fill="#0B2250" />
        <path
          d="M215,0 C175,78 96,122 0,136"
          fill="none"
          stroke="#D4A017"
          strokeWidth="7"
        />
      </svg>

      {/* Bottom-Right Signature Navy & Gold Curved Corner */}
      <svg
        aria-hidden="true"
        viewBox="0 0 260 150"
        className="pointer-events-none fixed bottom-0 right-0 w-32 sm:w-52 lg:w-72 h-auto z-0"
      >
        <path d="M260,150 L45,150 C85,72 164,28 260,14 Z" fill="#0B2250" />
        <path
          d="M45,150 C85,72 164,28 260,14"
          fill="none"
          stroke="#D4A017"
          strokeWidth="7"
        />
      </svg>

      <main className="relative z-10 w-full max-w-md lg:max-w-5xl mx-auto px-4 pt-11 pb-8 sm:py-10 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-10 items-center">
          {/* Left / Top Brand & Quick Features Column */}
          <div className="lg:col-span-6 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="w-full flex flex-col items-center lg:items-start">
              <SbumFullLogo />

              <div className="mt-2 flex flex-col items-center lg:items-start gap-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 shadow-sm border border-slate-200/80 text-[#0B2453] text-xs sm:text-sm font-bold">
                  <Calendar className="w-4 h-4 text-[#C69214]" />
                  <span>Aplikasi Absensi &amp; HRIS</span>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full bg-[#0F244D] px-4 py-1.5 text-white text-xs font-semibold shadow-sm tabular-nums">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                  <span>Server Live WIB ({wibNow.timeShort})</span>
                </div>
              </div>
            </div>

            {/* 4 Quick Feature Tiles */}
            <div className="mt-5 w-full grid grid-cols-4 gap-2.5 sm:gap-3">
              {quickTiles.map((tile) => {
                const isSelected = intent === tile.key;
                return (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => handleQuickTile(tile.key, tile.subtitle)}
                    className={`group flex flex-col items-center justify-center rounded-2xl px-2 py-3.5 sm:py-4 text-center shadow-md transition-transform duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B2453] min-h-[88px] cursor-pointer ${
                      tile.variant === 'navy'
                        ? 'bg-gradient-to-b from-[#163675] to-[#0A1E47] text-white hover:brightness-110'
                        : 'bg-gradient-to-b from-[#D4A424] to-[#AA7B0E] text-white hover:brightness-105'
                    } ${isSelected ? 'ring-2 ring-offset-2 ring-[#0B2453]' : ''}`}
                  >
                    <div className="mb-1.5 flex items-center justify-center">{tile.icon}</div>
                    <span className="text-[11px] sm:text-xs font-bold leading-tight whitespace-pre-line">
                      {tile.title}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Desktop Security Rules Notice Box (no QR/barcode) */}
            <div className="hidden lg:block mt-5 w-full rounded-2xl bg-[#FFFBEB] border border-[#F5D686] px-4 py-3.5 text-xs text-[#784B08] leading-relaxed shadow-xs">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-[#B47A08] shrink-0 mt-0.5" />
                <p>
                  <strong className="font-bold">Aturan Keamanan:</strong> Aktifkan Lokasi/GPS &amp;
                  izin Kamera &bull; Foto wajib <strong className="font-bold">Kamera Live</strong>{' '}
                  ber-watermark GPS Timestamp &bull; Seluruh data kehadiran &amp; HRIS tersimpan
                  aman di Cloud Firebase.
                </p>
              </div>
            </div>
          </div>

          {/* Right / Bottom Login or Email Verification Card */}
          <div className="lg:col-span-6 w-full">
            {needsEmailVerification && firebaseUser ? (
              <section
                aria-labelledby="verify-email-heading"
                className="rounded-3xl bg-white p-6 sm:p-7 shadow-[0_8px_30px_rgba(11,36,83,0.08)] border border-slate-200/70 space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
                  <h1 id="verify-email-heading" className="text-base sm:text-lg font-extrabold text-[#0B2453]">
                    Verifikasi Email Karyawan
                  </h1>
                </div>

                <div className="rounded-2xl bg-[#EEF4FF] border border-[#C7DAFF] p-4 text-xs sm:text-sm text-[#0B2453] space-y-1.5">
                  <div className="font-bold flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#C69214] shrink-0" />
                    <span>{firebaseUser.email}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Kami telah mengirim tautan verifikasi ke email di atas. Klik link verifikasi di
                    kotak masuk Anda, lalu tekan tombol di bawah untuk langsung masuk ke aplikasi.
                  </p>
                </div>

                {error && (
                  <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-700">
                    {error}
                  </div>
                )}
                {infoMsg && (
                  <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                    {infoMsg}
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCheckVerified}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-[#0B2453] to-[#163A7A] text-white text-sm font-bold shadow-md hover:brightness-110 disabled:opacity-60 inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
                    <span>Saya Sudah Verifikasi — Masuk</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      className="h-11 rounded-xl border border-slate-200 hover:bg-slate-50 text-[#0B2453] text-xs font-bold cursor-pointer"
                    >
                      Kirim Ulang Email
                    </button>
                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="h-11 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                    >
                      Ganti Akun
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section
                aria-labelledby="login-heading"
                className="rounded-3xl bg-white p-5 sm:p-7 shadow-[0_8px_30px_rgba(11,36,83,0.08)] border border-slate-200/70"
              >
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1 h-5 rounded-full bg-[#C69214]" aria-hidden="true" />
                    <h1 id="login-heading" className="text-base sm:text-lg font-extrabold text-[#0B2453]">
                      {loginMode === 'admin' ? 'Masuk Beranda Admin' : 'Masuk Akun Karyawan'}
                    </h1>
                  </div>
                </div>

                {/* Mode Switch: Karyawan vs Admin */}
                <div
                  role="tablist"
                  aria-label="Pilih mode masuk"
                  className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-100 p-1 mb-4"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMode === 'employee'}
                    onClick={() => {
                      setLoginMode('employee');
                      setError(null);
                      setInfoMsg(null);
                    }}
                    className={`h-10 rounded-xl text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                      loginMode === 'employee'
                        ? 'bg-white text-[#0B2453] shadow-xs'
                        : 'text-slate-600 hover:text-[#0B2453]'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Masuk Karyawan</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={loginMode === 'admin'}
                    onClick={() => {
                      setLoginMode('admin');
                      setError(null);
                      setInfoMsg(null);
                    }}
                    className={`h-10 rounded-xl text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                      loginMode === 'admin'
                        ? 'bg-[#0B2453] text-[#F4CE6A] shadow-xs'
                        : 'text-slate-600 hover:text-[#0B2453]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Login Admin</span>
                  </button>
                </div>

                {intentBanner && loginMode === 'employee' && (
                  <div
                    role="status"
                    className="mb-4 rounded-xl bg-[#EEF4FF] border border-[#C7DAFF] px-3.5 py-2.5 text-xs font-medium text-[#0B2453] flex items-center justify-between gap-2"
                  >
                    <span>{intentBanner}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIntent('none');
                        setIntentBanner(null);
                      }}
                      aria-label="Tutup pemberitahuan"
                      className="text-slate-500 hover:text-slate-800 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-700 leading-relaxed"
                  >
                    {error}
                  </div>
                )}

                {infoMsg && (
                  <div
                    role="status"
                    className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-semibold text-emerald-800"
                  >
                    {infoMsg}
                  </div>
                )}

                {loginMode === 'employee' ? (
                  <>
                    {/* Instant One-Click Google Sign-In / Registration */}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleGoogleSignIn}
                      className="w-full h-12 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold shadow-xs transition-all inline-flex items-center justify-center gap-2.5 disabled:opacity-60 cursor-pointer"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.29A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.56.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1c.95-2.84 3.6-4.95 6.72-4.95z"
                        />
                      </svg>
                      <span>Masuk / Daftar Cepat dengan Google</span>
                    </button>

                    <div className="my-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[11px] font-semibold text-slate-400">
                        atau masuk pakai email / admin
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                  </>
                ) : (
                  <div className="mb-4 rounded-2xl bg-[#EEF4FF] border border-[#C7DAFF] px-3.5 py-2.5 text-xs text-[#0B2453] flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#C69214] shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      Masuk dengan kredensial <strong>Administrator HRIS</strong> untuk membuka{' '}
                      <strong>Beranda Admin</strong>, kelola data karyawan, persetujuan cepat, dan
                      rekap laporan.
                    </p>
                  </div>
                )}

                <form onSubmit={handleEmailLogin} className="space-y-3.5" noValidate>
                  <div>
                    <label
                      htmlFor="login-email-input"
                      className="block text-xs sm:text-sm font-bold text-[#0B2453] mb-1.5"
                    >
                      {loginMode === 'admin' ? 'Username Admin' : 'Email / Username Admin'}
                    </label>
                    <input
                      id="login-email-input"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={
                        loginMode === 'admin'
                          ? 'Masukkan username admin'
                          : 'nama@email.com atau username admin'
                      }
                      autoComplete="username"
                      className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50/40 px-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#0B2453] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2453]/15 transition-colors"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="login-password-input"
                        className="block text-xs sm:text-sm font-bold text-[#0B2453]"
                      >
                        {loginMode === 'admin' ? 'Kata Sandi Admin' : 'Kata Sandi'}
                      </label>
                      {loginMode === 'employee' && (
                        <button
                          type="button"
                          onClick={handleResetPassword}
                          className="text-[11px] font-bold text-[#B6810C] hover:text-[#0B2453] cursor-pointer"
                        >
                          Lupa Sandi?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="login-password-input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          loginMode === 'admin'
                            ? 'Masukkan kata sandi admin'
                            : 'Masukkan kata sandi Anda'
                        }
                        autoComplete="current-password"
                        className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50/40 pl-4 pr-12 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#0B2453] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2453]/15 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0B2453] transition-colors cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className={`w-full h-12 rounded-xl text-white text-sm font-bold shadow-md hover:brightness-110 active:scale-[0.99] disabled:opacity-60 transition-all inline-flex items-center justify-center gap-2 cursor-pointer ${
                      loginMode === 'admin'
                        ? 'bg-gradient-to-r from-[#0B2453] via-[#133575] to-[#0B2453] border border-[#C69214]/40'
                        : 'bg-gradient-to-r from-[#0B2453] via-[#143470] to-[#0E295E]'
                    }`}
                  >
                    {loginMode === 'admin' && <ShieldCheck className="w-4 h-4 text-[#F4CE6A]" />}
                    <span>
                      {submitting
                        ? 'Memproses...'
                        : loginMode === 'admin'
                          ? 'Masuk Beranda Admin'
                          : 'Masuk Aplikasi SBM'}
                    </span>
                  </button>
                </form>

                {loginMode === 'employee' && (
                  <div className="mt-4 pt-3.5 border-t border-slate-100 text-center">
                    <p className="text-xs text-slate-500 mb-2.5">Karyawan baru belum punya akun?</p>
                    <button
                      type="button"
                      onClick={() => {
                        setRegError(null);
                        setRegSuccess(null);
                        setShowRegister(true);
                      }}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-[#D4A424] via-[#C39014] to-[#A6780C] text-white text-xs sm:text-sm font-bold shadow-md hover:brightness-105 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4 shrink-0" />
                      <span>Daftar Karyawan Baru (Pakai Email)</span>
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Mobile Security Rules Notice Box (no QR/barcode) */}
            <div className="lg:hidden mt-4 rounded-2xl bg-[#FFFBEB] border border-[#F5D686] px-4 py-3 text-xs text-[#784B08] leading-relaxed shadow-xs">
              <strong className="font-bold">Aturan Keamanan:</strong> Aktifkan Lokasi/GPS &amp;
              izin Kamera &bull; Foto wajib <strong className="font-bold">Kamera Live</strong>{' '}
              ber-watermark GPS Timestamp &bull; Data tersimpan aman di Firebase.
            </div>
          </div>
        </div>
      </main>

      {/* Simple Email Registration Modal ("Daftar Karyawan Baru pakai Email") */}
      {showRegister && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-modal-title"
        >
          <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0B2453] px-5 py-4 text-white border-b-2 border-[#C69214]">
              <div>
                <h2 id="register-modal-title" className="text-base font-bold">
                  Daftar Karyawan Baru
                </h2>
                <p className="text-xs text-amber-200">Cukup pakai email aktif — cepat &amp; praktis</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegister(false)}
                aria-label="Tutup formulir pendaftaran"
                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="p-5 space-y-3.5">
              {regError && (
                <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-semibold text-red-700 leading-relaxed">
                  {regError}
                </div>
              )}
              {regSuccess && (
                <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{regSuccess}</span>
                </div>
              )}

              <div>
                <label htmlFor="reg-email" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Email Aktif *
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                  placeholder="nama@email.com"
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-name" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Nama Lengkap *
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  placeholder="Nama lengkap sesuai KTP"
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-xs font-bold text-[#0B2453] mb-1">
                  Buat Kata Sandi *
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={6}
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  placeholder="Minimal 6 karakter"
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-division" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Divisi
                  </label>
                  <select
                    id="reg-division"
                    value={regForm.division}
                    onChange={(e) =>
                      setRegForm({ ...regForm, division: e.target.value as Division })
                    }
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm bg-white focus:border-[#0B2453] focus:outline-none"
                  >
                    <option value="Operasional">Operasional</option>
                    <option value="Security">Security</option>
                    <option value="Cleaning Service">Cleaning Service</option>
                    <option value="Keuangan">Keuangan</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-shift" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Shift Kerja
                  </label>
                  <select
                    id="reg-shift"
                    value={regForm.shiftCode}
                    onChange={(e) =>
                      setRegForm({ ...regForm, shiftCode: e.target.value as ShiftCode })
                    }
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm bg-white focus:border-[#0B2453] focus:outline-none"
                  >
                    <option value="REGULER">Reguler (08:00-17:00)</option>
                    <option value="PAGI">Pagi (07:00-15:00)</option>
                    <option value="SIANG">Siang (15:00-23:00)</option>
                    <option value="MALAM">Malam (23:00-07:00)</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                NIK karyawan dibuat otomatis oleh sistem setelah akun email aktif.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                  className="h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={regSubmitting}
                  className="h-11 px-5 rounded-xl bg-[#0B2453] text-white text-sm font-bold hover:bg-[#143470] disabled:opacity-60 shadow-sm cursor-pointer"
                >
                  {regSubmitting ? 'Mendaftar...' : 'Daftar dengan Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

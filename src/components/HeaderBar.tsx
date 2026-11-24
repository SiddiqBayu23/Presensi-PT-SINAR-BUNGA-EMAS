import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FolderOpen,
  Home,
  KeyRound,
  LogOut,
  Settings,
  Shield,
  X,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { MainTab } from '../types/hris';
import { SbumBadgeIcon } from './SbumLogo';

interface HeaderBarProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  pendingCount: number;
}

const DESKTOP_NAV: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
  { id: 'beranda', label: 'Beranda', icon: <Home className="w-4 h-4" /> },
  { id: 'schedule', label: 'Schedule', icon: <Shield className="w-4 h-4" /> },
  { id: 'pengajuan', label: 'Pengajuan', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'dokumen', label: 'Dokumen', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'hrd', label: 'HRD', icon: <Settings className="w-4 h-4" /> },
];

export function HeaderBar({ activeTab, onSelectTab, pendingCount }: HeaderBarProps) {
  const {
    currentUser,
    isAdminSession,
    isFirebaseSynced,
    logout,
    changePassword,
    changeAdminPassword,
  } = useHris();
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  if (!currentUser) return null;

  const isLocalAdminPwdMode = isAdminSession && !isFirebaseSynced;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (newPwd !== confirmPwd) {
      setPwdError('Konfirmasi kata sandi baru tidak sama.');
      return;
    }
    setSavingPwd(true);
    const res = isLocalAdminPwdMode
      ? await changeAdminPassword(currentPwd, newPwd)
      : await changePassword(newPwd);
    setSavingPwd(false);
    if (!res.ok) {
      setPwdError(res.error);
      return;
    }
    setPwdSuccess(true);
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    window.setTimeout(() => {
      setPwdSuccess(false);
      setShowPwdModal(false);
    }, 1000);
  };

  return (
    <>
      <header className="no-print sticky top-0 z-30 bg-gradient-to-b from-[#0A1E46] to-[#112A5E] text-white border-b-[3px] border-[#C69214] shadow-md rounded-b-2xl lg:rounded-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Row 1: Brand + Desktop Nav + LIVE Indicator */}
          <div className="flex items-center justify-between gap-4 py-3">
            <button
              type="button"
              onClick={() => onSelectTab('beranda')}
              className="flex items-center gap-3 text-left shrink-0 focus-visible:outline-2 focus-visible:outline-amber-300 rounded-lg cursor-pointer"
            >
              <SbumBadgeIcon className="w-10 h-10" />
              <div className="leading-tight">
                <div className="text-sm sm:text-base font-extrabold tracking-tight text-white whitespace-nowrap">
                  PT Sinar Bunga Mas
                </div>
                <div className="text-[10px] font-bold tracking-[0.14em] text-[#F1C75B] uppercase whitespace-nowrap">
                  One Stop Business Services
                </div>
              </div>
            </button>

            {/* Desktop Inline Navigation */}
            <nav
              aria-label="Navigasi utama desktop"
              className="hidden lg:flex items-center gap-1"
            >
              {DESKTOP_NAV.filter((item) => item.id !== 'hrd' || currentUser.role === 'hrd').map(
                (item) => {
                  const isActive = activeTab === item.id;
                  const displayLabel =
                    currentUser.role === 'hrd' && item.id === 'beranda'
                      ? 'Beranda Admin'
                      : currentUser.role === 'hrd' && item.id === 'hrd'
                        ? 'Panel HRD'
                        : item.label;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectTab(item.id)}
                      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-white/15 text-[#F4CE6A]'
                          : 'text-slate-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {item.icon}
                      <span>{displayLabel}</span>
                      {item.id === 'hrd' && currentUser.role === 'hrd' && pendingCount > 0 && (
                        <span className="ml-0.5 rounded-full bg-[#C69214] px-1.5 py-0.5 text-[10px] font-extrabold text-[#0B2453]">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  );
                }
              )}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 border border-white/15 px-3 py-1 text-[11px] font-extrabold tracking-wide text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                <span>LIVE</span>
              </span>
            </div>
          </div>

          {/* Row 2: Employee Identity + Ganti Sandi / Keluar */}
          <div className="flex items-center justify-between gap-2 py-2 border-t border-white/10 text-[11px] sm:text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {currentUser.role === 'hrd' && (
                <span className="shrink-0 rounded-md bg-[#C69214] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-[#0B2453] uppercase">
                  ADMIN
                </span>
              )}
              <span className="font-bold text-[#F3CA62] truncate">
                {currentUser.name} ({currentUser.nik}) &bull; {currentUser.position}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCurrentPwd('');
                  setNewPwd('');
                  setConfirmPwd('');
                  setPwdError(null);
                  setPwdSuccess(false);
                  setShowPwdModal(true);
                }}
                className="font-bold text-white/95 hover:text-[#F3CA62] transition-colors py-1 px-1 whitespace-nowrap cursor-pointer"
              >
                Ganti Sandi
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="font-bold text-[#FCA5A5] hover:text-red-300 transition-colors py-1 px-1 whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 hidden sm:inline" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Ganti Sandi Modal */}
      {showPwdModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwd-modal-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-[#0B2453] px-5 py-4 text-white border-b-2 border-[#C69214]">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-5 h-5 text-[#F3CA62]" />
                <h2 id="pwd-modal-title" className="text-base font-bold">
                  Ubah Kata Sandi Akun
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPwdModal(false)}
                aria-label="Tutup modal ganti sandi"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="p-5 space-y-4">
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

              {isLocalAdminPwdMode && (
                <div>
                  <label htmlFor="current-pwd" className="block text-xs font-bold text-[#0B2453] mb-1">
                    Kata Sandi Admin Saat Ini
                  </label>
                  <input
                    id="current-pwd"
                    type="password"
                    required
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    placeholder="Masukkan kata sandi saat ini"
                    className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
                  />
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
                  onChange={(e) => setNewPwd(e.target.value)}
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
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full h-11 rounded-xl border border-slate-200 px-3.5 text-sm focus:border-[#0B2453] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPwdModal(false)}
                  className="h-11 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPwd}
                  className="h-11 px-5 rounded-xl bg-[#0B2453] text-white text-sm font-bold hover:bg-[#143470] disabled:opacity-60 cursor-pointer"
                >
                  {savingPwd ? 'Menyimpan...' : 'Simpan Sandi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

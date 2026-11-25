import React from 'react';
import {
  Camera,
  ClipboardList,
  FolderOpen,
  Home,
  LogOut,
  Settings,
  Settings2,
  Shield,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { MainTab } from '../types/hris';
import { EmployeeAvatar } from './EmployeeAvatar';
import { SbumBadgeIcon } from './SbumLogo';
import { useSlidingIndicator } from './useSlidingIndicator';

interface HeaderBarProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  pendingCount: number;
}

const DESKTOP_NAV: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
  { id: 'beranda', label: 'Beranda', icon: <Home className="w-4 h-4" /> },
  { id: 'presensi', label: 'Presensi', icon: <Camera className="w-4 h-4" /> },
  { id: 'schedule', label: 'Jadwal', icon: <Shield className="w-4 h-4" /> },
  { id: 'pengajuan', label: 'Pengajuan', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'dokumen', label: 'Dokumen', icon: <FolderOpen className="w-4 h-4" /> },
  { id: 'hrd', label: 'HRD', icon: <Settings className="w-4 h-4" /> },
  { id: 'pengaturan', label: 'Pengaturan', icon: <Settings2 className="w-4 h-4" /> },
];

export function HeaderBar({ activeTab, onSelectTab, pendingCount }: HeaderBarProps) {
  const { currentUser, logout } = useHris();
  const { containerRef: navRef, rect: navPill } = useSlidingIndicator([
    activeTab,
    currentUser?.role,
    pendingCount,
  ]);

  if (!currentUser) return null;

  return (
    <header className="no-print sticky top-0 z-30 bg-gradient-to-b from-[#0A1E46] to-[#112A5E] text-white border-b-[3px] border-[#C69214] shadow-md rounded-b-2xl lg:rounded-none">
      <div className="mx-auto w-full max-w-[1900px] px-4 sm:px-6 lg:w-[92%] lg:px-8">
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
            ref={navRef}
            aria-label="Navigasi utama desktop"
            className="hidden lg:flex relative items-center gap-1"
          >
            {navPill && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute rounded-xl bg-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-[left,top,width,height] duration-300 ease-out"
                style={{
                  left: navPill.left,
                  top: navPill.top,
                  width: navPill.width,
                  height: navPill.height,
                }}
              />
            )}
            {DESKTOP_NAV.filter(
              (item) => item.id !== 'hrd' || currentUser.role === 'hrd' || currentUser.role === 'supervisor'
            ).map((item) => {
              const isActive = activeTab === item.id;
              const displayLabel =
                currentUser.role === 'hrd' && item.id === 'beranda'
                  ? 'Beranda Admin'
                  : currentUser.role === 'supervisor' && item.id === 'beranda'
                    ? 'Tim Saya'
                    : item.id === 'hrd'
                    ? currentUser.role === 'hrd'
                      ? 'Panel HRD'
                      : 'Persetujuan Tim'
                    : item.label;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-nav-active={isActive ? 'true' : undefined}
                  onClick={() => onSelectTab(item.id)}
                  className={`relative z-10 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-[#F4CE6A]'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item.icon}
                  <span>{displayLabel}</span>
                  {item.id === 'hrd' &&
                    (currentUser.role === 'hrd' || currentUser.role === 'supervisor') &&
                    pendingCount > 0 && (
                      <span className="ml-0.5 rounded-full bg-[#C69214] px-1.5 py-0.5 text-[10px] font-extrabold text-[#0B2453]">
                        {pendingCount}
                      </span>
                    )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 border border-white/15 px-3 py-1 text-[11px] font-extrabold tracking-wide text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>LIVE</span>
            </span>
          </div>
        </div>

        {/* Row 2: Employee Identity + Pengaturan / Keluar */}
        <div className="flex items-center justify-between gap-2 py-2 border-t border-white/10 text-[11px] sm:text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <EmployeeAvatar
              name={currentUser.name}
              photoUrl={currentUser.photoUrl}
              className="w-8 h-8"
              textClassName="text-[11px]"
            />
            {currentUser.role === 'hrd' && (
              <span className="shrink-0 rounded-md bg-[#C69214] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-[#0B2453] uppercase">
                ADMIN
              </span>
            )}
            {currentUser.role === 'supervisor' && (
              <span className="shrink-0 rounded-md bg-blue-500 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white uppercase">
                SUPERVISOR
              </span>
            )}
            {currentUser.role === 'employee' && (
              <span className="shrink-0 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white uppercase">
                KARYAWAN
              </span>
            )}
            <span className="font-bold text-[#F3CA62] truncate">
              {currentUser.name} ({currentUser.nik}) &bull; {currentUser.position}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('pengaturan')}
              aria-current={activeTab === 'pengaturan' ? 'page' : undefined}
              className="font-bold text-white/95 hover:text-[#F3CA62] transition-colors py-1 px-1 whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 hidden sm:inline" />
              <span>Pengaturan</span>
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
  );
}

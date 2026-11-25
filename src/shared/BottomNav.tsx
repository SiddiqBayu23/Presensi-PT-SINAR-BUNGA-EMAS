import React from 'react';
import { Camera, ClipboardList, FolderOpen, Home, Settings, Shield } from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { MainTab } from '../types/hris';
import { useSlidingIndicator } from './useSlidingIndicator';

interface BottomNavProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  pendingCount: number;
  /** true bila user boleh membuka panel persetujuan (HRD admin atau supervisor). */
  panelAccess: boolean;
}

export function BottomNav({ activeTab, onSelectTab, pendingCount, panelAccess }: BottomNavProps) {
  const { currentUser } = useHris();
  const role = currentUser?.role ?? 'employee';
  const { containerRef: navRef, rect: navPill } = useSlidingIndicator([activeTab, panelAccess]);

  const homeLabel = role === 'hrd' ? 'Admin' : role === 'supervisor' ? 'Tim Saya' : 'Beranda';
  const panelLabel = role === 'hrd' ? 'HRD' : 'Persetujuan';

  const items: Array<{
    id: MainTab;
    label: string;
    ariaLabel?: string;
    icon: React.ReactNode;
    activeColor: string;
  }> = [
    {
      id: 'beranda',
      label: homeLabel,
      ariaLabel: role === 'hrd' ? 'Beranda Admin' : role === 'supervisor' ? 'Beranda Tim Saya' : 'Beranda',
      icon: <Home className="w-5 h-5" />,
      activeColor: 'text-[#0B2453]',
    },
    {
      id: 'presensi',
      label: 'Presensi',
      ariaLabel: 'Halaman Presensi',
      icon: <Camera className="w-5 h-5" />,
      activeColor: 'text-emerald-700',
    },
    {
      id: 'schedule',
      label: 'Jadwal',
      icon: <Shield className="w-5 h-5" />,
      activeColor: 'text-[#0B2453]',
    },
    {
      id: 'pengajuan',
      label: 'Pengajuan',
      icon: <ClipboardList className="w-5 h-5" />,
      activeColor: 'text-[#0B2453]',
    },
    {
      id: 'dokumen',
      label: 'Dokumen',
      icon: <FolderOpen className="w-5 h-5" />,
      activeColor: 'text-[#0B2453]',
    },
    ...(panelAccess
      ? [
          {
            id: 'hrd' as MainTab,
            label: panelLabel,
            icon: <Settings className="w-5 h-5" />,
            activeColor: 'text-[#0B2453]',
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Navigasi bawah"
      className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-4px_16px_rgba(11,36,83,0.06)]"
    >
      <div
        ref={navRef}
        className="relative grid h-16 max-w-lg mx-auto"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {navPill && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-2xl bg-[#EEF4FC] transition-[left,top,width,height] duration-300 ease-out"
            style={{
              left: navPill.left + 4,
              top: navPill.top + 6,
              width: Math.max(navPill.width - 8, 0),
              height: Math.max(navPill.height - 12, 0),
            }}
          />
        )}
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-nav-active={isActive ? 'true' : undefined}
              aria-label={item.ariaLabel ?? item.label}
              title={
                item.id === 'hrd' && panelAccess && pendingCount > 0
                  ? `${item.label} (${pendingCount} menunggu persetujuan)`
                  : (item.ariaLabel ?? item.label)
              }
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative z-10 flex flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-200 min-h-[44px] cursor-pointer ${
                isActive ? `${item.activeColor} font-extrabold` : 'text-slate-500 font-semibold'
              }`}
            >
              <span className="relative">
                {item.icon}
                {item.id === 'hrd' && panelAccess && pendingCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#C69214] text-[#0B2453] text-[9px] font-extrabold flex items-center justify-center"
                  >
                    {pendingCount}
                  </span>
                )}
              </span>
              <span className="leading-none whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

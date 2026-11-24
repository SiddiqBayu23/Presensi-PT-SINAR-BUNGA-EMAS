import React from 'react';
import { ClipboardList, FolderOpen, Home, Settings, Shield } from 'lucide-react';
import type { MainTab } from '../types/hris';

interface BottomNavProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  pendingCount: number;
  isHrd: boolean;
}

export function BottomNav({ activeTab, onSelectTab, pendingCount, isHrd }: BottomNavProps) {
  const items: Array<{ id: MainTab; label: string; ariaLabel?: string; icon: React.ReactNode; activeColor: string }> = [
    {
      id: 'beranda',
      label: isHrd ? 'Admin' : 'Beranda',
      ariaLabel: isHrd ? 'Beranda Admin' : 'Beranda',
      icon: <Home className="w-5 h-5" />,
      activeColor: 'text-[#0B2453]',
    },
    {
      id: 'schedule',
      label: 'Schedule',
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
    ...(isHrd
      ? [
          {
            id: 'hrd' as MainTab,
            label: 'HRD',
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
      <div className={`grid ${isHrd ? 'grid-cols-5' : 'grid-cols-4'} h-16 max-w-lg mx-auto`}>
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.ariaLabel ?? item.label}
              title={
                item.id === 'hrd' && isHrd && pendingCount > 0
                  ? `${item.label} (${pendingCount} menunggu persetujuan)`
                  : (item.ariaLabel ?? item.label)
              }
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 text-[11px] transition-colors min-h-[44px] cursor-pointer ${
                isActive ? `${item.activeColor} font-extrabold` : 'text-slate-500 font-semibold'
              }`}
            >
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#C69214]"
                  aria-hidden="true"
                />
              )}
              <span className="relative">
                {item.icon}
                {item.id === 'hrd' && isHrd && pendingCount > 0 && (
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

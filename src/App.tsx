/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AttendanceModal } from './components/AttendanceModal';
import { BottomNav } from './components/BottomNav';
import { DashboardHome } from './components/DashboardHome';
import { DocumentsView } from './components/DocumentsView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HeaderBar } from './components/HeaderBar';
import { HrdView, type HrdSubTab } from './components/HrdView';
import { LoginView } from './components/LoginView';
import { ScheduleView } from './components/ScheduleView';
import { SbumBadgeIcon } from './components/SbumLogo';
import { SubmissionsView } from './components/SubmissionsView';
import { HrisProvider, useHris } from './context/HrisContext';
import type {
  DocumentSubTab,
  LoginIntent,
  MainTab,
  SubmissionSubTab,
} from './types/hris';

function HrisShell() {
  const {
    authReady,
    firebaseUser,
    needsEmailVerification,
    isAdminSession,
    currentUser,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
  } = useHris();

  const [activeTab, setActiveTab] = useState<MainTab>('beranda');
  const [submissionSubTab, setSubmissionSubTab] = useState<SubmissionSubTab>('izin');
  const [documentSubTab, setDocumentSubTab] = useState<DocumentSubTab>('slip');
  const [hrdSubTab, setHrdSubTab] = useState<HrdSubTab>('persetujuan');
  const [attendanceModalMode, setAttendanceModalMode] = useState<'in' | 'out' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pendingApprovalsCount = useMemo(
    () =>
      leaves.filter((l) => l.status === 'Menunggu').length +
      overtimes.filter((o) => o.status === 'Menunggu').length +
      shiftSwaps.filter((s) => s.status === 'Menunggu').length +
      exitClearances.filter((e) => e.status === 'Menunggu').length,
    [leaves, overtimes, shiftSwaps, exitClearances]
  );

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const handleLoginSuccess = (intent: LoginIntent) => {
    if (intent === 'clock-in') {
      setActiveTab('beranda');
      setAttendanceModalMode('in');
    } else if (intent === 'clock-out') {
      setActiveTab('beranda');
      setAttendanceModalMode('out');
    } else if (intent === 'profile') {
      setDocumentSubTab('profil');
      setActiveTab('dokumen');
    } else {
      setActiveTab('beranda');
    }
  };

  const navigateSubmission = (sub: SubmissionSubTab) => {
    setSubmissionSubTab(sub);
    setActiveTab('pengajuan');
  };

  const navigateDocument = (sub: DocumentSubTab) => {
    setDocumentSubTab(sub);
    setActiveTab('dokumen');
  };

  if (!authReady || (firebaseUser && !needsEmailVerification && !currentUser && !isAdminSession)) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex flex-col items-center justify-center p-6 text-center gap-4">
        <SbumBadgeIcon className="w-14 h-14" />
        <div className="flex items-center gap-2 text-sm font-bold text-[#0B2453]">
          <Loader2 className="w-4 h-4 animate-spin text-[#C69214]" />
          <span>Menghubungkan ke Firebase HRIS PT Sinar Bunga Mas...</span>
        </div>
      </div>
    );
  }

  if (!currentUser || (!isAdminSession && (!firebaseUser || needsEmailVerification))) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const isHrd = currentUser.role === 'hrd';
  const safeActiveTab: MainTab = !isHrd && activeTab === 'hrd' ? 'beranda' : activeTab;

  const handleSelectTab = (tab: MainTab) => {
    if (tab === 'hrd' && !isHrd) {
      setActiveTab('beranda');
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col">
      <HeaderBar
        activeTab={safeActiveTab}
        onSelectTab={handleSelectTab}
        pendingCount={pendingApprovalsCount}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-24 lg:pb-10">
        {toast && (
          <div
            role="status"
            className="no-print mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm font-bold text-emerald-800 flex items-center justify-between gap-2 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="Tutup notifikasi"
              className="p-1 text-emerald-700 hover:text-emerald-950 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {safeActiveTab === 'beranda' &&
          (isHrd ? (
            <AdminDashboardView
              onOpenAttendance={(mode) => setAttendanceModalMode(mode)}
              onNavigateTab={handleSelectTab}
              onOpenHrdSubTab={(sub) => {
                setHrdSubTab(sub);
                handleSelectTab('hrd');
              }}
              onShowToast={showToast}
            />
          ) : (
            <DashboardHome
              onOpenAttendance={(mode) => setAttendanceModalMode(mode)}
              onNavigateTab={handleSelectTab}
              onNavigateSubmission={navigateSubmission}
              onNavigateDocument={navigateDocument}
            />
          ))}

        {safeActiveTab === 'schedule' && (
          <ScheduleView onOpenShiftSwap={navigateSubmission} />
        )}

        {safeActiveTab === 'pengajuan' && (
          <SubmissionsView
            activeSubTab={submissionSubTab}
            onChangeSubTab={setSubmissionSubTab}
          />
        )}

        {safeActiveTab === 'dokumen' && (
          <DocumentsView
            activeSubTab={documentSubTab}
            onChangeSubTab={setDocumentSubTab}
          />
        )}

        {safeActiveTab === 'hrd' && isHrd && (
          <HrdView activeSubTab={hrdSubTab} onChangeSubTab={setHrdSubTab} />
        )}
      </main>

      <BottomNav
        activeTab={safeActiveTab}
        onSelectTab={handleSelectTab}
        pendingCount={pendingApprovalsCount}
        isHrd={isHrd}
      />

      {attendanceModalMode && (
        <AttendanceModal
          mode={attendanceModalMode}
          onClose={() => setAttendanceModalMode(null)}
          onSuccess={(msg) => {
            setAttendanceModalMode(null);
            showToast(msg);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HrisProvider>
        <HrisShell />
      </HrisProvider>
    </ErrorBoundary>
  );
}

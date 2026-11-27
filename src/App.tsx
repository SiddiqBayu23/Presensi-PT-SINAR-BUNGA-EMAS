/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { AdminDashboardView } from './roles/admin/AdminDashboardView';
import { AttendanceModal } from './shared/AttendanceModal';
import { BottomNav } from './shared/BottomNav';
import { DashboardHome } from './roles/karyawan/DashboardHome';
import { DocumentsView } from './roles/karyawan/DocumentsView';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { HeaderBar } from './shared/HeaderBar';
import { HrdView, type HrdSubTab } from './roles/admin/HrdView';
import { LoginView } from './shared/LoginView';
import { ScheduleView } from './roles/karyawan/ScheduleView';
import { SbumBadgeIcon } from './shared/SbumLogo';
import { SettingsView } from './shared/SettingsView';
import { SubmissionsView } from './roles/karyawan/SubmissionsView';
import { SupervisorDashboardView } from './roles/supervisor/SupervisorDashboardView';
import { SupervisorPanelView } from './roles/supervisor/SupervisorPanelView';
import { PresensiView } from './shared/PresensiView';
import { HrisProvider, useHris } from './context/HrisContext';
import type {
  DocumentSubTab,
  MainTab,
  SubmissionSubTab,
} from './types/hris';

function HrisShell() {
  const {
    authReady,
    firebaseUser,
    needsEmailVerification,
    currentUser,
    leaves,
    overtimes,
    shiftSwaps,
    exitClearances,
    canReview,
  } = useHris();

  const [activeTab, setActiveTab] = useState<MainTab>('beranda');
  const [submissionSubTab, setSubmissionSubTab] = useState<SubmissionSubTab>('izin');
  const [documentSubTab, setDocumentSubTab] = useState<DocumentSubTab>('slip');
  const [hrdSubTab, setHrdSubTab] = useState<HrdSubTab>('persetujuan');
  const [employeeSearchSeed, setEmployeeSearchSeed] = useState('');
  const [attendanceModalMode, setAttendanceModalMode] = useState<'in' | 'out' | null>(null);
  const [employeeDetailUid, setEmployeeDetailUid] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ------------------------------------------------------------------ riwayat tab
  // Shell Android memanggil webView.goBack() saat tombol back ditekan dan hanya
  // menutup aplikasi kalau riwayat WebView sudah habis. Navigasi tab di SPA ini
  // murni state React, jadi setiap pindah tab (dan setiap modal absensi dibuka)
  // harus menambah entri riwayat supaya back kembali ke tampilan sebelumnya.
  const navDepthRef = useRef(0);
  const activeTabRef = useRef<MainTab>('beranda');
  const openEmployeeDetail = useCallback((uid: string) => {
    navDepthRef.current += 1;
    activeTabRef.current = 'hrd';
    window.history.pushState({ sbmTab: 'hrd', sbmDetail: uid }, '');
    setActiveTab('hrd');
    setEmployeeDetailUid(uid);
  }, []);

  const closeEmployeeDetail = useCallback(() => {
    if (window.history.state?.sbmDetail) window.history.back();
    else setEmployeeDetailUid(null);
  }, []);

  const goToTab = useCallback((tab: MainTab) => {
    if (tab === activeTabRef.current) return;
    activeTabRef.current = tab;
    navDepthRef.current += 1;
    window.history.pushState({ sbmTab: tab }, '');
    setActiveTab(tab);
  }, []);

  /** Buang semua entri riwayat tab dan kembali ke entri dasar (login/logout). */
  const resetNavToBase = useCallback(() => {
    const depth = navDepthRef.current;
    navDepthRef.current = 0;
    activeTabRef.current = 'beranda';
    setAttendanceModalMode(null);
    setEmployeeDetailUid(null);
    setActiveTab('beranda');
    if (depth > 0) {
      // popstate pada entri dasar yang memulihkan tab 'beranda'.
      window.history.go(-depth);
      return;
    }
    window.history.replaceState({ sbmTab: 'beranda' }, '');
  }, []);

  const openAttendanceModal = useCallback((mode: 'in' | 'out') => {
    navDepthRef.current += 1;
    window.history.pushState({ sbmTab: activeTabRef.current, sbmModal: mode }, '');
    setAttendanceModalMode(mode);
  }, []);

  const closeAttendanceModal = useCallback(() => {
    setAttendanceModalMode(null);
    // Entri modal dibuang lewat back(); popstate hanya menyetel ulang state yang
    // sama, jadi menutup lewat tombol X tidak meninggalkan entri riwayat hantu.
    if (window.history.state?.sbmModal) window.history.back();
  }, []);

  useEffect(() => {
    // Entri pertama riwayat = tab awal; back dari entri ini berarti keluar aplikasi.
    if (window.history.state?.sbmTab !== activeTabRef.current) {
      window.history.replaceState({ sbmTab: activeTabRef.current }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { sbmTab?: MainTab; sbmDetail?: string } | null;
       const tab = state?.sbmTab ?? 'beranda';
       navDepthRef.current = Math.max(0, navDepthRef.current - 1);
       activeTabRef.current = tab;
       setAttendanceModalMode(null);
      setEmployeeDetailUid(state?.sbmDetail ?? null);
       setActiveTab(tab);
     };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const sessionActive = Boolean(currentUser && firebaseUser && !needsEmailVerification);

  useEffect(() => {
    // Sesi berakhir: entri riwayat tab lama dibuang supaya back di layar login
    // langsung keluar aplikasi, bukan memutar ulang tab sesi sebelumnya.
    if (!sessionActive) resetNavToBase();
  }, [sessionActive, resetNavToBase]);

  // Badge = pengajuan yang memang bisa diputuskan user ini (HRD: semua, supervisor: bawahan se-divisi).
  const pendingApprovalsCount = useMemo(
    () =>
      leaves.filter((l) => l.status === 'Menunggu' && canReview(l.uid, l.supervisorUid)).length +
      overtimes.filter((o) => o.status === 'Menunggu' && canReview(o.uid, o.supervisorUid)).length +
      shiftSwaps.filter((s) => s.status === 'Menunggu' && canReview(s.uid, s.supervisorUid)).length +
      exitClearances.filter((e) => e.status === 'Menunggu' && canReview(e.uid, e.supervisorUid)).length,
    [leaves, overtimes, shiftSwaps, exitClearances, canReview]
  );

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const handleLoginSuccess = () => {
    resetNavToBase();
  };

  const navigateSubmission = (sub: SubmissionSubTab) => {
    setSubmissionSubTab(sub);
    goToTab('pengajuan');
  };

  const navigateDocument = (sub: DocumentSubTab) => {
    setDocumentSubTab(sub);
    goToTab('dokumen');
  };

  // Auth Firebase belum selesai dipulihkan atau profil karyawan sedang dimuat.
  if (!authReady || (firebaseUser && !needsEmailVerification && !currentUser)) {
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

  if (!currentUser || !firebaseUser || needsEmailVerification) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const isHrd = currentUser.role === 'hrd';
  const isSupervisor = currentUser.role === 'supervisor';
  const canAccessHrdPanel = isHrd || isSupervisor;
  const safeActiveTab: MainTab = !canAccessHrdPanel && activeTab === 'hrd' ? 'beranda' : activeTab;

  const handleSelectTab = (tab: MainTab) => {
    if (tab === 'hrd' && !canAccessHrdPanel) {
      goToTab('beranda');
      return;
    }
    goToTab(tab);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col">
      <HeaderBar
        activeTab={safeActiveTab}
        onSelectTab={handleSelectTab}
        pendingCount={pendingApprovalsCount}
      />

      <main className="flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 lg:w-[92%] max-w-[1900px] pt-5 pb-24 lg:pb-10">
        {toast && (
          <div
            role="status"
            className="no-print toast-enter mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm font-bold text-emerald-800 flex items-center justify-between gap-2 shadow-xs"
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

        <div key={safeActiveTab} className="view-enter">
        {safeActiveTab === 'beranda' &&
          (isHrd ? (
            <AdminDashboardView
              onOpenAttendance={openAttendanceModal}
              onNavigateTab={handleSelectTab}
              onOpenHrdSubTab={(sub) => {
                setHrdSubTab(sub);
                handleSelectTab('hrd');
              }}
              onOpenEmployeeDirectory={(searchTerm) => {
                setEmployeeSearchSeed(searchTerm);
                setHrdSubTab('karyawan');
                handleSelectTab('hrd');
              }}
              onShowToast={showToast}
            />
          ) : isSupervisor ? (
            <SupervisorDashboardView
              onOpenPanel={() => {
                setHrdSubTab('persetujuan');
                handleSelectTab('hrd');
              }}
              onNavigateTab={handleSelectTab}
              onNavigateSubmission={navigateSubmission}
              onOpenAttendance={openAttendanceModal}
            />
          ) : (
            <DashboardHome
              onOpenAttendance={openAttendanceModal}
              onNavigateTab={handleSelectTab}
              onNavigateSubmission={navigateSubmission}
              onNavigateDocument={navigateDocument}
            />
          ))}

        {safeActiveTab === 'presensi' && (
          <PresensiView onOpenAttendance={openAttendanceModal} />
        )}

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
          <HrdView
            activeSubTab={hrdSubTab}
            onChangeSubTab={setHrdSubTab}
            employeeSearchSeed={employeeSearchSeed}
            detailUid={employeeDetailUid}
            onOpenDetail={openEmployeeDetail}
            onCloseDetail={closeEmployeeDetail}
          />
        )}

        {safeActiveTab === 'hrd' && isSupervisor && (
          <SupervisorPanelView onShowToast={showToast} />
        )}

        {safeActiveTab === 'pengaturan' && <SettingsView />}
        </div>
      </main>

      <BottomNav
        activeTab={safeActiveTab}
        onSelectTab={handleSelectTab}
        pendingCount={pendingApprovalsCount}
        panelAccess={canAccessHrdPanel}
      />

      {attendanceModalMode && (
        <AttendanceModal
          mode={attendanceModalMode}
          onClose={closeAttendanceModal}
          onSuccess={(msg) => {
            closeAttendanceModal();
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

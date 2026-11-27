import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileCheck,
  FileText,
  Filter,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { Division, ReportType, TodoStatus, TodoTask, UserRole } from '../types/hris';
import { formatReportTypesLabel, requiredReportFormats } from '../utils/hrisLogic';

interface TodoListWidgetProps {
  role: UserRole;
  onShowToast?: (msg: string) => void;
}

export function TodoListWidget({ role, onShowToast }: TodoListWidgetProps) {
  const {
    currentUser,
    employees,
    todos,
    addTodoTask,
    submitTodoReport,
    reviewTodoTask,
    deleteTodoTasks,
    wibNow,
  } = useHris();

  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'review' | 'done'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTaskForReport, setSelectedTaskForReport] = useState<TodoTask | null>(null);
  const [selectedTaskForReview, setSelectedTaskForReview] = useState<TodoTask | null>(null);

  // Form states for creating task (Supervisor / Admin)
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssigneeUid, setNewAssigneeUid] = useState('');
  const [newDueDate, setNewDueDate] = useState(wibNow.isoDate);
  const [newReportTypes, setNewReportTypes] = useState<ReportType[]>(['gambar']);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form states for submitting report (Karyawan)
  const [reportText, setReportText] = useState('');
  const [reportPhoto, setReportPhoto] = useState<{ name: string; url: string } | null>(null);
  const [reportDocument, setReportDocument] = useState<{ name: string; url: string } | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Form states for reviewing task (Supervisor / Admin)
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const canCreateTask = role === 'supervisor' || role === 'hrd';

  // Subordinate employees list for assignment
  const assignableEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (!emp.active) return false;
      if (role === 'hrd') return true;
      if (role === 'supervisor') {
        return emp.supervisorUid === currentUser?.uid || emp.uid === currentUser?.uid;
      }
      return false;
    });
  }, [employees, role, currentUser]);

  // Filter tasks based on role and active tab
  const filteredTasks = useMemo(() => {
    return todos.filter((t) => {
      // Role scope
      let matchesScope = true;
      if (role === 'employee') {
        matchesScope = t.assignedToUid === currentUser?.uid;
      } else if (role === 'supervisor') {
        const teamUids = new Set(
          employees.filter((e) => e.supervisorUid === currentUser?.uid).map((e) => e.uid)
        );
        matchesScope =
          teamUids.has(t.assignedToUid) ||
          t.assignedByUid === currentUser?.uid ||
          t.assignedToUid === currentUser?.uid;
      }

      if (!matchesScope) return false;

      // Status filter
      if (activeFilter === 'pending') return t.status === 'Belum Dikerjakan' || t.status === 'Sedang Dikerjakan';
      if (activeFilter === 'review') return t.status === 'Menunggu Review';
      if (activeFilter === 'done') return t.status === 'Selesai';
      return true;
    });
  }, [todos, role, currentUser, employees, activeFilter]);

  // Statistics
  const pendingCount = todos.filter((t) =>
    role === 'employee' ? t.assignedToUid === currentUser?.uid : true
  ).filter((t) => t.status === 'Belum Dikerjakan' || t.status === 'Sedang Dikerjakan').length;

  const reviewCount = todos.filter((t) =>
    role === 'employee' ? t.assignedToUid === currentUser?.uid : true
  ).filter((t) => t.status === 'Menunggu Review').length;

  const doneCount = todos.filter((t) =>
    role === 'employee' ? t.assignedToUid === currentUser?.uid : true
  ).filter((t) => t.status === 'Selesai').length;

  // Handle task creation
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newTitle.trim() || !newDescription.trim() || !newAssigneeUid || !newDueDate) {
      setCreateError('Semua kolom wajib diisi.');
      return;
    }
    if (newReportTypes.length === 0) {
      setCreateError('Pilih minimal satu format laporan yang diwajibkan.');
      return;
    }

    const assignee = employees.find((e) => e.uid === newAssigneeUid);
    if (!assignee) {
      setCreateError('Karyawan yang dipilih tidak valid.');
      return;
    }

    setCreateSubmitting(true);
    try {
      await addTodoTask({
        title: newTitle.trim(),
        description: newDescription.trim(),
        assignedToUid: assignee.uid,
        assignedToName: assignee.name,
        assignedToDivision: assignee.division,
        assignedByUid: currentUser?.uid ?? 'sys',
        assignedByName: currentUser?.name ?? 'Atasan',
        assignedByRole: role,
        dueDate: newDueDate,
        reportTypeRequired: newReportTypes[0],
        reportTypes: newReportTypes,
      });

      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewAssigneeUid('');
      onShowToast?.(`Tugas "${newTitle.trim()}" berhasil dibuat untuk ${assignee.name}.`);
    } catch {
      setCreateError('Gagal membuat tugas. Coba beberapa saat lagi.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  /** Baca berkas bukti (gambar/dokumen) menjadi data URL, maksimal 5 MB. */
  const readAttachment = (
    file: File | undefined,
    accept: 'image' | 'document',
    onLoaded: (value: { name: string; url: string } | null) => void
  ) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setReportError('Ukuran file maksimal 5 MB.');
      return;
    }
    if (accept === 'image' && !file.type.startsWith('image/')) {
      setReportError('Format bukti harus berupa gambar (JPG/PNG).');
      return;
    }
    setReportError(null);
    const reader = new FileReader();
    reader.onload = () => onLoaded({ name: file.name, url: reader.result as string });
    reader.readAsDataURL(file);
  };

  // Handle report submission by employee
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForReport) return;
    setReportError(null);

    const formats = requiredReportFormats(selectedTaskForReport);
    if (formats.includes('pesan') && !reportText.trim()) {
      setReportError('Silakan isi pesan laporan pekerjaan Anda.');
      return;
    }
    if (formats.includes('gambar') && !reportPhoto) {
      setReportError('Wajib melampirkan foto/gambar bukti laporan.');
      return;
    }
    if (formats.includes('dokumen') && !reportDocument) {
      setReportError('Wajib melampirkan dokumen/berkas bukti laporan.');
      return;
    }

    setReportSubmitting(true);
    try {
      await submitTodoReport(selectedTaskForReport.id, {
        text: reportText.trim(),
        photoName: reportPhoto?.name,
        photoUrl: reportPhoto?.url,
        documentName: reportDocument?.name,
        documentUrl: reportDocument?.url,
      });

      setSelectedTaskForReport(null);
      setReportText('');
      setReportPhoto(null);
      setReportDocument(null);
      onShowToast?.('Laporan pengerjaan berhasil dikirim untuk direview.');
    } catch {
      setReportError('Gagal mengirim laporan.');
    } finally {
      setReportSubmitting(false);
    }
  };

  // Handle review approval / rejection
  const handleReviewAction = async (status: TodoStatus) => {
    if (!selectedTaskForReview) return;
    setReviewSubmitting(true);
    try {
      await reviewTodoTask(selectedTaskForReview.id, status, reviewNotes.trim());
      setSelectedTaskForReview(null);
      setReviewNotes('');
      onShowToast?.(
        status === 'Selesai'
          ? 'Tugas telah disetujui selesai.'
          : 'Tugas ditolak / diminta revisi.'
      );
    } catch {
      onShowToast?.('Gagal memproses review tugas.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDeleteTask = async (task: TodoTask) => {
    if (!canCreateTask) return;
    if (!window.confirm(`Hapus tugas "${task.title}"?`)) return;
    const res = await deleteTodoTasks([task.id]);
    if (!res.ok) {
      onShowToast?.(res.error ?? 'Gagal menghapus tugas.');
      return;
    }
    if (selectedTaskForReport?.id === task.id) setSelectedTaskForReport(null);
    if (selectedTaskForReview?.id === task.id) setSelectedTaskForReview(null);
    onShowToast?.(`Tugas "${task.title}" dihapus.`);
  };

  const handleDeleteAllVisible = async () => {
    if (!canCreateTask || filteredTasks.length === 0) return;
    if (
      !window.confirm(
        `Hapus ${filteredTasks.length} tugas yang sedang ditampilkan? Tindakan ini tidak dapat dibatalkan.`
      )
    ) {
      return;
    }
    const ids = filteredTasks.map((t) => t.id);
    const res = await deleteTodoTasks(ids);
    if (!res.ok) {
      onShowToast?.(res.error ?? 'Gagal menghapus daftar tugas.');
      return;
    }
    if (selectedTaskForReport && ids.includes(selectedTaskForReport.id)) {
      setSelectedTaskForReport(null);
    }
    if (selectedTaskForReview && ids.includes(selectedTaskForReview.id)) {
      setSelectedTaskForReview(null);
    }
    onShowToast?.(`${res.deleted} tugas berhasil dihapus.`);
  };
  return (
    <section className="rounded-3xl bg-white border border-slate-200/80 shadow-[0_6px_24px_rgba(11,36,83,0.06)] p-5 sm:p-6 space-y-5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-6 rounded-full bg-[#0B2453]" />
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453] flex items-center gap-2">
              <span>Tugas &amp; Todo List Operasional</span>
              <span className="rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs px-2 py-0.5 font-bold">
                {filteredTasks.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              {role === 'employee'
                ? 'Daftar penugasan kerja yang harus Anda kerjakan & laporkan'
                : 'Input instruksi kerja, pantau batas waktu, dan validasi laporan tim'}
            </p>
          </div>
        </div>

        {canCreateTask && (
          <div className="flex flex-wrap items-center gap-2">
            {filteredTasks.length > 0 && (
              <button
                type="button"
                onClick={() => void handleDeleteAllVisible()}
                className="h-10 px-3.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Semua ({filteredTasks.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#0B2453] to-[#153B7F] hover:brightness-110 text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#F4CE6A]" />
              <span>Tambah Tugas Baru</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveFilter('all')}
          className={`h-9 px-3.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
            activeFilter === 'all'
              ? 'bg-[#0B2453] text-[#F4CE6A] shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
        >
          Semua ({todos.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('pending')}
          className={`h-9 px-3.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeFilter === 'pending'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Belum Selesai</span>
          <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{pendingCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('review')}
          className={`h-9 px-3.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeFilter === 'review'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Menunggu Review</span>
          <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{reviewCount}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveFilter('done')}
          className={`h-9 px-3.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeFilter === 'done'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>Selesai</span>
          <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{doneCount}</span>
        </button>
      </div>

      {/* Task List Cards */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
          Tidak ada tugas dalam status ini.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredTasks.map((task) => {
            const isMeAssignee = task.assignedToUid === currentUser?.uid;
            const isOverdue = task.dueDate < wibNow.isoDate && task.status !== 'Selesai';

            return (
              <div
                key={task.id}
                className={`rounded-2xl border p-4 space-y-3 transition-all ${
                  task.status === 'Selesai'
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : task.status === 'Menunggu Review'
                      ? 'border-blue-200 bg-blue-50/20'
                      : isOverdue
                        ? 'border-rose-300 bg-rose-50/20'
                        : 'border-slate-200/90 bg-[#FBFDFF] hover:border-slate-300'
                }`}
              >
                {/* Top: Title & Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-extrabold text-[#0B2453] leading-snug">
                      {task.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2">{task.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap ${
                        task.status === 'Selesai'
                          ? 'bg-emerald-100 text-emerald-800'
                          : task.status === 'Menunggu Review'
                            ? 'bg-blue-100 text-blue-800'
                            : task.status === 'Ditolak'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {task.status}
                    </span>
                    {canCreateTask && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteTask(task)}
                        aria-label={`Hapus tugas ${task.title}`}
                        title="Hapus tugas"
                        className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Details row: Assignee, Due Date, Required Report */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      Pekerja: <strong>{task.assignedToName}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-600 justify-end">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className={`tabular-nums ${isOverdue ? 'font-bold text-rose-700' : ''}`}>
                      Batas: {task.dueDate}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-0.5 text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    {requiredReportFormats(task).map((format) => (
                      <span key={format} className="inline-flex items-center gap-1">
                        {format === 'gambar' && <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />}
                        {format === 'dokumen' && <FileText className="w-3.5 h-3.5 text-indigo-500" />}
                        {format === 'pesan' && (
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                      </span>
                    ))}
                    <span className="font-semibold text-slate-700">
                      Laporan: {formatReportTypesLabel(requiredReportFormats(task))}
                    </span>
                  </span>

                  <span className="text-[10px] text-slate-400">Oleh: {task.assignedByName}</span>
                </div>

                {/* Report preview or Action Buttons */}
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                  {/* Action for employee: submit report */}
                  {isMeAssignee && task.status !== 'Selesai' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTaskForReport(task);
                        setReportText(task.reportText || '');
                        setReportPhoto(
                          task.reportPhotoUrl
                            ? { name: task.reportPhotoName ?? 'Foto Bukti', url: task.reportPhotoUrl }
                            : null
                        );
                        setReportDocument(
                          task.reportDocumentUrl
                            ? {
                                name: task.reportDocumentName ?? 'Dokumen Bukti',
                                url: task.reportDocumentUrl,
                              }
                            : null
                        );
                        setReportError(null);
                      }}
                      className="w-full h-8 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:brightness-105 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      <span>{task.status === 'Menunggu Review' ? 'Ubah Laporan' : 'Kirim Laporan Pengerjaan'}</span>
                    </button>
                  )}

                  {/* Action for supervisor/admin: review report */}
                  {canCreateTask && task.status === 'Menunggu Review' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTaskForReview(task);
                        setReviewNotes(task.reviewNotes || '');
                      }}
                      className="w-full h-8 rounded-xl bg-[#0B2453] hover:bg-[#14397B] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <FileCheck className="w-3.5 h-3.5 text-[#F4CE6A]" />
                      <span>Review Laporan Tim</span>
                    </button>
                  )}

                  {task.status === 'Selesai' && (
                    <div className="w-full text-center text-xs font-bold text-emerald-700 flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Telah Selesai &amp; Divalidasi</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Buat Tugas Baru (Supervisor / Admin) */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="rounded-3xl bg-white w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden space-y-4 my-8">
            <div className="bg-gradient-to-r from-[#0B2453] to-[#143B80] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-5 rounded-full bg-[#F4CE6A]" />
                <h3 className="text-base font-extrabold">Buat Tugas / Instruksi Kerja Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              {createError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {createError}
                </div>
              )}

              {/* Apa saja yang perlu dikerjakan? */}
              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  1. Judul Tugas (Apa yang perlu dikerjakan?) *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Contoh: Periksa Kebersihan & Kerapian Lobby Utama"
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-xs focus:border-[#0B2453] focus:ring-1 focus:ring-[#0B2453]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  Deskripsi / Rincian Pekerjaan Detail *
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Jelaskan detail apa saja yang harus dicek, standar pengerjaan, dan catatan khusus..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-[#0B2453] focus:ring-1 focus:ring-[#0B2453]"
                  required
                />
              </div>

              {/* Siapa yang harus mengerjakan? */}
              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  2. Siapa yang harus mengerjakan? (Penanggung Jawab) *
                </label>
                <select
                  value={newAssigneeUid}
                  onChange={(e) => setNewAssigneeUid(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-xs font-semibold bg-white focus:border-[#0B2453] focus:ring-1 focus:ring-[#0B2453]"
                  required
                >
                  <option value="">-- Pilih Karyawan Penanggung Jawab --</option>
                  {assignableEmployees.map((emp) => (
                    <option key={emp.uid} value={emp.uid}>
                      {emp.name} ({emp.nik}) - Divisi: {emp.division} ({emp.position})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tanggal berapa? */}
              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  3. Tanggal Pengerjaan / Batas Waktu (Tanggal berapa?) *
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-xs font-mono font-semibold focus:border-[#0B2453] focus:ring-1 focus:ring-[#0B2453]"
                  required
                />
              </div>

              {/* Laporannya apa nantinya? */}
              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1.5">
                  4. Format Laporan yang Diwajibkan? * (bisa lebih dari satu)
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(
                    [
                      { value: 'gambar', label: 'Gambar / Foto Bukti', icon: ImageIcon, tone: 'text-indigo-600' },
                      { value: 'dokumen', label: 'Dokumen / Berkas', icon: FileText, tone: 'text-emerald-600' },
                      { value: 'pesan', label: 'Pesan / Catatan Teks', icon: MessageSquare, tone: 'text-amber-600' },
                    ] as const
                  ).map((option) => {
                    const Icon = option.icon;
                    const checked = newReportTypes.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          checked
                            ? 'border-[#0B2453] bg-indigo-50/50 text-[#0B2453] font-bold'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setNewReportTypes(
                              checked
                                ? newReportTypes.filter((item) => item !== option.value)
                                : [...newReportTypes, option.value]
                            )
                          }
                          className="accent-[#0B2453]"
                        />
                        <Icon className={`w-4 h-4 ${option.tone}`} />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  Karyawan wajib mengirim semua format yang dicentang, misal gambar bukti +
                  dokumen laporan.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-10 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="h-10 px-5 rounded-xl bg-[#0B2453] hover:bg-[#14397B] text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  <Plus className="w-4 h-4 text-[#F4CE6A]" />
                  <span>{createSubmitting ? 'Menyimpan...' : 'Simpan & Tugaskan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Kirim Laporan Tugas (Karyawan) */}
      {selectedTaskForReport && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="rounded-3xl bg-white w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden space-y-4 my-8">
            <div className="bg-gradient-to-r from-emerald-800 to-teal-800 p-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold">Kirim Laporan Pengerjaan Tugas</h3>
                <p className="text-xs text-emerald-200">{selectedTaskForReport.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskForReport(null)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReportSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
              {reportError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {reportError}
                </div>
              )}

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-xs font-bold text-slate-700">Instruksi Tugas:</div>
                <p className="text-xs text-slate-600">{selectedTaskForReport.description}</p>
                <div className="text-[11px] font-semibold text-indigo-700 pt-1">
                  Format yang diminta:{' '}
                  <span className="font-bold">
                    {formatReportTypesLabel(requiredReportFormats(selectedTaskForReport))}
                  </span>
                </div>
              </div>

              {/* Bukti Gambar/Foto */}
              {requiredReportFormats(selectedTaskForReport).includes('gambar') && (
                <div>
                  <label className="block text-xs font-bold text-[#0B2453] mb-1">
                    Bukti Gambar / Foto *
                  </label>
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors p-3 text-center">
                    <ImageIcon className="w-5 h-5 text-slate-400 mb-1" />
                    <span className="text-xs font-bold text-slate-700">
                      {reportPhoto ? reportPhoto.name : 'Pilih foto/gambar bukti (JPG, PNG)'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Maksimal 5 MB</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        readAttachment(e.target.files?.[0], 'image', (value) =>
                          setReportPhoto(value)
                        )
                      }
                      className="hidden"
                    />
                  </label>
                  {reportPhoto && (
                    <div className="mt-2 text-center">
                      <img
                        src={reportPhoto.url}
                        alt="Preview Bukti Gambar"
                        className="h-28 rounded-xl mx-auto object-cover border border-slate-200 shadow-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Bukti Dokumen/Berkas */}
              {requiredReportFormats(selectedTaskForReport).includes('dokumen') && (
                <div>
                  <label className="block text-xs font-bold text-[#0B2453] mb-1">
                    Bukti Dokumen / Berkas *
                  </label>
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors p-3 text-center">
                    <Paperclip className="w-5 h-5 text-slate-400 mb-1" />
                    <span className="text-xs font-bold text-slate-700">
                      {reportDocument
                        ? reportDocument.name
                        : 'Pilih dokumen (PDF, DOC, XLS, gambar)'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Maksimal 5 MB</span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                      onChange={(e) =>
                        readAttachment(e.target.files?.[0], 'document', (value) =>
                          setReportDocument(value)
                        )
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Pesan / Catatan Laporan */}
              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  Pesan / Catatan Laporan Pekerjaan{' '}
                  {requiredReportFormats(selectedTaskForReport).includes('pesan') ? '*' : '(opsional)'}
                </label>
                <textarea
                  rows={3}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  placeholder="Tuliskan keterangan detail pengerjaan, hasil, atau kendala..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForReport(null)}
                  className="h-10 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 cursor-pointer text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="h-10 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:brightness-105 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  <span>{reportSubmitting ? 'Mengirim...' : 'Kirim Laporan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Review Laporan Tugas (Supervisor & Admin) */}
      {selectedTaskForReview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="rounded-3xl bg-white w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden space-y-4 my-8">
            <div className="bg-gradient-to-r from-[#0B2453] to-[#143B80] p-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold">Review &amp; Validasi Laporan Tim</h3>
                <p className="text-xs text-slate-300">
                  Pekerja: {selectedTaskForReview.assignedToName} ({selectedTaskForReview.assignedToDivision})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskForReview(null)}
                className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs sm:text-sm">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                <div className="text-xs font-bold text-[#0B2453]">{selectedTaskForReview.title}</div>
                <p className="text-xs text-slate-600">{selectedTaskForReview.description}</p>
                <div className="text-[11px] text-slate-400">
                  Tenggat waktu: {selectedTaskForReview.dueDate} &bull; Laporan dikirim:{' '}
                  {selectedTaskForReview.submittedAt || '-'}
                </div>
              </div>

              {/* Laporan Karyawan */}
              <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-3.5 space-y-2.5">
                <div className="text-xs font-extrabold text-blue-900 flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4" />
                  <span>Hasil Laporan yang Dikirimkan:</span>
                </div>

                {selectedTaskForReview.reportText && (
                  <div className="p-2.5 rounded-xl bg-white border border-blue-100 text-xs text-slate-800 leading-relaxed">
                    &quot;{selectedTaskForReview.reportText}&quot;
                  </div>
                )}

                {selectedTaskForReview.reportPhotoUrl && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700">Bukti Gambar / Foto:</div>
                    <a
                      href={selectedTaskForReview.reportPhotoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <img
                        src={selectedTaskForReview.reportPhotoUrl}
                        alt="Bukti Gambar Pengerjaan"
                        className="max-h-48 rounded-xl object-contain border border-slate-200 bg-white"
                      />
                    </a>
                    <div className="text-[10px] text-slate-500">
                      {selectedTaskForReview.reportPhotoName}
                    </div>
                  </div>
                )}

                {selectedTaskForReview.reportDocumentUrl && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-700">Bukti Dokumen:</div>
                    <a
                      href={selectedTaskForReview.reportDocumentUrl}
                      download={selectedTaskForReview.reportDocumentName}
                      className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#0B2453] flex items-center gap-2 hover:bg-slate-50"
                    >
                      <Paperclip className="w-4 h-4 text-indigo-600" />
                      <span>
                        {selectedTaskForReview.reportDocumentName || 'Dokumen Lampiran'}
                      </span>
                      <span className="ml-auto text-[10px] font-semibold text-slate-400">
                        Unduh
                      </span>
                    </a>
                  </div>
                )}
              </div>

              {/* Catatan Review Atasan */}
              <div>
                <label className="block text-xs font-bold text-[#0B2453] mb-1">
                  Catatan Evaluasi / Catatan Atasan (Opsional)
                </label>
                <input
                  type="text"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Contoh: Pekerjaan rapi, ACC. atau Perlu perbaikan di bagian..."
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-xs focus:border-[#0B2453] focus:ring-1 focus:ring-[#0B2453]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={reviewSubmitting}
                  onClick={() => handleReviewAction('Ditolak')}
                  className="h-10 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <X className="w-4 h-4" />
                  <span>Minta Revisi / Tolak</span>
                </button>
                <button
                  type="button"
                  disabled={reviewSubmitting}
                  onClick={() => handleReviewAction('Selesai')}
                  className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  <span>Setujui Selesai (ACC)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

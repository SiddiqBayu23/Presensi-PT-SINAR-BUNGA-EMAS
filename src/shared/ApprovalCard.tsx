import React from 'react';
import { Check, X } from 'lucide-react';
import type { ApprovalStatus } from '../types/hris';

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const tone =
    status === 'Disetujui'
      ? 'text-emerald-700'
      : status === 'Ditolak'
        ? 'text-red-700'
        : 'text-amber-700';
  return <span className={`text-xs font-extrabold whitespace-nowrap ${tone}`}>{status}</span>;
}

interface ApprovalCardProps {
  title: React.ReactNode;
  meta: React.ReactNode;
  status: ApprovalStatus;
  statusBadge?: React.ReactNode;
  reason?: string;
  approveLabel?: string;
  onApprove?: () => void;
  onReject?: () => void;
}

/**
 * Kartu pengajuan dengan aksi persetujuan. Dipakai HRD (semua divisi) dan
 * supervisor (bawahan se-divisi) agar tampilan & perilaku persetujuan seragam.
 */
export function ApprovalCard({
  title,
  meta,
  status,
  statusBadge,
  reason,
  approveLabel = 'Setujui',
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const actionable = status === 'Menunggu' && Boolean(onApprove || onReject);
  return (
    <div className="rounded-2xl border border-slate-200 bg-[#F9FBFE] p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-[#0B2453]">{title}</div>
          <div className="text-xs text-slate-600">{meta}</div>
        </div>
        {statusBadge ?? <ApprovalStatusBadge status={status} />}
      </div>
      {reason && <p className="text-xs text-slate-600">{reason}</p>}
      {actionable && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {onApprove && (
            <button
              type="button"
              onClick={onApprove}
              className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> {approveLabel}
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="h-9 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Tolak
            </button>
          )}
        </div>
      )}
    </div>
  );
}

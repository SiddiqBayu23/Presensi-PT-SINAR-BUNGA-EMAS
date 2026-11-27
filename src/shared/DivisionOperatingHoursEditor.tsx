import React, { useState, useMemo } from 'react';
import {
  Clock,
  Pencil,
  Check,
  X,
  RotateCcw,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { useHris } from '../context/HrisContext';
import type { Division, ShiftCode } from '../types/hris';
import {
  resolveDivisionShiftRule,
  resolveShiftTolerance,
  shiftTemplateName,
} from '../utils/hrisLogic';

interface DivisionOperatingHoursEditorProps {
  division: Division;
  onShowToast?: (message: string) => void;
}

export function DivisionOperatingHoursEditor({
  division,
  onShowToast,
}: DivisionOperatingHoursEditorProps) {
  const {
    currentUser,
    divisionShiftRules,
    updateDivisionShiftRule,
    shiftTemplateFor,
  } = useHris();

  const isHrd = currentUser?.role === 'hrd';
  const isSupervisor = currentUser?.role === 'supervisor';
  const canEdit = isHrd || (isSupervisor && currentUser?.division === division);

  const rule = useMemo(() => {
    return resolveDivisionShiftRule(division, divisionShiftRules);
  }, [division, divisionShiftRules]);

  const [isEditing, setIsEditing] = useState(false);
  const [draftTimes, setDraftTimes] = useState<
    Partial<Record<ShiftCode, { startTime: string; endTime: string }>>
  >({});
  const [draftDefaultShift, setDraftDefaultShift] = useState<ShiftCode>(rule.defaultShiftCode);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    const initial: Partial<Record<ShiftCode, { startTime: string; endTime: string }>> = {};
    rule.allowedShiftCodes.forEach((code) => {
      const tpl = shiftTemplateFor(code, division);
      initial[code] = {
        startTime: tpl.startTime,
        endTime: tpl.endTime,
      };
    });
    setDraftTimes(initial);
    setDraftDefaultShift(rule.defaultShiftCode);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const res = await updateDivisionShiftRule(division, {
      allowedShiftCodes: rule.allowedShiftCodes,
      defaultShiftCode: draftDefaultShift,
      shiftTimes: draftTimes,
    });

    setSaving(false);
    if (res.ok) {
      setIsEditing(false);
      onShowToast?.(`Jam operasional divisi ${division} berhasil diperbarui.`);
    } else {
      onShowToast?.(res.error ?? 'Gagal memperbarui jam operasional.');
    }
  };

  const defaultTemplate = shiftTemplateFor(rule.defaultShiftCode, division);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs space-y-4">
      {/* Header Kartu Jam Operasional */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-[#C69214]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold text-[#0B2453]">
                Jam Operasional Divisi: {division}
              </h2>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Bawaan: {defaultTemplate.name}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Jam masuk &amp; pulang kerja yang berlaku untuk seluruh staf divisi {division}.
            </p>
          </div>
        </div>

        {canEdit && !isEditing && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#0B2453] text-xs font-bold cursor-pointer transition-colors shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit Jam Operasional</span>
          </button>
        )}
      </div>

      {/* Mode Tampilan Normal (Read-Only) */}
      {!isEditing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rule.allowedShiftCodes.map((code) => {
            const tpl = shiftTemplateFor(code, division);
            const tol = resolveShiftTolerance(code, rule);
            const isDefault = code === rule.defaultShiftCode;
            return (
              <div
                key={code}
                className={`p-3 rounded-2xl border transition-all ${
                  isDefault
                    ? 'border-[#C69214] bg-[#FFFBEB]/50'
                    : 'border-slate-200/80 bg-[#F8FAFD]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-xs font-extrabold text-[#0B2453]">{tpl.name}</span>
                  {isDefault && (
                    <span className="text-[9px] font-extrabold text-[#9A6F0B] uppercase bg-amber-100/80 px-1.5 py-0.5 rounded">
                      Shift Bawaan
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold font-mono text-slate-800 tabular-nums">
                  {tpl.startTime} – {tpl.endTime} WIB
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  Masuk: awal {tol.earlyInMinutes}m, telat {tol.lateInMinutes}m &bull; Pulang: awal{' '}
                  {tol.earlyOutMinutes}m, telat {tol.lateOutMinutes}m
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Mode Edit Jam Kerja per Shift */
        <form onSubmit={handleSave} className="space-y-4">
          <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-[#0B2453]">
            💡 <strong>Panduan Supervisor:</strong> Masukkan jam masuk dan jam pulang kerja untuk
            setiap shift di bawah ini. Anda juga bisa memilih shift bawaan untuk karyawan baru.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rule.allowedShiftCodes.map((code) => {
              const baseTpl = shiftTemplateFor(code, division);
              const times = draftTimes[code] ?? {
                startTime: baseTpl.startTime,
                endTime: baseTpl.endTime,
              };
              const isDefault = draftDefaultShift === code;

              return (
                <div
                  key={code}
                  className={`p-3.5 rounded-2xl border space-y-2.5 ${
                    isDefault
                      ? 'border-[#0B2453] bg-blue-50/30'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#0B2453]">{baseTpl.name}</span>
                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-600 cursor-pointer">
                      <input
                        type="radio"
                        name="defaultShiftRadio"
                        checked={isDefault}
                        onChange={() => setDraftDefaultShift(code)}
                        className="accent-[#0B2453]"
                      />
                      <span>Bawaan</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        Jam Masuk
                      </label>
                      <input
                        type="time"
                        value={times.startTime}
                        onChange={(e) => {
                          setDraftTimes((prev) => ({
                            ...prev,
                            [code]: { ...times, startTime: e.target.value },
                          }));
                        }}
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 font-mono text-xs font-bold text-slate-800 focus:border-[#0B2453] focus:outline-none"
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-400 mt-4">–</span>
                    <div className="flex-1">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                        Jam Pulang
                      </label>
                      <input
                        type="time"
                        value={times.endTime}
                        onChange={(e) => {
                          setDraftTimes((prev) => ({
                            ...prev,
                            [code]: { ...times, endTime: e.target.value },
                          }));
                        }}
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 font-mono text-xs font-bold text-slate-800 focus:border-[#0B2453] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-4 rounded-xl bg-[#0B2453] hover:bg-[#163A7A] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Jam Operasional'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

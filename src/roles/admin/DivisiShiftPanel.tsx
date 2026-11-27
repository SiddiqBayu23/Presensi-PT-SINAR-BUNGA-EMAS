import React, { useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useHris } from '../../context/HrisContext';
import type { ShiftCode, ShiftTolerance } from '../../types/hris';
import {
  SHIFT_TEMPLATES,
  resolveDivisionShiftRule,
  resolveShiftTolerance,
  shiftTemplateName,
} from '../../utils/hrisLogic';

interface DivisiShiftPanelProps {
  onShowToast: (message: string) => void;
}

const EMPTY_SHIFT_DRAFT = {
  name: '',
  startTime: '08:00',
  endTime: '17:00',
  toleranceMinutes: 10,
  earlyOutMinutes: 15,
  lateOutMinutes: 15,
};

const EMPTY_CATALOG_DRAFT = {
  name: '',
  startTime: '08:00',
  endTime: '17:00',
  toleranceMinutes: 10,
  earlyOutMinutes: 15,
  lateOutMinutes: 15,
};

/**
 * Tab "Kelola Divisi": daftar divisi dengan ringkasan jam kerja, pengaturan shift
 * (jam + toleransi) yang bisa dibuka per divisi, dan katalog shift HRD.
 */
export function DivisiShiftPanel({ onShowToast }: DivisiShiftPanelProps) {
  const {
    employees,
    divisions,
    addDivision,
    deleteDivision,
    clearAllDivisions,
    divisionShiftRules,
    updateDivisionShiftRule,
    shiftTemplateFor,
    shiftTemplates,
    hiddenShiftCodes,
    addShiftTemplate,
    updateShiftTemplate,
    deleteShiftTemplate,
    restoreShiftTemplate,
  } = useHris();

  const [newDivName, setNewDivName] = useState('');
  const [submittingDiv, setSubmittingDiv] = useState(false);
  /** Divisi yang sedang membuka panel pengaturan shift (null = semua tertutup). */
  const [expandedDivision, setExpandedDivision] = useState<string | null>(null);
  /** Divisi yang sedang membuka form "+ Tambah shift" (null = tertutup). */
  const [shiftPanelDivision, setShiftPanelDivision] = useState<string | null>(null);
  const [newShift, setNewShift] = useState(EMPTY_SHIFT_DRAFT);
  /** Shift dari katalog yang akan ditambahkan ke divisi (kosong = buat shift baru). */
  const [pickedShiftCode, setPickedShiftCode] = useState('');
  const [savingShift, setSavingShift] = useState(false);
  /** Shift (`divisi::kode`) yang membuka rincian toleransi absensi. */
  const [openTolerance, setOpenTolerance] = useState<string | null>(null);
  const [catalogForm, setCatalogForm] = useState<
    { mode: 'add' } | { mode: 'edit'; code: string } | null
  >(null);
  const [catalogDraft, setCatalogDraft] = useState(EMPTY_CATALOG_DRAFT);

  /** Katalog shift aktif (bawaan yang belum dihapus + buatan HRD) dari context. */
  const shiftCatalog = shiftTemplates;

  const submitCatalogShift = (e: React.FormEvent) => {
    e.preventDefault();
    const editing = catalogForm?.mode === 'edit' ? catalogForm.code : null;
    const res = editing
      ? updateShiftTemplate(editing, catalogDraft)
      : addShiftTemplate(catalogDraft);
    if (!res.ok) {
      onShowToast(res.error);
      return;
    }
    onShowToast(
      editing
        ? `Shift ${shiftTemplateName(editing)} diperbarui.`
        : `Shift "${catalogDraft.name.trim()}" ditambahkan ke katalog shift.`
    );
    setCatalogForm(null);
    setCatalogDraft(EMPTY_CATALOG_DRAFT);
  };

  const removeCatalogShift = (code: ShiftCode, name: string) => {
    const builtin = Boolean(SHIFT_TEMPLATES[code]);
    if (
      !window.confirm(
        builtin
          ? `Hapus shift bawaan "${name}" dari katalog? Shift ini berhenti ditawarkan ke divisi/karyawan baru; karyawan yang masih memakainya harus dipindah lebih dulu. Bisa dipulihkan lewat "Pulihkan shift".`
          : `Hapus shift "${name}" dari katalog? Shift yang masih dipakai karyawan tidak bisa dihapus.`
      )
    ) {
      return;
    }
    const res = deleteShiftTemplate(code);
    onShowToast(res.ok ? `Shift "${name}" dihapus dari katalog.` : res.error);
    if (res.ok && catalogForm?.mode === 'edit' && catalogForm.code === code) setCatalogForm(null);
  };

  const restoreCatalogShift = (code: ShiftCode, name: string) => {
    const res = restoreShiftTemplate(code);
    onShowToast(
      res.ok ? `Shift "${name}" dipulihkan ke katalog.` : res.error ?? 'Gagal memulihkan shift.'
    );
  };

  const catalogFields = (
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
      <label className="block text-[10px] font-bold text-slate-500 space-y-1 sm:col-span-2">
        <span>Nama shift</span>
        <input
          type="text"
          value={catalogDraft.name}
          onChange={(e) => setCatalogDraft({ ...catalogDraft, name: e.target.value })}
          placeholder="mis. Shift Sore"
          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold"
        />
      </label>
      <label className="block text-[10px] font-bold text-slate-500 space-y-1 sm:col-span-2">
        <span>Jam masuk</span>
        <input
          type="time"
          value={catalogDraft.startTime}
          onChange={(e) => setCatalogDraft({ ...catalogDraft, startTime: e.target.value })}
          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 font-mono text-xs font-bold"
        />
      </label>
      <label className="block text-[10px] font-bold text-slate-500 space-y-1 sm:col-span-2">
        <span>Jam pulang</span>
        <input
          type="time"
          value={catalogDraft.endTime}
          onChange={(e) => setCatalogDraft({ ...catalogDraft, endTime: e.target.value })}
          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 font-mono text-xs font-bold"
        />
      </label>
      <label className="block text-[10px] font-bold text-slate-500 space-y-1 sm:col-span-2">
        <span>Telat masuk (menit)</span>
        <input
          type="number"
          min={0}
          max={720}
          value={catalogDraft.toleranceMinutes}
          onChange={(e) =>
            setCatalogDraft({ ...catalogDraft, toleranceMinutes: Number(e.target.value) })
          }
          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold"
        />
      </label>
      <label className="block text-[10px] font-bold text-slate-500 space-y-1 sm:col-span-2">
        <span>Pulang awal (menit)</span>
        <input
          type="number"
          min={0}
          max={720}
          value={catalogDraft.earlyOutMinutes}
          onChange={(e) =>
            setCatalogDraft({ ...catalogDraft, earlyOutMinutes: Number(e.target.value) })
          }
          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold"
        />
      </label>
      <label className="block text-[10px] font-bold text-slate-500 space-y-1 sm:col-span-2">
        <span>Telat pulang (menit)</span>
        <input
          type="number"
          min={0}
          max={720}
          value={catalogDraft.lateOutMinutes}
          onChange={(e) =>
            setCatalogDraft({ ...catalogDraft, lateOutMinutes: Number(e.target.value) })
          }
          className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold"
        />
      </label>
    </div>
  );

  const totalRegistered = employees.filter((emp) =>
    divisions.some((div) => div.toLowerCase() === emp.division.toLowerCase())
  ).length;

  return (
    <div className="space-y-5">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Divisi</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {divisions.length}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Karyawan Terdaftar</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {totalRegistered}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Shift di Katalog</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {shiftCatalog.length}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Shift Buatan HRD</div>
          <div className="mt-1 text-2xl font-extrabold text-[#0B2453] tabular-nums">
            {shiftCatalog.filter((tpl) => tpl.custom).length}
          </div>
        </div>
      </div>

      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#0B2453] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#C69214]" />
              <span>Kelola Divisi &amp; Jam Kerja</span>
            </h2>
            <p className="text-xs text-slate-500">
              Tentukan shift mana yang boleh dipakai tiap divisi, jam masuk/pulangnya, dan shift
              bawaannya. Security bisa 24 jam, Cleaning Service cukup sampai sore.
            </p>
          </div>
          <button
            type="button"
            disabled={divisions.length === 0}
            onClick={async () => {
              const assigned = employees.filter((emp) =>
                divisions.some((div) => div.toLowerCase() === emp.division.toLowerCase())
              ).length;
              const warn =
                assigned > 0
                  ? `\n\nPerhatian: ${assigned} karyawan masih memakai divisi ini. Label divisi mereka tetap tersimpan, tetapi menambah/memindah karyawan perlu divisi baru.`
                  : '';
              if (
                !window.confirm(
                  `Hapus SEMUA ${divisions.length} divisi beserta aturan jam kerjanya?${warn}`
                )
              ) {
                return;
              }
              const res = await clearAllDivisions();
              setExpandedDivision(null);
              onShowToast(
                res.ok
                  ? `Semua divisi (${divisions.length}) beserta aturan shift dihapus.`
                  : res.error ?? 'Gagal menghapus divisi.'
              );
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-extrabold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed self-start"
          >
            <Trash2 className="w-4 h-4" />
            <span>Hapus Semua Divisi</span>
          </button>
        </div>

        {/* Tambah divisi */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newDivName.trim()) return;
            setSubmittingDiv(true);
            const res = await addDivision(newDivName.trim());
            setSubmittingDiv(false);
            if (!res.ok) {
              onShowToast(res.error || 'Gagal menambahkan divisi.');
              return;
            }
            const created = newDivName.trim();
            setNewDivName('');
            onShowToast(`Divisi "${created}" ditambahkan. Atur shift yang boleh dipakainya di kartu divisi.`);
          }}
          className="rounded-2xl bg-[#F8FAFD] border border-slate-200 p-4 space-y-2"
        >
          <div className="text-xs font-extrabold text-[#0B2453]">Tambah Divisi Baru</div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={newDivName}
              onChange={(e) => setNewDivName(e.target.value)}
              placeholder="Nama divisi baru, mis. Logistik & Gudang"
              className="w-full sm:flex-1 h-10 rounded-xl border border-slate-300 px-3 text-xs bg-white focus:border-[#0B2453] focus:ring-1 focus:ring-[#0B2453]"
            />
            <button
              type="submit"
              disabled={submittingDiv || !newDivName.trim()}
              className="w-full sm:w-auto h-10 px-5 rounded-xl bg-[#0B2453] hover:bg-[#143B7F] text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4 text-[#F4CE6A]" />
              <span>{submittingDiv ? 'Menyimpan...' : 'Tambah Divisi'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Divisi baru otomatis memakai shift Reguler sebagai bawaan. Ubah lewat tombol
            &ldquo;Atur shift&rdquo; di kartunya.
          </p>
        </form>

        {divisions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
            Belum ada divisi. Tambahkan divisi lebih dulu agar karyawan bisa ditempatkan.
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
            {divisions.map((div) => {
              const memberCount = employees.filter(
                (e) => e.division.toLowerCase() === div.toLowerCase()
              ).length;
              const rule = resolveDivisionShiftRule(div, divisionShiftRules);
              const expanded = expandedDivision === div;
              const defaultTemplate = shiftTemplateFor(rule.defaultShiftCode, div);
              return (
                <div
                  key={div}
                  className={`rounded-2xl border bg-white transition-all shadow-2xs ${
                    expanded ? 'border-[#C69214] xl:col-span-2' : 'border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  {/* Kepala kartu */}
                  <div className="p-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-[#B6810C]" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="text-sm font-extrabold text-[#0B2453] truncate">{div}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {memberCount} karyawan
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Bawaan {defaultTemplate.name} {defaultTemplate.startTime}–
                            {defaultTemplate.endTime}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {rule.allowedShiftCodes.map((code) => {
                            const tpl = shiftTemplateFor(code, div);
                            const isDefault = code === rule.defaultShiftCode;
                            return (
                              <span
                                key={code}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                                  isDefault
                                    ? 'bg-[#0B2453] text-white border-[#0B2453]'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                {tpl.name} {tpl.startTime}–{tpl.endTime}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => {
                          setExpandedDivision(expanded ? null : div);
                          setShiftPanelDivision(null);
                          setOpenTolerance(null);
                        }}
                        className={`inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-extrabold border cursor-pointer transition-colors ${
                          expanded
                            ? 'bg-[#0B2453] text-white border-[#0B2453]'
                            : 'bg-white text-[#0B2453] border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {expanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        <span>{expanded ? 'Tutup' : 'Atur shift'}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus divisi ${div}`}
                        onClick={async () => {
                          const warn =
                            memberCount > 0
                              ? `\n\nPerhatian: ${memberCount} karyawan masih terdaftar di divisi ini. Label divisi mereka tetap tersimpan.`
                              : '';
                          if (
                            !window.confirm(
                              `Hapus divisi "${div}" beserta aturan jam kerjanya?${warn}`
                            )
                          ) {
                            return;
                          }
                          const res = await deleteDivision(div);
                          if (expandedDivision === div) setExpandedDivision(null);
                          onShowToast(
                            res.ok ? `Divisi "${div}" dihapus.` : res.error ?? 'Gagal menghapus divisi.'
                          );
                        }}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Panel pengaturan shift */}
                  {expanded && (
                    <div className="border-t border-slate-100 bg-[#F8FAFD] rounded-b-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Shift yang boleh dipakai
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Centang untuk mengaktifkan
                        </span>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5 items-start">
                        {shiftCatalog.map((base) => {
                          const code = base.code;
                          const tpl = shiftTemplateFor(code, div);
                          const checked = rule.allowedShiftCodes.includes(code);
                          const isLastAllowed = checked && rule.allowedShiftCodes.length === 1;
                          const isCustomTime =
                            tpl.startTime !== base.startTime || tpl.endTime !== base.endTime;
                          const toleranceKey = `${div}::${code}`;
                          const toleranceOpen = openTolerance === toleranceKey;
                          const saveShiftTime = async (startTime: string, endTime: string) => {
                            const res = await updateDivisionShiftRule(div, {
                              allowedShiftCodes: rule.allowedShiftCodes,
                              defaultShiftCode: rule.defaultShiftCode,
                              shiftTimes: { ...rule.shiftTimes, [code]: { startTime, endTime } },
                            });
                            onShowToast(
                              res.ok
                                ? `Jam ${base.name} divisi ${div}: ${startTime}–${endTime}.`
                                : res.error ?? 'Gagal menyimpan jam shift.'
                            );
                          };
                          const tolerance = resolveShiftTolerance(code, rule);
                          const saveTolerance = async (patch: Partial<ShiftTolerance>) => {
                            const res = await updateDivisionShiftRule(div, {
                              allowedShiftCodes: rule.allowedShiftCodes,
                              defaultShiftCode: rule.defaultShiftCode,
                              shiftTolerances: {
                                ...rule.shiftTolerances,
                                [code]: { ...tolerance, ...patch },
                              },
                            });
                            onShowToast(
                              res.ok
                                ? `Toleransi ${base.name} divisi ${div} disimpan.`
                                : res.error ?? 'Gagal menyimpan toleransi absensi.'
                            );
                          };
                          return (
                            <div
                              key={code}
                              className={`rounded-xl border px-3 py-2 space-y-2 ${
                                checked
                                  ? 'border-slate-200 bg-white'
                                  : 'border-slate-200/70 bg-slate-50/60'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <label
                                  className={`flex items-center gap-2 text-xs min-w-0 ${
                                    isLastAllowed
                                      ? 'cursor-not-allowed text-slate-500'
                                      : 'cursor-pointer text-slate-700'
                                  }`}
                                  title={
                                    isLastAllowed
                                      ? 'Divisi harus memakai minimal satu shift.'
                                      : undefined
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={isLastAllowed}
                                    onChange={async () => {
                                      const nextAllowed = checked
                                        ? rule.allowedShiftCodes.filter((c) => c !== code)
                                        : [...rule.allowedShiftCodes, code];
                                      const nextDefault = nextAllowed.includes(
                                        rule.defaultShiftCode
                                      )
                                        ? rule.defaultShiftCode
                                        : (nextAllowed[0] ?? rule.defaultShiftCode);
                                      const res = await updateDivisionShiftRule(div, {
                                        allowedShiftCodes: nextAllowed,
                                        defaultShiftCode: nextDefault,
                                      });
                                      if (!res.ok)
                                        onShowToast(res.error ?? 'Gagal menyimpan aturan shift.');
                                    }}
                                    className="w-3.5 h-3.5 accent-[#0B2453]"
                                  />
                                  <span className="font-bold truncate">{base.name}</span>
                                  {base.custom && (
                                    <span className="shrink-0 text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                      Kustom
                                    </span>
                                  )}
                                  {rule.defaultShiftCode === code && (
                                    <span className="shrink-0 text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                      Bawaan
                                    </span>
                                  )}
                                </label>
                                {!checked && (
                                  <span className="text-slate-400 font-mono text-[10px] shrink-0">
                                    {base.startTime}–{base.endTime}
                                  </span>
                                )}
                              </div>

                              {checked && (
                                <div className="space-y-2 border-t border-dashed border-slate-200 pt-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="w-[56px] shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                      Jam kerja
                                    </span>
                                    <input
                                      type="time"
                                      aria-label={`Jam masuk ${base.name} divisi ${div}`}
                                      value={tpl.startTime}
                                      onChange={(e) => {
                                        if (e.target.value)
                                          void saveShiftTime(e.target.value, tpl.endTime);
                                      }}
                                      className="h-8 w-[86px] rounded-lg border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-bold text-slate-700"
                                    />
                                    <span className="text-[10px] text-slate-400">s/d</span>
                                    <input
                                      type="time"
                                      aria-label={`Jam pulang ${base.name} divisi ${div}`}
                                      value={tpl.endTime}
                                      onChange={(e) => {
                                        if (e.target.value)
                                          void saveShiftTime(tpl.startTime, e.target.value);
                                      }}
                                      className="h-8 w-[86px] rounded-lg border border-slate-300 bg-white px-1.5 font-mono text-[11px] font-bold text-slate-700"
                                    />
                                    {isCustomTime && (
                                      <button
                                        type="button"
                                        aria-label={`Kembalikan jam bawaan ${base.name} divisi ${div}`}
                                        title="Kembalikan jam bawaan"
                                        onClick={() =>
                                          void saveShiftTime(base.startTime, base.endTime)
                                        }
                                        className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Bawaan
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      aria-expanded={toleranceOpen}
                                      onClick={() =>
                                        setOpenTolerance(toleranceOpen ? null : toleranceKey)
                                      }
                                      className="ml-auto inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[10px] font-bold text-slate-500 hover:text-[#0B2453] hover:bg-slate-100 cursor-pointer"
                                    >
                                      <Clock className="w-3 h-3" />
                                      <span>Toleransi</span>
                                      {toleranceOpen ? (
                                        <ChevronUp className="w-3 h-3" />
                                      ) : (
                                        <ChevronDown className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                                    <span>
                                      Masuk: awal{' '}
                                      <strong className="text-slate-700">
                                        {tolerance.earlyInMinutes} menit
                                      </strong>
                                      , telat{' '}
                                      <strong className="text-slate-700">
                                        {tolerance.lateInMinutes} menit
                                      </strong>
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <span>
                                      Pulang: awal{' '}
                                      <strong className="text-slate-700">
                                        {tolerance.earlyOutMinutes} menit
                                      </strong>
                                      , telat{' '}
                                      <strong className="text-slate-700">
                                        {tolerance.lateOutMinutes} menit
                                      </strong>
                                    </span>
                                  </div>

                                  {toleranceOpen && (
                                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2 space-y-2">
                                      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                        Toleransi absensi (menit)
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        <div className="rounded-lg border border-slate-200/80 bg-white p-2 space-y-1.5">
                                          <div className="text-[10px] font-extrabold text-[#0B2453]">
                                            Batas waktu masuk
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <label className="block">
                                              <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                                                Masuk awal
                                              </span>
                                              <input
                                                key={`${toleranceKey}-earlyIn-${tolerance.earlyInMinutes}`}
                                                type="number"
                                                min={0}
                                                max={720}
                                                defaultValue={tolerance.earlyInMinutes}
                                                aria-label={`Toleransi masuk awal ${base.name} divisi ${div}`}
                                                onBlur={(e) => {
                                                  if (e.target.value.trim() === '') {
                                                    e.target.value = String(tolerance.earlyInMinutes);
                                                    return;
                                                  }
                                                  const next = Math.min(
                                                    720,
                                                    Math.max(0, Math.round(Number(e.target.value)))
                                                  );
                                                  if (Number.isFinite(next) && next !== tolerance.earlyInMinutes) {
                                                    void saveTolerance({ earlyInMinutes: next });
                                                  }
                                                }}
                                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"
                                              />
                                            </label>
                                            <label className="block">
                                              <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                                                Telat
                                              </span>
                                              <input
                                                key={`${toleranceKey}-lateIn-${tolerance.lateInMinutes}`}
                                                type="number"
                                                min={0}
                                                max={720}
                                                defaultValue={tolerance.lateInMinutes}
                                                aria-label={`Toleransi keterlambatan ${base.name} divisi ${div}`}
                                                onBlur={(e) => {
                                                  if (e.target.value.trim() === '') {
                                                    e.target.value = String(tolerance.lateInMinutes);
                                                    return;
                                                  }
                                                  const next = Math.min(
                                                    720,
                                                    Math.max(0, Math.round(Number(e.target.value)))
                                                  );
                                                  if (Number.isFinite(next) && next !== tolerance.lateInMinutes) {
                                                    void saveTolerance({ lateInMinutes: next });
                                                  }
                                                }}
                                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"
                                              />
                                            </label>
                                          </div>
                                        </div>

                                        <div className="rounded-lg border border-slate-200/80 bg-white p-2 space-y-1.5">
                                          <div className="text-[10px] font-extrabold text-[#0B2453]">
                                            Toleransi batas waktu pulang
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <label className="block">
                                              <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                                                Pulang awal
                                              </span>
                                              <input
                                                key={`${toleranceKey}-earlyOut-${tolerance.earlyOutMinutes}`}
                                                type="number"
                                                min={0}
                                                max={720}
                                                defaultValue={tolerance.earlyOutMinutes}
                                                aria-label={`Toleransi pulang awal ${base.name} divisi ${div}`}
                                                onBlur={(e) => {
                                                  if (e.target.value.trim() === '') {
                                                    e.target.value = String(tolerance.earlyOutMinutes);
                                                    return;
                                                  }
                                                  const next = Math.min(
                                                    720,
                                                    Math.max(0, Math.round(Number(e.target.value)))
                                                  );
                                                  if (Number.isFinite(next) && next !== tolerance.earlyOutMinutes) {
                                                    void saveTolerance({ earlyOutMinutes: next });
                                                  }
                                                }}
                                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"
                                              />
                                            </label>
                                            <label className="block">
                                              <span className="mb-0.5 block text-[10px] font-semibold text-slate-500">
                                                Telat
                                              </span>
                                              <input
                                                key={`${toleranceKey}-lateOut-${tolerance.lateOutMinutes}`}
                                                type="number"
                                                min={0}
                                                max={720}
                                                defaultValue={tolerance.lateOutMinutes}
                                                aria-label={`Toleransi telat pulang ${base.name} divisi ${div}`}
                                                onBlur={(e) => {
                                                  if (e.target.value.trim() === '') {
                                                    e.target.value = String(tolerance.lateOutMinutes);
                                                    return;
                                                  }
                                                  const next = Math.min(
                                                    720,
                                                    Math.max(0, Math.round(Number(e.target.value)))
                                                  );
                                                  if (Number.isFinite(next) && next !== tolerance.lateOutMinutes) {
                                                    void saveTolerance({ lateOutMinutes: next });
                                                  }
                                                }}
                                                className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700"
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Tambah shift ke divisi */}
                      {shiftPanelDivision === div ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setSavingShift(true);
                            let target = pickedShiftCode;
                            if (!target) {
                              const created = addShiftTemplate(newShift);
                              if (!created.ok) {
                                setSavingShift(false);
                                onShowToast(created.error);
                                return;
                              }
                              target = created.code;
                            }
                            const res = await updateDivisionShiftRule(div, {
                              allowedShiftCodes: rule.allowedShiftCodes.includes(target)
                                ? rule.allowedShiftCodes
                                : [...rule.allowedShiftCodes, target],
                              defaultShiftCode: rule.defaultShiftCode,
                            });
                            setSavingShift(false);
                            if (!res.ok) {
                              onShowToast(res.error ?? 'Gagal menyimpan shift divisi.');
                              return;
                            }
                            onShowToast(
                              `Shift ${shiftTemplateName(target)} ${
                                pickedShiftCode ? 'ditambahkan ke' : 'dibuat dan dipakai oleh'
                              } divisi ${div}.`
                            );
                            setShiftPanelDivision(null);
                            setPickedShiftCode('');
                            setNewShift(EMPTY_SHIFT_DRAFT);
                          }}
                          className="rounded-xl border border-dashed border-[#C69214]/70 bg-amber-50/50 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#B6810C]">
                              Tambah shift untuk {div}
                            </span>
                            <button
                              type="button"
                              aria-label="Tutup form tambah shift"
                              onClick={() => {
                                setShiftPanelDivision(null);
                                setPickedShiftCode('');
                              }}
                              className="inline-flex items-center justify-center h-6 w-6 rounded-lg text-slate-500 hover:bg-white cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <label className="block text-[10px] font-bold text-slate-500 space-y-1">
                            <span>Pakai shift yang sudah ada</span>
                            <select
                              aria-label={`Pilih shift yang sudah ada untuk divisi ${div}`}
                              value={pickedShiftCode}
                              onChange={(e) => setPickedShiftCode(e.target.value)}
                              className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold"
                            >
                              <option value="">— Buat shift baru —</option>
                              {shiftCatalog
                                .filter((tpl) => !rule.allowedShiftCodes.includes(tpl.code))
                                .map((tpl) => (
                                  <option key={tpl.code} value={tpl.code}>
                                    {tpl.name} ({tpl.startTime}–{tpl.endTime})
                                  </option>
                                ))}
                            </select>
                          </label>
                          {!pickedShiftCode && (
                            <>
                              <label className="block text-[10px] font-bold text-slate-500 space-y-1">
                                <span>Nama shift</span>
                                <input
                                  type="text"
                                  value={newShift.name}
                                  onChange={(e) =>
                                    setNewShift({ ...newShift, name: e.target.value })
                                  }
                                  placeholder="mis. Shift Sore"
                                  className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold"
                                />
                              </label>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                <label className="text-[10px] font-bold text-slate-500 space-y-1">
                                  <span>Jam masuk</span>
                                  <input
                                    type="time"
                                    value={newShift.startTime}
                                    onChange={(e) =>
                                      setNewShift({ ...newShift, startTime: e.target.value })
                                    }
                                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 font-mono text-[11px] font-bold"
                                  />
                                </label>
                                <label className="text-[10px] font-bold text-slate-500 space-y-1">
                                  <span>Jam pulang</span>
                                  <input
                                    type="time"
                                    value={newShift.endTime}
                                    onChange={(e) =>
                                      setNewShift({ ...newShift, endTime: e.target.value })
                                    }
                                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 font-mono text-[11px] font-bold"
                                  />
                                </label>
                                <label className="text-[10px] font-bold text-slate-500 space-y-1">
                                  <span>Telat masuk (mnt)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={720}
                                    value={newShift.toleranceMinutes}
                                    onChange={(e) =>
                                      setNewShift({
                                        ...newShift,
                                        toleranceMinutes: Number(e.target.value),
                                      })
                                    }
                                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold"
                                  />
                                </label>
                                <label className="text-[10px] font-bold text-slate-500 space-y-1">
                                  <span>Pulang awal (mnt)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={720}
                                    value={newShift.earlyOutMinutes}
                                    onChange={(e) =>
                                      setNewShift({
                                        ...newShift,
                                        earlyOutMinutes: Number(e.target.value),
                                      })
                                    }
                                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold"
                                  />
                                </label>
                                <label className="text-[10px] font-bold text-slate-500 space-y-1 col-span-2 sm:col-span-1">
                                  <span>Telat pulang (mnt)</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={720}
                                    value={newShift.lateOutMinutes}
                                    onChange={(e) =>
                                      setNewShift({
                                        ...newShift,
                                        lateOutMinutes: Number(e.target.value),
                                      })
                                    }
                                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold"
                                  />
                                </label>
                              </div>
                            </>
                          )}
                          <button
                            type="submit"
                            disabled={
                              savingShift || (!pickedShiftCode && newShift.name.trim().length < 2)
                            }
                            className="w-full h-9 rounded-xl bg-[#0B2453] hover:bg-[#143B7F] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-4 h-4 text-[#F4CE6A]" />
                            <span>
                              {savingShift
                                ? 'Menyimpan...'
                                : pickedShiftCode
                                  ? 'Tambahkan ke divisi'
                                  : 'Buat shift & pakai di divisi ini'}
                            </span>
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setShiftPanelDivision(div);
                            setPickedShiftCode('');
                          }}
                          className="w-full h-9 rounded-xl border border-dashed border-[#C69214] text-[#B6810C] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 hover:bg-amber-50 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Tambah shift ke divisi ini</span>
                        </button>
                      )}

                      <label className="block text-[10px] font-bold text-slate-500 space-y-1">
                        <span>Shift bawaan (dipakai saat karyawan baru ditambahkan)</span>
                        <select
                          aria-label={`Shift bawaan divisi ${div}`}
                          value={rule.defaultShiftCode}
                          onChange={async (e) => {
                            const nextDefault = e.target.value as ShiftCode;
                            const res = await updateDivisionShiftRule(div, {
                              allowedShiftCodes: rule.allowedShiftCodes,
                              defaultShiftCode: nextDefault,
                            });
                            if (!res.ok) onShowToast(res.error ?? 'Gagal menyimpan aturan shift.');
                            else
                              onShowToast(
                                `Shift bawaan ${div}: ${shiftTemplateName(nextDefault)}.`
                              );
                          }}
                          className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold"
                        >
                          {rule.allowedShiftCodes.map((code) => (
                            <option key={code} value={code}>
                              {shiftTemplateName(code)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Katalog shift */}
      <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-xs border border-slate-200/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#0B2453] inline-flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#C69214]" />
              <span>Katalog Shift</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {shiftCatalog.length} shift tersedia. Shift buatan HRD bisa dipakai divisi mana pun
              lewat &ldquo;Tambah shift&rdquo;. Shift bawaan boleh dihapus &amp; dipulihkan kapan
              saja.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCatalogDraft(EMPTY_CATALOG_DRAFT);
              setCatalogForm(catalogForm?.mode === 'add' ? null : { mode: 'add' });
            }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#0B2453] hover:bg-[#143B7F] text-white font-extrabold text-xs cursor-pointer self-start"
          >
            <Plus className="w-4 h-4 text-[#F4CE6A]" />
            <span>Tambah Shift</span>
          </button>
        </div>

        {catalogForm?.mode === 'add' && (
          <form
            onSubmit={submitCatalogShift}
            className="rounded-2xl border border-dashed border-[#C69214]/70 bg-amber-50/50 p-3 space-y-2"
          >
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#B6810C]">
              Shift baru
            </div>
            {catalogFields}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="h-9 px-4 rounded-xl bg-[#0B2453] hover:bg-[#143B7F] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4 text-[#F4CE6A]" />
                <span>Simpan Shift</span>
              </button>
              <button
                type="button"
                onClick={() => setCatalogForm(null)}
                className="h-9 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white cursor-pointer"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-3">Shift</th>
                <th className="py-2.5 pr-3">Jam Kerja</th>
                <th className="py-2.5 pr-3">Toleransi Telat</th>
                <th className="py-2.5 pr-3">Toleransi Pulang</th>
                <th className="py-2.5 pr-3">Dipakai</th>
                <th className="py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shiftCatalog.map((tpl) => {
                const usedByEmployees = employees.filter(
                  (emp) => emp.shiftCode === tpl.code
                ).length;
                const usedByDivisions = divisionShiftRules.filter((rule) =>
                  rule.allowedShiftCodes.includes(tpl.code)
                ).length;
                const editing = catalogForm?.mode === 'edit' && catalogForm.code === tpl.code;
                return (
                  <React.Fragment key={tpl.code}>
                    <tr className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#0B2453]">{tpl.name}</span>
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${
                              tpl.custom
                                ? 'text-amber-700 bg-amber-50 border-amber-200'
                                : 'text-slate-500 bg-slate-50 border-slate-200'
                            }`}
                          >
                            {tpl.custom ? 'Buatan HRD' : 'Bawaan'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                        {tpl.startTime}–{tpl.endTime}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{tpl.toleranceMinutes} menit</td>
                      <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">
                        Awal {tpl.earlyOutMinutes} mnt &bull; Telat {tpl.lateOutMinutes} mnt
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {usedByDivisions} divisi • {usedByEmployees} karyawan
                      </td>
                      <td className="py-2.5 text-right">
                        {editing ? (
                          <span className="text-[11px] text-slate-400">Mengubah…</span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {tpl.custom && (
                              <button
                                type="button"
                                aria-label={`Ubah shift ${tpl.name}`}
                                title="Ubah nama, jam, atau toleransi shift"
                                onClick={() => {
                                  setCatalogDraft({
                                    name: tpl.name,
                                    startTime: tpl.startTime,
                                    endTime: tpl.endTime,
                                    toleranceMinutes: tpl.toleranceMinutes,
                                    earlyOutMinutes: tpl.earlyOutMinutes,
                                    lateOutMinutes: tpl.lateOutMinutes,
                                  });
                                  setCatalogForm({ mode: 'edit', code: tpl.code });
                                }}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Hapus shift ${tpl.name}`}
                              title={
                                tpl.custom
                                  ? 'Hapus shift dari katalog'
                                  : 'Hapus shift bawaan dari katalog (bisa dipulihkan)'
                              }
                              onClick={() => removeCatalogShift(tpl.code, tpl.name)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {editing && (
                      <tr>
                        <td colSpan={6} className="pb-3">
                          <form
                            onSubmit={submitCatalogShift}
                            className="rounded-xl border border-dashed border-[#C69214]/70 bg-amber-50/40 p-3 space-y-2"
                          >
                            {catalogFields}
                            <div className="flex items-center gap-2">
                              <button
                                type="submit"
                                className="h-9 px-3.5 rounded-lg bg-[#0B2453] hover:bg-[#143B7F] text-white text-[11px] font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5 text-[#F4CE6A]" />
                                <span>Simpan Perubahan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setCatalogForm(null)}
                                className="h-9 px-3.5 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-white cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {hiddenShiftCodes.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-2">
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
              Shift bawaan yang dihapus ({hiddenShiftCodes.length})
            </div>
            <p className="text-[11px] text-slate-500">
              Shift ini tidak lagi ditawarkan ke divisi/karyawan baru. Absensi &amp; jadwal lama
              yang memakainya tetap terbaca.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hiddenShiftCodes.map((code) => {
                const tpl = SHIFT_TEMPLATES[code];
                if (!tpl) return null;
                return (
                  <div
                    key={code}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white pl-2.5 pr-1.5 py-1"
                  >
                    <span className="text-[11px] font-bold text-slate-700">
                      {tpl.name}{' '}
                      <span className="font-mono font-normal text-slate-500">
                        {tpl.startTime}–{tpl.endTime}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Pulihkan shift ${tpl.name}`}
                      title="Pulihkan shift ke katalog"
                      onClick={() => restoreCatalogShift(code, tpl.name)}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-extrabold cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Pulihkan
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

import React from 'react';

interface EmployeeAvatarProps {
  name: string;
  /** Data URL foto persegi; kosong/undefined menampilkan inisial nama. */
  photoUrl?: string;
  /** Kelas ukuran, mis. `w-10 h-10`. Bentuk selalu persegi. */
  className?: string;
  /** Ukuran teks inisial, mis. `text-xs`. */
  textClassName?: string;
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? '')
      .join('')
      .toUpperCase() || 'SB'
  );
}

/**
 * Foto profil karyawan berbentuk persegi (crop 1:1). Bila belum ada foto,
 * tampil inisial nama dengan warna identitas perusahaan.
 */
export function EmployeeAvatar({
  name,
  photoUrl,
  className = 'w-10 h-10',
  textClassName = 'text-xs',
}: EmployeeAvatarProps) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`Foto profil ${name}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`${className} shrink-0 rounded-md border border-slate-200 bg-slate-100 object-cover`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${className} shrink-0 rounded-md bg-[#0B2453] text-[#F3CA62] font-extrabold flex items-center justify-center ${textClassName}`}
    >
      {initialsOf(name)}
    </div>
  );
}
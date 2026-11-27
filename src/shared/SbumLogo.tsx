export function SbumFullLogo({
  className = '',
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <svg
        viewBox="0 0 320 116"
        className="w-[240px] sm:w-[270px] h-auto"
        role="img"
        aria-label="SBUM PT Sinar Bunga Mas — One Stop Business Services"
      >
        <defs>
          <linearGradient id="sbumGoldText" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F5D36C" />
            <stop offset="45%" stopColor="#C89312" />
            <stop offset="75%" stopColor="#9A6C07" />
            <stop offset="100%" stopColor="#E6B93D" />
          </linearGradient>
          <linearGradient id="sbumGoldArc" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B6800C" />
            <stop offset="50%" stopColor="#F7DA78" />
            <stop offset="100%" stopColor="#C18B0E" />
          </linearGradient>
        </defs>

        {/* Orbital Gold Swoosh Top-Right */}
        <path
          d="M 105 20 C 165 2, 268 4, 274 28 C 278 44, 252 60, 224 72 C 254 56, 266 40, 260 28 C 252 12, 174 12, 105 20 Z"
          fill="url(#sbumGoldArc)"
        />
        {/* Orbital Gold Swoosh Bottom-Left */}
        <path
          d="M 74 62 C 42 78, 36 96, 56 106 C 72 114, 106 112, 134 106 C 98 110, 68 106, 62 96 C 56 86, 66 72, 86 60 Z"
          fill="url(#sbumGoldArc)"
        />

        {/* Metallic Bold SBUM Wordmark */}
        <text
          x="160"
          y="63"
          textAnchor="middle"
          fontFamily="Plus Jakarta Sans, sans-serif"
          fontWeight="900"
          fontSize="50"
          letterSpacing="3"
          fill="url(#sbumGoldText)"
          stroke="#7C5404"
          strokeWidth="0.7"
        >
          SBUM
        </text>
        {/* Subtle Horizontal Speed Cut Line through SBUM */}
        <line x1="68" y1="45" x2="252" y2="45" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.55" />

        {/* PT SINAR BUNGA MAS */}
        <text
          x="160"
          y="85"
          textAnchor="middle"
          fontFamily="Plus Jakarta Sans, sans-serif"
          fontWeight="800"
          fontSize="16.5"
          letterSpacing="1.1"
          fill={onDark ? '#FFFFFF' : '#0B2453'}
        >
          PT SINAR BUNGA MAS
        </text>

        {/* Gold flanking lines + Tagline */}
        <line x1="48" y1="97" x2="66" y2="97" stroke="#C89312" strokeWidth="1.5" />
        <text
          x="160"
          y="100"
          textAnchor="middle"
          fontFamily="Plus Jakarta Sans, sans-serif"
          fontWeight="700"
          fontSize="7.8"
          letterSpacing="1.35"
          fill={onDark ? '#F3CA62' : '#334155'}
        >
          ONE STOP BUSINESS SERVICES
        </text>
        <line x1="254" y1="97" x2="272" y2="97" stroke="#C89312" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function SbumBadgeIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <div
      className={`${className} rounded-xl bg-gradient-to-br from-[#F3D16A] via-[#C89312] to-[#986B07] p-[1.5px] shadow-sm shrink-0`}
    >
      <div className="w-full h-full rounded-[10.5px] bg-gradient-to-b from-[#E5B83E] via-[#C69214] to-[#A6760B] flex items-center justify-center">
        <span className="font-extrabold text-[11px] tracking-tight text-[#0B2453] leading-none">
          SBUM
        </span>
      </div>
    </div>
  );
}

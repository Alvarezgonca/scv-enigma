/* Ícones desenhados para o app (traço simples, cor herdada do texto). */

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const Icon = {
  Machine: () => (
    <svg {...base}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <rect x="7" y="7" width="2.5" height="3" rx="0.6" />
      <rect x="10.75" y="7" width="2.5" height="3" rx="0.6" />
      <rect x="14.5" y="7" width="2.5" height="3" rx="0.6" />
      <circle cx="7.5" cy="14" r="1" />
      <circle cx="12" cy="14" r="1" />
      <circle cx="16.5" cy="14" r="1" />
      <circle cx="9.75" cy="17" r="1" />
      <circle cx="14.25" cy="17" r="1" />
    </svg>
  ),
  Send: () => (
    <svg {...base}>
      <path d="M12 21V11" />
      <path d="M8.5 7.5a5 5 0 0 1 7 0" />
      <path d="M5.5 4.5a9 9 0 0 1 13 0" />
      <circle cx="12" cy="10" r="1.6" />
      <path d="M9 21h6" />
    </svg>
  ),
  Receive: () => (
    <svg {...base}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
      <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
      <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <rect x="8" y="8" width="3" height="3" />
      <rect x="13" y="8" width="3" height="3" />
      <rect x="8" y="13" width="3" height="3" />
      <path d="M13 13h3v3" />
    </svg>
  ),
  Sheet: () => (
    <svg {...base}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 11h7M9 14h7M9 17h4" />
    </svg>
  ),
  Compare: () => (
    <svg {...base}>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 7a4 4 0 0 0 6 0z" />
      <path d="M19 7l-3 7a4 4 0 0 0 6 0z" />
      <path d="M8 21h8" />
    </svg>
  ),
  Bombe: () => (
    <svg {...base}>
      <circle cx="7" cy="8" r="3" />
      <circle cx="17" cy="8" r="3" />
      <circle cx="7" cy="16" r="3" />
      <circle cx="17" cy="16" r="3" />
      <circle cx="12" cy="12" r="1.2" />
    </svg>
  ),
  Book: () => (
    <svg {...base}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </svg>
  ),
  Sound: ({ on }: { on: boolean }) => (
    <svg {...base}>
      <path d="M4 9h3l5-4v14l-5-4H4z" />
      {on ? (
        <>
          <path d="M16 9a4 4 0 0 1 0 6" />
          <path d="M18.5 6.5a8 8 0 0 1 0 11" />
        </>
      ) : (
        <path d="M17 9l5 6M22 9l-5 6" />
      )}
    </svg>
  ),
  Lock: () => (
    <svg {...base}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  Alert: () => (
    <svg {...base}>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4" />
      <path d="M12 17.5v.5" />
    </svg>
  ),
  Check: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  ),
  X: () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  ),
  Logo: () => (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="lg-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a4d2b" />
          <stop offset="1" stopColor="#3b2313" />
        </linearGradient>
        <radialGradient id="lg-lamp" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="0.5" stopColor="#ffd76a" />
          <stop offset="1" stopColor="#d9962e" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="11" fill="url(#lg-wood)" />
      <rect x="7" y="7" width="34" height="34" rx="7" fill="#19191b" />
      <rect x="12" y="11" width="6" height="9" rx="1.5" fill="#efe6d2" />
      <rect x="21" y="11" width="6" height="9" rx="1.5" fill="#efe6d2" />
      <rect x="30" y="11" width="6" height="9" rx="1.5" fill="#efe6d2" />
      <circle cx="17" cy="30" r="4.2" fill="#2c2822" />
      <circle cx="31" cy="30" r="4.2" fill="#2c2822" />
      <circle cx="24" cy="30" r="4.6" fill="url(#lg-lamp)" />
    </svg>
  ),
};

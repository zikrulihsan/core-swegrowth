/** Ikon kecil yang dipakai berulang. Semua stroke-based, ikut currentColor. */
const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const ArrowRight = () => (
  <svg {...stroke} strokeWidth={2.2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const ArrowUpRight = () => (
  <svg {...stroke} strokeWidth={2.2}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);

export const Check = () => (
  <svg {...stroke} strokeWidth={2.6}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </svg>
);

export const Lock = () => (
  <svg {...stroke} strokeWidth={2}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </svg>
);

export const Play = () => (
  <svg {...stroke} strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="m10 8.5 5.5 3.5-5.5 3.5z" />
  </svg>
);

export const CalendarIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const ClockIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const PinIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);

export const RepeatIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 0 1 4-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 0 1-4 4H4" />
  </svg>
);

export const UsersIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.6.8 2.7 2.6 3 5.2" />
  </svg>
);

export const ChatIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="M4 18.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H8z" />
    <path d="M8.5 9h7M8.5 12.2h4.5" />
  </svg>
);

export const VideoIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <rect x="3" y="6" width="12.5" height="12" rx="2.5" />
    <path d="m15.5 10.5 5-3v9l-5-3" />
  </svg>
);

export const BookIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 0 20 18z" />
  </svg>
);

export const MicIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
  </svg>
);

export const BriefcaseIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <rect x="3.5" y="7" width="17" height="12.5" rx="2.5" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" />
  </svg>
);

export const StarIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </svg>
);

export const EyeOffIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.4M6.2 6.2A17 17 0 0 0 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 5.8-2" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </svg>
);

export const ThumbUpIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <path d="M7 10v11H4V10zM7 10l4-7a2.5 2.5 0 0 1 2.6 3L13 10h5.5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.1 21H7" />
  </svg>
);

export const UserIcon = () => (
  <svg {...stroke} strokeWidth={2}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

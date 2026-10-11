// Line icons used across the shell (drawer, dock, toolbars), 20×20, drawn in currentColor.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const Svg = ({ size = 20, children, ...p }: P) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...p}
  >
    {children}
  </svg>
);

export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" />
  </Svg>
);
export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M7.5 2.5h5l-1 5 3 3H5.5l3-3-1-5ZM10 10.5V17" />
  </Svg>
);
export const IconKpi = (p: P) => (
  <Svg {...p}>
    <path d="M3 16.5h14M5.5 13.5v-3M9 13.5V7M12.5 13.5V9.5M16 13.5V4.5" />
  </Svg>
);
export const IconDev = (p: P) => (
  <Svg {...p}>
    <path d="m6.5 6-4 4 4 4M13.5 6l4 4-4 4M11.5 3.5l-3 13" />
  </Svg>
);
export const IconQa = (p: P) => (
  <Svg {...p}>
    <path d="M10 2.5 3.5 5v4.5c0 4 2.8 6.6 6.5 8 3.7-1.4 6.5-4 6.5-8V5L10 2.5Z" />
    <path d="m7 10 2.2 2.2L13.5 8" />
  </Svg>
);
export const IconSupport = (p: P) => (
  <Svg {...p}>
    <path d="M4 11V9.5a6 6 0 0 1 12 0V11" />
    <rect x="2.5" y="10.5" width="3.5" height="5" rx="1.2" />
    <rect x="14" y="10.5" width="3.5" height="5" rx="1.2" />
    <path d="M16 15.5c0 1.4-1.6 2-4 2" />
  </Svg>
);
export const IconTree = (p: P) => (
  <Svg {...p}>
    <rect x="7.5" y="2.5" width="5" height="4" rx="1" />
    <rect x="2.5" y="13.5" width="5" height="4" rx="1" />
    <rect x="12.5" y="13.5" width="5" height="4" rx="1" />
    <path d="M10 6.5v3.5M5 13.5V10h10v3.5" />
  </Svg>
);
export const IconInsights = (p: P) => (
  <Svg {...p}>
    <path d="M10 2.5a5 5 0 0 0-3 9v2h6v-2a5 5 0 0 0-3-9Z" />
    <path d="M7.5 16h5M8.5 18h3" />
  </Svg>
);
export const IconPeople = (p: P) => (
  <Svg {...p}>
    <circle cx="7.5" cy="7" r="3" />
    <path d="M2.5 16.5c.6-2.8 2.6-4.5 5-4.5s4.4 1.7 5 4.5" />
    <circle cx="14" cy="7.5" r="2.3" />
    <path d="M13.5 12c2 0 3.5 1.4 4 3.5" />
  </Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M10 2.5 3.5 5v4.5c0 4 2.8 6.6 6.5 8 3.7-1.4 6.5-4 6.5-8V5L10 2.5Z" />
    <rect x="7.5" y="9" width="5" height="4" rx="0.8" />
    <path d="M8.5 9V7.8a1.5 1.5 0 0 1 3 0V9" />
  </Svg>
);
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    <circle cx="7" cy="5.5" r="1.8" fill="var(--surface)" />
    <circle cx="13" cy="10" r="1.8" fill="var(--surface)" />
    <circle cx="9" cy="14.5" r="1.8" fill="var(--surface)" />
  </Svg>
);
export const IconCompass = (p: P) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="m12.8 7.2-1.6 4-4 1.6 1.6-4 4-1.6Z" />
  </Svg>
);
export const IconSpeaker = ({ on, ...p }: P & { on?: boolean }) => (
  <Svg {...p}>
    <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3v-5Z" />
    {on ? (
      <path d="M13.5 7a4.2 4.2 0 0 1 0 6M15.5 5a7 7 0 0 1 0 10" />
    ) : (
      <path d="m13.5 8 4 4m0-4-4 4" />
    )}
  </Svg>
);
export const IconReset = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 10a6.5 6.5 0 1 0 2-4.7" />
    <path d="M3.5 3.5v3.2h3.2" />
  </Svg>
);
export const IconExcel = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <path d="M3 8h14M3 12.5h14M8.5 8v9" />
  </Svg>
);
export const IconPdf = (p: P) => (
  <Svg {...p}>
    <path d="M5 2.5h6.5L15.5 6.5v11H5Z" />
    <path d="M11.5 2.5v4h4M7.5 11h5M7.5 14h3" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="m8 5 5 5-5 5" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13 13 4 4" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Svg>
);
export const IconDownload = (p: P) => (
  <Svg {...p}>
    <path d="M10 3v10m0 0 3.5-3.5M10 13 6.5 9.5M3.5 15v2h13v-2" />
  </Svg>
);
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M10 5.5c-1.8-1.5-4.2-2-6.5-1.7v11.5c2.3-.3 4.7.2 6.5 1.7 1.8-1.5 4.2-2 6.5-1.7V3.8c-2.3-.3-4.7.2-6.5 1.7Z" />
    <path d="M10 5.5V17" />
  </Svg>
);

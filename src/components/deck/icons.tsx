import type { SVGProps } from "react";

/** Icons drawn in the WhaleDesk design (24px grid, 2px stroke). */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(size: number, props: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function WhaleMark({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)} stroke="#05060b">
      <path d="M2.5 12.5c0 3.6 3.4 6 8.2 6 4.5 0 7.6-2.4 8.6-6.2.3-1.2 1.3-2 2.4-2.3-.6-.9-1.6-1.3-2.6-1.1.2-1-.2-2-1-2.6-.4 1.1-.3 2.3.3 3.3-1.4 2.5-4 3.6-7.2 3.4-3.2-.2-5.6-1.3-8.7-.5z" />
      <circle cx="7" cy="14.6" r=".6" fill="#05060b" />
      <path d="M8 7.5c0-1.4.8-2.6 2-3M8 7.5c-.3-1.3-1.3-2.2-2.5-2.5M8 7.5v2.4" />
    </svg>
  );
}

export function RadarIcon({ size = 17, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
      <path d="M12 12l6-6" />
    </svg>
  );
}

export function ExposureIcon({ size = 17, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 3v18h18" />
      <path d="M7 15h3v3H7zM12 10h3v8h-3zM17 6h3v12h-3z" />
    </svg>
  );
}

export function BellIcon({ size = 17, ...p }: IconProps) {
  return (
    <svg {...base(size, p)} strokeLinejoin={undefined}>
      <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 003.4 0" />
    </svg>
  );
}

export function AccountsIcon({ size = 17, ...p }: IconProps) {
  return (
    <svg {...base(size, p)} strokeLinejoin={undefined}>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.85" />
    </svg>
  );
}

export function GearIcon({ size = 17, ...p }: IconProps) {
  return (
    <svg {...base(size, p)} strokeLinejoin={undefined}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export function SearchIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)} strokeLinejoin={undefined}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function RefreshIcon({ size = 14, ...p }: IconProps) {
  return (
    <svg {...base(size, p)} strokeWidth={2.4} strokeLinejoin={undefined}>
      <path d="M21 12a9 9 0 11-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

export function MenuIcon({ size = 20, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function KeyIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3L20 3M17 6l3 3M15 8l2 2" />
    </svg>
  );
}

export function LockIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

export function AlertIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function ClockIcon({ size = 16, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ExternalIcon({ size = 12, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  );
}

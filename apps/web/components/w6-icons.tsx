/**
 * WAVE_6 — minimal icon set used by Sidebar nav.
 *
 * Inline SVGs, 16px default, currentColor stroke. Adding to this set is
 * cheap; we don't pull lucide / heroicons because we only need a
 * handful and shipping the full lib bloats the landing bundle.
 */

import { type NavIconName } from "../lib/w6-surface";

const COMMON = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function W6Icon({
  name,
  size = 16,
}: {
  name: NavIconName;
  size?: number;
}) {
  const props = { ...COMMON, width: size, height: size };
  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M2.5 7L8 2.5L13.5 7V13a.5.5 0 0 1-.5.5H10v-4H6v4H3a.5.5 0 0 1-.5-.5V7z" />
        </svg>
      );
    case "send":
      return (
        <svg {...props}>
          <path d="M14 2L2 7l5 2 2 5L14 2z" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...props}>
          <path d="M4 2h8v12l-2-1.2L8 14l-2-1.2L4 14V2z" />
          <path d="M6 5h4M6 7.5h4M6 10h2.5" />
        </svg>
      );
    case "layers":
      return (
        <svg {...props}>
          <path d="M8 2L2 5l6 3l6-3l-6-3z" />
          <path d="M2 8l6 3l6-3M2 11l6 3l6-3" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <circle cx="6" cy="6" r="2.5" />
          <path d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" />
          <circle cx="11" cy="6.5" r="2" />
          <path d="M10.5 13c0-1.7 1.3-3 3-3" />
        </svg>
      );
    case "piggy":
      return (
        <svg {...props}>
          <path d="M3 9c0-2.2 2-4 4.5-4S12 6.8 12 9v3H3V9z" />
          <path d="M5 12v1.5M10 12v1.5M2.5 9.5h1M9.5 7.5h1.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="2" y="3" width="12" height="11" rx="1.5" />
          <path d="M2 6h12M5 2v3M11 2v3" />
        </svg>
      );
    case "eye":
      return (
        <svg {...props}>
          <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M4 11V7a4 4 0 1 1 8 0v4l1 1.5H3L4 11z" />
          <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.5v2M8 12.5v2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M1.5 8h2M12.5 8h2M3.5 12.5L5 11M11 5l1.5-1.5" />
        </svg>
      );
    case "bot":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="10" height="8" rx="2" />
          <path d="M8 2v3M5.5 8.5h.01M10.5 8.5h.01M6 11h4" />
        </svg>
      );
    case "spark":
      return (
        <svg {...props}>
          <path d="M9 1L3 9h4l-1 6l6-8H8l1-6z" />
        </svg>
      );
    case "activity":
      return (
        <svg {...props}>
          <path d="M2 8h3l2-5l3 10l2-5h2" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M8 2L3 4v4c0 3.3 2.2 5.5 5 6c2.8-.5 5-2.7 5-6V4L8 2z" />
        </svg>
      );
    case "hash":
      return (
        <svg {...props}>
          <path d="M5 2L3 14M11 2L9 14M2 5h12M2 11h12" />
        </svg>
      );
    case "grid":
      return (
        <svg {...props}>
          <rect x="2" y="2" width="5" height="5" rx="1" />
          <rect x="9" y="2" width="5" height="5" rx="1" />
          <rect x="2" y="9" width="5" height="5" rx="1" />
          <rect x="9" y="9" width="5" height="5" rx="1" />
        </svg>
      );
    case "globe":
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="6" />
          <path d="M2 8h12M8 2c2 2.5 2 9 0 12M8 2c-2 2.5-2 9 0 12" />
        </svg>
      );
    case "code":
      return (
        <svg {...props}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M5 7l2 1.5L5 10M8.5 10.5h3" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...props}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M4 6l2 2l-2 2M8 10h4" />
        </svg>
      );
    default: {
      const _exhaustive: never = name;
      return null;
    }
  }
}

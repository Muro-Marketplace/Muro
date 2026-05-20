// Premium+ artist-profile theming.
//
// A fixed catalogue of presets keeps accessibility in our hands: every
// theme bakes in a tested foreground-on-background contrast ratio, so
// artists can't accidentally pick "white on white" and tank readability.
//
// Two surfaces consume this catalogue:
//   - The artist portal exposes a theme picker for Premium+ tiers
//     (and a locked preview for Core, gated behind an upgrade CTA).
//   - The public artist profile reads the saved theme id and applies
//     the colour tokens to its outermost wrapper.

export type ProfileThemeId =
  | "light"
  | "warm"
  | "cool"
  | "dark"
  | "midnight"
  | "bold";

export interface ProfileTheme {
  id: ProfileThemeId;
  label: string;
  description: string;
  /** Page background. */
  bg: string;
  /** Section / card background, sits a step above bg. */
  surface: string;
  /** Body text colour. */
  fg: string;
  /** Secondary text (captions, meta). */
  muted: string;
  /** Hairline borders + dividers. */
  border: string;
  /** Accent / button colour. Defaults to the Wallplace accent if the
   *  theme doesn't want its own. */
  accent: string;
  /** Text colour to use ON the accent (buttons etc.). */
  accentFg: string;
  /** True if this theme reads as dark, the UI uses this to flip
   *  hover-only details to be visible at rest. */
  isDark: boolean;
}

export const DEFAULT_PROFILE_THEME: ProfileThemeId = "light";

export const PROFILE_THEMES: ProfileTheme[] = [
  {
    id: "light",
    label: "Light",
    description: "The default Wallplace cream. Calm, gallery-neutral.",
    bg: "#FAF8F5",
    surface: "#FFFFFF",
    fg: "#1A1A1A",
    muted: "#6B6760",
    border: "#E5E2DD",
    accent: "#C17C5A",
    accentFg: "#FFFFFF",
    isDark: false,
  },
  {
    id: "warm",
    label: "Warm",
    description: "Terracotta-tinted background. Suits earth-tone work.",
    bg: "#F4E9DF",
    surface: "#FFFFFF",
    fg: "#2A1F18",
    muted: "#7A6557",
    border: "#E0CFB8",
    accent: "#A0522D",
    accentFg: "#FFFFFF",
    isDark: false,
  },
  {
    id: "cool",
    label: "Cool",
    description: "Pale slate. Pairs with monochrome / blue palettes.",
    bg: "#EEF1F3",
    surface: "#FFFFFF",
    fg: "#1A2230",
    muted: "#5A6878",
    border: "#D6DCE2",
    accent: "#3E5C76",
    accentFg: "#FFFFFF",
    isDark: false,
  },
  {
    id: "dark",
    label: "Dark",
    description: "Charcoal background. Lifts colour-heavy work.",
    bg: "#1F1F1F",
    surface: "#2A2A2A",
    fg: "#F2F0EC",
    muted: "#B5B0A8",
    border: "#3A3A3A",
    accent: "#E0A468",
    accentFg: "#1F1F1F",
    isDark: true,
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Inky deep-blue. High-contrast for photography.",
    bg: "#0F1722",
    surface: "#19232F",
    fg: "#EAEFF5",
    muted: "#9AA8B8",
    border: "#2A3645",
    accent: "#6FA8DC",
    accentFg: "#0F1722",
    isDark: true,
  },
  {
    id: "bold",
    label: "Bold",
    description: "Black on accent. Sharp and modern.",
    bg: "#000000",
    surface: "#111111",
    fg: "#FFFFFF",
    muted: "#A0A0A0",
    border: "#262626",
    accent: "#FF6B35",
    accentFg: "#FFFFFF",
    isDark: true,
  },
];

const BY_ID = new Map(PROFILE_THEMES.map((t) => [t.id, t]));

export function getProfileTheme(id: string | null | undefined): ProfileTheme {
  if (!id) return BY_ID.get(DEFAULT_PROFILE_THEME)!;
  return BY_ID.get(id as ProfileThemeId) ?? BY_ID.get(DEFAULT_PROFILE_THEME)!;
}

/**
 * Render a theme as inline CSS custom properties so a single wrapper
 * div can re-skin a whole subtree of components without each component
 * having to know about themes. Components read tokens via
 * `style={{ color: "var(--theme-fg)" }}` or via the CSS classes in
 * profile-themes.css.
 */
export function themeCssVars(theme: ProfileTheme): Record<string, string> {
  return {
    "--theme-bg": theme.bg,
    "--theme-surface": theme.surface,
    "--theme-fg": theme.fg,
    "--theme-muted": theme.muted,
    "--theme-border": theme.border,
    "--theme-accent": theme.accent,
    "--theme-accent-fg": theme.accentFg,
  };
}

// ─────────────────────────────────────────────────────────────────────
// QR label theming, same gate but a much shorter catalogue. Labels
// print physically so we cap the palette to combinations that survive
// black-and-white photocopy and stay legible on a wall at 1m.

export type LabelThemeId = "classic" | "warm" | "dark" | "accent";

export interface LabelTheme {
  id: LabelThemeId;
  label: string;
  bg: string;
  fg: string;
  /** Secondary text colour for "By [Artist]" subtitle etc. */
  subtle: string;
  /** Border around the printed card. */
  border: string;
  /** Whether the QR code dots flip white-on-dark. */
  qrDark: boolean;
}

export const DEFAULT_LABEL_THEME: LabelThemeId = "classic";

export const LABEL_THEMES: LabelTheme[] = [
  {
    id: "classic",
    label: "Classic (white)",
    bg: "#FFFFFF",
    fg: "#1A1A1A",
    subtle: "#6B6760",
    border: "#E5E2DD",
    qrDark: false,
  },
  {
    id: "warm",
    label: "Warm cream",
    bg: "#F4E9DF",
    fg: "#2A1F18",
    subtle: "#7A6557",
    border: "#E0CFB8",
    qrDark: false,
  },
  {
    id: "dark",
    label: "Dark",
    bg: "#1F1F1F",
    fg: "#F2F0EC",
    subtle: "#B5B0A8",
    border: "#3A3A3A",
    qrDark: true,
  },
  {
    id: "accent",
    label: "Accent",
    bg: "#FFFFFF",
    fg: "#C17C5A",
    subtle: "#8A5C42",
    border: "#E5C9B5",
    qrDark: false,
  },
];

const LABEL_BY_ID = new Map(LABEL_THEMES.map((t) => [t.id, t]));

export function getLabelTheme(id: string | null | undefined): LabelTheme {
  if (!id) return LABEL_BY_ID.get(DEFAULT_LABEL_THEME)!;
  return LABEL_BY_ID.get(id as LabelThemeId) ?? LABEL_BY_ID.get(DEFAULT_LABEL_THEME)!;
}

// ─────────────────────────────────────────────────────────────────────
// Tier gating.
//
// Both theming surfaces are Premium+ features. Core artists see the
// picker but the apply path is no-op for them, the public profile and
// printed labels render the default. That way the value is visible to
// Core users without breaking their existing experience.

export function canCustomiseTheme(subscriptionPlan: string | null | undefined): boolean {
  if (!subscriptionPlan) return false;
  const plan = subscriptionPlan.toLowerCase();
  return plan === "premium" || plan === "pro";
}

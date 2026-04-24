// Central design tokens. Hex literals only — email clients (especially Outlook)
// don't resolve CSS vars, and inline styles are the only reliably portable route.

import type { EmailPersona } from "@/emails/types/emailTypes";

export const theme = {
  // Brand — Wallplace warm
  accent:        "#C17C5A",
  accentHover:   "#A9683E",

  // Neutrals
  background:    "#FAF7F2",
  surface:       "#FFFFFF",
  surfaceMuted:  "#F5F1EA",
  border:        "#E8E3DB",
  borderStrong:  "#CFC8BC",
  foreground:    "#1A1814",
  muted:         "#6B6760",
  mutedStrong:   "#4A4740",

  // Semantic
  success:       "#3F7A5B",
  warning:       "#B87519",
  danger:        "#B23A3A",
  info:          "#3B5A7A",

  // Type
  serifStack:    "'Cormorant Garamond', 'Playfair Display', Georgia, serif",
  sansStack:     "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif",
} as const;

/**
 * Persona accent — same shell, subtle voice shift. Artists get the warm orange;
 * venues get a professional charcoal; customers get an editorial neutral.
 */
export function accentFor(persona: EmailPersona): string {
  switch (persona) {
    case "artist":   return theme.accent;        // warm orange
    case "venue":    return "#2F3A4A";           // muted charcoal
    case "customer": return "#1A1814";           // near-black editorial
    case "system":   return theme.mutedStrong;   // grey-ish for internal
    default:         return theme.accent;        // multi -> brand
  }
}

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export const companyDetails = {
  name: "Wallplace Ltd",
  address: "London, United Kingdom",
  supportEmail: "hello@wallplace.co.uk",
} as const;

import { Button as REButton } from "@react-email/components";
import type { ReactNode } from "react";
import type { EmailPersona } from "@/emails/types/emailTypes";
import { accentFor, theme } from "./theme";

interface Props {
  href: string;
  /** Usually a string; we accept ReactNode to allow interpolations like "Confirm {email}". */
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  persona?: EmailPersona;
  /** Full-width CTA — useful on mobile-first layouts. */
  block?: boolean;
}

export function Button({ href, children, variant = "primary", persona = "multi", block = false }: Props) {
  const bg = variant === "primary" ? accentFor(persona) : "transparent";
  const fg = variant === "primary" ? "#FFFFFF" : theme.foreground;
  const border = variant === "secondary" ? `1px solid ${theme.borderStrong}` : "none";
  const textDec = variant === "ghost" ? "underline" : "none";

  return (
    <REButton
      href={href}
      style={{
        backgroundColor: bg,
        color: fg,
        border,
        borderRadius: 2,
        padding: variant === "ghost" ? "0" : "12px 22px",
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "0.02em",
        textDecoration: textDec as "none" | "underline",
        display: block ? "block" : "inline-block",
        width: block ? "100%" : "auto",
        boxSizing: "border-box" as const,
        textAlign: "center" as const,
      }}
    >
      {children}
    </REButton>
  );
}

/** Secondary styled as `variant="secondary"` — named component for readability. */
export function SecondaryButton(props: Omit<Props, "variant">) {
  return <Button {...props} variant="secondary" />;
}

/** Inline text link, theme-coloured. */
export function TextLink({ href, children, persona = "multi" }: { href: string; children: ReactNode; persona?: EmailPersona }) {
  return (
    <a
      href={href}
      style={{
        color: accentFor(persona),
        textDecoration: "underline",
        fontWeight: 500,
      }}
    >
      {children}
    </a>
  );
}

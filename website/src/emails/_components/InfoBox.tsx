import type { ReactNode } from "react";
import { Section } from "@react-email/components";
import { theme } from "./theme";

type Tone = "neutral" | "info" | "warning" | "danger";

const TONE: Record<Tone, { bg: string; border: string; fg: string }> = {
  neutral: { bg: theme.surfaceMuted, border: theme.border,       fg: theme.mutedStrong },
  info:    { bg: "#EEF3F9",          border: "#D1DCE9",          fg: theme.info },
  warning: { bg: "#FBF2E1",          border: "#E8D2A2",          fg: theme.warning },
  danger:  { bg: "#FBEBEB",          border: "#ECC7C7",          fg: theme.danger },
};

export function InfoBox({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const c = TONE[tone];
  return (
    <Section
      style={{
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 3,
        padding: "14px 16px",
        margin: "16px 0",
        color: c.fg,
        fontSize: 13.5,
        lineHeight: "1.55",
      }}
    >
      {children}
    </Section>
  );
}

export function WarningBox({ children }: { children: ReactNode }) {
  return <InfoBox tone="warning">{children}</InfoBox>;
}

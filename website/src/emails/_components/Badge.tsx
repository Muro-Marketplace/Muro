import type { ReactNode } from "react";
import { theme } from "./theme";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: theme.surfaceMuted, fg: theme.mutedStrong, border: theme.border },
  success: { bg: "#EAF3ED",           fg: theme.success,    border: "#CFE3D7" },
  warning: { bg: "#FAF1E1",           fg: theme.warning,    border: "#ECDAB7" },
  danger:  { bg: "#F9E8E8",           fg: theme.danger,     border: "#EBC8C8" },
  info:    { bg: "#E7EEF5",           fg: theme.info,       border: "#C9D6E4" },
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const c = TONE[tone];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
        padding: "3px 8px",
        borderRadius: 2,
        backgroundColor: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {children}
    </span>
  );
}

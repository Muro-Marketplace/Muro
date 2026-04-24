import { Text, Link } from "@react-email/components";
import type { ChecklistStep } from "@/emails/types/emailTypes";
import { theme } from "./theme";

export function Checklist({ steps }: { steps: ChecklistStep[] }) {
  return (
    <div style={{ margin: "8px 0 16px" }}>
      {steps.map((step, i) => {
        const icon = step.done ? "✓" : "○";
        const colour = step.done ? theme.success : theme.border;
        const labelColour = step.done ? theme.muted : theme.foreground;
        const decoration = step.done ? "line-through" : "none";
        return (
          <Text
            key={i}
            style={{
              fontSize: 14,
              lineHeight: "1.7",
              color: labelColour,
              margin: 0,
              padding: "4px 0",
              textDecoration: decoration as "line-through" | "none",
            }}
          >
            <span style={{
              display: "inline-block",
              width: 16,
              color: colour,
              fontWeight: 700,
              textAlign: "center" as const,
              marginRight: 8,
            }}>
              {icon}
            </span>
            {step.url && !step.done ? (
              <Link href={step.url} style={{ color: theme.foreground, textDecoration: "none" }}>
                {step.label}
              </Link>
            ) : (
              step.label
            )}
          </Text>
        );
      })}
    </div>
  );
}

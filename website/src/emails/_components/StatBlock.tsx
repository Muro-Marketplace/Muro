import { Row, Column, Text } from "@react-email/components";
import type { Stat } from "@/emails/types/emailTypes";
import { theme } from "./theme";

/**
 * Grid of stat tiles — up to 4 per row. Rendered as a table for Outlook
 * compatibility. Delta, when present, shows as a small trailing label.
 */
export function StatBlock({ stats }: { stats: Stat[] }) {
  // Pair them into rows of up to 2 so mobile doesn't cram four into a line.
  const rows: Stat[][] = [];
  for (let i = 0; i < stats.length; i += 2) rows.push(stats.slice(i, i + 2));

  return (
    <>
      {rows.map((row, i) => (
        <Row key={i} style={{ marginBottom: 12 }}>
          {row.map((s, j) => (
            <Column
              key={j}
              style={{
                backgroundColor: theme.surfaceMuted,
                border: `1px solid ${theme.border}`,
                borderRadius: 3,
                padding: "14px 16px",
                width: "48%",
                paddingRight: j === 0 && row.length === 2 ? 16 : undefined,
              }}
            >
              <Text style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>
                {s.label}
              </Text>
              <Text style={{ fontFamily: theme.serifStack, fontSize: 26, color: theme.foreground, margin: 0, lineHeight: 1 }}>
                {s.value}
                {typeof s.deltaPct === "number" && (
                  <span
                    style={{
                      fontSize: 12,
                      marginLeft: 8,
                      color: s.deltaPct >= 0 ? theme.success : theme.danger,
                      fontFamily: theme.sansStack,
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {s.deltaPct >= 0 ? "+" : ""}
                    {s.deltaPct}%
                  </span>
                )}
              </Text>
            </Column>
          ))}
          {row.length === 1 && <Column style={{ width: "48%" }} />}
        </Row>
      ))}
    </>
  );
}

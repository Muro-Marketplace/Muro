import { Text } from "@react-email/components";
import type { TimelineEvent } from "@/emails/types/emailTypes";
import { theme } from "./theme";

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div style={{ margin: "8px 0 16px" }}>
      {events.map((e, i) => {
        const colour =
          e.state === "done"    ? theme.success :
          e.state === "current" ? theme.accent  : theme.border;
        const labelColour =
          e.state === "upcoming" ? theme.muted : theme.foreground;
        return (
          <Text
            key={i}
            style={{
              fontSize: 14,
              lineHeight: "1.55",
              color: labelColour,
              margin: 0,
              padding: "6px 0",
            }}
          >
            <span style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: colour,
              marginRight: 10,
              verticalAlign: "middle",
            }} />
            <strong style={{ fontWeight: e.state === "current" ? 600 : 500 }}>{e.label}</strong>
            {e.date && <span style={{ color: theme.muted, marginLeft: 8, fontSize: 12 }}>{e.date}</span>}
            {e.description && (
              <span style={{ display: "block", color: theme.muted, fontSize: 12.5, marginLeft: 20, marginTop: 2 }}>
                {e.description}
              </span>
            )}
          </Text>
        );
      })}
    </div>
  );
}

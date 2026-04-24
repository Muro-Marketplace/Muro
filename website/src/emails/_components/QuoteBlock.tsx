import type { ReactNode } from "react";
import { Text } from "@react-email/components";
import { theme } from "./theme";

interface Props {
  children: ReactNode;
  attribution?: string;
}

export function QuoteBlock({ children, attribution }: Props) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${theme.accent}`,
        paddingLeft: 16,
        margin: "20px 0",
      }}
    >
      <Text
        style={{
          fontFamily: theme.serifStack,
          fontSize: 18,
          fontStyle: "italic" as const,
          lineHeight: "1.45",
          color: theme.foreground,
          margin: 0,
        }}
      >
        {children}
      </Text>
      {attribution && (
        <Text style={{ fontSize: 12, color: theme.muted, margin: "8px 0 0", letterSpacing: "0.02em" }}>
          — {attribution}
        </Text>
      )}
    </div>
  );
}

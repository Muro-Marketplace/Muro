import { Text, Heading } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { theme } from "./theme";

interface TextProps {
  children: ReactNode;
  /** Override the default style — merged, not replaced. */
  style?: CSSProperties;
}

export function H1({ children, style }: TextProps) {
  return (
    <Heading
      as="h1"
      style={{
        fontFamily: theme.serifStack,
        fontSize: 26,
        fontWeight: 500,
        lineHeight: "1.25",
        color: theme.foreground,
        margin: "0 0 16px",
        letterSpacing: "-0.01em",
        ...style,
      }}
    >
      {children}
    </Heading>
  );
}

export function H2({ children, style }: TextProps) {
  return (
    <Heading
      as="h2"
      style={{
        fontFamily: theme.serifStack,
        fontSize: 20,
        fontWeight: 500,
        lineHeight: "1.3",
        color: theme.foreground,
        margin: "24px 0 12px",
        ...style,
      }}
    >
      {children}
    </Heading>
  );
}

export function P({ children, style }: TextProps) {
  return (
    <Text
      style={{
        fontSize: 15,
        lineHeight: "1.6",
        color: theme.mutedStrong,
        margin: "0 0 16px",
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

export function Small({ children, style }: TextProps) {
  return (
    <Text
      style={{
        fontSize: 12,
        lineHeight: "1.5",
        color: theme.muted,
        margin: "16px 0 0",
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

import { Text, Link } from "@react-email/components";
import { theme } from "./theme";

export function SocialLinks() {
  return (
    <Text
      style={{
        fontSize: 11.5,
        color: theme.muted,
        textAlign: "center" as const,
        margin: "10px 0 0",
        letterSpacing: "0.02em",
      }}
    >
      <Link href="https://instagram.com/thewallplace" style={{ color: theme.muted, textDecoration: "underline" }}>
        Instagram
      </Link>
    </Text>
  );
}

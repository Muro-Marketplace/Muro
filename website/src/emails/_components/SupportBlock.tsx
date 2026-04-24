import { Text, Link } from "@react-email/components";
import { companyDetails, theme } from "./theme";

/**
 * A polite "need a hand?" block. Lives near the bottom of most tx emails
 * to reduce support tickets caused by confused users bouncing off the CTA.
 */
export function SupportBlock({ supportUrl }: { supportUrl?: string }) {
  const href = supportUrl || `mailto:${companyDetails.supportEmail}`;
  return (
    <Text style={{ fontSize: 12.5, color: theme.muted, margin: "20px 0 0", lineHeight: "1.55" }}>
      Need a hand?{" "}
      <Link href={href} style={{ color: theme.muted, textDecoration: "underline" }}>
        {supportUrl ? "Contact support" : companyDetails.supportEmail}
      </Link>
      .
    </Text>
  );
}

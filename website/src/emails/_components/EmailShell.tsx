import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Link,
  Text,
  Hr,
} from "@react-email/components";
import type { ReactNode } from "react";
import type { EmailCategory, EmailPersona, EmailStream } from "@/emails/types/emailTypes";
import { accentFor, companyDetails, siteUrl, theme } from "./theme";
import { SocialLinks } from "./SocialLinks";

interface EmailShellProps {
  /** Short preview text shown in inbox list (under the subject). Keep ≤90 chars. */
  preview: string;
  /** Drives subtle accent + shell variation. */
  persona?: EmailPersona;
  /** Drives footer logic — tx/critical omits the marketing unsubscribe. */
  stream: EmailStream;
  /** Category — used to build the category-scoped unsubscribe link on notify/news. */
  category?: EmailCategory;
  children: ReactNode;
}

export function EmailShell({
  preview,
  persona = "multi",
  stream,
  category,
  children,
}: EmailShellProps) {
  const accent = accentFor(persona);
  const isTx = stream === "tx";

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header — thin, editorial. Persona accent sits under the wordmark. */}
          <Section style={{ padding: "28px 32px 16px", textAlign: "center" }}>
            <Link href={siteUrl} style={{ textDecoration: "none" }}>
              <Text
                style={{
                  fontFamily: theme.serifStack,
                  fontSize: 22,
                  letterSpacing: "0.04em",
                  color: theme.foreground,
                  margin: 0,
                }}
              >
                Wallplace
              </Text>
            </Link>
            <div
              style={{
                width: 36,
                height: 2,
                backgroundColor: accent,
                margin: "10px auto 0",
              }}
            />
          </Section>

          <Hr style={{ borderColor: theme.border, margin: 0 }} />

          {/* Main content */}
          <Section style={{ padding: "28px 32px 32px" }}>{children}</Section>

          <Hr style={{ borderColor: theme.border, margin: 0 }} />

          {/* Footer — stream-aware. */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              {companyDetails.name} &middot; {companyDetails.address}
            </Text>

            {isTx ? (
              // Critical tx: support + legal only, no unsubscribe.
              <Text style={footerTextStyle}>
                <Link href={`mailto:${companyDetails.supportEmail}`} style={footerLinkStyle}>
                  {companyDetails.supportEmail}
                </Link>
                {" "}&middot;{" "}
                <Link href={`${siteUrl}/terms`} style={footerLinkStyle}>Terms</Link>
                {" "}&middot;{" "}
                <Link href={`${siteUrl}/privacy`} style={footerLinkStyle}>Privacy</Link>
              </Text>
            ) : (
              // notify/news: preference centre + category unsubscribe + legal.
              <Text style={footerTextStyle}>
                <Link href={`${siteUrl}/account/email`} style={footerLinkStyle}>
                  Email preferences
                </Link>
                {" "}&middot;{" "}
                <Link
                  href={`${siteUrl}/account/email/unsubscribe${category ? `?c=${category}` : ""}`}
                  style={footerLinkStyle}
                >
                  Unsubscribe
                </Link>
                {" "}&middot;{" "}
                <Link href={`${siteUrl}/terms`} style={footerLinkStyle}>Terms</Link>
                {" "}&middot;{" "}
                <Link href={`${siteUrl}/privacy`} style={footerLinkStyle}>Privacy</Link>
              </Text>
            )}

            <SocialLinks />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: theme.background,
  fontFamily: theme.sansStack,
  margin: 0,
  padding: "32px 12px",
  color: theme.foreground,
};

const containerStyle = {
  backgroundColor: theme.surface,
  borderRadius: 4,
  border: `1px solid ${theme.border}`,
  maxWidth: 600,
  margin: "0 auto",
  overflow: "hidden" as const,
};

const footerStyle = {
  padding: "20px 32px 28px",
  textAlign: "center" as const,
};

const footerTextStyle = {
  color: theme.muted,
  fontSize: 11,
  lineHeight: "18px",
  margin: "4px 0",
  letterSpacing: "0.02em",
};

const footerLinkStyle = {
  color: theme.muted,
  textDecoration: "underline",
};

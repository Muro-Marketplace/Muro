import { Row, Column, Text, Link } from "@react-email/components";
import type { Conversation } from "@/emails/types/emailTypes";
import { theme } from "./theme";

export function MessagePreview({ conversation }: { conversation: Conversation }) {
  return (
    <Row
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 3,
        padding: 0,
        margin: "8px 0",
      }}
    >
      <Column style={{ padding: "12px 16px" }}>
        <Text style={{ fontFamily: theme.serifStack, fontSize: 15, color: theme.foreground, margin: "0 0 4px" }}>
          <Link href={conversation.url} style={{ color: theme.foreground, textDecoration: "none" }}>
            {conversation.otherPartyName}
          </Link>
          {conversation.unreadCount > 0 && (
            <span style={{
              marginLeft: 8,
              fontSize: 11,
              color: "#FFFFFF",
              backgroundColor: theme.accent,
              padding: "2px 7px",
              borderRadius: 10,
              fontFamily: theme.sansStack,
              fontWeight: 600,
            }}>
              {conversation.unreadCount} new
            </span>
          )}
        </Text>
        <Text style={{ fontSize: 13, color: theme.mutedStrong, margin: 0, lineHeight: "1.55" }}>
          {conversation.latestMessage}
        </Text>
      </Column>
    </Row>
  );
}

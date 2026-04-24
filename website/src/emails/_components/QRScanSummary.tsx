import { Row, Column, Text } from "@react-email/components";
import { theme } from "./theme";

interface Props {
  workTitle: string;
  venueName: string;
  scanCount: number;
  since?: string;
}

export function QRScanSummary({ workTitle, venueName, scanCount, since }: Props) {
  return (
    <Row
      style={{
        backgroundColor: theme.surfaceMuted,
        border: `1px solid ${theme.border}`,
        borderRadius: 3,
        padding: 0,
        margin: "16px 0",
      }}
    >
      <Column style={{ padding: "16px 18px" }}>
        <Text style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>
          QR scans
        </Text>
        <Text style={{ fontFamily: theme.serifStack, fontSize: 32, color: theme.foreground, margin: 0, lineHeight: 1 }}>
          {scanCount.toLocaleString()}
        </Text>
        <Text style={{ fontSize: 13, color: theme.mutedStrong, margin: "8px 0 0" }}>
          {workTitle} at {venueName}
          {since ? ` · since ${since}` : ""}
        </Text>
      </Column>
    </Row>
  );
}

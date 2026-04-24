import { Row, Column, Text } from "@react-email/components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import { theme } from "./theme";

interface PayoutRow {
  label: string;
  amount: Money;
}

interface Props {
  lines: PayoutRow[];
  net: Money;
}

export function PayoutSummary({ lines, net }: Props) {
  return (
    <>
      {lines.map((r, i) => (
        <Row key={i} style={{ padding: "4px 0" }}>
          <Column><Text style={{ fontSize: 13, color: theme.mutedStrong, margin: 0 }}>{r.label}</Text></Column>
          <Column style={{ textAlign: "right" as const }}>
            <Text style={{ fontSize: 13, color: theme.mutedStrong, margin: 0 }}>{formatMoney(r.amount)}</Text>
          </Column>
        </Row>
      ))}
      <Row style={{ padding: "12px 0 0", borderTop: `1px solid ${theme.border}`, marginTop: 8 }}>
        <Column>
          <Text style={{ fontFamily: theme.serifStack, fontSize: 16, color: theme.foreground, margin: "8px 0 0" }}>
            Net payout
          </Text>
        </Column>
        <Column style={{ textAlign: "right" as const }}>
          <Text style={{ fontFamily: theme.serifStack, fontSize: 16, color: theme.foreground, margin: "8px 0 0" }}>
            {formatMoney(net)}
          </Text>
        </Column>
      </Row>
    </>
  );
}

import { Row, Column, Text, Img } from "@react-email/components";
import { formatMoney, type Money, type OrderItem } from "@/emails/types/emailTypes";
import { theme } from "./theme";

interface Props {
  items: OrderItem[];
  subtotal: Money;
  shipping: Money;
  tax?: Money;
  total: Money;
}

const cellTitle = {
  fontFamily: theme.serifStack,
  fontSize: 15,
  color: theme.foreground,
  margin: "0 0 2px",
} as const;

const cellMeta = {
  fontSize: 12,
  color: theme.muted,
  margin: 0,
} as const;

export function OrderSummary({ items, subtotal, shipping, tax, total }: Props) {
  return (
    <>
      {items.map((item, i) => (
        <Row
          key={i}
          style={{
            borderTop: i === 0 ? `1px solid ${theme.border}` : "none",
            borderBottom: `1px solid ${theme.border}`,
            padding: 0,
          }}
        >
          <Column style={{ width: 64, padding: "12px 0", verticalAlign: "top" }}>
            <Img src={item.image} alt={item.title} width={64} height={64} style={{ display: "block", width: 64, height: 64, objectFit: "cover" as const }} />
          </Column>
          <Column style={{ padding: "12px 12px", verticalAlign: "top" }}>
            <Text style={cellTitle}>{item.title}</Text>
            <Text style={cellMeta}>
              {item.artistName}
              {item.size ? ` · ${item.size}` : ""}
              {item.quantity > 1 ? ` · Qty ${item.quantity}` : ""}
            </Text>
          </Column>
          <Column style={{ padding: "12px 0", verticalAlign: "top", textAlign: "right" as const, width: 80 }}>
            <Text style={{ ...cellTitle, marginBottom: 0 }}>{formatMoney(item.lineTotal)}</Text>
          </Column>
        </Row>
      ))}

      <Row style={{ padding: "14px 0 2px" }}>
        <Column><Text style={cellMeta}>Subtotal</Text></Column>
        <Column style={{ textAlign: "right" as const }}><Text style={cellMeta}>{formatMoney(subtotal)}</Text></Column>
      </Row>
      <Row style={{ padding: "2px 0" }}>
        <Column><Text style={cellMeta}>Shipping</Text></Column>
        <Column style={{ textAlign: "right" as const }}><Text style={cellMeta}>{formatMoney(shipping)}</Text></Column>
      </Row>
      {tax && (
        <Row style={{ padding: "2px 0" }}>
          <Column><Text style={cellMeta}>VAT</Text></Column>
          <Column style={{ textAlign: "right" as const }}><Text style={cellMeta}>{formatMoney(tax)}</Text></Column>
        </Row>
      )}
      <Row style={{ padding: "12px 0 0", borderTop: `1px solid ${theme.border}` }}>
        <Column><Text style={{ ...cellTitle, marginTop: 12 }}>Total</Text></Column>
        <Column style={{ textAlign: "right" as const }}>
          <Text style={{ ...cellTitle, marginTop: 12 }}>{formatMoney(total)}</Text>
        </Column>
      </Row>
    </>
  );
}

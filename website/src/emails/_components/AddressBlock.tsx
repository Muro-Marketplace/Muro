import { Text } from "@react-email/components";
import type { Address } from "@/emails/types/emailTypes";
import { theme } from "./theme";

interface Props {
  address: Address;
  label?: string;
}

export function AddressBlock({ address, label }: Props) {
  return (
    <div style={{ margin: "8px 0" }}>
      {label && (
        <Text style={{ fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
          {label}
        </Text>
      )}
      <Text style={{ fontSize: 13, color: theme.mutedStrong, margin: 0, lineHeight: "1.5" }}>
        {address.name}<br />
        {address.line1}{address.line2 ? <><br />{address.line2}</> : null}<br />
        {address.city}{address.region ? `, ${address.region}` : ""}<br />
        {address.postcode}<br />
        {address.country}
      </Text>
    </div>
  );
}

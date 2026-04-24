// Stream: tx. Monthly revenue share statement for venues.

import { EmailShell, H1, P, Button } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenueRevenueShareStatementProps {
  firstName: string;
  venueName: string;
  statementPeriod: string;
  totalSales: Money;
  venueShare: Money;
  statementUrl: string;
}

export function VenueRevenueShareStatement({ firstName, venueName, statementPeriod, totalSales, venueShare, statementUrl }: VenueRevenueShareStatementProps) {
  return (
    <EmailShell stream="tx" persona="venue" preview={`Revenue share for ${venueName} — ${statementPeriod}`}>
      <H1>Revenue share statement</H1>
      <P>Hi {firstName} — here&rsquo;s {venueName}&rsquo;s revenue share for {statementPeriod}.</P>
      <table style={{ width: "100%", marginTop: 16, fontSize: 14, color: "#4A4740", borderCollapse: "collapse" as const }}>
        <tbody>
          <tr><td>Total sales</td><td style={{ textAlign: "right" as const }}>{formatMoney(totalSales)}</td></tr>
          <tr style={{ fontWeight: 600, borderTop: "1px solid #E8E3DB" }}>
            <td style={{ paddingTop: 8 }}>{venueName}&rsquo;s share</td>
            <td style={{ textAlign: "right" as const, paddingTop: 8 }}>{formatMoney(venueShare)}</td>
          </tr>
        </tbody>
      </table>
      <Button href={statementUrl} persona="venue">View statement</Button>
    </EmailShell>
  );
}

export const mock: VenueRevenueShareStatementProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  statementPeriod: "April 2026",
  totalSales: { amount: 84000, currency: "GBP" },
  venueShare: { amount: 8400, currency: "GBP" },
  statementUrl: "https://wallplace.co.uk/venue-portal/billing/statements/apr-2026",
};

const entry: TemplateEntry<VenueRevenueShareStatementProps> = {
  id: "venue_revenue_share_statement",
  name: "Revenue share statement",
  description: "Monthly statement of venue revenue share.",
  stream: "tx",
  persona: "venue",
  category: "orders_and_payouts",
  subject: "Revenue share for {{venueName}} — {{statementPeriod}}",
  previewText: "Your monthly statement.",
  component: VenueRevenueShareStatement,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;

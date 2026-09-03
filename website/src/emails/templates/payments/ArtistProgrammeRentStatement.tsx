// Stream: tx. The artist's rent statement for a Wallplace Programme.
//
// Rent accrues to every artist placed under a programme each time the venue's
// invoice is paid (src/lib/curation/programme-rent.ts, accrueProgrammeRent),
// and until this existed the artist heard nothing: the money was recorded as
// owed and paid out a quarter later with no statement in between. One of
// these per paid invoice per artist, listing each piece and its rent for the
// period, and saying when it is paid. Modelled on VenueRevenueShareStatement,
// the never-sent venue statement, with ArtistPayoutSent's tone.

import { EmailShell, H1, P, Button, SupportBlock } from "@/emails/_components";
import { formatMoney, type Money } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface ProgrammeRentLine {
  workTitle: string;
  amount: Money;
}

export interface ArtistProgrammeRentStatementProps {
  firstName: string;
  venueName: string;
  /** 1 for a monthly invoice, 3 for a quarterly one. */
  periodMonths: number;
  lines: ProgrammeRentLine[];
  total: Money;
  billingUrl: string;
  supportUrl?: string;
}

function periodLabel(months: number): string {
  return months === 1 ? "the next month" : `the next ${months} months`;
}

export function ArtistProgrammeRentStatement({
  firstName,
  venueName,
  periodMonths,
  lines,
  total,
  billingUrl,
  supportUrl,
}: ArtistProgrammeRentStatementProps) {
  return (
    <EmailShell stream="tx" persona="artist" preview={`${formatMoney(total)} of programme rent recorded`}>
      <H1>{formatMoney(total)} of programme rent recorded</H1>
      <P>
        Hi {firstName}, {venueName}&rsquo;s programme payment has come in, and your rent for the
        work you have on their walls has been recorded for {periodLabel(periodMonths)}.
      </P>
      <table style={{ width: "100%", marginTop: 16, fontSize: 14, color: "#4A4740", borderCollapse: "collapse" as const }}>
        <tbody>
          {lines.map((line, i) => (
            <tr key={i}>
              <td style={{ padding: "4px 0" }}>{line.workTitle}</td>
              <td style={{ textAlign: "right" as const, padding: "4px 0" }}>{formatMoney(line.amount)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 600, borderTop: "1px solid #E8E3DB" }}>
            <td style={{ paddingTop: 8 }}>Total</td>
            <td style={{ textAlign: "right" as const, paddingTop: 8 }}>{formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>
      <P>
        Programme rent is paid out once a quarter, after the quarter closes, to the Stripe account
        connected to your Wallplace account. You will get a note when the transfer is on its way.
      </P>
      <Button href={billingUrl} persona="artist">
        View billing
      </Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: ArtistProgrammeRentStatementProps = {
  firstName: "Maya",
  venueName: "Riverside Offices",
  periodMonths: 1,
  lines: [
    { workTitle: "Last Light on Mare Street", amount: { amount: 1000, currency: "GBP" } },
    { workTitle: "The Flower Seller", amount: { amount: 1000, currency: "GBP" } },
  ],
  total: { amount: 2000, currency: "GBP" },
  billingUrl: "https://wallplace.co.uk/artist-portal/billing",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<ArtistProgrammeRentStatementProps> = {
  id: "artist_programme_rent_statement",
  name: "Programme rent statement",
  description:
    "Sent to an artist each time a programme invoice is paid: the rent recorded for each piece on the venue's walls, and when it is paid out.",
  stream: "tx",
  persona: "artist",
  category: "orders_and_payouts",
  subject: "Programme rent recorded for you",
  previewText: "Your rent for this period has been recorded.",
  component: ArtistProgrammeRentStatement,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: false,
  priority: 1,
};
export default entry;

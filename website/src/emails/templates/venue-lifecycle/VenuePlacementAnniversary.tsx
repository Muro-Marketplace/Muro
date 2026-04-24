// Stream: notify. One-year marker of a placement — nice human touch.

import { EmailShell, H1, P, Button, StatBlock } from "@/emails/_components";
import type { Stat } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";

export interface VenuePlacementAnniversaryProps {
  firstName: string;
  venueName: string;
  artistName: string;
  placementStartDate: string;
  stats: Stat[];
  placementUrl: string;
}

export function VenuePlacementAnniversary({ firstName, venueName, artistName, placementStartDate, stats, placementUrl }: VenuePlacementAnniversaryProps) {
  return (
    <EmailShell stream="notify" persona="venue" category="digests" preview={`A year of ${artistName} at ${venueName}`}>
      <H1>A year of {artistName} at {venueName}</H1>
      <P>Hi {firstName} — it&rsquo;s been a year since {artistName}&rsquo;s work arrived ({placementStartDate}).</P>
      <StatBlock stats={stats} />
      <Button href={placementUrl} persona="venue">View placement</Button>
    </EmailShell>
  );
}

export const mock: VenuePlacementAnniversaryProps = {
  firstName: "Hannah",
  venueName: "The Curzon",
  artistName: "Maya Chen",
  placementStartDate: "1 April 2025",
  stats: [
    { label: "Total QR scans", value: 742 },
    { label: "Sales driven", value: "£3,240" },
  ],
  placementUrl: "https://wallplace.co.uk/placements/p_example",
};

const entry: TemplateEntry<VenuePlacementAnniversaryProps> = {
  id: "venue_placement_anniversary",
  name: "Placement anniversary",
  description: "One-year marker on long-running placements.",
  stream: "notify",
  persona: "venue",
  category: "digests",
  subject: "A year of {{artistName}} at {{venueName}}",
  previewText: "A small anniversary note.",
  component: VenuePlacementAnniversary,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;

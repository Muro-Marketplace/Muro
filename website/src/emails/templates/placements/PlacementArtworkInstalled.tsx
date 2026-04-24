// Stream: notify. Both parties + internal logistics flag.

import { EmailShell, H1, P, Button, SecondaryButton, WorkCard } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface PlacementArtworkInstalledProps {
  firstName: string;
  placementUrl: string;
  venueName: string;
  artistName: string;
  installedWorks: Work[];
  qrLabelsUrl: string;
}

export function PlacementArtworkInstalled({ firstName, placementUrl, venueName, artistName, installedWorks, qrLabelsUrl }: PlacementArtworkInstalledProps) {
  return (
    <EmailShell stream="notify" persona="multi" category="placements" preview={`${artistName}'s work is now at ${venueName}`}>
      <H1>It&rsquo;s on the wall</H1>
      <P>Hi {firstName} — {artistName}&rsquo;s work is now live at {venueName}.</P>
      {installedWorks.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={placementUrl}>View placement</Button>{" "}
        <SecondaryButton href={qrLabelsUrl}>Print QR labels</SecondaryButton>
      </div>
    </EmailShell>
  );
}

export const mock: PlacementArtworkInstalledProps = {
  firstName: "Hannah",
  placementUrl: "https://wallplace.co.uk/placements/p_example",
  venueName: "The Curzon",
  artistName: "Maya Chen",
  installedWorks: mockWorks,
  qrLabelsUrl: "https://wallplace.co.uk/artist-portal/labels?venue=the-curzon",
};

const entry: TemplateEntry<PlacementArtworkInstalledProps> = {
  id: "placement_artwork_installed",
  name: "Artwork installed",
  description: "Install complete — both parties notified.",
  stream: "notify",
  persona: "multi",
  category: "placements",
  subject: "{{artistName}}'s work is now at {{venueName}}",
  previewText: "Live on the wall.",
  component: PlacementArtworkInstalled,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;

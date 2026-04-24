// Stream: notify. New piece from an artist the customer follows.

import { EmailShell, H1, P, Button, WorkCard } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface CustomerNewWorkFromFollowedArtistProps {
  firstName: string;
  artistName: string;
  newWorks: Work[];
  artistUrl: string;
}

export function CustomerNewWorkFromFollowedArtist({ firstName, artistName, newWorks, artistUrl }: CustomerNewWorkFromFollowedArtistProps) {
  return (
    <EmailShell stream="notify" persona="customer" category="recommendations" preview={`New work from ${artistName}`}>
      <H1>New from {artistName}</H1>
      <P>Hi {firstName} — {artistName} just published new work.</P>
      {newWorks.slice(0, 3).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={artistUrl} persona="customer">Visit {artistName}</Button>
      </div>
    </EmailShell>
  );
}

export const mock: CustomerNewWorkFromFollowedArtistProps = {
  firstName: "Oliver",
  artistName: "Maya Chen",
  newWorks: mockWorks,
  artistUrl: "https://wallplace.co.uk/browse/maya-chen",
};

const entry: TemplateEntry<CustomerNewWorkFromFollowedArtistProps> = {
  id: "customer_new_work_from_followed_artist",
  name: "New work from followed artist",
  description: "Follow-driven new work notification.",
  stream: "notify",
  persona: "customer",
  category: "recommendations",
  subject: "New work from {{artistName}}",
  previewText: "Just published.",
  component: CustomerNewWorkFromFollowedArtist,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: true,
  priority: 2,
};
export default entry;

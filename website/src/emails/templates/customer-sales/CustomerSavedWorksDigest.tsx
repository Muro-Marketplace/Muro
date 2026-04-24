// Stream: notify (digests). Weekly digest of the customer's saved works.

import { EmailShell, H1, P, Button, WorkCard, Small } from "@/emails/_components";
import type { Work } from "@/emails/types/emailTypes";
import type { TemplateEntry } from "@/emails/registry-types";
import { mockWorks } from "@/emails/data/mockData";

export interface CustomerSavedWorksDigestProps {
  firstName: string;
  savedWorks: Work[];
  browseUrl: string;
}

export function CustomerSavedWorksDigest({ firstName, savedWorks, browseUrl }: CustomerSavedWorksDigestProps) {
  return (
    <EmailShell stream="notify" persona="customer" category="digests" preview="Your saved works — a quick look">
      <H1>Your saved works</H1>
      <P>Hi {firstName} — a gentle check-in on the pieces you&rsquo;ve favourited.</P>
      {savedWorks.slice(0, 4).map((w) => <WorkCard key={w.id} work={w} />)}
      <div style={{ marginTop: 20 }}>
        <Button href={browseUrl} persona="customer">Browse the gallery</Button>
      </div>
      <Small>Weekly — always skippable from your email preferences.</Small>
    </EmailShell>
  );
}

export const mock: CustomerSavedWorksDigestProps = {
  firstName: "Oliver",
  savedWorks: mockWorks,
  browseUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<CustomerSavedWorksDigestProps> = {
  id: "customer_saved_works_digest",
  name: "Saved works digest",
  description: "Weekly recap of saved works.",
  stream: "notify",
  persona: "customer",
  category: "digests",
  subject: "Your saved works — a quick look",
  previewText: "A gentle weekly check-in.",
  component: CustomerSavedWorksDigest,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;

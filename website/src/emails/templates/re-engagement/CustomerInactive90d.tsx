// Stream: news. 90-day customer — sunset-aware.

import { EmailShell, H1, P, Button, Small } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerInactive90dProps {
  firstName: string;
  preferenceUrl: string;
  browseUrl: string;
}

export function CustomerInactive90d({ firstName, preferenceUrl, browseUrl }: CustomerInactive90dProps) {
  return (
    <EmailShell stream="news" persona="customer" category="tips" preview="Still enjoy the gallery?">
      <H1>Still enjoy the gallery?</H1>
      <P>Hi {firstName} — we haven&rsquo;t seen you in a while. If Wallplace is still your kind of thing, we&rsquo;ll keep the dispatches coming.</P>
      <Button href={browseUrl} persona="customer">Visit the gallery</Button>
      <Small>
        Prefer quiet?{" "}
        <a href={preferenceUrl} style={{ color: "#6B6760", textDecoration: "underline" }}>Pause emails</a>.
      </Small>
    </EmailShell>
  );
}

export const mock: CustomerInactive90dProps = {
  firstName: "Oliver",
  preferenceUrl: "https://wallplace.co.uk/account/email",
  browseUrl: "https://wallplace.co.uk/browse",
};

const entry: TemplateEntry<CustomerInactive90dProps> = {
  id: "customer_inactive_90d",
  name: "Customer inactive 90d",
  description: "Pre-sunset gentle check.",
  stream: "news",
  persona: "customer",
  category: "tips",
  subject: "Still enjoy the gallery?",
  previewText: "A soft check-in.",
  component: CustomerInactive90d,
  mock,
  canUnsubscribe: true,
  hasInAppEquivalent: false,
  priority: 3,
};
export default entry;

// Stream: tx (operational). Outage / platform incident notice.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface OperationalPlatformIncidentProps {
  firstName: string;
  incidentSummary: string;
  affectedServices: string[];
  statusPageUrl: string;
  supportUrl?: string;
}

export function OperationalPlatformIncident({ firstName, incidentSummary, affectedServices, statusPageUrl, supportUrl }: OperationalPlatformIncidentProps) {
  return (
    <EmailShell stream="tx" persona="multi" preview="Wallplace service update">
      <H1>Service update</H1>
      <P>Hi {firstName} — we&rsquo;re letting you know about a current issue so you&rsquo;re not left guessing.</P>
      <InfoBox tone="warning">
        <strong>Summary:</strong> {incidentSummary}
        <br /><br />
        <strong>Affected:</strong>
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          {affectedServices.map((s) => <li key={s}>{s}</li>)}
        </ul>
      </InfoBox>
      <Button href={statusPageUrl}>View live status</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

export const mock: OperationalPlatformIncidentProps = {
  firstName: "Maya",
  incidentSummary: "Stripe payout webhooks are delayed by ~15 minutes. Sales are still processing normally; only payout confirmations are running behind.",
  affectedServices: ["Payout notifications", "Artist billing dashboard totals"],
  statusPageUrl: "https://status.wallplace.co.uk",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<OperationalPlatformIncidentProps> = {
  id: "operational_platform_incident",
  name: "Platform incident notice",
  description: "User-facing incident communication.",
  stream: "tx",
  persona: "multi",
  category: "legal",
  subject: "Wallplace service update",
  previewText: "A short note on a current issue.",
  component: OperationalPlatformIncident,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 3,
};
export default entry;
